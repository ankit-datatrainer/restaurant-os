'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { ChefHat, RotateCcw, Users } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { spring } from '@/lib/motion';
import { GameShell } from '../game-shell';
import { LiveLine, StatChip } from '../score-chip';
import { PressButton } from '../press-button';
import { useConfetti } from '../use-confetti';
import { EMPTY_TTT_SCORE, GAME_KEYS, readStorage, writeStorage, type TttScore } from '../storage';
import { bestMove, emptyBoard, findWinner, isFull, other, type Board, type Line, type Player } from './engine';
import { TicTacToeBoard } from './board';

type Mode = 'pass' | 'chef';
type Status = 'playing' | 'won' | 'draw';

const HUMAN: Player = 'X';
const CHEF: Player = 'O';

function scoreKey(mode: Mode) {
  return mode === 'chef' ? GAME_KEYS.tttScoreChef : GAME_KEYS.tttScorePass;
}

export function TicTacToe() {
  const params = useParams<{ code: string }>();
  const code = typeof params?.code === 'string' ? params.code : '';
  const reduce = useReducedMotion();
  const fire = useConfetti();

  const [mode, setMode] = React.useState<Mode>('pass');
  const [board, setBoard] = React.useState<Board>(() => emptyBoard());
  const [starter, setStarter] = React.useState<Player>('X');
  const [turn, setTurn] = React.useState<Player>('X');
  const [status, setStatus] = React.useState<Status>('playing');
  const [winner, setWinner] = React.useState<Player | null>(null);
  const [winLine, setWinLine] = React.useState<Line | null>(null);
  const [scores, setScores] = React.useState<TttScore>(EMPTY_TTT_SCORE);
  const [thinking, setThinking] = React.useState(false);

  // Scoreboard is per mode and lives in localStorage (read in an effect, never during render).
  React.useEffect(() => {
    setScores(readStorage<TttScore>(scoreKey(mode), EMPTY_TTT_SCORE));
  }, [mode]);

  const bumpScore = React.useCallback(
    (field: keyof TttScore) => {
      setScores((prev) => {
        const next = { ...prev, [field]: prev[field] + 1 };
        writeStorage(scoreKey(mode), next);
        return next;
      });
    },
    [mode],
  );

  const finish = React.useCallback(
    (nextBoard: Board) => {
      const w = findWinner(nextBoard);
      if (w) {
        setStatus('won');
        setWinner(w.player);
        setWinLine(w.line);
        bumpScore(w.player === 'X' ? 'x' : 'o');
        const humanLost = mode === 'chef' && w.player === CHEF;
        if (humanLost) {
          toast('The chef takes this one. Rematch?');
        } else {
          window.setTimeout(() => fire({ y: 0.45, count: 170 }), reduce ? 0 : 420);
        }
        return true;
      }
      if (isFull(nextBoard)) {
        setStatus('draw');
        bumpScore('draws');
        toast("It's a draw. Rematch?");
        return true;
      }
      return false;
    },
    [bumpScore, fire, mode, reduce],
  );

  // Side effects (scores, confetti) stay outside the state updater so StrictMode's
  // double-invocation in dev cannot count a win twice.
  const play = React.useCallback(
    (i: number, who: Player) => {
      if (status !== 'playing' || board[i] !== null) return;
      const next = board.slice();
      next[i] = who;
      setBoard(next);
      if (!finish(next)) setTurn(other(who));
    },
    [board, status, finish],
  );

  // The chef "thinks" for a beat, then plays the minimax move.
  React.useEffect(() => {
    if (mode !== 'chef' || status !== 'playing' || turn !== CHEF) {
      setThinking(false);
      return;
    }
    setThinking(true);
    const t = window.setTimeout(
      () => {
        const i = bestMove(board, CHEF);
        setThinking(false);
        if (i >= 0) play(i, CHEF);
      },
      reduce ? 120 : 520 + Math.random() * 300,
    );
    return () => window.clearTimeout(t);
  }, [mode, status, turn, board, play, reduce]);

  const resetBoard = React.useCallback((first: Player) => {
    setBoard(emptyBoard());
    setTurn(first);
    setStatus('playing');
    setWinner(null);
    setWinLine(null);
  }, []);

  const rematch = () => {
    const next = other(starter);
    setStarter(next);
    resetBoard(next);
  };

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setStarter('X');
    resetBoard('X');
  };

  const clearScores = () => {
    writeStorage(scoreKey(mode), EMPTY_TTT_SCORE);
    setScores(EMPTY_TTT_SCORE);
    toast('Scoreboard cleared');
  };

  const humanTurn = mode === 'pass' || turn === HUMAN;
  const locked = status !== 'playing' || !humanTurn || thinking;
  const nameOf = (p: Player) => (mode === 'chef' ? (p === HUMAN ? 'You' : 'Chef') : p);

  let line: string;
  if (status === 'won' && winner) {
    line = mode === 'chef' ? (winner === HUMAN ? 'You beat the chef!' : 'The chef wins this one.') : `${winner} wins!`;
  } else if (status === 'draw') {
    line = "It's a draw.";
  } else if (mode === 'chef') {
    line = turn === HUMAN ? 'Your move.' : 'The chef is thinking…';
  } else {
    line = `${turn} to play.`;
  }

  return (
    <GameShell code={code} title="Tic-tac-toe" backHref={`/t/${encodeURIComponent(code)}/games`} backLabel="All games">
      {/* Mode switch */}
      <div className="mx-auto flex w-full max-w-[400px] rounded-full bg-sunk p-1" role="group" aria-label="Game mode">
        {(
          [
            { id: 'pass', label: 'Pass & play', icon: <Users className="h-4 w-4" aria-hidden /> },
            { id: 'chef', label: 'Play vs the chef', icon: <ChefHat className="h-4 w-4" aria-hidden /> },
          ] as const
        ).map((opt) => {
          const active = mode === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              aria-pressed={active}
              onClick={() => switchMode(opt.id)}
              className={cn(
                'relative flex h-10 flex-1 items-center justify-center gap-2 rounded-full text-[13px] font-semibold transition-colors',
                active ? 'text-fg' : 'text-muted hover:text-fg',
              )}
            >
              {active && (
                <motion.span
                  layoutId="ttt-mode"
                  className="absolute inset-0 rounded-full bg-surface shadow-soft"
                  transition={reduce ? { duration: 0 } : spring}
                  aria-hidden
                />
              )}
              <span className="relative flex items-center gap-2">
                {opt.icon}
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Scoreboard */}
      <div className="mx-auto mt-5 grid w-full max-w-[400px] grid-cols-3 gap-2.5">
        <StatChip label={nameOf('X')} value={scores.x} tone="ember" active={status === 'playing' && turn === 'X'} />
        <StatChip label="Draws" value={scores.draws} />
        <StatChip label={nameOf('O')} value={scores.o} tone="saffron" active={status === 'playing' && turn === 'O'} />
      </div>

      <LiveLine className="mt-5">{line}</LiveLine>

      <div className="mt-4">
        <TicTacToeBoard
          board={board}
          turn={turn}
          winLine={winLine}
          winner={winner}
          locked={locked}
          onPlay={(i) => {
            if (locked) return;
            play(i, turn);
          }}
        />
      </div>

      <div className="mx-auto mt-6 flex w-full max-w-[400px] flex-wrap items-center justify-center gap-3">
        <PressButton
          size="lg"
          variant={status === 'playing' ? 'outline' : 'primary'}
          onClick={rematch}
          leftIcon={<RotateCcw className="h-4 w-4" aria-hidden />}
          className="min-w-[160px]"
        >
          {status === 'playing' ? 'Restart' : 'Rematch'}
        </PressButton>
        <PressButton variant="ghost" size="md" onClick={clearScores} className="text-muted">
          Reset scores
        </PressButton>
      </div>

      <p className="mt-6 text-center text-[13px] leading-relaxed text-muted">
        X plays ember, O plays saffron. The starting player alternates every rematch.
        {mode === 'chef' && ' The chef never loses on purpose — a draw is a good result.'}
      </p>
    </GameShell>
  );
}
