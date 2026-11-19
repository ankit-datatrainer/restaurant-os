'use client';

import * as React from 'react';
import { ArrowDown, ArrowUp, Check, Clock, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { MenuCategory } from '@restaurant-os/shared';
import { WEEKDAY_SHORT, formatClock } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAdmin } from './admin-provider';
import { errorMessage } from './format';

type ServingWindow = Pick<MenuCategory, 'available_from' | 'available_until' | 'available_days'>;

/** "7:00 AM – 11:30 AM · Mon–Fri", or null when the category is served all day, every day. */
export function servingWindowLabel(c: ServingWindow): string | null {
  const days = (c.available_days ?? []).filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  const hasTime = Boolean(c.available_from && c.available_until);
  const everyDay = days.length === 0 || days.length === 7;
  if (!hasTime && everyDay) return null;
  const time = hasTime ? `${formatClock(c.available_from)} – ${formatClock(c.available_until)}` : 'All day';
  if (everyDay) return time;
  const contiguous = days.every((d, i) => i === 0 || d === days[i - 1]! + 1);
  const dayText =
    contiguous && days.length > 2
      ? `${WEEKDAY_SHORT[days[0]! - 1]}–${WEEKDAY_SHORT[days[days.length - 1]! - 1]}`
      : days.map((d) => WEEKDAY_SHORT[d - 1]).join(', ');
  return `${time} · ${dayText}`;
}

