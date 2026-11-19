import type { Metadata } from 'next';
import { MemoryMatch } from '@/components/games/memory/memory-match';
import { GamesGate } from '@/components/guest/games-gate';

export const metadata: Metadata = {
  title: 'Memory Match',
  description: 'Flip the cards and find all six food pairs as fast as you can.',
};

export default function MemoryPage() {
  return (
    <GamesGate title="Memory Match">
      <MemoryMatch />
    </GamesGate>
  );
}
