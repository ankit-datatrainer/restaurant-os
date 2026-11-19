import { Router } from 'express';
import type {
  AssistanceCall,
  BillPreview,
  BillWithDetails,
  DiningTable,
  FloorResponse,
  FloorTable,
  FloorTableState,
  OrderQuote,
  OrderWithItems,
  Reservation,
} from '@restaurant-os/shared';
import { forbidden, fromSupabase, notFound } from '../../lib/errors.js';
import { num, parse, pickQuery, staffHandler, uuidParam } from '../../services/handlers.js';
import { ORDER_SELECT, withSortedItems } from '../../services/orders.js';
import { requireManager } from '../../services/plan.js';
import {
  billPreviewSchema,
  billsQuerySchema,
  posOrderSchema,
  quoteSchema,
  refundSchema,
  settleBillSchema,
  transferSchema,
} from '../../services/schemas.js';

const BILL_SELECT = '*, payments:bill_payments(*), table:dining_tables(id,code,label,area)';

function lineInput(item: { menu_item_id: string; quantity: number; options?: Array<{ group_id: string; choice_id: string }>; note?: string }) {
  return { menu_item_id: item.menu_item_id, quantity: item.quantity, options: item.options ?? [], note: item.note ?? null };
}

function noKitchen(role: string) {
  if (role === 'kitchen') throw forbidden('Kitchen accounts cannot take orders or settle bills.');
}

export const posRouter = Router();

// ---------------------------------------------------------------------------
// Counter orders
// ---------------------------------------------------------------------------

// POST /api/admin/pos/orders → the order goes straight to the kitchen as "accepted"
posRouter.post(
  '/pos/orders',
  staffHandler(async (req, res) => {
    noKitchen(req.auth.staff.role);
    const input = parse(posOrderSchema, req.body);
    const { data, error } = await req.auth.db.rpc('staff_place_order', {
      p_table_id: input.order_type === 'dine_in' ? input.table_id : null,
      p_order_type: input.order_type,
      p_items: input.items.map(lineInput),
      p_guest_name: input.guest_name ?? null,
      p_phone: input.guest_phone ?? null,
      p_note: input.note ?? null,
      p_client_ref: input.client_ref ?? null,
    });
    if (error) throw fromSupabase(error, 'Could not place the order');
    res.status(201).json(withSortedItems(data as OrderWithItems));
  }),
);

// POST /api/admin/pos/quote → live total for the POS cart (happy hour included)
posRouter.post(
  '/pos/quote',
  staffHandler(async (req, res) => {
    const input = parse(quoteSchema, { ...req.body, restaurant_slug: req.auth.restaurant.slug, table_code: undefined });
    const { data, error } = await req.auth.db.rpc('quote_order', {
      p_table_code: null,
      p_restaurant_slug: req.auth.restaurant.slug,
      p_items: input.items.map(lineInput),
      p_coupon_code: null,
      p_pickup_at: null,
    });
    if (error) throw fromSupabase(error);
    res.json(data as OrderQuote);
  }),
);

// ---------------------------------------------------------------------------
// Bills: preview, settle (merge + split tender + tip + discount), list, refund
// ---------------------------------------------------------------------------

posRouter.post(
  '/bills/preview',
  staffHandler(async (req, res) => {
    const input = parse(billPreviewSchema, req.body);
    const { data, error } = await req.auth.db.rpc('bill_preview', {
      p_order_ids: input.order_ids,
      p_discount_type: input.discount_type ?? 'none',
      p_discount_value: input.discount_value ?? 0,
    });
    if (error) throw fromSupabase(error);
    res.json(data as BillPreview);
  }),
);

posRouter.post(
  '/bills',
  staffHandler(async (req, res) => {
    noKitchen(req.auth.staff.role);
    const input = parse(settleBillSchema, req.body);
    const { data, error } = await req.auth.db.rpc('settle_bill', {
      p_order_ids: input.order_ids,
      p_discount_type: input.discount_type ?? 'none',
      p_discount_value: input.discount_value ?? 0,
      p_discount_reason: input.discount_reason ?? null,
      p_tip: input.tip ?? 0,
      p_payments: input.payments.map((p) => ({ method: p.method, amount: p.amount, reference: p.reference ?? null })),
      p_note: input.note ?? null,
    });
    if (error) throw fromSupabase(error, 'Could not settle the bill');
    res.status(201).json(data as BillWithDetails);
  }),
);

// GET /api/admin/bills?since=&until=&status=&q=   (q = bill number)
posRouter.get(
  '/bills',
  staffHandler(async (req, res) => {
    const q = parse(billsQuerySchema, pickQuery(req.query, ['since', 'until', 'status', 'q']));
    let query = req.auth.db.from('bills').select(BILL_SELECT).eq('restaurant_id', req.auth.restaurant.id);
    if (q.since) query = query.gte('settled_at', q.since);
    if (q.until) query = query.lt('settled_at', q.until);
    if (q.status && q.status !== 'all') query = query.eq('status', q.status);
    const n = q.q ? Number(q.q.replace(/\D/g, '')) : NaN;
    if (Number.isFinite(n) && n > 0) query = query.eq('bill_number', n);
    const { data, error } = await query.order('settled_at', { ascending: false }).limit(300);
    if (error) throw fromSupabase(error);
    res.json(data ?? []);
  }),
);

