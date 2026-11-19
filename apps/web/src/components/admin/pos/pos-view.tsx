'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChefHat, CheckCircle2, Monitor, Plus, Printer, RefreshCw, Search, Send, ShoppingBag, Trash2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import type { MenuCategory, MenuItem, OrderQuote, OrderWithItems, SelectedOption } from '@restaurant-os/shared';
import { formatClock, normalizeIndianPhone, orderCode, tableDisplay, windowOpen } from '@restaurant-os/shared';
import { adminApi } from '@/lib/api';
import { uuid } from '@/lib/session';
import { cn, formatINR } from '@/lib/utils';
import { springSoft } from '@/lib/motion';
import { Button, EmptyState, Input, Sheet, Skeleton, VegMark } from '@/components/ui';
import { useAdmin } from '../admin-provider';
import { Chip, ChipRow, PageHeader } from '../page-header';
import { errorMessage } from '../format';
import { kotUrl } from '../order-card';
import { useNow } from '../use-now';
import { SettleSheet } from '../settle-sheet';
import { openDisplayWindow, useDisplayResponder } from '../customer-display';
import { OptionPicker } from './option-picker';
import { CartBody, CartTotals, type PosForm } from './pos-cart';
import { toOrderLines, usePosCart } from './use-pos-cart';

const EMPTY_FORM: PosForm = { orderType: 'dine_in', tableId: '', guestName: '', guestPhone: '', note: '' };

/** Why a dish cannot be ordered right now, or null when it can. */
function unavailableReason(item: MenuItem, category: MenuCategory | undefined, now: Date): string | null {
  if (!item.is_available) return 'Sold out';
  if (category && !windowOpen(category.available_from, category.available_until, category.available_days, now)) {
    return category.available_from ? `From ${formatClock(category.available_from)}` : 'Not served today';
  }
  return null;
}

export function PosView() {
  const { staff } = useAdmin();
  if (staff.role === 'kitchen') {
    return (
      <div className="mx-auto w-full max-w-[1400px]">
        <PageHeader title="Counter" />
        <EmptyState
          icon={<ChefHat className="h-5 w-5" />}
          title="Kitchen accounts can't take orders"
          description="Ask the owner, a manager or the counter staff to take this order. Your tickets are on the Kitchen board."
          action={<Button href="/admin/kitchen" variant="outline">Open the Kitchen board</Button>}
        />
      </div>
    );
  }
  return <PosScreen />;
}

