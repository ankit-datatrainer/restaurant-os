'use client';

import * as React from 'react';
import type { OrderWithItems, Restaurant } from '@restaurant-os/shared';
import { orderRates, roundMoney } from '@restaurant-os/shared';
import { VegMark } from '@/components/ui';
import { formatINR, formatTime } from '@/lib/utils';

type Line = OrderWithItems['items'][number];

function ItemRow({ it }: { it: Line }) {
  const opts = it.options.map((o) => o.choice_label).join(' · ');
  return (
    <li className="flex items-start gap-3 py-3">
      <VegMark isVeg={it.is_veg} className="mt-1" />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold leading-snug">
          <span className="font-mono text-muted tnum">{it.quantity} ×</span> {it.name}
        </p>
        {opts && <p className="mt-0.5 text-[13px] text-muted">{opts}</p>}
        {it.note && <p className="mt-0.5 text-[13px] italic text-fg/70">“{it.note}”</p>}
      </div>
      <p className="shrink-0 font-mono text-sm font-semibold tnum">{formatINR(it.line_total)}</p>
    </li>
  );
}

/**
 * Line items of a placed order (snapshotted names and prices). The original dishes come first;
 * anything the guest added later sits under an "Added later" divider.
 */
export function OrderItems({ order }: { order: OrderWithItems }) {
  const byPosition = (a: Line, b: Line) => (a.round ?? 1) - (b.round ?? 1) || a.position - b.position;
  const first = order.items.filter((it) => (it.round ?? 1) <= 1).sort(byPosition);
  const later = order.items.filter((it) => (it.round ?? 1) > 1).sort(byPosition);
  return (
    <div>
      <ul className="divide-y divide-line/10">
        {first.map((it) => (
          <ItemRow key={it.id} it={it} />
        ))}
      </ul>
      {later.length > 0 && (
        <>
          <div className="flex items-center gap-3 pb-1 pt-3">
            <span className="h-px flex-1 bg-line/10" aria-hidden />
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ember-soft px-2.5 py-1 font-mono text-[10.5px] font-medium uppercase tracking-[0.14em] text-ember-3">
              Added later
              {order.items_added_at && (
                <time dateTime={order.items_added_at} className="tnum normal-case tracking-normal">
                  · {formatTime(order.items_added_at)}
                </time>
              )}
            </span>
            <span className="h-px flex-1 bg-line/10" aria-hidden />
          </div>
          <ul className="divide-y divide-line/10">
            {later.map((it) => (
              <ItemRow key={it.id} it={it} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** Subtotal / discount / service charge / CGST / SGST / total, taken from the order snapshot (they add up to the stored total). */
export function OrderTotals({ order, restaurant }: { order: OrderWithItems; restaurant: Restaurant | null }) {
  const cgst = roundMoney(order.tax_amount / 2);
  const sgst = roundMoney(order.tax_amount - cgst);
  // Rates the order was charged at (settings may have changed since it was placed).
  const rates = restaurant ? orderRates(order, restaurant) : null;
  const taxHalf = rates ? ` (${rates.tax_rate / 2}%)` : '';
  return (
    <dl className="grid gap-1.5 text-sm">
      <Row label="Subtotal" value={order.subtotal} />
      {Number(order.discount_amount) > 0 && (
        <div className="flex items-baseline justify-between gap-3 text-[#1b6f49]">
          <dt className="min-w-0">{order.discount_reason ? `Discount (${order.discount_reason})` : 'Discount'}</dt>
          <dd className="shrink-0 font-mono tnum">−{formatINR(Number(order.discount_amount))}</dd>
        </div>
      )}
      {order.service_charge > 0 && <Row label={`Service charge${rates ? ` (${rates.service_charge_rate}%)` : ''}`} value={order.service_charge} />}
      <Row label={`CGST${taxHalf}`} value={cgst} />
      <Row label={`SGST${taxHalf}`} value={sgst} />
      <div className="hairline-t mt-1.5 flex items-baseline justify-between pt-2.5">
        <dt className="font-display text-base font-bold">Total</dt>
        <dd className="font-display text-lg font-bold tnum">{formatINR(order.total)}</dd>
      </div>
    </dl>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className="font-mono tnum">{formatINR(value)}</dd>
    </div>
  );
}
