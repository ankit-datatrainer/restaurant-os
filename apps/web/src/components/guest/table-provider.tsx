'use client';

import * as React from 'react';
import type { TableMenuResponse } from '@restaurant-os/shared';
import { ApiRequestError, publicApi } from '@/lib/api';
import { getGuestSession } from '@/lib/session';

export type GuestSession = ReturnType<typeof getGuestSession>;

export interface TableError {
  kind: 'not_found' | 'network' | 'unknown';
  message: string;
}

export interface TableContextValue {
  /** Upper-cased table code from the URL. */
  code: string;
  data: TableMenuResponse | null;
  loading: boolean;
  error: TableError | null;
  /** Re-fetch the menu quietly (the current menu stays on screen while it loads). */
  refresh: () => Promise<void>;
  /** Guest identity for this table. Null until mounted because it lives in localStorage. */
  session: GuestSession | null;
}

/** One in-memory copy per table code so moving between menu, cart and tracker is instant. */
const cache = new Map<string, TableMenuResponse>();

/** True when this tab already loaded the menu for `code` (used to skip the splash). */
export function peekTableCache(code: string): TableMenuResponse | null {
  return cache.get(code.toUpperCase()) ?? null;
}

function toTableError(e: unknown): TableError {
  if (e instanceof ApiRequestError) {
    if (e.status === 404) return { kind: 'not_found', message: e.message };
    if (e.status === 0) return { kind: 'network', message: e.message };
    return { kind: 'unknown', message: e.message };
  }
  return { kind: 'unknown', message: e instanceof Error ? e.message : 'Something went wrong' };
}

const TableContext = React.createContext<TableContextValue | null>(null);

export function TableProvider({ code: rawCode, children }: { code: string; children: React.ReactNode }) {
  const code = rawCode.toUpperCase();
  const [data, setData] = React.useState<TableMenuResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<TableError | null>(null);
  const [session, setSession] = React.useState<GuestSession | null>(null);
  const dataRef = React.useRef<TableMenuResponse | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  const load = React.useCallback(
    async (silent: boolean) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      if (!silent) setLoading(true);
      try {
        const res = await publicApi.tableMenu(code, ctrl.signal);
        if (ctrl.signal.aborted) return;
        cache.set(code, res);
        dataRef.current = res;
        setData(res);
        setError(null);
      } catch (e) {
        if (ctrl.signal.aborted || (e as Error).name === 'AbortError') return;
        const err = toTableError(e);
        if (err.kind === 'not_found') {
          // The table was deactivated or the code changed: drop what we had.
          cache.delete(code);
          dataRef.current = null;
          setData(null);
          setError(err);
        } else if (!silent || !dataRef.current) {
          setError(err);
        }
        // A quiet refresh that fails for network reasons keeps the menu we already have.
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    },
    [code],
  );

  React.useEffect(() => {
    setSession(getGuestSession(code));
    const cached = cache.get(code);
    if (cached) {
      dataRef.current = cached;
      setData(cached);
      setLoading(false);
      void load(true);
    } else {
      void load(false);
    }
    return () => abortRef.current?.abort();
  }, [code, load]);

  // Availability changes while the phone sat in a pocket: refresh when the tab comes back.
  React.useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load(Boolean(dataRef.current));
    };
    const onOnline = () => void load(Boolean(dataRef.current));
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [load]);

  const refresh = React.useCallback(() => load(Boolean(dataRef.current)), [load]);

  const value = React.useMemo<TableContextValue>(
    () => ({ code, data, loading, error, refresh, session }),
    [code, data, loading, error, refresh, session],
  );

  return <TableContext.Provider value={value}>{children}</TableContext.Provider>;
}

export function useTable(): TableContextValue {
  const ctx = React.useContext(TableContext);
  if (!ctx) throw new Error('useTable must be used inside <TableProvider>');
  return ctx;
}
