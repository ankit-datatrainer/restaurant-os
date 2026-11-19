import { Router } from 'express';
import type { CashClosing, CashDaySummary, Expense, ExpenseBudget, PnlReport } from '@restaurant-os/shared';
import { fromSupabase, notFound } from '../../lib/errors.js';
import { num, parse, pickQuery, staffHandler, uuidParam } from '../../services/handlers.js';
import { requireFeature, requireManager } from '../../services/plan.js';
import {
  budgetsSchema,
  cashCloseSchema,
  cashDayQuerySchema,
  expenseCreateSchema,
  expenseUpdateSchema,
  expensesQuerySchema,
  monthQuerySchema,
  rangeQuerySchema,
} from '../../services/schemas.js';
import type { StaffRequest } from '../../middleware/auth.js';

export const financeRouter = Router();

/** Today's date in India, YYYY-MM-DD. */
export function istToday(): string {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
}

function gate(req: StaffRequest) {
  requireManager(req.auth.staff.role, 'see the accounts');
}

// ----- Expenses (Growth+) ------------------------------------------------------

financeRouter.get(
  '/expenses',
  staffHandler(async (req, res) => {
    gate(req);
    requireFeature(req.auth.restaurant.plan, 'finance');
    const q = parse(expensesQuerySchema, pickQuery(req.query, ['from', 'to', 'category']));
    let query = req.auth.db.from('expenses').select('*').eq('restaurant_id', req.auth.restaurant.id);
    if (q.from) query = query.gte('spent_on', q.from);
    if (q.to) query = query.lte('spent_on', q.to);
    if (q.category) query = query.eq('category', q.category);
    const { data, error } = await query.order('spent_on', { ascending: false }).order('created_at', { ascending: false }).limit(500);
    if (error) throw fromSupabase(error);
    res.json((data ?? []) as Expense[]);
  }),
);

financeRouter.post(
  '/expenses',
  staffHandler(async (req, res) => {
    gate(req);
    requireFeature(req.auth.restaurant.plan, 'finance');
    const input = parse(expenseCreateSchema, req.body);
    const row = { ...input, spent_on: input.spent_on ?? istToday(), restaurant_id: req.auth.restaurant.id, created_by: req.auth.staff.id };
    const { data, error } = await req.auth.db.from('expenses').insert(row).select('*').single();
    if (error) throw fromSupabase(error);
    res.status(201).json(data as Expense);
  }),
);

financeRouter.patch(
  '/expenses/:id',
  staffHandler(async (req, res) => {
    gate(req);
    requireFeature(req.auth.restaurant.plan, 'finance');
    const id = uuidParam(req.params.id, 'Expense not found');
    const patch = parse(expenseUpdateSchema, req.body);
    const { data, error } = await req.auth.db.from('expenses').update(patch).eq('id', id).eq('restaurant_id', req.auth.restaurant.id).select('*').maybeSingle();
    if (error) throw fromSupabase(error);
    if (!data) throw notFound('Expense not found');
    res.json(data as Expense);
  }),
);

financeRouter.delete(
  '/expenses/:id',
  staffHandler(async (req, res) => {
    gate(req);
    requireFeature(req.auth.restaurant.plan, 'finance');
    const id = uuidParam(req.params.id, 'Expense not found');
    const { error } = await req.auth.db.from('expenses').delete().eq('id', id).eq('restaurant_id', req.auth.restaurant.id);
    if (error) throw fromSupabase(error);
    res.status(204).end();
  }),
);

// GET /api/admin/finance/budgets?month=2026-10 → budgets + spend per category that month
financeRouter.get(
  '/budgets',
  staffHandler(async (req, res) => {
    gate(req);
    requireFeature(req.auth.restaurant.plan, 'finance');
    const { month } = parse(monthQuerySchema, pickQuery(req.query, ['month']));
    const m = month ?? istToday().slice(0, 7);
    const first = `${m}-01`;
    const [y, mo] = m.split('-').map(Number);
    const next = new Date(Date.UTC(y!, mo!, 1)).toISOString().slice(0, 10);
    const rid = req.auth.restaurant.id;
    const [budgets, spend] = await Promise.all([
      req.auth.db.from('expense_budgets').select('*').eq('restaurant_id', rid).eq('month', first),
      req.auth.db.from('expenses').select('category, amount').eq('restaurant_id', rid).gte('spent_on', first).lt('spent_on', next),
    ]);
    if (budgets.error) throw fromSupabase(budgets.error);
    if (spend.error) throw fromSupabase(spend.error);
    const spent: Record<string, number> = {};
    for (const e of spend.data ?? []) spent[e.category as string] = Math.round(((spent[e.category as string] ?? 0) + num(e.amount)) * 100) / 100;
    res.json({ month: m, budgets: (budgets.data ?? []) as ExpenseBudget[], spent });
  }),
);

