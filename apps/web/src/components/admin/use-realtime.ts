'use client';

import * as React from 'react';
import type { AssistanceCall, Order, OrderStatus, OrderWithItems } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { getSupabase } from '@/lib/supabase';

export type ConnectionStatus = 'connecting' | 'live' | 'polling';

export interface RealtimeHandlers {
  /** A brand-new order (full, with items). Called at most once per order id. */
  onNewOrder: (order: OrderWithItems) => void;
  /** An order row changed (realtime rows have no items; polling rows do). */
  onOrderUpdate: (order: Order | OrderWithItems) => void;
  onNewCall: (call: AssistanceCall) => void;
  onCallUpdate: (call: AssistanceCall) => void;
  /** Full snapshot from the polling fallback, for reconciling anything missed. */
  onPollSync?: (orders: OrderWithItems[], calls: AssistanceCall[], requestedAt: number) => void;
  /** Start polling only once the initial data has loaded. */
  enabled?: boolean;
  /** Ids already on screen: these are never announced as new. */
  knownOrderIds?: () => Iterable<string>;
  knownCallIds?: () => Iterable<string>;
}

type OrderRow = Order & Record<string, unknown>;
type CallRow = AssistanceCall & Record<string, unknown>;

const POLL_MS = 10_000;

const ACTIVE_STATUSES: readonly OrderStatus[] = ['placed', 'accepted', 'preparing', 'ready'];
/** Orders the counter is still working on (placed → ready). */
export function isActiveStatus(s: OrderStatus): boolean {
  return ACTIVE_STATUSES.includes(s);
}

/**
 * Supabase realtime for the counter dashboard, with a 10 s polling fallback.
 * - INSERT on orders → fetches the full order (items + table) then `onNewOrder`
 * - UPDATE on orders → `onOrderUpdate`, unless the order is unknown and still active, in which
 *   case it is treated as a missed insert (`place_order` inserts and then updates the row in one
 *   transaction, so every order arrives as an INSERT followed by an UPDATE).
 * - INSERT/UPDATE on assistance_calls → `onNewCall` / `onCallUpdate`
 * The seen-set is the single gate: an order or call is announced once, whichever path finds it first.
 */
export function useRealtime(restaurantId: string | null | undefined, token: string | null | undefined, handlers: RealtimeHandlers) {
  const [status, setStatus] = React.useState<ConnectionStatus>('connecting');
  const h = React.useRef(handlers);
  h.current = handlers;
  // The access token refreshes hourly; read it through a ref so the subscription never re-subscribes for it.
  const tokenRef = React.useRef(token);
  tokenRef.current = token;
  const seen = React.useRef({ orders: new Set<string>(), calls: new Set<string>() });

  const enabled = handlers.enabled ?? true;
  const hasToken = Boolean(token);

  // Seed the seen-set with what is already on screen the moment polling is allowed to start.
  React.useEffect(() => {
    if (!enabled) return;
    for (const id of h.current.knownOrderIds?.() ?? []) seen.current.orders.add(id);
    for (const id of h.current.knownCallIds?.() ?? []) seen.current.calls.add(id);
  }, [enabled]);

  const isKnownOrder = React.useCallback((id: string) => {
    if (seen.current.orders.has(id)) return true;
    for (const k of h.current.knownOrderIds?.() ?? []) if (k === id) return true;
    return false;
  }, []);
  const isKnownCall = React.useCallback((id: string) => {
    if (seen.current.calls.has(id)) return true;
    for (const k of h.current.knownCallIds?.() ?? []) if (k === id) return true;
    return false;
  }, []);

  /** Mark an order as seen, fetch it in full and announce it once. */
  const announceOrder = React.useCallback((id: string, isDisposed: () => boolean) => {
    const t = tokenRef.current;
    if (!t) return;
    seen.current.orders.add(id);
    adminApi
      .order(t, id)
      .then((full) => {
        if (!isDisposed()) h.current.onNewOrder(full);
      })
      .catch(() => {
        // Let the next poll (or the next UPDATE) pick it up with items.
        seen.current.orders.delete(id);
      });
  }, []);

  // --- Keep the socket's JWT fresh without touching the subscription -------
  React.useEffect(() => {
    if (!token) return;
    getSupabase().realtime.setAuth(token);
  }, [token]);

  // --- Realtime channel (one subscription per restaurant) -------------------
  React.useEffect(() => {
    if (!restaurantId || !hasToken) return;
    const supabase = getSupabase();
    setStatus('connecting');
    const filter = `restaurant_id=eq.${restaurantId}`;
    let disposed = false;
    const isDisposed = () => disposed;

    // Unique topic per subscription: `channel()` hands back an existing instance for a reused
    // topic, and one that is still leaving can neither take new bindings nor be re-joined.
    const channel = supabase
      .channel(`admin-${restaurantId}-${Date.now()}`)
      .on<OrderRow>('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter }, (payload) => {
        const row = payload.new as Order;
        if (!row?.id || isKnownOrder(row.id)) return;
        announceOrder(row.id, isDisposed);
      })
      .on<OrderRow>('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter }, (payload) => {
        const row = payload.new as Order;
        if (!row?.id) return;
        if (!isKnownOrder(row.id) && isActiveStatus(row.status)) {
          // We missed the insert (or the channel was reconnecting): announce it exactly once.
          announceOrder(row.id, isDisposed);
          return;
        }
        h.current.onOrderUpdate(row);
      })
      .on<CallRow>('postgres_changes', { event: 'INSERT', schema: 'public', table: 'assistance_calls', filter }, (payload) => {
        const row = payload.new as AssistanceCall;
        if (!row?.id || isKnownCall(row.id)) return;
        seen.current.calls.add(row.id);
        h.current.onNewCall(row);
      })
      .on<CallRow>('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'assistance_calls', filter }, (payload) => {
        const row = payload.new as AssistanceCall;
        if (!row?.id) return;
        h.current.onCallUpdate(row);
      })
      .subscribe((s) => {
        if (disposed) return;
        if (s === 'SUBSCRIBED') setStatus('live');
        else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') setStatus('polling');
      });

    return () => {
      disposed = true;
      void supabase.removeChannel(channel);
    };
  }, [restaurantId, hasToken, isKnownOrder, isKnownCall, announceOrder]);

  // --- Polling fallback (visible tab only) ----------------------------------
  React.useEffect(() => {
    if (!enabled || !hasToken) return;
    let cancelled = false;
    let inFlight = false;

    const tick = async () => {
      const t = tokenRef.current;
      if (!t || inFlight || typeof document === 'undefined' || document.visibilityState !== 'visible') return;
      inFlight = true;
      const requestedAt = Date.now();
      try {
        const [orders, calls] = await Promise.all([adminApi.orders(t, { scope: 'active', limit: 200 }), adminApi.calls(t, 'open')]);
        if (cancelled) return;
        for (const o of orders) {
          if (!isKnownOrder(o.id)) {
            seen.current.orders.add(o.id);
            h.current.onNewOrder(o);
          } else {
            seen.current.orders.add(o.id);
          }
        }
        for (const c of calls) {
          if (!isKnownCall(c.id)) {
            seen.current.calls.add(c.id);
            h.current.onNewCall(c);
          } else {
            seen.current.calls.add(c.id);
          }
        }
        h.current.onPollSync?.(orders, calls, requestedAt);
      } catch {
        // Network hiccup: the next tick will try again.
      } finally {
        inFlight = false;
      }
    };

    const id = window.setInterval(() => void tick(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, hasToken, isKnownOrder, isKnownCall]);

  return { status };
}
