'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { CallType, OrderStatus } from '@restaurant-os/shared';
import { CALL_TYPE_LABEL, ORDER_FLOW, ORDER_STATUS_LABEL } from '@restaurant-os/shared';
import { Bell, Check, ChefHat } from 'lucide-react';
import { OrderStatusBadge } from '@/components/ui';
import { cn, orderCode } from '@/lib/utils';
import { EASE_OUT } from '@/lib/motion';
import { useLoop, useOnScreen } from '../hooks';
import { MOCK_LINES, MOCK_ORDER_NUMBER, MOCK_RESTAURANT } from '../mock-data';

const CALLS: Array<{ table: string; type: CallType }> = [
  { table: 'Table 4', type: 'water' },
  { table: 'Table 7', type: 'bill' },
  { table: 'Table 2', type: 'cutlery' },
];

/** Kitchen ticket moving through the flow, plus a waiter request that gets attended. */
export function KitchenTicket({ className }: { className?: string }) {
  const { ref, inView } = useOnScreen<HTMLDivElement>();
  const reduce = useReducedMotion();
  const tick = useLoop(ORDER_FLOW.length * 2, 1600, inView);
  const statusIndex = tick % ORDER_FLOW.length;
  const status: OrderStatus = ORDER_FLOW[statusIndex] ?? 'placed';
  const callIndex = Math.floor(tick / 2) % CALLS.length;
  const call = CALLS[callIndex] ?? CALLS[0]!;
  const attended = tick % 2 === 1;

  return (
    <div ref={ref} className={cn('w-full max-w-md space-y-4', className)} aria-hidden>
      <div className="rounded-[28px] border border-paper/10 bg-ink-2 p-5 shadow-lift">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-paper/10">
              <ChefHat className="h-5 w-5 text-saffron" />
            </span>
            <div>
              <p className="tnum font-mono text-xs text-muted">
                {orderCode(MOCK_ORDER_NUMBER)} · {MOCK_RESTAURANT.table}
              </p>
              <p className="font-display text-base font-semibold leading-tight">Kitchen ticket</p>
            </div>
          </div>
          <div className="relative h-6 w-[100px]">
            <AnimatePresence initial={false}>
              <motion.span
                key={status}
                className="absolute right-0 top-0"
                initial={reduce ? { opacity: 0 } : { y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={reduce ? { opacity: 0 } : { y: -10, opacity: 0 }}
                transition={{ duration: 0.35, ease: EASE_OUT }}
              >
                <OrderStatusBadge status={status} />
              </motion.span>
            </AnimatePresence>
          </div>
        </div>
        <ul className="mt-4 space-y-1.5 border-t border-paper/10 pt-4 text-sm">
          {MOCK_LINES.map((l) => (
            <li key={l.name} className="flex items-center justify-between">
              <span>
                <span className="tnum font-mono text-xs text-ember">{l.qty}×</span> {l.name}
              </span>
              {statusIndex >= 3 && <Check className="h-4 w-4 text-mint" />}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex gap-1">
          {ORDER_FLOW.map((s, i) => (
            <div key={s} className="flex-1">
              <motion.span
                className="block h-1 rounded-full"
                animate={{ backgroundColor: i <= statusIndex ? '#2FB87A' : 'rgba(247,244,238,0.12)' }}
                transition={{ duration: 0.4 }}
              />
              <span className={cn('mt-1.5 block truncate font-mono text-[9px] uppercase tracking-[0.12em]', i === statusIndex ? 'text-fg' : 'text-muted')}>
                {ORDER_STATUS_LABEL[s]}
              </span>
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={`${call.table}-${attended}`}
          className={cn('flex items-center gap-3 rounded-2xl border p-3.5 transition-colors', attended ? 'border-mint/40 bg-mint/10' : 'border-saffron/40 bg-saffron/10')}
          initial={reduce ? { opacity: 0 } : { opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: EASE_OUT }}
        >
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', attended ? 'bg-mint text-white' : 'bg-saffron text-ink')}>
            {attended ? <Check className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
          </span>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold">
              {call.table} · {CALL_TYPE_LABEL[call.type]}
            </p>
            <p className="text-xs text-muted">{attended ? 'Attended by Priya' : 'Ringing on 3 staff phones'}</p>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
