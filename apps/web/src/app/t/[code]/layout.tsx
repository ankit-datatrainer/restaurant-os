import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { GuestShell } from '@/components/guest/guest-shell';

export const metadata: Metadata = {
  title: 'Menu',
  description: 'Order from your phone. The kitchen gets it the second you tap Place order.',
};

export const viewport: Viewport = {
  themeColor: '#F7F4EE',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/**
 * Shell for every guest page at a table (/t/[code], orders, tracker, games).
 * Keeps no header of its own: each page draws its own chrome.
 */
export default async function TableLayout({ children, params }: { children: ReactNode; params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <GuestShell code={code}>{children}</GuestShell>;
}
