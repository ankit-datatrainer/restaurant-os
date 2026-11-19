import { Router, type NextFunction, type Request, type Response } from 'express';
import type { AuditEntry, Staff, StaffInvite, StaffMember, StaffShift } from '@restaurant-os/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { anonClient, userClient } from '../../lib/supabase.js';
import { asyncHandler, badRequest, forbidden, fromSupabase, unauthorized } from '../../lib/errors.js';
import { num, parse, pickQuery, staffHandler, uuidParam } from '../../services/handlers.js';
import { requireManager } from '../../services/plan.js';
import { stripRestaurant } from '../../services/restaurant.js';
import {
  auditQuerySchema,
  clockSchema,
  inviteCreateSchema,
  joinSchema,
  rangeQuerySchema,
  shiftsQuerySchema,
  staffUpdateSchema,
} from '../../services/schemas.js';

export const staffRouter = Router();

function hoursBetween(a: string, b: string | null, now = Date.now()): number {
  const end = b ? new Date(b).getTime() : now;
  return Math.max(0, (end - new Date(a).getTime()) / 3600_000);
}

// ----- Team --------------------------------------------------------------------

// GET /api/admin/staff → members with clock-in state and hours this week
staffRouter.get(
  '/staff',
  staffHandler(async (req, res) => {
    const rid = req.auth.restaurant.id;
    const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
    const [members, shifts] = await Promise.all([
      req.auth.db.from('staff').select('*').eq('restaurant_id', rid).order('created_at'),
      req.auth.db.from('staff_shifts').select('*').eq('restaurant_id', rid).or(`clock_in.gte.${weekAgo},clock_out.is.null`),
    ]);
    if (members.error) throw fromSupabase(members.error);
    if (shifts.error) throw fromSupabase(shifts.error);
    const all = (shifts.data ?? []) as StaffShift[];
    const out: StaffMember[] = ((members.data ?? []) as Staff[]).map((m) => {
      const mine = all.filter((s) => s.staff_id === m.id);
      return {
        ...m,
        open_shift: mine.find((s) => !s.clock_out) ?? null,
        hours_7d: Math.round(mine.filter((s) => s.clock_in >= weekAgo).reduce((h, s) => h + hoursBetween(s.clock_in, s.clock_out), 0) * 10) / 10,
      };
    });
    res.json(out);
  }),
);

staffRouter.patch(
  '/staff/:id',
  staffHandler(async (req, res) => {
    const id = uuidParam(req.params.id, 'Staff member not found');
    const input = parse(staffUpdateSchema, req.body);
    const { data, error } = await req.auth.db.rpc('update_staff_member', {
      p_staff_id: id,
      p_role: input.role ?? null,
      p_display_name: input.display_name ?? null,
    });
    if (error) throw fromSupabase(error);
    res.json(data as Staff);
  }),
);

staffRouter.delete(
  '/staff/:id',
  staffHandler(async (req, res) => {
    const id = uuidParam(req.params.id, 'Staff member not found');
    const { error } = await req.auth.db.rpc('remove_staff_member', { p_staff_id: id });
    if (error) throw fromSupabase(error);
    res.status(204).end();
  }),
);

// ----- Invites -------------------------------------------------------------------

staffRouter.get(
  '/staff-invites',
  staffHandler(async (req, res) => {
    requireManager(req.auth.staff.role, 'invite staff');
    const { data, error } = await req.auth.db
      .from('staff_invites')
      .select('*')
      .eq('restaurant_id', req.auth.restaurant.id)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });
    if (error) throw fromSupabase(error);
    res.json((data ?? []) as StaffInvite[]);
  }),
);

staffRouter.post(
  '/staff-invites',
  staffHandler(async (req, res) => {
    const input = parse(inviteCreateSchema, req.body);
    const { data, error } = await req.auth.db.rpc('create_staff_invite', { p_role: input.role, p_display_name: input.display_name ?? null });
    if (error) throw fromSupabase(error);
    res.status(201).json(data as StaffInvite);
  }),
);

staffRouter.delete(
  '/staff-invites/:id',
  staffHandler(async (req, res) => {
    requireManager(req.auth.staff.role, 'cancel invites');
    const id = uuidParam(req.params.id, 'Invite not found');
    const { error } = await req.auth.db.from('staff_invites').delete().eq('id', id).eq('restaurant_id', req.auth.restaurant.id);
    if (error) throw fromSupabase(error);
    res.status(204).end();
  }),
);

