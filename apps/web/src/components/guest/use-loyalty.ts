'use client';

import * as React from 'react';
import type { LoyaltyStatus } from '@restaurant-os/shared';
import { publicApi } from '@/lib/api';
import { useTable } from './table-provider';

/** Last answer per table + guest session, so moving between pages shows the card straight away. */
const cache = new Map<string, LoyaltyStatus>();

/**
 * The guest's loyalty card at this table (GET /api/public/loyalty). Fetches when `enabled`
 * turns true and again whenever `refreshKey` changes (e.g. when an order becomes served,
 * because a visit only counts once an order is served). Failures are silent: the card is extra.
 */
export function useLoyalty({ enabled, refreshKey }: { enabled: boolean; refreshKey?: string | number | boolean }): LoyaltyStatus | null {
  const { code, session } = useTable();
  const sessionId = session?.id ?? null;
  const key = sessionId ? `${code}:${sessionId}` : null;
  const [status, setStatus] = React.useState<LoyaltyStatus | null>(null);

  React.useEffect(() => {
    setStatus(key ? (cache.get(key) ?? null) : null);
  }, [key]);

  React.useEffect(() => {
    if (!enabled || !sessionId || !key) return;
    const ctrl = new AbortController();
    publicApi
      .loyalty(code, sessionId, ctrl.signal)
      .then((res) => {
        if (ctrl.signal.aborted) return;
        cache.set(key, res);
        setStatus(res);
      })
      .catch(() => {
        /* best-effort */
      });
    return () => ctrl.abort();
  }, [enabled, code, sessionId, key, refreshKey]);

  return enabled ? status : null;
}
