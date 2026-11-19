'use client';

import * as React from 'react';
import { ChevronRight, Download, MessageCircle, Repeat, Search, UserPlus, Users, UserX } from 'lucide-react';
import type { CustomerSegment, CustomerSummary, CustomersResponse } from '@restaurant-os/shared';
import { CUSTOMER_SEGMENTS, CUSTOMER_SEGMENT_LABEL, formatIndianPhone, planHas } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { cn, formatINR, timeAgo } from '@/lib/utils';
import { Button, EmptyState, Input, Skeleton } from '@/components/ui';
import { useAdmin } from './admin-provider';
import { Chip, ChipRow, PageHeader } from './page-header';
import { StatTile } from './stat-tile';
import { UpgradeCard, isPlanError } from './plan';
import { ConsentBadge, RatingCell } from './crm-ui';
import { customerName, lastVisitAt } from './crm';
import { CustomerSheet } from './customer-sheet';
import { OfferComposer } from './offer-composer';
import { errorMessage } from './format';
import { useNow } from './use-now';

const CRM_POINTS = [
  'Every guest who leaves a phone number becomes a customer profile',
  'Visits, spend and average rating for every customer',
  'Repeat, new and lapsed segments with one tap',
  'WhatsApp offers only to guests who opted in themselves',
  'Consent history kept for every customer',
  'CSV export for your own records',
];

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function CustomersView() {
  const { restaurant } = useAdmin();
  if (!planHas(restaurant.plan, 'crm')) {
    return (
      <div className="mx-auto w-full max-w-[1400px]">
        <PageHeader title="Customers" description="Who comes back, who has not been in for a while, and who wants your offers." />
        <UpgradeCard
          title="Know your regulars by name"
          description="Customer profiles, repeat-visit tracking and consent-based WhatsApp offers are part of the Growth plan."
          points={CRM_POINTS}
        />
      </div>
    );
  }
  return <CustomersInner />;
}

