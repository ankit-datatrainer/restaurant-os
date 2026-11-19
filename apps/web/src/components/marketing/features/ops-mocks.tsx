'use client';

import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowRightLeft,
  CalendarClock,
  Clock,
  Download,
  Gift,
  KeyRound,
  Merge,
  PackageCheck,
  ShoppingBag,
  Tag,
  Timer,
  UserCheck,
  Users,
} from 'lucide-react';
import { cn, formatINR } from '@/lib/utils';
import { EASE_OUT } from '@/lib/motion';
import { useLoop, useOnScreen } from '../hooks';
import { MOCK_RESTAURANT } from '../mock-data';

/*
 * Animated product mock-ups for the operations modules (POS, billing, bookings, promotions,
 * inventory, accounts, team). Every number here is illustrative, not a real restaurant's data.
 * All of them are decorative (aria-hidden), pause off-screen and settle on a static frame under reduced motion.
 */

const CARD = 'rounded-[24px] border border-paper/10 bg-ink-2 p-5 shadow-lift';

function Illustrative() {
  return <span className="rounded-full bg-paper/10 px-2.5 py-1 font-mono text-2xs uppercase tracking-[0.14em] text-muted">Illustrative</span>;
}

function CardHead({ eyebrow, title, right }: { eyebrow: string; title: string; right?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="eyebrow">{eyebrow}</p>
        <p className="mt-1 truncate font-display text-lg font-bold leading-tight">{title}</p>
      </div>
      {right}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Floor view
--------------------------------------------------------------------------- */

type TableState = 'free' | 'ordering' | 'kitchen' | 'served' | 'bill' | 'reserved';

const TABLE_STYLE: Record<TableState, { label: string; cls: string; dot: string }> = {
  free: { label: 'Free', cls: 'border-paper/10 bg-paper/[0.03] text-muted', dot: 'bg-paper/30' },
  ordering: { label: 'Ordering', cls: 'border-sky/50 bg-sky/15 text-sky', dot: 'bg-sky' },
  kitchen: { label: 'In kitchen', cls: 'border-ember/60 bg-ember/15 text-ember', dot: 'bg-ember' },
  served: { label: 'Served', cls: 'border-mint/50 bg-mint/15 text-mint', dot: 'bg-mint' },
  bill: { label: 'Bill asked', cls: 'border-saffron/60 bg-saffron/15 text-saffron', dot: 'bg-saffron' },
  reserved: { label: 'Reserved', cls: 'border-dashed border-paper/30 bg-transparent text-fg/70', dot: 'border border-dashed border-paper/50' },
};

const NEXT_STATE: Record<TableState, TableState> = {
  free: 'ordering',
  ordering: 'kitchen',
  kitchen: 'served',
  served: 'bill',
  bill: 'free',
  reserved: 'reserved',
};

const INITIAL_TABLES: TableState[] = ['kitchen', 'free', 'served', 'ordering', 'reserved', 'bill', 'free', 'kitchen', 'served', 'free', 'ordering', 'reserved'];
const LEGEND: TableState[] = ['free', 'ordering', 'kitchen', 'served', 'bill', 'reserved'];

const POS_TICKETS = ['Takeaway · Masala Dosa ×2 → kitchen', 'Table 9 · Filter Coffee ×3 → kitchen', 'Takeaway · Veg Biryani ×1 → kitchen'];

/** Live floor: twelve tables changing state, plus a counter-POS ticket line. */
export function FloorMock({ className, compact }: { className?: string; compact?: boolean }) {
  const { ref, inView } = useOnScreen<HTMLDivElement>();
  const reduce = useReducedMotion();
  const tick = useLoop(10_000, 1500, inView && !reduce);
  const [tables, setTables] = React.useState<TableState[]>(INITIAL_TABLES);

  React.useEffect(() => {
    if (tick === 0) return;
    setTables((prev) => {
      const i = (tick * 5) % prev.length;
      return prev.map((t, j) => (j === i ? NEXT_STATE[t] : t));
    });
  }, [tick]);

  const pos = POS_TICKETS[Math.floor(tick / 3) % POS_TICKETS.length] ?? POS_TICKETS[0]!;

  return (
    <div ref={ref} className={cn('relative grid w-full max-w-md gap-4', className)} aria-hidden>
      <div className={CARD}>
        <CardHead eyebrow="Floor view" title={MOCK_RESTAURANT.name} right={<Illustrative />} />
        <ul className="grid grid-cols-4 gap-2">
          {tables.map((t, i) => {
            const s = TABLE_STYLE[t];
            return (
              <li
                key={i}
                className={cn(
                  'flex aspect-square flex-col items-center justify-center rounded-xl border text-center transition-colors duration-500',
                  s.cls,
                )}
              >
                <span className="font-display text-base font-bold leading-none text-fg">T{i + 1}</span>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={t}
                    className="mt-1 font-mono text-[8px] uppercase leading-none tracking-[0.08em] sm:text-[9px]"
                    initial={reduce ? false : { opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -3 }}
                    transition={{ duration: 0.25 }}
                  >
                    {s.label}
                  </motion.span>
                </AnimatePresence>
              </li>
            );
          })}
        </ul>
        {!compact && (
          <ul className="mt-4 flex flex-wrap gap-x-3 gap-y-1.5 border-t border-paper/10 pt-3">
            {LEGEND.map((k) => (
              <li key={k} className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                <span className={cn('h-2 w-2 rounded-full', TABLE_STYLE[k].dot)} />
                {TABLE_STYLE[k].label}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="ml-auto flex w-[92%] items-center gap-3 rounded-[20px] border border-paper/10 bg-ink-2 px-4 py-3 shadow-lift">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-ember text-white">
          <ShoppingBag className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Counter POS</p>
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={pos}
              className="truncate text-sm font-medium"
              initial={reduce ? false : { opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.3, ease: EASE_OUT }}
            >
              {pos}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>

      {!compact && (
        <div className="flex w-[86%] flex-wrap gap-2">
          <span className="flex items-center gap-1.5 rounded-full border border-paper/10 bg-ink-2 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-fg/80 shadow-lift">
            <ArrowRightLeft className="h-3 w-3 text-ember" /> Move T4 → T10
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-paper/10 bg-ink-2 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-fg/80 shadow-lift">
            <Merge className="h-3 w-3 text-ember" /> Merge T2 + T3
          </span>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Billing: one bill, split tender, customer display, cash close
--------------------------------------------------------------------------- */

const BILL = {
  subtotal: 1240,
  discount: 124, // 10%, approved by a manager
  cgst: 27.9,
  sgst: 27.9,
  tip: 50,
};
const BILL_TOTAL = BILL.subtotal - BILL.discount + BILL.cgst + BILL.sgst; // 1171.80
const DUE = BILL_TOTAL + BILL.tip; // 1221.80
const SPLITS = [
  { k: 'Cash', v: 500, cls: 'bg-mint' },
  { k: 'UPI', v: 621.8, cls: 'bg-ember' },
  { k: 'Card', v: 100, cls: 'bg-sky' },
];

/** Decorative QR-like pattern (not a real, scannable code). */
function PseudoQR({ size = 72 }: { size?: number }) {
  const n = 11;
  const cells = React.useMemo(() => {
    const out: boolean[] = [];
    let seed = 7;
    for (let i = 0; i < n * n; i++) {
      seed = (seed * 9301 + 49297) % 233280;
      out.push(seed / 233280 > 0.52);
    }
    return out;
  }, []);
  const finder = (x: number, y: number) => (x < 3 && y < 3) || (x > n - 4 && y < 3) || (x < 3 && y > n - 4);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${n} ${n}`} className="rounded-md bg-white p-1" shapeRendering="crispEdges">
      {cells.map((on, i) => {
        const x = i % n;
        const y = Math.floor(i / n);
        if (!finder(x, y) && !on) return null;
        return <rect key={i} x={x} y={y} width={1} height={1} fill="#0C0D10" />;
      })}
    </svg>
  );
}

export function BillingMock({ className }: { className?: string }) {
  const { ref, inView } = useOnScreen<HTMLDivElement>();
  const reduce = useReducedMotion();
  const step = useLoop(SPLITS.length + 2, 1300, inView && !reduce);
  const paidCount = reduce ? SPLITS.length : Math.min(step, SPLITS.length);
  const paid = SPLITS.slice(0, paidCount).reduce((s, x) => s + x.v, 0);
  const done = paidCount === SPLITS.length;

  const rows = [
    { k: 'Subtotal · Tables 2 + 3', v: formatINR(BILL.subtotal) },
    { k: 'Discount 10% · manager', v: `− ${formatINR(BILL.discount)}`, tone: 'text-mint' },
    { k: 'CGST 2.5%', v: formatINR(BILL.cgst) },
    { k: 'SGST 2.5%', v: formatINR(BILL.sgst) },
    { k: 'Tip', v: formatINR(BILL.tip) },
  ];

  return (
    <div ref={ref} className={cn('relative grid w-full max-w-md gap-4', className)} aria-hidden>
      <div className={CARD}>
        <CardHead eyebrow="Receipt No. 142 · GST" title="One bill, three ways to pay" right={<Illustrative />} />
        <ul className="font-mono text-[12px]">
          {rows.map((r) => (
            <li key={r.k} className="flex items-center justify-between py-1">
              <span className="text-muted">{r.k}</span>
              <span className={cn('tnum', r.tone)}>{r.v}</span>
            </li>
          ))}
          <li className="mt-1.5 flex items-center justify-between border-t border-paper/10 pt-2.5 font-display text-lg font-bold">
            <span>To pay</span>
            <span className="tnum">{formatINR(DUE)}</span>
          </li>
        </ul>

        <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-paper/10">
          {SPLITS.map((s, i) => (
            <motion.span
              key={s.k}
              className={cn('h-full origin-left', s.cls)}
              style={{ width: `${(s.v / DUE) * 100}%` }}
              initial={false}
              animate={{ scaleX: i < paidCount ? 1 : 0 }}
              transition={{ duration: reduce ? 0 : 0.6, ease: EASE_OUT }}
            />
          ))}
        </div>
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {SPLITS.map((s, i) => (
            <li key={s.k} className={cn('rounded-xl border px-2.5 py-2 transition-colors duration-300', i < paidCount ? 'border-paper/15 bg-paper/[0.05]' : 'border-paper/[0.06]')}>
              <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                <span className={cn('h-1.5 w-1.5 rounded-full', s.cls)} />
                {s.k}
              </p>
              <p className="tnum mt-0.5 text-sm font-semibold">{formatINR(s.v)}</p>
            </li>
          ))}
        </ul>
        <p className={cn('mt-3 font-mono text-[10px] uppercase tracking-[0.12em]', done ? 'text-mint' : 'text-muted')}>
          {done ? 'Paid in full · receipt numbered and saved' : `Received ${formatINR(paid)} of ${formatINR(DUE)}`}
        </p>
      </div>

      <div className="grid grid-cols-[auto_1fr] items-center gap-4 rounded-[20px] border border-paper/10 bg-ink-2 p-4 shadow-lift sm:w-[92%] sm:justify-self-end">
        <PseudoQR />
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Customer display</p>
          <p className="mt-1 font-display text-base font-bold leading-tight">Scan to pay {formatINR(621.8)}</p>
          <p className="mt-0.5 text-xs text-muted">UPI QR for the exact amount, facing the guest</p>
        </div>
      </div>

      <div className="w-[90%] rounded-[20px] border border-paper/10 bg-ink-2 px-4 py-3 shadow-lift">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Cash close · today</p>
        <div className="mt-1.5 grid grid-cols-3 gap-2 text-sm">
          <span>
            <span className="block text-2xs text-muted">Expected</span>
            <span className="tnum font-semibold">{formatINR(12450)}</span>
          </span>
          <span>
            <span className="block text-2xs text-muted">Counted</span>
            <span className="tnum font-semibold">{formatINR(12400)}</span>
          </span>
          <span>
            <span className="block text-2xs text-muted">Variance</span>
            <span className="tnum font-semibold text-rose">− {formatINR(50)}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Reservations, waitlist and online takeaway
--------------------------------------------------------------------------- */

const BOOKINGS = [
  { t: '7:30 pm', name: 'Mehta', n: 4, table: 'T5', online: true },
  { t: '8:00 pm', name: 'Rao', n: 2, table: 'T2', online: false },
  { t: '8:30 pm', name: 'D’Souza', n: 6, table: 'T7', online: true },
];
const WAITLIST = ['Sharma · 3 guests', 'Iyer · 2 guests', 'Khan · 5 guests', 'Bose · 4 guests'];

export function BookingsMock({ className }: { className?: string }) {
  const { ref, inView } = useOnScreen<HTMLDivElement>();
  const reduce = useReducedMotion();
  const tick = useLoop(WAITLIST.length, 2200, inView && !reduce);
  const queue = Array.from({ length: 3 }, (_, i) => WAITLIST[(tick + i) % WAITLIST.length] ?? WAITLIST[0]!);

  return (
    <div ref={ref} className={cn('relative grid w-full max-w-md gap-4', className)} aria-hidden>
      <div className={CARD}>
        <CardHead eyebrow="Reservations · tonight" title="Bookings" right={<Illustrative />} />
        <ul className="space-y-2">
          {BOOKINGS.map((b) => (
            <li key={b.name} className="flex items-center gap-3 rounded-2xl bg-paper/[0.05] px-3 py-2.5">
              <span className="tnum w-16 shrink-0 font-mono text-xs text-fg/85">{b.t}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {b.name} · {b.n}
              </span>
              {b.online && <span className="rounded-full bg-sky/15 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-sky">Online</span>}
              <span className="rounded-md border border-paper/15 px-1.5 py-0.5 font-mono text-[10px] text-muted">{b.table}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-saffron">
          <CalendarClock className="h-3 w-3" /> T5 at 7:30 pm is already booked · pick another table
        </p>
      </div>

      <div className="ml-auto w-[90%] rounded-[24px] border border-paper/10 bg-ink-2 p-4 shadow-lift">
        <div className="flex items-center justify-between">
          <p className="eyebrow">Walk-in waitlist</p>
          <span className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
            <Users className="h-3 w-3" /> {queue.length} waiting
          </span>
        </div>
        <ul className="mt-3 space-y-1.5">
          <AnimatePresence initial={false} mode="popLayout">
            {queue.map((q, i) => (
              <motion.li
                key={q}
                layout={!reduce}
                className={cn('flex items-center justify-between rounded-xl px-3 py-2 text-sm', i === 0 ? 'bg-mint/15 text-fg' : 'bg-paper/[0.04] text-fg/75')}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.35, ease: EASE_OUT }}
              >
                <span className="truncate">{q}</span>
                <span className={cn('font-mono text-[10px] uppercase tracking-[0.1em]', i === 0 ? 'text-mint' : 'text-muted')}>
                  {i === 0 ? 'Table ready' : `#${i + 1}`}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>

      <div className="flex w-[94%] items-center gap-3 rounded-[20px] border border-paper/10 bg-ink-2 px-4 py-3 shadow-lift">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-saffron text-ink">
          <ShoppingBag className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Online takeaway · your own page</p>
          <p className="truncate text-sm font-medium">Pickup at 1:15 pm · Paneer Wrap ×2, Cold Coffee ×1</p>
        </div>
        <Clock className="h-4 w-4 shrink-0 text-saffron" />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Promotions: coupons, happy hours, gift cards
--------------------------------------------------------------------------- */

export function PromotionsMock({ className }: { className?: string }) {
  const { ref, inView } = useOnScreen<HTMLDivElement>();
  const reduce = useReducedMotion();
  const loop = useLoop(3, 2000, inView && !reduce);
  const active = reduce ? -1 : loop;

  const cards = [
    {
      icon: <Tag className="h-4 w-4" />,
      eyebrow: 'Coupon',
      title: 'WELCOME10',
      body: '10% off, min. order ₹500, valid till 30 Nov',
      foot: 'Applied in the cart · − ₹62',
    },
    {
      icon: <Timer className="h-4 w-4" />,
      eyebrow: 'Happy hour',
      title: '4–7 pm · Beverages 20% off',
      body: 'Mon to Thu, applied automatically',
      foot: 'Live now on every phone',
    },
    {
      icon: <Gift className="h-4 w-4" />,
      eyebrow: 'Gift card',
      title: 'GC-7Q4M · ₹1,000',
      body: 'Used ₹360 on Receipt No. 139',
      foot: 'Balance ₹640',
    },
  ];

  return (
    <div ref={ref} className={cn('relative grid w-full max-w-md gap-3', className)} aria-hidden>
      {cards.map((c, i) => {
        const on = active === -1 || active === i;
        return (
          <motion.div
            key={c.eyebrow}
            className={cn(
              'rounded-[22px] border bg-ink-2 p-4 shadow-lift transition-colors duration-500',
              on ? 'border-ember/50' : 'border-paper/10',
              i === 1 && 'sm:ml-8',
              i === 2 && 'sm:ml-3',
            )}
            animate={{ scale: on && active !== -1 ? 1.02 : 1 }}
            transition={{ duration: 0.4, ease: EASE_OUT }}
          >
            <div className="flex items-start gap-3">
              <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors duration-500', on ? 'bg-ember text-white' : 'bg-ember/15 text-ember')}>
                {c.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{c.eyebrow}</p>
                <p className="mt-0.5 truncate font-display text-base font-bold leading-tight">{c.title}</p>
                <p className="mt-1 text-xs text-muted">{c.body}</p>
              </div>
            </div>
            <p className={cn('mt-3 border-t border-paper/10 pt-2.5 font-mono text-[10px] uppercase tracking-[0.12em]', on ? 'text-mint' : 'text-muted')}>{c.foot}</p>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Inventory and purchasing (Premium)
--------------------------------------------------------------------------- */

const STOCK = [
  { name: 'Paneer', unit: 'kg', max: 10, start: 3.4, use: 0.4, par: 2.5 },
  { name: 'Butter', unit: 'kg', max: 8, start: 5.2, use: 0.15 },
  { name: 'Basmati rice', unit: 'kg', max: 25, start: 18, use: 0.3 },
  { name: 'Milk', unit: 'L', max: 20, start: 9, use: 0.5 },
];

export function InventoryMock({ className }: { className?: string }) {
  const { ref, inView } = useOnScreen<HTMLDivElement>();
  const reduce = useReducedMotion();
  const loop = useLoop(5, 1500, inView && !reduce);
  const orders = reduce ? 3 : loop;

  return (
    <div ref={ref} className={cn('relative grid w-full max-w-md gap-4', className)} aria-hidden>
      <div className={CARD}>
        <CardHead eyebrow="Inventory · Premium" title="Stock on hand" right={<Illustrative />} />
        <ul className="space-y-3">
          {STOCK.map((s) => {
            const qty = Math.max(0, s.start - s.use * orders);
            const low = s.par !== undefined && qty <= s.par;
            return (
              <li key={s.name}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{s.name}</span>
                  <span className={cn('tnum font-mono text-xs', low ? 'text-rose' : 'text-muted')}>
                    {qty.toFixed(1)} {s.unit}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-paper/10">
                  <motion.span
                    className={cn('block h-full origin-left rounded-full', low ? 'bg-rose' : 'bg-paper/40')}
                    initial={false}
                    animate={{ width: `${(qty / s.max) * 100}%` }}
                    transition={{ duration: reduce ? 0 : 0.6, ease: EASE_OUT }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={orders}
            className="mt-4 border-t border-paper/10 pt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted"
            initial={reduce ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
          >
            {orders === 0 ? 'Deducts by recipe when the kitchen accepts' : `Order accepted · recipe deducted · ${orders} today`}
          </motion.p>
        </AnimatePresence>
      </div>

      <div className="ml-auto flex w-[92%] items-center gap-3 rounded-[20px] border border-rose/30 bg-ink-2 px-4 py-3 shadow-lift">
        <AlertTriangle className="h-4 w-4 shrink-0 text-rose" />
        <p className="min-w-0 flex-1 truncate text-sm">
          <span className="font-semibold">Low stock:</span> Paneer below 2.5 kg
        </p>
      </div>

      <div className="grid w-[96%] grid-cols-2 gap-3">
        <div className="rounded-[20px] border border-paper/10 bg-ink-2 px-4 py-3 shadow-lift">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Food cost</p>
          <p className="mt-1 text-sm font-medium">Paneer Tikka</p>
          <p className="tnum font-display text-xl font-bold text-ember">31%</p>
        </div>
        <div className="rounded-[20px] border border-paper/10 bg-ink-2 px-4 py-3 shadow-lift">
          <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
            <PackageCheck className="h-3 w-3 text-mint" /> PO-0012
          </p>
          <p className="mt-1 text-sm font-medium">2 of 3 lines received</p>
          <p className="text-xs text-muted">Avg. cost updated</p>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Accounts: expenses, budgets, P&L (Growth+)
--------------------------------------------------------------------------- */

const EXPENSES = [
  { k: 'Rent', spent: 85000, budget: 85000 },
  { k: 'Ingredients', spent: 142000, budget: 160000 },
  { k: 'Utilities', spent: 31500, budget: 28000 },
  { k: 'Maintenance', spent: 6200, budget: 15000 },
];

export function AccountsMock({ className }: { className?: string }) {
  const { ref, inView } = useOnScreen<HTMLDivElement>();
  const reduce = useReducedMotion();
  const show = inView || !!reduce;
  const sales = 612000;
  const spent = EXPENSES.reduce((s, e) => s + e.spent, 0);

  return (
    <div ref={ref} className={cn('relative grid w-full max-w-md gap-4', className)} aria-hidden>
      <div className={CARD}>
        <CardHead eyebrow="Expenses · this month" title="Against your budget" right={<Illustrative />} />
        <ul className="space-y-3">
          {EXPENSES.map((e, i) => {
            const pct = Math.min(1, e.spent / e.budget);
            const over = e.spent > e.budget;
            return (
              <li key={e.k}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-medium">{e.k}</span>
                  <span className={cn('tnum shrink-0 font-mono text-xs', over ? 'text-rose' : 'text-muted')}>
                    {formatINR(e.spent)} / {formatINR(e.budget)}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-paper/10">
                  <motion.span
                    className={cn('block h-full origin-left rounded-full', over ? 'bg-rose' : 'bg-mint')}
                    style={{ width: `${pct * 100}%` }}
                    initial={reduce ? false : { scaleX: 0 }}
                    animate={{ scaleX: show ? 1 : 0 }}
                    transition={{ duration: 0.7, delay: 0.08 * i, ease: EASE_OUT }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="ml-auto w-[90%] rounded-[24px] border border-paper/10 bg-ink-2 p-5 shadow-lift">
        <p className="eyebrow">Profit &amp; loss</p>
        <ul className="mt-3 font-mono text-[12px]">
          <li className="flex justify-between py-1">
            <span className="text-muted">Net sales</span>
            <span className="tnum">{formatINR(sales)}</span>
          </li>
          <li className="flex justify-between py-1">
            <span className="text-muted">Expenses</span>
            <span className="tnum">− {formatINR(spent)}</span>
          </li>
          <li className="mt-1.5 flex justify-between border-t border-paper/10 pt-2.5 font-display text-lg font-bold">
            <span>Profit</span>
            <span className="tnum text-mint">{formatINR(sales - spent)}</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Team and data: invites, attendance, activity log, export
--------------------------------------------------------------------------- */

const SHIFTS = [
  { name: 'Anita', role: 'Manager', state: 'In since 10:02' },
  { name: 'Ravi', role: 'Kitchen', state: 'In since 10:15' },
  { name: 'Imran', role: 'Waiter', state: 'Out at 16:00' },
];

const ACTIVITY = [
  'Refund ₹180 · Receipt No. 131 · “cold food” · Anita',
  'Discount 10% · Tables 2 + 3 · Anita',
  'Price change · Masala Chai ₹50 → ₹60 · Anita',
  'Stock adjusted · Paneer − 0.5 kg · Ravi',
  'Order #ORD-1039 cancelled · Imran',
];

export function TeamMock({ className }: { className?: string }) {
  const { ref, inView } = useOnScreen<HTMLDivElement>();
  const reduce = useReducedMotion();
  const tick = useLoop(ACTIVITY.length, 2000, inView && !reduce);
  const feed = Array.from({ length: 3 }, (_, i) => ACTIVITY[(tick + i) % ACTIVITY.length] ?? ACTIVITY[0]!);

  return (
    <div ref={ref} className={cn('relative grid w-full max-w-md gap-4', className)} aria-hidden>
      <div className={CARD}>
        <CardHead
          eyebrow="Team · today"
          title="Who’s on shift"
          right={
            <span className="flex items-center gap-1.5 rounded-full bg-ember/15 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ember">
              <KeyRound className="h-3 w-3" /> Invite code
            </span>
          }
        />
        <ul className="space-y-2">
          {SHIFTS.map((s) => {
            const on = s.state.startsWith('In');
            return (
              <li key={s.name} className="flex items-center gap-3 rounded-2xl bg-paper/[0.05] px-3 py-2.5">
                <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold', on ? 'bg-mint/20 text-mint' : 'bg-paper/10 text-muted')}>
                  {s.name[0]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{s.name}</span>
                  <span className="block font-mono text-[10px] uppercase tracking-[0.1em] text-muted">{s.role}</span>
                </span>
                <span className={cn('flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.1em]', on ? 'text-mint' : 'text-muted')}>
                  <UserCheck className="h-3 w-3" /> {s.state}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="ml-auto w-[92%] rounded-[24px] border border-paper/10 bg-ink-2 p-4 shadow-lift">
        <p className="eyebrow">Activity log</p>
        <ul className="mt-3 space-y-1.5">
          <AnimatePresence initial={false} mode="popLayout">
            {feed.map((a, i) => (
              <motion.li
                key={a}
                layout={!reduce}
                className={cn('truncate rounded-xl px-3 py-2 font-mono text-[11px]', i === 0 ? 'bg-ember/10 text-fg' : 'bg-paper/[0.04] text-fg/70')}
                initial={reduce ? false : { opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35, ease: EASE_OUT }}
              >
                {a}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>

      <div className="flex w-[88%] flex-wrap gap-2">
        {['JSON backup', 'Orders CSV'].map((x) => (
          <span key={x} className="flex items-center gap-1.5 rounded-full border border-paper/10 bg-ink-2 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-fg/80 shadow-lift">
            <Download className="h-3 w-3 text-ember" /> {x}
          </span>
        ))}
      </div>
    </div>
  );
}
