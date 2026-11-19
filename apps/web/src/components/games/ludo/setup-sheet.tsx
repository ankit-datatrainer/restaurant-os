'use client';

import * as React from 'react';
import { Bot, User } from 'lucide-react';
import { Sheet } from '@/components/ui';
import { cn } from '@/lib/utils';
import { PressButton } from '../press-button';
import { COLOR_LABEL, COLORS, colorsFor, type Color, type Seat, type SeatKind } from './engine';
import { LUDO_HEX } from './colors';

/** Seat kinds remembered per colour while the sheet is open, so changing the player count keeps choices. */
type Kinds = Record<Color, SeatKind>;

function kindsFrom(seats: Seat[]): Kinds {
  const k: Kinds = { red: 'human', green: 'computer', yellow: 'computer', blue: 'computer' };
  for (const s of seats) k[s.color] = s.kind;
  return k;
}

/** New game: 2, 3 or 4 players; each seat Human (pass the phone) or Computer. */
export function LudoSetupSheet({
  open,
  onClose,
  current,
  inProgress,
  onStart,
}: {
  open: boolean;
  onClose: () => void;
  current: Seat[];
  /** A game is under way (starting a new one ends it). */
  inProgress: boolean;
  onStart: (seats: Seat[]) => void;
}) {
  const [count, setCount] = React.useState(current.length);
  const [kinds, setKinds] = React.useState<Kinds>(() => kindsFrom(current));

  React.useEffect(() => {
    if (!open) return;
    setCount(current.length);
    setKinds(kindsFrom(current));
  }, [open, current]);

  const colors = colorsFor(count);
  const seats: Seat[] = colors.map((color) => ({ color, kind: kinds[color] }));
  const humans = seats.filter((s) => s.kind === 'human').length;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New game"
      description={inProgress ? 'Starting a new game ends the one in progress.' : 'Pass the phone around the table, or play the computer.'}
      footer={
        <PressButton size="lg" className="w-full" onClick={() => onStart(seats)}>
          Start game
        </PressButton>
      }
    >
      <p id="ludo-players" className="eyebrow">
        Players
      </p>
      <div className="mt-2 flex rounded-full bg-sunk p-1" role="radiogroup" aria-labelledby="ludo-players">
        {[2, 3, 4].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={count === n}
            onClick={() => setCount(n)}
            className={cn(
              'h-11 flex-1 rounded-full text-[15px] font-semibold transition-colors',
              count === n ? 'bg-surface text-fg shadow-soft' : 'text-muted hover:text-fg',
            )}
          >
            {n}
          </button>
        ))}
      </div>

      <ul className="mt-5 grid gap-2">
        {COLORS.filter((c) => colors.includes(c)).map((color) => {
          const kind = kinds[color];
          return (
            <li key={color} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-line/10 bg-surface p-2 pl-3">
              <span className="h-7 w-7 shrink-0 rounded-full border-[3px] border-white shadow-soft" style={{ background: LUDO_HEX[color] }} aria-hidden />
              <span id={`seat-${color}`} className="min-w-0 flex-1 truncate font-display text-[15px] font-semibold">
                {COLOR_LABEL[color]}
              </span>
              <div className="ml-auto flex shrink-0 rounded-full bg-sunk p-0.5" role="radiogroup" aria-labelledby={`seat-${color}`}>
                {(
                  [
                    { id: 'human', label: 'Human', icon: User },
                    { id: 'computer', label: 'Computer', icon: Bot },
                  ] as const
                ).map((opt) => {
                  const Icon = opt.icon;
                  const active = kind === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setKinds((k) => ({ ...k, [color]: opt.id }))}
                      className={cn(
                        'inline-flex h-11 min-w-[44px] items-center gap-1 rounded-full px-2.5 text-[13px] font-semibold transition-colors',
                        active ? 'bg-ink text-paper' : 'text-muted hover:text-fg',
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-[13px] leading-relaxed text-muted">
        {humans === 0
          ? 'All computer players: sit back and watch them race.'
          : humans === 1
            ? 'You play against the computer.'
            : `${humans} people share this phone. Pass it on when your turn ends.`}
      </p>
    </Sheet>
  );
}
