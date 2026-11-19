import type { Metadata } from 'next';
import { StaffView } from '@/components/admin/staff/staff-view';

export const metadata: Metadata = { title: 'Staff & attendance' };

export default function AdminStaffPage() {
  return <StaffView />;
}
