'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, ReceiptText, Search } from 'lucide-react';
import type { Bill, BillWithDetails } from '@restaurant-os/shared';
import { BILL_PAYMENT_METHOD_LABEL, billCode, roundMoney, tableDisplay } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { cn, formatINR } from '@/lib/utils';
import { Badge, EmptyState, Skeleton } from '@/components/ui';
import { useAdmin, useAdminEvents } from '../admin-provider';
import { Chip, ChipRow } from '../page-header';
import { errorMessage } from '../format';
import { billUrl } from '../order-card';
import { istDate, istMidnight, istTime, paymentsByMethod } from './bill-utils';

type RangeId = 'today' | 'yesterday' | '7d' | '30d';
type StatusFilter = 'all' | 'settled' | 'refunded';

const RANGES: Array<{ id: RangeId; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
];

const STATUSES: Array<{ id: StatusFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'settled', label: 'Settled' },
  { id: 'refunded', label: 'Refunded' },
];

/** The API returns at most this many bills, newest first. */
const PAGE_LIMIT = 300;

/** Day boundaries in India (IST), whatever the device's time zone. */
function rangeBounds(id: RangeId): { since: string; until?: string } {
  switch (id) {
    case 'today':
      return { since: istMidnight(0).toISOString() };
    case 'yesterday':
      return { since: istMidnight(1).toISOString(), until: istMidnight(0).toISOString() };
    case '7d':
      return { since: istMidnight(6).toISOString() };
    case '30d':
      return { since: istMidnight(29).toISOString() };
  }
}

/** The list endpoint has no orders, so a bill without a table is a takeaway (one order) or a merge across tables. */
export function billPlaceShort(bill: Pick<BillWithDetails, 'table' | 'order_ids'>): string {
  if (bill.table) return tableDisplay(bill.table);
  return (bill.order_ids?.length ?? 0) > 1 ? 'Takeaway / several tables' : 'Takeaway';
}

export function BillStatusBadge({ status, className }: { status: Bill['status']; className?: string }) {
  return (
    <Badge tone={status === 'refunded' ? 'rose' : 'mint'} className={className}>
      {status === 'refunded' ? 'Refunded' : 'Settled'}
    </Badge>
  );
}

/** "Cash ₹500 · UPI ₹240" as small chips. */
function MethodChips({ bill, className }: { bill: BillWithDetails; className?: string }) {
  const parts = paymentsByMethod(bill.payments ?? []);
  if (parts.length === 0) return <span className="text-xs text-muted">—</span>;
  return (
    <span className={cn('inline-flex flex-wrap gap-1', className)}>
      {parts.map((p) => (
        <span key={p.method} className="tnum inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-sunk px-2 py-0.5 text-xs">
          <span className="font-medium">{BILL_PAYMENT_METHOD_LABEL[p.method]}</span>
          <span className="font-mono text-muted">{formatINR(p.amount)}</span>
        </span>
      ))}
    </span>
  );
}

const orderCount = (b: BillWithDetails) => b.order_ids?.length ?? b.orders?.length ?? 0;

