'use client';

import * as React from 'react';
import { Mail, MessageCircle, Pencil, Phone, Plus, Search, Trash2, Truck, User } from 'lucide-react';
import { toast } from 'sonner';
import type { Supplier } from '@restaurant-os/shared';
import { normalizeIndianPhone, whatsappLink } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { Badge, Button, EmptyState, Input, Sheet, Textarea, Toggle } from '@/components/ui';
import { useConfirm } from '../confirm-dialog';
import { errorMessage } from '../format';
import { ListSkeleton } from './ops-shared';
import type { InventoryContext } from './inventory-view';

export function SuppliersTab({ ctx }: { ctx: InventoryContext }) {
  const { token, canEdit, suppliers, setSuppliers } = ctx;
  const [q, setQ] = React.useState('');
  const [editing, setEditing] = React.useState<Supplier | null>(null);
  const [open, setOpen] = React.useState(false);

  const needle = q.trim().toLowerCase();
  const list = (suppliers ?? [])
    .filter((s) => !needle || [s.name, s.contact_name, s.phone, s.email].some((v) => v?.toLowerCase().includes(needle)))
    .sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name));

  const edit = (s: Supplier | null) => {
    setEditing(s);
    setOpen(true);
  };

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="sm:w-[300px]">
          <Input
            aria-label="Search suppliers"
            placeholder="Search suppliers…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            prefix={<Search className="h-4 w-4" />}
            className="h-10"
            inputMode="search"
          />
        </div>
        {canEdit && (
          <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => edit(null)} className="self-start sm:ml-auto sm:self-auto">
            Add supplier
          </Button>
        )}
      </div>

      <div className="mt-4">
        {!suppliers ? (
          <ListSkeleton rows={3} />
        ) : list.length === 0 ? (
          <EmptyState
            icon={<Truck className="h-5 w-5" />}
            title={needle ? `No supplier matches “${q.trim()}”` : 'No suppliers yet'}
            description={needle ? undefined : 'Keep your vendors’ numbers here so anyone can place an order, and send purchase orders on WhatsApp in one tap.'}
            action={
              canEdit && !needle ? (
                <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => edit(null)}>
                  Add supplier
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {list.map((s) => {
              const wa = s.phone ? normalizeIndianPhone(s.phone) : null;
              return (
                <li key={s.id} className="flex flex-col rounded-2xl border border-line/10 bg-surface p-4 shadow-soft">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-display text-lg font-semibold leading-tight">{s.name}</p>
                      {s.contact_name && (
                        <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
                          <User className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          <span className="truncate">{s.contact_name}</span>
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {!s.is_active && <Badge tone="neutral">Inactive</Badge>}
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => edit(s)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-fg/5 hover:text-fg"
                          aria-label={`Edit ${s.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 grid gap-1.5 text-sm">
                    {s.phone && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <a href={`tel:${s.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1.5 font-medium hover:text-ember-3">
                          <Phone className="h-3.5 w-3.5 text-muted" aria-hidden />
                          <span className="tnum font-mono">{s.phone}</span>
                        </a>
                        {wa && (
                          <a
                            href={whatsappLink(wa, `Hello${s.contact_name ? ` ${s.contact_name}` : ''}, `)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#1b6f49] hover:underline"
                          >
                            <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                            WhatsApp
                          </a>
                        )}
                      </div>
                    )}
                    {s.email && (
                      <a href={`mailto:${s.email}`} className="inline-flex min-w-0 items-center gap-1.5 hover:text-ember-3">
                        <Mail className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
                        <span className="truncate">{s.email}</span>
                      </a>
                    )}
                    {s.gstin && (
                      <p className="text-xs text-muted">
                        GSTIN <span className="tnum font-mono text-fg/80">{s.gstin}</span>
                      </p>
                    )}
                    {!s.phone && !s.email && <p className="text-sm text-muted">No contact details yet.</p>}
                  </div>
                  {s.notes && <p className="mt-3 whitespace-pre-line rounded-xl bg-sunk px-3 py-2 text-[13px] text-fg/80">{s.notes}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <SupplierSheet
        open={open}
        supplier={editing}
        token={token}
        onClose={() => setOpen(false)}
        onSaved={(row) =>
          setSuppliers((prev) => {
            const l = prev ?? [];
            return l.some((x) => x.id === row.id) ? l.map((x) => (x.id === row.id ? row : x)) : [...l, row];
          })
        }
        onDeleted={(id) => setSuppliers((prev) => (prev ?? []).filter((x) => x.id !== id))}
      />
    </div>
  );
}

interface SupplierDraft {
  name: string;
  contact_name: string;
  phone: string;
  email: string;
  gstin: string;
  notes: string;
  is_active: boolean;
}

function toDraft(s: Supplier | null): SupplierDraft {
  return {
    name: s?.name ?? '',
    contact_name: s?.contact_name ?? '',
    phone: s?.phone ?? '',
    email: s?.email ?? '',
    gstin: s?.gstin ?? '',
    notes: s?.notes ?? '',
    is_active: s?.is_active ?? true,
  };
}

function SupplierSheet({
  open,
  supplier,
  token,
  onClose,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  supplier: Supplier | null;
  token: string;
  onClose: () => void;
  onSaved: (s: Supplier) => void;
  onDeleted: (id: string) => void;
}) {
  const { confirm, dialog } = useConfirm();
  const [draft, setDraft] = React.useState<SupplierDraft>(() => toDraft(supplier));
  const [errors, setErrors] = React.useState<Partial<Record<keyof SupplierDraft, string>>>({});
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setDraft(toDraft(supplier));
      setErrors({});
    }
  }, [open, supplier]);

  const set = <K extends keyof SupplierDraft>(k: K, v: SupplierDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Partial<Record<keyof SupplierDraft, string>> = {};
    const name = draft.name.trim();
    if (!name) next.name = 'Name the supplier.';
    const email = draft.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = 'Enter a valid email, or leave it empty.';
    const gstin = draft.gstin.trim().toUpperCase();
    if (gstin && !/^[0-9A-Z]{15}$/.test(gstin)) next.gstin = 'GSTIN is 15 letters and digits.';
    setErrors(next);
    if (Object.keys(next).length) return;
    const body = {
      name,
      contact_name: draft.contact_name.trim() || null,
      phone: draft.phone.trim() || null,
      email: email || null,
      gstin: gstin || null,
      notes: draft.notes.trim() || null,
      is_active: draft.is_active,
    };
    setSaving(true);
    try {
      const row = supplier ? await adminApi.updateSupplier(token, supplier.id, body) : await adminApi.createSupplier(token, body);
      onSaved(row);
      toast.success(supplier ? `${row.name} saved.` : `${row.name} added.`);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save the supplier.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!supplier) return;
    const ok = await confirm({
      title: `Delete ${supplier.name}?`,
      description: 'Past purchase orders keep their details but will no longer show this supplier. To keep the link, switch the supplier off instead.',
      confirmLabel: 'Delete supplier',
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await adminApi.deleteSupplier(token, supplier.id);
      onDeleted(supplier.id);
      toast.success(`${supplier.name} deleted.`);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete the supplier.'));
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
        title={supplier ? 'Edit supplier' : 'Add supplier'}
        description="Only the name is required."
        className="md:max-w-lg"
        footer={
          <div className="flex items-center gap-2">
            {supplier && (
              <Button type="button" variant="ghost" size="sm" loading={deleting} leftIcon={<Trash2 className="h-4 w-4" />} onClick={() => void remove()} className="text-rose hover:bg-rose-soft">
                Delete
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" form="supplier-form" loading={saving}>
                {supplier ? 'Save changes' : 'Add supplier'}
              </Button>
            </div>
          </div>
        }
      >
        <form id="supplier-form" onSubmit={save} className="grid gap-4 pb-2" noValidate>
          <Input label="Business name" value={draft.name} maxLength={100} onChange={(e) => set('name', e.target.value)} placeholder="Sharma Dairy" error={errors.name} data-autofocus />
          <Input label="Contact person" value={draft.contact_name} maxLength={80} onChange={(e) => set('contact_name', e.target.value)} placeholder="Rakesh" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Phone"
              type="tel"
              inputMode="tel"
              value={draft.phone}
              maxLength={30}
              onChange={(e) => set('phone', e.target.value)}
              placeholder="98450 12345"
              hint="An Indian mobile enables WhatsApp"
              className="tnum font-mono"
            />
            <Input label="Email" type="email" inputMode="email" value={draft.email} onChange={(e) => set('email', e.target.value)} placeholder="orders@example.com" error={errors.email} />
          </div>
          <Input
            label="GSTIN (optional)"
            value={draft.gstin}
            maxLength={15}
            onChange={(e) => set('gstin', e.target.value.toUpperCase())}
            placeholder="29ABCDE1234F1Z5"
            error={errors.gstin}
            className="tnum font-mono uppercase"
          />
          <Textarea label="Notes" value={draft.notes} maxLength={500} onChange={(e) => set('notes', e.target.value)} placeholder="Delivers Mon, Wed, Fri before 9 am. Pays on 15th." className="min-h-[80px]" />
          {supplier && (
            <Toggle
              checked={draft.is_active}
              onChange={(v) => set('is_active', v)}
              label="Active"
              description={draft.is_active ? 'Shown when you create a purchase order' : 'Hidden from new purchase orders'}
            />
          )}
        </form>
      </Sheet>
      {dialog}
    </>
  );
}
