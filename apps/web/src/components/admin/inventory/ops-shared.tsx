'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Info } from 'lucide-react';
import type { Ingredient } from '@restaurant-os/shared';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

/** "12 kg", "0.400 kg", "250 g", "1.5 pcs". Kilos and litres get three decimals when not whole. */
export function fmtQty(n: number, unit?: string | null): string {
  const v = Number.isFinite(n) ? n : 0;
  const fine = unit === 'kg' || unit === 'l';
  const whole = Math.abs(v - Math.round(v)) < 1e-9;
  const s = whole
    ? Math.round(v).toLocaleString('en-IN')
    : v.toLocaleString('en-IN', { minimumFractionDigits: fine ? 3 : 0, maximumFractionDigits: fine ? 3 : 2 });
  return unit ? `${s} ${unit}` : s;
}

/** "+0.400 kg" / "−2 pcs" */
export function fmtSignedQty(n: number, unit?: string | null): string {
  if (n === 0) return fmtQty(0, unit);
  return `${n > 0 ? '+' : '−'}${fmtQty(Math.abs(n), unit)}`;
}

/** Parse what someone typed into a number field. Empty or invalid → null. */
export function parseNum(s: string): number | null {
  const t = s.replace(/,/g, '').trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Round to 3 decimals (stock quantities) without float noise. */
export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Value typed into an input, from a stored number ("" for null). */
export function numInput(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  return String(round3(n));
}

export function isLow(i: Pick<Ingredient, 'stock_qty' | 'low_stock_threshold'>): boolean {
  return i.stock_qty <= i.low_stock_threshold;
}

// ---------------------------------------------------------------------------
// Dates (the restaurant runs on India time, whatever the device says)
// ---------------------------------------------------------------------------

const IST_MS = 330 * 60_000;

/** ISO instant → "YYYY-MM-DDTHH:mm" for a datetime-local input, in IST. */
export function istInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  return new Date(t + IST_MS).toISOString().slice(0, 16);
}

/** "YYYY-MM-DDTHH:mm" typed as IST → ISO instant with offset. Empty → null. */
export function istInputToIso(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t)) return null;
  return `${t}:00+05:30`;
}

/** ISO instant → "YYYY-MM-DD" in IST (for a date input). */
export function istDateValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  return new Date(t + IST_MS).toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" → the last second of that day in IST. */
export function istEndOfDayIso(date: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T23:59:59+05:30` : null;
}

/** Today in IST as "YYYY-MM-DD". */
export function istToday(): string {
  return new Date(Date.now() + IST_MS).toISOString().slice(0, 10);
}

/** "26 Oct, 6:30 pm" in IST (year added when it is not this year). */
export function formatIst(iso: string): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** "26 Oct" (or "26 Oct 2027") for an ISO instant or a "YYYY-MM-DD" date, in IST. */
export function formatIstDay(value: string): string {
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00+05:30` : value;
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' });
}

// ---------------------------------------------------------------------------
// Small UI pieces shared by the Inventory and Promotions pages
// ---------------------------------------------------------------------------

export interface TabDef<T extends string> {
  id: T;
  label: string;
  /** Shorter label for phones. */
  short?: string;
  count?: number;
  tone?: 'neutral' | 'rose';
}

