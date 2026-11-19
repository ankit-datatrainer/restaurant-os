'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, Gift, Sparkles } from 'lucide-react';
import type { LoyaltyStatus } from '@restaurant-os/shared';
import { cn } from '@/lib/utils';
import { springBouncy } from '@/lib/motion';
import { useConfetti } from '@/components/games/use-confetti';

/** Reward codes this phone has already celebrated, so the confetti plays once per reward. */
const SHOWN_KEY = 'ros:loyalty:shown';
/** Above this many visits per reward a stamp row gets too long: show a bar instead. */
const MAX_STAMPS = 12;

function readShown(): string[] {
  try {
    const raw = window.localStorage.getItem(SHOWN_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeShown(codes: string[]) {
  try {
    window.localStorage.setItem(SHOWN_KEY, JSON.stringify(codes.slice(-50)));
  } catch {
    /* ignore */
  }
}

/** 1 → "1st", 2 → "2nd", 11 → "11th", 23 → "23rd". */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  const suffix = ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** True when there is a card worth drawing: the program is on and this guest is linked by phone. */
export function hasLoyaltyCard(status: LoyaltyStatus | null | undefined): status is LoyaltyStatus {
  return Boolean(status && status.enabled && status.linked && (status.visits_required ?? 0) > 0);
}

/**
 * Stamp card for Premium restaurants: one circle per visit up to the reward, the guest's
 * unused reward codes as tickets, and a one-time celebration when a new reward appears.
 */
export function LoyaltyCard({ status, className }: { status: LoyaltyStatus; className?: string }) {
  const reduce = useReducedMotion();
  const fire = useConfetti();
  const [announce, setAnnounce] = React.useState('');

  const required = Math.max(1, status.visits_required ?? 1);
  const visits = Math.max(0, status.visits ?? 0);
  const rewards = status.rewards ?? [];
  const waiting = rewards.length > 0;
  const filled = waiting ? required : visits % required;
  const nextIn = Math.max(1, status.next_reward_in ?? required - (visits % required));
  const rewardText = status.reward_text?.trim() || 'a reward';

  // Celebrate rewards this phone has not seen before (codes remembered in localStorage).
  const codesKey = rewards.map((r) => r.code).join('|');
  React.useEffect(() => {
    if (!codesKey) return;
    const codes = codesKey.split('|');
    const shown = readShown();
    const fresh = codes.filter((c) => !shown.includes(c));
    if (fresh.length === 0) return;
    writeShown([...shown, ...fresh]);
    setAnnounce('Reward unlocked! Show the code to the staff.');
    const t = window.setTimeout(() => fire({ y: 0.55, count: 140 }), 450);
    return () => window.clearTimeout(t);
  }, [codesKey, fire]);

  return (
    <section
      className={cn('relative overflow-hidden rounded-3xl border border-line/10 bg-surface p-5 shadow-soft', className)}
      aria-labelledby="loyalty-heading"
    >
      <span className="pointer-events-none absolute -right-12 -top-14 h-36 w-36 rounded-full bg-saffron/25 blur-3xl" aria-hidden />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow">Loyalty card</p>
            <h2 id="loyalty-heading" className="mt-1 font-display text-lg font-bold leading-tight">
              {waiting ? 'Reward unlocked!' : `${nextIn} more ${nextIn === 1 ? 'visit' : 'visits'} to ${rewardText}`}
            </h2>
          </div>
          <span
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl',
              waiting ? 'bg-ember text-white shadow-[0_8px_24px_-10px_rgba(255,92,42,0.7)]' : 'bg-saffron-soft text-[#8a5a00]',
            )}
            aria-hidden
          >
            {waiting ? <Sparkles className="h-5 w-5" /> : <Gift className="h-5 w-5" />}
          </span>
        </div>

        {required <= MAX_STAMPS ? (
          <ol className="mt-4 flex flex-wrap gap-2" aria-label={`${filled} of ${required} visits stamped`}>
            {Array.from({ length: required }, (_, i) => {
              const on = i < filled;
              const last = i === required - 1;
              return (
                <li key={i} className="list-none">
                  <motion.span
                    initial={reduce || !on ? false : { scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={reduce ? { duration: 0 } : { ...springBouncy, delay: 0.05 * i }}
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-full',
                      on ? 'bg-ember text-white' : 'border-2 border-dashed border-line/20 text-fg/30',
                    )}
                    aria-hidden
                  >
                    {on ? <Check className="h-4 w-4" strokeWidth={3} /> : last ? <Gift className="h-4 w-4" /> : null}
                  </motion.span>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="mt-4">
            <div
              className="h-3 w-full overflow-hidden rounded-full bg-sunk"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={required}
              aria-valuenow={filled}
              aria-label="Visits towards your next reward"
            >
              <div className="h-full rounded-full bg-ember transition-[width] duration-700 ease-out" style={{ width: `${(filled / required) * 100}%` }} />
            </div>
            <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted tnum">
              {filled} / {required} visits
            </p>
          </div>
        )}

        <p className="mt-3 text-[13px] text-muted">
          Every {required === 1 ? 'visit' : `${ordinal(required)} visit`} gets {rewardText}. You have {visits} {visits === 1 ? 'visit' : 'visits'} so far.
        </p>

        {rewards.length > 0 && (
          <ul className="mt-4 grid gap-3">
            {rewards.map((r) => (
              <li key={r.code} className="list-none">
                <div className="relative rounded-2xl border-2 border-dashed border-ember/40 bg-ember-soft/60 px-5 py-4 text-center">
                  {/* ticket notches */}
                  <span className="absolute -left-[11px] top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border-2 border-ember/40 bg-surface [clip-path:inset(0_0_0_50%)]" aria-hidden />
                  <span className="absolute -right-[11px] top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border-2 border-ember/40 bg-surface [clip-path:inset(0_50%_0_0)]" aria-hidden />
                  <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ember-3">Your reward code</p>
                  <p className="mt-1 break-all font-mono text-[30px] font-bold leading-tight tracking-[0.18em] text-fg tnum">{r.code}</p>
                  <p className="mt-1 font-display text-[15px] font-semibold">{r.reward_text}</p>
                  <p className="mt-1 text-[12.5px] text-fg/70">Show this code to the staff · valid till {formatDate(r.expires_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-4 text-[12px] text-muted">Visits count once your order is served.</p>
      </div>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
    </section>
  );
}
