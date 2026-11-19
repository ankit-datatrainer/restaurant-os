'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { LayoutGrid, Monitor, Package, Plus, Printer, RefreshCw, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import type { FloorResponse, FloorTable, FloorTableState, OrderWithItems } from '@restaurant-os/shared';
import { ORDER_SOURCE_LABEL, orderCode } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { cn, formatINR, formatTime } from '@/lib/utils';
import { pop } from '@/lib/motion';
import { Badge, Button, EmptyState, OrderStatusBadge, Skeleton } from '@/components/ui';
import { useAdmin, useAdminEvents } from '../admin-provider';
import { Chip, ChipRow, PageHeader } from '../page-header';
import { useConfirm } from '../confirm-dialog';
import { errorMessage, itemCount } from '../format';
import { kotUrl } from '../order-card';
import { useNow } from '../use-now';
import { SettleSheet } from '../settle-sheet';
import { openDisplayWindow, useDisplayResponder } from '../customer-display';
import { FLOOR_STATES, FLOOR_STATE_META } from './floor-meta';
import { FloorTableCard } from './floor-table-card';
import { TableSheet } from './table-sheet';

const REFRESH_MS = 10_000;

export function FloorView() {
  const { token, staff, restaurant } = useAdmin();
  const router = useRouter();
  const reduce = useReducedMotion();
  const now = useNow(30_000);
  const { confirm, dialog } = useConfirm();
  useDisplayResponder(restaurant);
  const canAct = staff.role !== 'kitchen';

  const [data, setData] = React.useState<FloorResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [filter, setFilter] = React.useState<'all' | FloorTableState>('all');
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [moving, setMoving] = React.useState(false);
  const [settle, setSettle] = React.useState<{ orders: OrderWithItems[]; ids: string[] } | null>(null);
  const inFlight = React.useRef(false);

  const load = React.useCallback(
    async (manual = false) => {
      if (inFlight.current && !manual) return;
      inFlight.current = true;
      if (manual) setRefreshing(true);
      try {
        const res = await adminApi.floor(token);
        setData(res);
        setError(null);
      } catch (e) {
        setError(errorMessage(e, 'Could not load the floor.'));
      } finally {
        inFlight.current = false;
        if (manual) setRefreshing(false);
      }
    },
    [token],
  );

  React.useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  // Orders and calls change the floor: refetch shortly after (several events → one fetch).
  const debounce = React.useRef<number | null>(null);
  useAdminEvents((e) => {
    if (e.type === 'sync') return;
    if (debounce.current) window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => void load(), 600);
  });
  React.useEffect(
    () => () => {
      if (debounce.current) window.clearTimeout(debounce.current);
    },
    [],
  );

  const tables = React.useMemo(() => data?.tables ?? [], [data]);
  const counts = React.useMemo(() => {
    const c: Record<FloorTableState, number> = { free: 0, ordering: 0, in_kitchen: 0, served: 0, bill_requested: 0, reserved: 0 };
    for (const t of tables) c[t.state] += 1;
    return c;
  }, [tables]);

  const visible = filter === 'all' ? tables : tables.filter((t) => t.state === filter);
  const openTable = tables.find((t) => t.table.id === openId) ?? null;
  const takeaway = data?.takeaway ?? [];
  const openTotal = tables.reduce((s, t) => s + t.open_total, 0);

  const startSettle = (orders: OrderWithItems[]) => {
    setOpenId(null);
    setSettle({ orders, ids: orders.map((o) => o.id) });
  };

  const move = async (from: FloorTable, to: FloorTable) => {
    const merge = to.open_orders.length > 0;
    const n = from.open_orders.length;
    const ok = await confirm({
      title: merge ? `Merge ${from.table.label} into ${to.table.label}?` : `Move ${from.table.label} to ${to.table.label}?`,
      description: merge
        ? `${to.table.label} already has ${to.open_orders.length} open order${to.open_orders.length === 1 ? '' : 's'}. The ${n} order${n === 1 ? '' : 's'} from ${from.table.label} join them, and you settle both on one bill.`
        : `The ${n} open order${n === 1 ? '' : 's'} move to ${to.table.label}. ${from.table.label} becomes free.`,
      confirmLabel: merge ? 'Merge tables' : 'Move guests',
    });
    if (!ok) return;
    setMoving(true);
    try {
      const res = await adminApi.transferTable(token, from.table.id, to.table.id);
      toast.success(`${res.moved} order${res.moved === 1 ? '' : 's'} moved to ${to.table.label}.`);
      setOpenId(to.table.id);
      await load(true);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not move the orders.'));
    } finally {
      setMoving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader
        title="Floor"
        description={
          data
            ? `${tables.length - counts.free - counts.reserved} of ${tables.length} tables occupied · ${formatINR(openTotal)} open on tables. Updates every few seconds.`
            : 'Every table at a glance: who is ordering, eating or waiting for the bill.'
        }
        actions={
          <>
            <Button variant="outline" size="sm" leftIcon={<Monitor className="h-4 w-4" />} onClick={openDisplayWindow}>
              Customer display
            </Button>
            <Button variant="outline" size="sm" leftIcon={<RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />} onClick={() => void load(true)}>
              Refresh
            </Button>
            {canAct && (
              <Button href="/admin/pos" size="sm" leftIcon={<Plus className="h-4 w-4" />}>
                New order
              </Button>
            )}
          </>
        }
      />

      {/* Summary chips double as the colour legend. */}
      <ChipRow label="Filter tables by state" className="mb-4">
        <Chip active={filter === 'all'} onClick={() => setFilter('all')} count={tables.length}>
          All tables
        </Chip>
        {FLOOR_STATES.map((s) => (
          <Chip key={s} active={filter === s} onClick={() => setFilter(filter === s ? 'all' : s)} count={counts[s]}>
            <span className={cn('h-2 w-2 rounded-full', FLOOR_STATE_META[s].dot)} aria-hidden />
            {FLOOR_STATE_META[s].label}
          </Chip>
        ))}
      </ChipRow>

      {error && (
        <div className="mb-4 flex flex-col gap-3 rounded-xl bg-rose-soft px-4 py-3 text-sm font-medium text-[#a1282c] sm:flex-row sm:items-center" role="alert">
          <p className="flex-1">The floor did not load. {error}</p>
          <Button variant="outline" size="sm" loading={refreshing} leftIcon={<RefreshCw className="h-4 w-4" />} onClick={() => void load(true)} className="shrink-0 self-start sm:self-auto">
            Try again
          </Button>
        </div>
      )}

      {takeaway.length > 0 && (
        <section aria-labelledby="takeaway-title" className="mb-6">
          <h3 id="takeaway-title" className="mb-2 flex items-center gap-2">
            <Package className="h-4 w-4 text-muted" aria-hidden />
            <span className="eyebrow">Takeaway &amp; online · unpaid</span>
            <span className="tnum rounded-full bg-sunk px-1.5 font-mono text-2xs text-muted">{takeaway.length}</span>
          </h3>
          <ul className="no-scrollbar -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
            {takeaway.map((o) => (
              <li key={o.id} className="w-[300px] max-w-[85vw] shrink-0 snap-start">
                <TakeawayCard order={o} canAct={canAct} onSettle={() => startSettle([o])} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {data === null ? (
        error ? null : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} className="h-[132px] rounded-2xl" />
          ))}
        </div>
        )
      ) : tables.length === 0 ? (
        <EmptyState
          icon={<LayoutGrid className="h-5 w-5" />}
          title="No active tables"
          description="Add tables (or switch them on) on the Tables page to see them here."
          action={<Button href="/admin/tables" variant="outline">Open Tables</Button>}
        />
      ) : visible.length === 0 ? (
        <EmptyState icon={<LayoutGrid className="h-5 w-5" />} title={`No tables are ${FLOOR_STATE_META[filter as FloorTableState].label.toLowerCase()}`} description="Pick another state above." />
      ) : (
        <motion.ul layout={!reduce} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          <AnimatePresence initial={false}>
            {visible.map((ft) => (
              <motion.li key={ft.table.id} layout={!reduce} variants={pop} initial={reduce ? false : 'hidden'} animate="show" exit="exit">
                <FloorTableCard ft={ft} now={now} onOpen={(t) => setOpenId(t.table.id)} />
              </motion.li>
            ))}
          </AnimatePresence>
        </motion.ul>
      )}

      <TableSheet
        ft={openTable}
        allTables={tables}
        now={now}
        canAct={canAct}
        moving={moving}
        onClose={() => setOpenId(null)}
        onAddItems={(t) => router.push(`/admin/pos?table=${t.table.id}`)}
        onSettle={(t) => startSettle(t.open_orders)}
        onMove={(from, to) => void move(from, to)}
      />

      <SettleSheet
        open={Boolean(settle)}
        onClose={() => setSettle(null)}
        orders={settle?.orders ?? []}
        preselectedIds={settle?.ids}
        onSettled={() => void load(true)}
      />
      {dialog}
    </div>
  );
}

