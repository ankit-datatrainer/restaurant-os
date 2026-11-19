'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { RotateCcw, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { springSoft } from '@/lib/motion';
import { GameShell } from '../game-shell';
import { LiveLine, ScorePill, StatChip } from '../score-chip';
import { PressButton } from '../press-button';
import { useConfetti } from '../use-confetti';
import { GAME_KEYS, readStorage, writeStorage } from '../storage';
import { Pan, type PanMood } from './pan';

type Phase = 'idle' | 'waiting' | 'go' | 'early' | 'result' | 'done';

interface Round {
  ms: number;
  early: boolean;
}

const ROUNDS = 5;
const EARLY_PENALTY_MS = 1000;
const MIN_WAIT = 1500;
const MAX_WAIT = 4000;

function rank(avg: number): string {
  if (avg < 220) return 'Line-cook reflexes.';
  if (avg < 280) return 'Sous-chef sharp.';
  if (avg < 350) return 'Solid home cook.';
  return 'Still waiting on the kettle.';
}

const MOOD: Record<Phase, PanMood> = {
  idle: 'idle',
  waiting: 'waiting',
  go: 'go',
  early: 'early',
  result: 'result',
  done: 'idle',
};

const PAD: Record<Phase, string> = {
  idle: 'bg-surface text-fg border-line/10',
  waiting: 'bg-ink text-paper border-ink',
  go: 'bg-ember text-white border-ember',
  early: 'bg-rose text-white border-rose',
  result: 'bg-mint text-white border-mint',
  done: 'bg-ink text-paper border-ink',
};

