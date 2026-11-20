'use client';

import * as React from 'react';
import { Download, Inbox, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Lead } from '@restaurant-os/shared';
import { formatDateTime, timeAgo } from '@/lib/utils';
import { Badge, Button, EmptyState, Input, Skeleton } from '@/components/ui';
import { useNow } from '@/components/admin/use-now';
import { downloadText, interestLabel, leadsCsv } from './format';

function leadMatches(l: Lead, q: string): boolean {
  if (!q) return true;
  return [l.name, l.email, l.phone ?? '', l.restaurant_name ?? '', l.city ?? '', l.message ?? '', interestLabel(l.plan_interest)]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

export function LeadsView({ leads, error, onRetry }: { leads: Lead[] | null; error: string | null; onRetry: () => void }) {
  const now = useNow(60_000);
  const [query, setQuery] = React.useState('');
  const q = query.trim().toLowerCase();
  const rows = React.useMemo(() => (leads ?? []).filter((l) => leadMatches(l, q)), [leads, q]);

  const download = () => {
    if (rows.length === 0) return;
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(`restaurant-os-leads-${stamp}.csv`, leadsCsv(rows));
    toast.success(`Downloaded ${rows.length} lead${rows.length === 1 ? '' : 's'}.`);
  };

  return (
    <section aria-label="Leads" className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, email, phone, restaurant, city or message"
          aria-label="Search leads"
          prefix={<Search className="h-4 w-4" />}
          suffix={
            query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="mr-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-fg/5 hover:text-fg"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            ) : undefined
          }
        />
        <Button variant="outline" onClick={download} disabled={rows.length === 0} leftIcon={<Download className="h-4 w-4" />}>
          Download CSV{leads && rows.length > 0 ? ` (${rows.length})` : ''}
        </Button>
      </div>

      {error && !leads ? (
        <EmptyState
          icon={<Inbox className="h-5 w-5" />}
          title="Leads didn't load"
          description={error}
          action={
            <Button size="sm" variant="outline" onClick={onRetry}>
              Try again
            </Button>
          }
        />
      ) : !leads ? (
        <div className="grid gap-3" aria-busy="true" aria-label="Loading leads">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-5 w-5" />}
          title={leads.length === 0 ? 'No leads yet' : 'Nothing matches'}
          description={leads.length === 0 ? 'Enquiries from the contact and demo forms land here.' : 'Try a different search.'}
        />
      ) : (
        <>
          <p className="text-xs text-muted" aria-live="polite">
            Showing {rows.length} of {leads.length}
          </p>
          <ul className="grid gap-3 md:hidden">
            {rows.map((l) => (
              <li key={l.id} className="rounded-2xl border border-line/10 bg-surface p-4 shadow-soft">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{l.name}</p>
                    <p className="truncate text-xs text-muted">
                      {[l.restaurant_name, l.city].filter(Boolean).join(' · ') || 'No restaurant given'}
                    </p>
                  </div>
                  <time className="shrink-0 text-xs text-muted" dateTime={l.created_at} title={formatDateTime(l.created_at)}>
                    {timeAgo(l.created_at, now)}
                  </time>
                </div>
                <div className="mt-2 grid gap-0.5 text-sm">
                  <a href={`mailto:${l.email}`} className="truncate hover:text-ember">
                    {l.email}
                  </a>
                  {l.phone && (
                    <a href={`tel:${l.phone}`} className="truncate text-fg/80 hover:text-ember">
                      {l.phone}
                    </a>
                  )}
                </div>
                {(l.plan_interest || l.table_count) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {l.plan_interest && <Badge tone="ember">{interestLabel(l.plan_interest)}</Badge>}
                    {l.table_count ? <Badge>{l.table_count} tables</Badge> : null}
                  </div>
                )}
                {l.message && <p className="mt-2 whitespace-pre-line break-words text-sm text-fg/80">{l.message}</p>}
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-2xl border border-line/10 bg-surface shadow-soft md:block">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-line/10 font-mono text-2xs uppercase tracking-[0.12em] text-muted">
                  <th scope="col" className="px-4 py-3 font-medium">Date</th>
                  <th scope="col" className="px-3 py-3 font-medium">Contact</th>
                  <th scope="col" className="px-3 py-3 font-medium">Restaurant</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">Tables</th>
                  <th scope="col" className="px-3 py-3 font-medium">Interest</th>
                  <th scope="col" className="px-4 py-3 font-medium">Message</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id} className="border-b border-line/[0.07] align-top last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-[13px] text-fg/80">
                      <time dateTime={l.created_at} title={formatDateTime(l.created_at)}>
                        {timeAgo(l.created_at, now)}
                      </time>
                    </td>
                    <td className="max-w-[240px] px-3 py-3">
                      <p className="truncate font-semibold">{l.name}</p>
                      <a href={`mailto:${l.email}`} className="block truncate text-[13px] text-fg/80 hover:text-ember">
                        {l.email}
                      </a>
                      {l.phone && (
                        <a href={`tel:${l.phone}`} className="block truncate text-xs text-muted hover:text-ember">
                          {l.phone}
                        </a>
                      )}
                    </td>
                    <td className="max-w-[200px] px-3 py-3">
                      <p className="truncate">{l.restaurant_name ?? <span className="text-muted">—</span>}</p>
                      {l.city && <p className="truncate text-xs text-muted">{l.city}</p>}
                    </td>
                    <td className="tnum px-3 py-3 text-right font-mono text-[13px]">{l.table_count ?? <span className="text-muted">—</span>}</td>
                    <td className="px-3 py-3">{l.plan_interest ? <Badge tone="ember">{interestLabel(l.plan_interest)}</Badge> : <span className="text-muted">—</span>}</td>
                    <td className="max-w-[360px] px-4 py-3 text-[13px] text-fg/80">
                      {l.message ? <p className="line-clamp-3 whitespace-pre-line break-words" title={l.message}>{l.message}</p> : <span className="text-muted">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
