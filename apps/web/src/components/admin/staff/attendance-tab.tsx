'use client';

import * as React from 'react';
import { Clock, LogIn, LogOut, Timer } from 'lucide-react';
import { toast } from 'sonner';
import type { StaffShift } from '@restaurant-os/shared';
import { STAFF_ROLE_LABEL } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Input, Skeleton } from '@/components/ui';
import { useAdmin } from '../admin-provider';
import { Chip, ChipRow } from '../page-header';
import { errorMessage } from '../format';
import { isManagerRole } from '../plan';
import { useNow } from '../use-now';
import { addDays, dayLabel, istKey, istStartOfKey, istToday } from '../finance/ist';
import { ErrorNote } from '../finance/ui';
import { announceShift, clockTime, decimalHours, durationLabel, onShiftChange, shiftHours } from './shift';

type RangeId = 'week' | 'last_week' | '14d';
const RANGES: Array<{ id: RangeId; label: string }> = [
  { id: 'week', label: 'This week' },
  { id: 'last_week', label: 'Last week' },
  { id: '14d', label: '14 days' },
];

/** Monday of the IST week containing `key`. */
function mondayOf(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const dow = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay();
  return addDays(key, -((dow + 6) % 7));
}

function rangeFor(id: RangeId): { from: string; to: string; label: string } {
  const today = istToday();
  const monday = mondayOf(today);
  const toIso = (key: string) => new Date(istStartOfKey(key)).toISOString();
  switch (id) {
    case 'week':
      return { from: toIso(monday), to: toIso(addDays(today, 1)), label: `${dayLabel(monday, { weekday: false })} – today` };
    case 'last_week':
      return { from: toIso(addDays(monday, -7)), to: toIso(monday), label: `${dayLabel(addDays(monday, -7), { weekday: false })} – ${dayLabel(addDays(monday, -1), { weekday: false })}` };
    case '14d':
      return { from: toIso(addDays(today, -13)), to: toIso(addDays(today, 1)), label: `${dayLabel(addDays(today, -13), { weekday: false })} – today` };
  }
}

