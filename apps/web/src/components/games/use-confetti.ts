'use client';

import * as React from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * Lightweight canvas confetti. The hook owns a fixed, pointer-transparent canvas
 * that it appends to <body> on mount and removes on unmount — no assets, no deps.
 * Respects prefers-reduced-motion (fires nothing).
 */

const COLORS = ['#FF5C2A', '#F2B33D', '#2FB87A', '#3B7DD8', '#E5484D', '#0C0D10', '#FFFFFF'];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  vr: number;
  color: string;
  life: number;
  ttl: number;
  round: boolean;
}

export interface ConfettiOptions {
  /** Origin as a fraction of the viewport (0–1). Defaults to centre, slightly above the middle. */
  x?: number;
  y?: number;
  count?: number;
  /** Spread angle in radians (centred straight up). */
  spread?: number;
  /** Initial speed multiplier. */
  power?: number;
}

export type FireConfetti = (opts?: ConfettiOptions) => void;

export function useConfetti(): FireConfetti {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const particles = React.useRef<Particle[]>([]);
  const raf = React.useRef(0);
  const dpr = React.useRef(1);
  const reduce = useReducedMotion();
  const reduceRef = React.useRef<boolean>(false);

  React.useEffect(() => {
    reduceRef.current = Boolean(reduce);
  }, [reduce]);

  React.useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, {
      position: 'fixed',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: '60',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(canvas);
    canvasRef.current = canvas;
    return () => {
      cancelAnimationFrame(raf.current);
      raf.current = 0;
      particles.current = [];
      canvas.remove();
      canvasRef.current = null;
    };
  }, []);

  const loop = React.useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) {
      raf.current = 0;
      return;
    }
    const w = canvas.width / dpr.current;
    const h = canvas.height / dpr.current;
    ctx.setTransform(dpr.current, 0, 0, dpr.current, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const alive: Particle[] = [];
    for (const p of particles.current) {
      p.vy += 0.32;
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life += 1;
      if (p.life >= p.ttl || p.y > h + 40) continue;
      alive.push(p);
      const fade = Math.min(1, (p.ttl - p.life) / 28);
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.round) {
        ctx.beginPath();
        ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Fake a 3D tumble by squashing the width with a cosine.
        const squash = Math.abs(Math.cos(p.life / 9 + p.rot));
        ctx.fillRect((-p.w * squash) / 2, -p.h / 2, p.w * squash, p.h);
      }
      ctx.restore();
    }
    particles.current = alive;
    if (alive.length > 0) {
      raf.current = requestAnimationFrame(loop);
    } else {
      ctx.clearRect(0, 0, w, h);
      raf.current = 0;
    }
  }, []);

  return React.useCallback<FireConfetti>(
    (opts = {}) => {
      const canvas = canvasRef.current;
      if (!canvas || reduceRef.current) return;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      dpr.current = ratio;
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.floor(w * ratio);
      canvas.height = Math.floor(h * ratio);

      const ox = (opts.x ?? 0.5) * w;
      const oy = (opts.y ?? 0.42) * h;
      const count = opts.count ?? 150;
      const spread = opts.spread ?? Math.PI * 0.85;
      const power = opts.power ?? 13;

      for (let i = 0; i < count; i++) {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * spread;
        const speed = power * (0.45 + Math.random() * 0.75);
        const size = 6 + Math.random() * 7;
        particles.current.push({
          x: ox + (Math.random() - 0.5) * 24,
          y: oy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          w: size,
          h: size * (0.45 + Math.random() * 0.5),
          rot: Math.random() * Math.PI * 2,
          vr: (Math.random() - 0.5) * 0.3,
          color: COLORS[Math.floor(Math.random() * COLORS.length)] ?? '#FF5C2A',
          life: 0,
          ttl: 110 + Math.random() * 70,
          round: Math.random() < 0.25,
        });
      }
      if (!raf.current) raf.current = requestAnimationFrame(loop);
    },
    [loop],
  );
}
