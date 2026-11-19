'use client';

import * as React from 'react';
import { ImagePlus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import type { ItemBadge, MenuCategory, MenuItem } from '@restaurant-os/shared';
import { ITEM_BADGES, ITEM_BADGE_LABEL } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button, DishImage, Input, Select, Sheet, Textarea, Toggle } from '@/components/ui';
import { useConfirm } from './confirm-dialog';
import { OptionGroupsEditor, fromGroupDrafts, toGroupDrafts, type GroupDraft } from './option-groups-editor';
import { errorMessage, slugify } from './format';

interface Draft {
  name: string;
  description: string;
  name_hi: string;
  description_hi: string;
  price: string;
  category_id: string;
  is_veg: boolean;
  badges: ItemBadge[];
  image_url: string;
  prep_minutes: string;
  sort_order: string;
  hsn_code: string;
  is_available: boolean;
  option_groups: GroupDraft[];
}

function toDraft(item: MenuItem | null, defaultCategoryId: string): Draft {
  return {
    name: item?.name ?? '',
    description: item?.description ?? '',
    name_hi: item?.name_hi ?? '',
    description_hi: item?.description_hi ?? '',
    price: item ? String(item.price) : '',
    category_id: item?.category_id ?? defaultCategoryId,
    is_veg: item?.is_veg ?? true,
    badges: item?.badges ?? [],
    image_url: item?.image_url ?? '',
    prep_minutes: item?.prep_minutes != null ? String(item.prep_minutes) : '',
    sort_order: item ? String(item.sort_order) : '',
    hsn_code: item?.hsn_code ?? '',
    is_available: item?.is_available ?? true,
    option_groups: toGroupDrafts(item?.option_groups ?? []),
  };
}

