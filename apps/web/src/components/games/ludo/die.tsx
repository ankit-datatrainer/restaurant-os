'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { springBouncy } from '@/lib/motion';
import type { Color } from './engine';
import { LUDO_DEEP, LUDO_HEX } from './colors';

/** Pip positions on a 3×3 grid (0..8, row-major). */
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [2, 6],
  3: [2, 4, 6],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

/**
 * Tap-to-roll die. While `rolling` it tumbles through random faces (the parent drives `face`);
 * when the roll settles it pops in. Static under reduced motion.
 */
export function LudoDie({
  face,
  color,
  rolling,
  disabled,
  rollKey,
  reduce,
  onRoll,
  label,
}: {
  /** Face to show; null = blank (no roll yet). */
  face: number | null;
  color: Color;
  rolling: boolean;
  disabled: boolean;
  /** Changes on every settled roll to replay the pop. */
  rollKey: number;
  reduce: boolean;
  onRoll: () => void;
  label: string;
}) {
  const pips = face ? (PIPS[face] ?? []) : [];
  return (
    <motion.button
      type="button"
      onClick={onRoll}
      disabled={disabled}
      aria-label={label}
      whileTap={reduce || disabled ? undefined : { scale: 0.92 }}
      className={cn(
        'relative flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-[22px] border-[3px] bg-surface shadow-lift transition-[opacity,box-shadow] duration-300 disabled:cursor-default',
        !disabled && 'shadow-[0_0_0_4px_rgba(255,92,42,0.15),0_18px_36px_-18px_rgba(12,13,16,0.45)]',
      )}
      style={{ borderColor: LUDO_HEX[color] }}
    >
      <motion.span
        key={rolling ? 'rolling' : `settled-${rollKey}`}
        className="grid h-[54px] w-[54px] grid-cols-3 grid-rows-3 gap-[3px] p-[5px]"
        initial={reduce ? false : rolling ? { rotate: 0 } : { scale: 0.6, rotate: -25 }}
        animate={rolling && !reduce ? { rotate: [0, 120, 240, 360], scale: [1, 0.9, 1.05, 1] } : { scale: 1, rotate: 0 }}
        transition={rolling && !reduce ? { duration: 0.45, repeat: Infinity, ease: 'linear' } : springBouncy}
        aria-hidden
      >
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className="flex items-center justify-center">
            {pips.includes(i) && <span className="h-[11px] w-[11px] rounded-full" style={{ background: LUDO_DEEP[color] }} />}
          </span>
        ))}
      </motion.span>
      {!face && (
        <span className="absolute inset-0 flex items-center justify-center font-mono text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: LUDO_DEEP[color] }} aria-hidden>
          Roll
        </span>
      )}
    </motion.button>
  );
}
