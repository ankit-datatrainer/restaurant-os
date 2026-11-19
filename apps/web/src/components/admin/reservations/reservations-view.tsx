'use client';

import * as React from 'react';
import { CalendarCheck, ExternalLink, Plus, RefreshCw } from 'lucide-react';
import type { Reservation, WaitlistEntry } from '@restaurant-os/shared';
import { planHas } from '@restaurant-os/shared';
import { Button } from '@/components/ui';
import { adminApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAdmin } from '../admin-provider';
import { PageHeader } from '../page-header';
import { StatTile } from '../stat-tile';
import { errorMessage } from '../format';
import { UpgradeCard, isPlanError } from '../plan';
import { BookingsTab } from './bookings-tab';
import { NewBookingSheet } from './new-booking-sheet';
import { WaitlistTab } from './waitlist-tab';
import { dayRange, istDateKey } from './shared';

const POLL_MS = 20_000;

const POINTS = [
  'Online booking requests from your restaurant page',
  'Confirm, seat, no-show and complete in one tap',
  'Double bookings on a table are refused',
  'Walk-in waitlist with “your table is ready” on WhatsApp',
];

type Tab = 'bookings' | 'waitlist';

export function ReservationsView() {
  const { restaurant } = useAdmin();
  if (!planHas(restaurant.plan, 'reservations')) {
    return (
      <div className="mx-auto w-full max-w-[1100px]">
        <PageHeader title="Reservations" description="Table bookings and the walk-in waitlist." />
        <UpgradeCard title="Fill tables without the phone tag" description="Reservations and the waitlist are part of the Growth plan." points={POINTS} />
      </div>
    );
  }
  return <ReservationsInner />;
}

const sortByTime = (a: Reservation, b: Reservation) => a.reserved_for.localeCompare(b.reserved_for);
const ACTIVE_WAIT = new Set<WaitlistEntry['status']>(['waiting', 'notified']);

