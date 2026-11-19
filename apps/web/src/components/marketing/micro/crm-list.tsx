'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { Download, MessageCircle, Star } from 'lucide-react';
import { cn, formatINR } from '@/lib/utils';
import { useLoop, useOnScreen } from '../hooks';

type Seg = 'repeat' | 'new' | 'lapsed' | 'opted_in';

const SEGMENTS: Array<{ id: Seg; label: string }> = [
  { id: 'repeat', label: 'Repeat' },
  { id: 'new', label: 'New' },
  { id: 'lapsed', label: 'Lapsed' },
  { id: 'opted_in', label: 'Opted in' },
];

/* Illustrative product UI, not real customers. */
const ROWS: Array<{ name: string; phone: string; visits: number; spent: number; rating: number; segs: Seg[] }> = [
  { name: 'Ananya R.', phone: '+91 98•••• •210', visits: 6, spent: 7840, rating: 4.8, segs: ['repeat', 'opted_in'] },
  { name: 'Rahul M.', phone: '+91 90•••• •577', visits: 1, spent: 1120, rating: 5, segs: ['new'] },
  { name: 'Fatima K.', phone: '+91 99•••• •034', visits: 3, spent: 3960, rating: 4.3, segs: ['repeat', 'lapsed', 'opted_in'] },
  { name: 'Vikram S.', phone: '+91 81•••• •902', visits: 2, spent: 2250, rating: 4, segs: ['repeat'] },
];

/** Customer list whose segment filter cycles: repeat, new, lapsed, opted in. */
export function CrmList() {
  const { ref, inView } = useOnScreen<HTMLDivElement>();
  const i = useLoop(SEGMENTS.length, 1700, inView);
  const seg = SEGMENTS[i]?.id ?? 'repeat';
  const uid = React.useId();
  return (
    <div ref={ref} className="flex h-full flex-col justify-between gap-3" aria-hidden>
      <div className="flex flex-wrap items-center gap-1.5">
        {SEGMENTS.map((s) => (
          <span
            key={s.id}
            className={cn(
              'relative rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors duration-300',
              s.id === seg ? 'text-white' : 'text-muted',
            )}
          >
            {s.id === seg && <motion.span layoutId={`crm-seg-${uid}`} className="absolute inset-0 rounded-full bg-ember" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
            <span className="relative">{s.label}</span>
          </span>
        ))}
        <span className="ml-auto hidden items-center gap-1 rounded-full border border-paper/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted sm:flex">
          <Download className="h-3 w-3" /> CSV
        </span>
      </div>
      <ul className="overflow-hidden rounded-2xl border border-paper/10">
        {ROWS.map((r) => {
          const on = r.segs.includes(seg);
          return (
            <motion.li
              key={r.name}
              className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-paper/[0.06] px-3.5 py-2.5 last:border-b-0 sm:grid-cols-[1.3fr_0.6fr_0.8fr_auto]"
              animate={{ opacity: on ? 1 : 0.28, backgroundColor: on ? 'rgba(255,92,42,0.06)' : 'rgba(255,92,42,0)' }}
              transition={{ duration: 0.35 }}
            >
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold leading-tight">{r.name}</span>
                <span className="tnum block truncate font-mono text-[10px] text-muted">{r.phone}</span>
              </span>
              <span className="tnum hidden font-mono text-[11px] text-fg/80 sm:block">{r.visits} visits</span>
              <span className="tnum hidden font-mono text-[11px] text-fg/80 sm:block">{formatINR(r.spent)}</span>
              <span className="flex items-center gap-2">
                <span className="tnum flex items-center gap-0.5 font-mono text-[11px] text-saffron">
                  <Star className="h-3 w-3 fill-saffron" /> {r.rating.toFixed(1)}
                </span>
                <MessageCircle className={cn('h-3.5 w-3.5', r.segs.includes('opted_in') ? 'text-mint' : 'text-paper/15')} />
              </span>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
