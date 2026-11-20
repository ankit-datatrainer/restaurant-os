import type { Metadata } from 'next';
import { WaitFlow } from '@/components/guest/wait-flow';

export const metadata: Metadata = { title: 'While you wait', robots: { index: false } };

/** Right after placing an order (once per order): the restaurant's story video, then games and alerts. */
export default function WaitPage() {
  return <WaitFlow />;
}
