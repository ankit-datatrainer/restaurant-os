/**
 * The "Your restaurant" form survives an email-confirmation round trip: it is saved in this browser
 * while the owner types and read back on /admin/setup after they sign in.
 */
export interface RestaurantDraft {
  name: string;
  slug: string;
  /** true once the owner typed their own web address (stop following the name). */
  slugEdited: boolean;
  city: string;
  phone: string;
  ownerName: string;
  tables: number;
  sampleMenu: boolean;
}

const KEY = 'ros-signup-draft';

export const EMPTY_DRAFT: RestaurantDraft = {
  name: '',
  slug: '',
  slugEdited: false,
  city: '',
  phone: '',
  ownerName: '',
  tables: 8,
  sampleMenu: true,
};

export function readDraft(): Partial<RestaurantDraft> | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const d = parsed as Record<string, unknown>;
    const out: Partial<RestaurantDraft> = {};
    if (typeof d.name === 'string') out.name = d.name.slice(0, 80);
    if (typeof d.slug === 'string') out.slug = d.slug.slice(0, 40);
    if (typeof d.slugEdited === 'boolean') out.slugEdited = d.slugEdited;
    if (typeof d.city === 'string') out.city = d.city.slice(0, 60);
    if (typeof d.phone === 'string') out.phone = d.phone.slice(0, 30);
    if (typeof d.ownerName === 'string') out.ownerName = d.ownerName.slice(0, 60);
    if (typeof d.tables === 'number' && Number.isFinite(d.tables)) out.tables = Math.min(100, Math.max(1, Math.round(d.tables)));
    if (typeof d.sampleMenu === 'boolean') out.sampleMenu = d.sampleMenu;
    return out;
  } catch {
    return null;
  }
}

export function saveDraft(patch: Partial<RestaurantDraft>): void {
  try {
    const current = readDraft() ?? {};
    window.localStorage.setItem(KEY, JSON.stringify({ ...current, ...patch }));
  } catch {
    // Private mode or storage blocked: the form still works, it just will not be remembered.
  }
}

export function clearDraft(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** `full_name` saved in the Supabase user metadata at sign-up. */
export function metaName(meta: unknown): string {
  if (meta && typeof meta === 'object' && 'full_name' in meta) {
    const v = (meta as { full_name?: unknown }).full_name;
    if (typeof v === 'string') return v.slice(0, 60);
  }
  return '';
}
