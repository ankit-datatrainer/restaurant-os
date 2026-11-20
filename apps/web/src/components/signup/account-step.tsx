'use client';

import * as React from 'react';
import { ArrowRight, Eye, EyeOff, MailCheck, RotateCcw } from 'lucide-react';
import { getSupabase } from '@/lib/supabase';
import { Button, Input } from '@/components/ui';
import { saveDraft } from './draft';
import { FormError } from './parts';

type Mode = 'create' | 'signin';

/** Where the confirmation email sends people back to (must be in Supabase Auth → Redirect URLs). */
export const SETUP_LOGIN_PATH = `/admin/login?next=${encodeURIComponent('/admin/setup')}`;

const EXISTS_MSG = 'An account with this email already exists. Sign in with it to continue.';

/**
 * Step 1 "Your account". On success the auth provider picks up the new session and the
 * parent moves to step 2. With email confirmation on, `onConfirmationSent` is called instead.
 */
export function AccountStep({
  onNameChange,
  onConfirmationSent,
}: {
  onNameChange: (name: string) => void;
  onConfirmationSent: (email: string) => void;
}) {
  const [mode, setMode] = React.useState<Mode>('create');
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const em = email.trim();
    const nm = name.trim();
    if (mode === 'create' && !nm) {
      setError('Add your name.');
      return;
    }
    if (!em || !/^\S+@\S+\.\S+$/.test(em)) {
      setError('Enter your email address.');
      return;
    }
    if (mode === 'create' && password.length < 8) {
      setError('Use a password of at least 8 characters.');
      return;
    }
    if (!password) {
      setError('Enter your password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signin') {
        // Straight to Supabase (not the provider's signIn) so a typo here never leaves a stale
        // error in the shared auth state.
        const { error: err } = await getSupabase().auth.signInWithPassword({ email: em, password });
        if (err) {
          if (/invalid login credentials/i.test(err.message)) throw new Error('Wrong email or password.');
          if (/not confirmed/i.test(err.message)) throw new Error('Confirm your email first: open the link we sent you, then sign in here.');
          throw new Error(err.message);
        }
        return; // the session arrives through the auth provider
      }

      onNameChange(nm);
      // Keep the name for step 2, even if that step happens after an email-confirmation round trip.
      saveDraft({ ownerName: nm });
      const { data, error: err } = await getSupabase().auth.signUp({
        email: em,
        password,
        options: {
          data: { full_name: nm },
          emailRedirectTo: `${window.location.origin}${SETUP_LOGIN_PATH}`,
        },
      });
      if (err) {
        if (/already registered|already exists/i.test(err.message)) {
          setMode('signin');
          throw new Error(EXISTS_MSG);
        }
        throw new Error(err.message || 'Could not create your account. Try again.');
      }
      // With confirmation on, Supabase answers a taken email with a user that has no identities.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        setMode('signin');
        throw new Error(EXISTS_MSG);
      }
      if (!data.session) onConfirmationSent(em);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-8 grid gap-4 rounded-3xl border border-line/10 bg-surface p-5 shadow-soft sm:p-6" noValidate>
      {mode === 'create' && (
        <Input label="Your name" name="name" autoComplete="name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Priya Sharma" autoFocus required />
      )}
      <Input
        label="Email"
        type="email"
        name="email"
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@restaurant.in"
        required
      />
      <Input
        id="signup-password"
        label="Password"
        type={showPassword ? 'text' : 'password'}
        name="password"
        autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
        className="[&::-ms-reveal]:hidden"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="••••••••"
        hint={mode === 'create' ? 'At least 8 characters. Do not reuse a password from another site.' : undefined}
        suffix={
          <button
            type="button"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-controls="signup-password"
            onClick={() => setShowPassword((v) => !v)}
            className="grid h-11 w-11 place-items-center rounded-xl text-muted transition hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ember"
          >
            {showPassword ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
          </button>
        }
        required
      />
      <FormError message={error} />
      <Button type="submit" size="lg" loading={busy} rightIcon={<ArrowRight className="h-4 w-4" />} className="mt-1 w-full">
        {mode === 'create' ? 'Create account' : 'Sign in and continue'}
      </Button>
      <p className="text-center text-sm text-muted">
        {mode === 'create' ? (
          <>
            Already have an account?{' '}
            <button type="button" onClick={() => switchMode('signin')} className="font-semibold text-fg hover:text-ember">
              Sign in
            </button>
          </>
        ) : (
          <>
            New here?{' '}
            <button type="button" onClick={() => switchMode('create')} className="font-semibold text-fg hover:text-ember">
              Create an account
            </button>
          </>
        )}
      </p>
    </form>
  );
}

/** Shown when Supabase needs the email confirmed before the first sign-in. */
export function ConfirmEmailCard({ email, onStartOver }: { email: string; onStartOver: () => void }) {
  const [resent, setResent] = React.useState<'idle' | 'busy' | 'sent' | 'error'>('idle');

  const resend = async () => {
    setResent('busy');
    const { error } = await getSupabase().auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}${SETUP_LOGIN_PATH}` },
    });
    setResent(error ? 'error' : 'sent');
  };

  return (
    <div className="mt-8 rounded-3xl border border-line/10 bg-surface p-6 shadow-soft">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-mint-soft text-[#1b6f49]" aria-hidden>
        <MailCheck className="h-5 w-5" />
      </span>
      <h2 className="mt-4 font-display text-xl font-semibold">Check your email to confirm</h2>
      <p className="mt-2 text-[15px] text-muted">
        We sent a confirmation link to <span className="break-all font-medium text-fg">{email}</span>. Confirm it, then sign in. We’ll pick up where you left
        off.
      </p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Button href={SETUP_LOGIN_PATH} rightIcon={<ArrowRight className="h-4 w-4" />}>
          I’ve confirmed, sign in
        </Button>
        <Button variant="outline" leftIcon={<RotateCcw className="h-4 w-4" />} onClick={() => void resend()} loading={resent === 'busy'} disabled={resent === 'sent'}>
          {resent === 'sent' ? 'Sent again' : 'Resend the email'}
        </Button>
      </div>
      <p className="mt-4 text-xs text-muted" aria-live="polite">
        {resent === 'error' ? 'We could not resend it just now. Wait a minute and try again. ' : 'Nothing there? Check spam or promotions. '}
        <button type="button" onClick={onStartOver} className="font-semibold text-fg/80 hover:text-fg">
          Use a different email
        </button>
      </p>
    </div>
  );
}
