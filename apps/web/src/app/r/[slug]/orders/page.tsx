import type { Metadata } from 'next';
import { TakeawayOrdersScreen } from '@/components/restaurant/takeaway-orders-screen';

export const metadata: Metadata = {
  title: 'Your takeaway orders',
  robots: { index: false },
};

/** This phone's takeaway orders at the restaurant, with live status. */
export default function TakeawayOrdersPage() {
  return <TakeawayOrdersScreen />;
}
