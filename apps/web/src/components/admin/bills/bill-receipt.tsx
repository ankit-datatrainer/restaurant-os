'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Printer, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import type { BillWithDetails, OrderWithItems } from '@restaurant-os/shared';
import { BILL_PAYMENT_METHOD_LABEL, billCode, orderCode, roundMoney, tableDisplay } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { cn, formatINR } from '@/lib/utils';
import { Button, EmptyState, Skeleton } from '@/components/ui';
import { useAdmin, useAdminEvents } from '../admin-provider';
import { errorMessage } from '../format';
import { isManagerRole } from '../plan';
import { isTakeaway } from '../order-card';
import { chargedRates, discountNotes, istDateTime, maskReference, splitGst, useHsnCodes } from './bill-utils';
import { RefundDialog } from './refund-dialog';
import { BillStatusBadge } from './settled-bills';

const PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 12mm; }
  html, body { background: #fff !important; }
  .bill-paper { box-shadow: none !important; border: none !important; max-width: none !important; }
}
`;

/** Where the bill was for: its table, "Takeaway", or the tables of the merged orders. */
function billPlace(bill: BillWithDetails): string {
  if (bill.table) return tableDisplay(bill.table);
  const orders = bill.orders ?? [];
  if (orders.length === 0 || orders.every((o) => isTakeaway(o))) return 'Takeaway';
  const tables = [...new Set(orders.filter((o) => o.table).map((o) => o.table!.label))];
  const withTakeaway = orders.some((o) => isTakeaway(o));
  return [...tables, ...(withTakeaway ? ['Takeaway'] : [])].join(', ') || 'Takeaway';
}

function orderHeading(o: OrderWithItems): string {
  return `${orderCode(o.order_number)} · ${isTakeaway(o) ? 'Takeaway' : tableDisplay(o.table)}`;
}

/** Printable GST receipt for a settled (or refunded) bill, with refunds for managers. */
export function BillReceipt({ billId }: { billId: string }) {
  const { token, restaurant, staff } = useAdmin();
  const hsn = useHsnCodes(token);
  const [bill, setBill] = React.useState<BillWithDetails | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [refundOpen, setRefundOpen] = React.useState(false);
  const [refunding, setRefunding] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const b = await adminApi.bill(token, billId);
      setBill(b);
      setError(null);
    } catch (e) {
      setError(errorMessage(e, 'Could not load this bill.'));
    }
  }, [token, billId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  // Refunded from another screen: an order on this bill changes payment status.
  useAdminEvents((e) => {
    if (e.type === 'order:update' && e.order.bill_id === billId && e.order.payment_status === 'refunded' && bill?.status === 'settled') void load();
  });

  const orders = bill?.orders ?? [];
  const multi = orders.length > 1;
  const guests = [...new Set(orders.map((o) => o.guest_name?.trim()).filter((n): n is string => Boolean(n)))];
  const tax = bill ? roundMoney(Number(bill.tax_amount)) : 0;
  const { cgst, sgst } = splitGst(tax);
  const discount = bill ? roundMoney(Number(bill.discount_amount)) : 0;
  const tip = bill ? roundMoney(Number(bill.tip_amount)) : 0;
  const total = bill ? roundMoney(Number(bill.total)) : 0;
  const notes = discountNotes(orders);
  const rates = bill ? chargedRates(bill, restaurant) : { tax_rate: restaurant.tax_rate, service_charge_rate: restaurant.service_charge_rate };
  const halfRate = rates.tax_rate / 2;
  const canRefund = Boolean(bill && bill.status === 'settled' && isManagerRole(staff.role));

  const refund = async (reason: string) => {
    if (!bill) return;
    setRefunding(true);
    try {
      await adminApi.refundBill(token, bill.id, reason);
      // Refetch for the full, sorted bill (the refund response may not carry the orders' items in order).
      const fresh = await adminApi.bill(token, bill.id).catch(() => null);
      if (fresh) setBill(fresh);
      else setBill({ ...bill, status: 'refunded', refund_reason: reason, refunded_at: new Date().toISOString() });
      setRefundOpen(false);
      toast.success(`${billCode(bill.bill_number)} marked refunded`, {
        description: `Send ${formatINR(total + tip)} back by cash, UPI or card. This only records the refund.`,
      });
    } catch (e) {
      toast.error(errorMessage(e, 'Could not refund this bill.'));
    } finally {
      setRefunding(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <div className="mb-5 flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/admin/billing?tab=bills" className="inline-flex h-10 items-center gap-1 rounded-full px-3 text-sm font-medium text-muted hover:bg-fg/5 hover:text-fg">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Settled bills
        </Link>
        <div className="ml-auto flex flex-wrap gap-2">
          {canRefund && (
            <Button size="sm" variant="ghost" leftIcon={<Undo2 className="h-4 w-4" />} onClick={() => setRefundOpen(true)} className="text-rose hover:bg-rose-soft">
              Refund
            </Button>
          )}
          <Button size="sm" variant="dark" leftIcon={<Printer className="h-4 w-4" />} onClick={() => window.print()} disabled={!bill}>
            Print
          </Button>
        </div>
      </div>

      {error ? (
        <EmptyState title="Receipt unavailable" description={error} />
      ) : !bill ? (
        <Skeleton className="h-[560px] w-full rounded-2xl" />
      ) : (
        <article className="bill-paper mx-auto max-w-[520px] rounded-2xl border border-line/10 bg-white p-6 text-ink shadow-soft sm:p-8" aria-label={`Receipt ${billCode(bill.bill_number)}`}>
          {bill.status === 'refunded' && (
            <div className="mb-5 rounded-xl border-2 border-rose/60 bg-rose-soft px-3.5 py-2.5 text-sm text-[#a1282c]" role="note">
              <p className="font-semibold">Refunded{bill.refunded_at ? ` on ${istDateTime(bill.refunded_at)}` : ''}</p>
              {bill.refund_reason && <p className="mt-0.5 break-words">{bill.refund_reason}</p>}
            </div>
          )}

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
            <p className="mt-3 font-mono text-2xs font-semibold uppercase tracking-[0.18em] text-ink/70">{restaurant.gstin ? 'Tax invoice' : 'Receipt'}</p>
          </header>

          <div className="my-5 border-t border-dashed border-ink/20" />

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-ink/60">Bill no.</dt>
            <dd className="tnum text-right font-mono font-semibold">{billCode(bill.bill_number)}</dd>
            <dt className="text-ink/60">Date</dt>
            <dd className="tnum text-right font-mono">{istDateTime(bill.settled_at)}</dd>
            <dt className="text-ink/60">{bill.table ? 'Table' : 'For'}</dt>
            <dd className="text-right font-medium">{billPlace(bill)}</dd>
            {orders.length > 0 && (
              <>
                <dt className="text-ink/60">{multi ? 'Orders' : 'Order'}</dt>
                <dd className="tnum text-right font-mono text-xs leading-5">{orders.map((o) => orderCode(o.order_number)).join(', ')}</dd>
              </>
            )}
            {guests.length > 0 && (
              <>
                <dt className="text-ink/60">Guest</dt>
                <dd className="text-right">{guests.join(', ')}</dd>
              </>
            )}
            <dt className="print:hidden text-ink/60">Status</dt>
            <dd className="print:hidden text-right">
              <BillStatusBadge status={bill.status} />
            </dd>
          </dl>

          <div className="my-5 border-t border-dashed border-ink/20" />

          <table className="w-full text-sm">
            <thead>
              <tr className="font-mono text-2xs uppercase tracking-[0.12em] text-ink/60">
                <th className="pb-2 text-left font-medium">Item</th>
                <th className="pb-2 text-right font-medium">Qty</th>
                <th className="pb-2 text-right font-medium">Rate</th>
                <th className="pb-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            {orders.map((o) => (
              <tbody key={o.id}>
                {multi && (
                  <tr>
                    <th colSpan={4} className="pb-1 pt-3 text-left font-mono text-2xs font-medium uppercase tracking-[0.12em] text-ink/50">
                      {orderHeading(o)}
                    </th>
                  </tr>
                )}
                {o.items.map((it) => {
                  const code = it.menu_item_id ? hsn.get(it.menu_item_id) : undefined;
                  return (
                    <tr key={it.id} className="align-top">
                      <td className="py-1.5 pr-2">
                        <span className="font-medium">{it.name}</span>
                        {it.options.length > 0 && <span className="block text-xs text-ink/60">{it.options.map((x) => x.choice_label).join(', ')}</span>}
                        {code && <span className="block font-mono text-2xs text-ink/50">HSN/SAC {code}</span>}
                      </td>
                      <td className="tnum whitespace-nowrap py-1.5 text-right font-mono text-ink/70">{it.quantity}</td>
                      <td className="tnum whitespace-nowrap py-1.5 pl-2 text-right font-mono text-ink/70">{formatINR(Number(it.unit_price))}</td>
                      <td className="tnum whitespace-nowrap py-1.5 pl-2 text-right font-mono">{formatINR(Number(it.line_total))}</td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
          {orders.length === 0 && <p className="py-2 text-center text-sm text-ink/60">The orders on this bill could not be loaded.</p>}

          <div className="my-4 border-t border-dashed border-ink/20" />

          <dl className="space-y-1 text-sm">
            <Row label="Subtotal" value={Number(bill.subtotal)} />
            {discount > 0 && <Row label="Discount" note={notes.length ? notes.join(' · ') : undefined} value={-discount} />}
            {discount > 0 && <Row label="Taxable value" value={roundMoney(Number(bill.subtotal) - discount)} muted />}
            {Number(bill.service_charge) > 0 && <Row label={`Service charge ${rates.service_charge_rate}%`} value={Number(bill.service_charge)} />}
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
            <span className="tnum font-mono text-2xl font-semibold">{formatINR(total)}</span>
          </div>
          {tip > 0 && (
            <dl className="mt-2 space-y-1 text-sm">
              <Row label="Tip" value={tip} />
              <div className="flex items-baseline justify-between font-semibold">
                <dt>Amount paid</dt>
                <dd className="tnum font-mono">{formatINR(roundMoney(total + tip))}</dd>
              </div>
            </dl>
          )}

          <div className="mt-4 rounded-xl bg-paper px-3.5 py-2.5 text-sm">
            <p className="font-mono text-2xs uppercase tracking-[0.12em] text-ink/60">Paid by</p>
            {(bill.payments ?? []).length === 0 ? (
              <p className="mt-1 text-ink/60">No payments recorded.</p>
            ) : (
              <ul className="mt-1 space-y-0.5">
                {bill.payments.map((p) => {
                  const ref = maskReference(p.reference);
                  return (
                    <li key={p.id} className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0">
                        {BILL_PAYMENT_METHOD_LABEL[p.method]}
                        {ref && <span className="ml-1.5 font-mono text-xs text-ink/50">{ref}</span>}
                      </span>
                      <span className={cn('tnum shrink-0 font-mono', bill.status === 'refunded' && 'line-through decoration-rose/60')}>{formatINR(Number(p.amount))}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {bill.note && <p className="mt-3 whitespace-pre-line break-words text-xs text-ink/60">Note: {bill.note}</p>}

          <p className="mt-6 text-center font-serif text-lg italic text-ink/70">Thank you. See you again soon.</p>
          <p className="mt-1 text-center font-mono text-2xs uppercase tracking-[0.18em] text-ink/40">Powered by Restaurant OS</p>
        </article>
      )}

      <RefundDialog
        open={refundOpen}
        busy={refunding}
        title={bill ? `Refund ${billCode(bill.bill_number)}?` : 'Refund this bill?'}
        description={
          bill ? <RefundCopy bill={bill} amount={roundMoney(total + tip)} /> : null
        }
        onCancel={() => setRefundOpen(false)}
        onConfirm={(reason) => void refund(reason)}
      />
    </div>
  );
}

function RefundCopy({ bill, amount }: { bill: BillWithDetails; amount: number }) {
  const n = bill.order_ids?.length || bill.orders?.length || 0;
  const giftCard = (bill.payments ?? []).some((p) => p.method === 'gift_card');
  return (
    <>
      <p>
        This marks the bill{n ? ` and its ${n} order${n === 1 ? '' : 's'}` : ''} as refunded ({formatINR(amount)}).
      </p>
      <p className="mt-1.5">
        {giftCard ? 'Gift card amounts go back on the card. Return the rest by cash, UPI or card yourself.' : 'It does not move money: return it by cash, UPI or card yourself.'}
      </p>
    </>
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
