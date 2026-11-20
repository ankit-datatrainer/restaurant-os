import type { Lead, PlanId, PlatformRestaurant } from '@restaurant-os/shared';
import { PLAN_INFO } from '@restaurant-os/shared';

const DAY = 86_400_000;

export type TrialState =
  | { kind: 'none' }
  | { kind: 'active'; daysLeft: number }
  | { kind: 'ended'; daysAgo: number };

export function trialState(trialEndsAt: string | null, now: number = Date.now()): TrialState {
  if (!trialEndsAt) return { kind: 'none' };
  const end = new Date(trialEndsAt).getTime();
  if (!Number.isFinite(end)) return { kind: 'none' };
  if (end > now) return { kind: 'active', daysLeft: Math.max(1, Math.ceil((end - now) / DAY)) };
  return { kind: 'ended', daysAgo: Math.floor((now - end) / DAY) };
}

export function trialLabel(t: TrialState): string {
  if (t.kind === 'none') return '—';
  if (t.kind === 'active') return t.daysLeft === 1 ? '1 day left' : `${t.daysLeft} days left`;
  if (t.daysAgo === 0) return 'Ended today';
  return t.daysAgo === 1 ? 'Ended yesterday' : `Ended ${t.daysAgo} days ago`;
}

/** New trial end: `days` added to whichever is later, now or the current end. */
export function extendedTrialEnd(current: string | null, days: number, now: number = Date.now()): string {
  const currentEnd = current ? new Date(current).getTime() : 0;
  const base = Math.max(now, Number.isFinite(currentEnd) ? currentEnd : 0);
  return new Date(base + days * DAY).toISOString();
}

export function planName(plan: PlanId | string | null | undefined): string {
  if (!plan) return '—';
  return (PLAN_INFO as Record<string, { name: string } | undefined>)[plan]?.name ?? plan;
}

export const PLAN_TONE: Record<PlanId, 'neutral' | 'sky' | 'ember'> = {
  starter: 'neutral',
  growth: 'sky',
  premium: 'ember',
};

export function publicPageUrl(slug: string): string {
  return `/r/${encodeURIComponent(slug)}`;
}

export function matchesQuery(r: PlatformRestaurant, q: string): boolean {
  if (!q) return true;
  const hay = [r.name, r.slug, r.city ?? '', r.owner_email ?? ''].join(' ').toLowerCase();
  return hay.includes(q);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ------------------------------------------------------------------ CSV */

/**
 * One CSV cell: neutralises spreadsheet formulas (a leading = + - @ tab or CR gets a ' prefix)
 * and quotes anything containing a delimiter, quote or line break.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function leadsCsv(leads: Lead[]): string {
  const header = ['Date', 'Name', 'Email', 'Phone', 'Restaurant', 'City', 'Tables', 'Interest', 'Message'];
  const rows = leads.map((l) => [
    new Date(l.created_at).toISOString(),
    l.name,
    l.email,
    l.phone,
    l.restaurant_name,
    l.city ?? null,
    l.table_count ?? null,
    interestLabel(l.plan_interest),
    l.message,
  ]);
  return toCsv([header, ...rows]);
}

export function interestLabel(v: string | null | undefined): string {
  if (!v) return '';
  if (v === 'demo') return 'Demo';
  if (v === 'founding_partner') return 'Founding partner';
  return planName(v);
}

export function downloadText(filename: string, text: string, type = 'text/csv;charset=utf-8') {
  // BOM so Excel reads UTF-8 names correctly.
  const blob = new Blob(['﻿', text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