// ----- Attendance --------------------------------------------------------------------

staffRouter.get(
  '/attendance/me',
  staffHandler(async (req, res) => {
    const { data, error } = await req.auth.db.from('staff_shifts').select('*').eq('staff_id', req.auth.staff.id).is('clock_out', null).maybeSingle();
    if (error) throw fromSupabase(error);
    res.json({ open_shift: (data as StaffShift | null) ?? null });
  }),
);

staffRouter.post(
  '/attendance/clock-in',
  staffHandler(async (req, res) => {
    const { note } = parse(clockSchema, req.body ?? {});
    const { data, error } = await req.auth.db.rpc('clock_in', { p_note: note ?? null });
    if (error) throw fromSupabase(error);
    res.status(201).json(data as StaffShift);
  }),
);

staffRouter.post(
  '/attendance/clock-out',
  staffHandler(async (req, res) => {
    const { note } = parse(clockSchema, req.body ?? {});
    const { data, error } = await req.auth.db.rpc('clock_out', { p_note: note ?? null });
    if (error) throw fromSupabase(error);
    res.json(data as StaffShift);
  }),
);

// GET /api/admin/attendance?from=&to=&staff_id= → shifts (managers see everyone, others only themselves)
staffRouter.get(
  '/attendance',
  staffHandler(async (req, res) => {
    const q = parse(shiftsQuerySchema, pickQuery(req.query, ['from', 'to', 'staff_id']));
    const manager = ['owner', 'manager'].includes(req.auth.staff.role);
    let query = req.auth.db.from('staff_shifts').select('*, staff:staff(id,display_name,role)').eq('restaurant_id', req.auth.restaurant.id);
    query = query.gte('clock_in', q.from ?? new Date(Date.now() - 14 * 86400_000).toISOString());
    if (q.to) query = query.lt('clock_in', q.to);
    if (!manager) query = query.eq('staff_id', req.auth.staff.id);
    else if (q.staff_id) query = query.eq('staff_id', q.staff_id);
    const { data, error } = await query.order('clock_in', { ascending: false }).limit(500);
    if (error) throw fromSupabase(error);
    res.json((data ?? []) as StaffShift[]);
  }),
);

// ----- Audit log ---------------------------------------------------------------------

staffRouter.get(
  '/audit',
  staffHandler(async (req, res) => {
    requireManager(req.auth.staff.role, 'see the activity log');
    const q = parse(auditQuerySchema, pickQuery(req.query, ['limit', 'entity', 'before']));
    let query = req.auth.db.from('audit_log').select('*').eq('restaurant_id', req.auth.restaurant.id);
    if (q.entity) query = query.eq('entity', q.entity);
    if (q.before) query = query.lt('id', q.before);
    const { data, error } = await query.order('id', { ascending: false }).limit(q.limit ?? 100);
    if (error) throw fromSupabase(error);
    res.json((data ?? []) as AuditEntry[]);
  }),
);

// ----- Backup / export ---------------------------------------------------------------

async function fetchAll(db: SupabaseClient, table: string, column: string, value: string, select = '*'): Promise<unknown[]> {
  const out: unknown[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(select).eq(column, value).range(from, from + 999);
    if (error) {
      // A module not installed yet (older database) is skipped, not fatal.
      if (error.code === '42P01' || error.code === 'PGRST205') return out;
      throw fromSupabase(error);
    }
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
    if (out.length >= 200_000) return out;
  }
}

const EXPORT_TABLES = [
  'dining_tables', 'menu_categories', 'menu_items', 'orders', 'customers', 'consent_events', 'feedback',
  'loyalty_rewards', 'coupons', 'happy_hours', 'gift_cards', 'ingredients', 'stock_movements', 'suppliers',
  'purchase_orders', 'bills', 'bill_payments', 'reservations', 'waitlist', 'expenses', 'expense_budgets',
  'cash_closings', 'staff', 'staff_shifts', 'audit_log', 'assistance_calls',
] as const;

