'use client';

import * as React from 'react';
import { Gift, Info, RefreshCw, Search, Ticket } from 'lucide-react';
import { toast } from 'sonner';
import type { LoyaltyProgram, LoyaltyReward } from '@restaurant-os/shared';
import { formatIndianPhone, planHas } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/utils';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Input, Skeleton, Toggle } from '@/components/ui';
import { useAdmin } from './admin-provider';
import { useConfirm } from './confirm-dialog';
import { Chip, ChipRow, PageHeader } from './page-header';
import { StatTile } from './stat-tile';
import { shortDate } from './crm';
import { errorMessage } from './format';
import { UpgradeCard, isManagerRole, isPlanError } from './plan';

const REFRESH_MS = 60_000;

type RewardTab = 'active' | 'redeemed' | 'expired' | 'all';
const TABS: Array<{ id: RewardTab; label: string }> = [
  { id: 'active', label: 'Active' },
  { id: 'redeemed', label: 'Redeemed' },
  { id: 'expired', label: 'Expired' },
  { id: 'all', label: 'All' },
];

export type RewardState = 'active' | 'redeemed' | 'expired';

export function rewardState(r: Pick<LoyaltyReward, 'redeemed_at' | 'expires_at'>, now: number = Date.now()): RewardState {
  if (r.redeemed_at) return 'redeemed';
  return new Date(r.expires_at).getTime() <= now ? 'expired' : 'active';
}

export function RewardStateBadge({ reward, now }: { reward: Pick<LoyaltyReward, 'redeemed_at' | 'expires_at'>; now?: number }) {
  const state = rewardState(reward, now);
  if (state === 'redeemed') return <Badge tone="neutral">Redeemed</Badge>;
  if (state === 'expired') return <Badge tone="rose">Expired</Badge>;
  return (
    <Badge tone="mint" dot>
      Active
    </Badge>
  );
}

const LOYALTY_POINTS = [
  'Reward regulars automatically on every Nth visit',
  'The guest sees their reward code on their phone',
  'Staff redeem the code at the counter in one tap',
  'Expiry dates so rewards do not pile up',
];

interface ProgramDraft {
  enabled: boolean;
  visits_required: string;
  reward_text: string;
  reward_expiry_days: string;
}

function toDraft(p: LoyaltyProgram): ProgramDraft {
  return {
    enabled: p.enabled,
    visits_required: String(p.visits_required),
    reward_text: p.reward_text,
    reward_expiry_days: String(p.reward_expiry_days),
  };
}

export function LoyaltyView() {
  const { restaurant } = useAdmin();
  if (!planHas(restaurant.plan, 'loyalty')) {
    return (
      <div className="mx-auto w-full max-w-[1400px]">
        <PageHeader title="Loyalty" description="Reward the guests who keep coming back." />
        <UpgradeCard plan="premium" title="Turn regulars into fans" description="Visit-based loyalty rewards are part of the Premium plan." points={LOYALTY_POINTS} />
      </div>
    );
  }
  return <LoyaltyInner />;
}

