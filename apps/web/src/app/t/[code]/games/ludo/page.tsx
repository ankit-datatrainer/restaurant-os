import type { Metadata } from 'next';
import { LudoGame } from '@/components/games/ludo/ludo-game';
import { GamesGate } from '@/components/guest/games-gate';

export const metadata: Metadata = {
  title: 'Ludo',
  description: 'Classic Ludo for 2 to 4 players on one phone. Pass and play, or take on the computer.',
};

export default function LudoPage() {
  return (
    <GamesGate title="Ludo">
      <LudoGame />
    </GamesGate>
  );
}
