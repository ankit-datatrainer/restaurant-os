import { Router } from 'express';
import type { AssistanceCall } from '@restaurant-os/shared';
import { fromSupabase, notFound } from '../../lib/errors.js';
import { CALL_SELECT } from '../../services/calls.js';
import { parse, pickQuery, staffHandler, uuidParam } from '../../services/handlers.js';
import { callsQuerySchema } from '../../services/schemas.js';

export const callsRouter = Router();

// GET /api/admin/calls?status=open|attended|all
callsRouter.get(
  '/',
  staffHandler(async (req, res) => {
    const status = parse(callsQuerySchema, pickQuery(req.query, ['status'])).status ?? 'open';

    let query = req.auth.db.from('assistance_calls').select(CALL_SELECT).eq('restaurant_id', req.auth.restaurant.id);
    if (status !== 'all') query = query.eq('status', status);

    const { data, error } = await query.order('created_at', { ascending: false }).limit(200);
    if (error) throw fromSupabase(error);
    res.json((data ?? []) as AssistanceCall[]);
  }),
);

// PATCH /api/admin/calls/:id/attend
callsRouter.patch(
  '/:id/attend',
  staffHandler(async (req, res) => {
    const id = uuidParam(req.params.id, 'Call not found');
    const { data, error } = await req.auth.db
      .from('assistance_calls')
      .update({ status: 'attended', attended_at: new Date().toISOString() })
      .eq('id', id)
      .eq('restaurant_id', req.auth.restaurant.id)
      .select(CALL_SELECT)
      .maybeSingle();
    if (error) throw fromSupabase(error);
    if (!data) throw notFound('Call not found');
    res.json(data as AssistanceCall);
  }),
);
