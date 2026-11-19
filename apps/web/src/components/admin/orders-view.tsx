'use client';

import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Inbox, RefreshCw, Search } from 'lucide-react';
import type { OrderStatus, OrderWithItems } from '@restaurant-os/shared';
import { ORDER_STATUS_LABEL, orderCode } from '@restaurant-os/shared';
import { adminApi, type OrdersFilter } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button, EmptyState, Input, Select, Skeleton } from '@/components/ui';
import { pop } from '@/lib/motion';
import { useAdmin, useAdminEvents, isActiveStatus, mergeOrder } from './admin-provider';
import { OrderCard } from './order-card';
import { SettleSheet } from './settle-sheet';
import { Chip, ChipRow, PageHeader } from './page-header';
import { useConfirm } from './confirm-dialog';
import { errorMessage } from './format';
import { useNow } from './use-now';

type Tab = 'active' | 'past' | 'all';
type StatusChip = 'all' | OrderStatus;

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'active', label: 'New & active' },
  { id: 'past', label: 'Old & past' },
  { id: 'all', label: 'All' },
];

const CHIPS: Record<Tab, StatusChip[]> = {
  active: ['all', 'placed', 'accepted', 'preparing', 'ready'],
  past: ['all', 'served', 'cancelled'],
  all: ['all', 'placed', 'accepted', 'preparing', 'ready', 'served', 'cancelled'],
};

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function OrdersView() {
  const { token, orders: activeOrders, tables, loading: ctxLoading, setOrderStatus, setPaymentStatus, staff } = useAdmin();
  const [settling, setSettling] = React.useState<OrderWithItems | null>(null);
  const { confirm, dialog } = useConfirm();
  const now = useNow(30_000);
  const reduce = useReducedMotion();

  const [tab, setTab] = React.useState<Tab>('active');
  const [chip, setChip] = React.useState<StatusChip>('all');
  const [tableId, setTableId] = React.useState('');
  const [q, setQ] = React.useState('');
  const dq = useDebounced(q.trim(), 300);
  const [fetched, setFetched] = React.useState<OrderWithItems[] | null>(null);
  const [fetching, setFetching] = React.useState(false);
  const [counts, setCounts] = React.useState<Partial<Record<Tab, number>>>({});
  const [busy, setBusy] = React.useState<Set<string>>(new Set());

  // The live active list comes from the provider; everything else is fetched on demand.
  const useFetched = tab !== 'active' || dq !== '';

  const load = React.useCallback(async () => {
    if (!useFetched) return;
    setFetching(true);
    try {
      const filter: OrdersFilter = { scope: tab, limit: 200 };
      if (dq) filter.q = dq;
      const list = await adminApi.orders(token, filter);
      setFetched(list);
      if (!dq) setCounts((c) => ({ ...c, [tab]: list.length }));
    } catch (e) {
      setFetched([]);
      // Surface via the empty state; toast would be noisy on every keystroke.
      console.error(errorMessage(e));
    } finally {
      setFetching(false);
    }
  }, [useFetched, tab, dq, token]);

  React.useEffect(() => {
    setFetched(null);
    void load();
  }, [load]);

  React.useEffect(() => {
    setChip('all');
  }, [tab]);

  useAdminEvents((e) => {
    if (e.type === 'order:update') {
      setFetched((prev) => (prev ? prev.map((o) => (o.id === e.order.id ? mergeOrder(o, e.order) : o)) : prev));
    } else if (e.type === 'order:new' && tab === 'all' && !dq) {
      setFetched((prev) => (prev && !prev.some((o) => o.id === e.order.id) ? [e.order, ...prev] : prev));
    }
  });

  const source: OrderWithItems[] = useFetched ? (fetched ?? []) : activeOrders;
  const visible = React.useMemo(() => {
    let list = source;
    if (tab === 'past') list = list.filter((o) => !isActiveStatus(o.status));
    if (chip !== 'all') list = list.filter((o) => o.status === chip);
    if (tableId) list = list.filter((o) => o.table_id === tableId);
    return list;
  }, [source, tab, chip, tableId]);

  const mark = (id: string, on: boolean) =>
    setBusy((prev) => {
      const n = new Set(prev);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  const advance = async (order: OrderWithItems, next: OrderStatus) => {
    mark(order.id, true);
    await setOrderStatus(order, next);
    mark(order.id, false);
  };

  const cancel = async (order: OrderWithItems) => {
    const ok = await confirm({
      title: `Cancel ${orderCode(order.order_number)}?`,
      description: 'The guest will see the order as cancelled. This cannot be undone.',
      confirmLabel: 'Cancel order',
      cancelLabel: 'Keep it',
      danger: true,
    });
    if (!ok) return;
    mark(order.id, true);
    await setOrderStatus(order, 'cancelled');
    mark(order.id, false);
  };

  const togglePaid = async (order: OrderWithItems) => {
    mark(order.id, true);
    await setPaymentStatus(order, order.payment_status === 'paid' ? 'pending' : 'paid');
    mark(order.id, false);
  };

  const isLoading = useFetched ? fetching && fetched === null : ctxLoading;
  const tabCount = (t: Tab) => (t === 'active' ? activeOrders.length : counts[t]);

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader
        title="Live orders"
        description="Every order from every table, newest first. Cards turn red after 20 minutes without being ready."
        actions={
          <Button variant="outline" size="sm" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={() => void load()} disabled={!useFetched || fetching}>
            Refresh
          </Button>
        }
      />

      <div className="sticky top-16 z-20 -mx-1 space-y-3 bg-bg/90 px-1 py-3 backdrop-blur md:top-16">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex rounded-full bg-sunk p-1" role="tablist" aria-label="Order scope">
            {TABS.map((t) => {
              const active = tab === t.id;
              const n = tabCount(t.id);
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={active}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'relative inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition lg:flex-none lg:px-4',
                    active ? 'text-fg' : 'text-muted hover:text-fg',
                  )}
                >
                  {active && <motion.span layoutId={reduce ? undefined : 'orders-tab'} className="absolute inset-0 rounded-full bg-surface shadow-soft" transition={{ type: 'spring', stiffness: 420, damping: 36 }} aria-hidden />}
                  <span className="relative">{t.label}</span>
                  {n !== undefined && <span className="tnum relative rounded-full bg-sunk px-1.5 font-mono text-2xs text-muted">{n}</span>}
                </button>
              );
            })}
          </div>

          <div className="flex flex-1 gap-2">
            <div className="flex-1">
              <Input
                aria-label="Search orders"
                placeholder="Search order no., table or dish…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                prefix={<Search className="h-4 w-4" />}
                className="h-10"
              />
            </div>
            <Select aria-label="Filter by table" value={tableId} onChange={(e) => setTableId(e.target.value)} className="h-10 w-[150px] sm:w-[180px]">
              <option value="">All tables</option>
              {tables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                  {t.area ? ` · ${t.area}` : ''}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <ChipRow label="Filter by status">
          {CHIPS[tab].map((c) => {
            const n = c === 'all' ? source.length : source.filter((o) => o.status === c).length;
            return (
              <Chip key={c} active={chip === c} onClick={() => setChip(c)} count={n}>
                {c === 'all' ? (tab === 'active' ? 'All active' : 'All') : ORDER_STATUS_LABEL[c]}
              </Chip>
            );
          })}
        </ChipRow>
      </div>

      <div className="mt-4">
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-64 w-full rounded-2xl" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-5 w-5" />}
            title={dq ? `Nothing matches “${dq}”` : tab === 'active' ? 'No active orders' : 'No orders here yet'}
            description={
              dq
                ? 'Try an order number like 1003, a table name or a dish.'
                : tab === 'active'
                  ? 'New orders chime in here the moment a guest places them.'
                  : 'Served and cancelled orders show up in this tab.'
            }
          />
        ) : (
          <motion.ul layout={!reduce} className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            <AnimatePresence initial={false}>
              {visible.map((o) => (
                <motion.li key={o.id} layout={!reduce} variants={pop} initial={reduce ? false : 'hidden'} animate="show" exit="exit">
                  <OrderCard order={o} now={now} busy={busy.has(o.id)} onAdvance={advance} onCancel={cancel} onTogglePaid={togglePaid} onSettle={staff.role === 'kitchen' ? undefined : setSettling} className="h-full" />
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
        )}
      </div>
      {dialog}
      <SettleSheet open={settling !== null} onClose={() => setSettling(null)} orders={settling ? [settling] : []} preselectedIds={settling ? [settling.id] : undefined} />
    </div>
  );
}
