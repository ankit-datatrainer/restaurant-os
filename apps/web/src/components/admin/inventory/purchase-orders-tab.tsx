'use client';

import * as React from 'react';
import { CalendarClock, ChevronRight, ClipboardList, MessageCircle, PackageCheck, Plus, Send, Trash2, Truck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { Ingredient, PurchaseOrder, PurchaseOrderStatus, Supplier } from '@restaurant-os/shared';
import { PURCHASE_ORDER_STATUS_LABEL, normalizeIndianPhone, poCode, whatsappLink } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { cn, formatINR } from '@/lib/utils';
import { Badge, Button, EmptyState, Input, Select, Sheet, Textarea } from '@/components/ui';
import { useAdmin } from '../admin-provider';
import { useConfirm } from '../confirm-dialog';
import { Chip, ChipRow } from '../page-header';
import { errorMessage } from '../format';
import {
  DataTable,
  ErrorNote,
  ListSkeleton,
  Td,
  Th,
  fmtQty,
  formatIstDay,
  isLow,
  istToday,
  numInput,
  parseNum,
  round2,
  round3,
  useLastNonNull,
} from './ops-shared';
import type { InventoryContext } from './inventory-view';

const STATUS_TONE: Record<PurchaseOrderStatus, 'neutral' | 'sky' | 'saffron' | 'mint' | 'rose'> = {
  draft: 'neutral',
  ordered: 'sky',
  partially_received: 'saffron',
  received: 'mint',
  cancelled: 'rose',
};

const OPEN: PurchaseOrderStatus[] = ['draft', 'ordered', 'partially_received'];

function StatusBadge({ status }: { status: PurchaseOrderStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]} dot={OPEN.includes(status)}>
      {PURCHASE_ORDER_STATUS_LABEL[status]}
    </Badge>
  );
}

function isOverdue(po: PurchaseOrder): boolean {
  return !!po.expected_on && OPEN.includes(po.status) && po.status !== 'draft' && po.expected_on < istToday();
}

type Filter = 'open' | 'all';

