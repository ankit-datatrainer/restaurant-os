/**
 * Platform console for the owner of Restaurant OS (the SaaS), not for restaurants.
 * Access: a row in public.platform_admins for the signed-in account (added with SQL).
 * Every query goes through SECURITY DEFINER functions that check is_platform_admin() themselves,
 * so this router's own check is a convenience, not the security boundary.
 */
import { Router, type NextFunction, type Request, type Response } from 'express';
import type { Lead, PlatformOverview, PlatformRestaurant, Restaurant } from '@restaurant-os/shared';
import { forbidden, fromSupabase } from '../lib/errors.js';
import { parse, uuidParam } from '../services/handlers.js';
import { stripRestaurant } from '../services/restaurant.js';
import { platformUpdateSchema } from '../services/schemas.js';
import { requireUser, userHandler, type UserRequest } from './account.js';

async function requirePlatformAdmin(req: Request, _res: Response, next: NextFunction) {
  try {
    const { data, error } = await (req as UserRequest).user.db.rpc('is_platform_admin');
    // Database without migration 0007: nobody is a platform admin yet.
    if (error || data !== true) throw forbidden('This account does not have access to the Restaurant OS console.');
    next();
  } catch (e) {
    next(e);
  }
}

export const platformRouter = Router();

platformRouter.use(requireUser);

// GET /api/platform/me → { admin, email } (no 403: the page uses it to decide what to show)
platformRouter.get(
  '/me',
  userHandler(async (req, res) => {
    const { data, error } = await req.user.db.rpc('is_platform_admin');
    res.json({ admin: !error && data === true, email: req.user.email });
  }),
);

platformRouter.use(requirePlatformAdmin);

platformRouter.get(
  '/overview',
  userHandler(async (req, res) => {
    const { data, error } = await req.user.db.rpc('platform_overview');
    if (error) throw fromSupabase(error);
    res.json(data as PlatformOverview);
  }),
);

platformRouter.get(
  '/restaurants',
  userHandler(async (req, res) => {
    const { data, error } = await req.user.db.rpc('platform_restaurants');
    if (error) throw fromSupabase(error);
    res.json((data ?? []) as PlatformRestaurant[]);
  }),
);

platformRouter.patch(
  '/restaurants/:id',
  userHandler(async (req, res) => {
    const id = uuidParam(req.params.id, 'Restaurant not found');
    const input = parse(platformUpdateSchema, req.body);
    const { data, error } = await req.user.db.rpc('platform_update_restaurant', {
      p_id: id,
      p_plan: input.plan ?? null,
      p_status: input.status ?? null,
      p_trial_ends_at: input.trial_ends_at ?? null,
      p_end_trial: input.end_trial ?? false,
      p_listed: input.listed ?? null,
    });
    if (error) throw fromSupabase(error, 'Could not update the restaurant');
    res.json(stripRestaurant(data as Restaurant));
  }),
);

platformRouter.get(
  '/leads',
  userHandler(async (req, res) => {
    const { data, error } = await req.user.db.rpc('platform_leads', { p_limit: 300 });
    if (error) throw fromSupabase(error);
    res.json((data ?? []) as Lead[]);
  }),
);
