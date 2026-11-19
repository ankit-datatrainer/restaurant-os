'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { spring } from '@/lib/motion';

export interface FlipCardProps {
  emoji: string;
  label: string;
  index: number;
  flipped: boolean;
  matched: boolean;
  disabled: boolean;
  onFlip: () => void;
}

const faceStyle: React.CSSProperties = { backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' };

/** A 3D card: ink back with an ember dot, white face with a big food emoji. */
export function FlipCard({ emoji, label, index, flipped, matched, disabled, onFlip }: FlipCardProps) {
  const reduce = useReducedMotion();
  const up = flipped || matched;
  const canTap = !disabled && !up;

  return (
    <motion.button
      type="button"
      onClick={onFlip}
      disabled={!canTap}
      aria-label={up ? `Card ${index + 1}: ${label}${matched ? ', matched' : ''}` : `Card ${index + 1}, face down`}
      aria-pressed={up}
      whileTap={canTap && !reduce ? { scale: 0.94 } : undefined}
      animate={matched && !reduce ? { scale: [1, 1.07, 1] } : { scale: 1 }}
      transition={matched ? { duration: 0.45, ease: 'easeOut' } : spring}
      className="relative aspect-[4/5] w-full select-none rounded-2xl disabled:cursor-default"
      style={{ perspective: 900 }}
    >
      <motion.div
        className="relative h-full w-full"
        style={{ transformStyle: 'preserve-3d' }}
        animate={{ rotateY: up ? 180 : 0 }}
        transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 240, damping: 24 }}
      >
        {/* Back */}
        <div
          className={cn(
            'absolute inset-0 flex items-center justify-center overflow-hidden rounded-2xl bg-ink shadow-soft',
            canTap && 'transition-shadow duration-300 hover:shadow-lift',
          )}
          style={faceStyle}
        >
          <span className="absolute inset-0 opacity-[0.14] [background-image:radial-gradient(rgb(247_244_238)_1px,transparent_1px)] [background-size:10px_10px]" aria-hidden />
          <span className="relative h-5 w-5 rounded-full bg-ember shadow-[0_0_0_4px_rgba(255,92,42,0.25)]" aria-hidden />
          <span className="absolute bottom-2 left-0 right-0 h-[3px] mx-3 rounded-full bg-saffron/80" aria-hidden />
        </div>
        {/* Face */}
        <div
          className={cn(
            'absolute inset-0 flex items-center justify-center rounded-2xl border bg-surface shadow-soft',
            matched ? 'border-mint/60 bg-mint-soft' : 'border-line/10',
          )}
          style={{ ...faceStyle, transform: 'rotateY(180deg)' }}
        >
          <span className="text-[clamp(1.9rem,9vw,2.75rem)] leading-none" role="img" aria-hidden>
            {emoji}
          </span>
        </div>
      </motion.div>
    </motion.button>
  );
}
