'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Bell, BellRing, Check, ChefHat, CirclePlus, Printer, X } from 'lucide-react';
import { CALL_TYPE_LABEL, minutesSince, orderCode, tableDisplay } from '@restaurant-os/shared';
import { cn } from '@/lib/utils';
import { springSoft } from '@/lib/motion';
import { useAdmin } from './admin-provider';
import { formatElapsed, maxRound, orderSummary } from './format';
import { kotUrl } from './order-card';
import { useNow } from './use-now';

/**
 * Flash the tab title while something needs attention, e.g. "(2) New order…".
 * Restores whatever title Next set when the count returns to zero.
 */
function useTitleFlash(count: number, label: string) {
  React.useEffect(() => {
    if (count <= 0 || typeof document === 'undefined') return;
    let base = document.title;
    let flashed = false;
    let lastWritten = '';
    const tick = () => {
      if (document.title !== lastWritten) base = document.title; // Next changed it (navigation)
      flashed = !flashed;
      lastWritten = flashed ? `(${count}) ${label}` : base;
      document.title = lastWritten;
    };
    tick();
    const id = window.setInterval(tick, 1200);
    return () => {
      window.clearInterval(id);
      if (document.title === lastWritten) document.title = base;
    };
  }, [count, label]);
}

/**
 * Global attention layer: green banners for new orders (auto-dismiss 12 s, stacking),
 * an orange persistent panel for open assistance calls, and a flashing tab title.
 */
