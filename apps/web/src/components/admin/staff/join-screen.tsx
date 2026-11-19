'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, CheckCircle2, Clock, KeyRound, LogOut, MailCheck, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { adminApi, ApiRequestError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { getSupabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { EASE_OUT } from '@/lib/motion';
import { Button, Input, Logo } from '@/components/ui';
import { BrandedLoader } from '../admin-guard';

function cleanCode(v: string): string {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

type Mode = 'create' | 'signin';

export function JoinScreen() {
  const { session, staff, restaurant, loading, signIn, signOut, refresh } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const reduce = useReducedMotion();
  const initialCode = cleanCode(params.get('code') ?? '');
  const [joined, setJoined] = React.useState(false);

  if (session === undefined || loading) return <BrandedLoader label="Opening your invite" />;
  if (joined) return <BrandedLoader label="Opening your restaurant" />;

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col gutter py-8 sm:py-12">
        <Logo href="/" />
        <motion.div
          className="my-auto w-full max-w-md py-10"
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE_OUT }}
        >
          <p className="eyebrow">Join your team</p>
          <h1 className="mt-3 font-display text-display-sm font-semibold">You’re invited.</h1>

          {session && staff ? (
            <AlreadyStaff restaurantName={restaurant?.name ?? 'a restaurant'} email={session.user.email ?? ''} onOpen={() => router.replace('/admin')} onSignOut={() => void signOut()} />
          ) : session ? (
            <JoinStep
              token={session.access_token}
              email={session.user.email ?? ''}
              initialCode={initialCode}
              onJoined={async () => {
                setJoined(true);
                await refresh();
                router.replace('/admin');
              }}
              onSignOut={() => void signOut()}
            />
          ) : (
            <AccountStep hasCode={Boolean(initialCode)} signIn={signIn} />
          )}
        </motion.div>
      </div>

      <div className="relative hidden overflow-hidden bg-ink text-paper lg:flex lg:flex-col lg:justify-center lg:p-12 grain">
        <div
          className="pointer-events-none absolute -right-32 -top-32 h-[520px] w-[520px] rounded-full opacity-60 blur-3xl"
          style={{ background: 'radial-gradient(closest-side, rgba(255,92,42,0.45), transparent)' }}
          aria-hidden
        />
        <div className="relative max-w-md">
          <p className="eyebrow text-paper/50">How joining works</p>
          <h2 className="mt-3 font-display text-display-sm font-semibold leading-tight">
            Your own login. <span className="font-serif italic text-ember">No shared passwords.</span>
          </h2>
          <ol className="mt-10 space-y-5">
            {[
              { icon: UserPlus, title: 'Create your account', text: 'Use your own email and a password only you know.' },
              { icon: KeyRound, title: 'Enter the invite code', text: 'Your manager’s 8-character code links you to the restaurant with the right role.' },
              { icon: Clock, title: 'Clock in and start', text: 'Orders, the kitchen board and your shift hours are all in one place.' },
            ].map((s, i) => (
              <li key={s.title} className="flex items-start gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-paper/15 bg-paper/5 text-ember" aria-hidden>
                  <s.icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-semibold">
                    <span className="tnum mr-2 font-mono text-xs text-paper/50">0{i + 1}</span>
                    {s.title}
                  </p>
                  <p className="mt-1 text-sm text-paper/65">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function FormError({ message }: { message: string | null }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.p
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="rounded-xl bg-rose-soft px-3.5 py-2.5 text-sm font-medium text-[#a1282c]"
          role="alert"
        >
          {message}
        </motion.p>
      )}
    </AnimatePresence>
  );
}

