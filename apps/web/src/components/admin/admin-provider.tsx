'use client';

import * as React from 'react';
import { toast } from 'sonner';
import type { AssistanceCall, DiningTable, Order, OrderItem, OrderStatus, OrderWithItems, PaymentStatus, Restaurant, Staff } from '@restaurant-os/shared';
import { planHas } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { stopSpeaking } from '@/lib/audio';
import { useAuth } from '@/lib/auth';
import { useAdminData } from './use-admin-data';
import { isActiveStatus, useRealtime, type ConnectionStatus } from './use-realtime';
import { useSound, type SoundControls } from './use-sound';
import { useAutomationRunner, type AutomationState } from './use-automation';
import { errorMessage, maxRound, timestampMs } from './format';

export { isActiveStatus };

export type AdminEvent =
  | { type: 'order:new'; order: OrderWithItems }
  | { type: 'order:update'; order: OrderWithItems }
  | { type: 'call:new'; call: AssistanceCall }
  | { type: 'call:update'; call: AssistanceCall }
  | { type: 'sync' };

export interface Banner {
  id: string;
  /** 'new' = a new order; 'added' = the guest added dishes to an open order. */
  kind: 'new' | 'added';
  order: OrderWithItems;
  /** For 'added': the dishes in the new round (empty when they could not be loaded). */
  added?: OrderItem[];
  at: number;
}

/** Merge a fresh row into an order we already hold, keeping items/table when the row has none. */
export function mergeOrder(existing: OrderWithItems, incoming: Order | OrderWithItems): OrderWithItems {
  const withItems = incoming as Partial<OrderWithItems>;
  return {
    ...existing,
    ...incoming,
    items: withItems.items && withItems.items.length > 0 ? withItems.items : existing.items,
    table: withItems.table ?? existing.table,
    subtotal: Number(incoming.subtotal),
    tax_amount: Number(incoming.tax_amount),
    service_charge: Number(incoming.service_charge),
    total: Number(incoming.total),
  };
}

/** Upsert into the active list (newest first) or drop it when it left the active set. */
function upsertActive(list: OrderWithItems[], order: OrderWithItems): OrderWithItems[] {
  if (!isActiveStatus(order.status)) return list.filter((o) => o.id !== order.id);
  return list.some((o) => o.id === order.id) ? list.map((o) => (o.id === order.id ? order : o)) : [order, ...list];
}

const BANNER_MS = 12_000;

export interface AdminContextValue {
  token: string;
  restaurant: Restaurant;
  staff: Staff;
  /** Active orders (placed → ready), newest first. */
  orders: OrderWithItems[];
  /** Open assistance calls, newest first. */
  calls: AssistanceCall[];
  tables: DiningTable[];
  loading: boolean;
  loadError: string | null;
  refresh: () => Promise<void>;
  refreshTables: () => Promise<DiningTable[]>;
  connection: ConnectionStatus;
  sound: SoundControls;
  banners: Banner[];
  dismissBanner: (id: string) => void;
  setOrderStatus: (order: OrderWithItems, status: OrderStatus) => Promise<OrderWithItems | null>;
  setPaymentStatus: (order: OrderWithItems, status: PaymentStatus) => Promise<OrderWithItems | null>;
  attendCall: (call: AssistanceCall) => Promise<boolean>;
  setOpenForOrders: (open: boolean) => Promise<boolean>;
  subscribe: (listener: (e: AdminEvent) => void) => () => void;
  /** Premium automation (webhooks + WhatsApp journeys) run from this tab for owners/managers. */
  automation: AutomationState;
}

const AdminContext = React.createContext<AdminContextValue | null>(null);

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const { token, restaurant, staff } = useAuth();
  if (!token || !restaurant || !staff) return null;
  return (
    <AdminProviderInner token={token} restaurant={restaurant} staff={staff}>
      {children}
    </AdminProviderInner>
  );
}

