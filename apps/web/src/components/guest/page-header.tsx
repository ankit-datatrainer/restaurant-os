'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

/** Sticky glass header for the secondary guest pages (orders, tracker). */
export function GuestPageHeader({
  title,
  subtitle,
  backHref,
  backLabel = 'Back to menu',
  right,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  backHref: string;
  backLabel?: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="glass hairline-b sticky top-[var(--guest-offline-h,0px)] z-30">
      <div className="gutter flex h-16 items-center gap-1">
        <Link
          href={backHref}
          className="-ml-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fg transition hover:bg-fg/5"
          aria-label={backLabel}
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-[17px] font-bold leading-tight tracking-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 truncate text-xs text-muted">{subtitle}</p>}
        </div>
        {right}
      </div>
    </header>
  );
}