export function ReactionGame() {
  const params = useParams<{ code: string }>();
  const code = typeof params?.code === 'string' ? params.code : '';
  const reduce = useReducedMotion();
  const fire = useConfetti();

  const [phase, setPhase] = React.useState<Phase>('idle');
  const [rounds, setRounds] = React.useState<Round[]>([]);
  const [last, setLast] = React.useState<Round | null>(null);
  const [best, setBest] = React.useState<number | null>(null);
  const [newBest, setNewBest] = React.useState(false);
  const goAt = React.useRef(0);
  const timer = React.useRef(0);

  React.useEffect(() => {
    setBest(readStorage<number | null>(GAME_KEYS.reactionBest, null));
    return () => window.clearTimeout(timer.current);
  }, []);

  const armRound = React.useCallback(() => {
    window.clearTimeout(timer.current);
    setPhase('waiting');
    const wait = MIN_WAIT + Math.random() * (MAX_WAIT - MIN_WAIT);
    timer.current = window.setTimeout(() => {
      goAt.current = performance.now();
      setPhase('go');
    }, wait);
  }, []);

  const record = React.useCallback(
    (round: Round) => {
      window.clearTimeout(timer.current);
      const next = [...rounds, round];
      setRounds(next);
      setLast(round);
      setPhase(round.early ? 'early' : 'result');

      if (!round.early && (best === null || round.ms < best)) {
        setBest(round.ms);
        setNewBest(true);
        writeStorage(GAME_KEYS.reactionBest, round.ms);
        fire({ y: 0.5, count: 70, spread: Math.PI * 0.6, power: 10 });
      }

      if (next.length >= ROUNDS) {
        timer.current = window.setTimeout(() => setPhase('done'), reduce ? 300 : 900);
      }
    },
    [rounds, best, fire, reduce],
  );

  const restart = React.useCallback(() => {
    window.clearTimeout(timer.current);
    setRounds([]);
    setLast(null);
    setNewBest(false);
    armRound();
  }, [armRound]);

  const tap = () => {
    switch (phase) {
      case 'idle':
        armRound();
        break;
      case 'waiting':
        record({ ms: EARLY_PENALTY_MS, early: true });
        break;
      case 'go':
        record({ ms: Math.round(performance.now() - goAt.current), early: false });
        break;
      case 'early':
      case 'result':
        if (rounds.length < ROUNDS) armRound();
        break;
      case 'done':
        restart();
        break;
    }
  };

  // Set-complete celebration (only once per set, and only when something was beaten).
  React.useEffect(() => {
    if (phase !== 'done') return;
    if (newBest) {
      window.setTimeout(() => fire({ y: 0.35, count: 190 }), reduce ? 0 : 200);
      toast.success('New personal best!');
    }
  }, [phase, newBest, fire, reduce]);

  const genuine = rounds.filter((r) => !r.early);
  const average = rounds.length > 0 ? Math.round(rounds.reduce((s, r) => s + r.ms, 0) / rounds.length) : null;
  const setBestMs = genuine.length > 0 ? Math.min(...genuine.map((r) => r.ms)) : null;
  const roundNo = Math.min(ROUNDS, rounds.length + 1);

  let headline: string;
  let sub: string;
  switch (phase) {
    case 'idle':
      headline = 'Tap to start';
      sub = 'The pan heats for 1.5–4 seconds, then sizzles. Tap the moment it does.';
      break;
    case 'waiting':
      headline = 'Wait for it…';
      sub = `Round ${roundNo} of ${ROUNDS}. Do not tap yet.`;
      break;
    case 'go':
      headline = 'TAP!';
      sub = 'It is sizzling.';
      break;
    case 'early':
      headline = 'Too early';
      sub = `That round counts as ${EARLY_PENALTY_MS} ms. ${rounds.length < ROUNDS ? 'Tap for the next round.' : ''}`.trim();
      break;
    case 'result':
      headline = `${last?.ms ?? 0} ms`;
      sub = rounds.length < ROUNDS ? `Round ${rounds.length} done. Tap for round ${rounds.length + 1}.` : 'Set complete.';
      break;
    default:
      headline = 'Set complete';
      sub = 'Tap to go again.';
  }

  const spoken = `${headline}${/[.!…]$/.test(headline) ? '' : '.'} ${sub}`;

  return (
    <GameShell code={code} title="Tap when it sizzles" backHref={`/t/${encodeURIComponent(code)}/games`} backLabel="All games">
      {/* Round chips */}
      <ol className="flex items-center justify-between gap-2" aria-label="Rounds">
        {Array.from({ length: ROUNDS }, (_, i) => {
          const r = rounds[i];
          const current = !r && i === rounds.length && phase !== 'done';
          return (
            <li
              key={i}
              className={cn(
                'flex h-12 flex-1 flex-col items-center justify-center rounded-2xl border text-center transition-colors duration-300',
                r ? (r.early ? 'border-rose/30 bg-rose-soft text-[#a1282c]' : 'border-mint/40 bg-mint-soft text-[#1b6f49]') : 'border-line/10 bg-surface text-muted',
                current && 'shadow-ring',
              )}
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] opacity-70">R{i + 1}</span>
              <span className="font-display text-[15px] font-bold leading-none tnum">{r ? (r.early ? 'early' : r.ms) : '—'}</span>
            </li>
          );
        })}
      </ol>

      <LiveLine className="mt-4">{spoken}</LiveLine>

      {/* The pad */}
      <motion.button
        type="button"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          tap();
        }}
        onKeyDown={(e) => {
          if (e.repeat) return;
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            tap();
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
        whileTap={reduce ? undefined : { scale: 0.985 }}
        transition={springSoft}
        aria-label={spoken}
        className={cn(
          'relative mt-4 flex w-full select-none flex-col items-center justify-center overflow-hidden rounded-4xl border px-6 pb-7 pt-5 shadow-lift transition-colors touch-manipulation',
          phase === 'go' ? 'duration-0' : 'duration-200',
          PAD[phase],
        )}
        style={{ minHeight: 'min(420px, 62vh)', WebkitUserSelect: 'none' }}
      >
        <Pan mood={MOOD[phase]} className="w-full max-w-[280px]" />
        <span className="mt-2 font-display text-[clamp(2rem,10vw,3rem)] font-bold leading-none tracking-tight tnum" aria-hidden>
          {headline}
        </span>
        <span className={cn('mt-2 max-w-[30ch] text-center text-[14px] leading-snug', phase === 'idle' ? 'text-muted' : 'opacity-85')} aria-hidden>
          {sub}
        </span>
        {phase === 'waiting' && !reduce && (
          <motion.span
            className="absolute inset-0 rounded-4xl ring-2 ring-inset ring-paper/20"
            animate={{ opacity: [0.2, 0.6, 0.2] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            aria-hidden
          />
        )}
      </motion.button>

      {/* Summary */}
      <AnimatePresence>
        {phase === 'done' && average !== null && (
          <motion.section
            key="summary"
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
            transition={springSoft}
            className="mt-5 rounded-3xl border border-line/10 bg-surface p-4 shadow-soft"
            aria-label="Set summary"
          >
            <div className="grid grid-cols-3 gap-2.5">
              <StatChip label="Average" value={`${average}`} tone="ember" />
              <StatChip label="Set best" value={setBestMs !== null ? `${setBestMs}` : '—'} />
              <StatChip label="All-time" value={best !== null ? `${Math.round(best)}` : '—'} tone="saffron" />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-display text-lg font-bold leading-tight">{rank(average)}</p>
                <p className="mt-0.5 text-[13px] text-muted">
                  Average over {ROUNDS} rounds, in milliseconds.
                  {rounds.some((r) => r.early) && ' Early taps cost 1000 ms each.'}
                </p>
              </div>
              {newBest && (
                <ScorePill tone="mint">
                  <Zap className="h-3 w-3" aria-hidden />
                  New best
                </ScorePill>
              )}
            </div>
            <PressButton size="lg" onClick={restart} leftIcon={<RotateCcw className="h-4 w-4" aria-hidden />} className="mt-4 w-full">
              Go again
            </PressButton>
          </motion.section>
        )}
      </AnimatePresence>

      <p className="mt-5 text-center text-[13px] leading-relaxed text-muted">
        Five rounds per set. Your best single tap is saved on this phone{best !== null ? ` — currently ${Math.round(best)} ms` : ''}.
      </p>
    </GameShell>
  );
}