export function CategoryList({
  categories,
  selectedId,
  counts,
  onSelect,
  onAdd,
  onRename,
  onDelete,
  onMove,
  onUpdated,
}: {
  categories: MenuCategory[];
  selectedId: string | null;
  counts: Map<string, number>;
  onSelect: (id: string) => void;
  onAdd: (name: string, nameHi: string | null) => Promise<void>;
  /** Saves the English and (optional) Hindi name. */
  onRename: (id: string, name: string, nameHi: string | null) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onMove: (id: string, dir: -1 | 1) => Promise<void>;
  /** Called after a serving window is saved, so the parent can update its copy. */
  onUpdated?: (category: MenuCategory) => void;
}) {
  const { token } = useAdmin();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  // Serving windows are saved from here; keep the saved values until the parent's list catches up.
  const [windows, setWindows] = React.useState<Record<string, ServingWindow>>({});
  const [windowId, setWindowId] = React.useState<string | null>(null);
  const withWindow = (c: MenuCategory): MenuCategory => (windows[c.id] ? { ...c, ...windows[c.id] } : c);

  const saveWindow = async (c: MenuCategory, patch: ServingWindow) => {
    setBusyId(c.id);
    try {
      const updated = await adminApi.updateCategory(token, c.id, patch);
      setWindows((w) => ({
        ...w,
        [c.id]: { available_from: updated.available_from, available_until: updated.available_until, available_days: updated.available_days },
      }));
      onUpdated?.(updated);
      setWindowId(null);
      const label = servingWindowLabel(updated);
      toast.success(label ? `${updated.name}: served ${label}.` : `${updated.name} is served all day.`);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save the serving time.'));
    } finally {
      setBusyId(null);
    }
  };

  const [adding, setAdding] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const [newNameHi, setNewNameHi] = React.useState('');
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState('');
  const [draftHi, setDraftHi] = React.useState('');

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setBusyId('new');
    await onAdd(name, newNameHi.trim().slice(0, 80) || null);
    setBusyId(null);
    setNewName('');
    setNewNameHi('');
    setAdding(false);
  };

  const submitRename = async (id: string) => {
    const name = draft.trim();
    if (!name) return;
    setBusyId(id);
    await onRename(id, name, draftHi.trim().slice(0, 80) || null);
    setBusyId(null);
    setEditingId(null);
  };

  return (
    <div className="rounded-2xl border border-line/10 bg-surface p-2 shadow-soft">
      <div className="flex items-center justify-between px-2 pb-2 pt-1">
        <p className="font-mono text-2xs uppercase tracking-[0.16em] text-muted">Categories</p>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-semibold text-ember transition hover:bg-ember-soft"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden /> Add
        </button>
      </div>
      <ul className="space-y-0.5">
        {categories.map((raw, i) => {
          const c = withWindow(raw);
          const active = c.id === selectedId;
          const windowLabel = servingWindowLabel(c);
          const editing = editingId === c.id;
          const n = counts.get(c.id) ?? 0;
          return (
            <li key={c.id} className={cn('group rounded-xl transition', active ? 'bg-ink text-paper' : 'hover:bg-sunk/70')}>
              {editing ? (
                <form
                  className="flex items-start gap-1 p-1.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void submitRename(c.id);
                  }}
                >
                  <div className="grid min-w-0 flex-1 gap-1">
                    <input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => e.key === 'Escape' && setEditingId(null)}
                      aria-label="Category name"
                      maxLength={80}
                      className="h-9 min-w-0 rounded-lg border border-line/15 bg-surface px-2.5 text-sm text-fg focus:border-ember focus:outline-none"
                    />
                    <input
                      lang="hi"
                      value={draftHi}
                      onChange={(e) => setDraftHi(e.target.value)}
                      onKeyDown={(e) => e.key === 'Escape' && setEditingId(null)}
                      aria-label="Hindi name (optional)"
                      placeholder="Hindi name (optional)"
                      maxLength={80}
                      className="h-9 min-w-0 rounded-lg border border-line/15 bg-surface px-2.5 text-sm text-fg placeholder:text-muted/70 focus:border-ember focus:outline-none"
                    />
                  </div>
                  <button type="submit" className="inline-flex h-8 w-8 items-center justify-center rounded-full text-mint hover:bg-mint-soft" aria-label="Save name" disabled={busyId === c.id}>
                    <Check className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-fg/5" aria-label="Cancel">
                    <X className="h-4 w-4" />
                  </button>
                </form>
              ) : (
                <div className="flex items-center gap-1 pr-1">
                  <button type="button" onClick={() => onSelect(c.id)} aria-current={active ? 'true' : undefined} className="flex min-h-10 min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left text-sm font-medium">
                    <span className="min-w-0">
                      <span className="block truncate">
                        {c.name}
                        {c.name_hi && (
                          <span lang="hi" className={cn('ml-1.5 text-xs font-normal', active ? 'text-paper/60' : 'text-muted')}>
                            {c.name_hi}
                          </span>
                        )}
                      </span>
                      {windowLabel && (
                        <span className={cn('tnum flex items-center gap-1 truncate font-mono text-[10px] font-normal', active ? 'text-paper/60' : 'text-muted')}>
                          <Clock className="h-2.5 w-2.5 shrink-0" aria-hidden />
                          {windowLabel}
                        </span>
                      )}
                    </span>
                    <span className={cn('tnum ml-auto rounded-full px-1.5 font-mono text-2xs', active ? 'bg-paper/15 text-paper/80' : 'bg-sunk text-muted')}>{n}</span>
                  </button>
                  <div className={cn('flex shrink-0 items-center', active ? 'text-paper/70' : 'text-muted opacity-0 transition group-hover:opacity-100 focus-within:opacity-100')}>
                    <IconBtn label="Move up" disabled={i === 0 || busyId === c.id} onClick={() => void onMove(c.id, -1)} light={active}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn label="Move down" disabled={i === categories.length - 1 || busyId === c.id} onClick={() => void onMove(c.id, 1)} light={active}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn label={windowLabel ? `Serving time: ${windowLabel}` : 'Set serving time'} onClick={() => setWindowId((id) => (id === c.id ? null : c.id))} light={active}>
                      <Clock className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn
                      label="Edit names"
                      onClick={() => {
                        setEditingId(c.id);
                        setDraft(c.name);
                        setDraftHi(c.name_hi ?? '');
                      }}
                      light={active}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn label="Delete" onClick={() => void onDelete(c.id)} light={active} danger>
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconBtn>
                  </div>
                </div>
              )}
              {windowId === c.id && !editing && (
                <ServingWindowEditor category={c} busy={busyId === c.id} onCancel={() => setWindowId(null)} onSave={(patch) => void saveWindow(c, patch)} />
              )}
            </li>
          );
        })}
      </ul>
      {adding && (
        <form onSubmit={submitAdd} className="mt-1 flex items-start gap-1 p-1.5">
          <div className="grid min-w-0 flex-1 gap-1">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}
              placeholder="New category"
              aria-label="New category name"
              maxLength={80}
              className="h-9 min-w-0 rounded-lg border border-line/15 bg-surface px-2.5 text-sm focus:border-ember focus:outline-none"
            />
            <input
              lang="hi"
              value={newNameHi}
              onChange={(e) => setNewNameHi(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}
              placeholder="Hindi name (optional)"
              aria-label="Hindi name (optional)"
              maxLength={80}
              className="h-9 min-w-0 rounded-lg border border-line/15 bg-surface px-2.5 text-sm placeholder:text-muted/70 focus:border-ember focus:outline-none"
            />
          </div>
          <button type="submit" disabled={busyId === 'new' || !newName.trim()} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-mint hover:bg-mint-soft disabled:opacity-40" aria-label="Add category">
            <Check className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => setAdding(false)} className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-fg/5" aria-label="Cancel">
            <X className="h-4 w-4" />
          </button>
        </form>
      )}
      {categories.length === 0 && !adding && <p className="px-3 py-4 text-center text-sm text-muted">Add your first category, e.g. Starters.</p>}
    </div>
  );
}

