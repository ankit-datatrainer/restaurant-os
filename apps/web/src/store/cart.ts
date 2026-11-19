'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { MenuItem, PaymentMethod, SelectedOption } from '@restaurant-os/shared';
import { GUEST_SESSION_TTL_HOURS, roundMoney } from '@restaurant-os/shared';
import { uuid } from '@/lib/session';

export interface CartLine {
  /** Stable key: item id + sorted option choice ids (+ the kitchen note, when there is one) */
  key: string;
  item: MenuItem;
  quantity: number;
  options: SelectedOption[];
  note?: string;
  unitPrice: number; // base + option deltas, re-checked against the live menu by `syncLines`
}

/** The open order the guest is adding dishes to (instead of placing a new order). */
export interface AddToOrderTarget {
  id: string;
  /** order_number, for "#ORD-1003" labels */
  number: number;
}

export interface SyncResult {
  /** Lines removed because the dish, or a chosen option, is gone or sold out. */
  dropped: CartLine[];
  /** True when at least one unit price changed. */
  repriced: boolean;
}

interface CartState {
  tableCode: string | null;
  lines: CartLine[];
  /** When the lines last changed. A cart older than the guest session is a leftover from an earlier visit. */
  updatedAt: number | null;
  paymentMethod: PaymentMethod;
  orderNote: string;
  guestName: string;
  /** Set while the guest is adding dishes to an open order; null for a normal checkout. */
  addToOrder: AddToOrderTarget | null;
  /**
   * Idempotency key for the current checkout and the cart contents it was made for. A retry of the
   * same cart (a timeout, then another tap, even after a reload) reuses it, so the server returns
   * the order it may already have created instead of a duplicate.
   */
  checkout: { ref: string; sig: string } | null;
  /** Coupon code the guest applied (upper-cased). Sent to the live quote; placed only when the quote accepts it. */
  coupon: string;
  setCoupon: (code: string) => void;
  setTable: (code: string) => void;
  add: (item: MenuItem, options?: SelectedOption[], note?: string, qty?: number) => void;
  increment: (key: string) => void;
  decrement: (key: string) => void;
  remove: (key: string) => void;
  setNote: (key: string, note: string) => void;
  setPaymentMethod: (m: PaymentMethod) => void;
  setOrderNote: (n: string) => void;
  setGuestName: (n: string) => void;
  setAddToOrder: (target: AddToOrderTarget | null) => void;
  /** client_ref for placing the current cart: the same value until the lines change or the order goes through. */
  checkoutRef: () => string;
  /** Empties the cart (after an order, or on "Clear order"). Leaves `addToOrder` alone. */
  clear: () => void;
  /**
   * Rebuild every line from the live menu: drop what can no longer be ordered, refresh option
   * labels and unit prices. The server always charges the menu price, so the cart must too.
   */
  syncLines: (items: MenuItem[]) => SyncResult;
  /** Quantity of a menu item across all its option variants */
  qtyOf: (itemId: string) => number;
  count: () => number;
  subtotal: () => number;
}

const CART_TTL_MS = GUEST_SESSION_TTL_HOURS * 3_600_000;
const isExpired = (updatedAt: number | null | undefined) => typeof updatedAt === 'number' && Date.now() - updatedAt > CART_TTL_MS;

/** What the guest is ordering, exactly: dish + options (the key), quantity and kitchen note per line. */
function cartSignature(tableCode: string | null, lines: CartLine[]): string {
  return JSON.stringify([tableCode, lines.map((l) => [l.key, l.quantity, l.note?.trim() ?? ''])]);
}

export function lineKey(itemId: string, options: SelectedOption[] = [], note?: string): string {
  const opt = [...options].map((o) => `${o.group_id}:${o.choice_id}`).sort().join('|');
  const base = opt ? `${itemId}__${opt}` : itemId;
  // A different kitchen note is a different line ("no onions" and "extra spicy" must not merge).
  const n = note?.trim();
  return n ? `${base}#${n}` : base;
}

export function unitPriceOf(item: MenuItem, options: SelectedOption[]): number {
  return roundMoney(item.price + options.reduce((s, o) => s + o.price_delta, 0));
}

