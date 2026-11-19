'use client';

import * as React from 'react';
import { Dices } from 'lucide-react';
import type { DiningTable } from '@restaurant-os/shared';
import { randomTableCode } from '@/lib/utils';
import { Button, Input, Sheet } from '@/components/ui';

export interface TableDraftBody {
  label: string;
  area: string | null;
  seats: number;
  code?: string;
}

export function TableEditor({
  open,
  table,
  onClose,
  onSubmit,
}: {
  open: boolean;
  /** null = creating a new table */
  table: DiningTable | null;
  onClose: () => void;
  onSubmit: (body: TableDraftBody) => Promise<boolean>;
}) {
  const [label, setLabel] = React.useState('');
  const [area, setArea] = React.useState('');
  const [seats, setSeats] = React.useState('4');
  const [code, setCode] = React.useState('');
  const [errors, setErrors] = React.useState<{ label?: string; seats?: string; code?: string }>({});
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setLabel(table?.label ?? '');
    setArea(table?.area ?? '');
    setSeats(String(table?.seats ?? 4));
    setCode('');
    setErrors({});
  }, [open, table]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!label.trim()) next.label = 'Give the table a name guests will recognise.';
    const n = Number(seats);
    if (!Number.isInteger(n) || n < 1 || n > 50) next.seats = 'Seats must be a whole number from 1 to 50.';
    const c = code.trim().toUpperCase();
    if (!table && c && !/^[A-Z0-9]{3,12}$/.test(c)) next.code = 'Use 3–12 letters or digits, or leave blank to generate one.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    const body: TableDraftBody = { label: label.trim(), area: area.trim() || null, seats: n };
    if (!table && c) body.code = c;
    const ok = await onSubmit(body);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      side="right"
      title={table ? `Edit ${table.label}` : 'Add table'}
      description={table ? 'The QR code stays the same unless you reset it.' : 'A QR code is generated the moment you save.'}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="table-editor-form" loading={saving}>
            {table ? 'Save changes' : 'Add table'}
          </Button>
        </div>
      }
    >
      <form id="table-editor-form" onSubmit={submit} className="grid gap-4 pb-2" noValidate>
        <Input label="Label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Table 9" error={errors.label} data-autofocus />
        <Input label="Area" value={area} onChange={(e) => setArea(e.target.value)} placeholder="Terrace, Indoor Window, Bar…" hint="Optional. Shown next to the table name on orders." />
        <Input label="Seats" inputMode="numeric" value={seats} onChange={(e) => setSeats(e.target.value)} error={errors.seats} className="tnum font-mono" />
        {table ? (
          <div className="rounded-xl bg-sunk px-3.5 py-3 text-sm">
            <p className="font-mono text-2xs uppercase tracking-[0.12em] text-muted">Code</p>
            <p className="tnum mt-0.5 font-mono font-semibold">{table.code}</p>
            <p className="mt-1 text-xs text-muted">Use “Reset code” on the table card to generate a new one.</p>
          </div>
        ) : (
          <div className="grid gap-1.5">
            <Input
              label="Code (optional)"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Leave blank to generate"
              error={errors.code}
              hint="This becomes the URL in the QR: /t/CODE"
              className="tnum font-mono uppercase"
            />
            <button type="button" onClick={() => setCode(randomTableCode())} className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-ember hover:underline">
              <Dices className="h-3.5 w-3.5" aria-hidden /> Suggest a code
            </button>
          </div>
        )}
      </form>
    </Sheet>
  );
}
