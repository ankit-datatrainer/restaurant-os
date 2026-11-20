'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, IndianRupee, MessageCircle, Printer, Receipt } from 'lucide-react';
import type { OrderWithItems } from '@restaurant-os/shared';
import { ORDER_SOURCE_LABEL, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, orderCode, roundMoney } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { cn, formatDateTime, formatINR } from '@/lib/utils';
import { Button, EmptyState, PaymentStatusBadge, Skeleton } from '@/components/ui';
import { useAdmin, useAdminEvents, mergeOrder } from './admin-provider';
import { errorMessage } from './format';
import { CLAIMED_HINT, billUrl, isTakeaway, orderPlace } from './order-card';
import { chargedRates, discountNote, pickupLabel, splitGst, useHsnCodes } from './bills/bill-utils';

const PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 12mm; }
  html, body { background: #fff !important; }
  .bill-paper { box-shadow: none !important; border: none !important; max-width: none !important; }
}
`;

/** A clean, printable GST bill for one order, with WhatsApp sharing. */
export function BillView({ orderId }: { orderId: string }) {
  const { token, restaurant, setPaymentStatus } = useAdmin();
  const [order, setOrder] = React.useState<OrderWithItems | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    adminApi
      .order(token, orderId)
      .then((o) => {
        if (!cancelled) setOrder(o);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorMessage(e, 'Could not load this order.'));
      });
    return () => {
      cancelled = true;
    };
  }, [token, orderId]);

  useAdminEvents((e) => {
    if (e.type === 'order:update' && e.order.id === orderId) setOrder((prev) => (prev ? mergeOrder(prev, e.order) : prev));
  });

  const hsn = useHsnCodes(token);
  const tax = order ? roundMoney(order.tax_amount) : 0;
  const { cgst, sgst } = splitGst(tax);
  const discount = order ? roundMoney(Number(order.discount_amount ?? 0)) : 0;
  const discountText = order ? discountNote(order) : '';
  // Label the amounts with the rates this order was charged at (after its discount), not today's settings.
  const rates = React.useMemo(
    () => (order ? chargedRates(order, restaurant) : { tax_rate: restaurant.tax_rate, service_charge_rate: restaurant.service_charge_rate }),
    [order, restaurant],
  );
  const halfRate = rates.tax_rate / 2;

  const markPaid = async () => {
    if (!order) return;
    setBusy(true);
    const updated = await setPaymentStatus(order, 'paid');
    if (updated) setOrder(updated);
    setBusy(false);
  };

  const whatsappText = React.useMemo(() => {
    if (!order) return '';
    const lines = [
      restaurant.name,
      `Bill ${orderCode(order.order_number)} · ${orderPlace(order)}`,
      formatDateTime(order.placed_at),
      ...(isTakeaway(order) && order.pickup_at ? [pickupLabel(order.pickup_at)] : []),
      '',
      ...order.items.map((it) => `${it.quantity}× ${it.name}${it.options.length ? ` (${it.options.map((o) => o.choice_label).join(', ')})` : ''} ${formatINR(it.line_total)}`),
      '',
      `Subtotal ${formatINR(order.subtotal)}`,
      ...(discount > 0 ? [`Discount${discountText ? ` (${discountText})` : ''} −${formatINR(discount)}`] : []),
      ...(order.service_charge > 0 ? [`Service charge ${rates.service_charge_rate}% ${formatINR(order.service_charge)}`] : []),
      ...(tax > 0 ? [`CGST ${halfRate}% ${formatINR(cgst)}`, `SGST ${halfRate}% ${formatINR(sgst)}`] : []),
      `Total ${formatINR(order.total)}`,
      `${PAYMENT_METHOD_LABEL[order.payment_method]} · ${PAYMENT_STATUS_LABEL[order.payment_status]}`,
      ...(restaurant.gstin ? [`GSTIN ${restaurant.gstin}`] : []),
      ...(restaurant.fssai_number ? [`FSSAI Lic. No. ${restaurant.fssai_number}`] : []),
      '',
      isTakeaway(order) ? 'Thank you for ordering with us!' : 'Thank you for dining with us!',
    ];
    return lines.join('\n');
  }, [order, restaurant, tax, cgst, sgst, halfRate, rates.service_charge_rate, discount, discountText]);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="mb-5 flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/admin/billing" className="inline-flex h-10 items-center gap-1 rounded-full px-3 text-sm font-medium text-muted hover:bg-fg/5 hover:text-fg">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Billing
        </Link>
        <div className="ml-auto flex flex-wrap gap-2">
          {order?.bill_id && (
            <Link
              href={billUrl(order.bill_id)}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line/15 px-4 text-[13px] font-semibold transition hover:bg-fg/5"
              title="This order was settled on a bill"
            >
              <Receipt className="h-4 w-4" aria-hidden /> Bill receipt
            </Link>
          )}
          {order && !order.bill_id && order.payment_status !== 'paid' && order.payment_status !== 'refunded' && (
            <Button size="sm" variant="success" loading={busy} leftIcon={<IndianRupee className="h-4 w-4" />} onClick={() => void markPaid()}>
              Mark paid
            </Button>
          )}
          <a
            href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`}
            target="_blank"
            rel="noreferrer"
            className={cn('inline-flex h-9 items-center gap-1.5 rounded-full border border-line/15 px-4 text-[13px] font-semibold transition hover:bg-fg/5', !order && 'pointer-events-none opacity-50')}
            aria-disabled={!order}
          >
            <MessageCircle className="h-4 w-4" aria-hidden /> Share via WhatsApp
          </a>
          <Button size="sm" variant="dark" leftIcon={<Printer className="h-4 w-4" />} onClick={() => window.print()} disabled={!order}>
            Print
          </Button>
        </div>
      </div>

      {order?.payment_status === 'claimed' && (
        <p className="mb-4 rounded-xl bg-saffron-soft px-4 py-3 text-sm font-medium text-[#8a5a00] print:hidden" role="note">
          {CLAIMED_HINT}
        </p>
      )}

      {error ? (
        <EmptyState title="Bill unavailable" description={error} />
      ) : !order ? (
        <Skeleton className="h-[520px] w-full rounded-2xl" />
      ) : (
        <article className="bill-paper mx-auto max-w-[520px] rounded-2xl border border-line/10 bg-white p-6 text-ink shadow-soft sm:p-8" aria-label={`Bill ${orderCode(order.order_number)}`}>
          <header className="text-center">
            <h2 className="font-display text-2xl font-semibold leading-tight">{restaurant.name}</h2>
            {restaurant.tagline && <p className="mt-0.5 font-serif italic text-ink/60">{restaurant.tagline}</p>}
            {restaurant.address && <p className="mt-2 text-xs text-ink/70">{restaurant.address}</p>}
            <p className="mt-1 font-mono text-2xs uppercase tracking-[0.12em] text-ink/60">
              {restaurant.phone && <span>Ph {restaurant.phone}</span>}
              {restaurant.phone && restaurant.gstin && ' · '}
              {restaurant.gstin && <span>GSTIN {restaurant.gstin}</span>}
            </p>
            {restaurant.fssai_number && <p className="mt-0.5 font-mono text-2xs uppercase tracking-[0.12em] text-ink/60">FSSAI Lic. No. {restaurant.fssai_number}</p>}
          </header>

          <div className="my-5 border-t border-dashed border-ink/20" />

          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-ink/60">Bill no.</dt>
            <dd className="tnum text-right font-mono font-semibold">{orderCode(order.order_number)}</dd>
            <dt className="text-ink/60">{isTakeaway(order) ? 'Order' : 'Table'}</dt>
            <dd className="text-right font-medium">{orderPlace(order)}</dd>
            {isTakeaway(order) && order.pickup_at && (
              <>
                <dt className="text-ink/60">Pickup</dt>
                <dd className="tnum text-right font-mono">{pickupLabel(order.pickup_at).replace(/^Pickup /, '')}</dd>
              </>
            )}
            {order.source !== 'qr' && (
              <>
                <dt className="text-ink/60">Ordered</dt>
                <dd className="text-right">{order.source === 'pos' ? 'At the counter' : ORDER_SOURCE_LABEL[order.source]}</dd>
              </>
            )}
            <dt className="text-ink/60">Date</dt>
            <dd className="tnum text-right font-mono">{formatDateTime(order.placed_at)}</dd>
            {order.guest_name && (
              <>
                <dt className="text-ink/60">Guest</dt>
                <dd className="text-right">{order.guest_name}</dd>
              </>
            )}
          </dl>

          <div className="my-5 border-t border-dashed border-ink/20" />

          <table className="w-full text-sm">
            <thead>
              <tr className="font-mono text-2xs uppercase tracking-[0.12em] text-ink/60">
                <th className="pb-2 text-left font-medium">Item</th>
                <th className="pb-2 text-right font-medium">Qty × Price</th>
                <th className="pb-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((it) => (
                <tr key={it.id} className="align-top">
                  <td className="py-1.5 pr-2">
                    <span className="font-medium">{it.name}</span>
                    {it.options.length > 0 && <span className="block text-xs text-ink/60">{it.options.map((o) => o.choice_label).join(', ')}</span>}
                    {it.menu_item_id && hsn.get(it.menu_item_id) && <span className="block font-mono text-2xs text-ink/50">HSN/SAC {hsn.get(it.menu_item_id)}</span>}
                  </td>
                  <td className="tnum whitespace-nowrap py-1.5 text-right font-mono text-ink/70">
                    {it.quantity} × {formatINR(it.unit_price)}
                  </td>
                  <td className="tnum whitespace-nowrap py-1.5 text-right font-mono">{formatINR(it.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="my-4 border-t border-dashed border-ink/20" />

          <dl className="space-y-1 text-sm">
            <Row label="Subtotal" value={order.subtotal} />
            {discount > 0 && <Row label="Discount" note={discountText || undefined} value={-discount} />}
            {discount > 0 && <Row label="Taxable value" value={roundMoney(Number(order.subtotal) - discount)} muted />}
            {order.service_charge > 0 && <Row label={`Service charge ${rates.service_charge_rate}%`} value={order.service_charge} />}
            {tax > 0 ? (
              <>
                <Row label={`CGST ${halfRate}%`} value={cgst} />
                <Row label={`SGST ${halfRate}%`} value={sgst} />
              </>
            ) : (
              <Row label="GST" value={0} />
            )}
          </dl>
          <div className="mt-3 flex items-baseline justify-between border-t border-ink/20 pt-3">
            <span className="font-display text-lg font-semibold">Grand total</span>
            <span className="tnum font-mono text-2xl font-semibold">{formatINR(order.total)}</span>
          </div>

          <div className="mt-4 flex items-center justify-between gap-2 rounded-xl bg-paper px-3.5 py-2.5 text-sm">
            <span className="text-ink/70">{PAYMENT_METHOD_LABEL[order.payment_method]}</span>
            <PaymentStatusBadge status={order.payment_status} />
          </div>

          <p className="mt-6 text-center font-serif text-lg italic text-ink/70">Thank you for dining with us.</p>
          <p className="mt-1 text-center font-mono text-2xs uppercase tracking-[0.18em] text-ink/40">Powered by Restaurant OS</p>
        </article>
      )}
    </div>
  );
}

function Row({ label, value, note, muted }: { label: string; value: number; note?: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={cn('min-w-0', muted ? 'text-ink/50' : 'text-ink/70')}>
        {label}
        {note && <span className="block text-xs text-ink/50">{note}</span>}
      </dt>
      <dd className={cn('tnum shrink-0 font-mono', muted && 'text-ink/50')}>{value < 0 ? `−${formatINR(-value)}` : formatINR(value)}</dd>
    </div>
  );
}
