import type { Metadata } from 'next';
import { TrackerScreen } from '@/components/guest/tracker-screen';

export const metadata: Metadata = { title: 'Track your order' };

/** Live tracker for one order (polls while it is still moving). */
export default function OrderTrackerPage() {
  return <TrackerScreen />;
}
