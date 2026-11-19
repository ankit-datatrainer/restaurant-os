import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginScreen } from '@/components/admin/login-screen';
import { BrandedLoader } from '@/components/admin/admin-guard';

export const metadata: Metadata = {
  title: 'Staff sign in',
  description: 'Sign in to the Restaurant OS counter dashboard.',
};

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<BrandedLoader label="Loading sign in" />}>
      <LoginScreen />
    </Suspense>
  );
}
