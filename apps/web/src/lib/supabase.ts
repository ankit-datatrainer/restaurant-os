'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/**
 * Browser Supabase client (anon key). Used for:
 *  - staff sign-in (email + password) → the session's access token is sent to the Express API
 *  - realtime subscriptions on the admin dashboard (RLS scopes rows to the staff's restaurant)
 */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy apps/web/.env.example to apps/web/.env.local.');
  }
  client = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'ros-admin-auth' },
    realtime: { params: { eventsPerSecond: 10 } },
  });
  return client;
}

export async function getAccessToken(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.access_token ?? null;
}
