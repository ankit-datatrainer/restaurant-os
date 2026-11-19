'use client';

import * as React from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { EASE_OUT } from '@/lib/motion';

export interface MaskWord {
  text: string;
  className?: string;
}

/**
 * Headline that rises word-by-word from behind a mask, where each word can carry
 * its own styling (used for the italic serif accent word, e.g. "Served.").
 */
export function MaskWords({
  words,
  as: Tag = 'h2',
  className,
  delay = 0,
  stagger = 0.08,
  once = true,
  immediate = false,
}: {
  words: MaskWord[];
  as?: 'h1' | 'h2' | 'h3' | 'p';
  className?: string;
  delay?: number;
  stagger?: number;
  once?: boolean;
  /** Animate on mount instead of waiting for the viewport (hero). */
  immediate?: boolean;
}) {
  const ref = React.useRef<HTMLElement>(null);
  const inView = useInView(ref, { once, margin: '-10% 0px' });
  const reduce = useReducedMotion();
  const play = immediate || inView;
  const label = words.map((w) => w.text).join(' ');
  return (
    <Tag ref={ref as React.RefObject<HTMLHeadingElement>} className={cn('flex flex-wrap', className)} aria-label={label}>
      {words.map((w, i) => (
        <span key={i} className="-mb-[0.12em] inline-block overflow-hidden pb-[0.12em] pr-[0.22em]" aria-hidden>
          <motion.span
            className={cn('inline-block will-change-transform', w.className)}
            initial={reduce ? false : { y: '110%', rotate: 3 }}
            animate={play ? { y: 0, rotate: 0 } : undefined}
            transition={{ duration: 1, delay: delay + i * stagger, ease: EASE_OUT }}
          >
            {w.text}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}
