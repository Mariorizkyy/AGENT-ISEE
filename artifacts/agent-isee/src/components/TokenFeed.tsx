import { useState, useEffect, useRef } from 'react';
import { ethers, Contract } from 'ethers';
import { motion, AnimatePresence } from 'framer-motion';
import { CONTRACT_ADDRESS, RPC_URL } from '@/hooks/use-blockchain';

const FEED_ABI = [
  "event MintInitiated(uint256 indexed tokenId, address indexed minter, bytes32 llmJobId)",
  "event PromptGenerated(uint256 indexed tokenId, string prompt, bytes32 imgJobId)",
  "event ArtRevealed(uint256 indexed tokenId, string imageURI)",
  "function tokenPrompt(uint256) view returns (string)",
  "function tokenRevealed(uint256) view returns (bool)",
  "function tokenImageURI(uint256) view returns (string)",
  "function totalSupply() view returns (uint256)",
];

interface FeedEvent {
  id: string;
  type: 'mint' | 'prompt' | 'reveal';
  tokenId: number;
  minter?: string;
  prompt?: string;
  imageURI?: string;
  timestamp: number;
}

function shortAddr(addr: string): string {
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

const TYPE_CONFIG = {
  mint:   { label: 'MINT',   color: 'text-blue-400',  border: 'border-blue-400/30',  bg: 'bg-blue-400/5'  },
  prompt: { label: 'VISION', color: 'text-cyan-300',  border: 'border-cyan-300/30',  bg: 'bg-cyan-300/5'  },
  reveal: { label: 'REVEAL', color: 'text-white',     border: 'border-white/30',     bg: 'bg-white/5'     },
};

export function TokenFeed() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const addEvent = (ev: FeedEvent) => {
    setEvents(prev => {
      const updated = [ev, ...prev].slice(0, 30);
      return updated;
    });
  };

  useEffect(() => {
    const addr: string = CONTRACT_ADDRESS;
    if (!addr || addr === '' || addr === '0x0000000000000000000000000000000000000000') {
      return;
    }

    let provider: ethers.JsonRpcProvider;
    let contract: Contract;
    let destroyed = false;

    const setup = async (): Promise<(() => void) | void> => {
      try {
        provider = new ethers.JsonRpcProvider(RPC_URL);
        contract = new Contract(CONTRACT_ADDRESS, FEED_ABI, provider);

        // Seed with recent history (last 500 blocks)
        const currentBlock = await provider.getBlockNumber();
        const fromBlock = Math.max(0, currentBlock - 500);

        const [mintLogs, promptLogs, revealLogs] = await Promise.all([
          contract.queryFilter(contract.filters.MintInitiated(), fromBlock).catch(() => []),
          contract.queryFilter(contract.filters.PromptGenerated(), fromBlock).catch(() => []),
          contract.queryFilter(contract.filters.ArtRevealed(), fromBlock).catch(() => []),
        ]);

        if (destroyed) return;

        const seedEvents: FeedEvent[] = [];

        for (const log of mintLogs) {
          const e = log as ethers.EventLog;
          const block = await provider.getBlock(e.blockNumber).catch(() => null);
          seedEvents.push({
            id: `mint-${e.transactionHash}-${e.index}`,
            type: 'mint',
            tokenId: Number(e.args[0]),
            minter: e.args[1] as string,
            timestamp: block ? block.timestamp * 1000 : Date.now(),
          });
        }
        for (const log of promptLogs) {
          const e = log as ethers.EventLog;
          const block = await provider.getBlock(e.blockNumber).catch(() => null);
          seedEvents.push({
            id: `prompt-${e.transactionHash}-${e.index}`,
            type: 'prompt',
            tokenId: Number(e.args[0]),
            prompt: e.args[1] as string,
            timestamp: block ? block.timestamp * 1000 : Date.now(),
          });
        }
        for (const log of revealLogs) {
          const e = log as ethers.EventLog;
          const block = await provider.getBlock(e.blockNumber).catch(() => null);
          seedEvents.push({
            id: `reveal-${e.transactionHash}-${e.index}`,
            type: 'reveal',
            tokenId: Number(e.args[0]),
            imageURI: e.args[1] as string,
            timestamp: block ? block.timestamp * 1000 : Date.now(),
          });
        }

        seedEvents.sort((a, b) => b.timestamp - a.timestamp);
        if (!destroyed) setEvents(seedEvents.slice(0, 30));
        if (!destroyed) setConnected(true);

        // Poll for new events every 6 seconds (Ritual RPC doesn't support eth_filter)
        let lastBlock = currentBlock;
        const pollInterval = setInterval(async () => {
          if (destroyed) return;
          try {
            const newBlock = await provider.getBlockNumber();
            if (newBlock <= lastBlock) return;
            const from = lastBlock + 1;
            lastBlock = newBlock;

            const [newMints, newPrompts, newReveals] = await Promise.all([
              contract.queryFilter(contract.filters.MintInitiated(), from, newBlock).catch(() => []),
              contract.queryFilter(contract.filters.PromptGenerated(), from, newBlock).catch(() => []),
              contract.queryFilter(contract.filters.ArtRevealed(), from, newBlock).catch(() => []),
            ]);

            for (const log of newMints) {
              const e = log as ethers.EventLog;
              addEvent({ id: `mint-${e.transactionHash}-${e.index}`, type: 'mint', tokenId: Number(e.args[0]), minter: e.args[1] as string, timestamp: Date.now() });
            }
            for (const log of newPrompts) {
              const e = log as ethers.EventLog;
              addEvent({ id: `prompt-${e.transactionHash}-${e.index}`, type: 'prompt', tokenId: Number(e.args[0]), prompt: e.args[1] as string, timestamp: Date.now() });
            }
            for (const log of newReveals) {
              const e = log as ethers.EventLog;
              addEvent({ id: `reveal-${e.transactionHash}-${e.index}`, type: 'reveal', tokenId: Number(e.args[0]), imageURI: e.args[1] as string, timestamp: Date.now() });
            }
          } catch { /* ignore poll errors */ }
        }, 6000);
        // clean up poll on destroy
        const cleanup = () => clearInterval(pollInterval);
        return cleanup;
      } catch {
        if (!destroyed) setConnected(false);
      }
    };

    setup();

    return () => {
      destroyed = true;
    };
  }, []);

  const _addr: string = CONTRACT_ADDRESS;
  const isDeployed = _addr && _addr !== '' && _addr !== '0x0000000000000000000000000000000000000000';

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-24 relative z-10">
      <div className="text-center mb-12">
        <h2 className="text-4xl text-white tracking-widest mb-2">CONSCIOUSNESS FEED</h2>
        <div className="flex items-center justify-center gap-3 mt-2">
          <span className="text-primary/60 font-mono text-xs uppercase tracking-widest">
            {!isDeployed ? 'AWAITING CONTRACT DEPLOYMENT' : connected ? 'LIVE' : 'CONNECTING'}
          </span>
          <span className={`w-1.5 h-1.5 rounded-full ${connected && isDeployed ? 'bg-cyan-400 animate-pulse' : 'bg-primary/30'}`} />
        </div>
      </div>

      {!isDeployed ? (
        <div className="border border-primary/10 border-dashed p-12 flex flex-col items-center gap-4">
          <div className="w-12 h-12 border border-primary/20 rounded-full flex items-center justify-center">
            <div className="w-3 h-3 border border-primary/40 rounded-full" />
          </div>
          <p className="font-mono text-xs text-primary/40 tracking-widest uppercase">Contract not deployed yet</p>
          <p className="font-mono text-[10px] text-primary/25 tracking-wider">Deploy to Ritual Chain to activate the feed</p>
        </div>
      ) : events.length === 0 ? (
        <div className="border border-primary/10 border-dashed p-12 flex flex-col items-center gap-4">
          <div className="w-12 h-12 border border-primary/20 rounded-full flex items-center justify-center">
            <div className="w-3 h-3 bg-primary/30 rounded-full animate-ping" />
          </div>
          <p className="font-mono text-xs text-primary/40 tracking-widest uppercase">No events yet — waiting for first mint</p>
        </div>
      ) : (
        <div className="space-y-2 font-mono">
          <AnimatePresence mode="popLayout">
            {events.map((ev) => {
              const cfg = TYPE_CONFIG[ev.type];
              return (
                <motion.div
                  key={ev.id}
                  layout
                  initial={{ opacity: 0, x: -16, height: 0 }}
                  animate={{ opacity: 1, x: 0, height: 'auto' }}
                  exit={{ opacity: 0, x: 16, height: 0 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className={`border ${cfg.border} ${cfg.bg} px-4 py-3 flex items-start gap-4 overflow-hidden`}
                  data-testid={`feed-event-${ev.id}`}
                >
                  {/* Type badge */}
                  <span className={`shrink-0 text-[10px] tracking-widest ${cfg.color} border ${cfg.border} px-2 py-0.5 mt-0.5`}>
                    {cfg.label}
                  </span>

                  {/* Token ID */}
                  <span className="shrink-0 text-white/70 text-xs mt-0.5 w-12">
                    #{String(ev.tokenId).padStart(3, '0')}
                  </span>

                  {/* Content */}
                  <span className="flex-1 text-xs text-white/50 leading-relaxed min-w-0">
                    {ev.type === 'mint' && ev.minter && (
                      <>
                        <span className="text-white/80">Eye initiating</span>
                        {' — minter '}
                        <span className="text-primary/80">{shortAddr(ev.minter)}</span>
                        {' — LLM precompile dispatched'}
                      </>
                    )}
                    {ev.type === 'prompt' && ev.prompt && (
                      <span className="italic text-white/60 line-clamp-2">&ldquo;{ev.prompt}&rdquo;</span>
                    )}
                    {ev.type === 'reveal' && (
                      <>
                        <span className="text-white/80">Art committed on-chain</span>
                        {' — image precompile complete'}
                      </>
                    )}
                  </span>

                  {/* Timestamp */}
                  <span className="shrink-0 text-[10px] text-white/25 mt-0.5 tabular-nums">
                    {timeAgo(ev.timestamp)}
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
