import type { SupabaseClient } from '@supabase/supabase-js';
import { ORDER_FLOW, ORDER_STATUS_LABEL, type OrderStatus, type OrderWithItems } from '@restaurant-os/shared';
import { fromSupabase, notFound } from '../lib/errors.js';

/** Select string that yields an OrderWithItems (items + table summary embedded). */
export const ORDER_SELECT = '*, items:order_items(*), table:dining_tables!orders_table_id_fkey(id,code,label,area)';

export const ACTIVE_ORDER_STATUSES: OrderStatus[] = ['placed', 'accepted', 'preparing', 'ready'];
export const PAST_ORDER_STATUSES: OrderStatus[] = ['served', 'cancelled'];

/**
 * Returns null when `from → to` is allowed, otherwise a message explaining why not.
 * Allowed: any number of steps forward along ORDER_FLOW, or non-served → cancelled.
 */
export function transitionError(from: OrderStatus, to: OrderStatus): string | null {
  if (to === 'cancelled') {
    if (from === 'served') return 'A served order cannot be cancelled.';
    if (from === 'cancelled') return 'This order is already cancelled.';
    return null;
  }
  const fromIdx = ORDER_FLOW.indexOf(from);
  const toIdx = ORDER_FLOW.indexOf(to);
  if (fromIdx === -1) return 'A cancelled order cannot be reopened.';
  if (toIdx === -1) return `Unknown status "${to}".`;
  if (toIdx === fromIdx) return `This order is already ${ORDER_STATUS_LABEL[to].toLowerCase()}.`;
  if (toIdx < fromIdx) {
    return `An order cannot go back from ${ORDER_STATUS_LABEL[from].toLowerCase()} to ${ORDER_STATUS_LABEL[to].toLowerCase()}.`;
  }
  return null;
}

/**
 * PostgREST returns the `order_items` embed in storage order (effectively random uuid order).
 * Sort by the cart position so the tracker, kitchen ticket and bill all list dishes the same way.
 */
export function withSortedItems<T extends OrderWithItems>(order: T): T {
  const items = [...(order.items ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id.localeCompare(b.id));
  return { ...order, items };
}

export async function fetchOrder(db: SupabaseClient, restaurantId: string, id: string): Promise<OrderWithItems> {
  const { data, error } = await db.from('orders').select(ORDER_SELECT).eq('restaurant_id', restaurantId).eq('id', id).maybeSingle();
  if (error) throw fromSupabase(error);
  if (!data) throw notFound('Order not found');
  return withSortedItems(data as OrderWithItems);
}

/** Case-insensitive match on guest name, table (label, area or code) or any item name. */
export function orderMatchesText(order: OrderWithItems, needle: string): boolean {
  const n = needle.toLowerCase();
  if ((order.guest_name ?? '').toLowerCase().includes(n)) return true;
  const t = order.table;
  if (t && [t.label, t.area ?? '', t.code].some((s) => s.toLowerCase().includes(n))) return true;
  return (order.items ?? []).some((item) => item.name.toLowerCase().includes(n));
}

/** "#ORD-1003", "ORD1003", "1003" → 1003; anything else → null. */
export function parseOrderNumber(text: string): number | null {
  const m = /^#?\s*(?:ord[-\s]?)?(\d{1,9})$/i.exec(text.trim());
  return m ? Number(m[1]) : null;
}
