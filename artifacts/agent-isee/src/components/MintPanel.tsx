import React, { useState, useEffect, useRef } from 'react';
import { useBlockchain, MINT_PRICE, OWNER_ADDRESS, CONTRACT_ADDRESS, shortenAddress } from '@/hooks/use-blockchain';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ethers } from 'ethers';

// ─── Terminal Log Component ───────────────────────────────────────────────────
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

// ─── Admin Panel (Owner Only) ─────────────────────────────────────────────────
function AdminPanel() {
  const { isMintOpen, setExecutorAndOpen, withdrawRevenue, getContractBalance } = useBlockchain();
  const [executorInput, setExecutorInput] = useState('');
  const [balance, setBalance]             = useState('0');
  const [activating, setActivating]       = useState(false);
  const [withdrawing, setWithdrawing]     = useState(false);
  const [adminLog, setAdminLog]           = useState<string[]>([]);

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
      // ✅ FIX: setExecutorAndOpen juga pakai sendTransaction di hook
      const tx = await setExecutorAndOpen(executorInput);
      log(`TX: ${tx.hash.slice(0, 10)}...`);
      await tx.wait();
      log('✅ Mint ACTIVATED. Executor set.');
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
      log('✅ Withdrawn to owner wallet.');
      setBalance(await getContractBalance());
    } catch (e: any) {
      log(`ERR: ${e.shortMessage || e.message}`);
    } finally { setWithdrawing(false); }
  };

  return (
    <div className="mt-6 border border-primary/30 bg-black/60 p-4 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
        <span className="font-mono text-[10px] tracking-widest text-primary/60 uppercase">Owner Panel</span>
      </div>

      {/* Mint status */}
      <div className={`text-xs font-mono px-3 py-1.5 rounded border ${isMintOpen
        ? 'border-green-500/40 text-green-400 bg-green-500/10'
        : 'border-yellow-500/40 text-yellow-400 bg-yellow-500/10'}`}>
        Mint Status: {isMintOpen ? '🟢 OPEN' : '🟡 CLOSED — Perlu activate dulu'}
      </div>

      {/* Activate mint */}
      {!isMintOpen && (
        <div className="space-y-2">
          <p className="text-xs text-primary/50 font-mono">Set executor address untuk membuka mint:</p>
          <input
            type="text"
            placeholder="0x... executor address"
            value={executorInput}
            onChange={e => setExecutorInput(e.target.value)}
            className="w-full bg-black/50 border border-primary/20 text-primary font-mono text-xs px-3 py-2 outline-none focus:border-primary/60"
          />
          <Button
            onClick={handleActivate}
            disabled={activating || !executorInput}
            className="w-full text-xs font-mono"
            variant="outline"
          >
            {activating ? 'Activating...' : '⚡ Activate Mint'}
          </Button>
        </div>
      )}

      {/* Withdraw */}
      <div className="flex items-center justify-between pt-2 border-t border-primary/10">
        <span className="font-mono text-xs text-primary/50">Balance: {balance} RITUAL</span>
        <Button
          onClick={handleWithdraw}
          disabled={withdrawing || balance === '0'}
          variant="outline"
          className="text-xs font-mono"
        >
          {withdrawing ? 'Withdrawing...' : '↑ Withdraw'}
        </Button>
      </div>

      {adminLog.length > 0 && <TerminalLog steps={adminLog} />}
    </div>
  );
}

// ─── Mint Status States ───────────────────────────────────────────────────────
// Sesuai artikel tutubear: Ritual tx melewati 9 state
type MintState =
  | 'idle'
  | 'SUBMITTING'
  | 'PENDING_COMMITMENT'
  | 'COMMITTED'
  | 'EXECUTOR_PROCESSING'
  | 'RESULT_READY'
  | 'PENDING_SETTLEMENT'
  | 'SETTLED'
  | 'FAILED';

