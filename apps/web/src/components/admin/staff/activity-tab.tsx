'use client';

import * as React from 'react';
import { Boxes, History, ListOrdered, Receipt, RefreshCw, Settings, TicketPercent, UsersRound, UtensilsCrossed, Wallet } from 'lucide-react';
import type { AuditEntry, DiningTable, OrderStatus, StaffRole } from '@restaurant-os/shared';
import { ORDER_STATUS_LABEL, STAFF_ROLE_LABEL, billCode, orderCode } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { cn, formatDateTime, formatINR, formatTime } from '@/lib/utils';
import { Button, Card, CardBody, EmptyState, Skeleton } from '@/components/ui';
import { useAdmin } from '../admin-provider';
import { Chip, ChipRow } from '../page-header';
import { errorMessage } from '../format';
import { dayLabel, relativeDayLabel, istKey } from '../finance/ist';
import { ErrorNote } from '../finance/ui';

const PAGE = 50;

type Entity = 'all' | 'orders' | 'bills' | 'menu_items' | 'staff' | 'stock_movements' | 'cash_closings' | 'coupons' | 'restaurants';

const FILTERS: Array<{ id: Entity; label: string }> = [
  { id: 'all', label: 'Everything' },
  { id: 'bills', label: 'Bills' },
  { id: 'orders', label: 'Orders' },
  { id: 'menu_items', label: 'Menu' },
  { id: 'staff', label: 'Staff' },
  { id: 'stock_movements', label: 'Stock' },
  { id: 'cash_closings', label: 'Cash' },
  { id: 'coupons', label: 'Coupons' },
  { id: 'restaurants', label: 'Settings' },
];

const ENTITY_ICON: Record<string, React.ReactNode> = {
  orders: <ListOrdered className="h-4 w-4" />,
  bills: <Receipt className="h-4 w-4" />,
  menu_items: <UtensilsCrossed className="h-4 w-4" />,
  staff: <UsersRound className="h-4 w-4" />,
  stock_movements: <Boxes className="h-4 w-4" />,
  cash_closings: <Wallet className="h-4 w-4" />,
  coupons: <TicketPercent className="h-4 w-4" />,
  restaurants: <Settings className="h-4 w-4" />,
};

/** Actions that deserve a second look get a warm tint. */
const ATTENTION = new Set(['bill.refunded', 'order.cancelled', 'order.payment_refunded', 'menu.item_deleted', 'staff.removed', 'stock.waste']);

function n(v: unknown): number {
  const x = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}

function s(v: unknown): string {
  return typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v);
}

function role(v: unknown): string {
  const r = s(v) as StaffRole;
  return STAFF_ROLE_LABEL[r] ?? s(v);
}

