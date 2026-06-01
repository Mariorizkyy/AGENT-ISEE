import { useState, useEffect } from 'react';
import { ethers, BrowserProvider, Contract } from 'ethers';

type WalletProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: WalletProvider;
    okxwallet?: WalletProvider;
  }
}

function getWalletProvider(): WalletProvider | null {
  if (typeof window !== 'undefined') {
    if (typeof window.okxwallet !== 'undefined') return window.okxwallet!;
    if (typeof window.ethereum  !== 'undefined') return window.ethereum!;
  }
  return null;
}

export function shortenAddress(addr: string): string {
  if (!addr) return '';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export const CONTRACT_ADDRESS = "0x294F053079d76b29529cf855eEC2729E6214BFa5";
export const OWNER_ADDRESS    = "0x419fa2f1991b06b0ab25bac2341765b38ca16178";
export const CHAIN_ID         = 1979;
export const CHAIN_ID_HEX     = "0x7BB";
export const MINT_PRICE       = "0.06";
export const RPC_URL          = "https://rpc.ritualfoundation.org";

// AsyncJobTracker — check sender lock before mint
const ASYNC_JOB_TRACKER = "0xC069FFCa0389f44eCA2C626e55491b0ab045AEF5";

export const ABI = [
  "function mint() payable",
  "function totalSupply() view returns (uint256)",
  "function mintOpen() view returns (bool)",
  "function executor() view returns (address)",
  "function tokenPrompt(uint256) view returns (string)",
  "function tokenImageURI(uint256) view returns (string)",
  "function tokenRevealed(uint256) view returns (bool)",
  "function setExecutorAndOpen(address _executor) external",
  "function withdraw() external",
  "function getBalance() view returns (uint256)",
  "function owner() view returns (address)",
];

// encode calldata tanpa simulation
function encodeCall(sig: string, args: unknown[] = []): string {
  const iface = new ethers.Interface(ABI);
  return iface.encodeFunctionData(sig.split('(')[0], args);
}

// read-only provider
function getReadProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(RPC_URL, { chainId: CHAIN_ID, name: "ritual" });
}

