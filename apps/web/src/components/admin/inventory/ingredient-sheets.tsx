'use client';

import * as React from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Ingredient, IngredientUnit } from '@restaurant-os/shared';
import { INGREDIENT_UNITS } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { cn, formatINR } from '@/lib/utils';
import { Button, Input, Select, Sheet, Toggle } from '@/components/ui';
import { useConfirm } from '../confirm-dialog';
import { errorMessage } from '../format';
import { fmtQty, fmtSignedQty, numInput, parseNum, round3, useLastNonNull } from './ops-shared';

export const UNIT_LABEL: Record<IngredientUnit, string> = {
  kg: 'Kilograms (kg)',
  g: 'Grams (g)',
  l: 'Litres (l)',
  ml: 'Millilitres (ml)',
  pcs: 'Pieces (pcs)',
  pack: 'Packs',
  dozen: 'Dozen',
};

// ---------------------------------------------------------------------------
// Add / edit ingredient
// ---------------------------------------------------------------------------

interface IngredientDraft {
  name: string;
  unit: IngredientUnit;
  low_stock_threshold: string;
  avg_cost: string;
  opening_qty: string;
  is_active: boolean;
}

function toDraft(i: Ingredient | null): IngredientDraft {
  return {
    name: i?.name ?? '',
    unit: i?.unit ?? 'kg',
    low_stock_threshold: i ? numInput(i.low_stock_threshold) : '',
    avg_cost: i ? numInput(i.avg_cost) : '',
    opening_qty: '',
    is_active: i?.is_active ?? true,
  };
}

