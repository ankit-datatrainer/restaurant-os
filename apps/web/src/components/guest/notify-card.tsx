'use client';

import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { BellOff, BellRing, Check, Share, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { ApiRequestError, publicApi } from '@/lib/api';
import { buzz, permission, pushSupport, registerServiceWorker, subscribeToPush } from '@/lib/push';
import { EASE_OUT } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { useLang } from './i18n';
import { isPushBroken, loadPushConfig, markPushBroken, readNotify, writeNotify } from './notify-prefs';

/**
 * "Get a ping when your food is ready": the alerts opt-in. Shown right after an order is placed
 * (and compact on the tracker) — never on page load, and the browser prompt only opens from the tap.
 *
 * Turning it on asks for notification permission, then saves a Web Push subscription for this
 * table / takeaway session so alerts reach a locked phone. Without server push (no keys, or the
 * push tables are not installed yet) it still enables system alerts while the page is open.
 * The choice is remembered per table (or restaurant) so the card does not keep coming back.
 */

export type NotifyTarget = { table_code: string } | { restaurant_slug: string };

type View = 'loading' | 'hidden' | 'offer' | 'busy' | 'on' | 'local' | 'blocked' | 'ios' | 'unsupported';

async function savePush(target: NotifyTarget, sessionId: string): Promise<boolean> {
  if (isPushBroken()) return false;
  try {
    const subscription = await subscribeToPush();
    if (!subscription) return false;
    await publicApi.guestPushSubscribe({ ...target, guest_session_id: sessionId, subscription });
    return true;
  } catch (e) {
    // The server answered but could not save (missing migration, server error): stop offering push.
    if (e instanceof ApiRequestError && e.status !== 0 && e.status !== 429) markPushBroken();
    return false;
  }
}

export function NotifyCard({
  scope,
  target,
  sessionId,
  variant = 'full',
  className,
}: {
  scope: string;
  target: NotifyTarget;
  sessionId: string | null;
  /** `compact`: one row for the tracker; disappears once alerts are on. */
  variant?: 'full' | 'compact';
  className?: string;
}) {
  const { t, uiLang } = useLang();
  const reduce = Boolean(useReducedMotion());
  const [view, setView] = React.useState<View>('loading');
  const targetKey = JSON.stringify(target);

  // Work out where this guest stands (no prompts here).
  React.useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const set = (v: View) => !cancelled && setView(v);
    void (async () => {
      const stored = readNotify(scope);
      if (stored?.choice === 'dismissed') return set('hidden');
      const support = pushSupport();
      const cfg = await loadPushConfig();
      const pushOk = cfg.enabled && !cfg.failed && !isPushBroken();
      if (support === 'ios-needs-install') return set(pushOk ? 'ios' : 'hidden');
      if (support === 'unsupported') return set(permission() === 'granted' ? 'local' : 'unsupported');
      const perm = permission();
      if (perm === 'denied') return set('blocked');
      if (perm !== 'granted') return set('offer');
      // Permission was given before (this table or another one on this site).
      if (pushOk && !(stored?.choice === 'push' && stored.session === sessionId)) {
        const ok = await savePush(JSON.parse(targetKey) as NotifyTarget, sessionId);
        if (ok) {
          writeNotify(scope, { choice: 'push', session: sessionId });
          return set('on');
        }
      } else if (pushOk) {
        return set('on');
      }
      if (stored?.choice !== 'local') writeNotify(scope, { choice: 'local' });
      void registerServiceWorker();
      return set('local');
    })();
    return () => {
      cancelled = true;
    };
  }, [scope, sessionId, targetKey]);

  const enable = async () => {
    if (!sessionId || view === 'busy') return;
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setView('unsupported');
      return;
    }
    setView('busy');
    let perm: NotificationPermission = Notification.permission;
    try {
      // Ask straight from the tap (Safari needs the prompt inside the gesture).
      if (perm === 'default') perm = await Notification.requestPermission();
    } catch {
      perm = Notification.permission;
    }
    if (perm === 'denied') {
      setView('blocked');
      return;
    }
    if (perm !== 'granted') {
      // Closed the prompt without choosing: leave the offer up.
      setView('offer');
      return;
    }
    void registerServiceWorker();
    const cfg = await loadPushConfig();
    if (cfg.enabled && !cfg.failed && (await savePush(target, sessionId))) {
      writeNotify(scope, { choice: 'push', session: sessionId });
      setView('on');
    } else {
      writeNotify(scope, { choice: 'local' });
      setView('local');
    }
    buzz([60]);
  };

  const dismiss = () => {
    writeNotify(scope, { choice: 'dismissed' });
    setView('hidden');
  };

  const compact = variant === 'compact';
  const visible =
    view !== 'loading' && view !== 'hidden' && !(compact && (view === 'on' || view === 'local' || view === 'unsupported'));

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.section
          key="notify"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, transition: { duration: 0.2 } }}
          transition={{ duration: reduce ? 0.01 : 0.45, ease: EASE_OUT }}
          className={cn('rounded-3xl border border-line/10 bg-surface shadow-soft', compact ? 'p-4' : 'p-5', className)}
          aria-live="polite"
          lang={uiLang}
        >
          {compact ? <CompactBody view={view} onEnable={enable} onDismiss={dismiss} t={t} /> : <FullBody view={view} onEnable={enable} onDismiss={dismiss} t={t} />}
        </motion.section>
      )}
    </AnimatePresence>
  );
}

