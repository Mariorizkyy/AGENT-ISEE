import { useState, useEffect, useCallback } from 'react';
import { ethers, BrowserProvider, Contract } from 'ethers';

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}

export const CONTRACT_ADDRESS = "0xaC9443A8FE8D6CABBcA820A66FAE2810EC8e8688";
export const OWNER_ADDRESS    = "0x419fa2f1991b06b0ab25bac2341765b38ca16178";
export const CHAIN_ID         = 1979;
export const MINT_PRICE       = "0.06";
export const RPC_URL          = "https://rpc.ritualfoundation.org";

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
  const [provider, setProvider]           = useState<BrowserProvider | null>(null);
  const [signer, setSigner]               = useState<ethers.Signer | null>(null);
  const [account, setAccount]             = useState<string | null>(null);
  const [contract, setContract]           = useState<Contract | null>(null);
  const [blockNumber, setBlockNumber]     = useState<number>(0);
  const [totalSupply, setTotalSupply]     = useState<number>(0);
  const [isMintOpen, setIsMintOpen]       = useState<boolean>(false);
  const [isCorrectChain, setIsCorrectChain] = useState<boolean>(false);
  const [isConnecting, setIsConnecting]   = useState(false);

  const isOwner = account?.toLowerCase() === OWNER_ADDRESS.toLowerCase();

  // Poll supply + mint status
  useEffect(() => {
    const readProvider = new ethers.JsonRpcProvider(RPC_URL);
    const readContract = new Contract(CONTRACT_ADDRESS, ABI, readProvider);

    const fetchStats = async () => {
      try {
        const [supply, open] = await Promise.all([
          readContract.totalSupply().catch(() => 0n),
          readContract.mintOpen().catch(() => false),
        ]);
        setTotalSupply(Number(supply));
        setIsMintOpen(Boolean(open));
      } catch { /* ignore */ }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  // Poll block number
  useEffect(() => {
    const readProvider = new ethers.JsonRpcProvider(RPC_URL);
    const fetchBlock = async () => {
      try { setBlockNumber(await readProvider.getBlockNumber()); } catch { /* ignore */ }
    };
    fetchBlock();
    const interval = setInterval(fetchBlock, 1400);
    return () => clearInterval(interval);
  }, []);

  // Wire up MetaMask
  useEffect(() => {
    if (!window.ethereum) return;
    const browserProvider = new BrowserProvider(window.ethereum);
    setProvider(browserProvider);

    browserProvider.getNetwork().then(n => setIsCorrectChain(Number(n.chainId) === CHAIN_ID));

    const handleChainChanged    = (cId: string) => setIsCorrectChain(Number(cId) === CHAIN_ID);
    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length > 0) {
        setAccount(accounts[0]);
        browserProvider.getSigner().then(s => setSigner(s));
      } else {
        setAccount(null); setSigner(null);
      }
    };

    window.ethereum.on('chainChanged', handleChainChanged);
    window.ethereum.on('accountsChanged', handleAccountsChanged);

    browserProvider.listAccounts().then(accounts => {
      if (accounts.length > 0) {
        setAccount(accounts[0].address ?? accounts[0]);
        browserProvider.getSigner().then(s => setSigner(s));
      }
    });

    return () => {
      window.ethereum?.removeListener('chainChanged', handleChainChanged);
      window.ethereum?.removeListener('accountsChanged', handleAccountsChanged);
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

  const addRitualChain = async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{ chainId: "0x7BB", chainName: "Ritual", rpcUrls: [RPC_URL], nativeCurrency: { name: "RITUAL", symbol: "RITUAL", decimals: 18 } }],
      });
    } catch { /* ignore */ }
  };

  const mint = async (): Promise<ethers.TransactionResponse> => {
    if (!contract) throw new Error("Contract not connected");
    return contract.mint({ value: ethers.parseEther(MINT_PRICE) });
  };

  const checkReveal = async (tokenId: number): Promise<boolean> => {
    try {
      const rc = new Contract(CONTRACT_ADDRESS, ABI, new ethers.JsonRpcProvider(RPC_URL));
      return Boolean(await rc.tokenRevealed(tokenId));
    } catch { return false; }
  };

  // Owner-only actions
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
      const rc = new Contract(CONTRACT_ADDRESS, ABI, new ethers.JsonRpcProvider(RPC_URL));
      const bal = await rc.getBalance();
      return ethers.formatEther(bal);
    } catch { return "0"; }
  };

  return {
    provider, account, contract, blockNumber,
    totalSupply, isMintOpen, isCorrectChain,
    isOwner, isConnecting,
    connectWallet, addRitualChain,
    mint, checkReveal,
    setExecutorAndOpen, withdrawRevenue, getContractBalance,
  };
}
