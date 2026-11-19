'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { RotateCcw, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui';
import { pop, springSoft, stagger } from '@/lib/motion';
import { GameShell } from '../game-shell';
import { LiveLine, ScorePill, StatChip } from '../score-chip';
import { PressButton } from '../press-button';
import { useConfetti } from '../use-confetti';
import { GAME_KEYS, formatSeconds, readStorage, writeStorage, type MemoryBest } from '../storage';
import { FlipCard } from './flip-card';

const PAIRS = [
  { emoji: '🍛', label: 'Curry' },
  { emoji: '🍕', label: 'Pizza' },
  { emoji: '🍜', label: 'Noodles' },
  { emoji: '🧁', label: 'Cupcake' },
  { emoji: '🍹', label: 'Cocktail' },
  { emoji: '🥟', label: 'Dumpling' },
] as const;

interface Card {
  id: number;
  pair: number;
  emoji: string;
  label: string;
}

function buildDeck(): Card[] {
  const cards: Card[] = [];
  PAIRS.forEach((p, pair) => {
    cards.push({ id: pair * 2, pair, emoji: p.emoji, label: p.label });
    cards.push({ id: pair * 2 + 1, pair, emoji: p.emoji, label: p.label });
  });
  // Fisher–Yates shuffle
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = cards[i]!;
    cards[i] = cards[j]!;
    cards[j] = a;
  }
  return cards;
}

const MISMATCH_DELAY = 820;
const MATCH_DELAY = 320;

