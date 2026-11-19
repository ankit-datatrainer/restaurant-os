'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { OrderStatus } from '@restaurant-os/shared';
import { ORDER_STATUS_GUEST_COPY } from '@restaurant-os/shared';
import { OrderStatusBadge } from '@/components/ui';
import { formatINR, orderCode } from '@/lib/utils';
import { useLoop, useOnScreen } from '../hooks';
import { MOCK_ORDER_NUMBER, MOCK_RESTAURANT, MOCK_TOTALS } from '../mock-data';

const FLOW: OrderStatus[] = ['placed', 'accepted', 'preparing', 'ready', 'served'];

/** A ticket whose status pill advances through the real order flow. */
export function StatusFlip() {
  const { ref, inView } = useOnScreen<HTMLDivElement>();
  const i = useLoop(FLOW.length, 1500, inView);
  const status = FLOW[i] ?? 'placed';
  return (
    <div ref={ref} className="flex h-full flex-col justify-between">
      <div className="rounded-2xl bg-paper/[0.06] p-4">
        <div className="flex items-center justify-between">
          <span className="tnum font-mono text-xs text-muted">
            {orderCode(MOCK_ORDER_NUMBER)} · {MOCK_RESTAURANT.table}
          </span>
          <div className="relative h-6 w-[96px]">
            <AnimatePresence initial={false}>
              <motion.span
                key={status}
                className="absolute right-0 top-0"
                initial={{ y: 12, opacity: 0, rotateX: -60 }}
                animate={{ y: 0, opacity: 1, rotateX: 0 }}
                exit={{ y: -12, opacity: 0, rotateX: 60 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              >
                <OrderStatusBadge status={status} />
              </motion.span>
            </AnimatePresence>
          </div>
        </div>
        <p className="mt-3 text-sm font-semibold">
          Butter Chicken ×1 · Garlic Naan ×2 · <span className="tnum">{formatINR(MOCK_TOTALS.total)}</span>
        </p>
        <div className="mt-3 flex gap-1" aria-hidden>
          {FLOW.map((s, idx) => (
            <motion.span
              key={s}
              className="h-1 flex-1 rounded-full bg-paper/15"
              animate={{ backgroundColor: idx <= i ? '#2FB87A' : 'rgba(247,244,238,0.15)' }}
              transition={{ duration: 0.4 }}
            />
          ))}
        </div>
      </div>
      <p className="mt-4 font-mono text-xs text-muted" aria-live="off">
        Guest sees: <span className="text-fg/85">{ORDER_STATUS_GUEST_COPY[status]}</span>
      </p>
    </div>
  );
}
