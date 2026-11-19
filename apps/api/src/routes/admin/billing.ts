import { Router } from 'express';
import type { BillingSummary } from '@restaurant-os/shared';
import { fromSupabase } from '../../lib/errors.js';
import { num, parse, pickQuery, staffHandler } from '../../services/handlers.js';
import { billingSummaryQuerySchema } from '../../services/schemas.js';

export const billingRouter = Router();

// GET /api/admin/billing/summary?since= → totals over every matching order (never a truncated page).
// Cancelled orders are excluded; `since` limits to orders placed at or after that instant.
billingRouter.get(
  '/summary',
  staffHandler(async (req, res) => {
    const q = parse(billingSummaryQuerySchema, pickQuery(req.query, ['since']));
    const { data, error } = await req.auth.db.rpc('billing_summary', {
      p_restaurant_id: req.auth.restaurant.id,
      p_since: q.since ?? null,
    });
    if (error) throw fromSupabase(error);

    const raw = (data ?? {}) as { count?: unknown; paid?: unknown; due?: unknown; by_status?: Record<string, unknown> };
    const by = raw.by_status ?? {};
    const summary: BillingSummary = {
      count: num(raw.count),
      paid: num(raw.paid),
      due: num(raw.due),
      by_status: {
        pending: num(by.pending),
        claimed: num(by.claimed),
        paid: num(by.paid),
        refunded: num(by.refunded),
      },
    };
    res.json(summary);
  }),
);
