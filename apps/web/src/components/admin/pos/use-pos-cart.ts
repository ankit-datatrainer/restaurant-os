'use client';

import * as React from 'react';
import type { MenuItem, PlaceOrderItemInput, SelectedOption } from '@restaurant-os/shared';
import { roundMoney } from '@restaurant-os/shared';

export interface PosLine {
  uid: string;
  item: MenuItem;
  options: SelectedOption[];
  quantity: number;
  note: string;
  /** Menu price + option deltas. The server re-prices from the menu; this is for the screen only. */
  unitPrice: number;
}

let uidSeq = 1;

/** Same dish + same choices = same line (unless one of them carries a kitchen note). */
function sameDish(a: { item: MenuItem; options: SelectedOption[] }, itemId: string, options: SelectedOption[]): boolean {
  if (a.item.id !== itemId) return false;
  const ka = a.options.map((o) => `${o.group_id}:${o.choice_id}`).sort().join('|');
  const kb = options.map((o) => `${o.group_id}:${o.choice_id}`).sort().join('|');
  return ka === kb;
}

export function unitPriceOf(item: MenuItem, options: SelectedOption[]): number {
  return roundMoney(Number(item.price) + options.reduce((s, o) => s + Number(o.price_delta), 0));
}

export function usePosCart() {
  const [lines, setLines] = React.useState<PosLine[]>([]);

  const add = React.useCallback((item: MenuItem, options: SelectedOption[] = [], quantity = 1, note = '') => {
    const cleanNote = note.trim();
    setLines((prev) => {
      if (!cleanNote) {
        const hit = prev.find((l) => !l.note && sameDish(l, item.id, options));
        if (hit) return prev.map((l) => (l.uid === hit.uid ? { ...l, quantity: Math.min(99, l.quantity + quantity) } : l));
      }
      return [...prev, { uid: `l${uidSeq++}`, item, options, quantity, note: cleanNote, unitPrice: unitPriceOf(item, options) }];
    });
  }, []);

  const setQty = React.useCallback((uid: string, quantity: number) => {
    setLines((prev) => (quantity <= 0 ? prev.filter((l) => l.uid !== uid) : prev.map((l) => (l.uid === uid ? { ...l, quantity: Math.min(99, quantity) } : l))));
  }, []);

  const setNote = React.useCallback((uid: string, note: string) => {
    setLines((prev) => prev.map((l) => (l.uid === uid ? { ...l, note } : l)));
  }, []);

  const remove = React.useCallback((uid: string) => setLines((prev) => prev.filter((l) => l.uid !== uid)), []);
  const clear = React.useCallback(() => setLines([]), []);

  const linesRef = React.useRef(lines);
  linesRef.current = lines;

  /** Re-check lines against a fresh menu: drop dishes that are gone or sold out. Returns the names dropped. */
  const sync = React.useCallback((items: MenuItem[]): string[] => {
    const byId = new Map(items.map((i) => [i.id, i]));
    const prev = linesRef.current;
    const dropped: string[] = [];
    const next: PosLine[] = [];
    for (const l of prev) {
      const fresh = byId.get(l.item.id);
      if (!fresh || !fresh.is_available) {
        dropped.push(l.item.name);
        continue;
      }
      next.push({ ...l, item: fresh, unitPrice: unitPriceOf(fresh, l.options) });
    }
    if (prev.length > 0) setLines(next);
    return dropped;
  }, []);

  const count = lines.reduce((s, l) => s + l.quantity, 0);
  const subtotal = roundMoney(lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0));
  const qtyOf = React.useCallback((itemId: string) => lines.reduce((s, l) => (l.item.id === itemId ? s + l.quantity : s), 0), [lines]);

  return { lines, add, setQty, setNote, remove, clear, sync, count, subtotal, qtyOf };
}

export type PosCart = ReturnType<typeof usePosCart>;

export function toOrderLines(lines: PosLine[], withNotes = true): PlaceOrderItemInput[] {
  return lines.map((l) => ({
    menu_item_id: l.item.id,
    quantity: l.quantity,
    options: l.options.map((o) => ({ group_id: o.group_id, choice_id: o.choice_id })),
    note: withNotes && l.note.trim() ? l.note.trim() : undefined,
  }));
}
