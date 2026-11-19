'use client';

import * as React from 'react';
import { Calculator, CheckCircle2, ChevronDown, Info, Lock, Receipt, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import type { BillPaymentMethod, CashClosing, CashDaySummary } from '@restaurant-os/shared';
import { BILL_PAYMENT_METHODS, BILL_PAYMENT_METHOD_LABEL } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { cn, formatINR } from '@/lib/utils';
import { Button, Card, CardBody, CardHeader, EmptyState, Input, Skeleton, Textarea } from '@/components/ui';
import { useAdmin } from '../admin-provider';
import { useConfirm } from '../confirm-dialog';
import { errorMessage } from '../format';
import { dayLabel, istToday, isDateKey, num, parseMoney, relativeDayLabel, round2 } from './ist';
import { ErrorNote } from './ui';

const NOTES = [2000, 500, 200, 100, 50, 20, 10] as const;

type Variance = { kind: 'short' | 'over' | 'exact'; amount: number };

function varianceOf(v: number): Variance {
  const r = round2(v);
  if (Math.abs(r) < 0.005) return { kind: 'exact', amount: 0 };
  return r < 0 ? { kind: 'short', amount: -r } : { kind: 'over', amount: r };
}

const VARIANCE_STYLE: Record<Variance['kind'], { text: string; chip: string; label: (a: number) => string }> = {
  short: { text: 'text-[#a1282c]', chip: 'bg-rose-soft text-[#a1282c]', label: (a) => `Short by ${formatINR(a)}` },
  over: { text: 'text-[#8a5a00]', chip: 'bg-saffron-soft text-[#8a5a00]', label: (a) => `Over by ${formatINR(a)}` },
  exact: { text: 'text-[#1b6f49]', chip: 'bg-mint-soft text-[#1b6f49]', label: () => 'Exact' },
};

export function VarianceChip({ value, className }: { value: number; className?: string }) {
  const v = varianceOf(value);
  const s = VARIANCE_STYLE[v.kind];
  return <span className={cn('tnum inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-xs font-semibold', s.chip, className)}>{s.label(v.amount)}</span>;
}

export function CashCloseTab() {
  const { token } = useAdmin();
  const { confirm, dialog } = useConfirm();
  const today = istToday();
  const [date, setDate] = React.useState(today);
  const [summary, setSummary] = React.useState<CashDaySummary | null>(null);
  const [summaryError, setSummaryError] = React.useState<string | null>(null);
  const [closings, setClosings] = React.useState<CashClosing[] | null>(null);
  const [closingsError, setClosingsError] = React.useState<string | null>(null);
  const [float, setFloat] = React.useState('');
  const [counted, setCounted] = React.useState('');
  const [note, setNote] = React.useState('');
  const [counterOpen, setCounterOpen] = React.useState(false);
  const [notes, setNotes] = React.useState<Record<number, string>>({});
  const [coins, setCoins] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [errors, setErrors] = React.useState<{ float?: string; counted?: string }>({});
  const req = React.useRef(0);

  const loadSummary = React.useCallback(async () => {
    if (!isDateKey(date)) return;
    const id = ++req.current;
    setSummary(null);
    setSummaryError(null);
    try {
      const s = await adminApi.cashDay(token, date);
      if (id === req.current) setSummary(s);
    } catch (e) {
      if (id === req.current) setSummaryError(errorMessage(e, 'Could not load the day’s cash.'));
    }
  }, [token, date]);

  const loadClosings = React.useCallback(async () => {
    try {
      setClosings(await adminApi.cashClosings(token));
      setClosingsError(null);
    } catch (e) {
      setClosingsError(errorMessage(e, 'Could not load past closings.'));
      setClosings((c) => c ?? []);
    }
  }, [token]);

  React.useEffect(() => {
    void loadSummary();
  }, [loadSummary]);
  React.useEffect(() => {
    void loadClosings();
  }, [loadClosings]);

  // The denomination counter fills "Counted cash" as you type.
  const sumNotes = (n: Record<number, string>, c: string) => {
    let t = 0;
    for (const d of NOTES) t += d * (Number(n[d] || 0) || 0);
    return round2(t + (parseMoney(c) ?? 0));
  };
  const counterTotal = sumNotes(notes, coins);
  const setNoteCount = (n: number, v: string) => {
    const next = { ...notes, [n]: v.replace(/\D/g, '').slice(0, 5) };
    setNotes(next);
    setCounted(String(sumNotes(next, coins)));
  };
  const setCoinsValue = (v: string) => {
    setCoins(v);
    setCounted(String(sumNotes(notes, v)));
  };

  const closedRow = closings?.find((c) => c.business_date === date) ?? null;
  const alreadyClosed = Boolean(summary?.already_closed || closedRow);

  const floatN = parseMoney(float) ?? 0;
  const sales = num(summary?.cash_sales);
  const refunds = num(summary?.cash_refunds);
  const expenses = num(summary?.cash_expenses);
  const expected = round2(floatN + sales - refunds - expenses);
  const countedN = parseMoney(counted);
  const variance = countedN === null ? null : round2(countedN - expected);

  const close = async () => {
    const next: typeof errors = {};
    if (float.trim() && parseMoney(float) === null) next.float = 'Enter the float in rupees, or leave it empty for ₹0.';
    if (countedN === null) next.counted = 'Count the cash in the drawer and enter the total.';
    setErrors(next);
    if (Object.keys(next).length || countedN === null || !summary) return;
    const v = varianceOf(countedN - expected);
    const ok = await confirm({
      title: date === today ? 'Close today?' : `Close ${dayLabel(date)}?`,
      description: (
        <span className="grid gap-1">
          <span>
            Expected <span className="tnum font-mono font-semibold text-fg">{formatINR(expected)}</span>, counted{' '}
            <span className="tnum font-mono font-semibold text-fg">{formatINR(countedN)}</span>.
          </span>
          <span className={cn('font-medium', VARIANCE_STYLE[v.kind].text)}>{VARIANCE_STYLE[v.kind].label(v.amount)}.</span>
          <span>A closed day cannot be edited or closed again.</span>
        </span>
      ),
      confirmLabel: 'Close the day',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const row = await adminApi.closeCashDay(token, {
        business_date: date,
        opening_float: floatN,
        counted_cash: countedN,
        note: note.trim() || undefined,
      });
      toast.success(`${dayLabel(date)} closed. ${VARIANCE_STYLE[varianceOf(num(row.variance)).kind].label(varianceOf(num(row.variance)).amount)}.`);
      setClosings((prev) => [row, ...(prev ?? []).filter((c) => c.id !== row.id)].sort((a, b) => b.business_date.localeCompare(a.business_date)));
      setNote('');
      setCounted('');
      setNotes({});
      setCoins('');
      void loadSummary();
    } catch (e) {
      toast.error(errorMessage(e, 'Could not close the day.'));
    } finally {
      setBusy(false);
    }
  };

  const methodChips = BILL_PAYMENT_METHODS.filter((m) => num(summary?.by_method?.[m]) > 0);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-4">
        <Card>
          <CardHeader
            title="Cash in the drawer"
            description="Count the drawer at closing time. We work out what should be there from cash bills, refunds and cash expenses."
          />
          <CardBody className="grid gap-4 pt-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,220px)_1fr] sm:items-end">
              <Input
                label="Business day"
                type="date"
                value={date}
                max={today}
                onChange={(e) => e.target.value && setDate(e.target.value)}
                className="tnum font-mono"
              />
              <p className="pb-2 text-sm text-muted">{relativeDayLabel(date)}{date !== today ? '' : ' · India time'}</p>
            </div>

            {summaryError && <ErrorNote>{summaryError}</ErrorNote>}

            {!summary && !summaryError ? (
              <div className="grid gap-2">
                <Skeleton className="h-16 w-full rounded-2xl" />
                <Skeleton className="h-24 w-full rounded-2xl" />
              </div>
            ) : summary ? (
              <>
                <div className="rounded-2xl bg-sunk/60 p-3.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                      <Receipt className="h-4 w-4 text-muted" aria-hidden />
                      <span className="tnum font-mono">{num(summary.bills)}</span> bill{num(summary.bills) === 1 ? '' : 's'} settled
                    </span>
                    {methodChips.length === 0 ? (
                      <span className="text-sm text-muted">No payments yet</span>
                    ) : (
                      methodChips.map((m: BillPaymentMethod) => (
                        <span key={m} className="inline-flex items-center gap-1.5 rounded-full border border-line/10 bg-surface px-2.5 py-1 text-xs">
                          <span className="text-muted">{BILL_PAYMENT_METHOD_LABEL[m]}</span>
                          <span className="tnum font-mono font-semibold">{formatINR(num(summary.by_method[m]))}</span>
                        </span>
                      ))
                    )}
                  </div>
                </div>

                {alreadyClosed && (
                  <div className="flex items-start gap-3 rounded-2xl border border-mint/30 bg-mint-soft px-4 py-3 text-sm text-[#1b6f49]">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <div className="min-w-0">
                      <p className="font-semibold">This day is already closed.</p>
                      {closedRow ? (
                        <p className="mt-0.5">
                          Expected <span className="tnum font-mono">{formatINR(num(closedRow.expected_cash))}</span>, counted{' '}
                          <span className="tnum font-mono">{formatINR(num(closedRow.counted_cash))}</span> ·{' '}
                          {VARIANCE_STYLE[varianceOf(num(closedRow.variance)).kind].label(varianceOf(num(closedRow.variance)).amount)}
                          {closedRow.note ? ` · “${closedRow.note}”` : ''}
                        </p>
                      ) : (
                        <p className="mt-0.5">Pick another day to close it.</p>
                      )}
                    </div>
                  </div>
                )}

                <dl className="grid gap-0 overflow-hidden rounded-2xl border border-line/10">
                  <Line label="Opening float" hint="Cash you started the day with">
                    <input
                      aria-label="Opening float in rupees"
                      inputMode="decimal"
                      value={float}
                      onChange={(e) => setFloat(e.target.value)}
                      placeholder="0"
                      disabled={alreadyClosed}
                      className={cn(
                        'tnum h-9 w-28 rounded-lg border border-line/15 bg-surface px-2.5 text-right font-mono text-[15px] focus:border-ember focus:shadow-ring focus:outline-none disabled:opacity-60',
                        errors.float && 'border-rose',
                      )}
                    />
                  </Line>
                  <Line label="+ Cash sales" value={sales} />
                  <Line label="− Cash refunds" value={refunds} />
                  <Line label="− Cash expenses" value={expenses} hint="Expenses logged as paid in cash" />
                  <div className="flex items-center justify-between gap-3 bg-ink px-4 py-3 text-paper">
                    <dt className="text-sm font-semibold">Expected cash</dt>
                    <dd className="tnum font-mono text-xl font-semibold">{formatINR(expected)}</dd>
                  </div>
                </dl>
                {errors.float && <p className="-mt-2 text-xs text-rose">{errors.float}</p>}

                {!alreadyClosed && (
                  <div className="grid gap-4">
                    <div className="grid gap-3 sm:grid-cols-2 sm:items-start">
                      <Input
                        label="Counted cash"
                        inputMode="decimal"
                        prefix="₹"
                        value={counted}
                        onChange={(e) => setCounted(e.target.value)}
                        placeholder="0"
                        error={errors.counted}
                        className="tnum font-mono text-lg"
                      />
                      <div className="grid gap-1.5">
                        <p className="text-[13px] font-semibold text-fg/80">Difference</p>
                        <div className="flex h-11 items-center">
                          {variance === null ? (
                            <span className="text-sm text-muted">Enter what you counted</span>
                          ) : (
                            <span className={cn('tnum font-mono text-xl font-semibold', VARIANCE_STYLE[varianceOf(variance).kind].text)} aria-live="polite">
                              {VARIANCE_STYLE[varianceOf(variance).kind].label(varianceOf(variance).amount)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-line/10">
                      <button
                        type="button"
                        onClick={() => setCounterOpen((o) => !o)}
                        aria-expanded={counterOpen}
                        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold"
                      >
                        <Calculator className="h-4 w-4 text-muted" aria-hidden />
                        Count by notes
                        <span className="ml-auto text-xs font-normal text-muted">Fills counted cash</span>
                        <ChevronDown className={cn('h-4 w-4 text-muted transition', counterOpen && 'rotate-180')} aria-hidden />
                      </button>
                      {counterOpen && (
                        <div className="border-t border-line/10 px-4 pb-4 pt-3">
                          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-4">
                            {NOTES.map((n) => (
                              <label key={n} className="grid gap-1">
                                <span className="tnum font-mono text-xs text-muted">₹{n.toLocaleString('en-IN')} ×</span>
                                <input
                                  inputMode="numeric"
                                  value={notes[n] ?? ''}
                                  onChange={(e) => setNoteCount(n, e.target.value)}
                                  placeholder="0"
                                  className="tnum h-10 w-full rounded-lg border border-line/15 bg-surface px-2.5 font-mono text-[15px] focus:border-ember focus:shadow-ring focus:outline-none"
                                />
                              </label>
                            ))}
                            <label className="grid gap-1">
                              <span className="text-xs text-muted">Coins (₹ total)</span>
                              <input
                                inputMode="decimal"
                                value={coins}
                                onChange={(e) => setCoinsValue(e.target.value)}
                                placeholder="0"
                                className="tnum h-10 w-full rounded-lg border border-line/15 bg-surface px-2.5 font-mono text-[15px] focus:border-ember focus:shadow-ring focus:outline-none"
                              />
                            </label>
                          </div>
                          <p className="mt-3 text-sm">
                            Total <span className="tnum font-mono font-semibold">{formatINR(counterTotal)}</span>
                          </p>
                        </div>
                      )}
                    </div>

                    <Textarea
                      label="Note (optional)"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      maxLength={300}
                      placeholder="e.g. ₹200 paid to the vegetable vendor from the drawer, not logged yet"
                      className="min-h-[72px]"
                    />
                  </div>
                )}

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                  {alreadyClosed && <p className="text-sm text-muted sm:mr-auto">Each day can be closed once. The record below cannot be changed.</p>}
                  <Button onClick={() => void close()} loading={busy} disabled={alreadyClosed} leftIcon={alreadyClosed ? <Lock className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}>
                    {alreadyClosed ? 'Day closed' : 'Close the day'}
                  </Button>
                </div>
              </>
            ) : null}
          </CardBody>
        </Card>
      </div>

      <Card className="self-start">
        <CardHeader title="Past closings" description="The last 90 closed days." />
        <CardBody className="pt-4">
          {closingsError && <ErrorNote className="mb-3">{closingsError}</ErrorNote>}
          {closings === null ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          ) : closings.length === 0 ? (
            <EmptyState icon={<Wallet className="h-5 w-5" />} title="No days closed yet" description="Close today when you count the drawer; it shows up here." className="py-10" />
          ) : (
            <ul className="divide-y divide-line/10">
              {closings.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setDate(c.business_date)}
                    className={cn('flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-2 py-3 text-left transition hover:bg-sunk/60', c.business_date === date && 'bg-sunk/60')}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{dayLabel(c.business_date)}</span>
                      <span className="tnum block font-mono text-xs text-muted">
                        Expected {formatINR(num(c.expected_cash))} · Counted {formatINR(num(c.counted_cash))}
                      </span>
                    </span>
                    <VarianceChip value={num(c.variance)} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 flex items-start gap-2 text-xs text-muted">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>Log cash spent from the drawer under Expenses (paid via cash) before closing, so the expected amount is right.</span>
          </p>
        </CardBody>
      </Card>
      {dialog}
    </div>
  );
}

function Line({ label, value, hint, children }: { label: string; value?: number; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line/10 px-4 py-2.5">
      <dt className="min-w-0">
        <span className="block text-sm">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </dt>
      <dd className="tnum shrink-0 font-mono text-[15px] font-medium">{children ?? formatINR(value ?? 0)}</dd>
    </div>
  );
}
