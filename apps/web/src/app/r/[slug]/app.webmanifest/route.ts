import { guestManifest } from '@/lib/guest-manifest';

/** Home Screen app for this restaurant page: reopens /r/<slug> (takeaway orders and bookings). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const clean = slug.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60);
  return guestManifest(`/r/${clean}`, 'Restaurant OS');
}
