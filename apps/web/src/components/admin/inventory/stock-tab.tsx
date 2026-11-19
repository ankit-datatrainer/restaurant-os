'use client';

import * as React from 'react';
import { AlertTriangle, Boxes, ClipboardCheck, PackagePlus, Pencil, Plus, Search, Trash, Wallet } from 'lucide-react';
import type { Ingredient } from '@restaurant-os/shared';
import { cn, formatINR } from '@/lib/utils';
import { Badge, Button, EmptyState, Input, Toggle } from '@/components/ui';
import { Chip, ChipRow } from '../page-header';
import { StatTile } from '../stat-tile';
import { DataTable, ListSkeleton, Td, Th, fmtQty, isLow } from './ops-shared';
import { IngredientSheet, StockActionSheet, type StockAction } from './ingredient-sheets';
import type { InventoryContext } from './inventory-view';

export function StockTab({ ctx }: { ctx: InventoryContext }) {
  const { token, canEdit, ingredients, setIngredients, reloadIngredients } = ctx;
  const [q, setQ] = React.useState('');
  const [lowOnly, setLowOnly] = React.useState(false);
  const [showInactive, setShowInactive] = React.useState(false);
  const [editing, setEditing] = React.useState<Ingredient | null>(null);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [actionTarget, setActionTarget] = React.useState<Ingredient | null>(null);
  const [action, setAction] = React.useState<StockAction>('waste');

  const active = (ingredients ?? []).filter((i) => i.is_active);
  const low = active.filter(isLow);
  const stockValue = active.reduce((s, i) => s + Math.max(0, i.stock_qty) * i.avg_cost, 0);
  const inactiveCount = (ingredients ?? []).length - active.length;

  const needle = q.trim().toLowerCase();
  const list = (ingredients ?? [])
    .filter((i) => showInactive || i.is_active)
    .filter((i) => !lowOnly || (i.is_active && isLow(i)))
    .filter((i) => !needle || i.name.toLowerCase().includes(needle))
    .sort((a, b) => Number(b.is_active) - Number(a.is_active) || Number(isLow(b)) - Number(isLow(a)) || a.name.localeCompare(b.name));

  const openEditor = (i: Ingredient | null) => {
    setEditing(i);
    setEditorOpen(true);
  };
  const openAction = (i: Ingredient, a: StockAction) => {
    setAction(a);
    setActionTarget(i);
  };

  const onSaved = (row: Ingredient) => {
    setIngredients((prev) => {
      const list = prev ?? [];
      return list.some((x) => x.id === row.id) ? list.map((x) => (x.id === row.id ? row : x)) : [...list, row];
    });
  };
  const onDeleted = (id: string) => setIngredients((prev) => (prev ?? []).filter((x) => x.id !== id));

  const lowNames = low.slice(0, 4).map((i) => i.name);

  return (
    <div>
      {low.length > 0 && (
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-rose/25 bg-rose-soft px-4 py-3.5 text-[#a1282c] sm:flex-row sm:items-center" role="status">
          <AlertTriangle className="hidden h-5 w-5 shrink-0 sm:block" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {low.length === 1 ? '1 item is running low' : `${low.length} items are running low`}
            </p>
            <p className="mt-0.5 text-sm text-[#a1282c]/85">
              {lowNames.join(', ')}
              {low.length > lowNames.length ? ` and ${low.length - lowNames.length} more` : ''}. Order more before service.
            </p>
          </div>
          {!lowOnly && (
            <Button size="sm" variant="danger" className="self-start sm:self-auto" onClick={() => setLowOnly(true)}>
              Show them
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
        <StatTile label="Ingredients" value={active.length} loading={!ingredients} icon={<Boxes className="h-4 w-4" />} tone="sky" />
        <StatTile label="Running low" value={low.length} loading={!ingredients} icon={<AlertTriangle className="h-4 w-4" />} tone={low.length ? 'ember' : 'mint'} />
        <StatTile
          label="Stock value"
          value={Math.round(stockValue)}
          prefix="₹"
          loading={!ingredients}
          icon={<Wallet className="h-4 w-4" />}
          tone="saffron"
          hint="At average cost"
          className="col-span-2 md:col-span-1"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-[260px]">
          <Input
            aria-label="Search ingredients"
            placeholder="Search ingredients…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            prefix={<Search className="h-4 w-4" />}
            className="h-10"
            inputMode="search"
          />
        </div>
        <ChipRow label="Filter" className="w-auto">
          <Chip active={!lowOnly} onClick={() => setLowOnly(false)} count={active.length}>
            All
          </Chip>
          <Chip active={lowOnly} onClick={() => setLowOnly(true)} count={low.length} tone="ember">
            Low only
          </Chip>
        </ChipRow>
        <div className="ml-auto flex items-center gap-3">
          {inactiveCount > 0 && (
            <Toggle size="sm" checked={showInactive} onChange={setShowInactive} label={<span className="text-sm">Show inactive ({inactiveCount})</span>} />
          )}
          {canEdit && (
            <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => openEditor(null)}>
              Add ingredient
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4">
        {!ingredients ? (
          <ListSkeleton rows={5} />
        ) : list.length === 0 ? (
          <EmptyState
            icon={<Boxes className="h-5 w-5" />}
            title={needle ? `Nothing matches “${q.trim()}”` : lowOnly ? 'Nothing is running low' : 'No ingredients yet'}
            description={
              needle
                ? 'Check the spelling, or add it as a new ingredient.'
                : lowOnly
                  ? 'Every active ingredient is above its low-stock level.'
                  : 'Add what you buy and cook with. Then link them to dishes on the Recipes tab so stock goes down as orders come in.'
            }
            action={
              canEdit && !needle && !lowOnly ? (
                <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => openEditor(null)}>
                  Add your first ingredient
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <DataTable
              from="xl"
              head={
                <tr>
                  <Th>Ingredient</Th>
                  <Th right>In stock</Th>
                  <Th right>Low at</Th>
                  <Th right>Avg cost</Th>
                  <Th right>Value</Th>
                  {canEdit && <Th right>Actions</Th>}
                </tr>
              }
            >
              {list.map((i) => {
                const isLowNow = i.is_active && isLow(i);
                return (
                  <tr key={i.id} className={cn(!i.is_active && 'bg-sunk/40 text-fg/60')}>
                    <Td>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{i.name}</span>
                        {isLowNow && (
                          <Badge tone="rose" dot>
                            Low
                          </Badge>
                        )}
                        {!i.is_active && <Badge tone="neutral">Inactive</Badge>}
                      </div>
                    </Td>
                    <Td right className={cn('tnum whitespace-nowrap font-mono font-semibold', isLowNow && 'text-rose')}>
                      {fmtQty(i.stock_qty, i.unit)}
                    </Td>
                    <Td right className="tnum whitespace-nowrap font-mono text-muted">
                      {fmtQty(i.low_stock_threshold, i.unit)}
                    </Td>
                    <Td right className="tnum whitespace-nowrap font-mono">
                      {formatINR(i.avg_cost)}
                      <span className="text-muted">/{i.unit}</span>
                    </Td>
                    <Td right className="tnum whitespace-nowrap font-mono">
                      {formatINR(Math.max(0, i.stock_qty) * i.avg_cost)}
                    </Td>
                    {canEdit && (
                      <Td right>
                        <RowActions ingredient={i} onAction={openAction} onEdit={openEditor} />
                      </Td>
                    )}
                  </tr>
                );
              })}
            </DataTable>

            <ul className="grid gap-2.5 md:grid-cols-2 xl:hidden">
              {list.map((i) => {
                const isLowNow = i.is_active && isLow(i);
                return (
                  <li key={i.id} className={cn('rounded-2xl border border-line/10 bg-surface p-4 shadow-soft', !i.is_active && 'bg-sunk/40')}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className={cn('font-medium', !i.is_active && 'text-fg/60')}>{i.name}</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {isLowNow && (
                            <Badge tone="rose" dot>
                              Low
                            </Badge>
                          )}
                          {!i.is_active && <Badge tone="neutral">Inactive</Badge>}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={cn('tnum font-mono text-lg font-semibold leading-tight', isLowNow && 'text-rose')}>{fmtQty(i.stock_qty, i.unit)}</p>
                        <p className="tnum font-mono text-xs text-muted">low at {fmtQty(i.low_stock_threshold, i.unit)}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      <span className="tnum font-mono">{formatINR(i.avg_cost)}</span>/{i.unit} · value{' '}
                      <span className="tnum font-mono font-semibold text-fg/80">{formatINR(Math.max(0, i.stock_qty) * i.avg_cost)}</span>
                    </p>
                    {canEdit && (
                      <div className="mt-3 border-t border-line/10 pt-3">
                        <RowActions ingredient={i} onAction={openAction} onEdit={openEditor} stacked />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-center text-xs text-muted">
              {list.length} ingredient{list.length === 1 ? '' : 's'}
            </p>
          </>
        )}
      </div>

      <IngredientSheet
        open={editorOpen}
        ingredient={editing}
        token={token}
        onClose={() => setEditorOpen(false)}
        onSaved={onSaved}
        onDeleted={onDeleted}
      />
      <StockActionSheet ingredient={actionTarget} action={action} token={token} onClose={() => setActionTarget(null)} onDone={reloadIngredients} />
    </div>
  );
}

function RowActions({
  ingredient,
  onAction,
  onEdit,
  stacked,
}: {
  ingredient: Ingredient;
  onAction: (i: Ingredient, a: StockAction) => void;
  onEdit: (i: Ingredient) => void;
  stacked?: boolean;
}) {
  const btn = cn(
    'inline-flex h-8 min-w-0 items-center justify-center rounded-full border border-line/15 text-xs font-semibold text-fg/80 transition hover:border-line/30 hover:bg-fg/5 hover:text-fg active:scale-[0.97]',
    stacked ? 'gap-1 px-1.5' : 'gap-1.5 px-2.5',
  );
  return (
    <div className={cn('flex gap-1.5', stacked ? 'grid grid-cols-4' : 'justify-end')}>
      <button type="button" className={btn} onClick={() => onAction(ingredient, 'waste')} title="Record waste" aria-label={`Record waste for ${ingredient.name}`}>
        <Trash className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className={cn(!stacked && 'hidden 2xl:inline')}>Waste</span>
      </button>
      <button type="button" className={btn} onClick={() => onAction(ingredient, 'adjustment')} title="Stock count" aria-label={`Stock count for ${ingredient.name}`}>
        <ClipboardCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className={cn(!stacked && 'hidden 2xl:inline')}>Count</span>
      </button>
      <button type="button" className={btn} onClick={() => onAction(ingredient, 'opening')} title="Add opening stock" aria-label={`Add opening stock for ${ingredient.name}`}>
        <PackagePlus className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className={cn(!stacked && 'hidden 2xl:inline')}>Add</span>
      </button>
      <button type="button" className={btn} onClick={() => onEdit(ingredient)} title="Edit" aria-label={`Edit ${ingredient.name}`}>
        <Pencil className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className={cn(!stacked && 'hidden 2xl:inline')}>Edit</span>
      </button>
    </div>
  );
}
