import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/lib/auth';

export const metadata: Metadata = {
  title: { default: 'Console', template: '%s · Restaurant OS Console' },
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export const viewport: Viewport = {
  themeColor: '#F4F3F0',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="theme-admin min-h-dvh overflow-x-clip bg-bg text-fg">
      <AuthProvider>{children}</AuthProvider>
    </div>
  );
}
