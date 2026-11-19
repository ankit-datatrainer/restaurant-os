'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Gamepad2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { GameShell } from '@/components/games/game-shell';
import { EASE_OUT } from '@/lib/motion';
import { gamesOn } from './features';
import { useTable } from './table-provider';

/**
 * Wraps the games hub and every game page. When the restaurant has games switched off (or its
 * plan does not include them) the page says so instead. While the table is still loading, or if
 * it cannot be loaded, the game renders as usual: games need nothing from the server.
 */
export function GamesGate({ title = 'Table games', children }: { title?: string; children: React.ReactNode }) {
  const { code, data } = useTable();
  const reduce = useReducedMotion();
  if (!data || gamesOn(data.restaurant)) return <>{children}</>;

  return (
    <GameShell code={code} title={title}>
      <motion.section
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
        className="mt-6 flex flex-col items-center rounded-3xl border border-line/10 bg-surface px-6 py-12 text-center shadow-soft"
        aria-labelledby="games-off-heading"
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sunk text-fg/60">
          <Gamepad2 className="h-6 w-6" aria-hidden />
        </span>
        <h2 id="games-off-heading" className="mt-5 font-display text-2xl font-bold tracking-tight">
          Games are switched off at this restaurant
        </h2>
        <p className="mt-2 max-w-[32ch] text-[15px] text-muted">
          The menu, your orders and waiter calls all work as usual.
        </p>
        <Button href={`/t/${encodeURIComponent(code)}`} size="lg" className="mt-7">
          Back to the menu
        </Button>
      </motion.section>
    </GameShell>
  );
}
