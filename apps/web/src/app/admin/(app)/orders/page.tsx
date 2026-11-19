import type { Metadata } from 'next';
import { OrdersView } from '@/components/admin/orders-view';

export const metadata: Metadata = { title: 'Live orders' };

export default function AdminOrdersPage() {
  return <OrdersView />;
}
