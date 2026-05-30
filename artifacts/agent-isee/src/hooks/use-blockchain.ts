import { useState, useEffect } from 'react';
import { ethers, BrowserProvider } from 'ethers';

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

// ✅ FIX: Hapus HTTP fallback — browser block mixed content
const RPC_URLS = [
  "https://rpc.ritualfoundation.org",
];
export const RPC_URL = RPC_URLS[0];

async function getWorkingProvider(): Promise<ethers.JsonRpcProvider> {
  for (const url of RPC_URLS) {
    try {
      const p = new ethers.JsonRpcProvider(url, { chainId: CHAIN_ID, name: "ritual" });
      await Promise.race([
        p.getBlockNumber(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000))
      ]);
      return p;
    } catch {
      continue;
    }
  }
  return new ethers.JsonRpcProvider(RPC_URLS[0], { chainId: CHAIN_ID, name: "ritual" });
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

// ✅ Helper: encode function data tanpa simulation
function encodeCall(functionSignature: string, args: unknown[] = []): string {
  const iface = new ethers.Interface(ABI);
  const funcName = functionSignature.split('(')[0];
  return iface.encodeFunctionData(funcName, args);
}

// ✅ Gas limit aman untuk Ritual async precompile calls
const RITUAL_GAS_LIMIT = 2_000_000n;

