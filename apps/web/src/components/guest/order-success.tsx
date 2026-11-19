'use client';

import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { OrderWithItems } from '@restaurant-os/shared';
import { orderCode } from '@/lib/utils';
import { EASE_OUT, springBouncy } from '@/lib/motion';

/**
 * Full-screen confirmation: a check mark draws itself, then the order number.
 * The page routes to the tracker shortly after.
 */
export function OrderSuccess({ order }: { order: OrderWithItems | null }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {order && (
        <motion.div
          key="order-success"
          className="fixed inset-0 z-[95] flex flex-col items-center justify-center bg-ink px-8 text-center text-paper"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0.01 : 0.35, ease: EASE_OUT }}
          role="status"
          aria-live="assertive"
        >
          <motion.div
            className="relative flex h-28 w-28 items-center justify-center"
            initial={reduce ? false : { scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={springBouncy}
          >
            {!reduce && <span className="absolute inset-0 animate-pulse-ring rounded-full bg-mint/40" aria-hidden />}
            <svg viewBox="0 0 96 96" className="relative h-28 w-28" aria-hidden>
              <motion.circle
                cx="48"
                cy="48"
                r="44"
                fill="none"
                stroke="#2FB87A"
                strokeWidth="4"
                initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.7, ease: EASE_OUT }}
              />
              <motion.path
                d="M30 50 L43 62 L67 36"
                fill="none"
                stroke="#2FB87A"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.5, delay: reduce ? 0 : 0.45, ease: EASE_OUT }}
              />
            </svg>
          </motion.div>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: reduce ? 0 : 0.7, ease: EASE_OUT }}
          >
            <p className="mt-8 font-mono text-xs uppercase tracking-[0.2em] text-paper/60">Order {orderCode(order.order_number)}</p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight">Sent to the kitchen</h2>
            <p className="mt-2 text-[15px] text-paper/70">We will keep you posted right here as it is cooked.</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
