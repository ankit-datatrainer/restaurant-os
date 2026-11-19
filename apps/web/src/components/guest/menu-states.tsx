'use client';

import * as React from 'react';
import { QrCode, WifiOff, AlertCircle, Clock } from 'lucide-react';
import { Button, Skeleton } from '@/components/ui';
import type { TableError } from './table-provider';

/** Skeleton that mirrors the menu layout so nothing jumps when data arrives. */
export function MenuSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the menu">
      <div className="gutter flex h-[68px] items-center justify-between">
        <div className="grid gap-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-10 w-16 rounded-full" />
        </div>
      </div>
      <div className="gutter flex gap-2 overflow-hidden py-2">
        {['w-[88px]', 'w-[72px]', 'w-[96px]', 'w-[80px]', 'w-[64px]'].map((w) => (
          <Skeleton key={w} className={`h-9 shrink-0 rounded-full ${w}`} />
        ))}
      </div>
      <div className="gutter mt-3">
        <Skeleton className="aspect-[21/9] w-full rounded-3xl" />
      </div>
      <div className="gutter mt-6">
        <Skeleton className="h-6 w-32" />
        <ul className="mt-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="flex gap-4 py-4">
              <div className="min-w-0 flex-1">
                <Skeleton className="h-3 w-14" />
                <Skeleton className="mt-2.5 h-5 w-3/4" />
                <Skeleton className="mt-2 h-3.5 w-full" />
                <Skeleton className="mt-1.5 h-3.5 w-2/3" />
                <Skeleton className="mt-3 h-4 w-16" />
              </div>
              <Skeleton className="h-28 w-28 shrink-0 rounded-2xl" />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Full-screen friendly message for an unknown/inactive code or a network problem. */
export function TableProblem({ code, error, onRetry }: { code: string; error: TableError; onRetry: () => void }) {
  const notFound = error.kind === 'not_found';
  const offline = error.kind === 'network';
  const Icon = notFound ? QrCode : offline ? WifiOff : AlertCircle;
  const title = notFound ? `We couldn't find table ${code}` : offline ? 'Can’t reach the kitchen' : 'Something went wrong';
  const body = notFound
    ? 'This QR may be from an old sticker, or the table is not active right now. Ask the staff for a fresh code.'
    : offline
      ? 'Check that your phone is online and try again. The restaurant Wi-Fi usually works best.'
      : error.message;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-sunk text-fg/70">
        <Icon className="h-7 w-7" aria-hidden />
      </div>
      <h1 className="mt-6 font-display text-2xl font-bold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-xs text-[15px] text-muted">{body}</p>
      <div className="mt-7 flex flex-col gap-2 sm:flex-row">
        {notFound ? (
          <Button href="/t" size="lg">
            Enter code
          </Button>
        ) : (
          <>
            <Button size="lg" onClick={onRetry}>
              Try again
            </Button>
            <Button href="/t" size="lg" variant="outline">
              Enter a different code
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/** Strip shown under the header when the restaurant has paused ordering. */
export function ClosedBanner() {
  return (
    <div className="gutter mt-3">
      <div className="flex items-start gap-3 rounded-2xl bg-saffron-soft px-4 py-3 text-[#6e4700]">
        <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="min-w-0 text-sm">
          <p className="font-semibold">Not taking orders right now</p>
          <p className="mt-0.5 text-[13px] opacity-80">You can still browse the menu. Ask the staff when ordering reopens.</p>
        </div>
      </div>
    </div>
  );
}