export function IngredientSheet({
  open,
  ingredient,
  token,
  onClose,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  ingredient: Ingredient | null;
  token: string;
  onClose: () => void;
  onSaved: (row: Ingredient) => void;
  onDeleted: (id: string) => void;
}) {
  const { confirm, dialog } = useConfirm();
  const [draft, setDraft] = React.useState<IngredientDraft>(() => toDraft(ingredient));
  const [errors, setErrors] = React.useState<Partial<Record<keyof IngredientDraft, string>>>({});
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setDraft(toDraft(ingredient));
      setErrors({});
    }
  }, [open, ingredient]);

  const set = <K extends keyof IngredientDraft>(k: K, v: IngredientDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Partial<Record<keyof IngredientDraft, string>> = {};
    const name = draft.name.trim();
    if (!name) next.name = 'Name the ingredient.';
    else if (name.length > 80) next.name = 'Keep it under 80 characters.';
    const low = draft.low_stock_threshold.trim() ? parseNum(draft.low_stock_threshold) : 0;
    if (low === null || low < 0) next.low_stock_threshold = 'Enter 0 or more.';
    const cost = draft.avg_cost.trim() ? parseNum(draft.avg_cost) : 0;
    if (cost === null || cost < 0) next.avg_cost = 'Enter 0 or more.';
    const opening = draft.opening_qty.trim() ? parseNum(draft.opening_qty) : 0;
    if (!ingredient && (opening === null || opening < 0)) next.opening_qty = 'Enter 0 or more.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      if (ingredient) {
        const row = await adminApi.updateIngredient(token, ingredient.id, {
          name,
          unit: draft.unit,
          low_stock_threshold: round3(low ?? 0),
          avg_cost: Math.round((cost ?? 0) * 100) / 100,
          is_active: draft.is_active,
        });
        onSaved(row);
        toast.success(`${row.name} saved.`);
      } else {
        const row = await adminApi.createIngredient(token, {
          name,
          unit: draft.unit,
          low_stock_threshold: round3(low ?? 0),
          avg_cost: Math.round((cost ?? 0) * 100) / 100,
          opening_qty: opening && opening > 0 ? round3(opening) : undefined,
        });
        onSaved(row);
        toast.success(opening && opening > 0 ? `${row.name} added with ${fmtQty(row.stock_qty, row.unit)} in stock.` : `${row.name} added.`);
      }
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save the ingredient.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!ingredient) return;
    const ok = await confirm({
      title: `Delete ${ingredient.name}?`,
      description:
        'It is removed from every recipe along with its stock history. If it is on a purchase order, it is hidden instead so your records stay complete. To keep the history, switch it off instead.',
      confirmLabel: 'Delete ingredient',
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const kept = await adminApi.deleteIngredient(token, ingredient.id);
      if (kept) {
        onSaved(kept);
        toast.success(`${ingredient.name} is on a purchase order, so it was hidden instead of deleted.`);
      } else {
        onDeleted(ingredient.id);
        toast.success(`${ingredient.name} deleted.`);
      }
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete the ingredient.'));
    } finally {
      setDeleting(false);
    }
  };

  const unitChanged = !!ingredient && draft.unit !== ingredient.unit;

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        side="right"
        title={ingredient ? 'Edit ingredient' : 'Add ingredient'}
        description={ingredient ? 'Stock changes go through waste, stock count or purchase orders, not here.' : 'Anything you buy and use in the kitchen: flour, paneer, milk, boxes.'}
        className="md:max-w-lg"
        footer={
          <div className="flex items-center gap-2">
            {ingredient && (
              <Button type="button" variant="ghost" size="sm" loading={deleting} leftIcon={<Trash2 className="h-4 w-4" />} onClick={() => void remove()} className="text-rose hover:bg-rose-soft">
                Delete
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" form="ingredient-form" loading={saving}>
                {ingredient ? 'Save changes' : 'Add ingredient'}
              </Button>
            </div>
          </div>
        }
      >
        <form id="ingredient-form" onSubmit={save} className="grid gap-5 pb-2" noValidate>
          <Input label="Name" value={draft.name} maxLength={80} onChange={(e) => set('name', e.target.value)} placeholder="Paneer" error={errors.name} data-autofocus />
          <Select
            label="Unit"
            value={draft.unit}
            onChange={(e) => set('unit', e.target.value as IngredientUnit)}
            hint={unitChanged ? 'Changing the unit does not convert the stock or recipe quantities. Update them too.' : 'Stock, recipes and purchases all use this unit.'}
          >
            {INGREDIENT_UNITS.map((u) => (
              <option key={u} value={u}>
                {UNIT_LABEL[u]}
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Low-stock level"
              inputMode="decimal"
              value={draft.low_stock_threshold}
              onChange={(e) => set('low_stock_threshold', e.target.value)}
              placeholder="2"
              error={errors.low_stock_threshold}
              hint={`Warn me at or below this (${draft.unit})`}
              className="tnum font-mono"
            />
            <Input
              label={`Cost per ${draft.unit}`}
              inputMode="decimal"
              prefix="₹"
              value={draft.avg_cost}
              onChange={(e) => set('avg_cost', e.target.value)}
              placeholder="320"
              error={errors.avg_cost}
              hint="Updated by purchases"
              className="tnum font-mono"
            />
          </div>
          {!ingredient && (
            <Input
              label={`Opening stock (${draft.unit}, optional)`}
              inputMode="decimal"
              value={draft.opening_qty}
              onChange={(e) => set('opening_qty', e.target.value)}
              placeholder="0"
              error={errors.opening_qty}
              hint="What you have on the shelf right now"
              className="tnum font-mono"
            />
          )}
          {ingredient && (
            <Toggle
              checked={draft.is_active}
              onChange={(v) => set('is_active', v)}
              label="Active"
              description={draft.is_active ? 'Shown in stock, recipes and purchase orders' : 'Hidden from lists; history is kept'}
            />
          )}
        </form>
      </Sheet>
      {dialog}
    </>
  );
}

// ---------------------------------------------------------------------------
// Waste / stock count / opening stock
// ---------------------------------------------------------------------------

export type StockAction = 'waste' | 'adjustment' | 'opening';

const ACTION_COPY: Record<StockAction, { title: string; button: string }> = {
  waste: { title: 'Record waste', button: 'Record waste' },
  adjustment: { title: 'Stock count', button: 'Save count' },
  opening: { title: 'Add opening stock', button: 'Add stock' },
};

export function StockActionSheet({
  ingredient: target,
  action,
  token,
  onClose,
  onDone,
}: {
  ingredient: Ingredient | null;
  action: StockAction;
  token: string;
  onClose: () => void;
  onDone: () => Promise<void> | void;
}) {
  const open = !!target;
  // Keep the last ingredient on screen while the sheet animates closed.
  const ingredient = useLastNonNull(target);
  const [qty, setQty] = React.useState('');
  const [cost, setCost] = React.useState('');
  const [note, setNote] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (target) {
      setQty(action === 'adjustment' ? numInput(target.stock_qty < 0 ? 0 : target.stock_qty) : '');
      setCost(numInput(target.avg_cost));
      setNote('');
      setError(null);
    }
  }, [target, action]);

  if (!ingredient) return null;

  const unit = ingredient.unit;
  const n = parseNum(qty);
  const current = ingredient.stock_qty;
  let change: number | null = null;
  if (n !== null && n >= 0) {
    if (action === 'waste') change = -n;
    else if (action === 'opening') change = n;
    else change = round3(n - current);
  }
  const after = change === null ? null : round3(current + change);
  const noDiff = action === 'adjustment' && change === 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (n === null || n < 0 || (action !== 'adjustment' && n === 0)) {
      setError(action === 'adjustment' ? 'Enter the stock you counted (0 or more).' : 'Enter a quantity above 0.');
      return;
    }
    if (noDiff) {
      setError('The count matches the system. Nothing to record.');
      return;
    }
    let unitCost: number | undefined;
    if (action === 'opening' && cost.trim()) {
      const c = parseNum(cost);
      if (c === null || c < 0) {
        setError('Enter a cost of 0 or more, or leave it empty.');
        return;
      }
      unitCost = Math.round(c * 100) / 100;
    }
    setError(null);
    setSaving(true);
    try {
      await adminApi.recordStock(token, ingredient.id, {
        reason: action,
        quantity: round3(n),
        unit_cost: unitCost,
        note: note.trim() || undefined,
      });
      if (action === 'waste') toast.success(`Recorded ${fmtQty(n, unit)} of ${ingredient.name} as waste.`);
      else if (action === 'adjustment') toast.success(`${ingredient.name} set to ${fmtQty(n, unit)} (${fmtSignedQty(change ?? 0, unit)}).`);
      else toast.success(`Added ${fmtQty(n, unit)} of ${ingredient.name}.`);
      await onDone();
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Could not record the stock change.'));
    } finally {
      setSaving(false);
    }
  };

  const copy = ACTION_COPY[action];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`${copy.title}: ${ingredient.name}`}
      description={
        <>
          In stock now: <span className="tnum font-mono font-semibold text-fg">{fmtQty(current, unit)}</span>
        </>
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="stock-action-form" loading={saving} disabled={noDiff} variant={action === 'waste' ? 'danger' : 'primary'}>
            {copy.button}
          </Button>
        </div>
      }
    >
      <form id="stock-action-form" onSubmit={submit} className="grid gap-4 pb-2" noValidate>
        {action === 'adjustment' ? (
          <Input
            label={`Counted stock (${unit})`}
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            hint="What you physically counted on the shelf"
            className="tnum font-mono"
            data-autofocus
          />
        ) : (
          <div className={cn('grid gap-3', action === 'opening' && 'grid-cols-2')}>
            <Input
              label={action === 'waste' ? `Quantity wasted (${unit})` : `Quantity (${unit})`}
              inputMode="decimal"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="0"
              className="tnum font-mono"
              data-autofocus
            />
            {action === 'opening' && (
              <Input label={`Cost per ${unit}`} inputMode="decimal" prefix="₹" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0" className="tnum font-mono" />
            )}
          </div>
        )}
        <Input
          label="Note (optional)"
          value={note}
          maxLength={200}
          onChange={(e) => setNote(e.target.value)}
          placeholder={action === 'waste' ? 'Spoilt overnight, dropped tray…' : action === 'adjustment' ? 'Weekly count' : 'Stock already in the store room'}
        />

        {change !== null && (
          <div className={cn('rounded-xl px-3.5 py-3 text-sm', noDiff ? 'bg-sunk text-muted' : 'bg-sunk text-fg/85')} aria-live="polite">
            {noDiff ? (
              'The count matches the system. Nothing will change.'
            ) : (
              <>
                This records{' '}
                <span className={cn('tnum font-mono font-semibold', change < 0 ? 'text-rose' : 'text-[#1b6f49]')}>{fmtSignedQty(change, unit)}</span>. Stock after:{' '}
                <span className={cn('tnum font-mono font-semibold', after !== null && after < 0 && 'text-rose')}>{fmtQty(after ?? 0, unit)}</span>
                {action === 'waste' && ingredient.avg_cost > 0 && n ? (
                  <>
                    {' '}
                    · about <span className="tnum font-mono font-semibold">{formatINR(n * ingredient.avg_cost)}</span> lost
                  </>
                ) : null}
                .
              </>
            )}
          </div>
        )}

        {action === 'opening' && (
          <p className="text-xs text-muted">For deliveries from a supplier, use a purchase order instead so the cost and supplier are recorded.</p>
        )}
        {error && (
          <p className="rounded-xl bg-rose-soft px-3.5 py-2.5 text-sm font-medium text-[#a1282c]" role="alert">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  );
}