export function MemoryMatch() {
  const params = useParams<{ code: string }>();
  const code = typeof params?.code === 'string' ? params.code : '';
  const reduce = useReducedMotion();
  const fire = useConfetti();

  const [deck, setDeck] = React.useState<Card[] | null>(null);
  const [flipped, setFlipped] = React.useState<number[]>([]);
  const [matched, setMatched] = React.useState<number[]>([]);
  const [moves, setMoves] = React.useState(0);
  const [startedAt, setStartedAt] = React.useState<number | null>(null);
  const [finishedAt, setFinishedAt] = React.useState<number | null>(null);
  const [now, setNow] = React.useState(0);
  const [best, setBest] = React.useState<MemoryBest | null>(null);
  const [newBest, setNewBest] = React.useState(false);
  const timers = React.useRef<number[]>([]);

  const later = React.useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
  }, []);

  const clearTimers = React.useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  }, []);

  // Shuffle on the client only so the server-rendered markup matches.
  React.useEffect(() => {
    setDeck(buildDeck());
    setBest(readStorage<MemoryBest | null>(GAME_KEYS.memoryBest, null));
    return clearTimers;
  }, [clearTimers]);

  // Timer tick while a round is live.
  React.useEffect(() => {
    if (startedAt === null || finishedAt !== null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, [startedAt, finishedAt]);

  // Completion.
  React.useEffect(() => {
    if (matched.length !== PAIRS.length || startedAt === null || finishedAt !== null) return;
    const end = Date.now();
    setFinishedAt(end);
    const ms = end - startedAt;
    const record: MemoryBest = { ms, moves };
    const isBest = !best || ms < best.ms;
    if (isBest) {
      setBest(record);
      writeStorage(GAME_KEYS.memoryBest, record);
      setNewBest(true);
    }
    later(() => fire({ y: 0.4, count: isBest ? 220 : 150 }), reduce ? 0 : 250);
    toast.success(isBest ? 'New best time!' : `Done in ${formatSeconds(ms)}`);
  }, [matched.length, startedAt, finishedAt, moves, best, fire, later, reduce]);

  const elapsed = startedAt === null ? 0 : (finishedAt ?? now) - startedAt;
  const finished = finishedAt !== null;
  const busy = flipped.length >= 2;

  const flip = (index: number) => {
    if (!deck || busy || finished) return;
    const card = deck[index];
    if (!card || flipped.includes(index) || matched.includes(card.pair)) return;
    if (startedAt === null) setStartedAt(Date.now());

    const next = [...flipped, index];
    setFlipped(next);
    if (next.length < 2) return;

    setMoves((m) => m + 1);
    const first = deck[next[0]!];
    if (first && first.pair === card.pair) {
      later(() => {
        setMatched((m) => (m.includes(card.pair) ? m : [...m, card.pair]));
        setFlipped([]);
      }, MATCH_DELAY);
    } else {
      later(() => setFlipped([]), MISMATCH_DELAY);
    }
  };

  const restart = () => {
    clearTimers();
    setDeck(null);
    setFlipped([]);
    setMatched([]);
    setMoves(0);
    setStartedAt(null);
    setFinishedAt(null);
    setNow(0);
    setNewBest(false);
    // A beat of empty board makes the re-deal read as a fresh shuffle.
    later(() => setDeck(buildDeck()), reduce ? 0 : 180);
  };

  let line: string;
  if (finished) line = `All six pairs found in ${formatSeconds(elapsed)} with ${moves} moves.`;
  else if (startedAt === null) line = 'Tap a card to start the clock.';
  else line = `${matched.length} of ${PAIRS.length} pairs found.`;

  return (
    <GameShell code={code} title="Memory Match" backHref={`/t/${encodeURIComponent(code)}/games`} backLabel="All games">
      <div className="grid grid-cols-3 gap-2.5">
        <StatChip label="Moves" value={moves} />
        <StatChip label="Time" value={formatSeconds(elapsed)} tone={finished ? 'mint' : 'neutral'} active={startedAt !== null && !finished} />
        <StatChip label="Best" value={best ? formatSeconds(best.ms) : '—'} tone="saffron" />
      </div>

      <LiveLine className="mt-4">{line}</LiveLine>

      <div className="relative mt-4">
        {deck ? (
          <motion.ul
            key="deck"
            className="grid grid-cols-4 gap-2.5"
            variants={stagger(0.04)}
            initial={reduce ? false : 'hidden'}
            animate="show"
            aria-label="Memory cards"
          >
            {deck.map((card, i) => (
              <motion.li key={card.id} variants={pop} className="list-none">
                <FlipCard
                  emoji={card.emoji}
                  label={card.label}
                  index={i}
                  flipped={flipped.includes(i)}
                  matched={matched.includes(card.pair)}
                  disabled={busy || finished}
                  onFlip={() => flip(i)}
                />
              </motion.li>
            ))}
          </motion.ul>
        ) : (
          <div className="grid grid-cols-4 gap-2.5" aria-hidden>
            {Array.from({ length: PAIRS.length * 2 }, (_, i) => (
              <Skeleton key={i} className="aspect-[4/5] w-full rounded-2xl" />
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {finished && (
          <motion.section
            key="result"
            initial={reduce ? false : { opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, transition: { duration: 0.15 } }}
            transition={springSoft}
            className="relative mt-5 overflow-hidden rounded-3xl bg-ink px-5 py-5 text-paper shadow-lift"
            aria-label="Round result"
          >
            <span className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-mint/40 blur-3xl" aria-hidden />
            <div className="relative flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-saffron text-ink" aria-hidden>
                <Trophy className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-xl font-bold leading-tight">All pairs found</p>
                <p className="mt-1 text-sm text-paper/70">
                  {formatSeconds(elapsed)} · {moves} moves
                  {best && !newBest && ` · best ${formatSeconds(best.ms)}`}
                </p>
                {newBest && (
                  <ScorePill tone="mint" className="mt-2.5">
                    New personal best
                  </ScorePill>
                )}
              </div>
            </div>
            <PressButton size="lg" onClick={restart} leftIcon={<RotateCcw className="h-4 w-4" aria-hidden />} className="relative mt-5 w-full">
              Play again
            </PressButton>
          </motion.section>
        )}
      </AnimatePresence>

      {!finished && (
        <div className="mt-6 flex justify-center">
          <PressButton variant="ghost" onClick={restart} className="text-muted" leftIcon={<RotateCcw className="h-4 w-4" aria-hidden />}>
            Shuffle and restart
          </PressButton>
        </div>
      )}

      <p className="mt-5 text-center text-[13px] leading-relaxed text-muted">Two cards per move. The clock starts on your first flip and stops on the last pair.</p>
    </GameShell>
  );
}
