import type { Metadata } from 'next';
import { GamesHub } from '@/components/games/games-hub';
import { GamesGate } from '@/components/guest/games-gate';

export const metadata: Metadata = {
  title: 'Table games',
  description: 'Ludo, tic-tac-toe, Memory Match and a reaction test to play while the kitchen cooks.',
};

export default function GamesPage() {
  return (
    <GamesGate>
      <GamesHub />
    </GamesGate>
  );
}
