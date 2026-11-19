import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BrandedLoader } from '@/components/admin/admin-guard';
import { JoinScreen } from '@/components/admin/staff/join-screen';

export const metadata: Metadata = {
  title: 'Join your team',
  description: 'Create your staff login and join your restaurant on Restaurant OS with an invite code.',
};

/** Lives outside the (app) guard: the person joining has no staff row yet. */
export default function AdminJoinPage() {
  return (
    <Suspense fallback={<BrandedLoader label="Opening your invite" />}>
      <JoinScreen />
    </Suspense>
  );
}
