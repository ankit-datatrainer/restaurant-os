'use client';

import * as React from 'react';
import type { AutomationRunResult } from '@restaurant-os/shared';
import { ApiRequestError, adminApi } from '@/lib/api';

const INTERVAL_MS = 2 * 60_000;
const AFTER_EVENT_MS = 3_000;
const FIRST_RUN_MS = 5_000;

export interface AutomationState {
  /** True when this dashboard runs automation (Premium + owner/manager). */
  enabled: boolean;
  /** Result of the latest run from this tab (automatic or "Run now"), null before the first one. */
  last: AutomationRunResult | null;
  /** Run now; resolves with the result or throws the API error (for the "Run now" button). */
  runNow: () => Promise<AutomationRunResult>;
}

/**
 * Keeps webhooks and WhatsApp journeys moving while the dashboard is open: runs
 * POST /api/admin/automation/run every 2 minutes while the tab is visible, and 3 s after
 * (a burst of) order events. Failures are quiet: one console warning, never a toast.
 */
export function useAutomationRunner(
  token: string,
  enabled: boolean,
  subscribe: (listener: (e: { type: string }) => void) => () => void,
): AutomationState {
  const [last, setLast] = React.useState<AutomationRunResult | null>(null);
  const tokenRef = React.useRef(token);
  tokenRef.current = token;
  const inFlight = React.useRef(false);
  const warned = React.useRef(false);
  /** Set when the API says this restaurant/role may not run automation (403): stop trying. */
  const refused = React.useRef(false);
  const lastRunAt = React.useRef(0);

  const runNow = React.useCallback(async () => {
    lastRunAt.current = Date.now();
    const result = await adminApi.runAutomation(tokenRef.current);
    setLast(result);
    return result;
  }, []);

  const runQuietly = React.useCallback(async () => {
    if (inFlight.current || refused.current) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    inFlight.current = true;
    try {
      await runNow();
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 403) refused.current = true;
      if (!warned.current) {
        warned.current = true;
        console.warn('[automation] background run failed; will keep retrying quietly.', e);
      }
    } finally {
      inFlight.current = false;
    }
  }, [runNow]);

  // Every 2 minutes while visible, a first run shortly after load, and on return to the tab when due.
  React.useEffect(() => {
    if (!enabled) return;
    refused.current = false;
    const first = window.setTimeout(() => void runQuietly(), FIRST_RUN_MS);
    const id = window.setInterval(() => void runQuietly(), INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRunAt.current >= INTERVAL_MS) void runQuietly();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, runQuietly]);

  // 3 s after order inserts/updates (debounced), so webhooks go out promptly.
  React.useEffect(() => {
    if (!enabled) return;
    let timer: number | null = null;
    const unsubscribe = subscribe((e) => {
      if (e.type !== 'order:new' && e.type !== 'order:update') return;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        void runQuietly();
      }, AFTER_EVENT_MS);
    });
    return () => {
      unsubscribe();
      if (timer) window.clearTimeout(timer);
    };
  }, [enabled, subscribe, runQuietly]);

  return React.useMemo(() => ({ enabled, last, runNow }), [enabled, last, runNow]);
}

/** "3 webhooks delivered · 2 WhatsApp sent", or "Nothing to send" when the run had no work. */
export function automationSummary(r: AutomationRunResult): string {
  const parts: string[] = [];
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (r.webhooks.delivered) parts.push(`${plural(r.webhooks.delivered, 'webhook', 'webhooks')} delivered`);
  if (r.webhooks.failed) parts.push(`${plural(r.webhooks.failed, 'webhook', 'webhooks')} failed`);
  if (r.webhooks.pending) parts.push(`${r.webhooks.pending} pending`);
  if (r.whatsapp.sent) parts.push(`${r.whatsapp.sent} WhatsApp sent`);
  if (r.whatsapp.failed) parts.push(`${r.whatsapp.failed} WhatsApp failed`);
  return parts.length ? parts.join(' · ') : 'Nothing to send';
}
