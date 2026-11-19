'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { CountUp, Skeleton } from '@/components/ui';

export function StatTile({
  label,
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  hint,
  icon,
  tone = 'neutral',
  loading,
  className,
}: {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: 'neutral' | 'ember' | 'mint' | 'saffron' | 'sky';
  loading?: boolean;
  className?: string;
}) {
  const toneClass: Record<typeof tone, string> = {
    neutral: 'bg-sunk text-fg/70',
    ember: 'bg-ember-soft text-ember-3',
    mint: 'bg-mint-soft text-[#1b6f49]',
    saffron: 'bg-saffron-soft text-[#8a5a00]',
    sky: 'bg-sky-soft text-[#245a9f]',
  };
  return (
    <div className={cn('rounded-2xl border border-line/10 bg-surface p-4 shadow-soft md:p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-2xs uppercase tracking-[0.16em] text-muted">{label}</p>
        {icon && (
          <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', toneClass[tone])} aria-hidden>
            {icon}
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-24" />
      ) : (
        <p className="mt-2 font-mono text-[26px] font-semibold leading-none tracking-tight md:text-[30px]">
          <CountUp value={value} prefix={prefix} suffix={suffix} decimals={decimals} duration={1.1} />
        </p>
      )}
      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
    </div>
  );
}
