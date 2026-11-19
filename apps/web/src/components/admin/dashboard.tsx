'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, BellRing, ChefHat, IndianRupee, ListOrdered, QrCode, Receipt, ShoppingBag, Users, UtensilsCrossed } from 'lucide-react';
import type { DashboardStats } from '@restaurant-os/shared';
import { planHas } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { formatINR, orderCode, tableDisplay, timeAgo } from '@/lib/utils';
import { Card, CardBody, CardHeader, EmptyState, OrderStatusBadge, Skeleton } from '@/components/ui';
import { fadeUp, stagger } from '@/lib/motion';
import { useAdmin, useAdminEvents } from './admin-provider';
import { BarChart } from './bar-chart';
import { RetentionCard } from './retention-card';
import { PageHeader } from './page-header';
import { StatTile } from './stat-tile';
import { errorMessage, itemCount } from './format';
import { useNow } from './use-now';
import { isTakeaway } from './order-card';

const REFRESH_MS = 60_000;

export function Dashboard() {
  const { token, restaurant, orders, calls } = useAdmin();
  const [stats, setStats] = React.useState<DashboardStats | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const now = useNow(30_000);
  const reduce = useReducedMotion();

  const load = React.useCallback(async () => {
    try {
      const s = await adminApi.stats(token);
      setStats(s);
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Could not load today’s numbers.'));
    }
  }, [token]);

  React.useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  // Realtime events → refresh (debounced so a burst of updates is one request).
  const debounce = React.useRef<number | null>(null);
  useAdminEvents((e) => {
    if (e.type === 'sync') return;
    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => void load(), 1200);
  });

  const today = stats?.today;
  const loading = !stats && !error;
  const currentHour = new Date(now).getHours();
  const maxTop = Math.max(1, ...(stats?.top_items.map((t) => t.quantity) ?? [1]));
  // Active takeaway / counter orders, as a hint on the "Active orders" tile (no extra tile: the grid stays even).
  const takeawayActive = orders.filter((o) => isTakeaway(o)).length;
  const counterActive = orders.filter((o) => o.source === 'pos').length;
  const activeHint = [takeawayActive ? `${takeawayActive} takeaway` : null, counterActive ? `${counterActive} counter` : null].filter(Boolean).join(' · ') || undefined;
  const greeting = currentHour < 12 ? 'Good morning' : currentHour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader
        eyebrow={new Date(now).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
        title={`${greeting}, ${restaurant.name}.`}
        description={
          orders.length
            ? `${orders.length} active order${orders.length === 1 ? '' : 's'} on the board right now.`
            : 'The board is clear. New orders will chime in here.'
        }
        actions={
          <Link href="/admin/kitchen" className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-sm font-semibold text-paper transition hover:bg-ink-3">
            <ChefHat className="h-4 w-4" aria-hidden /> Kitchen board
          </Link>
        }
      />

      {error && (
        <p className="mb-4 rounded-xl bg-rose-soft px-4 py-3 text-sm font-medium text-[#a1282c]" role="alert">
          {error}
        </p>
      )}

      <motion.div variants={stagger(0.05)} initial={reduce ? false : 'hidden'} animate="show" className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-6">
        <motion.div variants={fadeUp} custom={0}>
          <StatTile label="Today's revenue" value={today?.revenue ?? 0} prefix="₹" loading={loading} icon={<IndianRupee className="h-4 w-4" />} tone="ember" />
        </motion.div>
        <motion.div variants={fadeUp} custom={1}>
          <StatTile label="Orders" value={today?.orders ?? 0} loading={loading} icon={<ShoppingBag className="h-4 w-4" />} hint={today ? `${today.items_sold} items sold` : undefined} />
        </motion.div>
        <motion.div variants={fadeUp} custom={2}>
          <StatTile label="Avg order" value={today?.avg_order_value ?? 0} prefix="₹" loading={loading} icon={<Receipt className="h-4 w-4" />} />
        </motion.div>
        <motion.div variants={fadeUp} custom={3}>
          <StatTile label="Active orders" value={orders.length} icon={<ListOrdered className="h-4 w-4" />} tone="sky" hint={activeHint} />
        </motion.div>
        <motion.div variants={fadeUp} custom={4}>
          <StatTile label="Open calls" value={calls.length} icon={<BellRing className="h-4 w-4" />} tone={calls.length ? 'saffron' : 'neutral'} />
        </motion.div>
        <motion.div variants={fadeUp} custom={5}>
          <StatTile label="Occupied tables" value={today?.occupied_tables ?? 0} loading={loading} icon={<Users className="h-4 w-4" />} tone="mint" />
        </motion.div>
      </motion.div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader title="Orders by hour" description="Where today’s rush landed." />
          <CardBody className="pt-4">
            {stats ? <BarChart data={stats.hourly} currentHour={currentHour} /> : <Skeleton className="h-56 w-full" />}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Top dishes" description="By quantity sold today." />
          <CardBody className="pt-4">
            {!stats ? (
              <div className="space-y-3">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : stats.top_items.length === 0 ? (
              <EmptyState title="Nothing sold yet" description="The first order of the day will show up here." className="py-8" />
            ) : (
              <ol className="space-y-3">
                {stats.top_items.slice(0, 6).map((t, i) => (
                  <li key={t.name}>
                    <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="w-4 shrink-0 font-mono text-2xs text-muted tnum">{i + 1}</span>
                        <span className="truncate font-medium">{t.name}</span>
                      </span>
                      <span className="shrink-0 font-mono text-xs text-muted tnum">
                        {t.quantity}× · {formatINR(t.revenue)}
                      </span>
                    </div>
                    <div className="ml-6 h-1.5 overflow-hidden rounded-full bg-sunk">
                      <motion.div
                        className="h-full rounded-full bg-ember"
                        initial={reduce ? false : { width: 0 }}
                        animate={{ width: `${(t.quantity / maxTop) * 100}%` }}
                        transition={{ duration: 0.8, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                      />
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader
            title="Recent orders"
            description="The last few orders, newest first."
            action={
              <Link href="/admin/orders" className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-sm font-medium text-ember hover:bg-ember-soft">
                All orders <ArrowUpRight className="h-4 w-4" aria-hidden />
              </Link>
            }
          />
          <CardBody className="px-2 pt-3 sm:px-3">
            {!stats ? (
              <div className="space-y-2 px-2">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : stats.recent_orders.length === 0 ? (
              <EmptyState title="No orders yet today" description="Share a table QR and the first order will appear here." className="py-8" />
            ) : (
              <ul className="divide-y divide-line/5">
                {stats.recent_orders.slice(0, 8).map((o) => (
                  <li key={o.id}>
                    <Link href="/admin/orders" className="flex items-center gap-3 rounded-xl px-2 py-3 transition hover:bg-sunk/60 sm:px-3">
                      <span className="w-[88px] shrink-0 font-mono text-sm font-semibold tnum">{orderCode(o.order_number)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{tableDisplay(o.table)}</span>
                        <span className="block truncate text-xs text-muted">
                          {itemCount(o)} item{itemCount(o) === 1 ? '' : 's'} · {timeAgo(o.placed_at, now)}
                        </span>
                      </span>
                      <OrderStatusBadge status={o.status} className="hidden sm:inline-flex" />
                      <span className="w-[72px] shrink-0 text-right font-mono text-sm font-semibold tnum">{formatINR(o.total)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <div className="space-y-4">
          {planHas(restaurant.plan, 'crm') && <RetentionCard />}
          <Card>
            <CardHeader title="Quick links" description="Everything the counter needs, one tap away." />
            <CardBody className="grid grid-cols-2 gap-2 pt-4">
              <QuickLink href="/admin/orders" icon={<ListOrdered className="h-4 w-4" />} label="Live orders" hint={`${orders.length} active`} />
              <QuickLink href="/admin/calls" icon={<BellRing className="h-4 w-4" />} label="Calls" hint={`${calls.length} open`} />
              <QuickLink href="/admin/menu" icon={<UtensilsCrossed className="h-4 w-4" />} label="Menu & dishes" hint="Prices, availability" />
              <QuickLink href="/admin/tables" icon={<QrCode className="h-4 w-4" />} label="Tables & QR" hint="Print stickers" />
              <QuickLink href="/admin/billing" icon={<Receipt className="h-4 w-4" />} label="Billing" hint="Mark paid, GST bills" />
              <QuickLink href="/admin/tables/print" icon={<QrCode className="h-4 w-4" />} label="Print QR sheet" hint="A4, 6 per page" />
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function QuickLink({ href, icon, label, hint }: { href: string; icon: React.ReactNode; label: string; hint: string }) {
  return (
    <Link href={href} className="group flex items-center gap-3 rounded-2xl border border-line/10 bg-bg px-3 py-3 transition hover:border-ember/40 hover:bg-ember-soft/40">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-fg/70 shadow-soft transition group-hover:text-ember" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{label}</span>
        <span className="block truncate text-xs text-muted">{hint}</span>
      </span>
    </Link>
  );
}
