import * as React from 'react';
import { cn } from '@/lib/utils';

/** Page title row with optional description and right-aligned actions. */
export function PageHeader({
  title,
  description,
  actions,
  className,
  eyebrow,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className={cn('mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between md:mb-6', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <h2 className="font-display text-2xl font-semibold leading-tight tracking-tight md:text-[28px]">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Horizontal, scrollable chip row for filters. */
export function ChipRow({ children, className, label }: { children: React.ReactNode; className?: string; label?: string }) {
  return (
    <div className={cn('no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 py-0.5', className)} role="group" aria-label={label}>
      {children}
    </div>
  );
}

export function Chip({
  active,
  onClick,
  children,
  count,
  tone = 'ink',
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
  tone?: 'ink' | 'ember';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition active:scale-[0.97]',
        active
          ? tone === 'ember'
            ? 'border-ember bg-ember text-white'
            : 'border-ink bg-ink text-paper'
          : 'border-line/15 bg-surface text-fg/80 hover:border-line/30 hover:text-fg',
      )}
    >
      {children}
      {count !== undefined && (
        <span className={cn('tnum rounded-full px-1.5 font-mono text-2xs', active ? 'bg-white/20' : 'bg-sunk text-muted')}>{count}</span>
      )}
    </button>
  );
}
