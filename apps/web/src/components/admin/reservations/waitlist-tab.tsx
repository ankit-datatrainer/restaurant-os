'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { motion, useReducedMotion } from 'framer-motion';
import { BellRing, Clock, MessageCircle, Phone, UserPlus, Users } from 'lucide-react';
import type { WaitlistEntry } from '@restaurant-os/shared';
import { formatIndianPhone, minutesSince, normalizeIndianPhone, whatsappLink } from '@restaurant-os/shared';
import { Badge, Button, Card, EmptyState, Input, Skeleton } from '@/components/ui';
import { adminApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { fadeUp, stagger } from '@/lib/motion';
import { useAdmin } from '../admin-provider';
import { errorMessage, formatElapsed } from '../format';
import { TablePickerSheet, useTick } from './shared';

const QUOTES = [10, 15, 20, 30, 45];

function readyMessage(entry: WaitlistEntry, restaurantName: string): string {
  return `Hi ${entry.customer_name}, your table at ${restaurantName} is ready. Please come to the host stand in the next few minutes.`;
}

function AddWalkIn({ onAdded }: { onAdded: (e: WaitlistEntry) => void }) {
  const { token } = useAdmin();
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [party, setParty] = React.useState('2');
  const [quoted, setQuoted] = React.useState<number | null>(15);
  const [errors, setErrors] = React.useState<{ name?: string; phone?: string; party?: string }>({});
  const [saving, setSaving] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!name.trim()) next.name = 'Add a name to call out.';
    const normalized = phone.trim() ? normalizeIndianPhone(phone) : null;
    if (phone.trim() && !normalized) next.phone = '10-digit mobile, or leave it empty.';
    const size = Number(party);
    if (!Number.isInteger(size) || size < 1 || size > 50) next.party = '1 to 50.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      const created = await adminApi.addToWaitlist(token, {
        customer_name: name.trim(),
        phone: normalized ?? undefined,
        party_size: size,
        quoted_minutes: quoted,
      });
      onAdded(created);
      toast.success(`${created.customer_name} added to the waitlist`);
      setName('');
      setPhone('');
      setParty('2');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not add to the waitlist.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-4 md:p-5">
      <form onSubmit={submit} className="grid gap-3" noValidate>
        <p className="font-display text-base font-semibold">Add a walk-in</p>
        <div className="grid gap-3 sm:grid-cols-[1fr,1fr,96px]">
          <Input aria-label="Guest name" placeholder="Name" value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} error={errors.name} autoComplete="off" />
          <Input
            aria-label="Mobile number (optional)"
            type="tel"
            inputMode="numeric"
            prefix="+91"
            placeholder="Mobile (optional)"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/[^\d\s+-]/g, '').slice(0, 16))}
            error={errors.phone}
            className="pl-12 tnum"
          />
          <Input aria-label="Party size" type="number" inputMode="numeric" min={1} max={50} value={party} onChange={(e) => setParty(e.target.value)} error={errors.party} className="tnum" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Quoted wait">
          <span className="mr-1 text-[13px] text-muted">Quoted wait</span>
          {QUOTES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={quoted === m}
              onClick={() => setQuoted(m)}
              className={cn(
                'inline-flex h-9 items-center rounded-full border px-3 text-[13px] font-medium tnum transition',
                quoted === m ? 'border-ink bg-ink text-paper' : 'border-line/15 bg-surface hover:border-line/30',
              )}
            >
              {m} min
            </button>
          ))}
          <button
            type="button"
            role="radio"
            aria-checked={quoted === null}
            onClick={() => setQuoted(null)}
            className={cn(
              'inline-flex h-9 items-center rounded-full border px-3 text-[13px] font-medium transition',
              quoted === null ? 'border-ink bg-ink text-paper' : 'border-line/15 bg-surface hover:border-line/30',
            )}
          >
            Not quoted
          </button>
          <Button type="submit" size="sm" className="ml-auto" loading={saving} leftIcon={<UserPlus className="h-4 w-4" aria-hidden />}>
            Add to waitlist
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** Walk-in waitlist: live waiting time, Notify (WhatsApp click-to-chat), Seat at a table, Left. Polls every 20 s. */
export function WaitlistTab({ entries, loading, error, onChanged, onAdded, onRetry }: {
  entries: WaitlistEntry[] | null;
  loading: boolean;
  error: string | null;
  onChanged: (e: WaitlistEntry) => void;
  onAdded: (e: WaitlistEntry) => void;
  onRetry: () => void;
}) {
  const reduce = useReducedMotion();
  const { token, restaurant, tables } = useAdmin();
  const now = useTick(15_000);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [seating, setSeating] = React.useState<WaitlistEntry | null>(null);

  const update = async (entry: WaitlistEntry, body: Parameters<typeof adminApi.updateWaitlist>[2], success?: string) => {
    setBusyId(entry.id);
    try {
      const updated = await adminApi.updateWaitlist(token, entry.id, body);
      onChanged(updated);
      if (success) toast.success(success);
      return true;
    } catch (e) {
      toast.error(errorMessage(e, 'Could not update the waitlist.'));
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const list = entries ?? [];

  return (
    <div className="grid gap-4">
      <AddWalkIn onAdded={onAdded} />

      {error && !entries && (
        <EmptyState
          title="Could not load the waitlist"
          description={error}
          action={
            <Button variant="outline" onClick={onRetry}>
              Try again
            </Button>
          }
        />
      )}

      {entries === null && loading && (
        <div className="grid gap-3">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      )}

      {entries && list.length === 0 && (
        <EmptyState icon={<Users className="h-5 w-5" aria-hidden />} title="Nobody is waiting" description="When every table is taken, add walk-ins here and call them back with one tap." />
      )}

      {list.length > 0 && (
        <motion.ol className="grid gap-3" variants={stagger(0.04)} initial={reduce ? false : 'hidden'} animate="show">
          {list.map((e, i) => {
            const waited = minutesSince(e.created_at, now);
            const overdue = e.quoted_minutes !== null && waited > e.quoted_minutes;
            const busy = busyId === e.id;
            return (
              <motion.li key={e.id} variants={fadeUp}>
                <article className={cn('rounded-2xl border bg-surface p-4 shadow-soft md:p-5', e.status === 'notified' ? 'border-mint/40' : overdue ? 'border-saffron/50' : 'border-line/10')}>
                  <div className="flex items-start gap-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sunk font-mono text-sm font-semibold tnum text-fg/70" aria-label={`Position ${i + 1}`}>
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-display text-[17px] font-semibold leading-tight">{e.customer_name}</p>
                        {e.status === 'notified' ? (
                          <Badge tone="mint" dot>
                            Notified
                          </Badge>
                        ) : (
                          <Badge tone="neutral">Waiting</Badge>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
                        <span className="inline-flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5" aria-hidden />
                          <span className="tnum">{e.party_size}</span>
                        </span>
                        {e.phone && (
                          <a href={`tel:${e.phone}`} className="inline-flex min-h-[28px] items-center gap-1.5 hover:text-fg">
                            <Phone className="h-3.5 w-3.5" aria-hidden />
                            <span className="tnum">{formatIndianPhone(e.phone)}</span>
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={cn('inline-flex items-center gap-1.5 font-mono text-sm font-semibold tnum', overdue ? 'text-[#8a5a00]' : 'text-fg')}>
                        <Clock className="h-3.5 w-3.5" aria-hidden />
                        {formatElapsed(waited)}
                      </p>
                      <p className="mt-0.5 text-[12px] text-muted">{e.quoted_minutes !== null ? `quoted ${e.quoted_minutes} min` : 'not quoted'}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-line/10 pt-3">
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void update(e, { status: 'left' }, `${e.customer_name} removed: left`)}>
                      Left
                    </Button>
                    {e.phone ? (
                      <a
                        href={whatsappLink(e.phone, readyMessage(e, restaurant.name))}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => {
                          if (e.status !== 'notified') void update(e, { status: 'notified' });
                        }}
                        className="inline-flex h-9 items-center gap-2 rounded-full border border-mint/40 bg-mint-soft px-4 text-[13px] font-semibold text-[#1b6f49] transition hover:bg-mint/20"
                        title="Opens WhatsApp with “Your table is ready” typed in, and marks them notified"
                      >
                        <MessageCircle className="h-4 w-4" aria-hidden />
                        {e.status === 'notified' ? 'Message again' : 'Notify'}
                      </a>
                    ) : (
                      e.status !== 'notified' && (
                        <Button size="sm" variant="outline" disabled={busy} leftIcon={<BellRing className="h-4 w-4" aria-hidden />} onClick={() => void update(e, { status: 'notified' }, `${e.customer_name}: called`)}>
                          Mark called
                        </Button>
                      )
                    )}
                    <Button size="sm" variant="dark" loading={busy} onClick={() => setSeating(e)}>
                      Seat
                    </Button>
                  </div>
                </article>
              </motion.li>
            );
          })}
        </motion.ol>
      )}

      <TablePickerSheet
        open={seating !== null}
        onClose={() => setSeating(null)}
        tables={tables}
        partySize={seating?.party_size ?? 1}
        title={seating ? `Seat ${seating.customer_name}` : 'Seat'}
        description={seating ? `${seating.party_size} ${seating.party_size === 1 ? 'guest' : 'guests'} · pick their table` : undefined}
        picking={busyId !== null}
        onPick={async (t) => {
          if (!seating) return;
          const ok = await update(seating, { status: 'seated', table_id: t.id }, `${seating.customer_name} seated at ${t.label}`);
          if (ok) setSeating(null);
        }}
      />
    </div>
  );
}
