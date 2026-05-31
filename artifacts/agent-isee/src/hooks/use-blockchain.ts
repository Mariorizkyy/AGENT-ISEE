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

export const CONTRACT_ADDRESS = "0xaC9443A8FE8D6CABBcA820A66FAE2810EC8e8688";
export const OWNER_ADDRESS    = "0x419fa2f1991b06b0ab25bac2341765b38ca16178";
export const CHAIN_ID         = 1979;
export const MINT_PRICE       = "0.06";
export const RPC_URL          = "https://rpc.ritualfoundation.org";

// mint() selector = keccak256("mint()")[0:4]
const MINT_SELECTOR = "0x1249c58b";

// Gas values hardcoded — Ritual RPC does not support eth_estimateGas for precompile calls
const RITUAL_GAS_LIMIT = "0x1E8480";  // 2,000,000 in hex
const RITUAL_GAS_PRICE = "0x3B9ACA00"; // 1 gwei in hex

async function getWorkingProvider(): Promise<ethers.JsonRpcProvider> {
  const urls = [
    "https://rpc.ritualfoundation.org",
    "http://rpc.ritualfoundation.org",
  ];
  for (const url of urls) {
    try {
      const p = new ethers.JsonRpcProvider(url, { chainId: CHAIN_ID, name: "ritual" });
      await Promise.race([
        p.getBlockNumber(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000))
      ]);
      return p;
    } catch { continue; }
  }
  return new ethers.JsonRpcProvider(urls[0], { chainId: CHAIN_ID, name: "ritual" });
}

export const ABI = [
  "function mint() payable",
  "function totalSupply() view returns (uint256)",
  "function mintOpen() view returns (bool)",
  "function tokenPrompt(uint256) view returns (string)",
  "function tokenImageURI(uint256) view returns (string)",
  "function tokenRevealed(uint256) view returns (bool)",
  "function setExecutorAndOpen(address _executor) external",
  "function setExecutor(address _executor) external",
  "function openMint() external",
  "function pauseMint() external",
  "function withdraw() external",
  "function getBalance() view returns (uint256)",
  "function owner() view returns (address)",
  "event MintInitiated(uint256 indexed tokenId, address indexed minter, bytes32 llmJobId)",
  "event PromptGenerated(uint256 indexed tokenId, string prompt, bytes32 imgJobId)",
  "event ArtRevealed(uint256 indexed tokenId, string imageURI)",
];

