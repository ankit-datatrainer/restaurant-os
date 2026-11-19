'use client';

import * as React from 'react';
import Link from 'next/link';
import { BellOff, CircleCheck, CircleX, MessageCircle, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import type { CustomerDetail, CustomerSummary, LoyaltyReward } from '@restaurant-os/shared';
import { formatIndianPhone, orderCode, planHas, tableDisplay, whatsappLink } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { cn, formatDateTime, formatINR, timeAgo } from '@/lib/utils';
import { Button, OrderStatusBadge, Sheet, Skeleton } from '@/components/ui';
import { useAdmin } from './admin-provider';
import { useConfirm } from './confirm-dialog';
import { ConsentBadge, Stars } from './crm-ui';
import { CONSENT_SOURCE_LABEL, customerName, firstName, lastVisitAt, shortDate, unsubscribeLine } from './crm';
import { errorMessage, itemCount } from './format';
import { RewardStateBadge, rewardState } from './loyalty-view';

/** Right-side drawer with one customer's profile, consent history and orders. */
export function CustomerSheet({
  customerId,
  onClose,
  onChanged,
}: {
  customerId: string | null;
  onClose: () => void;
  onChanged: (c: CustomerSummary) => void;
}) {
  const { token, restaurant } = useAdmin();
  const { confirm, dialog } = useConfirm();
  const [detail, setDetail] = React.useState<CustomerDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [revoking, setRevoking] = React.useState(false);
  const [redeemingId, setRedeemingId] = React.useState<string | null>(null);
  const hasLoyalty = planHas(restaurant.plan, 'loyalty');
  const confirming = React.useRef(false);
  const currentId = React.useRef(customerId);
  currentId.current = customerId;

  const load = React.useCallback(
    async (id: string) => {
      try {
        const d = await adminApi.customer(token, id);
        if (currentId.current !== id) return; // another customer was opened meanwhile
        setDetail(d);
        setError(null);
      } catch (e) {
        if (currentId.current !== id) return;
        setError(errorMessage(e, 'Could not load this customer.'));
      }
    },
    [token],
  );

  React.useEffect(() => {
    if (!customerId) return;
    setDetail((prev) => (prev?.customer.id === customerId ? prev : null));
    setError(null);
    void load(customerId);
  }, [customerId, load]);

  const c = detail?.customer.id === customerId ? detail.customer : null;
  const shown = c ?? detail?.customer ?? null; // keep content during the close animation

  const message = shown
    ? `Hi ${firstName(shown)}, thank you for dining with us at ${restaurant.name}. We would love to see you again soon!\n\n${unsubscribeLine(shown.unsubscribe_token)}`
    : '';

  const revoke = async () => {
    if (!c) return;
    confirming.current = true;
    const ok = await confirm({
      title: 'Record unsubscribe request?',
      description: (
        <>
          <span className="font-medium text-fg">{customerName(c)}</span> will be removed from every WhatsApp offer list. Only do this when they asked you to stop, for example by replying STOP. Staff
          cannot opt anyone back in; the guest can tick the box again at a future checkout.
        </>
      ),
      confirmLabel: 'Record unsubscribe',
      danger: true,
    });
    confirming.current = false;
    if (!ok) return;
    setRevoking(true);
    try {
      const updated = await adminApi.revokeConsent(token, c.id);
      setDetail((d) => (d && d.customer.id === updated.id ? { ...d, customer: { ...d.customer, ...updated } } : d));
      onChanged(updated);
      toast.success(`${customerName(c)} will not receive WhatsApp offers.`);
      void load(c.id); // pick up the new consent-history entry
    } catch (e) {
      toast.error(errorMessage(e, 'Could not record the unsubscribe request.'));
    } finally {
      setRevoking(false);
    }
  };

  const redeem = async (r: LoyaltyReward) => {
    if (!c) return;
    confirming.current = true;
    const ok = await confirm({
      title: `Redeem ${r.code}?`,
      description: (
        <>
          Give <span className="font-medium text-fg">{customerName(c)}</span> “{r.reward_text}”. The code cannot be used again.
        </>
      ),
      confirmLabel: 'Redeem reward',
    });
    confirming.current = false;
    if (!ok) return;
    setRedeemingId(r.id);
    try {
      const updated = await adminApi.redeemReward(token, r.id);
      setDetail((d) =>
        d && d.customer.id === c.id ? { ...d, rewards: (d.rewards ?? []).map((x) => (x.id === r.id ? { ...x, ...updated, customer: x.customer } : x)) } : d,
      );
      toast.success(`${r.code} redeemed for ${customerName(c)}.`);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not redeem the reward.'));
    } finally {
      setRedeemingId(null);
    }
  };

  const rewards = React.useMemo(
    () => [...(detail?.rewards ?? [])].sort((a, b) => new Date(b.earned_at).getTime() - new Date(a.earned_at).getTime()),
    [detail],
  );

  const events = React.useMemo(
    () => [...(detail?.consent_events ?? [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [detail],
  );

  return (
    <>
      <Sheet
        open={customerId !== null}
        onClose={() => {
          if (!confirming.current) onClose();
        }}
        side="right"
        title={shown ? customerName(shown) : 'Customer'}
        description={shown ? <span className="tnum font-mono">{formatIndianPhone(shown.phone)}</span> : undefined}
      >
        <div tabIndex={-1} data-autofocus className="outline-none">
          {error && !shown ? (
            <p className="rounded-xl bg-rose-soft px-4 py-3 text-sm font-medium text-[#a1282c]" role="alert">
              {error}
            </p>
          ) : !shown ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-24 w-full rounded-2xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-40 w-full rounded-2xl" />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-2">
                <ConsentBadge customer={shown} />
                <span className="text-xs text-muted">First seen {shortDate(shown.first_seen_at)}</span>
              </div>

              <dl className="grid grid-cols-2 gap-2">
                <Stat label="Visits" value={String(shown.visits)} />
                <Stat label="Orders" value={String(shown.orders_count)} />
                <Stat label="Total spent" value={formatINR(shown.total_spent)} />
                <Stat label="Last visit" value={timeAgo(lastVisitAt(shown))} mono={false} />
                <div className="col-span-2 rounded-xl bg-sunk px-3.5 py-2.5">
                  <dt className="font-mono text-2xs uppercase tracking-[0.14em] text-muted">Average rating</dt>
                  <dd className="mt-1 flex items-center gap-2">
                    {shown.avg_rating !== null ? (
                      <>
                        <Stars value={shown.avg_rating} size={16} />
                        <span className="tnum font-mono text-sm font-semibold">{shown.avg_rating.toFixed(1)}</span>
                      </>
                    ) : (
                      <span className="text-sm text-muted">No rating yet</span>
                    )}
                  </dd>
                </div>
              </dl>

              <section aria-labelledby="crm-whatsapp">
                <h3 id="crm-whatsapp" className="eyebrow mb-2">
                  WhatsApp
                </h3>
                {shown.marketing_consent ? (
                  <div className="space-y-3">
                    <div className="rounded-2xl bg-[#e7f6ec] p-3.5 text-sm text-[#16352a]">
                      <p className="whitespace-pre-line leading-relaxed">{message}</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <a
                        href={whatsappLink(shown.phone, message)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#1f9d55] px-5 text-sm font-semibold text-white transition hover:bg-[#188247]"
                      >
                        <MessageCircle className="h-4 w-4" aria-hidden /> Message on WhatsApp
                      </a>
                      <Button variant="ghost" loading={revoking} leftIcon={<BellOff className="h-4 w-4" />} onClick={() => void revoke()} className="text-rose hover:bg-rose-soft">
                        Record unsubscribe request
                      </Button>
                    </div>
                    <p className="text-xs text-muted">WhatsApp opens with this message typed in. You can edit it before you press send.</p>
                  </div>
                ) : (
                  <p className="rounded-xl bg-sunk px-3.5 py-3 text-sm text-fg/80">
                    {shown.consent_revoked_at ? `${customerName(shown)} unsubscribed on ${shortDate(shown.consent_revoked_at)}. ` : ''}
                    Offers can only be sent to customers who ticked the WhatsApp box themselves.
                  </p>
                )}
              </section>

              {hasLoyalty && (
                <section aria-labelledby="crm-rewards">
                  <h3 id="crm-rewards" className="eyebrow mb-2">
                    Loyalty rewards
                  </h3>
                  {!detail || detail.customer.id !== shown.id ? (
                    <Skeleton className="h-16 w-full rounded-xl" />
                  ) : rewards.length === 0 ? (
                    <p className="text-sm text-muted">No rewards yet. They are created automatically when this guest reaches a milestone visit.</p>
                  ) : (
                    <ul className="divide-y divide-line/5 rounded-2xl border border-line/10">
                      {rewards.map((r) => {
                        const active = rewardState(r) === 'active';
                        return (
                          <li key={r.id} className="flex items-center gap-3 px-3.5 py-3">
                            <div className="min-w-0 flex-1">
                              <p className="flex flex-wrap items-center gap-2">
                                <span className={cn('tnum font-mono text-base font-semibold tracking-[0.06em]', !active && 'text-fg/60')}>{r.code}</span>
                                <RewardStateBadge reward={r} />
                              </p>
                              <p className="mt-0.5 truncate text-sm">{r.reward_text}</p>
                              <p className="text-xs text-muted">
                                Earned {shortDate(r.earned_at)} · {r.redeemed_at ? `redeemed ${shortDate(r.redeemed_at)}` : `${active ? 'expires' : 'expired'} ${shortDate(r.expires_at)}`}
                              </p>
                            </div>
                            {active && (
                              <Button size="sm" loading={redeemingId === r.id} onClick={() => void redeem(r)} className="shrink-0">
                                Redeem
                              </Button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              )}

              <section aria-labelledby="crm-consent">
                <h3 id="crm-consent" className="eyebrow mb-3">
                  Consent history
                </h3>
                {events.length === 0 ? (
                  <p className="text-sm text-muted">No consent recorded. This customer has never opted in to WhatsApp offers.</p>
                ) : (
                  <ol className="relative space-y-4 border-l border-line/10 pl-5">
                    {events.map((ev) => {
                      const granted = ev.action === 'granted';
                      return (
                        <li key={ev.id} className="relative">
                          <span
                            className={cn(
                              'absolute -left-[31px] top-0 flex h-5 w-5 items-center justify-center rounded-full ring-4 ring-surface',
                              granted ? 'bg-mint-soft text-[#1b6f49]' : 'bg-rose-soft text-rose',
                            )}
                            aria-hidden
                          >
                            {granted ? <CircleCheck className="h-3.5 w-3.5" /> : <CircleX className="h-3.5 w-3.5" />}
                          </span>
                          <p className="text-sm font-semibold">{granted ? 'Opted in' : 'Unsubscribed'}</p>
                          <p className="text-xs text-muted">
                            {CONSENT_SOURCE_LABEL[ev.source] ?? ev.source} · <span className="tnum font-mono">{formatDateTime(ev.created_at)}</span>
                          </p>
                          {ev.consent_text && <blockquote className="mt-1.5 rounded-lg bg-sunk px-3 py-2 text-xs italic text-fg/75">“{ev.consent_text}”</blockquote>}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>

              <section aria-labelledby="crm-orders">
                <h3 id="crm-orders" className="eyebrow mb-2">
                  Orders
                </h3>
                {!detail || detail.customer.id !== shown.id ? (
                  <Skeleton className="h-24 w-full rounded-xl" />
                ) : detail.orders.length === 0 ? (
                  <p className="text-sm text-muted">No orders linked to this number yet.</p>
                ) : (
                  <ul className="divide-y divide-line/5 rounded-2xl border border-line/10">
                    {detail.orders.map((o) => {
                      const n = itemCount(o);
                      return (
                        <li key={o.id}>
                          <Link href={`/admin/billing/${o.id}`} className="flex items-center gap-3 px-3.5 py-3 transition hover:bg-sunk/50">
                            <div className="min-w-0 flex-1">
                              <p className="flex items-center gap-2">
                                <span className="tnum font-mono text-sm font-semibold">{orderCode(o.order_number)}</span>
                                <OrderStatusBadge status={o.status} />
                              </p>
                              <p className="mt-0.5 truncate text-xs text-muted">
                                <span className="tnum font-mono">{formatDateTime(o.placed_at)}</span> · {n} item{n === 1 ? '' : 's'}
                                {o.table ? ` · ${tableDisplay(o.table)}` : ''}
                              </p>
                            </div>
                            <span className="tnum shrink-0 font-mono text-sm font-semibold">{formatINR(o.total)}</span>
                            <Receipt className="h-4 w-4 shrink-0 text-muted" aria-label="Open bill" />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          )}
        </div>
      </Sheet>
      {dialog}
    </>
  );
}

function Stat({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl bg-sunk px-3.5 py-2.5">
      <dt className="font-mono text-2xs uppercase tracking-[0.14em] text-muted">{label}</dt>
      <dd className={cn('mt-1 truncate text-base font-semibold', mono && 'tnum font-mono')}>{value}</dd>
    </div>
  );
}
