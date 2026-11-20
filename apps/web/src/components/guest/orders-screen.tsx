'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import { BellRing, Check, ChevronRight, ClipboardList, Receipt, Star } from 'lucide-react';
import type { OrderWithItems } from '@restaurant-os/shared';
import { roundMoney } from '@restaurant-os/shared';
import { Badge, Button, EmptyState, OrderStatusBadge, PaymentStatusBadge, Skeleton } from '@/components/ui';
import { publicApi } from '@/lib/api';
import { cn, formatINR, orderCode, tableDisplay, timeAgo } from '@/lib/utils';
import { fadeUp, stagger } from '@/lib/motion';
import { feedbackOn, loyaltyOn } from './features';
import { GuestPageHeader } from './page-header';
import { HelpSheet } from './help-sheet';
import { LoyaltyCard, hasLoyaltyCard } from './loyalty-card';
import { useOrderWatcher } from './order-watcher';
import { useTable } from './table-provider';
import { callStateOf, useSessionCalls } from './use-session-calls';
import { useLoyalty } from './use-loyalty';

const FINAL = new Set(['served', 'cancelled']);

function OrderCard({ order, code, askFeedback }: { order: OrderWithItems; code: string; askFeedback: boolean }) {
  const summary = order.items.map((it) => `${it.quantity} × ${it.name}`).join(', ');
  const cancelled = order.status === 'cancelled';
  const href = `/t/${code}/orders/${order.id}`;
  const rate = askFeedback && order.status === 'served' && !order.feedback;
  return (
    <div
      className={cn(
        'overflow-hidden rounded-3xl border border-line/10 bg-surface shadow-soft transition-[transform,box-shadow] duration-300 ease-out hover:shadow-lift',
        cancelled && 'opacity-70',
      )}
    >
      <Link href={href} className="flex items-center gap-3 p-4 active:bg-sunk/50">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-sm font-semibold tnum">{orderCode(order.order_number)}</p>
            <OrderStatusBadge status={order.status} />
            {/* "Paid" only once the staff confirmed it; a guest's own claim stays "confirming". */}
            {order.payment_status === 'paid' && <PaymentStatusBadge status="paid" />}
            {order.payment_status === 'claimed' && !cancelled && <Badge tone="saffron">Confirming payment</Badge>}
          </div>
          <p className="mt-1.5 line-clamp-2 text-[13px] text-muted">{summary}</p>
          <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted">{timeAgo(order.placed_at)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <p className={cn('font-display text-base font-bold tnum', cancelled && 'line-through')}>{formatINR(order.total)}</p>
          <ChevronRight className="h-5 w-5 text-muted" aria-hidden />
        </div>
      </Link>
      {rate && (
        <Link
          href={`${href}#feedback`}
          className="hairline-t flex min-h-[48px] items-center gap-2 px-4 text-[13.5px] font-semibold text-ember-3 transition-colors hover:bg-ember-soft/50"
        >
          <Star className="h-4 w-4 fill-saffron text-saffron" aria-hidden />
          Rate your meal
          <span className="sr-only"> for order {orderCode(order.order_number)}</span>
          <ChevronRight className="ml-auto h-4 w-4 text-ember-3/70" aria-hidden />
        </Link>
      )}
    </div>
  );
}

