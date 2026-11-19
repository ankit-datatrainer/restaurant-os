import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type {
  AssistanceCall,
  DiningTable,
  HappyHour,
  LoyaltyStatus,
  Lead,
  MenuCategory,
  MenuItem,
  OrderQuote,
  OrderWithItems,
  ReservationRequestResult,
  Restaurant,
  RestaurantPageResponse,
  TableMenuResponse,
  UnsubscribeInfo,
} from '@restaurant-os/shared';
import { anonClient } from '../lib/supabase.js';
import { asyncHandler, fromSupabase, notFound } from '../lib/errors.js';
import { parse, pickQuery, uuidParam } from '../services/handlers.js';
import { rateLimit } from '../services/rateLimit.js';
import { stripRestaurant } from '../services/restaurant.js';
import { TABLE_CODE_RE } from '../services/tables.js';
import {
  addItemsSchema,
  claimPaymentSchema,
  createCallSchema,
  feedbackSchema,
  leadSchema,
  orderSessionQuerySchema,
  placeOrderSchema,
  quoteSchema,
  reservationRequestSchema,
  sessionCallsQuerySchema,
  takeawayOrdersQuerySchema,
  sessionOrdersQuerySchema,
} from '../services/schemas.js';

const TABLE_NOT_FOUND = 'We could not find this table. Please scan the QR code again or ask the staff.';
const ORDER_NOT_FOUND = 'We could not find this order. It may belong to a different session.';
const UNSUBSCRIBE_NOT_FOUND = 'This unsubscribe link is not valid or has expired.';

function lineInput(item: { menu_item_id: string; quantity: number; options?: Array<{ group_id: string; choice_id: string }>; note?: string }) {
  return {
    menu_item_id: item.menu_item_id,
    quantity: item.quantity,
    options: item.options ?? [],
    note: item.note ?? null,
  };
}

/** Happy hours that guests should know about (all active ones; the client shows the one running now). */
async function activeHappyHours(restaurantId: string): Promise<HappyHour[]> {
  const { data, error } = await anonClient.from('happy_hours').select('*').eq('restaurant_id', restaurantId).eq('is_active', true);
  // Older database without migration 0006: no happy hours.
  if (error) return [];
  return (data ?? []) as HappyHour[];
}

export const publicRouter = Router();

// Guests can hammer GETs (the tracker polls every few seconds); only writes are limited.
// Two buckets: a generous per-IP abuse guard, because every phone on the venue Wi-Fi (or behind a
// carrier CGNAT) shares one public IP, and a tight one per guest session / table / lead so a single
// misbehaving phone cannot starve the rest of the room.
publicRouter.use(rateLimit({ windowMs: 60_000, max: 300, methods: ['POST'] }));
publicRouter.use(
  rateLimit({
    windowMs: 60_000,
    max: 30,
    methods: ['POST'],
    key: (req) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const who = [body.guest_session_id, body.table_code, body.email].find((v) => typeof v === 'string' && v.trim() !== '');
      return `${req.ip ?? 'unknown'}:${typeof who === 'string' ? who.trim().toUpperCase() : 'anon'}`;
    },
  }),
);

