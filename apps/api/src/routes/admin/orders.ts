import { Router } from 'express';
import type { OrderWithItems } from '@restaurant-os/shared';
import { badRequest, fromSupabase, notFound } from '../../lib/errors.js';
import { parse, pickQuery, staffHandler, uuidParam } from '../../services/handlers.js';
import {
  ACTIVE_ORDER_STATUSES,
  ORDER_SELECT,
  PAST_ORDER_STATUSES,
  fetchOrder,
  orderMatchesText,
  parseOrderNumber,
  transitionError,
  withSortedItems,
} from '../../services/orders.js';
import { orderStatusBodySchema, ordersQuerySchema, paymentStatusBodySchema } from '../../services/schemas.js';
import { notifyGuestPaid, notifyGuestStatus } from '../../services/push.js';

const DEFAULT_LIMIT = 100;
const SEARCH_FETCH_LIMIT = 300;

export const ordersRouter = Router();

// GET /api/admin/orders?scope=&status=&payment_status=&table_id=&q=&since=&until=&limit=
ordersRouter.get(
  '/',
  staffHandler(async (req, res) => {
    const filter = parse(ordersQuerySchema, pickQuery(req.query, ['scope', 'status', 'payment_status', 'table_id', 'q', 'since', 'until', 'limit']));
    const limit = filter.limit ?? DEFAULT_LIMIT;
    const search = filter.q?.trim() ?? '';
    const orderNumber = search ? parseOrderNumber(search) : null;
    const textSearch = search !== '' && orderNumber === null;

    let query = req.auth.db.from('orders').select(ORDER_SELECT).eq('restaurant_id', req.auth.restaurant.id);
    if (filter.status) query = query.eq('status', filter.status);
    else if (filter.scope === 'active') query = query.in('status', ACTIVE_ORDER_STATUSES);
    else if (filter.scope === 'past') query = query.in('status', PAST_ORDER_STATUSES);
    if (filter.payment_status) query = query.eq('payment_status', filter.payment_status);
    if (filter.table_id) query = query.eq('table_id', filter.table_id);
    if (filter.since) query = query.gte('placed_at', filter.since);
    if (filter.until) query = query.lt('placed_at', filter.until);
    if (orderNumber !== null) query = query.eq('order_number', orderNumber);

    const { data, error } = await query
      .order('placed_at', { ascending: false })
      .limit(textSearch ? Math.max(limit, SEARCH_FETCH_LIMIT) : limit);
    if (error) throw fromSupabase(error);

    let orders = ((data ?? []) as OrderWithItems[]).map(withSortedItems);
    if (textSearch) orders = orders.filter((o) => orderMatchesText(o, search)).slice(0, limit);
    res.json(orders);
  }),
);

// GET /api/admin/orders/:id
ordersRouter.get(
  '/:id',
  staffHandler(async (req, res) => {
    const id = uuidParam(req.params.id, 'Order not found');
    res.json(await fetchOrder(req.auth.db, req.auth.restaurant.id, id));
  }),
);

// PATCH /api/admin/orders/:id/status { status }
ordersRouter.patch(
  '/:id/status',
  staffHandler(async (req, res) => {
    const id = uuidParam(req.params.id, 'Order not found');
    const { status } = parse(orderStatusBodySchema, req.body);
    const current = await fetchOrder(req.auth.db, req.auth.restaurant.id, id);

    const reason = transitionError(current.status, status);
    if (reason) throw badRequest(reason);

    const { data, error } = await req.auth.db
      .from('orders')
      .update({ status })
      .eq('id', id)
      .eq('restaurant_id', req.auth.restaurant.id)
      .select(ORDER_SELECT)
      .maybeSingle();
    if (error) throw fromSupabase(error);
    if (!data) throw notFound('Order not found');
    const updated = withSortedItems(data as OrderWithItems);
    notifyGuestStatus(req.auth.db, req.auth.restaurant, updated);
    res.json(updated);
  }),
);

// PATCH /api/admin/orders/:id/payment { payment_status }
ordersRouter.patch(
  '/:id/payment',
  staffHandler(async (req, res) => {
    const id = uuidParam(req.params.id, 'Order not found');
    const { payment_status } = parse(paymentStatusBodySchema, req.body);

    const { data, error } = await req.auth.db
      .from('orders')
      .update({ payment_status })
      .eq('id', id)
      .eq('restaurant_id', req.auth.restaurant.id)
      .select(ORDER_SELECT)
      .maybeSingle();
    if (error) throw fromSupabase(error);
    if (!data) throw notFound('Order not found');
    const updated = withSortedItems(data as OrderWithItems);
    if (payment_status === 'paid') notifyGuestPaid(req.auth.db, req.auth.restaurant, updated);
    res.json(updated);
  }),
);
