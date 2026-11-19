import { Router } from 'express';
import { normalizeIndianPhone, type Reservation, type WaitlistEntry } from '@restaurant-os/shared';
import { badRequest, fromSupabase, notFound } from '../../lib/errors.js';
import { parse, pickQuery, staffHandler, uuidParam } from '../../services/handlers.js';
import { requireFeature } from '../../services/plan.js';
import {
  reservationCreateSchema,
  reservationUpdateSchema,
  reservationsQuerySchema,
  waitlistCreateSchema,
  waitlistQuerySchema,
  waitlistUpdateSchema,
} from '../../services/schemas.js';

const RESERVATION_SELECT = '*, table:dining_tables(id,code,label,area)';

export const reservationsRouter = Router();


/** A table may not hold two live bookings whose time windows overlap. */
async function assertTableFree(
  db: import('@supabase/supabase-js').SupabaseClient,
  rid: string,
  tableId: string,
  start: string,
  minutes: number,
  exceptId?: string,
) {
  const from = new Date(new Date(start).getTime() - 8 * 3600_000).toISOString();
  const to = new Date(new Date(start).getTime() + minutes * 60_000).toISOString();
  let q = db.from('reservations').select('id, reserved_for, duration_minutes, customer_name').eq('restaurant_id', rid).eq('table_id', tableId)
    .in('status', ['requested', 'confirmed', 'seated']).gte('reserved_for', from).lt('reserved_for', to);
  if (exceptId) q = q.neq('id', exceptId);
  const { data, error } = await q;
  if (error) throw fromSupabase(error);
  const s = new Date(start).getTime();
  const e = s + minutes * 60_000;
  const clash = (data ?? []).find((r) => {
    const rs = new Date(r.reserved_for as string).getTime();
    return rs < e && rs + Number(r.duration_minutes) * 60_000 > s;
  });
  if (clash) throw badRequest(`That table is already booked for ${clash.customer_name} at that time.`);
}

// GET /api/admin/reservations?from=&to=&status=upcoming|all|<status>
reservationsRouter.get(
  '/reservations',
  staffHandler(async (req, res) => {
    requireFeature(req.auth.restaurant.plan, 'reservations');
    const q = parse(reservationsQuerySchema, pickQuery(req.query, ['from', 'to', 'status']));
    let query = req.auth.db.from('reservations').select(RESERVATION_SELECT).eq('restaurant_id', req.auth.restaurant.id);
    if (q.from) query = query.gte('reserved_for', q.from);
    if (q.to) query = query.lt('reserved_for', q.to);
    if (q.status === 'upcoming') query = query.in('status', ['requested', 'confirmed']).gte('reserved_for', new Date(Date.now() - 3600_000).toISOString());
    else if (q.status && q.status !== 'all') query = query.eq('status', q.status);
    const { data, error } = await query.order('reserved_for', { ascending: true }).limit(500);
    if (error) throw fromSupabase(error);
    res.json((data ?? []) as Reservation[]);
  }),
);

reservationsRouter.post(
  '/reservations',
  staffHandler(async (req, res) => {
    requireFeature(req.auth.restaurant.plan, 'reservations');
    const input = parse(reservationCreateSchema, req.body);
    const rid = req.auth.restaurant.id;
    const minutes = input.duration_minutes ?? req.auth.restaurant.reservation_minutes ?? 90;
    if (input.table_id) await assertTableFree(req.auth.db, rid, input.table_id, input.reserved_for, minutes);
    const row = {
      restaurant_id: rid,
      customer_name: input.customer_name,
      phone: normalizeIndianPhone(input.phone),
      party_size: input.party_size,
      reserved_for: input.reserved_for,
      duration_minutes: minutes,
      table_id: input.table_id ?? null,
      source: input.source ?? 'phone',
      note: input.note ?? null,
      // Bookings taken by staff are confirmed; online ones arrive as "requested".
      status: 'confirmed',
    };
    const { data, error } = await req.auth.db.from('reservations').insert(row).select(RESERVATION_SELECT).single();
    if (error) throw fromSupabase(error);
    res.status(201).json(data as Reservation);
  }),
);

