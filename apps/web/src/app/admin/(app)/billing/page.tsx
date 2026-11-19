import type { Metadata } from 'next';
import { BillingView } from '@/components/admin/billing-view';

export const metadata: Metadata = { title: 'Billing' };

export default function AdminBillingPage() {
  return <BillingView />;
}