function ReservationsInner() {
  const { token, restaurant, tables, refreshTables } = useAdmin();
  const [tab, setTab] = React.useState<Tab>('bookings');
  const [day, setDay] = React.useState(() => istDateKey(Date.now()));
  const [list, setList] = React.useState<Reservation[] | null>(null);
  const [upcoming, setUpcoming] = React.useState<Reservation[]>([]);
  const [waitlist, setWaitlist] = React.useState<WaitlistEntry[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [waitError, setWaitError] = React.useState<string | null>(null);
  const [locked, setLocked] = React.useState<string | null>(null);
  const [newOpen, setNewOpen] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const req = React.useRef(0);

  const loadBookings = React.useCallback(async () => {
    const id = ++req.current;
    try {
      const range = dayRange(day);
      const [dayList, up] = await Promise.all([
        adminApi.reservations(token, { from: range.from, to: range.to, status: 'all' }),
        adminApi.reservations(token, { status: 'upcoming' }),
      ]);
      if (id !== req.current) return;
      setList([...dayList].sort(sortByTime));
      setUpcoming(up);
      setError(null);
    } catch (e) {
      if (id !== req.current) return;
      if (isPlanError(e)) setLocked(e.message);
      else setError(errorMessage(e, 'Could not load bookings.'));
    } finally {
      if (id === req.current) setLoading(false);
    }
  }, [token, day]);

  const loadWaitlist = React.useCallback(async () => {
    try {
      setWaitlist(await adminApi.waitlist(token, 'active'));
      setWaitError(null);
    } catch (e) {
      if (isPlanError(e)) setLocked(e.message);
      else setWaitError(errorMessage(e, 'Could not load the waitlist.'));
    }
  }, [token]);

  React.useEffect(() => {
    setList(null);
    setLoading(true);
    void loadBookings();
  }, [loadBookings]);

  React.useEffect(() => {
    void loadWaitlist();
    void refreshTables().catch(() => undefined);
  }, [loadWaitlist, refreshTables]);

  // Every 20 seconds while the tab is visible, and straight away when it comes back.
  React.useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      void loadBookings();
      void loadWaitlist();
    };
    const id = window.setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [loadBookings, loadWaitlist]);

  const refreshAll = async () => {
    setRefreshing(true);
    await Promise.all([loadBookings(), loadWaitlist()]);
    setRefreshing(false);
  };

  /** Merge an updated booking into the day list and the counters without waiting for the next poll. */
  const onChanged = (r: Reservation) => {
    const inDay = istDateKey(new Date(r.reserved_for).getTime()) === day;
    setList((prev) => {
      if (!prev) return prev;
      const without = prev.filter((x) => x.id !== r.id);
      return inDay ? [...without, r].sort(sortByTime) : without;
    });
    setUpcoming((prev) => {
      const without = prev.filter((x) => x.id !== r.id);
      return r.status === 'requested' || r.status === 'confirmed' ? [...without, r] : without;
    });
  };

  const onWaitChanged = (e: WaitlistEntry) =>
    setWaitlist((prev) => (prev ?? []).map((x) => (x.id === e.id ? e : x)).filter((x) => ACTIVE_WAIT.has(x.status)));

  if (locked) {
    return (
      <div className="mx-auto w-full max-w-[1100px]">
        <PageHeader title="Reservations" />
        <UpgradeCard title="Fill tables without the phone tag" description="Reservations and the waitlist are part of the Growth plan." message={locked} points={POINTS} />
      </div>
    );
  }

  const today = istDateKey(Date.now());
  const requested = upcoming.filter((r) => r.status === 'requested').length;
  const confirmedToday = upcoming.filter((r) => r.status === 'confirmed' && istDateKey(new Date(r.reserved_for).getTime()) === today);
  const covers = confirmedToday.reduce((s, r) => s + r.party_size, 0);
  const waiting = waitlist?.length ?? 0;
  const pageUrl = `/r/${restaurant.slug}`;

  return (
    <div className="mx-auto w-full max-w-[1100px]">
      <PageHeader
        title="Reservations"
        description="Bookings by day and the walk-in waitlist. Times are India time."
        actions={
          <>
            <Button variant="outline" size="sm" loading={refreshing} leftIcon={<RefreshCw className="h-4 w-4" />} onClick={() => void refreshAll()}>
              Refresh
            </Button>
            {restaurant.reservations_enabled && (
              <Button variant="ghost" size="sm" href={pageUrl} external rightIcon={<ExternalLink className="h-3.5 w-3.5" />}>
                Booking page
              </Button>
            )}
            <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setNewOpen(true)}>
              New booking
            </Button>
          </>
        }
      />

      {!restaurant.reservations_enabled && (
        <p className="mb-4 rounded-2xl bg-sky-soft px-4 py-3 text-sm text-[#245a9f]">
          Online booking requests are off, so guests cannot book from your restaurant page. You can still add bookings here. Turn them on in Settings.
        </p>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatTile label="Requests to answer" value={requested} tone={requested > 0 ? 'ember' : 'neutral'} hint={requested > 0 ? 'Confirm or decline them' : 'All answered'} loading={loading && list === null} />
        <StatTile label="Confirmed covers today" value={covers} tone="sky" hint={`${confirmedToday.length} ${confirmedToday.length === 1 ? 'booking' : 'bookings'}`} loading={loading && list === null} />
        <StatTile
          className="col-span-2 md:col-span-1"
          label="Waiting now"
          value={waiting}
          tone={waiting > 0 ? 'saffron' : 'neutral'}
          hint={waiting > 0 ? 'Walk-ins on the waitlist' : 'Nobody waiting'}
          loading={waitlist === null}
        />
      </div>

      <div className="mb-5 inline-flex rounded-full border border-line/15 bg-surface p-1" role="tablist" aria-label="Reservations">
        {(
          [
            ['bookings', 'Bookings', requested],
            ['waitlist', 'Waitlist', waiting],
          ] as Array<[Tab, string, number]>
        ).map(([id, label, n]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              'inline-flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-semibold transition',
              tab === id ? 'bg-ink text-paper' : 'text-fg/70 hover:text-fg',
            )}
          >
            {id === 'bookings' && <CalendarCheck className="h-4 w-4" aria-hidden />}
            {label}
            {n > 0 && <span className={cn('rounded-full px-1.5 font-mono text-2xs tnum', tab === id ? 'bg-white/20' : 'bg-ember text-white')}>{n}</span>}
          </button>
        ))}
      </div>

      <div role="tabpanel">
        {tab === 'bookings' ? (
          <BookingsTab
            day={day}
            onDay={setDay}
            list={list}
            loading={loading}
            error={error}
            onChanged={onChanged}
            onNew={() => setNewOpen(true)}
            onRetry={() => void loadBookings()}
          />
        ) : (
          <WaitlistTab
            entries={waitlist}
            loading={waitlist === null}
            error={waitError}
            onChanged={onWaitChanged}
            onAdded={(e) => setWaitlist((prev) => [...(prev ?? []), e])}
            onRetry={() => void loadWaitlist()}
          />
        )}
      </div>

      <NewBookingSheet
        open={newOpen}
        onClose={() => setNewOpen(false)}
        defaultDate={day}
        tables={tables}
        onCreated={(r) => {
          onChanged(r);
          const key = istDateKey(new Date(r.reserved_for).getTime());
          if (key !== day) setDay(key);
        }}
      />
    </div>
  );
}
