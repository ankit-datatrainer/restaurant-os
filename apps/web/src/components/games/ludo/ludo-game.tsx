'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Bot, Crown, RotateCcw, Settings2, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { EASE_OUT, springSoft } from '@/lib/motion';
import { GameShell } from '../game-shell';
import { LiveLine, StatChip } from '../score-chip';
import { PressButton } from '../press-button';
import { useConfetti } from '../use-confetti';
import { EMPTY_LUDO_WINS, GAME_KEYS, readStorage, writeStorage, type LudoWins } from '../storage';
import {
  COLOR_LABEL,
  COLORS,
  HOME,
  applyMove,
  applyRoll,
  chooseComputerMove,
  continueGame,
  currentSeat,
  defaultSeats,
  destination,
  legalMoves,
  newGame,
  parseSavedGame,
  rollDie,
  stepsToHome,
  type Color,
  type GameEvent,
  type GameState,
  type Seat,
  type StepResult,
} from './engine';
import { LudoBoard, type StepAnim } from './board';
import { LudoDie } from './die';
import { LudoSetupSheet } from './setup-sheet';
import { LUDO_DEEP, LUDO_HEX, LUDO_TONE } from './colors';

const STEP_MS = 140;
const ROLL_MS = 520;

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

/** Display names: "You" when exactly one person plays the computer, otherwise the colour. */
function makeNamer(seats: Seat[]) {
  const soloHuman = seats.filter((s) => s.kind === 'human').length === 1;
  const kindOf = (c: Color) => seats.find((s) => s.color === c)?.kind ?? 'human';
  const name = (c: Color) => (soloHuman && kindOf(c) === 'human' ? 'You' : kindOf(c) === 'computer' ? `${COLOR_LABEL[c]} (computer)` : COLOR_LABEL[c]);
  const isYou = (c: Color) => soloHuman && kindOf(c) === 'human';
  return { name, isYou, kindOf };
}

function describe(event: GameEvent, seats: Seat[], next: GameState): string {
  const { name, isYou, kindOf } = makeNamer(seats);
  const who = name(event.color);
  switch (event.type) {
    case 'rolled': {
      if (kindOf(event.color) === 'computer') return `${who} rolled a ${event.value}.`;
      const n = legalMoves(next).length;
      return `${who} rolled a ${event.value}. ${n === 1 ? 'Tap the glowing token.' : 'Pick a token to move.'}`;
    }
    case 'no-move':
      return `${who} rolled a ${event.value}. No token can move${event.rollAgain ? ', but a 6 means another roll.' : '.'}`;
    case 'three-sixes':
      return `Three 6s in a row. ${isYou(event.color) ? 'Your' : `${who}'s`} turn is over.`;
    case 'moved': {
      let s: string;
      if (event.from < 0) s = `${who} brought token ${event.token + 1} out.`;
      else if (event.tokenHome) s = `${who} got token ${event.token + 1} home!`;
      else s = `${who} moved token ${event.token + 1} ${event.value} ${event.value === 1 ? 'square' : 'squares'}.`;
      if (event.captured.length > 0) {
        const victims = event.captured.map((c) => `${COLOR_LABEL[c.color]} token ${c.token + 1}`).join(' and ');
        s += ` Sent ${victims} back to the yard!`;
      }
      if (event.place === 1) s += ` ${who} ${isYou(event.color) ? 'win' : 'wins'} the game!`;
      else if (event.place) s += ` ${who} ${isYou(event.color) ? 'finish' : 'finishes'} ${ordinal(event.place)}.`;
      if (event.extraTurn) s += event.value === 6 ? ' A 6: roll again.' : ' Capture bonus: roll again.';
      return s;
    }
  }
}

function parseWins(raw: unknown): LudoWins {
  const w = (raw ?? {}) as Partial<LudoWins>;
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);
  return { red: n(w.red), green: n(w.green), yellow: n(w.yellow), blue: n(w.blue) };
}

