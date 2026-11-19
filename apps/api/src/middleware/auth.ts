import type { NextFunction, Request, Response } from 'express';
import type { Restaurant, Staff } from '@restaurant-os/shared';
import { anonClient, adminClient, userClient } from '../lib/supabase.js';
import { unauthorized, forbidden, fromSupabase } from '../lib/errors.js';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface StaffRequest extends Request {
  auth: {
    accessToken: string;
    userId: string;
    staff: Staff;
    restaurant: Restaurant;
    /** RLS-scoped client acting as this staff member (always safe). */
    db: SupabaseClient;
    /** Service client if configured, else the same as `db`. Scope queries by restaurant_id! */
    admin: SupabaseClient;
  };
}

/**
 * Verifies the Supabase access token sent as `Authorization: Bearer <jwt>`,
 * resolves the staff row + restaurant, and attaches RLS-scoped clients.
 */
export async function requireStaff(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw unauthorized();

    const { data: userData, error: userErr } = await anonClient.auth.getUser(token);
    if (userErr || !userData.user) throw unauthorized('Session expired. Please sign in again.');

    const db = userClient(token);
    const { data: staff, error: staffErr } = await db
      .from('staff')
      .select('*')
      .eq('user_id', userData.user.id)
      .maybeSingle();
    if (staffErr) throw fromSupabase(staffErr);
    if (!staff) throw forbidden('This account is not linked to a restaurant.');

    const { data: restaurant, error: restErr } = await db
      .from('restaurants')
      .select('*')
      .eq('id', staff.restaurant_id)
      .single();
    if (restErr) throw fromSupabase(restErr);

    (req as StaffRequest).auth = {
      accessToken: token,
      userId: userData.user.id,
      staff: staff as Staff,
      restaurant: restaurant as Restaurant,
      db,
      admin: adminClient(token),
    };
    next();
  } catch (e) {
    next(e);
  }
}
