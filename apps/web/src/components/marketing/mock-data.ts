import type { OrderStatus } from '@restaurant-os/shared';
import { computeTotals } from '@/lib/utils';

/**
 * Demo content for the phone / board mock-ups on the marketing site.
 * Everything here is illustrative product UI, not customer data.
 */
export const MOCK_RESTAURANT = { name: 'Saffron Lane Café', table: 'Table 1', area: 'Indoor' } as const;

export const MOCK_DISHES = [
  { name: 'Paneer Tikka', note: 'Smoky, six pieces, mint chutney', price: 249, veg: true },
  { name: 'Butter Chicken', note: 'With two butter naan', price: 329, veg: false },
  { name: 'Masala Chai', note: 'Cutting, extra ginger', price: 60, veg: true },
] as const;

export const MOCK_ORDER_NUMBER = 1003;

export const MOCK_LINES = [
  { name: 'Paneer Tikka', qty: 1, total: 249 },
  { name: 'Butter Chicken', qty: 1, total: 329 },
  { name: 'Garlic Naan', qty: 2, total: 140 },
  { name: 'Masala Chai', qty: 1, total: 60 },
  { name: 'Gulab Jamun', qty: 1, total: 50 },
] as const;

export const MOCK_SUBTOTAL = MOCK_LINES.reduce((sum, l) => sum + l.total, 0); // 828
export const MOCK_TAX_RATE = 5;
export const MOCK_TOTALS = computeTotals(MOCK_SUBTOTAL, MOCK_TAX_RATE); // total 869.40

export interface MockBoardOrder {
  number: number;
  table: string;
  status: OrderStatus;
  total: number;
  summary: string;
  minutes: number;
}

export const MOCK_BOARD: MockBoardOrder[] = [
  { number: 1002, table: 'Table 3', status: 'preparing', total: 412, summary: 'Veg Biryani ×1 · Sweet Lassi ×2', minutes: 6 },
  { number: 1001, table: 'Table 5', status: 'ready', total: 318, summary: 'Chole Bhature ×2', minutes: 11 },
  { number: 1000, table: 'Table 2', status: 'served', total: 180, summary: 'Filter Coffee ×3', minutes: 19 },
];
