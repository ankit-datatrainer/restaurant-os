'use client';

import * as React from 'react';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import type { ExpenseCategory } from '@restaurant-os/shared';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABEL } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { cn, formatINR } from '@/lib/utils';
import { Button, Card, CardBody, CardHeader, Skeleton } from '@/components/ui';
import { useAdmin } from '../admin-provider';
import { errorMessage } from '../format';
import { MonthStepper } from './expenses-tab';
import { addMonths, currentMonth, monthLabel, num, parseMoney, round2 } from './ist';
import { ErrorNote, ProgressBar } from './ui';

type Drafts = Record<ExpenseCategory, string>;

function emptyDrafts(): Drafts {
  return Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c, ''])) as Drafts;
}

function toneFor(pct: number): 'mint' | 'saffron' | 'rose' {
  if (pct > 100) return 'rose';
  if (pct >= 80) return 'saffron';
  return 'mint';
}

const TONE_TEXT = { mint: 'text-[#1b6f49]', saffron: 'text-[#8a5a00]', rose: 'text-[#a1282c]' } as const;

export function BudgetsTab() {
  const { token } = useAdmin();
  const [month, setMonth] = React.useState(currentMonth());
  const [saved, setSaved] = React.useState<Drafts | null>(null);
  const [drafts, setDrafts] = React.useState<Drafts>(emptyDrafts);
  const [spent, setSpent] = React.useState<Partial<Record<ExpenseCategory, number>>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Partial<Record<ExpenseCategory, string>>>({});
  const [saving, setSaving] = React.useState(false);
  const [copying, setCopying] = React.useState(false);
  const req = React.useRef(0);

  const load = React.useCallback(async () => {
    const id = ++req.current;
    setSaved(null);
    try {
      const res = await adminApi.budgets(token, month);
      if (id !== req.current) return;
      const d = emptyDrafts();
      for (const b of res.budgets) d[b.category] = String(num(b.amount));
      setSaved(d);
      setDrafts(d);
      setSpent(res.spent ?? {});
      setFieldErrors({});
      setError(null);
    } catch (e) {
      if (id !== req.current) return;
      setError(errorMessage(e, 'Could not load budgets.'));
      setSaved(emptyDrafts());
    }
  }, [token, month]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const dirty = !!saved && EXPENSE_CATEGORIES.some((c) => (parseMoney(drafts[c]) ?? 0) !== (parseMoney(saved[c]) ?? 0) || (drafts[c].trim() !== '' && parseMoney(drafts[c]) === null));

  const totalBudget = round2(EXPENSE_CATEGORIES.reduce((s, c) => s + (parseMoney(drafts[c]) ?? 0), 0));
  const totalSpent = round2(EXPENSE_CATEGORIES.reduce((s, c) => s + num(spent[c]), 0));

  const copyLastMonth = async () => {
    setCopying(true);
    try {
      const prev = await adminApi.budgets(token, addMonths(month, -1));
      if (prev.budgets.length === 0) {
        toast.message(`No budgets were set for ${monthLabel(addMonths(month, -1))}.`);
        return;
      }
      setDrafts((d) => {
        const next = { ...d };
        for (const b of prev.budgets) next[b.category] = String(num(b.amount));
        return next;
      });
      toast.success(`Copied ${monthLabel(addMonths(month, -1))}'s budgets. Save to keep them.`);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load last month’s budgets.'));
    } finally {
      setCopying(false);
    }
  };

  const save = async () => {
    const errs: typeof fieldErrors = {};
    const body: Array<{ category: ExpenseCategory; amount: number }> = [];
    for (const c of EXPENSE_CATEGORIES) {
      const raw = drafts[c].trim();
      const amount = raw === '' ? 0 : parseMoney(raw);
      if (amount === null) errs[c] = 'Enter rupees, or leave empty.';
      else body.push({ category: c, amount });
    }
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const rows = await adminApi.saveBudgets(token, month, body);
      const d = emptyDrafts();
      for (const b of rows) d[b.category] = String(num(b.amount));
      setSaved(d);
      setDrafts(d);
      toast.success(`Budgets for ${monthLabel(month)} saved.`);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save budgets.'));
    } finally {
      setSaving(false);
    }
  };

  const overallPct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <MonthStepper month={month} onChange={setMonth} />
        <div className="flex gap-2 sm:ml-auto">
          <Button variant="outline" size="sm" loading={copying} onClick={() => void copyLastMonth()} disabled={!saved}>
            Copy last month
          </Button>
          <Button size="sm" leftIcon={<Save className="h-4 w-4" />} loading={saving} disabled={!dirty} onClick={() => void save()}>
            Save budgets
          </Button>
        </div>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <Card>
        <CardHeader
          title={`Budgets for ${monthLabel(month)}`}
          description="Set a monthly limit per category. Spending comes from the expenses you log. Leave a category empty for no budget."
        />
        <CardBody className="pt-4">
          {totalBudget > 0 && saved && (
            <div className="mb-5 rounded-2xl bg-sunk/60 p-4">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm">
                  <span className="tnum font-mono font-semibold">{formatINR(totalSpent)}</span> <span className="text-muted">of</span>{' '}
                  <span className="tnum font-mono font-semibold">{formatINR(totalBudget)}</span> <span className="text-muted">spent</span>
                </p>
                <span className={cn('tnum font-mono text-sm font-semibold', TONE_TEXT[toneFor(overallPct)])}>{Math.round(overallPct)}%</span>
              </div>
              <ProgressBar pct={overallPct} tone={toneFor(overallPct)} label="Total budget used" />
            </div>
          )}

          {!saved ? (
            <div className="space-y-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          ) : (
            <ul className="divide-y divide-line/10">
              {EXPENSE_CATEGORIES.map((c) => {
                const budget = parseMoney(drafts[c]) ?? 0;
                const used = num(spent[c]);
                const pct = budget > 0 ? (used / budget) * 100 : 0;
                const tone = toneFor(pct);
                return (
                  <li key={c} className="grid gap-2 py-3.5 sm:grid-cols-[minmax(0,1fr)_150px] sm:items-center sm:gap-5">
                    <div className="min-w-0">
                      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                        <span className="text-sm font-medium">{EXPENSE_CATEGORY_LABEL[c]}</span>
                        <span className="tnum font-mono text-xs text-muted">
                          {formatINR(used)} spent
                          {budget > 0 && (
                            <>
                              {' · '}
                              <span className={cn('font-semibold', TONE_TEXT[tone])}>
                                {used > budget ? `${formatINR(round2(used - budget))} over` : `${formatINR(round2(budget - used))} left`}
                              </span>
                            </>
                          )}
                        </span>
                      </div>
                      {budget > 0 ? (
                        <ProgressBar pct={pct} tone={tone} label={`${EXPENSE_CATEGORY_LABEL[c]} budget used`} />
                      ) : (
                        <div className="h-2 rounded-full border border-dashed border-line/20" aria-hidden />
                      )}
                    </div>
                    <div>
                      <label className="sr-only" htmlFor={`budget-${c}`}>
                        {EXPENSE_CATEGORY_LABEL[c]} budget in rupees
                      </label>
                      <div className="relative">
                        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">₹</span>
                        <input
                          id={`budget-${c}`}
                          inputMode="decimal"
                          value={drafts[c]}
                          onChange={(e) => setDrafts((d) => ({ ...d, [c]: e.target.value }))}
                          placeholder="No budget"
                          className={cn(
                            'tnum h-10 w-full rounded-xl border border-line/15 bg-surface pl-7 pr-3 text-right font-mono text-[15px] placeholder:font-sans placeholder:text-sm placeholder:text-muted/70 focus:border-ember focus:shadow-ring focus:outline-none',
                            fieldErrors[c] && 'border-rose',
                          )}
                          aria-invalid={fieldErrors[c] ? true : undefined}
                        />
                      </div>
                      {fieldErrors[c] && <p className="mt-1 text-xs text-rose">{fieldErrors[c]}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-mint" aria-hidden /> Under 80%
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-saffron" aria-hidden /> 80–100%
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-rose" aria-hidden /> Over budget
            </span>
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
