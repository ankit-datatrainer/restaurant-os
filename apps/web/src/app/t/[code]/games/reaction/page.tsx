import type { Metadata } from 'next';
import { ReactionGame } from '@/components/games/reaction/reaction-game';
import { GamesGate } from '@/components/guest/games-gate';

export const metadata: Metadata = {
  title: 'Tap when it sizzles',
  description: 'A five-round reaction test. Wait for the pan to sizzle, then tap as fast as you can.',
};

export default function ReactionPage() {
  return (
    <GamesGate title="Tap when it sizzles">
      <ReactionGame />
    </GamesGate>
  );
}
