import type { Metadata } from 'next';
import { CallsView } from '@/components/admin/calls-view';

export const metadata: Metadata = { title: 'Calls' };

export default function AdminCallsPage() {
  return <CallsView />;
}
