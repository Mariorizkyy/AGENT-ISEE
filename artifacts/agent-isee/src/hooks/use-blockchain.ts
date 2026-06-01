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

export const CONTRACT_ADDRESS = "0xaC9443A8FE8D6CABBcA820A66FAE2810EC8e8688";
export const OWNER_ADDRESS    = "0x419fa2f1991b06b0ab25bac2341765b38ca16178";
export const CHAIN_ID         = 1979;
export const MINT_PRICE       = "0.06";

const RPC_URLS = ["https://rpc.ritualfoundation.org"];
export const RPC_URL = RPC_URLS[0];

export const ABI = [
  "function mint() payable",
  "function totalSupply() view returns (uint256)",
  "function mintOpen() view returns (bool)",
  "function tokenPrompt(uint256) view returns (string)",
  "function tokenImageURI(uint256) view returns (string)",
  "function tokenRevealed(uint256) view returns (bool)",
  "function setExecutorAndOpen(address _executor) external",
  "function withdraw() external",
  "function getBalance() view returns (uint256)",
];

function encodeCall(functionSignature: string, args: unknown[] = []): string {
  const iface = new ethers.Interface(ABI);
  const funcName = functionSignature.split('(')[0];
  return iface.encodeFunctionData(funcName, args);
}

export function useBlockchain() {
  const [provider, setProvider]     = useState<BrowserProvider | null>(null);
  const [signer, setSigner]         = useState<ethers.Signer | null>(null);
  const [account, setAccount]       = useState<string | null>(null);
  const [isMintOpen, setIsMintOpen] = useState<boolean>(false);
  const [totalSupply, setTotalSupply] = useState<number>(0);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [chainId, setChainId]       = useState<number | null>(null);
  const [error, setError]           = useState<string | null>(null);

  const refreshContractState = async () => {
    try {
      const p = new ethers.JsonRpcProvider(RPC_URL, { chainId: CHAIN_ID, name: "ritual" });
      const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, p);
      const [mintOpenVal, supplyVal] = await Promise.all([
        c.mintOpen(),
        c.totalSupply(),
      ]);
      setIsMintOpen(Boolean(mintOpenVal));
      setTotalSupply(Number(supplyVal));
    } catch (e: any) {
      console.warn("Gagal membaca state contract:", e.message);
    }
  };

  useEffect(() => {
    refreshContractState();
    const iv = setInterval(refreshContractState, 15000);
    return () => clearInterval(iv);
  }, []);

  const connectWallet = async () => {
    setIsConnecting(true);
    setError(null);
    try {
      const walletProvider = getWalletProvider();
      if (!walletProvider) throw new Error("Wallet tidak terdeteksi.");

      await walletProvider.request({ method: 'eth_requestAccounts' });

      const browserProvider = new BrowserProvider(walletProvider as any);
      const network = await browserProvider.getNetwork();

      if (Number(network.chainId) !== CHAIN_ID) {
        await addRitualChain();
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
        if (accs.length === 0) setAccount(null);
        else setAccount(accs[0]);
      });
      walletProvider.on('chainChanged', () => window.location.reload());
    } catch (e: any) {
      setError(e.shortMessage || e.message);
    } finally {
      setIsConnecting(false);
    }
  };

  const addRitualChain = async () => {
    const walletProvider = getWalletProvider();
    if (!walletProvider) return;
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
  };

  const mint = async (): Promise<{ hash: string, wait: () => Promise<any> }> => {
    if (!account || !provider) throw new Error("Wallet belum terkoneksi.");
    if (!isMintOpen) throw new Error("Minting belum diaktifkan.");

    const data = encodeCall("mint()", []);
    const walletProvider = getWalletProvider();
    if (!walletProvider) throw new Error("Provider hilang");

    const txHash = await walletProvider.request({
      method: 'eth_sendTransaction',
      params: [{
        from: account,
        to: CONTRACT_ADDRESS,
        data: data,
        value: "0x" + BigInt(ethers.parseEther(MINT_PRICE)).toString(16),
        gas: "0x" + BigInt(3000000).toString(16),
      }]
    }) as string;

    return { 
      hash: txHash, 
      wait: async () => provider.waitForTransaction(txHash) 
    };
  };

  const setExecutorAndOpen = async (executorAddress: string): Promise<{ hash: string, wait: () => Promise<any> }> => {
    if (!account || !provider) throw new Error("Wallet belum terkoneksi.");
    
    const data = encodeCall("setExecutorAndOpen(address)", [executorAddress]);
    const walletProvider = getWalletProvider();
    
    const txHash = await walletProvider!.request({
      method: 'eth_sendTransaction',
      params: [{
        from: account,
        to: CONTRACT_ADDRESS,
        data: data,
        gas: "0x" + BigInt(2000000).toString(16),
      }]
    }) as string;

    return { hash: txHash, wait: async () => provider.waitForTransaction(txHash) };
  };

  const withdrawRevenue = async (): Promise<{ hash: string, wait: () => Promise<any> }> => {
    if (!account || !provider) throw new Error("Wallet belum terkoneksi.");
    
    const data = encodeCall("withdraw()", []);
    const walletProvider = getWalletProvider();
    
    const txHash = await walletProvider!.request({
      method: 'eth_sendTransaction',
      params: [{
        from: account,
        to: CONTRACT_ADDRESS,
        data: data,
        gas: "0x" + BigInt(500000).toString(16),
      }]
    }) as string;

    return { hash: txHash, wait: async () => provider.waitForTransaction(txHash) };
  };

  const getContractBalance = async (): Promise<string> => {
    try {
      const p = new ethers.JsonRpcProvider(RPC_URL, { chainId: CHAIN_ID, name: "ritual" });
      const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, p);
      return ethers.formatEther(await c.getBalance());
    } catch { return "0"; }
  };

  const checkReveal = async (tokenId: number): Promise<boolean> => {
    try {
      const p = new ethers.JsonRpcProvider(RPC_URL, { chainId: CHAIN_ID, name: "ritual" });
      const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, p);
      const revealed = await c.tokenRevealed(tokenId);
      return revealed;
    } catch { return false; }
  };

  const isOwner = account?.toLowerCase() === OWNER_ADDRESS.toLowerCase();
  const isCorrectChain = chainId === CHAIN_ID;

  return {
    provider, signer, account, isMintOpen, totalSupply, isConnecting,
    chainId, error, isOwner, isCorrectChain,
    connectWallet, addRitualChain, mint, setExecutorAndOpen,
    withdrawRevenue, getContractBalance, checkReveal, refreshContractState,
  };
}
