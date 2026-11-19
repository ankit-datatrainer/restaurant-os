import * as React from 'react';
import type { BillPayment, BillPaymentMethod, MenuItem, Order } from '@restaurant-os/shared';
import { BILL_PAYMENT_METHOD_LABEL, BILL_PAYMENT_METHODS, formatINR, roundMoney } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
const IST = 'Asia/Kolkata';

/** Midnight in India (IST) `daysAgo` days before today, as a Date. */
export function istMidnight(daysAgo = 0, now: number = Date.now()): Date {
  const istDay = Math.floor((now + IST_OFFSET_MS) / DAY_MS) * DAY_MS;
  return new Date(istDay - IST_OFFSET_MS - daysAgo * DAY_MS);
}

/** "7:30 pm" in IST. */
export function istTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: IST });
}

/** "26 Oct, 7:30 pm" in IST. */
export function istDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: IST });
}

/** "26 Oct 2026" in IST. */
export function istDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: IST });
}

/** True when the ISO time falls on today's date in IST. */
export function isTodayIST(iso: string, now: number = Date.now()): boolean {
  const t = new Date(iso).getTime();
  const start = istMidnight(0, now).getTime();
  return t >= start && t < start + DAY_MS;
}

/** "Pickup 7:30 pm", or "Pickup 27 Oct, 7:30 pm" when the pickup is not today. */
export function pickupLabel(iso: string): string {
  return `Pickup ${isTodayIST(iso) ? istTime(iso) : istDateTime(iso)}`;
}

/**
 * Rates an order or bill was charged at, derived from its stored amounts. Unlike `orderRates()`
 * this takes the discount into account: service charge is on (subtotal − discount) and GST is on
 * (subtotal − discount + service charge), exactly as `place_order` / `settle_bill` compute them.
 */
export function chargedRates(
  x: Pick<Order, 'subtotal' | 'service_charge' | 'tax_amount'> & { discount_amount?: number | null },
  current: { tax_rate: number; service_charge_rate: number },
): { tax_rate: number; service_charge_rate: number } {
  const base = Number(x.subtotal) - Number(x.discount_amount ?? 0);
  const service = Number(x.service_charge);
  const tax = Number(x.tax_amount);
  const pct = (part: number, of: number) => Math.round((part / of) * 1000) / 10; // one decimal: 5, 12.5, 18
  return {
    tax_rate: base + service > 0 ? pct(tax, base + service) : current.tax_rate,
    service_charge_rate: base > 0 ? pct(service, base) : current.service_charge_rate,
  };
}

/** CGST / SGST halves of a stored GST amount (SGST takes the odd paisa). */
export function splitGst(tax: number): { cgst: number; sgst: number } {
  const t = roundMoney(Number(tax));
  const cgst = roundMoney(t / 2);
  return { cgst, sgst: roundMoney(t - cgst) };
}

/** "Happy hour · Coupon WELCOME10" — the stored reason, plus the coupon code when the reason leaves it out. */
export function discountNote(order: Pick<Order, 'discount_reason' | 'coupon_code'>): string {
  const parts: string[] = [];
  if (order.discount_reason) parts.push(order.discount_reason);
  if (order.coupon_code && !(order.discount_reason ?? '').toUpperCase().includes(order.coupon_code.toUpperCase())) {
    parts.push(`Coupon ${order.coupon_code}`);
  }
  return parts.join(' · ');
}

/** Distinct discount reasons across several orders (a merged bill). */
export function discountNotes(orders: Array<Pick<Order, 'discount_reason' | 'coupon_code' | 'discount_amount'>>): string[] {
  const seen = new Set<string>();
  for (const o of orders) {
    if (Number(o.discount_amount) <= 0) continue;
    for (const part of discountNote(o).split(' · ')) {
      const p = part.trim();
      if (p) seen.add(p);
    }
  }
  return [...seen];
}

/** Light masking for card slips / UPI refs / gift card codes: keep the last 4 characters. */
export function maskReference(ref: string | null | undefined): string | null {
  const r = (ref ?? '').trim();
  if (!r) return null;
  if (r.length <= 4) return r;
  return `•••• ${r.slice(-4)}`;
}

/** Sum of payments per method, in BILL_PAYMENT_METHODS order, skipping zeros. */
export function paymentsByMethod(payments: Array<Pick<BillPayment, 'method' | 'amount'>>): Array<{ method: BillPaymentMethod; amount: number }> {
  const sums = new Map<BillPaymentMethod, number>();
  for (const p of payments) sums.set(p.method, roundMoney((sums.get(p.method) ?? 0) + Number(p.amount)));
  return BILL_PAYMENT_METHODS.filter((m) => (sums.get(m) ?? 0) > 0).map((m) => ({ method: m, amount: sums.get(m)! }));
}

/** "Cash ₹500 · UPI ₹240" */
export function paymentsLine(payments: Array<Pick<BillPayment, 'method' | 'amount'>>): string {
  return paymentsByMethod(payments)
    .map((p) => `${BILL_PAYMENT_METHOD_LABEL[p.method]} ${formatINR(p.amount)}`)
    .join(' · ');
}

// ---------------------------------------------------------------------------
// HSN / SAC codes: one menu fetch per page load, shared by every bill on screen.
// ---------------------------------------------------------------------------

let hsnCache: { token: string; promise: Promise<Map<string, string>> } | null = null;

function loadHsn(token: string): Promise<Map<string, string>> {
  if (hsnCache && hsnCache.token === token) return hsnCache.promise;
  const promise = adminApi
    .items(token)
    .then((items: MenuItem[]) => {
      const map = new Map<string, string>();
      for (const it of items) if (it.hsn_code && it.hsn_code.trim()) map.set(it.id, it.hsn_code.trim());
      return map;
    })
    .catch(() => {
      // Not fatal: the bill still prints, just without HSN codes. Try again next time.
      hsnCache = null;
      return new Map<string, string>();
    });
  hsnCache = { token, promise };
  return promise;
}

/** menu_item_id → HSN/SAC code, for the dishes that have one. Empty until loaded. */
export function useHsnCodes(token: string | null | undefined): Map<string, string> {
  const [map, setMap] = React.useState<Map<string, string>>(() => new Map());
  React.useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void loadHsn(token).then((m) => {
      if (!cancelled) setMap(m);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);
  return map;
}
