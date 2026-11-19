import type { SupabaseClient } from '@supabase/supabase-js';
import type { DashboardStats, OrderWithItems } from '@restaurant-os/shared';
import { roundMoney } from '@restaurant-os/shared';
import { fromSupabase } from '../lib/errors.js';
import { num } from './handlers.js';
import { ACTIVE_ORDER_STATUSES, ORDER_SELECT, withSortedItems } from './orders.js';

/** India has no daylight saving, so a fixed offset is exact. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight of the current day in Asia/Kolkata, as a UTC instant. */
export function startOfTodayIST(now: number = Date.now()): Date {
  const shifted = now + IST_OFFSET_MS;
  const dayStart = Math.floor(shifted / DAY_MS) * DAY_MS;
  return new Date(dayStart - IST_OFFSET_MS);
}

/** Hour of day (0..23) of an ISO timestamp in Asia/Kolkata. */
export function istHour(iso: string): number {
  const shifted = new Date(iso).getTime() + IST_OFFSET_MS;
  return Math.floor((((shifted % DAY_MS) + DAY_MS) % DAY_MS) / (60 * 60 * 1000));
}

export async function buildDashboardStats(db: SupabaseClient, restaurantId: string): Promise<DashboardStats> {
  const since = startOfTodayIST().toISOString();

  const [todayRes, activeRes, callsRes, recentRes] = await Promise.all([
    db
      .from('orders')
      .select(ORDER_SELECT)
      .eq('restaurant_id', restaurantId)
      .gte('placed_at', since)
      .order('placed_at', { ascending: false })
      .limit(2000),
    db.from('orders').select('id, table_id').eq('restaurant_id', restaurantId).in('status', ACTIVE_ORDER_STATUSES),
    db.from('assistance_calls').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurantId).eq('status', 'open'),
    db.from('orders').select(ORDER_SELECT).eq('restaurant_id', restaurantId).order('placed_at', { ascending: false }).limit(8),
  ]);

  if (todayRes.error) throw fromSupabase(todayRes.error);
  if (activeRes.error) throw fromSupabase(activeRes.error);
  if (callsRes.error) throw fromSupabase(callsRes.error);
  if (recentRes.error) throw fromSupabase(recentRes.error);

  const todayOrders = (todayRes.data ?? []) as OrderWithItems[];
  const billable = todayOrders.filter((o) => o.status !== 'cancelled');

  let revenue = 0;
  let itemsSold = 0;
  const hourly: DashboardStats['hourly'] = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, revenue: 0 }));
  const byItem = new Map<string, { name: string; quantity: number; revenue: number }>();

  for (const order of billable) {
    const total = num(order.total);
    revenue += total;
    const bucket = hourly[istHour(order.placed_at)];
    if (bucket) {
      bucket.orders += 1;
      bucket.revenue = roundMoney(bucket.revenue + total);
    }
    for (const item of order.items ?? []) {
      const qty = num(item.quantity);
      itemsSold += qty;
      const key = item.name.trim().toLowerCase();
      const agg = byItem.get(key) ?? { name: item.name, quantity: 0, revenue: 0 };
      agg.quantity += qty;
      agg.revenue = roundMoney(agg.revenue + num(item.line_total));
      byItem.set(key, agg);
    }
  }

  const topItems = [...byItem.values()].sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue).slice(0, 8);

  const activeRows = (activeRes.data ?? []) as Array<{ id: string; table_id: string }>;
  const occupied = new Set(activeRows.map((r) => r.table_id));

  return {
    today: {
      revenue: roundMoney(revenue),
      orders: billable.length,
      avg_order_value: billable.length ? roundMoney(revenue / billable.length) : 0,
      items_sold: itemsSold,
      active_orders: activeRows.length,
      open_calls: callsRes.count ?? 0,
      occupied_tables: occupied.size,
    },
    hourly,
    top_items: topItems,
    recent_orders: ((recentRes.data ?? []) as OrderWithItems[]).map(withSortedItems),
  };
}
