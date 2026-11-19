'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { spring } from '@/lib/motion';
import {
  COLOR_LABEL,
  HOME,
  HOME_COLUMN,
  LAST_TRACK,
  START,
  STAR_SQUARES,
  TRACK,
  YARD_ORIGIN,
  stepsToHome,
  tokenCell,
  type Color,
  type Seat,
} from './engine';
import { LUDO_DEEP, LUDO_HEX, LUDO_SOFT } from './colors';

const N = 15;

function starPoints(cx: number, cy: number, outer: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(3)},${(cy + r * Math.sin(a)).toFixed(3)}`);
  }
  return pts.join(' ');
}

const START_COLOR = new Map<number, Color>(Object.entries(START).map(([c, i]) => [i, c as Color]));

/** The static board: yards, track, safe stars, home columns and the centre. Drawn once. */
const BoardArt = React.memo(function BoardArt({ inPlay }: { inPlay: ReadonlySet<Color> }) {
  return (
    <svg viewBox={`0 0 ${N} ${N}`} className="absolute inset-0 h-full w-full" aria-hidden shapeRendering="geometricPrecision">
      <rect x={0} y={0} width={N} height={N} className="fill-surface" />

      {/* Yards */}
      {(Object.keys(YARD_ORIGIN) as Color[]).map((c) => {
        const [r0, c0] = YARD_ORIGIN[c];
        const active = inPlay.has(c);
        return (
          <g key={c} opacity={active ? 1 : 0.35}>
            <rect x={c0} y={r0} width={6} height={6} fill={LUDO_HEX[c]} />
            <rect x={c0 + 0.7} y={r0 + 0.7} width={4.6} height={4.6} rx={0.7} className="fill-surface" />
            {[
              [1.5, 1.5],
              [1.5, 3.5],
              [3.5, 1.5],
              [3.5, 3.5],
            ].map(([r, cc]) => (
              <circle key={`${r}-${cc}`} cx={c0 + cc!} cy={r0 + r!} r={0.62} fill={LUDO_SOFT[c]} stroke={LUDO_HEX[c]} strokeWidth={0.08} />
            ))}
          </g>
        );
      })}

      {/* Track */}
      {TRACK.map(([r, c], i) => {
        const startOf = START_COLOR.get(i);
        return (
          <g key={`t${i}`}>
            <rect
              x={c}
              y={r}
              width={1}
              height={1}
              fill={startOf ? LUDO_HEX[startOf] : undefined}
              className={cn(!startOf && 'fill-surface', 'stroke-line/20')}
              strokeWidth={0.04}
            />
            {startOf && <polygon points={starPoints(c + 0.5, r + 0.5, 0.34, 0.15)} fill="#fff" opacity={0.9} />}
            {STAR_SQUARES.has(i) && <polygon points={starPoints(c + 0.5, r + 0.5, 0.36, 0.16)} className="fill-fg/25" />}
          </g>
        );
      })}

      {/* Home columns */}
      {(Object.keys(HOME_COLUMN) as Color[]).map((c) =>
        HOME_COLUMN[c].map(([r, cc], i) => (
          <rect key={`${c}${i}`} x={cc} y={r} width={1} height={1} fill={LUDO_HEX[c]} className="stroke-line/20" strokeWidth={0.04} />
        )),
      )}

      {/* Centre home */}
      <polygon points="6,6 7.5,7.5 6,9" fill={LUDO_HEX.red} />
      <polygon points="6,6 9,6 7.5,7.5" fill={LUDO_HEX.green} />
      <polygon points="9,6 9,9 7.5,7.5" fill={LUDO_HEX.yellow} />
      <polygon points="6,9 9,9 7.5,7.5" fill={LUDO_HEX.blue} />
      <rect x={6} y={6} width={3} height={3} fill="none" className="stroke-line/20" strokeWidth={0.04} />

      {/* Outer frame */}
      <rect x={0.02} y={0.02} width={N - 0.04} height={N - 0.04} fill="none" className="stroke-line/25" strokeWidth={0.06} />
    </svg>
  );
});

export interface StepAnim {
  color: Color;
  token: number;
}

function describeToken(color: Color, token: number, progress: number): string {
  const base = `${COLOR_LABEL[color]} token ${token + 1}`;
  if (progress < 0) return `${base}, in the yard`;
  if (progress >= HOME) return `${base}, home`;
  const steps = stepsToHome(progress);
  const where = progress > LAST_TRACK ? 'in the home column' : 'on the track';
  return `${base}, ${where}, ${steps} ${steps === 1 ? 'step' : 'steps'} from home`;
}

const STACK_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [-0.18, -0.18],
  [0.18, 0.18],
  [0.18, -0.18],
  [-0.18, 0.18],
];

/**
 * Ludo board: SVG art plus absolutely positioned token buttons that glide square by square.
 * `positions` is what to draw (the game state, or the in-between square while a token steps).
 */
export function LudoBoard({
  seats,
  positions,
  movable,
  currentColor,
  dice,
  stepping,
  reduce,
  onToken,
  children,
}: {
  seats: Seat[];
  positions: Record<Color, number[]>;
  /** Token indices of `currentColor` the human may tap right now. */
  movable: number[];
  currentColor: Color;
  dice: number | null;
  stepping: StepAnim | null;
  reduce: boolean;
  onToken: (token: number) => void;
  /** Overlay (winner card). */
  children?: React.ReactNode;
}) {
  const inPlay = React.useMemo(() => new Set(seats.map((s) => s.color)), [seats]);

  // Group tokens sharing a square so stacks fan out instead of hiding each other.
  const tokens = React.useMemo(() => {
    const list = seats.flatMap((seat) =>
      positions[seat.color].map((progress, token) => ({ color: seat.color, token, progress, cell: tokenCell(seat.color, progress, token) })),
    );
    const groups = new Map<string, number>();
    const index = list.map((t) => {
      if (t.progress < 0 || t.progress >= HOME) return { key: '', i: 0 };
      const key = `${t.cell[0]},${t.cell[1]}`;
      const i = groups.get(key) ?? 0;
      groups.set(key, i + 1);
      return { key, i };
    });
    return list.map((t, n) => {
      const { key, i } = index[n]!;
      const count = key ? (groups.get(key) ?? 1) : 1;
      return { ...t, stackIndex: i, stackCount: count };
    });
  }, [seats, positions]);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[460px] select-none overflow-hidden rounded-3xl border border-line/10 bg-surface shadow-soft">
      <BoardArt inPlay={inPlay} />

      <div className="absolute inset-0">
        {tokens.map((t) => {
          const isMovable = t.color === currentColor && movable.includes(t.token);
          const isStepping = stepping?.color === t.color && stepping.token === t.token;
          const home = t.progress >= HOME;
          const yard = t.progress < 0;
          const stacked = t.stackCount > 1;
          const [dx, dy] = stacked ? (STACK_OFFSETS[t.stackIndex % STACK_OFFSETS.length] ?? [0, 0]) : [0, 0];
          const sizeCells = (home ? 0.46 : yard ? 0.9 : 0.84) * (stacked ? 0.72 : 1);
          const left = ((t.cell[1] + 0.5 + dx) / N) * 100;
          const top = ((t.cell[0] + 0.5 + dy) / N) * 100;
          const size = (sizeCells / N) * 100;
          const label = describeToken(t.color, t.token, t.progress) + (isMovable && dice ? `. Move ${dice}` : '');
          return (
            <motion.button
              key={`${t.color}-${t.token}`}
              type="button"
              disabled={!isMovable}
              tabIndex={isMovable ? 0 : -1}
              aria-label={label}
              onClick={() => onToken(t.token)}
              initial={false}
              animate={{ left: `${left}%`, top: `${top}%`, scale: isStepping ? 1.18 : 1 }}
              transition={reduce ? { duration: 0 } : isStepping ? { duration: 0.13, ease: 'easeOut' } : spring}
              style={{
                width: `${size}%`,
                height: `${size}%`,
                x: '-50%',
                y: '-50%',
                zIndex: isStepping ? 30 : isMovable ? 20 : 10 + t.stackIndex,
              }}
              className={cn(
                'absolute rounded-full outline-none',
                // Bigger invisible hit area than the token itself.
                "before:absolute before:-inset-[45%] before:rounded-full before:content-['']",
                isMovable ? 'cursor-pointer' : 'cursor-default',
                'focus-visible:shadow-[0_0_0_3px_rgb(255_255_255),0_0_0_6px_rgb(12_13_16)]',
              )}
            >
              {isMovable && !reduce && (
                <span
                  className="pointer-events-none absolute -inset-[30%] animate-pulse-ring rounded-full border-2"
                  style={{ borderColor: LUDO_HEX[t.color] }}
                  aria-hidden
                />
              )}
              <span
                className={cn('pointer-events-none absolute inset-0 rounded-full border-[2px] border-white', isMovable && 'ring-2 ring-ink/80')}
                style={{
                  background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.55), transparent 45%), ${LUDO_HEX[t.color]}`,
                  boxShadow: isStepping
                    ? `0 6px 14px -4px ${LUDO_DEEP[t.color]}`
                    : `0 1px 0 1px ${LUDO_DEEP[t.color]}55, 0 3px 6px -3px rgba(12,13,16,0.5)`,
                }}
                aria-hidden
              >
                <span className="absolute inset-[30%] rounded-full bg-white/80" />
              </span>
            </motion.button>
          );
        })}
      </div>

      {children}
    </div>
  );
}
