'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, CheckCircle2, Monitor, MonitorUp, Plus, Printer, Trash2, Wallet } from 'lucide-react';
import type { BillPaymentMethod, BillPreview, BillWithDetails, OrderWithItems } from '@restaurant-os/shared';
import { BILL_PAYMENT_METHODS, BILL_PAYMENT_METHOD_LABEL, billCode, buildUpiLink, orderCode, tableDisplay } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { cn, formatINR } from '@/lib/utils';
import { springSoft } from '@/lib/motion';
import { toast } from 'sonner';
import { Button, Input, OrderStatusBadge, Select, Sheet, Spinner } from '@/components/ui';
import { useAdmin } from './admin-provider';
import { isManagerRole } from './plan';
import { errorMessage, itemCount } from './format';
import { idleMessage, openDisplayWindow, postToDisplay, type DisplayBreakdownRow, type DisplayLine } from './customer-display';

type DiscountType = 'none' | 'percent' | 'flat';
type TipMode = 'none' | 'p5' | 'p10' | 'custom';

interface PaymentRow {
  id: number;
  method: BillPaymentMethod;
  amount: string;
  reference: string;
}

export interface SettleSheetProps {
  open: boolean;
  onClose: () => void;
  orders: OrderWithItems[];
  preselectedIds?: string[];
  onSettled?: (bill: BillWithDetails) => void;
}

