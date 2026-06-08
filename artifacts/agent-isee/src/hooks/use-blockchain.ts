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

// Ritual infrastructure contracts
const ASYNC_JOB_TRACKER = "0xC069FFCa0389f44eCA2C626e55491b0ab045AEF5";
const RITUAL_WALLET     = "0x532F7b5b2EC7E3A8D42aDCB80AF2e5E4E6e03948";

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

const RITUAL_WALLET_ABI = [
  "function deposit(uint256 lockBlocks) external payable",
  "function balanceOf(address account) view returns (uint256)",
  "function lockedUntil(address account) view returns (uint256)",
];

function encodeCall(sig: string, args: unknown[] = []): string {
  const iface = new ethers.Interface(ABI);
  return iface.encodeFunctionData(sig.split('(')[0], args);
}

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

  useEffect(() => {
    const fetch = async () => {
      try { setBlockNumber(await getReadProvider().getBlockNumber()); }
      catch { /* ignore */ }
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

  const addRitualChain = async () => {
    const wp = getWalletProvider();
    if (!wp) return;
    try {
      await wp.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID_HEX }] });
    } catch (e: any) {
      if (e.code === 4902 || e.code === -32603) {
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

  const connectWallet = async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const wp = getWalletProvider();
      if (!wp) throw new Error("Wallet tidak terdeteksi.");
      await wp.request({ method: 'eth_requestAccounts' });
      const bp = new BrowserProvider(wp as never);
      const network = await bp.getNetwork();
      if (Number(network.chainId) !== CHAIN_ID) await addRitualChain();
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

  const disconnectWallet = () => {
    setAccount(null); setProvider(null); setChainId(null);
  };

  const checkSenderLock = async (addr: string): Promise<boolean> => {
    try {
      const t = new Contract(ASYNC_JOB_TRACKER, [
        "function hasPendingJobForSender(address) view returns (bool)"
      ], getReadProvider());
      return Boolean(await t.hasPendingJobForSender(addr));
    } catch { return false; }
  };

  // ── MINT — bypass simulation, required for Ritual async precompile ────────────
  const mint = async (): Promise<{ hash: string; wait: () => Promise<any> }> => {
    const wp = getWalletProvider();
    if (!wp)         throw new Error("Wallet tidak terdeteksi.");
    if (!account)    throw new Error("Wallet belum terkoneksi.");
    if (!isMintOpen) throw new Error("Mint belum dibuka.");

    const bp      = new BrowserProvider(wp as never);
    const network = await bp.getNetwork();
    if (Number(network.chainId) !== CHAIN_ID) {
      await addRitualChain();
      throw new Error("Chain switched — coba mint lagi.");
    }

    const locked = await checkSenderLock(account);
    if (locked) throw new Error("Wallet ada pending job. Tunggu selesai lalu coba lagi.");

    const data  = encodeCall("mint()", []);
    const value = "0x" + ethers.parseEther(MINT_PRICE).toString(16);
    const gas   = "0x" + BigInt(3_000_000).toString(16);

    const feeData     = await getReadProvider().getFeeData();
    const gasPrice    = feeData.gasPrice || ethers.parseUnits("1", "gwei");
    const safeGasPrice = "0x" + ((gasPrice * 15n) / 10n).toString(16);

    const txHash = await wp.request({
      method: 'eth_sendTransaction',
      params: [{ from: account, to: CONTRACT_ADDRESS, data, value, gas, gasPrice: safeGasPrice }],
    }) as string;

    console.log("Mint TX:", txHash);
    return {
      hash: txHash,
      wait: async () => {
        const rp = getReadProvider();
        for (let i = 0; i < 60; i++) {
          const r = await rp.getTransactionReceipt(txHash).catch(() => null);
          if (r) return r;
          await new Promise(r => setTimeout(r, 3000));
        }
        throw new Error("TX timeout: " + txHash);
      },
    };
  };

  // ── FUND RITUAL WALLET — deposit RITUAL to pay for LLM precompile ─────────────
  // This is REQUIRED before any mint can succeed on Ritual Chain.
  // The contract needs locked RITUAL in RitualWallet to pay the LLM executor.
  const fundRitualWallet = async (
    amountRitual: string,
    lockBlocks: number = 500
  ): Promise<{ hash: string; wait: () => Promise<any> }> => {
    const wp = getWalletProvider();
    if (!wp || !account) throw new Error("Wallet belum terkoneksi.");

    const iface = new ethers.Interface(RITUAL_WALLET_ABI);
    const data  = iface.encodeFunctionData("deposit", [lockBlocks]);
    const value = "0x" + ethers.parseEther(amountRitual).toString(16);
    const gas   = "0x" + BigInt(200_000).toString(16);

    console.log("Funding RitualWallet:", amountRitual, "RITUAL, lock:", lockBlocks, "blocks");

    const txHash = await wp.request({
      method: 'eth_sendTransaction',
      params: [{ from: account, to: RITUAL_WALLET, data, value, gas }],
    }) as string;

    console.log("Fund TX:", txHash);
    return {
      hash: txHash,
      wait: async () => {
        const rp = getReadProvider();
        for (let i = 0; i < 30; i++) {
          const r = await rp.getTransactionReceipt(txHash).catch(() => null);
          if (r) return r;
          await new Promise(r => setTimeout(r, 3000));
        }
        throw new Error("TX timeout");
      },
    };
  };

  // ── GET RITUAL WALLET BALANCE of the CONTRACT ─────────────────────────────────
  const getRitualWalletBalance = async (): Promise<string> => {
    try {
      const rw = new Contract(RITUAL_WALLET, RITUAL_WALLET_ABI, getReadProvider());
      const bal = await rw.balanceOf(CONTRACT_ADDRESS);
      return ethers.formatEther(bal);
    } catch { return "0"; }
  };

  const setExecutorAndOpen = async (executorAddress: string): Promise<{ hash: string; wait: () => Promise<any> }> => {
    const wp = getWalletProvider();
    if (!wp || !account) throw new Error("Wallet belum terkoneksi.");
    const data   = encodeCall("setExecutorAndOpen(address)", [executorAddress]);
    const gas    = "0x" + BigInt(2_000_000).toString(16);
    const txHash = await wp.request({
      method: 'eth_sendTransaction',
      params: [{ from: account, to: CONTRACT_ADDRESS, data, gas }],
    }) as string;
    return {
      hash: txHash,
      wait: async () => {
        const rp = getReadProvider();
        for (let i = 0; i < 30; i++) {
          const r = await rp.getTransactionReceipt(txHash).catch(() => null);
          if (r) return r;
          await new Promise(r => setTimeout(r, 3000));
        }
        throw new Error("TX timeout");
      },
    };
  };

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
          const r = await rp.getTransactionReceipt(txHash).catch(() => null);
          if (r) return r;
          await new Promise(r => setTimeout(r, 3000));
        }
        throw new Error("TX timeout");
      },
    };
  };

  const getContractBalance = async (): Promise<string> => {
    try {
      const c = new Contract(CONTRACT_ADDRESS, ABI, getReadProvider());
      return ethers.formatEther(await c.getBalance());
    } catch { return "0"; }
  };

  const checkReveal = async (tokenId: number): Promise<boolean> => {
    try {
      const c = new Contract(CONTRACT_ADDRESS, ABI, getReadProvider());
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
    fundRitualWallet, getRitualWalletBalance,
  };
}
