'use client';

import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Clock, Maximize2, Minimize2, Moon, Sun, User } from 'lucide-react';
import { toast } from 'sonner';
import type { OrderStatus, OrderWithItems } from '@restaurant-os/shared';
import { ORDER_STATUS_LABEL, minutesSince, nextOrderStatus, orderCode } from '@restaurant-os/shared';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui';
import { pop } from '@/lib/motion';
import { useAdmin } from './admin-provider';
import { AddedChip, KotLinks, OrderItemsList, OrderTypeChips, advanceLabelFor, isLate, isTakeaway, orderPlace } from './order-card';
import { ADVANCE_LABEL } from './status-actions';
import { formatElapsed } from './format';
import { useNow } from './use-now';

const placedMs = (o: OrderWithItems) => new Date(o.placed_at).getTime();

/**
 * Oldest first, but takeaway orders with a pickup time are reordered among themselves by pickup:
 * they keep the slots they would have had, and the earliest pickup takes the first of those slots.
 */
export function sortForKitchen(list: OrderWithItems[]): OrderWithItems[] {
  const byPlaced = [...list].sort((a, b) => placedMs(a) - placedMs(b));
  const timed = byPlaced.filter((o) => isTakeaway(o) && o.pickup_at);
  if (timed.length < 2) return byPlaced;
  const byPickup = [...timed].sort((a, b) => new Date(a.pickup_at!).getTime() - new Date(b.pickup_at!).getTime() || placedMs(a) - placedMs(b));
  let i = 0;
  return byPlaced.map((o) => (isTakeaway(o) && o.pickup_at ? byPickup[i++]! : o));
}

const COLUMNS: Array<{ status: OrderStatus; accent: string; dot: string }> = [
  { status: 'placed', accent: 'text-ember', dot: 'bg-ember' },
  { status: 'accepted', accent: 'text-sky', dot: 'bg-sky' },
  { status: 'preparing', accent: 'text-saffron', dot: 'bg-saffron' },
  { status: 'ready', accent: 'text-mint', dot: 'bg-mint' },
];

