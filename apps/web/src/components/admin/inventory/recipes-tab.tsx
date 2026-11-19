'use client';

import * as React from 'react';
import { ChefHat, ChevronRight, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { DishCost, Ingredient, RecipeItem } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { cn, formatINR } from '@/lib/utils';
import { Button, EmptyState, Input, Select, Sheet } from '@/components/ui';
import { Chip, ChipRow } from '../page-header';
import { errorMessage } from '../format';
import { DataTable, ErrorNote, InfoNote, ListSkeleton, Td, Th, fmtQty, numInput, parseNum, round3, useLastNonNull } from './ops-shared';
import type { InventoryContext } from './inventory-view';

type CostTone = 'mint' | 'saffron' | 'rose' | 'none';

export function costTone(pct: number | null): CostTone {
  if (pct === null) return 'none';
  if (pct <= 30) return 'mint';
  if (pct <= 40) return 'saffron';
  return 'rose';
}

const TONE_TEXT: Record<CostTone, string> = {
  mint: 'text-[#1b6f49]',
  saffron: 'text-[#8a5a00]',
  rose: 'text-[#a1282c]',
  none: 'text-muted',
};
const TONE_BG: Record<CostTone, string> = {
  mint: 'bg-mint-soft',
  saffron: 'bg-saffron-soft',
  rose: 'bg-rose-soft',
  none: 'bg-sunk',
};

function CostPill({ pct }: { pct: number | null }) {
  const tone = costTone(pct);
  return (
    <span className={cn('tnum inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-xs font-semibold', TONE_BG[tone], TONE_TEXT[tone])}>
      {pct === null ? 'No recipe' : `${pct.toFixed(1)}%`}
    </span>
  );
}

type Filter = 'all' | 'missing' | 'high';

export function RecipesTab({ ctx }: { ctx: InventoryContext }) {
  const { token, canEdit, ingredients, loadFailed } = ctx;
  const [dishes, setDishes] = React.useState<DishCost[] | null>(null);
  const [recipes, setRecipes] = React.useState<RecipeItem[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [q, setQ] = React.useState('');
  const [filter, setFilter] = React.useState<Filter>('all');
  const [selected, setSelected] = React.useState<DishCost | null>(null);

  const load = React.useCallback(async () => {
    try {
      const [d, r] = await Promise.all([adminApi.dishCosts(token), adminApi.recipes(token)]);
      setDishes(d);
      setRecipes(r);
      setError(null);
    } catch (e) {
      setError(loadFailed(e, 'Could not load dishes and recipes.'));
      setDishes((p) => p ?? []);
      setRecipes((p) => p ?? []);
    }
  }, [token, loadFailed]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const all = dishes ?? [];
  const missing = all.filter((d) => d.food_cost_pct === null).length;
  const high = all.filter((d) => d.food_cost_pct !== null && d.food_cost_pct > 40).length;
  const withRecipe = all.filter((d) => d.food_cost_pct !== null);
  const avgPct = withRecipe.length ? withRecipe.reduce((s, d) => s + (d.food_cost_pct ?? 0), 0) / withRecipe.length : null;

  const needle = q.trim().toLowerCase();
  const list = all
    .filter((d) => (filter === 'missing' ? d.food_cost_pct === null : filter === 'high' ? (d.food_cost_pct ?? 0) > 40 : true))
    .filter((d) => !needle || d.name.toLowerCase().includes(needle));

  return (
    <div>
      <InfoNote className="mb-4">
        Give each dish a recipe: the ingredients one portion uses. Stock is deducted automatically when the kitchen accepts an order, and given back if the order is
        cancelled. Food cost uses each ingredient’s average purchase cost.
      </InfoNote>

      {error && <ErrorNote className="mb-4">{error}</ErrorNote>}

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-[260px]">
          <Input
            aria-label="Search dishes"
            placeholder="Search dishes…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            prefix={<Search className="h-4 w-4" />}
            className="h-10"
            inputMode="search"
          />
        </div>
        <ChipRow label="Filter dishes" className="w-auto max-w-full">
          <Chip active={filter === 'all'} onClick={() => setFilter('all')} count={all.length}>
            All dishes
          </Chip>
          <Chip active={filter === 'missing'} onClick={() => setFilter('missing')} count={missing}>
            No recipe
          </Chip>
          <Chip active={filter === 'high'} onClick={() => setFilter('high')} count={high} tone="ember">
            Over 40%
          </Chip>
        </ChipRow>
        {avgPct !== null && (
          <p className="text-sm text-muted sm:ml-auto">
            Average food cost <span className={cn('tnum font-mono font-semibold', TONE_TEXT[costTone(avgPct)])}>{avgPct.toFixed(1)}%</span>
          </p>
        )}
      </div>

      <div className="mt-4">
        {!dishes ? (
          <ListSkeleton rows={6} />
        ) : list.length === 0 ? (
          <EmptyState
            icon={<ChefHat className="h-5 w-5" />}
            title={all.length === 0 ? 'No dishes on your menu yet' : needle ? `No dish matches “${q.trim()}”` : filter === 'missing' ? 'Every dish has a recipe' : 'No dish is over 40%'}
            description={all.length === 0 ? 'Add dishes on the Menu page first, then come back to give them recipes.' : undefined}
            action={all.length === 0 ? <Button size="sm" href="/admin/menu">Go to Menu</Button> : undefined}
          />
        ) : (
          <>
            <DataTable
              head={
                <tr>
                  <Th>Dish</Th>
                  <Th right>Price</Th>
                  <Th right>Food cost</Th>
                  <Th right>Food cost %</Th>
                  <Th right>Ingredients</Th>
                  <Th className="w-10" />
                </tr>
              }
            >
              {list.map((d) => (
                <tr key={d.menu_item_id} className="cursor-pointer transition hover:bg-sunk/40" onClick={() => setSelected(d)}>
                  <Td>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(d);
                      }}
                      className="rounded-md text-left font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
                      aria-label={`${canEdit ? 'Edit' : 'View'} the recipe for ${d.name}`}
                    >
                      {d.name}
                    </button>
                  </Td>
                  <Td right className="tnum font-mono">
                    {formatINR(d.price)}
                  </Td>
                  <Td right className={cn('tnum font-mono', d.food_cost_pct === null && 'text-muted')}>
                    {d.food_cost_pct === null ? '—' : formatINR(d.food_cost)}
                  </Td>
                  <Td right>
                    <CostPill pct={d.food_cost_pct} />
                  </Td>
                  <Td right className="tnum font-mono text-muted">
                    {d.ingredients || '—'}
                  </Td>
                  <Td>
                    <ChevronRight className="h-4 w-4 text-muted" aria-hidden />
                  </Td>
                </tr>
              ))}
            </DataTable>

            <ul className="grid gap-2.5 md:grid-cols-2 lg:hidden">
              {list.map((d) => (
                <li key={d.menu_item_id}>
                  <button
                    type="button"
                    onClick={() => setSelected(d)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-line/10 bg-surface p-4 text-left shadow-soft transition active:scale-[0.99]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{d.name}</p>
                      <p className="mt-1 text-xs text-muted">
                        <span className="tnum font-mono">{formatINR(d.price)}</span>
                        {d.food_cost_pct !== null && (
                          <>
                            {' '}
                            · cost <span className="tnum font-mono">{formatINR(d.food_cost)}</span> · {d.ingredients} ingredient{d.ingredients === 1 ? '' : 's'}
                          </>
                        )}
                      </p>
                    </div>
                    <CostPill pct={d.food_cost_pct} />
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-center text-xs text-muted">Up to 30% is healthy for most dishes · 30–40% is worth watching · over 40% eats your margin</p>
          </>
        )}
      </div>

      <RecipeSheet
        dish={selected}
        token={token}
        canEdit={canEdit}
        ingredients={ingredients ?? []}
        lines={selected ? (recipes ?? []).filter((r) => r.menu_item_id === selected.menu_item_id) : []}
        onClose={() => setSelected(null)}
        onSaved={load}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recipe editor
// ---------------------------------------------------------------------------

interface Line {
  key: string;
  ingredient_id: string;
  quantity: string;
}

let lineSeq = 0;
const newKey = () => `l${++lineSeq}`;

function RecipeSheet({
  dish: target,
  token,
  canEdit,
  ingredients,
  lines: saved,
  onClose,
  onSaved,
}: {
  dish: DishCost | null;
  token: string;
  canEdit: boolean;
  ingredients: Ingredient[];
  lines: RecipeItem[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const dish = useLastNonNull(target);
  const [lines, setLines] = React.useState<Line[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  // Reset only when a different dish opens, never while typing.
  const openId = target?.menu_item_id ?? null;
  const savedRef = React.useRef(saved);
  savedRef.current = saved;
  React.useEffect(() => {
    if (!openId) return;
    const rows = savedRef.current.map((r) => ({ key: newKey(), ingredient_id: r.ingredient_id, quantity: numInput(r.quantity) }));
    setLines(rows.length ? rows : [{ key: newKey(), ingredient_id: '', quantity: '' }]);
    setError(null);
  }, [openId]);

  const byId = React.useMemo(() => {
    const m = new Map<string, Pick<Ingredient, 'id' | 'name' | 'unit' | 'avg_cost' | 'is_active'>>();
    for (const r of saved) if (r.ingredient) m.set(r.ingredient_id, { ...r.ingredient, is_active: false });
    for (const i of ingredients) m.set(i.id, i);
    return m;
  }, [ingredients, saved]);

  const options = React.useMemo(
    () => [...byId.values()].filter((i) => i.is_active || lines.some((l) => l.ingredient_id === i.id)).sort((a, b) => a.name.localeCompare(b.name)),
    [byId, lines],
  );

  if (!dish) return null;

  const lineCost = (l: Line) => {
    const ing = byId.get(l.ingredient_id);
    const n = parseNum(l.quantity);
    return ing && n !== null && n > 0 ? n * ing.avg_cost : 0;
  };
  const total = lines.reduce((s, l) => s + lineCost(l), 0);
  const pct = dish.price > 0 && total > 0 ? Math.round((total / dish.price) * 1000) / 10 : null;
  const tone = costTone(pct);
  const used = new Set(lines.map((l) => l.ingredient_id).filter(Boolean));

  const setLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const filled = lines.filter((l) => l.ingredient_id || l.quantity.trim());
    const out: Array<{ ingredient_id: string; quantity: number }> = [];
    for (const l of filled) {
      const n = parseNum(l.quantity);
      if (!l.ingredient_id) {
        setError('Pick an ingredient on every line, or remove the empty line.');
        return;
      }
      if (n === null || n <= 0) {
        setError(`Enter how much ${byId.get(l.ingredient_id)?.name ?? 'of each ingredient'} one portion uses.`);
        return;
      }
      out.push({ ingredient_id: l.ingredient_id, quantity: round3(n) });
    }
    if (new Set(out.map((o) => o.ingredient_id)).size !== out.length) {
      setError('Each ingredient can appear once. Add the quantities together instead.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await adminApi.saveRecipe(token, dish.menu_item_id, out);
      toast.success(out.length ? `Recipe for ${dish.name} saved.` : `Recipe for ${dish.name} cleared.`);
      await onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Could not save the recipe.'));
    } finally {
      setSaving(false);
    }
  };

  const noIngredients = ingredients.filter((i) => i.is_active).length === 0;

  return (
    <Sheet
      open={!!target}
      onClose={onClose}
      side="right"
      title={dish.name}
      description={
        <>
          Menu price <span className="tnum font-mono font-semibold text-fg">{formatINR(dish.price)}</span>. Quantities are for one portion.
        </>
      }
      className="md:max-w-xl"
      footer={
        canEdit ? (
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="recipe-form" loading={saving} disabled={noIngredients && lines.every((l) => !l.ingredient_id)}>
              Save recipe
            </Button>
          </div>
        ) : undefined
      }
    >
      <form id="recipe-form" onSubmit={save} className="grid gap-4 pb-2" noValidate>
        <div className={cn('grid grid-cols-3 gap-2 rounded-2xl p-3.5', TONE_BG[tone])} aria-live="polite">
          <div>
            <p className="font-mono text-2xs uppercase tracking-[0.14em] text-muted">Food cost</p>
            <p className="tnum mt-0.5 font-mono text-lg font-semibold">{formatINR(total)}</p>
          </div>
          <div>
            <p className="font-mono text-2xs uppercase tracking-[0.14em] text-muted">Of price</p>
            <p className={cn('tnum mt-0.5 font-mono text-lg font-semibold', TONE_TEXT[tone])}>{pct === null ? '—' : `${pct.toFixed(1)}%`}</p>
          </div>
          <div>
            <p className="font-mono text-2xs uppercase tracking-[0.14em] text-muted">Margin</p>
            <p className="tnum mt-0.5 font-mono text-lg font-semibold">{formatINR(Math.max(0, dish.price - total))}</p>
          </div>
        </div>

        {noIngredients ? (
          <EmptyState title="Add ingredients first" description="Recipes are built from your ingredients. Add them on the Stock tab, then come back." className="py-8" />
        ) : (
          <>
            <ul className="grid gap-2.5">
              {lines.map((l, idx) => {
                const ing = byId.get(l.ingredient_id);
                const cost = lineCost(l);
                return (
                  <li key={l.key} className="rounded-2xl border border-line/10 p-3">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_120px_auto]">
                      <Select
                        aria-label={`Ingredient ${idx + 1}`}
                        value={l.ingredient_id}
                        onChange={(e) => setLine(l.key, { ingredient_id: e.target.value })}
                        disabled={!canEdit}
                        className="h-10"
                      >
                        <option value="">Choose an ingredient…</option>
                        {options.map((o) => (
                          <option key={o.id} value={o.id} disabled={o.id !== l.ingredient_id && used.has(o.id)}>
                            {o.name} ({o.unit}){o.is_active ? '' : ' · inactive'}
                          </option>
                        ))}
                      </Select>
                      <div className="order-3 col-span-2 sm:order-none sm:col-span-1">
                        <Input
                          aria-label={`Quantity per portion${ing ? ` in ${ing.unit}` : ''}`}
                          inputMode="decimal"
                          value={l.quantity}
                          onChange={(e) => setLine(l.key, { quantity: e.target.value })}
                          placeholder={ing?.unit === 'kg' || ing?.unit === 'l' ? '0.150' : '1'}
                          disabled={!canEdit}
                          className="tnum h-10 font-mono"
                        />
                      </div>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [{ key: newKey(), ingredient_id: '', quantity: '' }]))}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted transition hover:bg-rose-soft hover:text-rose"
                          aria-label={`Remove ${ing?.name ?? 'this line'}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <p className="mt-1.5 flex justify-between gap-2 text-xs text-muted">
                      <span>
                        {ing ? (
                          <>
                            {ing.unit} per portion · <span className="tnum font-mono">{formatINR(ing.avg_cost)}</span>/{ing.unit}
                            {l.quantity && parseNum(l.quantity) !== null ? (
                              <>
                                {' '}
                                · uses {fmtQty(parseNum(l.quantity) ?? 0, ing.unit)}
                              </>
                            ) : null}
                          </>
                        ) : (
                          'Pick an ingredient'
                        )}
                      </span>
                      <span className="tnum shrink-0 font-mono font-semibold text-fg/80">{formatINR(cost)}</span>
                    </p>
                    {ing && ing.avg_cost === 0 && <p className="mt-1 text-xs text-[#8a5a00]">No cost recorded for {ing.name} yet, so it counts as ₹0.</p>}
                  </li>
                );
              })}
            </ul>
            {canEdit && lines.length < 30 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                leftIcon={<Plus className="h-4 w-4" />}
                className="justify-self-start"
                onClick={() => setLines((ls) => [...ls, { key: newKey(), ingredient_id: '', quantity: '' }])}
              >
                Add ingredient
              </Button>
            )}
            {canEdit && <p className="text-xs text-muted">Saving replaces the whole recipe. Remove every line and save to stop tracking stock for this dish.</p>}
          </>
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
