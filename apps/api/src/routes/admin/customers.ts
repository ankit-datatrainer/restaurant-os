import { Router } from 'express';
import type { ConsentEvent, CustomerDetail, LoyaltyReward, CustomerSegment, CustomerSummary, CustomersResponse, OrderWithItems } from '@restaurant-os/shared';
import { formatIndianPhone } from '@restaurant-os/shared';
import { config } from '../../config.js';
import { fromSupabase, notFound } from '../../lib/errors.js';
import { num, parse, pickQuery, staffHandler, uuidParam } from '../../services/handlers.js';
import { ORDER_SELECT, withSortedItems } from '../../services/orders.js';
import { requireFeature } from '../../services/plan.js';
import { customersQuerySchema } from '../../services/schemas.js';

export const customersRouter = Router();

const DAY = 86_400_000;

function toSummary(row: Record<string, unknown>): CustomerSummary {
  return {
    id: String(row.id),
    phone: String(row.phone),
    name: (row.name as string | null) ?? null,
    marketing_consent: Boolean(row.marketing_consent),
    consent_at: (row.consent_at as string | null) ?? null,
    consent_revoked_at: (row.consent_revoked_at as string | null) ?? null,
    unsubscribe_token: String(row.unsubscribe_token),
    first_seen_at: String(row.first_seen_at),
    last_seen_at: String(row.last_seen_at),
    orders_count: num(row.orders_count),
    visits: num(row.visits),
    total_spent: num(row.total_spent),
    last_order_at: (row.last_order_at as string | null) ?? null,
    avg_rating: row.avg_rating === null || row.avg_rating === undefined ? null : num(row.avg_rating),
  };
}

function lastActivity(c: CustomerSummary): number {
  return new Date(c.last_order_at ?? c.last_seen_at).getTime();
}

function inSegment(c: CustomerSummary, segment: CustomerSegment, now: number): boolean {
  switch (segment) {
    case 'repeat':
      return c.visits >= 2;
    case 'new':
      return now - new Date(c.first_seen_at).getTime() <= 7 * DAY;
    case 'lapsed':
      return now - lastActivity(c) > 30 * DAY;
    case 'opted_in':
      return c.marketing_consent;
    default:
      return true;
  }
}

function matches(c: CustomerSummary, q: string): boolean {
  const n = q.toLowerCase();
  const digits = q.replace(/\D/g, '');
  return (c.name ?? '').toLowerCase().includes(n) || (digits.length >= 3 && c.phone.includes(digits));
}

async function loadCustomers(req: Parameters<Parameters<typeof staffHandler>[0]>[0]): Promise<CustomerSummary[]> {
  const { data, error } = await req.auth.db.rpc('customer_list', { p_restaurant_id: req.auth.restaurant.id });
  if (error) throw fromSupabase(error);
  return ((data ?? []) as Record<string, unknown>[]).map(toSummary).sort((a, b) => lastActivity(b) - lastActivity(a));
}

export function unsubscribeUrl(token: string): string {
  return `${config.appUrl}/unsubscribe/${token}`;
}

// GET /api/admin/customers?segment=&q=
customersRouter.get(
  '/',
  staffHandler(async (req, res) => {
    requireFeature(req.auth.restaurant.plan, 'crm');
    const q = parse(customersQuerySchema, pickQuery(req.query, ['segment', 'q']));
    const all = await loadCustomers(req);
    const now = Date.now();
    const repeat = all.filter((c) => inSegment(c, 'repeat', now)).length;
    const summary: CustomersResponse['summary'] = {
      total: all.length,
      opted_in: all.filter((c) => c.marketing_consent).length,
      repeat,
      repeat_rate: all.length > 0 ? Math.round((repeat / all.length) * 1000) / 10 : 0,
      new_this_week: all.filter((c) => inSegment(c, 'new', now)).length,
      lapsed: all.filter((c) => inSegment(c, 'lapsed', now)).length,
    };
    const segment = q.segment ?? 'all';
    const customers = all.filter((c) => inSegment(c, segment, now) && (!q.q || matches(c, q.q)));
    const payload: CustomersResponse = { customers, summary };
    res.json(payload);
  }),
);

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  // Neutralise spreadsheet formulas and quote everything.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

