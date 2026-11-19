'use client';

import * as React from 'react';
import { ArrowLeft, ArrowRightLeft, BellRing, CalendarClock, Plus, Printer, Wallet } from 'lucide-react';
import type { FloorTable } from '@restaurant-os/shared';
import { minutesSince, orderCode } from '@restaurant-os/shared';
import { cn, formatINR, formatTime } from '@/lib/utils';
import { Button, OrderStatusBadge, PaymentStatusBadge, Sheet } from '@/components/ui';
import { OrderItemsList, kotUrl } from '../order-card';
import { formatElapsed } from '../format';
import { FLOOR_STATE_META } from './floor-meta';

/** One table's open orders and what you can do with them. */
export function TableSheet({
  ft,
  allTables,
  now,
  canAct,
  moving,
  onClose,
  onAddItems,
  onSettle,
  onMove,
}: {
  ft: FloorTable | null;
  allTables: FloorTable[];
  now: number;
  canAct: boolean;
  moving: boolean;
  onClose: () => void;
  onAddItems: (ft: FloorTable) => void;
  onSettle: (ft: FloorTable) => void;
  onMove: (from: FloorTable, to: FloorTable) => void;
}) {
  const [picking, setPicking] = React.useState(false);
  const last = React.useRef<FloorTable | null>(ft);
  if (ft) last.current = ft;
  const t = last.current;
  const openId = ft?.table.id ?? null;

  React.useEffect(() => {
    setPicking(false);
  }, [openId]);

  const meta = t ? FLOOR_STATE_META[t.state] : null;
  const hasOrders = Boolean(t && t.open_orders.length > 0);
  const targets = t ? allTables.filter((x) => x.table.id !== t.table.id) : [];

  return (
    <Sheet
      open={Boolean(ft)}
      onClose={onClose}
      className="max-w-xl"
      title={t ? (picking ? `Move ${t.table.label} to…` : t.table.label) : undefined}
      description={
        t && meta
          ? picking
            ? 'Pick a free table to move the guests, or a busy one to merge both bills into one table.'
            : `${t.table.area ? `${t.table.area} · ` : ''}${t.table.seats} seats · ${meta.label}${t.since ? ` · seated ${formatElapsed(minutesSince(t.since, now))}` : ''}`
          : undefined
      }
      footer={
        t && canAct && !picking ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Button variant="outline" onClick={() => onAddItems(t)} leftIcon={<Plus className="h-4 w-4" />}>
              {hasOrders ? 'Add items' : 'Take order'}
            </Button>
            <Button variant="outline" onClick={() => setPicking(true)} disabled={!hasOrders} leftIcon={<ArrowRightLeft className="h-4 w-4" />}>
              Move / merge
            </Button>
            <Button onClick={() => onSettle(t)} disabled={!hasOrders} leftIcon={<Wallet className="h-4 w-4" />} className="col-span-2 sm:col-span-1">
              Settle bill
            </Button>
          </div>
        ) : undefined
      }
    >
      {t && (picking ? (
        <div>
          <button type="button" onClick={() => setPicking(false)} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted transition hover:text-fg">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back to {t.table.label}
          </button>
          {targets.length === 0 ? (
            <p className="rounded-xl bg-sunk px-3.5 py-3 text-sm text-muted">There is no other active table to move to.</p>
          ) : (
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {targets.map((x) => {
                const m = FLOOR_STATE_META[x.state];
                const busy = x.open_orders.length > 0;
                return (
                  <li key={x.table.id}>
                    <button
                      type="button"
                      disabled={moving}
                      onClick={() => onMove(t, x)}
                      className="flex w-full items-center gap-3 rounded-xl border border-line/10 px-3 py-2.5 text-left transition hover:border-line/30 hover:bg-sunk/50 disabled:opacity-60"
                    >
                      <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', m.dot)} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{x.table.label}</span>
                        <span className="block truncate text-xs text-muted">
                          {x.table.area ? `${x.table.area} · ` : ''}
                          {x.table.seats} seats · {m.label}
                        </span>
                      </span>
                      <span className={cn('shrink-0 font-mono text-2xs font-medium uppercase tracking-[0.12em]', busy ? 'text-ember-3' : 'text-[#1b6f49]')}>
                        {busy ? `Merge · ${formatINR(x.open_total)}` : 'Move'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {(t.open_calls > 0 || t.next_reservation) && (
            <div className="space-y-1.5">
              {t.open_calls > 0 && (
                <p className="flex items-center gap-2 rounded-xl bg-saffron-soft px-3.5 py-2.5 text-sm font-medium text-[#8a5a00]">
                  <BellRing className="h-4 w-4 shrink-0" aria-hidden />
                  {t.bill_requested ? 'The guest asked for the bill.' : `${t.open_calls} open call${t.open_calls === 1 ? '' : 's'} from this table.`} Attend calls on the Calls page.
                </p>
              )}
              {t.next_reservation && (
                <p className="flex items-center gap-2 rounded-xl bg-sky-soft px-3.5 py-2.5 text-sm font-medium text-[#245a9f]">
                  <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
                  Booked for {formatTime(t.next_reservation.reserved_for)}: {t.next_reservation.customer_name}, party of {t.next_reservation.party_size}
                </p>
              )}
            </div>
          )}

          {!hasOrders ? (
            <p className="rounded-xl border border-dashed border-line/15 px-4 py-6 text-center text-sm text-muted">
              No open orders on this table. {canAct ? 'Take an order from the counter.' : ''}
            </p>
          ) : (
            <>
              <ul className="space-y-3">
                {t.open_orders.map((o) => (
                  <li key={o.id} className="rounded-2xl border border-line/10 p-3.5">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="tnum font-mono font-semibold">{orderCode(o.order_number)}</span>
                      <OrderStatusBadge status={o.status} />
                      {o.payment_status === 'claimed' && <PaymentStatusBadge status={o.payment_status} />}
                      <span className="tnum ml-auto font-mono text-xs text-muted">{formatTime(o.placed_at)}</span>
                    </div>
                    <OrderItemsList items={o.items} addedAt={o.items_added_at} />
                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-line/5 pt-2.5">
                      <a
                        href={kotUrl(o.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-fg/80 transition hover:bg-sunk hover:text-fg"
                      >
                        <Printer className="h-3.5 w-3.5" aria-hidden /> Print KOT
                      </a>
                      <span className="tnum font-mono text-sm font-semibold">{formatINR(Number(o.total))}</span>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex items-baseline justify-between rounded-2xl bg-sunk/70 px-4 py-3">
                <span className="font-semibold">Open total</span>
                <span className="tnum font-display text-xl font-semibold">{formatINR(t.open_total)}</span>
              </div>
              <p className="text-xs text-muted">Before any bill discount or tip. The bill shows the exact GST split.</p>
            </>
          )}
        </div>
      ))}
    </Sheet>
  );
}
