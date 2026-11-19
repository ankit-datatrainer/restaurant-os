import type { Metadata } from 'next';
import { CustomerDisplayScreen } from '@/components/admin/pos/customer-display-screen';

export const metadata: Metadata = { title: 'Customer display' };

/**
 * Guest-facing screen. It sits outside the (app) shell and needs no sign-in: it only listens on a
 * BroadcastChannel for what the counter tab in the same browser posts, and never fetches data.
 */
export default function AdminCustomerDisplayPage() {
  return <CustomerDisplayScreen />;
}