export function LudoGame() {
  const params = useParams<{ code: string }>();
  const code = typeof params?.code === 'string' ? params.code : '';
  const reduce = Boolean(useReducedMotion());
  const fire = useConfetti();

  const [state, setState] = React.useState<GameState>(() => newGame(defaultSeats()));
  const [hydrated, setHydrated] = React.useState(false);
  const [wins, setWins] = React.useState<LudoWins>(EMPTY_LUDO_WINS);
  const [message, setMessage] = React.useState('');
  const [rolling, setRolling] = React.useState(false);
  const [rollingFace, setRollingFace] = React.useState<number | null>(null);
  const [anim, setAnim] = React.useState<(StepAnim & { at: number }) | null>(null);
  const [setupOpen, setSetupOpen] = React.useState(false);

  // Refs so timers always see the latest values.
  const stateRef = React.useRef(state);
  stateRef.current = state;
  const busyRef = React.useRef(false);
  const timers = React.useRef<number[]>([]);

  const later = React.useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current = timers.current.filter((t) => t !== id);
      fn();
    }, ms);
    timers.current.push(id);
    return id;
  }, []);
  const clearTimers = React.useCallback(() => {
    for (const id of timers.current) {
      window.clearTimeout(id);
      window.clearInterval(id);
    }
    timers.current = [];
  }, []);
  React.useEffect(() => clearTimers, [clearTimers]);

  // Restore a game in progress + the scoreboard (localStorage, read in an effect only).
  React.useEffect(() => {
    const saved = parseSavedGame(readStorage<unknown>(GAME_KEYS.ludoGame, null));
    if (saved && saved.phase !== 'over') {
      setState(saved);
      if (saved.rollCount > 0) setMessage('Welcome back. Your game is right where you left it.');
    }
    setWins(parseWins(readStorage<unknown>(GAME_KEYS.ludoWins, null)));
    setHydrated(true);
  }, []);

  // Save after every settled change.
  React.useEffect(() => {
    if (hydrated) writeStorage(GAME_KEYS.ludoGame, state);
  }, [state, hydrated]);

  const seat = currentSeat(state);
  const namer = React.useMemo(() => makeNamer(state.seats), [state.seats]);

  const recordWin = React.useCallback(
    (color: Color) => {
      setWins((prev) => {
        const next = { ...prev, [color]: prev[color] + 1 };
        writeStorage(GAME_KEYS.ludoWins, next);
        return next;
      });
    },
    [],
  );

  const commitMove = React.useCallback(
    (result: StepResult, seats: Seat[]) => {
      setState(result.state);
      setMessage(describe(result.event, seats, result.state));
      const e = result.event;
      if (e.type === 'moved' && e.place === 1) {
        recordWin(e.color);
        const winnerSeat = seats.find((s) => s.color === e.color);
        if (winnerSeat?.kind === 'human') later(() => fire({ y: 0.45, count: 180 }), reduce ? 0 : 250);
        else toast(`${COLOR_LABEL[e.color]} (computer) wins this one. Rematch?`);
      }
      busyRef.current = false;
    },
    [fire, later, recordWin, reduce],
  );

  const roll = React.useCallback(() => {
    const s = stateRef.current;
    if (busyRef.current || s.phase !== 'roll') return;
    busyRef.current = true;
    const value = rollDie();
    const settle = () => {
      const result = applyRoll(stateRef.current, value);
      setRolling(false);
      setRollingFace(null);
      setState(result.state);
      setMessage(describe(result.event, result.state.seats, result.state));
      busyRef.current = false;
    };
    if (reduce) {
      settle();
      return;
    }
    setRolling(true);
    setRollingFace(rollDie());
    const spin = window.setInterval(() => setRollingFace(rollDie()), 80);
    timers.current.push(spin);
    later(() => {
      window.clearInterval(spin);
      timers.current = timers.current.filter((t) => t !== spin);
      settle();
    }, ROLL_MS);
  }, [later, reduce]);

  const move = React.useCallback(
    (token: number) => {
      const s = stateRef.current;
      if (busyRef.current || s.phase !== 'move' || s.dice === null) return;
      if (!legalMoves(s).includes(token)) return;
      busyRef.current = true;
      const color = currentSeat(s).color;
      const from = s.tokens[color][token]!;
      const to = destination(from, s.dice);
      const result = applyMove(s, token);
      if (reduce) {
        commitMove(result, s.seats);
        return;
      }
      // Walk the token square by square, then apply the move (captures land after the last hop).
      const path: number[] = from < 0 ? [0] : Array.from({ length: to - from }, (_, i) => from + i + 1);
      let i = 0;
      setAnim({ color, token, at: path[0]! });
      const step = () => {
        i += 1;
        if (i < path.length) {
          setAnim({ color, token, at: path[i]! });
          later(step, STEP_MS);
        } else {
          setAnim(null);
          commitMove(result, s.seats);
        }
      };
      later(step, STEP_MS);
    },
    [commitMove, later, reduce],
  );

  // Computer seats play on their own, with a short pause so people can follow.
  React.useEffect(() => {
    if (!hydrated || rolling || anim || setupOpen) return;
    if (seat.kind !== 'computer') return;
    if (state.phase === 'roll') {
      const id = later(roll, reduce ? 300 : 800);
      return () => window.clearTimeout(id);
    }
    if (state.phase === 'move') {
      const id = later(() => {
        const choice = chooseComputerMove(stateRef.current);
        if (choice !== null) move(choice);
      }, reduce ? 250 : 500);
      return () => window.clearTimeout(id);
    }
  }, [state, seat.kind, hydrated, rolling, anim, setupOpen, roll, move, later, reduce]);

  const humanTurn = seat.kind === 'human';
  const busy = rolling || anim !== null;
  const movable = humanTurn && state.phase === 'move' && !busy ? legalMoves(state) : [];
  const canRoll = humanTurn && state.phase === 'roll' && !busy && hydrated;

  // Keyboard: Space / Enter roll, 1–4 move a token.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (setupOpen || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      if (e.key === ' ' || e.key === 'Enter') {
        if (tag === 'BUTTON' || tag === 'A') return; // the focused control handles it
        if (canRoll) {
          e.preventDefault();
          roll();
        }
        return;
      }
      if (/^[1-4]$/.test(e.key) && movable.length > 0) {
        const token = Number(e.key) - 1;
        if (movable.includes(token)) {
          e.preventDefault();
          move(token);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setupOpen, canRoll, movable, roll, move]);

  const startGame = (seats: Seat[]) => {
    clearTimers();
    busyRef.current = false;
    setRolling(false);
    setRollingFace(null);
    setAnim(null);
    const fresh = newGame(seats);
    setState(fresh);
    const { name } = makeNamer(fresh.seats);
    const first = currentSeat(fresh);
    setMessage(`New game. ${first.kind === 'human' ? `${name(first.color) === 'You' ? 'You go' : `${name(first.color)} goes`} first: roll a 6 to bring a token out.` : `${name(first.color)} goes first.`}`);
    setSetupOpen(false);
  };

  const keepPlaying = () => {
    setState((s) => continueGame(s));
    const { name } = makeNamer(state.seats);
    setMessage(`Playing on for 2nd place. ${name(currentSeat(state).color)} to roll.`);
  };

  const resetScores = () => {
    writeStorage(GAME_KEYS.ludoWins, EMPTY_LUDO_WINS);
    setWins(EMPTY_LUDO_WINS);
    toast('Scoreboard cleared');
  };

  // What to draw: the game state, with the stepping token at its in-between square.
  const positions = React.useMemo(() => {
    if (!anim) return state.tokens;
    const copy = { ...state.tokens, [anim.color]: [...state.tokens[anim.color]] } as Record<Color, number[]>;
    copy[anim.color][anim.token] = anim.at;
    return copy;
  }, [state.tokens, anim]);

  const turnName = namer.name(seat.color);
  let caption: string;
  if (state.phase === 'over') caption = 'Game over';
  else if (state.phase === 'winner') caption = 'We have a winner';
  else if (!humanTurn) caption = state.phase === 'roll' ? `${turnName} is rolling…` : `${turnName} is moving…`;
  else if (state.phase === 'roll') caption = namer.isYou(seat.color) ? 'Your turn: tap the dice' : `${turnName}'s turn: tap the dice`;
  else caption = movable.length === 1 ? 'Tap the glowing token' : 'Tap a glowing token (or press 1–4)';

  const dieFace = rolling ? rollingFace : state.dice ?? state.lastRoll;
  const showPicker = humanTurn && state.phase === 'move';
  const winner = state.finished[0] ?? null;
  const ended = state.phase === 'winner' || state.phase === 'over';

  return (
    <GameShell code={code} title="Ludo" backHref={`/t/${encodeURIComponent(code)}/games`} backLabel="All games">
      {/* Wins per colour */}
      <div className="mx-auto grid w-full max-w-[460px] grid-cols-4 gap-2">
        {COLORS.map((c) => {
          const playing = state.seats.some((s) => s.color === c);
          return (
            <StatChip
              key={c}
              label={COLOR_LABEL[c]}
              value={wins[c]}
              tone={LUDO_TONE[c]}
              active={playing && !ended && seat.color === c}
              className={cn('px-1.5', !playing && 'opacity-45')}
            />
          );
        })}
      </div>
      <p className="mt-1.5 text-center font-mono text-2xs uppercase tracking-[0.14em] text-muted">Wins on this phone</p>

      <div className="mt-4">
        <LudoBoard
          seats={state.seats}
          positions={positions}
          movable={movable}
          currentColor={seat.color}
          dice={state.dice}
          stepping={anim}
          reduce={reduce}
          onToken={move}
        >
          <AnimatePresence>
            {ended && winner && (
              <motion.div
                key={`result-${state.phase}`}
                className="absolute inset-0 z-40 flex items-center justify-center bg-paper/70 p-4 backdrop-blur-[2px]"
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduce ? undefined : { opacity: 0 }}
                transition={{ duration: 0.25, ease: EASE_OUT }}
              >
                <motion.div
                  className="w-full max-w-[300px] rounded-3xl border border-line/10 bg-surface p-5 text-center shadow-lift"
                  initial={reduce ? false : { scale: 0.92, y: 12 }}
                  animate={{ scale: 1, y: 0 }}
                  transition={springSoft}
                  role="dialog"
                  aria-labelledby="ludo-result"
                >
                  <span
                    className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl text-white"
                    style={{ background: LUDO_HEX[winner] }}
                    aria-hidden
                  >
                    <Crown className="h-6 w-6" />
                  </span>
                  <h2 id="ludo-result" className="mt-3 font-display text-xl font-bold tracking-tight">
                    {namer.name(winner)} {namer.isYou(winner) ? 'win!' : 'wins!'}
                  </h2>
                  {state.phase === 'over' ? (
                    <ol className="mt-3 grid gap-1 text-left text-[14px]">
                      {state.finished.map((c, i) => (
                        <li key={c} className="flex items-center gap-2.5 rounded-xl bg-sunk px-3 py-1.5">
                          <span className="w-8 font-mono text-[12px] font-semibold text-muted tnum">{ordinal(i + 1)}</span>
                          <span className="h-3 w-3 rounded-full" style={{ background: LUDO_HEX[c] }} aria-hidden />
                          <span className="font-semibold">{namer.name(c)}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="mt-1 text-[14px] text-muted">The others can play on for the next places.</p>
                  )}
                  <div className="mt-4 grid gap-2">
                    {state.phase === 'winner' && (
                      <PressButton size="md" onClick={keepPlaying}>
                        Keep playing for 2nd place
                      </PressButton>
                    )}
                    <PressButton
                      size="md"
                      variant={state.phase === 'winner' ? 'outline' : 'primary'}
                      onClick={() => startGame(state.seats)}
                      leftIcon={<RotateCcw className="h-4 w-4" aria-hidden />}
                    >
                      New game
                    </PressButton>
                    {state.phase === 'over' && (
                      <PressButton size="md" variant="ghost" onClick={() => setSetupOpen(true)}>
                        Change players
                      </PressButton>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </LudoBoard>
      </div>

      {/* Controls */}
      <section className="mx-auto mt-4 w-full max-w-[460px] rounded-3xl border border-line/10 bg-surface p-4 shadow-soft" aria-label="Dice and turn">
        <div className="flex items-center gap-4">
          <LudoDie
            face={dieFace}
            color={seat.color}
            rolling={rolling}
            disabled={!canRoll}
            rollKey={state.rollCount}
            reduce={reduce}
            onRoll={roll}
            label={canRoll ? 'Roll the dice (Space)' : dieFace ? `Dice shows ${dieFace}` : 'Dice'}
          />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: LUDO_DEEP[seat.color] }}>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: LUDO_HEX[seat.color] }} aria-hidden />
              {seat.kind === 'computer' && <Bot className="h-3.5 w-3.5 shrink-0" aria-hidden />}
              <span className="min-w-0">{caption}</span>
            </p>
            <LiveLine className="mt-1 min-h-[2.75rem] text-left text-[14px] leading-snug">{message || 'Roll a 6 to bring a token out of the yard.'}</LiveLine>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {showPicker && (
            <motion.div
              key="picker"
              className="overflow-hidden"
              initial={reduce ? false : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.25, ease: EASE_OUT }}
            >
              <div className="mt-3 grid grid-cols-4 gap-2" role="group" aria-label="Move a token">
                {state.tokens[seat.color].map((p, i) => {
                  const ok = movable.includes(i);
                  const where = p < 0 ? 'yard' : p >= HOME ? 'home' : `${stepsToHome(p)} to go`;
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={!ok}
                      onClick={() => move(i)}
                      aria-label={`Token ${i + 1}, ${where}${ok ? `. Move ${state.dice}` : ', cannot move'}`}
                      className={cn(
                        'flex min-h-[52px] flex-col items-center justify-center rounded-2xl border text-center transition-[transform,opacity,background-color] duration-200 active:scale-95',
                        ok ? 'border-transparent text-white shadow-soft' : 'border-line/10 bg-sunk text-muted opacity-60',
                      )}
                      style={ok ? { background: LUDO_HEX[seat.color] } : undefined}
                    >
                      <span className="font-display text-[17px] font-bold leading-none tnum">{i + 1}</span>
                      <span className={cn('mt-1 font-mono text-[10px] uppercase tracking-[0.08em] tnum', ok ? 'text-white/85' : '')}>{where}</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <div className="mx-auto mt-5 flex w-full max-w-[460px] flex-wrap items-center justify-center gap-3">
        <PressButton size="lg" variant="outline" onClick={() => setSetupOpen(true)} leftIcon={<Settings2 className="h-4 w-4" aria-hidden />} className="min-w-[160px]">
          New game
        </PressButton>
        <PressButton variant="ghost" size="md" onClick={resetScores} className="text-muted" leftIcon={<Trophy className="h-4 w-4" aria-hidden />}>
          Reset scores
        </PressButton>
      </div>

      <div className="mx-auto mt-6 max-w-[460px] text-[13px] leading-relaxed text-muted">
        <p>
          Roll a 6 to leave the yard. A 6 earns another roll, but three 6s in a row end your turn. Land on an opponent to send it home and roll again;
          stars and start squares are safe. You need the exact number to reach the centre.
        </p>
        <p className="mt-2">Keyboard: Space or Enter rolls, 1–4 moves a token. Your game is saved on this phone if it locks.</p>
      </div>

      <LudoSetupSheet
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        current={state.seats}
        inProgress={state.phase !== 'over' && state.rollCount > 0}
        onStart={startGame}
      />
    </GameShell>
  );
}
