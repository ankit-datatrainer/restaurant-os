import type { Restaurant } from '@restaurant-os/shared';

/**
 * The restaurants row carries `next_order_number`, an internal counter that
 * must never reach a client. Every response that includes a restaurant goes
 * through this helper.
 */
export function stripRestaurant(row: unknown): Restaurant {
  const copy: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  delete copy.next_order_number;
  delete copy.next_bill_number;
  return copy as unknown as Restaurant;
}
