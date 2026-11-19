'use client';

import * as React from 'react';
import { toast } from 'sonner';
import type { DiningTable, Reservation } from '@restaurant-os/shared';
import { normalizeIndianPhone } from '@restaurant-os/shared';
import { Button, Input, Select, Sheet, Textarea } from '@/components/ui';
import { adminApi } from '@/lib/api';
import { errorMessage } from '../format';
import { useAdmin } from '../admin-provider';
import { dayLabel, istIso, istTimeValue, tableOptionLabel } from './shared';

interface Draft {
  name: string;
  phone: string;
  party: string;
  date: string;
  time: string;
  duration: string;
  tableId: string;
  source: 'phone' | 'staff';
  note: string;
}

/** Next quarter hour from now, as "HH:MM" IST. */
function nextQuarter(now: number): string {
  return istTimeValue(Math.ceil((now + 5 * 60_000) / 900_000) * 900_000);
}

/**
 * Booking taken by staff (phone call or at the host stand). Goes in confirmed; a table is optional,
 * and the API refuses a table that is already booked for an overlapping time.
 */
export function NewBookingSheet({
  open,
  onClose,
  defaultDate,
  tables,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  defaultDate: string;
  tables: DiningTable[];
  onCreated: (r: Reservation) => void;
}) {
  const { token, restaurant } = useAdmin();
  const blank = React.useCallback(
    (): Draft => ({
      name: '',
      phone: '',
      party: '2',
      date: defaultDate,
      time: nextQuarter(Date.now()),
      duration: String(restaurant.reservation_minutes || 90),
      tableId: '',
      source: 'phone',
      note: '',
    }),
    [defaultDate, restaurant.reservation_minutes],
  );
  const [draft, setDraft] = React.useState<Draft>(blank);
  const [errors, setErrors] = React.useState<Partial<Record<keyof Draft, string>>>({});
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setDraft(blank());
      setErrors({});
      setServerError(null);
    }
  }, [open, blank]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Partial<Record<keyof Draft, string>> = {};
    if (!draft.name.trim()) next.name = 'Add the guest name.';
    const phone = normalizeIndianPhone(draft.phone);
    if (!phone) next.phone = 'Enter a 10-digit mobile number.';
    const party = Number(draft.party);
    if (!Number.isInteger(party) || party < 1 || party > 50) next.party = '1 to 50 guests.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) next.date = 'Pick a date.';
    if (!/^\d{2}:\d{2}$/.test(draft.time)) next.time = 'Pick a time.';
    const duration = Number(draft.duration);
    if (!Number.isInteger(duration) || duration < 15 || duration > 480) next.duration = '15 to 480 minutes.';
    setErrors(next);
    setServerError(null);
    if (Object.keys(next).length > 0 || !phone) return;
    setSaving(true);
    try {
      const created = await adminApi.createReservation(token, {
        customer_name: draft.name.trim(),
        phone,
        party_size: party,
        reserved_for: istIso(draft.date, draft.time),
        duration_minutes: duration,
        table_id: draft.tableId || null,
        source: draft.source,
        note: draft.note.trim() || null,
      });
      toast.success(`Booked: ${created.customer_name}, ${created.party_size} ${created.party_size === 1 ? 'guest' : 'guests'}`);
      onCreated(created);
      onClose();
    } catch (err) {
      setServerError(errorMessage(err, 'Could not save the booking.'));
    } finally {
      setSaving(false);
    }
  };

  const activeTables = tables.filter((t) => t.is_active);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      side="right"
      title="New booking"
      description="Taken by phone or at the door. It is saved as confirmed."
      footer={
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button className="flex-1" type="submit" form="new-booking-form" loading={saving}>
            Save booking
          </Button>
        </div>
      }
    >
      <form id="new-booking-form" onSubmit={submit} className="grid gap-4" noValidate>
        <Input label="Guest name" value={draft.name} onChange={(e) => set('name', e.target.value.slice(0, 80))} error={errors.name} autoComplete="off" />
        <Input
          label="Mobile number"
          type="tel"
          inputMode="numeric"
          prefix="+91"
          placeholder="98450 12345"
          value={draft.phone}
          onChange={(e) => set('phone', e.target.value.replace(/[^\d\s+-]/g, '').slice(0, 16))}
          error={errors.phone}
          className="pl-12 tnum"
        />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Guests" type="number" inputMode="numeric" min={1} max={50} value={draft.party} onChange={(e) => set('party', e.target.value)} error={errors.party} className="tnum" />
          <Select label="Taken by" value={draft.source} onChange={(e) => set('source', e.target.value as Draft['source'])}>
            <option value="phone">Phone call</option>
            <option value="staff">At the door</option>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Date" type="date" value={draft.date} onChange={(e) => set('date', e.target.value)} error={errors.date} hint={draft.date ? dayLabel(draft.date) : undefined} />
          <Input label="Time" type="time" step={900} value={draft.time} onChange={(e) => set('time', e.target.value)} error={errors.time} className="tnum" />
        </div>
        <Input
          label="Length (minutes)"
          type="number"
          inputMode="numeric"
          min={15}
          max={480}
          step={15}
          value={draft.duration}
          onChange={(e) => set('duration', e.target.value)}
          error={errors.duration}
          hint="How long the table is held. Default comes from Settings."
          className="tnum"
        />
        <Select label="Table (optional)" value={draft.tableId} onChange={(e) => set('tableId', e.target.value)} hint="You can also assign it later.">
          <option value="">Assign later</option>
          {activeTables.map((t) => (
            <option key={t.id} value={t.id}>
              {tableOptionLabel(t)}
            </option>
          ))}
        </Select>
        <Textarea label="Note (optional)" value={draft.note} onChange={(e) => set('note', e.target.value.slice(0, 300))} rows={2} className="min-h-[72px]" placeholder="Birthday, high chair, window seat…" />
        {serverError && (
          <p className="rounded-xl bg-rose-soft px-3.5 py-2.5 text-sm text-[#a1282c]" role="alert">
            {serverError}
          </p>
        )}
      </form>
    </Sheet>
  );
}
