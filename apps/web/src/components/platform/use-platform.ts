'use client';

import * as React from 'react';
import { toast } from 'sonner';
import type { Lead, PlatformOverview, PlatformRestaurant, PlatformRestaurantUpdate } from '@restaurant-os/shared';
import { ApiRequestError, platformApi } from '@/lib/api';

const OVERVIEW_EVERY_MS = 60_000;

export function errorMessage(e: unknown, fallback = 'Something went wrong.'): string {
  if (e instanceof ApiRequestError) return e.message || fallback;
  if (e instanceof Error && e.message) return /failed to fetch|network/i.test(e.message) ? 'Could not reach the API. Check that it is running.' : e.message;
  return fallback;
}

export interface LoadError {
  message: string;
  status: number | null;
}

function toLoadError(e: unknown): LoadError {
  return { message: errorMessage(e, 'Could not load the console data.'), status: e instanceof ApiRequestError ? e.status : null };
}

/**
 * Console data: overview, restaurants and leads, with a 60 s overview refresh while the tab is visible
 * and optimistic restaurant updates.
 */
export function usePlatformData(token: string | null) {
  const tokenRef = React.useRef(token);
  tokenRef.current = token;

  const [overview, setOverview] = React.useState<PlatformOverview | null>(null);
  const [restaurants, setRestaurants] = React.useState<PlatformRestaurant[] | null>(null);
  const [leads, setLeads] = React.useState<Lead[] | null>(null);
  const [error, setError] = React.useState<LoadError | null>(null);
  const [leadsError, setLeadsError] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [updatedAt, setUpdatedAt] = React.useState<number | null>(null);
  const [pending, setPending] = React.useState<Record<string, string>>({});
  const restaurantsRef = React.useRef(restaurants);
  restaurantsRef.current = restaurants;
  const lastOverviewAt = React.useRef(0);
  const hasData = React.useRef(false);

  const loadOverview = React.useCallback(async (quiet = true) => {
    const t = tokenRef.current;
    if (!t) return;
    try {
      const o = await platformApi.overview(t);
      setOverview(o);
      lastOverviewAt.current = Date.now();
      setUpdatedAt(Date.now());
    } catch (e) {
      if (!quiet) toast.error(errorMessage(e, 'Could not refresh the overview.'));
    }
  }, []);

  const loadRestaurants = React.useCallback(async () => {
    const t = tokenRef.current;
    if (!t) return;
    const list = await platformApi.restaurants(t);
    setRestaurants(list);
  }, []);

  const loadLeads = React.useCallback(async () => {
    const t = tokenRef.current;
    if (!t) return;
    try {
      setLeadsError(null);
      setLeads(await platformApi.leads(t));
    } catch (e) {
      setLeadsError(errorMessage(e, 'Could not load leads.'));
    }
  }, []);

  /** Everything at once. First load failures go to `error`; later ones become a toast so data stays on screen. */
  const refresh = React.useCallback(async () => {
    const t = tokenRef.current;
    if (!t) return;
    setRefreshing(true);
    try {
      const [o, list] = await Promise.all([platformApi.overview(t), platformApi.restaurants(t)]);
      setOverview(o);
      setRestaurants(list);
      lastOverviewAt.current = Date.now();
      setUpdatedAt(Date.now());
      setError(null);
      hasData.current = true;
      void loadLeads();
    } catch (e) {
      if (hasData.current) toast.error(errorMessage(e, 'Could not refresh.'));
      else setError(toLoadError(e));
    } finally {
      setRefreshing(false);
    }
  }, [loadLeads]);

  // Initial load once a token is available.
  const hasToken = Boolean(token);
  React.useEffect(() => {
    if (hasToken) void refresh();
  }, [hasToken, refresh]);

  // Overview every 60 s while the page is visible; catch up when the tab comes back.
  React.useEffect(() => {
    if (!hasToken) return;
    const tick = () => {
      if (document.visibilityState !== 'visible' || !hasData.current) return;
      if (Date.now() - lastOverviewAt.current >= OVERVIEW_EVERY_MS - 1000) void loadOverview(true);
    };
    const id = window.setInterval(tick, OVERVIEW_EVERY_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [hasToken, loadOverview]);

  /**
   * Optimistic restaurant update: apply `optimistic` immediately, send `body`, merge the server's
   * row on success (then refetch list + overview), roll back and toast the API error on failure.
   */
  const updateRestaurant = React.useCallback(
    async (
      id: string,
      body: PlatformRestaurantUpdate,
      optimistic: Partial<PlatformRestaurant>,
      opts: { action: string; success: string },
    ): Promise<boolean> => {
      const t = tokenRef.current;
      if (!t) return false;
      const before = restaurantsRef.current?.find((r) => r.id === id);
      setRestaurants((list) => (list ? list.map((r) => (r.id === id ? { ...r, ...optimistic } : r)) : list));
      setPending((p) => ({ ...p, [id]: opts.action }));
      try {
        const updated = await platformApi.updateRestaurant(t, id, body);
        setRestaurants((list) =>
          list
            ? list.map((r) =>
                r.id === id
                  ? {
                      ...r,
                      plan: updated.plan ?? r.plan,
                      status: updated.status ?? r.status,
                      listed: typeof updated.listed === 'boolean' ? updated.listed : r.listed,
                      trial_ends_at: updated.trial_ends_at !== undefined ? updated.trial_ends_at : r.trial_ends_at,
                    }
                  : r,
              )
            : list,
        );
        toast.success(opts.success);
        void Promise.all([loadRestaurants().catch(() => undefined), loadOverview(true)]);
        return true;
      } catch (e) {
        const prev = before;
        if (prev) setRestaurants((list) => (list ? list.map((r) => (r.id === id ? prev : r)) : list));
        toast.error(errorMessage(e, 'Could not update the restaurant.'));
        return false;
      } finally {
        setPending((p) => {
          const next = { ...p };
          delete next[id];
          return next;
        });
      }
    },
    [loadOverview, loadRestaurants],
  );

  return {
    overview,
    restaurants,
    leads,
    error,
    leadsError,
    refreshing,
    updatedAt,
    pending,
    refresh,
    loadLeads,
    updateRestaurant,
  };
}

export type PlatformData = ReturnType<typeof usePlatformData>;
