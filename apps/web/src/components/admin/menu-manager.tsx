'use client';

import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Pencil, Plus, Settings2, UtensilsCrossed } from 'lucide-react';
import { toast } from 'sonner';
import type { MenuCategory, MenuItem } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { cn, formatINR } from '@/lib/utils';
import { Button, DishImage, EmptyState, ItemBadgePill, Sheet, Skeleton, Toggle, VegMark } from '@/components/ui';
import { pop } from '@/lib/motion';
import { useAdmin } from './admin-provider';
import { CategoryList } from './category-list';
import { ItemEditor } from './item-editor';
import { Chip, ChipRow, PageHeader } from './page-header';
import { useConfirm } from './confirm-dialog';
import { errorMessage } from './format';

const bySort = <T extends { sort_order: number; name: string }>(a: T, b: T) => a.sort_order - b.sort_order || a.name.localeCompare(b.name);

export function MenuManager() {
  const { token } = useAdmin();
  const reduce = useReducedMotion();
  const { confirm, dialog } = useConfirm();
  const [categories, setCategories] = React.useState<MenuCategory[] | null>(null);
  const [items, setItems] = React.useState<MenuItem[]>([]);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [editor, setEditor] = React.useState<{ open: boolean; item: MenuItem | null }>({ open: false, item: null });
  const [manageOpen, setManageOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    Promise.all([adminApi.categories(token), adminApi.items(token)])
      .then(([cats, its]) => {
        if (cancelled) return;
        const sorted = [...cats].sort(bySort);
        setCategories(sorted);
        setItems(its);
        setSelected((s) => s ?? sorted[0]?.id ?? null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorMessage(e, 'Could not load the menu.'));
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const counts = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const it of items) m.set(it.category_id, (m.get(it.category_id) ?? 0) + 1);
    return m;
  }, [items]);

  const visible = React.useMemo(() => items.filter((i) => i.category_id === selected).sort(bySort), [items, selected]);
  const selectedCategory = categories?.find((c) => c.id === selected) ?? null;

  // --- Category operations ------------------------------------------------
  const addCategory = async (name: string, nameHi: string | null) => {
    try {
      const maxSort = Math.max(0, ...(categories ?? []).map((c) => c.sort_order));
      const created = await adminApi.createCategory(token, { name, name_hi: nameHi, sort_order: maxSort + 1 });
      setCategories((prev) => [...(prev ?? []), created].sort(bySort));
      setSelected(created.id);
      toast.success(`${created.name} added.`);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not add the category.'));
    }
  };

  const renameCategory = async (id: string, name: string, nameHi: string | null) => {
    const prev = categories;
    setCategories((c) => c?.map((x) => (x.id === id ? { ...x, name, name_hi: nameHi } : x)) ?? c);
    try {
      const updated = await adminApi.updateCategory(token, id, { name, name_hi: nameHi });
      setCategories((c) => c?.map((x) => (x.id === id ? updated : x)).sort(bySort) ?? c);
    } catch (e) {
      setCategories(prev);
      toast.error(errorMessage(e, 'Could not rename the category.'));
    }
  };

  const deleteCategory = async (id: string) => {
    const cat = categories?.find((c) => c.id === id);
    if (!cat) return;
    const n = counts.get(id) ?? 0;
    if (n > 0) {
      toast.error(`${cat.name} still has ${n} dish${n === 1 ? '' : 'es'}. Move or delete them first.`);
      return;
    }
    const ok = await confirm({ title: `Delete ${cat.name}?`, description: 'The category is empty, so nothing else changes.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try {
      await adminApi.deleteCategory(token, id);
      setCategories((c) => {
        const next = c?.filter((x) => x.id !== id) ?? c;
        if (selected === id) setSelected(next?.[0]?.id ?? null);
        return next;
      });
      toast.success(`${cat.name} deleted.`);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not delete the category.'));
    }
  };

  const moveCategory = async (id: string, dir: -1 | 1) => {
    if (!categories) return;
    const i = categories.findIndex((c) => c.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= categories.length) return;
    const a = categories[i]!;
    const b = categories[j]!;
    // Swap sort orders; if they collide (both 0), spread them out.
    const aSort = a.sort_order === b.sort_order ? b.sort_order + (dir < 0 ? -1 : 1) : b.sort_order;
    const bSort = a.sort_order === b.sort_order ? a.sort_order : a.sort_order;
    const prev = categories;
    const next = categories.map((c) => (c.id === a.id ? { ...c, sort_order: aSort } : c.id === b.id ? { ...c, sort_order: bSort } : c));
    // Guarantee the visual swap even when sort values tie.
    const reordered = [...next];
    [reordered[i], reordered[j]] = [reordered[j]!, reordered[i]!];
    setCategories(reordered);
    try {
      await Promise.all([adminApi.updateCategory(token, a.id, { sort_order: aSort }), adminApi.updateCategory(token, b.id, { sort_order: bSort })]);
    } catch (e) {
      setCategories(prev);
      toast.error(errorMessage(e, 'Could not reorder categories.'));
    }
  };

  // --- Item operations ----------------------------------------------------
  const toggleAvailability = async (item: MenuItem, is_available: boolean) => {
    setItems((list) => list.map((x) => (x.id === item.id ? { ...x, is_available } : x)));
    try {
      const updated = await adminApi.updateItem(token, item.id, { is_available });
      setItems((list) => list.map((x) => (x.id === item.id ? updated : x)));
    } catch (e) {
      setItems((list) => list.map((x) => (x.id === item.id ? item : x)));
      toast.error(errorMessage(e, 'Could not update availability.'));
    }
  };

  const onSaved = (saved: MenuItem, mode: 'create' | 'update') => {
    setItems((list) => (mode === 'create' ? [...list, saved] : list.map((x) => (x.id === saved.id ? saved : x))));
    if (saved.category_id !== selected) setSelected(saved.category_id);
  };

  const onDeleted = (id: string) => setItems((list) => list.filter((x) => x.id !== id));

  const categoryList = categories && (
    <CategoryList
      categories={categories}
      selectedId={selected}
      counts={counts}
      onSelect={(id) => {
        setSelected(id);
        setManageOpen(false);
      }}
      onAdd={addCategory}
      onRename={renameCategory}
      onDelete={deleteCategory}
      onMove={moveCategory}
      onUpdated={(updated) => setCategories((c) => c?.map((x) => (x.id === updated.id ? updated : x)) ?? c)}
    />
  );

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader
        title="Menu & dishes"
        description="Switch dishes off when they run out; the guest menu updates instantly."
        actions={
          <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditor({ open: true, item: null })} disabled={!categories || categories.length === 0}>
            Add dish
          </Button>
        }
      />

      {error && (
        <p className="mb-4 rounded-xl bg-rose-soft px-4 py-3 text-sm font-medium text-[#a1282c]" role="alert">
          {error}
        </p>
      )}

      {/* Phone: category chips + manage sheet */}
      <div className="mb-4 flex items-center gap-2 lg:hidden">
        <ChipRow label="Categories" className="flex-1">
          {(categories ?? []).map((c) => (
            <Chip key={c.id} active={c.id === selected} onClick={() => setSelected(c.id)} count={counts.get(c.id) ?? 0}>
              {c.name}
            </Chip>
          ))}
        </ChipRow>
        <Button size="sm" variant="outline" leftIcon={<Settings2 className="h-4 w-4" />} onClick={() => setManageOpen(true)} className="shrink-0">
          Manage
        </Button>
      </div>
      <Sheet open={manageOpen} onClose={() => setManageOpen(false)} title="Categories" description="Reorder, rename or add.">
        {categoryList}
      </Sheet>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          {categories ? categoryList : <Skeleton className="h-72 w-full rounded-2xl" />}
          <p className="mt-3 px-2 text-xs text-muted">Hover a category to move it, edit its English and Hindi names, or delete it.</p>
        </aside>

        <section aria-label="Dishes">
          {!categories ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-28 w-full rounded-2xl" />
              ))}
            </div>
          ) : !selectedCategory ? (
            <EmptyState icon={<UtensilsCrossed className="h-5 w-5" />} title="Start with a category" description="Add a category like Starters or Mains, then add dishes to it." />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={<UtensilsCrossed className="h-5 w-5" />}
              title={`No dishes in ${selectedCategory.name} yet`}
              description="Add the first one. Photos make a big difference on the guest menu."
              action={
                <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditor({ open: true, item: null })}>
                  Add dish
                </Button>
              }
            />
          ) : (
            <>
              <p className="mb-3 flex items-baseline gap-2">
                <span className="font-display text-lg font-semibold">{selectedCategory.name}</span>
                <span className="font-mono text-xs text-muted tnum">
                  {visible.length} dish{visible.length === 1 ? '' : 'es'}
                </span>
              </p>
              <motion.ul layout={!reduce} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <AnimatePresence initial={false}>
                  {visible.map((it) => (
                    <motion.li key={it.id} layout={!reduce} variants={pop} initial={reduce ? false : 'hidden'} animate="show" exit="exit">
                      <DishRow item={it} onToggle={(v) => void toggleAvailability(it, v)} onEdit={() => setEditor({ open: true, item: it })} />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </motion.ul>
            </>
          )}
        </section>
      </div>

      {categories && (
        <ItemEditor
          open={editor.open}
          item={editor.item}
          categories={categories}
          defaultCategoryId={selected ?? categories[0]?.id ?? ''}
          token={token}
          onClose={() => setEditor((e) => ({ ...e, open: false }))}
          onSaved={onSaved}
          onDeleted={onDeleted}
        />
      )}
      {dialog}
    </div>
  );
}

