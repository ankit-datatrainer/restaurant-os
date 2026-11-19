'use client';

import * as React from 'react';
import Link from 'next/link';
import { IndianRupee, Receipt, ReceiptText, RefreshCw, Undo2 } from 'lucide-react';
import type { BillingSummary, OrderWithItems, PaymentStatus } from '@restaurant-os/shared';
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, orderCode } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { cn, formatINR, formatTime } from '@/lib/utils';
import { Button, EmptyState, OrderStatusBadge, PaymentStatusBadge, Skeleton } from '@/components/ui';
import { useAdmin, useAdminEvents, mergeOrder } from './admin-provider';
import { Chip, ChipRow, PageHeader } from './page-header';
import { useConfirm } from './confirm-dialog';
import { errorMessage, formatDate, isToday, itemCount, startOfToday } from './format';
import { CLAIMED_HINT, OrderTypeChips, billUrl, orderPlace } from './order-card';
import { SettledBills } from './bills/settled-bills';

type Tab = 'orders' | 'bills';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'orders', label: 'Orders' },
  { id: 'bills', label: 'Settled bills' },
];

/** Billing: per-order payments ("Orders") and counter bills ("Settled bills"). `?tab=bills` opens the second. */
export function BillingView() {
  const [tab, setTab] = React.useState<Tab>('orders');
  const [refreshKey, setRefreshKey] = React.useState(0);

  // Read the tab from the URL without useSearchParams (which would need a Suspense boundary here).
  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).get('tab') === 'bills') setTab('bills');
  }, []);

  const choose = (t: Tab) => {
    setTab(t);
    const url = new URL(window.location.href);
    if (t === 'bills') url.searchParams.set('tab', 'bills');
    else url.searchParams.delete('tab');
    window.history.replaceState(window.history.state, '', url.pathname + url.search);
  };

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader
        title="Billing"
        description={
          tab === 'orders'
            ? 'Reconcile what guests paid by UPI or at the counter, and open a GST bill for any order.'
            : 'Every bill settled at the counter, with how it was paid. Open one to reprint the receipt or refund it.'
        }
        actions={
          <Button variant="outline" size="sm" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={() => setRefreshKey((k) => k + 1)}>
            Refresh
          </Button>
        }
      />

      <div className="mb-4 flex w-full rounded-full bg-sunk p-1 sm:inline-flex sm:w-auto" role="tablist" aria-label="Billing view">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`billing-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`billing-panel-${t.id}`}
            onClick={() => choose(t.id)}
            className={cn(
              'h-10 flex-1 rounded-full px-5 text-sm font-semibold transition sm:flex-none',
              tab === t.id ? 'bg-surface text-fg shadow-soft' : 'text-muted hover:text-fg',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`billing-panel-${tab}`} aria-labelledby={`billing-tab-${tab}`}>
        {tab === 'orders' ? <OrdersBilling refreshKey={refreshKey} /> : <SettledBills refreshKey={refreshKey} />}
      </div>
    </div>
  );
}

type PayFilter = 'all' | PaymentStatus;
type Range = 'today' | 'all';

const PAY_CHIPS: Array<{ id: PayFilter; label: string }> = [
  { id: 'pending', label: 'Unpaid' },
  { id: 'claimed', label: 'Guest says paid' },
  { id: 'paid', label: 'Paid' },
  { id: 'all', label: 'All' },
];

/** The list shows at most this many (newest) orders; the totals and counts always cover every order. */
const PAGE_LIMIT = 300;

function OrdersBilling({ refreshKey }: { refreshKey: number }) {
  const { token, setPaymentStatus } = useAdmin();
  const { confirm, dialog } = useConfirm();
  const [orders, setOrders] = React.useState<OrderWithItems[] | null>(null);
  const [summary, setSummary] = React.useState<BillingSummary | null>(null);
  const [truncated, setTruncated] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [range, setRange] = React.useState<Range>('today');
  const [pay, setPay] = React.useState<PayFilter>('all');
  const [busy, setBusy] = React.useState<Set<string>>(new Set());

  const load = React.useCallback(async () => {
    try {
      // Filters run on the server: the list is the newest matching page, the totals cover every order.
      const since = range === 'today' ? startOfToday().toISOString() : undefined;
      const [list, sum] = await Promise.all([
        adminApi.orders(token, { scope: 'all', limit: PAGE_LIMIT, since, payment_status: pay === 'all' ? undefined : pay }),
        adminApi.billingSummary(token, since),
      ]);
      setOrders(list.filter((o) => o.status !== 'cancelled'));
      setTruncated(list.length >= PAGE_LIMIT);
      setSummary(sum);
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Could not load orders.'));
      setOrders((prev) => prev ?? []);
    }
  }, [token, range, pay]);

  React.useEffect(() => {
    void load();
  }, [load, refreshKey]);

  // Live events patch the rows at once; the totals are server-side, so refetch them (debounced).
  const debounce = React.useRef<number | null>(null);
  useAdminEvents((e) => {
    if (e.type === 'order:update') {
      setOrders((prev) => (prev ? prev.map((o) => (o.id === e.order.id ? mergeOrder(o, e.order) : o)).filter((o) => o.status !== 'cancelled') : prev));
    } else if (e.type === 'order:new') {
      setOrders((prev) => (prev && !prev.some((o) => o.id === e.order.id) ? [e.order, ...prev] : prev));
    } else {
      return;
    }
    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => void load(), 1500);
  });
  React.useEffect(
    () => () => {
      if (debounce.current) window.clearTimeout(debounce.current);
    },
    [],
  );

  const visible = React.useMemo(() => {
    let list = orders ?? [];
    if (range === 'today') list = list.filter((o) => isToday(o.placed_at));
    if (pay !== 'all') list = list.filter((o) => o.payment_status === pay);
    return list;
  }, [orders, range, pay]);

  const totals = { paid: summary?.paid ?? 0, due: summary?.due ?? 0, count: summary?.count ?? 0 };
  const countFor = (f: PayFilter) => (f === 'all' ? (summary?.count ?? 0) : (summary?.by_status[f] ?? 0));

  const mark = (id: string, on: boolean) =>
    setBusy((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  const setPayment = async (order: OrderWithItems, status: PaymentStatus) => {
    if (status === 'refunded') {
      const ok = await confirm({
        title: `Refund ${orderCode(order.order_number)}?`,
        description: `This only records the refund of ${formatINR(order.total)} here. Send the money back through your UPI app or the counter.`,
        confirmLabel: 'Mark refunded',
        danger: true,
      });
      if (!ok) return;
    }
    mark(order.id, true);
    const updated = await setPaymentStatus(order, status);
    if (updated) setOrders((prev) => (prev ? prev.map((o) => (o.id === updated.id ? updated : o)) : prev));
    mark(order.id, false);
  };

  return (
    <div>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Summary label="Collected" value={totals.paid} tone="mint" loading={!summary} />
        <Summary label="Still due" value={totals.due} tone={totals.due > 0 ? 'saffron' : 'neutral'} loading={!summary} />
        <Summary label="Orders" value={totals.count} isCount loading={!summary} />
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex rounded-full bg-sunk p-1" role="tablist" aria-label="Date range">
          {(['today', 'all'] as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={range === r}
              onClick={() => setRange(r)}
              className={cn('h-9 rounded-full px-4 text-[13px] font-semibold transition', range === r ? 'bg-surface text-fg shadow-soft' : 'text-muted hover:text-fg')}
            >
              {r === 'today' ? 'Today' : 'All time'}
            </button>
          ))}
        </div>
        <ChipRow label="Payment status" className="sm:flex-1">
          {PAY_CHIPS.map((c) => (
            <Chip key={c.id} active={pay === c.id} onClick={() => setPay(c.id)} count={countFor(c.id)}>
              {c.label}
            </Chip>
          ))}
        </ChipRow>
      </div>

      {error && (
        <p className="mb-4 rounded-xl bg-rose-soft px-4 py-3 text-sm font-medium text-[#a1282c]" role="alert">
          {error}
        </p>
      )}

      {orders === null ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState icon={<Receipt className="h-5 w-5" />} title="No orders match" description={range === 'today' ? 'Nothing placed today with this payment status.' : 'Try another payment filter.'} />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-2xl border border-line/10 bg-surface shadow-soft md:block">
            <table className="w-full text-sm">
              <thead className="bg-sunk/60 font-mono text-2xs uppercase tracking-[0.14em] text-muted">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Order</th>
                  <th className="px-4 py-3 text-left font-medium">Table</th>
                  <th className="px-4 py-3 text-left font-medium">Time</th>
                  <th className="px-4 py-3 text-right font-medium">Items</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 text-left font-medium">Method</th>
                  <th className="px-4 py-3 text-left font-medium">Payment</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/5">
                {visible.map((o) => (
                  <tr key={o.id} className={cn('transition hover:bg-sunk/40', busy.has(o.id) && 'opacity-60')}>
                    <td className="px-4 py-3">
                      <span className="tnum font-mono font-semibold">{orderCode(o.order_number)}</span>
                      <OrderStatusBadge status={o.status} className="ml-2" />
                    </td>
                    <td className="px-4 py-3">
                      {orderPlace(o)}
                      <OrderTypeChips order={o} className="mt-1 flex" />
                    </td>
                    <td className="tnum px-4 py-3 font-mono text-xs text-muted">
                      {range === 'all' ? `${formatDate(o.placed_at)} · ` : ''}
                      {formatTime(o.placed_at)}
                    </td>
                    <td className="tnum px-4 py-3 text-right font-mono">{itemCount(o)}</td>
                    <td className="tnum px-4 py-3 text-right font-mono font-semibold">
                      {formatINR(o.total)}
                      {Number(o.discount_amount) > 0 && <span className="block text-2xs font-medium text-[#1b6f49]">−{formatINR(Number(o.discount_amount))} off</span>}
                    </td>
                    <td className="px-4 py-3 text-muted">{PAYMENT_METHOD_LABEL[o.payment_method]}</td>
                    <td className="px-4 py-3">
                      <PaymentStatusBadge status={o.payment_status} />
                      {o.payment_status === 'claimed' && <p className="mt-1 max-w-[220px] text-xs leading-snug text-[#8a5a00]">{CLAIMED_HINT}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <RowActions order={o} busy={busy.has(o.id)} onPay={setPayment} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phone cards */}
          <ul className="space-y-3 md:hidden">
            {visible.map((o) => (
              <li key={o.id} className={cn('rounded-2xl border border-line/10 bg-surface p-4 shadow-soft', busy.has(o.id) && 'opacity-60')}>
                <div className="flex items-center justify-between gap-2">
                  <span className="tnum font-mono font-semibold">{orderCode(o.order_number)}</span>
                  <PaymentStatusBadge status={o.payment_status} />
                </div>
                <p className="mt-1 text-sm">
                  {orderPlace(o)} · <span className="text-muted">{formatTime(o.placed_at)}</span>
                </p>
                <OrderTypeChips order={o} className="mt-1.5 flex" />
                <p className="mt-1 text-xs text-muted">
                  {itemCount(o)} items · {PAYMENT_METHOD_LABEL[o.payment_method]} · {PAYMENT_STATUS_LABEL[o.payment_status]}
                  {Number(o.discount_amount) > 0 && <span className="text-[#1b6f49]"> · −{formatINR(Number(o.discount_amount))} off</span>}
                </p>
                {o.payment_status === 'claimed' && <p className="mt-2 rounded-lg bg-saffron-soft px-2.5 py-1.5 text-xs font-medium text-[#8a5a00]">{CLAIMED_HINT}</p>}
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="tnum font-mono text-lg font-semibold">{formatINR(o.total)}</span>
                  <RowActions order={o} busy={busy.has(o.id)} onPay={setPayment} />
                </div>
              </li>
            ))}
          </ul>

          {truncated && (
            <p className="mt-3 text-center text-xs text-muted">
              Showing the newest {PAGE_LIMIT} orders. The totals and counts above include every order.
            </p>
          )}
        </>
      )}
      {dialog}
    </div>
  );
}

function Summary({ label, value, tone = 'neutral', isCount, loading }: { label: string; value: number; tone?: 'neutral' | 'mint' | 'saffron'; isCount?: boolean; loading?: boolean }) {
  const tones = { neutral: 'text-fg', mint: 'text-[#1b6f49]', saffron: 'text-[#8a5a00]' };
  return (
    <div className="rounded-2xl border border-line/10 bg-surface px-4 py-3 shadow-soft">
      <p className="font-mono text-2xs uppercase tracking-[0.14em] text-muted">{label}</p>
      {loading ? <Skeleton className="mt-1.5 h-6 w-20" /> : <p className={cn('tnum mt-1 font-mono text-xl font-semibold', tones[tone])}>{isCount ? value : formatINR(value)}</p>}
    </div>
  );
}

function RowActions({ order, busy, onPay }: { order: OrderWithItems; busy: boolean; onPay: (o: OrderWithItems, s: PaymentStatus) => void }) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      {!order.bill_id && order.payment_status !== 'paid' && order.payment_status !== 'refunded' && (
        <Button size="sm" variant="success" disabled={busy} leftIcon={<IndianRupee className="h-3.5 w-3.5" />} onClick={() => onPay(order, 'paid')}>
          Mark paid
        </Button>
      )}
      {order.payment_status === 'paid' && !order.bill_id && (
        <Button size="sm" variant="ghost" disabled={busy} leftIcon={<Undo2 className="h-3.5 w-3.5" />} onClick={() => onPay(order, 'refunded')} className="text-rose hover:bg-rose-soft">
          Refund
        </Button>
      )}
      {order.bill_id && (
        <Link
          href={billUrl(order.bill_id)}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-mint-soft px-3.5 text-[13px] font-semibold text-[#1b6f49] transition hover:bg-mint/20"
          title="Settled on a counter bill: refunds happen on the bill"
        >
          <ReceiptText className="h-3.5 w-3.5" aria-hidden /> On a bill
        </Link>
      )}
      <Link href={`/admin/billing/${order.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line/15 px-3.5 text-[13px] font-semibold transition hover:bg-fg/5">
        <Receipt className="h-3.5 w-3.5" aria-hidden /> View bill
      </Link>
    </div>
  );
}
