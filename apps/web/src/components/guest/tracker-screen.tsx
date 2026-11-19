'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import { BellRing, ChevronRight, Gamepad2, Plus, SearchX, UtensilsCrossed } from 'lucide-react';
import type { OrderStatus, OrderWithItems } from '@restaurant-os/shared';
import { ORDER_STATUS_GUEST_COPY } from '@restaurant-os/shared';
import { Button, EmptyState, OrderStatusBadge, Skeleton } from '@/components/ui';
import { ApiRequestError, publicApi } from '@/lib/api';
import { cn, formatINR, formatTime, orderCode, tableDisplay } from '@/lib/utils';
import { fadeUp, stagger } from '@/lib/motion';
import { useCart } from '@/store/cart';
import { canAddToOrder, feedbackOn, gamesOn, loyaltyOn, storyOn } from './features';
import { FeedbackCard } from './feedback-card';
import { GuestPageHeader } from './page-header';
import { HelpSheet } from './help-sheet';
import { LoyaltyCard, hasLoyaltyCard } from './loyalty-card';
import { OrderItems, OrderTotals } from './order-items';
import { OrderTimeline } from './order-timeline';
import { PaymentBlock } from './payment-block';
import { StoryCard } from './story-card';
import { useTable } from './table-provider';
import { useLoyalty } from './use-loyalty';

const FINAL = new Set<OrderStatus>(['served', 'cancelled']);
const POLL_MS = 4000;
/** Slower cadence once only the payment confirmation is outstanding. */
const PAYMENT_POLL_MS = 8000;

/** A UPI payment the counter still has to confirm keeps the tracker live after serving. */
function paymentInFlight(o: OrderWithItems): boolean {
  return o.status !== 'cancelled' && o.payment_method === 'upi' && o.payment_status !== 'paid' && o.payment_status !== 'refunded';
}

/**
 * Live order tracker: polls every 4 s while the order is still moving (8 s while only a UPI
 * confirmation is pending) and the tab is visible.
 */
