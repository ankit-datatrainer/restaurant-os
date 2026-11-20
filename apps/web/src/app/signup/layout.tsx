import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Start your free trial',
  description: 'Set up your restaurant on Restaurant OS in a few minutes: QR ordering, kitchen display, counter POS and GST bills. 14 days free, no card needed.',
  alternates: { canonical: '/signup' },
};

export const viewport: Viewport = {
  themeColor: '#F4F3F0',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/** Same light admin theme as the staff login; the auth provider lets step 2 see the new session. */
export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="theme-admin min-h-dvh bg-bg text-fg">
      <AuthProvider>{children}</AuthProvider>
    </div>
  );
}
