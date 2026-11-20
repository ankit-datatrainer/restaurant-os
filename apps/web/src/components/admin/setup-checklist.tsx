'use client';

import * as React from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowUpRight, Check, ChevronDown, ExternalLink, ListChecks } from 'lucide-react';
import type { PlanFeature, Restaurant } from '@restaurant-os/shared';
import { planHas } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { cn, tableUrl } from '@/lib/utils';
import { EASE_OUT } from '@/lib/motion';
import { Card } from '@/components/ui';
import { useAdmin } from './admin-provider';
import { isManagerRole } from './plan';

/**
 * Onboarding checklist for a new restaurant (the order Toast / Square use: profile → tax →
 * payments → menu → tables & QR → team → test order → go live). Every tick comes from real data;
 * only "printed the QR codes" can be marked by hand (takeaway-only kitchens have no tables).
 */

interface Prefs {
  /** Hidden by the owner, or brought back from Settings (`forced`). */
  hidden?: boolean;
  forced?: boolean;
  collapsed?: boolean;
  /** "Mark as done" on the tables & QR step. */
  printed?: boolean;
  /** Everything was done once: stop fetching on every dashboard visit. */
  complete?: boolean;
  /** An order has existed: no need to ask the API again. */
  hadOrder?: boolean;
}

const prefsKey = (restaurantId: string) => `ros:setup-checklist:${restaurantId}`;

function readPrefs(restaurantId: string): Prefs {
  try {
    const raw = window.localStorage.getItem(prefsKey(restaurantId));
    return raw ? (JSON.parse(raw) as Prefs) : {};
  } catch {
    return {};
  }
}

function writePrefs(restaurantId: string, prefs: Prefs): void {
  try {
    window.localStorage.setItem(prefsKey(restaurantId), JSON.stringify(prefs));
  } catch {
    /* private mode: the checklist just forgets */
  }
}

/** Used by Settings: bring the checklist back on the dashboard, even when every step is done. */
export function showSetupChecklist(restaurantId: string): void {
  const prefs = readPrefs(restaurantId);
  writePrefs(restaurantId, { ...prefs, hidden: false, forced: true, collapsed: false });
}

interface Step {
  id: string;
  title: string;
  hint: string;
  done: boolean;
  /** Still loading the data that decides it. */
  pending?: boolean;
  href: string;
  cta: string;
  external?: boolean;
  feature?: PlanFeature;
  markable?: boolean;
}

interface Remote {
  items: number | null;
  staff: number | null;
  hasOrder: boolean | null;
}

