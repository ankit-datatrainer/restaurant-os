'use client';

import * as React from 'react';
import { BellRing, CalendarClock, Clock, Receipt, Users } from 'lucide-react';
import type { FloorTable } from '@restaurant-os/shared';
import { minutesSince } from '@restaurant-os/shared';
import { cn, formatINR, formatTime } from '@/lib/utils';
import { formatElapsed } from '../format';
import { FLOOR_STATE_META } from './floor-meta';

export function FloorTableCard({ ft, now, onOpen }: { ft: FloorTable; now: number; onOpen: (ft: FloorTable) => void }) {
  const meta = FLOOR_STATE_META[ft.state];
  const hasOrders = ft.open_orders.length > 0;
  const resv = ft.next_reservation;
  return (
    <button
      type="button"
      onClick={() => onOpen(ft)}
      className={cn(
        'group relative flex h-full min-h-[132px] w-full flex-col rounded-2xl border p-3.5 text-left shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift active:scale-[0.98] motion-reduce:transform-none',
        meta.card,
      )}
      aria-label={`${ft.table.label}, ${meta.label}${hasOrders ? `, ${formatINR(ft.open_total)} open` : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-semibold leading-tight">{ft.table.label}</p>
          <p className="flex items-center gap-1 truncate text-xs text-muted">
            <Users className="h-3 w-3 shrink-0" aria-hidden />
            <span className="tnum">{ft.table.seats}</span>
            {ft.table.area ? <span className="truncate"> · {ft.table.area}</span> : null}
          </p>
        </div>
        {ft.open_calls > 0 && (
          <span
            className="tnum inline-flex shrink-0 items-center gap-1 rounded-full bg-saffron px-2 py-0.5 font-mono text-[11px] font-semibold text-ink"
            title={`${ft.open_calls} open call${ft.open_calls === 1 ? '' : 's'}`}
          >
            <BellRing className="h-3 w-3" aria-hidden />
            {ft.open_calls}
          </span>
        )}
      </div>

      <p className={cn('mt-2 inline-flex items-center gap-1.5 font-mono text-2xs font-medium uppercase tracking-[0.12em]', meta.text)}>
        <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot, ft.state === 'bill_requested' && 'animate-pulse')} aria-hidden />
        {meta.label}
      </p>

      <div className="mt-auto pt-2">
        {hasOrders ? (
          <div className="flex items-end justify-between gap-2">
            <span className="tnum font-mono text-base font-semibold">{formatINR(ft.open_total)}</span>
            {ft.since && (
              <span className="tnum inline-flex items-center gap-1 font-mono text-xs text-muted">
                <Clock className="h-3 w-3" aria-hidden />
                {formatElapsed(minutesSince(ft.since, now))}
              </span>
            )}
          </div>
        ) : !resv ? (
          <span className="text-xs text-muted">Tap to take an order</span>
        ) : null}
        {ft.bill_requested && (
          <p className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-rose px-1.5 py-0.5 text-[11px] font-semibold text-white">
            <Receipt className="h-3 w-3" aria-hidden /> Bill asked
          </p>
        )}
        {resv && (
          <p className="mt-1.5 flex items-center gap-1 truncate text-xs text-[#245a9f]">
            <CalendarClock className="h-3 w-3 shrink-0" aria-hidden />
            <span className="tnum font-mono">{formatTime(resv.reserved_for)}</span>
            <span className="truncate">
              · {resv.customer_name} ({resv.party_size})
            </span>
          </p>
        )}
      </div>
    </button>
  );
}
