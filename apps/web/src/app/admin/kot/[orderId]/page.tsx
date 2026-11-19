import type { Metadata } from 'next';
import { KotTicket } from '@/components/admin/kot-ticket';

export const metadata: Metadata = { title: 'Kitchen ticket' };

export default async function AdminKotPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ round?: string | string[] }>;
}) {
  const { orderId } = await params;
  const { round } = await searchParams;
  const n = Number(Array.isArray(round) ? round[0] : round);
  return <KotTicket orderId={orderId} round={Number.isInteger(n) && n >= 1 ? n : null} />;
}
