'use client';

import * as React from 'react';
import { Pencil, Plus, Ticket, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Coupon } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { cn, formatINR } from '@/lib/utils';
import { Badge, Button, EmptyState, Input, Sheet, Toggle } from '@/components/ui';
import { useConfirm } from '../confirm-dialog';
import { useNow } from '../use-now';
import { errorMessage } from '../format';
import { DataTable, ErrorNote, InfoNote, ListSkeleton, Td, Th, formatIst, istInputToIso, istInputValue, numInput, parseNum } from '../inventory/ops-shared';
import type { PromotionsContext } from './promotions-view';

/** "10% off, up to ₹150, min ₹300" / "₹100 off, min ₹500" */
export function couponSummary(c: Pick<Coupon, 'kind' | 'value' | 'max_discount' | 'min_order'>): string {
  const parts = [c.kind === 'percent' ? `${Number(c.value.toFixed(2))}% off` : `${formatINR(c.value)} off`];
  if (c.kind === 'percent' && c.max_discount) parts.push(`up to ${formatINR(c.max_discount)}`);
  if (c.min_order > 0) parts.push(`min ${formatINR(c.min_order)}`);
  return parts.join(', ');
}

type CouponState = 'live' | 'scheduled' | 'expired' | 'used_up' | 'off';

function couponState(c: Coupon, now: number): CouponState {
  if (!c.is_active) return 'off';
  if (c.usage_limit !== null && c.used_count >= c.usage_limit) return 'used_up';
  if (c.valid_until && new Date(c.valid_until).getTime() <= now) return 'expired';
  if (c.valid_from && new Date(c.valid_from).getTime() > now) return 'scheduled';
  return 'live';
}

function StateBadge({ state }: { state: CouponState }) {
  switch (state) {
    case 'live':
      return (
        <Badge tone="mint" dot>
          Live
        </Badge>
      );
    case 'scheduled':
      return <Badge tone="sky">Scheduled</Badge>;
    case 'expired':
      return <Badge tone="rose">Expired</Badge>;
    case 'used_up':
      return <Badge tone="saffron">Used up</Badge>;
    default:
      return <Badge tone="neutral">Off</Badge>;
  }
}

function validity(c: Coupon): string {
  if (c.valid_from && c.valid_until) return `${formatIst(c.valid_from)} – ${formatIst(c.valid_until)}`;
  if (c.valid_from) return `From ${formatIst(c.valid_from)}`;
  if (c.valid_until) return `Until ${formatIst(c.valid_until)}`;
  return 'No end date';
}

function uses(c: Coupon): string {
  return c.usage_limit !== null ? `${c.used_count} / ${c.usage_limit}` : `${c.used_count}`;
}

