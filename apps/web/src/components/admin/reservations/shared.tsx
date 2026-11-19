'use client';

import * as React from 'react';
import { Armchair, Check } from 'lucide-react';
import type { DiningTable, Reservation, ReservationStatus } from '@restaurant-os/shared';
import { RESERVATION_STATUS_LABEL } from '@restaurant-os/shared';
import { Badge, Button, Sheet } from '@/components/ui';
import { cn } from '@/lib/utils';
import { addDaysKey, formatDayKey, formatIstTime, istDateKey, istInstant } from '@/components/restaurant/hours';

export { addDaysKey, formatDayKey, formatIstTime, istDateKey, istInstant };

/** [from, to) ISO instants covering one IST day. */
export function dayRange(key: string): { from: string; to: string } {
  return { from: new Date(istInstant(key, 0)).toISOString(), to: new Date(istInstant(addDaysKey(key, 1), 0)).toISOString() };
}

/** "Today", "Tomorrow", "Yesterday" or "Sat, 31 Oct" (IST). */
export function dayLabel(key: string, now: number = Date.now()): string {
  const today = istDateKey(now);
  if (key === today) return 'Today';
  if (key === addDaysKey(today, 1)) return 'Tomorrow';
  if (key === addDaysKey(today, -1)) return 'Yesterday';
  return formatDayKey(key);
}

/** "HH:MM" (IST) of an instant, for <input type="time">. */
export function istTimeValue(at: number): string {
  const d = new Date(at + 330 * 60_000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/** IST date key + "HH:MM" → ISO instant. */
export function istIso(key: string, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(istInstant(key, (h ?? 0) * 60 + (m ?? 0))).toISOString();
}

export const STATUS_TONE: Record<ReservationStatus, 'ember' | 'sky' | 'mint' | 'neutral' | 'rose' | 'saffron'> = {
  requested: 'ember',
  confirmed: 'sky',
  seated: 'mint',
  completed: 'neutral',
  cancelled: 'rose',
  no_show: 'saffron',
};

export function ReservationStatusBadge({ status }: { status: ReservationStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]} dot={status === 'requested' || status === 'seated'}>
      {RESERVATION_STATUS_LABEL[status]}
    </Badge>
  );
}

const SOURCE_LABEL: Record<Reservation['source'], string> = { online: 'Online', phone: 'Phone', staff: 'Staff' };

export function SourceBadge({ source }: { source: Reservation['source'] }) {
  return (
    <span className="inline-flex items-center rounded-full border border-line/15 px-2 py-0.5 font-mono text-2xs uppercase tracking-[0.12em] text-muted">
      {SOURCE_LABEL[source]}
    </span>
  );
}

/** "Table 4 · Patio · 4 seats" */
export function tableOptionLabel(t: Pick<DiningTable, 'label' | 'area' | 'seats'>): string {
  return [t.label, t.area, `${t.seats} seats`].filter(Boolean).join(' · ');
}

/**
 * Pick the table to seat a party at. Tables with enough seats come first; the current one is ticked.
 */
export function TablePickerSheet({
  open,
  onClose,
  tables,
  partySize,
  currentId,
  title,
  description,
  busyIds,
  onPick,
  picking,
}: {
  open: boolean;
  onClose: () => void;
  tables: DiningTable[];
  partySize: number;
  currentId?: string | null;
  title: string;
  description?: string;
  /** Tables already holding a seated party (shown, but marked). */
  busyIds?: Set<string>;
  onPick: (table: DiningTable) => void;
  picking?: boolean;
}) {
  const active = tables.filter((t) => t.is_active);
  const sorted = [...active].sort((a, b) => {
    const fitA = a.seats >= partySize ? 0 : 1;
    const fitB = b.seats >= partySize ? 0 : 1;
    return fitA - fitB || a.sort_order - b.sort_order || a.label.localeCompare(b.label, undefined, { numeric: true });
  });
  return (
    <Sheet open={open} onClose={onClose} title={title} description={description}>
      {sorted.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted">
          <p>No active tables yet.</p>
          <Button href="/admin/tables" variant="outline" size="sm" className="mt-4">
            Add tables
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {sorted.map((t) => {
            const fits = t.seats >= partySize;
            const current = t.id === currentId;
            const busy = busyIds?.has(t.id) && !current;
            return (
              <button
                key={t.id}
                type="button"
                disabled={picking}
                onClick={() => onPick(t)}
                className={cn(
                  'relative flex min-h-[76px] flex-col items-start rounded-2xl border p-3 text-left transition active:scale-[0.98] disabled:opacity-60',
                  current ? 'border-ink bg-ink text-paper' : 'border-line/10 bg-surface hover:border-line/30 hover:bg-sunk',
                )}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="truncate font-display text-[15px] font-semibold">{t.label}</span>
                  {current ? <Check className="h-4 w-4 shrink-0 text-ember" aria-hidden /> : <Armchair className={cn('h-4 w-4 shrink-0', fits ? 'text-muted' : 'text-rose')} aria-hidden />}
                </span>
                {t.area && <span className={cn('mt-0.5 truncate text-[12px]', current ? 'text-paper/65' : 'text-muted')}>{t.area}</span>}
                <span className={cn('mt-auto pt-1 font-mono text-2xs uppercase tracking-[0.12em]', current ? 'text-paper/65' : fits ? 'text-muted' : 'text-rose')}>
                  {t.seats} seats{!fits ? ' · small' : ''}
                  {busy ? ' · occupied' : ''}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}

/** Ticks every `ms` for live waiting times. */
export function useTick(ms: number): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}
