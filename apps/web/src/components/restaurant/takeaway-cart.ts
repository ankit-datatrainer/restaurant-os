'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { MenuItem, PaymentMethod, SelectedOption } from '@restaurant-os/shared';
import { GUEST_SESSION_TTL_HOURS, roundMoney } from '@restaurant-os/shared';
import { uuid } from '@/lib/session';
import { lineKey, refreshLine, unitPriceOf, type CartLine, type SyncResult } from '@/store/cart';

/**
 * Takeaway cart for /r/[slug]. Its own persisted store, so it never mixes with a table cart
 * (`ros:cart`), and it empties itself when the guest moves to another restaurant.
 */
interface TakeawayCartState {
  slug: string | null;
  lines: CartLine[];
  updatedAt: number | null;
  paymentMethod: PaymentMethod;
  orderNote: string;
  /** Applied coupon code (upper-cased); sent to the order only when the live quote accepts it. */
  coupon: string;
  checkout: { ref: string; sig: string } | null;
  setSlug: (slug: string) => void;
  add: (item: MenuItem, options?: SelectedOption[], note?: string, qty?: number) => void;
  increment: (key: string) => void;
  decrement: (key: string) => void;
  setPaymentMethod: (m: PaymentMethod) => void;
  setOrderNote: (n: string) => void;
  setCoupon: (code: string) => void;
  /** Idempotency key for placing exactly this cart. */
  checkoutRef: () => string;
  clear: () => void;
  syncLines: (items: MenuItem[]) => SyncResult;
}

const TTL_MS = GUEST_SESSION_TTL_HOURS * 3_600_000;
const expired = (at: number | null | undefined) => typeof at === 'number' && Date.now() - at > TTL_MS;
const signature = (slug: string | null, lines: CartLine[]) => JSON.stringify([slug, lines.map((l) => [l.key, l.quantity, l.note?.trim() ?? ''])]);

export const useTakeawayCart = create<TakeawayCartState>()(
  persist(
    (set, get) => ({
      slug: null,
      lines: [],
      updatedAt: null,
      paymentMethod: 'counter',
      orderNote: '',
      coupon: '',
      checkout: null,

      setSlug: (raw) => {
        const slug = raw.toLowerCase();
        const s = get();
        if (s.slug !== slug || expired(s.updatedAt)) set({ slug, lines: [], updatedAt: null, checkout: null, coupon: '', orderNote: '' });
      },

      add: (item, options = [], note, qty = 1) => {
        const key = lineKey(item.id, options, note);
        const unitPrice = unitPriceOf(item, options);
        set((s) => {
          const existing = s.lines.find((l) => l.key === key);
          const lines = existing
            ? s.lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(50, l.quantity + qty) } : l))
            : [...s.lines, { key, item, quantity: qty, options, note, unitPrice }];
          return { lines, updatedAt: Date.now() };
        });
      },
      increment: (key) =>
        set((s) => ({ lines: s.lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(50, l.quantity + 1) } : l)), updatedAt: Date.now() })),
      decrement: (key) =>
        set((s) => ({
          lines: s.lines.map((l) => (l.key === key ? { ...l, quantity: l.quantity - 1 } : l)).filter((l) => l.quantity > 0),
          updatedAt: Date.now(),
        })),
      setPaymentMethod: (paymentMethod) => set({ paymentMethod }),
      setOrderNote: (orderNote) => set({ orderNote }),
      setCoupon: (code) => set({ coupon: code.trim().toUpperCase().slice(0, 20) }),
      checkoutRef: () => {
        const s = get();
        const sig = signature(s.slug, s.lines);
        if (s.checkout && s.checkout.sig === sig) return s.checkout.ref;
        const ref = uuid();
        set({ checkout: { ref, sig } });
        return ref;
      },
      clear: () => set({ lines: [], orderNote: '', coupon: '', updatedAt: null, checkout: null }),
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
        if (changed) set({ lines: next });
        return { dropped, repriced };
      },
    }),
    {
      name: 'ros:takeaway-cart',
      storage: createJSONStorage(() => (typeof window === 'undefined' ? (undefined as unknown as Storage) : window.localStorage)),
      partialize: (s) => ({
        slug: s.slug,
        lines: s.lines,
        updatedAt: s.updatedAt,
        paymentMethod: s.paymentMethod,
        orderNote: s.orderNote,
        coupon: s.coupon,
        checkout: s.checkout,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<TakeawayCartState>;
        const stale = expired(p.updatedAt);
        return {
          ...current,
          ...p,
          lines: stale ? [] : (p.lines ?? []),
          updatedAt: stale ? null : (p.updatedAt ?? null),
          coupon: stale ? '' : (p.coupon ?? ''),
          checkout: stale ? null : (p.checkout ?? null),
        };
      },
    },
  ),
);

export const cartCount = (lines: CartLine[]) => lines.reduce((s, l) => s + l.quantity, 0);
export const cartSubtotal = (lines: CartLine[]) => roundMoney(lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0));
