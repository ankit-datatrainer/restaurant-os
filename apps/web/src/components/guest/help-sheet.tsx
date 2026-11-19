'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Check, ConciergeBell, GlassWater, MessageCircle, Receipt, Utensils, type LucideIcon } from 'lucide-react';
import type { CallType } from '@restaurant-os/shared';
import { CALL_TYPES, CALL_TYPE_LABEL, STARTER_CALL_TYPES } from '@restaurant-os/shared';
import { Button, Sheet, Textarea } from '@/components/ui';
import { publicApi } from '@/lib/api';
import { cn, timeAgo } from '@/lib/utils';
import { allCallsOn } from './features';
import { useTable } from './table-provider';
import { callStateOf, useSessionCalls } from './use-session-calls';

const ICONS: Record<CallType, LucideIcon> = {
  waiter: ConciergeBell,
  water: GlassWater,
  cutlery: Utensils,
  bill: Receipt,
  other: MessageCircle,
};

const HINT: Record<CallType, string> = {
  waiter: 'Someone will come over',
  water: 'Still or regular',
  cutlery: 'Spoons, forks, tissues',
  bill: 'Bring it to the table',
  other: 'Tell us what you need',
};

const SENT_COPY: Record<CallType, string> = {
  waiter: 'Sent. The staff can see your request',
  water: 'Water requested',
  cutlery: 'Cutlery requested',
  bill: 'Bill requested',
  other: 'Sent to the staff',
};

/**
 * "Call a waiter" sheet. Each tile shows what the server says about that request: still open
 * ("Requested · 2 min ago", tappable again, the server de-duplicates) or picked up by the staff in
 * the last 10 minutes ("On the way ✓"). Starter restaurants get the two essentials only.
 */
export function HelpSheet({
  open,
  onClose,
  code,
  guestSessionId,
}: {
  open: boolean;
  onClose: () => void;
  code: string;
  guestSessionId: string | null;
}) {
  const { data } = useTable();
  const { calls, refresh } = useSessionCalls();
  const [busy, setBusy] = React.useState<CallType | null>(null);
  const [otherOpen, setOtherOpen] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [now, setNow] = React.useState(() => Date.now());

  // Fresh state each time the sheet opens; keep the "2 min ago" labels moving while it is open.
  React.useEffect(() => {
    if (!open) return;
    setOtherOpen(false);
    setNote('');
    setNow(Date.now());
    void refresh();
    const t = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, [open, refresh]);

  // Until the restaurant loads, show the Starter set: never offer a request the plan does not include.
  const types: readonly CallType[] = allCallsOn(data?.restaurant) ? CALL_TYPES : STARTER_CALL_TYPES;

  const send = async (type: CallType, text?: string) => {
    if (busy) return;
    setBusy(type);
    try {
      await publicApi.createCall({
        table_code: code,
        guest_session_id: guestSessionId ?? undefined,
        type,
        note: text && text.trim() ? text.trim() : undefined,
      });
      toast.success(SENT_COPY[type]);
      setOtherOpen(false);
      setNote('');
      await refresh();
      setNow(Date.now());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not reach the staff. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Need a hand?" description="Tap once. The staff see it on their screen straight away.">
      <div className="grid grid-cols-2 gap-3 pb-2" role="group" aria-label="Request types">
        {types.map((t) => {
          const Icon = ICONS[t];
          const state = callStateOf(calls, t, now);
          const requested = state?.kind === 'open';
          const coming = state?.kind === 'attended';
          const loading = busy === t;
          const selectedOther = t === 'other' && otherOpen;
          const status = loading
            ? 'Sending…'
            : state?.kind === 'open'
              ? `Requested · ${timeAgo(state.since, now)}`
              : coming
                ? 'On the way ✓'
                : HINT[t];
          return (
            <button
              key={t}
              type="button"
              disabled={Boolean(busy)}
              onClick={() => {
                if (t === 'other') setOtherOpen((v) => !v);
                else void send(t);
              }}
              aria-pressed={t === 'other' ? selectedOther : undefined}
              aria-label={`${CALL_TYPE_LABEL[t]}. ${status}`}
              className={cn(
                'flex min-h-[96px] flex-col items-start justify-between rounded-2xl border p-4 text-left transition-[transform,background-color,border-color] duration-200 active:scale-[0.97] disabled:active:scale-100',
                selectedOther
                  ? 'border-ink bg-ink text-paper'
                  : coming
                    ? 'border-mint/40 bg-mint-soft text-[#1b6f49]'
                    : requested
                      ? 'border-saffron/50 bg-saffron-soft text-[#6e4700]'
                      : 'border-line/10 bg-surface text-fg hover:bg-sunk',
                busy && !loading && 'opacity-60',
              )}
            >
              <span
                className={cn(
                  'relative flex h-9 w-9 items-center justify-center rounded-xl',
                  selectedOther ? 'bg-paper/15 text-paper' : coming ? 'bg-mint text-white' : requested ? 'bg-saffron text-ink' : 'bg-ember-soft text-ember',
                )}
              >
                {coming && !selectedOther ? (
                  <Check className="h-4 w-4" strokeWidth={3} aria-hidden />
                ) : (
                  <Icon className={cn('h-[18px] w-[18px]', loading && 'animate-pulse')} aria-hidden />
                )}
                {requested && !selectedOther && (
                  <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-saffron-soft bg-ember motion-safe:animate-pulse" aria-hidden />
                )}
              </span>
              <span className="mt-3" aria-hidden>
                <span className="block text-[15px] font-semibold leading-tight">{CALL_TYPE_LABEL[t]}</span>
                <span className={cn('mt-0.5 block text-xs', selectedOther ? 'text-paper/60' : coming || requested ? 'opacity-80' : 'text-muted')}>{status}</span>
              </span>
            </button>
          );
        })}
      </div>

      {calls && calls.some((c) => c.status === 'open') && (
        <p className="mt-2 text-[12px] text-muted">We will let you know here as soon as the staff pick your request up.</p>
      )}

      {otherOpen && types.includes('other') && (
        <form
          className="mt-3 grid gap-3 rounded-2xl bg-sunk p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void send('other', note);
          }}
        >
          <Textarea
            label="What do you need?"
            placeholder="A high chair, a candle, the Wi-Fi password…"
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 200))}
            rows={2}
            className="min-h-[72px] bg-surface"
            autoFocus
          />
          <Button type="submit" size="lg" loading={busy === 'other'} disabled={!note.trim()}>
            Send to staff
          </Button>
        </form>
      )}
    </Sheet>
  );
}
