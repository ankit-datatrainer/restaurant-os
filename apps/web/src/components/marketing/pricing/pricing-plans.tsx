'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Reveal } from '@/components/ui';
import { cn } from '@/lib/utils';
import { spring } from '@/lib/motion';
import { PlanCard } from '../plan-card';
import { PLANS, PRICE_FOOTNOTE, type Billing } from '../plans';

function BillingToggle({ value, onChange }: { value: Billing; onChange: (b: Billing) => void }) {
  const reduce = useReducedMotion();
  const options: Array<{ id: Billing; label: string; note?: React.ReactNode }> = [
    { id: 'monthly', label: 'Monthly' },
    {
      id: 'yearly',
      label: 'Yearly',
      note: (
        <>
          <span className="hidden sm:inline">Growth · </span>2 months free
        </>
      ),
    },
  ];
  return (
    <div role="radiogroup" aria-label="Billing period" className="inline-flex rounded-full border border-paper/10 bg-ink-2 p-1">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.id)}
            className={cn('relative rounded-full px-5 py-2.5 text-sm font-semibold transition-colors', active ? 'text-ink' : 'text-paper/70 hover:text-paper')}
          >
            {active && <motion.span layoutId="billing-pill" className="absolute inset-0 rounded-full bg-paper" transition={reduce ? { duration: 0 } : spring} aria-hidden />}
            <span className="relative flex items-center gap-2">
              {o.label}
              {o.note && (
                <span className={cn('rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em]', active ? 'bg-ember text-white' : 'bg-ember/20 text-ember')}>
                  {o.note}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function PricingPlans() {
  const [billing, setBilling] = React.useState<Billing>('monthly');
  return (
    <section className="pb-20 md:pb-28">
      <div className="container-x">
        <Reveal className="flex justify-center lg:justify-start">
          <BillingToggle value={billing} onChange={setBilling} />
        </Reveal>
        <ul className="mt-10 grid gap-5 lg:grid-cols-3">
          {PLANS.map((p, i) => (
            <PlanCard key={p.id} plan={p} billing={billing} index={i} />
          ))}
        </ul>
        <Reveal as="p" delay={0.3} className="mt-8 max-w-2xl font-mono text-xs leading-relaxed text-muted">
          {PRICE_FOOTNOTE} The yearly price applies to Growth; annual billing for Starter and Premium is on request. No per-order commission on any plan.
        </Reveal>
      </div>
    </section>
  );
}