export function useBlockchain() {
  const [provider, setProvider]     = useState<BrowserProvider | null>(null);
  const [signer, setSigner]         = useState<ethers.Signer | null>(null);
  const [account, setAccount]       = useState<string | null>(null);
  const [isMintOpen, setIsMintOpen] = useState<boolean>(false);
  const [totalSupply, setTotalSupply] = useState<number>(0);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [chainId, setChainId]       = useState<number | null>(null);
  const [error, setError]           = useState<string | null>(null);

  // ── Read contract state via read-only provider (tidak perlu wallet) ─────
  const refreshContractState = async () => {
    try {
      const readProvider = await getWorkingProvider();
      const readContract = new ethers.Contract(CONTRACT_ADDRESS, ABI, readProvider);

      const [mintOpenVal, supplyVal] = await Promise.all([
        readContract.mintOpen(),
        readContract.totalSupply(),
      ]);

      setIsMintOpen(Boolean(mintOpenVal));
      setTotalSupply(Number(supplyVal));
    } catch (e: any) {
      console.warn("Failed to read contract state:", e.message);
    }
  };

  useEffect(() => {
    refreshContractState();
    const iv = setInterval(refreshContractState, 15000);
    return () => clearInterval(iv);
  }, []);

  // ── Wallet connect ──────────────────────────────────────────────────────
  const connectWallet = async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const walletProvider = getWalletProvider();
      if (!walletProvider) throw new Error("No wallet detected. Install MetaMask or OKX Wallet.");

      await walletProvider.request({ method: 'eth_requestAccounts' });

      const browserProvider = new BrowserProvider(walletProvider as any);
      const network = await browserProvider.getNetwork();

      // ── Switch to Ritual Chain if needed ──
      if (Number(network.chainId) !== CHAIN_ID) {
        try {
          await walletProvider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${CHAIN_ID.toString(16)}` }],
          });
        } catch (switchErr: any) {
          if (switchErr.code === 4902) {
            await walletProvider.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: `0x${CHAIN_ID.toString(16)}`,
                chainName: 'Ritual Chain',
                nativeCurrency: { name: 'RITUAL', symbol: 'RITUAL', decimals: 18 },
                rpcUrls: [RPC_URL],
                blockExplorerUrls: ['https://explorer.ritualfoundation.org'],
              }],
            });
          } else {
            throw switchErr;
          }
        }
      }

      const signerInstance = await browserProvider.getSigner();
      const accountAddress = await signerInstance.getAddress();
      const networkAfter   = await browserProvider.getNetwork();

      setProvider(browserProvider);
      setSigner(signerInstance);
      setAccount(accountAddress);
      setChainId(Number(networkAfter.chainId));

      walletProvider.on('accountsChanged', (accounts: unknown) => {
        const accs = accounts as string[];
        if (accs.length === 0) {
          setAccount(null); setSigner(null); setProvider(null);
        } else {
          setAccount(accs[0]);
        }
      });

      walletProvider.on('chainChanged', () => window.location.reload());

    } catch (e: any) {
      setError(e.shortMessage || e.message);
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = () => {
    setAccount(null);
    setSigner(null);
    setProvider(null);
    setChainId(null);
  };

  // ── ✅ FIX: mintNFT — SKIP SIMULASI, pakai sendTransaction ──────────
  const mintNFT = async (
    onStep?: (msg: string) => void
  ): Promise<ethers.TransactionResponse> => {
    if (!signer) throw new Error("Wallet not connected");
    if (!isMintOpen) throw new Error("Mint is not open yet.");

    const log = (msg: string) => { onStep?.(msg); console.log(msg); };

    log("Encoding calldata mint()...");
    const data = encodeCall("mint()", []);

    log("Sending transaction to Ritual Chain...");
    const tx = await signer.sendTransaction({
      to: CONTRACT_ADDRESS,
      data,
      value: ethers.parseEther(MINT_PRICE),
      gasLimit: RITUAL_GAS_LIMIT,
    });

    log(`TX sent: ${tx.hash.slice(0, 10)}...`);
    return tx;
  };

  // ── ✅ FIX: setExecutorAndOpen — juga pakai sendTransaction ────────────
  const setExecutorAndOpen = async (
    executorAddress: string
  ): Promise<ethers.TransactionResponse> => {
    if (!signer) throw new Error("Wallet not connected");

    const data = encodeCall("setExecutorAndOpen(address)", [executorAddress]);

    const tx = await signer.sendTransaction({
      to: CONTRACT_ADDRESS,
      data,
      gasLimit: RITUAL_GAS_LIMIT,
    });

    return tx;
  };

  // ── withdrawRevenue ─────────────────────────────────────────────────────
  const withdrawRevenue = async (): Promise<ethers.TransactionResponse> => {
    if (!signer) throw new Error("Wallet not connected");

    const data = encodeCall("withdraw()", []);

    const tx = await signer.sendTransaction({
      to: CONTRACT_ADDRESS,
      data,
      gasLimit: 500_000n,
    });

    return tx;
  };

  // ── getContractBalance ───────────────────────────────
  const getContractBalance = async (): Promise<string> => {
    try {
      const readProvider = await getWorkingProvider();
      const readContract = new ethers.Contract(CONTRACT_ADDRESS, ABI, readProvider);
      const bal = await readContract.getBalance();
      return ethers.formatEther(bal);
    } catch {
      return "0";
    }
  };

  // ── getTokenData ────────────────────────────────────────────
  const getTokenData = async (tokenId: number) => {
    try {
      const readProvider = await getWorkingProvider();
      const readContract = new ethers.Contract(CONTRACT_ADDRESS, ABI, readProvider);
      const [prompt, imageURI, revealed] = await Promise.all([
        readContract.tokenPrompt(tokenId),
        readContract.tokenImageURI(tokenId),
        readContract.tokenRevealed(tokenId),
      ]);
      return { prompt, imageURI, revealed };
    } catch {
      return null;
    }
  };

  const isOwner = account?.toLowerCase() === OWNER_ADDRESS.toLowerCase();
  const isCorrectChain = chainId === CHAIN_ID;

  return {
    provider,
    signer,
    account,
    isMintOpen,
    totalSupply,
    isConnecting,
    chainId,
    error,
    isOwner,
    isCorrectChain,
    connectWallet,
    disconnectWallet,
    mintNFT,
    setExecutorAndOpen,
    withdrawRevenue,
    getContractBalance,
    getTokenData,
    refreshContractState,
  };
}