// GET /api/admin/customers/export.csv?segment=  (token may come as ?token= for a plain download link)
customersRouter.get(
  '/export.csv',
  staffHandler(async (req, res) => {
    requireFeature(req.auth.restaurant.plan, 'crm');
    const q = parse(customersQuerySchema, pickQuery(req.query, ['segment', 'q']));
    const segment = q.segment ?? 'all';
    const now = Date.now();
    const rows = (await loadCustomers(req)).filter((c) => inSegment(c, segment, now) && (!q.q || matches(c, q.q)));
    const header = ['Name', 'Phone', 'WhatsApp offers consent', 'Consent date', 'Visits', 'Orders', 'Total spent (INR)', 'Last order', 'Average rating', 'Unsubscribe link'];
    const lines = [header.map(csvCell).join(',')];
    for (const c of rows) {
      lines.push(
        [
          c.name ?? '',
          formatIndianPhone(c.phone),
          c.marketing_consent ? 'Yes' : 'No',
          c.consent_at ?? '',
          c.visits,
          c.orders_count,
          c.total_spent.toFixed(2),
          c.last_order_at ?? '',
          c.avg_rating ?? '',
          c.marketing_consent ? unsubscribeUrl(c.unsubscribe_token) : '',
        ]
          .map(csvCell)
          .join(','),
      );
    }
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="customers-${segment}-${stamp}.csv"`);
    res.send(`﻿${lines.join('\r\n')}\r\n`);
  }),
);

// GET /api/admin/customers/:id → profile, order history, consent history
customersRouter.get(
  '/:id',
  staffHandler(async (req, res) => {
    requireFeature(req.auth.restaurant.plan, 'crm');
    const id = uuidParam(req.params.id, 'Customer not found');
    const customer = (await loadCustomers(req)).find((c) => c.id === id);
    if (!customer) throw notFound('Customer not found');

    const [ordersRes, eventsRes, rewardsRes] = await Promise.all([
      req.auth.db
        .from('orders')
        .select(ORDER_SELECT)
        .eq('restaurant_id', req.auth.restaurant.id)
        .eq('customer_id', id)
        .order('placed_at', { ascending: false })
        .limit(50),
      req.auth.db
        .from('consent_events')
        .select('id, action, source, consent_text, created_at')
        .eq('restaurant_id', req.auth.restaurant.id)
        .eq('customer_id', id)
        .order('created_at', { ascending: false }),
      req.auth.db
        .from('loyalty_rewards')
        .select('*')
        .eq('restaurant_id', req.auth.restaurant.id)
        .eq('customer_id', id)
        .order('earned_at', { ascending: false }),
    ]);
    if (ordersRes.error) throw fromSupabase(ordersRes.error);
    if (eventsRes.error) throw fromSupabase(eventsRes.error);

    const payload: CustomerDetail = {
      customer,
      orders: ((ordersRes.data ?? []) as OrderWithItems[]).map(withSortedItems),
      consent_events: (eventsRes.data ?? []) as ConsentEvent[],
      // Missing table (database without migration 0005) → no rewards rather than an error.
      rewards: rewardsRes.error ? [] : ((rewardsRes.data ?? []) as LoyaltyReward[]),
    };
    res.json(payload);
  }),
);

// POST /api/admin/customers/:id/revoke-consent → records the customer's request to stop messages
customersRouter.post(
  '/:id/revoke-consent',
  staffHandler(async (req, res) => {
    requireFeature(req.auth.restaurant.plan, 'crm');
    const id = uuidParam(req.params.id, 'Customer not found');
    const { error } = await req.auth.db.rpc('revoke_marketing_consent', { p_customer_id: id });
    if (error) throw fromSupabase(error);
    const customer = (await loadCustomers(req)).find((c) => c.id === id);
    if (!customer) throw notFound('Customer not found');
    res.json(customer);
  }),
);