export function NotificationLayer() {
  const { banners, dismissBanner, calls, setOrderStatus, attendCall, sound } = useAdmin();
  const router = useRouter();
  const reduce = useReducedMotion();
  const now = useNow(15_000);
  const [busy, setBusy] = React.useState<Set<string>>(new Set());
  const [callsCollapsed, setCallsCollapsed] = React.useState(false);

  const hasNew = banners.some((b) => b.kind === 'new');
  useTitleFlash(banners.length + calls.length, hasNew ? 'New order…' : banners.length ? 'Dishes added…' : 'Table calling…');

  const mark = (id: string, on: boolean) =>
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const accept = async (orderId: string) => {
    const banner = banners.find((b) => b.id === orderId);
    if (!banner) return;
    mark(orderId, true);
    const res = await setOrderStatus(banner.order, 'accepted');
    mark(orderId, false);
    if (res) dismissBanner(orderId);
  };

  const openKitchen = (orderId: string) => {
    dismissBanner(orderId);
    router.push('/admin/kitchen');
  };

  const attend = async (id: string) => {
    const call = calls.find((c) => c.id === id);
    if (!call) return;
    mark(id, true);
    await attendCall(call);
    mark(id, false);
  };

  return (
    <>
      {/* New-order and dishes-added banners: slide down from the top, stack */}
      <div className="pointer-events-none fixed inset-x-0 top-[4.25rem] z-[70] flex flex-col items-center gap-2 px-3 md:left-[260px] print:hidden" aria-live="polite">
        <AnimatePresence initial={false}>
          {banners.map((b) =>
            b.kind === 'added' ? (
              <motion.div
                key={b.id}
                layout={!reduce}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: -24, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.98 }}
                transition={springSoft}
                className="pointer-events-auto w-full max-w-xl overflow-hidden rounded-2xl bg-ink text-paper shadow-lift ring-1 ring-saffron/60"
                role="status"
              >
                <div className="flex items-start gap-3 p-3.5 sm:p-4">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-saffron text-ink" aria-hidden>
                    <CirclePlus className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-[15px] font-semibold leading-tight">
                      Dishes added to <span className="font-mono tnum">{orderCode(b.order.order_number)}</span> · {tableDisplay(b.order.table)}
                    </p>
                    {b.added && b.added.length > 0 ? (
                      <ul className="mt-1.5 line-clamp-2 text-sm text-paper/80">
                        {b.added.map((it) => (
                          <li key={it.id} className="inline">
                            <span className="font-mono tnum text-saffron">{it.quantity}×</span> {it.name}
                            {' · '}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-0.5 text-sm text-paper/70">The new dishes are highlighted on the order card.</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {maxRound(b.order.items) > 1 && (
                        <a
                          href={kotUrl(b.order.id, maxRound(b.order.items))}
                          target="_blank"
                          rel="noopener"
                          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-saffron px-4 text-[13px] font-semibold text-ink transition hover:bg-saffron/90 active:scale-[0.97]"
                        >
                          <Printer className="h-4 w-4" aria-hidden /> Print add-on KOT
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => openKitchen(b.id)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-paper/25 px-4 text-[13px] font-semibold text-paper transition hover:bg-paper/10"
                      >
                        <ChefHat className="h-4 w-4" aria-hidden /> Open kitchen board
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => dismissBanner(b.id)}
                    className="-mr-1 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-paper/70 transition hover:bg-paper/10 hover:text-paper"
                    aria-label="Dismiss"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {!reduce && (
                  <motion.div
                    className="h-0.5 origin-left bg-saffron"
                    initial={{ scaleX: 1 }}
                    animate={{ scaleX: 0 }}
                    transition={{ duration: 12, ease: 'linear' }}
                    aria-hidden
                  />
                )}
              </motion.div>
            ) : (
              <motion.div
                key={b.id}
                layout={!reduce}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: -24, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.98 }}
                transition={springSoft}
                className="pointer-events-auto w-full max-w-xl overflow-hidden rounded-2xl bg-[#0f5a3a] text-white shadow-lift ring-1 ring-mint/40"
                role="status"
              >
                <div className="flex items-start gap-3 p-3.5 sm:p-4">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mint text-white" aria-hidden>
                    <Bell className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-[15px] font-semibold leading-tight">
                      {b.order.source === 'pos' ? 'Counter order' : b.order.source === 'online' ? 'Online order' : 'New order'}{' '}
                      <span className="font-mono tnum">{orderCode(b.order.order_number)}</span>
                    </p>
                    <p className="mt-0.5 truncate text-sm text-white/85">{orderSummary(b.order)}</p>
                    <ul className="mt-1.5 line-clamp-2 text-xs text-white/70">
                      {b.order.items.map((it) => (
                        <li key={it.id} className="inline">
                          <span className="font-mono tnum">{it.quantity}×</span> {it.name}
                          {' · '}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {b.order.status === 'placed' && (
                      <button
                        type="button"
                        onClick={() => void accept(b.id)}
                        disabled={busy.has(b.id)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-[13px] font-semibold text-[#0f5a3a] transition hover:bg-mint-soft active:scale-[0.97] disabled:opacity-60"
                      >
                        <Check className="h-4 w-4" aria-hidden /> Accept
                      </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openKitchen(b.id)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/30 px-4 text-[13px] font-semibold text-white transition hover:bg-white/10"
                      >
                        <ChefHat className="h-4 w-4" aria-hidden /> Open kitchen board
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => dismissBanner(b.id)}
                    className="-mr-1 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
                    aria-label="Dismiss"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {!reduce && (
                  <motion.div
                    className="h-0.5 origin-left bg-mint"
                    initial={{ scaleX: 1 }}
                    animate={{ scaleX: 0 }}
                    transition={{ duration: 12, ease: 'linear' }}
                    aria-hidden
                  />
                )}
              </motion.div>
            ),
          )}
        </AnimatePresence>
      </div>

      {/* Assistance calls: persistent until attended */}
      <AnimatePresence>
        {calls.length > 0 && (
          <motion.aside
            key="calls-panel"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
            transition={springSoft}
            className="fixed bottom-20 right-3 z-[65] w-[calc(100%-1.5rem)] max-w-sm overflow-hidden rounded-2xl bg-[#7a3f00] text-white shadow-lift ring-1 ring-saffron/50 md:bottom-4 md:right-4 print:hidden"
            aria-label="Table assistance calls"
          >
            <button
              type="button"
              onClick={() => setCallsCollapsed((v) => !v)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left"
              aria-expanded={!callsCollapsed}
            >
              <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-saffron text-ink" aria-hidden>
                {!reduce && <span className="absolute inline-flex h-full w-full rounded-full bg-saffron/60 animate-pulse-ring" />}
                <BellRing className="relative h-4 w-4" />
              </span>
              <span className="flex-1 font-display text-[15px] font-semibold">
                Table assistance calls <span className="font-mono tnum">({calls.length})</span>
              </span>
              <span className="font-mono text-2xs uppercase tracking-[0.14em] text-white/70">{callsCollapsed ? 'Show' : 'Hide'}</span>
            </button>
            {!callsCollapsed && (
              <div className="border-t border-white/10">
                <ul className="max-h-64 overflow-y-auto">
                  {calls.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{tableDisplay(c.table)}</p>
                        <p className="truncate text-xs text-white/75">
                          {CALL_TYPE_LABEL[c.type]}
                          {c.note ? ` · ${c.note}` : ''} · {formatElapsed(minutesSince(c.created_at, now))}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void attend(c.id)}
                        disabled={busy.has(c.id)}
                        className="inline-flex h-8 items-center gap-1 rounded-full bg-white px-3 text-xs font-semibold text-[#7a3f00] transition hover:bg-saffron-soft disabled:opacity-60"
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden /> Attended
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between border-t border-white/10 px-4 py-2">
                  <span className="text-xs text-white/60">Calls stay here until someone attends.</span>
                  <button
                    type="button"
                    onClick={sound.test}
                    className={cn('text-xs font-semibold text-white/80 underline-offset-2 hover:underline', !sound.unlocked && 'opacity-50')}
                    title={sound.unlocked ? 'Play the chime' : 'Enable sound from the top bar first'}
                  >
                    Test chime
                  </button>
                </div>
              </div>
            )}
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
