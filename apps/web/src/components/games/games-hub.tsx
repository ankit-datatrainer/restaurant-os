'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { Brain, Dices, ExternalLink, Flame, Hash, Shuffle, UtensilsCrossed } from 'lucide-react';
import { toast } from 'sonner';
import { SplitWords } from '@/components/ui';
import { fadeUp, stagger } from '@/lib/motion';
import { GameShell, SectionLabel } from './game-shell';
import { GameCard } from './game-card';
import { PressButton } from './press-button';
import { WEB_GAMES, randomWebGame } from './web-games';
import { EMPTY_LUDO_WINS, EMPTY_TTT_SCORE, GAME_KEYS, formatSeconds, readStorage, type LudoWins, type MemoryBest, type TttScore } from './storage';

interface Bests {
  ludo: string | null;
  ttt: string | null;
  memory: string | null;
  reaction: string | null;
}

const LUDO_LABEL: Record<keyof LudoWins, string> = { red: 'Red', green: 'Green', yellow: 'Yellow', blue: 'Blue' };

function ludoBestLine(raw: unknown): string | null {
  const wins = { ...EMPTY_LUDO_WINS, ...(raw && typeof raw === 'object' ? (raw as Partial<LudoWins>) : {}) };
  const top = (Object.keys(LUDO_LABEL) as Array<keyof LudoWins>)
    .map((c) => [c, Number(wins[c]) || 0] as const)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);
  return top.length > 0 ? top.map(([c, n]) => `${LUDO_LABEL[c]} ${n}`).join(' · ') : null;
}

function tttBestLine(chef: TttScore, pass: TttScore): string | null {
  if (chef.x > 0) return `Beat the chef ${chef.x}×`;
  if (pass.x + pass.o + pass.draws > 0) return `X ${pass.x} · O ${pass.o}`;
  if (chef.o + chef.draws > 0) return `Chef ${chef.o} · Draws ${chef.draws}`;
  return null;
}

