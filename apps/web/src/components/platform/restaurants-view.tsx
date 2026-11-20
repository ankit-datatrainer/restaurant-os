'use client';

import * as React from 'react';
import { ArrowUpRight, Building2, Search, X } from 'lucide-react';
import type { PlanId, PlatformRestaurant } from '@restaurant-os/shared';
import { PLAN_IDS } from '@restaurant-os/shared';
import { cn, formatINR, timeAgo } from '@/lib/utils';
import { Badge, EmptyState, Input, Select, Skeleton } from '@/components/ui';
import { Chip, ChipRow } from '@/components/admin/page-header';
import { useNow } from '@/components/admin/use-now';
import { matchesQuery, PLAN_TONE, planName, publicPageUrl, trialLabel, trialState } from './format';

type Filter = 'all' | 'trial' | 'trial_ended' | 'suspended' | PlanId;
type Sort = 'newest' | 'orders' | 'gmv';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'trial', label: 'On trial' },
  { id: 'trial_ended', label: 'Trial ended' },
  { id: 'suspended', label: 'Suspended' },
  { id: 'starter', label: 'Starter' },
  { id: 'growth', label: 'Growth' },
  { id: 'premium', label: 'Premium' },
];

function passes(r: PlatformRestaurant, f: Filter, now: number): boolean {
  switch (f) {
    case 'all':
      return true;
    case 'trial':
      return trialState(r.trial_ends_at, now).kind === 'active';
    case 'trial_ended':
      return trialState(r.trial_ends_at, now).kind === 'ended';
    case 'suspended':
      return r.status === 'suspended';
    default:
      return r.plan === f;
  }
}

