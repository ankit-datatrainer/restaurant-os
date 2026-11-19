'use client';

import * as React from 'react';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SegmentTab<T extends string> {
  id: T;
  label: string;
  icon?: React.ReactNode;
  /** Shows a small lock: the tab opens an upgrade card on this plan. */
  locked?: boolean;
}

/**
 * Pill tab bar (same look as the billing / orders range switch). Scrolls sideways on narrow
 * phones instead of wrapping, so the page itself never scrolls horizontally.
 */
export function SegmentTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
}: {
  tabs: Array<SegmentTab<T>>;
  value: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
}) {
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = tabs.findIndex((t) => t.id === value);
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    if (next) {
      onChange(next.id);
      const el = e.currentTarget.querySelector<HTMLButtonElement>(`[data-tab="${next.id}"]`);
      el?.focus();
    }
  };
  return (
    <div className={cn('no-scrollbar -mx-1 overflow-x-auto px-1', className)}>
      <div className="inline-flex min-w-max rounded-full bg-sunk p-1" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {tabs.map((t) => {
          const active = t.id === value;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              data-tab={t.id}
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(t.id)}
              className={cn(
                'inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition sm:px-4',
                active ? 'bg-surface text-fg shadow-soft' : 'text-muted hover:text-fg',
              )}
            >
              {t.icon && <span className="[&>svg]:h-4 [&>svg]:w-4" aria-hidden>{t.icon}</span>}
              {t.label}
              {t.locked && <Lock className="h-3 w-3 opacity-70" aria-label="Not in your plan" />}
            </button>
          );
        })}
      </div>
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

/** Thin progress bar; `tone` picks the fill colour. Values over 100% fill the bar. */
export function ProgressBar({ pct, tone, label }: { pct: number; tone: 'mint' | 'saffron' | 'rose' | 'ink'; label?: string }) {
  const fill = { mint: 'bg-mint', saffron: 'bg-saffron', rose: 'bg-rose', ink: 'bg-ink' }[tone];
  const width = Math.max(0, Math.min(100, pct));
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-sunk"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.min(pct, 999))}
      aria-label={label}
    >
      <div className={cn('h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none', fill)} style={{ width: `${width}%` }} />
    </div>
  );
}

/** Small "Only owners and managers" panel for pages a role cannot use. */
export function RoleNote({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-line/10 bg-surface p-6 shadow-soft md:p-8">
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sunk text-muted" aria-hidden>
        <Lock className="h-5 w-5" />
      </span>
      <h3 className="mt-4 font-display text-xl font-semibold">{title}</h3>
      <div className="mt-1.5 max-w-xl text-sm text-muted">{children}</div>
    </div>
  );
}
