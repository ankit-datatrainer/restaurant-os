import type { Metadata } from 'next';
import { SubscriptionView } from '@/components/admin/subscription-view';

export const metadata: Metadata = { title: 'Plan & billing' };

export default function AdminSubscriptionPage() {
  return <SubscriptionView />;
}
