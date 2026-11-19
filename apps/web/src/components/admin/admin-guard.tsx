'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { LogOut, ShieldAlert } from 'lucide-react';
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
 * - signed in but not staff of any restaurant → explanation + sign out
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
    const notStaff = errorStatus === 403;
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg px-5 text-fg">
        <div className="w-full max-w-md rounded-3xl bg-surface p-8 text-center shadow-soft">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-soft text-rose" aria-hidden>
            <ShieldAlert className="h-6 w-6" />
          </span>
          <h1 className="mt-5 font-display text-2xl font-semibold">We could not open your restaurant</h1>
          <p className="mt-2 text-sm text-muted">{error}</p>
          <p className="mt-1 text-sm text-muted">
            Signed in as <span className="font-medium text-fg">{session.user.email}</span>.
            {notStaff ? ' This account is not linked to a restaurant as staff. Ask the owner to add you, or sign in with the staff account.' : ' Check that the API is running and try again.'}
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button variant="outline" leftIcon={<LogOut className="h-4 w-4" />} onClick={() => void signOut()}>
              Sign out
            </Button>
            {!notStaff && (
              <Button variant="ghost" onClick={() => void refresh()}>
                Try again
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
