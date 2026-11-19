'use client';

import * as React from 'react';
import Link from 'next/link';
import { CirclePlus, Clock, Globe, MessageSquareText, Printer, Receipt, ShoppingBag, Store, User } from 'lucide-react';
import type { Order, OrderItem, OrderStatus, OrderWithItems } from '@restaurant-os/shared';
import { ORDER_SOURCE_LABEL, ORDER_TYPE_LABEL, PAYMENT_METHOD_LABEL, minutesSince, orderCode, tableDisplay } from '@restaurant-os/shared';
import { cn, formatINR, formatTime } from '@/lib/utils';
import { OrderStatusBadge, PaymentStatusBadge, VegMark } from '@/components/ui';
import { StatusActions } from './status-actions';
import { formatElapsed, maxRound } from './format';
import { discountNote, pickupLabel } from './bills/bill-utils';

export const LATE_AFTER_MIN = 20;

/** Shown wherever an order sits at "Guest says paid": staff must check before marking it paid. */
export const CLAIMED_HINT = 'Guest says paid — check your UPI app before marking paid.';

/** True while an order is still being worked on and has been waiting too long. */
export function isLate(order: Pick<OrderWithItems, 'status' | 'placed_at'>, now: number): boolean {
  if (order.status === 'ready' || order.status === 'served' || order.status === 'cancelled') return false;
  return minutesSince(order.placed_at, now) >= LATE_AFTER_MIN;
}

/** Items grouped by round, in round order, keeping the cart order inside each round. */
export function groupByRound<T extends Pick<OrderItem, 'round'>>(items: T[]): Array<{ round: number; items: T[] }> {
  const map = new Map<number, T[]>();
  for (const it of items) {
    const r = it.round && it.round > 0 ? it.round : 1;
    const list = map.get(r);
    if (list) list.push(it);
    else map.set(r, [it]);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([round, list]) => ({ round, items: list }));
}

/**
 * Label for an add-on round. Only the latest addition has a timestamp (`items_added_at`);
 * earlier add-on rounds just say "Added".
 */
export function roundLabel(round: number, latestRound: number, addedAt: string | null | undefined): string {
  if (round === latestRound && addedAt) return `Added ${formatTime(addedAt)}`;
  return 'Added';
}

/** Takeaway orders have no table (migration 0006). */
export function isTakeaway(order: Pick<Order, 'order_type' | 'table_id'>): boolean {
  return order.order_type === 'takeaway' || (!order.order_type && !order.table_id);
}

/** Where the order is for: the table, or "Takeaway". */
export function orderPlace(order: Pick<OrderWithItems, 'order_type' | 'table_id' | 'table'>): string {
  return isTakeaway(order) ? ORDER_TYPE_LABEL.takeaway : tableDisplay(order.table);
}

/** Button label for moving a ready order on: takeaway guests pick up, they are not served. */
export function advanceLabelFor(order: Pick<Order, 'order_type' | 'table_id' | 'status'>, fallback: string | null): string | null {
  if (order.status === 'ready' && isTakeaway(order)) return 'Mark picked up';
  return fallback;
}

/** "Takeaway · Pickup 7:30 pm", "Counter", "Online" chips. Nothing for a plain table-QR dine-in order. */
export function OrderTypeChips({ order, size = 'sm', className }: { order: Pick<Order, 'order_type' | 'table_id' | 'source' | 'pickup_at'>; size?: 'sm' | 'lg'; className?: string }) {
  const takeaway = isTakeaway(order);
  const counter = order.source === 'pos';
  const online = order.source === 'online';
  if (!takeaway && !counter && !online) return null;
  const chip = cn(
    'inline-flex items-center gap-1 rounded-full font-mono font-semibold uppercase tracking-[0.12em]',
    size === 'lg' ? 'px-2.5 py-1 text-xs' : 'px-2.5 py-0.5 text-2xs',
  );
  const icon = size === 'lg' ? 'h-3.5 w-3.5' : 'h-3 w-3';
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)}>
      {takeaway && (
        <span className={cn(chip, 'bg-ink text-paper')}>
          <ShoppingBag className={icon} aria-hidden />
          {ORDER_TYPE_LABEL.takeaway}
          {order.pickup_at && <span className="font-medium normal-case tracking-normal opacity-80">· {pickupLabel(order.pickup_at)}</span>}
        </span>
      )}
      {counter && (
        <span className={cn(chip, 'bg-sky-soft text-[#245a9f]')}>
          <Store className={icon} aria-hidden />
          {ORDER_SOURCE_LABEL.pos}
        </span>
      )}
      {online && (
        <span className={cn(chip, 'bg-ember-soft text-ember-3')}>
          <Globe className={icon} aria-hidden />
          {ORDER_SOURCE_LABEL.online}
        </span>
      )}
    </span>
  );
}

