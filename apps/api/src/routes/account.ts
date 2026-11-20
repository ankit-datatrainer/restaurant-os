import { Router, type NextFunction, type Request, type Response } from 'express';
import type { Restaurant } from '@restaurant-os/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { anonClient, userClient } from '../lib/supabase.js';
import { asyncHandler, fromSupabase, unauthorized } from '../lib/errors.js';
import { parse } from '../services/handlers.js';
import { rateLimit } from '../services/rateLimit.js';
import { stripRestaurant } from '../services/restaurant.js';
import { createRestaurantSchema } from '../services/schemas.js';

export interface UserRequest extends Request {
  user: { token: string; id: string; email: string | null; db: SupabaseClient };
}

/** A valid Supabase session (staff or not). Used for signup and the platform console. */
export async function requireUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw unauthorized();
    const { data, error } = await anonClient.auth.getUser(token);
    if (error || !data.user) throw unauthorized('Session expired. Please sign in again.');
    (req as UserRequest).user = { token, id: data.user.id, email: data.user.email ?? null, db: userClient(token) };
    next();
  } catch (e) {
    next(e);
  }
}

export function userHandler(fn: (req: UserRequest, res: Response) => Promise<unknown>) {
  const wrapped = asyncHandler<UserRequest>(fn);
  return (req: Request, res: Response, next: NextFunction) => wrapped(req as UserRequest, res, next);
}

export const accountRouter = Router();

accountRouter.use(requireUser);

// POST /api/account/restaurant → create a restaurant (14-day trial) with this account as its owner
accountRouter.post(
  '/restaurant',
  rateLimit({ windowMs: 60 * 60_000, max: 10, methods: ['POST'] }),
  userHandler(async (req, res) => {
    const input = parse(createRestaurantSchema, req.body);
    const { data, error } = await req.user.db.rpc('create_restaurant', {
      p_name: input.name,
      p_slug: input.slug,
      p_city: input.city ?? null,
      p_phone: input.phone ?? null,
      p_owner_name: input.owner_name ?? null,
      p_tables: input.tables,
      p_sample_menu: input.sample_menu ?? true,
    });
    if (error) throw fromSupabase(error, 'Could not create your restaurant');
    res.status(201).json(stripRestaurant(data as Restaurant));
  }),
);
