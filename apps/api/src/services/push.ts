/**
 * Web Push: order updates to guests' phones and new-order / waiter-call alerts to staff devices.
 *
 * Every send is fire-and-forget: a push service being slow or down must never fail or delay the
 * request that triggered it. Subscriptions the push service reports as gone (404 / 410) are deleted.
 *
 * The payload is JSON read by apps/web/public/sw.js:
 *   { title, body, url, tag, requireInteraction?, renotify?, vibrate?, kind }
 * `tag` is per order, so each stage replaces the previous notification instead of stacking.
 */
import webpush from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';
import { orderCode, tableDisplay, type AssistanceCall, type OrderStatus, type OrderWithItems, type Restaurant } from '@restaurant-os/shared';
import { config } from '../config.js';
import { anonClient } from '../lib/supabase.js';

function setUpPush(): boolean {
  if (!config.vapidPublicKey || !config.vapidPrivateKey) return false;
  try {
    webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
    return true;
  } catch (e) {
    // A bad key or subject must never stop the API: notifications are simply off.
    console.warn('[push] disabled:', (e as Error).message);
    return false;
  }
}

export const pushEnabled = setUpPush();

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushMessage {
  title: string;
  body: string;
  /** Page to open when the notification is tapped (same origin). */
  url: string;
  tag: string;
  kind: 'order' | 'call' | 'payment' | 'test';
  requireInteraction?: boolean;
  renotify?: boolean;
  vibrate?: number[];
}

/** Send to every target; returns how many were delivered. Gone subscriptions are passed to onGone. */
export async function sendPush(targets: PushTarget[], message: PushMessage, onGone: (endpoint: string) => PromiseLike<unknown>): Promise<number> {
  if (!pushEnabled || targets.length === 0) return 0;
  const payload = JSON.stringify(message);
  const results = await Promise.allSettled(
    targets.map((t) =>
      webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, payload, {
        TTL: message.kind === 'call' ? 600 : 3600,
        urgency: 'high',
        topic: message.tag.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || undefined,
      }),
    ),
  );
  let delivered = 0;
  await Promise.all(
    results.map(async (r, i) => {
      if (r.status === 'fulfilled') {
        delivered += 1;
        return;
      }
      const status = (r.reason as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) await Promise.resolve(onGone(targets[i]!.endpoint)).catch(() => undefined);
      else console.warn('[push] send failed', status ?? (r.reason as Error)?.message);
    }),
  );
  return delivered;
}

/** Run a notification job without letting it affect the request. */
export function background(job: () => Promise<unknown>): void {
  if (!pushEnabled) return;
  void job().catch((e) => console.warn('[push]', (e as Error)?.message ?? e));
}

// ---------------------------------------------------------------------------
// Guest: order updates (sent by staff actions, so the staff RLS client can read the guest's devices)
// ---------------------------------------------------------------------------

const GUEST_COPY: Partial<Record<OrderStatus, { title: string; body: string }>> = {
  accepted: { title: 'Order confirmed', body: 'The kitchen has your order and will start it shortly.' },
  preparing: { title: 'Being prepared', body: 'Your food is on the stove.' },
  ready: { title: 'Your order is ready', body: 'It is on its way to your table.' },
  served: { title: 'Enjoy your meal', body: 'Tap to rate your meal or order something else.' },
  cancelled: { title: 'Order cancelled', body: 'The restaurant cancelled this order. Please ask the staff if this is unexpected.' },
};

const TAKEAWAY_COPY: Partial<Record<OrderStatus, { title: string; body: string }>> = {
  ready: { title: 'Ready for pickup', body: 'Your order is packed and waiting at the counter.' },
  served: { title: 'Picked up — thank you', body: 'Tap to rate your order.' },
};

function guestUrl(order: OrderWithItems, slug: string): string {
  if (order.table?.code) return `/t/${order.table.code}/orders/${order.id}${order.status === 'served' ? '#feedback' : ''}`;
  return `/r/${slug}/orders`;
}

async function guestTargets(db: SupabaseClient, order: Pick<OrderWithItems, 'guest_session_id' | 'restaurant_id'>): Promise<PushTarget[]> {
  const { data, error } = await db
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('restaurant_id', order.restaurant_id)
    .eq('kind', 'guest')
    .eq('guest_session_id', order.guest_session_id);
  if (error) return []; // e.g. migration 0007 not installed yet
  return (data ?? []) as PushTarget[];
}

const dropVia = (db: SupabaseClient) => (endpoint: string) => db.from('push_subscriptions').delete().eq('endpoint', endpoint);