function TakeawayCard({ order, canAct, onSettle }: { order: OrderWithItems; canAct: boolean; onSettle: () => void }) {
  const n = itemCount(order);
  return (
    <article className="flex h-full flex-col rounded-2xl border border-line/10 bg-surface p-3.5 shadow-soft">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="tnum whitespace-nowrap font-mono font-semibold">{orderCode(order.order_number)}</span>
        <Badge tone={order.source === 'online' ? 'sky' : 'neutral'}>{ORDER_SOURCE_LABEL[order.source]}</Badge>
        <OrderStatusBadge status={order.status} className="ml-auto" />
      </div>
      <p className="mt-2 truncate font-medium">{order.guest_name || 'Walk-in guest'}</p>
      <p className="text-xs text-muted">
        {order.pickup_at ? (
          <>
            Pickup <span className="tnum font-mono font-semibold text-fg">{formatTime(order.pickup_at)}</span>
          </>
        ) : (
          'Pickup when ready'
        )}{' '}
        · {n} item{n === 1 ? '' : 's'}
      </p>
      <div className="mt-auto flex items-center gap-1.5 pt-3">
        <span className="tnum mr-auto font-mono font-semibold">{formatINR(Number(order.total))}</span>
        <a
          href={kotUrl(order.id)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-fg/70 transition hover:bg-sunk hover:text-fg"
          aria-label={`Print KOT for ${orderCode(order.order_number)}`}
        >
          <Printer className="h-4 w-4" />
        </a>
        {canAct && (
          <Button size="sm" onClick={onSettle} leftIcon={<Wallet className="h-4 w-4" />}>
            Settle
          </Button>
        )}
      </div>
    </article>
  );
}
