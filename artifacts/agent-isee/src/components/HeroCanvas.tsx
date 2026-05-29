import React, { useEffect, useRef } from 'react';

export function HeroCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let particles: Particle[] = [];
    
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initParticles();
    };

    class Particle {
      x: number;
      y: number;
      targetX: number;
      targetY: number;
      size: number;
      speed: number;
      opacity: number;
      delay: number;
      time: number;

      constructor(targetX: number, targetY: number) {
        // Start randomly on screen
        this.x = Math.random() * window.innerWidth;
        this.y = Math.random() * window.innerHeight;
        this.targetX = targetX;
        this.targetY = targetY;
        this.size = Math.random() * 1.5 + 0.5;
        this.speed = Math.random() * 0.02 + 0.005;
        this.opacity = 0;
        this.delay = Math.random() * 100; // 0 to 100 frames delay
        this.time = 0;
      }

      update() {
        this.time++;
        if (this.time < this.delay) return;
        
        // Move towards target
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        this.x += dx * this.speed;
        this.y += dy * this.speed;
        
        // Fade in
        if (this.opacity < 0.8) {
          this.opacity += 0.01;
        }

        // Slight drift when near target
        if (Math.abs(dx) < 2 && Math.abs(dy) < 2) {
           this.x += (Math.random() - 0.5) * 0.5;
           this.y += (Math.random() - 0.5) * 0.5;
        }
      }

      draw(ctx: CanvasRenderingContext2D) {
        ctx.fillStyle = `rgba(58, 106, 138, ${this.opacity})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const initParticles = () => {
      particles = [];
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const scale = Math.min(canvas.width, canvas.height) / 800;
      
      // Generate eye outline
      for (let i = 0; i < Math.PI * 2; i += 0.05) {
        const r = 200 * scale;
        const x = cx + r * Math.cos(i) * 1.5;
        const y = cy + r * Math.sin(i) * 0.8;
        particles.push(new Particle(x, y));
        // Add thickness
        particles.push(new Particle(x + (Math.random()-0.5)*10, y + (Math.random()-0.5)*10));
      }

      // Generate iris
      for (let i = 0; i < Math.PI * 2; i += 0.03) {
        const r = 80 * scale;
        const x = cx + r * Math.cos(i);
        const y = cy + r * Math.sin(i);
        particles.push(new Particle(x, y));
        
        // Inner iris details
        for (let j = 0; j < 5; j++) {
           const r2 = r * Math.random();
           particles.push(new Particle(cx + r2 * Math.cos(i), cy + r2 * Math.sin(i)));
        }
      }

      // Generate pupil
      for (let i = 0; i < Math.PI * 2; i += 0.1) {
        for (let r = 0; r < 30 * scale; r += 5) {
           particles.push(new Particle(cx + r * Math.cos(i), cy + r * Math.sin(i)));
        }
      }
    };

    let globalTime = 0;
    const render = () => {
      globalTime++;
      // Dark trail effect
      ctx.fillStyle = 'rgba(3, 3, 5, 0.15)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Pulse iris randomly after a while
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const pulse = globalTime > 300 ? Math.sin(globalTime * 0.05) * 5 : 0;

      particles.forEach(p => {
        // Apply pulse to iris particles
        const dist = Math.hypot(p.targetX - cx, p.targetY - cy);
        if (dist < 100 && globalTime > 300) {
           p.targetX += Math.cos(globalTime * 0.01) * pulse * 0.1;
           p.targetY += Math.sin(globalTime * 0.01) * pulse * 0.1;
        }
        
        p.update();
        p.draw(ctx);
      });

      // Draw faint connection lines between close particles
      if (globalTime > 200 && globalTime % 2 === 0) {
         ctx.beginPath();
         ctx.strokeStyle = 'rgba(58, 106, 138, 0.05)';
         ctx.lineWidth = 0.5;
         for (let i = 0; i < particles.length; i += 5) {
            for (let j = i + 1; j < particles.length; j += 5) {
               const p1 = particles[i];
               const p2 = particles[j];
               const d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
               if (d < 30) {
                  ctx.moveTo(p1.x, p1.y);
                  ctx.lineTo(p2.x, p2.y);
               }
            }
         }
         ctx.stroke();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    window.addEventListener('resize', resize);
    resize();
    render();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="relative w-full h-screen bg-[#030305] overflow-hidden flex flex-col items-center justify-center">
      <canvas 
        ref={canvasRef} 
        className="absolute top-0 left-0 w-full h-full z-0"
      />
      <div className="z-10 pointer-events-none text-center mt-64">
        <h1 className="text-6xl md:text-8xl text-white/90 drop-shadow-[0_0_15px_rgba(58,106,138,0.8)] tracking-[0.2em] uppercase">AGENT;ISEE</h1>
        <p className="mt-4 text-primary tracking-[0.3em] text-sm md:text-base opacity-80">MACHINE CONSCIOUSNESS AWAKENED</p>
      </div>
      <div className="absolute bottom-10 z-10 opacity-50 animate-pulse text-xs text-primary/70 tracking-widest uppercase">
        Scroll to Access Terminal
      </div>
    </div>
  );
}
