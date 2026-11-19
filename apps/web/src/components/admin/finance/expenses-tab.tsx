'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, Pencil, Plus, ReceiptText, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Expense, ExpenseCategory, ExpensePaidVia } from '@restaurant-os/shared';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABEL, EXPENSE_PAID_VIA } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { cn, formatINR } from '@/lib/utils';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Input, Select, Sheet, Skeleton, Textarea } from '@/components/ui';
import { useAdmin } from '../admin-provider';
import { useConfirm } from '../confirm-dialog';
import { errorMessage } from '../format';
import { addMonths, currentMonth, isDateKey, istToday, monthBounds, monthLabel, num, parseMoney, relativeDayLabel, round2 } from './ist';
import { ErrorNote, ProgressBar } from './ui';

export const PAID_VIA_LABEL: Record<ExpensePaidVia, string> = { cash: 'Cash', upi: 'UPI', card: 'Card', bank: 'Bank transfer' };

export function MonthStepper({ month, onChange, max }: { month: string; onChange: (m: string) => void; max?: string }) {
  const atMax = max ? month >= max : false;
  return (
    <div className="inline-flex h-10 items-center rounded-full border border-line/15 bg-surface">
      <button type="button" onClick={() => onChange(addMonths(month, -1))} className="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted transition hover:text-fg" aria-label="Previous month">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="min-w-[128px] text-center text-sm font-semibold" aria-live="polite">
        {monthLabel(month)}
      </span>
      <button
        type="button"
        onClick={() => onChange(addMonths(month, 1))}
        disabled={atMax}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted transition hover:text-fg disabled:opacity-30"
        aria-label="Next month"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ExpensesTab() {
  const { token } = useAdmin();
  const { confirm, dialog } = useConfirm();
  const [month, setMonth] = React.useState(currentMonth());
  const [category, setCategory] = React.useState<ExpenseCategory | 'all'>('all');
  const [expenses, setExpenses] = React.useState<Expense[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [sheet, setSheet] = React.useState<{ open: boolean; expense: Expense | null }>({ open: false, expense: null });
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const req = React.useRef(0);

  const load = React.useCallback(async () => {
    const id = ++req.current;
    const { from, to } = monthBounds(month);
    try {
      const rows = await adminApi.expenses(token, { from, to, category: category === 'all' ? undefined : category });
      if (id !== req.current) return;
      setExpenses(rows);
      setError(null);
    } catch (e) {
      if (id !== req.current) return;
      setError(errorMessage(e, 'Could not load expenses.'));
      setExpenses((prev) => prev ?? []);
    }
  }, [token, month, category]);

  React.useEffect(() => {
    setExpenses(null);
    void load();
  }, [load]);

  const total = round2((expenses ?? []).reduce((s, e) => s + num(e.amount), 0));
  const byCategory = React.useMemo(() => {
    const m = new Map<ExpenseCategory, number>();
    for (const e of expenses ?? []) m.set(e.category, round2((m.get(e.category) ?? 0) + num(e.amount)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [expenses]);
  const groups = React.useMemo(() => {
    const m = new Map<string, Expense[]>();
    for (const e of expenses ?? []) m.set(e.spent_on, [...(m.get(e.spent_on) ?? []), e]);
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [expenses]);

  const onSaved = (saved: Expense, mode: 'create' | 'update') => {
    const { from, to } = monthBounds(month);
    const fits = saved.spent_on >= from && saved.spent_on <= to && (category === 'all' || saved.category === category);
    setExpenses((list) => {
      const rest = (list ?? []).filter((x) => x.id !== saved.id);
      return fits ? [saved, ...rest] : rest;
    });
    if (!fits && mode === 'create') toast.message(`Saved under ${monthLabel(saved.spent_on.slice(0, 7))}${category !== 'all' && saved.category !== category ? `, ${EXPENSE_CATEGORY_LABEL[saved.category]}` : ''}.`);
  };

  const remove = async (e: Expense) => {
    const ok = await confirm({
      title: `Delete this ${formatINR(num(e.amount))} expense?`,
      description: `${EXPENSE_CATEGORY_LABEL[e.category]}${e.vendor ? ` · ${e.vendor}` : ''} on ${relativeDayLabel(e.spent_on)}. Profit & loss and budgets update straight away.`,
      confirmLabel: 'Delete expense',
      danger: true,
    });
    if (!ok) return;
    setDeletingId(e.id);
    try {
      await adminApi.deleteExpense(token, e.id);
      setExpenses((list) => (list ?? []).filter((x) => x.id !== e.id));
      toast.success('Expense deleted.');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete the expense.'));
    } finally {
      setDeletingId(null);
    }
  };

  const max = byCategory[0]?.[1] ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <MonthStepper month={month} onChange={setMonth} max={currentMonth()} />
        <div className="sm:w-56">
          <Select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory | 'all')} className="h-10">
            <option value="all">All categories</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {EXPENSE_CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
        </div>
        <Button className="sm:ml-auto" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setSheet({ open: true, expense: null })}>
          Add expense
        </Button>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card className="self-start">
          <CardHeader title={category === 'all' ? 'This month' : EXPENSE_CATEGORY_LABEL[category]} description={monthLabel(month)} />
          <CardBody className="pt-3">
            {expenses === null ? (
              <Skeleton className="h-10 w-40" />
            ) : (
              <p className="tnum font-mono text-[30px] font-semibold leading-none tracking-tight">{formatINR(total)}</p>
            )}
            <p className="mt-2 text-xs text-muted">
              {expenses === null ? ' ' : `${expenses.length} expense${expenses.length === 1 ? '' : 's'}`}
              {expenses && expenses.length >= 500 ? ' · showing the latest 500' : ''}
            </p>
            {byCategory.length > 0 && (
              <ul className="mt-5 space-y-3">
                {byCategory.map(([c, amt]) => (
                  <li key={c}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                      <span>{EXPENSE_CATEGORY_LABEL[c]}</span>
                      <span className="tnum font-mono font-medium">{formatINR(amt)}</span>
                    </div>
                    <ProgressBar pct={max > 0 ? (amt / max) * 100 : 0} tone="ink" label={`${EXPENSE_CATEGORY_LABEL[c]} share`} />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <div>
          {expenses === null ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-2xl" />
              ))}
            </div>
          ) : groups.length === 0 ? (
            <EmptyState
              icon={<ReceiptText className="h-5 w-5" />}
              title={category === 'all' ? `No expenses in ${monthLabel(month)}` : `No ${EXPENSE_CATEGORY_LABEL[category].toLowerCase()} expenses in ${monthLabel(month)}`}
              description="Log rent, salaries, gas, vegetables and anything else you pay for. Profit & loss uses them."
              action={
                <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setSheet({ open: true, expense: null })}>
                  Add expense
                </Button>
              }
            />
          ) : (
            <div className="space-y-4">
              {groups.map(([day, rows]) => {
                const dayTotal = round2(rows.reduce((s, e) => s + num(e.amount), 0));
                return (
                  <section key={day} aria-label={relativeDayLabel(day)}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3 px-1">
                      <h4 className="text-sm font-semibold">{relativeDayLabel(day)}</h4>
                      <span className="tnum font-mono text-xs text-muted">{formatINR(dayTotal)}</span>
                    </div>
                    <ul className="divide-y divide-line/10 overflow-hidden rounded-2xl border border-line/10 bg-surface shadow-soft">
                      {rows.map((e) => (
                        <li key={e.id} className="flex items-start gap-3 px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge tone="neutral">{EXPENSE_CATEGORY_LABEL[e.category]}</Badge>
                              <span className="text-xs text-muted">{PAID_VIA_LABEL[e.paid_via] ?? e.paid_via}</span>
                            </div>
                            {(e.vendor || e.note) && (
                              <p className="mt-1 text-sm">
                                {e.vendor && <span className="font-medium">{e.vendor}</span>}
                                {e.vendor && e.note && <span className="text-muted"> · </span>}
                                {e.note && <span className="text-muted">{e.note}</span>}
                              </p>
                            )}
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <span className="tnum font-mono text-[15px] font-semibold">{formatINR(num(e.amount))}</span>
                            <div className="flex items-center">
                              <button
                                type="button"
                                onClick={() => setSheet({ open: true, expense: e })}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-fg/5 hover:text-fg"
                                aria-label="Edit expense"
                                title="Edit"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void remove(e)}
                                disabled={deletingId === e.id}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-rose-soft hover:text-rose disabled:opacity-40"
                                aria-label="Delete expense"
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <ExpenseSheet open={sheet.open} expense={sheet.expense} defaultCategory={category === 'all' ? undefined : category} onClose={() => setSheet((s) => ({ ...s, open: false }))} onSaved={onSaved} />
      {dialog}
    </div>
  );
}

interface Draft {
  spent_on: string;
  category: ExpenseCategory | '';
  amount: string;
  paid_via: ExpensePaidVia;
  vendor: string;
  note: string;
}

function ExpenseSheet({
  open,
  expense,
  defaultCategory,
  onClose,
  onSaved,
}: {
  open: boolean;
  expense: Expense | null;
  defaultCategory?: ExpenseCategory;
  onClose: () => void;
  onSaved: (e: Expense, mode: 'create' | 'update') => void;
}) {
  const { token } = useAdmin();
  const today = istToday();
  const blank = React.useCallback(
    (): Draft => ({ spent_on: istToday(), category: defaultCategory ?? '', amount: '', paid_via: 'cash', vendor: '', note: '' }),
    [defaultCategory],
  );
  const [draft, setDraft] = React.useState<Draft>(blank);
  const [errors, setErrors] = React.useState<Partial<Record<keyof Draft, string>>>({});
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setErrors({});
    setDraft(
      expense
        ? {
            spent_on: expense.spent_on,
            category: expense.category,
            amount: String(num(expense.amount)),
            paid_via: expense.paid_via,
            vendor: expense.vendor ?? '',
            note: expense.note ?? '',
          }
        : blank(),
    );
  }, [open, expense, blank]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!isDateKey(draft.spent_on)) next.spent_on = 'Pick the date you paid.';
    else if (draft.spent_on > today) next.spent_on = 'Expenses cannot be in the future.';
    if (!draft.category) next.category = 'Pick a category.';
    const amount = parseMoney(draft.amount);
    if (amount === null || amount <= 0) next.amount = 'Enter the amount in rupees.';
    if (draft.vendor.trim().length > 100) next.vendor = 'Keep it under 100 characters.';
    if (draft.note.trim().length > 300) next.note = 'Keep it under 300 characters.';
    setErrors(next);
    if (Object.keys(next).length || amount === null || !draft.category) return;
    const body = {
      spent_on: draft.spent_on,
      category: draft.category,
      amount,
      paid_via: draft.paid_via,
      vendor: draft.vendor.trim() || null,
      note: draft.note.trim() || null,
    };
    setSaving(true);
    try {
      if (expense) {
        const saved = await adminApi.updateExpense(token, expense.id, body);
        onSaved(saved, 'update');
        toast.success('Expense updated.');
      } else {
        const saved = await adminApi.createExpense(token, body);
        onSaved(saved, 'create');
        toast.success(`${formatINR(amount)} logged under ${EXPENSE_CATEGORY_LABEL[saved.category]}.`);
      }
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save the expense.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      side="right"
      title={expense ? 'Edit expense' : 'Add expense'}
      description="Money that left the business. Cash expenses also reduce the expected cash in the drawer."
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="expense-form" loading={saving}>
            {expense ? 'Save changes' : 'Add expense'}
          </Button>
        </div>
      }
    >
      <form id="expense-form" onSubmit={save} className="grid gap-4 pb-2" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Date" type="date" value={draft.spent_on} max={today} onChange={(e) => set('spent_on', e.target.value)} error={errors.spent_on} className="tnum font-mono" />
          <Input label="Amount" inputMode="decimal" prefix="₹" value={draft.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0" error={errors.amount} className="tnum font-mono" data-autofocus />
        </div>
        <div className="grid gap-1.5">
          <Select label="Category" value={draft.category} onChange={(e) => set('category', e.target.value as ExpenseCategory)}>
            <option value="">Choose…</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {EXPENSE_CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
          {errors.category && <p className="text-xs text-rose">{errors.category}</p>}
        </div>
        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-[13px] font-semibold text-fg/80">Paid via</legend>
          <div className="flex flex-wrap gap-1.5">
            {EXPENSE_PAID_VIA.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={draft.paid_via === p}
                onClick={() => set('paid_via', p)}
                className={cn(
                  'inline-flex h-9 items-center rounded-full border px-3.5 text-[13px] font-medium transition',
                  draft.paid_via === p ? 'border-ink bg-ink text-paper' : 'border-line/15 bg-surface text-fg/80 hover:border-line/30',
                )}
              >
                {PAID_VIA_LABEL[p]}
              </button>
            ))}
          </div>
          {draft.paid_via === 'cash' && <p className="text-xs text-muted">Counts against the cash drawer on {relativeDayLabel(draft.spent_on || today).toLowerCase() === 'today' ? 'today’s' : 'that day’s'} cash close.</p>}
        </fieldset>
        <Input label="Vendor (optional)" value={draft.vendor} maxLength={100} onChange={(e) => set('vendor', e.target.value)} placeholder="Sharma Vegetables" error={errors.vendor} />
        <Textarea label="Note (optional)" value={draft.note} maxLength={300} onChange={(e) => set('note', e.target.value)} placeholder="Onions, tomatoes, coriander for the week" error={errors.note} className="min-h-[72px]" />
      </form>
    </Sheet>
  );
}
