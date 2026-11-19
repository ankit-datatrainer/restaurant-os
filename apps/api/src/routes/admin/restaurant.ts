import { Router } from 'express';
import { badRequest, forbidden, fromSupabase, notFound } from '../../lib/errors.js';
import { parse, staffHandler } from '../../services/handlers.js';
import { requireFeature } from '../../services/plan.js';
import { stripRestaurant } from '../../services/restaurant.js';
import { restaurantUpdateSchema } from '../../services/schemas.js';

export const restaurantRouter = Router();

restaurantRouter.get(
  '/',
  staffHandler(async (req, res) => {
    const { data, error } = await req.auth.db.from('restaurants').select('*').eq('id', req.auth.restaurant.id).maybeSingle();
    if (error) throw fromSupabase(error);
    if (!data) throw notFound('Restaurant not found');
    res.json(stripRestaurant(data));
  }),
);

restaurantRouter.patch(
  '/',
  staffHandler(async (req, res) => {
    // slug, id and next_order_number are not in the schema, so they are stripped.
    const patch = parse(restaurantUpdateSchema, req.body);
    if (Object.keys(patch).length === 0) throw badRequest('Nothing to update');
    if (patch.takeaway_enabled) requireFeature(req.auth.restaurant.plan, 'online_takeaway');
    if (patch.reservations_enabled) requireFeature(req.auth.restaurant.plan, 'reservations');

    const { data, error } = await req.auth.db.from('restaurants').update(patch).eq('id', req.auth.restaurant.id).select('*');
    if (error) throw fromSupabase(error);
    // RLS only lets owners and managers update; other roles silently match 0 rows.
    if (!data || data.length === 0) throw forbidden('Only owners and managers can change restaurant settings.');
    res.json(stripRestaurant(data[0]));
  }),
);
