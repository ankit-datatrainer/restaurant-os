'use client';

import * as React from 'react';
import { Clock } from 'lucide-react';
import { toast } from 'sonner';
import type { StaffShift } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAdmin } from '../admin-provider';
import { useConfirm } from '../confirm-dialog';
import { errorMessage } from '../format';
import { useNow } from '../use-now';
import { announceShift, clockTime, durationLabel, onShiftChange, shiftHours } from './shift';

/**
 * Compact clock-in / clock-out pill for the signed-in staff member (topbar).
 * Shows "On shift · 2h 10m" while clocked in; just the icon on narrow phones.
 */
export function ClockPill({ className }: { className?: string }) {
  const { token } = useAdmin();
  const { confirm, dialog } = useConfirm();
  const now = useNow(60_000);
  const [shift, setShift] = React.useState<StaffShift | null | undefined>(undefined);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    adminApi
      .myShift(token)
      .then((r) => {
        if (!cancelled) setShift(r.open_shift);
      })
      .catch(() => {
        // The pill is optional chrome: stay hidden rather than shout about it.
        if (!cancelled) setShift(undefined);
      });
    const off = onShiftChange((s) => setShift(s));
    return () => {
      cancelled = true;
      off();
    };
  }, [token]);

  if (shift === undefined) return null;

  const toggle = async () => {
    if (shift) {
      const ok = await confirm({
        title: 'Clock out?',
        description: `You clocked in at ${clockTime(shift.clock_in)} (${durationLabel(shiftHours(shift, Date.now()))} ago).`,
        confirmLabel: 'Clock out',
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      if (shift) {
        const done = await adminApi.clockOut(token);
        setShift(null);
        announceShift(null);
        toast.success(`Clocked out. ${durationLabel(shiftHours(done))} on this shift.`);
      } else {
        const started = await adminApi.clockIn(token);
        setShift(started);
        announceShift(started);
        toast.success(`Clocked in at ${clockTime(started.clock_in)}.`);
      }
    } catch (e) {
      toast.error(errorMessage(e, shift ? 'Could not clock out.' : 'Could not clock in.'));
      // Resync: another device may have changed the shift.
      adminApi
        .myShift(token)
        .then((r) => setShift(r.open_shift))
        .catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  const on = Boolean(shift);
  const label = shift ? `On shift since ${clockTime(shift.clock_in)}. Click to clock out.` : 'Not clocked in. Click to clock in.';

  return (
    <>
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={busy}
        aria-label={label}
        title={label}
        className={cn(
          'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[13px] font-medium transition disabled:opacity-60 sm:px-3',
          on ? 'border-mint/30 bg-mint-soft text-[#1b6f49] hover:bg-mint-soft/80' : 'border-line/15 text-fg/70 hover:bg-fg/5 hover:text-fg',
          className,
        )}
      >
        <span className="relative flex h-4 w-4 items-center justify-center" aria-hidden>
          <Clock className="h-4 w-4" />
          {on && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-surface bg-mint" />}
        </span>
        <span className="hidden sm:inline">{shift ? <span className="tnum font-mono text-xs">{durationLabel(shiftHours(shift, now))}</span> : 'Clock in'}</span>
      </button>
      {dialog}
    </>
  );
}
