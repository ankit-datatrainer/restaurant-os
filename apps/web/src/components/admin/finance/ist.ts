/**
 * India (IST, UTC+5:30, no daylight saving) calendar helpers for the accounts screens.
 * Dates are "YYYY-MM-DD" keys and months are "YYYY-MM", exactly what the finance API takes.
 */

export const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000;

/** "YYYY-MM-DD" of the IST day containing `ms`. */
export function istKey(ms: number = Date.now()): string {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function istToday(): string {
  return istKey();
}

/** The instant (ms) IST midnight starts for a "YYYY-MM-DD" key. */
export function istStartOfKey(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) - IST_OFFSET_MS;
}

export function isDateKey(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export function isMonthKey(v: string): boolean {
  return /^\d{4}-\d{2}$/.test(v);
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + n)).toISOString().slice(0, 10);
}

export function currentMonth(): string {
  return istToday().slice(0, 7);
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1 + n, 1)).toISOString().slice(0, 7);
}

/** First and last day keys of a "YYYY-MM" month. */
export function monthBounds(month: string): { from: string; to: string } {
  const from = `${month}-01`;
  const to = addDays(`${addMonths(month, 1)}-01`, -1);
  return { from, to };
}

/** "October 2026" */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** "Mon, 26 Oct" (with the year when it is not this year, or when asked). */
export function dayLabel(key: string, opts: { weekday?: boolean; year?: boolean } = {}): string {
  const [y, m, d] = key.split('-').map(Number);
  const sameYear = y === Number(istToday().slice(0, 4));
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).toLocaleDateString('en-IN', {
    weekday: opts.weekday === false ? undefined : 'short',
    day: 'numeric',
    month: 'short',
    year: opts.year || !sameYear ? 'numeric' : undefined,
    timeZone: 'UTC',
  });
}

/** "Today", "Yesterday" or "Mon, 26 Oct". */
export function relativeDayLabel(key: string): string {
  const today = istToday();
  if (key === today) return 'Today';
  if (key === addDays(today, -1)) return 'Yesterday';
  return dayLabel(key);
}

/** Rupees from any API number (numeric columns may arrive as strings). */
export function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** A rupee amount typed into a field: null when empty or not a valid non-negative number. */
export function parseMoney(v: string): number | null {
  const t = v.replace(/[,₹\s]/g, '');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? round2(n) : null;
}
