'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Volume2 } from 'lucide-react';
import { useLoop, useOnScreen } from '../hooks';
import { SoundWave } from './sound-wave';

const LINES = ['New order, table one.', 'Two paneer tikka, one butter chicken.', 'Table four is calling a waiter.'];

/** The counter speaks: equaliser + rotating spoken line. */
export function ChimeWave() {
  const { ref, inView } = useOnScreen<HTMLDivElement>();
  const i = useLoop(LINES.length, 2400, inView);
  const reduce = useReducedMotion();
  return (
    <div ref={ref} className="flex h-full flex-col justify-between">
      <div className="flex items-center gap-4">
        <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-ember text-white">
          {!reduce && inView && <span className="absolute inset-0 rounded-2xl bg-ember/60 animate-pulse-ring" aria-hidden />}
          <Volume2 className="relative h-6 w-6" aria-hidden />
        </span>
        <SoundWave bars={9} height={28} active={inView} className="text-ember" />
      </div>
      <div className="relative mt-6 h-12 overflow-hidden rounded-xl bg-paper/[0.06] px-4 font-mono text-[12px] leading-[3rem] text-fg/85" aria-live="off">
        {LINES.map((l, idx) => (
          <motion.span
            key={l}
            className="absolute inset-x-4"
            initial={false}
            animate={{ y: idx === i ? 0 : idx < i ? -48 : 48, opacity: idx === i ? 1 : 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            “{l}”
          </motion.span>
        ))}
      </div>
    </div>
  );
}
