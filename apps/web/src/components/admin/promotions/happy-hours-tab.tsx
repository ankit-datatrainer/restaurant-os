'use client';

import * as React from 'react';
import { Clock, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { HappyHour, MenuCategory } from '@restaurant-os/shared';
import { WEEKDAY_SHORT, formatClock, windowOpen } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Badge, Button, EmptyState, Input, Sheet, Toggle } from '@/components/ui';
import { useConfirm } from '../confirm-dialog';
import { useNow } from '../use-now';
import { errorMessage } from '../format';
import { ErrorNote, InfoNote, ListSkeleton, PillToggle, numInput, parseNum } from '../inventory/ops-shared';
import type { PromotionsContext } from './promotions-view';

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];

function daysLabel(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.length === 7) return 'Every day';
  if (sorted.join() === '1,2,3,4,5') return 'Weekdays';
  if (sorted.join() === '6,7') return 'Weekends';
  return sorted.map((d) => WEEKDAY_SHORT[d - 1]).join(', ');
}

function crossesMidnight(start: string, end: string): boolean {
  return start.slice(0, 5) > end.slice(0, 5);
}

export function HappyHoursTab({ ctx }: { ctx: PromotionsContext }) {
  const { token, canEdit, loadFailed } = ctx;
  const now = useNow(30_000);
  const [rows, setRows] = React.useState<HappyHour[] | null>(null);
  const [categories, setCategories] = React.useState<MenuCategory[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<HappyHour | null>(null);
  const [open, setOpen] = React.useState(false);
  const [togglingId, setTogglingId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const [h, c] = await Promise.all([adminApi.happyHours(token), adminApi.categories(token).catch(() => [] as MenuCategory[])]);
      setRows(h);
      setCategories(c);
      setError(null);
    } catch (e) {
      setError(loadFailed(e, 'Could not load happy hours.'));
      setRows((p) => p ?? []);
    }
  }, [token, loadFailed]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const catName = React.useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  const upsert = (row: HappyHour) =>
    setRows((prev) => {
      const l = prev ?? [];
      return l.some((x) => x.id === row.id) ? l.map((x) => (x.id === row.id ? row : x)) : [...l, row].sort((a, b) => a.start_time.localeCompare(b.start_time));
    });

  const toggle = async (h: HappyHour, v: boolean) => {
    setTogglingId(h.id);
    upsert({ ...h, is_active: v });
    try {
      upsert(await adminApi.updateHappyHour(token, h.id, { is_active: v }));
      toast.success(v ? `${h.name} is on.` : `${h.name} is off.`);
    } catch (e) {
      upsert(h);
      toast.error(errorMessage(e, 'Could not update the happy hour.'));
    } finally {
      setTogglingId(null);
    }
  };

  const edit = (h: HappyHour | null) => {
    setEditing(h);
    setOpen(true);
  };

  const list = rows ?? [];
  const at = new Date(now);

  return (
    <div>
      <InfoNote className="mb-4">
        During a happy hour the discount is applied to matching dishes automatically, and guests see it in their cart before they order. Times are India time (IST).
      </InfoNote>

      {error && <ErrorNote className="mb-4">{error}</ErrorNote>}

      {canEdit && list.length > 0 && (
        <div className="mb-4 flex justify-end">
          <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => edit(null)}>
            New happy hour
          </Button>
        </div>
      )}

      {rows === null ? (
        <ListSkeleton rows={3} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={<Clock className="h-5 w-5" />}
          title="No happy hours yet"
          description="Set a regular discount for slow hours, like 20% off drinks from 4 to 7 pm on weekdays."
          action={
            canEdit ? (
              <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => edit(null)}>
                Create a happy hour
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((h) => {
            const running = h.is_active && windowOpen(h.start_time, h.end_time, h.days, at);
            const cats = (h.category_ids ?? []).map((id) => catName.get(id)).filter(Boolean) as string[];
            return (
              <li key={h.id} className={cn('flex flex-col rounded-2xl border bg-surface p-4 shadow-soft', running ? 'border-mint/40' : 'border-line/10', !h.is_active && 'bg-sunk/40')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={cn('font-display text-lg font-semibold leading-tight', !h.is_active && 'text-fg/60')}>{h.name}</p>
                      {running && (
                        <Badge tone="mint" dot>
                          Running now
                        </Badge>
                      )}
                      {!h.is_active && <Badge tone="neutral">Off</Badge>}
                    </div>
                    <p className="tnum mt-1 font-mono text-sm">
                      {formatClock(h.start_time)} – {formatClock(h.end_time)}
                      {crossesMidnight(h.start_time, h.end_time) && <span className="ml-1 font-sans text-xs text-muted">(next day)</span>}
                    </p>
                  </div>
                  <span className="tnum shrink-0 rounded-2xl bg-ember-soft px-3 py-1.5 font-mono text-lg font-semibold text-ember-3">{Number(h.percent.toFixed(2))}%</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1" aria-label={daysLabel(h.days)}>
                  {ALL_DAYS.map((d) => {
                    const on = h.days.includes(d);
                    return (
                      <span
                        key={d}
                        className={cn('inline-flex h-7 min-w-9 items-center justify-center rounded-full px-2 font-mono text-2xs font-medium uppercase tracking-[0.08em]', on ? 'bg-ink text-paper' : 'bg-sunk text-muted/70')}
                        aria-hidden
                      >
                        {WEEKDAY_SHORT[d - 1]}
                      </span>
                    );
                  })}
                </div>
                <p className="mt-3 text-sm text-muted">
                  <span className="font-medium text-fg/80">On:</span> {cats.length ? cats.join(', ') : 'Whole menu'}
                </p>
                <div className="flex-1" aria-hidden />
                {canEdit && (
                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-line/10 pt-3">
                    <Toggle size="sm" checked={h.is_active} disabled={togglingId === h.id} onChange={(v) => void toggle(h, v)} label={<span className="text-sm">Active</span>} />
                    <Button size="sm" variant="outline" leftIcon={<Pencil className="h-3.5 w-3.5" />} onClick={() => edit(h)}>
                      Edit
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <HappyHourSheet
        open={open}
        row={editing}
        token={token}
        categories={categories}
        onClose={() => setOpen(false)}
        onSaved={upsert}
        onDeleted={(id) => setRows((prev) => (prev ?? []).filter((x) => x.id !== id))}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create / edit
// ---------------------------------------------------------------------------

interface HHDraft {
  name: string;
  days: number[];
  start_time: string;
  end_time: string;
  percent: string;
  category_ids: string[];
  is_active: boolean;
}

function toDraft(h: HappyHour | null): HHDraft {
  return {
    name: h?.name ?? '',
    days: h?.days ?? [1, 2, 3, 4, 5],
    start_time: h?.start_time.slice(0, 5) ?? '16:00',
    end_time: h?.end_time.slice(0, 5) ?? '19:00',
    percent: h ? numInput(h.percent) : '',
    category_ids: h?.category_ids ?? [],
    is_active: h?.is_active ?? true,
  };
}

function HappyHourSheet({
  open,
  row,
  token,
  categories,
  onClose,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  row: HappyHour | null;
  token: string;
  categories: MenuCategory[];
  onClose: () => void;
  onSaved: (h: HappyHour) => void;
  onDeleted: (id: string) => void;
}) {
  const { confirm, dialog } = useConfirm();
  const [draft, setDraft] = React.useState<HHDraft>(() => toDraft(row));
  const [errors, setErrors] = React.useState<Partial<Record<keyof HHDraft, string>>>({});
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setDraft(toDraft(row));
      setErrors({});
    }
  }, [open, row]);

  const set = <K extends keyof HHDraft>(k: K, v: HHDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const toggleDay = (d: number) => set('days', draft.days.includes(d) ? draft.days.filter((x) => x !== d) : [...draft.days, d].sort((a, b) => a - b));
  const toggleCat = (id: string) => set('category_ids', draft.category_ids.includes(id) ? draft.category_ids.filter((x) => x !== id) : [...draft.category_ids, id]);

  const sortedCats = [...categories].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  const overnight = /^\d{2}:\d{2}$/.test(draft.start_time) && /^\d{2}:\d{2}$/.test(draft.end_time) && crossesMidnight(draft.start_time, draft.end_time);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Partial<Record<keyof HHDraft, string>> = {};
    const name = draft.name.trim();
    if (!name) next.name = 'Name the offer, e.g. “Evening happy hour”.';
    if (!draft.days.length) next.days = 'Pick at least one day.';
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.start_time)) next.start_time = 'Pick a start time.';
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.end_time)) next.end_time = 'Pick an end time.';
    else if (draft.start_time === draft.end_time) next.end_time = 'Start and end cannot be the same.';
    const pct = parseNum(draft.percent);
    if (pct === null || pct <= 0) next.percent = 'Enter a percentage above 0.';
    else if (pct > 90) next.percent = 'At most 90% off.';
    setErrors(next);
    if (Object.keys(next).length) return;
    const body = {
      name,
      days: draft.days,
      start_time: draft.start_time,
      end_time: draft.end_time,
      percent: Math.round((pct ?? 0) * 100) / 100,
      category_ids: draft.category_ids.length ? draft.category_ids : null,
      is_active: draft.is_active,
    };
    setSaving(true);
    try {
      const saved = row ? await adminApi.updateHappyHour(token, row.id, body) : await adminApi.createHappyHour(token, body);
      onSaved(saved);
      toast.success(row ? `${saved.name} saved.` : `${saved.name} created.`);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save the happy hour.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!row) return;
    const ok = await confirm({
      title: `Delete ${row.name}?`,
      description: 'Prices go back to normal straight away. Orders already placed keep their discount. To pause it instead, switch it off.',
      confirmLabel: 'Delete happy hour',
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await adminApi.deleteHappyHour(token, row.id);
      onDeleted(row.id);
      toast.success(`${row.name} deleted.`);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete the happy hour.'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        side="right"
        title={row ? 'Edit happy hour' : 'New happy hour'}
        description="Times are India time (IST), 24-hour."
        className="md:max-w-lg"
        footer={
          <div className="flex items-center gap-2">
            {row && (
              <Button type="button" variant="ghost" size="sm" loading={deleting} leftIcon={<Trash2 className="h-4 w-4" />} onClick={() => void remove()} className="text-rose hover:bg-rose-soft">
                Delete
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" form="happy-hour-form" loading={saving}>
                {row ? 'Save changes' : 'Create'}
              </Button>
            </div>
          </div>
        }
      >
        <form id="happy-hour-form" onSubmit={save} className="grid gap-5 pb-2" noValidate>
          <Input label="Name" value={draft.name} maxLength={80} onChange={(e) => set('name', e.target.value)} placeholder="Evening happy hour" error={errors.name} data-autofocus />

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-[13px] font-semibold text-fg/80">Days</p>
              <div className="flex gap-3 text-xs font-semibold text-ember-3">
                <button type="button" onClick={() => set('days', ALL_DAYS)} className="hover:underline">
                  Every day
                </button>
                <button type="button" onClick={() => set('days', [1, 2, 3, 4, 5])} className="hover:underline">
                  Weekdays
                </button>
                <button type="button" onClick={() => set('days', [6, 7])} className="hover:underline">
                  Weekends
                </button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1" role="group" aria-label="Days">
              {ALL_DAYS.map((d) => (
                <PillToggle key={d} on={draft.days.includes(d)} onClick={() => toggleDay(d)} className="px-0 text-xs">
                  {WEEKDAY_SHORT[d - 1]}
                </PillToggle>
              ))}
            </div>
            {errors.days && <p className="mt-1.5 text-xs text-rose">{errors.days}</p>}
          </div>

          <div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Starts" type="time" step={300} value={draft.start_time} onChange={(e) => set('start_time', e.target.value.slice(0, 5))} error={errors.start_time} className="tnum font-mono" />
              <Input label="Ends" type="time" step={300} value={draft.end_time} onChange={(e) => set('end_time', e.target.value.slice(0, 5))} error={errors.end_time} className="tnum font-mono" />
            </div>
            <p className="mt-1.5 text-xs text-muted">
              {overnight
                ? `Runs past midnight: from ${formatClock(draft.start_time)} until ${formatClock(draft.end_time)} the next morning.`
                : 'It can cross midnight: set the end earlier than the start, e.g. 22:00 to 01:00.'}
            </p>
          </div>

          <Input
            label="Percent off"
            inputMode="decimal"
            value={draft.percent}
            onChange={(e) => set('percent', e.target.value)}
            placeholder="20"
            error={errors.percent}
            hint="Up to 90%"
            className="tnum font-mono"
          />

          <div>
            <p className="text-[13px] font-semibold text-fg/80">Applies to</p>
            <p className="mb-2 text-xs text-muted">{draft.category_ids.length ? `${draft.category_ids.length} categor${draft.category_ids.length === 1 ? 'y' : 'ies'} selected.` : 'Nothing selected means the whole menu.'}</p>
            {sortedCats.length === 0 ? (
              <p className="rounded-xl bg-sunk px-3.5 py-2.5 text-sm text-muted">No menu categories yet, so it applies to the whole menu.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Categories">
                <PillToggle on={draft.category_ids.length === 0} onClick={() => set('category_ids', [])}>
                  Whole menu
                </PillToggle>
                {sortedCats.map((c) => (
                  <PillToggle key={c.id} on={draft.category_ids.includes(c.id)} onClick={() => toggleCat(c.id)}>
                    {c.name}
                  </PillToggle>
                ))}
              </div>
            )}
          </div>

          <Toggle checked={draft.is_active} onChange={(v) => set('is_active', v)} label="Active" description={draft.is_active ? 'Runs on the days and times above' : 'Paused'} />

          {draft.days.length > 0 && parseNum(draft.percent) ? (
            <p className="flex items-start gap-2 rounded-xl bg-sunk px-3.5 py-3 text-sm text-fg/85" aria-live="polite">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-ember" aria-hidden />
              <span>
                {daysLabel(draft.days)}, {formatClock(draft.start_time)} – {formatClock(draft.end_time)}: {parseNum(draft.percent)}% off{' '}
                {draft.category_ids.length
                  ? sortedCats
                      .filter((c) => draft.category_ids.includes(c.id))
                      .map((c) => c.name)
                      .join(', ')
                  : 'the whole menu'}
                .
              </span>
            </p>
          ) : null}
        </form>
      </Sheet>
      {dialog}
    </>
  );
}
