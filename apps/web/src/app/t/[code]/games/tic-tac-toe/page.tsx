import type { Metadata } from 'next';
import { TicTacToe } from '@/components/games/tic-tac-toe/tic-tac-toe';
import { GamesGate } from '@/components/guest/games-gate';

export const metadata: Metadata = {
  title: 'Tic-tac-toe',
  description: 'Pass-and-play tic-tac-toe, or take on the chef.',
};

export default function TicTacToePage() {
  return (
    <GamesGate title="Tic-tac-toe">
      <TicTacToe />
    </GamesGate>
  );
}
