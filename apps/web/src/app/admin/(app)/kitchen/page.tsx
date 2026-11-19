import type { Metadata } from 'next';
import { KitchenBoard } from '@/components/admin/kitchen-board';

export const metadata: Metadata = { title: 'Kitchen board' };

export default function AdminKitchenPage() {
  return <KitchenBoard />;
}
