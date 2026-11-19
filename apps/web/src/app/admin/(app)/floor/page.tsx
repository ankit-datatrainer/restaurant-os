import type { Metadata } from 'next';
import { FloorView } from '@/components/admin/floor/floor-view';

export const metadata: Metadata = { title: 'Floor' };

export default function AdminFloorPage() {
  return <FloorView />;
}
