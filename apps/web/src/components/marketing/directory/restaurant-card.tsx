'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowUpRight, CalendarDays, ShoppingBag } from 'lucide-react';
import { formatClock, windowOpen, type DirectoryRestaurant } from '@restaurant-os/shared';
import { cn } from '@/lib/utils';

/** Two-colour gradients for restaurants without a cover photo, picked from the name so a card always looks the same. */
const FALLBACKS = [
  'from-ember/70 via-ember/25 to-ink-2',
  'from-saffron/60 via-ember/20 to-ink-2',
  'from-ember/50 via-saffron/20 to-ink-3',
  'from-saffron/45 via-ink-3 to-ink-2',
  'from-ember/40 via-ink-3 to-ink-2',
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0]![0]}${parts[1]![0]}` : (parts[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

export type OpenState = { kind: 'open' } | { kind: 'opens'; at: string } | { kind: 'closed' };

/** "Open now" when the restaurant is taking orders and inside its hours (IST); otherwise when it opens next. */
export function openState(r: Pick<DirectoryRestaurant, 'is_open' | 'open_time' | 'close_time'>, at: Date = new Date()): OpenState {
  if (!r.is_open) return { kind: 'closed' };
  if (!r.open_time || !r.close_time) return { kind: 'open' };
  if (windowOpen(r.open_time, r.close_time, null, at)) return { kind: 'open' };
  return { kind: 'opens', at: formatClock(r.open_time) };
}

export function OpenStatus({ state, className }: { state: OpenState; className?: string }) {
  if (state.kind === 'open') {
    return (
      <span className={cn('inline-flex items-center gap-1.5 font-mono text-2xs uppercase tracking-[0.14em] text-mint', className)}>
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-mint motion-safe:animate-ping motion-safe:opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-mint" />
        </span>
        Open now
      </span>
    );
  }
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-mono text-2xs uppercase tracking-[0.14em] text-muted', className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-paper/30" aria-hidden />
      {state.kind === 'opens' ? `Opens ${state.at}` : 'Closed right now'}
    </span>
  );
}

function Cover({ r }: { r: DirectoryRestaurant }) {
  const [failed, setFailed] = React.useState(false);
  const fallback = FALLBACKS[hash(r.slug || r.name) % FALLBACKS.length];
  const showImage = Boolean(r.cover_url) && !failed;
  return (
    <div className="relative aspect-[16/10] overflow-hidden bg-ink-3">
      {showImage ? (
        // Cover photos can be hosted anywhere, so a plain lazy <img> instead of next/image.
        <img
          src={r.cover_url!}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover transition-transform duration-700 ease-out motion-safe:group-hover:scale-[1.04]"
        />
      ) : (
        <div aria-hidden className={cn('absolute inset-0 bg-gradient-to-br', fallback)}>
          <div className="absolute inset-0 opacity-[0.25] [background-image:radial-gradient(rgba(247,244,238,0.35)_1px,transparent_1px)] [background-size:14px_14px]" />
          <p className="absolute -bottom-[0.18em] right-3 select-none font-display text-[5.5rem] font-bold leading-none tracking-[-0.05em] text-paper/[0.12]">
            {initials(r.name)}
          </p>
        </div>
      )}
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-ink-2 via-ink-2/40 to-transparent" />
    </div>
  );
}

function Logo({ r }: { r: DirectoryRestaurant }) {
  const [failed, setFailed] = React.useState(false);
  return (
    <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-paper/15 bg-ink-3 shadow-lift">
      {r.logo_url && !failed ? (
        <img src={r.logo_url} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : (
        <span className="font-display text-lg font-bold text-paper" aria-hidden>
          {initials(r.name)}
        </span>
      )}
    </span>
  );
}

export function RestaurantCard({ r, now }: { r: DirectoryRestaurant; now: Date }) {
  const meta = [r.cuisine, r.city].filter(Boolean).join(' · ');
  const state = openState(r, now);
  return (
    <Link
      href={`/r/${encodeURIComponent(r.slug)}`}
      className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-paper/10 bg-ink-2/70 transition-[border-color,box-shadow,transform] duration-500 ease-out hover:border-paper/25 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember motion-safe:hover:-translate-y-1"
    >
      <Cover r={r} />
      <div className="relative -mt-9 flex flex-1 flex-col px-5 pb-5">
        <div className="flex items-end justify-between gap-3">
          <Logo r={r} />
          <span className="mb-1 flex h-9 w-9 items-center justify-center rounded-full border border-paper/10 text-paper/60 transition-colors duration-300 group-hover:border-ember group-hover:bg-ember group-hover:text-white">
            <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:rotate-45" aria-hidden />
          </span>
        </div>
        <h3 className="mt-4 font-display text-xl font-bold leading-tight tracking-tight">{r.name}</h3>
        {meta && <p className="mt-1 text-sm text-muted">{meta}</p>}
        {r.tagline && <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-fg/70">{r.tagline}</p>}

        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 pt-5">
          <OpenStatus state={state} className="mr-auto" />
          {r.takeaway_enabled && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-paper/[0.06] px-2.5 py-1 text-xs font-semibold text-fg/85">
              <ShoppingBag className="h-3.5 w-3.5 text-ember" aria-hidden />
              Order takeaway
            </span>
          )}
          {r.reservations_enabled && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-paper/[0.06] px-2.5 py-1 text-xs font-semibold text-fg/85">
              <CalendarDays className="h-3.5 w-3.5 text-saffron" aria-hidden />
              Book a table
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export function RestaurantCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-3xl border border-paper/10 bg-ink-2/70" aria-hidden>
      <div className="skeleton aspect-[16/10] rounded-none" />
      <div className="relative -mt-9 px-5 pb-5">
        <div className="skeleton h-14 w-14 rounded-2xl" />
        <div className="skeleton mt-4 h-5 w-2/3" />
        <div className="skeleton mt-2 h-4 w-1/2" />
        <div className="mt-6 flex gap-2">
          <div className="skeleton h-6 w-20 rounded-full" />
          <div className="skeleton h-6 w-28 rounded-full" />
        </div>
      </div>
    </div>
  );
}