function CustomersInner() {
  const { token } = useAdmin();
  const now = useNow(60_000);
  const [segment, setSegment] = React.useState<CustomerSegment>('all');
  const [q, setQ] = React.useState('');
  const dq = useDebounced(q.trim(), 300);
  const [customers, setCustomers] = React.useState<CustomerSummary[] | null>(null);
  const [summary, setSummary] = React.useState<CustomersResponse['summary'] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [locked, setLocked] = React.useState<string | null>(null);
  const [fetching, setFetching] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [offerOpen, setOfferOpen] = React.useState(false);
  const requestId = React.useRef(0);

  const load = React.useCallback(async () => {
    const id = ++requestId.current;
    setFetching(true);
    try {
      const res = await adminApi.customers(token, { segment, q: dq || undefined });
      if (id !== requestId.current) return; // a newer search is already on its way
      setCustomers(res.customers);
      setSummary(res.summary);
      setError(null);
    } catch (e) {
      if (id !== requestId.current) return;
      if (isPlanError(e)) setLocked(e.message);
      else setError(errorMessage(e, 'Could not load customers.'));
      setCustomers((prev) => prev ?? []);
    } finally {
      if (id === requestId.current) setFetching(false);
    }
  }, [token, segment, dq]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const onCustomerChanged = React.useCallback(
    (c: CustomerSummary) => {
      setCustomers((prev) => {
        if (!prev) return prev;
        // An unsubscribed customer leaves the "opted in" segment straight away.
        if (segment === 'opted_in' && !c.marketing_consent) return prev.filter((x) => x.id !== c.id);
        return prev.map((x) => (x.id === c.id ? { ...x, ...c } : x));
      });
      setSummary((s) => {
        if (!s) return s;
        const before = customers?.find((x) => x.id === c.id);
        if (before?.marketing_consent && !c.marketing_consent) return { ...s, opted_in: Math.max(0, s.opted_in - 1) };
        return s;
      });
    },
    [segment, customers],
  );

  if (locked) {
    return (
      <div className="mx-auto w-full max-w-[1400px]">
        <PageHeader title="Customers" />
        <UpgradeCard title="Know your regulars by name" description="Customer profiles and WhatsApp offers are part of the Growth plan." message={locked} points={CRM_POINTS} />
      </div>
    );
  }

  const countFor = (s: CustomerSegment): number | undefined => {
    if (!summary) return undefined;
    switch (s) {
      case 'all':
        return summary.total;
      case 'repeat':
        return summary.repeat;
      case 'new':
        return summary.new_this_week;
      case 'lapsed':
        return summary.lapsed;
      case 'opted_in':
        return summary.opted_in;
    }
  };

  const list = customers ?? [];
  const loadingFirst = customers === null;

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader
        title="Customers"
        description="Guests who left their number at checkout. Offers go only to those who ticked the WhatsApp box themselves."
        actions={
          <>
            <a
              href={adminApi.customersCsvUrl(token, segment)}
              download
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line/15 px-4 text-[13px] font-semibold transition hover:bg-fg/5"
              title={`Download everyone in “${CUSTOMER_SEGMENT_LABEL[segment]}” as a spreadsheet`}
            >
              <Download className="h-4 w-4" aria-hidden /> Export CSV
            </a>
            <Button size="sm" leftIcon={<MessageCircle className="h-4 w-4" />} onClick={() => setOfferOpen(true)}>
              Send an offer
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-5">
        <StatTile label="Customers" value={summary?.total ?? 0} loading={!summary} icon={<Users className="h-4 w-4" />} tone="ember" />
        <StatTile
          label="WhatsApp opted in"
          value={summary?.opted_in ?? 0}
          loading={!summary}
          icon={<MessageCircle className="h-4 w-4" />}
          tone="mint"
          hint={summary && summary.total > 0 ? `${Math.round((summary.opted_in / summary.total) * 100)}% of customers` : undefined}
        />
        <StatTile label="Repeat rate" value={summary?.repeat_rate ?? 0} suffix="%" decimals={1} loading={!summary} icon={<Repeat className="h-4 w-4" />} tone="sky" hint={summary ? `${summary.repeat} with 2+ visits` : undefined} />
        <StatTile label="New this week" value={summary?.new_this_week ?? 0} loading={!summary} icon={<UserPlus className="h-4 w-4" />} tone="saffron" />
        <StatTile label="Not seen in 30 days" value={summary?.lapsed ?? 0} loading={!summary} icon={<UserX className="h-4 w-4" />} className="col-span-2 md:col-span-1" />
      </div>

      <div className="sticky top-16 z-20 -mx-1 mt-4 space-y-3 bg-bg/90 px-1 py-3 backdrop-blur">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <ChipRow label="Customer segment" className="lg:flex-1">
            {CUSTOMER_SEGMENTS.map((s) => (
              <Chip key={s} active={segment === s} onClick={() => setSegment(s)} count={countFor(s)}>
                {CUSTOMER_SEGMENT_LABEL[s]}
              </Chip>
            ))}
          </ChipRow>
          <div className="lg:w-[320px]">
            <Input
              aria-label="Search customers by name or phone"
              placeholder="Search name or phone…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              prefix={<Search className="h-4 w-4" />}
              className="h-10"
              inputMode="search"
            />
          </div>
        </div>
      </div>

      {error && (
        <p className="mb-4 mt-1 rounded-xl bg-rose-soft px-4 py-3 text-sm font-medium text-[#a1282c]" role="alert">
          {error}
        </p>
      )}

      <div className={cn('mt-2 transition-opacity', fetching && !loadingFirst && 'opacity-60')} aria-busy={fetching}>
        {loadingFirst ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title={dq ? `Nobody matches “${dq}”` : segment === 'all' ? 'No customers yet' : `Nobody in “${CUSTOMER_SEGMENT_LABEL[segment]}”`}
            description={
              dq
                ? 'Search by first name or at least three digits of the phone number.'
                : segment === 'all'
                  ? 'Customers appear here once guests add their mobile number at checkout.'
                  : segment === 'opted_in'
                    ? 'Guests opt in by ticking the WhatsApp box at checkout. Staff cannot opt anyone in.'
                    : 'Try another segment.'
            }
          />
        ) : (
          <>
            {/* Desktop table (cards below lg: seven columns do not fit beside the sidebar on a tablet) */}
            <div className="hidden overflow-x-auto rounded-2xl border border-line/10 bg-surface shadow-soft lg:block">
              <table className="w-full text-sm">
                <thead className="bg-sunk/60 font-mono text-2xs uppercase tracking-[0.14em] text-muted">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Customer</th>
                    <th className="px-4 py-3 text-right font-medium">Visits</th>
                    <th className="px-4 py-3 text-right font-medium">Orders</th>
                    <th className="px-4 py-3 text-right font-medium">Spent</th>
                    <th className="px-4 py-3 text-left font-medium">Last visit</th>
                    <th className="px-4 py-3 text-left font-medium">Rating</th>
                    <th className="px-4 py-3 text-left font-medium">WhatsApp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/5">
                  {list.map((c) => (
                    <tr key={c.id} className="cursor-pointer transition hover:bg-sunk/40" onClick={() => setSelectedId(c.id)}>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(c.id);
                          }}
                          className="block rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
                          aria-label={`Open ${customerName(c)}`}
                        >
                          <span className={cn('block font-medium', !c.name && 'text-muted')}>{customerName(c)}</span>
                          <span className="tnum block font-mono text-xs text-muted">{formatIndianPhone(c.phone)}</span>
                        </button>
                      </td>
                      <td className="tnum px-4 py-3 text-right font-mono">{c.visits}</td>
                      <td className="tnum px-4 py-3 text-right font-mono">{c.orders_count}</td>
                      <td className="tnum px-4 py-3 text-right font-mono font-semibold">{formatINR(c.total_spent)}</td>
                      <td className="px-4 py-3 text-muted">{timeAgo(lastVisitAt(c), now)}</td>
                      <td className="px-4 py-3">
                        <RatingCell value={c.avg_rating} />
                      </td>
                      <td className="px-4 py-3">
                        <ConsentBadge customer={c} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Phone and tablet cards */}
            <ul className="grid gap-2.5 md:grid-cols-2 lg:hidden">
              {list.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className="flex h-full w-full items-start gap-3 rounded-2xl border border-line/10 bg-surface p-4 text-left shadow-soft transition active:scale-[0.99]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className={cn('truncate font-medium', !c.name && 'text-muted')}>{customerName(c)}</p>
                      <p className="tnum font-mono text-xs text-muted">{formatIndianPhone(c.phone)}</p>
                      <p className="mt-2 text-xs text-muted">
                        <span className="tnum font-mono">{c.visits}</span> visit{c.visits === 1 ? '' : 's'} · <span className="tnum font-mono">{c.orders_count}</span> order
                        {c.orders_count === 1 ? '' : 's'} · last {timeAgo(lastVisitAt(c), now)}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <ConsentBadge customer={c} />
                        {c.avg_rating !== null && <RatingCell value={c.avg_rating} />}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className="tnum font-mono text-base font-semibold">{formatINR(c.total_spent)}</span>
                      <ChevronRight className="h-4 w-4 text-muted" aria-hidden />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-center text-xs text-muted">
              {list.length} customer{list.length === 1 ? '' : 's'} · most recent visit first
            </p>
          </>
        )}
      </div>

      <CustomerSheet customerId={selectedId} onClose={() => setSelectedId(null)} onChanged={onCustomerChanged} />
      <OfferComposer open={offerOpen} onClose={() => setOfferOpen(false)} />
    </div>
  );
}
