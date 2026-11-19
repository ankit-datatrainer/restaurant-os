'use client';

import * as React from 'react';
import { motion, useInView, useReducedMotion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';
import { EASE_OUT } from '@/lib/motion';

/** Fade + rise into view once. Wrap any block. */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 28,
  once = true,
  as = 'div',
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  once?: boolean;
  as?: 'div' | 'section' | 'li' | 'span' | 'p' | 'h1' | 'h2' | 'h3';
} & Omit<HTMLMotionProps<'div'>, 'children'>) {
  const reduce = useReducedMotion();
  const Comp = motion[as] as typeof motion.div;
  return (
    <Comp
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: '-8% 0px -8% 0px' }}
      transition={{ duration: 0.8, delay, ease: EASE_OUT }}
      {...rest}
    >
      {children}
    </Comp>
  );
}

/** Headline that reveals word by word from behind a mask. */
export function SplitWords({
  text,
  className,
  wordClassName,
  delay = 0,
  stagger = 0.045,
  as: Tag = 'h2',
  once = true,
}: {
  text: string;
  className?: string;
  wordClassName?: string;
  delay?: number;
  stagger?: number;
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span';
  once?: boolean;
}) {
  const ref = React.useRef<HTMLElement>(null);
  const inView = useInView(ref as React.RefObject<Element>, { once, margin: '-10% 0px' });
  const reduce = useReducedMotion();
  const words = text.split(' ');
  return (
    <Tag ref={ref as React.RefObject<HTMLHeadingElement>} className={cn('flex flex-wrap', className)} aria-label={text}>
      {words.map((w, i) => (
        <span key={i} className="inline-block overflow-hidden pb-[0.08em] pr-[0.25em]" aria-hidden>
          <motion.span
            className={cn('inline-block will-change-transform', wordClassName)}
            initial={reduce ? false : { y: '110%', rotate: 2 }}
            animate={inView ? { y: 0, rotate: 0 } : undefined}
            transition={{ duration: 0.9, delay: delay + i * stagger, ease: EASE_OUT }}
          >
            {w}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}

/**
 * Counts up to `value` when scrolled into view. Later changes animate from the number currently
 * shown (a live KPI must never drop to 0 and re-count on every update).
 */
export function CountUp({ value, duration = 1.6, prefix = '', suffix = '', className, decimals = 0 }: { value: number; duration?: number; prefix?: string; suffix?: string; className?: string; decimals?: number }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px' });
  const [n, setN] = React.useState(0);
  const shown = React.useRef(0);
  const reduce = useReducedMotion();
  React.useEffect(() => {
    if (!inView) return;
    const from = shown.current;
    if (reduce || from === value) {
      shown.current = value;
      setN(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / (duration * 1000));
      const eased = 1 - Math.pow(1 - p, 4);
      shown.current = from + (value - from) * eased;
      setN(shown.current);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration, reduce]);
  return (
    <span ref={ref} className={cn('tnum', className)}>
      {prefix}
      {n.toLocaleString('en-IN', { maximumFractionDigits: decimals, minimumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}
