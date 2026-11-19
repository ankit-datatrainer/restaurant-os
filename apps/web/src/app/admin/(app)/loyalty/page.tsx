import type { Metadata } from 'next';
import { LoyaltyView } from '@/components/admin/loyalty-view';

export const metadata: Metadata = { title: 'Loyalty' };

export default function AdminLoyaltyPage() {
  return <LoyaltyView />;
}
