import type { Metadata } from 'next';
import { PromotionsView } from '@/components/admin/promotions/promotions-view';

export const metadata: Metadata = { title: 'Promotions' };

export default function AdminPromotionsPage() {
  return <PromotionsView />;
}