export function KitchenBoard() {
  const { orders, setOrderStatus } = useAdmin();
  const now = useNow(15_000);
  const reduce = useReducedMotion();
  const boardRef = React.useRef<HTMLDivElement>(null);
  const [dark, setDark] = React.useState(false);
  const [fullscreen, setFullscreen] = React.useState(false);
  const [busy, setBusy] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (document.documentElement.requestFullscreen) {
        // Fullscreen the page, not the board: the new-order banners, the assistance-calls panel
        // and toasts live outside this element and must stay visible on the kitchen display.
        // The board then covers the shell itself (see the `fullscreen` classes below).
        await document.documentElement.requestFullscreen();
        setDark(true);
      } else {
        toast.error('Fullscreen is not available in this browser. Use the dark toggle instead.');
      }
    } catch {
      toast.error('Could not enter fullscreen. Your browser may need a direct tap on the button.');
    }
  };

  const columns = React.useMemo(
    () =>
      COLUMNS.map((c) => ({
        ...c,
        orders: sortForKitchen(orders.filter((o) => o.status === c.status)),
      })),
    [orders],
  );

  const advance = async (order: OrderWithItems) => {
    const next = nextOrderStatus(order.status);
    if (!next) return;
    setBusy((s) => new Set(s).add(order.id));
    await setOrderStatus(order, next);
    setBusy((s) => {
      const n = new Set(s);
      n.delete(order.id);
      return n;
    });
  };

  return (
    <div
      ref={boardRef}
      className={cn(
        '-mx-5 -mt-5 flex min-h-[calc(100dvh-4rem)] flex-col md:-mx-10 md:-mt-7 xl:-mx-16',
        dark && 'theme-dark',
        'bg-bg text-fg',
        fullscreen && 'fixed inset-0 z-[60] m-0 min-h-0 overflow-auto md:m-0 xl:m-0',
      )}
    >
      <div className="flex items-center gap-3 px-5 pt-5 md:px-10 xl:px-16">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl font-semibold tracking-tight md:text-[28px]">Kitchen board</h2>
          <p className="mt-0.5 text-sm text-muted">
            Oldest first in every column, takeaways by pickup time. <span className="tnum font-mono">{orders.length}</span> order{orders.length === 1 ? '' : 's'} in play.
          </p>
        </div>
        <Button variant="outline" size="sm" leftIcon={dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />} onClick={() => setDark((v) => !v)} aria-pressed={dark}>
          <span className="hidden sm:inline">{dark ? 'Light' : 'Dark'}</span>
        </Button>
        <Button variant="outline" size="sm" leftIcon={fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />} onClick={() => void toggleFullscreen()} aria-pressed={fullscreen}>
          <span className="hidden sm:inline">{fullscreen ? 'Exit fullscreen' : 'Fullscreen'}</span>
        </Button>
      </div>

      <div className="no-scrollbar mt-4 flex-1 overflow-x-auto px-5 pb-6 md:px-10 xl:px-16">
        <div className="grid min-w-[1120px] grid-cols-4 gap-4 2xl:min-w-0">
          {columns.map((col) => (
            <section key={col.status} className="flex min-h-[60vh] flex-col rounded-2xl bg-sunk/60 p-2.5" aria-label={`${ORDER_STATUS_LABEL[col.status]} orders`}>
              <header className="flex items-center gap-2 px-2 pb-2 pt-1">
                <span className={cn('h-2.5 w-2.5 rounded-full', col.dot)} aria-hidden />
                <h3 className={cn('font-display text-base font-semibold', col.accent)}>{ORDER_STATUS_LABEL[col.status]}</h3>
                <span className="tnum ml-auto rounded-full bg-surface px-2 font-mono text-xs text-muted shadow-soft">{col.orders.length}</span>
              </header>
              <motion.ul layout={!reduce} className="flex flex-col gap-2.5">
                <AnimatePresence initial={false}>
                  {col.orders.map((o) => (
                    <motion.li key={o.id} layout={!reduce} variants={pop} initial={reduce ? false : 'hidden'} animate="show" exit="exit">
                      <KitchenCard order={o} now={now} busy={busy.has(o.id)} onAdvance={advance} />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </motion.ul>
              {col.orders.length === 0 && <p className="px-2 py-6 text-center text-sm text-muted">Nothing here</p>}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function KitchenCard({ order, now, busy, onAdvance }: { order: OrderWithItems; now: number; busy: boolean; onAdvance: (o: OrderWithItems) => void }) {
  const mins = minutesSince(order.placed_at, now);
  const late = isLate(order, now);
  const label = advanceLabelFor(order, ADVANCE_LABEL[order.status]);
  const takeaway = isTakeaway(order);
  // A takeaway that is not ready by its pickup time needs the kitchen's attention first.
  const pickupMs = takeaway && order.pickup_at ? new Date(order.pickup_at).getTime() : null;
  const pickupOverdue = pickupMs !== null && order.status !== 'ready' && now >= pickupMs;
  const pickupSoon = pickupMs !== null && !pickupOverdue && order.status !== 'ready' && pickupMs - now <= 10 * 60_000;
  return (
    <article
      className={cn('rounded-2xl border-2 bg-surface p-3.5 shadow-soft', late || pickupOverdue ? 'border-rose' : order.items_added_at ? 'border-saffron/70' : 'border-transparent')}
      aria-label={`Order ${orderCode(order.order_number)}`}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="tnum font-mono text-xl font-semibold leading-none tracking-tight">{orderCode(order.order_number)}</p>
          <p className="mt-1.5 truncate text-base font-semibold">{orderPlace(order)}</p>
          {takeaway && order.guest_name && (
            <p className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate text-sm text-muted">
              <User className="h-3.5 w-3.5 shrink-0" aria-hidden /> {order.guest_name}
            </p>
          )}
          <OrderTypeChips order={order} size="lg" className="mt-1.5 flex" />
          {(pickupOverdue || pickupSoon) && (
            <p className={cn('mt-1.5 text-sm font-semibold', pickupOverdue ? 'text-rose' : 'text-[#8a5a00]')}>{pickupOverdue ? 'Pickup time has passed' : 'Pickup in under 10 min'}</p>
          )}
          {order.items_added_at && <AddedChip className="mt-1.5" />}
        </div>
        <span className={cn('tnum inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 font-mono text-sm font-semibold', late ? 'bg-rose text-white' : 'bg-sunk text-fg/80')}>
          <Clock className="h-3.5 w-3.5" aria-hidden />
          {formatElapsed(mins)}
        </span>
      </header>
      <div className="mt-3 border-t border-line/10 pt-3">
        <OrderItemsList items={order.items} size="lg" addedAt={order.items_added_at} />
        {order.note && (
          <p className="mt-3 rounded-xl bg-saffron-soft px-3 py-2 text-sm font-medium text-[#8a5a00]">
            <span className="font-semibold">Note: </span>
            {order.note}
          </p>
        )}
      </div>
      <KotLinks order={order} className="mt-3" />
      {label && (
        <Button
          size="lg"
          variant={order.status === 'preparing' ? 'success' : order.status === 'ready' ? 'secondary' : 'primary'}
          loading={busy}
          onClick={() => onAdvance(order)}
          className="mt-4 w-full"
        >
          {label}
        </Button>
      )}
    </article>
  );
}
