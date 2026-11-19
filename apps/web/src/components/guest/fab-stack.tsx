'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { BellRing, Gamepad2 } from 'lucide-react';
import { springSoft } from '@/lib/motion';

const fabClass =
  'pointer-events-auto inline-flex h-11 items-center gap-2 rounded-full bg-surface pl-3 pr-4 text-sm font-semibold text-fg shadow-lift ring-1 ring-line/10 transition-transform duration-300 ease-out hover:-translate-y-0.5 active:scale-95';

/**
 * "Help" and "Games" floating buttons on the right, lifted above the cart bar when it is visible.
 * Games only appear when the restaurant has them switched on (pass `gamesHref: null` otherwise).
 */
export function FabStack({ lifted, onHelp, gamesHref }: { lifted: boolean; onHelp: () => void; gamesHref?: string | null }) {
  const reduce = useReducedMotion();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40">
      <div className="relative mx-auto w-full max-w-[560px]">
        <motion.div
          className="absolute bottom-[max(1rem,env(safe-area-inset-bottom,0px))] right-4 flex flex-col items-end gap-2"
          animate={{ y: lifted ? -72 : 0 }}
          transition={reduce ? { duration: 0 } : springSoft}
          initial={false}
        >
          {gamesHref && (
            <Link href={gamesHref} className={fabClass} aria-label="Play a game while you wait" prefetch>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-soft text-sky">
                <Gamepad2 className="h-4 w-4" aria-hidden />
              </span>
              Games
            </Link>
          )}
          <button type="button" onClick={onHelp} className={fabClass} aria-label="Call a waiter or ask for help">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ember-soft text-ember">
              <BellRing className="h-4 w-4" aria-hidden />
            </span>
            Help
          </button>
        </motion.div>
      </div>
    </div>
  );
}