/** Segmented tabs that scroll sideways on a phone instead of squashing. */
export function OpsTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  layoutId,
  className,
}: {
  tabs: Array<TabDef<T>>;
  value: T;
  onChange: (id: T) => void;
  label: string;
  layoutId: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <div className={cn('no-scrollbar max-w-full overflow-x-auto', className)}>
      <div className="inline-flex min-w-full rounded-full bg-sunk p-1 md:min-w-0" role="tablist" aria-label={label}>
        {tabs.map((t) => {
          const active = value === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(t.id)}
              className={cn(
                'relative inline-flex h-9 flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold transition md:flex-none md:px-4',
                active ? 'text-fg' : 'text-muted hover:text-fg',
              )}
            >
              {active && (
                <motion.span
                  layoutId={reduce ? undefined : layoutId}
                  className="absolute inset-0 rounded-full bg-surface shadow-soft"
                  transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                  aria-hidden
                />
              )}
              <span className="relative">
                {t.short ? (
                  <>
                    <span className="sm:hidden">{t.short}</span>
                    <span className="hidden sm:inline">{t.label}</span>
                  </>
                ) : (
                  t.label
                )}
              </span>
              {t.count !== undefined && t.count > 0 && (
                <span
                  className={cn(
                    'tnum relative rounded-full px-1.5 font-mono text-2xs',
                    t.tone === 'rose' ? 'bg-rose text-white' : 'bg-fg/10 text-muted',
                  )}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Blue explainer box, the same one the Loyalty page uses. */
export function InfoNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start gap-2.5 rounded-2xl border border-sky/25 bg-sky-soft px-3.5 py-3 text-[13px] leading-relaxed text-[#245a9f]', className)}>
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function ErrorNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('rounded-xl bg-rose-soft px-4 py-3 text-sm font-medium text-[#a1282c]', className)} role="alert">
      {children}
    </p>
  );
}

/** Label + value pair used inside cards on phones. */
export function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="font-mono text-2xs uppercase tracking-[0.14em] text-muted">{label}</p>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  );
}

/** Small pill-shaped multi-select button (days, categories). */
export function PillToggle({
  on,
  onClick,
  children,
  disabled,
  className,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-9 items-center justify-center rounded-full border px-3 text-[13px] font-medium transition active:scale-[0.97] disabled:opacity-50',
        on ? 'border-ember bg-ember text-white' : 'border-line/15 bg-surface text-fg/75 hover:border-line/30 hover:text-fg',
        className,
      )}
    >
      {children}
    </button>
  );
}

export type TableFrom = 'md' | 'lg' | 'xl';

const TABLE_SHOW: Record<TableFrom, string> = { md: 'md:block', lg: 'lg:block', xl: 'xl:block' };
const CARDS_HIDE: Record<TableFrom, string> = { md: 'md:hidden', lg: 'lg:hidden', xl: 'xl:hidden' };

/** Class for the card list that replaces a DataTable below its breakpoint. */
export function cardsBelow(from: TableFrom = 'lg'): string {
  return CARDS_HIDE[from];
}

/**
 * Table shell for wide screens; below `from` the caller renders stacked cards (use cardsBelow(from)).
 * Defaults to lg because the sidebar takes ~260px: a tablet does not fit six columns.
 */
export function DataTable({ head, children, className, from = 'lg' }: { head: React.ReactNode; children: React.ReactNode; className?: string; from?: TableFrom }) {
  return (
    <div className={cn('hidden overflow-x-auto rounded-2xl border border-line/10 bg-surface shadow-soft', TABLE_SHOW[from], className)}>
      <table className="w-full text-sm">
        <thead className="bg-sunk/60 font-mono text-2xs uppercase tracking-[0.14em] text-muted">{head}</thead>
        <tbody className="divide-y divide-line/5">{children}</tbody>
      </table>
    </div>
  );
}

export function Th({ children, right, className }: { children?: React.ReactNode; right?: boolean; className?: string }) {
  return <th className={cn('px-4 py-3 font-medium', right ? 'text-right' : 'text-left', className)}>{children}</th>;
}

export function Td({ children, right, className }: { children?: React.ReactNode; right?: boolean; className?: string }) {
  return <td className={cn('px-4 py-3 align-middle', right && 'text-right', className)}>{children}</td>;
}

export function ListSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-16 w-full rounded-2xl" />
      ))}
    </div>
  );
}

/** The last non-null value, so a sheet keeps its content while it animates closed. */
export function useLastNonNull<T>(value: T | null): T | null {
  const ref = React.useRef<T | null>(value);
  if (value !== null) ref.current = value;
  return value ?? ref.current;
}