function LoyaltyInner() {
  const { token, staff } = useAdmin();
  const canEdit = isManagerRole(staff.role);
  const { confirm, dialog } = useConfirm();
  const [program, setProgram] = React.useState<LoyaltyProgram | null>(null);
  const [stats, setStats] = React.useState<{ active: number; redeemed: number } | null>(null);
  const [draft, setDraft] = React.useState<ProgramDraft | null>(null);
  const [errors, setErrors] = React.useState<Partial<Record<keyof ProgramDraft, string>>>({});
  const [saving, setSaving] = React.useState(false);
  const [tab, setTab] = React.useState<RewardTab>('active');
  const [rewards, setRewards] = React.useState<LoyaltyReward[] | null>(null);
  const [q, setQ] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [locked, setLocked] = React.useState<string | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [redeemingId, setRedeemingId] = React.useState<string | null>(null);
  const requestId = React.useRef(0);
  const lastLoad = React.useRef(0);
  const dirtyRef = React.useRef(false);

  const loadProgram = React.useCallback(async () => {
    try {
      const res = await adminApi.loyalty(token);
      setProgram(res.program);
      setStats(res.stats);
      // Never overwrite what the owner is typing.
      if (!dirtyRef.current) setDraft(toDraft(res.program));
    } catch (e) {
      if (isPlanError(e)) setLocked(e.message);
      else setError(errorMessage(e, 'Could not load the loyalty program.'));
    }
  }, [token]);

  const loadRewards = React.useCallback(async () => {
    const id = ++requestId.current;
    lastLoad.current = Date.now();
    try {
      const res = await adminApi.rewards(token, tab);
      if (id !== requestId.current) return;
      setRewards(res);
      setError(null);
    } catch (e) {
      if (id !== requestId.current) return;
      if (isPlanError(e)) setLocked(e.message);
      else setError(errorMessage(e, 'Could not load rewards.'));
      setRewards((prev) => prev ?? []);
    }
  }, [token, tab]);

  const refreshAll = React.useCallback(async () => {
    await Promise.all([loadProgram(), loadRewards()]);
  }, [loadProgram, loadRewards]);

  React.useEffect(() => {
    void loadProgram();
  }, [loadProgram]);

  React.useEffect(() => {
    setRewards(null);
    void loadRewards();
  }, [loadRewards]);

  // Every minute while visible, and when the window regains focus.
  React.useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshAll();
    }, REFRESH_MS);
    const loadIfStale = () => {
      if (Date.now() - lastLoad.current > 3_000) void refreshAll();
    };
    const onFocus = () => loadIfStale();
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadIfStale();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshAll]);

  const set = <K extends keyof ProgramDraft>(key: K, value: ProgramDraft[K]) => {
    dirtyRef.current = true;
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  };

  const dirty =
    !!draft &&
    !!program &&
    (draft.enabled !== program.enabled ||
      draft.visits_required !== String(program.visits_required) ||
      draft.reward_text !== program.reward_text ||
      draft.reward_expiry_days !== String(program.reward_expiry_days));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const next: Partial<Record<keyof ProgramDraft, string>> = {};
    const visits = Number(draft.visits_required);
    if (!Number.isInteger(visits) || visits < 2 || visits > 50) next.visits_required = 'A whole number from 2 to 50.';
    const text = draft.reward_text.trim();
    if (!text) next.reward_text = 'Describe the reward, e.g. “A free dessert”.';
    else if (text.length > 120) next.reward_text = 'Keep it under 120 characters.';
    const days = Number(draft.reward_expiry_days);
    if (!Number.isInteger(days) || days < 1 || days > 365) next.reward_expiry_days = 'A whole number from 1 to 365.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      const saved = await adminApi.saveLoyalty(token, { enabled: draft.enabled, visits_required: visits, reward_text: text, reward_expiry_days: days });
      setProgram(saved);
      dirtyRef.current = false;
      setDraft(toDraft(saved));
      toast.success(saved.enabled ? `Loyalty is on: a reward every ${saved.visits_required} visits.` : 'Loyalty program saved (switched off).');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save the loyalty program.'));
    } finally {
      setSaving(false);
    }
  };

  const redeem = async (r: LoyaltyReward) => {
    const who = r.customer?.name?.trim() || (r.customer ? formatIndianPhone(r.customer.phone) : 'this guest');
    const ok = await confirm({
      title: `Redeem ${r.code}?`,
      description: (
        <>
          Give <span className="font-medium text-fg">{who}</span> “{r.reward_text}”. The code cannot be used again.
        </>
      ),
      confirmLabel: 'Redeem reward',
    });
    if (!ok) return;
    setRedeemingId(r.id);
    try {
      await adminApi.redeemReward(token, r.id);
      toast.success(`${r.code} redeemed. Enjoy, ${r.customer?.name?.trim() || 'guest'}!`);
      await refreshAll();
    } catch (e) {
      toast.error(errorMessage(e, 'Could not redeem the reward.'));
    } finally {
      setRedeemingId(null);
    }
  };

  if (locked) {
    return (
      <div className="mx-auto w-full max-w-[1400px]">
        <PageHeader title="Loyalty" />
        <UpgradeCard plan="premium" title="Turn regulars into fans" description="Visit-based loyalty rewards are part of the Premium plan." message={locked} points={LOYALTY_POINTS} />
      </div>
    );
  }

  const needle = q.trim().toUpperCase();
  const digits = q.replace(/\D/g, '');
  const filtered = (rewards ?? []).filter((r) => {
    if (!needle) return true;
    if (r.code.toUpperCase().includes(needle)) return true;
    if (digits.length >= 3 && r.customer?.phone.replace(/\D/g, '').includes(digits)) return true;
    return false;
  });

  return (
    <div className="mx-auto w-full max-w-[1400px]">
      <PageHeader
        title="Loyalty"
        description="Regulars earn a reward automatically. Redeem the code the guest shows you."
        actions={
          <Button
            variant="outline"
            size="sm"
            loading={refreshing}
            leftIcon={<RefreshCw className="h-4 w-4" />}
            onClick={async () => {
              setRefreshing(true);
              await refreshAll();
              setRefreshing(false);
            }}
          >
            Refresh
          </Button>
        }
      />

      {error && (
        <p className="mb-4 rounded-xl bg-rose-soft px-4 py-3 text-sm font-medium text-[#a1282c]" role="alert">
          {error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Active rewards" value={stats?.active ?? 0} loading={!stats} icon={<Ticket className="h-4 w-4" />} tone="mint" />
            <StatTile label="Redeemed" value={stats?.redeemed ?? 0} loading={!stats} icon={<Gift className="h-4 w-4" />} tone="ember" hint="All time" />
          </div>

          <Card>
            <CardHeader
              title="Program"
              description={canEdit ? 'Changes apply to visits from now on.' : 'Only owners and managers can change the program.'}
              action={program && <Badge tone={program.enabled ? 'mint' : 'neutral'} dot>{program.enabled ? 'On' : 'Off'}</Badge>}
            />
            <CardBody className="pt-4">
              {!draft ? (
                <div className="space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-11 w-full" />
                  <Skeleton className="h-11 w-full" />
                </div>
              ) : (
                <form onSubmit={save} className="grid gap-4" noValidate>
                  <Toggle
                    checked={draft.enabled}
                    onChange={(v) => set('enabled', v)}
                    disabled={!canEdit}
                    label="Loyalty rewards"
                    description={draft.enabled ? 'Guests earn rewards as they visit' : 'No new rewards are created'}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      label="Every N visits"
                      type="number"
                      inputMode="numeric"
                      min={2}
                      max={50}
                      value={draft.visits_required}
                      onChange={(e) => set('visits_required', e.target.value)}
                      disabled={!canEdit}
                      error={errors.visits_required}
                      hint="2 to 50"
                      className="tnum font-mono"
                    />
                    <Input
                      label="Valid for (days)"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={365}
                      value={draft.reward_expiry_days}
                      onChange={(e) => set('reward_expiry_days', e.target.value)}
                      disabled={!canEdit}
                      error={errors.reward_expiry_days}
                      hint="1 to 365"
                      className="tnum font-mono"
                    />
                  </div>
                  <Input
                    label="Reward"
                    value={draft.reward_text}
                    maxLength={120}
                    onChange={(e) => set('reward_text', e.target.value)}
                    disabled={!canEdit}
                    error={errors.reward_text}
                    placeholder="A free dessert of your choice"
                    hint={`${draft.reward_text.length}/120`}
                  />
                  <p className="rounded-xl bg-sunk px-3.5 py-3 text-sm text-fg/80">
                    Every <span className="tnum font-mono font-semibold">{draft.visits_required || '…'}</span> visits, the guest gets “{draft.reward_text.trim() || '…'}”, valid for{' '}
                    <span className="tnum font-mono font-semibold">{draft.reward_expiry_days || '…'}</span> days.
                  </p>
                  <div className="flex items-start gap-2.5 rounded-2xl border border-sky/25 bg-sky-soft px-3.5 py-3 text-[13px] leading-relaxed text-[#245a9f]">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <p>
                      A visit is one table session with at least one served order. Rewards are created automatically when the qualifying order is marked served; the guest sees the code on their
                      phone. Only guests who leave their phone number at checkout collect visits.
                    </p>
                  </div>
                  {canEdit && (
                    <div className="flex justify-end">
                      <Button type="submit" loading={saving} disabled={!dirty}>
                        Save program
                      </Button>
                    </div>
                  )}
                </form>
              )}
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader title="Rewards" description="Codes guests have earned. Ask for the code on their phone, then redeem it here." />
          <CardBody className="pt-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <ChipRow label="Reward status" className="sm:flex-1">
                {TABS.map((t) => (
                  <Chip key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
                    {t.label}
                  </Chip>
                ))}
              </ChipRow>
              <div className="sm:w-[240px]">
                <Input
                  aria-label="Search by code or phone"
                  placeholder="Code or phone…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  prefix={<Search className="h-4 w-4" />}
                  className="h-10"
                  inputMode="search"
                />
              </div>
            </div>

            <div className="mt-4">
              {rewards === null ? (
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="h-24 w-full rounded-2xl" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <EmptyState
                  icon={<Ticket className="h-5 w-5" />}
                  title={needle ? 'No reward matches' : tab === 'active' ? 'No active rewards' : `No ${tab === 'all' ? '' : `${tab} `}rewards`}
                  description={
                    needle
                      ? 'Check the code on the guest’s phone, or search by the last digits of their number.'
                      : tab === 'active'
                        ? 'Rewards appear here as soon as a regular reaches their next milestone visit.'
                        : undefined
                  }
                  className="py-10"
                />
              ) : (
                <ul className="space-y-2">
                  {filtered.map((r) => {
                    const state = rewardState(r);
                    return (
                      <li key={r.id} className={cn('rounded-2xl border border-line/10 p-4', state !== 'active' && 'bg-sunk/40')}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className={cn('tnum font-mono text-2xl font-semibold tracking-[0.08em]', state !== 'active' && 'text-fg/60')}>{r.code}</p>
                            <p className="mt-1 text-sm font-medium">{r.reward_text}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <RewardStateBadge reward={r} />
                            {state === 'active' && (
                              <Button size="sm" loading={redeemingId === r.id} onClick={() => void redeem(r)}>
                                Redeem
                              </Button>
                            )}
                          </div>
                        </div>
                        <p className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted">
                          <span className="font-medium text-fg/80">{r.customer?.name?.trim() || 'Guest'}</span>
                          {r.customer && <span className="tnum font-mono">{formatIndianPhone(r.customer.phone)}</span>}
                          <span aria-hidden>·</span>
                          <span>
                            Earned {shortDate(r.earned_at)} (visit <span className="tnum font-mono">{r.visits_at_earn}</span>)
                          </span>
                          <span aria-hidden>·</span>
                          {r.redeemed_at ? (
                            <span>
                              Redeemed <span className="tnum font-mono">{formatDateTime(r.redeemed_at)}</span>
                            </span>
                          ) : (
                            <span>
                              {state === 'expired' ? 'Expired' : 'Expires'} {shortDate(r.expires_at)}
                            </span>
                          )}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </CardBody>
        </Card>
      </div>
      {dialog}
    </div>
  );
}
