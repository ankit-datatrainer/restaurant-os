'use client';

import * as React from 'react';
import { toast } from 'sonner';
import type { AssistanceCall, CallStatus, CallType } from '@restaurant-os/shared';
import { publicApi } from '@/lib/api';
import { useTable } from './table-provider';

const POLL_MS = 5000;
/** How long an attended request keeps showing "On the way". */
export const ATTENDED_WINDOW_MS = 10 * 60 * 1000;

/** What the guest hears when the staff pick a request up. */
export const CALL_ATTENDED_COPY: Record<CallType, string> = {
  waiter: 'A waiter is on the way to your table',
  water: 'Water is on its way',
  cutlery: 'Cutlery and napkins are on their way',
  bill: 'Your bill is coming',
  other: 'The staff saw your request and are on it',
};

export interface SessionCallsValue {
  /** This guest's requests from the last few hours, newest first. Null until the first load. */
  calls: AssistanceCall[] | null;
  /** Re-fetch now (call right after creating a request). */
  refresh: () => Promise<void>;
}

export type CallState = { kind: 'open'; since: string } | { kind: 'attended'; at: string } | null;

/** Server truth for one request type: still open, recently attended, or nothing to show. */
export function callStateOf(calls: AssistanceCall[] | null, type: CallType, now: number = Date.now()): CallState {
  if (!calls) return null;
  const ofType = calls.filter((c) => c.type === type).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const open = ofType.find((c) => c.status === 'open');
  if (open) return { kind: 'open', since: open.created_at };
  const attended = ofType.find((c) => c.status === 'attended' && c.attended_at && now - new Date(c.attended_at).getTime() < ATTENDED_WINDOW_MS);
  return attended?.attended_at ? { kind: 'attended', at: attended.attended_at } : null;
}

const SessionCallsContext = React.createContext<SessionCallsValue | null>(null);
const FALLBACK: SessionCallsValue = { calls: null, refresh: async () => {} };

/**
 * Loads the guest's waiter requests on every table page, polls every 5 s only while at least one
 * is still open and the tab is visible, and announces each one the staff pick up.
 * Must sit inside <TableProvider>.
 */
export function SessionCallsProvider({ children }: { children: React.ReactNode }) {
  const { code, session } = useTable();
  const sessionId = session?.id ?? null;
  const [calls, setCalls] = React.useState<AssistanceCall[] | null>(null);
  /** Status per call id as of the previous load; null before the first load (nothing is announced then). */
  const known = React.useRef<Map<string, CallStatus> | null>(null);
  const signature = React.useRef('');
  const inflight = React.useRef<AbortController | null>(null);

  const refresh = React.useCallback(async () => {
    if (!sessionId) return;
    inflight.current?.abort();
    const ctrl = new AbortController();
    inflight.current = ctrl;
    try {
      const next = await publicApi.sessionCalls(code, sessionId, ctrl.signal);
      if (ctrl.signal.aborted) return;
      const prev = known.current;
      if (prev) {
        const announced = new Set<CallType>();
        for (const c of next) {
          if (c.status === 'attended' && prev.get(c.id) === 'open' && !announced.has(c.type)) {
            announced.add(c.type);
            toast.success(CALL_ATTENDED_COPY[c.type]);
          }
        }
      }
      known.current = new Map(next.map((c) => [c.id, c.status] as const));
      const sig = JSON.stringify(next.map((c) => [c.id, c.status, c.attended_at]));
      if (sig !== signature.current) {
        signature.current = sig;
        setCalls(next);
      }
    } catch {
      // Best effort: keep what we already have on screen.
    } finally {
      if (inflight.current === ctrl) inflight.current = null;
    }
  }, [code, sessionId]);

  // First load per table visit.
  React.useEffect(() => {
    known.current = null;
    signature.current = '';
    setCalls(null);
    void refresh();
    return () => inflight.current?.abort();
  }, [refresh]);

  // Poll only while something is still waiting for the staff, and only while the tab is visible.
  const hasOpen = (calls ?? []).some((c) => c.status === 'open');
  React.useEffect(() => {
    if (!hasOpen) return;
    let timer: number | undefined;
    const stop = () => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
    };
    const start = () => {
      stop();
      timer = window.setInterval(() => void refresh(), POLL_MS);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refresh();
        start();
      } else stop();
    };
    const onOnline = () => void refresh();
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [hasOpen, refresh]);

  const value = React.useMemo<SessionCallsValue>(() => ({ calls, refresh }), [calls, refresh]);
  return <SessionCallsContext.Provider value={value}>{children}</SessionCallsContext.Provider>;
}

export function useSessionCalls(): SessionCallsValue {
  return React.useContext(SessionCallsContext) ?? FALLBACK;
}