// GET /api/admin/export.json → one JSON file with every row of this restaurant (owners only)
staffRouter.get(
  '/export.json',
  staffHandler(async (req, res) => {
    if (req.auth.staff.role !== 'owner') throw forbidden('Only the owner can download a full backup.');
    const rid = req.auth.restaurant.id;
    const db = req.auth.db;
    const data: Record<string, unknown> = { restaurant: stripRestaurant(req.auth.restaurant) };
    for (const t of EXPORT_TABLES) data[t] = await fetchAll(db, t, 'restaurant_id', rid);
    // Child tables without restaurant_id.
    const orderIds = (data.orders as Array<{ id: string }>).map((o) => o.id);
    const items: unknown[] = [];
    for (let i = 0; i < orderIds.length; i += 200) {
      const { data: rows, error } = await db.from('order_items').select('*').in('order_id', orderIds.slice(i, i + 200));
      if (error) throw fromSupabase(error);
      items.push(...(rows ?? []));
    }
    data.order_items = items;
    const recipes = await db.from('recipe_items').select('*, ingredient:ingredients!inner(restaurant_id)').eq('ingredient.restaurant_id', rid);
    data.recipe_items = recipes.error ? [] : (recipes.data ?? []).map(({ ingredient: _i, ...r }) => r);
    const poIds = (data.purchase_orders as Array<{ id: string }>).map((p) => p.id);
    const poItems = poIds.length ? await db.from('purchase_order_items').select('*').in('purchase_order_id', poIds) : { data: [], error: null };
    data.purchase_order_items = poItems.error ? [] : poItems.data;
    const stamp = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 16).replace(/[:T]/g, '-');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="restaurant-os-backup-${req.auth.restaurant.slug}-${stamp}.json"`);
    res.send(JSON.stringify({ format: 'restaurant-os-backup', version: 6, exported_at: new Date().toISOString(), data }, null, 1));
  }),
);

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  // Spreadsheet formula injection guard + quoting.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

// GET /api/admin/export/orders.csv?from=&to= → one row per order (managers)
staffRouter.get(
  '/export/orders.csv',
  staffHandler(async (req, res) => {
    requireManager(req.auth.staff.role, 'export orders');
    const q = parse(rangeQuerySchema, pickQuery(req.query, ['from', 'to']));
    let query = req.auth.db
      .from('orders')
      .select('order_number, placed_at, order_type, source, status, payment_status, payment_method, guest_name, subtotal, discount_amount, discount_reason, coupon_code, service_charge, tax_amount, total, table:dining_tables(label)')
      .eq('restaurant_id', req.auth.restaurant.id);
    if (q.from) query = query.gte('placed_at', q.from);
    if (q.to) query = query.lt('placed_at', q.to);
    const { data, error } = await query.order('placed_at', { ascending: true }).limit(20_000);
    if (error) throw fromSupabase(error);
    const head = ['Order', 'Placed (IST)', 'Type', 'Source', 'Table', 'Status', 'Payment', 'Method', 'Guest', 'Subtotal', 'Discount', 'Discount reason', 'Coupon', 'Service charge', 'GST', 'Total'];
    const rows = (data ?? []).map((o) => {
      const r = o as Record<string, unknown> & { table?: { label?: string } | null };
      const ist = new Date(new Date(String(r.placed_at)).getTime() + 330 * 60_000).toISOString().slice(0, 16).replace('T', ' ');
      return [`#ORD-${r.order_number}`, ist, r.order_type, r.source, r.table?.label ?? 'Takeaway', r.status, r.payment_status, r.payment_method, r.guest_name,
        num(r.subtotal), num(r.discount_amount), r.discount_reason, r.coupon_code, num(r.service_charge), num(r.tax_amount), num(r.total)].map(csvCell).join(',');
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="orders-${req.auth.restaurant.slug}.csv"`);
    res.send(`﻿${[head.join(','), ...rows].join('\r\n')}`);
  }),
);

// ---------------------------------------------------------------------------
// POST /api/admin/join { code, display_name } — a signed-in account that is not staff yet joins a
// restaurant with an invite code. Mounted before requireStaff (the caller has no staff row yet).
// ---------------------------------------------------------------------------
export const joinRouter = Router();

joinRouter.post(
  '/join',
  asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw unauthorized();
    const { data: user, error: userErr } = await anonClient.auth.getUser(token);
    if (userErr || !user.user) throw unauthorized('Session expired. Please sign in again.');
    const input = parse(joinSchema, req.body);
    const db = userClient(token);
    const { data, error } = await db.rpc('accept_staff_invite', { p_code: input.code, p_display_name: input.display_name });
    if (error) throw fromSupabase(error, 'Could not join');
    if (!data) throw badRequest('Could not join');
    res.status(201).json(data as Staff);
  }),
);
