'use client';

import * as React from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { cn, tableUrl } from '@/lib/utils';
import { LogoMark } from '@/components/ui';
import { useAdmin } from './admin-provider';
import { SoundControls } from './sound-controls';
import { DeviceAlertsButton } from './device-alerts';
import { ClockPill } from './staff/clock-pill';
import { useConfirm } from './confirm-dialog';
import type { ConnectionStatus } from './use-realtime';

const CONNECTION: Record<ConnectionStatus, { label: string; dot: string; hint: string }> = {
  connecting: { label: 'Connecting', dot: 'bg-saffron', hint: 'Connecting to live updates…' },
  live: { label: 'Live', dot: 'bg-mint', hint: 'Live: new orders appear instantly.' },
  polling: { label: 'Polling', dot: 'bg-saffron', hint: 'Live connection lost. Checking for orders every 10 seconds.' },
};

export function ConnectionDot({ status, showLabel = true }: { status: ConnectionStatus; showLabel?: boolean }) {
  const c = CONNECTION[status];
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-2xs uppercase tracking-[0.14em] text-muted" title={c.hint} aria-label={c.hint}>
      <span className="relative flex h-2 w-2">
        {status === 'live' && <span className="absolute inline-flex h-full w-full rounded-full bg-mint/70 animate-pulse-ring" aria-hidden />}
        <span className={cn('relative inline-flex h-2 w-2 rounded-full', c.dot)} />
      </span>
      {showLabel && <span className="hidden md:inline">{c.label}</span>}
    </span>
  );
}

export function Topbar({ title }: { title: string }) {
  const { restaurant, tables, connection, setOpenForOrders } = useAdmin();
  const { confirm, dialog } = useConfirm();
  const [busy, setBusy] = React.useState(false);
  const firstTable = tables.find((t) => t.is_active) ?? tables[0];

  const toggleOpen = async () => {
    const next = !restaurant.is_open;
    const ok = await confirm({
      title: next ? 'Start taking orders?' : 'Stop taking orders?',
      description: next
        ? 'Guests who scan a table QR will be able to order again.'
        : 'Guests will see a "closed for orders" notice on the menu. Orders already placed are not affected.',
      confirmLabel: next ? 'Open for orders' : 'Close for orders',
      danger: !next,
    });
    if (!ok) return;
    setBusy(true);
    await setOpenForOrders(next);
    setBusy(false);
  };

  return (
    <header className="sticky top-0 z-30 glass border-b border-line/10 print:hidden">
      <div className="gutter flex h-16 items-center gap-2 sm:gap-3">
        <Link href="/admin" className="md:hidden" aria-label="Dashboard">
          <LogoMark size={30} className="text-ink" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="hidden truncate font-mono text-2xs uppercase tracking-[0.16em] text-muted md:block">{restaurant.name}</p>
          <h1 className="truncate font-display text-[17px] font-semibold leading-tight md:text-lg">{title}</h1>
        </div>

        <ConnectionDot status={connection} />
        <SoundControls compact />
        <DeviceAlertsButton />
        <ClockPill />

        {firstTable && (
          <a
            href={tableUrl(firstTable.code)}
            target="_blank"
            rel="noreferrer"
            className="hidden h-9 shrink-0 items-center gap-1.5 rounded-full border border-line/15 px-3 text-[13px] font-medium text-fg/80 transition hover:bg-fg/5 hover:text-fg lg:inline-flex"
            title={`Opens the guest menu for ${firstTable.label} in a new tab`}
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            Open guest menu
          </a>
        )}

        <button
          type="button"
          role="switch"
          aria-checked={restaurant.is_open}
          disabled={busy}
          onClick={() => void toggleOpen()}
          className={cn(
            'inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-[13px] font-semibold transition disabled:opacity-60',
            restaurant.is_open ? 'border-mint/30 bg-mint-soft text-[#1b6f49]' : 'border-rose/30 bg-rose-soft text-[#a1282c]',
          )}
          title={restaurant.is_open ? 'Taking orders. Click to close.' : 'Closed for orders. Click to open.'}
        >
          <span className={cn('h-2 w-2 rounded-full', restaurant.is_open ? 'bg-mint' : 'bg-rose')} aria-hidden />
          <span className="hidden sm:inline">{restaurant.is_open ? 'Open for orders' : 'Closed'}</span>
          <span className="sm:hidden">{restaurant.is_open ? 'Open' : 'Closed'}</span>
        </button>
      </div>
      {dialog}
    </header>
  );
}
