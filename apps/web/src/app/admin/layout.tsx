import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/lib/auth';

export const metadata: Metadata = {
  title: { default: 'Dashboard', template: '%s · Restaurant OS Admin' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#F4F3F0',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="theme-admin min-h-dvh bg-bg text-fg">
      <AuthProvider>{children}</AuthProvider>
    </div>
  );
}
