import { Router } from 'express';
import type { FeedbackEntry, FeedbackResponse } from '@restaurant-os/shared';
import { fromSupabase } from '../../lib/errors.js';
import { num, staffHandler } from '../../services/handlers.js';
import { requireFeature } from '../../services/plan.js';

export const feedbackRouter = Router();

interface FeedbackRow {
  id: string;
  order_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  table: FeedbackEntry['table'];
  order: { order_number: number; guest_name: string | null } | null;
  customer: { name: string | null } | null;
}

// GET /api/admin/feedback → newest 200 ratings + summary over all of them
feedbackRouter.get(
  '/',
  staffHandler(async (req, res) => {
    requireFeature(req.auth.restaurant.plan, 'feedback');
    const restaurantId = req.auth.restaurant.id;

    const [listRes, ratingsRes] = await Promise.all([
      req.auth.db
        .from('feedback')
        .select(
          'id, order_id, rating, comment, created_at, table:dining_tables(id,code,label,area), order:orders(order_number,guest_name), customer:customers(name)',
        )
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false })
        .limit(200),
      req.auth.db.from('feedback').select('rating').eq('restaurant_id', restaurantId),
    ]);
    if (listRes.error) throw fromSupabase(listRes.error);
    if (ratingsRes.error) throw fromSupabase(ratingsRes.error);

    const entries: FeedbackEntry[] = ((listRes.data ?? []) as unknown as FeedbackRow[]).map((r) => ({
      id: r.id,
      order_id: r.order_id,
      order_number: r.order?.order_number ?? null,
      rating: num(r.rating),
      comment: r.comment,
      created_at: r.created_at,
      table: r.table ?? null,
      customer_name: r.customer?.name ?? r.order?.guest_name ?? null,
    }));

    const ratings = ((ratingsRes.data ?? []) as Array<{ rating: number }>).map((r) => num(r.rating));
    const distribution: FeedbackResponse['summary']['distribution'] = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    for (const r of ratings) {
      const key = String(Math.min(5, Math.max(1, Math.round(r)))) as keyof typeof distribution;
      distribution[key] += 1;
    }
    const average = ratings.length > 0 ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10 : null;

    const payload: FeedbackResponse = { entries, summary: { count: ratings.length, average, distribution } };
    res.json(payload);
  }),
);
