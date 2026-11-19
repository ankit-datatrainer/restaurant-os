import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { normalizeIndianPhone, type Coupon, type GiftCard, type GiftCardTransaction, type HappyHour } from '@restaurant-os/shared';
import { fromSupabase, notFound } from '../../lib/errors.js';
import { parse, pickQuery, staffHandler, uuidParam } from '../../services/handlers.js';
import { requireFeature, requireManager } from '../../services/plan.js';
import {
  couponCreateSchema,
  couponUpdateSchema,
  giftCardCreateSchema,
  giftCardUpdateSchema,
  happyHourCreateSchema,
  happyHourUpdateSchema,
} from '../../services/schemas.js';
import type { StaffRequest } from '../../middleware/auth.js';

export const promotionsRouter = Router();

function gate(req: StaffRequest, write = false) {
  requireFeature(req.auth.restaurant.plan, 'promotions');
  if (write) requireManager(req.auth.staff.role, 'change promotions');
}

/** "GIFT-7KQ2-M9XD": no 0/O/1/I so it reads cleanly off a printed card. */
function giftCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(8);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  return `GIFT-${chars.slice(0, 4)}-${chars.slice(4, 8)}`;
}

// ----- Coupons ---------------------------------------------------------------

promotionsRouter.get(
  '/coupons',
  staffHandler(async (req, res) => {
    gate(req);
    const { data, error } = await req.auth.db.from('coupons').select('*').eq('restaurant_id', req.auth.restaurant.id).order('created_at', { ascending: false });
    if (error) throw fromSupabase(error);
    res.json((data ?? []) as Coupon[]);
  }),
);

promotionsRouter.post(
  '/coupons',
  staffHandler(async (req, res) => {
    gate(req, true);
    const input = parse(couponCreateSchema, req.body);
    const { data, error } = await req.auth.db.from('coupons').insert({ ...input, restaurant_id: req.auth.restaurant.id }).select('*').single();
    if (error) throw fromSupabase(error.code === '23505' ? { ...error, message: `The code ${input.code} already exists.` } : error);
    res.status(201).json(data as Coupon);
  }),
);

promotionsRouter.patch(
  '/coupons/:id',
  staffHandler(async (req, res) => {
    gate(req, true);
    const id = uuidParam(req.params.id, 'Coupon not found');
    const patch = parse(couponUpdateSchema, req.body);
    const { data, error } = await req.auth.db.from('coupons').update(patch).eq('id', id).eq('restaurant_id', req.auth.restaurant.id).select('*').maybeSingle();
    if (error) throw fromSupabase(error);
    if (!data) throw notFound('Coupon not found');
    res.json(data as Coupon);
  }),
);

promotionsRouter.delete(
  '/coupons/:id',
  staffHandler(async (req, res) => {
    gate(req, true);
    const id = uuidParam(req.params.id, 'Coupon not found');
    const { error } = await req.auth.db.from('coupons').delete().eq('id', id).eq('restaurant_id', req.auth.restaurant.id);
    if (error) throw fromSupabase(error);
    res.status(204).end();
  }),
);

// ----- Happy hours -------------------------------------------------------------

promotionsRouter.get(
  '/happy-hours',
  staffHandler(async (req, res) => {
    gate(req);
    const { data, error } = await req.auth.db.from('happy_hours').select('*').eq('restaurant_id', req.auth.restaurant.id).order('start_time');
    if (error) throw fromSupabase(error);
    res.json((data ?? []) as HappyHour[]);
  }),
);

promotionsRouter.post(
  '/happy-hours',
  staffHandler(async (req, res) => {
    gate(req, true);
    const input = parse(happyHourCreateSchema, req.body);
    const row = { ...input, category_ids: input.category_ids?.length ? input.category_ids : null, restaurant_id: req.auth.restaurant.id };
    const { data, error } = await req.auth.db.from('happy_hours').insert(row).select('*').single();
    if (error) throw fromSupabase(error);
    res.status(201).json(data as HappyHour);
  }),
);