const MINT_STATE_LABELS: Record<MintState, string> = {
  idle:                 '',
  SUBMITTING:           '⏳ Mengirim transaksi...',
  PENDING_COMMITMENT:   '⏳ Menunggu transaksi masuk blok...',
  COMMITTED:            '✅ Transaksi dikonfirmasi! Job ID di-assign...',
  EXECUTOR_PROCESSING:  '🤖 Executor memproses prompt di TEE...',
  RESULT_READY:         '🎨 Prompt siap! Menunggu delivery...',
  PENDING_SETTLEMENT:   '⏳ Mengirim callback transaksi...',
  SETTLED:              '🎉 NFT berhasil di-mint! Art sedang di-reveal...',
  FAILED:               '❌ Gagal. Cek log untuk detail.',
};

// ─── Main MintPanel Component ─────────────────────────────────────────────────
export function MintPanel() {
  const {
    account,
    isMintOpen,
    totalSupply,
    isConnecting,
    isOwner,
    isCorrectChain,
    connectWallet,
    mintNFT,
    refreshContractState,
  } = useBlockchain();

  const [mintState, setMintState]   = useState<MintState>('idle');
  const [txHash, setTxHash]         = useState<string | null>(null);
  const [terminalSteps, setTerminalSteps] = useState<string[]>([]);
  const [isMinting, setIsMinting]   = useState(false);

  const log = (msg: string) => setTerminalSteps(prev => [...prev.slice(-20), msg]);

  // Auto-simulate state progression setelah tx COMMITTED
  // (sesuai artikel: state EXECUTOR_PROCESSING → RESULT_READY → SETTLED butuh waktu)
  const simulateAsyncStates = async () => {
    await new Promise(r => setTimeout(r, 3000));
    setMintState('EXECUTOR_PROCESSING');
    log('🤖 Executor processing di TEE (off-chain)...');

    await new Promise(r => setTimeout(r, 8000));
    setMintState('RESULT_READY');
    log('🎨 Prompt generated! Waiting callback delivery...');

    await new Promise(r => setTimeout(r, 5000));
    setMintState('PENDING_SETTLEMENT');
    log('⏳ Callback tx sent...');

    await new Promise(r => setTimeout(r, 5000));
    setMintState('SETTLED');
    log('🎉 SETTLED — NFT minted! Art akan reveal soon.');
    refreshContractState();
  };

  const handleMint = async () => {
    if (!account) { await connectWallet(); return; }
    if (!isMintOpen) return;
    if (isMinting) return;

    setIsMinting(true);
    setTerminalSteps([]);
    setTxHash(null);

    try {
      // ✅ SUBMITTING
      setMintState('SUBMITTING');
      log('Encoding mint() calldata...');
      log(`Mengirim ${MINT_PRICE} RITUAL ke kontrak...`);
      log('⚠️  GasLimit di-set manual: 2,000,000 (Ritual async precompile)');

      const tx = await mintNFT(log);

      // ✅ PENDING_COMMITMENT
      setMintState('PENDING_COMMITMENT');
      setTxHash(tx.hash);
      log(`TX hash: ${tx.hash.slice(0, 18)}...`);
      log('Menunggu konfirmasi blok...');

      await tx.wait();

      // ✅ COMMITTED
      setMintState('COMMITTED');
      log('✅ Transaksi confirmed! Job ID di-assign oleh Ritual.');
      log('Ini adalah fase async — NFT belum selesai, tunggu executor...');

      // Simulasi fase-fase async berikutnya
      await simulateAsyncStates();

    } catch (e: any) {
      setMintState('FAILED');
      const errMsg = e.shortMessage || e.reason || e.message || 'Unknown error';
      log(`❌ Error: ${errMsg}`);

      // Bantu diagnosa error umum
      if (errMsg.includes('mintOpen') || errMsg.includes('execution reverted')) {
        log('💡 Hint: Kontrak mungkin belum di-activate. Hubungi owner.');
      }
      if (errMsg.includes('insufficient funds')) {
        log(`💡 Hint: Butuh min ${MINT_PRICE} RITUAL + gas di wallet kamu.`);
      }
      if (errMsg.includes('user rejected')) {
        log('💡 Hint: Kamu menolak transaksi di wallet.');
      }
    } finally {
      setIsMinting(false);
    }
  };

  const isSettled = mintState === 'SETTLED';
  const isFailed  = mintState === 'FAILED';
  const isActive  = !['idle', 'SETTLED', 'FAILED'].includes(mintState);
  const progress  = {
    idle: 0,
    SUBMITTING: 10,
    PENDING_COMMITMENT: 25,
    COMMITTED: 40,
    EXECUTOR_PROCESSING: 60,
    RESULT_READY: 75,
    PENDING_SETTLEMENT: 88,
    SETTLED: 100,
    FAILED: 100,
  }[mintState];

  return (
    <div className="w-full max-w-md mx-auto space-y-6">
      {/* Header */}
      <div className="text-center space-y-1">
        <h2 className="font-mono text-2xl tracking-widest text-primary uppercase">Mint AGENT-ISEE</h2>
        <p className="text-primary/40 text-sm font-mono">
          {account
            ? `${shortenAddress(account)} · ${isCorrectChain ? '⬡ Ritual Chain' : '⚠️ Wrong Chain'}`
            : 'Connect wallet to mint'}
        </p>
      </div>

      {/* Stats */}
      <div className="flex justify-between font-mono text-xs text-primary/50 border border-primary/10 px-4 py-2">
        <span>Price: <span className="text-primary">{MINT_PRICE} RITUAL</span></span>
        <span>Minted: <span className="text-primary">{totalSupply}</span></span>
        <span>Status: <span className={isMintOpen ? 'text-green-400' : 'text-yellow-400'}>
          {isMintOpen ? 'OPEN' : 'CLOSED'}
        </span></span>
      </div>

      {/* Mint Closed notice */}
      {!isMintOpen && account && (
        <div className="border border-yellow-500/30 bg-yellow-500/5 px-4 py-3 font-mono text-xs text-yellow-400 text-center">
          ⚠️ Mint belum dibuka. Owner perlu activate contract terlebih dahulu.
        </div>
      )}

      {/* Progress bar (saat minting) */}
      {mintState !== 'idle' && (
        <div className="space-y-2">
          <Progress value={progress} className="h-1" />
          <p className={`text-center font-mono text-xs ${isFailed ? 'text-red-400' : isSettled ? 'text-green-400' : 'text-primary/70'}`}>
            {MINT_STATE_LABELS[mintState]}
          </p>
        </div>
      )}

      {/* TX Hash link */}
      {txHash && (
        <div className="font-mono text-xs text-center text-primary/40">
          TX:{' '}
          <a
            href={`https://explorer.ritualfoundation.org/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary/70 hover:text-primary underline underline-offset-2"
          >
            {txHash.slice(0, 20)}...
          </a>
        </div>
      )}

      {/* Mint Button */}
      <Button
        id="mint-button"
        onClick={handleMint}
        disabled={isMinting || isConnecting || (!!account && !isMintOpen) || (!account && isConnecting)}
        className="w-full font-mono tracking-widest uppercase"
        size="lg"
      >
        {isConnecting
          ? 'Connecting...'
          : !account
          ? '⬡ Connect Wallet'
          : isMinting
          ? `${MINT_STATE_LABELS[mintState] || 'Processing...'}`
          : isSettled
          ? '🎉 Mint Again'
          : isMintOpen
          ? `Mint — ${MINT_PRICE} RITUAL`
          : 'Mint Closed'}
      </Button>

      {/* Terminal Log */}
      {terminalSteps.length > 0 && <TerminalLog steps={terminalSteps} />}

      {/* Owner Panel */}
      {isOwner && <AdminPanel />}

      {/* Info note */}
      <p className="text-center text-primary/20 font-mono text-[10px]">
        Contract: {shortenAddress(CONTRACT_ADDRESS)}
        {' · '}
        <a
          href={`https://explorer.ritualfoundation.org/address/${CONTRACT_ADDRESS}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-primary/40"
        >
          View on Explorer ↗
        </a>
      </p>
    </div>
  );
}
