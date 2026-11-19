'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { ExternalLink, Info, MessageSquareText, RefreshCw, Star } from 'lucide-react';
import type { FeedbackResponse } from '@restaurant-os/shared';
import { orderCode, planHas, tableDisplay } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { cn, timeAgo } from '@/lib/utils';
import { Button, Card, CardBody, CardHeader, EmptyState, Skeleton } from '@/components/ui';
import { useAdmin } from './admin-provider';
import { PageHeader } from './page-header';
import { UpgradeCard, isPlanError } from './plan';
import { Stars } from './crm-ui';
import { errorMessage } from './format';
import { useNow } from './use-now';

const REFRESH_MS = 60_000;
const STAR_ROWS = ['5', '4', '3', '2', '1'] as const;

const FEEDBACK_POINTS = [
  'Guests rate their meal on their phone once the order is served',
  'Average rating and the 5★ to 1★ split at a glance',
  'Every comment with its table and order',
  'Your Google review link shown to every guest after they rate',
];

export function FeedbackView() {
  const { restaurant } = useAdmin();
  if (!planHas(restaurant.plan, 'feedback')) {
    return (
      <div className="mx-auto w-full max-w-[1400px]">
        <PageHeader title="Feedback" description="What guests thought of their meal, straight from the table." />
        <UpgradeCard title="Hear from every table" description="Guest ratings, comments and the Google review link are part of the Growth plan." points={FEEDBACK_POINTS} />
      </div>
    );
  }
  return <FeedbackInner />;
}