/** The same line rebuilt from the live menu item, the original object when nothing changed, or null when it cannot be ordered. */
export function refreshLine(line: CartLine, fresh: MenuItem | undefined): CartLine | null {
  if (!fresh || !fresh.is_available) return null;
  const options: SelectedOption[] = [];
  for (const o of line.options) {
    const group = fresh.option_groups.find((g) => g.id === o.group_id);
    const choice = group?.choices.find((c) => c.id === o.choice_id);
    if (!group || !choice) return null;
    options.push({ group_id: group.id, group_name: group.name, choice_id: choice.id, choice_label: choice.label, price_delta: choice.price_delta });
  }
  const unitPrice = unitPriceOf(fresh, options);
  const same =
    unitPrice === line.unitPrice &&
    fresh.name === line.item.name &&
    fresh.price === line.item.price &&
    fresh.image_url === line.item.image_url &&
    options.every((o, i) => {
      const was = line.options[i];
      return was !== undefined && o.choice_label === was.choice_label && o.group_name === was.group_name && o.price_delta === was.price_delta;
    });
  return same ? line : { ...line, item: fresh, options, unitPrice };
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      tableCode: null,
      lines: [],
      updatedAt: null,
      paymentMethod: 'counter',
      orderNote: '',
      guestName: '',
      addToOrder: null,
      checkout: null,
      coupon: '',

      setCoupon: (code) => set({ coupon: code.trim().toUpperCase().slice(0, 20) }),

      setTable: (code) => {
        const upper = code.toUpperCase();
        const s = get();
        if (s.tableCode !== upper || isExpired(s.updatedAt)) set({ tableCode: upper, lines: [], updatedAt: null, addToOrder: null, checkout: null, coupon: '' });
      },

      add: (item, options = [], note, qty = 1) => {
        const key = lineKey(item.id, options, note);
        const unitPrice = unitPriceOf(item, options);
        set((s) => {
          const existing = s.lines.find((l) => l.key === key);
          const lines = existing
            ? s.lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(50, l.quantity + qty), note: l.note ?? note } : l))
            : [...s.lines, { key, item, quantity: qty, options, note, unitPrice }];
          return { lines, updatedAt: Date.now() };
        });
      },

      increment: (key) =>
        set((s) => ({ lines: s.lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(50, l.quantity + 1) } : l)), updatedAt: Date.now() })),

      decrement: (key) =>
        set((s) => ({
          lines: s.lines
            .map((l) => (l.key === key ? { ...l, quantity: l.quantity - 1 } : l))
            .filter((l) => l.quantity > 0),
          updatedAt: Date.now(),
        })),

      remove: (key) => set((s) => ({ lines: s.lines.filter((l) => l.key !== key), updatedAt: Date.now() })),
      setNote: (key, note) => set((s) => ({ lines: s.lines.map((l) => (l.key === key ? { ...l, note } : l)), updatedAt: Date.now() })),
      setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
      setOrderNote: (orderNote) => set({ orderNote }),
      setGuestName: (guestName) => set({ guestName }),
      setAddToOrder: (addToOrder) => set({ addToOrder }),
      checkoutRef: () => {
        const s = get();
        const sig = cartSignature(s.tableCode, s.lines);
        if (s.checkout && s.checkout.sig === sig) return s.checkout.ref;
        const ref = uuid();
        set({ checkout: { ref, sig } });
        return ref;
      },
      clear: () => set({ lines: [], orderNote: '', updatedAt: null, checkout: null, coupon: '' }),

      syncLines: (items) => {
        const byId = new Map(items.map((i) => [i.id, i] as const));
        const dropped: CartLine[] = [];
        const next: CartLine[] = [];
        let repriced = false;
        let changed = false;
        for (const line of get().lines) {
          const fresh = refreshLine(line, byId.get(line.item.id));
          if (!fresh) {
            dropped.push(line);
            changed = true;
            continue;
          }
          if (fresh !== line) {
            changed = true;
            if (fresh.unitPrice !== line.unitPrice) repriced = true;
          }
          next.push(fresh);
        }
        // Not a guest action: `updatedAt` stays so the TTL still counts from the last real change.
        if (changed) set({ lines: next });
        return { dropped, repriced };
      },

      qtyOf: (itemId) => get().lines.filter((l) => l.item.id === itemId).reduce((s, l) => s + l.quantity, 0),
      count: () => get().lines.reduce((s, l) => s + l.quantity, 0),
      subtotal: () => roundMoney(get().lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0)),
    }),
    {
      name: 'ros:cart',
      storage: createJSONStorage(() => (typeof window === 'undefined' ? (undefined as unknown as Storage) : window.localStorage)),
      partialize: (s) => ({
        tableCode: s.tableCode,
        lines: s.lines,
        updatedAt: s.updatedAt,
        paymentMethod: s.paymentMethod,
        orderNote: s.orderNote,
        guestName: s.guestName,
        addToOrder: s.addToOrder,
        checkout: s.checkout,
        coupon: s.coupon,
      }),
      // A cart left over from an earlier visit (older than the guest session) never comes back.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<CartState>;
        const stale = isExpired(p.updatedAt);
        return {
          ...current,
          ...p,
          lines: stale ? [] : (p.lines ?? []),
          updatedAt: stale ? null : (p.updatedAt ?? null),
          addToOrder: stale ? null : (p.addToOrder ?? null),
          checkout: stale ? null : (p.checkout ?? null),
          coupon: stale ? '' : (p.coupon ?? ''),
        };
      },
    },
  ),
);
