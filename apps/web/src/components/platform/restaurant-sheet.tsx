'use client';

import * as React from 'react';
import { Check, Copy, ExternalLink, PauseCircle, PlayCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { PlanId, PlatformRestaurant, PlatformRestaurantUpdate } from '@restaurant-os/shared';
import { PLAN_IDS, PLAN_INFO } from '@restaurant-os/shared';
import { cn, formatDateTime, formatINR, timeAgo } from '@/lib/utils';
import { Button, Sheet, Toggle } from '@/components/ui';
import { useConfirm } from '@/components/admin/confirm-dialog';
import { useNow } from '@/components/admin/use-now';
import { extendedTrialEnd, formatDate, planName, publicPageUrl, trialLabel, trialState } from './format';
import { PlanBadge, StatusBadge } from './restaurants-view';

type Update = (
  id: string,
  body: PlatformRestaurantUpdate,
  optimistic: Partial<PlatformRestaurant>,
  opts: { action: string; success: string },
) => Promise<boolean>;

function useIsDesktop() {
  const [desktop, setDesktop] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const on = () => setDesktop(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return desktop;
}

export function RestaurantSheet({
  restaurant,
  open,
  onClose,
  pendingAction,
  onUpdate,
}: {
  restaurant: PlatformRestaurant | null;
  open: boolean;
  onClose: () => void;
  pendingAction: string | undefined;
  onUpdate: Update;
}) {
  const desktop = useIsDesktop();
  const { confirm, dialog } = useConfirm();
  const now = useNow(60_000);
  const r = restaurant;

  return (
    <>
      <Sheet
        open={open && Boolean(r)}
        onClose={onClose}
        side={desktop ? 'right' : 'bottom'}
        className={desktop ? 'max-w-lg' : undefined}
        title={r?.name}
        description={r ? <span className="font-mono text-xs">/r/{r.slug}{r.city ? ` · ${r.city}` : ''}</span> : undefined}
      >
        {r && <SheetBody r={r} now={now} pendingAction={pendingAction} onUpdate={onUpdate} confirm={confirm} />}
      </Sheet>
      {dialog}
    </>
  );
}

const PLAN_ORDER: Record<PlanId, number> = { starter: 0, growth: 1, premium: 2 };

function SheetBody({
  r,
  now,
  pendingAction,
  onUpdate,
  confirm,
}: {
  r: PlatformRestaurant;
  now: number;
  pendingAction: string | undefined;
  onUpdate: Update;
  confirm: ReturnType<typeof useConfirm>['confirm'];
}) {
  const busy = Boolean(pendingAction);
  const trial = trialState(r.trial_ends_at, now);
  const [copied, setCopied] = React.useState(false);

  const changePlan = async (plan: PlanId) => {
    if (plan === r.plan || busy) return;
    const downgrade = PLAN_ORDER[plan] < PLAN_ORDER[r.plan];
    if (downgrade) {
      const ok = await confirm({
        title: `Move ${r.name} to ${PLAN_INFO[plan].name}?`,
        description: `They lose the ${planName(r.plan)} features straight away (data is kept). Make sure the owner knows.`,
        confirmLabel: `Move to ${PLAN_INFO[plan].name}`,
        danger: true,
      });
      if (!ok) return;
    }
    await onUpdate(r.id, { plan }, { plan }, { action: `plan:${plan}`, success: `${r.name} is now on ${PLAN_INFO[plan].name}.` });
  };

  const extend = (days: number) => {
    if (busy) return;
    const end = extendedTrialEnd(r.trial_ends_at, days, Date.now());
    void onUpdate(
      r.id,
      { trial_ends_at: end },
      { trial_ends_at: end },
      { action: `extend:${days}`, success: `Trial extended to ${formatDate(end)}.` },
    );
  };

  const endTrial = async () => {
    if (busy) return;
    const ok = await confirm({
      title: 'End the trial now?',
      description: `${r.name} stops being on a free trial today. Their plan stays ${planName(r.plan)}.`,
      confirmLabel: 'End trial',
      danger: true,
    });
    if (!ok) return;
    await onUpdate(r.id, { end_trial: true }, { trial_ends_at: null }, { action: 'end_trial', success: 'Trial ended.' });
  };

  const toggleStatus = async () => {
    if (busy) return;
    if (r.status === 'active') {
      const ok = await confirm({
        title: `Suspend ${r.name}?`,
        description: 'Suspending stops new orders: guests can no longer order from their QR codes, takeaway page or POS. Staff can still sign in and you can reactivate at any time.',
        confirmLabel: 'Suspend',
        danger: true,
      });
      if (!ok) return;
      await onUpdate(r.id, { status: 'suspended' }, { status: 'suspended' }, { action: 'status', success: `${r.name} is suspended.` });
    } else {
      await onUpdate(r.id, { status: 'active' }, { status: 'active' }, { action: 'status', success: `${r.name} is active again.` });
    }
  };

  const setListed = (listed: boolean) => {
    if (busy) return;
    void onUpdate(r.id, { listed }, { listed }, { action: 'listed', success: listed ? 'Listed in the directory.' : 'Removed from the directory.' });
  };

  const copyEmail = async () => {
    if (!r.owner_email) return;
    try {
      await navigator.clipboard.writeText(r.owner_email);
      setCopied(true);
      toast.success('Owner email copied.');
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error('Could not copy. Select the email and copy it by hand.');
    }
  };

  return (
    <div className="grid gap-6 pb-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <PlanBadge plan={r.plan} />
        <StatusBadge status={r.status} />
        {r.listed && <span className="rounded-full bg-sky-soft px-2.5 py-0.5 font-mono text-2xs font-medium uppercase tracking-[0.12em] text-[#245a9f]">Listed</span>}
        <span className={cn('rounded-full px-2.5 py-0.5 font-mono text-2xs font-medium uppercase tracking-[0.12em]', r.is_open ? 'bg-mint-soft text-[#1b6f49]' : 'bg-sunk text-muted')}>
          {r.is_open ? 'Open now' : 'Closed now'}
        </span>
      </div>

      {/* Facts */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl bg-sunk/60 p-4 text-sm sm:grid-cols-3">
        <Fact label="Orders 30d" value={r.orders_30d.toLocaleString('en-IN')} mono />
        <Fact label="GMV 30d" value={formatINR(r.gmv_30d)} mono />
        <Fact label="Last order" value={r.last_order_at ? timeAgo(r.last_order_at, now) : 'Never'} title={r.last_order_at ? formatDateTime(r.last_order_at) : undefined} />
        <Fact label="Tables" value={String(r.table_count)} mono />
        <Fact label="Dishes" value={String(r.dish_count)} mono />
        <Fact label="Staff" value={String(r.staff_count)} mono />
        <Fact label="Signed up" value={formatDate(r.created_at)} />
        <Fact label="Trial" value={trialLabel(trial)} />
        <Fact label="Phone" value={r.phone ?? '—'} />
      </dl>

      {/* Owner */}
      <section aria-labelledby="owner-h" className="grid gap-2">
        <h3 id="owner-h" className="eyebrow">Owner</h3>
        <div className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-line/10 p-3">
          {r.owner_email ? (
            <a href={`mailto:${r.owner_email}`} className="min-w-0 truncate text-sm font-medium hover:text-ember">
              {r.owner_email}
            </a>
          ) : (
            <span className="text-sm text-muted">No owner email on file</span>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={copyEmail}
            disabled={!r.owner_email}
            leftIcon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
        <Button href={publicPageUrl(r.slug)} external variant="outline" size="sm" leftIcon={<ExternalLink className="h-4 w-4" />} className="justify-self-start">
          Open public page
        </Button>
      </section>

      {/* Plan */}
      <section aria-labelledby="plan-h" className="grid gap-2">
        <h3 id="plan-h" className="eyebrow">Plan</h3>
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Plan">
          {PLAN_IDS.map((id) => {
            const info = PLAN_INFO[id];
            const current = r.plan === id;
            const loading = pendingAction === `plan:${id}`;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={current}
                disabled={busy && !loading}
                onClick={() => void changePlan(id)}
                className={cn(
                  'relative rounded-2xl border p-3 text-left transition active:scale-[0.98] disabled:opacity-60',
                  current ? 'border-ink bg-ink text-paper' : 'border-line/15 bg-surface hover:border-line/30',
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-display text-[15px] font-semibold">{info.name}</span>
                  {current && <Check className="h-4 w-4" aria-hidden />}
                  {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
                </span>
                <span className={cn('tnum mt-1 block font-mono text-[13px]', current ? 'text-paper/80' : 'text-fg/80')}>
                  {formatINR(info.monthly)}/mo
                </span>
                <span className={cn('tnum block font-mono text-2xs', current ? 'text-paper/60' : 'text-muted')}>
                  {formatINR(info.setup)} setup
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Trial */}
      <section aria-labelledby="trial-h" className="grid gap-2">
        <h3 id="trial-h" className="eyebrow">Trial</h3>
        <p className="text-sm">
          <span className={cn('font-medium', trial.kind === 'ended' && 'text-rose')}>{trialLabel(trial) === '—' ? 'Not on a trial' : trialLabel(trial)}</span>
          {r.trial_ends_at && <span className="text-muted"> · ends {formatDate(r.trial_ends_at)}</span>}
        </p>
        <div className="flex flex-wrap gap-2">
          {[7, 14, 30].map((d) => (
            <Button key={d} size="sm" variant="outline" onClick={() => extend(d)} disabled={busy} loading={pendingAction === `extend:${d}`}>
              +{d} days
            </Button>
          ))}
          <Button size="sm" variant="ghost" className="text-rose" onClick={() => void endTrial()} disabled={busy || trial.kind !== 'active'} loading={pendingAction === 'end_trial'}>
            End trial now
          </Button>
        </div>
        <p className="text-xs text-muted">Extensions count from today or the current end date, whichever is later.</p>
      </section>

      {/* Directory */}
      <section aria-labelledby="dir-h" className="grid gap-2">
        <h3 id="dir-h" className="eyebrow">Directory</h3>
        <div className="rounded-2xl border border-line/10 p-3">
          <Toggle
            checked={r.listed}
            onChange={setListed}
            disabled={busy}
            label="Listed in the public directory"
            description="Shown at /restaurants with a link to their page."
          />
        </div>
      </section>

      {/* Status */}
      <section aria-labelledby="status-h" className="grid gap-2">
        <h3 id="status-h" className="eyebrow">Status</h3>
        <div className={cn('rounded-2xl border p-3', r.status === 'suspended' ? 'border-rose/30 bg-rose-soft/40' : 'border-line/10')}>
          <p className="text-sm">
            {r.status === 'suspended'
              ? 'Suspended: guests cannot place new orders.'
              : 'Active: taking orders normally.'}
          </p>
          <div className="mt-3">
            {r.status === 'active' ? (
              <Button size="sm" variant="danger" onClick={() => void toggleStatus()} disabled={busy} loading={pendingAction === 'status'} leftIcon={<PauseCircle className="h-4 w-4" />}>
                Suspend
              </Button>
            ) : (
              <Button size="sm" variant="success" onClick={() => void toggleStatus()} disabled={busy} loading={pendingAction === 'status'} leftIcon={<PlayCircle className="h-4 w-4" />}>
                Reactivate
              </Button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function Fact({ label, value, mono, title }: { label: string; value: string; mono?: boolean; title?: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{label}</dt>
      <dd className={cn('mt-0.5 truncate', mono ? 'tnum font-mono font-semibold' : 'font-medium')} title={title ?? value}>
        {value}
      </dd>
    </div>
  );
}
