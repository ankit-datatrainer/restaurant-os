'use client';

import * as React from 'react';
import { ArrowRight, Check, Loader2, LogOut, Minus, Plus, X } from 'lucide-react';
import { SLUG_RE, slugify, type Restaurant } from '@restaurant-os/shared';
import { accountApi, ApiRequestError, publicApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button, Input, Toggle } from '@/components/ui';
import { EMPTY_DRAFT, clearDraft, readDraft, saveDraft, type RestaurantDraft } from './draft';
import { FormError } from './parts';

type SlugStatus = 'idle' | 'invalid' | 'checking' | 'available' | 'taken' | 'error';

const MIN_TABLES = 1;
const MAX_TABLES = 100;

/** Lenient while typing; SLUG_RE decides on submit. */
function cleanSlugInput(v: string): string {
  return v
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 40);
}

function withSuffix(base: string, suffix: string): string {
  const room = 40 - suffix.length - 1;
  const head = base.slice(0, Math.max(0, room)).replace(/-+$/g, '');
  return `${head}-${suffix}`;
}

function suggestionCandidates(slug: string, city: string): string[] {
  const out: string[] = [];
  const c = slugify(city);
  if (c && !slug.endsWith(`-${c}`)) out.push(withSuffix(slug, c));
  for (const n of [2, 3, 4, 5]) out.push(withSuffix(slug, String(n)));
  return Array.from(new Set(out)).filter((s) => SLUG_RE.test(s) && s !== slug);
}

function isAbort(e: unknown): boolean {
  return e instanceof Error && e.name === 'AbortError';
}

export interface RestaurantFormProps {
  token: string;
  email: string;
  /** Used when there is no saved draft (e.g. the name given at sign-up). */
  defaultOwnerName?: string;
  onCreated: (restaurant: Restaurant) => Promise<void> | void;
  onSignOut: () => void;
}

