import type { Metadata, Viewport } from 'next';
import { UnsubscribeCard } from '@/components/guest/unsubscribe-card';

export const metadata: Metadata = {
  title: 'Unsubscribe',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#F7F4EE',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/** Opt out of a restaurant's WhatsApp offers (link sent with every offer message). */
export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="theme-light flex min-h-dvh flex-col items-center justify-center bg-bg px-4 py-12 text-fg pb-[max(3rem,env(safe-area-inset-bottom,0px))]">
      <UnsubscribeCard token={token} />
    </main>
  );
}