export function SettledBills({ refreshKey }: { refreshKey: number }) {
  const { token } = useAdmin();
  const router = useRouter();
  const [bills, setBills] = React.useState<BillWithDetails[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [range, setRange] = React.useState<RangeId>('today');
  const [status, setStatus] = React.useState<StatusFilter>('all');
  const [query, setQuery] = React.useState('');
  const [q, setQ] = React.useState('');

  // Search by bill number as you type, without a request per keystroke.
  React.useEffect(() => {
    const t = window.setTimeout(() => setQ(query.trim()), 300);
    return () => window.clearTimeout(t);
  }, [query]);

  const load = React.useCallback(async () => {
    try {
      const list = await adminApi.bills(token, { ...rangeBounds(range), status, q: q || undefined });
      setBills(list);
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Could not load bills.'));
      setBills((prev) => prev ?? []);
    }
  }, [token, range, status, q]);

  React.useEffect(() => {
    void load();
  }, [load, refreshKey]);

  // A bill settled or refunded elsewhere shows up as order updates: refetch (debounced).
  const debounce = React.useRef<number | null>(null);
  useAdminEvents((e) => {
    if (e.type !== 'order:update' || (!e.order.bill_id && e.order.payment_status !== 'refunded')) return;
    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => void load(), 1500);
  });
  React.useEffect(
    () => () => {
      if (debounce.current) window.clearTimeout(debounce.current);
    },
    [],
  );

  const totals = React.useMemo(() => {
    const list = bills ?? [];
    const settled = list.filter((b) => b.status === 'settled');
    const refunded = list.filter((b) => b.status === 'refunded');
    const paid = (b: BillWithDetails) => Number(b.total) + Number(b.tip_amount);
    return {
      count: list.length,
      collected: roundMoney(settled.reduce((s, b) => s + paid(b), 0)),
      refunded: roundMoney(refunded.reduce((s, b) => s + paid(b), 0)),
      tips: roundMoney(settled.reduce((s, b) => s + Number(b.tip_amount), 0)),
      byMethod: paymentsByMethod(settled.flatMap((b) => b.payments ?? [])),
    };
  }, [bills]);

  const multiDay = range === '7d' || range === '30d';
  const truncated = (bills?.length ?? 0) >= PAGE_LIMIT;

  return (
    <div>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <SummaryTile label="Collected" value={formatINR(totals.collected)} tone="mint" loading={!bills} hint={totals.tips > 0 ? `incl. ${formatINR(totals.tips)} tips` : undefined} />
        <SummaryTile label="Refunded" value={formatINR(totals.refunded)} tone={totals.refunded > 0 ? 'rose' : 'neutral'} loading={!bills} />
        <SummaryTile label="Bills" value={String(totals.count)} loading={!bills} />
      </div>
      {bills && totals.byMethod.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-2xl border border-line/10 bg-surface px-4 py-3 shadow-soft">
          <span className="font-mono text-2xs uppercase tracking-[0.14em] text-muted">By method</span>
          {totals.byMethod.map((m) => (
            <span key={m.method} className="tnum text-sm">
              <span className="text-muted">{BILL_PAYMENT_METHOD_LABEL[m.method]}</span> <span className="font-mono font-semibold">{formatINR(m.amount)}</span>
            </span>
          ))}
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <ChipRow label="Date range">
          {RANGES.map((r) => (
            <Chip key={r.id} active={range === r.id} onClick={() => setRange(r.id)}>
              {r.label}
            </Chip>
          ))}
        </ChipRow>
        <ChipRow label="Bill status" className="lg:flex-1">
          {STATUSES.map((s) => (
            <Chip key={s.id} active={status === s.id} onClick={() => setStatus(s.id)} tone="ember">
              {s.label}
            </Chip>
          ))}
        </ChipRow>
        <label className="relative block w-full lg:w-60">
          <span className="sr-only">Search by bill number</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            inputMode="numeric"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Bill number, e.g. 7"
            className="h-10 w-full rounded-full border border-line/15 bg-surface pl-10 pr-4 text-sm text-fg placeholder:text-muted/70 transition focus:border-ember focus:shadow-ring focus:outline-none"
          />
        </label>
      </div>

      {error && (
        <p className="mb-4 rounded-xl bg-rose-soft px-4 py-3 text-sm font-medium text-[#a1282c]" role="alert">
          {error}
        </p>
      )}

      {bills === null ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : bills.length === 0 ? (
        <EmptyState
          icon={<ReceiptText className="h-5 w-5" />}
          title={q ? `No bill matches “${q}”` : 'No bills in this range'}
          description={q ? 'Check the number on the receipt, or widen the date range.' : 'Bills appear here once you settle orders at the counter or from the floor view.'}
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-2xl border border-line/10 bg-surface shadow-soft md:block">
            <table className="w-full text-sm">
              <thead className="bg-sunk/60 font-mono text-2xs uppercase tracking-[0.14em] text-muted">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Bill</th>
                  <th className="px-4 py-3 text-left font-medium">Time</th>
                  <th className="px-4 py-3 text-left font-medium">Table</th>
                  <th className="px-4 py-3 text-right font-medium">Orders</th>
                  <th className="px-4 py-3 text-left font-medium">Paid by</th>
                  <th className="px-4 py-3 text-right font-medium">Tip</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="w-8 px-2 py-3" aria-hidden />
                </tr>
              </thead>
              <tbody className="divide-y divide-line/5">
                {bills.map((b) => (
                  <tr key={b.id} className="cursor-pointer transition hover:bg-sunk/40" onClick={() => router.push(billUrl(b.id))}>
                    <td className="px-4 py-3">
                      <Link href={billUrl(b.id)} className="tnum font-mono font-semibold hover:text-ember" onClick={(e) => e.stopPropagation()}>
                        {billCode(b.bill_number)}
                      </Link>
                    </td>
                    <td className="tnum px-4 py-3 font-mono text-xs text-muted">
                      {multiDay ? `${istDate(b.settled_at)} · ` : ''}
                      {istTime(b.settled_at)}
                    </td>
                    <td className="px-4 py-3">{billPlaceShort(b)}</td>
                    <td className="tnum px-4 py-3 text-right font-mono">{orderCount(b)}</td>
                    <td className="px-4 py-3">
                      <MethodChips bill={b} />
                    </td>
                    <td className="tnum px-4 py-3 text-right font-mono text-muted">{Number(b.tip_amount) > 0 ? formatINR(Number(b.tip_amount)) : '—'}</td>
                    <td className="tnum px-4 py-3 text-right font-mono font-semibold">{formatINR(Number(b.total))}</td>
                    <td className="px-4 py-3">
                      <BillStatusBadge status={b.status} />
                    </td>
                    <td className="px-2 py-3 text-muted">
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phone cards */}
          <ul className="space-y-3 md:hidden">
            {bills.map((b) => (
              <li key={b.id}>
                <Link href={billUrl(b.id)} className="block rounded-2xl border border-line/10 bg-surface p-4 shadow-soft transition active:scale-[0.99]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="tnum font-mono font-semibold">{billCode(b.bill_number)}</span>
                    <BillStatusBadge status={b.status} />
                  </div>
                  <p className="mt-1 text-sm">
                    {billPlaceShort(b)} ·{' '}
                    <span className="text-muted">
                      {multiDay ? `${istDate(b.settled_at)}, ` : ''}
                      {istTime(b.settled_at)}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {orderCount(b)} order{orderCount(b) === 1 ? '' : 's'}
                    {Number(b.tip_amount) > 0 ? ` · Tip ${formatINR(Number(b.tip_amount))}` : ''}
                  </p>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <MethodChips bill={b} className="min-w-0" />
                    <span className="tnum shrink-0 font-mono text-lg font-semibold">{formatINR(Number(b.total))}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {truncated && <p className="mt-3 text-center text-xs text-muted">Showing the newest {PAGE_LIMIT} bills. Pick a shorter range to see older ones.</p>}
        </>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone = 'neutral',
  loading,
  hint,
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'mint' | 'rose';
  loading?: boolean;
  hint?: string;
}) {
  const tones = { neutral: 'text-fg', mint: 'text-[#1b6f49]', rose: 'text-[#a1282c]' };
  return (
    <div className="rounded-2xl border border-line/10 bg-surface px-4 py-3 shadow-soft">
      <p className="font-mono text-2xs uppercase tracking-[0.14em] text-muted">{label}</p>
      {loading ? <Skeleton className="mt-1.5 h-6 w-20" /> : <p className={cn('tnum mt-1 truncate font-mono text-xl font-semibold', tones[tone])}>{value}</p>}
      {hint && !loading && <p className="mt-0.5 truncate text-2xs text-muted">{hint}</p>}
    </div>
  );
}
