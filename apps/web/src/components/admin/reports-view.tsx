'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Ban,
  Download,
  Gift,
  IndianRupee,
  MessageCircle,
  Receipt,
  RefreshCw,
  ShoppingBag,
  Star,
  Users,
  UtensilsCrossed,
} from 'lucide-react';
import type { AnalyticsReport } from '@restaurant-os/shared';
import { planHas } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { cn, formatINR } from '@/lib/utils';
import { Button, Card, CardBody, CardHeader, EmptyState, Input, Skeleton } from '@/components/ui';
import { fadeUp, stagger } from '@/lib/motion';
import { useAdmin } from './admin-provider';
import { Chip, ChipRow, PageHeader } from './page-header';
import { StatTile } from './stat-tile';
import { Stars } from './crm-ui';
import { downloadCsv } from './crm';
import { errorMessage, hourLabel } from './format';
import { UpgradeCard, isPlanError } from './plan';

// ---------------------------------------------------------------------------
// IST day boundaries (Asia/Kolkata is UTC+5:30 all year, no daylight saving)
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 330 * 60_000;

/** "YYYY-MM-DD" of the IST calendar day containing `ms`. */
function istKey(ms: number): string {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The instant IST midnight starts for a "YYYY-MM-DD" key. */
function istStartOfKey(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) - IST_OFFSET_MS;
}

/** IST midnight at or before `ms`. */
function istDayStart(ms: number): number {
  return istStartOfKey(istKey(ms));
}

/** "12 Oct" for a "YYYY-MM-DD" key (with the year when asked). */
function keyLabel(key: string, withYear = false): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: withYear ? 'numeric' : undefined,
    timeZone: 'UTC',
  });
}

type Preset = 'today' | '7d' | '30d' | '90d' | 'month' | 'custom';

const PRESETS: Array<{ id: Preset; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
  { id: 'month', label: 'This month' },
  { id: 'custom', label: 'Custom' },
];

interface Range {
  from: number;
  /** Exclusive: IST midnight after the last day. */
  to: number;
}

function rangeFor(preset: Preset, custom: { from: string; to: string }, now: number): Range | null {
  const today = istDayStart(now);
  const tomorrow = today + DAY_MS;
  switch (preset) {
    case 'today':
      return { from: today, to: tomorrow };
    case '7d':
      return { from: today - 6 * DAY_MS, to: tomorrow };
    case '30d':
      return { from: today - 29 * DAY_MS, to: tomorrow };
    case '90d':
      return { from: today - 89 * DAY_MS, to: tomorrow };
    case 'month':
      return { from: istStartOfKey(`${istKey(now).slice(0, 8)}01`), to: tomorrow };
    case 'custom': {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(custom.from) || !/^\d{4}-\d{2}-\d{2}$/.test(custom.to)) return null;
      const from = istStartOfKey(custom.from);
      const to = istStartOfKey(custom.to) + DAY_MS;
      if (from >= to || to - from > 400 * DAY_MS) return null;
      return { from, to };
    }
  }
}

function dayCount(r: Range): number {
  return Math.round((r.to - r.from) / DAY_MS);
}

/** Every IST day in the range, with zeros for days without orders. */
function fillDaily(report: AnalyticsReport, range: Range): Array<{ date: string; revenue: number; orders: number }> {
  const byDate = new Map(report.daily.map((d) => [String(d.date).slice(0, 10), d]));
  const out: Array<{ date: string; revenue: number; orders: number }> = [];
  for (let t = range.from; t < range.to; t += DAY_MS) {
    const key = istKey(t);
    const d = byDate.get(key);
    out.push({ date: key, revenue: Number(d?.revenue ?? 0), orders: Number(d?.orders ?? 0) });
  }
  return out;
}

/** ₹1.2L, ₹12k, ₹850 — for axis labels only. */
function compactINR(n: number): string {
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(n % 100_000 === 0 ? 0 : 1)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
  return `₹${Math.round(n)}`;
}