export function PurchaseOrdersTab({ ctx }: { ctx: InventoryContext }) {
  const { token, canEdit, ingredients, suppliers, loadFailed, reloadIngredients } = ctx;
  const [filter, setFilter] = React.useState<Filter>('open');
  const [orders, setOrders] = React.useState<PurchaseOrder[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const requestId = React.useRef(0);

  const load = React.useCallback(async () => {
    const id = ++requestId.current;
    try {
      const res = await adminApi.purchaseOrders(token, filter);
      if (id !== requestId.current) return;
      setOrders(res);
      setError(null);
    } catch (e) {
      if (id !== requestId.current) return;
      setError(loadFailed(e, 'Could not load purchase orders.'));
      setOrders((p) => p ?? []);
    }
  }, [token, filter, loadFailed]);

  React.useEffect(() => {
    setOrders(null);
    void load();
  }, [load]);

  const selected = (orders ?? []).find((o) => o.id === selectedId) ?? null;

  const upsert = (po: PurchaseOrder) => {
    setOrders((prev) => {
      const list = prev ?? [];
      const keep = filter === 'all' || OPEN.includes(po.status);
      const exists = list.some((o) => o.id === po.id);
      if (!keep) return list.map((o) => (o.id === po.id ? po : o));
      return exists ? list.map((o) => (o.id === po.id ? po : o)) : [po, ...list];
    });
  };

  const list = orders ?? [];

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <ChipRow label="Purchase order status" className="sm:flex-1">
          <Chip active={filter === 'open'} onClick={() => setFilter('open')}>
            Open
          </Chip>
          <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
            All
          </Chip>
        </ChipRow>
        {canEdit && (
          <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)} className="self-start sm:self-auto">
            New purchase order
          </Button>
        )}
      </div>

      {error && <ErrorNote className="mt-4">{error}</ErrorNote>}

      <div className="mt-4">
        {orders === null ? (
          <ListSkeleton rows={4} />
        ) : list.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="h-5 w-5" />}
            title={filter === 'open' ? 'No open purchase orders' : 'No purchase orders yet'}
            description="Create a purchase order when you buy stock. Receiving it adds the stock and updates the average cost automatically."
            action={
              canEdit ? (
                <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
                  New purchase order
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <DataTable
              head={
                <tr>
                  <Th>Order</Th>
                  <Th>Supplier</Th>
                  <Th>Status</Th>
                  <Th>Expected</Th>
                  <Th right>Items</Th>
                  <Th right>Total</Th>
                  <Th className="w-10" />
                </tr>
              }
            >
              {list.map((po) => (
                <tr key={po.id} className="cursor-pointer transition hover:bg-sunk/40" onClick={() => setSelectedId(po.id)}>
                  <Td>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(po.id);
                      }}
                      className="tnum rounded-md font-mono font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/40"
                      aria-label={`Open ${poCode(po.po_number)}`}
                    >
                      {poCode(po.po_number)}
                    </button>
                  </Td>
                  <Td className={cn(!po.supplier && 'text-muted')}>{po.supplier?.name ?? 'No supplier'}</Td>
                  <Td>
                    <StatusBadge status={po.status} />
                  </Td>
                  <Td className={cn('whitespace-nowrap', isOverdue(po) ? 'font-medium text-rose' : 'text-muted')}>
                    {po.expected_on ? formatIstDay(po.expected_on) : '—'}
                    {isOverdue(po) && ' · late'}
                  </Td>
                  <Td right className="tnum font-mono">
                    {po.items?.length ?? 0}
                  </Td>
                  <Td right className="tnum font-mono font-semibold">
                    {formatINR(po.total)}
                  </Td>
                  <Td>
                    <ChevronRight className="h-4 w-4 text-muted" aria-hidden />
                  </Td>
                </tr>
              ))}
            </DataTable>

            <ul className="grid gap-2.5 md:grid-cols-2 lg:hidden">
              {list.map((po) => (
                <li key={po.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(po.id)}
                    className="flex w-full items-start gap-3 rounded-2xl border border-line/10 bg-surface p-4 text-left shadow-soft transition active:scale-[0.99]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="tnum font-mono font-semibold">{poCode(po.po_number)}</span>
                        <StatusBadge status={po.status} />
                      </div>
                      <p className={cn('mt-1 truncate text-sm', !po.supplier && 'text-muted')}>{po.supplier?.name ?? 'No supplier'}</p>
                      <p className="mt-1 text-xs text-muted">
                        <span className="tnum font-mono">{po.items?.length ?? 0}</span> item{(po.items?.length ?? 0) === 1 ? '' : 's'}
                        {po.expected_on && (
                          <>
                            {' '}
                            · <span className={cn(isOverdue(po) && 'font-medium text-rose')}>expected {formatIstDay(po.expected_on)}</span>
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className="tnum font-mono font-semibold">{formatINR(po.total)}</span>
                      <ChevronRight className="h-4 w-4 text-muted" aria-hidden />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <CreatePoSheet
        open={creating}
        token={token}
        ingredients={ingredients ?? []}
        suppliers={suppliers ?? []}
        onClose={() => setCreating(false)}
        onCreated={(po) => {
          upsert(po);
          setCreating(false);
        }}
      />
      <PoDetailSheet
        po={selected}
        token={token}
        canEdit={canEdit}
        onClose={() => setSelectedId(null)}
        onChanged={(po, received) => {
          upsert(po);
          if (received) void reloadIngredients();
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

interface DraftLine {
  key: string;
  ingredient_id: string;
  quantity: string;
  unit_cost: string;
}

let seq = 0;
const key = () => `p${++seq}`;
const blankLine = (): DraftLine => ({ key: key(), ingredient_id: '', quantity: '', unit_cost: '' });

function CreatePoSheet({
  open,
  token,
  ingredients,
  suppliers,
  onClose,
  onCreated,
}: {
  open: boolean;
  token: string;
  ingredients: Ingredient[];
  suppliers: Supplier[];
  onClose: () => void;
  onCreated: (po: PurchaseOrder) => void;
}) {
  const [supplierId, setSupplierId] = React.useState('');
  const [expected, setExpected] = React.useState('');
  const [note, setNote] = React.useState('');
  const [lines, setLines] = React.useState<DraftLine[]>([blankLine()]);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState<'draft' | 'place' | null>(null);

  React.useEffect(() => {
    if (open) {
      setSupplierId('');
      setExpected('');
      setNote('');
      setLines([blankLine()]);
      setError(null);
    }
  }, [open]);

  const active = ingredients.filter((i) => i.is_active).sort((a, b) => a.name.localeCompare(b.name));
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  const used = new Set(lines.map((l) => l.ingredient_id).filter(Boolean));
  const activeSuppliers = suppliers.filter((s) => s.is_active);
  const low = active.filter((i) => isLow(i) && !used.has(i.id));

  const setLine = (k: string, patch: Partial<DraftLine>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));

  const pickIngredient = (k: string, id: string) => {
    const ing = byId.get(id);
    setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ingredient_id: id, unit_cost: l.unit_cost.trim() || !ing ? l.unit_cost : numInput(ing.avg_cost) } : l)));
  };

  const addLowStock = () => {
    const extra = low.map((i) => {
      const suggest = round3(Math.max(0, i.low_stock_threshold * 2 - Math.max(0, i.stock_qty)));
      return { key: key(), ingredient_id: i.id, quantity: suggest > 0 ? numInput(suggest) : '', unit_cost: numInput(i.avg_cost) };
    });
    setLines((ls) => [...ls.filter((l) => l.ingredient_id || l.quantity.trim() || l.unit_cost.trim()), ...extra]);
  };

  const total = lines.reduce((s, l) => {
    const q = parseNum(l.quantity);
    const c = parseNum(l.unit_cost);
    return q && c && q > 0 && c >= 0 ? s + q * c : s;
  }, 0);

  const submit = async (place: boolean) => {
    const filled = lines.filter((l) => l.ingredient_id || l.quantity.trim());
    if (!filled.length) {
      setError('Add at least one ingredient.');
      return;
    }
    const items: Array<{ ingredient_id: string; quantity: number; unit_cost: number }> = [];
    for (const l of filled) {
      const name = byId.get(l.ingredient_id)?.name ?? 'each line';
      if (!l.ingredient_id) return setError('Pick an ingredient on every line, or remove the empty line.');
      const q = parseNum(l.quantity);
      if (q === null || q <= 0) return setError(`Enter a quantity for ${name}.`);
      const c = l.unit_cost.trim() ? parseNum(l.unit_cost) : 0;
      if (c === null || c < 0) return setError(`Enter a unit cost of 0 or more for ${name}.`);
      items.push({ ingredient_id: l.ingredient_id, quantity: round3(q), unit_cost: round2(c) });
    }
    if (new Set(items.map((i) => i.ingredient_id)).size !== items.length) return setError('Each ingredient can appear once. Add the quantities together instead.');
    setError(null);
    setSaving(place ? 'place' : 'draft');
    try {
      const po = await adminApi.createPurchaseOrder(token, {
        supplier_id: supplierId || null,
        expected_on: expected || null,
        note: note.trim() || null,
        place,
        items,
      });
      toast.success(place ? `${poCode(po.po_number)} placed.` : `${poCode(po.po_number)} saved as a draft.`);
      onCreated(po);
    } catch (err) {
      setError(errorMessage(err, 'Could not save the purchase order.'));
    } finally {
      setSaving(null);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      side="right"
      title="New purchase order"
      description="Stock is only added when you receive the order."
      className="md:max-w-xl"
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <p className="text-sm text-muted sm:mr-auto">
            Total <span className="tnum font-mono text-base font-semibold text-fg">{formatINR(total)}</span>
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1 sm:flex-none" loading={saving === 'draft'} disabled={!!saving} onClick={() => void submit(false)}>
              Save as draft
            </Button>
            <Button type="button" className="flex-1 sm:flex-none" loading={saving === 'place'} disabled={!!saving} leftIcon={<Send className="h-4 w-4" />} onClick={() => void submit(true)}>
              Place order
            </Button>
          </div>
        </div>
      }
    >
      {active.length === 0 ? (
        <EmptyState title="Add ingredients first" description="Purchase orders are made of your ingredients. Add them on the Stock tab." className="py-8" />
      ) : (
        <form
          className="grid gap-4 pb-2"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit(true);
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label="Supplier (optional)" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} hint={activeSuppliers.length ? undefined : 'Add suppliers on the Suppliers tab'}>
              <option value="">No supplier</option>
              {activeSuppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Input label="Expected on (optional)" type="date" value={expected} min={istToday()} onChange={(e) => setExpected(e.target.value)} />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[13px] font-semibold text-fg/80">Items</p>
              {low.length > 0 && (
                <button type="button" onClick={addLowStock} className="text-[13px] font-semibold text-ember-3 underline-offset-2 hover:underline">
                  Add {low.length} low-stock item{low.length === 1 ? '' : 's'}
                </button>
              )}
            </div>
            <ul className="grid gap-2.5">
              {lines.map((l, idx) => {
                const ing = byId.get(l.ingredient_id);
                const q = parseNum(l.quantity);
                const c = parseNum(l.unit_cost);
                const lineTotal = q && c ? q * c : 0;
                return (
                  <li key={l.key} className="rounded-2xl border border-line/10 p-3">
                    <div className="flex items-end gap-2">
                      <div className="min-w-0 flex-1">
                        <Select aria-label={`Ingredient ${idx + 1}`} value={l.ingredient_id} onChange={(e) => pickIngredient(l.key, e.target.value)} className="h-10">
                          <option value="">Choose an ingredient…</option>
                          {active.map((o) => (
                            <option key={o.id} value={o.id} disabled={o.id !== l.ingredient_id && used.has(o.id)}>
                              {o.name} ({o.unit})
                            </option>
                          ))}
                        </Select>
                      </div>
                      <button
                        type="button"
                        onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : [blankLine()]))}
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-rose-soft hover:text-rose"
                        aria-label={`Remove ${ing?.name ?? 'this line'}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Input
                        aria-label={`Quantity${ing ? ` in ${ing.unit}` : ''}`}
                        inputMode="decimal"
                        value={l.quantity}
                        onChange={(e) => setLine(l.key, { quantity: e.target.value })}
                        placeholder={ing ? `Qty (${ing.unit})` : 'Qty'}
                        className="tnum h-10 font-mono"
                      />
                      <Input
                        aria-label={`Cost per ${ing?.unit ?? 'unit'}`}
                        inputMode="decimal"
                        prefix="₹"
                        value={l.unit_cost}
                        onChange={(e) => setLine(l.key, { unit_cost: e.target.value })}
                        placeholder={ing ? `per ${ing.unit}` : 'per unit'}
                        className="tnum h-10 font-mono"
                      />
                    </div>
                    <p className="mt-1.5 flex justify-between gap-2 text-xs text-muted">
                      <span>{ing ? `In stock ${fmtQty(ing.stock_qty, ing.unit)}` : 'Pick an ingredient'}</span>
                      <span className="tnum font-mono font-semibold text-fg/80">{formatINR(lineTotal)}</span>
                    </p>
                  </li>
                );
              })}
            </ul>
            {lines.length < 60 && (
              <Button type="button" variant="outline" size="sm" leftIcon={<Plus className="h-4 w-4" />} className="mt-2.5" onClick={() => setLines((ls) => [...ls, blankLine()])}>
                Add item
              </Button>
            )}
          </div>

          <Textarea label="Note (optional)" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Deliver before 10 am, back gate" className="min-h-[72px]" />

          {error && (
            <p className="rounded-xl bg-rose-soft px-3.5 py-2.5 text-sm font-medium text-[#a1282c]" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Detail + receive
// ---------------------------------------------------------------------------

interface ReceiveLine {
  receive: string;
  unit_cost: string;
}

function poMessage(po: PurchaseOrder, restaurantName: string): string {
  const lines = (po.items ?? []).map((i) => `• ${i.ingredient?.name ?? 'Item'}: ${fmtQty(i.quantity, i.ingredient?.unit)}`);
  const parts = [
    `Hello${po.supplier?.name ? ` ${po.supplier.name}` : ''}, this is ${restaurantName}.`,
    `Purchase order ${poCode(po.po_number)}:`,
    ...lines,
  ];
  if (po.expected_on) parts.push(`Needed by ${formatIstDay(po.expected_on)}.`);
  if (po.note) parts.push(po.note);
  parts.push('Please confirm. Thank you.');
  return parts.join('\n');
}

function PoDetailSheet({
  po: target,
  token,
  canEdit,
  onClose,
  onChanged,
}: {
  po: PurchaseOrder | null;
  token: string;
  canEdit: boolean;
  onClose: () => void;
  onChanged: (po: PurchaseOrder, received: boolean) => void;
}) {
  const { restaurant } = useAdmin();
  const { confirm, dialog } = useConfirm();
  const po = useLastNonNull(target);
  const [mode, setMode] = React.useState<'view' | 'receive'>('view');
  const [recv, setRecv] = React.useState<Record<string, ReceiveLine>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<'order' | 'cancel' | 'receive' | null>(null);

  const openId = target?.id ?? null;
  React.useEffect(() => {
    setMode('view');
    setError(null);
  }, [openId]);

  const startReceive = () => {
    if (!po) return;
    const next: Record<string, ReceiveLine> = {};
    for (const i of po.items ?? []) {
      next[i.id] = { receive: numInput(Math.max(0, round3(i.quantity - i.received_qty))), unit_cost: numInput(i.unit_cost) };
    }
    setRecv(next);
    setError(null);
    setMode('receive');
  };

  if (!po) return dialog;

  const items = po.items ?? [];
  const open = OPEN.includes(po.status);
  const code = poCode(po.po_number);
  const phone = po.supplier?.phone ? normalizeIndianPhone(po.supplier.phone) ?? po.supplier.phone : null;

  const markOrdered = async () => {
    setBusy('order');
    setError(null);
    try {
      const res = await adminApi.updatePurchaseOrder(token, po.id, { status: 'ordered' });
      onChanged(res, false);
      toast.success(`${code} marked as ordered.`);
    } catch (err) {
      setError(errorMessage(err, 'Could not update the purchase order.'));
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    const ok = await confirm({
      title: `Cancel ${code}?`,
      description: 'The order stays in your history as cancelled. Nothing is added to stock.',
      confirmLabel: 'Cancel order',
      cancelLabel: 'Keep it',
      danger: true,
    });
    if (!ok) return;
    setBusy('cancel');
    setError(null);
    try {
      const res = await adminApi.updatePurchaseOrder(token, po.id, { status: 'cancelled' });
      onChanged(res, false);
      toast.success(`${code} cancelled.`);
    } catch (err) {
      setError(errorMessage(err, 'Could not cancel the purchase order.'));
    } finally {
      setBusy(null);
    }
  };

  const receive = async (e: React.FormEvent) => {
    e.preventDefault();
    const lines: Array<{ item_id: string; received_qty: number; unit_cost?: number }> = [];
    for (const i of items) {
      const r = recv[i.id];
      if (!r) continue;
      const q = r.receive.trim() ? parseNum(r.receive) : 0;
      const name = i.ingredient?.name ?? 'an item';
      if (q === null || q < 0) return setError(`Enter 0 or more for ${name}.`);
      const c = r.unit_cost.trim() ? parseNum(r.unit_cost) : null;
      if (r.unit_cost.trim() && (c === null || c < 0)) return setError(`Enter a cost of 0 or more for ${name}.`);
      lines.push({ item_id: i.id, received_qty: round3(q), unit_cost: c === null ? undefined : round2(c) });
    }
    if (!lines.some((l) => l.received_qty > 0)) return setError('Enter what arrived on at least one line.');
    setError(null);
    setBusy('receive');
    try {
      const res = await adminApi.receivePurchaseOrder(token, po.id, lines);
      onChanged(res, true);
      toast.success(res.status === 'received' ? `${code} received in full. Stock updated.` : `Part of ${code} received. Stock updated.`);
      setMode('view');
    } catch (err) {
      setError(errorMessage(err, 'Could not receive the stock.'));
    } finally {
      setBusy(null);
    }
  };

  const receiveTotal = items.reduce((s, i) => {
    const r = recv[i.id];
    const q = r ? parseNum(r.receive) : null;
    const c = r ? parseNum(r.unit_cost) ?? i.unit_cost : i.unit_cost;
    return q && q > 0 ? s + q * c : s;
  }, 0);

  return (
    <>
      <Sheet
        open={!!target}
        onClose={onClose}
        side="right"
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="tnum font-mono">{code}</span>
            <StatusBadge status={po.status} />
          </span>
        }
        description={mode === 'receive' ? 'Enter what actually arrived. Stock and average costs update when you save.' : po.supplier?.name ?? 'No supplier'}
        className="md:max-w-xl"
        footer={
          !canEdit || !open ? undefined : mode === 'receive' ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <p className="text-sm text-muted sm:mr-auto">
                Receiving <span className="tnum font-mono font-semibold text-fg">{formatINR(receiveTotal)}</span>
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" className="flex-1 sm:flex-none" onClick={() => setMode('view')}>
                  Back
                </Button>
                <Button type="submit" form="po-receive-form" className="flex-1 sm:flex-none" loading={busy === 'receive'} leftIcon={<PackageCheck className="h-4 w-4" />}>
                  Receive stock
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="ghost" size="sm" loading={busy === 'cancel'} disabled={!!busy} leftIcon={<XCircle className="h-4 w-4" />} onClick={() => void cancel()} className="text-rose hover:bg-rose-soft">
                Cancel order
              </Button>
              <div className="ml-auto flex gap-2">
                {po.status === 'draft' && (
                  <Button type="button" variant="outline" loading={busy === 'order'} disabled={!!busy} leftIcon={<Send className="h-4 w-4" />} onClick={() => void markOrdered()}>
                    Mark as ordered
                  </Button>
                )}
                <Button type="button" disabled={!!busy} leftIcon={<Truck className="h-4 w-4" />} onClick={startReceive}>
                  Receive
                </Button>
              </div>
            </div>
          )
        }
      >
        {mode === 'view' ? (
          <div className="grid gap-4 pb-2">
            <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-sunk p-3.5 text-sm">
              <div>
                <dt className="font-mono text-2xs uppercase tracking-[0.14em] text-muted">Total</dt>
                <dd className="tnum mt-0.5 font-mono text-lg font-semibold">{formatINR(po.total)}</dd>
              </div>
              <div>
                <dt className="font-mono text-2xs uppercase tracking-[0.14em] text-muted">Expected</dt>
                <dd className={cn('mt-0.5 flex items-center gap-1.5 font-medium', isOverdue(po) && 'text-rose')}>
                  <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
                  {po.expected_on ? formatIstDay(po.expected_on) : 'Not set'}
                  {isOverdue(po) && ' · late'}
                </dd>
              </div>
              <div>
                <dt className="font-mono text-2xs uppercase tracking-[0.14em] text-muted">Created</dt>
                <dd className="mt-0.5">{formatIstDay(po.created_at)}</dd>
              </div>
              {po.received_at && (
                <div>
                  <dt className="font-mono text-2xs uppercase tracking-[0.14em] text-muted">Received</dt>
                  <dd className="mt-0.5">{formatIstDay(po.received_at)}</dd>
                </div>
              )}
            </dl>

            <div>
              <p className="mb-2 text-[13px] font-semibold text-fg/80">Items</p>
              <ul className="divide-y divide-line/10 rounded-2xl border border-line/10">
                {items.map((i) => {
                  const unit = i.ingredient?.unit;
                  const done = i.received_qty >= i.quantity;
                  return (
                    <li key={i.id} className="flex items-start justify-between gap-3 px-3.5 py-3">
                      <div className="min-w-0">
                        <p className="font-medium">{i.ingredient?.name ?? 'Removed ingredient'}</p>
                        <p className="tnum mt-0.5 font-mono text-xs text-muted">
                          {fmtQty(i.quantity, unit)} × {formatINR(i.unit_cost)}
                          {i.received_qty > 0 && (
                            <span className={cn('ml-1', done ? 'text-[#1b6f49]' : 'text-[#8a5a00]')}>
                              · received {fmtQty(i.received_qty, unit)}
                            </span>
                          )}
                        </p>
                      </div>
                      <span className="tnum shrink-0 font-mono font-semibold">{formatINR(i.quantity * i.unit_cost)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            {po.note && (
              <div>
                <p className="mb-1 text-[13px] font-semibold text-fg/80">Note</p>
                <p className="whitespace-pre-line rounded-xl bg-sunk px-3.5 py-2.5 text-sm">{po.note}</p>
              </div>
            )}

            {open && phone && (
              <a
                href={whatsappLink(phone, poMessage(po, restaurant.name))}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-line/15 px-5 text-sm font-semibold transition hover:bg-fg/5"
              >
                <MessageCircle className="h-4 w-4 text-[#1b6f49]" aria-hidden />
                Send to {po.supplier?.name ?? 'supplier'} on WhatsApp
              </a>
            )}
            {open && phone && <p className="-mt-2 text-center text-xs text-muted">Opens WhatsApp with the order typed in. You tap send.</p>}

            {error && (
              <p className="rounded-xl bg-rose-soft px-3.5 py-2.5 text-sm font-medium text-[#a1282c]" role="alert">
                {error}
              </p>
            )}
          </div>
        ) : (
          <form id="po-receive-form" onSubmit={receive} className="grid gap-2.5 pb-2" noValidate>
            {items.map((i) => {
              const unit = i.ingredient?.unit;
              const remaining = Math.max(0, round3(i.quantity - i.received_qty));
              const r = recv[i.id] ?? { receive: '', unit_cost: '' };
              return (
                <div key={i.id} className="rounded-2xl border border-line/10 p-3">
                  <p className="font-medium">{i.ingredient?.name ?? 'Removed ingredient'}</p>
                  <p className="tnum mt-0.5 font-mono text-xs text-muted">
                    Ordered {fmtQty(i.quantity, unit)} · already received {fmtQty(i.received_qty, unit)} · remaining {fmtQty(remaining, unit)}
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Input
                      label={`Receive now${unit ? ` (${unit})` : ''}`}
                      inputMode="decimal"
                      value={r.receive}
                      onChange={(e) => setRecv((m) => ({ ...m, [i.id]: { ...r, receive: e.target.value } }))}
                      className="tnum h-10 font-mono"
                    />
                    <Input
                      label={`Cost per ${unit ?? 'unit'}`}
                      inputMode="decimal"
                      prefix="₹"
                      value={r.unit_cost}
                      onChange={(e) => setRecv((m) => ({ ...m, [i.id]: { ...r, unit_cost: e.target.value } }))}
                      className="tnum h-10 font-mono"
                    />
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-muted">Leave 0 for anything that did not arrive. The order stays open until every line is received.</p>
            {error && (
              <p className="rounded-xl bg-rose-soft px-3.5 py-2.5 text-sm font-medium text-[#a1282c]" role="alert">
                {error}
              </p>
            )}
          </form>
        )}
      </Sheet>
      {dialog}
    </>
  );
}
