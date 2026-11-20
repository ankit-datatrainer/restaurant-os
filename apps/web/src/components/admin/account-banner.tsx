'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Hourglass, PauseCircle, X } from 'lucide-react';
import { trialDaysLeft } from '@restaurant-os/shared';
import { cn } from '@/lib/utils';
import { useAdmin } from './admin-provider';
import { isManagerRole } from './plan';
import { useNow } from './use-now';

const DISMISS_KEY = 'ros:trial-banner-dismissed';

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/**
 * Account state above every page: paused by Restaurant OS, free trial running, or trial over.
 * Kitchen and waiter staff only ever get a one-line note (and nothing for a running trial).
 */
export function AccountBanner() {
  const { restaurant, staff } = useAdmin();
  const now = useNow(10 * 60_000);
  const manager = isManagerRole(staff.role);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    try {
      setDismissed(window.sessionStorage.getItem(DISMISS_KEY) === restaurant.id);
    } catch {
      /* storage blocked: show the banner */
    }
  }, [restaurant.id]);

  if (restaurant.status === 'suspended') {
    return (
      <div className="mb-4 flex items-start gap-3 rounded-xl bg-rose-soft px-4 py-3 text-sm font-medium text-[#a1282c] print:hidden" role="alert">
        <PauseCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        {manager ? (
          <p className="min-w-0 flex-1">
            Your account is paused — guests can’t place orders. Contact Restaurant OS to turn it back on.{' '}
            <a href="/contact" target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">
              Contact us
            </a>
          </p>
        ) : (
          <p className="min-w-0 flex-1 truncate">Account paused — guests can’t place orders. Tell your manager.</p>
        )}
      </div>
    );
  }

  const days = trialDaysLeft(restaurant, now);
  if (days === null || !restaurant.trial_ends_at) return null;
  const ends = formatDay(restaurant.trial_ends_at);

  if (days <= 0) {
    if (!manager) {
      return (
        <p className="mb-4 truncate rounded-xl bg-saffron-soft px-4 py-2.5 text-sm font-medium text-[#8a5a00] print:hidden" role="note">
          The free trial has ended. Your manager can choose a plan.
        </p>
      );
    }
    return (
      <div className="mb-4 flex flex-col gap-3 rounded-xl bg-saffron-soft px-4 py-3 text-sm text-[#8a5a00] sm:flex-row sm:items-center print:hidden" role="note">
        <Hourglass className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden />
        <p className="min-w-0 flex-1">
          <span className="font-semibold">Your free trial ended on {ends}.</span> Choose a plan to keep using Restaurant OS — the team will set it up with you.
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link href="/admin/subscription" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-3.5 text-[13px] font-semibold text-paper transition hover:bg-ink-3">
            Plan &amp; billing <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
          <a href="/contact" target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-full border border-[#8a5a00]/25 px-3.5 text-[13px] font-semibold transition hover:bg-white/40">
            Talk to us
          </a>
        </div>
      </div>
    );
  }

  // A running trial is the owner's business, not the kitchen's.
  if (!manager) return null;
  const urgent = days <= 3;
  if (!urgent && dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, restaurant.id);
    } catch {
      /* fine: hidden for this page view */
    }
  };

  return (
    <div
      className={cn(
        'mb-4 flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm print:hidden',
        urgent ? 'bg-saffron-soft text-[#8a5a00]' : 'border border-line/10 bg-surface text-fg/80',
      )}
      role="note"
    >
      <Hourglass className={cn('h-4 w-4 shrink-0', urgent ? '' : 'text-muted')} aria-hidden />
      <p className="min-w-0 flex-1">
        <span className={cn(urgent && 'font-semibold')}>
          Your free trial ends in {days} day{days === 1 ? '' : 's'}
        </span>
        <span className="hidden sm:inline"> ({ends})</span> —{' '}
        <Link href="/admin/subscription" className={cn('font-semibold underline-offset-2 hover:underline', urgent ? '' : 'text-ember')}>
          choose a plan
        </Link>
      </p>
      {!urgent && (
        <button
          type="button"
          onClick={dismiss}
          className="-mr-1.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-fg/5 hover:text-fg"
          aria-label="Hide until next visit"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
