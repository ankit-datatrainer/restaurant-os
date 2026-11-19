import { Suspense } from 'react';
import { AdminGuard, BrandedLoader } from '@/components/admin/admin-guard';
import { AdminProvider } from '@/components/admin/admin-provider';
import { AdminShell } from '@/components/admin/shell';

/** Everything in this route group sits behind the staff guard; /admin/login lives outside it. */
export default function AdminAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<BrandedLoader />}>
      <AdminGuard>
        <AdminProvider>
          <AdminShell>{children}</AdminShell>
        </AdminProvider>
      </AdminGuard>
    </Suspense>
  );
}
