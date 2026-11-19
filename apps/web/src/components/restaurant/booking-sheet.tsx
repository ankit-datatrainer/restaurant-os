'use client';

import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertCircle, CalendarPlus, CheckCircle2, Minus, Plus, Users } from 'lucide-react';
import type { Restaurant, ReservationRequestResult } from '@restaurant-os/shared';
import { formatIndianPhone, normalizeIndianPhone } from '@restaurant-os/shared';
import { Button, Input, Sheet, Textarea } from '@/components/ui';
import { publicApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { EASE_OUT } from '@/lib/motion';
import { useOnline } from '@/components/guest/use-online';
import { useClock } from '@/components/guest/happy-hour-banner';
import { addDaysKey, formatDayKey, formatIstDateTime, formatIstTime, hoursText, istDateKey, partOfDay, relativeDay, slotsForDay } from './hours';
import { buildIcs, downloadIcs } from './ics';
import { phoneForInput, rememberContact } from './takeaway-session';
import { useRestaurant } from './restaurant-provider';

const LEAD_MS = 31 * 60_000; // the server wants 30 minutes; one more absorbs the time it takes to fill the form
const MAX_DAYS = 60;
const CHIP_DAYS = 14;
const LAST_BOOKING_BEFORE_CLOSE = 30;
const GROUPS = ['Morning', 'Afternoon', 'Evening', 'Late night'] as const;

function PartyStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-line/10 bg-surface p-2 pl-4">
      <span className="flex items-center gap-2.5 text-[15px] font-semibold">
        <Users className="h-4 w-4 text-muted" aria-hidden />
        <span className="tnum" aria-live="polite">
          {value} {value === 1 ? 'guest' : 'guests'}
        </span>
      </span>
      <div className="flex items-center gap-1.5" role="group" aria-label="Party size">
        <button
          type="button"
          onClick={() => onChange(Math.max(1, value - 1))}
          disabled={value <= 1}
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-sunk text-fg transition active:scale-95 disabled:opacity-40"
          aria-label="One guest fewer"
        >
          <Minus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onChange(Math.min(30, value + 1))}
          disabled={value >= 30}
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-ink text-paper transition active:scale-95 disabled:opacity-40"
          aria-label="One more guest"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden />
        </button>
      </div>
    </div>
  );
}

/**
 * "Book a table": party size, date (next 60 days), a 15-minute slot within opening hours and at
 * least 30 minutes ahead, name, mobile, note → a booking request the restaurant confirms.
 */
