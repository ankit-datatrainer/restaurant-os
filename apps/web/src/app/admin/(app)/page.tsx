import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Dashboard } from '@/components/admin/dashboard';
import { WelcomeDialog } from '@/components/signup/welcome-dialog';

export const metadata: Metadata = { title: 'Dashboard' };

export default function AdminDashboardPage() {
  return (
    <>
      <Dashboard />
      {/* One-time welcome after sign-up (/admin?welcome=1). */}
      <Suspense fallback={null}>
        <WelcomeDialog />
      </Suspense>
    </>
  );
}
