'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { BellRing, Check, ChefHat, ClipboardList, CookingPot, ShoppingBag, XCircle, type LucideIcon } from 'lucide-react';
import type { OrderStatus, OrderWithItems } from '@restaurant-os/shared';
import { ORDER_FLOW } from '@restaurant-os/shared';
import { cn } from '@/lib/utils';
import { EASE_OUT } from '@/lib/motion';
import { formatIstTime } from './hours';

/** Takeaway wording for each status. */
export const PICKUP_LABEL: Record<OrderStatus, string> = {
  placed: 'Placed',
  accepted: 'Accepted',
  preparing: 'Preparing',
  ready: 'Ready for pickup',
  served: 'Picked up',
  cancelled: 'Cancelled',
};

export const PICKUP_COPY: Record<OrderStatus, string> = {
  placed: 'Sent to the kitchen. They will accept it in a moment.',
  accepted: 'The kitchen has your order.',
  preparing: 'Being prepared right now.',
  ready: 'Ready. Collect it at the counter.',
  served: 'Picked up. Enjoy your meal!',
  cancelled: 'This order was cancelled. If that is a mistake, call the restaurant.',
};

const ICONS: Record<OrderStatus, LucideIcon> = {
  placed: ClipboardList,
  accepted: ChefHat,
  preparing: CookingPot,
  ready: BellRing,
  served: ShoppingBag,
  cancelled: XCircle,
};

/** Placed → Accepted → Preparing → Ready for pickup → Picked up, compact and vertical. */
export function PickupTimeline({ order }: { order: OrderWithItems }) {
  const reduce = useReducedMotion();
  const cancelled = order.status === 'cancelled';
  const current = cancelled ? -1 : ORDER_FLOW.indexOf(order.status);
  const stamps: Record<OrderStatus, string | null> = {
    placed: order.placed_at,
    accepted: order.accepted_at,
    preparing: order.status === 'preparing' ? order.updated_at : null,
    ready: order.ready_at,
    served: order.served_at,
    cancelled: order.cancelled_at,
  };

  if (cancelled) {
    return (
      <div className="flex items-start gap-3 rounded-2xl bg-rose-soft p-4 text-[#a1282c]">
        <XCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <p className="min-w-0 text-sm">{PICKUP_COPY.cancelled}</p>
      </div>
    );
  }

  return (
    <ol className="relative">
      {ORDER_FLOW.map((s, i) => {
        const done = i < current;
        const now = i === current;
        const Icon = ICONS[s];
        const last = i === ORDER_FLOW.length - 1;
        const stamp = stamps[s];
        return (
          <li key={s} className={cn('relative flex gap-3.5', !last && 'pb-5')}>
            {!last && (
              <span className="absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-0.5 overflow-hidden rounded bg-line/10" aria-hidden>
                <motion.span
                  className="block h-full w-full origin-top rounded bg-ember"
                  initial={reduce ? false : { scaleY: 0 }}
                  animate={{ scaleY: done ? 1 : 0 }}
                  transition={{ duration: reduce ? 0 : 0.6, ease: EASE_OUT }}
                />
              </span>
            )}
            <span className="relative flex h-7 w-7 shrink-0 items-center justify-center">
              {now && !reduce && <span className="absolute inset-0 animate-pulse-ring rounded-full bg-ember/40" aria-hidden />}
              <span
                className={cn(
                  'relative flex h-7 w-7 items-center justify-center rounded-full border-2',
                  done || now ? 'border-ember bg-ember text-white' : 'border-line/15 bg-surface text-muted',
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> : <Icon className="h-3.5 w-3.5" aria-hidden />}
              </span>
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className={cn('text-[14.5px] font-semibold leading-tight', !done && !now && 'text-muted')}>
                  {PICKUP_LABEL[s]}
                  {now && <span className="sr-only"> (current step)</span>}
                </p>
                {stamp && (done || now) && (
                  <time dateTime={stamp} className="shrink-0 font-mono text-[11.5px] tnum text-muted">
                    {formatIstTime(stamp)}
                  </time>
                )}
              </div>
              {now && <p className="mt-0.5 text-[13px] text-fg/70">{PICKUP_COPY[s]}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