function DishRow({ item, onToggle, onEdit }: { item: MenuItem; onToggle: (v: boolean) => void; onEdit: () => void }) {
  return (
    <article className={cn('group flex gap-3 rounded-2xl border border-line/10 bg-surface p-3 shadow-soft transition', !item.is_available && 'opacity-70')}>
      <DishImage src={item.image_url} alt={item.name} isVeg={item.is_veg} className="h-20 w-20 shrink-0 rounded-xl" sizes="80px" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <VegMark isVeg={item.is_veg} className="mt-1" />
          <p className="min-w-0 flex-1 truncate text-[15px] font-semibold leading-tight">{item.name}</p>
          {item.name_hi && (
            <span
              lang="hi"
              className="mt-0.5 inline-flex h-5 shrink-0 items-center rounded-full bg-sky-soft px-1.5 text-[11px] font-semibold leading-none text-[#245a9f]"
              title={`Hindi name: ${item.name_hi}`}
            >
              हिं<span className="sr-only"> Hindi name: {item.name_hi}</span>
            </span>
          )}
          <button type="button" onClick={onEdit} className="-mr-1 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-fg/5 hover:text-fg" aria-label={`Edit ${item.name}`}>
            <Pencil className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 font-mono text-sm font-semibold tnum">{formatINR(item.price)}</p>
        {item.badges.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {item.badges.map((b) => (
              <ItemBadgePill key={b} badge={b} />
            ))}
          </div>
        )}
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className={cn('font-mono text-2xs uppercase tracking-[0.12em]', item.is_available ? 'text-[#1b6f49]' : 'text-muted')}>{item.is_available ? 'Available' : 'Sold out'}</span>
          <Toggle size="sm" checked={item.is_available} onChange={onToggle} id={`avail-${item.id}`} />
        </div>
      </div>
    </article>
  );
}
