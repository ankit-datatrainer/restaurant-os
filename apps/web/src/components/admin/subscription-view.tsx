'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Copy, Crown, Hourglass, MessageCircle, Minus, PauseCircle, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import type { PlanFeature, PlanId } from '@restaurant-os/shared';
import { FOUNDING_OFFER, PLAN_IDS, PLAN_INFO, TRIAL_DAYS, planHas, trialDaysLeft } from '@restaurant-os/shared';
import { cn, formatINR } from '@/lib/utils';
import { Badge, Button, Card, CardBody, CardHeader } from '@/components/ui';
import { useAdmin } from './admin-provider';
import { PageHeader } from './page-header';

const CHANGE_PLAN_EMAIL = 'hello@restaurantos.app';

const WHATSAPP_NOTE = "WhatsApp needs your Meta Business account; Meta's message fees are billed by Meta.";
const POS_NOTE = "Native POS connectors need the POS vendor's partner API; webhooks work with any system that accepts them.";

/** Plan-dependent features, in the order guests and staff notice them. */
const PLAN_FEATURE_ROWS: Array<{ label: string; features: PlanFeature[]; starterNote?: string; note?: string }> = [
  { label: 'Customer CRM & analytics', features: ['crm', 'customer_analytics'] },
  { label: 'WhatsApp consent & offers', features: ['marketing'] },
  { label: 'Feedback & Google review link', features: ['feedback'] },
  { label: 'Table games while guests wait', features: ['games'] },
  { label: 'Story video on the guest menu', features: ['story'] },
  { label: 'All guest request types', features: ['all_calls'], starterNote: 'Starter: call waiter and bring the bill' },
  { label: 'Table reservations & waitlist', features: ['reservations'] },
  { label: 'Online takeaway with scheduled pickup', features: ['online_takeaway'] },
  { label: 'Coupons, happy hours & gift cards', features: ['promotions'] },
  { label: 'Expenses, budgets & profit and loss', features: ['finance'] },
  { label: 'Inventory, recipes & purchase orders', features: ['inventory'] },
  { label: 'Advanced analytics & reports', features: ['advanced_analytics'] },
  { label: 'Loyalty rewards', features: ['loyalty'] },
  { label: 'Automated WhatsApp messages', features: ['whatsapp_automation'], note: WHATSAPP_NOTE },
  { label: 'POS / webhook integration', features: ['pos_integration'], note: POS_NOTE },
];

/** Plans that include every feature of a row, as "In Growth and Premium" / "In Premium". */
function includedIn(features: PlanFeature[]): string {
  const names = PLAN_IDS.filter((id) => hasAll(id, features)).map((id) => PLAN_INFO[id].name);
  return `In ${names.join(' and ')}.`;
}

const EVERY_PLAN = [
  'QR menu & table ordering',
  'Live order dashboard with audible alerts',
  'Kitchen board',
  'UPI & pay-at-counter',
  'GST bills & kitchen tickets',
  'Printable table QR stickers',
];

const COVERS = [
  'Secure cloud hosting',
  'Database & backups',
  'Software updates',
  'Menu & QR management',
  'Order dashboard & staff access',
  'Technical support, bug fixes & monitoring',
  'CRM & reports, as per your plan',
  'Security updates',
];

const BILLED_SEPARATELY = [
  'GST',
  'Payment gateway charges',
  'WhatsApp messaging fees',
  'QR stands & hardware',
  'Large menu-entry projects',
  'Professional video production',
  'Custom integrations',
];

const PREMIUM_FEATURES: Array<{ title: string; body: string; href: string; note?: string }> = [
  { title: 'Advanced analytics', body: 'Revenue by day, busiest hours, best sellers and slow movers, returning guests, table ranking and CSV exports.', href: '/admin/reports' },
  { title: 'Loyalty rewards', body: 'Regulars earn a reward every few visits automatically; staff redeem the code at the counter.', href: '/admin/loyalty' },
  {
    title: 'Automated WhatsApp messages',
    body: 'Welcome, win-back and reward messages, plus one-tap offer broadcasts, sent only to guests who opted in.',
    href: '/admin/integrations',
    note: WHATSAPP_NOTE,
  },
  { title: 'POS / webhook integration', body: 'Every order sent to your POS, KOT software, Zapier/Make or your own server as signed webhooks.', href: '/admin/integrations', note: POS_NOTE },
];

