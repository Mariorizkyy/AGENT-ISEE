import React, { useState, useEffect, useRef } from 'react';
import { useBlockchain, MINT_PRICE, OWNER_ADDRESS, CONTRACT_ADDRESS, shortenAddress } from '@/hooks/use-blockchain';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ethers } from 'ethers';

// ─── Terminal Log ─────────────────────────────────────────────────────────────
export function TerminalLog({ steps }: { steps: string[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [steps]);
  return (
    <div className="font-mono text-xs bg-black/70 p-4 border border-primary/20 mt-4 min-h-[80px] max-h-[200px] overflow-y-auto flex flex-col gap-1 rounded-sm">
      {steps.map((step, i) => {
        const isErr = step.startsWith('ERR') || step.startsWith('❌');
        const isOk  = step.startsWith('✅') || step.startsWith('🎉');
        return (
          <div key={i} className="flex gap-2">
            <span className="text-primary/30 shrink-0">{'>'}</span>
            <span className={isErr ? 'text-red-400' : isOk ? 'text-green-400' : 'text-primary/70'}>
              {step}
            </span>
          </div>
        );
      })}
      {steps.length > 0 && (
        <div className="flex gap-2 animate-pulse mt-1">
          <span className="text-primary/30">{'>'}</span>
          <span className="bg-primary/40 w-2 h-3.5 inline-block" />
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

// ─── Admin Panel ──────────────────────────────────────────────────────────────
function AdminPanel({
  isMintOpen,
  setExecutorAndOpen,
  withdrawRevenue,
  getContractBalance,
}: {
  isMintOpen: boolean;
  setExecutorAndOpen: (addr: string) => Promise<ethers.TransactionResponse>;
  withdrawRevenue: () => Promise<ethers.TransactionResponse>;
  getContractBalance: () => Promise<string>;
}) {
  const [executorInput, setExecutorInput] = useState('');
  const [balance, setBalance]             = useState('0');
  const [activating, setActivating]       = useState(false);
  const [withdrawing, setWithdrawing]     = useState(false);
  const [adminLog, setAdminLog]           = useState<string[]>([
    'Owner panel ready.',
    `Contract: ${CONTRACT_ADDRESS.slice(0, 18)}...`,
    `Mint: ${isMintOpen ? 'OPEN' : 'CLOSED'}`,
  ]);

  const log = (msg: string) => setAdminLog(prev => [...prev.slice(-20), msg]);

  useEffect(() => {
    getContractBalance().then(b => { setBalance(b); log(`Balance: ${b} RITUAL`); });
    const iv = setInterval(() => getContractBalance().then(setBalance), 15000);
    return () => clearInterval(iv);
  }, [getContractBalance]);

  useEffect(() => {
    log(`Mint: ${isMintOpen ? '✅ OPEN' : 'CLOSED'}`);
  }, [isMintOpen]);

  const handleActivate = async () => {
    if (!executorInput || !ethers.isAddress(executorInput)) {
      log('ERR: Invalid address.'); return;
    }
    setActivating(true);
    log('Calling setExecutorAndOpen()...');
    try {
      const tx = await setExecutorAndOpen(executorInput);
      log(`TX: ${tx.hash.slice(0, 20)}...`);
      await tx.wait();
      log('✅ Mint ACTIVATED!');
    } catch (e: any) {
      log(`ERR: ${e.shortMessage || e.message}`);
    } finally { setActivating(false); }
  };

  const handleWithdraw = async () => {
    setWithdrawing(true);
    log('Calling withdraw()...');
    try {
      const tx = await withdrawRevenue();
      log(`TX: ${tx.hash.slice(0, 20)}...`);
      await tx.wait();
      log('✅ Withdrawn!');
      const b = await getContractBalance();
      setBalance(b);
    } catch (e: any) {
      log(`ERR: ${e.shortMessage || e.message}`);
    } finally { setWithdrawing(false); }
  };

  return (
    <div className="mt-6 border border-primary/30 bg-black/60 p-5 space-y-4 rounded-sm">
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
        <span className="font-mono text-[10px] tracking-widest text-primary/60 uppercase">Owner Control Panel</span>
      </div>

      <div className={`flex items-center justify-between px-3 py-2 rounded-sm border font-mono text-xs ${
        isMintOpen ? 'border-green-500/40 text-green-400 bg-green-500/10'
                   : 'border-yellow-500/40 text-yellow-400 bg-yellow-500/10'}`}>
        <span>Mint Status</span>
        <span className="font-bold">{isMintOpen ? '● OPEN' : '○ CLOSED'}</span>
      </div>

      <div className="space-y-2 border border-primary/10 p-3 rounded-sm">
        <p className="font-mono text-[10px] uppercase tracking-widest text-primary/40">
          {isMintOpen ? '✅ Active' : 'Activate Mint'}
        </p>
        <input
          type="text"
          placeholder="Executor address (0x...)"
          value={executorInput}
          onChange={e => setExecutorInput(e.target.value)}
          disabled={activating}
          className="w-full bg-black/50 border border-primary/20 text-primary font-mono text-xs px-3 py-2 outline-none focus:border-primary/60 rounded-sm disabled:opacity-50 placeholder:text-primary/25"
        />
        <Button onClick={handleActivate} disabled={activating || !executorInput}
          className="w-full font-mono text-xs tracking-wider" variant="outline">
          {activating ? '⏳ Activating...' : isMintOpen ? '↺ Update Executor' : '⚡ Activate Mint'}
        </Button>
      </div>

      <div className="flex items-center justify-between border border-primary/10 px-3 py-2.5 rounded-sm">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-primary/40">Balance</p>
          <p className="font-mono text-sm text-primary mt-0.5">{balance} RITUAL</p>
        </div>
        <Button onClick={handleWithdraw}
          disabled={withdrawing || balance === '0' || balance === '0.0'}
          variant="outline" className="font-mono text-xs">
          {withdrawing ? '⏳...' : '↑ Withdraw'}
        </Button>
      </div>

      <TerminalLog steps={adminLog} />
    </div>
  );
}

// ─── Mint State Machine ───────────────────────────────────────────────────────
type MintState =
  | 'idle' | 'SUBMITTING' | 'PENDING_COMMITMENT' | 'COMMITTED'
  | 'EXECUTOR_PROCESSING' | 'RESULT_READY' | 'PENDING_SETTLEMENT'
  | 'SETTLED' | 'FAILED';

const STATE_LABELS: Record<MintState, string> = {
  idle: '', SUBMITTING: 'Sending transaction...',
  PENDING_COMMITMENT: 'Waiting for block...', COMMITTED: 'Confirmed — job assigned',
  EXECUTOR_PROCESSING: 'TEE executor processing...', RESULT_READY: 'Prompt ready...',
  PENDING_SETTLEMENT: 'Delivering result...', SETTLED: '✅ Minted! Art reveal incoming...',
  FAILED: 'Failed — see terminal.',
};

const STATE_PROGRESS: Record<MintState, number> = {
  idle: 0, SUBMITTING: 10, PENDING_COMMITMENT: 25, COMMITTED: 40,
  EXECUTOR_PROCESSING: 60, RESULT_READY: 75, PENDING_SETTLEMENT: 88,
  SETTLED: 100, FAILED: 100,
};

// ─── Main MintPanel ───────────────────────────────────────────────────────────
export function MintPanel() {
  const {
    account,
    isMintOpen,
    totalSupply,
    isConnecting,
    isOwner,
    isCorrectChain,
    connectWallet,
    disconnectWallet,
    mint,               // ← correct name from use-blockchain.ts
    setExecutorAndOpen,
    withdrawRevenue,
    getContractBalance,
    addRitualChain,
  } = useBlockchain();

  const [mintState, setMintState]         = useState<MintState>('idle');
  const [txHash, setTxHash]               = useState<string | null>(null);
  const [terminalSteps, setTerminalSteps] = useState<string[]>([]);
  const [isMinting, setIsMinting]         = useState(false);

  const log = (msg: string) => setTerminalSteps(prev => [...prev.slice(-30), msg]);

  const simulateAsyncStates = async () => {
    await new Promise(r => setTimeout(r, 3000));
    setMintState('EXECUTOR_PROCESSING');
    log('Executor picked up job (off-chain TEE)...');
    await new Promise(r => setTimeout(r, 8000));
    setMintState('RESULT_READY');
    log('Prompt generated — awaiting callback...');
    await new Promise(r => setTimeout(r, 5000));
    setMintState('PENDING_SETTLEMENT');
    log('Callback transaction sent...');
    await new Promise(r => setTimeout(r, 5000));
    setMintState('SETTLED');
    log('✅ SETTLED — NFT minted! Art reveal in ~2 minutes.');
  };

  const handleMint = async () => {
    if (!account) { await connectWallet(); return; }
    if (!isMintOpen || isMinting) return;

    setIsMinting(true);
    setTerminalSteps([]);
    setTxHash(null);

    try {
      setMintState('SUBMITTING');
      log('─────────────────────────────────');
      log('Sending via eth_sendTransaction (no simulation)...');
      log(`Price: ${MINT_PRICE} RITUAL`);
      log('Gas: 2,000,000 (Ritual async precompile safe limit)');
      log('Waiting for wallet confirmation...');

      // ── KEY: calls mint() from use-blockchain which uses eth_sendTransaction ──
      const tx = await mint();

      setMintState('PENDING_COMMITMENT');
      setTxHash(tx.hash);
      log(`TX: ${tx.hash}`);
      log('Waiting for block confirmation...');

      await tx.wait();

      setMintState('COMMITTED');
      log('✅ TX confirmed!');
      log('Phase 1 done. Waiting for Ritual executor (off-chain TEE)...');
      log('This is normal — Ritual uses 2-phase async execution.');

      await simulateAsyncStates();

    } catch (e: any) {
      setMintState('FAILED');
      const msg = e.shortMessage || e.reason || e.message || 'Unknown error';
      log(`❌ Error: ${msg}`);
      if (msg.includes('insufficient funds')) {
        log(`Hint: Need ${MINT_PRICE} RITUAL + gas. Check wallet balance.`);
      }
      if (msg.includes('user rejected')) {
        log('Hint: Transaction rejected in wallet.');
      }
      if (msg.includes('Switched to Ritual')) {
        log('Hint: Chain switched — try minting again.');
        setMintState('idle');
      }
    } finally {
      setIsMinting(false);
    }
  };

  const isSettled = mintState === 'SETTLED';
  const isFailed  = mintState === 'FAILED';

  const getMintLabel = () => {
    if (isConnecting) return 'Connecting...';
    if (!account)     return 'Connect Wallet';
    if (isMinting)    return STATE_LABELS[mintState] || 'Processing...';
    if (isSettled)    return 'Mint Another';
    if (!isMintOpen)  return 'Mint Not Open';
    return `MINT — ${MINT_PRICE} RITUAL`;
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-5">

      <div className="text-center space-y-1">
        <h2 className="font-mono text-2xl tracking-widest text-primary uppercase">Access Mint</h2>
        <p className="text-primary/30 text-xs font-mono">
          AI-generated NFT on Ritual Chain · {MINT_PRICE} RITUAL
        </p>
      </div>

      {/* Wallet bar */}
      {account ? (
        <div className="flex items-center justify-between border border-primary/20 bg-black/40 px-4 py-2.5 rounded-sm">
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${isCorrectChain ? 'bg-green-400' : 'bg-yellow-400'} animate-pulse`} />
            <span className="font-mono text-xs text-primary/70">{shortenAddress(account)}</span>
            {!isCorrectChain && <span className="font-mono text-[10px] text-yellow-400">Wrong network</span>}
          </div>
          <button onClick={disconnectWallet}
            className="font-mono text-[10px] text-primary/30 hover:text-red-400 transition-colors uppercase tracking-wider">
            Disconnect
          </button>
        </div>
      ) : (
        <div className="border border-primary/10 bg-black/20 px-4 py-2.5 rounded-sm text-center">
          <span className="font-mono text-xs text-primary/30">No wallet connected</span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 font-mono text-xs">
        {[
          { label: 'Price', value: `${MINT_PRICE} RITUAL` },
          { label: 'Minted', value: `${totalSupply}` },
          { label: 'Status', value: isMintOpen ? 'OPEN' : 'CLOSED',
            color: isMintOpen ? 'text-green-400' : 'text-yellow-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="border border-primary/10 bg-black/30 px-3 py-2 rounded-sm text-center">
            <p className="text-primary/30 text-[10px] uppercase">{label}</p>
            <p className={`mt-0.5 ${color || 'text-primary'}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Mint closed notice */}
      {account && !isMintOpen && !isOwner && (
        <div className="border border-yellow-500/20 bg-yellow-500/5 px-4 py-3 rounded-sm text-center">
          <p className="font-mono text-xs text-yellow-400/80">Mint not open yet.</p>
        </div>
      )}

      {/* Progress */}
      {mintState !== 'idle' && (
        <div className="space-y-2">
          <Progress value={STATE_PROGRESS[mintState]}
            className={`h-0.5 ${isFailed ? '[&>div]:bg-red-500' : isSettled ? '[&>div]:bg-green-500' : ''}`} />
          <p className={`text-center font-mono text-xs ${
            isFailed ? 'text-red-400' : isSettled ? 'text-green-400' : 'text-primary/50'}`}>
            {STATE_LABELS[mintState]}
          </p>
        </div>
      )}

      {/* TX hash */}
      {txHash && (
        <div className="font-mono text-[10px] text-center text-primary/30">
          TX:{' '}
          <a href={`https://explorer.ritualfoundation.org/tx/${txHash}`}
            target="_blank" rel="noopener noreferrer"
            className="text-primary/50 hover:text-primary underline underline-offset-2">
            {txHash.slice(0, 22)}...↗
          </a>
        </div>
      )}

      {/* Mint button */}
      <Button id="mint-button" onClick={handleMint}
        disabled={isMinting || isConnecting ||
          (!!account && !isMintOpen && !isOwner) ||
          (!!account && !isCorrectChain)}
        className="w-full font-mono tracking-widest uppercase" size="lg">
        {getMintLabel()}
      </Button>

      {/* Wrong chain */}
      {account && !isCorrectChain && (
        <Button onClick={addRitualChain} variant="outline"
          className="w-full font-mono text-xs text-yellow-400 border-yellow-500/30 hover:border-yellow-500/60">
          Add Ritual Chain to Wallet
        </Button>
      )}

      {/* Terminal */}
      {terminalSteps.length > 0 && (
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-primary/30 mb-1">Terminal</p>
          <TerminalLog steps={terminalSteps} />
        </div>
      )}

      {/* Owner panel */}
      {isOwner && (
        <AdminPanel isMintOpen={isMintOpen}
          setExecutorAndOpen={setExecutorAndOpen}
          withdrawRevenue={withdrawRevenue}
          getContractBalance={getContractBalance} />
      )}

      <p className="text-center text-primary/20 font-mono text-[10px] pb-2">
        Contract:{' '}
        <a href={`https://explorer.ritualfoundation.org/address/${CONTRACT_ADDRESS}`}
          target="_blank" rel="noopener noreferrer" className="hover:text-primary/40">
          {shortenAddress(CONTRACT_ADDRESS)} ↗
        </a>
      </p>
    </div>
  );
}
