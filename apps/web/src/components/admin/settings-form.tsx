'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Copy, Database, Download, ExternalLink, Info, ListChecks, Save } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import type { Restaurant } from '@restaurant-os/shared';
import { formatClock, planHas } from '@restaurant-os/shared';
import { adminApi, ApiRequestError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { demo, siteUrl } from '@/lib/utils';
import { Button, Card, CardBody, CardHeader, Input, Textarea, Toggle } from '@/components/ui';
import { useAdmin } from './admin-provider';
import { PageHeader } from './page-header';
import { errorMessage } from './format';
import { InGrowthTag, isManagerRole } from './plan';
import { DeviceAlertsPanel, useDeviceAlerts } from './device-alerts';
import { showSetupChecklist } from './setup-checklist';

interface Draft {
  name: string;
  tagline: string;
  logo_url: string;
  cover_url: string;
  address: string;
  phone: string;
  gstin: string;
  upi_id: string;
  upi_payee_name: string;
  tax_rate: string;
  service_charge_rate: string;
  accepts_upi: boolean;
  accepts_counter: boolean;
  is_open: boolean;
  // Guest experience (Growth+)
  google_review_url: string;
  feedback_enabled: boolean;
  games_enabled: boolean;
  marketing_consent_enabled: boolean;
  story_title: string;
  story_text: string;
  story_video_url: string;
  // Takeaway & table booking (Growth+ toggles; timings in every plan)
  takeaway_enabled: boolean;
  takeaway_prep_minutes: string;
  reservations_enabled: boolean;
  reservation_minutes: string;
  open_time: string;
  close_time: string;
  // SaaS profile (migration 0007): sent only when changed, so databases without it keep saving
  city: string;
  cuisine: string;
  fssai_number: string;
  listed: boolean;
}

/** "15:30:00" → "15:30" for <input type="time">. */
function hhmm(t: string | null | undefined, fallback: string): string {
  return t && /^\d{2}:\d{2}/.test(t) ? t.slice(0, 5) : fallback;
}

function toDraft(r: Restaurant): Draft {
  return {
    name: r.name,
    tagline: r.tagline ?? '',
    logo_url: r.logo_url ?? '',
    cover_url: r.cover_url ?? '',
    address: r.address ?? '',
    phone: r.phone ?? '',
    gstin: r.gstin ?? '',
    upi_id: r.upi_id ?? '',
    upi_payee_name: r.upi_payee_name ?? '',
    tax_rate: String(r.tax_rate),
    service_charge_rate: String(r.service_charge_rate),
    accepts_upi: r.accepts_upi,
    accepts_counter: r.accepts_counter,
    is_open: r.is_open,
    google_review_url: r.google_review_url ?? '',
    feedback_enabled: r.feedback_enabled,
    games_enabled: r.games_enabled,
    marketing_consent_enabled: r.marketing_consent_enabled,
    story_title: r.story_title ?? '',
    story_text: r.story_text ?? '',
    story_video_url: r.story_video_url ?? '',
    takeaway_enabled: r.takeaway_enabled ?? false,
    takeaway_prep_minutes: String(r.takeaway_prep_minutes ?? 20),
    reservations_enabled: r.reservations_enabled ?? false,
    reservation_minutes: String(r.reservation_minutes ?? 90),
    open_time: hhmm(r.open_time, '11:00'),
    close_time: hhmm(r.close_time, '23:00'),
    city: r.city ?? '',
    cuisine: r.cuisine ?? '',
    fssai_number: r.fssai_number ?? '',
    listed: r.listed ?? false,
  };
}

type Errors = Partial<Record<keyof Draft, string>>;

// Mirror the API's limits (restaurantUpdateSchema) so a bad value is caught inline, not by a server toast.
const MAX_TAX_RATE = 28;
const MAX_SERVICE_CHARGE = 20;
const MAX_STORY_TITLE = 80;
const MAX_STORY_TEXT = 800;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_CITY = 60;
const MAX_CUISINE = 80;
const FSSAI_RE = /^\d{14}$/;

/** Field-level messages from the API's zod `flatten()` payload, keyed by draft field. */
function serverFieldErrors(err: unknown): Errors | null {
  if (!(err instanceof ApiRequestError)) return null;
  const fieldErrors = (err.details as { fieldErrors?: Record<string, string[]> } | undefined)?.fieldErrors;
  if (!fieldErrors) return null;
  const next: Errors = {};
  for (const [key, messages] of Object.entries(fieldErrors)) {
    const first = messages?.[0];
    if (first) next[key as keyof Draft] = first;
  }
  return Object.keys(next).length ? next : null;
}

export function SettingsForm() {
  const { token, restaurant, staff } = useAdmin();
  const { session, setRestaurant } = useAuth();
  const [draft, setDraft] = React.useState<Draft>(() => toDraft(restaurant));
  const [errors, setErrors] = React.useState<Errors>({});
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const router = useRouter();

  // Keep in sync if the restaurant changes elsewhere (e.g. the open toggle in the topbar).
  React.useEffect(() => {
    if (!dirty) setDraft(toDraft(restaurant));
  }, [restaurant, dirty]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDirty(true);
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const isDemo = session?.user.email?.toLowerCase() === demo.adminEmail.toLowerCase();
  // Guest-experience settings are Growth+; on Starter they are shown, disabled, and never sent.
  const growth = planHas(restaurant.plan, 'feedback');
  const canTakeaway = planHas(restaurant.plan, 'online_takeaway');
  const canBook = planHas(restaurant.plan, 'reservations');
  const isOwner = staff.role === 'owner';
  const [origin, setOrigin] = React.useState(siteUrl);
  React.useEffect(() => setOrigin(window.location.origin), []);
  const publicUrl = `${origin}/r/${restaurant.slug}`;
  const publicLive = restaurant.takeaway_enabled || restaurant.reservations_enabled;

  const validate = (): Partial<Restaurant> | null => {
    const next: Errors = {};
    const name = draft.name.trim();
    if (!name) next.name = 'The restaurant needs a name.';
    const tax = Number(draft.tax_rate);
    if (draft.tax_rate.trim() === '' || !Number.isFinite(tax) || tax < 0 || tax > MAX_TAX_RATE) next.tax_rate = `Enter a GST rate from 0 to ${MAX_TAX_RATE}%.`;
    const svc = Number(draft.service_charge_rate);
    if (draft.service_charge_rate.trim() === '' || !Number.isFinite(svc) || svc < 0 || svc > MAX_SERVICE_CHARGE) {
      next.service_charge_rate = `Enter a service charge from 0 to ${MAX_SERVICE_CHARGE}%.`;
    }
    const upi = draft.upi_id.trim();
    if (draft.accepts_upi && !upi) next.upi_id = 'Add your UPI ID so guests can pay you.';
    if (upi && !/^[\w.\-]{2,}@[a-z][a-z0-9]{1,}$/i.test(upi)) next.upi_id = 'Looks off. UPI IDs look like name@bank.';
    if (draft.accepts_upi && !draft.upi_payee_name.trim()) next.upi_payee_name = 'The name guests see in their UPI app.';
    const gstin = draft.gstin.trim().toUpperCase();
    if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) next.gstin = 'GSTIN should be 15 characters, e.g. 29ABCDE1234F1Z5.';
    if (!draft.accepts_upi && !draft.accepts_counter) next.accepts_counter = 'Keep at least one payment method on.';
    for (const key of ['logo_url', 'cover_url'] as const) {
      const v = draft[key].trim();
      if (v && !/^https?:\/\//i.test(v)) next[key] = 'Use a full https:// link.';
    }
    if (growth) {
      for (const key of ['google_review_url', 'story_video_url'] as const) {
        const v = draft[key].trim();
        if (v && !/^https?:\/\/[^\s/.]+\.[^\s]+$/i.test(v)) next[key] = 'Use a full https:// link.';
      }
      if (draft.story_title.trim().length > MAX_STORY_TITLE) next.story_title = `Keep the title under ${MAX_STORY_TITLE} characters.`;
      if (draft.story_text.trim().length > MAX_STORY_TEXT) next.story_text = `Keep the story under ${MAX_STORY_TEXT} characters.`;
    }
    const prep = Number(draft.takeaway_prep_minutes);
    if (!Number.isInteger(prep) || prep < 5 || prep > 240) next.takeaway_prep_minutes = 'Whole minutes from 5 to 240.';
    const booking = Number(draft.reservation_minutes);
    if (!Number.isInteger(booking) || booking < 15 || booking > 480) next.reservation_minutes = 'Whole minutes from 15 to 480.';
    const city = draft.city.trim();
    if (city.length > MAX_CITY) next.city = `Keep the city under ${MAX_CITY} characters.`;
    const cuisine = draft.cuisine.trim();
    if (cuisine.length > MAX_CUISINE) next.cuisine = `Keep it under ${MAX_CUISINE} characters.`;
    const fssai = draft.fssai_number.replace(/\s+/g, '');
    if (fssai && !FSSAI_RE.test(fssai)) next.fssai_number = 'The FSSAI number is 14 digits, e.g. 12345678901234.';
    if (!TIME_RE.test(draft.open_time)) next.open_time = 'Use a 24-hour time like 11:00.';
    if (!TIME_RE.test(draft.close_time)) next.close_time = 'Use a 24-hour time like 23:00.';
    else if (draft.close_time === draft.open_time) next.close_time = 'Closing time must differ from opening time.';
    setErrors(next);
    if (Object.keys(next).length) return null;
    // Only send what changed here, so saving other settings never touches these columns.
    const before = toDraft(restaurant);
    const onlineOrdering: Partial<Restaurant> = {};
    if (canTakeaway && draft.takeaway_enabled !== before.takeaway_enabled) onlineOrdering.takeaway_enabled = draft.takeaway_enabled;
    if (canBook && draft.reservations_enabled !== before.reservations_enabled) onlineOrdering.reservations_enabled = draft.reservations_enabled;
    if (draft.takeaway_prep_minutes !== before.takeaway_prep_minutes) onlineOrdering.takeaway_prep_minutes = prep;
    if (draft.reservation_minutes !== before.reservation_minutes) onlineOrdering.reservation_minutes = booking;
    if (draft.open_time !== before.open_time) onlineOrdering.open_time = draft.open_time;
    if (draft.close_time !== before.close_time) onlineOrdering.close_time = draft.close_time;
    const profile: Partial<Restaurant> = {};
    if (draft.city !== before.city) profile.city = city || null;
    if (draft.cuisine !== before.cuisine) profile.cuisine = cuisine || null;
    if (draft.fssai_number !== before.fssai_number) profile.fssai_number = fssai || null;
    if (draft.listed !== before.listed) profile.listed = draft.listed;
    const guestExperience: Partial<Restaurant> = growth
      ? {
          google_review_url: draft.google_review_url.trim() || null,
          feedback_enabled: draft.feedback_enabled,
          games_enabled: draft.games_enabled,
          marketing_consent_enabled: draft.marketing_consent_enabled,
          story_title: draft.story_title.trim() || null,
          story_text: draft.story_text.trim() || null,
          story_video_url: draft.story_video_url.trim() || null,
        }
      : {};
    return {
      ...guestExperience,
      ...onlineOrdering,
      ...profile,
      name,
      tagline: draft.tagline.trim() || null,
      logo_url: draft.logo_url.trim() || null,
      cover_url: draft.cover_url.trim() || null,
      address: draft.address.trim() || null,
      phone: draft.phone.trim() || null,
      gstin: gstin || null,
      upi_id: upi || null,
      upi_payee_name: draft.upi_payee_name.trim() || null,
      tax_rate: Math.round(tax * 100) / 100,
      service_charge_rate: Math.round(svc * 100) / 100,
      accepts_upi: draft.accepts_upi,
      accepts_counter: draft.accepts_counter,
      is_open: draft.is_open,
    };
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = validate();
    if (!body) {
      toast.error('Fix the highlighted fields.');
      return;
    }
    setSaving(true);
    try {
      const updated = await adminApi.updateRestaurant(token, body);
      setRestaurant(updated);
      setDirty(false);
      setDraft(toDraft(updated));
      toast.success('Settings saved. The guest menu reflects them immediately.');
    } catch (err) {
      // A server-side rejection lands on the field it names, like a client-side one.
      const fieldErrors = serverFieldErrors(err);
      if (fieldErrors) {
        setErrors(fieldErrors);
        toast.error('Fix the highlighted fields.');
      } else {
        toast.error(errorMessage(err, 'Could not save settings.'));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="mx-auto w-full max-w-3xl" noValidate>
      <PageHeader
        title="Settings"
        description="How your restaurant appears to guests, and how they pay you."
        actions={
          <Button type="submit" loading={saving} leftIcon={<Save className="h-4 w-4" />} disabled={!dirty && !saving}>
            Save changes
          </Button>
        }
      />

      {isDemo && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-sky/30 bg-sky-soft px-4 py-3 text-sm text-[#245a9f]">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            You are signed in with the shared demo account <span className="font-mono">{demo.adminEmail}</span>. Changes here are visible to everyone trying the demo and may be reset at any time.
          </p>
        </div>
      )}

      <div className="space-y-4">
        <Card id="identity" className="scroll-mt-24">
          <CardHeader title="Identity" description="Name, tagline and images on the guest menu." />
          <CardBody className="grid gap-4 pt-4">
            <Input label="Restaurant name" value={draft.name} onChange={(e) => set('name', e.target.value)} error={errors.name} />
            <Input label="Tagline" value={draft.tagline} onChange={(e) => set('tagline', e.target.value)} placeholder="Slow coffee, fast kitchen." hint="One line under the name on the menu and the bill." />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="City" value={draft.city} onChange={(e) => set('city', e.target.value)} placeholder="Bengaluru" maxLength={MAX_CITY} error={errors.city} hint="Shown on your restaurant page and in the directory." />
              <Input
                label="Cuisine"
                value={draft.cuisine}
                onChange={(e) => set('cuisine', e.target.value)}
                placeholder="South Indian · Café"
                maxLength={MAX_CUISINE}
                error={errors.cuisine}
                hint="What you serve, in a few words."
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Logo URL" value={draft.logo_url} onChange={(e) => set('logo_url', e.target.value)} placeholder="https://…/logo.png" error={errors.logo_url} />
              <Input label="Cover image URL" value={draft.cover_url} onChange={(e) => set('cover_url', e.target.value)} placeholder="https://…/cover.jpg" error={errors.cover_url} />
            </div>
          </CardBody>
        </Card>

        <Card id="contact" className="scroll-mt-24">
          <CardHeader title="Contact & tax identity" description="Printed on every bill." />
          <CardBody className="grid gap-4 pt-4">
            <Textarea label="Address" value={draft.address} onChange={(e) => set('address', e.target.value)} placeholder="12, 4th Cross, Indiranagar, Bengaluru 560038" className="min-h-[72px]" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Phone" inputMode="tel" value={draft.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+91 98450 00000" />
              <Input label="GSTIN" value={draft.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} placeholder="29ABCDE1234F1Z5" error={errors.gstin} className="font-mono uppercase" />
            </div>
            <Input
              label="FSSAI licence number"
              inputMode="numeric"
              autoComplete="off"
              value={draft.fssai_number}
              onChange={(e) => set('fssai_number', e.target.value.replace(/[^\d\s]/g, '').slice(0, 17))}
              placeholder="12345678901234"
              error={errors.fssai_number}
              hint="14 digits. Mandatory on every bill in India since Oct 2021; printed under your GSTIN."
              className="tnum font-mono"
            />
          </CardBody>
        </Card>

        <Card id="payments" className="scroll-mt-24">
          <CardHeader title="Payments" description="Guests can pay by UPI from their phone or at the counter." />
          <CardBody className="grid gap-4 pt-4">
            <Toggle checked={draft.accepts_upi} onChange={(v) => set('accepts_upi', v)} label="Accept UPI" description="Guests get a pay button that opens GPay, PhonePe or any UPI app" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="UPI ID" value={draft.upi_id} onChange={(e) => set('upi_id', e.target.value)} placeholder="saffronlane@okaxis" error={errors.upi_id} className="font-mono" />
              <Input label="UPI payee name" value={draft.upi_payee_name} onChange={(e) => set('upi_payee_name', e.target.value)} placeholder="Saffron Lane Café" error={errors.upi_payee_name} />
            </div>
            <Toggle checked={draft.accepts_counter} onChange={(v) => set('accepts_counter', v)} label="Accept payment at the counter" description="Guests choose “Pay at counter” and you mark the order paid" />
            {errors.accepts_counter && <p className="text-xs text-rose">{errors.accepts_counter}</p>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Taxes & charges" description="GST is split equally into CGST and SGST on the bill." />
          <CardBody className="grid gap-4 pt-4 sm:grid-cols-2">
            <Input
              label="Tax rate (GST %)"
              inputMode="decimal"
              value={draft.tax_rate}
              onChange={(e) => set('tax_rate', e.target.value)}
              error={errors.tax_rate}
              hint={`CGST ${Number(draft.tax_rate) / 2 || 0}% + SGST ${Number(draft.tax_rate) / 2 || 0}% · up to ${MAX_TAX_RATE}%`}
              className="tnum font-mono"
            />
            <Input
              label="Service charge %"
              inputMode="decimal"
              value={draft.service_charge_rate}
              onChange={(e) => set('service_charge_rate', e.target.value)}
              error={errors.service_charge_rate}
              hint={`0 to charge nothing extra · up to ${MAX_SERVICE_CHARGE}%`}
              className="tnum font-mono"
            />
          </CardBody>
        </Card>

        <Card id="guest-experience" className="scroll-mt-24">
          <CardHeader
            title="Guest experience"
            description="What guests see while they wait and after they eat."
            action={growth ? undefined : <InGrowthTag className="mt-1" />}
          />
          <CardBody className="grid gap-4 pt-4">
            {!growth && (
              <p className="rounded-xl bg-sunk px-3.5 py-2.5 text-sm text-fg/80">
                Feedback, the Google review link, games, WhatsApp consent and the story video are part of the Growth plan.{' '}
                <Link href="/admin/subscription" className="font-semibold text-ember hover:underline">
                  See plans
                </Link>
              </p>
            )}
            <Input
              label="Google review link"
              type="url"
              inputMode="url"
              value={draft.google_review_url}
              onChange={(e) => set('google_review_url', e.target.value)}
              placeholder="https://g.page/r/…/review"
              error={errors.google_review_url}
              disabled={!growth}
              hint="Shown to every guest after they rate their meal — Google does not allow showing it only to happy guests or offering rewards."
            />
            <details className="-mt-2 rounded-xl bg-sunk px-3.5 py-2.5 text-sm">
              <summary className="cursor-pointer select-none font-medium text-fg/80 marker:text-muted">How do I find it?</summary>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
                <li>Open your Google Business Profile: search your restaurant’s name on Google while signed in, or go to business.google.com.</li>
                <li>Choose Read reviews or Ask for reviews.</li>
                <li>Under Get more reviews, copy the review link.</li>
                <li>Paste it here. It looks like https://g.page/r/…/review.</li>
              </ol>
            </details>
            <div className="grid gap-4 border-t border-line/5 pt-4">
              <Toggle
                checked={draft.feedback_enabled}
                onChange={(v) => set('feedback_enabled', v)}
                disabled={!growth}
                label="Ask guests for feedback"
                description="A 1–5 star rating and an optional comment once the order is served"
              />
              <Toggle
                checked={draft.games_enabled}
                onChange={(v) => set('games_enabled', v)}
                disabled={!growth}
                label="Games while guests wait"
                description="Turn off at busy times if you'd rather guests don't linger."
              />
              <Toggle
                checked={draft.marketing_consent_enabled}
                onChange={(v) => set('marketing_consent_enabled', v)}
                disabled={!growth}
                label="Ask for WhatsApp consent at checkout"
                description="An optional, unticked box: guests decide whether they want your offers"
              />
            </div>
            <div className="grid gap-4 border-t border-line/5 pt-4">
              <Input
                label="Story title"
                value={draft.story_title}
                onChange={(e) => set('story_title', e.target.value)}
                placeholder="How our kitchen began"
                maxLength={MAX_STORY_TITLE}
                error={errors.story_title}
                disabled={!growth}
              />
              <Textarea
                label="Story text"
                value={draft.story_text}
                onChange={(e) => set('story_text', e.target.value)}
                placeholder="A few lines about your kitchen, your family recipes or where your coffee comes from."
                maxLength={MAX_STORY_TEXT}
                error={errors.story_text}
                hint={`${draft.story_text.length}/${MAX_STORY_TEXT} characters`}
                disabled={!growth}
              />
              <Input
                label="Story video URL"
                type="url"
                inputMode="url"
                value={draft.story_video_url}
                onChange={(e) => set('story_video_url', e.target.value)}
                placeholder="https://youtu.be/…"
                error={errors.story_video_url}
                disabled={!growth}
                hint="A YouTube link or a direct .mp4 file"
              />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Takeaway & table booking"
            description="Your own restaurant page where guests order for pickup or ask for a table."
            action={canTakeaway && canBook ? undefined : <InGrowthTag className="mt-1" />}
          />
          <CardBody className="grid gap-4 pt-4">
            {!(canTakeaway && canBook) && (
              <p className="rounded-xl bg-sunk px-3.5 py-2.5 text-sm text-fg/80">
                Online takeaway and table booking are part of the Growth plan. Opening hours stay editable on every plan.{' '}
                <Link href="/admin/subscription" className="font-semibold text-ember hover:underline">
                  See plans
                </Link>
              </p>
            )}
            <div className="grid gap-4">
              <Toggle
                checked={canTakeaway && draft.takeaway_enabled}
                onChange={(v) => set('takeaway_enabled', v)}
                disabled={!canTakeaway}
                label={
                  <span className="inline-flex flex-wrap items-center gap-2">
                    Online takeaway {!canTakeaway && <InGrowthTag />}
                  </span>
                }
                description="Guests order from your page and pick a pickup time; orders land on the dashboard like any other"
              />
              <Toggle
                checked={canBook && draft.reservations_enabled}
                onChange={(v) => set('reservations_enabled', v)}
                disabled={!canBook}
                label={
                  <span className="inline-flex flex-wrap items-center gap-2">
                    Table booking requests {!canBook && <InGrowthTag />}
                  </span>
                }
                description="Guests ask for a table; you confirm or decline it on the Reservations page"
              />
            </div>
            <div className="grid gap-4 border-t border-line/5 pt-4 sm:grid-cols-2">
              <Input
                label="Takeaway prep time (minutes)"
                inputMode="numeric"
                value={draft.takeaway_prep_minutes}
                onChange={(e) => set('takeaway_prep_minutes', e.target.value)}
                error={errors.takeaway_prep_minutes}
                hint="Earliest pickup is now + this. 5 to 240."
                className="tnum font-mono"
              />
              <Input
                label="Booking length (minutes)"
                inputMode="numeric"
                value={draft.reservation_minutes}
                onChange={(e) => set('reservation_minutes', e.target.value)}
                error={errors.reservation_minutes}
                hint="How long a table is held per booking. 15 to 480."
                className="tnum font-mono"
              />
              <Input label="Opens at" type="time" step={300} value={draft.open_time} onChange={(e) => set('open_time', e.target.value)} error={errors.open_time} className="tnum font-mono" />
              <Input
                label="Closes at"
                type="time"
                step={300}
                value={draft.close_time}
                onChange={(e) => set('close_time', e.target.value)}
                error={errors.close_time}
                hint={
                  TIME_RE.test(draft.open_time) && TIME_RE.test(draft.close_time)
                    ? draft.close_time < draft.open_time
                      ? `Open ${formatClock(draft.open_time)} until ${formatClock(draft.close_time)} the next day.`
                      : `Open ${formatClock(draft.open_time)} – ${formatClock(draft.close_time)}, India time.`
                    : '24-hour time. Can be after midnight.'
                }
                className="tnum font-mono"
              />
            </div>
            {publicLive ? (
              <div className="grid gap-4 rounded-2xl border border-line/10 p-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
                <div className="mx-auto rounded-xl bg-white p-2.5 shadow-soft sm:mx-0">
                  <QRCodeSVG value={publicUrl} size={112} level="M" bgColor="#ffffff" fgColor="#0C0D10" aria-label="QR code for your restaurant page" />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-fg/80">Your restaurant page</p>
                  <p className="mt-1 truncate font-mono text-sm" title={publicUrl}>
                    {publicUrl}
                  </p>
                  <p className="mt-1 text-xs text-muted">Put it in your Instagram bio and Google profile, or print the QR for the door.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      leftIcon={<Copy className="h-3.5 w-3.5" />}
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(publicUrl);
                          toast.success('Link copied.');
                        } catch {
                          toast.error('Could not copy. Select the link and copy it yourself.');
                        }
                      }}
                    >
                      Copy link
                    </Button>
                    <Button href={publicUrl} external size="sm" variant="outline" leftIcon={<ExternalLink className="h-3.5 w-3.5" />}>
                      Open
                    </Button>
                  </div>
                </div>
              </div>
            ) : (canTakeaway && draft.takeaway_enabled) || (canBook && draft.reservations_enabled) ? (
              <p className="rounded-xl bg-sunk px-3.5 py-2.5 text-sm text-fg/80">Save your changes to publish your restaurant page and get its link and QR code.</p>
            ) : null}
          </CardBody>
        </Card>

        <Card id="directory" className="scroll-mt-24">
          <CardHeader title="Restaurant OS directory" description="Let diners find you in the Restaurant OS restaurant directory." />
          <CardBody className="grid gap-4 pt-4">
            <Toggle
              checked={draft.listed}
              onChange={(v) => set('listed', v)}
              label="List my restaurant in the Restaurant OS directory"
              description="Shows your name, city, cuisine, cover photo, opening hours and a link to your restaurant page. Nothing about your orders or guests."
            />
            {draft.listed && !(draft.city.trim() && draft.cuisine.trim()) && (
              <p className="rounded-xl bg-sunk px-3.5 py-2.5 text-sm text-fg/80">Add your city and cuisine under Identity so diners can find you when they filter.</p>
            )}
            <div>
              <Button href="/restaurants" external size="sm" variant="outline" leftIcon={<ExternalLink className="h-3.5 w-3.5" />}>
                View directory
              </Button>
            </div>
          </CardBody>
        </Card>

        <NotificationsCard />

        <Card>
          <CardHeader title="Orders" description="Pause ordering during a rush or after closing." />
          <CardBody className="pt-4">
            <Toggle checked={draft.is_open} onChange={(v) => set('is_open', v)} label="Open for orders" description={draft.is_open ? 'Guests can place orders from table QRs' : 'The menu shows a closed notice; the cart is disabled'} />
          </CardBody>
        </Card>

        {isManagerRole(staff.role) && (
          <Card>
            <CardHeader title="Your data" description="It’s your restaurant’s data. Download a copy whenever you like." />
            <CardBody className="grid gap-4 pt-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[15px] font-medium">Full backup (JSON)</p>
                  <p className="text-xs text-muted">
                    Every record: menu, tables, orders and dishes, bills and payments, customers and consent history, feedback, coupons, stock, purchases, expenses, cash closings,
                    reservations, staff, shifts and the activity log.
                  </p>
                </div>
                {isOwner ? (
                  <Button href={adminApi.backupUrl(token)} external size="sm" variant="outline" leftIcon={<Database className="h-4 w-4" />} className="shrink-0 self-start">
                    Download backup
                  </Button>
                ) : (
                  <p className="shrink-0 text-xs text-muted sm:max-w-[180px] sm:text-right">Only the owner can download a full backup.</p>
                )}
              </div>
              <div className="flex flex-col gap-3 border-t border-line/5 pt-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[15px] font-medium">Orders (CSV)</p>
                  <p className="text-xs text-muted">One row per order, all time: number, time, type, table, status, payment, discount, service charge, GST and total. Opens in Excel or Google Sheets.</p>
                </div>
                <Button href={adminApi.ordersCsvUrl(token)} external size="sm" variant="outline" leftIcon={<Download className="h-4 w-4" />} className="shrink-0 self-start">
                  Download orders
                </Button>
              </div>
              <p className="text-xs text-muted">The backup includes customer phone numbers. Keep downloads somewhere safe and don’t share them.</p>
            </CardBody>
          </Card>
        )}

        {isManagerRole(staff.role) && (
          <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-line/15 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted">The setup checklist on the dashboard walks you through everything a new restaurant needs.</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              leftIcon={<ListChecks className="h-4 w-4" />}
              className="shrink-0 self-start sm:self-auto"
              onClick={() => {
                showSetupChecklist(restaurant.id);
                router.push('/admin');
              }}
            >
              Show setup checklist
            </Button>
          </div>
        )}

        <div className="flex justify-end pb-4">
          <Button type="submit" loading={saving} leftIcon={<Save className="h-4 w-4" />} disabled={!dirty && !saving}>
            Save changes
          </Button>
        </div>
      </div>
    </form>
  );
}

/** "Alerts on this device": the same control as the topbar bell. */
function NotificationsCard() {
  const alerts = useDeviceAlerts();
  return (
    <Card id="notifications" className="scroll-mt-24">
      <CardHeader title="Notifications" description="Applies to this phone or laptop only. Turn it on on every device that should ring." />
      <CardBody className="pt-4">
        <DeviceAlertsPanel alerts={alerts} />
      </CardBody>
    </Card>
  );
}
