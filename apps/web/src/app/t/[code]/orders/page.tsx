import type { Metadata } from 'next';
import { OrdersScreen } from '@/components/guest/orders-screen';

export const metadata: Metadata = { title: 'My orders' };

/** Every order this phone placed at the table, with a running bill. */
export default function TableOrdersPage() {
  return <OrdersScreen />;
}
