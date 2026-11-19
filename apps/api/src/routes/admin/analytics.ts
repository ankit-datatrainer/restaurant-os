import { Router } from 'express';
import type { AnalyticsReport } from '@restaurant-os/shared';
import { badRequest, fromSupabase } from '../../lib/errors.js';
import { num, parse, pickQuery, staffHandler } from '../../services/handlers.js';
import { requireFeature } from '../../services/plan.js';
import { analyticsQuerySchema } from '../../services/schemas.js';

export const analyticsRouter = Router();

const DAY = 86_400_000;

/** Postgres numerics arrive as strings; turn every leaf that looks numeric into a number. */
function numify(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(numify);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, numify(x)]));
  if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v)) return num(v);
  return v;
}

// GET /api/admin/analytics?from=&to=  (default: the last 30 days)
analyticsRouter.get(
  '/',
  staffHandler(async (req, res) => {
    requireFeature(req.auth.restaurant.plan, 'advanced_analytics');
    const q = parse(analyticsQuerySchema, pickQuery(req.query, ['from', 'to']));
    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ? new Date(q.from) : new Date(to.getTime() - 30 * DAY);
    if (from >= to) throw badRequest('"from" must be before "to".');
    if (to.getTime() - from.getTime() > 400 * DAY) throw badRequest('Pick a range of at most 400 days.');
    const { data, error } = await req.auth.db.rpc('analytics_report', {
      p_restaurant_id: req.auth.restaurant.id,
      p_from: from.toISOString(),
      p_to: to.toISOString(),
    });
    if (error) throw fromSupabase(error);
    const report = numify(data) as AnalyticsReport;
    // Dates stay ISO strings (numify only touches plain numbers).
    res.json(report);
  }),
);
