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

// ── mint() function selector + encode manually ───────────────────────────────
// This bypasses wagmi/ethers simulation entirely — required for Ritual precompiles
// mint() selector = keccak256("mint()")[0:4] = 0x1249c58b
const MINT_SELECTOR = "0x1249c58b";

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

  // Poll supply + mint status
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const readProvider = await getWorkingProvider();
        const readContract = new Contract(CONTRACT_ADDRESS, ABI, readProvider);
        const [supply, open] = await Promise.all([
          readContract.totalSupply().catch(() => 0n),
          readContract.mintOpen().catch(() => false),
        ]);
        setTotalSupply(Number(supply));
        setIsMintOpen(Boolean(open));
      } catch { /* ignore */ }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
  }, []);

  // Poll block number
  useEffect(() => {
    const fetchBlock = async () => {
      try {
        const readProvider = await getWorkingProvider();
        setBlockNumber(await readProvider.getBlockNumber());
      } catch { /* ignore */ }
    };
    fetchBlock();
    const interval = setInterval(fetchBlock, 5000);
    return () => clearInterval(interval);
  }, []);

  // Wire up wallet events
  useEffect(() => {
    const walletProvider = getWalletProvider();
    if (!walletProvider) return;
    const browserProvider = new BrowserProvider(walletProvider as never);
    setProvider(browserProvider);
    browserProvider.getNetwork().then(n => setIsCorrectChain(Number(n.chainId) === CHAIN_ID));

    const handleChainChanged  = (cId: string)    => setIsCorrectChain(Number(cId) === CHAIN_ID);
    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length > 0) {
        setAccount(accounts[0]);
        browserProvider.getSigner().then(s => setSigner(s));
      } else { setAccount(null); setSigner(null); }
    };

    walletProvider.on('chainChanged', handleChainChanged);
    walletProvider.on('accountsChanged', handleAccountsChanged);
    browserProvider.listAccounts().then(accounts => {
      if (accounts.length > 0) { setAccount(accounts[0].address); setSigner(accounts[0]); }
    });
    return () => {
      walletProvider.removeListener('chainChanged', handleChainChanged);
      walletProvider.removeListener('accountsChanged', handleAccountsChanged);
    };
  }, []);

  useEffect(() => {
    setContract(signer && isCorrectChain ? new Contract(CONTRACT_ADDRESS, ABI, signer) : null);
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
    } catch { /* user rejected */ }
    finally { setIsConnecting(false); }
  };

  const disconnectWallet = () => {
    setAccount(null); setSigner(null); setContract(null); setIsCorrectChain(false);
  };

  const addRitualChain = async () => {
    const walletProvider = getWalletProvider();
    if (!walletProvider) return;
    try {
      await walletProvider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: "0x7BB",
          chainName: "Ritual",
          rpcUrls: [RPC_URL],
          nativeCurrency: { name: "RITUAL", symbol: "RITUAL", decimals: 18 },
        }],
      });
    } catch { /* user rejected */ }
  };

  // ── MINT — bypass simulation entirely (required for Ritual precompiles) ──────
  // Article ref: https://x.com/tutubearrr — Pitfall #1
  // wagmi/ethers simulateContract fails on async precompile calls.
  // Fix: encode calldata manually + sendTransaction with explicit gas.
  // No eth_call simulation. No gas estimation. Raw tx only.
  const mint = async (): Promise<ethers.TransactionResponse> => {
    const walletProvider = getWalletProvider();
    if (!walletProvider) throw new Error("No wallet found");

    // Chain guard
    const browserProvider = new BrowserProvider(walletProvider as never);
    const network = await browserProvider.getNetwork();
    if (Number(network.chainId) !== CHAIN_ID) {
      try {
        await walletProvider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x7BB' }],
        });
      } catch {
        await addRitualChain();
      }
      throw new Error("Switched to Ritual Chain — please try again.");
    }

    try {
      const s = await browserProvider.getSigner();
      const address = await s.getAddress();

      console.log("Minting from:", address);
      console.log("Contract:", CONTRACT_ADDRESS);
      console.log("Value: 0.06 RITUAL");

      // ── KEY FIX: send raw transaction, NO simulation ─────────────────────
      // encodeFunctionData manually — mint() has no args, just selector
      // This completely skips ethers/wagmi eth_call simulation
      const tx = await s.sendTransaction({
        to:       CONTRACT_ADDRESS,
        data:     MINT_SELECTOR,           // mint() = 0x1249c58b
        value:    ethers.parseEther("0.06"),
        gasLimit: BigInt(2_000_000),       // 2M gas — safe for precompile calls
        type:     0,                       // legacy tx — bypass EIP-1559 estimation
      });

      console.log("TX sent:", tx.hash);
      return tx;

    } catch (err: any) {
      console.log("Mint error:", JSON.stringify(err, Object.getOwnPropertyNames(err)));
      const reason =
        err.reason ??
        err.revert?.args?.[0] ??
        err.data?.message ??
        err.shortMessage ??
        err.message ??
        "Transaction failed";
      throw new Error(reason);
    }
  };

  const checkReveal = async (tokenId: number): Promise<boolean> => {
    try {
      const rc = new Contract(CONTRACT_ADDRESS, ABI, await getWorkingProvider());
      return Boolean(await rc.tokenRevealed(tokenId));
    } catch { return false; }
  };

  const setExecutorAndOpen = async (executorAddr: string): Promise<ethers.TransactionResponse> => {
    if (!contract) throw new Error("Contract not connected");
    return contract.setExecutorAndOpen(executorAddr, { gasLimit: 150_000 });
  };

  const withdrawRevenue = async (): Promise<ethers.TransactionResponse> => {
    if (!contract) throw new Error("Contract not connected");
    return contract.withdraw({ gasLimit: 100_000 });
  };

  const getContractBalance = async (): Promise<string> => {
    try {
      const rc = new Contract(CONTRACT_ADDRESS, ABI, await getWorkingProvider());
      const bal = await rc.getBalance();
      return ethers.formatEther(bal);
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