/** "Discount −₹64 · Coupon WELCOME10" (null when the order has no discount). */
export function discountLine(order: Pick<Order, 'discount_amount' | 'discount_reason' | 'coupon_code'>): string | null {
  const amount = Number(order.discount_amount ?? 0);
  if (!(amount > 0)) return null;
  const note = discountNote(order);
  return `Discount −${formatINR(amount)}${note ? ` · ${note}` : ''}`;
}

export function billUrl(billId: string): string {
  return `/admin/billing/bills/${billId}`;
}

export function kotUrl(orderId: string, round?: number): string {
  return round ? `/admin/kot/${orderId}?round=${round}` : `/admin/kot/${orderId}`;
}

export function OrderItemsList({
  items,
  size = 'md',
  className,
  addedAt,
}: {
  items: OrderWithItems['items'];
  size?: 'md' | 'lg';
  className?: string;
  /** `order.items_added_at`, for the "Added 7:42 pm" divider above the latest add-on round. */
  addedAt?: string | null;
}) {
  const big = size === 'lg';
  const groups = groupByRound(items);
  const latest = groups.length ? groups[groups.length - 1]!.round : 1;
  const hasAddOns = latest > 1;

  const renderItem = (it: OrderItem, added: boolean) => (
    <li key={it.id} className={cn('flex items-start gap-2.5', added && '-mx-1.5 rounded-lg bg-saffron-soft/60 px-1.5 py-1')}>
      <span
        className={cn(
          'tnum mt-0.5 inline-flex shrink-0 items-center justify-center rounded-md font-mono font-semibold',
          added ? 'bg-saffron text-ink' : 'bg-sunk',
          big ? 'h-7 min-w-7 px-1.5 text-base' : 'h-6 min-w-6 px-1 text-sm',
        )}
      >
        {it.quantity}×
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn('flex items-center gap-1.5 font-medium leading-snug', big ? 'text-lg' : 'text-[15px]')}>
          <VegMark isVeg={it.is_veg} size={big ? 14 : 12} />
          <span className="truncate">{it.name}</span>
        </p>
        {it.options.length > 0 && <p className={cn('text-muted', big ? 'text-sm' : 'text-xs')}>{it.options.map((o) => o.choice_label).join(' · ')}</p>}
        {it.note && (
          <p className={cn('mt-1 inline-flex items-start gap-1 rounded-md bg-saffron-soft px-2 py-1 font-medium text-[#8a5a00]', big ? 'text-sm' : 'text-xs')}>
            <MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {it.note}
          </p>
        )}
      </div>
      {!big && <span className="tnum shrink-0 font-mono text-sm text-muted">{formatINR(it.line_total)}</span>}
    </li>
  );

  if (!hasAddOns) {
    return <ul className={cn('space-y-1.5', className)}>{items.map((it) => renderItem(it, false))}</ul>;
  }

  return (
    <div className={cn('space-y-2', className)}>
      {groups.map((g) =>
        g.round === 1 ? (
          <ul key={g.round} className="space-y-1.5">
            {g.items.map((it) => renderItem(it, false))}
          </ul>
        ) : (
          <section key={g.round} aria-label={`Dishes added later, round ${g.round}`}>
            <div className="mb-1.5 flex items-center gap-2" role="separator">
              <span className="h-px flex-1 bg-saffron/60" aria-hidden />
              <span className={cn('inline-flex items-center gap-1 rounded-full bg-saffron px-2.5 py-0.5 font-mono font-semibold uppercase tracking-[0.12em] text-ink', big ? 'text-xs' : 'text-2xs')}>
                <CirclePlus className="h-3 w-3" aria-hidden />
                {roundLabel(g.round, latest, addedAt)}
              </span>
              <span className="h-px flex-1 bg-saffron/60" aria-hidden />
            </div>
            <ul className="space-y-1.5">{g.items.map((it) => renderItem(it, true))}</ul>
          </section>
        ),
      )}
    </div>
  );
}

/** "+ dishes added" chip for orders the guest added to. */
export function AddedChip({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-saffron-soft px-2.5 py-0.5 font-mono text-2xs font-semibold uppercase tracking-[0.12em] text-[#8a5a00] ring-1 ring-saffron/50',
        className,
      )}
    >
      + dishes added
    </span>
  );
}

/** "Print KOT" / "Print add-on KOT" links (open the ticket in a new tab). */
export function KotLinks({ order, size = 'sm', className }: { order: OrderWithItems; size?: 'sm' | 'md'; className?: string }) {
  const latest = maxRound(order.items);
  const cls = cn(
    'inline-flex items-center gap-1.5 rounded-full border font-semibold transition',
    size === 'sm' ? 'h-8 px-3 text-xs' : 'h-9 px-3.5 text-[13px]',
  );
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <a href={kotUrl(order.id)} target="_blank" rel="noopener" className={cn(cls, 'border-line/15 text-fg/80 hover:bg-fg/5 hover:text-fg')} title="Opens the kitchen ticket in a new tab">
        <Printer className="h-3.5 w-3.5" aria-hidden /> Print KOT
      </a>
      {latest > 1 && (
        <a
          href={kotUrl(order.id, latest)}
          target="_blank"
          rel="noopener"
          className={cn(cls, 'border-saffron/60 bg-saffron-soft text-[#8a5a00] hover:bg-saffron/30')}
          title="Prints only the dishes added last"
        >
          <Printer className="h-3.5 w-3.5" aria-hidden /> Print add-on KOT
        </a>
      )}
    </div>
  );
}

