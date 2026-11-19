import type { Metadata } from 'next';
import { ReservationsView } from '@/components/admin/reservations/reservations-view';

export const metadata: Metadata = { title: 'Reservations' };

export default function AdminReservationsPage() {
  return <ReservationsView />;
}
