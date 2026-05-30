import { useState, useEffect } from 'react';
import { ethers, BrowserProvider, Contract } from 'ethers';

// ── Wallet provider type shared between MetaMask and OKX ──────────────────────
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

/** OKX Wallet first, MetaMask fallback, null if neither present. */
function getWalletProvider(): WalletProvider | null {
  if (typeof window !== 'undefined') {
    if (typeof window.okxwallet !== 'undefined') return window.okxwallet!;
    if (typeof window.ethereum  !== 'undefined') return window.ethereum!;
  }
  return null;
}

/** Shorten an address to 0x1234…abcd format. */
export function shortenAddress(addr: string): string {
  if (!addr) return '';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
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

  // ── Poll supply + mint status (read-only, no wallet needed) ─────────────────
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

  // ── Poll block number ────────────────────────────────────────────────────────
  useEffect(() => {
    const readProvider = new ethers.JsonRpcProvider(RPC_URL);
    const fetchBlock = async () => {
      try { setBlockNumber(await readProvider.getBlockNumber()); } catch { /* ignore */ }
    };
    fetchBlock();
    const interval = setInterval(fetchBlock, 1400);
    return () => clearInterval(interval);
  }, []);

  // ── Wire up wallet events (MetaMask or OKX) ──────────────────────────────────
  useEffect(() => {
    const walletProvider = getWalletProvider();
    if (!walletProvider) return;

    const browserProvider = new BrowserProvider(walletProvider as never);
    setProvider(browserProvider);

    browserProvider.getNetwork().then(n => setIsCorrectChain(Number(n.chainId) === CHAIN_ID));

    const handleChainChanged = (cId: string) => setIsCorrectChain(Number(cId) === CHAIN_ID);
    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length > 0) {
        setAccount(accounts[0]);
        browserProvider.getSigner().then(s => setSigner(s));
      } else {
        setAccount(null);
        setSigner(null);
      }
    };

    walletProvider.on('chainChanged', handleChainChanged);
    walletProvider.on('accountsChanged', handleAccountsChanged);

    browserProvider.listAccounts().then(accounts => {
      if (accounts.length > 0) {
        // ethers v6: listAccounts() returns JsonRpcSigner[] — use directly as signer
        const s = accounts[0];
        setAccount(s.address);
        setSigner(s);           // set signer immediately, no second async call
      }
    });

    return () => {
      walletProvider.removeListener('chainChanged', handleChainChanged);
      walletProvider.removeListener('accountsChanged', handleAccountsChanged);
    };
  }, []);

  useEffect(() => {
    setContract(signer && isCorrectChain ? new Contract(CONTRACT_ADDRESS, ABI, signer) : null);
  }, [signer, isCorrectChain]);

  // ── Actions ──────────────────────────────────────────────────────────────────

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

  /** Clear local wallet state — does NOT call any wallet API. */
  const disconnectWallet = () => {
    setAccount(null);
    setSigner(null);
    setContract(null);
    setIsCorrectChain(false);
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

  const mint = async (): Promise<ethers.TransactionResponse> => {
    if (!provider) throw new Error("No provider");

    // If contract isn't wired yet (signer race), build it on the fly
    let activeContract = contract;
    if (!activeContract) {
      try {
        const s = await provider.getSigner();
        setSigner(s);
        activeContract = new Contract(CONTRACT_ADDRESS, ABI, s);
        setContract(activeContract);
      } catch {
        throw new Error("Wallet not ready — please disconnect and reconnect");
      }
    }

    // Chain guard — prompt switch if wrong network
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== CHAIN_ID) {
      const walletProvider = getWalletProvider();
      await walletProvider?.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x7BB' }],
      });
      throw new Error("Switched to Ritual Chain — please try minting again.");
    }

    try {
      // Verify RPC connection before sending
      const currentBlock = await provider.getBlockNumber();
      console.log("Current block:", currentBlock);

      // Fetch gasPrice from RPC; fall back to 1 gwei if unavailable.
      // Explicit nonce + type-0 tx completely bypasses ethers/MetaMask gas estimation.
      const feeData = await provider.getFeeData();
      if (!signer) throw new Error("Signer not available");
      const nonce   = await signer.getNonce();

      return await activeContract.mint({
        value:    ethers.parseEther("0.06"),
        gasLimit: BigInt(500000),
        gasPrice: feeData.gasPrice ?? ethers.parseUnits("1", "gwei"),
        type:     0,
        nonce,
      });
    } catch (err: any) {
      console.log("Full error:", JSON.stringify(err, Object.getOwnPropertyNames(err)));
      const reason =
        err.reason ??
        err.revert?.args?.[0] ??
        err.data?.message ??
        err.shortMessage ??
        err.message ??
        "unknown error";
      throw new Error(reason);
    }
  };

  const checkReveal = async (tokenId: number): Promise<boolean> => {
    try {
      const rc = new Contract(CONTRACT_ADDRESS, ABI, new ethers.JsonRpcProvider(RPC_URL));
      return Boolean(await rc.tokenRevealed(tokenId));
    } catch { return false; }
  };

  // ── Owner-only ───────────────────────────────────────────────────────────────

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
    connectWallet, disconnectWallet, addRitualChain,
    mint, checkReveal,
    setExecutorAndOpen, withdrawRevenue, getContractBalance,
  };
}
