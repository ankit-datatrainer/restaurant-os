/**
 * Signed order webhooks — the integration point for POS systems, KOT printers, middleware
 * (Zapier/Make/n8n) or a restaurant's own software.
 *
 * Every request: POST <webhook_url>, JSON body
 *   { id, event, created_at, restaurant: { id, name }, order: OrderWithItems | null }
 * Headers:
 *   X-RestaurantOS-Event:     order.placed | order.items_added | order.status_changed | order.cancelled | order.payment_changed | ping
 *   X-RestaurantOS-Delivery:  event id (retries reuse it, so receivers can de-duplicate)
 *   X-RestaurantOS-Signature: sha256=<hex HMAC-SHA256 of the raw body with the webhook secret>
 * A 2xx response counts as delivered; anything else is retried with back-off (1, 5, 30, 120, 360, 720 min; 7 attempts in total).
 */
import { createHmac } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrderWithItems } from '@restaurant-os/shared';
import { ORDER_SELECT, withSortedItems } from './orders.js';

const BACKOFF_MIN = [1, 5, 30, 120, 360, 720];
export const MAX_ATTEMPTS = BACKOFF_MIN.length + 1;

export function sign(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

export async function postWebhook(url: string, secret: string, deliveryId: string, event: string, payload: unknown): Promise<{ ok: boolean; status: number | null; error: string | null }> {
  const body = JSON.stringify(payload);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'RestaurantOS-Webhooks/1.0',
        'X-RestaurantOS-Event': event,
        'X-RestaurantOS-Delivery': deliveryId,
        'X-RestaurantOS-Signature': sign(secret, body),
      },
      body,
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) return { ok: true, status: res.status, error: null };
    const text = (await res.text().catch(() => '')).slice(0, 200);
    return { ok: false, status: res.status, error: `HTTP ${res.status}${text ? `: ${text}` : ''}` };
  } catch (e) {
    return { ok: false, status: null, error: e instanceof Error ? e.message : 'Network error' };
  }
}

interface Integration {
  webhook_enabled: boolean;
  webhook_url: string | null;
  webhook_secret: string;
}

interface EventRow {
  id: number;
  event: string;
  order_id: string | null;
  created_at: string;
  attempts: number;
}

/** Deliver due outbox rows (oldest first). Returns counts. */
export async function deliverPending(
  db: SupabaseClient,
  restaurant: { id: string; name: string },
  cfg: Integration,
  limit = 40,
): Promise<{ delivered: number; failed: number; pending: number }> {
  if (!cfg.webhook_enabled || !cfg.webhook_url) return { delivered: 0, failed: 0, pending: 0 };

  const { data, error } = await db
    .from('integration_events')
    .select('id, event, order_id, created_at, attempts')
    .eq('restaurant_id', restaurant.id)
    .is('delivered_at', null)
    .lt('attempts', MAX_ATTEMPTS)
    .lte('next_attempt_at', new Date().toISOString())
    .order('id', { ascending: true })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as EventRow[];

  let delivered = 0;
  let failed = 0;
  for (const row of rows) {
    let order: OrderWithItems | null = null;
    if (row.order_id) {
      const o = await db.from('orders').select(ORDER_SELECT).eq('id', row.order_id).maybeSingle();
      order = o.data ? withSortedItems(o.data as OrderWithItems) : null;
    }
    const payload = { id: String(row.id), event: row.event, created_at: row.created_at, restaurant, order };
    const r = await postWebhook(cfg.webhook_url, cfg.webhook_secret, String(row.id), row.event, payload);
    const attempts = row.attempts + 1;
    if (r.ok) {
      delivered++;
      await db.from('integration_events').update({ delivered_at: new Date().toISOString(), attempts, last_status: r.status, last_error: null }).eq('id', row.id);
    } else {
      failed++;
      const wait = BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)]!;
      await db
        .from('integration_events')
        .update({ attempts, last_status: r.status, last_error: r.error, next_attempt_at: new Date(Date.now() + wait * 60_000).toISOString() })
        .eq('id', row.id);
    }
  }

  const { count } = await db
    .from('integration_events')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', restaurant.id)
    .is('delivered_at', null)
    .lt('attempts', MAX_ATTEMPTS);
  return { delivered, failed, pending: count ?? 0 };
}
