'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Lock } from 'lucide-react';
import type { PlanFeature, PlanId, StaffRole } from '@restaurant-os/shared';
import { PLAN_INFO, planHas } from '@restaurant-os/shared';
import { ApiRequestError } from '@/lib/api';
import { cn, formatINR } from '@/lib/utils';
import { Button } from '@/components/ui';
import { useAdmin } from './admin-provider';

/** The API answers 403 with an upgrade message when the plan does not include a feature. */
export function isPlanError(e: unknown): e is ApiRequestError {
  return e instanceof ApiRequestError && e.status === 403;
}

export function planName(plan: PlanId | null | undefined): string {
  return PLAN_INFO[plan ?? 'starter'].name;
}

/** The plan an upgrade card or lock points at: Growth or Premium. */
export type UpgradePlan = 'growth' | 'premium';

/** The cheapest plan that includes a feature. */
export function planFor(feature: PlanFeature): UpgradePlan {
  return planHas('growth', feature) ? 'growth' : 'premium';
}

/** Owners and managers run the business settings; kitchen and waiter staff do not. */
export function isManagerRole(role: StaffRole | null | undefined): boolean {
  return role === 'owner' || role === 'manager';
}

/** Small "In Growth" / "In Premium" tag for controls that are locked on the current plan. */
export function InPlanTag({ plan = 'growth', className }: { plan?: UpgradePlan; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full bg-ember-soft px-2 py-0.5 font-mono text-2xs font-medium uppercase tracking-[0.12em] text-ember-3',
        className,
      )}
    >
      <Lock className="h-3 w-3" aria-hidden />
      In {PLAN_INFO[plan].name}
    </span>
  );
}

/**
 * Lock shown next to a nav item the plan does not include. Premium-only pages also say
 * "Premium" so it is clear which plan unlocks them; Growth pages keep the plain lock.
 */
export function NavLock({ feature, className }: { feature: PlanFeature; className?: string }) {
  const plan = planFor(feature);
  const label = `In ${PLAN_INFO[plan].name}, not in your plan`;
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1', className)} title={label}>
      {plan === 'premium' && (
        <span className="font-mono text-[9px] font-medium uppercase tracking-[0.14em]" aria-hidden>
          {PLAN_INFO.premium.name}
        </span>
      )}
      <Lock className="h-3.5 w-3.5" aria-label={label} />
    </span>
  );
}

/** Small "In Growth" tag for controls that are locked on Starter. */
export function InGrowthTag({ className }: { className?: string }) {
  return <InPlanTag plan="growth" className={className} />;
}

/** Small "In Premium" tag for Premium-only controls. */
export function InPremiumTag({ className }: { className?: string }) {
  return <InPlanTag plan="premium" className={className} />;
}

/** "Growth plan" chip for the dark sidebar; links to Plan & billing. */
export function PlanChip({ plan, className }: { plan: PlanId | null | undefined; className?: string }) {
  const id = plan ?? 'starter';
  return (
    <Link
      href="/admin/subscription"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-paper/15 px-2.5 py-1 font-mono text-2xs uppercase tracking-[0.14em] text-paper/75 transition hover:border-paper/30 hover:text-paper',
        className,
      )}
      title="See your plan and what it includes"
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', id === 'starter' ? 'bg-paper/50' : 'bg-ember')} aria-hidden />
      {PLAN_INFO[id].name} plan
    </Link>
  );
}

/**
 * Shown instead of a Growth- or Premium-only page on plans without it, and when the API refuses with 403.
 * `message` is the API's own wording, when there is one. `plan` names the plan to upgrade to.
 */
export function UpgradeCard({
  title,
  description,
  points,
  message,
  plan = 'growth',
  className,
}: {
  title: string;
  description: string;
  points?: string[];
  message?: string | null;
  plan?: UpgradePlan;
  className?: string;
}) {
  const { restaurant } = useAdmin();
  const target = PLAN_INFO[plan];
  return (
    <section className={cn('relative overflow-hidden rounded-3xl border border-line/10 bg-surface p-6 shadow-soft md:p-9', className)} aria-labelledby="upgrade-title">
      <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-ember/10 blur-3xl" aria-hidden />
      <InPlanTag plan={plan} />
      <h2 id="upgrade-title" className="mt-4 max-w-2xl font-display text-2xl font-semibold leading-tight tracking-tight md:text-[30px]">
        {title}
      </h2>
      <p className="mt-2 max-w-2xl text-[15px] text-muted">{description}</p>
      {message && <p className="mt-3 max-w-2xl rounded-xl bg-sunk px-3.5 py-2.5 text-sm text-fg/80">{message}</p>}
      {points && points.length > 0 && (
        <ul className="mt-6 grid max-w-3xl gap-2.5 sm:grid-cols-2">
          {points.map((p) => (
            <li key={p} className="flex items-start gap-2.5 text-sm">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mint-soft text-[#1b6f49]" aria-hidden>
                <Check className="h-3 w-3" />
              </span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
        <Button href="/admin/subscription" rightIcon={<ArrowRight className="h-4 w-4" />} className="self-start">
          See the {target.name} plan
        </Button>
        <p className="text-sm text-muted">
          {target.name} is <span className="tnum font-mono font-semibold text-fg">{formatINR(target.monthly)}</span>/month per outlet, excl. GST. You are on{' '}
          {planName(restaurant.plan)}.
        </p>
      </div>
    </section>
  );
}
