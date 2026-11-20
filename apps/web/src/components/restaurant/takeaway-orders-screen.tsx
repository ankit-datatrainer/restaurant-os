'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import { Clock, MapPin, Phone, RefreshCw, ShoppingBag } from 'lucide-react';
import type { OrderStatus, OrderWithItems } from '@restaurant-os/shared';
import { Badge, Button, EmptyState, Skeleton } from '@/components/ui';
import { publicApi } from '@/lib/api';
import { cn, orderCode } from '@/lib/utils';
import { fadeUp, stagger } from '@/lib/motion';
import { GuestPageHeader } from '@/components/guest/page-header';
import { OrderItems, OrderTotals } from '@/components/guest/order-items';
import { PaymentBlock } from '@/components/guest/payment-block';
import { GoogleReviewCard } from '@/components/guest/google-review-card';
import { NotifyCard } from '@/components/guest/notify-card';
import { takeawayScope } from '@/components/guest/notify-prefs';
import { useOrderWatcher } from '@/components/guest/order-watcher';
import { formatIstDateTime } from './hours';
import { PICKUP_LABEL, PickupTimeline } from './pickup-timeline';
import { useRestaurant } from './restaurant-provider';

const POLL_MS = 8000;

const TONE: Record<OrderStatus, 'ember' | 'sky' | 'saffron' | 'mint' | 'neutral' | 'rose'> = {
  placed: 'ember',
  accepted: 'sky',
  preparing: 'saffron',
  ready: 'mint',
  served: 'neutral',
  cancelled: 'rose',
};

