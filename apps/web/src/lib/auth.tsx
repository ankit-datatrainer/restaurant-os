'use client';

import * as React from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Restaurant, Staff } from '@restaurant-os/shared';
import { getSupabase } from './supabase';
import { adminApi, ApiRequestError } from './api';

interface AuthState {
  /** undefined = still loading, null = signed out */
  session: Session | null | undefined;
  staff: Staff | null;
  restaurant: Restaurant | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  /** HTTP status behind `error` when it came from the API (403 = signed in, but not staff anywhere). */
  errorStatus: number | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-fetch the staff + restaurant (e.g. after settings change). */
  refresh: () => Promise<void>;
  setRestaurant: (r: Restaurant) => void;
}

const AuthContext = React.createContext<AuthState | null>(null);

/**
 * Staff authentication for /admin. Wrap the admin layout with this.
 * - Sign-in goes straight to Supabase Auth (email + password).
 * - The access token is forwarded to the Express API (`Authorization: Bearer`).
 * - `staff` + `restaurant` come from GET /api/admin/me.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null | undefined>(undefined);
  const [staff, setStaff] = React.useState<Staff | null>(null);
  const [restaurant, setRestaurant] = React.useState<Restaurant | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [errorStatus, setErrorStatus] = React.useState<number | null>(null);
  const [profileLoading, setProfileLoading] = React.useState(false);

  React.useEffect(() => {
    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s ?? null);
      if (!s) {
        setStaff(null);
        setRestaurant(null);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadProfile = React.useCallback(async (token: string) => {
    setProfileLoading(true);
    setError(null);
    setErrorStatus(null);
    try {
      const me = await adminApi.me(token);
      setStaff(me.staff);
      setRestaurant(me.restaurant);
    } catch (e) {
      const msg = e instanceof ApiRequestError ? e.message : 'Could not load your restaurant.';
      setError(msg);
      setErrorStatus(e instanceof ApiRequestError ? e.status : null);
      // 401 = the session is dead, start over. 403 = a valid login that is not staff anywhere:
      // keep the session so the guard can explain it and offer "Sign out" instead of looping
      // back to an empty login form.
      if (e instanceof ApiRequestError && e.status === 401) {
        await getSupabase().auth.signOut();
      }
    } finally {
      setProfileLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (session?.access_token) void loadProfile(session.access_token);
  }, [session?.access_token, loadProfile]);

  const signIn = React.useCallback(async (email: string, password: string) => {
    setError(null);
    setErrorStatus(null);
    const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      const friendly = /invalid login credentials/i.test(error.message) ? 'Wrong email or password.' : error.message;
      setError(friendly);
      throw new Error(friendly);
    }
  }, []);

  const signOut = React.useCallback(async () => {
    await getSupabase().auth.signOut();
    setStaff(null);
    setRestaurant(null);
    setError(null);
    setErrorStatus(null);
  }, []);

  const refresh = React.useCallback(async () => {
    if (session?.access_token) await loadProfile(session.access_token);
  }, [session?.access_token, loadProfile]);

  const value = React.useMemo<AuthState>(
    () => ({
      session,
      staff,
      restaurant,
      token: session?.access_token ?? null,
      loading: session === undefined || (Boolean(session) && !staff && profileLoading),
      error,
      errorStatus,
      signIn,
      signOut,
      refresh,
      setRestaurant,
    }),
    [session, staff, restaurant, profileLoading, error, errorStatus, signIn, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Convenience: the current token, or throws (use inside handlers after auth is ready). */
export function useToken(): string {
  const { token } = useAuth();
  if (!token) throw new Error('Not signed in');
  return token;
}