export function AttendanceTab() {
  const { token, staff: me } = useAdmin();
  const manager = isManagerRole(me.role);
  const now = useNow(60_000);
  const [range, setRange] = React.useState<RangeId>('week');
  const [shifts, setShifts] = React.useState<StaffShift[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [myShift, setMyShift] = React.useState<StaffShift | null | undefined>(undefined);
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const req = React.useRef(0);
  const r = rangeFor(range);

  const load = React.useCallback(async () => {
    const id = ++req.current;
    const { from, to } = rangeFor(range);
    try {
      const rows = await adminApi.attendance(token, { from, to });
      if (id !== req.current) return;
      setShifts(rows);
      setError(null);
    } catch (e) {
      if (id !== req.current) return;
      setError(errorMessage(e, 'Could not load the timesheet.'));
      setShifts((s) => s ?? []);
    }
  }, [token, range]);

  React.useEffect(() => {
    setShifts(null);
    void load();
  }, [load]);

  React.useEffect(() => {
    let cancelled = false;
    adminApi
      .myShift(token)
      .then((res) => !cancelled && setMyShift(res.open_shift))
      .catch(() => !cancelled && setMyShift(null));
    const off = onShiftChange((s) => {
      setMyShift(s);
      void load();
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [token, load]);

  const toggle = async () => {
    setBusy(true);
    try {
      if (myShift) {
        const done = await adminApi.clockOut(token, note.trim() || undefined);
        setMyShift(null);
        announceShift(null);
        toast.success(`Clocked out. ${durationLabel(shiftHours(done))} on this shift.`);
      } else {
        const started = await adminApi.clockIn(token, note.trim() || undefined);
        setMyShift(started);
        announceShift(started);
        toast.success(`Clocked in at ${clockTime(started.clock_in)}.`);
      }
      setNote('');
    } catch (e) {
      toast.error(errorMessage(e, myShift ? 'Could not clock out.' : 'Could not clock in.'));
      adminApi
        .myShift(token)
        .then((res) => setMyShift(res.open_shift))
        .catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  const totals = React.useMemo(() => {
    const m = new Map<string, { name: string; role: string | null; hours: number; shifts: number; open: boolean }>();
    for (const s of shifts ?? []) {
      const cur = m.get(s.staff_id) ?? {
        name: s.staff?.display_name ?? (s.staff_id === me.id ? me.display_name : 'Former staff'),
        role: s.staff?.role ? STAFF_ROLE_LABEL[s.staff.role] : null,
        hours: 0,
        shifts: 0,
        open: false,
      };
      cur.hours += shiftHours(s, now);
      cur.shifts += 1;
      cur.open = cur.open || !s.clock_out;
      m.set(s.staff_id, cur);
    }
    return [...m.entries()].sort((a, b) => b[1].hours - a[1].hours);
  }, [shifts, now, me.id, me.display_name]);

  const grandTotal = totals.reduce((h, [, t]) => h + t.hours, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card className="self-start">
          <CardHeader title="Your shift" description={`Signed in as ${me.display_name}.`} />
          <CardBody className="grid gap-4 pt-4">
            {myShift === undefined ? (
              <Skeleton className="h-20 w-full rounded-2xl" />
            ) : (
              <div className={cn('flex items-center gap-3 rounded-2xl px-4 py-4', myShift ? 'bg-mint-soft text-[#1b6f49]' : 'bg-sunk/70')}>
                <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', myShift ? 'bg-mint text-white' : 'bg-surface text-muted')} aria-hidden>
                  <Clock className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{myShift ? `On shift since ${clockTime(myShift.clock_in)}` : 'You are not clocked in'}</p>
                  <p className={cn('text-xs', myShift ? 'text-[#1b6f49]/80' : 'text-muted')}>
                    {myShift ? (
                      <>
                        <span className="tnum font-mono">{durationLabel(shiftHours(myShift, now))}</span> so far
                        {myShift.note ? ` · “${myShift.note}”` : ''}
                      </>
                    ) : (
                      'Clock in when you start work so your hours are recorded.'
                    )}
                  </p>
                </div>
              </div>
            )}
            <Input
              label="Note (optional)"
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
              placeholder={myShift ? 'e.g. Left early, covered by Ravi' : 'e.g. Covering the evening shift'}
              disabled={myShift === undefined}
            />
            <Button
              onClick={() => void toggle()}
              loading={busy}
              disabled={myShift === undefined}
              variant={myShift ? 'dark' : 'primary'}
              leftIcon={myShift ? <LogOut className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
              className="w-full sm:w-auto sm:justify-self-end"
            >
              {myShift ? 'Clock out' : 'Clock in'}
            </Button>
          </CardBody>
        </Card>

        <Card className="self-start">
          <CardHeader
            title={manager ? 'Hours by person' : 'Your hours'}
            description={r.label}
            action={
              shifts ? (
                <span className="tnum shrink-0 font-mono text-lg font-semibold">
                  {decimalHours(grandTotal)}
                  <span className="ml-1 text-xs font-normal text-muted">h</span>
                </span>
              ) : undefined
            }
          />
          <CardBody className="pt-4">
            {shifts === null ? (
              <div className="space-y-2">
                {[0, 1].map((i) => (
                  <Skeleton key={i} className="h-11 w-full rounded-xl" />
                ))}
              </div>
            ) : totals.length === 0 ? (
              <p className="text-sm text-muted">No shifts in this period.</p>
            ) : (
              <ul className="divide-y divide-line/10">
                {totals.map(([id, t]) => (
                  <li key={id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate text-sm font-medium">
                        {t.name}
                        {t.open && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mint" aria-label="On shift now" />}
                      </p>
                      <p className="text-xs text-muted">
                        {t.role ? `${t.role} · ` : ''}
                        {t.shifts} shift{t.shifts === 1 ? '' : 's'}
                      </p>
                    </div>
                    <span className="tnum font-mono text-[15px] font-semibold">{decimalHours(t.hours)} h</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Timesheet" description={manager ? 'Every clock-in and clock-out, newest first.' : 'Your clock-ins and clock-outs, newest first.'} />
        <CardBody className="pt-4">
          <ChipRow label="Period" className="mb-4">
            {RANGES.map((x) => (
              <Chip key={x.id} active={range === x.id} onClick={() => setRange(x.id)}>
                {x.label}
              </Chip>
            ))}
          </ChipRow>
          {error && <ErrorNote className="mb-3">{error}</ErrorNote>}
          {shifts === null ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-11 w-full rounded-xl" />
              ))}
            </div>
          ) : shifts.length === 0 ? (
            <EmptyState icon={<Timer className="h-5 w-5" />} title="No shifts in this period" description="Shifts appear here as soon as someone clocks in." className="py-10" />
          ) : (
            <>
              {/* Phones: stacked rows */}
              <ul className="divide-y divide-line/10 md:hidden">
                {shifts.map((s) => (
                  <li key={s.id} className="flex items-start gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      {manager && <p className="truncate text-sm font-semibold">{s.staff?.display_name ?? 'Former staff'}</p>}
                      <p className={cn('text-sm', manager && 'text-xs text-muted')}>{dayLabel(istKey(new Date(s.clock_in).getTime()))}</p>
                      <p className="tnum mt-0.5 font-mono text-xs text-muted">
                        {clockTime(s.clock_in)} → {s.clock_out ? clockTime(s.clock_out) : 'on shift'}
                      </p>
                      {s.note && <p className="mt-0.5 text-xs text-muted">“{s.note}”</p>}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tnum font-mono text-[15px] font-semibold">{decimalHours(shiftHours(s, now))}</p>
                      {!s.clock_out && (
                        <Badge tone="mint" dot className="mt-1">
                          On shift
                        </Badge>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {/* Tablet and up: table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-line/10 font-mono text-2xs uppercase tracking-[0.14em] text-muted">
                      {manager && <th className="py-2 pr-3 font-medium">Staff</th>}
                      <th className="py-2 pr-3 font-medium">Date</th>
                      <th className="py-2 pr-3 font-medium">In</th>
                      <th className="py-2 pr-3 font-medium">Out</th>
                      <th className="py-2 pr-3 font-medium">Note</th>
                      <th className="py-2 text-right font-medium">Hours</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line/5">
                    {shifts.map((s) => (
                      <tr key={s.id}>
                        {manager && (
                          <td className="py-2.5 pr-3">
                            <span className="font-medium">{s.staff?.display_name ?? 'Former staff'}</span>
                            {s.staff?.role && <span className="ml-1.5 text-xs text-muted">{STAFF_ROLE_LABEL[s.staff.role]}</span>}
                          </td>
                        )}
                        <td className="py-2.5 pr-3">{dayLabel(istKey(new Date(s.clock_in).getTime()))}</td>
                        <td className="tnum py-2.5 pr-3 font-mono">{clockTime(s.clock_in)}</td>
                        <td className="tnum py-2.5 pr-3 font-mono">
                          {s.clock_out ? (
                            <>
                              {clockTime(s.clock_out)}
                              {istKey(new Date(s.clock_out).getTime()) !== istKey(new Date(s.clock_in).getTime()) && <span className="ml-1 text-xs text-muted">next day</span>}
                            </>
                          ) : (
                            <Badge tone="mint" dot>
                              On shift
                            </Badge>
                          )}
                        </td>
                        <td className="max-w-[220px] truncate py-2.5 pr-3 text-muted" title={s.note ?? undefined}>
                          {s.note ?? ''}
                        </td>
                        <td className="tnum py-2.5 text-right font-mono font-semibold">{decimalHours(shiftHours(s, now))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {shifts.length >= 500 && <p className="mt-3 text-xs text-muted">Showing the latest 500 shifts in this period.</p>}
            </>
          )}
          <p className="mt-4 text-xs text-muted">Times are India time. Hours are decimal: 7.50 = 7 hours 30 minutes.</p>
        </CardBody>
      </Card>
    </div>
  );
}
