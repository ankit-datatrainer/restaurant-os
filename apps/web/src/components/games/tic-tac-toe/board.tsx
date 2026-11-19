'use client';

import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { EASE_OUT, spring } from '@/lib/motion';
import type { Board, Line, Player } from './engine';
import { Mark, MARK_COLOR } from './mark';

const CELL_NAMES = ['top left', 'top centre', 'top right', 'middle left', 'centre', 'middle right', 'bottom left', 'bottom centre', 'bottom right'];

/** Centre of a cell in the 300×300 overlay used for the win line. */
function centre(i: number): { x: number; y: number } {
  return { x: 50 + (i % 3) * 100, y: 50 + Math.floor(i / 3) * 100 };
}

function winLineCoords(line: Line) {
  const a = centre(line[0]);
  const c = centre(line[2]);
  const dx = c.x - a.x;
  const dy = c.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ext = 26; // overshoot past the outer cells
  return {
    x1: a.x - (dx / len) * ext,
    y1: a.y - (dy / len) * ext,
    x2: c.x + (dx / len) * ext,
    y2: c.y + (dy / len) * ext,
  };
}

export function TicTacToeBoard({
  board,
  turn,
  winLine,
  winner,
  locked,
  onPlay,
}: {
  board: Board;
  turn: Player;
  winLine: Line | null;
  winner: Player | null;
  /** True while the chef is thinking or the game is over. */
  locked: boolean;
  onPlay: (index: number) => void;
}) {
  const reduce = useReducedMotion();
  const coords = winLine ? winLineCoords(winLine) : null;

  return (
    <div className="relative mx-auto w-full max-w-[400px]">
      <div className="grid aspect-square grid-cols-3 gap-2.5" role="grid" aria-label="Tic-tac-toe board">
        {board.map((cell, i) => {
          const inLine = winLine?.includes(i) ?? false;
          const disabled = locked || cell !== null;
          const label = cell ? `${CELL_NAMES[i]}, ${cell}` : `${CELL_NAMES[i]}, empty${disabled ? '' : `. Place ${turn}`}`;
          return (
            <motion.button
              key={i}
              type="button"
              role="gridcell"
              aria-label={label}
              disabled={disabled}
              onClick={() => onPlay(i)}
              whileTap={disabled || reduce ? undefined : { scale: 0.92 }}
              transition={spring}
              className={cn(
                'group relative flex aspect-square items-center justify-center rounded-2xl border border-line/10 bg-surface shadow-soft transition-colors duration-300',
                !disabled && 'hover:bg-sunk/60',
                inLine && winner === 'X' && 'bg-ember-soft border-ember/30',
                inLine && winner === 'O' && 'bg-saffron-soft border-saffron/40',
                winner && !inLine && cell && 'opacity-50',
              )}
            >
              {cell ? (
                <Mark player={cell} className="h-[64%] w-[64%]" />
              ) : (
                !disabled && (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 [@media(hover:hover)]:group-hover:opacity-100">
                    <Mark player={turn} ghost className="h-[64%] w-[64%]" />
                  </span>
                )
              )}
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence>
        {coords && winner && (
          <motion.svg
            key={winLine?.join('-')}
            viewBox="0 0 300 300"
            className="pointer-events-none absolute inset-0 h-full w-full"
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
          >
            <motion.line
              x1={coords.x1}
              y1={coords.y1}
              x2={coords.x2}
              y2={coords.y2}
              stroke={MARK_COLOR[winner]}
              strokeWidth="9"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={reduce ? { duration: 0 } : { duration: 0.55, delay: 0.1, ease: EASE_OUT }}
            />
          </motion.svg>
        )}
      </AnimatePresence>
    </div>
  );
}