/** Rupees → integer paise. Every comparison below happens in paise so ₹0.10 + ₹0.20 is exact. */
const toPaise = (rupees: number) => Math.round((Number.isFinite(rupees) ? rupees : 0) * 100);
const fromPaise = (p: number) => p / 100;
const parseAmount = (s: string) => {
  const n = Number.parseFloat(s.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const REFERENCE_COPY: Partial<Record<BillPaymentMethod, { label: string; placeholder: string; required: boolean }>> = {
  gift_card: { label: 'Gift card code', placeholder: 'Code on the card', required: true },
  card: { label: 'Card slip no.', placeholder: 'Optional, e.g. last 4 digits', required: false },
  upi: { label: 'UPI reference', placeholder: 'Optional, from the payment app', required: false },
};

let rowSeq = 1;
const newRow = (method: BillPaymentMethod, amount = ''): PaymentRow => ({ id: rowSeq++, method, amount, reference: '' });

/** Cash notes a guest is likely to hand over for this amount (in rupees, above the amount due). */
function tenderSuggestions(dueRupees: number): number[] {
  if (dueRupees <= 0) return [];
  const out = new Set<number>();
  for (const step of [50, 100, 500, 2000]) {
    const v = Math.ceil(dueRupees / step) * step;
    if (v > dueRupees) out.add(v);
  }
  return [...out].sort((a, b) => a - b).slice(0, 3);
}

export function SettleSheet({ open, onClose, orders, preselectedIds, onSettled }: SettleSheetProps) {
  const { token, restaurant, staff } = useAdmin();
  const reduce = useReducedMotion();
  const canDiscount = isManagerRole(staff.role);

  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [discountType, setDiscountType] = React.useState<DiscountType>('none');
  const [discountValue, setDiscountValue] = React.useState('');
  const [discountReason, setDiscountReason] = React.useState('');
  const [tipMode, setTipMode] = React.useState<TipMode>('none');
  const [tipCustom, setTipCustom] = React.useState('');
  const [rows, setRows] = React.useState<PaymentRow[]>(() => [newRow('cash')]);
  const [preview, setPreview] = React.useState<{ key: string; data: BillPreview } | null>(null);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [bill, setBill] = React.useState<BillWithDetails | null>(null);
  const [settledChange, setSettledChange] = React.useState(0);
  const [onDisplay, setOnDisplay] = React.useState(false);
  const seq = React.useRef(0);

  // Fresh state every time the sheet opens.
  const preKey = (preselectedIds ?? []).join(',');
  React.useEffect(() => {
    if (!open) return;
    setSelected(new Set(preselectedIds && preselectedIds.length > 0 ? preselectedIds : orders.map((o) => o.id)));
    setDiscountType('none');
    setDiscountValue('');
    setDiscountReason('');
    setTipMode('none');
    setTipCustom('');
    setRows([newRow('cash')]);
    setPreview(null);
    setPreviewError(null);
    setBill(null);
    setSettledChange(0);
    setOnDisplay(false);
  }, [open, preKey]);

  const chosen = React.useMemo(() => orders.filter((o) => selected.has(o.id)), [orders, selected]);
  const ids = React.useMemo(() => chosen.map((o) => o.id).sort(), [chosen]);

  const effType: DiscountType = canDiscount ? discountType : 'none';
  const effValue = effType === 'none' ? 0 : parseAmount(discountValue);
  const discountInvalid =
    effType === 'percent' && effValue > 100 ? 'A percentage discount cannot be more than 100%.' : null;
  const reqKey = JSON.stringify([ids, effType, effValue]);

  // Live bill preview (debounced); the server applies happy hour, coupons and this discount.
  React.useEffect(() => {
    if (!open || bill) return;
    if (ids.length === 0 || discountInvalid) {
      setPreview(null);
      setPreviewLoading(false);
      return;
    }
    setPreviewLoading(true);
    const mySeq = ++seq.current;
    const t = window.setTimeout(async () => {
      try {
        const data = await adminApi.billPreview(token, { order_ids: ids, discount_type: effType, discount_value: effValue });
        if (mySeq !== seq.current) return;
        setPreview({
          key: reqKey,
          data: {
            subtotal: Number(data.subtotal),
            discount: Number(data.discount),
            extra_discount: Number(data.extra_discount),
            service_charge: Number(data.service_charge),
            tax: Number(data.tax),
            total: Number(data.total),
          },
        });
        setPreviewError(null);
      } catch (e) {
        if (mySeq !== seq.current) return;
        setPreviewError(errorMessage(e, 'Could not work out the bill.'));
      } finally {
        if (mySeq === seq.current) setPreviewLoading(false);
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [open, reqKey, token, bill, discountInvalid]);

  const fresh = preview && preview.key === reqKey ? preview.data : null;
  const shown = fresh ?? preview?.data ?? null;

  // ----- Money, all in paise -----
  const totalP = toPaise(shown?.total ?? 0);
  const tipP =
    tipMode === 'p5' ? Math.round(totalP * 0.05 / 100) * 100 : tipMode === 'p10' ? Math.round(totalP * 0.1 / 100) * 100 : tipMode === 'custom' ? toPaise(parseAmount(tipCustom)) : 0;
  const dueP = totalP + tipP;
  const taxP = toPaise(shown?.tax ?? 0);
  const cgstP = Math.round(taxP / 2);
  const sgstP = taxP - cgstP;

  const nonCashP = rows.filter((r) => r.method !== 'cash').reduce((s, r) => s + toPaise(parseAmount(r.amount)), 0);
  const cashTenderedP = rows.filter((r) => r.method === 'cash').reduce((s, r) => s + toPaise(parseAmount(r.amount)), 0);
  const hasCash = rows.some((r) => r.method === 'cash');
  const cashNeededP = Math.max(0, dueP - nonCashP);
  const cashAppliedP = Math.min(cashTenderedP, cashNeededP);
  const paidP = nonCashP + cashAppliedP;
  const remainingP = dueP - paidP;
  const changeP = hasCash ? Math.max(0, cashTenderedP - cashNeededP) : 0;
  const overpaidNonCash = nonCashP > dueP;
  const missingReference = rows.some((r) => REFERENCE_COPY[r.method]?.required && parseAmount(r.amount) > 0 && !r.reference.trim());
  const needsReason = effType !== 'none' && effValue > 0 && !discountReason.trim();

  const blocker: string | null =
    chosen.length === 0
      ? 'Pick at least one order.'
      : discountInvalid
        ? discountInvalid
        : previewError && !fresh
          ? previewError
          : !fresh
            ? 'Working out the bill…'
            : needsReason
              ? 'Add a reason for the discount.'
              : overpaidNonCash
                ? 'Card, UPI and gift card payments add up to more than the bill. Only cash can be more (for change).'
                : missingReference
                  ? 'Enter the gift card code.'
                  : Math.abs(remainingP) > 1
                    ? `${formatINR(fromPaise(remainingP))} still to collect.`
                    : null;

  // ----- Customer display -----
  const displayLines = React.useMemo<DisplayLine[]>(() => {
    const map = new Map<string, DisplayLine>();
    for (const o of chosen) {
      for (const it of o.items) {
        const name = it.options.length ? `${it.name} (${it.options.map((x) => x.choice_label).join(', ')})` : it.name;
        const cur = map.get(name);
        if (cur) {
          cur.qty += it.quantity;
          cur.amount = fromPaise(toPaise(cur.amount) + toPaise(Number(it.line_total)));
        } else {
          map.set(name, { name, qty: it.quantity, amount: Number(it.line_total) });
        }
      }
    }
    return [...map.values()];
  }, [chosen]);

  const billLabel = React.useMemo(() => {
    const withTable = chosen.find((o) => o.table);
    const where = withTable ? tableDisplay(withTable.table) : 'Takeaway';
    const codes = chosen.map((o) => orderCode(o.order_number));
    return codes.length > 0 && codes.length <= 2 ? `${where} · ${codes.join(', ')}` : where;
  }, [chosen]);

  const upiRow = rows.find((r) => r.method === 'upi' && parseAmount(r.amount) > 0);
  const upiAmountP = upiRow ? toPaise(parseAmount(upiRow.amount)) : dueP;
  const upiLink =
    restaurant.upi_id && upiAmountP > 0
      ? buildUpiLink({ vpa: restaurant.upi_id, payee: restaurant.upi_payee_name || restaurant.name, amount: fromPaise(upiAmountP), note: `${restaurant.name} bill` })
      : null;

  const breakdown = React.useMemo<DisplayBreakdownRow[]>(() => {
    if (!shown) return [];
    const out: DisplayBreakdownRow[] = [{ label: 'Subtotal', amount: shown.subtotal }];
    if (shown.discount > 0) out.push({ label: 'Discount', amount: -shown.discount });
    if (shown.service_charge > 0) out.push({ label: 'Service charge', amount: shown.service_charge });
    if (shown.tax > 0) out.push({ label: 'GST', amount: shown.tax });
    if (tipP > 0) out.push({ label: 'Tip', amount: fromPaise(tipP) });
    return out;
  }, [shown, tipP]);

  const pushToDisplay = React.useCallback(() => {
    const ok = postToDisplay({
      type: 'bill',
      restaurantName: restaurant.name,
      billLabel,
      lines: displayLines,
      total: fromPaise(dueP),
      upiLink,
      breakdown,
    });
    return ok;
  }, [restaurant.name, billLabel, displayLines, dueP, upiLink, breakdown]);

  // Keep the display in step while it shows this bill.
  React.useEffect(() => {
    if (onDisplay && !bill && fresh) pushToDisplay();
  }, [onDisplay, bill, fresh, pushToDisplay]);

  const showOnDisplay = () => {
    if (!shown) return;
    if (pushToDisplay()) {
      setOnDisplay(true);
      toast.success('Showing the bill on the customer display.', { description: 'Open /admin/display on the guest-facing screen if it is not open yet.' });
    } else {
      toast.error('This browser cannot talk to the customer display.');
    }
  };

  const close = () => {
    if (onDisplay && !bill) postToDisplay(idleMessage(restaurant));
    onClose();
  };

  // ----- Payment rows -----
  const updateRow = (id: number, patch: Partial<PaymentRow>) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRow = (id: number) => setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
  const addRow = () =>
    setRows((prev) => {
      const used = new Set(prev.map((r) => r.method));
      const method = (['upi', 'card', 'cash', 'gift_card', 'other'] as BillPaymentMethod[]).find((m) => !used.has(m)) ?? 'other';
      return [...prev, newRow(method, remainingP > 0 ? fromPaise(remainingP).toFixed(2) : '')];
    });
  const fillRemaining = () => {
    if (remainingP <= 0) return;
    setRows((prev) => {
      const target = [...prev].reverse().find((r) => parseAmount(r.amount) === 0) ?? prev[prev.length - 1];
      if (!target) return prev;
      return prev.map((r) => (r.id === target.id ? { ...r, amount: fromPaise(toPaise(parseAmount(r.amount)) + remainingP).toFixed(2) } : r));
    });
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const settle = async () => {
    if (blocker || busy || !fresh) return;
    const payments: Array<{ method: BillPaymentMethod; amount: number; reference?: string }> = rows
      .filter((r) => r.method !== 'cash' && parseAmount(r.amount) > 0)
      .map((r) => ({ method: r.method, amount: fromPaise(toPaise(parseAmount(r.amount))), reference: r.reference.trim() || undefined }));
    // Cash is recorded at exactly what the bill needs; the rest goes back as change.
    if (cashAppliedP > 0) payments.push({ method: 'cash', amount: fromPaise(cashAppliedP) });
    if (payments.length === 0) {
      toast.error('Add how the bill was paid.');
      return;
    }
    setBusy(true);
    try {
      const result = await adminApi.settleBill(token, {
        order_ids: ids,
        discount_type: effType,
        discount_value: effType === 'none' ? undefined : effValue,
        discount_reason: effType === 'none' ? undefined : discountReason.trim() || undefined,
        tip: tipP > 0 ? fromPaise(tipP) : undefined,
        payments,
      });
      setSettledChange(changeP);
      setBill(result);
      if (onDisplay) postToDisplay({ type: 'paid', total: fromPaise(dueP) });
      toast.success(`Bill ${billCode(result.bill_number)} settled.`);
      onSettled?.(result);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not settle the bill.'));
    } finally {
      setBusy(false);
    }
  };

  // ----- Success -----
  if (bill) {
    const paid = Number(bill.total) + Number(bill.tip_amount);
    return (
      <Sheet open={open} onClose={close} title="Bill settled" description={`${billCode(bill.bill_number)} · ${bill.order_ids.length} order${bill.order_ids.length === 1 ? '' : 's'}`}>
        <div className="flex flex-col items-center py-4 text-center">
          <motion.span
            initial={reduce ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={springSoft}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-mint-soft text-[#1b6f49]"
            aria-hidden
          >
            <CheckCircle2 className="h-8 w-8" />
          </motion.span>
          <p className="mt-4 font-mono text-2xs uppercase tracking-[0.16em] text-muted">Bill number</p>
          <p className="tnum font-display text-3xl font-semibold">{billCode(bill.bill_number)}</p>
          <p className="tnum mt-1 font-mono text-lg">{formatINR(paid)} paid</p>
          {bill.payments.length > 0 && (
            <p className="mt-1 text-sm text-muted">
              {bill.payments.map((p) => `${BILL_PAYMENT_METHOD_LABEL[p.method]} ${formatINR(Number(p.amount))}`).join(' · ')}
            </p>
          )}
          {settledChange > 0 && (
            <p className="mt-4 rounded-2xl bg-saffron-soft px-5 py-3 text-[#8a5a00]">
              <span className="block font-mono text-2xs uppercase tracking-[0.14em]">Change to give</span>
              <span className="tnum font-display text-2xl font-semibold">{formatINR(fromPaise(settledChange))}</span>
            </p>
          )}
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Button variant="outline" href={`/admin/billing/bills/${bill.id}`} external leftIcon={<Printer className="h-4 w-4" />}>
            Print receipt
          </Button>
          <Button onClick={close} leftIcon={<Check className="h-4 w-4" />}>
            Done
          </Button>
        </div>
      </Sheet>
    );
  }

  const suggestions = hasCash ? tenderSuggestions(fromPaise(cashNeededP)) : [];
  const firstCash = rows.find((r) => r.method === 'cash');

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Settle bill"
      description={orders.length > 1 ? 'Tick the orders to put on one bill.' : billLabel}
      className="max-w-xl"
      footer={
        <div className="space-y-2">
          {blocker && fresh !== null && <p className="text-center text-xs text-muted" aria-live="polite">{blocker}</p>}
          <Button className="w-full" size="lg" onClick={() => void settle()} loading={busy} disabled={Boolean(blocker)} leftIcon={<Wallet className="h-4 w-4" />}>
            {fresh ? `Settle ${formatINR(fromPaise(dueP))}` : 'Settle bill'}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Orders */}
        <section aria-label="Orders on this bill">
          <p className="eyebrow mb-2">Orders</p>
          {orders.length === 0 ? (
            <p className="rounded-xl bg-sunk px-3.5 py-3 text-sm text-muted">No unpaid orders to settle.</p>
          ) : (
            <ul className="space-y-1.5">
              {orders.map((o) => {
                const on = selected.has(o.id);
                return (
                  <li key={o.id}>
                    <label
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition',
                        on ? 'border-ember/40 bg-ember-soft/40' : 'border-line/10 hover:bg-sunk/60',
                      )}
                    >
                      <input type="checkbox" checked={on} onChange={() => toggle(o.id)} className="h-4 w-4 accent-[#FF5C2A]" />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="tnum font-mono text-sm font-semibold">{orderCode(o.order_number)}</span>
                          <OrderStatusBadge status={o.status} />
                        </span>
                        <span className="block truncate text-xs text-muted">
                          {tableDisplay(o.table)} · {itemCount(o)} item{itemCount(o) === 1 ? '' : 's'}
                          {o.guest_name ? ` · ${o.guest_name}` : ''}
                          {o.payment_status === 'claimed' ? ' · guest says paid by UPI' : ''}
                        </span>
                      </span>
                      <span className="tnum shrink-0 font-mono text-sm font-semibold">{formatINR(Number(o.total))}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Discount (managers) */}
        {canDiscount && (
          <section aria-label="Bill discount">
            <p className="eyebrow mb-2">Discount</p>
            <Segmented
              value={discountType}
              onChange={(v) => setDiscountType(v as DiscountType)}
              options={[
                { id: 'none', label: 'None' },
                { id: 'percent', label: '%' },
                { id: 'flat', label: '₹' },
              ]}
              label="Discount type"
            />
            {discountType !== 'none' && (
              <div className="mt-2 grid gap-2 sm:grid-cols-[140px_1fr]">
                <Input
                  aria-label={discountType === 'percent' ? 'Discount percent' : 'Discount in rupees'}
                  inputMode="decimal"
                  placeholder={discountType === 'percent' ? '10' : '100'}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  prefix={discountType === 'percent' ? '%' : '₹'}
                  error={discountInvalid ?? undefined}
                />
                <Input aria-label="Reason for the discount" placeholder="Reason, e.g. regular guest, late food" value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} maxLength={120} />
              </div>
            )}
          </section>
        )}

        {/* Tip */}
        <section aria-label="Tip">
          <p className="eyebrow mb-2">Tip</p>
          <Segmented
            value={tipMode}
            onChange={(v) => setTipMode(v as TipMode)}
            options={[
              { id: 'none', label: 'None' },
              { id: 'p5', label: '5%' },
              { id: 'p10', label: '10%' },
              { id: 'custom', label: 'Custom ₹' },
            ]}
            label="Tip"
          />
          {tipMode === 'custom' && (
            <div className="mt-2 max-w-[180px]">
              <Input aria-label="Tip in rupees" inputMode="decimal" placeholder="50" value={tipCustom} onChange={(e) => setTipCustom(e.target.value)} prefix="₹" />
            </div>
          )}
        </section>

        {/* Totals */}
        <section aria-label="Bill total" className="rounded-2xl bg-sunk/70 p-4">
          {!shown ? (
            <div className="flex items-center gap-2 text-sm text-muted">
              {chosen.length === 0 ? 'Pick an order to see the total.' : previewError ? previewError : (<><Spinner className="h-4 w-4" /> Working out the bill…</>)}
            </div>
          ) : (
            <dl className={cn('space-y-1.5 text-sm transition-opacity', !fresh && previewLoading && 'opacity-60')}>
              <Row label="Subtotal" value={shown.subtotal} />
              {shown.discount > 0 && (
                <Row
                  label={shown.extra_discount > 0 && shown.extra_discount < shown.discount ? `Discounts (incl. ${formatINR(shown.extra_discount)} on this bill)` : 'Discount'}
                  value={-shown.discount}
                  tone="mint"
                />
              )}
              {shown.service_charge > 0 && <Row label="Service charge" value={shown.service_charge} />}
              {taxP > 0 && (
                <>
                  <Row label="CGST" value={fromPaise(cgstP)} />
                  <Row label="SGST" value={fromPaise(sgstP)} />
                </>
              )}
              <Row label="Bill total" value={shown.total} strong />
              {tipP > 0 && <Row label="Tip" value={fromPaise(tipP)} />}
              <div className="hairline-t my-2" />
              <Row label="Amount due" value={fromPaise(dueP)} strong big />
              <Row label="Paid so far" value={fromPaise(paidP)} />
              {changeP > 0 ? (
                <Row label="Change to give" value={fromPaise(changeP)} tone="saffron" strong />
              ) : (
                <Row label="Remaining" value={fromPaise(Math.max(0, remainingP))} tone={remainingP > 1 ? 'rose' : 'mint'} strong />
              )}
            </dl>
          )}
        </section>

        {/* Payments */}
        <section aria-label="Payments">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="eyebrow">Payment</p>
            {remainingP > 1 && fresh && (
              <button type="button" onClick={fillRemaining} className="tnum rounded-full bg-ember-soft px-3 py-1 font-mono text-2xs font-semibold uppercase tracking-[0.1em] text-ember-3 transition hover:bg-ember/20">
                Fill remaining {formatINR(fromPaise(remainingP))}
              </button>
            )}
          </div>
          <ul className="space-y-2">
            {rows.map((r) => {
              const ref = REFERENCE_COPY[r.method];
              return (
                <li key={r.id} className="rounded-xl border border-line/10 p-2.5">
                  <div className="flex items-end gap-2">
                    <div className="w-[130px] shrink-0">
                      <Select aria-label="Payment method" value={r.method} onChange={(e) => updateRow(r.id, { method: e.target.value as BillPaymentMethod })} className="h-10">
                        {BILL_PAYMENT_METHODS.map((m) => (
                          <option key={m} value={m}>
                            {BILL_PAYMENT_METHOD_LABEL[m]}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="min-w-0 flex-1">
                      <Input
                        aria-label={r.method === 'cash' ? 'Cash received' : 'Amount'}
                        inputMode="decimal"
                        placeholder={r.method === 'cash' ? 'Cash received' : 'Amount'}
                        value={r.amount}
                        onChange={(e) => updateRow(r.id, { amount: e.target.value })}
                        prefix="₹"
                        className="h-10"
                      />
                    </div>
                    {rows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRow(r.id)}
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-rose-soft hover:text-rose"
                        aria-label={`Remove ${BILL_PAYMENT_METHOD_LABEL[r.method]} payment`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {ref && (
                    <div className="mt-2">
                      <Input
                        aria-label={ref.label}
                        placeholder={`${ref.label}${ref.required ? ' (required)' : ''} · ${ref.placeholder}`}
                        value={r.reference}
                        onChange={(e) => updateRow(r.id, { reference: e.target.value })}
                        maxLength={60}
                        className="h-10 text-sm"
                        error={ref.required && parseAmount(r.amount) > 0 && !r.reference.trim() ? 'Needed to charge the gift card.' : undefined}
                      />
                    </div>
                  )}
                  {r.method === 'cash' && r.id === firstCash?.id && fresh && cashNeededP > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <QuickAmount onClick={() => updateRow(r.id, { amount: fromPaise(cashNeededP).toFixed(2) })}>Exact {formatINR(fromPaise(cashNeededP))}</QuickAmount>
                      {suggestions.map((s) => (
                        <QuickAmount key={s} onClick={() => updateRow(r.id, { amount: String(s) })}>
                          {formatINR(s)}
                        </QuickAmount>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={addRow} disabled={rows.length >= 6}>
              Add payment (split)
            </Button>
          </div>
          {changeP > 0 && (
            <p className="mt-2 rounded-xl bg-saffron-soft px-3.5 py-2.5 text-sm font-medium text-[#8a5a00]">
              Change to give: <span className="tnum font-mono font-semibold">{formatINR(fromPaise(changeP))}</span>. The bill records cash of{' '}
              <span className="tnum font-mono">{formatINR(fromPaise(cashAppliedP))}</span>.
            </p>
          )}
        </section>

        {/* Customer display */}
        <section aria-label="Customer display" className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-line/15 p-3">
          <Monitor className="h-4 w-4 text-muted" aria-hidden />
          <p className="min-w-0 flex-1 text-xs text-muted">
            {onDisplay ? 'The guest screen shows this bill and updates as you change it.' : restaurant.upi_id ? 'Show the total and a UPI QR on the guest screen.' : 'Show the total on the guest screen. Add a UPI ID in Settings to show a QR too.'}
          </p>
          <Button variant="outline" size="sm" onClick={showOnDisplay} disabled={!shown} leftIcon={<MonitorUp className="h-4 w-4" />}>
            {onDisplay ? 'Show again' : 'Show on customer display'}
          </Button>
          <button type="button" onClick={openDisplayWindow} className="text-xs font-semibold text-ember-3 underline-offset-2 hover:underline">
            Open display
          </button>
        </section>
      </div>
    </Sheet>
  );
}

function Row({ label, value, strong, big, tone }: { label: string; value: number; strong?: boolean; big?: boolean; tone?: 'mint' | 'rose' | 'saffron' }) {
  const toneCls = tone === 'mint' ? 'text-[#1b6f49]' : tone === 'rose' ? 'text-[#a1282c]' : tone === 'saffron' ? 'text-[#8a5a00]' : '';
  return (
    <div className={cn('flex items-baseline justify-between gap-3', toneCls)}>
      <dt className={cn(strong ? 'font-semibold' : 'text-muted', toneCls)}>{label}</dt>
      <dd className={cn('tnum font-mono', strong && 'font-semibold', big && 'text-lg')}>
        {value < 0 ? `−${formatINR(-value)}` : formatINR(value)}
      </dd>
    </div>
  );
}

function QuickAmount({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="tnum h-8 rounded-full border border-line/15 bg-surface px-3 font-mono text-xs font-medium transition hover:border-line/30 active:scale-[0.97]">
      {children}
    </button>
  );
}

/** Pill segmented control in the admin style (same look as the billing date range). */
export function Segmented({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ id: string; label: React.ReactNode }>;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn('inline-flex max-w-full rounded-full bg-sunk p-1', className)} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn('h-9 shrink-0 rounded-full px-4 text-[13px] font-semibold transition', value === o.id ? 'bg-surface text-fg shadow-soft' : 'text-muted hover:text-fg')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
