import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config.js';

const baseOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const;

/**
 * Anonymous client. Subject to RLS: can read public restaurant/menu/table data
 * and call the SECURITY DEFINER functions (place_order, create_assistance_call, get_order…).
 */
export const anonClient: SupabaseClient = createClient(config.supabaseUrl, config.supabaseAnonKey, baseOptions);

/**
 * Service-role client, or null when the key is not configured.
 * Bypasses RLS. Only ever used server-side.
 */
export const serviceClient: SupabaseClient | null = config.supabaseServiceRoleKey
  ? createClient(config.supabaseUrl, config.supabaseServiceRoleKey, baseOptions)
  : null;

/**
 * A client that acts as the signed-in staff member. RLS policies scope every
 * query to the staff member's restaurant. Used for all /api/admin routes.
 */
export function userClient(accessToken: string): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    ...baseOptions,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/**
 * Preferred client for admin writes: the service client when available
 * (so that storage uploads etc. never hit policy edge cases), otherwise the
 * user's own RLS-scoped client. Callers MUST still scope queries by restaurant_id.
 */
export function adminClient(accessToken: string): SupabaseClient {
  return serviceClient ?? userClient(accessToken);
}
