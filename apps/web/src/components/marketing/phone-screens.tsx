'use client';

import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { Bell, Check, ChevronLeft, ExternalLink, Minus, Plus, Search, ShoppingBag, Signal, Star, Wifi } from 'lucide-react';
import { OrderStatusBadge, VegMark } from '@/components/ui';
import { cn, formatINR, orderCode } from '@/lib/utils';
import { EASE_OUT, springBouncy } from '@/lib/motion';
import { usePhases } from './hooks';
import { SoundWave } from './micro/sound-wave';
import { MOCK_BOARD, MOCK_DISHES, MOCK_LINES, MOCK_ORDER_NUMBER, MOCK_RESTAURANT, MOCK_TAX_RATE, MOCK_TOTALS } from './mock-data';
import { site } from './site';

/* ----------------------------------------------------------------------------
   Shared bits
---------------------------------------------------------------------------- */
function StatusBar({ dark }: { dark?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between px-6 pt-3 text-[10px] font-semibold', dark ? 'text-paper' : 'text-ink')} aria-hidden>
      <span className="tnum">12:42</span>
      <span className="flex items-center gap-1">
        <Signal className="h-3 w-3" />
        <Wifi className="h-3 w-3" />
        <span className="ml-0.5 inline-block h-2.5 w-5 rounded-[3px] border border-current p-[1.5px]">
          <span className="block h-full w-4/5 rounded-[1px] bg-current" />
        </span>
      </span>
    </div>
  );
}

