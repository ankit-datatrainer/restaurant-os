'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TRIAL_DAYS } from '@restaurant-os/shared';
import { useAuth } from '@/lib/auth';
import { BrandedLoader } from '@/components/admin/admin-guard';
import { SETUP_LOGIN_PATH } from './account-step';
import { RestaurantForm } from './restaurant-form';
import { AccountCheckFailed, AlreadyHasRestaurant, CardLoader } from './parts';
import { SignupFrame } from './signup-frame';
import { metaName } from './draft';

/**
 * /admin/setup: step 2 on its own, for a signed-in account that is not staff anywhere
 * (typically right after confirming the sign-up email). Prefills from the saved draft.
 */
export function SetupScreen() {
  const { session, staff, restaurant, error, errorStatus, signOut, refresh } = useAuth();
  const router = useRouter();
  const [finishing, setFinishing] = React.useState(false);

  React.useEffect(() => {
    if (session === null && !finishing) router.replace(SETUP_LOGIN_PATH);
  }, [session, finishing, router]);

  if (session === undefined || session === null) return <BrandedLoader label="Getting things ready" />;
  if (finishing) return <BrandedLoader label="Opening your restaurant" />;

  const email = session.user.email ?? '';
  const eyebrow = `Your ${TRIAL_DAYS}-day free trial`;

  if (staff) {
    return (
      <SignupFrame eyebrow="Restaurant OS" title="Welcome back.">
        <AlreadyHasRestaurant restaurantName={restaurant?.name ?? 'a restaurant'} email={email} onSignOut={() => void signOut()} />
      </SignupFrame>
    );
  }

  if (!error) {
    return (
      <SignupFrame eyebrow={eyebrow} title="Set up your restaurant." step={2}>
        <CardLoader label="Checking your account" />
      </SignupFrame>
    );
  }

  if (errorStatus !== 403) {
    return (
      <SignupFrame eyebrow={eyebrow} title="Set up your restaurant." step={2}>
        <AccountCheckFailed message={error} onRetry={() => void refresh()} onSignOut={() => void signOut()} />
      </SignupFrame>
    );
  }

  return (
    <SignupFrame
      eyebrow={eyebrow}
      title="Set up your restaurant."
      intro="Your account is ready. Add your restaurant and you’re in. You can change all of this later in Settings."
      step={2}
      footer={
        <p className="mt-6 text-center text-xs text-muted">
          Here to join an existing team instead?{' '}
          <Link href="/admin/join" className="font-semibold text-fg hover:text-ember">
            Use your invite code
          </Link>
        </p>
      }
    >
      <RestaurantForm
        token={session.access_token}
        email={email}
        defaultOwnerName={metaName(session.user.user_metadata)}
        onSignOut={() => void signOut()}
        onCreated={async () => {
          setFinishing(true);
          await refresh();
          router.replace('/admin?welcome=1');
        }}
      />
    </SignupFrame>
  );
}