/** "My orders / bill": every order this phone placed at this table, with a running total. */
export function OrdersScreen() {
  const reduce = Boolean(useReducedMotion());
  const { code, data, session } = useTable();
  const [orders, setOrders] = React.useState<OrderWithItems[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [asking, setAsking] = React.useState(false);
  const { calls, refresh: refreshCalls } = useSessionCalls();
  const report = useOrderWatcher()?.report;
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  // Server truth for the bill request: still open, or picked up by the staff a moment ago.
  const billState = callStateOf(calls, 'bill', now);
  const billAsked = billState !== null;

  const load = React.useCallback(async () => {
    if (!session) return;
    try {
      const res = await publicApi.sessionOrders(code, session.id);
      setOrders(res);
      setError(null);
      // Status banners come from the order watcher; it compares this fresh list at once.
      report?.(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your orders');
    }
  }, [code, session, report]);

  React.useEffect(() => {
    void load();
  }, [load]);

  // Keep statuses fresh while something is still cooking and the tab is visible.
  const active = (orders ?? []).some((o) => !FINAL.has(o.status));
  React.useEffect(() => {
    if (!active) return;
    let timer: number | undefined;
    const stop = () => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
    };
    const start = () => {
      stop();
      timer = window.setInterval(() => void load(), 5000);
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        void load();
        start();
      } else stop();
    };
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [active, load]);

  const billable = (orders ?? []).filter((o) => o.status !== 'cancelled');
  const runningTotal = roundMoney(billable.reduce((s, o) => s + o.total, 0));
  const unpaid = roundMoney(billable.filter((o) => o.payment_status !== 'paid').reduce((s, o) => s + o.total, 0));

  const askForBill = async () => {
    if (asking || billAsked) return;
    setAsking(true);
    try {
      await publicApi.createCall({ table_code: code, guest_session_id: session?.id, type: 'bill' });
      toast.success('Bill requested. The staff can see it');
      await refreshCalls();
      setNow(Date.now());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not reach the staff. Please try again.');
    } finally {
      setAsking(false);
    }
  };

  const restaurant = data?.restaurant ?? null;
  const table = data?.table ?? null;
  const askFeedback = feedbackOn(restaurant);
  // Re-read the card whenever another order is served (a visit counts once an order is served).
  const servedCount = (orders ?? []).filter((o) => o.status === 'served').length;
  const loyalty = useLoyalty({ enabled: loyaltyOn(restaurant), refreshKey: servedCount });

  return (
    <div className="relative pb-16">
      <GuestPageHeader
        title="My orders"
        subtitle={restaurant ? `${restaurant.name} · ${tableDisplay(table)}` : undefined}
        backHref={`/t/${code}`}
        right={
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-fg transition hover:bg-fg/5"
            aria-label="Call a waiter"
          >
            <BellRing className="h-5 w-5" aria-hidden />
          </button>
        }
      />

      <main className="gutter pt-4">
        {orders === null && !error && (
          <div className="grid gap-3" aria-busy="true" aria-label="Loading your orders">
            <Skeleton className="h-36 w-full rounded-3xl" />
            <Skeleton className="h-24 w-full rounded-3xl" />
            <Skeleton className="h-24 w-full rounded-3xl" />
          </div>
        )}

        {error && orders === null && (
          <EmptyState
            title="Could not load your orders"
            description={error}
            action={
              <Button variant="outline" onClick={() => void load()}>
                Try again
              </Button>
            }
          />
        )}

        {orders && orders.length === 0 && (
          <EmptyState
            icon={<ClipboardList className="h-5 w-5" aria-hidden />}
            title="No orders yet"
            description="Dishes you order from this phone show up here with their live status."
            action={<Button href={`/t/${code}`}>Browse the menu</Button>}
          />
        )}

        {orders && orders.length > 0 && (
          <motion.div className="grid gap-4" variants={stagger(0.06)} initial={reduce ? false : 'hidden'} animate="show">
            <motion.section variants={fadeUp} className="rounded-3xl bg-ink p-5 text-paper" aria-labelledby="bill-heading">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p id="bill-heading" className="font-mono text-[11px] uppercase tracking-[0.18em] text-paper/60">
                    Your bill so far
                  </p>
                  <p className="mt-1 font-display text-4xl font-bold tracking-tight tnum">{formatINR(runningTotal)}</p>
                  <p className="mt-1 text-sm text-paper/70">
                    {billable.length} {billable.length === 1 ? 'order' : 'orders'}
                    {unpaid > 0 && unpaid !== runningTotal ? ` · ${formatINR(unpaid)} still to pay` : unpaid === 0 ? ' · all paid' : ''}
                  </p>
                </div>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-paper/10">
                  <Receipt className="h-5 w-5" aria-hidden />
                </span>
              </div>
              <Button
                variant="light"
                size="lg"
                className="mt-5 w-full"
                onClick={askForBill}
                loading={asking}
                disabled={billAsked}
                leftIcon={billState?.kind === 'open' ? <Check className="h-4 w-4" aria-hidden /> : undefined}
              >
                {billState?.kind === 'attended' ? 'Bill on the way ✓' : billState?.kind === 'open' ? `Bill requested · ${timeAgo(billState.since, now)}` : 'Ask for the bill'}
              </Button>
            </motion.section>

            {hasLoyaltyCard(loyalty) && (
              <motion.div variants={fadeUp}>
                <LoyaltyCard status={loyalty} />
              </motion.div>
            )}

            <motion.ul variants={fadeUp} className="grid gap-3" aria-label="Orders">
              {orders.map((o) => (
                <li key={o.id}>
                  <OrderCard order={o} code={code} askFeedback={askFeedback} />
                </li>
              ))}
            </motion.ul>

            <motion.div variants={fadeUp}>
              <Button href={`/t/${code}`} variant="outline" size="lg" className="w-full">
                Order something else
              </Button>
            </motion.div>
          </motion.div>
        )}
      </main>

      <HelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} code={code} guestSessionId={session?.id ?? null} />
    </div>
  );
}