export function GamesHub() {
  const params = useParams<{ code: string }>();
  const code = typeof params?.code === 'string' ? params.code : '';
  const reduce = useReducedMotion();
  const base = `/t/${encodeURIComponent(code)}/games`;
  const [bests, setBests] = React.useState<Bests>({ ludo: null, ttt: null, memory: null, reaction: null });
  const lastOpened = React.useRef<string | undefined>(undefined);

  React.useEffect(() => {
    const chef = readStorage<TttScore>(GAME_KEYS.tttScoreChef, EMPTY_TTT_SCORE);
    const pass = readStorage<TttScore>(GAME_KEYS.tttScorePass, EMPTY_TTT_SCORE);
    const memory = readStorage<MemoryBest | null>(GAME_KEYS.memoryBest, null);
    const reaction = readStorage<number | null>(GAME_KEYS.reactionBest, null);
    setBests({
      ludo: ludoBestLine(readStorage<unknown>(GAME_KEYS.ludoWins, null)),
      ttt: tttBestLine(chef, pass),
      memory: memory ? `Best ${formatSeconds(memory.ms)} · ${memory.moves} moves` : null,
      reaction: typeof reaction === 'number' ? `Best ${Math.round(reaction)} ms` : null,
    });
  }, []);

  const surprise = () => {
    const game = randomWebGame(lastOpened.current);
    lastOpened.current = game.url;
    // With `noopener`, window.open returns null by spec even when the tab opened, so the return
    // value says nothing about pop-up blocking. A blocked tap is rare and the list below still works.
    window.open(game.url, '_blank', 'noopener,noreferrer');
    toast(`Opening ${game.name} in a new tab`);
  };

  return (
    <GameShell code={code} title="Table games">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-4xl bg-ink px-5 pb-7 pt-6 text-paper shadow-lift">
        <span
          className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-ember/40 blur-3xl"
          aria-hidden
        />
        <span className="pointer-events-none absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-saffron/30 blur-3xl" aria-hidden />
        <div className="relative">
          <p className="eyebrow text-paper/60">Table fun games</p>
          <SplitWords
            as="h2"
            text="While the kitchen cooks…"
            className="mt-2 font-display text-[clamp(1.9rem,8.5vw,2.6rem)] font-bold leading-[1.02] tracking-[-0.02em]"
            stagger={0.06}
          />
          <p className="mt-3 max-w-[32ch] text-[15px] leading-relaxed text-paper/70">
            Pass the phone around the table. Scores stay on this phone, and your order keeps cooking in the background.
          </p>
        </div>
      </section>

      {/* In-app games */}
      <section className="mt-7">
        <SectionLabel>Play right here</SectionLabel>
        <motion.ul
          className="mt-3 grid gap-3"
          variants={stagger(0.08, reduce ? 0 : 0.15)}
          initial={reduce ? false : 'hidden'}
          animate="show"
        >
          <GameCard
            index={0}
            href={`${base}/ludo`}
            name="Ludo"
            pitch="2 to 4 players on one phone, or play the computer."
            icon={<Dices className="h-7 w-7" strokeWidth={2.2} />}
            best={bests.ludo ? `Wins: ${bests.ludo}` : null}
            tone="sky"
          />
          <GameCard
            index={1}
            href={`${base}/tic-tac-toe`}
            name="Tic-tac-toe"
            pitch="Pass and play, or take on the chef."
            icon={<Hash className="h-7 w-7" strokeWidth={2.4} />}
            best={bests.ttt}
            tone="ember"
          />
          <GameCard
            index={2}
            href={`${base}/memory`}
            name="Memory Match"
            pitch="Six food pairs. Fewest moves, fastest time."
            icon={<Brain className="h-7 w-7" strokeWidth={2.2} />}
            best={bests.memory}
            tone="saffron"
          />
          <GameCard
            index={3}
            href={`${base}/reaction`}
            name="Tap when it sizzles"
            pitch="A reaction test. Line-cook reflexes required."
            icon={<Flame className="h-7 w-7" strokeWidth={2.2} />}
            best={bests.reaction}
            tone="mint"
          />
        </motion.ul>
      </section>

      {/* Free web games */}
      <section className="mt-8">
        <div className="flex items-end justify-between gap-3">
          <div>
            <SectionLabel>Free web games</SectionLabel>
            <p className="mt-1 text-sm text-muted">Open in a new tab. No sign-in needed.</p>
          </div>
          <PressButton variant="secondary" size="sm" onClick={surprise} leftIcon={<Shuffle className="h-4 w-4" aria-hidden />}>
            Surprise me
          </PressButton>
        </div>
        <motion.ul
          className="mt-3 overflow-hidden rounded-3xl border border-line/10 bg-surface shadow-soft"
          variants={stagger(0.05, reduce ? 0 : 0.35)}
          initial={reduce ? false : 'hidden'}
          animate="show"
        >
          {WEB_GAMES.map((game, i) => (
            <motion.li key={game.url} variants={fadeUp} custom={i} className={i > 0 ? 'hairline-t' : undefined}>
              <a
                href={game.url}
                target="_blank"
                rel="noreferrer noopener"
                onClick={() => {
                  lastOpened.current = game.url;
                }}
                className="group flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-sunk/50 active:bg-sunk"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sunk text-xl" aria-hidden>
                  {game.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold leading-tight">{game.name}</span>
                  <span className="mt-0.5 block truncate text-[13px] text-muted">{game.blurb}</span>
                </span>
                <ExternalLink className="h-4 w-4 shrink-0 text-muted transition-colors group-hover:text-fg" aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </motion.li>
          ))}
        </motion.ul>
      </section>

      <p className="mt-8 flex items-center justify-center gap-2 text-center text-[13px] text-muted">
        <UtensilsCrossed className="h-3.5 w-3.5" aria-hidden />
        <span>
          Hungry for more?{' '}
          <Link href={`/t/${encodeURIComponent(code)}`} className="font-semibold text-fg underline-offset-4 hover:underline">
            Back to the menu
          </Link>
        </span>
      </p>
    </GameShell>
  );
}