function AdminProviderInner({
  token,
  restaurant,
  staff,
  children,
}: {
  token: string;
  restaurant: Restaurant;
  staff: Staff;
  children: React.ReactNode;
}) {
  const { setRestaurant } = useAuth();
  const data = useAdminData(token);
  const sound = useSound();
  const [banners, setBanners] = React.useState<Banner[]>([]);
  const timers = React.useRef(new Map<string, number>());
  const listeners = React.useRef(new Set<(e: AdminEvent) => void>());
  /** Order ids already chimed/spoken/emitted as new: never announce one twice, whichever path delivers it. */
  const announced = React.useRef(new Set<string>());
  /** Latest `items_added_at` (ms) already announced or already on screen, per order id: added dishes are announced once. */
  const addedSeen = React.useRef(new Map<string, number>());
  const tokenRef = React.useRef(token);
  tokenRef.current = token;

  const ordersRef = React.useRef(data.orders);
  ordersRef.current = data.orders;
  const callsRef = React.useRef(data.calls);
  callsRef.current = data.calls;
  const tablesRef = React.useRef(data.tables);
  tablesRef.current = data.tables;

  const emit = React.useCallback((e: AdminEvent) => {
    listeners.current.forEach((l) => l(e));
  }, []);
  const subscribe = React.useCallback((l: (e: AdminEvent) => void) => {
    listeners.current.add(l);
    return () => {
      listeners.current.delete(l);
    };
  }, []);

  const dismissBanner = React.useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t) window.clearTimeout(t);
    timers.current.delete(id);
    setBanners((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const pushBanner = React.useCallback(
    (banner: Omit<Banner, 'at'>) => {
      setBanners((prev) => (prev.some((b) => b.id === banner.id) ? prev : [...prev, { ...banner, at: Date.now() }]));
      const old = timers.current.get(banner.id);
      if (old) window.clearTimeout(old);
      const t = window.setTimeout(() => dismissBanner(banner.id), BANNER_MS);
      timers.current.set(banner.id, t);
    },
    [dismissBanner],
  );

  /**
   * True exactly once per new `items_added_at` of an order. `baseline` is what the screen already
   * shows for that order (never announced: it was there before we started watching).
   */
  const isNewAddition = React.useCallback((id: string, addedAt: string | null | undefined, baseline: string | null | undefined) => {
    const ms = timestampMs(addedAt);
    if (ms === null) return false;
    const seen = addedSeen.current.get(id) ?? timestampMs(baseline);
    if (seen !== null && ms <= seen) return false;
    addedSeen.current.set(id, ms);
    return true;
  }, []);

  /** Chime, speak "{table} added {n} dishes to order {number}" and show the banner. */
  const announceAdded = React.useCallback(
    (order: OrderWithItems, before: OrderWithItems | undefined, itemsKnown: boolean) => {
      let added: OrderItem[] = [];
      if (itemsKnown) {
        const prevMax = before && before.items.length > 0 ? maxRound(before.items) : 1;
        added = order.items.filter((i) => (i.round ?? 1) > prevMax);
        if (added.length === 0) {
          const latest = maxRound(order.items);
          added = latest > 1 ? order.items.filter((i) => (i.round ?? 1) === latest) : [];
        }
      }
      const count = added.length ? added.reduce((n, i) => n + i.quantity, 0) : null;
      sound.notifyItemsAdded(order, count);
      pushBanner({ id: `${order.id}:added:${order.items_added_at ?? Date.now()}`, kind: 'added', order, added });
    },
    [sound, pushBanner],
  );

  React.useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => window.clearTimeout(t));
      map.clear();
      // Leaving the dashboard: stop reading out orders that no longer have a screen.
      stopSpeaking();
    };
  }, []);

  const { setOrders, setCalls } = data;

  const enrichCall = React.useCallback((call: AssistanceCall): AssistanceCall => {
    if (call.table) return call;
    const t = tablesRef.current.find((x) => x.id === call.table_id);
    return { ...call, table: t ? { id: t.id, code: t.code, label: t.label, area: t.area } : null };
  }, []);

  const addOrder = React.useCallback(
    (order: OrderWithItems, notify: boolean) => {
      if (!isActiveStatus(order.status)) return;
      // Dishes already on a brand-new order are part of it, not an addition to announce later.
      const addedMs = timestampMs(order.items_added_at);
      if (addedMs !== null && !addedSeen.current.has(order.id)) addedSeen.current.set(order.id, addedMs);
      setOrders((prev) => upsertActive(prev, order));
      if (notify && !announced.current.has(order.id)) {
        announced.current.add(order.id);
        // A counter order this staff member just entered needs no alert on their own screen;
        // every other screen (the kitchen) still chimes for it.
        const mine = order.source === 'pos' && order.placed_by === staff.id;
        if (!mine) {
          sound.notifyOrder(order);
          pushBanner({ id: order.id, kind: 'new', order });
        }
        emit({ type: 'order:new', order });
      }
    },
    [setOrders, sound, pushBanner, emit, staff.id],
  );

  /** Realtime rows carry no items: fetch the order in full, then announce the added dishes. */
  const refetchAdded = React.useCallback(
    (id: string, before: OrderWithItems) => {
      adminApi
        .order(tokenRef.current, id)
        .then((full) => {
          const cur = ordersRef.current.find((o) => o.id === id);
          const next = mergeOrder(cur ?? before, full);
          setOrders((prev) => upsertActive(prev, next));
          emit({ type: 'order:update', order: next });
          announceAdded(next, before, true);
        })
        .catch(() => {
          // Still tell the counter; the next poll brings the dishes themselves.
          announceAdded(ordersRef.current.find((o) => o.id === id) ?? before, before, false);
        });
    },
    [setOrders, emit, announceAdded],
  );

  const onNewOrder = React.useCallback((order: OrderWithItems) => addOrder(order, true), [addOrder]);

  const onOrderUpdate = React.useCallback(
    (row: Order | OrderWithItems) => {
      const existing = ordersRef.current.find((o) => o.id === row.id);
      if (existing) {
        const merged = mergeOrder(existing, row);
        const addition = isNewAddition(row.id, row.items_added_at, existing.items_added_at);
        if (
          !addition &&
          existing.updated_at === merged.updated_at &&
          existing.status === merged.status &&
          existing.payment_status === merged.payment_status &&
          existing.items_added_at === merged.items_added_at
        ) {
          return;
        }
        setOrders((prev) => upsertActive(prev, merged));
        if (merged.status !== 'placed') dismissBanner(merged.id);
        emit({ type: 'order:update', order: merged });
        if (addition) refetchAdded(row.id, existing);
      } else {
        // Not on the board: a past order changed (e.g. marked paid from billing), or the fetch
        // that announces a brand-new order is still in flight. Views holding it merge by id;
        // missed inserts are handled by useRealtime, never here, so an order is announced once.
        const partial = row as Partial<OrderWithItems>;
        emit({ type: 'order:update', order: { ...row, items: partial.items ?? [], table: partial.table ?? null } });
      }
    },
    [setOrders, emit, dismissBanner, isNewAddition, refetchAdded],
  );

  const onNewCall = React.useCallback(
    (call: AssistanceCall) => {
      const full = enrichCall(call);
      if (full.status !== 'open') return;
      setCalls((prev) => (prev.some((c) => c.id === full.id) ? prev : [full, ...prev]));
      sound.notifyCall(full);
      emit({ type: 'call:new', call: full });
    },
    [enrichCall, setCalls, sound, emit],
  );

  const onCallUpdate = React.useCallback(
    (call: AssistanceCall) => {
      const full = enrichCall(call);
      setCalls((prev) =>
        full.status === 'open'
          ? prev.some((c) => c.id === full.id)
            ? prev.map((c) => (c.id === full.id ? { ...c, ...full, table: full.table ?? c.table } : c))
            : [full, ...prev]
          : prev.filter((c) => c.id !== full.id),
      );
      emit({ type: 'call:update', call: full });
    },
    [enrichCall, setCalls, emit],
  );

  const onPollSync = React.useCallback(
    (orders: OrderWithItems[], calls: AssistanceCall[], requestedAt: number) => {
      const grace = requestedAt - 20_000;
      // Additions realtime missed (the poll rows already carry the items).
      const additions: Array<{ order: OrderWithItems; before: OrderWithItems }> = [];
      for (const fresh of orders) {
        const before = ordersRef.current.find((o) => o.id === fresh.id);
        if (before && isNewAddition(fresh.id, fresh.items_added_at, before.items_added_at)) additions.push({ order: mergeOrder(before, fresh), before });
      }
      setOrders((prev) => {
        const byId = new Map(orders.map((o) => [o.id, o]));
        // Keep anything that arrived via realtime moments ago (the poll may predate it).
        const kept = prev.filter((o) => byId.has(o.id) || new Date(o.placed_at).getTime() > grace);
        const next = kept.map((o) => {
          const fresh = byId.get(o.id);
          if (!fresh) return o;
          return fresh.updated_at === o.updated_at &&
            fresh.status === o.status &&
            fresh.payment_status === o.payment_status &&
            fresh.items_added_at === o.items_added_at
            ? o
            : mergeOrder(o, fresh);
        });
        const known = new Set(next.map((o) => o.id));
        const added = orders.filter((o) => !known.has(o.id));
        return added.length ? [...added, ...next] : next;
      });
      setCalls((prev) => {
        const byId = new Map(calls.map((c) => [c.id, c]));
        const kept = prev.filter((c) => byId.has(c.id) || new Date(c.created_at).getTime() > grace);
        const known = new Set(kept.map((c) => c.id));
        const added = calls.filter((c) => !known.has(c.id)).map(enrichCall);
        return added.length ? [...added, ...kept] : kept;
      });
      for (const a of additions) {
        emit({ type: 'order:update', order: a.order });
        announceAdded(a.order, a.before, true);
      }
      emit({ type: 'sync' });
    },
    [setOrders, setCalls, enrichCall, emit, isNewAddition, announceAdded],
  );

  // Premium: owners/managers keep webhooks and WhatsApp journeys moving while the dashboard is open.
  const automationEnabled =
    (planHas(restaurant.plan, 'pos_integration') || planHas(restaurant.plan, 'whatsapp_automation')) && (staff.role === 'owner' || staff.role === 'manager');
  const automation = useAutomationRunner(token, automationEnabled, subscribe);

  const { status: connection } = useRealtime(restaurant.id, token, {
    enabled: data.loaded,
    knownOrderIds: () => ordersRef.current.map((o) => o.id),
    knownCallIds: () => callsRef.current.map((c) => c.id),
    onNewOrder,
    onOrderUpdate,
    onNewCall,
    onCallUpdate,
    onPollSync,
  });

  // --- Mutations (optimistic, rollback on error) --------------------------
  const setOrderStatus = React.useCallback(
    async (order: OrderWithItems, status: OrderStatus) => {
      const optimistic: OrderWithItems = { ...order, status };
      setOrders((prev) => upsertActive(prev, optimistic));
      emit({ type: 'order:update', order: optimistic });
      try {
        const updated = await adminApi.setOrderStatus(token, order.id, status);
        const full = mergeOrder(order, updated);
        setOrders((prev) => upsertActive(prev, full));
        if (full.status !== 'placed') dismissBanner(full.id);
        emit({ type: 'order:update', order: full });
        return full;
      } catch (e) {
        toast.error(errorMessage(e, 'Could not update the order.'));
        // Another device may have moved the order on while this tap was in flight (the server
        // rejects stale transitions), so settle on what the server holds rather than the snapshot.
        try {
          const fresh = await adminApi.order(token, order.id);
          const full = mergeOrder(order, fresh);
          setOrders((prev) => upsertActive(prev, full));
          if (full.status !== 'placed') dismissBanner(full.id);
          emit({ type: 'order:update', order: full });
        } catch {
          // Offline: only roll back if nothing newer arrived via realtime in the meantime.
          setOrders((prev) => {
            const cur = prev.find((o) => o.id === order.id);
            return cur && cur.updated_at !== order.updated_at ? prev : upsertActive(prev, order);
          });
          emit({ type: 'order:update', order });
        }
        return null;
      }
    },
    [token, setOrders, emit, dismissBanner],
  );

  const setPaymentStatus = React.useCallback(
    async (order: OrderWithItems, payment_status: PaymentStatus) => {
      const optimistic: OrderWithItems = { ...order, payment_status };
      setOrders((prev) => (prev.some((o) => o.id === order.id) ? upsertActive(prev, optimistic) : prev));
      emit({ type: 'order:update', order: optimistic });
      try {
        const updated = await adminApi.setPaymentStatus(token, order.id, payment_status);
        const full = mergeOrder(order, updated);
        setOrders((prev) => (prev.some((o) => o.id === order.id) ? upsertActive(prev, full) : prev));
        emit({ type: 'order:update', order: full });
        return full;
      } catch (e) {
        setOrders((prev) => (prev.some((o) => o.id === order.id) ? upsertActive(prev, order) : prev));
        emit({ type: 'order:update', order });
        toast.error(errorMessage(e, 'Could not update the payment.'));
        return null;
      }
    },
    [token, setOrders, emit],
  );

  const attendCall = React.useCallback(
    async (call: AssistanceCall) => {
      setCalls((prev) => prev.filter((c) => c.id !== call.id));
      try {
        const updated = await adminApi.attendCall(token, call.id);
        const full: AssistanceCall = { ...call, ...updated, table: updated.table ?? call.table };
        emit({ type: 'call:update', call: full });
        return true;
      } catch (e) {
        setCalls((prev) => (prev.some((c) => c.id === call.id) ? prev : [call, ...prev]));
        toast.error(errorMessage(e, 'Could not mark the call as attended.'));
        return false;
      }
    },
    [token, setCalls, emit],
  );

  const setOpenForOrders = React.useCallback(
    async (open: boolean) => {
      try {
        const updated = await adminApi.updateRestaurant(token, { is_open: open });
        setRestaurant(updated);
        toast.success(open ? 'Taking orders again.' : 'Closed for new orders. Guests see a closed notice.');
        return true;
      } catch (e) {
        toast.error(errorMessage(e, 'Could not change the open status.'));
        return false;
      }
    },
    [token, setRestaurant],
  );

  const value = React.useMemo<AdminContextValue>(
    () => ({
      token,
      restaurant,
      staff,
      orders: data.orders,
      calls: data.calls,
      tables: data.tables,
      loading: data.loading,
      loadError: data.error,
      refresh: data.refresh,
      refreshTables: data.refreshTables,
      connection,
      sound,
      banners,
      dismissBanner,
      setOrderStatus,
      setPaymentStatus,
      attendCall,
      setOpenForOrders,
      subscribe,
      automation,
    }),
    [
      token,
      restaurant,
      staff,
      data.orders,
      data.calls,
      data.tables,
      data.loading,
      data.error,
      data.refresh,
      data.refreshTables,
      connection,
      sound,
      banners,
      dismissBanner,
      setOrderStatus,
      setPaymentStatus,
      attendCall,
      setOpenForOrders,
      subscribe,
      automation,
    ],
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin(): AdminContextValue {
  const ctx = React.useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used inside <AdminProvider>');
  return ctx;
}

/** Subscribe to live events; the latest listener is always used, no re-subscribe churn. */
export function useAdminEvents(listener: (e: AdminEvent) => void) {
  const { subscribe } = useAdmin();
  const ref = React.useRef(listener);
  ref.current = listener;
  React.useEffect(() => subscribe((e) => ref.current(e)), [subscribe]);
}