export function useBlockchain() {
  const [provider, setProvider]         = useState<BrowserProvider | null>(null);
  const [account, setAccount]           = useState<string | null>(null);
  const [isMintOpen, setIsMintOpen]     = useState<boolean>(false);
  const [totalSupply, setTotalSupply]   = useState<number>(0);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [chainId, setChainId]           = useState<number | null>(null);
  const [error, setError]               = useState<string | null>(null);
  const [blockNumber, setBlockNumber]   = useState<number>(0);

  const isOwner        = account?.toLowerCase() === OWNER_ADDRESS.toLowerCase();
  const isCorrectChain = chainId === CHAIN_ID;

  // ── Poll contract state ──────────────────────────────────────────────────────
  const refreshContractState = async () => {
    try {
      const p = getReadProvider();
      const c = new Contract(CONTRACT_ADDRESS, ABI, p);
      const [open, supply] = await Promise.all([
        c.mintOpen().catch(() => false),
        c.totalSupply().catch(() => 0n),
      ]);
      setIsMintOpen(Boolean(open));
      setTotalSupply(Number(supply));
    } catch { /* ignore */ }
  };

  // ── Poll block number ────────────────────────────────────────────────────────
  useEffect(() => {
    const fetch = async () => {
      try {
        const p = getReadProvider();
        setBlockNumber(await p.getBlockNumber());
      } catch { /* ignore */ }
    };
    fetch();
    const iv = setInterval(fetch, 5000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    refreshContractState();
    const iv = setInterval(refreshContractState, 15000);
    return () => clearInterval(iv);
  }, []);

  // ── Add Ritual Chain ─────────────────────────────────────────────────────────
  const addRitualChain = async () => {
    const wp = getWalletProvider();
    if (!wp) return;
    try {
      await wp.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: CHAIN_ID_HEX }],
      });
    } catch (switchErr: any) {
      if (switchErr.code === 4902 || switchErr.code === -32603) {
        await wp.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: CHAIN_ID_HEX,
            chainName: 'Ritual Chain',
            nativeCurrency: { name: 'RITUAL', symbol: 'RITUAL', decimals: 18 },
            rpcUrls: [RPC_URL],
            blockExplorerUrls: ['https://explorer.ritualfoundation.org'],
          }],
        });
      }
    }
  };

  // ── Connect wallet ───────────────────────────────────────────────────────────
  const connectWallet = async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const wp = getWalletProvider();
      if (!wp) throw new Error("Wallet tidak terdeteksi. Install MetaMask atau OKX Wallet.");

      await wp.request({ method: 'eth_requestAccounts' });
      const bp      = new BrowserProvider(wp as never);
      const network = await bp.getNetwork();

      if (Number(network.chainId) !== CHAIN_ID) {
        await addRitualChain();
        const networkAfter = await bp.getNetwork();
        if (Number(networkAfter.chainId) !== CHAIN_ID) {
          throw new Error("Gagal switch ke Ritual Chain. Coba manual di wallet.");
        }
      }

      const signer  = await bp.getSigner();
      const address = await signer.getAddress();
      const net2    = await bp.getNetwork();

      setProvider(bp);
      setAccount(address);
      setChainId(Number(net2.chainId));

      wp.on('accountsChanged', (accs: unknown) => {
        const a = accs as string[];
        setAccount(a.length > 0 ? a[0] : null);
      });
      wp.on('chainChanged', () => window.location.reload());

    } catch (e: any) {
      setError(e.shortMessage || e.message);
    } finally {
      setIsConnecting(false);
    }
  };

  // ── Disconnect ───────────────────────────────────────────────────────────────
  const disconnectWallet = () => {
    setAccount(null);
    setProvider(null);
    setChainId(null);
  };

  // ── Check sender lock ────────────────────────────────────────────────────────
  // Ritual rejects mint if wallet already has a pending async job
  const checkSenderLock = async (addr: string): Promise<boolean> => {
    try {
      const p = getReadProvider();
      const t = new Contract(ASYNC_JOB_TRACKER, [
        "function hasPendingJobForSender(address) view returns (bool)"
      ], p);
      return Boolean(await t.hasPendingJobForSender(addr));
    } catch { return false; }
  };

  // ── MINT ─────────────────────────────────────────────────────────────────────
  // Uses eth_sendTransaction with hardcoded gas — NO eth_estimateGas, NO eth_call
  // Required for Ritual async precompile calls (Pitfall #1 from ritual-dapp-frontend SKILL.md)
  const mint = async (): Promise<{ hash: string; wait: () => Promise<any> }> => {
    const wp = getWalletProvider();
    if (!wp)      throw new Error("Wallet tidak terdeteksi.");
    if (!account) throw new Error("Wallet belum terkoneksi.");
    if (!isMintOpen) throw new Error("Mint belum dibuka.");

    // Check chain
    const bp      = new BrowserProvider(wp as never);
    const network = await bp.getNetwork();
    if (Number(network.chainId) !== CHAIN_ID) {
      await addRitualChain();
      throw new Error("Chain switched ke Ritual — coba mint lagi.");
    }

    // Check sender lock — Ritual rejects if pending job exists
    const locked = await checkSenderLock(account);
    if (locked) {
      throw new Error("Wallet sedang ada pending job di Ritual. Tunggu selesai lalu coba lagi.");
    }

    // Encode mint() calldata
    const data  = encodeCall("mint()", []);
    // 0.06 RITUAL in hex
    const value = "0x" + ethers.parseEther(MINT_PRICE).toString(16);
    // 3,000,000 gas — safe for Ritual async precompile
    const gas   = "0x" + BigInt(3_000_000).toString(16);
    
    // Fetch dynamic gas price from Ritual RPC and add 50% margin
    // to bypass MetaMask simulation without being underpriced
    const rp = getReadProvider();
    const feeData = await rp.getFeeData();
    const currentGasPrice = feeData.gasPrice || ethers.parseUnits("1", "gwei");
    const safeGasPrice = (currentGasPrice * 15n) / 10n; // +50%
    const gasPriceHex = "0x" + safeGasPrice.toString(16);

    console.log("Sending mint via eth_sendTransaction");
    console.log("from:", account);
    console.log("to:", CONTRACT_ADDRESS);
    console.log("value:", value, "(0.06 RITUAL)");
    console.log("gas:", gas, "(3,000,000)");
    console.log("gasPrice:", gasPriceHex);
    console.log("data:", data);

    const txHash = await wp.request({
      method: 'eth_sendTransaction',
      params: [{
        from:  account,
        to:    CONTRACT_ADDRESS,
        data,
        value,
        gas,
        gasPrice: gasPriceHex,
      }],
    }) as string;

    console.log("TX submitted:", txHash);

    return {
      hash: txHash,
      wait: async () => {
        // Poll for receipt — provider.waitForTransaction sometimes fails on Ritual
        const rp = getReadProvider();
        for (let i = 0; i < 60; i++) {
          try {
            const receipt = await rp.getTransactionReceipt(txHash);
            if (receipt) return receipt;
          } catch { /* ignore */ }
          await new Promise(r => setTimeout(r, 3000));
        }
        throw new Error("TX tidak terkonfirmasi setelah 3 menit: " + txHash);
      },
    };
  };

  // ── setExecutorAndOpen ───────────────────────────────────────────────────────
  const setExecutorAndOpen = async (executorAddress: string): Promise<{ hash: string; wait: () => Promise<any> }> => {
    const wp = getWalletProvider();
    if (!wp || !account) throw new Error("Wallet belum terkoneksi.");

    const data    = encodeCall("setExecutorAndOpen(address)", [executorAddress]);
    const gas     = "0x" + BigInt(2_000_000).toString(16);
    const txHash  = await wp.request({
      method: 'eth_sendTransaction',
      params: [{ from: account, to: CONTRACT_ADDRESS, data, gas }],
    }) as string;

    return {
      hash: txHash,
      wait: async () => {
        const rp = getReadProvider();
        for (let i = 0; i < 30; i++) {
          const receipt = await rp.getTransactionReceipt(txHash).catch(() => null);
          if (receipt) return receipt;
          await new Promise(r => setTimeout(r, 3000));
        }
        throw new Error("TX timeout");
      },
    };
  };

  // ── withdrawRevenue ──────────────────────────────────────────────────────────
  const withdrawRevenue = async (): Promise<{ hash: string; wait: () => Promise<any> }> => {
    const wp = getWalletProvider();
    if (!wp || !account) throw new Error("Wallet belum terkoneksi.");

    const data   = encodeCall("withdraw()", []);
    const gas    = "0x" + BigInt(500_000).toString(16);
    const txHash = await wp.request({
      method: 'eth_sendTransaction',
      params: [{ from: account, to: CONTRACT_ADDRESS, data, gas }],
    }) as string;

    return {
      hash: txHash,
      wait: async () => {
        const rp = getReadProvider();
        for (let i = 0; i < 30; i++) {
          const receipt = await rp.getTransactionReceipt(txHash).catch(() => null);
          if (receipt) return receipt;
          await new Promise(r => setTimeout(r, 3000));
        }
        throw new Error("TX timeout");
      },
    };
  };

  // ── getContractBalance ───────────────────────────────────────────────────────
  const getContractBalance = async (): Promise<string> => {
    try {
      const p = getReadProvider();
      const c = new Contract(CONTRACT_ADDRESS, ABI, p);
      return ethers.formatEther(await c.getBalance());
    } catch { return "0"; }
  };

  // ── checkReveal ──────────────────────────────────────────────────────────────
  const checkReveal = async (tokenId: number): Promise<boolean> => {
    try {
      const p = getReadProvider();
      const c = new Contract(CONTRACT_ADDRESS, ABI, p);
      return Boolean(await c.tokenRevealed(tokenId));
    } catch { return false; }
  };

  return {
    provider, account, isMintOpen, totalSupply,
    isConnecting, chainId, error, isOwner,
    isCorrectChain, blockNumber,
    connectWallet, disconnectWallet, addRitualChain,
    mint, setExecutorAndOpen, withdrawRevenue,
    getContractBalance, checkReveal, refreshContractState,
  };
}
