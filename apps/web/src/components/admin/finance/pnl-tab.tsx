'use client';

import * as React from 'react';
import { Download, Info, Landmark, ReceiptText, RotateCcw, ShoppingBag, Sparkles } from 'lucide-react';
import type { ExpenseCategory, PnlReport } from '@restaurant-os/shared';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABEL } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { cn, formatINR } from '@/lib/utils';
import { Button, Card, CardBody, CardHeader, Input, Skeleton } from '@/components/ui';
import { useAdmin } from '../admin-provider';
import { Chip, ChipRow } from '../page-header';
import { errorMessage } from '../format';
import { isManagerRole } from '../plan';
import { DAY_MS, addDays, addMonths, currentMonth, dayLabel, isDateKey, istStartOfKey, istToday, monthBounds, num } from './ist';
import { ErrorNote } from './ui';

type Preset = 'month' | 'last_month' | '30d' | 'custom';
const PRESETS: Array<{ id: Preset; label: string }> = [
  { id: 'month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: '30d', label: 'Last 30 days' },
  { id: 'custom', label: 'Custom' },
];

/** Inclusive IST day keys for a preset; null when a custom range is incomplete or invalid. */
function daysFor(preset: Preset, custom: { from: string; to: string }): { from: string; to: string } | null {
  const today = istToday();
  switch (preset) {
    case 'month':
      return { from: `${currentMonth()}-01`, to: today };
    case 'last_month':
      return monthBounds(addMonths(currentMonth(), -1));
    case '30d':
      return { from: addDays(today, -29), to: today };
    case 'custom':
      if (!isDateKey(custom.from) || !isDateKey(custom.to) || custom.from > custom.to) return null;
      return custom;
  }
}

export function PnlTab() {
  const { token, staff } = useAdmin();
  const [preset, setPreset] = React.useState<Preset>('month');
  const [custom, setCustom] = React.useState(() => ({ from: addDays(istToday(), -6), to: istToday() }));
  const [report, setReport] = React.useState<PnlReport | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const req = React.useRef(0);

  const days = daysFor(preset, custom);
  const range = React.useMemo(
    () => (days ? { from: new Date(istStartOfKey(days.from)).toISOString(), to: new Date(istStartOfKey(days.to) + DAY_MS).toISOString() } : null),
    [days?.from, days?.to],
  );

  React.useEffect(() => {
    if (!range) return;
    const id = ++req.current;
    setReport(null);
    setError(null);
    adminApi
      .pnl(token, range)
      .then((r) => {
        if (id === req.current) setReport(r);
      })
      .catch((e: unknown) => {
        if (id === req.current) setError(errorMessage(e, 'Could not build the profit & loss statement.'));
      });
  }, [token, range]);

  const expenseRows = report
    ? EXPENSE_CATEGORIES.map((c) => [c, num(report.expenses?.[c])] as [ExpenseCategory, number]).filter(([, v]) => v !== 0)
    : [];
  const byExpenses = report?.food_cost_basis === 'expenses';
  const net = num(report?.net_sales);
  const profit = num(report?.operating_profit);
  const margin = net > 0 ? (profit / net) * 100 : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <ChipRow label="Period" className="lg:flex-1">
          {PRESETS.map((p) => (
            <Chip key={p.id} active={preset === p.id} onClick={() => setPreset(p.id)}>
              {p.label}
            </Chip>
          ))}
        </ChipRow>
        {isManagerRole(staff.role) && range && (
          <Button href={adminApi.ordersCsvUrl(token, range)} external variant="outline" size="sm" leftIcon={<Download className="h-4 w-4" />} className="self-start">
            Download orders CSV
          </Button>
        )}
      </div>

      {preset === 'custom' && (
        <div className="grid max-w-md grid-cols-2 gap-3">
          <Input label="From" type="date" value={custom.from} max={istToday()} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="tnum font-mono" />
          <Input label="To" type="date" value={custom.to} max={istToday()} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="tnum font-mono" />
          {!days && <p className="col-span-2 text-xs text-rose">Pick a start date on or before the end date.</p>}
        </div>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader
            title="Profit & loss"
            description={days ? `${dayLabel(days.from, { weekday: false })} – ${dayLabel(days.to, { weekday: false })} · amounts exclude GST` : 'Pick a period'}
          />
          <CardBody className="pt-4">
            {!report && (error || !range) ? (
              <p className="py-6 text-center text-sm text-muted">{range ? 'The statement could not be built. Try another period or refresh the page.' : 'Pick a start and end date.'}</p>
            ) : !report ? (
              <div className="space-y-2.5">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-7 w-full" />
                ))}
                <Skeleton className="mt-4 h-16 w-full rounded-2xl" />
              </div>
            ) : (
              <dl className="text-[15px]">
                <Row label="Gross sales" value={num(report.gross_sales)} hint="Dish prices on orders that were not cancelled or refunded" />
                <Row label="Discounts" value={-num(report.discounts)} sign="−" />
                <Row label="Service charge" value={num(report.service_charge)} sign="+" />
                <Total label="Net sales" value={net} />

                {byExpenses ? (
                  <div className="my-2 flex items-start gap-2.5 rounded-xl bg-sky-soft px-3.5 py-2.5 text-[13px] text-[#245a9f]">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <p>
                      Ingredient purchases are logged as expenses, so food cost (from recipes) and waste aren’t subtracted twice.
                      {num(report.food_cost) > 0 && (
                        <>
                          {' '}
                          For reference, recipes put food cost at <span className="tnum font-mono font-semibold">{formatINR(num(report.food_cost))}</span>
                          {num(report.waste_cost) > 0 && (
                            <>
                              {' '}
                              and waste at <span className="tnum font-mono font-semibold">{formatINR(num(report.waste_cost))}</span>
                            </>
                          )}
                          .
                        </>
                      )}
                    </p>
                  </div>
                ) : (
                  <>
                    <Row
                      label="Food cost"
                      value={-num(report.food_cost)}
                      sign="−"
                      hint={num(report.food_cost) > 0 ? 'Ingredient cost of what was sold, from recipes' : 'Add recipes on the Inventory page to see this'}
                    />
                    <Row label="Waste" value={-num(report.waste_cost)} sign="−" />
                  </>
                )}

                {expenseRows.length === 0 ? (
                  <Row label="Expenses" value={0} sign="−" hint="No expenses logged in this period" />
                ) : (
                  expenseRows.map(([c, v]) => <Row key={c} label={EXPENSE_CATEGORY_LABEL[c]} value={-v} sign="−" />)
                )}

                <div className={cn('mt-4 rounded-2xl px-4 py-4', profit >= 0 ? 'bg-mint-soft' : 'bg-rose-soft')}>
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <dt className={cn('text-sm font-semibold', profit >= 0 ? 'text-[#1b6f49]' : 'text-[#a1282c]')}>{profit >= 0 ? 'Operating profit' : 'Operating loss'}</dt>
                      {margin !== null && (
                        <p className={cn('tnum mt-0.5 font-mono text-xs', profit >= 0 ? 'text-[#1b6f49]' : 'text-[#a1282c]')}>
                          {margin.toFixed(1)}% of net sales
                        </p>
                      )}
                    </div>
                    <dd className={cn('tnum font-mono text-[32px] font-semibold leading-none tracking-tight md:text-[40px]', profit >= 0 ? 'text-[#1b6f49]' : 'text-[#a1282c]')}>
                      {profit < 0 ? '−' : ''}
                      {formatINR(Math.abs(profit))}
                    </dd>
                  </div>
                </div>
              </dl>
            )}
          </CardBody>
        </Card>

        <div className="space-y-3 self-start">
          <Fact
            icon={<Landmark className="h-4 w-4" />}
            label="GST collected"
            value={report ? num(report.tax_collected) : null}
            failed={!report && Boolean(error)}
            hint="Not income: it’s owed to the government, so it’s left out of profit."
          />
          <Fact icon={<Sparkles className="h-4 w-4" />} label="Tips" value={report ? num(report.tips) : null} failed={!report && Boolean(error)} hint="Recorded on settled bills. Usually passed on to staff." />
          <Fact icon={<RotateCcw className="h-4 w-4" />} label="Refunds" value={report ? num(report.refunds) : null} failed={!report && Boolean(error)} hint="Refunded bills, already left out of sales." />
          <Fact icon={<ShoppingBag className="h-4 w-4" />} label="Orders" value={report ? num(report.orders) : null} failed={!report && Boolean(error)} count hint="Not cancelled or refunded" />
          {report && num(report.expenses_total) > 0 && (
            <Fact icon={<ReceiptText className="h-4 w-4" />} label="All expenses" value={num(report.expenses_total)} hint="Logged under Expenses for this period" />
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, sign, hint }: { label: string; value: number; sign?: '+' | '−'; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line/5 py-2">
      <dt className="min-w-0">
        <span className="block">
          {sign && <span className="mr-1.5 inline-block w-3 text-muted">{sign}</span>}
          {label}
        </span>
        {hint && <span className={cn('block text-xs text-muted', sign && 'pl-[18px]')}>{hint}</span>}
      </dt>
      <dd className={cn('tnum shrink-0 font-mono', value < 0 && 'text-fg/80')}>{value < 0 ? `(${formatINR(-value)})` : formatINR(value)}</dd>
    </div>
  );
}

function Total({ label, value }: { label: string; value: number }) {
  return (
    <div className="my-1 flex items-center justify-between gap-4 border-y border-line/15 py-2.5 font-semibold">
      <dt>
        <span className="mr-1.5 inline-block w-3 text-muted">=</span>
        {label}
      </dt>
      <dd className="tnum font-mono text-[17px]">{formatINR(value)}</dd>
    </div>
  );
}

function Fact({
  icon,
  label,
  value,
  hint,
  count,
  failed,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | null;
  hint: string;
  count?: boolean;
  failed?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-line/10 bg-surface p-4 shadow-soft">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sunk text-fg/70" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-mono text-2xs uppercase tracking-[0.16em] text-muted">{label}</p>
          {value === null ? (
            failed ? (
              <p className="font-mono text-[17px] text-muted">—</p>
            ) : (
              <Skeleton className="h-5 w-16" />
            )
          ) : (
            <p className="tnum font-mono text-[17px] font-semibold">{count ? value.toLocaleString('en-IN') : formatINR(value)}</p>
          )}
        </div>
        <p className="mt-1 text-xs text-muted">{hint}</p>
      </div>
    </div>
  );
}