export function useBlockchain() {
  const [provider, setProvider]             = useState<BrowserProvider | null>(null);
  const [signer, setSigner]                 = useState<ethers.Signer | null>(null);
  const [account, setAccount]               = useState<string | null>(null);
  const [contract, setContract]             = useState<Contract | null>(null);
  const [blockNumber, setBlockNumber]       = useState<number>(0);
  const [totalSupply, setTotalSupply]       = useState<number>(0);
  const [isMintOpen, setIsMintOpen]         = useState<boolean>(false);
  const [isCorrectChain, setIsCorrectChain] = useState<boolean>(false);
  const [isConnecting, setIsConnecting]     = useState(false);

  const isOwner = account?.toLowerCase() === OWNER_ADDRESS.toLowerCase();

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const rp = await getWorkingProvider();
        const rc = new Contract(CONTRACT_ADDRESS, ABI, rp);
        const [supply, open] = await Promise.all([
          rc.totalSupply().catch(() => 0n),
          rc.mintOpen().catch(() => false),
        ]);
        setTotalSupply(Number(supply));
        setIsMintOpen(Boolean(open));
      } catch { /* ignore */ }
    };
    fetchStats();
    const iv = setInterval(fetchStats, 15000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const fetchBlock = async () => {
      try {
        const rp = await getWorkingProvider();
        setBlockNumber(await rp.getBlockNumber());
      } catch { /* ignore */ }
    };
    fetchBlock();
    const iv = setInterval(fetchBlock, 5000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const walletProvider = getWalletProvider();
    if (!walletProvider) return;
    const bp = new BrowserProvider(walletProvider as never);
    setProvider(bp);
    bp.getNetwork().then(n => setIsCorrectChain(Number(n.chainId) === CHAIN_ID));

    const onChainChanged    = (cId: string)      => setIsCorrectChain(Number(cId) === CHAIN_ID);
    const onAccountsChanged = (accs: string[])   => {
      if (accs.length > 0) { setAccount(accs[0]); bp.getSigner().then(setSigner); }
      else { setAccount(null); setSigner(null); }
    };
    walletProvider.on('chainChanged',    onChainChanged);
    walletProvider.on('accountsChanged', onAccountsChanged);
    bp.listAccounts().then(accs => {
      if (accs.length > 0) { setAccount(accs[0].address); setSigner(accs[0]); }
    });
    return () => {
      walletProvider.removeListener('chainChanged',    onChainChanged);
      walletProvider.removeListener('accountsChanged', onAccountsChanged);
    };
  }, []);

  useEffect(() => {
    setContract(signer && isCorrectChain
      ? new Contract(CONTRACT_ADDRESS, ABI, signer) : null);
  }, [signer, isCorrectChain]);

  const connectWallet = async () => {
    if (!provider) return;
    setIsConnecting(true);
    try {
      await provider.send("eth_requestAccounts", []);
      const s = await provider.getSigner();
      setSigner(s);
      setAccount(await s.getAddress());
      setIsCorrectChain(Number((await provider.getNetwork()).chainId) === CHAIN_ID);
    } catch { /* rejected */ }
    finally { setIsConnecting(false); }
  };

  const disconnectWallet = () => {
    setAccount(null); setSigner(null); setContract(null); setIsCorrectChain(false);
  };

  const addRitualChain = async () => {
    const wp = getWalletProvider();
    if (!wp) return;
    try {
      await wp.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: "0x7BB",
          chainName: "Ritual",
          rpcUrls: [RPC_URL],
          nativeCurrency: { name: "RITUAL", symbol: "RITUAL", decimals: 18 },
        }],
      });
    } catch { /* rejected */ }
  };

  // ── MINT ─────────────────────────────────────────────────────────────────────
  // Uses eth_sendTransaction with HARDCODED gas values.
  // This bypasses eth_estimateGas and eth_call simulation entirely.
  // Required for Ritual async precompile calls — standard wagmi/ethers patterns fail.
  // Reference: https://x.com/tutubearrr — Pitfall #1
  const mint = async (): Promise<ethers.TransactionResponse> => {
    const wp = getWalletProvider();
    if (!wp) throw new Error("No wallet found. Install MetaMask or OKX Wallet.");

    const bp = new BrowserProvider(wp as never);

    // Ensure correct chain
    const network = await bp.getNetwork();
    if (Number(network.chainId) !== CHAIN_ID) {
      try {
        await wp.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x7BB' }],
        });
      } catch {
        await wp.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: "0x7BB",
            chainName: "Ritual",
            rpcUrls: [RPC_URL],
            nativeCurrency: { name: "RITUAL", symbol: "RITUAL", decimals: 18 },
          }],
        });
      }
      throw new Error("Switched to Ritual Chain — please try again.");
    }

    // Get accounts
    const accounts = await wp.request({ method: 'eth_accounts' }) as string[];
    if (!accounts || accounts.length === 0) {
      await wp.request({ method: 'eth_requestAccounts', params: [] });
      throw new Error("Please connect wallet and try again.");
    }

    const from  = accounts[0];
    // 0.06 RITUAL = 60000000000000000 wei
    const value = "0x" + BigInt("60000000000000000").toString(16); // 0xD529AE9E860000

    console.log("eth_sendTransaction — hardcoded gas, no estimation");
    console.log("from:", from);
    console.log("to:", CONTRACT_ADDRESS);
    console.log("value:", value, "= 0.06 RITUAL");
    console.log("gas:", RITUAL_GAS_LIMIT, "= 2,000,000");
    console.log("gasPrice:", RITUAL_GAS_PRICE, "= 1 gwei");

    // Send with ALL gas params hardcoded — wallet just signs, no estimation
    const txHash = await wp.request({
      method: 'eth_sendTransaction',
      params: [{
        from,
        to:       CONTRACT_ADDRESS,
        data:     MINT_SELECTOR,      // mint() = 0x1249c58b
        value,
        gas:      RITUAL_GAS_LIMIT,   // 0x1E8480 = 2,000,000
        gasPrice: RITUAL_GAS_PRICE,   // 0x3B9ACA00 = 1 gwei
      }],
    }) as string;

    console.log("TX submitted:", txHash);

    // Wait briefly then fetch tx
    await new Promise(r => setTimeout(r, 1000));
    const tx = await bp.getTransaction(txHash);
    if (!tx) {
      // Return minimal object if getTransaction fails
      return {
        hash: txHash,
        wait: async () => {
          const rp = await getWorkingProvider();
          let receipt = null;
          for (let i = 0; i < 60; i++) {
            receipt = await rp.getTransactionReceipt(txHash);
            if (receipt) return receipt;
            await new Promise(r => setTimeout(r, 2000));
          }
          throw new Error("TX not confirmed after 2 minutes");
        }
      } as unknown as ethers.TransactionResponse;
    }
    return tx;
  };

  const checkReveal = async (tokenId: number): Promise<boolean> => {
    try {
      const rc = new Contract(CONTRACT_ADDRESS, ABI, await getWorkingProvider());
      return Boolean(await rc.tokenRevealed(tokenId));
    } catch { return false; }
  };

  const setExecutorAndOpen = async (addr: string): Promise<ethers.TransactionResponse> => {
    if (!contract) throw new Error("Contract not connected");
    return contract.setExecutorAndOpen(addr, { gasLimit: 200_000 });
  };

  const withdrawRevenue = async (): Promise<ethers.TransactionResponse> => {
    if (!contract) throw new Error("Contract not connected");
    return contract.withdraw({ gasLimit: 100_000 });
  };

  const getContractBalance = async (): Promise<string> => {
    try {
      const rc = new Contract(CONTRACT_ADDRESS, ABI, await getWorkingProvider());
      return ethers.formatEther(await rc.getBalance());
    } catch { return "0"; }
  };

  return {
    provider, account, contract, blockNumber,
    totalSupply, isMintOpen, isCorrectChain,
    isOwner, isConnecting,
    connectWallet, disconnectWallet, addRitualChain,
    mint, checkReveal,
    setExecutorAndOpen, withdrawRevenue, getContractBalance,
  };
}