function FeedbackInner() {
  const { token, restaurant } = useAdmin();
  const now = useNow(60_000);
  const reduce = useReducedMotion();
  const [data, setData] = React.useState<FeedbackResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [locked, setLocked] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const lastLoad = React.useRef(0);

  const load = React.useCallback(async () => {
    lastLoad.current = Date.now();
    try {
      const res = await adminApi.feedback(token);
      setData(res);
      setError(null);
    } catch (e) {
      if (isPlanError(e)) setLocked(e.message);
      else setError(errorMessage(e, 'Could not load feedback.'));
    }
  }, [token]);

  const refreshNow = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  // First load, then every minute while visible, and whenever the window regains focus.
  React.useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, REFRESH_MS);
    // Focus and visibilitychange often fire together when coming back to the tab: load once.
    const loadIfStale = () => {
      if (Date.now() - lastLoad.current > 3_000) void load();
    };
    const onFocus = () => loadIfStale();
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadIfStale();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  if (locked) {
    return (
      <div className="mx-auto w-full max-w-[1400px]">
        <PageHeader title="Feedback" />
        <UpgradeCard title="Hear from every table" description="Guest ratings and comments are part of the Growth plan." message={locked} points={FEEDBACK_POINTS} />
      </div>
    );
  }

  const summary = data?.summary;
  const total = summary?.count ?? 0;

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader
        title="Feedback"
        description="Ratings and comments guests leave on their phone after the meal. Updates every minute."
        actions={
          <Button variant="outline" size="sm" loading={refreshing} leftIcon={<RefreshCw className="h-4 w-4" />} onClick={() => void refreshNow()}>
            Refresh
          </Button>
        }
      />

      {!restaurant.feedback_enabled && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-saffron/40 bg-saffron-soft px-4 py-3 text-sm text-[#8a5a00]">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            Feedback is switched off, so guests are not asked to rate their meal right now.{' '}
            <Link href="/admin/settings" className="font-semibold underline underline-offset-2">
              Turn it on in Settings
            </Link>
            .
          </p>
        </div>
      )}

      {error && (
        <p className="mb-4 rounded-xl bg-rose-soft px-4 py-3 text-sm font-medium text-[#a1282c]" role="alert">
          {error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-4">
          <Card>
            <CardBody>
              {!summary ? (
                <div className="space-y-4">
                  <Skeleton className="h-16 w-32" />
                  {STAR_ROWS.map((s) => (
                    <Skeleton key={s} className="h-4 w-full" />
                  ))}
                </div>
              ) : (
                <>
                  <p className="font-mono text-2xs uppercase tracking-[0.16em] text-muted">Average rating</p>
                  <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-2">
                    <span className="tnum font-mono text-6xl font-semibold leading-none tracking-tight">{summary.average !== null ? summary.average.toFixed(1) : '—'}</span>
                    <div className="pb-1">
                      <Stars value={summary.average ?? 0} size={20} />
                      <p className="mt-1 text-sm text-muted">
                        from <span className="tnum font-mono font-semibold text-fg">{total}</span> rating{total === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>

                  <ul className="mt-6 space-y-2.5" aria-label="Ratings by stars">
                    {STAR_ROWS.map((s, i) => {
                      const n = summary.distribution[s] ?? 0;
                      const pct = total > 0 ? (n / total) * 100 : 0;
                      return (
                        <li key={s} className="flex items-center gap-3">
                          <span className="tnum inline-flex w-9 shrink-0 items-center gap-0.5 font-mono text-sm text-fg/80">
                            {s}
                            <Star className="h-3.5 w-3.5 text-saffron" fill="currentColor" strokeWidth={0} aria-hidden />
                          </span>
                          <div
                            className="h-2.5 flex-1 overflow-hidden rounded-full bg-sunk"
                            role="meter"
                            aria-label={`${s} star`}
                            aria-valuemin={0}
                            aria-valuemax={total}
                            aria-valuenow={n}
                            aria-valuetext={`${n} of ${total}`}
                          >
                            <motion.div
                              className={cn('h-full rounded-full', Number(s) <= 2 ? 'bg-rose' : Number(s) === 3 ? 'bg-saffron' : 'bg-mint')}
                              initial={reduce ? false : { width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.7, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                            />
                          </div>
                          <span className="tnum w-10 shrink-0 text-right font-mono text-sm text-muted">{n}</span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Google review link" description="Shown to every guest after they rate, whatever their rating." />
            <CardBody className="pt-3">
              {restaurant.google_review_url ? (
                <a
                  href={restaurant.google_review_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex max-w-full items-center gap-1.5 truncate text-sm font-medium text-ember hover:underline"
                >
                  <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="truncate">{restaurant.google_review_url}</span>
                </a>
              ) : (
                <p className="text-sm text-muted">
                  Not set yet.{' '}
                  <Link href="/admin/settings" className="font-semibold text-ember hover:underline">
                    Add it in Settings
                  </Link>{' '}
                  so happy guests can review you on Google.
                </p>
              )}
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader title="Latest feedback" description="Newest first. Low ratings are tinted so you can follow up." />
          <CardBody className="px-2 pt-3 sm:px-3">
            {!data ? (
              <div className="space-y-2 px-2">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : data.entries.length === 0 ? (
              <EmptyState
                icon={<MessageSquareText className="h-5 w-5" />}
                title="No feedback yet"
                description="Guests are asked to rate their meal on their phone once the order is marked served."
                className="mx-2 py-10"
              />
            ) : (
              <ul className="space-y-1.5">
                {data.entries.map((e) => {
                  const low = e.rating <= 2;
                  return (
                    <li key={e.id} className={cn('rounded-xl px-3 py-3', low ? 'bg-rose-soft/60' : 'hover:bg-sunk/50')}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-2">
                          <Stars value={e.rating} size={15} />
                          <span className="tnum font-mono text-xs font-semibold">{e.rating}/5</span>
                        </span>
                        <span className="text-xs text-muted">{timeAgo(e.created_at, now)}</span>
                      </div>
                      {e.comment ? (
                        <p className="mt-1.5 whitespace-pre-line break-words text-[15px] leading-relaxed">{e.comment}</p>
                      ) : (
                        <p className="mt-1.5 text-sm italic text-muted">No comment</p>
                      )}
                      <p className="mt-1.5 flex flex-wrap gap-x-2 text-xs text-muted">
                        <span>{tableDisplay(e.table)}</span>
                        {e.order_number !== null && (
                          <>
                            <span aria-hidden>·</span>
                            <span className="tnum font-mono">{orderCode(e.order_number)}</span>
                          </>
                        )}
                        {e.customer_name && (
                          <>
                            <span aria-hidden>·</span>
                            <span>{e.customer_name}</span>
                          </>
                        )}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
