'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { QRCodeSVG } from 'qrcode.react';
import { ChevronRight, Copy, Gift, MessageCircle, Plus, Printer, Search, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import type { GiftCard, GiftCardTransaction } from '@restaurant-os/shared';
import { formatIndianPhone, normalizeIndianPhone, whatsappLink } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { cn, formatINR } from '@/lib/utils';
import { Badge, Button, EmptyState, Input, Sheet, Skeleton, Toggle } from '@/components/ui';
import { useAdmin } from '../admin-provider';
import { errorMessage } from '../format';
import {
  DataTable,
  ErrorNote,
  InfoNote,
  ListSkeleton,
  PillToggle,
  Td,
  Th,
  formatIst,
  formatIstDay,
  istEndOfDayIso,
  istToday,
  parseNum,
  useLastNonNull,
} from '../inventory/ops-shared';
import type { PromotionsContext } from './promotions-view';

type CardState = 'active' | 'used' | 'expired' | 'off';

function cardState(g: GiftCard, now: number = Date.now()): CardState {
  if (!g.is_active) return 'off';
  if (g.expires_at && new Date(g.expires_at).getTime() <= now) return 'expired';
  if (g.balance <= 0) return 'used';
  return 'active';
}

function CardStateBadge({ card }: { card: GiftCard }) {
  const s = cardState(card);
  if (s === 'active')
    return (
      <Badge tone="mint" dot>
        Active
      </Badge>
    );
  if (s === 'used') return <Badge tone="neutral">Used up</Badge>;
  if (s === 'expired') return <Badge tone="rose">Expired</Badge>;
  return <Badge tone="neutral">Off</Badge>;
}

export function GiftCardsTab({ ctx }: { ctx: PromotionsContext }) {
  const { token, canEdit, loadFailed } = ctx;
  const [q, setQ] = React.useState('');
  const [dq, setDq] = React.useState('');
  const [cards, setCards] = React.useState<GiftCard[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [fetching, setFetching] = React.useState(false);
  const [issuing, setIssuing] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [justIssued, setJustIssued] = React.useState<string | null>(null);
  const requestId = React.useRef(0);

  React.useEffect(() => {
    const t = window.setTimeout(() => setDq(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const load = React.useCallback(async () => {
    const id = ++requestId.current;
    setFetching(true);
    try {
      const res = await adminApi.giftCards(token, dq || undefined);
      if (id !== requestId.current) return;
      setCards(res);
      setError(null);
    } catch (e) {
      if (id !== requestId.current) return;
      setError(loadFailed(e, 'Could not load gift cards.'));
      setCards((p) => p ?? []);
    } finally {
      if (id === requestId.current) setFetching(false);
    }
  }, [token, dq, loadFailed]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const upsert = (row: GiftCard) =>
    setCards((prev) => {
      const l = prev ?? [];
      return l.some((x) => x.id === row.id) ? l.map((x) => (x.id === row.id ? row : x)) : [row, ...l];
    });

  const list = cards ?? [];
  const selected = list.find((c) => c.id === selectedId) ?? null;
  const outstanding = list.filter((c) => cardState(c) === 'active').reduce((s, c) => s + c.balance, 0);

  return (
    <div>
      <InfoNote className="mb-4">
        Gift cards are redeemed when you settle a bill: choose the payment method “Gift card” and enter the code. The balance goes down by what was used, and anything
        left stays on the card.
      </InfoNote>

      {error && <ErrorNote className="mb-4">{error}</ErrorNote>}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="sm:w-[300px]">
          <Input
            aria-label="Search gift cards by code or name"
            placeholder="Code or name…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            prefix={<Search className="h-4 w-4" />}
            className="h-10"
            inputMode="search"
          />
        </div>
        {!dq && list.length > 0 && (
          <p className="text-sm text-muted sm:flex-1">
            Unspent balance on active cards <span className="tnum font-mono font-semibold text-fg">{formatINR(outstanding)}</span>
          </p>
        )}
        {canEdit && (
          <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setIssuing(true)} className="self-start sm:ml-auto sm:self-auto">
            Issue gift card
          </Button>
        )}
      </div>

      <div className={cn('mt-4 transition-opacity', fetching && cards !== null && 'opacity-60')} aria-busy={fetching}>
        {cards === null ? (
          <ListSkeleton rows={4} />
        ) : list.length === 0 ? (
          <EmptyState
            icon={<Gift className="h-5 w-5" />}
            title={dq ? `No gift card matches “${dq}”` : 'No gift cards yet'}
            description={dq ? 'Search by part of the code or the name it was issued to.' : 'Sell gift cards at the counter or give them to regulars. Each one gets a code and a QR you can print or send.'}
            action={
              canEdit && !dq ? (
                <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setIssuing(true)}>
                  Issue a gift card
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <DataTable
              head={
                <tr>
                  <Th>Code</Th>
                  <Th right>Balance</Th>
                  <Th>Issued to</Th>
                  <Th>Expires</Th>
                  <Th>Status</Th>
                  <Th className="w-10" />
                </tr>
              }
            >
              {list.map((g) => (
                <tr key={g.id} className="cursor-pointer transition hover:bg-sunk/40" onClick={() => setSelectedId(g.id)}>
                  <Td>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(g.id);
                      }}
                      className="tnum rounded-md font-mono font-semibold tracking-[0.06em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
                      aria-label={`Open gift card ${g.code}`}
                    >
                      {g.code}
                    </button>
                  </Td>
                  <Td right className="tnum whitespace-nowrap font-mono">
                    <span className="font-semibold">{formatINR(g.balance)}</span>
                    <span className="text-muted"> / {formatINR(g.initial_value)}</span>
                  </Td>
                  <Td>
                    <span className={cn(!g.issued_to_name && 'text-muted')}>{g.issued_to_name ?? '—'}</span>
                    {g.issued_to_phone && <span className="tnum block font-mono text-xs text-muted">{formatIndianPhone(g.issued_to_phone)}</span>}
                  </Td>
                  <Td className="whitespace-nowrap text-muted">{g.expires_at ? formatIstDay(g.expires_at) : 'Never'}</Td>
                  <Td>
                    <CardStateBadge card={g} />
                  </Td>
                  <Td>
                    <ChevronRight className="h-4 w-4 text-muted" aria-hidden />
                  </Td>
                </tr>
              ))}
            </DataTable>

            <ul className="grid gap-2.5 md:grid-cols-2 lg:hidden">
              {list.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(g.id)}
                    className="flex w-full items-start gap-3 rounded-2xl border border-line/10 bg-surface p-4 text-left shadow-soft transition active:scale-[0.99]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="tnum truncate font-mono font-semibold tracking-[0.06em]">{g.code}</p>
                      <p className="mt-0.5 truncate text-sm text-muted">{g.issued_to_name ?? 'Not named'}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                        <CardStateBadge card={g} />
                        <span>{g.expires_at ? `expires ${formatIstDay(g.expires_at)}` : 'no expiry'}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="tnum font-mono text-base font-semibold">{formatINR(g.balance)}</span>
                      <span className="tnum font-mono text-xs text-muted">of {formatINR(g.initial_value)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <IssueSheet
        open={issuing}
        token={token}
        onClose={() => setIssuing(false)}
        onIssued={(card) => {
          upsert(card);
          setIssuing(false);
          setJustIssued(card.id);
          setSelectedId(card.id);
        }}
      />
      <GiftCardSheet
        card={selected}
        token={token}
        canEdit={canEdit}
        justIssued={!!selected && justIssued === selected.id}
        onClose={() => {
          setSelectedId(null);
          setJustIssued(null);
        }}
        onChanged={upsert}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Issue
// ---------------------------------------------------------------------------

const QUICK_AMOUNTS = [500, 1000, 2000, 5000];
const CODE_RE = /^[A-Z0-9_-]{3,20}$/;

interface IssueDraft {
  amount: string;
  name: string;
  phone: string;
  expires: string;
  code: string;
}

const EMPTY: IssueDraft = { amount: '', name: '', phone: '', expires: '', code: '' };

function IssueSheet({ open, token, onClose, onIssued }: { open: boolean; token: string; onClose: () => void; onIssued: (c: GiftCard) => void }) {
  const [draft, setDraft] = React.useState<IssueDraft>(EMPTY);
  const [errors, setErrors] = React.useState<Partial<Record<keyof IssueDraft, string>>>({});
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setDraft(EMPTY);
      setErrors({});
    }
  }, [open]);

  const set = <K extends keyof IssueDraft>(k: K, v: IssueDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Partial<Record<keyof IssueDraft, string>> = {};
    const amount = parseNum(draft.amount);
    if (amount === null || amount <= 0) next.amount = 'Enter the card value.';
    else if (amount > 100_000) next.amount = 'At most ₹1,00,000 per card.';
    const phone = draft.phone.trim();
    if (phone && !normalizeIndianPhone(phone)) next.phone = 'Enter a 10-digit Indian mobile number, or leave it empty.';
    const code = draft.code.trim().toUpperCase();
    if (code && !CODE_RE.test(code)) next.code = 'Use 3 to 20 letters, digits, - or _, or leave it empty.';
    const expires = draft.expires ? istEndOfDayIso(draft.expires) : null;
    if (draft.expires && !expires) next.expires = 'Pick a date.';
    else if (draft.expires && draft.expires < istToday()) next.expires = 'Pick today or a later date.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      const card = await adminApi.createGiftCard(token, {
        initial_value: Math.round((amount ?? 0) * 100) / 100,
        issued_to_name: draft.name.trim() || null,
        issued_to_phone: phone || undefined,
        expires_at: expires,
        code: code || undefined,
      });
      toast.success(`Gift card ${card.code} issued for ${formatINR(card.initial_value)}.`);
      onIssued(card);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not issue the gift card.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      side="right"
      title="Issue gift card"
      description="Collect the payment first. The card can be used straight away."
      className="md:max-w-lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="gift-issue-form" loading={saving} leftIcon={<Gift className="h-4 w-4" />}>
            Issue card
          </Button>
        </div>
      }
    >
      <form id="gift-issue-form" onSubmit={save} className="grid gap-4 pb-2" noValidate>
        <div>
          <Input
            label="Value"
            inputMode="decimal"
            prefix="₹"
            value={draft.amount}
            onChange={(e) => set('amount', e.target.value)}
            placeholder="1000"
            error={errors.amount}
            className="tnum font-mono text-lg"
            data-autofocus
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {QUICK_AMOUNTS.map((a) => (
              <PillToggle key={a} on={parseNum(draft.amount) === a} onClick={() => set('amount', String(a))} className="tnum font-mono">
                {formatINR(a)}
              </PillToggle>
            ))}
          </div>
        </div>
        <Input label="Issued to (optional)" value={draft.name} maxLength={80} onChange={(e) => set('name', e.target.value)} placeholder="Priya Sharma" />
        <Input
          label="Phone (optional)"
          type="tel"
          inputMode="tel"
          value={draft.phone}
          onChange={(e) => set('phone', e.target.value)}
          placeholder="98450 12345"
          error={errors.phone}
          hint="Lets you send the card on WhatsApp"
          className="tnum font-mono"
        />
        <Input label="Expires on (optional)" type="date" min={istToday()} value={draft.expires} onChange={(e) => set('expires', e.target.value)} error={errors.expires} hint="Leave empty for no expiry" />
        <Input
          label="Code (optional)"
          value={draft.code}
          maxLength={20}
          onChange={(e) => set('code', e.target.value.toUpperCase().replace(/\s+/g, ''))}
          placeholder="Leave empty to generate GIFT-XXXX-XXXX"
          error={errors.code}
          className="tnum font-mono uppercase tracking-[0.06em]"
          autoComplete="off"
          spellCheck={false}
        />
      </form>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Detail: printable card, share, history, switch off
// ---------------------------------------------------------------------------

const PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 14mm; }
  html, body { background: #fff !important; }
  body > *:not(.gift-print-root) { display: none !important; }
  .gift-print-root { display: block !important; }
}
`;

function GiftCardVisual({ card, restaurantName, className }: { card: GiftCard; restaurantName: string; className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-3xl bg-ink p-5 text-paper', className)}>
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-ember/25 blur-3xl" aria-hidden />
      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-2xs uppercase tracking-[0.18em] text-paper/60">Gift card</p>
          <p className="mt-1 truncate font-display text-lg font-semibold leading-tight">{restaurantName}</p>
          <p className="tnum mt-3 font-mono text-[28px] font-semibold leading-none">{formatINR(card.initial_value)}</p>
          {card.issued_to_name && <p className="mt-2 truncate text-sm text-paper/75">For {card.issued_to_name}</p>}
        </div>
        <div className="shrink-0 rounded-2xl bg-white p-2">
          <QRCodeSVG value={card.code} size={96} level="M" marginSize={0} bgColor="#ffffff" fgColor="#0C0D10" aria-label={`QR code for ${card.code}`} />
        </div>
      </div>
      <p className="tnum relative mt-5 break-all font-mono text-2xl font-semibold tracking-[0.12em] sm:text-[26px]">{card.code}</p>
      <p className="relative mt-2 text-xs text-paper/60">
        {card.expires_at ? `Valid until ${formatIstDay(card.expires_at)}. ` : ''}Show this code when you pay the bill.
      </p>
    </div>
  );
}

function shareText(card: GiftCard, restaurantName: string): string {
  const lines = [
    `${card.issued_to_name ? `Hi ${card.issued_to_name}, here` : 'Here'} is your ${restaurantName} gift card worth ${formatINR(card.initial_value)}.`,
    `Code: ${card.code}`,
  ];
  if (card.expires_at) lines.push(`Valid until ${formatIstDay(card.expires_at)}.`);
  lines.push('Show this code when you pay your bill.');
  return lines.join('\n');
}

function GiftCardSheet({
  card: target,
  token,
  canEdit,
  justIssued,
  onClose,
  onChanged,
}: {
  card: GiftCard | null;
  token: string;
  canEdit: boolean;
  justIssued: boolean;
  onClose: () => void;
  onChanged: (c: GiftCard) => void;
}) {
  const { restaurant } = useAdmin();
  const card = useLastNonNull(target);
  const [txns, setTxns] = React.useState<GiftCardTransaction[] | null>(null);
  const [txError, setTxError] = React.useState<string | null>(null);
  const [toggling, setToggling] = React.useState(false);
  const [canShare, setCanShare] = React.useState(false);

  React.useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  const openId = target?.id ?? null;
  React.useEffect(() => {
    if (!openId) return;
    let cancelled = false;
    setTxns(null);
    setTxError(null);
    adminApi
      .giftCardTransactions(token, openId)
      .then((t) => {
        if (!cancelled) setTxns(t);
      })
      .catch((e) => {
        if (!cancelled) {
          setTxError(errorMessage(e, 'Could not load the card history.'));
          setTxns([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [openId, token, target?.balance]);

  if (!card) return null;

  const text = shareText(card, restaurant.name);
  const phone = card.issued_to_phone ? normalizeIndianPhone(card.issued_to_phone) ?? card.issued_to_phone : null;

  const setActive = async (v: boolean) => {
    setToggling(true);
    try {
      const row = await adminApi.updateGiftCard(token, card.id, { is_active: v });
      onChanged(row);
      toast.success(v ? `${card.code} switched back on.` : `${card.code} switched off. It cannot be used until you switch it on.`);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not update the gift card.'));
    } finally {
      setToggling(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(card.code);
      toast.success('Code copied.');
    } catch {
      toast.error('Could not copy. Select the code and copy it instead.');
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: `${restaurant.name} gift card`, text });
    } catch {
      // Cancelled by the person, nothing to do.
    }
  };

  return (
    <>
      <Sheet
        open={!!target}
        onClose={onClose}
        side="right"
        title={justIssued ? 'Gift card issued' : 'Gift card'}
        description={justIssued ? 'Print it or send it to the guest now.' : `Issued ${formatIstDay(card.created_at)}`}
        className="md:max-w-lg"
      >
        <div className="grid gap-5 pb-2">
          <GiftCardVisual card={card} restaurantName={restaurant.name} />

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Button variant="dark" size="sm" leftIcon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
              Print
            </Button>
            <Button variant="outline" size="sm" leftIcon={<Copy className="h-4 w-4" />} onClick={() => void copy()}>
              Copy code
            </Button>
            {canShare && (
              <Button variant="outline" size="sm" leftIcon={<Share2 className="h-4 w-4" />} onClick={() => void share()}>
                Share
              </Button>
            )}
            {phone && (
              <a
                href={whatsappLink(phone, text)}
                target="_blank"
                rel="noreferrer"
                className="col-span-2 inline-flex h-9 items-center justify-center gap-2 rounded-full border border-line/15 px-4 text-[13px] font-semibold transition hover:bg-fg/5 sm:col-span-3"
              >
                <MessageCircle className="h-4 w-4 text-[#1b6f49]" aria-hidden />
                Send on WhatsApp to {formatIndianPhone(phone)}
              </a>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-sunk p-3.5 text-sm">
            <div>
              <dt className="font-mono text-2xs uppercase tracking-[0.14em] text-muted">Balance</dt>
              <dd className="tnum mt-0.5 font-mono text-lg font-semibold">{formatINR(card.balance)}</dd>
            </div>
            <div>
              <dt className="font-mono text-2xs uppercase tracking-[0.14em] text-muted">Status</dt>
              <dd className="mt-1">
                <CardStateBadge card={card} />
              </dd>
            </div>
            <div>
              <dt className="font-mono text-2xs uppercase tracking-[0.14em] text-muted">Issued to</dt>
              <dd className="mt-0.5">{card.issued_to_name ?? <span className="text-muted">Not named</span>}</dd>
            </div>
            <div>
              <dt className="font-mono text-2xs uppercase tracking-[0.14em] text-muted">Expires</dt>
              <dd className="mt-0.5">{card.expires_at ? formatIstDay(card.expires_at) : 'Never'}</dd>
            </div>
          </dl>

          {canEdit && (
            <Toggle
              checked={card.is_active}
              onChange={(v) => void setActive(v)}
              disabled={toggling}
              label="Card can be used"
              description={card.is_active ? 'Switch off if the card is lost or was issued by mistake' : 'Switched off; it cannot pay a bill'}
            />
          )}

          <div>
            <p className="mb-2 text-[13px] font-semibold text-fg/80">History</p>
            {txns === null ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full rounded-xl" />
                <Skeleton className="h-12 w-full rounded-xl" />
              </div>
            ) : txError ? (
              <ErrorNote>{txError}</ErrorNote>
            ) : (
              <ul className="divide-y divide-line/10 rounded-2xl border border-line/10">
                {txns.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{t.note ?? (t.amount < 0 ? 'Used on a bill' : 'Added')}</p>
                      <p className="text-xs text-muted">{formatIst(t.created_at)}</p>
                    </div>
                    <span className={cn('tnum shrink-0 font-mono font-semibold', t.amount < 0 ? 'text-rose' : 'text-[#1b6f49]')}>
                      {t.amount < 0 ? '−' : '+'}
                      {formatINR(Math.abs(t.amount))}
                    </span>
                  </li>
                ))}
                <li className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">Issued</p>
                    <p className="text-xs text-muted">{formatIst(card.created_at)}</p>
                  </div>
                  <span className="tnum shrink-0 font-mono font-semibold text-[#1b6f49]">+{formatINR(card.initial_value)}</span>
                </li>
              </ul>
            )}
          </div>
        </div>
      </Sheet>
      {target && <PrintCard card={card} restaurantName={restaurant.name} />}
    </>
  );
}

/** Rendered straight into <body> so printing shows only the card, not the dashboard behind it. */
function PrintCard({ card, restaurantName }: { card: GiftCard; restaurantName: string }) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div className="gift-print-root hidden">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div style={{ width: '120mm', margin: '0 auto', fontFamily: 'system-ui, sans-serif', color: '#0C0D10' }}>
        <div style={{ border: '1.5px solid #0C0D10', borderRadius: '6mm', padding: '8mm' }}>
          <p style={{ fontSize: '9pt', letterSpacing: '0.18em', textTransform: 'uppercase', margin: 0, color: '#555' }}>Gift card</p>
          <p style={{ fontSize: '16pt', fontWeight: 700, margin: '2mm 0 0' }}>{restaurantName}</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6mm', marginTop: '6mm' }}>
            <div>
              <p style={{ fontSize: '26pt', fontWeight: 700, margin: 0 }}>{formatINR(card.initial_value)}</p>
              {card.issued_to_name && <p style={{ fontSize: '11pt', margin: '2mm 0 0' }}>For {card.issued_to_name}</p>}
            </div>
            <QRCodeSVG value={card.code} size={120} level="M" marginSize={0} />
          </div>
          <p style={{ fontFamily: 'ui-monospace, monospace', fontSize: '20pt', fontWeight: 700, letterSpacing: '0.12em', margin: '8mm 0 0' }}>{card.code}</p>
          <p style={{ fontSize: '9.5pt', color: '#444', margin: '3mm 0 0' }}>
            {card.expires_at ? `Valid until ${formatIstDay(card.expires_at)}. ` : ''}Show this code when you pay the bill. Any balance left stays on the card.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
