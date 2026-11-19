'use client';

import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { MessageSquareText, Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import type { DiningTable, OrderQuote, OrderType } from '@restaurant-os/shared';
import { cn, formatINR } from '@/lib/utils';
import { pop } from '@/lib/motion';
import { Input, Select, Spinner, Textarea, VegMark } from '@/components/ui';
import { Segmented } from '../settle-sheet';
import type { PosCart, PosLine } from './use-pos-cart';

export interface PosForm {
  orderType: OrderType;
  tableId: string;
  guestName: string;
  guestPhone: string;
  note: string;
}

/** Order type, table, lines and guest details. Used in the desktop side panel and the phone sheet. */
export function CartBody({
  cart,
  form,
  setForm,
  tables,
  openOnTable,
  phoneError,
}: {
  cart: PosCart;
  form: PosForm;
  setForm: (patch: Partial<PosForm>) => void;
  tables: DiningTable[];
  /** Unpaid active orders already on the chosen table (for a heads-up). */
  openOnTable: { count: number; total: number };
  phoneError: string | null;
}) {
  const reduce = useReducedMotion();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          value={form.orderType}
          onChange={(v) => setForm({ orderType: v as OrderType })}
          options={[
            { id: 'dine_in', label: 'Dine-in' },
            { id: 'takeaway', label: 'Takeaway' },
          ]}
          label="Order type"
        />
      </div>

      {form.orderType === 'dine_in' && (
        <div>
          <Select label="Table" value={form.tableId} onChange={(e) => setForm({ tableId: e.target.value })} aria-required>
            <option value="">Pick a table…</option>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
                {t.area ? ` · ${t.area}` : ''}
              </option>
            ))}
          </Select>
          {openOnTable.count > 0 && (
            <p className="mt-1.5 text-xs text-muted">
              This table already has {openOnTable.count} open order{openOnTable.count === 1 ? '' : 's'} ({formatINR(openOnTable.total)}). This one is added alongside; settle them together from the Floor.
            </p>
          )}
        </div>
      )}

      <section aria-label="Dishes in this order">
        {cart.lines.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-line/15 px-4 py-8 text-center">
            <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-sunk text-muted" aria-hidden>
              <ShoppingBag className="h-5 w-5" />
            </span>
            <p className="font-semibold">No dishes yet</p>
            <p className="mt-1 text-sm text-muted">Tap a dish, or type its name and press Enter.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line/5">
            <AnimatePresence initial={false}>
              {cart.lines.map((l) => (
                <motion.li key={l.uid} layout={!reduce} variants={pop} initial={reduce ? false : 'hidden'} animate="show" exit="exit" className="py-2.5">
                  <CartLineRow line={l} cart={cart} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>

      <details className="group rounded-xl border border-line/10 px-3.5 py-2.5 open:pb-3.5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold">
          Guest and order note
          <span className="font-mono text-2xs uppercase tracking-[0.12em] text-muted group-open:hidden">
            {form.guestName || form.guestPhone || form.note ? 'Added' : 'Optional'}
          </span>
        </summary>
        <div className="mt-3 grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Input label="Guest name" placeholder="Optional" value={form.guestName} onChange={(e) => setForm({ guestName: e.target.value })} maxLength={60} autoComplete="off" />
            <Input
              label="Phone"
              placeholder="Optional, 10 digits"
              inputMode="tel"
              value={form.guestPhone}
              onChange={(e) => setForm({ guestPhone: e.target.value })}
              maxLength={16}
              autoComplete="off"
              error={phoneError ?? undefined}
            />
          </div>
          <Textarea label="Order note" placeholder="Optional, for the whole order" value={form.note} onChange={(e) => setForm({ note: e.target.value })} maxLength={300} className="min-h-[64px]" />
        </div>
      </details>
    </div>
  );
}

function CartLineRow({ line, cart }: { line: PosLine; cart: PosCart }) {
  const [noteOpen, setNoteOpen] = React.useState(Boolean(line.note));
  return (
    <div>
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[15px] font-medium leading-snug">
            <VegMark isVeg={line.item.is_veg} size={12} />
            <span className="truncate">{line.item.name}</span>
          </p>
          {line.options.length > 0 && <p className="text-xs text-muted">{line.options.map((o) => o.choice_label).join(' · ')}</p>}
          <p className="tnum font-mono text-xs text-muted">{formatINR(line.unitPrice)} each</p>
        </div>
        <div className="flex shrink-0 items-center rounded-full border border-line/15">
          <button
            type="button"
            onClick={() => cart.setQty(line.uid, line.quantity - 1)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-sunk"
            aria-label={line.quantity === 1 ? `Remove ${line.item.name}` : `One less ${line.item.name}`}
          >
            {line.quantity === 1 ? <Trash2 className="h-3.5 w-3.5 text-rose" /> : <Minus className="h-3.5 w-3.5" />}
          </button>
          <span className="tnum w-6 text-center font-mono text-sm font-semibold" aria-label={`${line.quantity} in the order`}>
            {line.quantity}
          </span>
          <button type="button" onClick={() => cart.setQty(line.uid, line.quantity + 1)} className="inline-flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-sunk" aria-label={`One more ${line.item.name}`}>
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <span className="tnum w-16 shrink-0 pt-2 text-right font-mono text-sm font-semibold">{formatINR(line.unitPrice * line.quantity)}</span>
      </div>
      {noteOpen ? (
        <div className="mt-1.5 flex items-center gap-1.5">
          <input
            value={line.note}
            onChange={(e) => cart.setNote(line.uid, e.target.value)}
            placeholder="Note for the kitchen"
            maxLength={200}
            aria-label={`Kitchen note for ${line.item.name}`}
            className="h-9 min-w-0 flex-1 rounded-lg border border-line/15 bg-surface px-3 text-sm placeholder:text-muted/70 focus:border-ember focus:shadow-ring focus:outline-none"
          />
          <button
            type="button"
            onClick={() => {
              cart.setNote(line.uid, '');
              setNoteOpen(false);
            }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted transition hover:bg-sunk hover:text-fg"
            aria-label="Remove note"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setNoteOpen(true)} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-muted transition hover:text-fg">
          <MessageSquareText className="h-3.5 w-3.5" aria-hidden /> Add note
        </button>
      )}
    </div>
  );
}

/** Live total from the server quote (happy hour included), with a plain fallback while it loads. */
export function CartTotals({ quote, loading, error, localSubtotal }: { quote: OrderQuote | null; loading: boolean; error: string | null; localSubtotal: number }) {
  if (!quote) {
    return (
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-muted">{error ? 'Total is worked out when you send' : 'Subtotal'}</span>
        <span className="tnum flex items-center gap-2 font-mono font-semibold">
          {loading && <Spinner className="h-3.5 w-3.5 text-muted" />}
          {formatINR(localSubtotal)}
        </span>
      </div>
    );
  }
  return (
    <dl className={cn('space-y-1 text-sm transition-opacity', loading && 'opacity-60')}>
      <TotalRow label="Subtotal" value={Number(quote.subtotal)} />
      {Number(quote.happy_hour_discount) > 0 && (
        <TotalRow label={quote.happy_hour_names.length ? `Happy hour · ${quote.happy_hour_names.join(', ')}` : 'Happy hour'} value={-Number(quote.happy_hour_discount)} tone="mint" />
      )}
      {Number(quote.service_charge) > 0 && <TotalRow label="Service charge" value={Number(quote.service_charge)} />}
      {Number(quote.tax) > 0 && <TotalRow label="GST" value={Number(quote.tax)} />}
      <div className="flex items-baseline justify-between gap-3 pt-1">
        <dt className="font-semibold">Total</dt>
        <dd className="tnum font-display text-xl font-semibold">{formatINR(Number(quote.total))}</dd>
      </div>
    </dl>
  );
}

function TotalRow({ label, value, tone }: { label: string; value: number; tone?: 'mint' }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3', tone === 'mint' && 'text-[#1b6f49]')}>
      <dt className={cn('min-w-0 truncate', tone ? '' : 'text-muted')}>{label}</dt>
      <dd className="tnum shrink-0 font-mono">{value < 0 ? `−${formatINR(-value)}` : formatINR(value)}</dd>
    </div>
  );
}
