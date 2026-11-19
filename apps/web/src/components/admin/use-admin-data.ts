'use client';

import * as React from 'react';
import type { AssistanceCall, DiningTable, OrderWithItems } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { errorMessage } from './format';

/** Retry delay for the initial load: 2 s, 4 s, 8 s, 16 s, then every 30 s. */
function retryDelay(attempt: number): number {
  return Math.min(30_000, 2_000 * 2 ** Math.min(attempt, 4));
}

/**
 * The live working set of the counter: active orders, open assistance calls and the
 * table list (used for labels, filters and the guest-menu link).
 */
export function useAdminData(token: string) {
  const [orders, setOrders] = React.useState<OrderWithItems[]>([]);
  const [calls, setCalls] = React.useState<AssistanceCall[]>([]);
  const [tables, setTables] = React.useState<DiningTable[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // The access token refreshes hourly; reading it through a ref keeps `refresh` stable so the
  // initial-load effect runs once instead of flashing skeletons mid-service.
  const tokenRef = React.useRef(token);
  tokenRef.current = token;
  const loadedRef = React.useRef(false);

  const refresh = React.useCallback(async () => {
    const t = tokenRef.current;
    const [o, c, tb] = await Promise.all([
      adminApi.orders(t, { scope: 'active', limit: 200 }),
      adminApi.calls(t, 'open'),
      adminApi.tables(t),
    ]);
    setOrders(o);
    setCalls(c);
    setTables(tb);
    setError(null);
    loadedRef.current = true;
    setLoaded(true);
  }, []);

  const refreshTables = React.useCallback(async () => {
    const t = await adminApi.tables(tokenRef.current);
    setTables(t);
    return t;
  }, []);

  // Initial load, retried with backoff until it succeeds: nothing (polling, realtime seeding)
  // can start without this baseline, so a single failed request must never strand the board.
  React.useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let attempt = 0;
    const run = async () => {
      if (!loadedRef.current) setLoading(true);
      try {
        await refresh();
      } catch (e: unknown) {
        if (cancelled) return;
        setError(errorMessage(e, 'Could not load orders.'));
        if (!loadedRef.current) {
          timer = window.setTimeout(() => void run(), retryDelay(attempt));
          attempt += 1;
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [refresh]);

  return { orders, setOrders, calls, setCalls, tables, setTables, loading, loaded, error, refresh, refreshTables };
}
