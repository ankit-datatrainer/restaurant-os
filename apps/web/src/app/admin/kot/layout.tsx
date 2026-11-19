import { Suspense } from 'react';
import { AdminGuard, BrandedLoader } from '@/components/admin/admin-guard';

/**
 * Kitchen tickets open in their own tab, so they sit outside the (app) shell: nothing but the
 * ticket is on the page (no sidebar or topbar to hide when printing), and the tab does not start
 * a second live board that would chime and read out orders alongside the counter's.
 */
export default function AdminKotLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<BrandedLoader label="Loading ticket" />}>
      <AdminGuard>{children}</AdminGuard>
    </Suspense>
  );
}
