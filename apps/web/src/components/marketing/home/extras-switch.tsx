'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Clapperboard, Gamepad2, Timer } from 'lucide-react';
import { Reveal, SplitWords } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useLoop, useOnScreen } from '../hooks';

interface Extra {
  id: string;
  icon: React.ReactNode;
  label: string;
  note: string;
}

const EXTRAS: Extra[] = [
  { id: 'games', icon: <Gamepad2 className="h-4 w-4" />, label: 'Games while waiting', note: 'Ludo, tic-tac-toe, memory and a reaction game on the order page' },
  { id: 'story', icon: <Clapperboard className="h-4 w-4" />, label: 'Our story / video', note: 'A short card or video about your kitchen' },
];

/** A settings-style switch that only looks like one: the real switches live in the dashboard. */
function FakeSwitch({ on }: { on: boolean }) {
  const reduce = useReducedMotion();
  return (
    <span className={cn('relative inline-flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors duration-300', on ? 'bg-mint' : 'bg-paper/20')} aria-hidden>
      <motion.span
        className="block h-6 w-6 rounded-full bg-white shadow"
        animate={{ x: on ? 20 : 0 }}
        transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 32 }}
      />
    </span>
  );
}

/** "Extras you can switch off": games and the story video, with a busy-hour toggle demo. */
export function ExtrasSwitch() {
  const { ref, inView } = useOnScreen<HTMLDivElement>();
  const phase = useLoop(2, 2600, inView); // 0 quiet afternoon, 1 Saturday rush
  const rush = phase === 1;
  return (
    <section className="relative pb-24 md:pb-32">
      <div className="container-x">
        <div className="grid gap-8 rounded-[2rem] border border-paper/10 bg-ink-2/50 p-6 md:p-10 lg:grid-cols-[1fr_0.9fr] lg:items-center lg:gap-14">
          <div>
            <Reveal as="p" className="eyebrow text-ember">
              Optional extras
            </Reveal>
            <SplitWords as="h3" text="Extras you can switch off." className="mt-4 text-display-sm font-bold" />
            <Reveal as="p" delay={0.15} className="mt-4 max-w-lg text-base leading-relaxed text-muted">
              Games and your story video keep the wait pleasant. Busy night and you would rather tables turn? Switch games off from Settings, and back on when it
              quietens down.
            </Reveal>
            <Reveal as="p" delay={0.25} className="mt-4 font-mono text-xs text-muted">
              Games and the story video are on Growth and Premium.
            </Reveal>
          </div>

          <Reveal delay={0.1}>
            <div ref={ref} className="rounded-3xl border border-paper/10 bg-ink p-5 shadow-lift" aria-hidden>
              <div className="flex items-center justify-between border-b border-paper/10 pb-4">
                <p className="font-mono text-2xs uppercase tracking-[0.16em] text-muted">Settings · Guest page</p>
                <motion.span
                  key={rush ? 'rush' : 'quiet'}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em]',
                    rush ? 'bg-ember/15 text-ember' : 'bg-paper/10 text-muted',
                  )}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Timer className="h-3 w-3" />
                  {rush ? 'Sat · 8:30 pm · full house' : 'Tue · 4:00 pm · quiet'}
                </motion.span>
              </div>
              <ul className="mt-2">
                {EXTRAS.map((e) => {
                  const on = e.id === 'games' ? !rush : true;
                  return (
                    <li key={e.id} className="flex items-center gap-4 border-b border-paper/[0.06] py-4 last:border-b-0">
                      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors duration-300', on ? 'bg-ember/15 text-ember' : 'bg-paper/5 text-muted')}>
                        {e.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn('block text-[15px] font-medium transition-colors duration-300', on ? 'text-fg' : 'text-fg/50')}>{e.label}</span>
                        <span className="block truncate text-xs text-muted">{e.note}</span>
                      </span>
                      <FakeSwitch on={on} />
                    </li>
                  );
                })}
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
