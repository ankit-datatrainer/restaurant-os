'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { BellRing, CheckCircle2, ChefHat, Receipt, Star, X, XCircle } from 'lucide-react';
import type { OrderStatus, OrderWithItems } from '@restaurant-os/shared';
import { orderCode } from '@/lib/utils';
import { EASE_OUT, springSoft } from '@/lib/motion';
import { buzz, notifyLocal, onPushMessage } from '@/lib/push';
import { playChime, unlockAudio } from '@/lib/audio';
import { cn } from '@/lib/utils';
import { HI_SAFE, useLang } from './i18n';
import { readNotify } from './notify-prefs';

/**
 * Order watcher: one per guest area (a table's pages, or a restaurant's takeaway pages).
 *
 * Polls the guest's orders (5 s while something is cooking and the tab is visible, 20 s when
 * nothing is moving, never when there are no orders), checks at once when the tab comes back or a
 * push arrives, and turns every forward step into one notice: an in-app banner, a buzz, a soft chime,
 * a flashing tab title while hidden and a system notification for a hidden tab.
 *
 * It is the only place that announces status changes. Screens that load orders themselves
 * (tracker, My orders, takeaway orders) `report()` what they got so the notice appears at once
 * and is never shown twice. The last status per order lives in sessionStorage, so a reload does
 * not replay anything; an order seen for the first time is recorded silently.
 */

export type WatchKind = 'table' | 'takeaway';
export type NoticeStage = 'accepted' | 'preparing' | 'ready' | 'served' | 'cancelled' | 'paid';

const RANK: Record<OrderStatus, number> = { placed: 0, accepted: 1, preparing: 2, ready: 3, served: 4, cancelled: 5 };
const NOTIFY_STATUSES = new Set<OrderStatus>(['accepted', 'preparing', 'ready', 'served', 'cancelled']);

const ACTIVE_MS = 5_000;
const IDLE_MS = 20_000;
/** Hidden tab without Web Push: keep checking slowly so the title and system alert still work. */
const HIDDEN_MS = 15_000;
const AUTO_HIDE_MS = 6_000;

const isActive = (o: OrderWithItems) => (o.status !== 'served' && o.status !== 'cancelled') || o.payment_status === 'claimed';

type Known = Record<string, { s: OrderStatus; p: boolean }>;

const storeKey = (scope: string) => `ros:watch:${scope}`;

function readKnown(scope: string): Known {
  try {
    const raw = window.sessionStorage.getItem(storeKey(scope));
    return raw ? (JSON.parse(raw) as Known) : {};
  } catch {
    return {};
  }
}