function signed(v: number): string {
  const r = Math.round(v * 1000) / 1000;
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r).toLocaleString('en-IN')}`;
}

/** One readable line per audit action. Unknown actions fall back to the raw action name. */
export function describe(e: AuditEntry, tables: DiningTable[]): string {
  const d = e.detail ?? {};
  const table = (id: unknown) => tables.find((t) => t.id === id)?.label ?? 'another table';
  const parts = (...xs: Array<string | false | null | undefined>) => xs.filter(Boolean).join(' · ');
  switch (e.action) {
    case 'bill.settled': {
      const orders = n(d.orders);
      return parts(
        `Bill ${billCode(n(d.bill_number))} settled`,
        formatINR(n(d.total)),
        n(d.discount) > 0 && `${formatINR(n(d.discount))} discount`,
        n(d.tip) > 0 && `${formatINR(n(d.tip))} tip`,
        orders > 1 && `${orders} orders`,
      );
    }
    case 'bill.refunded':
      return parts(`Bill ${billCode(n(d.bill_number))} refunded`, formatINR(n(d.total)), s(d.reason) && `“${s(d.reason)}”`);
    case 'order.cancelled': {
      const was = ORDER_STATUS_LABEL[s(d.was) as OrderStatus];
      return parts(`Order ${orderCode(n(d.order_number))} cancelled`, formatINR(n(d.total)), was && `was ${was.toLowerCase()}`);
    }
    case 'order.payment_paid':
      return parts(`Order ${orderCode(n(d.order_number))} marked paid`, formatINR(n(d.total)));
    case 'order.payment_refunded':
      return parts(`Order ${orderCode(n(d.order_number))} marked refunded`, formatINR(n(d.total)));
    case 'order.table_moved':
      return `Order ${orderCode(n(d.order_number))} moved from ${table(d.from)} to ${table(d.to)}`;
    case 'menu.item_added':
      return `${s(d.name)} added to the menu at ${formatINR(n(d.price))}`;
    case 'menu.item_deleted':
      return `${s(d.name)} deleted from the menu (was ${formatINR(n(d.price))})`;
    case 'menu.price_changed':
      return `${s(d.name)} price ${formatINR(n(d.from))} → ${formatINR(n(d.to))}`;
    case 'menu.sold_out':
      return `${s(d.name)} marked sold out`;
    case 'menu.back_in_stock':
      return `${s(d.name)} back in stock`;
    case 'staff.joined':
      return `${s(d.name)} joined the team as ${role(d.role)}`;
    case 'staff.removed':
      return `${s(d.name)} removed from the team (${role(d.role)})`;
    case 'staff.role_changed':
      return `${s(d.name)}’s role changed from ${role(d.from)} to ${role(d.to)}`;
    case 'stock.waste':
      return parts(`Waste recorded: ${Math.abs(n(d.change)).toLocaleString('en-IN')} of ${s(d.ingredient) || 'an ingredient'}`, s(d.note) && `“${s(d.note)}”`);
    case 'stock.adjustment':
      return parts(`Stock count for ${s(d.ingredient) || 'an ingredient'}: ${signed(n(d.change))}`, s(d.note) && `“${s(d.note)}”`);
    case 'stock.opening':
      return parts(`Opening stock for ${s(d.ingredient) || 'an ingredient'}: ${signed(n(d.change))}`, s(d.note) && `“${s(d.note)}”`);
    case 'cash.day_closed': {
      const v = Math.round(n(d.variance) * 100) / 100;
      const verdict = v === 0 ? 'exact' : v < 0 ? `short by ${formatINR(-v)}` : `over by ${formatINR(v)}`;
      const date = s(d.date).slice(0, 10);
      return parts(`Cash closed for ${date ? dayLabel(date) : 'the day'}`, `expected ${formatINR(n(d.expected))}, counted ${formatINR(n(d.counted))}`, verdict);
    }
    case 'coupon.insert':
      return `Coupon ${s(d.code)} created`;
    case 'coupon.update':
      return `Coupon ${s(d.code)} updated${d.active === false ? ' (paused)' : d.active === true ? ' (active)' : ''}`;
    case 'coupon.delete':
      return `Coupon ${s(d.code)} deleted`;
    case 'settings.changed':
      return parts(
        'Settings changed',
        `GST ${n(d.tax_rate)}%`,
        `service charge ${n(d.service_charge_rate)}%`,
        d.upi_changed === true && 'UPI ID changed',
        d.is_open === true ? 'open for orders' : d.is_open === false ? 'closed for orders' : null,
      );
    default:
      return e.action.replace(/[._]/g, ' ');
  }
}

export function ActivityTab() {
  const { token, tables } = useAdmin();
  const [entity, setEntity] = React.useState<Entity>('all');
  const [entries, setEntries] = React.useState<AuditEntry[] | null>(null);
  const [hasMore, setHasMore] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const req = React.useRef(0);

  const load = React.useCallback(async () => {
    const id = ++req.current;
    try {
      const rows = await adminApi.audit(token, { limit: PAGE, entity: entity === 'all' ? undefined : entity });
      if (id !== req.current) return;
      setEntries(rows);
      setHasMore(rows.length === PAGE);
      setError(null);
    } catch (e) {
      if (id !== req.current) return;
      setError(errorMessage(e, 'Could not load the activity log.'));
      setEntries((x) => x ?? []);
    }
  }, [token, entity]);

  React.useEffect(() => {
    setEntries(null);
    void load();
  }, [load]);

  const loadMore = async () => {
    const last = entries?.[entries.length - 1];
    if (!last) return;
    const id = req.current;
    setLoadingMore(true);
    try {
      const rows = await adminApi.audit(token, { limit: PAGE, entity: entity === 'all' ? undefined : entity, before: last.id });
      if (id !== req.current) return;
      setEntries((x) => [...(x ?? []), ...rows.filter((r) => !(x ?? []).some((y) => y.id === r.id))]);
      setHasMore(rows.length === PAGE);
    } catch (e) {
      setError(errorMessage(e, 'Could not load older activity.'));
    } finally {
      setLoadingMore(false);
    }
  };

  // Group by IST day for scanning.
  const groups = React.useMemo(() => {
    const m = new Map<string, AuditEntry[]>();
    for (const e of entries ?? []) {
      const k = istKey(new Date(e.created_at).getTime());
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return [...m.entries()];
  }, [entries]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <ChipRow label="Filter activity" className="sm:flex-1">
          {FILTERS.map((f) => (
            <Chip key={f.id} active={entity === f.id} onClick={() => setEntity(f.id)}>
              {f.label}
            </Chip>
          ))}
        </ChipRow>
        <Button
          variant="outline"
          size="sm"
          loading={refreshing}
          leftIcon={<RefreshCw className="h-4 w-4" />}
          className="self-start"
          onClick={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        >
          Refresh
        </Button>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <Card>
        <CardBody>
          {entries === null ? (
            <div className="space-y-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded-xl" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <EmptyState
              icon={<History className="h-5 w-5" />}
              title="Nothing recorded yet"
              description="Bills, refunds, cancellations, price changes, stock counts, cash closes and team changes are recorded here automatically."
              className="py-10"
            />
          ) : (
            <div className="space-y-5">
              {groups.map(([day, rows]) => (
                <section key={day} aria-label={relativeDayLabel(day)}>
                  <h4 className="mb-1 font-mono text-2xs uppercase tracking-[0.16em] text-muted">{relativeDayLabel(day)}</h4>
                  <ul className="divide-y divide-line/5">
                    {rows.map((e) => (
                      <li key={e.id} className="flex items-start gap-3 py-2.5">
                        <span
                          className={cn(
                            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                            ATTENTION.has(e.action) ? 'bg-rose-soft text-[#a1282c]' : 'bg-sunk text-fg/70',
                          )}
                          aria-hidden
                        >
                          {ENTITY_ICON[e.entity] ?? <History className="h-4 w-4" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm leading-snug">{describe(e, tables)}</p>
                          <p className="mt-0.5 text-xs text-muted">
                            <span className="font-medium text-fg/70">{e.actor_name || 'Unknown'}</span>
                            <span aria-hidden> · </span>
                            <time dateTime={e.created_at} title={formatDateTime(e.created_at)} className="tnum font-mono">
                              {formatTime(e.created_at)}
                            </time>
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              {hasMore && (
                <div className="flex justify-center pt-1">
                  <Button variant="outline" size="sm" loading={loadingMore} onClick={() => void loadMore()}>
                    Load more
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