export function TrackerScreen() {
  const params = useParams<{ code: string; orderId: string }>();
  const orderId = params.orderId ?? '';
  const router = useRouter();
  const reduce = Boolean(useReducedMotion());
  const { code, data, session } = useTable();
  const setTable = useCart((s) => s.setTable);
  const setAddToOrder = useCart((s) => s.setAddToOrder);

  const [order, setOrder] = React.useState<OrderWithItems | null>(null);
  const [notFound, setNotFound] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [claiming, setClaiming] = React.useState(false);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const prevStatus = React.useRef<OrderStatus | null>(null);

  const load = React.useCallback(async () => {
    if (!session || !orderId) return;
    try {
      const o = await publicApi.getOrder(orderId, session.id);
      setOrder(o);
      setError(null);
      setNotFound(false);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 404) setNotFound(true);
      else setError(e instanceof Error ? e.message : 'Could not load this order');
    }
  }, [orderId, session]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const cooking = order ? !FINAL.has(order.status) : false;
  const active = order ? cooking || paymentInFlight(order) : false;
  const pollMs = cooking ? POLL_MS : PAYMENT_POLL_MS;
  React.useEffect(() => {
    if (!active) return;
    let timer: number | undefined;
    const stop = () => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
    };
    const start = () => {
      stop();
      timer = window.setInterval(() => void load(), pollMs);
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
  }, [active, pollMs, load]);

  // A small nudge when the kitchen moves the order along while the guest is looking.
  const status = order?.status ?? null;
  React.useEffect(() => {
    if (!status) return;
    if (prevStatus.current && prevStatus.current !== status) toast(ORDER_STATUS_GUEST_COPY[status]);
    prevStatus.current = status;
  }, [status]);

  const claim = async () => {
    if (!session || !order || claiming) return;
    setClaiming(true);
    try {
      const updated = await publicApi.claimPayment(order.id, session.id);
      setOrder(updated);
      toast.success('Thanks! The counter will confirm it shortly');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update the payment. Please try again.');
    } finally {
      setClaiming(false);
    }
  };

  const restaurant = data?.restaurant ?? null;
  const table = data?.table ?? null;
  const menuHref = `/t/${code}`;

  const addable = Boolean(order && canAddToOrder(order) && restaurant?.is_open !== false);
  const showFeedback = Boolean(order && restaurant && order.status === 'served' && feedbackOn(restaurant));
  const showStory = Boolean(order && restaurant && order.status !== 'cancelled' && storyOn(restaurant));
  const showGames = gamesOn(restaurant);
  // Loads after the order is placed (this page opens right after) and again once it is served:
  // that is when the visit counts.
  const loyalty = useLoyalty({ enabled: Boolean(order) && loyaltyOn(restaurant), refreshKey: order?.status === 'served' ? 'served' : 'open' });

  /** Back to the menu in "add to this order" mode. */
  const startAdding = () => {
    if (!order) return;
    setTable(code);
    setAddToOrder({ id: order.id, number: order.order_number });
    router.push(menuHref);
  };

  /** Back to the menu for a separate, new order. */
  const orderMore = () => {
    setAddToOrder(null);
    router.push(menuHref);
  };

  // "Rate your meal" on My orders links here with #feedback: bring the card into view once it exists.
  const scrolledToFeedback = React.useRef(false);
  React.useEffect(() => {
    if (!showFeedback || scrolledToFeedback.current || window.location.hash !== '#feedback') return;
    const t = window.setTimeout(() => {
      scrolledToFeedback.current = true;
      document.getElementById('feedback')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }, 400);
    return () => window.clearTimeout(t);
  }, [showFeedback, reduce]);

  return (
    <div className="relative pb-16">
      <GuestPageHeader
        title={order ? `Order ${orderCode(order.order_number)}` : 'Your order'}
        subtitle={restaurant ? `${restaurant.name} · ${tableDisplay(order?.table ?? table)}` : undefined}
        backHref={menuHref}
        right={
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-fg transition hover:bg-fg/5"
            aria-label="Call a waiter"
          >
            <BellRing className="h-5 w-5" aria-hidden />
          </button>
        }
      />

      <main className="gutter pt-4">
        {notFound && (
          <EmptyState
            icon={<SearchX className="h-5 w-5" aria-hidden />}
            title="We can't find this order on this phone"
            description="Orders are tied to the phone that placed them. If a friend ordered, the tracker is on their phone. Otherwise ask the staff."
            action={<Button href={menuHref}>Back to the menu</Button>}
          />
        )}

        {error && !order && !notFound && (
          <EmptyState
            title="Could not load this order"
            description={error}
            action={
              <Button variant="outline" onClick={() => void load()}>
                Try again
              </Button>
            }
          />
        )}

        {!order && !notFound && !error && (
          <div className="grid gap-4" aria-busy="true" aria-label="Loading your order">
            <Skeleton className="h-36 w-full rounded-3xl" />
            <Skeleton className="h-72 w-full rounded-3xl" />
            <Skeleton className="h-40 w-full rounded-3xl" />
          </div>
        )}

        {order && (
          <motion.div className="grid gap-4" variants={stagger(0.07)} initial={reduce ? false : 'hidden'} animate="show">
            <motion.section variants={fadeUp} className="relative overflow-hidden rounded-3xl bg-ink p-5 text-paper" aria-live="polite">
              <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-ember/25 blur-3xl" aria-hidden />
              <div className="relative">
                <div className="flex items-center justify-between gap-3">
                  <OrderStatusBadge status={order.status} />
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-paper/60">Placed {formatTime(order.placed_at)}</p>
                </div>
                <h2 className="mt-4 font-display text-[26px] font-bold leading-tight tracking-tight">{ORDER_STATUS_GUEST_COPY[order.status]}</h2>
                <p className="mt-1.5 text-sm text-paper/70">
                  {order.guest_name ? `For ${order.guest_name} · ` : ''}
                  {order.items.reduce((s, it) => s + it.quantity, 0)} items · {tableDisplay(order.table ?? table)}
                </p>
                {Number(order.discount_amount) > 0 && (
                  <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-mint/20 px-2.5 py-1 text-[12.5px] font-semibold text-[#7fe0b0]">
                    You saved <span className="tnum">{formatINR(Number(order.discount_amount))}</span>
                    {order.discount_reason ? <span className="font-normal opacity-80">· {order.discount_reason}</span> : null}
                  </p>
                )}
              </div>
            </motion.section>

            {addable && (
              <motion.div variants={fadeUp}>
                <button
                  type="button"
                  onClick={startAdding}
                  className="group flex w-full items-center gap-4 rounded-3xl border border-ember/25 bg-ember-soft p-4 text-left transition-[transform,box-shadow] duration-300 ease-out hover:shadow-soft active:scale-[0.99]"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-ember text-white shadow-[0_8px_24px_-10px_rgba(255,92,42,0.7)]">
                    <Plus className="h-5 w-5" strokeWidth={2.5} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-base font-bold leading-tight text-fg">Add dishes to this order</span>
                    <span className="mt-0.5 block text-[13px] text-ember-3">Forgot something? It joins {orderCode(order.order_number)} and goes to the kitchen.</span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-ember-3 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
                </button>
              </motion.div>
            )}

            {showFeedback && restaurant && (
              <motion.div variants={fadeUp}>
                <FeedbackCard id="feedback" order={order} restaurant={restaurant} guestSessionId={session?.id ?? null} onSaved={setOrder} />
              </motion.div>
            )}

            <motion.section variants={fadeUp} className="rounded-3xl border border-line/10 bg-surface p-5 shadow-soft" aria-labelledby="progress-heading">
              <h2 id="progress-heading" className="mb-5 font-display text-lg font-bold">
                Progress
              </h2>
              <OrderTimeline order={order} />
            </motion.section>

            {showStory && restaurant && (
              <motion.div variants={fadeUp}>
                <StoryCard restaurant={restaurant} />
              </motion.div>
            )}

            <motion.section variants={fadeUp} className="rounded-3xl border border-line/10 bg-surface p-5 shadow-soft" aria-labelledby="items-heading">
              <h2 id="items-heading" className="font-display text-lg font-bold">
                Items
              </h2>
              <OrderItems order={order} />
              {order.note && <p className="mt-2 rounded-xl bg-sunk px-3 py-2 text-[13px] italic text-fg/70">Kitchen note: “{order.note}”</p>}
              <div className="mt-4 rounded-2xl bg-sunk p-4">
                <OrderTotals order={order} restaurant={restaurant} />
              </div>
            </motion.section>

            {restaurant && (
              <motion.div variants={fadeUp}>
                <PaymentBlock order={order} restaurant={restaurant} onClaim={claim} claiming={claiming} />
              </motion.div>
            )}

            {hasLoyaltyCard(loyalty) && (
              <motion.div variants={fadeUp}>
                <LoyaltyCard status={loyalty} />
              </motion.div>
            )}

            <motion.div variants={fadeUp} className="grid gap-2 pt-2">
              <Button
                size="lg"
                variant={addable ? 'outline' : 'primary'}
                onClick={orderMore}
                leftIcon={<UtensilsCrossed className="h-4 w-4" aria-hidden />}
              >
                {addable ? 'Place a separate order' : 'Order more'}
              </Button>
              <div className={cn('grid gap-2', showGames && 'grid-cols-2')}>
                <Button variant="outline" size="lg" onClick={() => setHelpOpen(true)} leftIcon={<BellRing className="h-4 w-4" aria-hidden />}>
                  Call waiter
                </Button>
                {showGames && (
                  <Button variant="outline" size="lg" href={`/t/${code}/games`} leftIcon={<Gamepad2 className="h-4 w-4" aria-hidden />}>
                    Play a game
                  </Button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </main>

      <HelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} code={code} guestSessionId={session?.id ?? null} />
    </div>
  );
}