export function BookingSheet({ open, onClose, restaurant }: { open: boolean; onClose: () => void; restaurant: Restaurant }) {
  const reduce = useReducedMotion();
  const online = useOnline();
  const { slug, session } = useRestaurant();
  const now = useClock(60_000);
  const today = istDateKey(now);

  const [party, setParty] = React.useState(2);
  const [day, setDay] = React.useState(today);
  const [slot, setSlot] = React.useState<number | null>(null);
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [note, setNote] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<ReservationRequestResult | null>(null);

  // Fill in what this phone used last time; start fresh each time the sheet opens after a booking.
  React.useEffect(() => {
    if (!open) return;
    setError(null);
    if (done) {
      setDone(null);
      setSlot(null);
      setNote('');
    }
    setName((v) => v || session?.name || '');
    setPhone((v) => v || phoneForInput(session?.phone));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const dayKeys = React.useMemo(() => Array.from({ length: CHIP_DAYS }, (_, i) => addDaysKey(today, i)), [today]);
  const lastKey = addDaysKey(today, MAX_DAYS - 1);
  const slots = React.useMemo(
    () => slotsForDay(restaurant, day, { minAt: now + LEAD_MS, maxAt: now + MAX_DAYS * 86_400_000, tailMinutes: LAST_BOOKING_BEFORE_CLOSE }),
    [restaurant, day, now],
  );
  const grouped = React.useMemo(() => GROUPS.map((g) => ({ group: g, slots: slots.filter((s) => partOfDay(s) === g) })).filter((g) => g.slots.length > 0), [slots]);

  // A slot that slipped into the past (the sheet stayed open) or belongs to another day is dropped.
  React.useEffect(() => {
    if (slot !== null && !slots.includes(slot)) setSlot(null);
  }, [slots, slot]);
  // Today may have no slots left: jump to tomorrow when the sheet opens.
  React.useEffect(() => {
    if (open && day === today && slots.length === 0) setDay(addDaysKey(today, 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const normalized = normalizeIndianPhone(phone);
  const nameError = touched && !name.trim() ? 'Add the name for the booking.' : undefined;
  const phoneError = touched && !normalized ? 'Enter a 10-digit mobile number, like 98450 12345.' : undefined;

  const submit = async () => {
    setTouched(true);
    setError(null);
    if (!name.trim() || !normalized) return;
    if (slot === null) {
      setError('Pick a time for your table.');
      return;
    }
    setSending(true);
    try {
      const res = await publicApi.requestReservation({
        restaurant_slug: slug,
        name: name.trim(),
        phone: normalized,
        party_size: party,
        reserved_for: new Date(slot).toISOString(),
        note: note.trim() || undefined,
      });
      rememberContact(slug, { name, phone: normalized });
      setDone(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the booking request. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const addToCalendar = () => {
    if (!done) return;
    const start = new Date(done.reserved_for).getTime();
    const ics = buildIcs({
      uid: done.id,
      start,
      minutes: restaurant.reservation_minutes || 90,
      title: `Table for ${done.party_size} at ${done.restaurant} (requested)`,
      location: restaurant.address,
      description: `Booking request sent to ${done.restaurant}. They will confirm it with you.${restaurant.phone ? ` Phone: ${restaurant.phone}` : ''}`,
    });
    downloadIcs(`table-${slug}.ics`, ics);
  };

  const fade = {
    initial: reduce ? false : { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: reduce ? undefined : { opacity: 0, y: -10 },
    transition: { duration: 0.3, ease: EASE_OUT },
  } as const;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={done ? 'Request sent' : 'Book a table'}
      description={done ? undefined : hoursText(restaurant) ? `${restaurant.name} · Open ${hoursText(restaurant)}` : restaurant.name}
      footer={
        done ? (
          <Button size="lg" className="w-full" variant="dark" onClick={onClose}>
            Done
          </Button>
        ) : (
          <div className="grid gap-2">
            {!online && <p className="text-center text-xs text-rose">You&apos;re offline. Reconnect to send the request.</p>}
            <Button size="xl" className="w-full" onClick={submit} loading={sending} disabled={!online}>
              {slot !== null ? `Request ${relativeDay(day, now)}, ${formatIstTime(slot)}` : 'Request a table'}
            </Button>
          </div>
        )
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        {done ? (
          <motion.div key="done" {...fade} className="py-4 text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-mint-soft text-[#1b6f49]">
              <CheckCircle2 className="h-8 w-8" aria-hidden />
            </span>
            <p className="mt-5 font-display text-2xl font-bold tracking-tight">Request sent</p>
            <p className="mx-auto mt-2 max-w-sm text-[15px] text-fg/80">
              {done.restaurant} will confirm your table for <span className="font-semibold">{done.party_size}</span> on{' '}
              <span className="font-semibold">{formatIstDateTime(done.reserved_for, now)}</span>.
              {normalized ? ` They may call or WhatsApp you on ${formatIndianPhone(normalized)}.` : ''}
            </p>
            <div className="mx-auto mt-6 grid max-w-xs gap-2">
              <Button variant="outline" size="lg" onClick={addToCalendar} leftIcon={<CalendarPlus className="h-4 w-4" aria-hidden />}>
                Add to calendar
              </Button>
              {restaurant.phone && (
                <Button variant="ghost" size="md" href={`tel:${restaurant.phone.replace(/\s/g, '')}`}>
                  Call {restaurant.name}
                </Button>
              )}
            </div>
            <p className="mt-6 text-[12.5px] text-muted">It is a request until the restaurant confirms it. To change it, call them.</p>
          </motion.div>
        ) : (
          <motion.div key="form" {...fade} className="grid grid-cols-1 gap-6">
            <div>
              <p className="mb-2 text-[13px] font-semibold text-fg/80">How many people?</p>
              <PartyStepper value={party} onChange={setParty} />
              {party >= 30 && <p className="mt-1.5 text-xs text-muted">For more than 30 guests, call the restaurant.</p>}
            </div>

            <div>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <p className="text-[13px] font-semibold text-fg/80">Which day?</p>
                <label className="relative inline-flex min-h-[36px] cursor-pointer items-center text-[12.5px] font-semibold text-ember-3">
                  Another date
                  <input
                    type="date"
                    min={today}
                    max={lastKey}
                    value={day}
                    onChange={(e) => e.target.value && e.target.value >= today && e.target.value <= lastKey && setDay(e.target.value)}
                    className="absolute inset-0 cursor-pointer opacity-0"
                    aria-label="Pick another date"
                  />
                </label>
              </div>
              <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1" role="radiogroup" aria-label="Day">
                {(dayKeys.includes(day) ? dayKeys : [...dayKeys, day]).map((k) => {
                  const selected = k === day;
                  const rel = relativeDay(k, now);
                  const [wk, rest] = formatDayKey(k).split(', ');
                  return (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setDay(k)}
                      className={cn(
                        'flex h-16 w-[68px] shrink-0 flex-col items-center justify-center rounded-2xl border text-center transition active:scale-95',
                        selected ? 'border-ink bg-ink text-paper' : 'border-line/10 bg-surface hover:bg-sunk',
                      )}
                    >
                      <span className={cn('font-mono text-[10.5px] uppercase tracking-[0.12em]', selected ? 'text-paper/70' : 'text-muted')}>
                        {rel === 'Today' || rel === 'Tomorrow' ? rel : wk}
                      </span>
                      <span className="mt-0.5 text-[14px] font-semibold tnum">{rest}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[13px] font-semibold text-fg/80">
                What time? <span className="font-normal text-muted">· {formatDayKey(day)}</span>
              </p>
              {grouped.length === 0 ? (
                <p className="rounded-2xl bg-sunk p-4 text-sm text-muted">
                  No times left on this day. Bookings need 30 minutes&apos; notice and fit inside opening hours{hoursText(restaurant) ? ` (${hoursText(restaurant)})` : ''}. Try another day.
                </p>
              ) : (
                <div className="grid gap-4" role="radiogroup" aria-label="Time">
                  {grouped.map((g) => (
                    <div key={g.group}>
                      <p className="mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">{g.group}</p>
                      <div className="grid grid-cols-4 gap-1.5">
                        {g.slots.map((s) => {
                          const selected = s === slot;
                          return (
                            <button
                              key={s}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              onClick={() => {
                                setSlot(s);
                                setError(null);
                              }}
                              className={cn(
                                'h-11 rounded-xl border text-[13px] font-semibold tnum transition active:scale-95',
                                selected ? 'border-ember bg-ember text-white' : 'border-line/10 bg-surface hover:bg-sunk',
                              )}
                            >
                              {formatIstTime(s).replace(' ', ' ')}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid gap-4">
              <Input label="Name" value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} autoComplete="name" placeholder="Who is the booking for?" error={nameError} />
              <Input
                label="Mobile number"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                prefix="+91"
                placeholder="98450 12345"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^\d\s+-]/g, '').slice(0, 16))}
                onBlur={() => phone.trim() && setTouched(true)}
                hint="The restaurant uses it to confirm your table."
                error={phoneError}
                className="pl-12 tnum"
              />
              <Textarea
                label="Anything we should know? (optional)"
                placeholder="Birthday, high chair, a quiet corner…"
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 300))}
                rows={2}
                className="min-h-[72px]"
              />
            </div>

            {error && (
              <p className="flex items-start gap-2 rounded-2xl bg-rose-soft p-3.5 text-[13.5px] text-[#a1282c]" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0">{error}</span>
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Sheet>
  );
}
