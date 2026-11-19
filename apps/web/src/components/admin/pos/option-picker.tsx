'use client';

import * as React from 'react';
import { Check, Minus, Plus } from 'lucide-react';
import type { MenuItem, OptionGroup, SelectedOption } from '@restaurant-os/shared';
import { cn, formatINR } from '@/lib/utils';
import { Button, Input, Sheet, VegMark } from '@/components/ui';
import { unitPriceOf } from './use-pos-cart';

type Selection = Record<string, string[]>;

function defaults(groups: OptionGroup[]): Selection {
  const sel: Selection = {};
  for (const g of groups) sel[g.id] = g.required && !g.multi && g.choices.length > 0 ? [g.choices[0]!.id] : [];
  return sel;
}

function toSelected(groups: OptionGroup[], sel: Selection): SelectedOption[] {
  const out: SelectedOption[] = [];
  for (const g of groups) {
    for (const choiceId of sel[g.id] ?? []) {
      const c = g.choices.find((x) => x.id === choiceId);
      if (c) out.push({ group_id: g.id, group_name: g.name, choice_id: c.id, choice_label: c.label, price_delta: Number(c.price_delta) });
    }
  }
  return out;
}

function deltaLabel(d: number): string {
  if (!d) return '';
  return d > 0 ? `+${formatINR(d)}` : `−${formatINR(-d)}`;
}

/** Choose portion / add-ons for a dish before it goes on the counter order. */
export function OptionPicker({
  item: incoming,
  onClose,
  onAdd,
}: {
  item: MenuItem | null;
  onClose: () => void;
  onAdd: (item: MenuItem, options: SelectedOption[], quantity: number, note: string) => void;
}) {
  // Keep showing the last dish while the sheet animates out.
  const last = React.useRef<MenuItem | null>(incoming);
  if (incoming) last.current = incoming;
  const item = last.current;
  const [sel, setSel] = React.useState<Selection>({});
  const [qty, setQty] = React.useState(1);
  const [note, setNote] = React.useState('');
  const [tried, setTried] = React.useState(false);

  React.useEffect(() => {
    if (!incoming) return;
    setSel(defaults(incoming.option_groups));
    setQty(1);
    setNote('');
    setTried(false);
  }, [incoming]);

  if (!item) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;

  const groups = item.option_groups;
  const missing = groups.filter((g) => g.required && (sel[g.id]?.length ?? 0) === 0);
  const options = toSelected(groups, sel);
  const unit = unitPriceOf(item, options);

  const pick = (g: OptionGroup, choiceId: string) =>
    setSel((prev) => {
      const cur = prev[g.id] ?? [];
      if (g.multi) return { ...prev, [g.id]: cur.includes(choiceId) ? cur.filter((c) => c !== choiceId) : [...cur, choiceId] };
      // Single choice: tapping the chosen one again clears it, unless the group is required.
      if (cur[0] === choiceId) return g.required ? prev : { ...prev, [g.id]: [] };
      return { ...prev, [g.id]: [choiceId] };
    });

  const submit = () => {
    if (missing.length > 0) {
      setTried(true);
      return;
    }
    onAdd(item, options, qty, note);
  };

  return (
    <Sheet
      open={Boolean(incoming)}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <VegMark isVeg={item.is_veg} />
          {item.name}
        </span>
      }
      description={formatINR(Number(item.price))}
      footer={
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-full border border-line/15">
            <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} className="inline-flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-sunk" aria-label="One less">
              <Minus className="h-4 w-4" />
            </button>
            <span className="tnum w-8 text-center font-mono font-semibold" aria-live="polite">
              {qty}
            </span>
            <button type="button" onClick={() => setQty((q) => Math.min(99, q + 1))} className="inline-flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-sunk" aria-label="One more">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <Button className="flex-1" onClick={submit}>
            Add · <span className="tnum font-mono">{formatINR(unit * qty)}</span>
          </Button>
        </div>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {groups.map((g) => {
          const chosen = sel[g.id] ?? [];
          const isMissing = tried && g.required && chosen.length === 0;
          return (
            <fieldset key={g.id}>
              <legend className="mb-2 flex w-full items-center justify-between gap-2">
                <span className="font-semibold">{g.name}</span>
                <span className={cn('font-mono text-2xs uppercase tracking-[0.12em]', isMissing ? 'text-rose' : 'text-muted')}>
                  {g.required ? (isMissing ? 'Pick one' : 'Required') : g.multi ? 'Pick any' : 'Optional'}
                </span>
              </legend>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {g.choices.map((c) => {
                  const on = chosen.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role={g.multi ? 'checkbox' : 'radio'}
                      aria-checked={on}
                      onClick={() => pick(g, c.id)}
                      className={cn(
                        'flex min-h-11 items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-sm transition active:scale-[0.99]',
                        on ? 'border-ember bg-ember-soft/50' : isMissing ? 'border-rose/50' : 'border-line/15 hover:border-line/30',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-5 w-5 shrink-0 items-center justify-center border transition',
                          g.multi ? 'rounded-md' : 'rounded-full',
                          on ? 'border-ember bg-ember text-white' : 'border-line/25',
                        )}
                        aria-hidden
                      >
                        {on && <Check className="h-3 w-3" />}
                      </span>
                      <span className="min-w-0 flex-1 font-medium">{c.label}</span>
                      {Number(c.price_delta) !== 0 && <span className="tnum shrink-0 font-mono text-xs text-muted">{deltaLabel(Number(c.price_delta))}</span>}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
        <Input label="Kitchen note" placeholder="Optional, e.g. less spicy" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
        {tried && missing.length > 0 && (
          <p className="rounded-xl bg-rose-soft px-3.5 py-2.5 text-sm font-medium text-[#a1282c]" role="alert">
            Choose {missing.map((g) => g.name).join(', ')} first.
          </p>
        )}
      </form>
    </Sheet>
  );
}
