'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { TRIAL_DAYS } from '@restaurant-os/shared';
import { useAuth } from '@/lib/auth';
import { BrandedLoader } from '@/components/admin/admin-guard';
import { AccountStep, ConfirmEmailCard } from './account-step';
import { RestaurantForm } from './restaurant-form';
import { AccountCheckFailed, AlreadyHasRestaurant, CardLoader } from './parts';
import { SignupFrame } from './signup-frame';
import { metaName } from './draft';

/** /signup: step 1 creates the login, step 2 creates the restaurant (free trial, no card). */
export function SignupScreen() {
  const { session, staff, restaurant, error, errorStatus, signOut, refresh } = useAuth();
  const router = useRouter();
  const [finishing, setFinishing] = React.useState(false);
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const [typedName, setTypedName] = React.useState('');

  if (session === undefined) return <BrandedLoader label="Getting things ready" />;
  if (finishing) return <BrandedLoader label="Opening your restaurant" />;

  const signedOutFooter = (
    <div className="mt-6 grid gap-1.5 text-center text-xs text-muted">
      <p>
        Joining a team that already uses Restaurant OS?{' '}
        <Link href="/admin/join" className="font-semibold text-fg hover:text-ember">
          Use your invite code
        </Link>
      </p>
      <p>
        We use your email only for your account.{' '}
        <Link href="/privacy" className="underline underline-offset-2 hover:text-fg">
          Privacy policy
        </Link>
      </p>
    </div>
  );

  if (!session) {
    return (
      <SignupFrame
        eyebrow={`Start your ${TRIAL_DAYS}-day free trial`}
        title="Set up your restaurant in a few minutes."
        intro="First, your own login. Next, your restaurant’s name, web address and tables. No card needed."
        step={1}
        footer={sentTo ? null : signedOutFooter}
      >
        {sentTo ? (
          <ConfirmEmailCard email={sentTo} onStartOver={() => setSentTo(null)} />
        ) : (
          <AccountStep onNameChange={setTypedName} onConfirmationSent={setSentTo} />
        )}
      </SignupFrame>
    );
  }

  const email = session.user.email ?? '';

  if (staff) {
    return (
      <SignupFrame eyebrow="Restaurant OS" title="Welcome back.">
        <AlreadyHasRestaurant restaurantName={restaurant?.name ?? 'a restaurant'} email={email} onSignOut={() => void signOut()} />
      </SignupFrame>
    );
  }

  if (!error) {
    return (
      <SignupFrame eyebrow={`Start your ${TRIAL_DAYS}-day free trial`} title="Tell us about your restaurant." step={2}>
        <CardLoader label="Checking your account" />
      </SignupFrame>
    );
  }

  if (errorStatus !== 403) {
    return (
      <SignupFrame eyebrow={`Start your ${TRIAL_DAYS}-day free trial`} title="Tell us about your restaurant." step={2}>
        <AccountCheckFailed message={error} onRetry={() => void refresh()} onSignOut={() => void signOut()} />
      </SignupFrame>
    );
  }

  return (
    <SignupFrame
      eyebrow={`Start your ${TRIAL_DAYS}-day free trial`}
      title="Tell us about your restaurant."
      intro="You can change all of this later in Settings."
      step={2}
    >
      <RestaurantForm
        token={session.access_token}
        email={email}
        defaultOwnerName={typedName || metaName(session.user.user_metadata)}
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
