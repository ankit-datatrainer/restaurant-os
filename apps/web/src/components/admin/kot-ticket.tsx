'use client';

import * as React from 'react';
import Link from 'next/link';
import { Printer, X } from 'lucide-react';
import type { OrderItem, OrderWithItems } from '@restaurant-os/shared';
import { orderCode } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn, formatTime } from '@/lib/utils';
import { Button, EmptyState, Skeleton } from '@/components/ui';
import { groupByRound, isTakeaway } from './order-card';
import { pickupLabel } from './bills/bill-utils';
import { errorMessage, maxRound } from './format';

/*
 * 80 mm thermal paper: 72 mm of print area plus 4 mm either side. No `size` on @page so the
 * receipt printer's own roll length is used; the ticket itself is held to 80 mm wide.
 */
const PRINT_CSS = `
@media print {
  @page { margin: 0; }
  html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
  .kot-root { min-height: 0 !important; padding: 0 !important; background: #fff !important; }
  .kot-paper {
    width: 80mm !important; max-width: 80mm !important; margin: 0 !important; padding: 3mm 4mm 6mm !important;
    box-shadow: none !important; border: none !important; border-radius: 0 !important;
  }
}
`;

function dateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

/** "Portion: Half · Add-ons: Cheese, Olives" — grouped so the kitchen reads each choice once. */
function optionsLine(it: OrderItem): string {
  const groups = new Map<string, string[]>();
  for (const o of it.options) {
    const list = groups.get(o.group_name);
    if (list) list.push(o.choice_label);
    else groups.set(o.group_name, [o.choice_label]);
  }
  return [...groups.entries()].map(([g, c]) => `${g}: ${c.join(', ')}`).join(' · ');
}