/** This phone's takeaway orders at the restaurant (last 3 days), refreshed every 8 seconds. */
export function TakeawayOrdersScreen() {
  const reduce = Boolean(useReducedMotion());
  const { slug, data, session } = useRestaurant();
  const restaurant = data?.restaurant ?? null;
  const [orders, setOrders] = React.useState<OrderWithItems[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [claimingId, setClaimingId] = React.useState<string | null>(null);
  const [highlight, setHighlight] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const watcher = useOrderWatcher();
  const report = watcher?.report;
  const subscribe = watcher?.subscribe;

  React.useEffect(() => {
    setHighlight(new URLSearchParams(window.location.search).get('placed'));
  }, []);

  const load = React.useCallback(async () => {
    if (!session) return;
    try {
      const list = await publicApi.takeawayOrders(slug, session.id);
      setOrders(list);
      setError(null);
      // Status banners come from the order watcher; it compares this fresh list at once.
      report?.(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your orders.');
      setOrders((o) => o ?? []);
    }
  }, [slug, session, report]);

  React.useEffect(() => {
    void load();
  }, [load]);

  // The watcher saw an order move (its own check or a push): refresh at once.
  React.useEffect(() => {
    if (!subscribe) return;
    return subscribe(() => void load());
  }, [subscribe, load]);

  React.useEffect(() => {
    let timer: number | undefined;
    const start = () => {
      if (timer === undefined) timer = window.setInterval(() => void load(), POLL_MS);
    };
    const stop = () => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        void load();
        start();
      } else stop();
    };
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  // Bring a just-placed order into view.
  const scrolled = React.useRef(false);
  React.useEffect(() => {
    if (!highlight || !orders || scrolled.current) return;
    scrolled.current = true;
    document.getElementById(`order-${highlight}`)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }, [highlight, orders, reduce]);

  const claim = async (order: OrderWithItems) => {
    if (!session || claimingId) return;
    setClaimingId(order.id);
    try {
      const updated = await publicApi.claimPayment(order.id, session.id);
      setOrders((list) => (list ?? []).map((o) => (o.id === updated.id ? updated : o)));
      toast.success('Thanks! The counter will confirm it shortly');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update the payment. Please try again.');
    } finally {
      setClaimingId(null);
    }
  };

  const refreshNow = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const backHref = `/r/${slug}`;
  const anyActive = (orders ?? []).some((o) => o.status !== 'served' && o.status !== 'cancelled');
  // Google review link for every guest once an order is picked up (shown on the latest one only).
  const reviewOrderId = (orders ?? []).find((o) => o.status === 'served')?.id ?? null;

  return (
    <div className="relative pb-16">
      <GuestPageHeader
        title="Your takeaway orders"
        subtitle={restaurant?.name}
        backHref={backHref}
        backLabel="Back to the restaurant"
        right={
          <button
            type="button"
            onClick={() => void refreshNow()}
            className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-fg transition hover:bg-fg/5"
            aria-label="Refresh"
          >
            <RefreshCw className={cn('h-5 w-5', refreshing && 'animate-spin')} aria-hidden />
          </button>
        }
      />

      <main className="gutter pt-4">
        {orders === null && (
          <div className="grid gap-4" aria-busy="true" aria-label="Loading your orders">
            <Skeleton className="h-48 w-full rounded-3xl" />
            <Skeleton className="h-72 w-full rounded-3xl" />
          </div>
        )}

        {orders && orders.length === 0 && (
          <EmptyState
            icon={<ShoppingBag className="h-5 w-5" aria-hidden />}
            title={error ? 'Could not load your orders' : 'No takeaway orders on this phone'}
            description={
              error ?? 'Orders you place for pickup from this phone in the last 3 days show up here. If you ordered on another phone, check that one.'
            }
            action={
              error ? (
                <Button variant="outline" onClick={() => void refreshNow()}>
                  Try again
                </Button>
              ) : (
                <Button href={backHref}>Order takeaway</Button>
              )
            }
          />
        )}

        {orders && orders.length > 0 && (
          <motion.div className="grid gap-5" variants={stagger(0.07)} initial={reduce ? false : 'hidden'} animate="show">
            {error && <p className="rounded-2xl bg-saffron-soft px-4 py-3 text-[13px] text-[#6e4700]">{error} Showing what we had.</p>}
            {anyActive && session && (
              <motion.div variants={fadeUp}>
                <NotifyCard
                  variant={highlight ? 'full' : 'compact'}
                  scope={takeawayScope(slug)}
                  target={{ restaurant_slug: slug }}
                  sessionId={session.id}
                />
              </motion.div>
            )}
            {orders.map((o) => (
              <motion.article
                key={o.id}
                id={`order-${o.id}`}
                variants={fadeUp}
                className={cn('scroll-mt-20 overflow-hidden rounded-3xl border bg-surface shadow-soft', o.id === highlight ? 'border-ember/40' : 'border-line/10')}
                aria-labelledby={`order-${o.id}-h`}
              >
                <header className="relative overflow-hidden bg-ink p-5 text-paper">
                  <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-ember/25 blur-3xl" aria-hidden />
                  <div className="relative">
                    <div className="flex items-center justify-between gap-3">
                      <Badge tone={TONE[o.status]} dot>
                        {PICKUP_LABEL[o.status]}
                      </Badge>
                      <p id={`order-${o.id}-h`} className="font-mono text-[12px] uppercase tracking-[0.14em] text-paper/70 tnum">
                        {orderCode(o.order_number)}
                      </p>
                    </div>
                    {o.pickup_at && o.status !== 'cancelled' && (
                      <p className="mt-4 flex items-center gap-2 font-display text-[22px] font-bold leading-tight tracking-tight">
                        <Clock className="h-5 w-5 shrink-0 text-ember" aria-hidden />
                        {o.status === 'served' ? 'Picked up' : `Pickup ${formatIstDateTime(o.pickup_at)}`}
                      </p>
                    )}
                    <p className="mt-1.5 text-sm text-paper/70">
                      {o.guest_name ? `For ${o.guest_name} · ` : ''}
                      {o.items.reduce((s, it) => s + it.quantity, 0)} items · placed {formatIstDateTime(o.placed_at)}
                    </p>
                  </div>
                </header>

                <div className="grid gap-5 p-5">
                  <PickupTimeline order={o} />

                  {o.id === reviewOrderId && restaurant && <GoogleReviewCard restaurant={restaurant} className="border-saffron/30 shadow-none" />}

                  <div>
                    <h3 className="font-display text-base font-bold">Items</h3>
                    <OrderItems order={o} />
                    {o.note && <p className="mt-2 rounded-xl bg-sunk px-3 py-2 text-[13px] italic text-fg/70">Note: “{o.note}”</p>}
                    <div className="mt-3 rounded-2xl bg-sunk p-4">
                      <OrderTotals order={o} restaurant={restaurant} />
                    </div>
                  </div>

                  {restaurant && <PaymentBlock order={o} restaurant={restaurant} onClaim={() => void claim(o)} claiming={claimingId === o.id} />}
                </div>
              </motion.article>
            ))}

            {restaurant && (restaurant.address || restaurant.phone) && (
              <motion.section variants={fadeUp} className="rounded-3xl border border-line/10 bg-surface p-5 text-sm shadow-soft">
                <h2 className="font-display text-base font-bold">Where to collect</h2>
                {restaurant.address && (
                  <p className="mt-2 flex items-start gap-2 text-fg/80">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${restaurant.name}, ${restaurant.address}`)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline-offset-4 hover:underline"
                    >
                      {restaurant.address}
                    </a>
                  </p>
                )}
                {restaurant.phone && (
                  <p className="mt-2 flex items-center gap-2 text-fg/80">
                    <Phone className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                    <a href={`tel:${restaurant.phone.replace(/\s/g, '')}`} className="underline-offset-4 hover:underline">
                      {restaurant.phone}
                    </a>
                  </p>
                )}
              </motion.section>
            )}

            <motion.div variants={fadeUp}>
              <Button href={backHref} variant="outline" size="lg" className="w-full">
                Order something else
              </Button>
            </motion.div>
          </motion.div>
        )}
      </main>
    </div>
  );
}
