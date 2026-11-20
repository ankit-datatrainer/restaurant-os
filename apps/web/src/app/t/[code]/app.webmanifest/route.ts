import { guestManifest } from '@/lib/guest-manifest';

/** Home Screen app for this table: reopens /t/<code>. */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  return guestManifest(`/t/${clean}`, 'Restaurant OS');
}
