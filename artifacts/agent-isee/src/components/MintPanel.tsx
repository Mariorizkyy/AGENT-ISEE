import React, { useState, useEffect, useRef } from 'react';
import { useBlockchain, MINT_PRICE, OWNER_ADDRESS, CONTRACT_ADDRESS, shortenAddress } from '@/hooks/use-blockchain';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ethers } from 'ethers';

// ─── Terminal Log Component ───────────────────────────────────────────────────
export function TerminalLog({ steps, isError = false }: { steps: string[]; isError?: boolean }) {
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

// ─── Admin Panel (Owner Only) ─────────────────────────────────────────────────
// ✅ FIX: Menerima functions dari parent komponen agar state signer-nya sama dan tidak terpisah
function AdminPanel({
  isMintOpen,
  setExecutorAndOpen,
  withdrawRevenue,
  getContractBalance
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
    `Mint status: ${isMintOpen ? 'OPEN' : 'CLOSED — needs activation'}`,
  ]);

  const log = (msg: string) => setAdminLog(prev => [...prev.slice(-20), msg]);

  useEffect(() => {
    const refresh = async () => {
      const bal = await getContractBalance();
      setBalance(bal);
      log(`Balance refreshed: ${bal} RITUAL`);
    };
    refresh();
    const iv = setInterval(refresh, 15000);
    return () => clearInterval(iv);
  }, [getContractBalance]);

  // Update log when mintOpen changes
  useEffect(() => {
    log(`Mint status: ${isMintOpen ? '✅ OPEN' : 'CLOSED — set executor to activate'}`);
  }, [isMintOpen]);

  const handleActivate = async () => {
    if (!executorInput || !ethers.isAddress(executorInput)) {
      log('ERR: Invalid executor address. Must be a valid 0x... address.'); return;
    }
    setActivating(true);
    log('─────────────────────────────────');
    log('Calling setExecutorAndOpen()...');
    log(`Executor: ${executorInput.slice(0, 18)}...`);
    log('NOTE: gasLimit set to 2,000,000 (Ritual precompile safe limit)');
    log('Waiting for wallet confirmation...');
    try {
      const tx = await setExecutorAndOpen(executorInput);
      log(`TX sent: ${tx.hash.slice(0, 20)}...`);
      log('Waiting for block confirmation...');
      await tx.wait();
      log('✅ TX confirmed!');
      log('✅ Mint ACTIVATED — executor has been set.');
      log('Mint is now OPEN. Users can mint NFTs.');
      log('─────────────────────────────────');
    } catch (e: any) {
      log(`ERR: ${e.shortMessage || e.reason || e.message}`);
      if (e.message?.includes('user rejected')) {
        log('Hint: You rejected the transaction in your wallet.');
      }
      if (e.message?.includes('insufficient funds')) {
        log('Hint: Not enough RITUAL for gas. Top up owner wallet.');
      }
    } finally { setActivating(false); }
  };

  const handleWithdraw = async () => {
    setWithdrawing(true);
    log('─────────────────────────────────');
    log('Calling withdraw()...');
    log('Waiting for wallet confirmation...');
    try {
      const tx = await withdrawRevenue();
      log(`TX sent: ${tx.hash.slice(0, 20)}...`);
      await tx.wait();
      log('✅ TX confirmed!');
      log('✅ Revenue withdrawn to owner wallet.');
      const newBal = await getContractBalance();
      setBalance(newBal);
      log(`Contract balance: ${newBal} RITUAL`);
      log('─────────────────────────────────');
    } catch (e: any) {
      log(`ERR: ${e.shortMessage || e.reason || e.message}`);
    } finally { setWithdrawing(false); }
  };

  return (
    <div className="mt-6 border border-primary/30 bg-black/60 p-5 space-y-4 rounded-sm">
      {/* Panel header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="font-mono text-[10px] tracking-widest text-primary/60 uppercase">Owner Control Panel</span>
        </div>
        <span className="font-mono text-[10px] text-primary/30">
          {shortenAddress(OWNER_ADDRESS)}
        </span>
      </div>

      {/* Mint Status Badge */}
      <div className={`flex items-center justify-between px-3 py-2 rounded-sm border font-mono text-xs ${
        isMintOpen
          ? 'border-green-500/40 text-green-400 bg-green-500/10'
          : 'border-yellow-500/40 text-yellow-400 bg-yellow-500/10'
      }`}>
        <span>Mint Status</span>
        <span className="font-bold">{isMintOpen ? '● OPEN' : '○ CLOSED'}</span>
      </div>

      {/* ── Activate Section ── */}
      <div className="space-y-2 border border-primary/10 p-3 rounded-sm">
        <p className="font-mono text-[10px] uppercase tracking-widest text-primary/40 mb-2">
          {isMintOpen ? '✅ Mint is already active' : 'Step 1 — Activate Mint'}
        </p>
        {!isMintOpen && (
          <p className="font-mono text-xs text-primary/50">
            Set the executor address to open minting. The executor runs off-chain in a TEE.
          </p>
        )}
        <input
          type="text"
          placeholder="Executor address (0x...)"
          value={executorInput}
          onChange={e => setExecutorInput(e.target.value)}
          disabled={activating}
          className="w-full bg-black/50 border border-primary/20 text-primary font-mono text-xs px-3 py-2 outline-none focus:border-primary/60 rounded-sm disabled:opacity-50 placeholder:text-primary/25"
        />
        {/* Quick-fill TEE address hint */}
        <button
          onClick={() => {
            setExecutorInput('0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F');
            log('Auto-filled TEE executor address from deployment config.');
          }}
          className="text-[10px] font-mono text-primary/30 hover:text-primary/60 transition-colors"
        >
          ↳ Use TEE address from deployment config
        </button>
        <Button
          onClick={handleActivate}
          disabled={activating || !executorInput}
          className="w-full font-mono text-xs tracking-wider"
          variant="outline"
        >
          {activating ? '⏳ Activating — check wallet...' : isMintOpen ? '↺ Update Executor' : '⚡ Activate Mint'}
        </Button>
      </div>

      {/* ── Withdraw Section ── */}
      <div className="flex items-center justify-between border border-primary/10 px-3 py-2.5 rounded-sm">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-primary/40">Contract Balance</p>
          <p className="font-mono text-sm text-primary mt-0.5">{balance} RITUAL</p>
        </div>
        <Button
          onClick={handleWithdraw}
          disabled={withdrawing || balance === '0' || balance === '0.0'}
          variant="outline"
          className="font-mono text-xs"
        >
          {withdrawing ? '⏳ Withdrawing...' : '↑ Withdraw'}
        </Button>
      </div>

      {/* ── Terminal Log ── */}
      <div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-primary/30 mb-1">Terminal</p>
        <TerminalLog steps={adminLog} />
      </div>
    </div>
  );
}