// PUT /api/admin/finance/budgets { month, budgets: [{ category, amount }] } (amount 0 removes)
financeRouter.put(
  '/budgets',
  staffHandler(async (req, res) => {
    gate(req);
    requireFeature(req.auth.restaurant.plan, 'finance');
    const input = parse(budgetsSchema, req.body);
    const rid = req.auth.restaurant.id;
    const month = `${input.month}-01`;
    const keep = input.budgets.filter((b) => b.amount > 0);
    const drop = input.budgets.filter((b) => b.amount === 0).map((b) => b.category);
    if (drop.length) {
      const d = await req.auth.db.from('expense_budgets').delete().eq('restaurant_id', rid).eq('month', month).in('category', drop);
      if (d.error) throw fromSupabase(d.error);
    }
    if (keep.length) {
      const u = await req.auth.db
        .from('expense_budgets')
        .upsert(keep.map((b) => ({ restaurant_id: rid, month, category: b.category, amount: b.amount })), { onConflict: 'restaurant_id,month,category' });
      if (u.error) throw fromSupabase(u.error);
    }
    const { data, error } = await req.auth.db.from('expense_budgets').select('*').eq('restaurant_id', rid).eq('month', month);
    if (error) throw fromSupabase(error);
    res.json((data ?? []) as ExpenseBudget[]);
  }),
);

// ----- Daily cash close (all plans) ----------------------------------------------

financeRouter.get(
  '/cash-day',
  staffHandler(async (req, res) => {
    gate(req);
    const { date } = parse(cashDayQuerySchema, pickQuery(req.query, ['date']));
    const { data, error } = await req.auth.db.rpc('cash_day_summary', { p_date: date ?? istToday() });
    if (error) throw fromSupabase(error);
    res.json(data as CashDaySummary);
  }),
);

financeRouter.post(
  '/cash-close',
  staffHandler(async (req, res) => {
    gate(req);
    const input = parse(cashCloseSchema, req.body);
    const { data, error } = await req.auth.db.rpc('close_cash_day', {
      p_date: input.business_date,
      p_opening_float: input.opening_float ?? 0,
      p_counted_cash: input.counted_cash,
      p_note: input.note ?? null,
    });
    if (error) throw fromSupabase(error, 'Could not close the day');
    res.status(201).json(data as CashClosing);
  }),
);

financeRouter.get(
  '/cash-closings',
  staffHandler(async (req, res) => {
    gate(req);
    const { data, error } = await req.auth.db.from('cash_closings').select('*').eq('restaurant_id', req.auth.restaurant.id).order('business_date', { ascending: false }).limit(90);
    if (error) throw fromSupabase(error);
    res.json((data ?? []) as CashClosing[]);
  }),
);

// ----- Profit & loss (Growth+) -----------------------------------------------------

financeRouter.get(
  '/pnl',
  staffHandler(async (req, res) => {
    gate(req);
    requireFeature(req.auth.restaurant.plan, 'finance');
    const q = parse(rangeQuerySchema, pickQuery(req.query, ['from', 'to']));
    const to = q.to ?? new Date().toISOString();
    // Default: the current month so far (IST).
    const from = q.from ?? new Date(`${istToday().slice(0, 7)}-01T00:00:00+05:30`).toISOString();
    const { data, error } = await req.auth.db.rpc('pnl_report', { p_restaurant_id: req.auth.restaurant.id, p_from: from, p_to: to });
    if (error) throw fromSupabase(error);
    const r = data as Omit<PnlReport, 'from' | 'to' | 'operating_profit' | 'food_cost_basis'>;
    const net = num(r.net_sales);
    const ingredientsLogged = num(r.expenses?.ingredients);
    // Ingredient purchases logged as expenses already cover food cost and waste: never subtract both.
    const basis: PnlReport['food_cost_basis'] = ingredientsLogged > 0 ? 'expenses' : 'recipes';
    const profit = net - num(r.expenses_total) - (basis === 'recipes' ? num(r.food_cost) + num(r.waste_cost) : 0);
    const round = (n: unknown) => Math.round(num(n) * 100) / 100;
    const report: PnlReport = {
      ...r,
      gross_sales: round(r.gross_sales),
      discounts: round(r.discounts),
      service_charge: round(r.service_charge),
      tax_collected: round(r.tax_collected),
      net_sales: round(r.net_sales),
      tips: round(r.tips),
      refunds: round(r.refunds),
      food_cost: round(r.food_cost),
      waste_cost: round(r.waste_cost),
      expenses_total: round(r.expenses_total),
      orders: num(r.orders),
      from,
      to,
      operating_profit: round(profit),
      food_cost_basis: basis,
    };
    res.json(report);
  }),
);
