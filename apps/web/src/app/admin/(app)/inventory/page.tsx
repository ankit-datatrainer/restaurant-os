import type { Metadata } from 'next';
import { InventoryView } from '@/components/admin/inventory/inventory-view';

export const metadata: Metadata = { title: 'Inventory' };

export default function AdminInventoryPage() {
  return <InventoryView />;
}
