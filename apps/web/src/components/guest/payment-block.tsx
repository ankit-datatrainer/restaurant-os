'use client';

import * as React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { CheckCircle2, Clock, Smartphone, Store } from 'lucide-react';
import type { OrderWithItems, Restaurant } from '@restaurant-os/shared';
import { PAYMENT_METHOD_LABEL } from '@restaurant-os/shared';
import { Badge, Button } from '@/components/ui';
import { buildUpiLink, formatINR, formatTime, orderCode } from '@/lib/utils';

/**
 * Payment section of the tracker: UPI deep link + QR, "I've paid" claim, counter note,
 * or a paid / waiting pill depending on the order's payment status.
 */
export function PaymentBlock({
  order,
  restaurant,
  onClaim,
  claiming,
}: {
  order: OrderWithItems;
  restaurant: Restaurant;
  onClaim: () => void;
  claiming: boolean;
}) {
  if (order.status === 'cancelled') return null;

  const upiLink =
    order.payment_method === 'upi' && restaurant.upi_id
      ? buildUpiLink({
          vpa: restaurant.upi_id,
          payee: restaurant.upi_payee_name ?? restaurant.name,
          amount: order.total,
          // Always the stored order total (discounts included), never a client-side figure.
          // No "#": several UPI apps reject it in the transaction note.
          note: `Order ORD-${order.order_number}`,
        })
      : null;

  let body: React.ReactNode;
  if (order.payment_status === 'paid') {
    body = (
      <div className="flex items-center gap-3">
        <Badge tone="mint" dot>
          Paid
        </Badge>
        <p className="text-sm text-muted">{order.paid_at ? `Confirmed at ${formatTime(order.paid_at)}. Thank you!` : 'Confirmed by the staff. Thank you!'}</p>
      </div>
    );
  } else if (order.payment_status === 'refunded') {
    body = (
      <div className="flex items-center gap-3">
        <Badge tone="rose">Refunded</Badge>
        <p className="text-sm text-muted">This payment was refunded by the restaurant.</p>
      </div>
    );
  } else if (order.payment_status === 'claimed') {
    // The guest said they paid; only the staff can mark it paid. Never show "Paid" before that.
    body = (
      <div className="flex items-start gap-3" role="status">
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-saffron-soft text-[#8a5a00]">
          <Clock className="h-5 w-5" aria-hidden />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-saffron motion-safe:animate-pulse" aria-hidden />
        </span>
        <div className="min-w-0 text-sm">
          <p className="font-semibold">Waiting for staff to confirm your payment</p>
          <p className="mt-0.5 text-muted">Thanks. The counter will match your payment with {orderCode(order.order_number)} in a moment.</p>
        </div>
      </div>
    );
  } else if (order.payment_method === 'counter') {
    body = (
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sunk text-fg/70">
          <Store className="h-5 w-5" aria-hidden />
        </span>
        <div className="text-sm">
          {order.order_type === 'takeaway' ? (
            <>
              <p className="font-semibold">Pay at the counter when you pick up</p>
              <p className="mt-0.5 text-muted">Quote {orderCode(order.order_number)} or your name. Cash and cards are accepted.</p>
            </>
          ) : (
            <>
              <p className="font-semibold">Pay at the counter when you leave</p>
              <p className="mt-0.5 text-muted">Quote {orderCode(order.order_number)} or your table number. Cash and cards are accepted.</p>
            </>
          )}
        </div>
      </div>
    );
  } else if (!upiLink) {
    body = (
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sunk text-fg/70">
          <Clock className="h-5 w-5" aria-hidden />
        </span>
        <div className="text-sm">
          <p className="font-semibold">UPI is not set up here yet</p>
          <p className="mt-0.5 text-muted">
            {order.order_type === 'takeaway' ? 'Please pay at the counter when you pick up.' : 'Please pay at the counter when you leave.'} Sorry for the detour.
          </p>
        </div>
      </div>
    );
  } else {
    body = (
      <div className="grid gap-4">
        <a
          href={upiLink}
          rel="noreferrer"
          className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-ember px-6 text-base font-semibold text-white shadow-[0_8px_24px_-10px_rgba(255,92,42,0.7)] transition-[transform,box-shadow] duration-300 ease-out hover:shadow-glow active:scale-[0.97]"
        >
          <Smartphone className="h-5 w-5" aria-hidden />
          Pay <span className="tnum">{formatINR(order.total)}</span> via UPI
        </a>
        <div className="hidden items-center gap-4 rounded-2xl bg-sunk p-4 md:flex">
          <div className="rounded-xl bg-white p-2">
            <QRCodeSVG value={upiLink} size={112} bgColor="#ffffff" fgColor="#0C0D10" level="M" marginSize={0} />
          </div>
          <div className="text-sm">
            <p className="font-semibold">On a laptop? Scan with any UPI app</p>
            <p className="mt-0.5 text-muted">
              Paying {restaurant.upi_payee_name ?? restaurant.name} · {restaurant.upi_id}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-muted">Done paying? Let the counter know so they can confirm it.</p>
          <Button variant="outline" size="md" onClick={onClaim} loading={claiming} leftIcon={<CheckCircle2 className="h-4 w-4" aria-hidden />}>
            I&apos;ve paid
          </Button>
        </div>
      </div>
    );
  }

  return (
    <section aria-labelledby="payment-heading" className="rounded-3xl border border-line/10 bg-surface p-5 shadow-soft">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 id="payment-heading" className="font-display text-lg font-bold">
          Payment
        </h2>
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted">{PAYMENT_METHOD_LABEL[order.payment_method]}</p>
      </div>
      {body}
    </section>
  );
}
