'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { EASE_OUT } from '@/lib/motion';
import type { Player } from './engine';

export const MARK_COLOR: Record<Player, string> = {
  X: '#FF5C2A', // ember
  O: '#F2B33D', // saffron
};

/**
 * X and O drawn with an SVG stroke animation (pathLength 0 → 1).
 * `ghost` renders a faint preview for hover states.
 */
export function Mark({ player, ghost = false, className }: { player: Player; ghost?: boolean; className?: string }) {
  const reduce = useReducedMotion();
  const base = reduce ? { duration: 0 } : { duration: 0.32, ease: EASE_OUT };
  const stroke = MARK_COLOR[player];
  const common = {
    stroke,
    strokeWidth: 11,
    strokeLinecap: 'round' as const,
    fill: 'none',
    opacity: ghost ? 0.18 : 1,
  };

  if (player === 'X') {
    return (
      <svg viewBox="0 0 100 100" className={className} aria-hidden>
        <motion.line x1="24" y1="24" x2="76" y2="76" {...common} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={base} />
        <motion.line
          x1="76"
          y1="24"
          x2="24"
          y2="76"
          {...common}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ ...base, delay: reduce ? 0 : 0.16 }}
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <motion.circle
        cx="50"
        cy="50"
        r="28"
        transform="rotate(-90 50 50)"
        {...common}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ ...base, duration: reduce ? 0 : 0.42 }}
      />
    </svg>
  );
}
