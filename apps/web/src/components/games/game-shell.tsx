'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EASE_OUT } from '@/lib/motion';

/**
 * Phone-first shell shared by the games hub and every game page.
 * Self-contained on purpose: it sets the light theme and reads nothing from
 * the parent table layout, so each route renders correctly on its own.
 */
export function GameShell({
  code,
  title,
  backHref,
  backLabel = 'Back to the menu',
  children,
  className,
}: {
  code: string;
  title: string;
  /** Defaults to the table menu, /t/[code]. */
  backHref?: string;
  backLabel?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const href = backHref ?? `/t/${encodeURIComponent(code)}`;

  // No overflow on the wrapper: any non-visible overflow would make it the sticky header's
  // scrollport and the header would scroll away. `body` already clips horizontal overflow.
  return (
    <div className="theme-light relative min-h-dvh w-full bg-bg text-fg">
      <header className="glass hairline-b sticky top-[var(--guest-offline-h,0px)] z-30 pt-safe">
        <div className="gutter mx-auto flex h-14 w-full max-w-[560px] items-center gap-2">
          <Link
            href={href}
            aria-label={backLabel}
            className="-ml-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-fg transition-colors hover:bg-fg/5 active:scale-95"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </Link>
          <h1 className="min-w-0 flex-1 truncate font-display text-[17px] font-bold tracking-tight">{title}</h1>
          <span className="shrink-0 rounded-full bg-sunk px-2.5 py-1 font-mono text-2xs font-medium uppercase tracking-[0.14em] text-fg/70">
            Table {code || '—'}
          </span>
        </div>
      </header>

      <motion.main
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE_OUT }}
        className={cn('gutter pb-safe mx-auto w-full max-w-[560px] pt-5', className)}
        style={{ paddingBottom: 'max(3rem, env(safe-area-inset-bottom, 0px))' }}
      >
        {children}
      </motion.main>
    </div>
  );
}

/** Small mono label above a block. */
export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('eyebrow', className)}>{children}</p>;
}