/** Kitchen order ticket for one order (no prices). `round` limits it to one round, e.g. an add-on. */
export function KotTicket({ orderId, round }: { orderId: string; round: number | null }) {
  const { token, restaurant } = useAuth();
  const [order, setOrder] = React.useState<OrderWithItems | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [printedAt, setPrintedAt] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!token) return;
    let cancelled = false;
    adminApi
      .order(token, orderId)
      .then((o) => {
        if (cancelled) return;
        setOrder(o);
        setPrintedAt(Date.now());
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(errorMessage(e, 'Could not load this order.'));
      });
    return () => {
      cancelled = true;
    };
  }, [token, orderId]);

  // Keep the "printed" time honest when the same tab is printed again later.
  React.useEffect(() => {
    const before = () => setPrintedAt(Date.now());
    window.addEventListener('beforeprint', before);
    return () => window.removeEventListener('beforeprint', before);
  }, []);

  const groups = order ? groupByRound(order.items) : [];
  const latest = order ? maxRound(order.items) : 1;
  const shown = round ? groups.filter((g) => g.round === round) : groups;
  const addOnOnly = round !== null && round > 1;
  const dishCount = shown.reduce((n, g) => n + g.items.reduce((m, i) => m + i.quantity, 0), 0);
  const addOnRounds = groups.filter((g) => g.round > 1).map((g) => g.round);

  const roundTime = (r: number): string | null => {
    if (!order) return null;
    if (r === 1) return order.placed_at;
    return r === latest ? order.items_added_at : null;
  };
  const headTime = addOnOnly ? (roundTime(round) ?? order?.placed_at ?? null) : (order?.placed_at ?? null);

  return (
    <div className="kot-root min-h-dvh bg-bg px-4 py-6 text-fg">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <div className="mx-auto mb-5 flex max-w-md flex-col gap-3 print:hidden">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Kitchen order ticket</p>
            <h1 className="font-display text-xl font-semibold leading-tight">
              {order ? `${addOnOnly ? 'Add-on KOT' : 'KOT'} ${orderCode(order.order_number)}` : 'Kitchen ticket'}
            </h1>
          </div>
          <Button variant="ghost" size="sm" leftIcon={<X className="h-4 w-4" />} onClick={() => window.close()} title="Close this tab">
            Close
          </Button>
          <Button size="sm" variant="dark" leftIcon={<Printer className="h-4 w-4" />} onClick={() => window.print()} disabled={!order || shown.length === 0}>
            Print
          </Button>
        </div>
        {order && addOnRounds.length > 0 && (
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto" role="group" aria-label="What to print">
            <RoundLink href={`/admin/kot/${order.id}`} active={round === null}>
              Whole order
            </RoundLink>
            {addOnRounds.map((r) => (
              <RoundLink key={r} href={`/admin/kot/${order.id}?round=${r}`} active={round === r}>
                Add-on {addOnRounds.length > 1 ? `(round ${r})` : ''}
              </RoundLink>
            ))}
          </div>
        )}
        <p className="text-xs text-muted">Prints 80 mm wide with no prices. In the print dialog, choose your receipt printer and set margins to None.</p>
      </div>

      {error ? (
        <EmptyState title="Ticket unavailable" description={error} className="mx-auto max-w-md print:hidden" />
      ) : !order ? (
        <Skeleton className="mx-auto h-[420px] w-full max-w-[302px] rounded-xl" />
      ) : (
        <article
          className="kot-paper mx-auto w-full max-w-[302px] rounded-xl bg-white px-4 pb-6 pt-4 font-mono text-[13px] leading-snug text-black shadow-soft"
          aria-label={`Kitchen ticket ${orderCode(order.order_number)}`}
        >
          <header className="text-center">
            <p className="text-[13px] font-semibold uppercase tracking-wide">{restaurant?.name}</p>
            <p className="mt-1 text-[22px] font-bold leading-none tracking-tight">
              KOT {orderCode(order.order_number)}
            </p>
            {addOnOnly && <p className="mx-auto mt-2 inline-block border-2 border-black px-2 py-0.5 text-[14px] font-bold tracking-[0.18em]">ADD-ON</p>}
            {order.status === 'cancelled' && <p className="mx-auto mt-2 inline-block bg-black px-2 py-0.5 text-[14px] font-bold tracking-[0.18em] text-white">CANCELLED</p>}
          </header>

          <Rule />
          {isTakeaway(order) ? (
            // A border, not a black fill: browsers drop background colours when printing by default.
            <div className="border-[3px] border-black px-2 py-1.5">
              <p className="text-[18px] font-bold leading-tight tracking-wide">TAKEAWAY</p>
              {order.pickup_at && <p className="text-[15px] font-bold leading-tight">{pickupLabel(order.pickup_at)}</p>}
              {order.guest_name && <p className="break-words text-[14px] font-semibold leading-tight">{order.guest_name}</p>}
            </div>
          ) : (
            <>
              <p className="text-[18px] font-bold leading-tight">{order.table?.label ?? 'Table'}</p>
              {order.table?.area && <p className="text-[13px]">{order.table.area}</p>}
            </>
          )}
          {order.source === 'pos' && <p className="mt-1 text-[12px] font-bold tracking-[0.14em]">COUNTER ORDER</p>}
          {order.source === 'online' && <p className="mt-1 text-[12px] font-bold tracking-[0.14em]">ONLINE ORDER</p>}
          <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 text-[12px]">
            <dt>Time</dt>
            <dd className="text-right">{headTime ? dateTime(headTime) : '—'}</dd>
            {order.guest_name && !isTakeaway(order) && (
              <>
                <dt>Guest</dt>
                <dd className="truncate text-right">{order.guest_name}</dd>
              </>
            )}
          </dl>

          {shown.length === 0 ? (
            <>
              <Rule />
              <p className="py-2 text-center text-[13px]">Nothing in round {round} of this order.</p>
            </>
          ) : (
            shown.map((g) => (
              <section key={g.round}>
                {g.round > 1 && !addOnOnly ? (
                  <div className="my-2.5 border-y-2 border-black py-1 text-center text-[13px] font-bold tracking-[0.14em]">
                    ADD-ON{groups.filter((x) => x.round > 1).length > 1 ? ` ${g.round - 1}` : ''}
                    {roundTime(g.round) ? ` · ${formatTime(roundTime(g.round)!)}` : ''}
                  </div>
                ) : (
                  <Rule />
                )}
                <ul className="space-y-2">
                  {g.items.map((it) => (
                    <li key={it.id}>
                      <p className="flex gap-2 text-[15px] font-bold leading-tight">
                        <span className="tnum shrink-0">{it.quantity} ×</span>
                        <span className="min-w-0 break-words">
                          {it.name}
                          <span className="ml-1 text-[11px] font-normal">{it.is_veg ? '(V)' : '(NV)'}</span>
                        </span>
                      </p>
                      {it.options.length > 0 && <p className="pl-7 text-[12px]">{optionsLine(it)}</p>}
                      {it.note && <p className="ml-7 mt-0.5 border-l-2 border-black pl-1.5 text-[12px] font-semibold">Note: {it.note}</p>}
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}

          {order.note && (
            <>
              <Rule />
              <p className="text-[12px] font-bold uppercase tracking-wide">Order note</p>
              <p className="mt-0.5 whitespace-pre-line break-words text-[13px]">{order.note}</p>
            </>
          )}

          <Rule />
          <div className="flex justify-between text-[11px]">
            <span>
              {dishCount} dish{dishCount === 1 ? '' : 'es'}
            </span>
            <span>Printed {printedAt ? formatTime(new Date(printedAt).toISOString()) : ''}</span>
          </div>
        </article>
      )}
    </div>
  );
}

function Rule() {
  return <div className="my-2.5 border-t border-dashed border-black" aria-hidden />;
}

function RoundLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      replace
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex h-9 shrink-0 items-center rounded-full border px-3.5 text-[13px] font-medium transition',
        active ? 'border-ink bg-ink text-paper' : 'border-line/15 bg-surface text-fg/80 hover:border-line/30 hover:text-fg',
      )}
    >
      {children}
    </Link>
  );
}
