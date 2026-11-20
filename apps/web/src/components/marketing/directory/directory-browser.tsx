'use client';

import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, MapPin, RotateCcw, Search, Store, X } from 'lucide-react';
import type { DirectoryRestaurant } from '@restaurant-os/shared';
import { Button, Reveal } from '@/components/ui';
import { publicApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { EASE_OUT, spring } from '@/lib/motion';
import { RestaurantCard, RestaurantCardSkeleton } from './restaurant-card';

type Status = 'loading' | 'ready' | 'error';

/** Read ?q= and ?city= once on mount so a filtered directory link can be shared. */
function readParams(): { q: string; city: string } {
  if (typeof window === 'undefined') return { q: '', city: '' };
  const p = new URLSearchParams(window.location.search);
  return { q: (p.get('q') ?? '').slice(0, 80), city: (p.get('city') ?? '').slice(0, 80) };
}

function writeParams(q: string, city: string) {
  const url = new URL(window.location.href);
  if (q) url.searchParams.set('q', q);
  else url.searchParams.delete('q');
  if (city) url.searchParams.set('city', city);
  else url.searchParams.delete('city');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

export function DirectoryBrowser() {
  const reduce = useReducedMotion();
  const [q, setQ] = React.useState('');
  const [city, setCity] = React.useState('');
  const [ready, setReady] = React.useState(false);
  const [restaurants, setRestaurants] = React.useState<DirectoryRestaurant[]>([]);
  const [cities, setCities] = React.useState<string[]>([]);
  const [status, setStatus] = React.useState<Status>('loading');
  const [error, setError] = React.useState('');
  const [attempt, setAttempt] = React.useState(0);
  const [now, setNow] = React.useState(() => new Date());
  /** The search text actually sent: follows `q` after 300 ms of no typing. */
  const [debouncedQ, setDebouncedQ] = React.useState('');

  React.useEffect(() => {
    const next = q.trim();
    const t = window.setTimeout(() => setDebouncedQ(next), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  // Start from the URL, then fetch.
  React.useEffect(() => {
    const p = readParams();
    setQ(p.q);
    setDebouncedQ(p.q.trim());
    setCity(p.city);
    setReady(true);
  }, []);

  // "Open now" changes with the clock.
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  React.useEffect(() => {
    if (!ready) return;
    writeParams(debouncedQ, city);
    const ctrl = new AbortController();
    setStatus('loading');
    publicApi
      .directory({ q: debouncedQ || undefined, city: city || undefined }, ctrl.signal)
      .then((res) => {
        setRestaurants(res.restaurants);
        setCities(res.cities);
        setNow(new Date());
        setStatus('ready');
      })
      .catch((e: unknown) => {
        if ((e as Error).name === 'AbortError') return;
        setError((e as Error).message || 'Could not load restaurants.');
        setStatus('error');
      });
    return () => ctrl.abort();
  }, [ready, debouncedQ, city, attempt]);

  const filtered = Boolean(debouncedQ || city);
  const firstLoad = status === 'loading' && restaurants.length === 0;
  const refreshing = status === 'loading' && restaurants.length > 0;
  // Keep a city chip for a city picked from the URL even if nothing is listed there yet.
  const chipCities = city && !cities.some((c) => c.toLowerCase() === city.toLowerCase()) ? [...cities, city] : cities;

  return (
    <section aria-labelledby="directory-heading" className="pb-20 md:pb-28">
      <div className="container-x">
        <h2 id="directory-heading" className="sr-only">
          Browse restaurants
        </h2>

        {/* search + city chips */}
        <Reveal className="grid gap-4">
          <form role="search" onSubmit={(e) => e.preventDefault()} className="relative max-w-2xl">
            <label htmlFor="directory-search" className="sr-only">
              Search by restaurant, cuisine or city
            </label>
            <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden />
            <input
              id="directory-search"
              type="search"
              inputMode="search"
              autoComplete="off"
              enterKeyHint="search"
              maxLength={80}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, cuisine or city"
              className="h-14 w-full rounded-full border border-paper/10 bg-ink-2 pl-14 pr-14 text-base text-fg placeholder:text-muted transition-[border-color,box-shadow] duration-300 [&::-webkit-search-cancel-button]:hidden focus:border-ember/60 focus:outline-none focus:ring-4 focus:ring-ember/15"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ('')}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted transition-colors hover:bg-paper/10 hover:text-fg"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            )}
          </form>

          {chipCities.length > 0 && (
            <div role="group" aria-label="Filter by city" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 py-1 md:flex-wrap md:overflow-visible">
              {[{ id: '', label: 'All cities' }, ...chipCities.map((c) => ({ id: c, label: c }))].map((c) => {
                const active = c.id.toLowerCase() === city.toLowerCase();
                return (
                  <button
                    key={c.id || 'all'}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setCity(c.id)}
                    className={cn(
                      'relative inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors duration-300',
                      active ? 'border-transparent text-ink' : 'border-paper/10 text-paper/70 hover:border-paper/25 hover:text-paper',
                    )}
                  >
                    {active && <motion.span layoutId="city-chip" className="absolute inset-0 rounded-full bg-paper" transition={reduce ? { duration: 0 } : spring} aria-hidden />}
                    <span className="relative flex items-center gap-1.5">
                      {c.id && <MapPin className="h-3.5 w-3.5" aria-hidden />}
                      {c.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Reveal>

        {/* result count, for screen readers and as a quiet line */}
        <p className="mt-8 font-mono text-2xs uppercase tracking-[0.16em] text-muted" aria-live="polite">
          {status === 'ready'
            ? restaurants.length === 1
              ? '1 restaurant'
              : `${restaurants.length} restaurants`
            : status === 'loading'
              ? 'Loading restaurants…'
              : ''}
          {status === 'ready' && city ? ` in ${city}` : ''}
          {status === 'ready' && debouncedQ ? ` matching “${debouncedQ}”` : ''}
        </p>

        <div className="mt-5">
          {firstLoad ? (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
              {Array.from({ length: 6 }, (_, i) => (
                <li key={i}>
                  <RestaurantCardSkeleton />
                </li>
              ))}
            </ul>
          ) : status === 'error' ? (
            <ErrorState message={error} onRetry={() => setAttempt((n) => n + 1)} />
          ) : restaurants.length === 0 && status === 'ready' ? (
            <EmptyDirectory q={debouncedQ} city={city} filtered={filtered} onReset={() => {
              setQ('');
              setCity('');
            }} />
          ) : (
            <ul
              className={cn('grid gap-5 transition-opacity duration-300 sm:grid-cols-2 lg:grid-cols-3', refreshing && 'opacity-60')}
              aria-busy={refreshing || undefined}
            >
              <AnimatePresence initial={false} mode="popLayout">
                {restaurants.map((r, i) => (
                  <motion.li
                    key={r.slug}
                    layout={!reduce}
                    initial={reduce ? false : { opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduce ? undefined : { opacity: 0, scale: 0.97 }}
                    transition={{ duration: 0.5, delay: reduce ? 0 : Math.min(i, 8) * 0.04, ease: EASE_OUT }}
                    className="min-w-0"
                  >
                    <RestaurantCard r={r} now={now} />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-4 rounded-3xl border border-rose/30 bg-rose/[0.06] p-6 md:flex-row md:items-center md:justify-between md:p-8">
      <div>
        <p className="font-display text-lg font-semibold">We couldn’t load the restaurants.</p>
        <p className="mt-1 text-sm text-muted">{message}</p>
      </div>
      <Button onClick={onRetry} variant="outline" size="md" leftIcon={<RotateCcw className="h-4 w-4" aria-hidden />}>
        Try again
      </Button>
    </div>
  );
}

function EmptyDirectory({ q, city, filtered, onReset }: { q: string; city: string; filtered: boolean; onReset: () => void }) {
  const title = !filtered
    ? 'No restaurants are listed yet.'
    : q
      ? `No restaurants match “${q}”${city ? ` in ${city}` : ''}.`
      : `No restaurants listed in ${city} yet.`;
  const ownerLine = city ? `Run a restaurant in ${city}? Be the first one listed here.` : 'Run a restaurant? Be the first one listed here.';
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
      className="grain relative isolate overflow-hidden rounded-[2rem] border border-dashed border-paper/15 px-6 py-14 text-center md:py-20"
    >
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 h-[280px] w-[520px] -translate-x-1/2 rounded-full bg-ember/[0.10] blur-[110px]" />
      <div className="relative mx-auto flex max-w-lg flex-col items-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-paper/[0.06] text-muted">
          <Store className="h-5 w-5" aria-hidden />
        </span>
        <p className="mt-5 font-display text-2xl font-bold tracking-tight">{title}</p>
        {filtered && <p className="mt-2 text-sm text-muted">Try another spelling, a cuisine such as “South Indian”, or a different city.</p>}
        <p className="mt-6 text-base text-fg/80">{ownerLine}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button href="/signup" size="lg" rightIcon={<ArrowUpRight className="h-4 w-4" aria-hidden />}>
            Start free trial
          </Button>
          {filtered && (
            <Button onClick={onReset} variant="outline" size="lg">
              Show all restaurants
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
