'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import type { CustomersResponse, FeedbackResponse } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { Card, CardBody, CardHeader, Skeleton } from '@/components/ui';
import { useAdmin } from './admin-provider';
import { Stars } from './crm-ui';

const REFRESH_MS = 5 * 60_000;

/**
 * Compact "Guests & retention" summary for the dashboard (Growth+). Loads the customer and
 * feedback summaries; if both fail it renders nothing rather than an error on the home screen.
 */
export function RetentionCard() {
  const { token } = useAdmin();
  const [customers, setCustomers] = React.useState<CustomersResponse['summary'] | null>(null);
  const [feedback, setFeedback] = React.useState<FeedbackResponse['summary'] | null>(null);
  const [state, setState] = React.useState<'loading' | 'ready' | 'failed'>('loading');

  const load = React.useCallback(async () => {
    const [c, f] = await Promise.allSettled([adminApi.customers(token, { segment: 'all' }), adminApi.feedback(token)]);
    if (c.status === 'fulfilled') setCustomers(c.value.summary);
    if (f.status === 'fulfilled') setFeedback(f.value.summary);
    setState((prev) => (c.status === 'rejected' && f.status === 'rejected' ? (prev === 'ready' ? prev : 'failed') : 'ready'));
  }, [token]);

  React.useEffect(() => {
    void load();
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  if (state === 'failed') return null;

  return (
    <Card>
      <CardHeader title="Guests & retention" description="Who comes back, and how they rate you." />
      <CardBody className="pt-4">
        {state === 'loading' ? (
          <div className="grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-2">
            <Mini label="Customers" value={customers ? String(customers.total) : '—'} />
            <Mini label="Opted in" value={customers ? String(customers.opted_in) : '—'} hint="WhatsApp offers" />
            <Mini label="Repeat rate" value={customers ? `${customers.repeat_rate.toFixed(1)}%` : '—'} hint="2+ visits" />
            <div className="rounded-xl bg-sunk px-3.5 py-2.5">
              <dt className="font-mono text-2xs uppercase tracking-[0.14em] text-muted">Avg rating</dt>
              <dd className="mt-1">
                <span className="tnum font-mono text-xl font-semibold">{feedback?.average != null ? feedback.average.toFixed(1) : '—'}</span>
                {feedback?.average != null && <Stars value={feedback.average} size={11} className="ml-1.5" />}
                {feedback && <span className="block text-2xs text-muted">{feedback.count} rating{feedback.count === 1 ? '' : 's'}</span>}
              </dd>
            </div>
          </dl>
        )}
        <div className="mt-3 flex flex-wrap gap-1">
          <Link href="/admin/customers" className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-sm font-medium text-ember hover:bg-ember-soft">
            Customers <ArrowUpRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link href="/admin/feedback" className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-sm font-medium text-ember hover:bg-ember-soft">
            Feedback <ArrowUpRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}

function Mini({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-sunk px-3.5 py-2.5">
      <dt className="font-mono text-2xs uppercase tracking-[0.14em] text-muted">{label}</dt>
      <dd className="mt-1">
        <span className="tnum font-mono text-xl font-semibold">{value}</span>
        {hint && <span className="block text-2xs text-muted">{hint}</span>}
      </dd>
    </div>
  );
}
