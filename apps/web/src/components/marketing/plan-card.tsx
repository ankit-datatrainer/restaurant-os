'use client';

import * as React from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { ArrowUpRight, Check, Clock } from 'lucide-react';
import { Button, Reveal } from '@/components/ui';
import { cn, formatINR } from '@/lib/utils';
import { PRICE_NOTE, type Billing, type Plan } from './plans';

/** Rupee figure that tweens between values when billing changes. */
function AnimatedPrice({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => formatINR(Math.round(v)));
  React.useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    const c = animate(mv, value, { duration: 0.6, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [value, mv, reduce]);
  return <motion.span className="tnum">{text}</motion.span>;
}

/** Small saffron tag for anything not built yet. */
export function RollingOutTag({ className, label = 'Rolling out' }: { className?: string; label?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-saffron/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-saffron',
        className,
      )}
    >
      <Clock className="h-2.5 w-2.5" aria-hidden />
      {label}
    </span>
  );
}

export function planPrice(plan: Plan, billing: Billing): { value: number; unit: string; note: string } {
  if (billing === 'yearly' && plan.yearly !== null) {
    return { value: plan.yearly, unit: '/ year', note: 'About two months free vs monthly' };
  }
  return {
    value: plan.monthly,
    unit: '/ month',
    note: billing === 'yearly' ? 'Billed monthly · annual on request' : 'Per outlet, billed monthly',
  };
}

export function PlanCard({ plan, billing, index = 0 }: { plan: Plan; billing: Billing; index?: number }) {
  const price = planPrice(plan, billing);
  return (
    <Reveal as="li" delay={0.08 * index} className="min-w-0">
      <article
        className={cn(
          'relative flex h-full flex-col rounded-3xl border p-7 transition-[border-color,box-shadow] duration-500 md:p-8',
          plan.highlight ? 'border-ember/60 bg-ink-2 shadow-glow' : 'border-paper/10 bg-ink-2/60 hover:border-paper/20',
        )}
      >
        {plan.badge && (
          <span className="absolute -top-3 left-7 rounded-full bg-ember px-3 py-1 font-mono text-2xs uppercase tracking-[0.16em] text-white">{plan.badge}</span>
        )}
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-display text-2xl font-bold">{plan.name}</h3>
          <span className="font-mono text-2xs uppercase tracking-[0.16em] text-muted">Per outlet</span>
        </div>
        <p className="mt-2 min-h-[2.5rem] text-sm text-muted">{plan.idealFor}</p>

        <div className="mt-6 flex flex-wrap items-end gap-x-2 gap-y-1">
          <span className="font-display text-display-md font-bold leading-none">
            <AnimatedPrice value={price.value} />
          </span>
          <span className="pb-1 text-sm text-muted">{price.unit}</span>
        </div>
        <p className="mt-2 font-mono text-xs text-fg/80">
          + {formatINR(plan.setup)} one-time setup · {PRICE_NOTE}
        </p>
        <p className="mt-1 h-5 font-mono text-xs text-muted" aria-live="polite">
          {price.note}
        </p>

        {plan.inherits && <p className="mt-6 text-xs font-semibold uppercase tracking-[0.12em] text-fg/60">{plan.inherits}</p>}
        <ul className={cn('grid gap-3 text-sm', plan.inherits ? 'mt-3' : 'mt-6')}>
          {plan.bullets.map((b) => (
            <li key={b.text} className="flex items-start gap-3">
              {b.rollingOut ? (
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-saffron/40" aria-hidden>
                  <span className="h-1.5 w-1.5 rounded-full bg-saffron" />
                </span>
              ) : (
                <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full', plan.highlight ? 'bg-ember text-white' : 'bg-paper/10 text-fg')}>
                  <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                </span>
              )}
              <span className={cn('flex flex-wrap items-center gap-x-2 gap-y-1', b.rollingOut ? 'text-fg/60' : 'text-fg/85')}>
                {b.text}
                {b.rollingOut && <RollingOutTag />}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-auto pt-8">
          <Button href={plan.cta.href} variant={plan.highlight ? 'primary' : 'outline'} size="lg" className="w-full" rightIcon={<ArrowUpRight className="h-4 w-4" aria-hidden />}>
            {plan.cta.label}
          </Button>
        </div>
      </article>
    </Reveal>
  );
}
