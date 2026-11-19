'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { BellRing, Check, ChefHat, ClipboardList, CookingPot, UtensilsCrossed, XCircle, type LucideIcon } from 'lucide-react';
import type { OrderStatus, OrderWithItems } from '@restaurant-os/shared';
import { ORDER_FLOW, ORDER_STATUS_GUEST_COPY, ORDER_STATUS_LABEL } from '@restaurant-os/shared';
import { cn, formatTime } from '@/lib/utils';
import { EASE_OUT } from '@/lib/motion';

const ICONS: Record<OrderStatus, LucideIcon> = {
  placed: ClipboardList,
  accepted: ChefHat,
  preparing: CookingPot,
  ready: BellRing,
  served: UtensilsCrossed,
  cancelled: XCircle,
};

/** Vertical Placed → Accepted → Preparing → Ready → Served timeline with a pulsing current step. */
export function OrderTimeline({ order }: { order: OrderWithItems }) {
  const reduce = useReducedMotion();
  const cancelled = order.status === 'cancelled';
  const currentIdx = cancelled ? -1 : ORDER_FLOW.indexOf(order.status);

  const stamps: Record<OrderStatus, string | null> = {
    placed: order.placed_at,
    accepted: order.accepted_at,
    preparing: order.status === 'preparing' ? order.updated_at : null,
    ready: order.ready_at,
    served: order.served_at,
    cancelled: order.cancelled_at,
  };

  return (
    <div>
      {cancelled && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl bg-rose-soft p-4 text-[#a1282c]">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <div className="min-w-0 text-sm">
            <p className="font-semibold">{ORDER_STATUS_GUEST_COPY.cancelled}</p>
            <p className="mt-0.5 opacity-80">
              {order.cancelled_at ? `At ${formatTime(order.cancelled_at)}. ` : ''}
              If this was a mistake, call a waiter and we will sort it out.
            </p>
          </div>
        </div>
      )}
      <ol className={cn('relative', cancelled && 'opacity-60')}>
        {ORDER_FLOW.map((s, i) => {
          const done = i < currentIdx;
          const current = i === currentIdx;
          const upcoming = i > currentIdx;
          const Icon = ICONS[s];
          const stamp = stamps[s];
          const last = i === ORDER_FLOW.length - 1;
          return (
            <motion.li
              key={s}
              className={cn('relative flex gap-4', !last && 'pb-7')}
              initial={reduce ? false : { opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: reduce ? 0 : i * 0.06, duration: 0.5, ease: EASE_OUT }}
            >
              {!last && (
                <span className="absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-0.5 overflow-hidden rounded bg-line/10" aria-hidden>
                  <motion.span
                    className="block h-full w-full origin-top rounded bg-ember"
                    initial={reduce ? false : { scaleY: 0 }}
                    animate={{ scaleY: done ? 1 : 0 }}
                    transition={{ duration: reduce ? 0 : 0.7, ease: EASE_OUT }}
                  />
                </span>
              )}
              <span className="relative flex h-8 w-8 shrink-0 items-center justify-center">
                {current && !reduce && <span className="absolute inset-0 animate-pulse-ring rounded-full bg-ember/40" aria-hidden />}
                <span
                  className={cn(
                    'relative flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors duration-500',
                    done ? 'border-ember bg-ember text-white' : current ? 'border-ember bg-ember text-white shadow-glow' : 'border-line/15 bg-surface text-muted',
                  )}
                >
                  {done ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden /> : <Icon className="h-4 w-4" aria-hidden />}
                </span>
              </span>
              <div className="min-w-0 flex-1 pt-1">
                <div className="flex items-baseline justify-between gap-3">
                  <p className={cn('font-display text-[15px] font-semibold leading-tight', upcoming && 'text-muted')}>
                    {ORDER_STATUS_LABEL[s]}
                    {current && <span className="sr-only"> (current step)</span>}
                  </p>
                  {stamp && (done || current) && (
                    <time dateTime={stamp} className="shrink-0 font-mono text-xs tnum text-muted">
                      {formatTime(stamp)}
                    </time>
                  )}
                </div>
                {current && <p className="mt-0.5 text-sm text-fg/70">{ORDER_STATUS_GUEST_COPY[s]}</p>}
              </div>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