/** Free trial / paused account, above the current plan. Nothing when the account is simply active. */
function AccountState() {
  const { restaurant } = useAdmin();
  const days = trialDaysLeft(restaurant);
  const suspended = restaurant.status === 'suspended';
  if (!suspended && (days === null || !restaurant.trial_ends_at)) return null;

  if (suspended) {
    return (
      <Card className="mb-4 border-rose/30">
        <CardBody className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-soft text-rose" aria-hidden>
            <PauseCircle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="font-display text-lg font-semibold">Your account is paused</p>
            <p className="mt-1 text-sm text-muted">Guests can’t place orders until Restaurant OS turns it back on. Write to us below or use Talk to us, and we’ll sort it out with you.</p>
          </div>
        </CardBody>
      </Card>
    );
  }

  const ended = (days ?? 0) <= 0;
  const endDate = new Date(restaurant.trial_ends_at as string).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const used = Math.min(TRIAL_DAYS, Math.max(0, TRIAL_DAYS - (days ?? 0)));
  return (
    <Card className={cn('mb-4', ended ? 'border-saffron/40' : '')}>
      <CardBody className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', ended ? 'bg-saffron-soft text-[#8a5a00]' : 'bg-ember-soft text-ember')} aria-hidden>
            <Hourglass className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="eyebrow">Free trial</p>
            <p className="mt-0.5 font-display text-lg font-semibold leading-tight">
              {ended ? `Your free trial ended on ${endDate}` : `${days} day${days === 1 ? '' : 's'} left in your free trial`}
            </p>
            <p className="mt-1 text-sm text-muted">
              {ended
                ? 'To keep using Restaurant OS, choose a plan with the Restaurant OS team (details below).'
                : `Ends ${endDate}. To keep going after that, choose a plan with the Restaurant OS team (details below).`}
            </p>
          </div>
        </div>
        {!ended && (
          <div className="sm:w-44" aria-hidden>
            <div className="h-2 overflow-hidden rounded-full bg-sunk">
              <div className="h-full rounded-full bg-ember" style={{ width: `${(used / TRIAL_DAYS) * 100}%` }} />
            </div>
            <p className="mt-1.5 font-mono text-2xs uppercase tracking-[0.12em] text-muted tnum">
              Day {Math.min(TRIAL_DAYS, used + 1)} of {TRIAL_DAYS}
            </p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function hasAll(plan: PlanId, features: PlanFeature[]): boolean {
  return features.every((f) => planHas(plan, f));
}

export function SubscriptionView() {
  const { restaurant } = useAdmin();
  const current: PlanId = restaurant.plan ?? 'starter';
  const info = PLAN_INFO[current];
  const emailRef = React.useRef<HTMLSpanElement>(null);

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(CHANGE_PLAN_EMAIL);
      toast.success('Email address copied.');
    } catch {
      // Clipboard blocked (http, old browser): select the text so Ctrl+C works.
      const el = emailRef.current;
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
      toast.message('Press Ctrl+C (or ⌘C) to copy the address.');
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1200px]">
      <PageHeader
        title="Plan & billing"
        description="Your Restaurant OS plan, what it includes and what is billed separately. Prices are per outlet and exclude GST."
      />

      <AccountState />

      {/* Current plan */}
      <Card className="overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <div className="relative bg-ink p-6 text-paper md:p-8">
            <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-ember/25 blur-3xl" aria-hidden />
            <p className="font-mono text-2xs uppercase tracking-[0.16em] text-paper/55">Current plan</p>
            <h3 className="mt-2 font-display text-4xl font-semibold tracking-tight">{info.name}</h3>
            <p className="mt-2 max-w-md text-sm text-paper/70">{info.tagline}</p>
            <div className="mt-6 flex items-baseline gap-1.5">
              <span className="tnum font-mono text-4xl font-semibold">{formatINR(info.monthly)}</span>
              <span className="text-sm text-paper/60">/month per outlet</span>
            </div>
            <p className="mt-1 font-mono text-2xs uppercase tracking-[0.14em] text-paper/45">excl. GST</p>
            <dl className="relative mt-5 grid gap-2 text-sm sm:grid-cols-2">
              <div className="rounded-xl bg-paper/5 px-3.5 py-2.5">
                <dt className="text-paper/55">One-time setup</dt>
                <dd className="tnum mt-0.5 font-mono font-semibold">{formatINR(info.setup)}</dd>
              </div>
              {info.yearly !== null && (
                <div className="rounded-xl bg-paper/5 px-3.5 py-2.5">
                  <dt className="text-paper/55">Or yearly, upfront</dt>
                  <dd className="tnum mt-0.5 font-mono font-semibold">{formatINR(info.yearly)}/year</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="p-6 md:p-8">
            <p className="eyebrow">What your plan includes</p>
            <ul className="mt-4 space-y-2.5">
              {PLAN_FEATURE_ROWS.map((row) => {
                const yes = hasAll(current, row.features);
                return (
                  <li key={row.label} className="flex items-start gap-3 text-[15px]">
                    <span
                      className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full', yes ? 'bg-mint-soft text-[#1b6f49]' : 'bg-sunk text-muted')}
                      aria-hidden
                    >
                      {yes ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                    </span>
                    <span className={cn('min-w-0', !yes && 'text-muted')}>
                      {row.label}
                      <span className="sr-only">{yes ? ' (included)' : ' (not included)'}</span>
                      {!yes && (
                        <span className="block text-xs">
                          {row.starterNote ? `${row.starterNote}. ` : ''}
                          {includedIn(row.features)}
                        </span>
                      )}
                      {row.note && <span className="block text-xs text-muted">{row.note}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="eyebrow mt-6">In every plan</p>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {EVERY_PLAN.map((f) => (
                <li key={f} className="rounded-full bg-sunk px-3 py-1 text-xs font-medium text-fg/80">
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      {/* All plans */}
      <section className="mt-8" aria-labelledby="plans-heading">
        <h3 id="plans-heading" className="font-display text-xl font-semibold">
          Plans
        </h3>
        <p className="mt-1 text-sm text-muted">Per outlet, per month. Every amount excludes GST and third-party charges.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {PLAN_IDS.map((id) => {
            const p = PLAN_INFO[id];
            const isCurrent = id === current;
            return (
              <article
                key={id}
                className={cn('flex flex-col rounded-2xl border bg-surface p-5 shadow-soft', isCurrent ? 'border-ember ring-2 ring-ember/20' : 'border-line/10')}
                aria-label={`${p.name} plan${isCurrent ? ', your current plan' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-display text-lg font-semibold">{p.name}</h4>
                  {isCurrent && <Badge tone="ember">Current plan</Badge>}
                </div>
                <p className="mt-3">
                  <span className="tnum font-mono text-3xl font-semibold">{formatINR(p.monthly)}</span>
                  <span className="text-sm text-muted">/month</span>
                </p>
                <p className="mt-1 text-xs text-muted">
                  <span className="tnum font-mono">{formatINR(p.setup)}</span> one-time setup
                  {p.yearly !== null && (
                    <>
                      {' · '}or <span className="tnum font-mono">{formatINR(p.yearly)}</span>/year
                    </>
                  )}
                  {' · '}excl. GST
                </p>
                <p className="mt-4 text-sm text-fg/85">{p.tagline}</p>
                <p className="mt-auto pt-4 text-xs text-muted">
                  <span className="font-semibold text-fg/70">Ideal for: </span>
                  {p.idealFor}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      {/* Founding partner offer */}
      <section className="relative mt-8 overflow-hidden rounded-3xl bg-ink p-6 text-paper md:p-8" aria-labelledby="founding-heading">
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-ember/30 blur-3xl" aria-hidden />
        <div className="relative grid gap-6 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:items-center">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full bg-ember/20 px-2.5 py-1 font-mono text-2xs uppercase tracking-[0.14em] text-ember">
              <Sparkles className="h-3 w-3" aria-hidden /> Founding partner offer
            </p>
            <h3 id="founding-heading" className="mt-3 font-display text-2xl font-semibold leading-tight md:text-3xl">
              {PLAN_INFO[FOUNDING_OFFER.plan].name} at <span className="tnum font-mono text-ember">{formatINR(FOUNDING_OFFER.monthly)}</span>/month for the first{' '}
              {FOUNDING_OFFER.outlets} outlets
            </h3>
            <p className="mt-2 text-sm text-paper/65">Instead of {formatINR(PLAN_INFO[FOUNDING_OFFER.plan].monthly)}/month. All amounts excl. GST.</p>
          </div>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2.5">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-ember" aria-hidden />
              <span>
                <span className="tnum font-mono font-semibold">{formatINR(FOUNDING_OFFER.setup)}</span> onboarding
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-ember" aria-hidden />
              <span>{FOUNDING_OFFER.pilotDays}-day guided pilot, credited toward your first subscription</span>
            </li>
            <li className="flex items-start gap-2.5">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-ember" aria-hidden />
              <span>Rate locked for {FOUNDING_OFFER.lockMonths} months</span>
            </li>
            <li className="flex items-start gap-2.5 text-paper/60">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-paper/40" aria-hidden />
              <span>Subject to agreed usage limits</span>
            </li>
          </ul>
        </div>
      </section>

      {/* Covered vs billed separately */}
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="What your subscription covers" />
          <CardBody className="pt-4">
            <ul className="space-y-2.5">
              {COVERS.map((c) => (
                <li key={c} className="flex items-start gap-2.5 text-sm">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mint-soft text-[#1b6f49]" aria-hidden>
                    <Check className="h-3 w-3" />
                  </span>
                  {c}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Billed separately" description="Not included in the monthly plan price." />
          <CardBody className="pt-4">
            <ul className="space-y-2.5">
              {BILLED_SEPARATELY.map((c) => (
                <li key={c} className="flex items-start gap-2.5 text-sm">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sunk text-muted" aria-hidden>
                    <Minus className="h-3 w-3" />
                  </span>
                  {c}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      {/* Premium */}
      <section className="mt-8" aria-labelledby="premium-heading">
        <h3 id="premium-heading" className="flex items-center gap-2 font-display text-xl font-semibold">
          <Crown className="h-5 w-5 text-ember" aria-hidden /> What {PLAN_INFO.premium.name} adds
        </h3>
        <p className="mt-1 text-sm text-muted">
          Everything in {PLAN_INFO.growth.name}, plus these. Live today for {PLAN_INFO.premium.name} restaurants, at{' '}
          <span className="tnum font-mono">{formatINR(PLAN_INFO.premium.monthly)}</span>/month per outlet, excl. GST.
        </p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {PREMIUM_FEATURES.map((f) => (
            <li key={f.title} className="flex flex-col rounded-2xl border border-line/10 bg-surface p-4 shadow-soft">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{f.title}</p>
                <Badge tone="mint" dot>
                  Included in {PLAN_INFO.premium.name}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-muted">{f.body}</p>
              {f.note && <p className="mt-2 rounded-lg bg-sunk px-3 py-2 text-xs text-fg/75">{f.note}</p>}
              {current === 'premium' && (
                <Link href={f.href} className="mt-3 inline-flex items-center gap-1 self-start text-sm font-semibold text-ember hover:underline">
                  Open <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Change plan */}
      <Card className="mb-4 mt-8">
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[15px]">
              To choose or change your plan, write to{' '}
              <span ref={emailRef} className="select-all rounded-md bg-sunk px-1.5 py-0.5 font-mono text-sm font-semibold">
                {CHANGE_PLAN_EMAIL}
              </span>
            </p>
            <p className="mt-1 text-xs text-muted">There is no online payment in the app yet: the Restaurant OS team sets up your plan and sends you an invoice.</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 self-start sm:self-auto">
            <Button variant="outline" size="sm" leftIcon={<Copy className="h-4 w-4" />} onClick={() => void copyEmail()}>
              Copy address
            </Button>
            <Button href="/contact" external variant="ghost" size="sm" leftIcon={<MessageCircle className="h-4 w-4" />}>
              Talk to us
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
