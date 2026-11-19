'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Bell, IndianRupee, Smartphone, Star, Volume2 } from 'lucide-react';
import { cn, formatINR } from '@/lib/utils';
import { EASE_OUT } from '@/lib/motion';
import { HOW_SEQUENCE, PhoneMock, type PhoneState } from './phone-mock';
import { SoundWave } from './micro/sound-wave';
import { MOCK_TOTALS } from './mock-data';

const NOTES: Record<PhoneState, { icon: React.ReactNode; title: string; body: React.ReactNode; side: 'left' | 'right' }> = {
  scan: {
    icon: <Smartphone className="h-4 w-4" />,
    title: 'Opens in the browser',
    body: 'Camera app → menu. Nothing to install.',
    side: 'left',
  },
  menu: {
    icon: <IndianRupee className="h-4 w-4" />,
    title: 'GST added as they go',
    body: 'Prices come from your menu, never the phone.',
    side: 'right',
  },
  placed: {
    icon: <Bell className="h-4 w-4" />,
    title: 'Order placed',
    body: 'The guest can track it from the same page.',
    side: 'right',
  },
  kitchen: {
    icon: <Volume2 className="h-4 w-4" />,
    title: 'Chime + spoken aloud',
    body: <SoundWave bars={9} height={12} className="mt-1 text-ember" />,
    side: 'left',
  },
  pay: {
    icon: <IndianRupee className="h-4 w-4" />,
    title: `UPI opens with ${formatINR(MOCK_TOTALS.total)}`,
    body: 'Amount and reference pre-filled. Or pay at the counter.',
    side: 'right',
  },
  feedback: {
    icon: <Star className="h-4 w-4" />,
    title: 'Rated after the meal',
    body: 'Every guest who rates sees your Google review link.',
    side: 'left',
  },
};

/** The sticky device for "How it works": a controlled phone with a contextual note per step. */
export function DeviceScene({ step, className }: { step: number; className?: string }) {
  const reduce = useReducedMotion();
  const state = HOW_SEQUENCE[Math.max(0, Math.min(HOW_SEQUENCE.length - 1, step))] ?? 'scan';
  const note = NOTES[state];
  return (
    <div className={cn('relative', className)}>
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ember/[0.12] blur-[120px]" />
      <PhoneMock state={state} width={300} className="relative" />
      <AnimatePresence mode="wait">
        <motion.div
          key={state}
          className={cn(
            'absolute top-[14%] flex max-w-[230px] items-start gap-3 rounded-2xl border border-paper/10 bg-ink-2/95 p-3.5 shadow-lift backdrop-blur-md',
            note.side === 'left' ? '-left-28' : '-right-28',
          )}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14, x: note.side === 'left' ? -10 : 10 }}
          animate={{ opacity: 1, y: 0, x: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10 }}
          transition={{ duration: 0.45, ease: EASE_OUT }}
          aria-hidden
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-ember text-white">{note.icon}</span>
          <div className="min-w-0 text-xs">
            <p className="font-semibold leading-tight">{note.title}</p>
            <div className="mt-0.5 text-muted">{note.body}</div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
