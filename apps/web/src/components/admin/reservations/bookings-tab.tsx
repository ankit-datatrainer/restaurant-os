'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { motion, useReducedMotion } from 'framer-motion';
import { CalendarDays, ChevronLeft, ChevronRight, MessageCircle, Phone, StickyNote, Users } from 'lucide-react';
import type { DiningTable, Reservation, ReservationStatus } from '@restaurant-os/shared';
import { formatIndianPhone, whatsappLink } from '@restaurant-os/shared';
import { Button, EmptyState, Select, Skeleton } from '@/components/ui';
import { adminApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { fadeUp, stagger } from '@/lib/motion';
import { useAdmin } from '../admin-provider';
import { useConfirm } from '../confirm-dialog';
import { Chip, ChipRow } from '../page-header';
import { errorMessage } from '../format';
import { ReservationStatusBadge, SourceBadge, TablePickerSheet, addDaysKey, dayLabel, formatDayKey, formatIstTime, istDateKey, tableOptionLabel } from './shared';

type Filter = 'all' | 'requested' | 'confirmed' | 'seated' | 'done';
const DONE = new Set<ReservationStatus>(['completed', 'cancelled', 'no_show']);

function matches(r: Reservation, f: Filter): boolean {
  if (f === 'all') return true;
  if (f === 'done') return DONE.has(r.status);
  return r.status === f;
}

/** The message staff send from their own WhatsApp after confirming (they still tap send). */
export function confirmationMessage(r: Reservation, restaurantName: string): string {
  const when = `${formatDayKey(istDateKey(new Date(r.reserved_for).getTime()))} at ${formatIstTime(r.reserved_for)}`;
  return `Hi ${r.customer_name}, your table for ${r.party_size} at ${restaurantName} on ${when} is confirmed. See you soon! If your plans change, just reply here.`;
}

function BookingCard({
  r,
  tables,
  busy,
  error,
  onPatch,
  onSeat,
  onAskCancel,
}: {
  r: Reservation;
  tables: DiningTable[];
  busy: boolean;
  error: string | null;
  onPatch: (r: Reservation, patch: Parameters<typeof adminApi.updateReservation>[2], success?: string) => void;
  onSeat: (r: Reservation) => void;
  onAskCancel: (r: Reservation, kind: 'decline' | 'cancel' | 'no_show') => void;
}) {
  const { restaurant } = useAdmin();
  const done = DONE.has(r.status);
  const live = r.status === 'requested' || r.status === 'confirmed' || r.status === 'seated';
  const activeTables = tables.filter((t) => t.is_active || t.id === r.table_id);
  const end = new Date(new Date(r.reserved_for).getTime() + r.duration_minutes * 60_000);

  return (
    <article
      className={cn(
        'relative rounded-2xl border bg-surface p-4 shadow-soft transition-opacity md:p-5',
        r.status === 'requested' ? 'border-ember/30' : 'border-line/10',
        done && 'opacity-60',
      )}
      aria-label={`${r.customer_name}, ${formatIstTime(r.reserved_for)}`}
    >
      <div className="flex gap-4">
        <div className="w-[68px] shrink-0">
          <p className="font-display text-[19px] font-semibold leading-none tnum">{formatIstTime(r.reserved_for).replace(/ (AM|PM)$/, '')}</p>
          <p className="mt-1 font-mono text-2xs uppercase tracking-[0.12em] text-muted">
            {formatIstTime(r.reserved_for).slice(-2)} · {r.duration_minutes}m
          </p>
          <p className="mt-0.5 font-mono text-2xs text-muted tnum">to {formatIstTime(end.getTime())}</p>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <ReservationStatusBadge status={r.status} />
            <SourceBadge source={r.source} />
          </div>
          <p className="mt-1.5 truncate font-display text-[17px] font-semibold leading-tight">{r.customer_name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" aria-hidden />
              <span className="tnum">{r.party_size}</span> {r.party_size === 1 ? 'guest' : 'guests'}
            </span>
            <a href={`tel:${r.phone}`} className="inline-flex min-h-[32px] items-center gap-1.5 hover:text-fg">
              <Phone className="h-3.5 w-3.5" aria-hidden />
              <span className="tnum">{formatIndianPhone(r.phone)}</span>
            </a>
            {live && r.status !== 'seated' && (
              <a
                href={whatsappLink(r.phone, confirmationMessage(r, restaurant.name))}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-[32px] items-center gap-1.5 font-semibold text-[#1b6f49] hover:underline"
                title="Opens WhatsApp with a confirmation message typed in. You tap send."
              >
                <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                WhatsApp
              </a>
            )}
          </div>
          {r.note && (
            <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-sunk px-3 py-2 text-[13px] text-fg/80">
              <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0">{r.note}</span>
            </p>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 border-t border-line/10 pt-3 sm:flex-row sm:items-center">
        <div className="min-w-0 sm:w-56">
          {live ? (
            <Select
              aria-label={`Table for ${r.customer_name}`}
              value={r.table_id ?? ''}
              disabled={busy}
              onChange={(e) => onPatch(r, { table_id: e.target.value || null }, e.target.value ? 'Table assigned' : 'Table removed')}
              className="h-10 text-sm"
            >
              <option value="">{r.status === 'seated' ? 'Pick a table' : 'No table yet'}</option>
              {activeTables.map((t) => (
                <option key={t.id} value={t.id}>
                  {tableOptionLabel(t)}
                </option>
              ))}
            </Select>
          ) : (
            <p className="text-[13px] text-muted">{r.table ? `Table: ${r.table.label}` : 'No table'}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 sm:ml-auto sm:justify-end">
          {r.status === 'requested' && (
            <>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onAskCancel(r, 'decline')}>
                Decline
              </Button>
              <Button size="sm" loading={busy} onClick={() => onPatch(r, { status: 'confirmed' }, `Confirmed ${r.customer_name}`)}>
                Confirm
              </Button>
            </>
          )}
          {r.status === 'confirmed' && (
            <>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAskCancel(r, 'cancel')}>
                Cancel
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onAskCancel(r, 'no_show')}>
                No-show
              </Button>
              <Button size="sm" variant="dark" loading={busy} onClick={() => onSeat(r)}>
                Seat
              </Button>
            </>
          )}
          {r.status === 'seated' && (
            <Button size="sm" variant="success" loading={busy} onClick={() => onPatch(r, { status: 'completed' }, `${r.customer_name}: completed`)}>
              Complete
            </Button>
          )}
        </div>
      </div>
      {error && (
        <p className="mt-2 rounded-xl bg-rose-soft px-3 py-2 text-[13px] text-[#a1282c]" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}

/**
 * Bookings for one IST day, ordered by time, with quick actions by status. `list` and `reload`
 * come from the parent so the counters at the top stay in step.
 */
export function BookingsTab({
  day,
  onDay,
  list,
  loading,
  error,
  onChanged,
  onNew,
  onRetry,
}: {
  day: string;
  onDay: (key: string) => void;
  list: Reservation[] | null;
  loading: boolean;
  error: string | null;
  onChanged: (r: Reservation) => void;
  onNew: () => void;
  onRetry: () => void;
}) {
  const reduce = useReducedMotion();
  const { token, tables } = useAdmin();
  const { confirm, dialog } = useConfirm();
  const [filter, setFilter] = React.useState<Filter>('all');
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [cardErrors, setCardErrors] = React.useState<Record<string, string>>({});
  const [seating, setSeating] = React.useState<Reservation | null>(null);
  const today = istDateKey(Date.now());

  const patch = async (r: Reservation, body: Parameters<typeof adminApi.updateReservation>[2], success?: string) => {
    setBusyId(r.id);
    setCardErrors((e) => {
      if (!(r.id in e)) return e;
      const rest = { ...e };
      delete rest[r.id];
      return rest;
    });
    try {
      const updated = await adminApi.updateReservation(token, r.id, body);
      onChanged(updated);
      if (success) toast.success(success);
      return true;
    } catch (e) {
      // e.g. "That table is already booked for Priya at that time."
      const message = errorMessage(e, 'Could not update the booking.');
      setCardErrors((prev) => ({ ...prev, [r.id]: message }));
      toast.error(message);
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const seat = (r: Reservation) => {
    if (r.table_id) void patch(r, { status: 'seated' }, `${r.customer_name} seated at ${r.table?.label ?? 'their table'}`);
    else setSeating(r);
  };

  const askCancel = async (r: Reservation, kind: 'decline' | 'cancel' | 'no_show') => {
    const copy = {
      decline: { title: `Decline ${r.customer_name}'s request?`, label: 'Decline request', status: 'cancelled' as const, done: 'Request declined' },
      cancel: { title: `Cancel ${r.customer_name}'s booking?`, label: 'Cancel booking', status: 'cancelled' as const, done: 'Booking cancelled' },
      no_show: { title: `Mark ${r.customer_name} as a no-show?`, label: 'Mark no-show', status: 'no_show' as const, done: 'Marked as no-show' },
    }[kind];
    const ok = await confirm({
      title: copy.title,
      description:
        kind === 'no_show'
          ? 'Use this when the party did not turn up. The table is freed.'
          : `${r.party_size} ${r.party_size === 1 ? 'guest' : 'guests'} at ${formatIstTime(r.reserved_for)}. Let the guest know yourself; nothing is sent automatically.`,
      confirmLabel: copy.label,
      danger: kind !== 'no_show',
    });
    if (ok) void patch(r, { status: copy.status }, copy.done);
  };

  const all = list ?? [];
  const counts: Record<Filter, number> = {
    all: all.length,
    requested: all.filter((r) => r.status === 'requested').length,
    confirmed: all.filter((r) => r.status === 'confirmed').length,
    seated: all.filter((r) => r.status === 'seated').length,
    done: all.filter((r) => DONE.has(r.status)).length,
  };
  const shown = all.filter((r) => matches(r, filter));
  const seatedTableIds = new Set(all.filter((r) => r.status === 'seated' && r.table_id).map((r) => r.table_id!));

  return (
    <div>
      {/* Day selector (IST) */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-full border border-line/15 bg-surface p-1">
          <button
            type="button"
            onClick={() => onDay(addDaysKey(day, -1))}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-fg/80 hover:bg-sunk"
            aria-label="Previous day"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <p className="min-w-[132px] text-center text-sm font-semibold" aria-live="polite">
            {dayLabel(day)}
            {dayLabel(day) !== formatDayKey(day) && <span className="ml-1.5 font-normal text-muted">{formatDayKey(day).split(', ')[1]}</span>}
          </p>
          <button
            type="button"
            onClick={() => onDay(addDaysKey(day, 1))}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-fg/80 hover:bg-sunk"
            aria-label="Next day"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <Chip active={day === today} onClick={() => onDay(today)}>
          Today
        </Chip>
        <Chip active={day === addDaysKey(today, 1)} onClick={() => onDay(addDaysKey(today, 1))}>
          Tomorrow
        </Chip>
        <label className="relative inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-line/15 bg-surface px-3.5 text-[13px] font-medium text-fg/80 hover:border-line/30">
          <CalendarDays className="h-4 w-4" aria-hidden />
          Pick a date
          <input
            type="date"
            value={day}
            onChange={(e) => e.target.value && onDay(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Pick a date"
          />
        </label>
      </div>

      <ChipRow label="Filter bookings" className="mb-4">
        {(
          [
            ['all', 'All'],
            ['requested', 'Requested'],
            ['confirmed', 'Confirmed'],
            ['seated', 'Seated'],
            ['done', 'Done'],
          ] as Array<[Filter, string]>
        ).map(([id, label]) => (
          <Chip key={id} active={filter === id} onClick={() => setFilter(id)} count={counts[id]} tone={id === 'requested' && counts.requested > 0 ? 'ember' : 'ink'}>
            {label}
          </Chip>
        ))}
      </ChipRow>

      {error && !list && (
        <EmptyState
          title="Could not load bookings"
          description={error}
          action={
            <Button variant="outline" onClick={onRetry}>
              Try again
            </Button>
          }
        />
      )}

      {list === null && loading && (
        <div className="grid gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-2xl" />
          ))}
        </div>
      )}

      {list && shown.length === 0 && (
        <EmptyState
          icon={<CalendarDays className="h-5 w-5" aria-hidden />}
          title={all.length === 0 ? `No bookings for ${dayLabel(day).toLowerCase() === 'today' ? 'today' : formatDayKey(day)}` : 'Nothing in this filter'}
          description={all.length === 0 ? 'Online requests appear here as they come in. Add phone bookings with New booking.' : 'Pick another filter to see the rest of the day.'}
          action={
            all.length === 0 ? (
              <Button onClick={onNew}>New booking</Button>
            ) : (
              <Button variant="outline" onClick={() => setFilter('all')}>
                Show all
              </Button>
            )
          }
        />
      )}

      {list && shown.length > 0 && (
        <motion.div className="grid gap-3" variants={stagger(0.04)} initial={reduce ? false : 'hidden'} animate="show">
          {shown.map((r) => (
            <motion.div key={r.id} variants={fadeUp}>
              <BookingCard
                r={r}
                tables={tables}
                busy={busyId === r.id}
                error={cardErrors[r.id] ?? null}
                onPatch={(res, body, success) => void patch(res, body, success)}
                onSeat={seat}
                onAskCancel={(res, kind) => void askCancel(res, kind)}
              />
            </motion.div>
          ))}
        </motion.div>
      )}

      <TablePickerSheet
        open={seating !== null}
        onClose={() => setSeating(null)}
        tables={tables}
        partySize={seating?.party_size ?? 1}
        currentId={seating?.table_id}
        busyIds={seatedTableIds}
        title={seating ? `Seat ${seating.customer_name}` : 'Seat'}
        description={seating ? `${seating.party_size} ${seating.party_size === 1 ? 'guest' : 'guests'} · pick their table` : undefined}
        picking={busyId !== null}
        onPick={async (t) => {
          if (!seating) return;
          const ok = await patch(seating, { status: 'seated', table_id: t.id }, `${seating.customer_name} seated at ${t.label}`);
          if (ok) setSeating(null);
        }}
      />
      {dialog}
    </div>
  );
}
