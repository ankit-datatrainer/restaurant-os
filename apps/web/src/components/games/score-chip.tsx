'use client';

import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { springBouncy } from '@/lib/motion';

type Tone = 'neutral' | 'ember' | 'saffron' | 'mint' | 'sky' | 'ink';

const toneClass: Record<Tone, string> = {
  neutral: 'bg-surface text-fg hairline',
  ember: 'bg-ember-soft text-ember-3',
  saffron: 'bg-saffron-soft text-[#8a5a00]',
  mint: 'bg-mint-soft text-[#1b6f49]',
  sky: 'bg-sky-soft text-[#1f5aa8]',
  ink: 'bg-ink text-paper',
};

/**
 * A stat block: tiny mono label on top, big number below.
 * The value pops (scale) whenever it changes.
 */
export function StatChip({
  label,
  value,
  tone = 'neutral',
  className,
  active = false,
}: {
  label: string;
  value: React.ReactNode;
  tone?: Tone;
  className?: string;
  /** Draws an ember ring: "whose turn / which is current". */
  active?: boolean;
}) {
  const reduce = useReducedMotion();
  const key = typeof value === 'string' || typeof value === 'number' ? String(value) : 'node';
  return (
    <div
      className={cn(
        'relative flex min-w-0 flex-col items-center justify-center rounded-2xl px-3 py-2.5 text-center transition-shadow duration-300',
        toneClass[tone],
        active && 'shadow-ring',
        className,
      )}
    >
      <span className="font-mono text-2xs uppercase tracking-[0.14em] opacity-70">{label}</span>
      <span className="relative mt-0.5 block h-7 overflow-hidden font-display text-[22px] font-bold leading-7 tnum">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={key}
            initial={reduce ? false : { y: 14, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={reduce ? undefined : { y: -14, opacity: 0, scale: 0.9 }}
            transition={springBouncy}
            className="block"
          >
            {value}
          </motion.span>
        </AnimatePresence>
      </span>
    </div>
  );
}

/** Inline pill used on the hub cards and result rows: "Best 214 ms". */
export function ScorePill({ children, tone = 'neutral', className }: { children: React.ReactNode; tone?: Tone; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-2xs font-medium uppercase tracking-[0.12em] tnum',
        toneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Polite live region for round results and winners. Visually styled, read by screen readers. */
export function LiveLine({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p aria-live="polite" aria-atomic="true" className={cn('min-h-[1.5rem] text-center text-[15px] font-medium text-fg/80', className)}>
      {children}
    </p>
  );
}
