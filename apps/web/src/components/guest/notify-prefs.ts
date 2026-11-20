'use client';

import { publicApi } from '@/lib/api';

/**
 * What the guest chose about alerts, per table (`t:CODE`) or per restaurant for takeaway (`r:slug`).
 * Kept in localStorage so the "Get notified" card is not shown again and again.
 *
 * - `push`: Web Push subscription saved by the API (alerts reach a locked phone).
 * - `local`: permission granted, but no server push (system alerts while the page is open/hidden).
 * - `dismissed`: the guest said "Not now".
 */
export type NotifyChoice = 'push' | 'local' | 'dismissed';

export interface StoredNotify {
  choice: NotifyChoice;
  /** Guest session the push subscription was saved for (a new session needs a quiet re-save). */
  session?: string;
  at: number;
}

const KEY = (scope: string) => `ros:notify:${scope}`;

export const tableScope = (code: string) => `t:${code.toUpperCase()}`;
export const takeawayScope = (slug: string) => `r:${slug.toLowerCase()}`;

export function readNotify(scope: string): StoredNotify | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY(scope));
    if (!raw) return null;
    const v = JSON.parse(raw) as StoredNotify;
    return v && typeof v.choice === 'string' ? v : null;
  } catch {
    return null;
  }
}

export function writeNotify(scope: string, value: Omit<StoredNotify, 'at'>) {
  try {
    window.localStorage.setItem(KEY(scope), JSON.stringify({ ...value, at: Date.now() }));
  } catch {
    /* private mode: the choice lasts for this page only */
  }
}

export interface PushConfigState {
  /** The server has VAPID keys and the push endpoints answer. */
  enabled: boolean;
  /** The config endpoint failed (older API, migration missing, offline): hide every push part. */
  failed: boolean;
}

let configPromise: Promise<PushConfigState> | null = null;

/** GET /api/public/push/config once per page load. Never rejects. */
export function loadPushConfig(): Promise<PushConfigState> {
  configPromise ??= publicApi
    .pushConfig()
    .then((c) => ({ enabled: Boolean(c.enabled && c.publicKey), failed: false }))
    .catch(() => {
      // Let a later mount try again (e.g. the phone was offline).
      configPromise = null;
      return { enabled: false, failed: true };
    });
  return configPromise;
}

/** Remember that saving a subscription failed on this server (migration not installed): stop offering push. */
let pushBroken = false;
export const markPushBroken = () => {
  pushBroken = true;
};
export const isPushBroken = () => pushBroken;
