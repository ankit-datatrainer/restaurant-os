'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, LogOut, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui';

export function FormError({ message, children }: { message: string | null; children?: React.ReactNode }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden"
        >
          <p className="rounded-xl bg-rose-soft px-3.5 py-2.5 text-sm font-medium text-[#a1282c]" role="alert">
            {message}
          </p>
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Small in-card loader (the page chrome stays put). */
export function CardLoader({ label }: { label: string }) {
  return (
    <div className="mt-8 flex items-center gap-3 rounded-3xl border border-line/10 bg-surface p-6 text-sm text-muted shadow-soft" role="status" aria-live="polite">
      <Loader2 className="h-4 w-4 animate-spin text-ember" aria-hidden />
      {label}
    </div>
  );
}

/** Signed in and already staff somewhere: one account belongs to one restaurant. */
export function AlreadyHasRestaurant({
  restaurantName,
  email,
  onSignOut,
}: {
  restaurantName: string;
  email: string;
  onSignOut: () => void;
}) {
  return (
    <div className="mt-8 rounded-3xl border border-line/10 bg-surface p-6 shadow-soft">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-mint-soft text-[#1b6f49]" aria-hidden>
        <CheckCircle2 className="h-5 w-5" />
      </span>
      <h2 className="mt-4 font-display text-xl font-semibold">You already have a restaurant</h2>
      <p className="mt-2 text-[15px] text-muted">
        <span className="break-all font-medium text-fg">{email}</span> runs <span className="font-medium text-fg">{restaurantName}</span>. An account belongs to
        one restaurant. To set up another one, sign out and start again with a different email.
      </p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Button href="/admin" rightIcon={<ArrowRight className="h-4 w-4" />}>
          Open your dashboard
        </Button>
        <Button variant="outline" leftIcon={<LogOut className="h-4 w-4" />} onClick={onSignOut}>
          Sign out
        </Button>
      </div>
    </div>
  );
}

/** The API could not tell us whether this account has a restaurant (network, server down). */
export function AccountCheckFailed({ message, onRetry, onSignOut }: { message: string; onRetry: () => void; onSignOut: () => void }) {
  return (
    <div className="mt-8 rounded-3xl border border-line/10 bg-surface p-6 shadow-soft">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-soft text-rose" aria-hidden>
        <AlertTriangle className="h-5 w-5" />
      </span>
      <h2 className="mt-4 font-display text-xl font-semibold">We could not check your account</h2>
      <p className="mt-2 text-[15px] text-muted">{message}</p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Button onClick={onRetry} leftIcon={<RotateCcw className="h-4 w-4" />}>
          Try again
        </Button>
        <Button variant="outline" leftIcon={<LogOut className="h-4 w-4" />} onClick={onSignOut}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
