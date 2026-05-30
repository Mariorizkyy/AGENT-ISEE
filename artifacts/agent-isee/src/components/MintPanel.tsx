import React, { useState, useEffect, useRef } from 'react';
import { useBlockchain, MINT_PRICE, OWNER_ADDRESS, CONTRACT_ADDRESS } from '@/hooks/use-blockchain';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ethers } from 'ethers';

export function TerminalLog({ steps }: { steps: string[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [steps]);
  return (
    <div className="font-mono text-xs text-primary/80 bg-black/50 p-4 border border-primary/20 mt-4 min-h-[80px] max-h-[160px] overflow-y-auto flex flex-col gap-1">
      {steps.map((step, i) => (
        <div key={i} className="flex gap-2">
          <span className="text-primary/40 shrink-0">{'>'}</span>
          <span>{step}</span>
        </div>
      ))}
      <div className="flex gap-2 animate-pulse">
        <span className="text-primary/40">{'>'}</span>
        <span className="bg-primary/50 w-2 h-3.5 inline-block" />
      </div>
      <div ref={bottomRef} />
    </div>
  );
}

function AdminPanel() {
  const { isMintOpen, setExecutorAndOpen, withdrawRevenue, getContractBalance, contract } = useBlockchain();
  const [executorInput, setExecutorInput]     = useState('');
  const [balance, setBalance]                 = useState('0');
  const [activating, setActivating]           = useState(false);
  const [withdrawing, setWithdrawing]         = useState(false);
  const [adminLog, setAdminLog]               = useState<string[]>([]);

  const log = (msg: string) => setAdminLog(prev => [...prev.slice(-8), msg]);

  useEffect(() => {
    const refresh = async () => { setBalance(await getContractBalance()); };
    refresh();
    const iv = setInterval(refresh, 15000);
    return () => clearInterval(iv);
  }, []);

  const handleActivate = async () => {
    if (!executorInput || !ethers.isAddress(executorInput)) {
      log('ERR: invalid executor address'); return;
    }
    setActivating(true);
    log('Sending setExecutorAndOpen tx...');
    try {
      const tx = await setExecutorAndOpen(executorInput);
      log(`TX: ${tx.hash.slice(0, 10)}...`);
      await tx.wait();
      log('Mint ACTIVATED. Executor set.');
    } catch (e: any) {
      log(`ERR: ${e.shortMessage || e.message}`);
    } finally { setActivating(false); }
  };

  const handleWithdraw = async () => {
    setWithdrawing(true);
    log('Sending withdraw tx...');
    try {
      const tx = await withdrawRevenue();
      log(`TX: ${tx.hash.slice(0, 10)}...`);
      await tx.wait();
      log('Withdrawn to owner wallet.');
      setBalance(await getContractBalance());
    } catch (e: any) {
      log(`ERR: ${e.shortMessage || e.message}`);
    } finally { setWithdrawing(false); }
  };

  return (
    <div className="mt-6 border border-primary/30 bg-black/60 p-4 space-y-4" data-testid="admin-panel">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
        <span className="font-mono text-[10px] tracking-widest text-primary/60 uppercase">Owner Panel</span>
      </div>

      {/* Status row */}
      <div className="flex gap-4 font-mono text-xs">
        <div className="flex-1 border border-primary/20 bg-black/40 p-3">
          <div className="text-primary/40 text-[10px] uppercase tracking-widest mb-1">Mint Status</div>
          <div className={`font-bold tracking-widest ${isMintOpen ? 'text-cyan-400' : 'text-primary/50'}`}>
            {isMintOpen ? 'OPEN' : 'CLOSED'}
          </div>
        </div>
        <div className="flex-1 border border-primary/20 bg-black/40 p-3">
          <div className="text-primary/40 text-[10px] uppercase tracking-widest mb-1">Balance</div>
          <div className="text-white font-bold tabular-nums">{parseFloat(balance).toFixed(4)} <span className="text-primary/50 font-normal">RITUAL</span></div>
        </div>
      </div>

      {/* Withdraw */}
      {parseFloat(balance) > 0 && (
        <Button
          onClick={handleWithdraw}
          disabled={withdrawing}
          className="w-full h-9 rounded-none border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 font-mono text-xs tracking-widest uppercase"
          data-testid="button-withdraw"
        >
          {withdrawing ? 'WITHDRAWING...' : `WITHDRAW ${parseFloat(balance).toFixed(4)} RITUAL`}
        </Button>
      )}

      {/* Activate mint */}
      {!isMintOpen && (
        <div className="space-y-2">
          <div className="font-mono text-[10px] text-primary/40 uppercase tracking-widest">Executor Address</div>
          <input
            value={executorInput}
            onChange={e => setExecutorInput(e.target.value)}
            placeholder="0x..."
            className="w-full bg-black border border-primary/30 text-white font-mono text-xs px-3 py-2 focus:outline-none focus:border-primary/60 placeholder:text-primary/20"
            data-testid="input-executor"
          />
          <Button
            onClick={handleActivate}
            disabled={activating || !executorInput}
            className="w-full h-10 rounded-none border border-cyan-500/50 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 font-mono text-xs tracking-widest uppercase"
            data-testid="button-activate-mint"
          >
            {activating ? 'ACTIVATING...' : 'ACTIVATE MINT'}
          </Button>
        </div>
      )}

      {/* Admin terminal log */}
      {adminLog.length > 0 && (
        <div className="font-mono text-[10px] text-primary/60 bg-black/50 border border-primary/10 p-2 space-y-0.5 max-h-24 overflow-y-auto">
          {adminLog.map((l, i) => <div key={i}><span className="text-primary/30">{'>'} </span>{l}</div>)}
        </div>
      )}
    </div>
  );
}

export function MintPanel() {
  const {
    account, totalSupply, isMintOpen, isCorrectChain,
    connectWallet, addRitualChain, mint, checkReveal,
    isConnecting, isOwner,
  } = useBlockchain();

  const [mintSteps, setMintSteps] = useState<string[]>([]);
  const [isMinting, setIsMinting] = useState(false);

  const handleMint = async () => {
    setIsMinting(true);
    setMintSteps(["Initiating transaction..."]);
    try {
      const tx = await mint();
      setMintSteps(prev => [...prev, `TX: ${tx.hash.slice(0, 10)}...`]);
      const receipt = await tx.wait();
      setMintSteps(prev => [...prev, `Confirmed block ${receipt?.blockNumber}`]);
      setMintSteps(prev => [...prev, "LLM generating vision..."]);

      const tokenId = totalSupply + 1;
      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        if (attempts > 30) {
          clearInterval(interval);
          setMintSteps(prev => [...prev, "Timeout — check gallery in a few minutes."]);
          setIsMinting(false);
          return;
        }
        const revealed = await checkReveal(tokenId);
        if (revealed) {
          clearInterval(interval);
          setMintSteps(prev => [...prev, `Eye #${tokenId} art revealed. Check gallery.`]);
          setIsMinting(false);
        }
      }, 4000);
    } catch (err: any) {
      const reason =
        err.reason ??
        err.revert?.args?.[0] ??
        err.data?.message ??
        err.shortMessage ??
        err.message ??
        "tx failed";
      setMintSteps(prev => [...prev, `ERR: ${reason}`]);
      setIsMinting(false);
    }
  };

  const maxSupply = 666;

  return (
    <div
      className="w-full max-w-md mx-auto p-6 bg-card border border-primary/20 electric-glow rounded-sm relative z-10"
      data-testid="mint-panel"
    >
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl text-white tracking-widest">ACCESS MINT</h2>
        <div className="text-primary font-mono text-sm">{MINT_PRICE} RITUAL</div>
      </div>

      {/* Supply bar */}
      <div className="space-y-2 mb-8">
        <div className="flex justify-between text-xs font-mono text-primary/70">
          <span>SUPPLY</span>
          <span>{totalSupply} / {maxSupply}</span>
        </div>
        <Progress value={(totalSupply / maxSupply) * 100} className="h-1 bg-black [&>div]:bg-primary" />
      </div>

      {/* Contract address */}
      <div className="mb-4 font-mono text-[10px] text-primary/30 tracking-wider truncate">
        {CONTRACT_ADDRESS}
      </div>

      {/* Wallet / chain / mint CTA */}
      <div className="space-y-3">
        {!account ? (
          <>
            <Button
              onClick={connectWallet}
              disabled={isConnecting}
              className="w-full bg-primary/20 text-primary hover:bg-primary/40 border border-primary/50 uppercase tracking-widest rounded-none h-12"
              data-testid="button-connect-wallet"
            >
              {isConnecting ? "CONNECTING..." : "CONNECT TERMINAL"}
            </Button>
            <Button
              onClick={addRitualChain}
              variant="ghost"
              className="w-full border border-primary/20 text-primary/50 hover:text-primary hover:bg-primary/10 uppercase tracking-widest rounded-none h-9 text-xs font-mono"
              data-testid="button-add-ritual-chain"
            >
              ADD RITUAL CHAIN TO METAMASK
            </Button>
          </>
        ) : !isCorrectChain ? (
          <Button
            onClick={addRitualChain}
            className="w-full bg-destructive/20 text-destructive-foreground hover:bg-destructive/40 border border-destructive/50 uppercase tracking-widest rounded-none h-12"
            data-testid="button-switch-chain"
          >
            SWITCH TO RITUAL CHAIN
          </Button>
        ) : (
          <Button
            onClick={handleMint}
            disabled={isMinting || !isMintOpen || totalSupply >= maxSupply}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/80 uppercase tracking-widest rounded-none h-12 electric-glow font-bold"
            data-testid="button-mint"
          >
            {isMinting
              ? "PROCESSING..."
              : totalSupply >= maxSupply
              ? "SUPPLY EXHAUSTED"
              : !isMintOpen
              ? "MINT CLOSED"
              : "INITIATE MINT"}
          </Button>
        )}
      </div>

      {mintSteps.length > 0 && <TerminalLog steps={mintSteps} />}

      {/* Owner-only admin panel — invisible to all other wallets */}
      {isOwner && <AdminPanel />}
    </div>
  );
}
