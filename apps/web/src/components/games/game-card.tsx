'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fadeUp, spring } from '@/lib/motion';
import { ScorePill } from './score-chip';

export interface GameCardProps {
  href: string;
  name: string;
  pitch: string;
  icon: React.ReactNode;
  /** e.g. "Best 214 ms" — null until localStorage has been read, or when nothing is stored. */
  best: string | null;
  /** Tile gradient. */
  tone: 'ember' | 'saffron' | 'mint' | 'sky';
  index: number;
}

const tiles: Record<GameCardProps['tone'], string> = {
  ember: 'from-ember to-[#ff8a5c] text-white shadow-[0_12px_28px_-14px_rgba(255,92,42,0.8)]',
  saffron: 'from-saffron to-[#ffd37a] text-ink shadow-[0_12px_28px_-14px_rgba(242,179,61,0.8)]',
  mint: 'from-mint to-[#6fd9a6] text-white shadow-[0_12px_28px_-14px_rgba(47,184,122,0.8)]',
  sky: 'from-sky to-[#7fb0f0] text-white shadow-[0_12px_28px_-14px_rgba(59,125,216,0.8)]',
};

export function GameCard({ href, name, pitch, icon, best, tone, index }: GameCardProps) {
  const reduce = useReducedMotion();
  return (
    <motion.li variants={fadeUp} custom={index} className="list-none">
      <motion.div whileTap={reduce ? undefined : { scale: 0.975 }} whileHover={reduce ? undefined : { y: -2 }} transition={spring}>
        <Link
          href={href}
          className="group flex items-center gap-4 rounded-3xl border border-line/10 bg-surface p-4 shadow-soft transition-shadow duration-300 hover:shadow-lift focus-visible:shadow-ring"
        >
          <span
            className={cn(
              'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br transition-transform duration-500 ease-out group-hover:rotate-[-6deg] group-hover:scale-105',
              tiles[tone],
            )}
            aria-hidden
          >
            {icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[17px] font-bold leading-tight tracking-tight">{name}</span>
            <span className="mt-0.5 block text-[13px] leading-snug text-muted">{pitch}</span>
            <span className="mt-2 block">
              {best ? (
                <ScorePill tone="saffron">{best}</ScorePill>
              ) : (
                <ScorePill className="text-muted">No score yet</ScorePill>
              )}
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </motion.div>
    </motion.li>
  );
}
