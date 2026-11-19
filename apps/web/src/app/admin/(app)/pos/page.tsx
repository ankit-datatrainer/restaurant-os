import type { Metadata } from 'next';
import { PosView } from '@/components/admin/pos/pos-view';

export const metadata: Metadata = { title: 'Counter' };

export default function AdminPosPage() {
  return <PosView />;
}