function IconBtn({ children, label, onClick, disabled, light, danger }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; light?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-full transition disabled:opacity-30',
        light ? 'hover:bg-paper/15 hover:text-paper' : danger ? 'hover:bg-rose-soft hover:text-rose' : 'hover:bg-fg/10 hover:text-fg',
      )}
    >
      {children}
    </button>
  );
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Inline editor for a category's serving window (IST). Empty times + no days = all day, every day. */
function ServingWindowEditor({
  category,
  busy,
  onCancel,
  onSave,
}: {
  category: MenuCategory;
  busy: boolean;
  onCancel: () => void;
  onSave: (patch: ServingWindow) => void;
}) {
  const [from, setFrom] = React.useState(category.available_from?.slice(0, 5) ?? '');
  const [until, setUntil] = React.useState(category.available_until?.slice(0, 5) ?? '');
  const [days, setDays] = React.useState<number[]>(() => {
    const d = (category.available_days ?? []).filter((x) => x >= 1 && x <= 7);
    return d.length ? d : [1, 2, 3, 4, 5, 6, 7];
  });
  const [error, setError] = React.useState<string | null>(null);

  const toggleDay = (d: number) => setDays((list) => (list.includes(d) ? list.filter((x) => x !== d) : [...list, d].sort((a, b) => a - b)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const hasFrom = from.trim() !== '';
    const hasUntil = until.trim() !== '';
    if (hasFrom !== hasUntil) {
      setError('Set both a start and an end time, or leave both empty for all day.');
      return;
    }
    if (hasFrom && (!TIME_RE.test(from) || !TIME_RE.test(until))) {
      setError('Use 24-hour times like 07:00 and 11:30.');
      return;
    }
    if (hasFrom && from === until) {
      setError('Start and end time must differ.');
      return;
    }
    if (days.length === 0) {
      setError('Pick at least one day.');
      return;
    }
    setError(null);
    onSave({
      available_from: hasFrom ? from : null,
      available_until: hasUntil ? until : null,
      available_days: days.length === 7 ? null : days,
    });
  };

  const crossesMidnight = TIME_RE.test(from) && TIME_RE.test(until) && until < from;
  const field =
    'tnum h-9 w-full min-w-0 rounded-lg border border-line/15 bg-surface px-2 font-mono text-sm text-fg focus:border-ember focus:outline-none';

  return (
    <form onSubmit={submit} className="m-1 mt-0 grid gap-3 rounded-xl border border-line/10 bg-surface p-3 text-fg" noValidate>
      <div>
        <p className="text-xs font-semibold">Serving time</p>
        <p className="text-[11px] text-muted">Outside this window the category is hidden from guests. India time.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1">
          <span className="text-[11px] text-muted">From</span>
          <input type="time" step={300} value={from} onChange={(e) => setFrom(e.target.value)} className={field} />
        </label>
        <label className="grid gap-1">
          <span className="text-[11px] text-muted">Until</span>
          <input type="time" step={300} value={until} onChange={(e) => setUntil(e.target.value)} className={field} />
        </label>
      </div>
      {crossesMidnight && <p className="-mt-1 text-[11px] text-muted">Runs past midnight into the next day.</p>}
      <div className="flex flex-wrap gap-1" role="group" aria-label="Days">
        {WEEKDAY_SHORT.map((label, i) => {
          const d = i + 1;
          const on = days.includes(d);
          return (
            <button
              key={label}
              type="button"
              aria-pressed={on}
              onClick={() => toggleDay(d)}
              className={cn(
                'h-8 min-w-[38px] rounded-full border px-2 text-[11px] font-semibold transition',
                on ? 'border-ink bg-ink text-paper' : 'border-line/15 text-fg/70 hover:border-line/30',
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
      {error && <p className="text-[11px] text-rose">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setFrom('');
            setUntil('');
            setDays([1, 2, 3, 4, 5, 6, 7]);
            setError(null);
          }}
          className="text-xs font-semibold text-ember hover:underline"
        >
          All day
        </button>
        <div className="ml-auto flex gap-1.5">
          <button type="button" onClick={onCancel} className="h-8 rounded-full px-3 text-xs font-semibold text-muted transition hover:bg-fg/5 hover:text-fg">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="h-8 rounded-full bg-ember px-3.5 text-xs font-semibold text-white transition hover:bg-ember-2 disabled:opacity-50">
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </form>
  );
}
