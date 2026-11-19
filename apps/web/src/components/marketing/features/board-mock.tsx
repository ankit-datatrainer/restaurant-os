'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { OrderStatus } from '@restaurant-os/shared';
import { Bell } from 'lucide-react';
import { OrderStatusBadge } from '@/components/ui';
import { cn, formatINR, orderCode } from '@/lib/utils';
import { EASE_OUT } from '@/lib/motion';
import { useLoop, useOnScreen } from '../hooks';
import { SoundWave } from '../micro/sound-wave';
import { MOCK_RESTAURANT } from '../mock-data';

interface BoardOrder {
  number: number;
  table: string;
  status: OrderStatus;
  total: number;
  summary: string;
}

const POOL: BoardOrder[] = [
  { number: 1003, table: 'Table 1', status: 'placed', total: 869.4, summary: 'Paneer Tikka, Butter Chicken, Garlic Naan ×2…' },
  { number: 1004, table: 'Table 6', status: 'placed', total: 246.75, summary: 'Masala Dosa ×1, Filter Coffee ×2' },
  { number: 1005, table: 'Table 2', status: 'placed', total: 525, summary: 'Veg Biryani ×2, Raita ×1' },
  { number: 1006, table: 'Table 4', status: 'placed', total: 199.5, summary: 'Chole Bhature ×1, Lassi ×1' },
  { number: 1007, table: 'Table 8', status: 'placed', total: 1113, summary: 'Dal Makhani, Jeera Rice ×2, Gulab Jamun ×3' },
];

const AGED: OrderStatus[] = ['placed', 'accepted', 'preparing', 'ready'];

/** Counter board: a new order arrives every few seconds, older ones age through the flow. */
export function CounterBoard({ className }: { className?: string }) {
  const { ref, inView } = useOnScreen<HTMLDivElement>();
  const reduce = useReducedMotion();
  const tick = useLoop(POOL.length * 50, 3000, inView);
  const list = Array.from({ length: 4 }, (_, i) => {
    const o = POOL[(tick - i + POOL.length * 50) % POOL.length] ?? POOL[0]!;
    return { ...o, status: AGED[Math.min(AGED.length - 1, i)] ?? 'placed' };
  });
  const newest = list[0]!;

  return (
    <div ref={ref} className={cn('relative w-full max-w-md rounded-[28px] border border-paper/10 bg-ink-2 p-5 shadow-lift', className)} aria-hidden>
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow">Counter board</p>
          <p className="mt-1 font-display text-lg font-bold leading-tight">{MOCK_RESTAURANT.name}</p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-paper/10 px-2.5 py-1 font-mono text-2xs uppercase tracking-[0.14em]">
          <span className="relative flex h-1.5 w-1.5">
            {!reduce && <span className="absolute inline-flex h-full w-full rounded-full bg-mint animate-pulse-ring" />}
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-mint" />
          </span>
          Live
        </span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={newest.number}
          className="mt-4 flex items-center gap-3 rounded-2xl border border-ember/40 bg-ember/10 p-3"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: EASE_OUT }}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ember text-white">
            <SoundWave bars={4} height={14} active={inView} />
          </span>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold">New order, {newest.table.toLowerCase()}</p>
            <p className="tnum truncate font-mono text-xs text-muted">
              {orderCode(newest.number)} · {formatINR(newest.total)}
            </p>
          </div>
          <Bell className="h-4 w-4 shrink-0 text-saffron" />
        </motion.div>
      </AnimatePresence>

      <ul className="mt-3 space-y-2">
        <AnimatePresence initial={false}>
          {list.map((o) => (
            <motion.li
              key={o.number}
              layout
              className="rounded-2xl bg-paper/[0.05] p-3"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.4, ease: EASE_OUT }}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="tnum font-mono text-xs text-muted">
                  {orderCode(o.number)} · {o.table}
                </span>
                <OrderStatusBadge status={o.status} />
              </div>
              <p className="mt-1 truncate text-sm">{o.summary}</p>
              <p className="tnum mt-0.5 font-mono text-xs text-muted">{formatINR(o.total)}</p>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