export function ItemEditor({
  open,
  item,
  categories,
  defaultCategoryId,
  token,
  onClose,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  item: MenuItem | null;
  categories: MenuCategory[];
  defaultCategoryId: string;
  token: string;
  onClose: () => void;
  onSaved: (item: MenuItem, mode: 'create' | 'update') => void;
  onDeleted: (id: string) => void;
}) {
  const [draft, setDraft] = React.useState<Draft>(() => toDraft(item, defaultCategoryId));
  const [errors, setErrors] = React.useState<Partial<Record<keyof Draft, string>>>({});
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const { confirm, dialog } = useConfirm();

  // Reset the form whenever the sheet opens for a different item.
  React.useEffect(() => {
    if (open) {
      setDraft(toDraft(item, defaultCategoryId));
      setErrors({});
    }
  }, [open, item, defaultCategoryId]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const toggleBadge = (b: ItemBadge) => set('badges', draft.badges.includes(b) ? draft.badges.filter((x) => x !== b) : [...draft.badges, b]);

  const upload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Choose an image file (JPG, PNG or WebP).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Keep images under 5 MB.');
      return;
    }
    setUploading(true);
    try {
      const { url } = await adminApi.uploadImage(token, file);
      set('image_url', url);
      toast.success('Photo uploaded.');
    } catch (e) {
      toast.error(errorMessage(e, 'Upload failed.'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const validate = (): { body: Partial<MenuItem> & { name: string; price: number; category_id: string } } | null => {
    const next: Partial<Record<keyof Draft, string>> = {};
    const name = draft.name.trim();
    if (!name) next.name = 'Give the dish a name.';
    const nameHi = draft.name_hi.trim();
    if (nameHi.length > 100) next.name_hi = 'Keep the Hindi name under 100 characters.';
    const descriptionHi = draft.description_hi.trim();
    if (descriptionHi.length > 600) next.description_hi = 'Keep the Hindi description under 600 characters.';
    const price = Number(draft.price);
    if (draft.price.trim() === '' || !Number.isFinite(price) || price < 0) next.price = 'Enter a price in rupees (0 or more).';
    if (!draft.category_id) next.category_id = 'Pick a category.';
    const prep = draft.prep_minutes.trim() === '' ? null : Number(draft.prep_minutes);
    if (prep !== null && (!Number.isInteger(prep) || prep < 0)) next.prep_minutes = 'Whole minutes only.';
    const sort = draft.sort_order.trim() === '' ? null : Number(draft.sort_order);
    if (sort !== null && !Number.isInteger(sort)) next.sort_order = 'Whole number only.';
    const hsn = draft.hsn_code.trim();
    if (hsn && !/^\d{4,8}$/.test(hsn)) next.hsn_code = 'HSN / SAC codes are 4 to 8 digits.';
    const image = draft.image_url.trim();
    if (image && !/^https?:\/\//i.test(image)) next.image_url = 'Use a full https:// image link, or upload a file.';
    const groups = fromGroupDrafts(draft.option_groups, slugify);
    if ('error' in groups) next.option_groups = groups.error;
    setErrors(next);
    if (Object.keys(next).length > 0 || 'error' in groups) return null;
    return {
      body: {
        name,
        description: draft.description.trim() || null,
        name_hi: nameHi || null,
        description_hi: descriptionHi || null,
        price: Math.round(price * 100) / 100,
        category_id: draft.category_id,
        is_veg: draft.is_veg,
        badges: draft.badges,
        image_url: image || null,
        prep_minutes: prep,
        // Only when it changed, so saving a dish never depends on the column otherwise.
        ...(hsn !== (item?.hsn_code ?? '') ? { hsn_code: hsn || null } : {}),
        is_available: draft.is_available,
        option_groups: groups.groups,
        ...(sort !== null ? { sort_order: sort } : {}),
      },
    };
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate();
    if (!v) {
      toast.error('Fix the highlighted fields.');
      return;
    }
    setSaving(true);
    try {
      if (item) {
        const updated = await adminApi.updateItem(token, item.id, v.body);
        onSaved(updated, 'update');
        toast.success(`${updated.name} saved.`);
      } else {
        const created = await adminApi.createItem(token, v.body);
        onSaved(created, 'create');
        toast.success(`${created.name} added to the menu.`);
      }
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save the dish.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!item) return;
    const ok = await confirm({
      title: `Delete ${item.name}?`,
      description: 'It disappears from the guest menu immediately. Past orders keep their own copy of the name and price.',
      confirmLabel: 'Delete dish',
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await adminApi.deleteItem(token, item.id);
      onDeleted(item.id);
      toast.success(`${item.name} deleted.`);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete the dish.'));
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
        title={item ? 'Edit dish' : 'Add dish'}
        description={item ? 'Changes go live on the guest menu as soon as you save.' : 'New dishes are available immediately unless you switch them off.'}
        className="md:max-w-lg"
        footer={
          <div className="flex items-center gap-2">
            {item && (
              <Button type="button" variant="ghost" size="sm" loading={deleting} leftIcon={<Trash2 className="h-4 w-4" />} onClick={() => void remove()} className="text-rose hover:bg-rose-soft">
                Delete
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" form="item-editor-form" loading={saving}>
                {item ? 'Save changes' : 'Add dish'}
              </Button>
            </div>
          </div>
        }
      >
        <form id="item-editor-form" onSubmit={save} className="grid gap-5 pb-2" noValidate>
          {/* Photo */}
          <div className="flex items-start gap-4">
            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-sunk">
              {draft.image_url.trim() ? (
                // Same component as the guest menu, so the preview fails exactly where guests would see it fail.
                <DishImage src={draft.image_url.trim()} alt={draft.name || 'Dish'} isVeg={draft.is_veg} sizes="96px" className="h-full w-full" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-muted" aria-hidden>
                  <ImagePlus className="h-6 w-6" />
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <Input label="Image URL" value={draft.image_url} onChange={(e) => set('image_url', e.target.value)} placeholder="https://…" error={errors.image_url} />
              <div className="mt-2 flex items-center gap-2">
                <input ref={fileRef} type="file" accept="image/*" className="sr-only" id="dish-photo-upload" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
                <Button type="button" size="sm" variant="outline" loading={uploading} leftIcon={<Upload className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>
                  Upload
                </Button>
                <span className="text-xs text-muted">JPG, PNG or WebP up to 5 MB</span>
              </div>
            </div>
          </div>

          <Input label="Name" value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="Paneer Tikka" error={errors.name} data-autofocus />
          <Textarea label="Description" value={draft.description} onChange={(e) => set('description', e.target.value)} placeholder="Char-grilled cottage cheese, mint chutney, onion rings." className="min-h-[72px]" />

          <div className="grid gap-3 rounded-2xl border border-line/10 p-3.5">
            <p className="text-xs text-muted">Shown to guests reading the menu in Hindi. Leave empty to show the English text instead.</p>
            <Input
              label="Name in Hindi (optional)"
              lang="hi"
              value={draft.name_hi}
              maxLength={100}
              onChange={(e) => set('name_hi', e.target.value)}
              placeholder="पनीर टिक्का"
              error={errors.name_hi}
            />
            <Textarea
              label="Description in Hindi (optional)"
              lang="hi"
              value={draft.description_hi}
              maxLength={600}
              onChange={(e) => set('description_hi', e.target.value)}
              placeholder="तंदूर में सिका पनीर, पुदीने की चटनी और प्याज़ के साथ।"
              className="min-h-[72px]"
              error={errors.description_hi}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Price" inputMode="decimal" prefix="₹" value={draft.price} onChange={(e) => set('price', e.target.value)} placeholder="249" error={errors.price} className="tnum font-mono" />
            <Select label="Category" value={draft.category_id} onChange={(e) => set('category_id', e.target.value)} hint={errors.category_id}>
              <option value="">Choose…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>

          <Toggle checked={draft.is_veg} onChange={(v) => set('is_veg', v)} label="Vegetarian" description={draft.is_veg ? 'Shows the green veg mark' : 'Shows the brown non-veg mark'} />

          <div>
            <p className="mb-1.5 text-[13px] font-semibold text-fg/80">Badges</p>
            <div className="flex flex-wrap gap-1.5">
              {ITEM_BADGES.map((b) => {
                const on = draft.badges.includes(b);
                return (
                  <button
                    key={b}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleBadge(b)}
                    className={cn(
                      'inline-flex h-8 items-center rounded-full border px-3 font-mono text-2xs font-medium uppercase tracking-[0.12em] transition',
                      on ? 'border-ember bg-ember text-white' : 'border-line/15 bg-surface text-fg/70 hover:border-line/30',
                    )}
                  >
                    {ITEM_BADGE_LABEL[b]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Prep minutes" inputMode="numeric" value={draft.prep_minutes} onChange={(e) => set('prep_minutes', e.target.value)} placeholder="15" error={errors.prep_minutes} hint="Shown to guests as a wait estimate" className="tnum font-mono" />
            <Input label="Sort order" inputMode="numeric" value={draft.sort_order} onChange={(e) => set('sort_order', e.target.value)} placeholder="10" error={errors.sort_order} hint="Lower shows first" className="tnum font-mono" />
          </div>

          <Input
            label="HSN / SAC code (optional)"
            inputMode="numeric"
            maxLength={8}
            value={draft.hsn_code}
            onChange={(e) => set('hsn_code', e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="996331"
            error={errors.hsn_code}
            hint="Printed on GST invoices. Restaurant service is usually SAC 996331."
            className="tnum font-mono"
          />

          <Toggle checked={draft.is_available} onChange={(v) => set('is_available', v)} label="Available to order" description={draft.is_available ? 'Guests can add it to their cart' : 'Shown as sold out on the menu'} />

          <div>
            <p className="text-[13px] font-semibold text-fg/80">Options</p>
            <p className="mb-3 text-xs text-muted">Portions, spice levels or add-ons. Price changes are added to the base price.</p>
            {errors.option_groups && <p className="mb-2 text-xs text-rose">{errors.option_groups}</p>}
            <OptionGroupsEditor groups={draft.option_groups} onChange={(g) => set('option_groups', g)} />
          </div>
        </form>
      </Sheet>
      {dialog}
    </>
  );
}