function writeKnown(scope: string, known: Known) {
  try {
    window.sessionStorage.setItem(storeKey(scope), JSON.stringify(known));
  } catch {
    /* private mode */
  }
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

/** English keys; every one has a Hindi entry in i18n.ts. */
const COPY: Record<WatchKind, Record<NoticeStage, { title: string; line: string }>> = {
  table: {
    accepted: { title: 'Order confirmed', line: 'The kitchen has it' },
    preparing: { title: 'Being prepared', line: 'Your food is being prepared' },
    ready: { title: 'Ready!', line: "It's on its way to your table" },
    served: { title: 'Enjoy your meal', line: 'Your food is at the table' },
    cancelled: { title: 'Order cancelled', line: 'Please ask the staff if this is unexpected' },
    paid: { title: 'Payment received', line: 'Thank you' },
  },
  takeaway: {
    accepted: { title: 'Order confirmed', line: 'The kitchen has it' },
    preparing: { title: 'Being prepared', line: 'Your food is being prepared' },
    ready: { title: 'Ready for pickup', line: "It's packed and waiting at the counter" },
    served: { title: 'Picked up', line: 'Thank you, enjoy your meal' },
    cancelled: { title: 'Order cancelled', line: 'Please call the restaurant if this is unexpected' },
    paid: { title: 'Payment received', line: 'Thank you' },
  },
};

/** Served line when the guest can rate the meal (or review it on Google). */
const RATE_LINE = 'Tap to rate it';

const TONE: Record<NoticeStage, string> = {
  accepted: 'bg-sky/20 text-[#9cc3f5]',
  preparing: 'bg-saffron/20 text-saffron',
  ready: 'bg-mint/25 text-[#7fe0b0]',
  served: 'bg-ember/25 text-ember',
  cancelled: 'bg-rose/25 text-[#f3a0a3]',
  paid: 'bg-mint/25 text-[#7fe0b0]',
};

const ICON: Record<NoticeStage, React.ComponentType<{ className?: string }>> = {
  accepted: CheckCircle2,
  preparing: ChefHat,
  ready: BellRing,
  served: Star,
  cancelled: XCircle,
  paid: Receipt,
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface WatcherContextValue {
  kind: WatchKind;
  /** localStorage scope for the notification choice (`t:CODE` / `r:slug`). */
  scope: string;
  /** Latest list from the watcher (null until the first answer). */
  orders: OrderWithItems[] | null;
  /** A screen loaded fresh order data: compare it now (announces changes, never twice). */
  report: (orders: OrderWithItems | OrderWithItems[]) => void;
  /** A just-placed order: remember its status silently and start watching. */
  track: (order: OrderWithItems) => void;
  /** Check now. */
  poke: () => void;
  /** Called with the ids of orders whose status or payment changed. */
  subscribe: (listener: (orderIds: string[]) => void) => () => void;
}

const WatcherContext = React.createContext<WatcherContextValue | null>(null);

/** The watcher of the current guest area, or null outside one. */
export function useOrderWatcher(): WatcherContextValue | null {
  return React.useContext(WatcherContext);
}

interface Notice {
  key: string;
  orderId: string;
  stage: NoticeStage;
  code: string;
  href: string;
}

export interface OrderWatcherProps {
  kind: WatchKind;
  scope: string;
  enabled: boolean;
  fetchOrders: () => Promise<OrderWithItems[]>;
  /** Where "View" goes for an order (the tracker, or the takeaway orders page). */
  hrefFor: (order: OrderWithItems, stage: NoticeStage) => string;
  /** The served notice says "Tap to rate it" (feedback on, or a Google review link exists). */
  rateable?: boolean;
  restaurantName?: string;
  children: React.ReactNode;
}

export function OrderWatcherProvider({ kind, scope, enabled, fetchOrders, hrefFor, rateable = false, restaurantName, children }: OrderWatcherProps) {
  const { t } = useLang();
  const [orders, setOrders] = React.useState<OrderWithItems[] | null>(null);
  const [notices, setNotices] = React.useState<Notice[]>([]);

  // Latest props for the stable callbacks below.
  const live = React.useRef({ enabled, fetchOrders, hrefFor, rateable, restaurantName, t, scope, kind });
  live.current = { enabled, fetchOrders, hrefFor, rateable, restaurantName, t, scope, kind };

  const known = React.useRef<Known>({});
  const listeners = React.useRef(new Set<(ids: string[]) => void>());
  const poll = React.useRef({ timer: undefined as number | undefined, inflight: false, again: false, hasOrders: false, active: false, failures: 0 });
  const flash = React.useRef({ count: 0, base: '', text: '', timer: undefined as number | undefined });

  React.useEffect(() => {
    known.current = readKnown(scope);
  }, [scope]);

  // ----- Title flash while hidden -----
  const stopFlash = React.useCallback(() => {
    const f = flash.current;
    if (f.timer !== undefined) {
      window.clearInterval(f.timer);
      f.timer = undefined;
      document.title = f.base;
    }
    f.count = 0;
  }, []);

  const flashTitle = React.useCallback((text: string) => {
    if (document.visibilityState === 'visible') return;
    const f = flash.current;
    f.count += 1;
    f.text = text;
    if (f.timer === undefined) {
      f.base = document.title;
      let on = true;
      document.title = `(${f.count}) ${f.text}`;
      f.timer = window.setInterval(() => {
        on = !on;
        document.title = on ? `(${f.count}) ${f.text}` : f.base;
      }, 1200);
    }
  }, []);

  // ----- Announce one change -----
  const announce = React.useCallback(
    (order: OrderWithItems, stage: NoticeStage) => {
      const { kind: k, hrefFor: href, rateable: canRate, restaurantName: name, t: tr } = live.current;
      const copy = COPY[k][stage];
      const code = orderCode(order.order_number);
      const line = stage === 'served' && canRate ? RATE_LINE : copy.line;
      const url = href(order, stage);
      setNotices((list) => [{ key: `${order.id}:${stage}`, orderId: order.id, stage, code, href: url }, ...list.filter((n) => n.orderId !== order.id)].slice(0, 3));

      const ready = stage === 'ready';
      buzz(ready ? [200, 100, 200, 100, 400] : stage === 'cancelled' ? [80, 60, 80] : [120]);
      playChime(ready ? 'order' : 'success');
      flashTitle(`${tr(copy.title)} · ${code}`);

      // A server push already covers a hidden tab when the guest turned alerts on.
      if (readNotify(live.current.scope)?.choice !== 'push') {
        void notifyLocal({
          title: `${tr(copy.title)} · ${code}`,
          body: [tr(line), name].filter(Boolean).join(' · '),
          url,
          tag: `order-${order.id}`,
          requireInteraction: ready,
          vibrate: ready ? [200, 100, 200, 100, 400] : [120],
        });
      }
    },
    [flashTitle],
  );

  // ----- Compare fresh data with what we knew -----
  const compare = React.useCallback(
    (list: OrderWithItems[]) => {
      const map = known.current;
      const changed: string[] = [];
      const toAnnounce: Array<[OrderWithItems, NoticeStage]> = [];
      for (const o of list) {
        const paid = o.payment_status === 'paid';
        const prev = map[o.id];
        if (!prev) {
          map[o.id] = { s: o.status, p: paid };
          continue;
        }
        // Ignore an older answer that arrives late (never step backwards).
        const forward = RANK[o.status] > RANK[prev.s];
        const nowPaid = paid && !prev.p;
        if (!forward && !nowPaid) continue;
        changed.push(o.id);
        if (forward && NOTIFY_STATUSES.has(o.status)) toAnnounce.push([o, o.status as NoticeStage]);
        else if (nowPaid && o.status !== 'cancelled') toAnnounce.push([o, 'paid']);
        map[o.id] = { s: forward ? o.status : prev.s, p: prev.p || paid };
      }
      writeKnown(live.current.scope, map);
      if (changed.length) for (const l of listeners.current) l(changed);
      for (const [o, stage] of toAnnounce) announce(o, stage);
    },
    [announce],
  );

  // ----- Polling -----
  const clearTimer = React.useCallback(() => {
    const p = poll.current;
    if (p.timer !== undefined) window.clearTimeout(p.timer);
    p.timer = undefined;
  }, []);

  const runRef = React.useRef<() => void>(() => undefined);

  const schedule = React.useCallback(() => {
    clearTimer();
    const p = poll.current;
    if (!live.current.enabled || !p.hasOrders) return;
    let ms: number;
    if (document.visibilityState === 'visible') ms = p.failures > 0 || !p.active ? IDLE_MS : ACTIVE_MS;
    else if (p.active && readNotify(live.current.scope)?.choice !== 'push') ms = HIDDEN_MS;
    else return;
    p.timer = window.setTimeout(() => runRef.current(), ms);
  }, [clearTimer]);

  const run = React.useCallback(async () => {
    const p = poll.current;
    if (!live.current.enabled) return;
    if (p.inflight) {
      p.again = true;
      return;
    }
    p.inflight = true;
    clearTimer();
    try {
      const list = await live.current.fetchOrders();
      p.hasOrders = list.length > 0;
      p.active = list.some(isActive);
      p.failures = 0;
      setOrders(list);
      compare(list);
    } catch {
      p.failures += 1;
    } finally {
      p.inflight = false;
      if (p.again) {
        p.again = false;
        void run();
      } else schedule();
    }
  }, [clearTimer, compare, schedule]);
  runRef.current = () => void run();

  React.useEffect(() => {
    if (!enabled) return;
    void run();
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        stopFlash();
        void run();
      } else schedule();
    };
    const onOnline = () => void run();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onOnline);
    const offPush = onPushMessage(() => void run());
    return () => {
      clearTimer();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', onOnline);
      offPush();
    };
  }, [enabled, run, schedule, clearTimer, stopFlash]);

  React.useEffect(() => stopFlash, [stopFlash]);

  // Browsers only play sound after a gesture: unlock on the guest's first tap anywhere.
  React.useEffect(() => {
    const unlock = () => void unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true, capture: true });
    return () => window.removeEventListener('pointerdown', unlock, { capture: true });
  }, []);

  const report = React.useCallback(
    (input: OrderWithItems | OrderWithItems[]) => {
      const list = Array.isArray(input) ? input : [input];
      if (!list.length) return;
      setOrders((prev) => {
        if (!prev) return Array.isArray(input) ? list : prev;
        const byId = new Map(list.map((o) => [o.id, o]));
        const merged = prev.map((o) => byId.get(o.id) ?? o);
        for (const o of list) if (!prev.some((x) => x.id === o.id)) merged.unshift(o);
        return merged;
      });
      compare(list);
      const p = poll.current;
      if (list.some(isActive) && !p.hasOrders) {
        p.hasOrders = true;
        p.active = true;
        schedule();
      }
    },
    [compare, schedule],
  );

  const track = React.useCallback(
    (order: OrderWithItems) => {
      const map = known.current;
      if (!map[order.id]) {
        map[order.id] = { s: order.status, p: order.payment_status === 'paid' };
        writeKnown(live.current.scope, map);
      }
      setOrders((prev) => (prev ? [order, ...prev.filter((o) => o.id !== order.id)] : [order]));
      const p = poll.current;
      p.hasOrders = true;
      p.active = true;
      schedule();
    },
    [schedule],
  );

  const poke = React.useCallback(() => void run(), [run]);
  const subscribe = React.useCallback((listener: (ids: string[]) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const dismiss = React.useCallback((key: string) => setNotices((list) => list.filter((n) => n.key !== key)), []);

  const value = React.useMemo<WatcherContextValue>(
    () => ({ kind, scope, orders, report, track, poke, subscribe }),
    [kind, scope, orders, report, track, poke, subscribe],
  );

  return (
    <WatcherContext.Provider value={value}>
      {children}
      <NoticeStack notices={notices} kind={kind} rateable={rateable} onDismiss={dismiss} />
    </WatcherContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------

function NoticeStack({ notices, kind, rateable, onDismiss }: { notices: Notice[]; kind: WatchKind; rateable: boolean; onDismiss: (key: string) => void }) {
  const { t } = useLang();
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[96] mx-auto grid w-full max-w-[560px] gap-2 px-3"
      style={{ top: 'calc(var(--guest-offline-h, 0px) + max(0.5rem, env(safe-area-inset-top, 0px)))' }}
      role="region"
      aria-label={t('Order updates')}
    >
      <div className="sr-only" aria-live="assertive" aria-atomic="true">
        {notices[0] ? <NoticeAnnouncement notice={notices[0]} kind={kind} rateable={rateable} /> : null}
      </div>
      <AnimatePresence initial={false}>
        {notices.map((n) => (
          <NoticeBanner key={n.key} notice={n} kind={kind} rateable={rateable} onDismiss={() => onDismiss(n.key)} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function NoticeAnnouncement({ notice, kind, rateable }: { notice: Notice; kind: WatchKind; rateable: boolean }) {
  const { t } = useLang();
  const copy = COPY[kind][notice.stage];
  const line = notice.stage === 'served' && rateable ? RATE_LINE : copy.line;
  return (
    <>
      {t(copy.title)}, {t('Order {code}', { code: notice.code })}. {t(line)}.
    </>
  );
}

function NoticeBanner({ notice, kind, rateable, onDismiss }: { notice: Notice; kind: WatchKind; rateable: boolean; onDismiss: () => void }) {
  const { t, uiLang } = useLang();
  const reduce = Boolean(useReducedMotion());
  const router = useRouter();
  const pathname = usePathname();
  const [paused, setPaused] = React.useState(false);

  const copy = COPY[kind][notice.stage];
  const rate = notice.stage === 'served' && rateable;
  const line = rate ? RATE_LINE : copy.line;
  const [targetUrl, targetHash] = notice.href.split('#') as [string, string | undefined];
  const here = pathname === targetUrl.split('?')[0];
  // On the page already: "View" adds nothing, unless it jumps to the rating card.
  const showAction = !here || (rate && Boolean(targetHash));

  // "Ready" stays until dismissed; the rest leave after ~6 s of the guest actually seeing them.
  React.useEffect(() => {
    if (notice.stage === 'ready' || paused) return;
    let timer: number | undefined;
    const start = () => {
      if (timer === undefined && document.visibilityState === 'visible') timer = window.setTimeout(onDismiss, AUTO_HIDE_MS);
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') start();
    };
    start();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [notice.stage, paused, onDismiss]);

  const act = () => {
    onDismiss();
    if (here && targetHash) {
      window.history.replaceState(null, '', `#${targetHash}`);
      document.getElementById(targetHash)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      return;
    }
    router.push(notice.href);
  };

  const Icon = ICON[notice.stage];
  const ready = notice.stage === 'ready';

  return (
    <motion.div
      layout={!reduce}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: -24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: reduce ? { duration: 0.01 } : springSoft }}
      exit={reduce ? { opacity: 0, transition: { duration: 0.01 } } : { opacity: 0, y: -16, transition: { duration: 0.22, ease: EASE_OUT } }}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      className={cn(
        'pointer-events-auto relative flex items-center gap-3 overflow-hidden rounded-2xl bg-ink py-3 pl-3 pr-1.5 text-paper shadow-[0_18px_50px_-18px_rgba(12,13,16,0.65)]',
        ready && 'ring-2 ring-mint/70',
      )}
      lang={uiLang}
    >
      {ready && !reduce && <span className="pointer-events-none absolute -left-8 -top-8 h-24 w-24 rounded-full bg-mint/25 blur-2xl" aria-hidden />}
      <span className={cn('relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', TONE[notice.stage])}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div className="relative min-w-0 flex-1">
        <p className={cn('font-mono text-[10.5px] uppercase tracking-[0.16em] text-paper/55 tnum', HI_SAFE)}>{t('Order {code}', { code: notice.code })}</p>
        <p className="truncate font-display text-[15.5px] font-bold leading-tight">{t(copy.title)}</p>
        <p className="mt-0.5 text-[12.5px] leading-snug text-paper/70">{t(line)}</p>
      </div>
      {showAction && (
        <button
          type="button"
          onClick={act}
          className="relative inline-flex h-9 shrink-0 items-center rounded-full bg-paper px-3.5 text-[13px] font-semibold text-ink transition active:scale-[0.97]"
        >
          {rate ? t('Rate it') : t('View')}
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-paper/60 transition hover:bg-paper/10 hover:text-paper"
        aria-label={t('Dismiss')}
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </motion.div>
  );
}