function AccountStep({ hasCode, signIn }: { hasCode: boolean; signIn: (email: string, password: string) => Promise<void> }) {
  const [mode, setMode] = React.useState<Mode>('create');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [sentTo, setSentTo] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const em = email.trim();
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
        await signIn(em, password);
        // The auth provider picks up the session and this screen moves to the code step.
      } else {
        const { data, error: err } = await getSupabase().auth.signUp({
          email: em,
          password,
          options: { emailRedirectTo: window.location.href },
        });
        if (err) {
          if (/already registered|already exists/i.test(err.message)) {
            setMode('signin');
            throw new Error('An account with this email already exists. Sign in with it instead.');
          }
          throw new Error(err.message);
        }
        // Supabase returns a user with no identities when the email is already taken (and confirmation is on).
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          setMode('signin');
          throw new Error('An account with this email already exists. Sign in with it instead.');
        }
        if (!data.session) setSentTo(em);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (sentTo) {
    return (
      <div className="mt-8 rounded-3xl border border-line/10 bg-surface p-6 shadow-soft">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-mint-soft text-[#1b6f49]" aria-hidden>
          <MailCheck className="h-5 w-5" />
        </span>
        <h2 className="mt-4 font-display text-xl font-semibold">Check your email to confirm</h2>
        <p className="mt-2 text-[15px] text-muted">
          We sent a confirmation link to <span className="font-medium text-fg">{sentTo}</span>. Confirm it, then come back to this invite link to finish joining.
        </p>
        <button
          type="button"
          onClick={() => {
            setSentTo(null);
            setMode('signin');
            setPassword('');
          }}
          className="mt-5 text-sm font-semibold text-ember hover:underline"
        >
          Already confirmed? Sign in
        </button>
      </div>
    );
  }

  return (
    <>
      <p className="mt-3 text-[15px] text-muted">
        {hasCode ? 'Your invite code is ready. ' : ''}
        {mode === 'create' ? 'First, create your own login for the counter dashboard.' : 'Sign in with your account, then confirm the invite code.'}
      </p>
      <form onSubmit={submit} className="mt-8 grid gap-4 rounded-3xl border border-line/10 bg-surface p-5 shadow-soft sm:p-6" noValidate>
        <div className="flex rounded-full bg-sunk p-1" role="tablist" aria-label="Account">
          {(['create', 'signin'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={cn('h-9 flex-1 rounded-full px-4 text-[13px] font-semibold transition', mode === m ? 'bg-surface text-fg shadow-soft' : 'text-muted hover:text-fg')}
            >
              {m === 'create' ? 'New account' : 'I have an account'}
            </button>
          ))}
        </div>
        <Input label="Email" type="email" name="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
        <Input
          label="Password"
          type="password"
          name="password"
          autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          hint={mode === 'create' ? 'At least 8 characters. Do not reuse a password from another site.' : undefined}
          required
        />
        <FormError message={error} />
        <Button type="submit" size="lg" loading={busy} rightIcon={<ArrowRight className="h-4 w-4" />} className="mt-1 w-full">
          {mode === 'create' ? 'Create account' : 'Sign in'}
        </Button>
      </form>
    </>
  );
}

function JoinStep({
  token,
  email,
  initialCode,
  onJoined,
  onSignOut,
}: {
  token: string;
  email: string;
  initialCode: string;
  onJoined: () => Promise<void>;
  onSignOut: () => void;
}) {
  const [code, setCode] = React.useState(initialCode);
  const [name, setName] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [alreadyMember, setAlreadyMember] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = cleanCode(code);
    if (c.length < 6) {
      setError('Enter the 8-character invite code from your manager.');
      return;
    }
    if (!name.trim()) {
      setError('Add your name so the team knows who you are.');
      return;
    }
    setBusy(true);
    setError(null);
    setAlreadyMember(false);
    try {
      const staff = await adminApi.joinRestaurant(token, { code: c, display_name: name.trim() });
      toast.success(`Welcome, ${staff.display_name}! You’re on the team.`);
      await onJoined();
    } catch (err) {
      const msg = err instanceof ApiRequestError || err instanceof Error ? err.message : 'Could not join. Try again.';
      setError(msg);
      if (/already belongs/i.test(msg)) setAlreadyMember(true);
      setBusy(false);
    }
  };

  return (
    <>
      <p className="mt-3 text-[15px] text-muted">Enter the invite code and the name your team should see.</p>
      <form onSubmit={submit} className="mt-8 grid gap-4 rounded-3xl border border-line/10 bg-surface p-5 shadow-soft sm:p-6" noValidate>
        <Input
          label="Invite code"
          value={code}
          onChange={(e) => setCode(cleanCode(e.target.value))}
          placeholder="K7Q3M9XD"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="tnum text-center font-mono text-xl uppercase tracking-[0.2em]"
        />
        <Input label="Your name" value={name} maxLength={60} autoComplete="name" onChange={(e) => setName(e.target.value)} placeholder="Priya Sharma" autoFocus={Boolean(initialCode)} />
        <FormError message={error} />
        {alreadyMember && (
          <Button href="/admin" variant="outline" className="w-full">
            Open my dashboard
          </Button>
        )}
        <Button type="submit" size="lg" loading={busy} rightIcon={<ArrowRight className="h-4 w-4" />} className="mt-1 w-full">
          Join the team
        </Button>
        <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-muted">
          Signed in as <span className="font-medium text-fg">{email}</span>
          <button type="button" onClick={onSignOut} className="inline-flex items-center gap-1 font-semibold text-fg/80 hover:text-fg">
            <LogOut className="h-3 w-3" aria-hidden /> Use another account
          </button>
        </p>
      </form>
    </>
  );
}

function AlreadyStaff({ restaurantName, email, onOpen, onSignOut }: { restaurantName: string; email: string; onOpen: () => void; onSignOut: () => void }) {
  return (
    <div className="mt-8 rounded-3xl border border-line/10 bg-surface p-6 shadow-soft">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-mint-soft text-[#1b6f49]" aria-hidden>
        <CheckCircle2 className="h-5 w-5" />
      </span>
      <h2 className="mt-4 font-display text-xl font-semibold">You’re already on a team</h2>
      <p className="mt-2 text-[15px] text-muted">
        <span className="font-medium text-fg">{email}</span> is staff at <span className="font-medium text-fg">{restaurantName}</span>. An account can belong to one restaurant. To use this
        invite, sign out and create a new account with another email.
      </p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Button onClick={onOpen} rightIcon={<ArrowRight className="h-4 w-4" />}>
          Open the dashboard
        </Button>
        <Button variant="outline" leftIcon={<LogOut className="h-4 w-4" />} onClick={onSignOut}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