function buildSteps(r: Restaurant, remote: Remote, tables: number, firstTableCode: string | null, printed: boolean, activeOrders: number): Step[] {
  const storyDone = Boolean(r.story_video_url || (r.story_title && r.story_text));
  const hasOrder = remote.hasOrder === true || activeOrders > 0;
  const steps: Step[] = [
    {
      id: 'profile',
      title: 'Complete your restaurant profile',
      hint: 'Address, phone and city, printed on bills and shown on your restaurant page.',
      done: Boolean(r.address && r.phone && r.city),
      href: '/admin/settings#contact',
      cta: 'Add details',
    },
    {
      id: 'tax',
      title: 'Add your GSTIN and FSSAI number',
      hint: 'Both are printed on every bill. FSSAI is mandatory on bills in India.',
      done: Boolean(r.gstin && r.fssai_number),
      href: '/admin/settings#contact',
      cta: 'Add numbers',
    },
    {
      id: 'upi',
      title: 'Set up UPI payments',
      hint: 'Guests pay straight to your UPI ID from GPay, PhonePe or any UPI app.',
      done: Boolean(r.upi_id),
      href: '/admin/settings#payments',
      cta: 'Add UPI ID',
    },
    {
      id: 'menu',
      title: 'Add your menu',
      hint: remote.items === null ? 'At least 5 dishes with prices and photos.' : `At least 5 dishes. You have ${remote.items}.`,
      done: (remote.items ?? 0) >= 5,
      pending: remote.items === null,
      href: '/admin/menu',
      cta: 'Open menu',
    },
    {
      id: 'tables',
      title: 'Add tables and print the QR codes',
      hint: tables > 0 ? `${tables} table${tables === 1 ? '' : 's'} set up. Print the QR sheet and stick one on each table.` : 'One QR per table. Guests scan it to order. Takeaway only? Mark this as done.',
      done: tables > 0 || printed,
      href: tables > 0 ? '/admin/tables/print' : '/admin/tables',
      cta: tables > 0 ? 'Print QR sheet' : 'Add tables',
      markable: true,
    },
    {
      id: 'review',
      title: 'Add your Google review link',
      hint: 'Shown to every guest after they rate their meal.',
      done: Boolean(r.google_review_url),
      href: '/admin/settings#guest-experience',
      cta: 'Add link',
      feature: 'feedback',
    },
    {
      id: 'story',
      title: 'Tell your story',
      hint: 'A few lines or a short video about your kitchen, shown while guests wait.',
      done: storyDone,
      href: '/admin/settings#guest-experience',
      cta: 'Write it',
      feature: 'story',
    },
    {
      id: 'team',
      title: 'Invite your team',
      hint: remote.staff === null ? 'Give the kitchen and waiters their own sign-in.' : `Give the kitchen and waiters their own sign-in. ${remote.staff} on the team now.`,
      done: (remote.staff ?? 0) >= 2,
      pending: remote.staff === null,
      href: '/admin/staff',
      cta: 'Invite staff',
    },
    {
      id: 'test',
      title: 'Place a test order',
      hint: firstTableCode ? 'Order from the guest menu like a guest would, then watch it arrive here.' : 'Add a table first, then order from its guest menu.',
      done: hasOrder,
      pending: remote.hasOrder === null && activeOrders === 0,
      href: firstTableCode ? tableUrl(firstTableCode) : '/admin/tables',
      cta: firstTableCode ? 'Open guest menu' : 'Add a table',
      external: Boolean(firstTableCode),
    },
    {
      id: 'listed',
      title: 'List your restaurant in the directory',
      hint: 'Diners find you on the Restaurant OS directory by city and cuisine.',
      done: Boolean(r.listed),
      href: '/admin/settings#directory',
      cta: 'Turn on',
    },
  ];
  // Steps the plan does not include are left out, so every plan can reach 100%.
  return steps.filter((s) => !s.feature || planHas(r.plan, s.feature));
}

