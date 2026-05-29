import React from 'react';
import { useBlockchain } from '@/hooks/use-blockchain';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

export function Gallery() {
  const { totalSupply } = useBlockchain();
  
  // For demo purposes, we will mock the gallery data based on totalSupply
  // In a real app, we would fetch tokens owned by user or all tokens
  const items = Array.from({ length: Math.max(8, totalSupply) }).map((_, i) => ({
    id: i + 1,
    revealed: i < totalSupply - 1, // mock last minted as unrevealed
    prompt: "An eye composed of raw data streams, gazing from the void. Cold blue hues, terminal aesthetic.",
    image: `https://picsum.photos/seed/${i}/400/400` // Mock image
  }));

  if (items.length === 0) {
    return (
      <div className="w-full py-24 flex flex-col items-center justify-center border border-primary/10 border-dashed scan-line">
        <div className="w-16 h-16 border border-primary/30 rounded-full flex items-center justify-center mb-4">
          <div className="w-4 h-4 bg-primary/30 rounded-full animate-ping"></div>
        </div>
        <p className="text-primary/50 font-mono text-sm tracking-widest uppercase">WAITING FOR MINT</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-24 relative z-10">
      <div className="text-center mb-16">
        <h2 className="text-4xl text-white tracking-widest mb-2">THE VISION LOG</h2>
        <p className="text-primary/60 font-mono text-xs uppercase">RECORDED EXECUTIONS</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {items.map((item, index) => (
          <motion.div 
            key={item.id}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: index % 4 * 0.1 }}
            viewport={{ once: true }}
            className="group relative aspect-square bg-card border border-primary/20 overflow-hidden scan-line flex flex-col"
          >
            {item.revealed ? (
              <>
                <img src={item.image} alt={`Eye ${item.id}`} className="w-full h-full object-cover filter grayscale sepia opacity-80 group-hover:opacity-100 group-hover:grayscale-0 transition-all duration-500" />
                <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity duration-300 p-4 flex flex-col justify-end">
                  <p className="text-xs text-primary font-mono italic">"{item.prompt}"</p>
                </div>
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-black/50">
                <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
                <span className="text-primary/70 font-mono text-xs tracking-widest">ASSEMBLING...</span>
              </div>
            )}
            
            <div className="absolute top-2 left-2 px-2 py-1 bg-black/80 border border-primary/30 text-[10px] font-mono text-primary z-20">
              #{item.id.toString().padStart(3, '0')}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