export function CouponsTab({ ctx }: { ctx: PromotionsContext }) {
  const { token, canEdit, loadFailed } = ctx;
  const now = useNow(60_000);
  const [coupons, setCoupons] = React.useState<Coupon[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<Coupon | null>(null);
  const [open, setOpen] = React.useState(false);
  const [togglingId, setTogglingId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setCoupons(await adminApi.coupons(token));
      setError(null);
    } catch (e) {
      setError(loadFailed(e, 'Could not load coupons.'));
      setCoupons((p) => p ?? []);
    }
  }, [token, loadFailed]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const upsert = (row: Coupon) =>
    setCoupons((prev) => {
      const l = prev ?? [];
      return l.some((x) => x.id === row.id) ? l.map((x) => (x.id === row.id ? row : x)) : [row, ...l];
    });

  const toggle = async (c: Coupon, v: boolean) => {
    setTogglingId(c.id);
    upsert({ ...c, is_active: v });
    try {
      upsert(await adminApi.updateCoupon(token, c.id, { is_active: v }));
      toast.success(v ? `${c.code} is on.` : `${c.code} is off. Guests can no longer use it.`);
    } catch (e) {
      upsert(c);
      toast.error(errorMessage(e, 'Could not update the coupon.'));
    } finally {
      setTogglingId(null);
    }
  };

  const edit = (c: Coupon | null) => {
    setEditing(c);
    setOpen(true);
  };

  const list = coupons ?? [];

  return (
    <div>
      <InfoNote className="mb-4">
        Guests type the code in their cart and see the discount before they order. Staff can also give a one-off discount on the bill while settling it.
      </InfoNote>

      {error && <ErrorNote className="mb-4">{error}</ErrorNote>}

      {canEdit && list.length > 0 && (
        <div className="mb-4 flex justify-end">
          <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => edit(null)}>
            New coupon
          </Button>
        </div>
      )}

      {coupons === null ? (
        <ListSkeleton rows={3} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={<Ticket className="h-5 w-5" />}
          title="No coupons yet"
          description="Create a code like WELCOME10 for first visits or LUNCH50 for weekday lunches, then share it on your counter, Instagram or WhatsApp."
          action={
            canEdit ? (
              <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => edit(null)}>
                Create a coupon
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <DataTable
            head={
              <tr>
                <Th>Code</Th>
                <Th>Offer</Th>
                <Th>Valid (IST)</Th>
                <Th right>Uses</Th>
                <Th>Status</Th>
                {canEdit && <Th right>Active</Th>}
                {canEdit && <Th className="w-12" />}
              </tr>
            }
          >
            {list.map((c) => (
              <tr key={c.id} className={cn(!c.is_active && 'text-fg/60')}>
                <Td>
                  <p className="tnum font-mono font-semibold tracking-[0.06em]">{c.code}</p>
                  {c.description && <p className="mt-0.5 max-w-[240px] truncate text-xs text-muted">{c.description}</p>}
                </Td>
                <Td>{couponSummary(c)}</Td>
                <Td className="text-muted">{validity(c)}</Td>
                <Td right className="tnum whitespace-nowrap font-mono">
                  {uses(c)}
                </Td>
                <Td>
                  <StateBadge state={couponState(c, now)} />
                </Td>
                {canEdit && (
                  <Td right>
                    <div className="flex justify-end">
                      <Toggle size="sm" checked={c.is_active} disabled={togglingId === c.id} onChange={(v) => void toggle(c, v)} />
                    </div>
                  </Td>
                )}
                {canEdit && (
                  <Td>
                    <button
                      type="button"
                      onClick={() => edit(c)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-fg/5 hover:text-fg"
                      aria-label={`Edit ${c.code}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </Td>
                )}
              </tr>
            ))}
          </DataTable>

          <ul className="grid gap-2.5 md:grid-cols-2 lg:hidden">
            {list.map((c) => (
              <li key={c.id} className={cn('rounded-2xl border border-line/10 bg-surface p-4 shadow-soft', !c.is_active && 'bg-sunk/40')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={cn('tnum font-mono text-lg font-semibold tracking-[0.06em]', !c.is_active && 'text-fg/60')}>{c.code}</p>
                    <p className="mt-0.5 text-sm font-medium">{couponSummary(c)}</p>
                    {c.description && <p className="mt-0.5 text-xs text-muted">{c.description}</p>}
                  </div>
                  {canEdit && <Toggle size="sm" checked={c.is_active} disabled={togglingId === c.id} onChange={(v) => void toggle(c, v)} />}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                  <StateBadge state={couponState(c, now)} />
                  <span>{validity(c)}</span>
                  <span aria-hidden>·</span>
                  <span>
                    used <span className="tnum font-mono">{uses(c)}</span>
                  </span>
                </div>
                {canEdit && (
                  <Button size="sm" variant="outline" leftIcon={<Pencil className="h-3.5 w-3.5" />} className="mt-3" onClick={() => edit(c)}>
                    Edit
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <CouponSheet
        open={open}
        coupon={editing}
        token={token}
        onClose={() => setOpen(false)}
        onSaved={upsert}
        onDeleted={(id) => setCoupons((prev) => (prev ?? []).filter((x) => x.id !== id))}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create / edit
// ---------------------------------------------------------------------------

interface CouponDraft {
  code: string;
  description: string;
  kind: 'percent' | 'flat';
  value: string;
  min_order: string;
  max_discount: string;
  valid_from: string;
  valid_until: string;
  usage_limit: string;
  is_active: boolean;
}

function toDraft(c: Coupon | null): CouponDraft {
  return {
    code: c?.code ?? '',
    description: c?.description ?? '',
    kind: c?.kind ?? 'percent',
    value: c ? numInput(c.value) : '',
    min_order: c && c.min_order > 0 ? numInput(c.min_order) : '',
    max_discount: c?.max_discount ? numInput(c.max_discount) : '',
    valid_from: istInputValue(c?.valid_from),
    valid_until: istInputValue(c?.valid_until),
    usage_limit: c?.usage_limit ? String(c.usage_limit) : '',
    is_active: c?.is_active ?? true,
  };
}

const CODE_RE = /^[A-Z0-9_-]{3,20}$/;

function CouponSheet({
  open,
  coupon,
  token,
  onClose,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  coupon: Coupon | null;
  token: string;
  onClose: () => void;
  onSaved: (c: Coupon) => void;
  onDeleted: (id: string) => void;
}) {
  const { confirm, dialog } = useConfirm();
  const [draft, setDraft] = React.useState<CouponDraft>(() => toDraft(coupon));
  const [errors, setErrors] = React.useState<Partial<Record<keyof CouponDraft, string>>>({});
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setDraft(toDraft(coupon));
      setErrors({});
    }
  }, [open, coupon]);

  const set = <K extends keyof CouponDraft>(k: K, v: CouponDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const preview = (() => {
    const value = parseNum(draft.value);
    if (!value || value <= 0) return null;
    return couponSummary({
      kind: draft.kind,
      value,
      max_discount: draft.kind === 'percent' ? parseNum(draft.max_discount) : null,
      min_order: parseNum(draft.min_order) ?? 0,
    });
  })();

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Partial<Record<keyof CouponDraft, string>> = {};
    const code = draft.code.trim().toUpperCase();
    if (!CODE_RE.test(code)) next.code = 'Use 3 to 20 letters, digits, - or _ (no spaces).';
    const value = parseNum(draft.value);
    if (value === null || value <= 0) next.value = 'Enter an amount above 0.';
    else if (draft.kind === 'percent' && value > 100) next.value = 'A percentage cannot be more than 100.';
    const min = draft.min_order.trim() ? parseNum(draft.min_order) : 0;
    if (min === null || min < 0) next.min_order = 'Enter 0 or more.';
    const max = draft.kind === 'percent' && draft.max_discount.trim() ? parseNum(draft.max_discount) : null;
    if (draft.kind === 'percent' && draft.max_discount.trim() && (max === null || max <= 0)) next.max_discount = 'Enter an amount above 0, or leave it empty.';
    const from = draft.valid_from ? istInputToIso(draft.valid_from) : null;
    const until = draft.valid_until ? istInputToIso(draft.valid_until) : null;
    if (draft.valid_from && !from) next.valid_from = 'Pick a date and time.';
    if (draft.valid_until && !until) next.valid_until = 'Pick a date and time.';
    if (from && until && new Date(from) >= new Date(until)) next.valid_until = 'The end must be after the start.';
    const limit = draft.usage_limit.trim() ? Number(draft.usage_limit) : null;
    if (limit !== null && (!Number.isInteger(limit) || limit < 1)) next.usage_limit = 'A whole number of 1 or more, or leave it empty.';
    setErrors(next);
    if (Object.keys(next).length) return;
    const body = {
      code,
      description: draft.description.trim() || null,
      kind: draft.kind,
      value: Math.round((value ?? 0) * 100) / 100,
      min_order: Math.round((min ?? 0) * 100) / 100,
      max_discount: max ? Math.round(max * 100) / 100 : null,
      valid_from: from,
      valid_until: until,
      usage_limit: limit,
      is_active: draft.is_active,
    };
    setSaving(true);
    try {
      const row = coupon ? await adminApi.updateCoupon(token, coupon.id, body) : await adminApi.createCoupon(token, body);
      onSaved(row);
      toast.success(coupon ? `${row.code} saved.` : `${row.code} created. Guests can use it ${row.valid_from && new Date(row.valid_from) > new Date() ? `from ${formatIst(row.valid_from)}` : 'now'}.`);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save the coupon.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!coupon) return;
    const ok = await confirm({
      title: `Delete ${coupon.code}?`,
      description: 'Guests can no longer use it. Orders that already used it keep their discount. To pause it instead, switch it off.',
      confirmLabel: 'Delete coupon',
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await adminApi.deleteCoupon(token, coupon.id);
      onDeleted(coupon.id);
      toast.success(`${coupon.code} deleted.`);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete the coupon.'));
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
        title={coupon ? `Edit ${coupon.code}` : 'New coupon'}
        description="Times are India time (IST)."
        className="md:max-w-lg"
        footer={
          <div className="flex items-center gap-2">
            {coupon && (
              <Button type="button" variant="ghost" size="sm" loading={deleting} leftIcon={<Trash2 className="h-4 w-4" />} onClick={() => void remove()} className="text-rose hover:bg-rose-soft">
                Delete
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" form="coupon-form" loading={saving}>
                {coupon ? 'Save changes' : 'Create coupon'}
              </Button>
            </div>
          </div>
        }
      >
        <form id="coupon-form" onSubmit={save} className="grid gap-4 pb-2" noValidate>
          <Input
            label="Code"
            value={draft.code}
            maxLength={20}
            onChange={(e) => set('code', e.target.value.toUpperCase().replace(/\s+/g, ''))}
            placeholder="WELCOME10"
            error={errors.code}
            hint="3 to 20 letters, digits, - or _. Guests type this."
            className="tnum font-mono uppercase tracking-[0.06em]"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            data-autofocus
          />
          <Input
            label="Description (optional)"
            value={draft.description}
            maxLength={160}
            onChange={(e) => set('description', e.target.value)}
            placeholder="First-visit offer from our Instagram"
            hint="For your team; guests see the discount itself."
          />

          <div>
            <p className="mb-1.5 text-[13px] font-semibold text-fg/80">Discount type</p>
            <div className="flex rounded-full bg-sunk p-1" role="radiogroup" aria-label="Discount type">
              {(
                [
                  { id: 'percent', label: 'Percent (%)' },
                  { id: 'flat', label: 'Flat (₹)' },
                ] as const
              ).map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={draft.kind === o.id}
                  onClick={() => set('kind', o.id)}
                  className={cn(
                    'inline-flex h-9 flex-1 items-center justify-center rounded-full text-[13px] font-semibold transition',
                    draft.kind === o.id ? 'bg-surface text-fg shadow-soft' : 'text-muted hover:text-fg',
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label={draft.kind === 'percent' ? 'Percent off' : 'Amount off'}
              inputMode="decimal"
              prefix={draft.kind === 'flat' ? '₹' : undefined}
              value={draft.value}
              onChange={(e) => set('value', e.target.value)}
              placeholder={draft.kind === 'percent' ? '10' : '100'}
              error={errors.value}
              hint={draft.kind === 'percent' ? 'Up to 100' : undefined}
              className="tnum font-mono"
            />
            <Input
              label="Minimum order"
              inputMode="decimal"
              prefix="₹"
              value={draft.min_order}
              onChange={(e) => set('min_order', e.target.value)}
              placeholder="0"
              error={errors.min_order}
              hint="Food total before tax"
              className="tnum font-mono"
            />
          </div>
          {draft.kind === 'percent' && (
            <Input
              label="Maximum discount (optional)"
              inputMode="decimal"
              prefix="₹"
              value={draft.max_discount}
              onChange={(e) => set('max_discount', e.target.value)}
              placeholder="150"
              error={errors.max_discount}
              hint="Caps the discount on big orders"
              className="tnum font-mono"
            />
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Valid from (IST, optional)" type="datetime-local" value={draft.valid_from} onChange={(e) => set('valid_from', e.target.value)} error={errors.valid_from} />
            <Input label="Valid until (IST, optional)" type="datetime-local" value={draft.valid_until} onChange={(e) => set('valid_until', e.target.value)} error={errors.valid_until} />
          </div>
          <Input
            label="Usage limit (optional)"
            inputMode="numeric"
            value={draft.usage_limit}
            onChange={(e) => set('usage_limit', e.target.value.replace(/\D/g, ''))}
            placeholder="500"
            error={errors.usage_limit}
            hint={coupon ? `Used ${coupon.used_count} time${coupon.used_count === 1 ? '' : 's'} so far. Empty means no limit.` : 'Total uses across all guests. Empty means no limit.'}
            className="tnum font-mono"
          />
          <Toggle checked={draft.is_active} onChange={(v) => set('is_active', v)} label="Active" description={draft.is_active ? 'Guests can use it within the dates above' : 'Paused; guests cannot use it'} />

          {preview && (
            <p className="rounded-xl bg-sunk px-3.5 py-3 text-sm text-fg/85" aria-live="polite">
              Guests who enter <span className="tnum font-mono font-semibold">{draft.code.trim().toUpperCase() || '…'}</span> get {preview}.
            </p>
          )}
        </form>
      </Sheet>
      {dialog}
    </>
  );
}