type BodyProps = { view: View; onEnable: () => void; onDismiss: () => void; t: (k: string, p?: Record<string, string | number>) => string };

function Icon({ view, className }: { view: View; className?: string }) {
  const on = view === 'on' || view === 'local';
  const off = view === 'blocked' || view === 'unsupported';
  const I = on ? Check : off ? BellOff : view === 'ios' ? Share : BellRing;
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-2xl',
        on ? 'bg-mint-soft text-mint' : off ? 'bg-sunk text-muted' : 'bg-ember-soft text-ember',
        className,
      )}
    >
      <I className="h-5 w-5" aria-hidden />
    </span>
  );
}

function copyFor(view: View): { title: string; body: string } {
  switch (view) {
    case 'on':
      return { title: 'Notifications are on', body: "You'll get updates even if you lock your phone." };
    case 'local':
      return { title: 'Notifications are on', body: "Updates show while this page is open, even if you switch tabs. We'll also show them right here." };
    case 'blocked':
      return { title: 'Notifications are blocked', body: "Notifications are blocked in your browser settings. Keep this page open and we'll show updates here." };
    case 'ios':
      return {
        title: 'Want alerts with your phone locked?',
        body: 'On iPhone, tap Share, then Add to Home Screen, and open it from there to get alerts. Until then, updates show on this page.',
      };
    case 'unsupported':
      return { title: "This browser can't show alerts", body: "Keep this page open and we'll show updates here." };
    default:
      return { title: 'Get a ping when your food is ready', body: "We'll tell you when the kitchen confirms your order, starts cooking and sends it out." };
  }
}

function FullBody({ view, onEnable, onDismiss, t }: BodyProps) {
  const { title, body } = copyFor(view);
  const offer = view === 'offer' || view === 'busy';
  const closable = view !== 'on' && view !== 'local';
  return (
    <div>
      <div className="flex items-start gap-3.5">
        <Icon view={view} className="h-11 w-11" />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[17px] font-bold leading-tight tracking-tight">{t(title)}</h2>
          <p className="mt-1 text-[13.5px] leading-relaxed text-fg/70">{t(body)}</p>
        </div>
        {closable && !offer && (
          <button
            type="button"
            onClick={onDismiss}
            className="-mr-2 -mt-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-fg/5"
            aria-label={t('Dismiss')}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
      {offer && (
        <div className="mt-4 grid gap-2">
          <Button size="lg" onClick={onEnable} loading={view === 'busy'} leftIcon={<BellRing className="h-4 w-4" aria-hidden />}>
            {t('Turn on notifications')}
          </Button>
          <Button size="md" variant="ghost" onClick={onDismiss} disabled={view === 'busy'}>
            {t('Not now')}
          </Button>
        </div>
      )}
    </div>
  );
}

function CompactBody({ view, onEnable, onDismiss, t }: BodyProps) {
  const { title, body } = copyFor(view);
  const offer = view === 'offer' || view === 'busy';
  return (
    <div className="flex items-center gap-3">
      <Icon view={view} className="h-10 w-10" />
      <div className="min-w-0 flex-1">
        <p className="font-display text-[15px] font-bold leading-tight">{t(title)}</p>
        {!offer && <p className="mt-0.5 text-[12.5px] leading-snug text-fg/65">{t(body)}</p>}
      </div>
      {offer && (
        <Button size="sm" onClick={onEnable} loading={view === 'busy'} className="shrink-0">
          {t('Turn on')}
        </Button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        className="-mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-fg/5"
        aria-label={t('Dismiss')}
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