promotionsRouter.patch(
  '/happy-hours/:id',
  staffHandler(async (req, res) => {
    gate(req, true);
    const id = uuidParam(req.params.id, 'Happy hour not found');
    const patch = parse(happyHourUpdateSchema, req.body);
    const update = patch.category_ids !== undefined ? { ...patch, category_ids: patch.category_ids?.length ? patch.category_ids : null } : patch;
    const { data, error } = await req.auth.db.from('happy_hours').update(update).eq('id', id).eq('restaurant_id', req.auth.restaurant.id).select('*').maybeSingle();
    if (error) throw fromSupabase(error);
    if (!data) throw notFound('Happy hour not found');
    res.json(data as HappyHour);
  }),
);

promotionsRouter.delete(
  '/happy-hours/:id',
  staffHandler(async (req, res) => {
    gate(req, true);
    const id = uuidParam(req.params.id, 'Happy hour not found');
    const { error } = await req.auth.db.from('happy_hours').delete().eq('id', id).eq('restaurant_id', req.auth.restaurant.id);
    if (error) throw fromSupabase(error);
    res.status(204).end();
  }),
);

// ----- Gift cards --------------------------------------------------------------

// GET /api/admin/gift-cards?q=CODE-or-name
promotionsRouter.get(
  '/gift-cards',
  staffHandler(async (req, res) => {
    gate(req);
    const { q } = pickQuery(req.query, ['q']);
    let query = req.auth.db.from('gift_cards').select('*').eq('restaurant_id', req.auth.restaurant.id);
    if (q) {
      const safe = q.replace(/[%,()]/g, '');
      query = query.or(`code.ilike.%${safe}%,issued_to_name.ilike.%${safe}%`);
    }
    const { data, error } = await query.order('created_at', { ascending: false }).limit(200);
    if (error) throw fromSupabase(error);
    res.json((data ?? []) as GiftCard[]);
  }),
);

promotionsRouter.get(
  '/gift-cards/:id/transactions',
  staffHandler(async (req, res) => {
    gate(req);
    const id = uuidParam(req.params.id, 'Gift card not found');
    const { data, error } = await req.auth.db.from('gift_card_transactions').select('*').eq('gift_card_id', id).order('created_at', { ascending: false });
    if (error) throw fromSupabase(error);
    res.json((data ?? []) as GiftCardTransaction[]);
  }),
);

promotionsRouter.post(
  '/gift-cards',
  staffHandler(async (req, res) => {
    gate(req, true);
    const input = parse(giftCardCreateSchema, req.body);
    const row = {
      restaurant_id: req.auth.restaurant.id,
      code: input.code ?? giftCode(),
      initial_value: input.initial_value,
      balance: input.initial_value,
      issued_to_name: input.issued_to_name ?? null,
      issued_to_phone: input.issued_to_phone ? normalizeIndianPhone(input.issued_to_phone) : null,
      expires_at: input.expires_at ?? null,
    };
    const { data, error } = await req.auth.db.from('gift_cards').insert(row).select('*').single();
    if (error) throw fromSupabase(error.code === '23505' ? { ...error, message: `The code ${row.code} is already used. Try another.` } : error);
    res.status(201).json(data as GiftCard);
  }),
);

promotionsRouter.patch(
  '/gift-cards/:id',
  staffHandler(async (req, res) => {
    gate(req, true);
    const id = uuidParam(req.params.id, 'Gift card not found');
    const patch = parse(giftCardUpdateSchema, req.body);
    const { data, error } = await req.auth.db.from('gift_cards').update(patch).eq('id', id).eq('restaurant_id', req.auth.restaurant.id).select('*').maybeSingle();
    if (error) throw fromSupabase(error);
    if (!data) throw notFound('Gift card not found');
    res.json(data as GiftCard);
  }),
);