// ---------------------------------------------------------------------------
// GET /api/public/tables/:code → restaurant + table + menu
// ---------------------------------------------------------------------------
publicRouter.get(
  '/tables/:code',
  asyncHandler(async (req, res) => {
    const code = String(req.params.code ?? '').trim().toUpperCase();
    if (!TABLE_CODE_RE.test(code)) throw notFound(TABLE_NOT_FOUND);

    const { data: table, error: tableErr } = await anonClient
      .from('dining_tables')
      .select('*')
      .eq('code', code)
      .eq('is_active', true)
      .maybeSingle();
    if (tableErr) throw fromSupabase(tableErr);
    if (!table) throw notFound(TABLE_NOT_FOUND);
    const diningTable = table as DiningTable;

    const [restaurantRes, categoriesRes] = await Promise.all([
      anonClient.from('restaurants').select('*').eq('id', diningTable.restaurant_id).maybeSingle(),
      anonClient
        .from('menu_categories')
        .select('*')
        .eq('restaurant_id', diningTable.restaurant_id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),
    ]);
    if (restaurantRes.error) throw fromSupabase(restaurantRes.error);
    if (!restaurantRes.data) throw notFound(TABLE_NOT_FOUND);
    if (categoriesRes.error) throw fromSupabase(categoriesRes.error);

    const categories = (categoriesRes.data ?? []) as MenuCategory[];
    let items: MenuItem[] = [];
    if (categories.length > 0) {
      const { data, error } = await anonClient
        .from('menu_items')
        .select('*')
        .eq('restaurant_id', diningTable.restaurant_id)
        .in(
          'category_id',
          categories.map((c) => c.id),
        )
        .order('category_id', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw fromSupabase(error);
      items = (data ?? []) as MenuItem[];
    }

    const payload: TableMenuResponse = {
      restaurant: stripRestaurant(restaurantRes.data),
      table: diningTable,
      categories,
      items,
      happy_hours: await activeHappyHours(diningTable.restaurant_id),
    };
    res.json(payload);
  }),
);

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
publicRouter.post(
  '/orders',
  asyncHandler(async (req, res) => {
    const input = parse(placeOrderSchema, req.body);
    const hasPhone = Boolean(input.guest_phone);
    const { data, error } = await anonClient.rpc('place_order', {
      p_table_code: input.table_code ?? null,
      p_guest_session_id: input.guest_session_id,
      p_guest_name: input.guest_name ?? null,
      p_payment_method: input.payment_method,
      p_note: input.note ?? null,
      p_items: input.items.map(lineInput),
      p_phone: input.guest_phone ?? null,
      // Consent only counts with a phone number and an explicit tick.
      p_marketing_consent: hasPhone && input.marketing_consent === true,
      p_consent_text: hasPhone && input.marketing_consent === true ? (input.consent_text ?? null) : null,
      p_client_ref: input.client_ref ?? null,
      p_order_type: input.order_type ?? 'dine_in',
      p_restaurant_slug: input.restaurant_slug ?? null,
      p_pickup_at: input.pickup_at ?? null,
      p_coupon_code: input.coupon_code ?? null,
    });
    // Postgres `raise exception ... errcode P0001` → 400 with the function's own message.
    if (error) throw fromSupabase(error, 'Could not place the order');
    if (!data) throw notFound(ORDER_NOT_FOUND);
    res.json(data as OrderWithItems);
  }),
);

/** Add dishes to an order that is still open (placed / accepted / preparing, unpaid). */
publicRouter.post(
  '/orders/:id/items',
  asyncHandler(async (req, res) => {
    const id = uuidParam(req.params.id, ORDER_NOT_FOUND);
    const input = parse(addItemsSchema, req.body);
    const base = { p_order_id: id, p_guest_session_id: input.guest_session_id, p_items: input.items.map(lineInput) };
    let { data, error } = await anonClient.rpc('add_order_items', { ...base, p_client_ref: input.client_ref ?? null });
    // Database without migration 0004 (no p_client_ref parameter yet): add without the duplicate guard.
    if (error?.code === 'PGRST202') ({ data, error } = await anonClient.rpc('add_order_items', base));
    if (error) throw fromSupabase(error, 'Could not add to the order');
    if (!data) throw notFound(ORDER_NOT_FOUND);
    res.json(data as OrderWithItems);
  }),
);

/** 1–5 rating (+ optional comment) once the order has been served. */
publicRouter.post(
  '/orders/:id/feedback',
  asyncHandler(async (req, res) => {
    const id = uuidParam(req.params.id, ORDER_NOT_FOUND);
    const input = parse(feedbackSchema, req.body);
    const { data, error } = await anonClient.rpc('submit_feedback', {
      p_order_id: id,
      p_guest_session_id: input.guest_session_id,
      p_rating: input.rating,
      p_comment: input.comment ?? null,
    });
    if (error) throw fromSupabase(error, 'Could not save your feedback');
    if (!data) throw notFound(ORDER_NOT_FOUND);
    res.json(data as OrderWithItems);
  }),
);

publicRouter.get(
  '/orders',
  asyncHandler(async (req, res) => {
    const q = parse(sessionOrdersQuerySchema, pickQuery(req.query, ['table', 'session']));
    const { data, error } = await anonClient.rpc('get_session_orders', {
      p_table_code: q.table,
      p_guest_session_id: q.session,
    });
    if (error) throw fromSupabase(error);
    res.json((data ?? []) as OrderWithItems[]);
  }),
);

publicRouter.get(
  '/orders/:id',
  asyncHandler(async (req, res) => {
    const id = uuidParam(req.params.id, ORDER_NOT_FOUND);
    const q = parse(orderSessionQuerySchema, pickQuery(req.query, ['session']));
    const { data, error } = await anonClient.rpc('get_order', { p_order_id: id, p_guest_session_id: q.session });
    if (error) throw fromSupabase(error);
    if (!data) throw notFound(ORDER_NOT_FOUND);
    res.json(data as OrderWithItems);
  }),
);

publicRouter.post(
  '/orders/:id/claim-payment',
  asyncHandler(async (req, res) => {
    const id = uuidParam(req.params.id, ORDER_NOT_FOUND);
    const body = parse(claimPaymentSchema, req.body);
    const { data, error } = await anonClient.rpc('claim_payment', { p_order_id: id, p_guest_session_id: body.guest_session_id });
    if (error) throw fromSupabase(error, 'Could not update the payment');
    if (!data) throw notFound(ORDER_NOT_FOUND);
    res.json(data as OrderWithItems);
  }),
);

// ---------------------------------------------------------------------------
// Assistance calls
// ---------------------------------------------------------------------------
publicRouter.post(
  '/calls',
  asyncHandler(async (req, res) => {
    const input = parse(createCallSchema, req.body);
    const { data, error } = await anonClient.rpc('create_assistance_call', {
      p_table_code: input.table_code,
      p_guest_session_id: input.guest_session_id ?? null,
      p_type: input.type,
      p_note: input.note ?? null,
    });
    if (error) throw fromSupabase(error, 'Could not call the staff');
    if (!data) throw notFound(TABLE_NOT_FOUND);
    res.json(data as AssistanceCall);
  }),
);

/** The guest's own requests from the last 4 hours, newest first (shows "a waiter is on the way"). */
publicRouter.get(
  '/calls',
  asyncHandler(async (req, res) => {
    const q = parse(sessionCallsQuerySchema, pickQuery(req.query, ['table', 'session']));
    const { data, error } = await anonClient.rpc('get_session_calls', { p_table_code: q.table, p_guest_session_id: q.session });
    if (error) throw fromSupabase(error);
    res.json((data ?? []) as AssistanceCall[]);
  }),
);

/** The guest's loyalty card: visits so far, visits needed, unused reward codes (Premium). */
publicRouter.get(
  '/loyalty',
  asyncHandler(async (req, res) => {
    const q = parse(sessionCallsQuerySchema, pickQuery(req.query, ['table', 'session']));
    const { data, error } = await anonClient.rpc('get_loyalty_status', { p_table_code: q.table, p_guest_session_id: q.session });
    if (error) throw fromSupabase(error);
    res.json((data ?? { enabled: false, linked: false }) as LoyaltyStatus);
  }),
);

// ---------------------------------------------------------------------------
// Unsubscribe from WhatsApp offers (link included in every marketing message)
// ---------------------------------------------------------------------------
publicRouter.get(
  '/unsubscribe/:token',
  asyncHandler(async (req, res) => {
    const token = uuidParam(req.params.token, UNSUBSCRIBE_NOT_FOUND);
    const { data, error } = await anonClient.rpc('get_unsubscribe', { p_token: token });
    if (error) throw fromSupabase(error);
    if (!data) throw notFound(UNSUBSCRIBE_NOT_FOUND);
    res.json(data as UnsubscribeInfo);
  }),
);

publicRouter.post(
  '/unsubscribe/:token',
  asyncHandler(async (req, res) => {
    const token = uuidParam(req.params.token, UNSUBSCRIBE_NOT_FOUND);
    const { data, error } = await anonClient.rpc('unsubscribe_customer', { p_token: token });
    if (error) throw fromSupabase(error, 'Could not unsubscribe');
    if (!data) throw notFound(UNSUBSCRIBE_NOT_FOUND);
    res.json(data as UnsubscribeInfo);
  }),
);

// ---------------------------------------------------------------------------
// Leads (marketing contact form)
// ---------------------------------------------------------------------------
publicRouter.post(
  '/leads',
  asyncHandler(async (req, res) => {
    const input = parse(leadSchema, req.body);
    const row: Lead = {
      id: randomUUID(),
      name: input.name,
      email: input.email.toLowerCase(),
      phone: input.phone || null,
      restaurant_name: input.restaurant_name || null,
      message: input.message || null,
      city: input.city || null,
      table_count: input.table_count ?? null,
      plan_interest: input.plan_interest ?? null,
      created_at: new Date().toISOString(),
    };

    // Anonymous users may insert leads but not read them back. Try the normal
    // insert+select first; if RLS rejects the RETURNING step, insert without it
    // and echo the row we generated.
    const first = await anonClient.from('leads').insert(row).select('*').single();
    if (!first.error) {
      res.status(201).json(first.data as Lead);
      return;
    }
    const rlsBlocked = first.error.code === '42501' || /row-level security/i.test(first.error.message);
    if (!rlsBlocked) throw fromSupabase(first.error, 'Could not save your message');

    const second = await anonClient.from('leads').insert(row);
    if (second.error) throw fromSupabase(second.error, 'Could not save your message');
    res.status(201).json(row);
  }),
);

// ---------------------------------------------------------------------------
// Restaurant page: online takeaway + table booking (migration 0006)
// ---------------------------------------------------------------------------
const RESTAURANT_NOT_FOUND = 'We could not find this restaurant.';

publicRouter.get(
  '/restaurants/:slug',
  asyncHandler(async (req, res) => {
    const slug = String(req.params.slug ?? '').trim().toLowerCase();
    if (!/^[a-z0-9-]{2,60}$/.test(slug)) throw notFound(RESTAURANT_NOT_FOUND);
    const { data: rest, error } = await anonClient.from('restaurants').select('*').eq('slug', slug).maybeSingle();
    if (error) throw fromSupabase(error);
    if (!rest) throw notFound(RESTAURANT_NOT_FOUND);
    const restaurant = rest as Restaurant;
    const [cats, items] = await Promise.all([
      anonClient.from('menu_categories').select('*').eq('restaurant_id', restaurant.id).eq('is_active', true).order('sort_order').order('name'),
      anonClient.from('menu_items').select('*').eq('restaurant_id', restaurant.id).order('sort_order').order('name'),
    ]);
    if (cats.error) throw fromSupabase(cats.error);
    if (items.error) throw fromSupabase(items.error);
    const categories = (cats.data ?? []) as MenuCategory[];
    const catIds = new Set(categories.map((c) => c.id));
    const payload: RestaurantPageResponse = {
      restaurant: stripRestaurant(restaurant),
      categories,
      items: ((items.data ?? []) as MenuItem[]).filter((i) => catIds.has(i.category_id)),
      happy_hours: await activeHappyHours(restaurant.id),
    };
    res.json(payload);
  }),
);

/** Live price for the cart: happy hour + coupon check. Writes nothing. */
publicRouter.post(
  '/quote',
  asyncHandler(async (req, res) => {
    const input = parse(quoteSchema, req.body);
    const { data, error } = await anonClient.rpc('quote_order', {
      p_table_code: input.table_code ?? null,
      p_restaurant_slug: input.table_code ? null : (input.restaurant_slug ?? null),
      p_items: input.items.map(lineInput),
      p_coupon_code: input.coupon_code ?? null,
      p_pickup_at: input.pickup_at ?? null,
    });
    if (error) throw fromSupabase(error, 'Could not price the order');
    res.json(data as OrderQuote);
  }),
);

/** This phone's takeaway orders from the last 3 days, newest first. */
publicRouter.get(
  '/takeaway-orders',
  asyncHandler(async (req, res) => {
    const q = parse(takeawayOrdersQuerySchema, pickQuery(req.query, ['restaurant', 'session']));
    const { data, error } = await anonClient.rpc('get_takeaway_session_orders', { p_restaurant_slug: q.restaurant, p_guest_session_id: q.session });
    if (error) throw fromSupabase(error);
    res.json((data ?? []) as OrderWithItems[]);
  }),
);

/** Booking request; the restaurant confirms it. */
publicRouter.post(
  '/reservations',
  asyncHandler(async (req, res) => {
    const input = parse(reservationRequestSchema, req.body);
    const { data, error } = await anonClient.rpc('request_reservation', {
      p_restaurant_slug: input.restaurant_slug,
      p_name: input.name,
      p_phone: input.phone,
      p_party_size: input.party_size,
      p_reserved_for: input.reserved_for,
      p_note: input.note ?? null,
    });
    if (error) throw fromSupabase(error, 'Could not send the booking request');
    res.status(201).json(data as ReservationRequestResult);
  }),
);
