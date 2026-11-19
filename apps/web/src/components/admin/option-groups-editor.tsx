'use client';

import * as React from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { OptionChoice, OptionGroup } from '@restaurant-os/shared';
import { Button, Input, Toggle } from '@/components/ui';

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Working copy of a choice: price delta is kept as text while typing. */
export interface ChoiceDraft {
  id: string;
  label: string;
  price_delta: string;
}
export interface GroupDraft {
  id: string;
  name: string;
  required: boolean;
  multi: boolean;
  choices: ChoiceDraft[];
}

export function toGroupDrafts(groups: OptionGroup[]): GroupDraft[] {
  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    required: g.required,
    multi: g.multi,
    choices: g.choices.map((c) => ({ id: c.id, label: c.label, price_delta: String(c.price_delta) })),
  }));
}

/** Validate + convert drafts back to the stored shape. Returns an error message or the groups. */
export function fromGroupDrafts(drafts: GroupDraft[], slug: (s: string) => string): { error: string } | { groups: OptionGroup[] } {
  const usedGroupIds = new Set<string>();
  const groups: OptionGroup[] = [];
  for (const d of drafts) {
    const name = d.name.trim();
    if (!name) return { error: 'Every option group needs a name (e.g. "Portion").' };
    let id = slug(name) || d.id;
    while (usedGroupIds.has(id)) id = `${id}-2`;
    usedGroupIds.add(id);
    const usedChoiceIds = new Set<string>();
    const choices: OptionChoice[] = [];
    for (const c of d.choices) {
      const label = c.label.trim();
      if (!label) return { error: `Every choice in "${name}" needs a label.` };
      const delta = c.price_delta.trim() === '' ? 0 : Number(c.price_delta);
      if (!Number.isFinite(delta)) return { error: `"${label}" has an invalid price change.` };
      let cid = slug(label) || c.id;
      while (usedChoiceIds.has(cid)) cid = `${cid}-2`;
      usedChoiceIds.add(cid);
      choices.push({ id: cid, label, price_delta: Math.round(delta * 100) / 100 });
    }
    if (choices.length === 0) return { error: `Add at least one choice to "${name}".` };
    groups.push({ id, name, required: d.required, multi: d.multi, choices });
  }
  return { groups };
}

export function OptionGroupsEditor({ groups, onChange }: { groups: GroupDraft[]; onChange: (next: GroupDraft[]) => void }) {
  const update = (i: number, patch: Partial<GroupDraft>) => onChange(groups.map((g, k) => (k === i ? { ...g, ...patch } : g)));
  const updateChoice = (gi: number, ci: number, patch: Partial<ChoiceDraft>) =>
    update(gi, { choices: groups[gi]!.choices.map((c, k) => (k === ci ? { ...c, ...patch } : c)) });

  return (
    <div className="space-y-3">
      {groups.map((g, gi) => (
        <div key={g.id} className="rounded-2xl border border-line/10 bg-bg p-3.5">
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <Input label="Group name" value={g.name} onChange={(e) => update(gi, { name: e.target.value })} placeholder="Portion, Spice level, Add-ons…" />
            </div>
            <button
              type="button"
              onClick={() => onChange(groups.filter((_, k) => k !== gi))}
              className="mt-7 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-rose-soft hover:text-rose"
              aria-label={`Remove group ${g.name || gi + 1}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Toggle size="sm" checked={g.required} onChange={(v) => update(gi, { required: v })} label="Required" description="Guest must pick one" />
            <Toggle size="sm" checked={g.multi} onChange={(v) => update(gi, { multi: v })} label="Multiple" description="Checkboxes instead of radios" />
          </div>
          <div className="mt-3 space-y-2">
            <p className="font-mono text-2xs uppercase tracking-[0.14em] text-muted">Choices</p>
            {g.choices.map((c, ci) => (
              <div key={c.id} className="flex items-center gap-2">
                <input
                  aria-label="Choice label"
                  value={c.label}
                  onChange={(e) => updateChoice(gi, ci, { label: e.target.value })}
                  placeholder="Half"
                  className="h-10 min-w-0 flex-1 rounded-xl border border-line/15 bg-surface px-3 text-sm focus:border-ember focus:outline-none focus:shadow-ring"
                />
                <div className="relative w-28 shrink-0">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">₹</span>
                  <input
                    aria-label="Price change"
                    inputMode="decimal"
                    value={c.price_delta}
                    onChange={(e) => updateChoice(gi, ci, { price_delta: e.target.value })}
                    placeholder="0"
                    className="tnum h-10 w-full rounded-xl border border-line/15 bg-surface pl-7 pr-2 font-mono text-sm focus:border-ember focus:outline-none focus:shadow-ring"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => update(gi, { choices: g.choices.filter((_, k) => k !== ci) })}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-fg/5 hover:text-fg"
                  aria-label={`Remove choice ${c.label || ci + 1}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <Button type="button" size="sm" variant="ghost" leftIcon={<Plus className="h-4 w-4" />} onClick={() => update(gi, { choices: [...g.choices, { id: uid('c'), label: '', price_delta: '' }] })}>
              Add choice
            </Button>
          </div>
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        leftIcon={<Plus className="h-4 w-4" />}
        onClick={() => onChange([...groups, { id: uid('g'), name: '', required: false, multi: false, choices: [{ id: uid('c'), label: '', price_delta: '' }] }])}
      >
        Add option group
      </Button>
    </div>
  );
}
