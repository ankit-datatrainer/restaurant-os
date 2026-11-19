'use client';

import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { BellOff, Check } from 'lucide-react';
import type { AssistanceCall } from '@restaurant-os/shared';
import { CALL_TYPE_LABEL, tableDisplay } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/utils';
import { Card, CardBody, CardHeader, EmptyState, Skeleton } from '@/components/ui';
import { pop } from '@/lib/motion';
import { useAdmin, useAdminEvents } from './admin-provider';
import { CallCard } from './call-card';
import { PageHeader } from './page-header';
import { useNow } from './use-now';

export function CallsView() {
  const { token, calls, attendCall, loading } = useAdmin();
  const now = useNow(15_000);
  const reduce = useReducedMotion();
  const [history, setHistory] = React.useState<AssistanceCall[] | null>(null);
  const [busy, setBusy] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    let cancelled = false;
    adminApi
      .calls(token, 'attended')
      .then((list) => {
        if (!cancelled) setHistory(list.slice(0, 50));
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useAdminEvents((e) => {
    if (e.type === 'call:update' && e.call.status === 'attended') {
      setHistory((prev) => (prev && !prev.some((c) => c.id === e.call.id) ? [e.call, ...prev].slice(0, 50) : prev));
    }
  });

  const attend = async (call: AssistanceCall) => {
    setBusy((s) => new Set(s).add(call.id));
    await attendCall(call);
    setBusy((s) => {
      const n = new Set(s);
      n.delete(call.id);
      return n;
    });
  };

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader
        title="Table calls"
        description="Guests tap “Call waiter”, “Water” or “Bill” on their phone. Attend each one and it moves to history."
      />

      <section aria-label="Open calls">
        <h3 className="mb-3 flex items-center gap-2 font-mono text-2xs uppercase tracking-[0.16em] text-muted">
          Open now <span className="tnum rounded-full bg-saffron-soft px-1.5 text-[#8a5a00]">{calls.length}</span>
        </h3>
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-36 w-full rounded-2xl" />
            ))}
          </div>
        ) : calls.length === 0 ? (
          <EmptyState icon={<BellOff className="h-5 w-5" />} title="No open calls" description="When a table needs something you will hear a doorbell chime and see it here." />
        ) : (
          <motion.ul layout={!reduce} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence initial={false}>
              {calls.map((c) => (
                <motion.li key={c.id} layout={!reduce} variants={pop} initial={reduce ? false : 'hidden'} animate="show" exit="exit">
                  <CallCard call={c} now={now} busy={busy.has(c.id)} onAttend={attend} className="h-full" />
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
        )}
      </section>

      <Card className="mt-8">
        <CardHeader title="Attended" description="The most recent calls that have been handled." />
        <CardBody className="px-2 pt-3 sm:px-3">
          {history === null ? (
            <div className="space-y-2 px-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted">Nothing attended yet.</p>
          ) : (
            <ul className="divide-y divide-line/5">
              {history.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-2 py-3 sm:px-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mint-soft text-[#1b6f49]" aria-hidden>
                    <Check className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {tableDisplay(c.table)} · <span className="text-muted">{CALL_TYPE_LABEL[c.type]}</span>
                    </p>
                    {c.note && <p className="truncate text-xs text-muted">“{c.note}”</p>}
                  </div>
                  <span className="shrink-0 text-right font-mono text-xs text-muted tnum" title={c.attended_at ? formatDateTime(c.attended_at) : undefined}>
                    {timeAgo(c.attended_at ?? c.created_at, now)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
