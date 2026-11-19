'use client';

import * as React from 'react';
import type { MenuItem, OptionGroup, SelectedOption } from '@restaurant-os/shared';
import { roundMoney } from '@restaurant-os/shared';
import { Button, DishImage, ItemBadgePill, Sheet, Textarea, VegMark } from '@/components/ui';
import { cn, formatINR } from '@/lib/utils';
import { HI_SAFE, dishDescription, dishName, useLang } from './i18n';
import { Stepper } from './stepper';

type Selection = Record<string, string[]>;

function deltaLabel(delta: number): string {
  if (delta === 0) return '';
  return `${delta > 0 ? '+' : '−'}${formatINR(Math.abs(delta))}`;
}

function defaultSelection(groups: OptionGroup[]): Selection {
  const sel: Selection = {};
  for (const g of groups) {
    // Pre-select the first choice of a required single-choice group so the common case is one tap.
    sel[g.id] = g.required && !g.multi && g.choices.length > 0 ? [g.choices[0]!.id] : [];
  }
  return sel;
}

/**
 * Dish detail + customisation bottom sheet.
 * `item` may be null while the sheet animates out; the last item is kept for that.
 */
export function ItemSheet({
  item,
  open,
  onClose,
  onAdd,
  disabled,
}: {
  item: MenuItem | null;
  open: boolean;
  onClose: () => void;
  onAdd: (item: MenuItem, options: SelectedOption[], note: string, quantity: number) => void;
  /** Restaurant is closed: show the dish but do not allow adding. */
  disabled?: boolean;
}) {
  const { lang, t, uiLang } = useLang();
  const lastRef = React.useRef<MenuItem | null>(null);
  if (item) lastRef.current = item;
  const dish = item ?? lastRef.current;

  const [selection, setSelection] = React.useState<Selection>({});
  const [qty, setQty] = React.useState(1);
  const [note, setNote] = React.useState('');
  const [errors, setErrors] = React.useState<string[]>([]);
  const groupRefs = React.useRef<Record<string, HTMLDivElement | null>>({});

  React.useEffect(() => {
    if (open && dish) {
      setSelection(defaultSelection(dish.option_groups));
      setQty(1);
      setNote('');
      setErrors([]);
    }
    // Reset whenever a (new) dish opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dish?.id]);

  if (!dish) return null;

  const groups = dish.option_groups;
  const chosen: SelectedOption[] = groups.flatMap((g) =>
    (selection[g.id] ?? []).flatMap((cid) => {
      const c = g.choices.find((x) => x.id === cid);
      return c ? [{ group_id: g.id, group_name: g.name, choice_id: c.id, choice_label: c.label, price_delta: c.price_delta }] : [];
    }),
  );
  const unit = roundMoney(dish.price + chosen.reduce((s, o) => s + o.price_delta, 0));
  const total = roundMoney(unit * qty);

  const toggle = (g: OptionGroup, choiceId: string) => {
    setSelection((prev) => {
      const cur = prev[g.id] ?? [];
      let next: string[];
      if (g.multi) next = cur.includes(choiceId) ? cur.filter((c) => c !== choiceId) : [...cur, choiceId];
      else next = cur[0] === choiceId && !g.required ? [] : [choiceId];
      return { ...prev, [g.id]: next };
    });
    setErrors((e) => e.filter((id) => id !== g.id));
  };

  const submit = () => {
    const missing = groups.filter((g) => g.required && (selection[g.id] ?? []).length === 0).map((g) => g.id);
    if (missing.length > 0) {
      setErrors(missing);
      groupRefs.current[missing[0]!]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    onAdd(dish, chosen, note.trim(), qty);
  };

  const soldOut = !dish.is_available;
  const name = dishName(lang, dish);
  const description = dishDescription(lang, dish);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={<span lang={name.lang}>{name.text}</span>}
      footer={
        soldOut ? (
          <p className="py-2 text-center text-sm text-muted" lang={uiLang}>
            {t('This dish is sold out right now.')}
          </p>
        ) : (
          <div className="flex items-center gap-3">
            <Stepper value={qty} onIncrement={() => setQty((q) => Math.min(50, q + 1))} onDecrement={() => setQty((q) => Math.max(1, q - 1))} label={name.text} tone="dark" />
            <Button size="lg" className="h-12 flex-1" onClick={submit} disabled={disabled} data-autofocus>
              {disabled ? (
                <span lang={uiLang}>{t('Not taking orders')}</span>
              ) : (
                <>
                  <span lang={uiLang}>{t('Add')}</span> <span className="opacity-70">·</span> <span className="tnum">{formatINR(total)}</span>
                </>
              )}
            </Button>
          </div>
        )
      }
    >
      <DishImage
        src={dish.image_url}
        alt={name.text}
        isVeg={dish.is_veg}
        sizes="(max-width: 640px) 100vw, 512px"
        className={cn('aspect-[4/3] w-full rounded-2xl', soldOut && 'grayscale')}
        priority
      />
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <VegMark isVeg={dish.is_veg} />
        {dish.badges.map((b) => (
          <ItemBadgePill key={b} badge={b} lang={lang} />
        ))}
        {dish.prep_minutes ? <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">· ~{dish.prep_minutes} min</span> : null}
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-4">
        <p className="font-mono text-lg font-semibold tnum">{formatINR(dish.price)}</p>
      </div>
      {description && (
        <p lang={description.lang} className="mt-2 text-[15px] leading-relaxed text-fg/80">
          {description.text}
        </p>
      )}

      {groups.length > 0 && (
        <div className="mt-6 grid gap-6">
          {groups.map((g) => {
            const invalid = errors.includes(g.id);
            const labelId = `og-${dish.id}-${g.id}`;
            return (
              <div
                key={g.id}
                ref={(el) => {
                  groupRefs.current[g.id] = el;
                }}
                className={cn('rounded-2xl p-0.5 transition-shadow', invalid && 'shadow-[0_0_0_2px_rgba(229,72,77,0.5)]')}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p id={labelId} className="font-display text-[15px] font-semibold">
                    {g.name}
                  </p>
                  <span lang={uiLang} className={cn('font-mono text-[11px] uppercase tracking-[0.12em]', HI_SAFE, '[&:lang(hi)]:text-[12px]', invalid ? 'text-rose' : 'text-muted')}>
                    {g.required ? t('Required') : t('Optional')}
                    {g.multi ? t(' · pick any') : t(' · pick one')}
                  </span>
                </div>
                <div role={g.multi ? 'group' : 'radiogroup'} aria-labelledby={labelId} className="mt-3 flex flex-wrap gap-2">
                  {g.choices.map((c) => {
                    const selected = (selection[g.id] ?? []).includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role={g.multi ? 'checkbox' : 'radio'}
                        aria-checked={selected}
                        onClick={() => toggle(g, c.id)}
                        className={cn(
                          'inline-flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-[background-color,border-color,color,transform] duration-200 active:scale-95',
                          selected ? 'border-ink bg-ink text-paper' : 'border-line/15 bg-surface text-fg hover:bg-sunk',
                        )}
                      >
                        {c.label}
                        {c.price_delta !== 0 && (
                          <span className={cn('font-mono text-xs tnum', selected ? 'text-paper/70' : 'text-muted')}>{deltaLabel(c.price_delta)}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {invalid && (
                  <p className="mt-2 text-xs text-rose" lang={uiLang}>
                    {t('Choose one to continue.')}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!soldOut && (
        <div className="mt-6" lang={uiLang}>
          <Textarea
            label={t('Special note')}
            placeholder={t('Less spicy, no onions, extra chutney…')}
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 200))}
            rows={2}
            className="min-h-[72px]"
            hint={note.length > 160 ? t('{n} characters left', { n: 200 - note.length }) : undefined}
          />
        </div>
      )}
    </Sheet>
  );
}