// ─── Mint State Machine ───────────────────────────────────────────────────────
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
  SUBMITTING:           'Sending transaction...',
  PENDING_COMMITMENT:   'Waiting for block inclusion...',
  COMMITTED:            'Confirmed — job ID assigned',
  EXECUTOR_PROCESSING:  'Executor processing in TEE...',
  RESULT_READY:         'Prompt ready — awaiting delivery...',
  PENDING_SETTLEMENT:   'Sending callback transaction...',
  SETTLED:              'NFT minted! Art reveal incoming...',
  FAILED:               'Failed — see terminal for details.',
};

const MINT_STATE_PROGRESS: Record<MintState, number> = {
  idle: 0, SUBMITTING: 10, PENDING_COMMITMENT: 25,
  COMMITTED: 40, EXECUTOR_PROCESSING: 60,
  RESULT_READY: 75, PENDING_SETTLEMENT: 88,
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
    mintNFT,
    setExecutorAndOpen,
    withdrawRevenue,
    getContractBalance,
    refreshContractState,
  } = useBlockchain();

  const [mintState, setMintState]         = useState<MintState>('idle');
  const [txHash, setTxHash]               = useState<string | null>(null);
  const [terminalSteps, setTerminalSteps] = useState<string[]>([]);
  const [isMinting, setIsMinting]         = useState(false);

  const log = (msg: string) => setTerminalSteps(prev => [...prev.slice(-30), msg]);

  const simulateAsyncStates = async () => {
    await new Promise(r => setTimeout(r, 3000));
    setMintState('EXECUTOR_PROCESSING');
    log('Executor picked up the job (off-chain TEE processing)...');

    await new Promise(r => setTimeout(r, 8000));
    setMintState('RESULT_READY');
    log('Prompt generated — awaiting callback delivery...');

    await new Promise(r => setTimeout(r, 5000));
    setMintState('PENDING_SETTLEMENT');
    log('Callback transaction sent...');

    await new Promise(r => setTimeout(r, 5000));
    setMintState('SETTLED');
    log('✅ SETTLED — your NFT has been minted!');
    log('Art will be revealed once the image job completes.');
    refreshContractState();
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
      log('Encoding mint() calldata...');
      log(`Price: ${MINT_PRICE} RITUAL`);
      log('Gas limit: 2,000,000 (manual — Ritual async precompile)');
      log('NOTE: Skipping simulation (eth_call breaks on Ritual precompiles)');
      log('Waiting for wallet confirmation...');

      const tx = await mintNFT(log);

      setMintState('PENDING_COMMITMENT');
      setTxHash(tx.hash);
      log(`TX hash: ${tx.hash}`);
      log('Waiting for block confirmation...');

      await tx.wait();

      setMintState('COMMITTED');
      log('✅ TX confirmed!');
      log('Job ID assigned — this is a 2-phase async mint (Ritual specific).');
      log('Phase 1 done. Waiting for executor (off-chain)...');

      await simulateAsyncStates();

    } catch (e: any) {
      setMintState('FAILED');
      const errMsg = e.shortMessage || e.reason || e.message || 'Unknown error';
      log(`❌ Error: ${errMsg}`);
      if (errMsg.includes('mintOpen') || errMsg.includes('execution reverted')) {
        log('Hint: Mint is not open yet. Owner needs to activate the contract.');
      }
      if (errMsg.includes('insufficient funds')) {
        log(`Hint: Need at least ${MINT_PRICE} RITUAL + gas in your wallet.`);
      }
      if (errMsg.includes('user rejected')) {
        log('Hint: Transaction was rejected in your wallet.');
      }
    } finally {
      setIsMinting(false);
    }
  };

  const isSettled = mintState === 'SETTLED';
  const isFailed  = mintState === 'FAILED';
  const progress  = MINT_STATE_PROGRESS[mintState];

  const getMintButtonLabel = () => {
    if (isConnecting) return 'Connecting...';
    if (!account) return 'Connect Wallet';
    if (isMinting) return MINT_STATE_LABELS[mintState] || 'Processing...';
    if (isSettled) return 'Mint Another';
    if (!isMintOpen) return 'Mint Not Open';
    return `Mint — ${MINT_PRICE} RITUAL`;
  };

  return (
    <div className="w-full max-w-md mx-auto space-y-5">

      {/* ── Header ── */}
      <div className="text-center space-y-1">
        <h2 className="font-mono text-2xl tracking-widest text-primary uppercase">Mint AGENT-ISEE</h2>
        <p className="text-primary/30 text-xs font-mono">
          AI-generated NFT on Ritual Chain · {MINT_PRICE} RITUAL
        </p>
      </div>

      {/* ── Wallet bar ── */}
      {account ? (
        <div className="flex items-center justify-between border border-primary/20 bg-black/40 px-4 py-2.5 rounded-sm">
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${isCorrectChain ? 'bg-green-400' : 'bg-yellow-400'} animate-pulse`} />
            <span className="font-mono text-xs text-primary/70">{shortenAddress(account)}</span>
            {!isCorrectChain && (
              <span className="font-mono text-[10px] text-yellow-400">Wrong network</span>
            )}
          </div>
          <button
            onClick={disconnectWallet}
            className="font-mono text-[10px] text-primary/30 hover:text-red-400 transition-colors uppercase tracking-wider"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <div className="border border-primary/10 bg-black/20 px-4 py-2.5 rounded-sm text-center">
          <span className="font-mono text-xs text-primary/30">No wallet connected</span>
        </div>
      )}

      {/* ── Stats ── */}
      <div className="grid grid-cols-3 gap-2 font-mono text-xs">
        <div className="border border-primary/10 bg-black/30 px-3 py-2 rounded-sm text-center">
          <p className="text-primary/30 text-[10px] uppercase">Price</p>
          <p className="text-primary mt-0.5">{MINT_PRICE} RITUAL</p>
        </div>
        <div className="border border-primary/10 bg-black/30 px-3 py-2 rounded-sm text-center">
          <p className="text-primary/30 text-[10px] uppercase">Minted</p>
          <p className="text-primary mt-0.5">{totalSupply}</p>
        </div>
        <div className="border border-primary/10 bg-black/30 px-3 py-2 rounded-sm text-center">
          <p className="text-primary/30 text-[10px] uppercase">Status</p>
          <p className={`mt-0.5 ${isMintOpen ? 'text-green-400' : 'text-yellow-400'}`}>
            {isMintOpen ? 'OPEN' : 'CLOSED'}
          </p>
        </div>
      </div>

      {/* ── Mint closed notice ── */}
      {account && !isMintOpen && !isOwner && (
        <div className="border border-yellow-500/20 bg-yellow-500/5 px-4 py-3 rounded-sm text-center">
          <p className="font-mono text-xs text-yellow-400/80">
            Mint is not open yet. The owner needs to activate the contract.
          </p>
        </div>
      )}

      {/* ── Progress bar ── */}
      {mintState !== 'idle' && (
        <div className="space-y-2">
          <Progress
            value={progress}
            className={`h-0.5 ${isFailed ? '[&>div]:bg-red-500' : isSettled ? '[&>div]:bg-green-500' : ''}`}
          />
          <p className={`text-center font-mono text-xs ${
            isFailed ? 'text-red-400' : isSettled ? 'text-green-400' : 'text-primary/50'
          }`}>
            {MINT_STATE_LABELS[mintState]}
          </p>
        </div>
      )}

      {/* ── TX hash ── */}
      {txHash && (
        <div className="font-mono text-[10px] text-center text-primary/30">
          TX:{' '}
          <a
            href={`https://explorer.ritualfoundation.org/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary/50 hover:text-primary underline underline-offset-2 transition-colors"
          >
            {txHash.slice(0, 22)}...↗
          </a>
        </div>
      )}

      {/* ── Mint Button ── */}
      <Button
        id="mint-button"
        onClick={handleMint}
        disabled={
          isMinting ||
          isConnecting ||
          (!!account && !isMintOpen && !isOwner) ||
          (!!account && !isCorrectChain)
        }
        className="w-full font-mono tracking-widest uppercase"
        size="lg"
      >
        {getMintButtonLabel()}
      </Button>

      {/* ── Wrong chain button ── */}
      {account && !isCorrectChain && (
        <Button
          onClick={() => connectWallet()}
          variant="outline"
          className="w-full font-mono text-xs text-yellow-400 border-yellow-500/30 hover:border-yellow-500/60"
        >
          Switch to Ritual Chain
        </Button>
      )}

      {/* ── Terminal (shown when minting) ── */}
      {terminalSteps.length > 0 && (
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-primary/30 mb-1">Terminal</p>
          <TerminalLog steps={terminalSteps} />
        </div>
      )}

      {/* ── Owner Admin Panel ── */}
      {isOwner && (
        <AdminPanel
          isMintOpen={isMintOpen}
          setExecutorAndOpen={setExecutorAndOpen}
          withdrawRevenue={withdrawRevenue}
          getContractBalance={getContractBalance}
        />
      )}

      {/* ── Footer ── */}
      <p className="text-center text-primary/20 font-mono text-[10px] pb-2">
        Contract:{' '}
        <a
          href={`https://explorer.ritualfoundation.org/address/${CONTRACT_ADDRESS}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-primary/40 transition-colors"
        >
          {shortenAddress(CONTRACT_ADDRESS)} ↗
        </a>
      </p>
    </div>
  );
}
