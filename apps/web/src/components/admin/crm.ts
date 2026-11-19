import type { ConsentEvent, CustomerSummary } from '@restaurant-os/shared';
import { siteUrl } from '@/lib/utils';

/** Display name, or "Guest" when the customer left only a phone number. */
export function customerName(c: Pick<CustomerSummary, 'name'>): string {
  return c.name?.trim() || 'Guest';
}

/** First name for a greeting, or "there" ("Hi there"). */
export function firstName(c: Pick<CustomerSummary, 'name'>): string {
  const n = c.name?.trim();
  return n ? n.split(/\s+/)[0]! : 'there';
}

/** When we last saw the customer: their last order, else the last time their profile was touched. */
export function lastVisitAt(c: Pick<CustomerSummary, 'last_order_at' | 'last_seen_at'>): string {
  return c.last_order_at ?? c.last_seen_at;
}

export function unsubscribeUrl(token: string): string {
  return `${siteUrl}/unsubscribe/${token}`;
}

/** Appended to every marketing message so the customer can always opt out. */
export function unsubscribeLine(token: string): string {
  return `Reply STOP or open ${unsubscribeUrl(token)} to stop these messages.`;
}

/** Replace {name} with the customer's first name. */
export function personalise(template: string, c: Pick<CustomerSummary, 'name'>): string {
  return template.replace(/\{name\}/gi, firstName(c));
}

/** The final message: personalised text + a blank line + the unsubscribe line. */
export function offerMessage(template: string, c: Pick<CustomerSummary, 'name' | 'unsubscribe_token'>): string {
  return `${personalise(template, c).trim()}\n\n${unsubscribeLine(c.unsubscribe_token)}`;
}

export type ConsentState = 'opted_in' | 'unsubscribed' | 'none';

export function consentState(c: Pick<CustomerSummary, 'marketing_consent' | 'consent_revoked_at'>): ConsentState {
  if (c.marketing_consent) return 'opted_in';
  if (c.consent_revoked_at) return 'unsubscribed';
  return 'none';
}

export const CONSENT_SOURCE_LABEL: Record<ConsentEvent['source'], string> = {
  qr_checkout: 'At checkout',
  unsubscribe_link: 'Unsubscribe link',
  staff: 'Recorded by staff',
};

/** "12 Oct", or "12 Oct 2025" when it is not this year. */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' });
}

/** Quote a CSV cell and neutralise spreadsheet formulas (names are typed by guests). */
function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** Build a CSV in the browser and hand it to the user as a download (Excel-friendly BOM). */
export function downloadCsv(filename: string, header: string[], rows: unknown[][]): void {
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(','));
  const blob = new Blob([`﻿${lines.join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const DAY_MS = 86_400_000;