function Tap({ className }: { className?: string }) {
  return (
    <motion.span
      aria-hidden
      className={cn('pointer-events-none absolute h-9 w-9 rounded-full border-2 border-ember/70 bg-ember/20', className)}
      initial={{ scale: 0.3, opacity: 0 }}
      animate={{ scale: [0.3, 1.4, 1.1], opacity: [0, 0.9, 0] }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    />
  );
}

/* ----------------------------------------------------------------------------
   1. Scan
---------------------------------------------------------------------------- */
export function ScanScreen() {
  const reduce = useReducedMotion();
  return (
    <div className="flex h-full flex-col bg-ink-2 text-paper">
      <StatusBar dark />
      <div className="flex items-center justify-between px-5 pt-5">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Camera</span>
        <span className="rounded-full bg-paper/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em]">No app needed</span>
      </div>
      <div className="relative mx-auto mt-10 h-[196px] w-[196px]">
        {/* viewfinder corners */}
        {(['top-0 left-0 border-t-2 border-l-2 rounded-tl-xl', 'top-0 right-0 border-t-2 border-r-2 rounded-tr-xl', 'bottom-0 left-0 border-b-2 border-l-2 rounded-bl-xl', 'bottom-0 right-0 border-b-2 border-r-2 rounded-br-xl'] as const).map(
          (c) => (
            <span key={c} className={cn('absolute h-7 w-7 border-ember', c)} aria-hidden />
          ),
        )}
        <div className="absolute inset-5 flex flex-col items-center justify-center rounded-xl bg-white p-3 text-ink">
          <QRCodeSVG value={site.demoTableUrl} size={104} bgColor="#ffffff" fgColor="#0C0D10" level="L" />
          <span className="mt-2 font-mono text-[9px] uppercase tracking-[0.16em]">{MOCK_RESTAURANT.table}</span>
        </div>
        <motion.span
          aria-hidden
          className="absolute left-3 right-3 top-2 h-[2px] rounded-full bg-ember shadow-[0_0_18px_2px_rgba(255,92,42,0.75)]"
          animate={reduce ? undefined : { y: [0, 176, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
      <div className="mt-auto px-6 pb-8 text-center">
        <p className="font-display text-base font-semibold">Point at the table QR</p>
        <p className="mt-1 text-xs text-muted">The menu opens in your browser.</p>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   2. Menu with an ADD tap
---------------------------------------------------------------------------- */
export function MenuScreen() {
  const phase = usePhases([700, 1350]);
  const tapped = MOCK_DISHES[1];
  return (
    <div className="relative flex h-full flex-col bg-paper text-ink">
      <StatusBar />
      <div className="px-5 pt-4">
        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ember">
          {MOCK_RESTAURANT.table} · {MOCK_RESTAURANT.area}
        </p>
        <h3 className="mt-1 font-display text-lg font-bold leading-tight">{MOCK_RESTAURANT.name}</h3>
      </div>
      <div className="mx-5 mt-3 flex h-8 items-center gap-2 rounded-full bg-paper-2 px-3 text-[11px] text-muted">
        <Search className="h-3.5 w-3.5" /> Search 37 dishes
      </div>
      <div className="no-scrollbar mt-3 flex gap-1.5 overflow-hidden px-5" aria-hidden>
        {['Starters', 'Mains', 'Breads', 'Drinks', 'Desserts'].map((c, i) => (
          <span
            key={c}
            className={cn('shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold', i === 0 ? 'bg-ink text-paper' : 'bg-white text-ink/70')}
          >
            {c}
          </span>
        ))}
      </div>
      <ul className="mt-2">
        {MOCK_DISHES.map((d) => {
          const isTapped = d.name === tapped.name;
          return (
            <li key={d.name} className="flex items-center gap-3 border-b border-ink/5 px-5 py-3">
              <VegMark isVeg={d.veg} size={12} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-semibold leading-tight">{d.name}</p>
                <p className="truncate text-[10px] text-muted">{d.note}</p>
                <p className="tnum mt-0.5 text-[11px] font-semibold">{formatINR(d.price)}</p>
              </div>
              <div className="relative">
                <AnimatePresence initial={false} mode="popLayout">
                  {isTapped && phase >= 1 ? (
                    <motion.span
                      key="stepper"
                      className="flex h-7 items-center gap-2 rounded-full bg-ember px-2 text-[11px] font-bold text-white"
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={springBouncy}
                    >
                      <Minus className="h-3 w-3" /> 1 <Plus className="h-3 w-3" />
                    </motion.span>
                  ) : (
                    <motion.span
                      key="add"
                      className="flex h-7 items-center rounded-full border border-ember px-3 text-[10px] font-bold uppercase tracking-wider text-ember"
                      exit={{ scale: 0.6, opacity: 0 }}
                    >
                      Add
                    </motion.span>
                  )}
                </AnimatePresence>
                {isTapped && phase >= 1 && <Tap className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />}
              </div>
            </li>
          );
        })}
      </ul>
      <AnimatePresence>
        {phase >= 2 && (
          <motion.div
            key="cart"
            className="absolute inset-x-4 bottom-5 flex items-center justify-between rounded-2xl bg-ink px-4 py-3 text-paper shadow-lift"
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ duration: 0.5, ease: EASE_OUT }}
          >
            <span className="flex items-center gap-2 text-[11px]">
              <ShoppingBag className="h-4 w-4 text-ember" />
              <span>
                1 item · <span className="tnum font-semibold">{formatINR(tapped.price)}</span>
              </span>
            </span>
            <span className="text-[11px] font-bold">View cart →</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   3. Order placed
---------------------------------------------------------------------------- */
export function PlacedScreen() {
  const reduce = useReducedMotion();
  return (
    <div className="flex h-full flex-col bg-paper text-ink">
      <StatusBar />
      <div className="flex items-center gap-2 px-5 pt-4 text-[11px] text-muted">
        <ChevronLeft className="h-4 w-4" /> Menu
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="relative">
          {!reduce && <span className="absolute inset-0 rounded-full bg-mint/40 animate-pulse-ring" aria-hidden />}
          <motion.div
            className="relative flex h-20 w-20 items-center justify-center rounded-full bg-mint text-white shadow-[0_12px_32px_-8px_rgba(47,184,122,0.7)]"
            initial={reduce ? false : { scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ ...springBouncy, delay: 0.15 }}
          >
            <Check className="h-9 w-9" strokeWidth={3} />
          </motion.div>
        </div>
        <motion.h3
          className="mt-6 font-display text-2xl font-bold leading-none"
          initial={reduce ? false : { y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.5, ease: EASE_OUT }}
        >
          Order placed
        </motion.h3>
        <motion.p
          className="tnum mt-2 font-mono text-[11px] text-muted"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          {orderCode(MOCK_ORDER_NUMBER)} · {MOCK_RESTAURANT.table}
        </motion.p>
        <motion.div
          className="mt-5 flex flex-col items-center gap-2"
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <OrderStatusBadge status="placed" />
          <p className="text-[11px] text-muted">Sent to the kitchen. About 15 min.</p>
        </motion.div>
      </div>
      <div className="px-5 pb-6">
        <div className="flex h-11 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-paper">Track my order</div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   4. Kitchen / counter board with the "new order" toast
---------------------------------------------------------------------------- */
export function KitchenScreen() {
  const phase = usePhases([350, 950]);
  const reduce = useReducedMotion();
  return (
    <div className="relative flex h-full flex-col bg-ink text-paper">
      <StatusBar dark />
      <div className="flex items-center justify-between px-5 pt-4">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted">Counter board</p>
          <h3 className="mt-0.5 font-display text-[15px] font-bold leading-tight">{MOCK_RESTAURANT.name}</h3>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-paper/10 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em]">
          <span className="relative flex h-1.5 w-1.5">
            {!reduce && <span className="absolute inline-flex h-full w-full rounded-full bg-mint animate-pulse-ring" />}
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-mint" />
          </span>
          Live
        </span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 px-5" aria-hidden>
        {[
          { k: 'Active', v: phase >= 2 ? '3' : '2' },
          { k: 'Ready', v: '1' },
          { k: 'Calls', v: '1' },
        ].map((s) => (
          <div key={s.k} className="rounded-xl bg-paper/[0.06] px-2.5 py-2">
            <p className="font-mono text-[8px] uppercase tracking-[0.14em] text-muted">{s.k}</p>
            <p className="tnum font-display text-lg font-bold leading-none">{s.v}</p>
          </div>
        ))}
      </div>
      <ul className="mt-4 space-y-2 px-5">
        <AnimatePresence initial={false}>
          {phase >= 2 && (
            <motion.li
              key="new"
              layout
              className="rounded-xl border border-ember/50 bg-ember/10 p-3"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -14, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.45, ease: EASE_OUT }}
            >
              <div className="flex items-center justify-between">
                <span className="tnum font-mono text-[10px]">{orderCode(MOCK_ORDER_NUMBER)}</span>
                <OrderStatusBadge status="placed" />
              </div>
              <p className="mt-1 text-[11px] font-semibold">
                {MOCK_RESTAURANT.table} · <span className="tnum">{formatINR(MOCK_TOTALS.total)}</span>
              </p>
              <p className="truncate text-[10px] text-muted">{MOCK_LINES.map((l) => `${l.name} ×${l.qty}`).join(' · ')}</p>
            </motion.li>
          )}
          {MOCK_BOARD.map((o) => (
            <motion.li key={o.number} layout className="rounded-xl bg-paper/[0.06] p-3">
              <div className="flex items-center justify-between">
                <span className="tnum font-mono text-[10px]">{orderCode(o.number)}</span>
                <OrderStatusBadge status={o.status} />
              </div>
              <p className="mt-1 text-[11px] font-semibold">
                {o.table} · <span className="tnum">{formatINR(o.total)}</span> · <span className="font-normal text-muted">{o.minutes} min</span>
              </p>
              <p className="truncate text-[10px] text-muted">{o.summary}</p>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      <AnimatePresence>
        {phase >= 1 && (
          <motion.div
            key="toast"
            role="status"
            className="absolute inset-x-3 top-12 z-10 flex items-center gap-3 rounded-2xl border border-paper/10 bg-ink-3 p-3 shadow-lift"
            initial={reduce ? { opacity: 0 } : { y: -40, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ duration: 0.5, ease: EASE_OUT }}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ember text-white">
              <SoundWave bars={4} height={14} />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold leading-tight">New order</p>
              <p className="tnum truncate text-[10.5px] text-muted">
                {orderCode(MOCK_ORDER_NUMBER)} · {MOCK_RESTAURANT.table} · {formatINR(MOCK_TOTALS.total)}
              </p>
            </div>
            <Bell className="ml-auto h-4 w-4 shrink-0 text-saffron" aria-hidden />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   5. Bill + UPI
---------------------------------------------------------------------------- */
export function PayScreen() {
  const reduce = useReducedMotion();
  const half = MOCK_TAX_RATE / 2;
  const rows = [
    ...MOCK_LINES.map((l) => ({ k: `${l.name} ×${l.qty}`, v: formatINR(l.total), strong: false })),
    { k: 'Subtotal', v: formatINR(MOCK_TOTALS.subtotal), strong: false },
    { k: `CGST ${half}%`, v: formatINR(MOCK_TOTALS.cgst), strong: false },
    { k: `SGST ${half}%`, v: formatINR(MOCK_TOTALS.sgst), strong: false },
  ];
  return (
    <div className="flex h-full flex-col bg-paper text-ink">
      <StatusBar />
      <div className="px-5 pt-4">
        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ember">Your bill</p>
        <h3 className="mt-1 font-display text-lg font-bold leading-tight">
          {MOCK_RESTAURANT.table} · {orderCode(MOCK_ORDER_NUMBER)}
        </h3>
      </div>
      <ul className="mx-5 mt-4 rounded-2xl bg-white p-4 text-[11px]">
        {rows.map((r, i) => (
          <motion.li
            key={r.k}
            className={cn('flex items-center justify-between py-1', i === MOCK_LINES.length && 'mt-1 border-t border-ink/10 pt-2')}
            initial={reduce ? false : { opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 + i * 0.07, duration: 0.4, ease: EASE_OUT }}
          >
            <span className={cn(i >= MOCK_LINES.length && 'text-muted')}>{r.k}</span>
            <span className="tnum font-medium">{r.v}</span>
          </motion.li>
        ))}
        <motion.li
          className="mt-2 flex items-center justify-between border-t border-ink/10 pt-2 font-display text-base font-bold"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 + rows.length * 0.07 }}
        >
          <span>Total</span>
          <span className="tnum">{formatINR(MOCK_TOTALS.total)}</span>
        </motion.li>
      </ul>
      <div className="mt-auto px-5 pb-6">
        <motion.div
          className="flex h-11 items-center justify-center gap-2 rounded-full bg-ember text-[12px] font-bold text-white shadow-glow"
          initial={reduce ? false : { y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.9, duration: 0.5, ease: EASE_OUT }}
        >
          Pay <span className="tnum">{formatINR(MOCK_TOTALS.total)}</span> by UPI
        </motion.div>
        <div className="mt-2.5 flex items-center justify-center gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-muted" aria-hidden>
          <span>GPay</span>·<span>PhonePe</span>·<span>Paytm</span>·<span>BHIM</span>
        </div>
        <p className="mt-2 text-center text-[10.5px] text-muted">or pay at the counter</p>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
   6. Feedback after the meal: stars, a comment, and the Google link for everyone
---------------------------------------------------------------------------- */
export function FeedbackScreen() {
  const phase = usePhases([350, 900, 1500]);
  const reduce = useReducedMotion();
  const rating = 4;
  return (
    <div className="relative flex h-full flex-col bg-paper text-ink">
      <StatusBar />
      <div className="px-5 pt-4">
        <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ember">
          {MOCK_RESTAURANT.table} · {orderCode(MOCK_ORDER_NUMBER)} · Served
        </p>
        <h3 className="mt-1 font-display text-lg font-bold leading-tight">How was your meal?</h3>
        <p className="mt-0.5 text-[10.5px] text-muted">Your feedback goes straight to {MOCK_RESTAURANT.name}.</p>
      </div>

      <div className="mx-5 mt-4 rounded-2xl bg-white p-4">
        <div className="relative flex items-center justify-between" aria-hidden>
          {Array.from({ length: 5 }, (_, i) => {
            const on = phase >= 1 && i < rating;
            return (
              <motion.span
                key={i}
                className="relative flex h-8 w-8 items-center justify-center"
                animate={on && !reduce ? { scale: [1, 1.25, 1] } : { scale: 1 }}
                transition={{ duration: 0.35, delay: on ? i * 0.07 : 0 }}
              >
                <Star className={cn('h-7 w-7 transition-colors duration-300', on ? 'fill-saffron text-saffron' : 'text-ink/15')} strokeWidth={1.6} />
                {i === rating - 1 && phase === 1 && <Tap className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />}
              </motion.span>
            );
          })}
        </div>
        <AnimatePresence>
          {phase >= 2 && (
            <motion.p
              key="comment"
              className="mt-3 rounded-xl bg-paper-2 px-3 py-2 text-[10.5px] leading-snug text-ink/80"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE_OUT }}
            >
              Loved the paneer tikka. Naan could have been warmer.
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {phase >= 3 && (
          <motion.div
            key="thanks"
            className="mx-5 mt-3 rounded-2xl border border-ink/10 bg-white p-4 text-center"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE_OUT }}
          >
            <p className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-mint">
              <Check className="h-3.5 w-3.5" strokeWidth={3} /> Thanks for telling us
            </p>
            <p className="mt-1 text-[10px] text-muted">Want to share it on Google too?</p>
            <span className="mt-2.5 flex h-9 items-center justify-center gap-1.5 rounded-full bg-ink text-[11px] font-semibold text-paper">
              Review us on Google <ExternalLink className="h-3 w-3" />
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="mt-auto px-6 pb-6 text-center font-mono text-[8.5px] uppercase tracking-[0.14em] text-muted">Same link for every rating</p>
    </div>
  );
}
