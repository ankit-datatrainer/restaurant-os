'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import { ChevronRight, KeyRound, LogOut, ShieldAlert, Store } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Button, LogoMark } from '@/components/ui';

/** Full-screen branded loader shown while the session and staff profile load. */
export function BrandedLoader({ label = 'Opening your counter' }: { label?: string }) {
  const reduce = useReducedMotion();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-bg text-fg" role="status" aria-live="polite">
      <motion.div
        initial={reduce ? false : { opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative"
      >
        <span className="absolute inset-0 rounded-2xl bg-ember/30 animate-pulse-ring" aria-hidden />
        <LogoMark size={44} className="relative text-ink" />
      </motion.div>
      <p className="mt-5 font-display text-lg font-semibold">
        Restaurant<span className="text-ember">OS</span>
      </p>
      <p className="mt-1 flex items-center gap-2 font-mono text-2xs uppercase tracking-[0.18em] text-muted">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ember" aria-hidden />
        {label}
      </p>
    </div>
  );
}

/**
 * Wraps everything under /admin except /admin/login.
 * - session loading → loader
 * - signed out → /admin/login?next=…
 * - signed in but not staff of any restaurant → set up a restaurant, join a team, or sign out
 */
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { session, staff, error, errorStatus, refresh, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  React.useEffect(() => {
    if (session !== null) return;
    const qs = search.toString();
    const next = `${pathname}${qs ? `?${qs}` : ''}`;
    router.replace(`/admin/login?next=${encodeURIComponent(next)}`);
  }, [session, pathname, search, router]);

  if (session === undefined || session === null) return <BrandedLoader />;

  if (!staff) {
    if (!error) return <BrandedLoader label="Loading your restaurant" />;
    if (errorStatus === 403) return <NoRestaurant email={session.user.email ?? ''} onSignOut={() => void signOut()} />;
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg px-5 text-fg">
        <div className="w-full max-w-md rounded-3xl bg-surface p-8 text-center shadow-soft">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-soft text-rose" aria-hidden>
            <ShieldAlert className="h-6 w-6" />
          </span>
          <h1 className="mt-5 font-display text-2xl font-semibold">We could not open your restaurant</h1>
          <p className="mt-2 text-sm text-muted">{error}</p>
          <p className="mt-1 text-sm text-muted">
            Signed in as <span className="font-medium text-fg">{session.user.email}</span>. Check that the API is running and try again.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button variant="outline" leftIcon={<LogOut className="h-4 w-4" />} onClick={() => void signOut()}>
              Sign out
            </Button>
            <Button variant="ghost" onClick={() => void refresh()}>
              Try again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

/** A valid login that is not staff anywhere (403 from /api/admin/me): offer the two ways in. */
function NoRestaurant({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const choices = [
    { href: '/admin/setup', icon: Store, title: 'Set up a new restaurant', text: 'Start a free trial with this account as the owner.' },
    { href: '/admin/join', icon: KeyRound, title: 'Join a team with an invite code', text: 'Your manager gives you an 8-character code.' },
  ];
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-5 py-10 text-fg">
      <div className="w-full max-w-md rounded-3xl bg-surface p-6 shadow-soft sm:p-8">
        <LogoMark size={36} className="text-ink" />
        <h1 className="mt-5 font-display text-2xl font-semibold">This account has no restaurant yet</h1>
        <p className="mt-2 text-sm text-muted">
          You’re signed in as <span className="break-all font-medium text-fg">{email}</span>. What would you like to do?
        </p>
        <ul className="mt-6 grid gap-2">
          {choices.map((c) => (
            <li key={c.href}>
              <Link
                href={c.href}
                className="group flex items-center gap-3 rounded-2xl border border-line/10 p-4 transition hover:border-ember/40 hover:bg-ember-soft/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ember"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sunk text-ember" aria-hidden>
                  <c.icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{c.title}</span>
                  <span className="block text-xs text-muted">{c.text}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-ember" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex justify-center">
          <Button variant="ghost" size="sm" leftIcon={<LogOut className="h-4 w-4" />} onClick={onSignOut}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
