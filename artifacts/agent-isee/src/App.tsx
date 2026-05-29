import React from 'react';
import { HeroCanvas } from '@/components/HeroCanvas';
import { MintPanel } from '@/components/MintPanel';
import { Gallery } from '@/components/Gallery';
import { TokenFeed } from '@/components/TokenFeed';
import { ChainInfo } from '@/components/ChainInfo';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

function App() {
  return (
    <TooltipProvider>
      <div className="min-h-screen bg-[#030305] text-white selection:bg-primary/30 selection:text-primary">
        
        {/* Hero Section */}
        <section className="relative w-full h-screen">
          <HeroCanvas />
        </section>

        {/* Mint Section */}
        <section className="relative w-full py-32 px-4 flex flex-col items-center justify-center bg-gradient-to-b from-[#030305] via-[#0a0a0f] to-[#030305]">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjMDMwMzA1Ij48L3JlY3Q+CjxwYXRoIGQ9Ik0wIDBMNCA0Wk00IDBMMCA0WiIgc3Ryb2tlPSIjM2E2YThhIiBzdHJva2Utb3BhY2l0eT0iMC4wNSIgc3Ryb2tlLXdpZHRoPSIxIj48L3BhdGg+Cjwvc3ZnPg==')] opacity-50 mix-blend-screen pointer-events-none"></div>
          
          <div className="text-center mb-12 relative z-10">
            <h2 className="text-4xl text-white tracking-widest">INITIALIZE SEQUENCE</h2>
            <p className="mt-2 text-primary/60 font-mono text-sm max-w-lg mx-auto">
              Supply 666. Fully on-chain logic. No artist. Only agent. Step into the terminal and extract a vision.
            </p>
          </div>

          <MintPanel />
        </section>

        {/* Gallery Section */}
        <section className="relative w-full bg-[#030305]">
          <Gallery />
        </section>

        {/* Token Feed Section */}
        <section className="relative w-full bg-[#030305] border-t border-primary/10">
          <TokenFeed />
        </section>

        <ChainInfo />
        <Toaster />
      </div>
    </TooltipProvider>
  );
}

export default App;