/** 1, 2, 2.5, 5 × 10ⁿ at or above n. */
function niceCeil(n: number): number {
  if (n <= 0) return 1000;
  const pow = 10 ** Math.floor(Math.log10(n));
  const f = n / pow;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nf * pow;
}

const REPORT_POINTS = [
  'Revenue, orders and average bill against the previous period',
  'Revenue by day and your busiest hours of the week',
  'Best sellers and slow movers, with revenue',
  'Payment split, service speed, returning customers and table ranking',
  'CSV downloads for your accountant',
];

export function ReportsView() {
  const { restaurant } = useAdmin();
  if (!planHas(restaurant.plan, 'advanced_analytics')) {
    return (
      <div className="mx-auto w-full max-w-[1400px]">
        <PageHeader title="Reports" description="How the restaurant is doing, day by day and hour by hour." />
        <UpgradeCard plan="premium" title="See what sells, when and to whom" description="Advanced reports are part of the Premium plan." points={REPORT_POINTS} />
      </div>
    );
  }
  return <ReportsInner />;
}

function ReportsInner() {
  const { token } = useAdmin();
  const reduce = useReducedMotion();
  const [preset, setPreset] = React.useState<Preset>('30d');
  const [custom, setCustom] = React.useState(() => {
    const now = Date.now();
    return { from: istKey(now - 6 * DAY_MS), to: istKey(now) };
  });
  // The day the page opened; refreshed on "Refresh" so "Today" moves past midnight.
  const [anchor, setAnchor] = React.useState(() => Date.now());
  const [report, setReport] = React.useState<AnalyticsReport | null>(null);
  const [loadedRange, setLoadedRange] = React.useState<Range | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [locked, setLocked] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const requestId = React.useRef(0);

  const range = React.useMemo(() => rangeFor(preset, custom, anchor), [preset, custom, anchor]);
  const todayKey = istKey(anchor);

  const load = React.useCallback(async () => {
    if (!range) return;
    const id = ++requestId.current;
    setLoading(true);
    try {
      const res = await adminApi.analytics(token, { from: new Date(range.from).toISOString(), to: new Date(range.to).toISOString() });
      if (id !== requestId.current) return;
      setReport(res);
      setLoadedRange(range);
      setError(null);
    } catch (e) {
      if (id !== requestId.current) return;
      if (isPlanError(e)) setLocked(e.message);
      else setError(errorMessage(e, 'Could not load the report.'));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [token, range]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const daily = React.useMemo(() => (report && loadedRange ? fillDaily(report, loadedRange) : []), [report, loadedRange]);

  if (locked) {
    return (
      <div className="mx-auto w-full max-w-[1400px]">
        <PageHeader title="Reports" />
        <UpgradeCard plan="premium" title="See what sells, when and to whom" description="Advanced reports are part of the Premium plan." message={locked} points={REPORT_POINTS} />
      </div>
    );
  }

  const t = report?.totals;
  const prev = report?.previous;
  const firstLoad = !report && !error;
  const days = loadedRange ? dayCount(loadedRange) : 0;
  const rangeText = loadedRange
    ? days === 1
      ? keyLabel(istKey(loadedRange.from), true)
      : `${keyLabel(istKey(loadedRange.from))} – ${keyLabel(istKey(loadedRange.to - DAY_MS), true)}`
    : '';
  const prevText = days === 1 ? 'vs the day before' : `vs the ${days} days before`;
  const empty = report !== null && t !== undefined && t.orders === 0 && t.cancelled === 0;

  const exportDaily = () => {
    downloadCsv(
      `revenue-by-day-${daily[0]?.date ?? ''}-to-${daily[daily.length - 1]?.date ?? ''}.csv`,
      ['Date (IST)', 'Orders', 'Revenue (INR)'],
      daily.map((d) => [d.date, d.orders, d.revenue.toFixed(2)]),
    );
  };
  const exportDishes = () => {
    if (!report) return;
    downloadCsv(
      `dishes-${daily[0]?.date ?? ''}-to-${daily[daily.length - 1]?.date ?? ''}.csv`,
      ['Dish', 'Quantity', 'Revenue (INR)'],
      report.dishes.map((d) => [d.name, d.quantity, Number(d.revenue).toFixed(2)]),
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader
        title="Reports"
        description={rangeText ? `${rangeText} · Indian Standard Time. Cancelled orders are left out of revenue.` : 'How the restaurant is doing, day by day and hour by hour.'}
        actions={
          <>
            <Button variant="outline" size="sm" leftIcon={<Download className="h-4 w-4" />} onClick={exportDaily} disabled={!report || empty}>
              Daily CSV
            </Button>
            <Button variant="outline" size="sm" leftIcon={<Download className="h-4 w-4" />} onClick={exportDishes} disabled={!report || empty}>
              Dishes CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              loading={loading && !!report}
              leftIcon={<RefreshCw className="h-4 w-4" />}
              onClick={() => {
                const now = Date.now();
                if (istKey(now) !== istKey(anchor)) setAnchor(now);
                else void load();
              }}
            >
              Refresh
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end">
        <ChipRow label="Date range" className="lg:flex-1">
          {PRESETS.map((p) => (
            <Chip key={p.id} active={preset === p.id} onClick={() => setPreset(p.id)}>
              {p.label}
            </Chip>
          ))}
        </ChipRow>
        {preset === 'custom' && (
          <div className="grid grid-cols-2 gap-2 sm:w-[340px]">
            <Input type="date" label="From" value={custom.from} max={custom.to || todayKey} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="h-10" />
            <Input type="date" label="To" value={custom.to} min={custom.from} max={todayKey} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="h-10" />
          </div>
        )}
      </div>
      {preset === 'custom' && !range && (
        <p className="mb-4 rounded-xl bg-saffron-soft px-4 py-3 text-sm text-[#8a5a00]">Pick a start date on or before the end date, at most 400 days apart.</p>
      )}

      {error && (
        <p className="mb-4 rounded-xl bg-rose-soft px-4 py-3 text-sm font-medium text-[#a1282c]" role="alert">
          {error}
        </p>
      )}

      <motion.div
        variants={stagger(0.05)}
        initial={reduce ? false : 'hidden'}
        animate="show"
        className={cn('grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-6 transition-opacity', loading && report && 'opacity-60')}
      >
        <motion.div variants={fadeUp} custom={0}>
          <StatTile
            label="Revenue"
            value={t?.revenue ?? 0}
            prefix="₹"
            loading={firstLoad}
            icon={<IndianRupee className="h-4 w-4" />}
            tone="ember"
            hint={t && prev ? <Delta current={t.revenue} previous={prev.revenue} label={prevText} /> : undefined}
          />
        </motion.div>
        <motion.div variants={fadeUp} custom={1}>
          <StatTile
            label="Orders"
            value={t?.orders ?? 0}
            loading={firstLoad}
            icon={<ShoppingBag className="h-4 w-4" />}
            hint={t && prev ? <Delta current={t.orders} previous={prev.orders} label={prevText} /> : undefined}
          />
        </motion.div>
        <motion.div variants={fadeUp} custom={2}>
          <StatTile
            label="Avg order value"
            value={t?.avg_order_value ?? 0}
            prefix="₹"
            loading={firstLoad}
            icon={<Receipt className="h-4 w-4" />}
            tone="sky"
            hint={t && prev ? <Delta current={t.avg_order_value} previous={prev.avg_order_value} label={prevText} /> : undefined}
          />
        </motion.div>
        <motion.div variants={fadeUp} custom={3}>
          <StatTile
            label="Items sold"
            value={t?.items_sold ?? 0}
            loading={firstLoad}
            icon={<UtensilsCrossed className="h-4 w-4" />}
            tone="saffron"
            hint={t && t.orders > 0 ? `${(t.items_sold / t.orders).toFixed(1)} per order` : undefined}
          />
        </motion.div>
        <motion.div variants={fadeUp} custom={4}>
          <StatTile
            label="Table visits"
            value={t?.visits ?? 0}
            loading={firstLoad}
            icon={<Users className="h-4 w-4" />}
            tone="mint"
            hint={t && t.visits > 0 ? `${formatINR(Math.round(t.revenue / t.visits))} per visit` : undefined}
          />
        </motion.div>
        <motion.div variants={fadeUp} custom={5}>
          <StatTile
            label="Cancelled"
            value={t?.cancelled ?? 0}
            loading={firstLoad}
            icon={<Ban className="h-4 w-4" />}
            hint={t && t.orders + t.cancelled > 0 ? `${((t.cancelled / (t.orders + t.cancelled)) * 100).toFixed(1)}% of orders placed` : undefined}
          />
        </motion.div>
      </motion.div>

      {firstLoad ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Skeleton className="h-72 w-full rounded-2xl" />
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      ) : empty ? (
        <EmptyState
          icon={<BarChart3 className="h-5 w-5" />}
          title="No orders in this range"
          description="Pick a longer range, or come back once guests have ordered. Reports count every order placed from your table QR codes."
          className="mt-4"
        />
      ) : report ? (
        <div className={cn('transition-opacity', loading && 'opacity-60')}>
          <div className="mt-4 grid gap-4">
            <Card>
              <CardHeader title="Revenue by day" description="Hover or tap a bar for that day. The dashed line is the daily average." />
              <CardBody className="pt-4">
                <RevenueChart points={daily} />
              </CardBody>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Card>
              <CardHeader title="Busiest times" description="Orders by weekday and hour (IST). Darker means busier." />
              <CardBody className="pt-4">
                <Heatmap data={report.heatmap} />
              </CardBody>
            </Card>
            <PaymentsCard report={report} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <DishesCard dishes={report.dishes} />
            <div className="grid gap-4">
              <ServiceCard report={report} />
              <CustomersCard report={report} />
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <TablesCard tables={report.tables} />
            <div className="grid gap-4">
              <RatingCard report={report} />
              <EngagementCard report={report} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/** "↑ 12% vs the 30 days before" (green up, rose down), or "—" when there is nothing to compare with. */
function Delta({ current, previous, label }: { current: number; previous: number; label: string }) {
  if (!previous) {
    return (
      <span>
        <span className="tnum font-mono">—</span> {label}
      </span>
    );
  }
  const pct = ((current - previous) / previous) * 100;
  const flat = Math.abs(pct) < 0.05;
  const up = pct > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const value = Math.abs(pct) >= 10 ? Math.abs(pct).toFixed(0) : Math.abs(pct).toFixed(1);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1">
      <span className={cn('tnum inline-flex items-center font-mono font-semibold', flat ? 'text-muted' : up ? 'text-[#1b6f49]' : 'text-rose')}>
        {!flat && <Icon className="h-3.5 w-3.5" aria-hidden />}
        <span className="sr-only">{flat ? 'No change,' : up ? 'Up' : 'Down'}</span>
        {flat ? '0' : value}%
      </span>
      <span>{label}</span>
    </span>
  );
}

function RevenueChart({ points }: { points: Array<{ date: string; revenue: number; orders: number }> }) {
  const reduce = useReducedMotion();
  const [hover, setHover] = React.useState<number | null>(null);
  const n = Math.max(1, points.length);
  const W = 760;
  const H = 240;
  const padL = 52;
  const padR = 8;
  const padT = 14;
  const padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const max = Math.max(0, ...points.map((p) => p.revenue));
  const niceMax = niceCeil(max);
  const slot = innerW / n;
  const barW = Math.max(1.5, Math.min(28, slot * 0.7));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * niceMax);
  const y = (v: number) => padT + innerH - (v / niceMax) * innerH;
  const total = points.reduce((s, p) => s + p.revenue, 0);
  const avg = points.length ? total / points.length : 0;
  const labelStep = Math.max(1, Math.ceil(n / 7));

  // Readout: the hovered day, else the latest day with revenue, else the last day.
  let fallback = points.length - 1;
  for (let i = points.length - 1; i >= 0; i--) {
    if ((points[i]?.revenue ?? 0) > 0) {
      fallback = i;
      break;
    }
  }
  const activeIndex = hover ?? fallback;
  const active = points[activeIndex];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm text-muted" aria-live="polite">
          {active ? (
            <>
              <span className="font-semibold text-fg">{keyLabel(active.date, true)}</span>
              {' · '}
              <span className="tnum font-mono font-semibold text-fg">{formatINR(active.revenue)}</span>
              {' · '}
              <span className="tnum font-mono">{active.orders}</span> order{active.orders === 1 ? '' : 's'}
            </>
          ) : (
            'No days in range'
          )}
        </p>
        <p className="text-xs text-muted">
          Average <span className="tnum font-mono font-semibold text-fg">{formatINR(Math.round(avg))}</span>/day
        </p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Revenue per day, ${points.length} days, total ${formatINR(total)}`} onMouseLeave={() => setHover(null)}>
        {ticks.map((tv) => (
          <g key={tv}>
            <line x1={padL} x2={W - padR} y1={y(tv)} y2={y(tv)} stroke="currentColor" strokeOpacity={tv === 0 ? 0.25 : 0.08} strokeDasharray={tv === 0 ? undefined : '2 4'} />
            <text x={padL - 6} y={y(tv) + 3.5} textAnchor="end" fontSize="10" fill="currentColor" fillOpacity={0.55} className="tnum font-mono">
              {compactINR(tv)}
            </text>
          </g>
        ))}
        {points.map((p, i) => {
          const x = padL + i * slot + (slot - barW) / 2;
          const h = (p.revenue / niceMax) * innerH;
          const isActive = hover === i;
          return (
            <g key={p.date} onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)}>
              <rect x={padL + i * slot} y={padT} width={slot} height={innerH} fill="transparent" />
              <motion.rect
                x={x}
                width={barW}
                rx={Math.min(3, barW / 2)}
                initial={reduce ? false : { y: y(0), height: 0 }}
                animate={{ y: y(p.revenue), height: Math.max(h, p.revenue > 0 ? 2 : 0) }}
                transition={{ duration: 0.7, delay: reduce ? 0 : Math.min(i * 0.012, 0.45), ease: [0.16, 1, 0.3, 1] }}
                fill={isActive ? '#FF5C2A' : 'currentColor'}
                fillOpacity={isActive ? 1 : hover === null && i === fallback ? 0.55 : 0.22}
              />
              {i % labelStep === 0 && (
                <text x={padL + i * slot + slot / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="currentColor" fillOpacity={0.55} className="font-mono">
                  {keyLabel(p.date)}
                </text>
              )}
              <title>{`${keyLabel(p.date, true)}: ${formatINR(p.revenue)}, ${p.orders} order${p.orders === 1 ? '' : 's'}`}</title>
            </g>
          );
        })}
        {avg > 0 && <line x1={padL} x2={W - padR} y1={y(avg)} y2={y(avg)} stroke="#FF5C2A" strokeOpacity={0.6} strokeDasharray="5 4" pointerEvents="none" />}
      </svg>
    </div>
  );
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function cellShade(level: number): string {
  // Ember at 10%–100% strength; zero stays the neutral sunk tone.
  return `rgba(255, 92, 42, ${(0.1 + 0.9 * level).toFixed(3)})`;
}

function Heatmap({ data }: { data: AnalyticsReport['heatmap'] }) {
  const counts = new Map<string, number>();
  for (const c of data) counts.set(`${c.dow}-${c.hour}`, Number(c.orders));
  const hoursWithOrders = data.filter((c) => Number(c.orders) > 0).map((c) => c.hour);
  const lo = Math.min(8, ...hoursWithOrders);
  const hi = Math.max(23, ...hoursWithOrders);
  const hours = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const max = Math.max(1, ...data.map((c) => Number(c.orders)));

  let peak: { dow: number; hour: number; orders: number } | null = null;
  for (const c of data) if (!peak || Number(c.orders) > peak.orders) peak = { dow: c.dow, hour: c.hour, orders: Number(c.orders) };

  return (
    <div>
      {peak && peak.orders > 0 && (
        <p className="mb-3 text-sm text-muted">
          Busiest: <span className="font-semibold text-fg">{WEEKDAYS_LONG[peak.dow - 1]}s, {hourLabel(peak.hour)}–{hourLabel((peak.hour + 1) % 24)}</span> with{' '}
          <span className="tnum font-mono font-semibold text-fg">{peak.orders}</span> order{peak.orders === 1 ? '' : 's'}
        </p>
      )}
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <table className="w-full min-w-[520px] border-separate" style={{ borderSpacing: 3 }}>
          <caption className="sr-only">Orders by day of the week (rows) and hour of the day in IST (columns)</caption>
          <thead>
            <tr>
              <th scope="col" className="w-9">
                <span className="sr-only">Day</span>
              </th>
              {hours.map((h) => (
                <th key={h} scope="col" className="px-0 pb-1 text-center font-mono text-[10px] font-normal text-muted">
                  <span className={cn(h % 2 === 1 && 'max-sm:invisible')}>{hourLabel(h)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {WEEKDAYS.map((day, di) => (
              <tr key={day}>
                <th scope="row" className="pr-1 text-left font-mono text-2xs font-medium text-muted">
                  {day}
                </th>
                {hours.map((h) => {
                  const n = counts.get(`${di + 1}-${h}`) ?? 0;
                  return (
                    <td
                      key={h}
                      className={cn('h-7 min-w-[18px] rounded-[5px] p-0', n === 0 && 'bg-sunk')}
                      style={n > 0 ? { background: cellShade(n / max) } : undefined}
                      title={`${WEEKDAYS_LONG[di]} ${hourLabel(h)}: ${n} order${n === 1 ? '' : 's'}`}
                    >
                      <span className="sr-only">{n}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2 text-xs text-muted" aria-hidden>
        <span>Fewer</span>
        <span className="h-3 w-4 rounded-[3px] bg-sunk" />
        {[0.25, 0.5, 0.75, 1].map((l) => (
          <span key={l} className="h-3 w-4 rounded-[3px]" style={{ background: cellShade(l) }} />
        ))}
        <span>
          More (<span className="tnum font-mono">{max}</span> max)
        </span>
      </div>
    </div>
  );
}

function ProportionBar({ value, max, className }: { value: number; max: number; className?: string }) {
  const reduce = useReducedMotion();
  const pct = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-sunk" aria-hidden>
      <motion.div
        className={cn('h-full rounded-full bg-ember', className)}
        initial={reduce ? false : { width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      />
    </div>
  );
}

function DishesCard({ dishes }: { dishes: AnalyticsReport['dishes'] }) {
  const top = dishes.slice(0, 10);
  const maxQty = Math.max(1, ...top.map((d) => d.quantity));
  const slow = dishes.length > 5 ? [...dishes].filter((d) => d.quantity > 0).sort((a, b) => a.quantity - b.quantity || a.revenue - b.revenue).slice(0, 5) : [];
  return (
    <Card>
      <CardHeader title="Dishes" description="Top 10 by quantity sold, with revenue." />
      <CardBody className="pt-4">
        {top.length === 0 ? (
          <p className="text-sm text-muted">No dishes sold in this range.</p>
        ) : (
          <ol className="space-y-3">
            {top.map((d, i) => (
              <li key={d.name}>
                <div className="flex items-baseline gap-3">
                  <span className="tnum w-5 shrink-0 font-mono text-xs text-muted">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{d.name}</span>
                  <span className="tnum shrink-0 font-mono text-sm font-semibold">×{d.quantity}</span>
                  <span className="tnum w-20 shrink-0 text-right font-mono text-xs text-muted">{formatINR(d.revenue)}</span>
                </div>
                <div className="mt-1.5 pl-8">
                  <ProportionBar value={d.quantity} max={maxQty} />
                </div>
              </li>
            ))}
          </ol>
        )}

        <h4 className="eyebrow mb-2 mt-6">Slow movers</h4>
        {slow.length === 0 ? (
          <p className="text-sm text-muted">Shown once more than five dishes have sold in the range.</p>
        ) : (
          <>
            <ul className="divide-y divide-line/5 rounded-xl border border-line/10">
              {slow.map((d) => (
                <li key={d.name} className="flex items-baseline gap-3 px-3.5 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm">{d.name}</span>
                  <span className="tnum shrink-0 font-mono text-sm">×{d.quantity}</span>
                  <span className="tnum w-20 shrink-0 text-right font-mono text-xs text-muted">{formatINR(d.revenue)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">The five dishes that sold least (but at least once). Worth a better photo, a badge, or a menu rethink.</p>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function PaymentsCard({ report }: { report: AnalyticsReport }) {
  const reduce = useReducedMotion();
  const { upi, counter, unpaid } = report.payments;
  const total = upi + counter;
  const upiPct = total > 0 ? (upi / total) * 100 : 0;
  return (
    <Card>
      <CardHeader title="Payments" description="How guests chose to pay, by order value." />
      <CardBody className="pt-4">
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-sunk" role="img" aria-label={`UPI ${upiPct.toFixed(0)} percent, counter ${(100 - upiPct).toFixed(0)} percent`}>
          {total > 0 && (
            <>
              <motion.div className="h-full bg-ember" initial={reduce ? false : { width: 0 }} animate={{ width: `${upiPct}%` }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }} />
              <div className="h-full flex-1 bg-ink/70" />
            </>
          )}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-sunk px-3.5 py-2.5">
            <dt className="flex items-center gap-1.5 font-mono text-2xs uppercase tracking-[0.14em] text-muted">
              <span className="h-2 w-2 rounded-full bg-ember" aria-hidden /> UPI
            </dt>
            <dd className="tnum mt-1 font-mono text-base font-semibold">{formatINR(upi)}</dd>
            <dd className="tnum font-mono text-xs text-muted">{total > 0 ? `${upiPct.toFixed(0)}%` : '—'}</dd>
          </div>
          <div className="rounded-xl bg-sunk px-3.5 py-2.5">
            <dt className="flex items-center gap-1.5 font-mono text-2xs uppercase tracking-[0.14em] text-muted">
              <span className="h-2 w-2 rounded-full bg-ink/70" aria-hidden /> Counter
            </dt>
            <dd className="tnum mt-1 font-mono text-base font-semibold">{formatINR(counter)}</dd>
            <dd className="tnum font-mono text-xs text-muted">{total > 0 ? `${(100 - upiPct).toFixed(0)}%` : '—'}</dd>
          </div>
        </dl>
        <div className={cn('mt-3 flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm', unpaid > 0 ? 'bg-saffron-soft text-[#8a5a00]' : 'bg-mint-soft text-[#1b6f49]')}>
          <span className="font-medium">Still unpaid</span>
          <span className="tnum font-mono font-semibold">{formatINR(unpaid)}</span>
        </div>
        <p className="mt-2 text-xs text-muted">Unpaid counts orders still marked unpaid or “guest says paid”. Settle them in Billing.</p>
      </CardBody>
    </Card>
  );
}

function minutes(v: number | null): string {
  return v === null || v === undefined ? '—' : `${Number(v).toFixed(1)} min`;
}

function ServiceCard({ report }: { report: AnalyticsReport }) {
  const s = report.service;
  const rows: Array<{ label: string; value: number | null }> = [
    { label: 'Placed → accepted', value: s.avg_accept_minutes },
    { label: 'Placed → ready', value: s.avg_ready_minutes },
    { label: 'Placed → served', value: s.avg_serve_minutes },
  ];
  return (
    <Card>
      <CardHeader title="Service speed" description="Average minutes from the guest placing the order." />
      <CardBody className="pt-4">
        <dl className="grid grid-cols-3 gap-2">
          {rows.map((r) => (
            <div key={r.label} className="rounded-xl bg-sunk px-3 py-2.5">
              <dt className="text-xs text-muted">{r.label}</dt>
              <dd className="tnum mt-1 font-mono text-base font-semibold">{minutes(r.value)}</dd>
            </div>
          ))}
        </dl>
      </CardBody>
    </Card>
  );
}

function CustomersCard({ report }: { report: AnalyticsReport }) {
  const c = report.customers;
  return (
    <Card>
      <CardHeader title="Customers" description="Guests who left their phone number at checkout." />
      <CardBody className="pt-4">
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniStat label="Identified" value={String(c.identified)} />
          <MiniStat label="New" value={String(c.new)} />
          <MiniStat label="Returning" value={String(c.returning)} />
          <MiniStat label="Orders with a customer" value={`${Number(c.identified_share).toFixed(1)}%`} />
        </dl>
        <p className="mt-2 text-xs text-muted">New = first order ever was in this range. Returning = ordered before it too.</p>
      </CardBody>
    </Card>
  );
}

function TablesCard({ tables }: { tables: AnalyticsReport['tables'] }) {
  const top = tables.slice(0, 12);
  const max = Math.max(1, ...top.map((t) => t.revenue));
  return (
    <Card>
      <CardHeader title="Tables by revenue" description={tables.length > top.length ? `Top ${top.length} of ${tables.length} tables.` : 'Every table that took an order.'} />
      <CardBody className="pt-4">
        {top.length === 0 ? (
          <p className="text-sm text-muted">No table orders in this range.</p>
        ) : (
          <ol className="space-y-3">
            {top.map((t, i) => (
              <li key={`${t.label}-${t.area ?? ''}-${i}`}>
                <div className="flex items-baseline gap-3">
                  <span className="tnum w-5 shrink-0 font-mono text-xs text-muted">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {t.label}
                    {t.area && <span className="font-normal text-muted"> · {t.area}</span>}
                  </span>
                  <span className="tnum shrink-0 font-mono text-xs text-muted">
                    {t.orders} order{t.orders === 1 ? '' : 's'}
                  </span>
                  <span className="tnum w-24 shrink-0 text-right font-mono text-sm font-semibold">{formatINR(t.revenue)}</span>
                </div>
                <div className="mt-1.5 pl-8">
                  <ProportionBar value={t.revenue} max={max} className="bg-ink/70" />
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}

function RatingCard({ report }: { report: AnalyticsReport }) {
  const r = report.ratings;
  return (
    <Card>
      <CardBody>
        <p className="flex items-center gap-1.5 font-mono text-2xs uppercase tracking-[0.16em] text-muted">
          <Star className="h-3.5 w-3.5" aria-hidden /> Average rating
        </p>
        <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
          <span className="tnum font-mono text-4xl font-semibold leading-none">{r.average !== null ? Number(r.average).toFixed(1) : '—'}</span>
          <div className="pb-0.5">
            <Stars value={r.average ?? 0} size={16} />
            <p className="text-xs text-muted">
              from <span className="tnum font-mono font-semibold text-fg">{r.count}</span> rating{r.count === 1 ? '' : 's'}
            </p>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function EngagementCard({ report }: { report: AnalyticsReport }) {
  return (
    <Card>
      <CardBody>
        <dl className="grid grid-cols-2 gap-2">
          <MiniStat label="Rewards earned" value={String(report.loyalty.earned)} icon={<Gift className="h-3.5 w-3.5" />} />
          <MiniStat label="Rewards redeemed" value={String(report.loyalty.redeemed)} icon={<Gift className="h-3.5 w-3.5" />} />
          <MiniStat label="WhatsApp sent" value={String(report.whatsapp.sent)} icon={<MessageCircle className="h-3.5 w-3.5" />} />
          <MiniStat
            label="WhatsApp failed"
            value={String(report.whatsapp.failed)}
            icon={<MessageCircle className="h-3.5 w-3.5" />}
            tone={report.whatsapp.failed > 0 ? 'rose' : undefined}
          />
        </dl>
      </CardBody>
    </Card>
  );
}

function MiniStat({ label, value, icon, tone }: { label: string; value: string; icon?: React.ReactNode; tone?: 'rose' }) {
  return (
    <div className="rounded-xl bg-sunk px-3.5 py-2.5">
      <dt className="flex items-center gap-1.5 text-xs text-muted">
        {icon && <span aria-hidden>{icon}</span>}
        {label}
      </dt>
      <dd className={cn('tnum mt-1 font-mono text-base font-semibold', tone === 'rose' && 'text-rose')}>{value}</dd>
    </div>
  );
}