/** Step 2 "Your restaurant", used by /signup and /admin/setup. */
export function RestaurantForm({ token, email, defaultOwnerName, onCreated, onSignOut }: RestaurantFormProps) {
  const [draft, setDraft] = React.useState<RestaurantDraft>(() => {
    const saved = typeof window === 'undefined' ? null : readDraft();
    const merged = { ...EMPTY_DRAFT, ...(saved ?? {}) };
    if (!merged.ownerName && defaultOwnerName) merged.ownerName = defaultOwnerName.slice(0, 60);
    if (!merged.slugEdited && merged.name) merged.slug = slugify(merged.name);
    return merged;
  });
  const [host, setHost] = React.useState('');
  const [slugStatus, setSlugStatus] = React.useState<SlugStatus>('idle');
  const [suggestions, setSuggestions] = React.useState<string[]>([]);
  const [recheck, setRecheck] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [alreadyOwner, setAlreadyOwner] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const cityRef = React.useRef(draft.city);
  cityRef.current = draft.city;

  React.useEffect(() => {
    setHost(window.location.host);
  }, []);

  // Remember everything typed so far (survives a reload or an email-confirmation round trip).
  React.useEffect(() => {
    saveDraft(draft);
  }, [draft]);

  const set = <K extends keyof RestaurantDraft>(key: K, value: RestaurantDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const onName = (name: string) =>
    setDraft((d) => ({ ...d, name, slug: d.slugEdited ? d.slug : slugify(name) }));

  const onSlug = (raw: string) => {
    const slug = cleanSlugInput(raw);
    // Clearing the field links the address back to the restaurant name.
    setDraft((d) => (slug ? { ...d, slug, slugEdited: true } : { ...d, slug: slugify(d.name), slugEdited: false }));
  };

  const pickSuggestion = (s: string) => setDraft((d) => ({ ...d, slug: s, slugEdited: true }));

  // Live availability check, debounced.
  React.useEffect(() => {
    const slug = draft.slug;
    setSuggestions([]);
    if (!slug) {
      setSlugStatus('idle');
      return;
    }
    if (!SLUG_RE.test(slug)) {
      // Do not nag while the address is still following a half-typed name.
      setSlugStatus(!draft.slugEdited && slug.length < 3 ? 'idle' : 'invalid');
      return;
    }
    setSlugStatus('checking');
    const ctrl = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const { available } = await publicApi.slugAvailable(slug, ctrl.signal);
        if (available) {
          setSlugStatus('available');
          return;
        }
        setSlugStatus('taken');
        const candidates = suggestionCandidates(slug, cityRef.current);
        const checked = await Promise.all(
          candidates.map((c) =>
            publicApi
              .slugAvailable(c, ctrl.signal)
              .then((r) => (r.available ? c : null))
              .catch(() => null),
          ),
        );
        if (!ctrl.signal.aborted) setSuggestions(checked.filter((c): c is string => Boolean(c)).slice(0, 3));
      } catch (e) {
        if (!isAbort(e) && !ctrl.signal.aborted) setSlugStatus('error');
      }
    }, 400);
    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [draft.slug, draft.slugEdited, recheck]);

  const setTables = (n: number) => set('tables', Math.min(MAX_TABLES, Math.max(MIN_TABLES, Math.round(Number.isFinite(n) ? n : MIN_TABLES))));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = draft.name.trim();
    if (name.length < 2) {
      setError('Add your restaurant’s name.');
      return;
    }
    if (!SLUG_RE.test(draft.slug)) {
      setError('Pick a web address of 3–40 lowercase letters, numbers or dashes. It cannot start or end with a dash.');
      return;
    }
    if (slugStatus === 'taken') {
      setError('That web address is taken. Pick one of the suggestions or type another.');
      return;
    }
    setBusy(true);
    setError(null);
    setAlreadyOwner(false);
    try {
      const restaurant = await accountApi.createRestaurant(token, {
        name,
        slug: draft.slug,
        city: draft.city.trim() || undefined,
        phone: draft.phone.trim() || undefined,
        owner_name: draft.ownerName.trim() || undefined,
        tables: draft.tables,
        sample_menu: draft.sampleMenu,
      });
      clearDraft();
      await onCreated(restaurant);
    } catch (err) {
      const msg = err instanceof ApiRequestError || err instanceof Error ? err.message : 'Could not create your restaurant. Try again.';
      setError(msg);
      if (/already belongs/i.test(msg)) setAlreadyOwner(true);
      if (/web address|slug/i.test(msg) && /taken/i.test(msg)) {
        setSlugStatus('taken');
        setRecheck((n) => n + 1);
      }
      setBusy(false);
    }
  };

  const fullAddress = `${host}/r/${draft.slug || 'your-restaurant'}`;

  return (
    <form onSubmit={submit} className="mt-8 grid gap-5 rounded-3xl border border-line/10 bg-surface p-5 shadow-soft sm:p-6" noValidate>
      <Input
        label="Restaurant name"
        name="restaurant-name"
        value={draft.name}
        maxLength={80}
        autoComplete="organization"
        onChange={(e) => onName(e.target.value)}
        placeholder="Saffron Lane Café"
        autoFocus
        required
      />

      <div className="grid gap-1.5">
        <Input
          label="Web address"
          name="slug"
          value={draft.slug}
          onChange={(e) => onSlug(e.target.value)}
          prefix={<span className="font-mono text-[13px]">/r/</span>}
          className="pl-11 font-mono text-[14px]"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          inputMode="url"
          placeholder="saffron-lane"
          aria-describedby="slug-status"
          suffix={<SlugIcon status={slugStatus} />}
        />
        <div id="slug-status" aria-live="polite" className="min-w-0 text-xs">
          <p className="break-all text-muted">
            Guests order takeaway and book tables at <span className="font-mono text-fg/80">{fullAddress}</span>
          </p>
          {slugStatus === 'available' && <p className="mt-1 font-medium text-[#1b6f49]">Available, it’s yours.</p>}
          {slugStatus === 'invalid' && (
            <p className="mt-1 font-medium text-[#a1282c]">Use 3–40 lowercase letters, numbers or dashes, not starting or ending with a dash.</p>
          )}
          {slugStatus === 'error' && <p className="mt-1 text-muted">We could not check this address right now. We’ll check again when you continue.</p>}
          {slugStatus === 'taken' && (
            <div className="mt-1">
              <p className="font-medium text-[#a1282c]">That address is taken.{suggestions.length > 0 ? ' Try one of these:' : ' Try adding your area or city.'}</p>
              {suggestions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => pickSuggestion(s)}
                      className="max-w-full truncate rounded-full border border-line/15 bg-sunk px-3 py-1.5 font-mono text-[12px] font-medium text-fg transition hover:border-ember hover:text-ember"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Input label="City" name="city" value={draft.city} maxLength={60} autoComplete="address-level2" onChange={(e) => set('city', e.target.value)} placeholder="Bengaluru" />
        <Input
          label="Phone"
          name="phone"
          type="tel"
          inputMode="tel"
          value={draft.phone}
          maxLength={30}
          autoComplete="tel"
          onChange={(e) => set('phone', e.target.value)}
          placeholder="98765 43210"
        />
      </div>

      <Input label="Your name" name="owner-name" value={draft.ownerName} maxLength={60} autoComplete="name" onChange={(e) => set('ownerName', e.target.value)} placeholder="Priya Sharma" hint="Shown to your team as the owner." />

      <TableStepper value={draft.tables} onChange={setTables} />

      <div className="rounded-2xl bg-sunk p-4">
        <Toggle
          checked={draft.sampleMenu}
          onChange={(v) => set('sampleMenu', v)}
          label="Start with a sample menu I can edit"
          description={
            draft.sampleMenu
              ? 'We add 37 café dishes in ready-made categories so you can place a test order straight away. Rename, reprice or delete any of them.'
              : 'You start with an empty menu and add your own categories and dishes.'
          }
        />
      </div>

      <FormError message={error}>
        {alreadyOwner && (
          <Button href="/admin" variant="outline" className="mt-2 w-full">
            Open your dashboard
          </Button>
        )}
      </FormError>

      <Button type="submit" size="lg" loading={busy} rightIcon={<ArrowRight className="h-4 w-4" />} className="w-full">
        {busy ? 'Setting up your restaurant…' : 'Create my restaurant'}
      </Button>

      <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-xs text-muted">
        Signed in as <span className="break-all font-medium text-fg">{email}</span>
        <button type="button" onClick={onSignOut} className="inline-flex items-center gap-1 font-semibold text-fg/80 hover:text-fg">
          <LogOut className="h-3 w-3" aria-hidden /> Use another account
        </button>
      </p>
    </form>
  );
}

function SlugIcon({ status }: { status: SlugStatus }) {
  if (status === 'checking')
    return (
      <span className="grid h-11 w-11 place-items-center text-muted" aria-label="Checking">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      </span>
    );
  if (status === 'available')
    return (
      <span className="grid h-11 w-11 place-items-center" aria-label="Available">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-mint text-white">
          <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
        </span>
      </span>
    );
  if (status === 'taken' || status === 'invalid')
    return (
      <span className="grid h-11 w-11 place-items-center" aria-label={status === 'taken' ? 'Taken' : 'Not a valid address'}>
        <span className="grid h-6 w-6 place-items-center rounded-full bg-rose text-white">
          <X className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
        </span>
      </span>
    );
  return null;
}

function TableStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const id = React.useId();
  const [text, setText] = React.useState(String(value));
  React.useEffect(() => setText(String(value)), [value]);

  const stepBtn = 'grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line/15 bg-surface text-fg transition hover:bg-fg/5 disabled:opacity-40 disabled:hover:bg-surface';
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold text-fg/80">
        Number of tables
      </label>
      <div className="flex items-center gap-2">
        <button type="button" className={stepBtn} onClick={() => onChange(value - 1)} disabled={value <= MIN_TABLES} aria-label="One table fewer">
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={MIN_TABLES}
          max={MAX_TABLES}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const n = Number.parseInt(e.target.value, 10);
            if (Number.isFinite(n) && n >= MIN_TABLES && n <= MAX_TABLES) onChange(n);
          }}
          onBlur={() => {
            const n = Number.parseInt(text, 10);
            onChange(Number.isFinite(n) ? n : value);
            setText(String(Number.isFinite(n) ? Math.min(MAX_TABLES, Math.max(MIN_TABLES, n)) : value));
          }}
          className={cn(
            'tnum h-11 w-20 rounded-xl border border-line/15 bg-surface text-center font-mono text-[16px] font-semibold text-fg transition focus:border-ember focus:shadow-ring focus:outline-none',
            '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
          )}
        />
        <button type="button" className={stepBtn} onClick={() => onChange(value + 1)} disabled={value >= MAX_TABLES} aria-label="One table more">
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <p className="text-xs text-muted">Each table gets its own QR code. You can add, rename or remove tables later.</p>
    </div>
  );
}