posRouter.get(
  '/bills/:id',
  staffHandler(async (req, res) => {
    const id = uuidParam(req.params.id, 'Bill not found');
    const { data, error } = await req.auth.db.rpc('bill_json', { p_bill_id: id });
    if (error) throw fromSupabase(error);
    if (!data) throw notFound('Bill not found');
    const bill = data as BillWithDetails;
    res.json({ ...bill, orders: (bill.orders ?? []).map(withSortedItems) });
  }),
);

posRouter.post(
  '/bills/:id/refund',
  staffHandler(async (req, res) => {
    requireManager(req.auth.staff.role, 'refund a bill');
    const id = uuidParam(req.params.id, 'Bill not found');
    const { reason } = parse(refundSchema, req.body);
    const { data, error } = await req.auth.db.rpc('refund_bill', { p_bill_id: id, p_reason: reason });
    if (error) throw fromSupabase(error, 'Could not refund the bill');
    res.json(data as BillWithDetails);
  }),
);

// ---------------------------------------------------------------------------
// Floor view: every table with its live state
// ---------------------------------------------------------------------------

posRouter.get(
  '/floor',
  staffHandler(async (req, res) => {
    const rid = req.auth.restaurant.id;
    const now = new Date();
    const soon = new Date(now.getTime() + 3 * 3600_000).toISOString();
    const [tablesRes, ordersRes, callsRes, resvRes] = await Promise.all([
      req.auth.db.from('dining_tables').select('*').eq('restaurant_id', rid).eq('is_active', true).order('sort_order').order('label'),
      req.auth.db
        .from('orders')
        .select(ORDER_SELECT)
        .eq('restaurant_id', rid)
        .neq('status', 'cancelled')
        .in('payment_status', ['pending', 'claimed'])
        .is('bill_id', null)
        .order('placed_at', { ascending: true })
        .limit(500),
      req.auth.db.from('assistance_calls').select('id, table_id, type').eq('restaurant_id', rid).eq('status', 'open'),
      req.auth.db
        .from('reservations')
        .select('*')
        .eq('restaurant_id', rid)
        .in('status', ['requested', 'confirmed'])
        .gte('reserved_for', new Date(now.getTime() - 30 * 60_000).toISOString())
        .lte('reserved_for', soon)
        .not('table_id', 'is', null)
        .order('reserved_for'),
    ]);
    for (const r of [tablesRes, ordersRes, callsRes]) if (r.error) throw fromSupabase(r.error);
    // Reservations need migration 0006; a missing table must not break the floor.
    const reservations = resvRes.error ? [] : ((resvRes.data ?? []) as Reservation[]);
    const orders = ((ordersRes.data ?? []) as OrderWithItems[]).map(withSortedItems);
    const calls = (callsRes.data ?? []) as Array<Pick<AssistanceCall, 'id' | 'table_id' | 'type'>>;

    const tables: FloorTable[] = ((tablesRes.data ?? []) as DiningTable[]).map((table) => {
      const open = orders.filter((o) => o.table_id === table.id);
      const tableCalls = calls.filter((c) => c.table_id === table.id);
      const billRequested = tableCalls.some((c) => c.type === 'bill');
      const next = reservations.find((r) => r.table_id === table.id) ?? null;
      let state: FloorTableState = 'free';
      if (open.length > 0) {
        if (billRequested) state = 'bill_requested';
        else if (open.some((o) => o.status === 'placed')) state = 'ordering';
        else if (open.some((o) => ['accepted', 'preparing', 'ready'].includes(o.status))) state = 'in_kitchen';
        else state = 'served';
      } else if (next && new Date(next.reserved_for).getTime() - now.getTime() < 60 * 60_000) {
        state = 'reserved';
      }
      return {
        table,
        state,
        open_orders: open,
        open_total: Math.round(open.reduce((s, o) => s + num(o.total), 0) * 100) / 100,
        since: open[0]?.placed_at ?? null,
        open_calls: tableCalls.length,
        bill_requested: billRequested,
        next_reservation: next,
      };
    });
    const payload: FloorResponse = { tables, takeaway: orders.filter((o) => o.order_type === 'takeaway' || !o.table_id) };
    res.json(payload);
  }),
);

// POST /api/admin/tables/:id/transfer { to_table_id } → moves (or merges) every open order
posRouter.post(
  '/tables/:id/transfer',
  staffHandler(async (req, res) => {
    noKitchen(req.auth.staff.role);
    const from = uuidParam(req.params.id, 'Table not found');
    const { to_table_id } = parse(transferSchema, req.body);
    const { data, error } = await req.auth.db.rpc('transfer_table_orders', { p_from_table: from, p_to_table: to_table_id });
    if (error) throw fromSupabase(error, 'Could not move the orders');
    res.json({ moved: num(data) });
  }),
);
