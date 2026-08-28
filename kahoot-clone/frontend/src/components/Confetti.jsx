import React, { useEffect, useRef } from 'react';

const COLORS = ['#e21b3c', '#1368ce', '#ffcc00', '#26890c', '#2eb8a6', '#8e44ad', '#ffffff'];

// Full-screen confetti burst on a canvas. Mount it to fire; it stops itself
// after `duration` ms so an idle screen never keeps animating.
export default function Confetti({ count = 160, duration = 4500, spread = 'top' }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return undefined;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const onResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);

    const pieces = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: spread === 'burst' ? height * 0.45 + (Math.random() - 0.5) * 120 : -Math.random() * height * 0.6,
      w: 6 + Math.random() * 8,
      h: 10 + Math.random() * 12,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      vx: (Math.random() - 0.5) * (spread === 'burst' ? 9 : 2.4),
      vy: spread === 'burst' ? -6 - Math.random() * 7 : 2 + Math.random() * 4,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.35,
    }));

    let raf;
    const startedAt = performance.now();

    const frame = (now) => {
      const elapsed = now - startedAt;
      ctx.clearRect(0, 0, width, height);

      // Fade the burst out over its final second.
      const fade = Math.min(1, Math.max(0, (duration - elapsed) / 1000));
      ctx.globalAlpha = fade;

      pieces.forEach(p => {
        p.vy += 0.14;              // gravity
        p.vx *= 0.995;             // drag
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;

        if (p.y > height + 40 && elapsed < duration - 1200) {
          // Recycle from the top so the fall keeps going.
          p.y = -30;
          p.x = Math.random() * width;
          p.vy = 2 + Math.random() * 4;
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });

      if (elapsed < duration) {
        raf = requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, width, height);
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [count, duration, spread]);

  return <canvas ref={canvasRef} className="confetti-canvas" aria-hidden="true" />;
}
