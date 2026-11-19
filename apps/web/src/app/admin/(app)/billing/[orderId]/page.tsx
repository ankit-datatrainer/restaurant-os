import type { Metadata } from 'next';
import { BillView } from '@/components/admin/bill-view';

export const metadata: Metadata = { title: 'Bill' };

export default async function AdminBillPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return <BillView orderId={orderId} />;
}