function PosScreen() {
  const { token, restaurant, tables: allTables, orders: activeOrders } = useAdmin();
  const params = useSearchParams();
  const reduce = useReducedMotion();
  const nowMs = useNow(60_000);
  const now = React.useMemo(() => new Date(nowMs), [nowMs]);
  useDisplayResponder(restaurant);

  const [categories, setCategories] = React.useState<MenuCategory[] | null>(null);
  const [items, setItems] = React.useState<MenuItem[] | null>(null);
  const [menuError, setMenuError] = React.useState<string | null>(null);
  const [cat, setCat] = React.useState<string>('all');
  const [q, setQ] = React.useState('');
  const [picker, setPicker] = React.useState<MenuItem | null>(null);
  const [form, setFormState] = React.useState<PosForm>(EMPTY_FORM);
  const [cartOpen, setCartOpen] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState<OrderWithItems | null>(null);
  const [settleOrder, setSettleOrder] = React.useState<OrderWithItems | null>(null);
  const [quote, setQuote] = React.useState<OrderQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = React.useState(false);
  const [quoteError, setQuoteError] = React.useState<string | null>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const checkout = React.useRef<{ sig: string; ref: string } | null>(null);

  const cart = usePosCart();
  const setForm = React.useCallback((patch: Partial<PosForm>) => setFormState((f) => ({ ...f, ...patch })), []);
  const tables = React.useMemo(() => allTables.filter((t) => t.is_active), [allTables]);

  // ----- Menu -----
  const cartSync = cart.sync;
  const loadMenu = React.useCallback(
    async (quiet = false) => {
      try {
        const [cats, its] = await Promise.all([adminApi.categories(token), adminApi.items(token)]);
        setCategories([...cats].filter((c) => c.is_active).sort((a, b) => a.sort_order - b.sort_order));
        setItems([...its].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)));
        setMenuError(null);
        const dropped = cartSync(its);
        if (dropped.length) toast.warning(`Removed from the order (sold out): ${dropped.join(', ')}`);
      } catch (e) {
        if (!quiet) setMenuError(errorMessage(e, 'Could not load the menu.'));
      }
    },
    [token, cartSync],
  );

  React.useEffect(() => {
    void loadMenu();
    // Sold-out switches change during service; pick them up quietly.
    const id = window.setInterval(() => void loadMenu(true), 60_000);
    return () => window.clearInterval(id);
  }, [loadMenu]);

  // ----- ?table=<id> preselects a dine-in table (from the Floor's "Add items") -----
  const tableParam = params.get('table');
  React.useEffect(() => {
    if (!tableParam) return;
    if (tables.some((t) => t.id === tableParam)) setForm({ orderType: 'dine_in', tableId: tableParam });
  }, [tableParam, tables, setForm]);

  const catById = React.useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories]);

  const visibleItems = React.useMemo(() => {
    const list = (items ?? []).filter((i) => catById.has(i.category_id));
    const term = q.trim().toLowerCase();
    if (term) return list.filter((i) => i.name.toLowerCase().includes(term) || (i.name_hi ?? '').includes(q.trim()) || (i.description ?? '').toLowerCase().includes(term));
    if (cat !== 'all') return list.filter((i) => i.category_id === cat);
    return list;
  }, [items, catById, q, cat]);

  const sections = React.useMemo(() => {
    if (q.trim() || cat !== 'all') return [{ id: 'flat', name: null as string | null, items: visibleItems }];
    return (categories ?? [])
      .map((c) => ({ id: c.id, name: c.name as string | null, items: visibleItems.filter((i) => i.category_id === c.id) }))
      .filter((s) => s.items.length > 0);
  }, [visibleItems, categories, q, cat]);

  const choose = React.useCallback(
    (item: MenuItem) => {
      if (unavailableReason(item, catById.get(item.category_id), now)) return;
      if (item.option_groups.length > 0) setPicker(item);
      else cart.add(item);
    },
    [catById, now, cart],
  );

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = visibleItems.find((i) => !unavailableReason(i, catById.get(i.category_id), now));
      if (first) {
        choose(first);
        if (first.option_groups.length === 0) toast.success(`Added ${first.name}`, { duration: 1200 });
        setQ('');
      }
    } else if (e.key === 'Escape') {
      setQ('');
    }
  };

  // "/" jumps to the search box from anywhere on the page.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ----- Live quote -----
  const priceKey = JSON.stringify(toOrderLines(cart.lines, false));
  React.useEffect(() => {
    if (cart.lines.length === 0) {
      setQuote(null);
      setQuoteError(null);
      setQuoteLoading(false);
      return;
    }
    let alive = true;
    setQuoteLoading(true);
    const t = window.setTimeout(async () => {
      try {
        const res = await adminApi.posQuote(token, JSON.parse(priceKey));
        if (!alive) return;
        setQuote(res);
        setQuoteError(null);
      } catch (e) {
        if (!alive) return;
        setQuote(null);
        setQuoteError(errorMessage(e));
      } finally {
        if (alive) setQuoteLoading(false);
      }
    }, 300);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
    // priceKey captures the lines that affect the price.
  }, [priceKey, token, cart.lines.length]);

  // ----- Send -----
  const phoneError = form.guestPhone.trim() && !normalizeIndianPhone(form.guestPhone) ? 'Enter a 10-digit Indian mobile number.' : null;
  const sendBlocker =
    cart.lines.length === 0
      ? 'Add a dish first.'
      : form.orderType === 'dine_in' && !form.tableId
        ? 'Pick a table, or switch to Takeaway.'
        : phoneError
          ? phoneError
          : null;

  const openOnTable = React.useMemo(() => {
    if (form.orderType !== 'dine_in' || !form.tableId) return { count: 0, total: 0 };
    const list = activeOrders.filter((o) => o.table_id === form.tableId && o.payment_status !== 'paid' && !o.bill_id);
    return { count: list.length, total: list.reduce((s, o) => s + Number(o.total), 0) };
  }, [activeOrders, form.orderType, form.tableId]);

  const send = async () => {
    if (sendBlocker || sending) {
      if (sendBlocker) toast.error(sendBlocker);
      return;
    }
    const body = {
      order_type: form.orderType,
      table_id: form.orderType === 'dine_in' ? form.tableId : undefined,
      items: toOrderLines(cart.lines),
      guest_name: form.guestName.trim() || undefined,
      guest_phone: form.guestPhone.trim() ? (normalizeIndianPhone(form.guestPhone) ?? undefined) : undefined,
      note: form.note.trim() || undefined,
    };
    // Same order retried (a timeout, a double tap) reuses its key, so the server never makes two.
    const sig = JSON.stringify(body);
    if (!checkout.current || checkout.current.sig !== sig) checkout.current = { sig, ref: uuid() };
    setSending(true);
    try {
      const order = await adminApi.posOrder(token, { ...body, client_ref: checkout.current.ref });
      checkout.current = null;
      cart.clear();
      setFormState((f) => ({ ...EMPTY_FORM, orderType: f.orderType }));
      setCartOpen(false);
      setSent(order);
      toast.success(`${orderCode(order.order_number)} sent to the kitchen.`);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not send the order.'));
    } finally {
      setSending(false);
    }
  };

  const addFromPicker = (item: MenuItem, options: SelectedOption[], quantity: number, note: string) => {
    cart.add(item, options, quantity, note);
    setPicker(null);
  };

  const clearCart = () => {
    cart.clear();
    setFormState((f) => ({ ...EMPTY_FORM, orderType: f.orderType, tableId: f.tableId }));
  };

  const totalLabel = quote ? formatINR(Number(quote.total)) : formatINR(cart.subtotal);

  const footer = (
    <div className="space-y-3">
      <CartTotals quote={quote} loading={quoteLoading} error={quoteError} localSubtotal={cart.subtotal} />
      <Button className="w-full" size="lg" onClick={() => void send()} loading={sending} disabled={cart.lines.length === 0} leftIcon={<Send className="h-4 w-4" />}>
        Send to kitchen
      </Button>
      {sendBlocker && cart.lines.length > 0 && <p className="text-center text-xs text-muted">{sendBlocker}</p>}
    </div>
  );

  const body = <CartBody cart={cart} form={form} setForm={setForm} tables={tables} openOnTable={openOnTable} phoneError={phoneError} />;

  return (
    <div className="mx-auto w-full max-w-[1400px] pb-20 lg:pb-0">
      <PageHeader
        title="Counter"
        description="Take walk-in, phone and table orders. They go straight to the kitchen."
        actions={
          <>
            <Button variant="outline" size="sm" leftIcon={<Monitor className="h-4 w-4" />} onClick={openDisplayWindow}>
              Customer display
            </Button>
            <Button variant="outline" size="sm" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={() => void loadMenu()}>
              Refresh menu
            </Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* ----- Menu ----- */}
        <section aria-label="Menu" className="min-w-0">
          <div className="sticky top-16 z-20 -mx-1 space-y-2.5 bg-bg/90 px-1 pb-3 pt-1 backdrop-blur">
            <Input
              ref={searchRef}
              aria-label="Search dishes"
              placeholder="Search dishes, Enter to add"
              title="Type part of a name and press Enter to add the first match. Press / anywhere to jump here."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onSearchKey}
              prefix={<Search className="h-4 w-4" />}
              className="h-11"
              autoComplete="off"
            />
            <ChipRow label="Categories">
              <Chip active={cat === 'all' && !q} onClick={() => { setCat('all'); setQ(''); }} count={(items ?? []).filter((i) => catById.has(i.category_id)).length}>
                All
              </Chip>
              {(categories ?? []).map((c) => {
                const open = windowOpen(c.available_from, c.available_until, c.available_days, now);
                return (
                  <Chip key={c.id} active={cat === c.id && !q} onClick={() => { setCat(c.id); setQ(''); }} count={(items ?? []).filter((i) => i.category_id === c.id).length}>
                    <span className={cn(!open && 'opacity-60')}>{c.name}</span>
                  </Chip>
                );
              })}
            </ChipRow>
          </div>

          {menuError ? (
            <EmptyState title="The menu did not load" description={menuError} action={<Button variant="outline" onClick={() => void loadMenu()}>Try again</Button>} />
          ) : items === null ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2.5">
              {Array.from({ length: 12 }, (_, i) => (
                <Skeleton key={i} className="h-[104px] rounded-2xl" />
              ))}
            </div>
          ) : visibleItems.length === 0 ? (
            <EmptyState
              icon={<Search className="h-5 w-5" />}
              title={q ? `No dish matches “${q.trim()}”` : 'No dishes here'}
              description={q ? 'Try part of the name, like “paneer”.' : 'Add dishes on the Menu page.'}
            />
          ) : (
            <div className="space-y-5">
              {sections.map((s) => {
                const c = s.name ? catById.get(s.id) : undefined;
                const closed = c ? !windowOpen(c.available_from, c.available_until, c.available_days, now) : false;
                return (
                  <section key={s.id} aria-label={s.name ?? 'Dishes'}>
                    {s.name && (
                      <h3 className="mb-2 flex items-baseline gap-2">
                        <span className="eyebrow">{s.name}</span>
                        {closed && c && <span className="font-mono text-2xs text-muted">{c.available_from ? `${formatClock(c.available_from)} – ${formatClock(c.available_until)}` : 'Not today'}</span>}
                      </h3>
                    )}
                    <ul className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2.5">
                      {s.items.map((item) => (
                        <li key={item.id}>
                          <DishTile item={item} reason={unavailableReason(item, catById.get(item.category_id), now)} qty={cart.qtyOf(item.id)} onChoose={choose} />
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </section>

        {/* ----- Cart (desktop) ----- */}
        <aside aria-label="Current order" className="hidden lg:block">
          <div className="sticky top-20 flex max-h-[calc(100dvh-6rem)] flex-col overflow-hidden rounded-2xl border border-line/10 bg-surface shadow-soft">
            <div className="flex items-center justify-between gap-2 px-5 pb-2 pt-4">
              <h3 className="font-display text-lg font-semibold">
                Current order
                {cart.count > 0 && <span className="tnum ml-2 font-mono text-sm text-muted">{cart.count} item{cart.count === 1 ? '' : 's'}</span>}
              </h3>
              {cart.lines.length > 0 && (
                <button type="button" onClick={clearCart} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-muted transition hover:bg-rose-soft hover:text-rose">
                  <Trash2 className="h-3.5 w-3.5" aria-hidden /> Clear
                </button>
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{body}</div>
            <div className="hairline-t bg-surface px-5 pb-4 pt-3">{footer}</div>
          </div>
        </aside>
      </div>

      {/* ----- Cart bar (phones / tablets) ----- */}
      <AnimatePresence>
        {(cart.count > 0 || form.tableId) && (
          <motion.div
            initial={reduce ? false : { y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { y: 80, opacity: 0 }}
            transition={springSoft}
            className="fixed inset-x-0 bottom-[calc(3.5rem_+_max(1rem,env(safe-area-inset-bottom,0px)))] z-30 px-4 pb-2 md:bottom-4 lg:hidden print:hidden"
          >
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="mx-auto flex h-14 w-full max-w-lg items-center gap-3 rounded-full bg-ink pl-5 pr-2 text-paper shadow-lift transition active:scale-[0.99]"
            >
              <ShoppingBag className="h-5 w-5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold">
                {cart.count} item{cart.count === 1 ? '' : 's'}
                {form.orderType === 'dine_in' && form.tableId ? ` · ${tableDisplay(tables.find((t) => t.id === form.tableId))}` : form.orderType === 'takeaway' ? ' · Takeaway' : ''}
              </span>
              <span className="tnum rounded-full bg-ember px-4 py-2.5 font-mono text-sm font-semibold text-white">{totalLabel}</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <Sheet
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        title="Current order"
        description={cart.count > 0 ? `${cart.count} item${cart.count === 1 ? '' : 's'}` : undefined}
        footer={footer}
      >
        {body}
        {cart.lines.length > 0 && (
          <button type="button" onClick={clearCart} className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-muted transition hover:text-rose">
            <Trash2 className="h-3.5 w-3.5" aria-hidden /> Clear order
          </button>
        )}
      </Sheet>

      <OptionPicker item={picker} onClose={() => setPicker(null)} onAdd={addFromPicker} />

      <SentSheet
        order={sent}
        onClose={() => setSent(null)}
        onSettle={(o) => {
          setSent(null);
          setSettleOrder(o);
        }}
      />

      <SettleSheet
        open={Boolean(settleOrder)}
        onClose={() => setSettleOrder(null)}
        orders={settleOrder ? [settleOrder] : []}
        preselectedIds={settleOrder ? [settleOrder.id] : undefined}
      />
    </div>
  );
}

function DishTile({ item, reason, qty, onChoose }: { item: MenuItem; reason: string | null; qty: number; onChoose: (item: MenuItem) => void }) {
  const disabled = Boolean(reason);
  return (
    <button
      type="button"
      onClick={() => onChoose(item)}
      disabled={disabled}
      aria-label={`${item.name}, ${formatINR(Number(item.price))}${reason ? `, ${reason}` : ''}${qty ? `, ${qty} in the order` : ''}`}
      className={cn(
        'relative flex h-full min-h-[104px] w-full flex-col justify-between rounded-2xl border bg-surface p-3 text-left shadow-soft transition active:scale-[0.98]',
        qty > 0 ? 'border-ember/50 ring-1 ring-ember/30' : 'border-line/10 hover:border-line/25',
        disabled && 'cursor-not-allowed bg-sunk/60 opacity-70 shadow-none active:scale-100',
      )}
    >
      <span className="flex items-start gap-1.5">
        <VegMark isVeg={item.is_veg} size={12} className="mt-1" />
        <span className={cn('line-clamp-2 text-[14px] font-semibold leading-snug', disabled && 'text-muted')}>{item.name}</span>
      </span>
      <span className="mt-2 flex items-end justify-between gap-2">
        <span className="tnum font-mono text-sm font-semibold">{formatINR(Number(item.price))}</span>
        {reason ? (
          <span className={cn('rounded-full px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.1em]', item.is_available ? 'bg-sky-soft text-[#245a9f]' : 'bg-rose-soft text-[#a1282c]')}>
            {reason}
          </span>
        ) : item.option_groups.length > 0 ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">Options</span>
        ) : (
          <Plus className="h-4 w-4 text-muted" aria-hidden />
        )}
      </span>
      {qty > 0 && (
        <span className="tnum absolute -right-1.5 -top-1.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-ember px-1.5 font-mono text-xs font-semibold text-white" aria-hidden>
          {qty}
        </span>
      )}
    </button>
  );
}

function SentSheet({ order, onClose, onSettle }: { order: OrderWithItems | null; onClose: () => void; onSettle: (o: OrderWithItems) => void }) {
  const reduce = useReducedMotion();
  const last = React.useRef<OrderWithItems | null>(order);
  if (order) last.current = order;
  const o = last.current;
  return (
    <Sheet open={Boolean(order)} onClose={onClose} title="Sent to the kitchen">
      {o && (
        <>
          <div className="flex items-center gap-4 rounded-2xl bg-mint-soft/60 p-4">
            <motion.span
              initial={reduce ? false : { scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={springSoft}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-mint text-white"
              aria-hidden
            >
              <CheckCircle2 className="h-6 w-6" />
            </motion.span>
            <div className="min-w-0">
              <p className="tnum font-display text-2xl font-semibold">{orderCode(o.order_number)}</p>
              <p className="text-sm text-muted">
                {tableDisplay(o.table)}
                {o.guest_name ? ` · ${o.guest_name}` : ''} · <span className="tnum font-mono">{formatINR(Number(o.total))}</span>
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <Button variant="outline" href={kotUrl(o.id)} external leftIcon={<Printer className="h-4 w-4" />}>
              Print KOT
            </Button>
            <Button variant="outline" onClick={() => onSettle(o)} leftIcon={<Wallet className="h-4 w-4" />}>
              Settle now
            </Button>
            <Button onClick={onClose} leftIcon={<Plus className="h-4 w-4" />} data-autofocus>
              New order
            </Button>
          </div>
        </>
      )}
    </Sheet>
  );
}
