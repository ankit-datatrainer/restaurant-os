'use client';

import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE_OUT } from '@/lib/motion';

/**
 * − qty + control. Each half is at least 36×44px; the number flips on change.
 */
export function Stepper({
  value,
  onIncrement,
  onDecrement,
  label,
  className,
  tone = 'ember',
  max = 50,
}: {
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
  label: string;
  className?: string;
  tone?: 'ember' | 'dark';
  max?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'inline-flex h-11 select-none items-stretch overflow-hidden rounded-xl text-white',
        tone === 'ember' ? 'bg-ember shadow-[0_10px_24px_-12px_rgba(255,92,42,0.9)]' : 'bg-ink',
        className,
      )}
    >
      <button
        type="button"
        onClick={onDecrement}
        className="flex w-9 items-center justify-center transition-colors hover:bg-white/15 active:bg-white/25"
        aria-label={value === 1 ? `Remove ${label}` : `One less ${label}`}
      >
        <Minus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
      </button>
      <span className="relative flex w-8 items-center justify-center font-mono text-sm font-semibold tnum" aria-live="polite">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={value}
            initial={reduce ? false : { y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduce ? undefined : { y: -10, opacity: 0 }}
            transition={{ duration: 0.18, ease: EASE_OUT }}
          >
            {value}
          </motion.span>
        </AnimatePresence>
      </span>
      <button
        type="button"
        onClick={onIncrement}
        disabled={value >= max}
        className="flex w-9 items-center justify-center transition-colors hover:bg-white/15 active:bg-white/25 disabled:opacity-50"
        aria-label={`One more ${label}`}
      >
        <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
      </button>
    </div>
  );
}
