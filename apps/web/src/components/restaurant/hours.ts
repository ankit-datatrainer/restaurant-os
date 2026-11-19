import type { Restaurant } from '@restaurant-os/shared';
import { formatClock, windowOpen } from '@restaurant-os/shared';

/**
 * Opening hours, pickup and booking slots, all in India time (IST, UTC+5:30) whatever the
 * phone's own time zone. The rules mirror the SQL (window_open, place_order, request_reservation).
 */

const IST_OFFSET_MS = 330 * 60_000;
const SLOT_MS = 15 * 60_000;

/** "2026-10-26": the IST calendar date of an instant. */
export function istDateKey(at: number): string {
  return new Date(at + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDaysKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

/** Instant of `minutes` after midnight IST on the date `key`. */
export function istInstant(key: string, minutes: number): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!, 0, minutes) - IST_OFFSET_MS;
}

/** Minutes after IST midnight for an instant. */
export function istMinutes(at: number): number {
  const d = new Date(at + IST_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** "6:45 PM" in IST. */
export function formatIstTime(at: number | string): string {
  const ms = typeof at === 'string' ? new Date(at).getTime() : at;
  const mins = istMinutes(ms);
  const h = Math.floor(mins / 60);
  return formatClock(`${String(h).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}:00`);
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sat, 31 Oct" for an IST date key. */
export function formatDayKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  return `${WEEKDAY[dt.getUTCDay()]}, ${d} ${MONTH[m! - 1]}`;
}

/** "Today", "Tomorrow" or "Sat, 31 Oct". */
export function relativeDay(key: string, now: number = Date.now()): string {
  const today = istDateKey(now);
  if (key === today) return 'Today';
  if (key === addDaysKey(today, 1)) return 'Tomorrow';
  return formatDayKey(key);
}

/** "Today, 6:45 PM" / "Sat, 31 Oct, 7:30 PM" */
export function formatIstDateTime(at: number | string, now: number = Date.now()): string {
  const ms = typeof at === 'string' ? new Date(at).getTime() : at;
  return `${relativeDay(istDateKey(ms), now)}, ${formatIstTime(ms)}`;
}

type Hours = Pick<Restaurant, 'open_time' | 'close_time'>;

/** Opening hours are set (older databases without migration 0006 have none: treated as open all day). */
export function hasHours(r: Partial<Hours>): boolean {
  return Boolean(r.open_time && r.close_time);
}

/** Inside opening hours at `at` (ignores the "taking orders" switch). */
export function withinHours(r: Hours, at: number = Date.now()): boolean {
  if (!hasHours(r)) return true;
  return windowOpen(r.open_time, r.close_time, null, new Date(at));
}

/** "8:00 AM – 11:00 PM" ('' when the hours are not set). */
export function hoursText(r: Hours): string {
  if (!hasHours(r)) return '';
  return `${formatClock(r.open_time)} – ${formatClock(r.close_time)}`;
}

export type OpenState = { tone: 'open' | 'closed' | 'paused'; label: string; detail: string };

/** What the hero says about right now. */
export function openState(r: Pick<Restaurant, 'open_time' | 'close_time' | 'is_open'>, at: number = Date.now()): OpenState {
  const inHours = withinHours(r, at);
  const known = hasHours(r);
  if (inHours && !r.is_open) return { tone: 'paused', label: 'Not taking orders right now', detail: known ? `Hours ${hoursText(r)}` : '' };
  if (inHours) return { tone: 'open', label: 'Open now', detail: known ? `until ${formatClock(r.close_time)}` : '' };
  return { tone: 'closed', label: 'Closed now', detail: `opens ${formatClock(r.open_time)}` };
}

/**
 * Every 15-minute slot on the IST date `key` that falls inside opening hours, at or after `minAt`
 * and at or before `maxAt`. `tailMinutes` also requires the restaurant to still be open that many
 * minutes after the slot (no bookings in the last half hour, for instance).
 */
export function slotsForDay(r: Hours, key: string, opts: { minAt: number; maxAt: number; tailMinutes?: number }): number[] {
  const out: number[] = [];
  const tail = (opts.tailMinutes ?? 0) * 60_000;
  for (let m = 0; m < 24 * 60; m += 15) {
    const t = istInstant(key, m);
    if (t < opts.minAt || t > opts.maxAt) continue;
    if (!withinHours(r, t)) continue;
    if (tail && !withinHours(r, t + tail)) continue;
    out.push(t);
  }
  return out;
}

/** Round an instant up to the next 15-minute boundary (IST is a whole number of quarter hours from UTC). */
export function ceilToSlot(at: number): number {
  return Math.ceil(at / SLOT_MS) * SLOT_MS;
}

/** "Morning", "Afternoon", "Evening", "Late night" for grouping slot chips. */
export function partOfDay(at: number): 'Morning' | 'Afternoon' | 'Evening' | 'Late night' {
  const m = istMinutes(at);
  if (m < 4 * 60) return 'Late night';
  if (m < 12 * 60) return 'Morning';
  if (m < 17 * 60) return 'Afternoon';
  if (m < 22 * 60) return 'Evening';
  return 'Late night';
}
