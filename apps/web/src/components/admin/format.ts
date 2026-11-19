import type { OrderWithItems } from '@restaurant-os/shared';
import { ApiRequestError } from '@/lib/api';
import { formatINR, tableDisplay } from '@/lib/utils';

/** Human message for any thrown value (API errors carry their own text). */
export function errorMessage(e: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (e instanceof ApiRequestError) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

/** "just now", "12 min", "1h 05m" */
export function formatElapsed(minutes: number): string {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h`;
}

export function isToday(iso: string, now: Date = new Date()): boolean {
  const d = new Date(iso);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

/** Local midnight of today (the same day boundary `isToday` uses). */
export function startOfToday(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** 0 → "12am", 13 → "1pm" */
export function hourLabel(h: number): string {
  if (h === 0) return '12am';
  if (h === 12) return '12pm';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

/** Highest round on an order's items (1 when the guest never added dishes). */
export function maxRound(items: Array<{ round?: number | null }>): number {
  return items.reduce((m, it) => Math.max(m, it.round ?? 1), 1);
}

/**
 * Milliseconds for a Postgres timestamp, whether it came from the API ("…T…+00:00") or a
 * realtime payload (which may use a space and a short "+00" offset). null when absent/unparseable.
 */
export function timestampMs(value: string | null | undefined): number | null {
  if (!value) return null;
  let t = Date.parse(value);
  if (Number.isNaN(t)) t = Date.parse(value.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00'));
  return Number.isNaN(t) ? null : t;
}

export function itemCount(order: { items: Array<{ quantity: number }> }): number {
  return order.items.reduce((s, i) => s + i.quantity, 0);
}

/** "Table 1 (Indoor Window) · ₹869 · 3 items" */
export function orderSummary(order: OrderWithItems): string {
  const n = itemCount(order);
  return `${tableDisplay(order.table)} · ${formatINR(order.total)} · ${n} item${n === 1 ? '' : 's'}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Stable slug for option group / choice ids, e.g. "Extra cheese" → "extra-cheese". */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
