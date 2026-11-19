'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Gamepad2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLoop, useOnScreen } from '../hooks';

/* A short scripted game: X wins on the diagonal, then the board clears. */
const MOVES: Array<{ cell: number; who: 'X' | 'O' }> = [
  { cell: 4, who: 'X' },
  { cell: 0, who: 'O' },
  { cell: 2, who: 'X' },
  { cell: 6, who: 'O' },
  { cell: 8, who: 'X' },
  { cell: 3, who: 'O' },
  { cell: 5, who: 'X' },
];
const WIN = [2, 4, 6];

/** Tic-tac-toe plays itself while the food is being cooked. */
export function TicTac() {
  const { ref, inView } = useOnScreen<HTMLDivElement>();
  const step = useLoop(MOVES.length + 3, 650, inView); // extra ticks hold the win, then reset
  const played = MOVES.slice(0, Math.min(step, MOVES.length));
  const won = step >= MOVES.length;
  const board = Array.from({ length: 9 }, (_, i) => played.find((m) => m.cell === i)?.who ?? null);

  return (
    <div ref={ref} className="flex h-full items-center gap-6">
      <div className="grid shrink-0 grid-cols-3 gap-1.5" aria-hidden>
        {board.map((v, i) => (
          <span
            key={i}
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-lg bg-paper/[0.06] font-display text-lg font-bold transition-colors duration-300',
              won && WIN.includes(i) && 'bg-ember text-white',
            )}
          >
            <AnimatePresence>
              {v && (
                <motion.span
                  key={v}
                  initial={{ scale: 0.3, opacity: 0, rotate: -20 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  exit={{ scale: 0.3, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 26 }}
                  className={cn(v === 'O' && !(won && WIN.includes(i)) && 'text-saffron')}
                >
                  {v}
                </motion.span>
              )}
            </AnimatePresence>
          </span>
        ))}
      </div>
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Gamepad2 className="h-4 w-4 text-ember" aria-hidden /> Games while you wait
        </p>
        <p className="mt-1 text-sm text-muted">Ludo, tic-tac-toe, memory and a reaction game on the order page. Kids stop asking “how long?”.</p>
      </div>
    </div>
  );
}
