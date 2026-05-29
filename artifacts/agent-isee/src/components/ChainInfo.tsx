import React from 'react';
import { useBlockchain, CONTRACT_ADDRESS, RPC_URL } from '@/hooks/use-blockchain';

export function ChainInfo() {
  const { blockNumber } = useBlockchain();

  return (
    <div className="fixed bottom-0 left-0 right-0 border-t border-primary/20 bg-black/80 backdrop-blur-sm z-50 p-2 flex justify-between items-center text-[10px] font-mono text-primary/60 uppercase px-4 scan-line">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse inline-block"></span>
          <span>Ritual Chain</span>
        </div>
        <span className="hidden sm:inline">BLK: {blockNumber || "..."}</span>
      </div>
      
      <div className="flex items-center gap-4">
        <a href={`https://explorer.ritual.net/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer" className="hover:text-primary transition-colors">
          CONTRACT
        </a>
        <a href="https://faucet.ritual.net" target="_blank" rel="noreferrer" className="hover:text-primary transition-colors hidden sm:inline">
          FAUCET
        </a>
      </div>
    </div>
  );
}
