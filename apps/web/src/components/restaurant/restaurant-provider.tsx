'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { WifiOff } from 'lucide-react';
import type { RestaurantPageResponse } from '@restaurant-os/shared';
import { planHas } from '@restaurant-os/shared';
import { ApiRequestError, publicApi } from '@/lib/api';
import { useOnline } from '@/components/guest/use-online';
import { safeHttpUrl } from '@/components/guest/features';
import { takeawayScope } from '@/components/guest/notify-prefs';
import { OrderWatcherProvider } from '@/components/guest/order-watcher';
import { getTakeawaySession, type TakeawaySession } from './takeaway-session';

export interface PageError {
  kind: 'not_found' | 'network' | 'unknown';
  message: string;
}

interface RestaurantContextValue {
  slug: string;
  data: RestaurantPageResponse | null;
  loading: boolean;
  error: PageError | null;
  refresh: () => Promise<void>;
  /** Null until mounted (it lives in localStorage). */
  session: TakeawaySession | null;
}

/** Online takeaway is on: the restaurant switched it on and the plan includes it. */
export const takeawayOn = (r: RestaurantPageResponse['restaurant'] | null | undefined) => Boolean(r && r.takeaway_enabled && planHas(r.plan, 'online_takeaway'));
/** Online table booking is on. */
export const bookingOn = (r: RestaurantPageResponse['restaurant'] | null | undefined) => Boolean(r && r.reservations_enabled && planHas(r.plan, 'reservations'));

/** One copy per slug, so moving between the page and "Your orders" is instant. */
const cache = new Map<string, RestaurantPageResponse>();

function toError(e: unknown): PageError {
  if (e instanceof ApiRequestError) {
    if (e.status === 404) return { kind: 'not_found', message: e.message };
    if (e.status === 0) return { kind: 'network', message: e.message };
    return { kind: 'unknown', message: e.message };
  }
  return { kind: 'unknown', message: e instanceof Error ? e.message : 'Something went wrong' };
}

const Ctx = React.createContext<RestaurantContextValue | null>(null);

export function RestaurantProvider({ slug: rawSlug, children }: { slug: string; children: React.ReactNode }) {
  const slug = rawSlug.toLowerCase();
  const [data, setData] = React.useState<RestaurantPageResponse | null>(() => cache.get(slug) ?? null);
  const [loading, setLoading] = React.useState(!cache.has(slug));
  const [error, setError] = React.useState<PageError | null>(null);
  const [session, setSession] = React.useState<TakeawaySession | null>(null);
  const dataRef = React.useRef<RestaurantPageResponse | null>(cache.get(slug) ?? null);
  const abortRef = React.useRef<AbortController | null>(null);

  const load = React.useCallback(
    async (silent: boolean) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      if (!silent) setLoading(true);
      try {
        const res = await publicApi.restaurantPage(slug, ctrl.signal);
        if (ctrl.signal.aborted) return;
        cache.set(slug, res);
        dataRef.current = res;
        setData(res);
        setError(null);
      } catch (e) {
        if (ctrl.signal.aborted || (e as Error).name === 'AbortError') return;
        const err = toError(e);
        if (err.kind === 'not_found') {
          cache.delete(slug);
          dataRef.current = null;
          setData(null);
          setError(err);
        } else if (!silent || !dataRef.current) {
          setError(err);
        }
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    },
    [slug],
  );

  React.useEffect(() => {
    setSession(getTakeawaySession(slug));
    void load(Boolean(dataRef.current));
    return () => abortRef.current?.abort();
  }, [slug, load]);

  // Sold-out dishes and the open switch change while the phone sits in a pocket.
  React.useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load(Boolean(dataRef.current));
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [load]);

  const refresh = React.useCallback(() => load(Boolean(dataRef.current)), [load]);
  const value = React.useMemo(() => ({ slug, data, loading, error, refresh, session }), [slug, data, loading, error, refresh, session]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRestaurant(): RestaurantContextValue {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error('useRestaurant must be used inside <RestaurantProvider>');
  return ctx;
}

/** Light "paper" frame for /r/[slug] pages, with the offline strip. */
export function RestaurantShell({ slug, children }: { slug: string; children: React.ReactNode }) {
  const online = useOnline();
  const wasOffline = React.useRef(false);
  React.useEffect(() => {
    if (!online) wasOffline.current = true;
    else if (wasOffline.current) {
      wasOffline.current = false;
      toast.success('Back online');
    }
  }, [online]);

  return (
    <RestaurantProvider slug={slug}>
      <div className="theme-light min-h-dvh bg-bg text-fg sm:bg-[#ECE7DC]">
        <div className="relative mx-auto min-h-dvh w-full max-w-[600px] overflow-x-clip bg-bg pb-[env(safe-area-inset-bottom,0px)] sm:border-x sm:border-line/10 sm:shadow-[0_40px_120px_-60px_rgba(12,13,16,0.45)]">
          {!online && (
            <div role="status" aria-live="polite" className="sticky top-0 z-[35] flex items-start gap-2.5 bg-ink px-4 py-2.5 text-[12.5px] leading-snug text-paper">
              <WifiOff className="mt-px h-4 w-4 shrink-0 text-saffron" aria-hidden />
              <p className="min-w-0">You&apos;re offline. Reconnect to order or book.</p>
            </div>
          )}
          <TakeawayOrderWatcher>{children}</TakeawayOrderWatcher>
        </div>
      </div>
    </RestaurantProvider>
  );
}

/**
 * Takeaway order watcher for /r/[slug] pages: status banners, buzz, chime, tab-title flash and
 * system alerts for this phone's takeaway orders (see components/guest/order-watcher.tsx).
 * Checks once on load and stops when the phone has no takeaway orders here.
 */
function TakeawayOrderWatcher({ children }: { children: React.ReactNode }) {
  const { slug, data, session } = useRestaurant();
  const restaurant = data?.restaurant ?? null;
  const sessionId = session?.id ?? null;
  const fetchOrders = React.useCallback(() => (sessionId ? publicApi.takeawayOrders(slug, sessionId) : Promise.resolve([])), [slug, sessionId]);
  const hrefFor = React.useCallback(() => `/r/${slug}/orders`, [slug]);
  return (
    <OrderWatcherProvider
      kind="takeaway"
      scope={takeawayScope(slug)}
      enabled={Boolean(sessionId && takeawayOn(restaurant))}
      fetchOrders={fetchOrders}
      hrefFor={hrefFor}
      rateable={Boolean(safeHttpUrl(restaurant?.google_review_url))}
      restaurantName={restaurant?.name}
    >
      {children}
    </OrderWatcherProvider>
  );
}
