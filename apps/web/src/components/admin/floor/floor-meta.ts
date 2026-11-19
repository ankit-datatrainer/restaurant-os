import type { FloorTableState } from '@restaurant-os/shared';

export const FLOOR_STATES: FloorTableState[] = ['free', 'ordering', 'in_kitchen', 'served', 'bill_requested', 'reserved'];

/** Colour and copy per table state, on the admin tone palette (ember / saffron / mint / rose / sky). */
export const FLOOR_STATE_META: Record<FloorTableState, { label: string; hint: string; dot: string; card: string; text: string }> = {
  free: {
    label: 'Free',
    hint: 'No open orders',
    dot: 'bg-fg/25',
    card: 'border-line/10 bg-surface',
    text: 'text-muted',
  },
  ordering: {
    label: 'Ordering',
    hint: 'New order waiting to be accepted',
    dot: 'bg-ember',
    card: 'border-ember/40 bg-ember-soft/60',
    text: 'text-ember-3',
  },
  in_kitchen: {
    label: 'In kitchen',
    hint: 'Being prepared',
    dot: 'bg-saffron',
    card: 'border-saffron/60 bg-saffron-soft/70',
    text: 'text-[#8a5a00]',
  },
  served: {
    label: 'Served',
    hint: 'Eating, bill not settled',
    dot: 'bg-mint',
    card: 'border-mint/40 bg-mint-soft/60',
    text: 'text-[#1b6f49]',
  },
  bill_requested: {
    label: 'Bill requested',
    hint: 'Guest asked for the bill',
    dot: 'bg-rose',
    card: 'border-rose/60 bg-rose-soft/70 ring-2 ring-rose/25',
    text: 'text-[#a1282c]',
  },
  reserved: {
    label: 'Reserved',
    hint: 'Booking within the hour',
    dot: 'bg-sky',
    card: 'border-sky/40 bg-sky-soft/60',
    text: 'text-[#245a9f]',
  },
};
