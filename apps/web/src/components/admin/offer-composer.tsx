'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, CircleAlert, CircleCheck, Download, Info, MessageCircle, RotateCcw, Send, Zap } from 'lucide-react';
import { toast } from 'sonner';
import type { CustomerSegment, CustomerSummary, IntegrationSettings } from '@restaurant-os/shared';
import { formatIndianPhone, planHas, whatsappLink } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button, Select, Sheet, Skeleton, Textarea } from '@/components/ui';
import { useAdmin } from './admin-provider';
import { useConfirm } from './confirm-dialog';
import { customerName, downloadCsv, firstName, lastVisitAt, offerMessage, shortDate, unsubscribeUrl } from './crm';
import { errorMessage } from './format';
import { isManagerRole, isPlanError } from './plan';
import { JOURNEYS, whatsappReady } from './whatsapp-templates';

type Audience = 'opted_in' | 'repeat' | 'lapsed';

const AUDIENCES: Array<{ id: Audience; label: string; segment: CustomerSegment; empty: string }> = [
  {
    id: 'opted_in',
    label: 'All opted-in',
    segment: 'opted_in',
    empty: 'Nobody has opted in yet. Customers are added here when they tick the WhatsApp box at checkout.',
  },
  {
    id: 'repeat',
    label: 'Repeat customers (opted-in)',
    segment: 'repeat',
    empty: 'None of your repeat customers (2+ visits) has opted in to WhatsApp offers yet.',
  },
  {
    id: 'lapsed',
    label: 'Not seen in 30 days (opted-in)',
    segment: 'lapsed',
    empty: 'Every opted-in customer has visited in the last 30 days, or nobody in this group has opted in.',
  },
];

const MAX_MESSAGE = 700;
/** The offer template's {{2}} variable (API limit). */
const MAX_OFFER = 500;
/** The API sends to at most this many customers per broadcast. */
const MAX_BROADCAST = 200;

type Mode = 'manual' | 'auto';

function defaultTemplate(restaurantName: string): string {
  return `Hi {name}, it's ${restaurantName} here. This week: [write your offer here]. Show this message at the counter to claim it. See you soon!`;
}

/**
 * Compose one offer and open it in WhatsApp for each opted-in customer, one at a time.
 * Consent is enforced here as well as on the server: only `marketing_consent` customers are listed.
 */