export function SetupChecklist() {
  const { token, restaurant, staff, tables, orders } = useAdmin();
  const reduce = useReducedMotion();
  const [prefs, setPrefs] = React.useState<Prefs | null>(null);
  const [remote, setRemote] = React.useState<Remote>({ items: null, staff: null, hasOrder: null });

  React.useEffect(() => setPrefs(readPrefs(restaurant.id)), [restaurant.id]);

  const update = React.useCallback(
    (patch: Partial<Prefs>) => {
      setPrefs((p) => {
        const next = { ...(p ?? {}), ...patch };
        writePrefs(restaurant.id, next);
        return next;
      });
    },
    [restaurant.id],
  );

  const manager = isManagerRole(staff.role);
  const wanted = Boolean(prefs && manager && !prefs.hidden && (!prefs.complete || prefs.forced));

  React.useEffect(() => {
    if (!wanted || !prefs) return;
    let alive = true;
    const set = (patch: Partial<Remote>) => alive && setRemote((r) => ({ ...r, ...patch }));
    adminApi
      .items(token)
      .then((list) => set({ items: list.length }))
      .catch(() => set({ items: 0 }));
    adminApi
      .staff(token)
      .then((list) => set({ staff: list.length }))
      .catch(() => set({ staff: 0 }));
    if (prefs.hadOrder) set({ hasOrder: true });
    else
      adminApi
        .orders(token, { scope: 'all', limit: 1 })
        .then((list) => set({ hasOrder: list.length > 0 }))
        .catch(() => set({ hasOrder: false }));
    return () => {
      alive = false;
    };
    // Fetch once per visit; prefs changes (collapse, mark done) must not refetch.
  }, [wanted, token]);

  const firstTable = tables.find((t) => t.is_active) ?? tables[0];
  const steps = buildSteps(restaurant, remote, tables.length, firstTable?.code ?? null, Boolean(prefs?.printed), orders.length);
  const doneCount = steps.filter((s) => s.done).length;
  const loaded = steps.every((s) => !s.pending);
  const allDone = loaded && doneCount === steps.length;

  // Remember what never needs asking again.
  React.useEffect(() => {
    if (!prefs) return;
    if ((remote.hasOrder || orders.length > 0) && !prefs.hadOrder) update({ hadOrder: true });
    if (allDone && !prefs.complete) update({ complete: true });
  }, [allDone, remote.hasOrder, orders.length, prefs, update]);

  if (!wanted || !prefs) return null;
  if (allDone && !prefs.forced) return null;

  const pct = steps.length ? doneCount / steps.length : 0;
  const collapsed = Boolean(prefs.collapsed);
  const next = steps.find((s) => !s.done && !s.pending);
  const bodyId = 'setup-checklist-steps';

  return (
    <Card as="section" className="mb-4 overflow-hidden" aria-labelledby="setup-checklist-title">
      <div className="flex items-center gap-4 px-5 py-4">
        <ProgressRing value={pct} reduce={Boolean(reduce)} />
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Getting started</p>
          <h3 id="setup-checklist-title" className="mt-0.5 font-display text-lg font-semibold leading-tight">
            {allDone ? 'You are all set up' : 'Set up your restaurant'}
          </h3>
          <p className="mt-0.5 truncate text-sm text-muted">
            {allDone
              ? 'Every step is done. Hide this card whenever you like.'
              : `${doneCount} of ${steps.length} done${next ? ` · Next: ${next.title.toLowerCase()}` : ''}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => update({ collapsed: !collapsed })}
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-sm font-medium text-fg/75 transition hover:bg-fg/5 hover:text-fg"
        >
          <span className="hidden sm:inline">{collapsed ? 'Show steps' : 'Hide steps'}</span>
          <ChevronDown className={cn('h-4 w-4 transition-transform', !collapsed && 'rotate-180')} aria-hidden />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            id={bodyId}
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            <ol className="grid border-t border-line/5 md:grid-cols-2">
              {steps.map((s, i) => (
                <StepRow key={s.id} step={s} index={i} onMark={() => update({ printed: true })} />
              ))}
            </ol>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/5 px-5 py-3">
              <p className="text-xs text-muted">Bring this back any time from Settings.</p>
              <button
                type="button"
                onClick={() => update({ hidden: true, forced: false })}
                className="inline-flex h-8 items-center rounded-full px-3 text-[13px] font-medium text-fg/70 transition hover:bg-fg/5 hover:text-fg"
              >
                Hide checklist
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

function StepRow({ step, index, onMark }: { step: Step; index: number; onMark: () => void }) {
  const linkClass = 'inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] font-semibold text-ember transition hover:bg-ember-soft';
  return (
    <li className="flex items-start gap-3 border-b border-line/5 px-5 py-3.5 md:odd:border-r">
      <span
        className={cn(
          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-2xs font-semibold',
          step.done ? 'bg-mint text-white' : 'border border-line/20 text-muted',
        )}
        aria-hidden
      >
        {step.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn('text-[15px] font-medium leading-snug', step.done && 'text-muted line-through decoration-fg/20')}>
          {step.title}
          <span className="sr-only">{step.done ? ' (done)' : step.pending ? ' (checking)' : ' (to do)'}</span>
        </p>
        <p className="mt-0.5 text-xs text-muted">{step.hint}</p>
        {!step.done && (
          <div className="-ml-3 mt-1.5 flex flex-wrap items-center gap-1">
            {step.external ? (
              <a href={step.href} target="_blank" rel="noreferrer" className={linkClass}>
                {step.cta} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            ) : (
              <Link href={step.href} className={linkClass}>
                {step.cta} <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            )}
            {step.markable && (
              <button type="button" onClick={onMark} className="inline-flex h-8 items-center rounded-full px-3 text-[13px] font-medium text-fg/70 transition hover:bg-fg/5 hover:text-fg">
                Mark as done
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function ProgressRing({ value, reduce }: { value: number; reduce: boolean }) {
  const size = 52;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.round(value * 100);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${pct}% of setup done`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-sunk" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className={value >= 1 ? 'stroke-mint' : 'stroke-ember'}
          strokeDasharray={c}
          initial={reduce ? false : { strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - value) }}
          transition={{ duration: reduce ? 0 : 0.8, ease: EASE_OUT }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">
        {value >= 1 ? <ListChecks className="h-5 w-5 text-mint" aria-hidden /> : <span className="tnum font-mono text-xs font-semibold">{pct}%</span>}
      </span>
    </div>
  );
}
