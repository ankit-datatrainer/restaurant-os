'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Building2, CalendarClock, Hourglass, IndianRupee, Inbox, ListChecks, Receipt, ShoppingBag, UserPlus } from 'lucide-react';
import type { PlanId, PlatformOverview } from '@restaurant-os/shared';
import { PLAN_IDS, PLAN_INFO } from '@restaurant-os/shared';
import { formatINR } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui';
import { StatTile } from '@/components/admin/stat-tile';

const PLAN_BAR: Record<PlanId, string> = {
  starter: 'bg-fg/35',
  growth: 'bg-sky',
  premium: 'bg-ember',
};

function gmvTile(gmv: number): { value: number; prefix: string; suffix: string; decimals: number } {
  if (gmv >= 1_00_00_000) return { value: gmv / 1_00_00_000, prefix: '₹', suffix: 'Cr', decimals: 2 };
  if (gmv >= 1_00_000) return { value: gmv / 1_00_000, prefix: '₹', suffix: 'L', decimals: 1 };
  return { value: Math.round(gmv), prefix: '₹', suffix: '', decimals: 0 };
}

export function OverviewTiles({ overview }: { overview: PlatformOverview | null }) {
  const loading = !overview;
  const o = overview;
  const gmv = gmvTile(o?.gmv_30d ?? 0);
  return (
    <section aria-label="Overview" className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4">
      <StatTile
        className="col-span-2 md:col-span-1"
        label="Restaurants"
        value={o?.restaurants ?? 0}
        loading={loading}
        icon={<Building2 className="h-4 w-4" />}
        tone="ember"
        hint={
          o ? (
            <>
              <span className="text-[#1b6f49]">{o.active} active</span> · <span className={o.suspended ? 'text-rose' : ''}>{o.suspended} suspended</span>
            </>
          ) : undefined
        }
      />
      <StatTile label="On trial" value={o?.on_trial ?? 0} loading={loading} icon={<Hourglass className="h-4 w-4" />} tone="saffron" hint="Trial still running" />
      <StatTile
        label="Trials ended"
        value={o?.trial_expired ?? 0}
        loading={loading}
        icon={<CalendarClock className="h-4 w-4" />}
        hint="Follow up to convert"
      />
      <StatTile
        label="Signups 7d"
        value={o?.signups_7d ?? 0}
        loading={loading}
        icon={<UserPlus className="h-4 w-4" />}
        tone="mint"
        hint={o ? `${o.signups_30d} in the last 30 days` : undefined}
      />
      <StatTile label="Orders today" value={o?.orders_today ?? 0} loading={loading} icon={<Receipt className="h-4 w-4" />} tone="sky" hint="Across every restaurant" />
      <StatTile label="Orders 30d" value={o?.orders_30d ?? 0} loading={loading} icon={<ShoppingBag className="h-4 w-4" />} hint="Non-cancelled orders" />
      <StatTile
        label="GMV 30d"
        value={gmv.value}
        prefix={gmv.prefix}
        suffix={gmv.suffix}
        decimals={gmv.decimals}
        loading={loading}
        icon={<IndianRupee className="h-4 w-4" />}
        tone="ember"
        hint={o ? formatINR(o.gmv_30d) : undefined}
      />
      <StatTile
        label="Listed"
        value={o?.listed ?? 0}
        loading={loading}
        icon={<ListChecks className="h-4 w-4" />}
        hint="Shown in the public directory"
      />
      <StatTile label="Leads 30d" value={o?.leads_30d ?? 0} loading={loading} icon={<Inbox className="h-4 w-4" />} tone="sky" hint="Contact-form enquiries" />
      <PlanMix overview={overview} className="col-span-2 md:col-span-3" />
    </section>
  );
}

function PlanMix({ overview, className }: { overview: PlatformOverview | null; className?: string }) {
  const reduce = useReducedMotion();
  const counts = PLAN_IDS.map((id) => ({ id, count: overview?.by_plan?.[id] ?? 0 }));
  const total = counts.reduce((s, c) => s + c.count, 0);
  return (
    <div className={cn('rounded-2xl border border-line/10 bg-surface p-4 shadow-soft md:p-5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-2xs uppercase tracking-[0.16em] text-muted">Plan mix</p>
        {overview && <p className="tnum font-mono text-2xs text-muted">{total} restaurants</p>}
      </div>
      {!overview ? (
        <div className="mt-4 grid gap-3">
          <Skeleton className="h-2.5 w-full rounded-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : (
        <>
          <div
            className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-sunk"
            role="img"
            aria-label={counts.map((c) => `${PLAN_INFO[c.id].name}: ${c.count}`).join(', ')}
          >
            {total > 0 &&
              counts.map((c) =>
                c.count > 0 ? (
                  <motion.span
                    key={c.id}
                    className={cn('h-full first:rounded-l-full last:rounded-r-full', PLAN_BAR[c.id])}
                    initial={reduce ? false : { width: 0 }}
                    animate={{ width: `${(c.count / total) * 100}%` }}
                    transition={{ duration: reduce ? 0 : 0.7, ease: [0.22, 1, 0.36, 1] }}
                  />
                ) : null,
              )}
          </div>
          <ul className="mt-4 grid grid-cols-3 gap-2">
            {counts.map((c) => (
              <li key={c.id} className="min-w-0">
                <p className="flex items-center gap-1.5 text-[13px] font-medium">
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', PLAN_BAR[c.id])} aria-hidden />
                  <span className="truncate">{PLAN_INFO[c.id].name}</span>
                </p>
                <p className="tnum mt-0.5 font-mono text-lg font-semibold leading-tight">
                  {c.count}
                  <span className="ml-1 text-xs font-normal text-muted">{total ? Math.round((c.count / total) * 100) : 0}%</span>
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
