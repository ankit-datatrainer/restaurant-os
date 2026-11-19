'use client';

import * as React from 'react';
import type { OrderQuote, PlaceOrderItemInput, QuoteInput } from '@restaurant-os/shared';
import { ApiRequestError, publicApi } from '@/lib/api';

export interface QuoteState {
  /** Latest quote for exactly the current input; null while the first one loads, offline, or on an error. */
  quote: OrderQuote | null;
  /** The last successful quote, even if the input changed since (keeps numbers steady while re-pricing). */
  lastQuote: OrderQuote | null;
  loading: boolean;
  /** The server refused to price the cart (e.g. "Masala Dosa is not available at this time."). */
  error: string | null;
  /** The server could not be reached: callers fall back to local totals. */
  offline: boolean;
}

const IDLE: QuoteState = { quote: null, lastQuote: null, loading: false, error: null, offline: false };

/**
 * Live cart price from POST /api/public/quote: happy hour + coupon check, never writes.
 * Debounced, and each new request aborts the previous one so a slow answer never overwrites a newer cart.
 */
export function useQuote({
  enabled,
  tableCode,
  restaurantSlug,
  items,
  couponCode,
  pickupAt,
  delayMs = 350,
}: {
  enabled: boolean;
  tableCode?: string;
  restaurantSlug?: string;
  items: PlaceOrderItemInput[];
  couponCode?: string;
  pickupAt?: string;
  delayMs?: number;
}): QuoteState {
  const [state, setState] = React.useState<QuoteState>(IDLE);
  const input: QuoteInput | null = React.useMemo(() => {
    if (!enabled || items.length === 0 || (!tableCode && !restaurantSlug)) return null;
    const q: QuoteInput = { items };
    if (tableCode) q.table_code = tableCode;
    else if (restaurantSlug) q.restaurant_slug = restaurantSlug;
    if (couponCode && couponCode.trim()) q.coupon_code = couponCode.trim().toUpperCase();
    if (pickupAt) q.pickup_at = pickupAt;
    return q;
  }, [enabled, items, tableCode, restaurantSlug, couponCode, pickupAt]);
  // Stable key: re-quote only when what is being priced actually changes.
  const key = input ? JSON.stringify(input) : '';

  React.useEffect(() => {
    if (!key) {
      setState((s) => (s.quote || s.loading || s.error || s.offline ? { ...IDLE, lastQuote: s.lastQuote } : s));
      return;
    }
    const body = JSON.parse(key) as QuoteInput;
    const ctrl = new AbortController();
    setState((s) => ({ ...s, quote: null, loading: true }));
    const timer = window.setTimeout(() => {
      publicApi
        .quote(body, ctrl.signal)
        .then((q) => {
          if (ctrl.signal.aborted) return;
          setState({ quote: q, lastQuote: q, loading: false, error: null, offline: false });
        })
        .catch((e: unknown) => {
          if (ctrl.signal.aborted || (e as Error).name === 'AbortError') return;
          const offline = e instanceof ApiRequestError ? e.status === 0 || e.status >= 500 : true;
          setState((s) => ({
            quote: null,
            lastQuote: s.lastQuote,
            loading: false,
            error: offline ? null : e instanceof Error ? e.message : 'Could not price this order.',
            offline,
          }));
        });
    }, delayMs);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [key, delayMs]);

  return state;
}

/** Cart lines → API line input (dish, quantity, chosen options, kitchen note). */
export function quoteItems(lines: Array<{ item: { id: string }; quantity: number; options: Array<{ group_id: string; choice_id: string }>; note?: string }>): PlaceOrderItemInput[] {
  return lines.map((l) => ({
    menu_item_id: l.item.id,
    quantity: l.quantity,
    options: l.options.map((o) => ({ group_id: o.group_id, choice_id: o.choice_id })),
    note: l.note?.trim() || undefined,
  }));
}