export function RestaurantsView({
  restaurants,
  pending,
  onOpen,
}: {
  restaurants: PlatformRestaurant[] | null;
  pending: Record<string, string>;
  onOpen: (id: string) => void;
}) {
  const now = useNow(60_000);
  const [query, setQuery] = React.useState('');
  const [filter, setFilter] = React.useState<Filter>('all');
  const [sort, setSort] = React.useState<Sort>('newest');
  const q = query.trim().toLowerCase();

  const counts = React.useMemo(() => {
    const c = {} as Record<Filter, number>;
    for (const f of FILTERS) c[f.id] = 0;
    for (const r of restaurants ?? []) for (const f of FILTERS) if (passes(r, f.id, now)) c[f.id] += 1;
    return c;
  }, [restaurants, now]);

  const rows = React.useMemo(() => {
    const list = (restaurants ?? []).filter((r) => passes(r, filter, now) && matchesQuery(r, q));
    const byNewest = (a: PlatformRestaurant, b: PlatformRestaurant) => b.created_at.localeCompare(a.created_at);
    list.sort((a, b) => {
      if (sort === 'orders') return b.orders_30d - a.orders_30d || byNewest(a, b);
      if (sort === 'gmv') return b.gmv_30d - a.gmv_30d || byNewest(a, b);
      return byNewest(a, b);
    });
    return list;
  }, [restaurants, filter, sort, q, now]);

  return (
    <section aria-label="Restaurants" className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_200px] md:items-end">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, slug, city or owner email"
          aria-label="Search restaurants"
          prefix={<Search className="h-4 w-4" />}
          suffix={
            query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="mr-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-fg/5 hover:text-fg"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            ) : undefined
          }
        />
        <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort restaurants">
          <option value="newest">Newest first</option>
          <option value="orders">Most orders (30d)</option>
          <option value="gmv">Highest GMV (30d)</option>
        </Select>
      </div>

      <ChipRow label="Filter restaurants">
        {FILTERS.map((f) => (
          <Chip key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)} count={restaurants ? counts[f.id] : undefined}>
            {f.label}
          </Chip>
        ))}
      </ChipRow>

      {!restaurants ? (
        <LoadingRows />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-5 w-5" />}
          title={restaurants.length === 0 ? 'No restaurants yet' : 'Nothing matches'}
          description={
            restaurants.length === 0
              ? 'Restaurants appear here as soon as someone signs up.'
              : 'Try another search or filter.'
          }
        />
      ) : (
        <>
          <p className="text-xs text-muted" aria-live="polite">
            Showing {rows.length} of {restaurants.length}
          </p>
          {/* Phones: cards */}
          <ul className="grid gap-3 md:hidden">
            {rows.map((r) => (
              <li key={r.id}>
                <RestaurantCard r={r} now={now} busy={Boolean(pending[r.id])} onOpen={() => onOpen(r.id)} />
              </li>
            ))}
          </ul>
          {/* md+: table (scrolls inside its own box if it ever gets too wide) */}
          <div className="hidden overflow-x-auto rounded-2xl border border-line/10 bg-surface shadow-soft md:block">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead>
                <tr className="border-b border-line/10 font-mono text-2xs uppercase tracking-[0.12em] text-muted">
                  <th scope="col" className="px-4 py-3 font-medium">Restaurant</th>
                  <th scope="col" className="px-3 py-3 font-medium">Plan</th>
                  <th scope="col" className="px-3 py-3 font-medium">Trial</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium" title="Tables · dishes · staff">Setup</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">Orders 30d</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">GMV 30d</th>
                  <th scope="col" className="px-3 py-3 font-medium">Last order</th>
                  <th scope="col" className="px-4 py-3 font-medium">Listed</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <RestaurantRow key={r.id} r={r} now={now} busy={Boolean(pending[r.id])} onOpen={() => onOpen(r.id)} />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

export function PlanBadge({ plan }: { plan: PlanId }) {
  return <Badge tone={PLAN_IDS.includes(plan) ? PLAN_TONE[plan] : 'neutral'}>{planName(plan)}</Badge>;
}

export function StatusBadge({ status }: { status: PlatformRestaurant['status'] }) {
  return status === 'suspended' ? (
    <Badge tone="rose" dot>
      Suspended
    </Badge>
  ) : (
    <Badge tone="mint" dot>
      Active
    </Badge>
  );
}

function TrialText({ r, now }: { r: PlatformRestaurant; now: number }) {
  const t = trialState(r.trial_ends_at, now);
  return (
    <span
      className={cn(
        'text-[13px]',
        t.kind === 'none' && 'text-muted',
        t.kind === 'active' && (t.daysLeft <= 3 ? 'font-medium text-[#8a5a00]' : 'text-fg/80'),
        t.kind === 'ended' && 'font-medium text-rose',
      )}
    >
      {trialLabel(t)}
    </span>
  );
}

function SlugLink({ slug }: { slug: string }) {
  return (
    <a
      href={publicPageUrl(slug)}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex max-w-full items-center gap-0.5 font-mono text-2xs text-muted underline-offset-2 hover:text-ember hover:underline"
      aria-label={`Open /r/${slug} in a new tab`}
    >
      <span className="truncate">/r/{slug}</span>
      <ArrowUpRight className="h-3 w-3 shrink-0" aria-hidden />
    </a>
  );
}

function RestaurantRow({ r, now, busy, onOpen }: { r: PlatformRestaurant; now: number; busy: boolean; onOpen: () => void }) {
  return (
    <tr
      onClick={onOpen}
      className={cn(
        'cursor-pointer border-b border-line/[0.07] align-top transition-colors last:border-0 hover:bg-sunk/50',
        r.status === 'suspended' && 'bg-rose-soft/30',
        busy && 'opacity-70',
      )}
    >
      <td className="max-w-[300px] px-4 py-3">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="block max-w-full truncate text-left font-semibold hover:text-ember focus-visible:text-ember"
        >
          {r.name}
        </button>
        <div className="mt-0.5 flex min-w-0 items-center gap-2">
          <SlugLink slug={r.slug} />
          {r.city && <span className="truncate text-xs text-muted">· {r.city}</span>}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted">{r.owner_email ?? 'No owner email'}</p>
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-col items-start gap-1">
          <PlanBadge plan={r.plan} />
          <StatusBadge status={r.status} />
        </div>
      </td>
      <td className="px-3 py-3">
        <TrialText r={r} now={now} />
      </td>
      <td className="tnum px-3 py-3 text-right font-mono text-[13px] text-fg/80" title={`${r.table_count} tables · ${r.dish_count} dishes · ${r.staff_count} staff`}>
        {r.table_count} · {r.dish_count} · {r.staff_count}
      </td>
      <td className="tnum px-3 py-3 text-right font-mono text-[13px] font-semibold">{r.orders_30d.toLocaleString('en-IN')}</td>
      <td className="tnum px-3 py-3 text-right font-mono text-[13px] font-semibold">{formatINR(r.gmv_30d, { compact: true })}</td>
      <td className="px-3 py-3 text-[13px] text-fg/80">{r.last_order_at ? timeAgo(r.last_order_at, now) : <span className="text-muted">Never</span>}</td>
      <td className="px-4 py-3">{r.listed ? <Badge tone="sky">Listed</Badge> : <span className="text-[13px] text-muted">No</span>}</td>
    </tr>
  );
}

function RestaurantCard({ r, now, busy, onOpen }: { r: PlatformRestaurant; now: number; busy: boolean; onOpen: () => void }) {
  return (
    <div
      className={cn(
        'relative rounded-2xl border border-line/10 bg-surface p-4 shadow-soft transition active:scale-[0.99]',
        r.status === 'suspended' && 'border-rose/30',
        busy && 'opacity-70',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {/* The whole card is the hit area; the slug link sits above it. */}
          <button type="button" onClick={onOpen} className="block max-w-full truncate text-left font-display text-[17px] font-semibold leading-tight after:absolute after:inset-0 after:rounded-2xl">
            {r.name}
          </button>
          <div className="relative z-[1] mt-1 flex min-w-0 items-center gap-2">
            <SlugLink slug={r.slug} />
            {r.city && <span className="truncate text-xs text-muted">· {r.city}</span>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <PlanBadge plan={r.plan} />
          <StatusBadge status={r.status} />
        </div>
      </div>
      <p className="mt-2 truncate text-xs text-muted">{r.owner_email ?? 'No owner email'}</p>
      <dl className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-sunk/60 p-3 text-center">
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Orders 30d</dt>
          <dd className="tnum mt-0.5 font-mono text-sm font-semibold">{r.orders_30d.toLocaleString('en-IN')}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">GMV 30d</dt>
          <dd className="tnum mt-0.5 font-mono text-sm font-semibold">{formatINR(r.gmv_30d, { compact: true })}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Last order</dt>
          <dd className="mt-0.5 truncate text-sm font-medium">{r.last_order_at ? timeAgo(r.last_order_at, now) : 'Never'}</dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span>
          Trial: <TrialText r={r} now={now} />
        </span>
        <span>
          {r.table_count} tables · {r.dish_count} dishes · {r.staff_count} staff
        </span>
        <span>{r.listed ? 'Listed' : 'Not listed'}</span>
      </div>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="grid gap-3" aria-busy="true" aria-label="Loading restaurants">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-2xl" />
      ))}
    </div>
  );
}