/** The kitchen moved the order along: tell the guest's phone (a no-op when they did not opt in). */
export function notifyGuestStatus(db: SupabaseClient, restaurant: Pick<Restaurant, 'name' | 'slug'>, order: OrderWithItems): void {
  if (order.source === 'pos') return; // staff entered it; there is no guest device
  const takeaway = order.order_type === 'takeaway' || !order.table_id;
  const copy = (takeaway && TAKEAWAY_COPY[order.status]) || GUEST_COPY[order.status];
  if (!copy) return;
  background(async () => {
    const targets = await guestTargets(db, order);
    const where = takeaway ? 'Takeaway' : tableDisplay(order.table ?? null);
    await sendPush(
      targets,
      {
        title: `${copy.title} · ${orderCode(order.order_number)}`,
        body: `${copy.body} ${restaurant.name} · ${where}.`,
        url: guestUrl(order, restaurant.slug),
        tag: `order-${order.id}`,
        kind: 'order',
        renotify: true,
        requireInteraction: order.status === 'ready',
        vibrate: order.status === 'ready' ? [200, 100, 200, 100, 400] : [120],
      },
      dropVia(db),
    );
  });
}

/** Staff marked the order paid (directly or by settling a bill). */
export function notifyGuestPaid(db: SupabaseClient, restaurant: Pick<Restaurant, 'name' | 'slug'>, order: OrderWithItems): void {
  if (order.source === 'pos') return;
  background(async () => {
    const targets = await guestTargets(db, order);
    await sendPush(
      targets,
      {
        title: `Payment received · ${orderCode(order.order_number)}`,
        body: `Thank you for dining with ${restaurant.name}.`,
        url: guestUrl(order, restaurant.slug),
        tag: `order-${order.id}`,
        kind: 'payment',
        renotify: true,
      },
      dropVia(db),
    );
  });
}

/** A waiter acknowledged the guest's request. */
export function notifyGuestCallAttended(db: SupabaseClient, call: AssistanceCall): void {
  if (!call.guest_session_id || !call.table) return;
  const tableCode = call.table.code;
  background(async () => {
    const targets = await guestTargets(db, { guest_session_id: call.guest_session_id!, restaurant_id: call.restaurant_id });
    await sendPush(
      targets,
      {
        title: 'Someone is on the way',
        body: `Your request at ${tableDisplay(call.table)} was seen by the staff.`,
        url: `/t/${tableCode}`,
        tag: `call-${call.id}`,
        kind: 'call',
      },
      dropVia(db),
    );
  });
}

// ---------------------------------------------------------------------------
// Staff: alerts for guest actions (sent from public routes, so targets come from a guarded RPC)
// ---------------------------------------------------------------------------

async function staffTargets(kind: 'order' | 'call', id: string, guestSessionId: string): Promise<PushTarget[]> {
  const { data, error } = await anonClient.rpc('staff_push_targets', { p_kind: kind, p_id: id, p_guest_session_id: guestSessionId });
  if (error) return [];
  return (data ?? []) as PushTarget[];
}

const dropViaRpc = (endpoint: string) => anonClient.rpc('drop_push_subscription', { p_endpoint: endpoint });

function itemsLine(order: OrderWithItems): string {
  const names = order.items.slice(0, 3).map((i) => `${i.quantity}× ${i.name}`);
  return names.join(', ') + (order.items.length > 3 ? ` +${order.items.length - 3} more` : '');
}

export function notifyStaffNewOrder(order: OrderWithItems, guestSessionId: string, added = false): void {
  background(async () => {
    const targets = await staffTargets('order', order.id, guestSessionId);
    const where = order.order_type === 'takeaway' || !order.table_id ? `Takeaway${order.guest_name ? ` · ${order.guest_name}` : ''}` : tableDisplay(order.table ?? null);
    await sendPush(
      targets,
      {
        title: added ? `Dishes added · ${orderCode(order.order_number)}` : `New order ${orderCode(order.order_number)} · ${where}`,
        body: `${itemsLine(order)} · ₹${Number(order.total).toLocaleString('en-IN')}`,
        url: '/admin/orders',
        tag: `staff-order-${order.id}`,
        kind: 'order',
        renotify: true,
        requireInteraction: !added,
        vibrate: [300, 120, 300],
      },
      dropViaRpc,
    );
  });
}

const CALL_LABEL: Record<string, string> = {
  waiter: 'is calling a waiter',
  water: 'needs water',
  cutlery: 'needs cutlery',
  bill: 'asked for the bill',
  other: 'needs help',
};

export function notifyStaffCall(call: AssistanceCall, guestSessionId: string, tableLabel: string): void {
  background(async () => {
    const targets = await staffTargets('call', call.id, guestSessionId);
    await sendPush(
      targets,
      {
        title: `${tableLabel} ${CALL_LABEL[call.type] ?? 'needs help'}`,
        body: call.note ? `“${call.note}”` : 'Tap to open Calls.',
        url: '/admin/calls',
        tag: `staff-call-${call.id}`,
        kind: 'call',
        renotify: true,
        requireInteraction: true,
        vibrate: [200, 80, 200, 80, 200],
      },
      dropViaRpc,
    );
  });
}
