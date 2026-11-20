'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE_OUT } from '@/lib/motion';
import { Logo } from '@/components/ui';
import { SignupIncludedCompact, SignupSidePanel } from './side-panel';

const STEPS = ['Your account', 'Your restaurant'] as const;

export function StepIndicator({ step }: { step: 1 | 2 }) {
  return (
    <ol className="mt-6 flex items-center gap-2" aria-label={`Step ${step} of 2`}>
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const current = n === step;
        return (
          <li key={label} className="flex min-w-0 items-center gap-2" aria-current={current ? 'step' : undefined}>
            {i > 0 && <span className={cn('h-px w-5 shrink-0 sm:w-8', done || current ? 'bg-ember' : 'bg-line/20')} aria-hidden />}
            <span
              className={cn(
                'grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-[11px] font-semibold tnum transition-colors',
                done ? 'bg-mint text-white' : current ? 'bg-ember text-white' : 'bg-sunk text-muted',
              )}
              aria-hidden
            >
              {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : n}
            </span>
            <span className={cn('truncate text-[13px] font-semibold', current ? 'text-fg' : 'text-muted')}>
              <span className="sr-only">{done ? 'Done: ' : current ? 'Current: ' : ''}</span>
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Split layout shared by /signup and /admin/setup, matching the staff login screen. */
export function SignupFrame({
  eyebrow,
  title,
  intro,
  step,
  children,
  footer,
}: {
  eyebrow: string;
  title: React.ReactNode;
  intro?: React.ReactNode;
  step?: 1 | 2;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gutter py-8 sm:py-12">
        <Logo href="/" />
        <motion.div
          className="my-auto w-full max-w-md py-10"
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE_OUT }}
        >
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-3 font-display text-display-sm font-semibold">{title}</h1>
          {intro && <p className="mt-3 text-[15px] text-muted">{intro}</p>}
          {step && <StepIndicator step={step} />}
          {children}
          {footer}
          <SignupIncludedCompact />
        </motion.div>
      </div>
      <SignupSidePanel />
    </div>
  );
}
