'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { VegMark } from '@/components/ui';
import { cn, formatINR } from '@/lib/utils';
import { useLoop, useOnScreen } from '../hooks';

const DISHES = [
  { name: 'Paneer Tikka', price: 249, veg: true },
  { name: 'Chicken 65', price: 279, veg: false },
  { name: 'Dal Makhani', price: 199, veg: true },
  { name: 'Mutton Rogan Josh', price: 389, veg: false },
];

/** "Veg only" switch flips on and off; non-veg rows fold away. */
export function VegToggle() {
  const { ref, inView } = useOnScreen<HTMLDivElement>();
  const i = useLoop(2, 2200, inView);
  const vegOnly = i === 1;
  const shown = vegOnly ? DISHES.filter((d) => d.veg) : DISHES;
  return (
    <div ref={ref} className="flex h-full flex-col">
      <div className="flex items-center justify-between rounded-full bg-paper/[0.06] px-4 py-2">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <VegMark isVeg size={14} /> Veg only
        </span>
        <span
          role="switch"
          aria-checked={vegOnly}
          aria-label="Veg only filter (demo)"
          className={cn('relative inline-flex h-6 w-10 items-center rounded-full p-0.5 transition-colors duration-300', vegOnly ? 'bg-mint' : 'bg-paper/20')}
        >
          <motion.span className="block h-5 w-5 rounded-full bg-white shadow" animate={{ x: vegOnly ? 16 : 0 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }} />
        </span>
      </div>
      <ul className="mt-3 space-y-1.5">
        <AnimatePresence initial={false}>
          {shown.map((d) => (
            <motion.li
              key={d.name}
              layout
              className="flex items-center gap-3 rounded-xl bg-paper/[0.04] px-3 py-2 text-sm"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              <VegMark isVeg={d.veg} size={12} />
              <span className="flex-1 truncate">{d.name}</span>
              <span className="tnum font-mono text-xs text-muted">{formatINR(d.price)}</span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