reservationsRouter.patch(
  '/reservations/:id',
  staffHandler(async (req, res) => {
    requireFeature(req.auth.restaurant.plan, 'reservations');
    const id = uuidParam(req.params.id, 'Booking not found');
    const patch = parse(reservationUpdateSchema, req.body);
    const rid = req.auth.restaurant.id;
    const current = await req.auth.db.from('reservations').select('*').eq('id', id).eq('restaurant_id', rid).maybeSingle();
    if (current.error) throw fromSupabase(current.error);
    if (!current.data) throw notFound('Booking not found');
    const cur = current.data as Reservation;
    const tableId = patch.table_id === undefined ? cur.table_id : patch.table_id;
    const status = patch.status ?? cur.status;
    if (status === 'seated' && !tableId) throw badRequest('Pick the table you are seating them at.');
    if (tableId && ['requested', 'confirmed', 'seated'].includes(status) && (patch.table_id !== undefined || patch.reserved_for || patch.duration_minutes)) {
      await assertTableFree(req.auth.db, rid, tableId, patch.reserved_for ?? cur.reserved_for, patch.duration_minutes ?? cur.duration_minutes, id);
    }
    const update: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
    if (patch.phone) update.phone = normalizeIndianPhone(patch.phone);
    const { data, error } = await req.auth.db.from('reservations').update(update).eq('id', id).eq('restaurant_id', rid).select(RESERVATION_SELECT).single();
    if (error) throw fromSupabase(error);
    res.json(data as Reservation);
  }),
);

reservationsRouter.delete(
  '/reservations/:id',
  staffHandler(async (req, res) => {
    requireFeature(req.auth.restaurant.plan, 'reservations');
    const id = uuidParam(req.params.id, 'Booking not found');
    const { error } = await req.auth.db.from('reservations').delete().eq('id', id).eq('restaurant_id', req.auth.restaurant.id);
    if (error) throw fromSupabase(error);
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------
// Walk-in waitlist
// ---------------------------------------------------------------------------

reservationsRouter.get(
  '/waitlist',
  staffHandler(async (req, res) => {
    requireFeature(req.auth.restaurant.plan, 'reservations');
    const q = parse(waitlistQuerySchema, pickQuery(req.query, ['status']));
    let query = req.auth.db.from('waitlist').select('*').eq('restaurant_id', req.auth.restaurant.id);
    if ((q.status ?? 'active') === 'active') query = query.in('status', ['waiting', 'notified']);
    else query = query.gte('created_at', new Date(Date.now() - 2 * 86400_000).toISOString());
    const { data, error } = await query.order('created_at', { ascending: true }).limit(200);
    if (error) throw fromSupabase(error);
    res.json((data ?? []) as WaitlistEntry[]);
  }),
);

reservationsRouter.post(
  '/waitlist',
  staffHandler(async (req, res) => {
    requireFeature(req.auth.restaurant.plan, 'reservations');
    const input = parse(waitlistCreateSchema, req.body);
    const row = {
      restaurant_id: req.auth.restaurant.id,
      customer_name: input.customer_name,
      phone: input.phone ? normalizeIndianPhone(input.phone) : null,
      party_size: input.party_size,
      quoted_minutes: input.quoted_minutes ?? null,
      note: input.note ?? null,
    };
    const { data, error } = await req.auth.db.from('waitlist').insert(row).select('*').single();
    if (error) throw fromSupabase(error);
    res.status(201).json(data as WaitlistEntry);
  }),
);

reservationsRouter.patch(
  '/waitlist/:id',
  staffHandler(async (req, res) => {
    requireFeature(req.auth.restaurant.plan, 'reservations');
    const id = uuidParam(req.params.id, 'Waitlist entry not found');
    const patch = parse(waitlistUpdateSchema, req.body);
    const update: Record<string, unknown> = { ...patch };
    if (patch.phone) update.phone = normalizeIndianPhone(patch.phone);
    if (patch.status === 'seated') update.seated_at = new Date().toISOString();
    const { data, error } = await req.auth.db.from('waitlist').update(update).eq('id', id).eq('restaurant_id', req.auth.restaurant.id).select('*').maybeSingle();
    if (error) throw fromSupabase(error);
    if (!data) throw notFound('Waitlist entry not found');
    res.json(data as WaitlistEntry);
  }),
);