export function OrderCard({
  order,
  now,
  busy,
  onAdvance,
  onCancel,
  onTogglePaid,
  onSettle,
  className,
}: {
  order: OrderWithItems;
  now: number;
  busy?: boolean;
  onAdvance: (order: OrderWithItems, next: OrderStatus) => void;
  onCancel?: (order: OrderWithItems) => void;
  onTogglePaid?: (order: OrderWithItems) => void;
  /** Opens the settle-bill sheet (split payment, tip, discount) for an unpaid order. */
  onSettle?: (order: OrderWithItems) => void;
  className?: string;
}) {
  const mins = minutesSince(order.placed_at, now);
  const late = isLate(order, now);
  const done = order.status === 'served' || order.status === 'cancelled';

  return (
    <article
      className={cn(
        'flex flex-col rounded-2xl border bg-surface shadow-soft transition-colors',
        late ? 'border-rose/40' : 'border-line/10',
        order.status === 'placed' && 'ring-1 ring-ember/30',
        className,
      )}
      aria-label={`Order ${orderCode(order.order_number)}`}
    >
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-4">
        <span className="tnum font-mono text-base font-semibold tracking-tight">{orderCode(order.order_number)}</span>
        <OrderStatusBadge status={order.status} />
        {order.items_added_at && <AddedChip />}
        <OrderTypeChips order={order} />
        <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-xs tnum" title={`Placed ${formatTime(order.placed_at)}`}>
          <Clock className={cn('h-3.5 w-3.5', late ? 'text-rose' : 'text-muted')} aria-hidden />
          <span className={cn(late ? 'font-semibold text-rose' : 'text-muted')}>{done ? formatTime(order.placed_at) : formatElapsed(mins)}</span>
        </span>
      </header>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-4 text-sm">
        <span className="font-semibold">{orderPlace(order)}</span>
        {order.guest_name && (
          <span className="inline-flex items-center gap-1 text-muted">
            <User className="h-3.5 w-3.5" aria-hidden /> {order.guest_name}
          </span>
        )}
      </div>

      <div className="mt-3 border-t border-line/5 px-4 pt-3">
        <OrderItemsList items={order.items} addedAt={order.items_added_at} />
        {order.note && (
          <p className="mt-3 rounded-xl bg-saffron-soft px-3 py-2 text-sm text-[#8a5a00]">
            <span className="font-semibold">Note for the kitchen: </span>
            {order.note}
          </p>
        )}
      </div>

      <footer className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line/5 px-4 py-3">
        {discountLine(order) && <p className="tnum w-full text-xs font-medium text-[#1b6f49]">{discountLine(order)}</p>}
        <span className="tnum font-mono text-lg font-semibold">{formatINR(order.total)}</span>
        <span className="text-xs text-muted">{PAYMENT_METHOD_LABEL[order.payment_method]}</span>
        <PaymentStatusBadge status={order.payment_status} />
        {order.bill_id && (
          <Link
            href={billUrl(order.bill_id)}
            className="inline-flex items-center gap-1 rounded-full bg-mint-soft px-2.5 py-0.5 text-xs font-medium text-[#1b6f49] transition hover:bg-mint/20"
            title="Open the receipt for the bill this order was settled on"
          >
            <Receipt className="h-3 w-3" aria-hidden /> Settled on a bill
          </Link>
        )}
        {onSettle && order.status !== 'cancelled' && !order.bill_id && (order.payment_status === 'pending' || order.payment_status === 'claimed') && (
          <button
            type="button"
            onClick={() => onSettle(order)}
            className="inline-flex items-center gap-1 rounded-full bg-ink px-2.5 py-1 text-xs font-medium text-paper transition hover:bg-ink/85"
          >
            <Receipt className="h-3 w-3" aria-hidden /> Settle bill
          </button>
        )}
        {order.status !== 'cancelled' && <KotLinks order={order} className="ml-auto" />}
        {order.payment_status === 'claimed' && <p className="w-full rounded-lg bg-saffron-soft px-2.5 py-1.5 text-xs font-medium text-[#8a5a00]">{CLAIMED_HINT}</p>}
      </footer>

      {!done && (
        <div className="px-4 pb-4">
          <StatusActions order={order} busy={busy} onAdvance={onAdvance} onCancel={onCancel} onTogglePaid={onTogglePaid} size="sm" />
        </div>
      )}
      {done && onTogglePaid && order.status === 'served' && (
        <div className="px-4 pb-4">
          <StatusActions order={order} busy={busy} onAdvance={onAdvance} onTogglePaid={onTogglePaid} size="sm" />
        </div>
      )}
    </article>
  );
}
