import type { Metadata } from 'next';
import { BillReceipt } from '@/components/admin/bills/bill-receipt';

export const metadata: Metadata = { title: 'Receipt' };

export default async function AdminBillReceiptPage({ params }: { params: Promise<{ billId: string }> }) {
  const { billId } = await params;
  return <BillReceipt billId={billId} />;
}