export function OfferComposer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { token, restaurant, staff } = useAdmin();
  const { confirm, dialog } = useConfirm();
  const premiumWhatsApp = planHas(restaurant.plan, 'whatsapp_automation');
  const [waSettings, setWaSettings] = React.useState<IntegrationSettings | null>(null);
  const [mode, setMode] = React.useState<Mode>('manual');
  const [offerText, setOfferText] = React.useState('');
  const [broadcasting, setBroadcasting] = React.useState(false);
  const [broadcast, setBroadcast] = React.useState<{ audience: number; sent: number; failed: number; errors: string[] } | null>(null);
  const [broadcastError, setBroadcastError] = React.useState<string | null>(null);
  const confirming = React.useRef(false);
  const [template, setTemplate] = React.useState(() => defaultTemplate(restaurant.name));
  const [audience, setAudience] = React.useState<Audience>('opted_in');
  const [pool, setPool] = React.useState<CustomerSummary[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [opened, setOpened] = React.useState<Set<string>>(() => new Set());
  const requestId = React.useRef(0);

  const meta = AUDIENCES.find((a) => a.id === audience)!;

  React.useEffect(() => {
    if (!open) return;
    const id = ++requestId.current;
    setPool(null);
    setError(null);
    adminApi
      .customers(token, { segment: meta.segment })
      .then((res) => {
        if (id === requestId.current) setPool(res.customers);
      })
      .catch((e: unknown) => {
        if (id !== requestId.current) return;
        setError(isPlanError(e) ? e.message : errorMessage(e, 'Could not load the audience.'));
        setPool([]);
      });
  }, [open, token, meta.segment]);

  // Premium: can this restaurant send the offer template automatically? (Integrations are owner/manager
  // only, so for other roles the request fails and the automatic mode simply stays hidden.)
  React.useEffect(() => {
    if (!open || !premiumWhatsApp) return;
    let cancelled = false;
    adminApi
      .integrations(token)
      .then((s) => {
        if (!cancelled) setWaSettings(s);
      })
      .catch(() => {
        if (!cancelled) setWaSettings(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, premiumWhatsApp, token]);

  const autoAvailable = premiumWhatsApp && whatsappReady(waSettings) && !!waSettings?.wa_template_offer;
  const activeMode: Mode = autoAvailable ? mode : 'manual';

  React.useEffect(() => {
    setBroadcast(null);
    setBroadcastError(null);
  }, [audience, activeMode]);

  // Always intersect with consent, whatever the segment returned.
  const recipients = React.useMemo(() => (pool ?? []).filter((c) => c.marketing_consent === true), [pool]);
  const openedHere = recipients.filter((c) => opened.has(c.id)).length;
  const trimmed = template.trim();
  const tooLong = template.length > MAX_MESSAGE;
  const canSend = trimmed.length > 0 && !tooLong;

  const sample: Pick<CustomerSummary, 'name' | 'unsubscribe_token'> = recipients[0] ?? { name: 'Asha', unsubscribe_token: 'your-link' };
  const preview = canSend ? offerMessage(template, sample) : '';

  const markOpened = (id: string) =>
    setOpened((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });

  const offerTrimmed = offerText.trim();
  const offerTooLong = offerText.length > MAX_OFFER;
  const tooMany = recipients.length > MAX_BROADCAST;
  const canBroadcast = offerTrimmed.length > 0 && !offerTooLong && recipients.length > 0 && !tooMany && !broadcasting;
  const offerJourney = JOURNEYS.find((j) => j.kind === 'offer')!;
  const autoPreview = offerTrimmed
    ? offerJourney
        .suggested(restaurant.name)
        .replace('{{1}}', firstName(sample))
        .replace('{{2}}', offerTrimmed)
        .replace('{{3}}', unsubscribeUrl(sample.unsubscribe_token))
    : '';

  const sendBroadcast = async () => {
    if (!canBroadcast || !waSettings) return;
    confirming.current = true;
    const ok = await confirm({
      title: `Send this offer to ${recipients.length} customer${recipients.length === 1 ? '' : 's'}?`,
      description: (
        <>
          Every opted-in customer in “{meta.label}” gets your <span className="font-mono text-fg">{waSettings.wa_template_offer}</span> template on WhatsApp straight away. Meta bills the
          conversations to your WhatsApp Business account. This cannot be undone.
        </>
      ),
      confirmLabel: `Send to ${recipients.length}`,
    });
    confirming.current = false;
    if (!ok) return;
    setBroadcasting(true);
    setBroadcast(null);
    setBroadcastError(null);
    try {
      const res = await adminApi.whatsappBroadcast(token, { segment: meta.segment, message: offerTrimmed });
      setBroadcast(res);
      if (res.failed === 0) toast.success(`Offer sent to ${res.sent} customer${res.sent === 1 ? '' : 's'}.`);
      else toast.warning(`Sent ${res.sent}, ${res.failed} failed.`);
    } catch (e) {
      setBroadcastError(errorMessage(e, 'The offer could not be sent.'));
    } finally {
      setBroadcasting(false);
    }
  };

  const exportCsv = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(
      `whatsapp-offer-${audience}-${stamp}.csv`,
      ['Name', 'Phone', 'Visits', 'Last visit', 'Opted in on', 'Message', 'Unsubscribe link'],
      recipients.map((c) => [
        c.name ?? '',
        formatIndianPhone(c.phone),
        c.visits,
        shortDate(lastVisitAt(c)),
        c.consent_at ? shortDate(c.consent_at) : '',
        canSend ? offerMessage(template, c) : '',
        unsubscribeUrl(c.unsubscribe_token),
      ]),
    );
  };

  return (
    <>
    <Sheet
      open={open}
      onClose={() => {
        if (!confirming.current) onClose();
      }}
      side="right"
      title="Send an offer"
      description={activeMode === 'auto' ? 'Sent automatically through your WhatsApp Business account.' : 'One message, opened in WhatsApp for each customer.'}
    >
      <div className="space-y-5">
        {autoAvailable && (
          <div className="grid grid-cols-2 gap-1 rounded-full bg-sunk p-1" role="radiogroup" aria-label="How to send">
            {(
              [
                { id: 'manual', label: 'Open in WhatsApp', icon: <MessageCircle className="h-4 w-4" aria-hidden /> },
                { id: 'auto', label: 'Send automatically', icon: <Zap className="h-4 w-4" aria-hidden /> },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={activeMode === m.id}
                onClick={() => setMode(m.id)}
                className={cn(
                  'inline-flex h-9 items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold transition',
                  activeMode === m.id ? 'bg-surface text-fg shadow-soft' : 'text-muted hover:text-fg',
                )}
              >
                {m.icon}
                {m.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-start gap-2.5 rounded-2xl border border-sky/25 bg-sky-soft px-3.5 py-3 text-[13px] leading-relaxed text-[#245a9f]">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {activeMode === 'auto' ? (
            <p>
              Send automatically via WhatsApp: your approved offer template goes to every opted-in customer in the audience, at most {MAX_BROADCAST} at a time. Your text fills the template&apos;s{' '}
              <code className="font-mono">{'{{2}}'}</code>; the name and unsubscribe link are added for you.
            </p>
          ) : (
            <p>
              WhatsApp opens with your message typed in; you press send for each customer. Only customers who opted in are listed.
              {premiumWhatsApp && !autoAvailable && isManagerRole(staff.role) && (
                <>
                  {' '}
                  To send automatically instead,{' '}
                  <Link href="/admin/integrations" className="font-semibold underline underline-offset-2">
                    set up WhatsApp and an offer template in Integrations
                  </Link>
                  .
                </>
              )}
            </p>
          )}
        </div>

        {activeMode === 'auto' ? (
          <div className="grid gap-1.5">
            <Textarea
              label="Offer text"
              value={offerText}
              onChange={(e) => setOfferText(e.target.value)}
              className="min-h-[96px]"
              placeholder="20% off all mains this weekend. Show this message at the counter."
              error={offerTooLong ? `Keep it under ${MAX_OFFER} characters.` : undefined}
              hint="Becomes {{2}} in your offer template. Keep it to one or two sentences."
            />
            <p className={cn('tnum text-right font-mono text-xs text-muted', offerTooLong && 'text-rose')}>
              {offerText.length}/{MAX_OFFER}
            </p>
          </div>
        ) : (
        <div className="grid gap-1.5">
          <Textarea
            label="Message"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            className="min-h-[120px]"
            error={tooLong ? `Keep it under ${MAX_MESSAGE} characters.` : !trimmed ? 'Write a message first.' : undefined}
            hint="{name} becomes each customer's first name. The unsubscribe line is added automatically."
          />
          <div className="flex items-center justify-between text-xs text-muted">
            <button
              type="button"
              onClick={() => setTemplate(defaultTemplate(restaurant.name))}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 font-medium hover:bg-fg/5 hover:text-fg"
            >
              <RotateCcw className="h-3 w-3" aria-hidden /> Reset template
            </button>
            <span className={cn('tnum font-mono', tooLong && 'text-rose')}>
              {template.length}/{MAX_MESSAGE}
            </span>
          </div>
        </div>
        )}

        <Select label="Audience" value={audience} onChange={(e) => setAudience(e.target.value as Audience)}>
          {AUDIENCES.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </Select>

        <section aria-labelledby="offer-preview">
          <h3 id="offer-preview" className="eyebrow mb-2">
            Preview{recipients[0] ? ` · ${customerName(recipients[0])}` : ''}
          </h3>
          <div className="rounded-2xl bg-[#efe7dc] p-3">
            <div className="ml-auto max-w-[92%] rounded-2xl rounded-tr-md bg-[#d9fdd3] px-3.5 py-2.5 text-sm text-[#111b21] shadow-sm">
              {(activeMode === 'auto' ? autoPreview : preview) ? (
                <p className="whitespace-pre-line break-words leading-relaxed">{activeMode === 'auto' ? autoPreview : preview}</p>
              ) : (
                <p className="italic text-[#111b21]/50">Write a message to see the preview.</p>
              )}
            </div>
          </div>
          {activeMode === 'auto' && <p className="mt-1.5 text-xs text-muted">Shown with the suggested template text; guests see your approved template.</p>}
        </section>

        {activeMode === 'auto' && (
          <section aria-label="Send automatically" className="rounded-2xl bg-sunk/60 p-4">
            <Button className="w-full" loading={broadcasting} disabled={!canBroadcast} leftIcon={<Send className="h-4 w-4" />} onClick={() => void sendBroadcast()}>
              {pool === null ? 'Loading audience…' : `Send to ${recipients.length} customer${recipients.length === 1 ? '' : 's'}`}
            </Button>
            {tooMany && <p className="mt-2 text-xs text-rose">That is more than {MAX_BROADCAST} customers. Pick a smaller audience.</p>}
            {broadcastError && (
              <p className="mt-3 flex items-start gap-2 rounded-xl bg-rose-soft px-3.5 py-2.5 text-sm text-[#a1282c]" role="alert">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0 break-words">{broadcastError}</span>
              </p>
            )}
            {broadcast && (
              <div className={cn('mt-3 rounded-xl px-3.5 py-2.5 text-sm', broadcast.failed ? 'bg-saffron-soft text-[#8a5a00]' : 'bg-mint-soft text-[#1b6f49]')} role="status">
                <p className="flex flex-wrap items-center gap-x-2 font-medium">
                  <CircleCheck className="h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    <span className="tnum font-mono">{broadcast.sent}</span> sent · <span className="tnum font-mono">{broadcast.failed}</span> failed · audience{' '}
                    <span className="tnum font-mono">{broadcast.audience}</span>
                  </span>
                </p>
                {broadcast.errors.length > 0 && (
                  <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
                    {broadcast.errors.slice(0, 5).map((err, i) => (
                      <li key={i} className="break-words">
                        {err}
                      </li>
                    ))}
                    {broadcast.errors.length > 5 && <li>…and {broadcast.errors.length - 5} more. See Integrations → Message log.</li>}
                  </ul>
                )}
              </div>
            )}
          </section>
        )}

        <section aria-labelledby="offer-recipients">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 id="offer-recipients" className="eyebrow">
              Recipients{pool ? ` · ${recipients.length}` : ''}
            </h3>
            {recipients.length > 0 && (
              <span className="tnum rounded-full bg-mint-soft px-2.5 py-0.5 font-mono text-2xs font-medium uppercase tracking-[0.12em] text-[#1b6f49]" aria-live="polite">
                Opened {openedHere} of {recipients.length}
              </span>
            )}
          </div>

          {error && (
            <p className="mb-2 rounded-xl bg-rose-soft px-3.5 py-2.5 text-sm font-medium text-[#a1282c]" role="alert">
              {error}
            </p>
          )}

          {pool === null ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          ) : recipients.length === 0 ? (
            !error && <p className="rounded-xl bg-sunk px-3.5 py-3 text-sm text-fg/80">{meta.empty}</p>
          ) : (
            <>
              <ul className="divide-y divide-line/5 rounded-2xl border border-line/10">
                {recipients.map((c) => {
                  const done = opened.has(c.id);
                  return (
                    <li key={c.id} className="flex items-center gap-3 px-3.5 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className={cn('truncate text-sm font-medium', !c.name && 'text-muted')}>{customerName(c)}</p>
                        <p className="tnum truncate font-mono text-xs text-muted">{formatIndianPhone(c.phone)}</p>
                      </div>
                      {activeMode === 'auto' ? null : canSend ? (
                        <a
                          href={whatsappLink(c.phone, offerMessage(template, c))}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => markOpened(c.id)}
                          className={cn(
                            'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition',
                            done ? 'border border-line/15 text-fg/70 hover:bg-fg/5' : 'bg-[#1f9d55] text-white hover:bg-[#188247]',
                          )}
                          aria-label={`${done ? 'Open again' : 'Open in WhatsApp'}: ${customerName(c)}`}
                        >
                          {done ? <Check className="h-4 w-4" aria-hidden /> : <MessageCircle className="h-4 w-4" aria-hidden />}
                          {done ? 'Opened' : 'Open in WhatsApp'}
                        </a>
                      ) : (
                        <span className="shrink-0 text-xs text-muted">Write a message</span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted">{activeMode === 'auto' ? 'Everyone listed gets the template when you press Send.' : 'Opened links stay ticked while this page is open.'}</p>
                <Button variant="outline" size="sm" leftIcon={<Download className="h-4 w-4" />} onClick={exportCsv}>
                  Download CSV
                </Button>
              </div>
            </>
          )}
        </section>
      </div>
    </Sheet>
    {dialog}
    </>
  );
}
