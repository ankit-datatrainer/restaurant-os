'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import { AlertCircle, ArrowRight, CalendarDays, ChevronRight, Clock, MapPin, Phone, ShoppingBag, Store, UtensilsCrossed, WifiOff } from 'lucide-react';
import type { MenuItem, OrderWithItems, SelectedOption } from '@restaurant-os/shared';
import { Button, DishImage, Skeleton } from '@/components/ui';
import { publicApi } from '@/lib/api';
import { cn, orderCode } from '@/lib/utils';
import { EASE_OUT, fadeUp, stagger } from '@/lib/motion';
import { CartBar } from '@/components/guest/cart-bar';
import { useCartBump } from '@/components/guest/cart-bump';
import { CategoryNav } from '@/components/guest/category-nav';
import { DishCard } from '@/components/guest/dish-card';
import { HappyHourBanner, categoryServing, happyHourPercent, runningHappyHours, servingWindowText, useClock } from '@/components/guest/happy-hour-banner';
import { ItemSheet } from '@/components/guest/item-sheet';
import { useHydrated } from '@/components/guest/use-hydrated';
import { useScrollSpy } from '@/components/guest/use-scroll-spy';
import type { CartLine } from '@/store/cart';
import { BookingSheet } from './booking-sheet';
import { hoursText, openState } from './hours';
import { PICKUP_LABEL } from './pickup-timeline';
import { bookingOn, takeawayOn, useRestaurant } from './restaurant-provider';
import { cartCount, cartSubtotal, useTakeawayCart } from './takeaway-cart';
import { TakeawayCheckout } from './takeaway-checkout';

const sectionId = (id: string) => `rcat-${id}`;
const NO_LINES: CartLine[] = [];
const ACTIVE = new Set(['placed', 'accepted', 'preparing', 'ready']);

function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the restaurant">
      <Skeleton className="h-[320px] w-full rounded-none" />
      <div className="gutter mt-5 grid grid-cols-2 gap-2">
        <Skeleton className="h-14 rounded-2xl" />
        <Skeleton className="h-14 rounded-2xl" />
      </div>
      <div className="gutter mt-8">
        <Skeleton className="h-6 w-32" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-4 py-4">
            <div className="min-w-0 flex-1">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="mt-2 h-3.5 w-full" />
              <Skeleton className="mt-3 h-4 w-16" />
            </div>
            <Skeleton className="h-28 w-28 shrink-0 rounded-2xl" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Problem({ kind, message, onRetry }: { kind: 'not_found' | 'network' | 'unknown'; message: string; onRetry: () => void }) {
  const Icon = kind === 'network' ? WifiOff : kind === 'not_found' ? Store : AlertCircle;
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-sunk text-fg/70">
        <Icon className="h-7 w-7" aria-hidden />
      </div>
      <h1 className="mt-6 font-display text-2xl font-bold tracking-tight">
        {kind === 'not_found' ? 'We could not find this restaurant' : kind === 'network' ? 'Can’t reach the restaurant' : 'Something went wrong'}
      </h1>
      <p className="mt-2 max-w-xs text-[15px] text-muted">
        {kind === 'not_found' ? 'Check the link you were given, or ask the restaurant for a fresh one.' : kind === 'network' ? 'Check that your phone is online and try again.' : message}
      </p>
      {kind !== 'not_found' && (
        <Button size="lg" className="mt-7" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/**
 * Public restaurant page /r/[slug]: who they are, open now or not, and — depending on the
 * restaurant's switches — online takeaway (menu + cart + checkout) and table booking.
 */
export function RestaurantScreen() {
  const router = useRouter();
  const reduce = Boolean(useReducedMotion());
  const { slug, data, loading, error, refresh, session } = useRestaurant();
  const hydrated = useHydrated();
  const now = useClock(30_000);

  const setSlug = useTakeawayCart((s) => s.setSlug);
  const storeLines = useTakeawayCart((s) => s.lines);
  const add = useTakeawayCart((s) => s.add);
  const increment = useTakeawayCart((s) => s.increment);
  const decrement = useTakeawayCart((s) => s.decrement);
  const syncLines = useTakeawayCart((s) => s.syncLines);
  const bump = useCartBump((s) => s.bump);
  React.useEffect(() => {
    setSlug(slug);
  }, [slug, setSlug]);
  const lines = hydrated ? storeLines : NO_LINES;
  const count = cartCount(lines);
  const subtotal = cartSubtotal(lines);
  const qtyByItem = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lines) m.set(l.item.id, (m.get(l.item.id) ?? 0) + l.quantity);
    return m;
  }, [lines]);

  const [activeItem, setActiveItem] = React.useState<MenuItem | null>(null);
  const [checkoutOpen, setCheckoutOpen] = React.useState(false);
  const [bookingOpen, setBookingOpen] = React.useState(false);
  const [recent, setRecent] = React.useState<OrderWithItems | null>(null);

  const restaurant = data?.restaurant ?? null;
  const takeaway = takeawayOn(restaurant);
  const booking = bookingOn(restaurant);
  /** Dishes can go in the cart: takeaway is on and the restaurant is taking orders. */
  const canOrder = takeaway && Boolean(restaurant?.is_open);

  // Keep the cart honest against the live menu.
  React.useEffect(() => {
    if (!data) return;
    const { dropped, repriced } = syncLines(data.items);
    if (dropped.length > 0) {
      toast(dropped.length === 1 ? `${dropped[0]!.item.name} is no longer available and was removed` : `${dropped.length} dishes are no longer available and were removed`);
    }
    if (repriced) toast('Menu prices changed, so your total was updated');
  }, [data, syncLines]);

  // An order still on its way from this phone: offer a shortcut to tracking it.
  React.useEffect(() => {
    if (!session || !takeaway) return;
    let cancelled = false;
    publicApi
      .takeawayOrders(slug, session.id)
      .then((orders) => {
        if (!cancelled) setRecent(orders.find((o) => ACTIVE.has(o.status)) ?? null);
      })
      .catch(() => {
        /* best effort */
      });
    return () => {
      cancelled = true;
    };
  }, [slug, session, takeaway]);

  React.useEffect(() => {
    router.prefetch(`/r/${slug}/orders`);
  }, [router, slug]);

  // Menu timing
  const running = React.useMemo(() => runningHappyHours(data?.happy_hours, now), [data?.happy_hours, now]);
  const sections = React.useMemo(() => {
    if (!data) return [];
    const cats = data.categories.filter((c) => c.is_active).sort((a, b) => a.sort_order - b.sort_order);
    const items = [...data.items].sort((a, b) => a.sort_order - b.sort_order);
    return cats.map((category) => ({ category, items: items.filter((i) => i.category_id === category.id) })).filter((s) => s.items.length > 0);
  }, [data]);
  const navCategories = React.useMemo(() => sections.map((s) => ({ ...s.category, count: s.items.length })), [sections]);
  const ids = React.useMemo(() => sections.map((s) => sectionId(s.category.id)), [sections]);

  const navRef = React.useRef<HTMLDivElement>(null);
  const [navH, setNavH] = React.useState(56);
  React.useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const measure = () => setNavH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sections.length]);
  const offset = navH + 8;
  const { active, scrollTo } = useScrollSpy(ids, offset, reduce);
  const activeCategoryId = React.useMemo(() => sections.find((s) => sectionId(s.category.id) === active)?.category.id ?? null, [sections, active]);

  const scrollToMenu = () => document.getElementById('menu')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });

  // Cart handlers
  const notTaking = () =>
    toast(takeaway ? `${restaurant?.name ?? 'The restaurant'} is not taking orders right now.` : 'Online orders are not available here.');
  const handleAdd = (item: MenuItem) => {
    if (!canOrder) return notTaking();
    if (item.option_groups.length > 0) return setActiveItem(item);
    add(item);
    bump();
    toast.success(`${item.name} added`);
  };
  const handleIncrement = (item: MenuItem) => {
    if (!canOrder) return notTaking();
    if (item.option_groups.length > 0) return setActiveItem(item);
    const line = lines.find((l) => l.item.id === item.id);
    if (line) increment(line.key);
    else add(item);
    bump();
  };
  const handleDecrement = (item: MenuItem) => {
    const itemLines = lines.filter((l) => l.item.id === item.id);
    const last = itemLines[itemLines.length - 1];
    if (last) decrement(last.key);
  };
  const handleSheetAdd = (item: MenuItem, options: SelectedOption[], note: string, quantity: number) => {
    if (!canOrder) return notTaking();
    add(item, options, note || undefined, quantity);
    bump();
    setActiveItem(null);
    toast.success(`${item.name} added`);
  };
  const handlePlaced = (order: OrderWithItems) => {
    setCheckoutOpen(false);
    toast.success(`Order ${orderCode(order.order_number)} placed`);
    router.push(`/r/${slug}/orders?placed=${order.id}`);
  };

  if (!data && loading) return <PageSkeleton />;
  if (!data && error) return <Problem kind={error.kind} message={error.message} onRetry={() => void refresh()} />;
  if (!data || !restaurant) return <PageSkeleton />;

  const state = openState(restaurant, now);
  const mapsUrl = restaurant.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${restaurant.name}, ${restaurant.address}`)}` : null;

  return (
    <div className="relative pb-36">
      {/* Hero */}
      <header className="relative overflow-hidden bg-ink text-paper">
        {restaurant.cover_url && (
          <DishImage src={restaurant.cover_url} alt="" sizes="(max-width: 640px) 100vw, 600px" priority className="absolute inset-0 h-full w-full rounded-none opacity-80" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/70 to-ink/20" aria-hidden />
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-ember/25 blur-3xl" aria-hidden />
        <motion.div
          className="gutter relative flex min-h-[300px] flex-col justify-end pb-6 pt-16"
          initial={reduce ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE_OUT }}
        >
          <div className="flex items-center gap-3">
            {restaurant.logo_url && (
              <DishImage src={restaurant.logo_url} alt="" sizes="48px" className="h-12 w-12 shrink-0 rounded-2xl ring-2 ring-paper/20" />
            )}
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.12em]',
                state.tone === 'open' ? 'bg-mint/20 text-[#8ff0c2]' : state.tone === 'paused' ? 'bg-saffron/20 text-[#ffd98a]' : 'bg-paper/10 text-paper/75',
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', state.tone === 'open' ? 'bg-mint motion-safe:animate-pulse' : state.tone === 'paused' ? 'bg-saffron' : 'bg-paper/50')} aria-hidden />
              {state.label}
              {state.detail && <span className="normal-case tracking-normal opacity-75">· {state.detail}</span>}
            </span>
          </div>
          <h1 className="mt-4 font-display text-display-sm font-bold leading-[0.95] tracking-tight">{restaurant.name}</h1>
          {restaurant.tagline && <p className="mt-2 font-serif text-[22px] italic leading-tight text-paper/90">{restaurant.tagline}</p>}
          <div className="mt-4 grid gap-1.5 text-[13.5px] text-paper/75">
            {restaurant.address && (
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-paper/50" aria-hidden />
                {mapsUrl ? (
                  <a href={mapsUrl} target="_blank" rel="noreferrer" className="underline-offset-4 hover:text-paper hover:underline">
                    {restaurant.address}
                  </a>
                ) : (
                  restaurant.address
                )}
              </p>
            )}
            {hoursText(restaurant) && (
              <p className="flex items-center gap-2">
                <Clock className="h-4 w-4 shrink-0 text-paper/50" aria-hidden />
                Open daily {hoursText(restaurant)}
              </p>
            )}
            {restaurant.phone && (
              <p className="flex items-center gap-2">
                <Phone className="h-4 w-4 shrink-0 text-paper/50" aria-hidden />
                <a href={`tel:${restaurant.phone.replace(/\s/g, '')}`} className="underline-offset-4 hover:text-paper hover:underline">
                  {restaurant.phone}
                </a>
              </p>
            )}
          </div>
        </motion.div>
      </header>

      {/* Primary actions */}
      <div className="gutter -mt-px bg-ink pb-6">
        {takeaway || booking ? (
          <div className={cn('grid gap-2', takeaway && booking && 'grid-cols-2')}>
            {takeaway && (
              <Button size="xl" className="w-full px-4" onClick={scrollToMenu} leftIcon={<ShoppingBag className="h-5 w-5" aria-hidden />}>
                Order takeaway
              </Button>
            )}
            {booking && (
              <Button size="xl" variant="light" className="w-full px-4" onClick={() => setBookingOpen(true)} leftIcon={<CalendarDays className="h-5 w-5" aria-hidden />}>
                Book a table
              </Button>
            )}
          </div>
        ) : (
          <p className="rounded-2xl bg-paper/10 px-4 py-3 text-[13.5px] leading-snug text-paper/80">
            {restaurant.name} does not take online orders or bookings yet. Here is the menu: to order, scan the QR code on your table
            {restaurant.phone ? ' or give them a call.' : '.'}
          </p>
        )}
        {takeaway && (
          <p className="mt-3 text-center text-[12.5px] text-paper/60">
            {restaurant.is_open
              ? `Ready in about ${restaurant.takeaway_prep_minutes} min · collect at the counter · ${restaurant.accepts_upi ? 'pay by UPI or at pickup' : 'pay at pickup'}`
              : 'Online orders are paused right now. You can still browse the menu.'}
          </p>
        )}
      </div>

      {recent && (
        <div className="gutter mt-4">
          <Link
            href={`/r/${slug}/orders`}
            className="group flex items-center gap-3 rounded-2xl border border-ember/25 bg-ember-soft p-3.5 transition hover:shadow-soft"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ember text-white">
              <ShoppingBag className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-bold leading-tight">
                {orderCode(recent.order_number)} · {PICKUP_LABEL[recent.status]}
              </span>
              <span className="mt-0.5 block text-[12.5px] text-ember-3">Track your takeaway order</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-ember-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </div>
      )}

      {takeaway && restaurant.is_open && running.length > 0 && <HappyHourBanner running={running} categories={data.categories} className="mt-4" />}

      {/* Menu */}
      <section id="menu" aria-labelledby="menu-h" className="mt-6" style={{ scrollMarginTop: 0 }}>
        <div className="gutter flex items-baseline justify-between gap-3">
          <h2 id="menu-h" className="font-display text-2xl font-bold tracking-tight">
            Menu
          </h2>
          {takeaway && (
            <Link href={`/r/${slug}/orders`} className="inline-flex min-h-[44px] items-center gap-1 text-[13px] font-semibold text-muted hover:text-fg">
              Your orders
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          )}
        </div>

        {navCategories.length > 1 && (
          <div ref={navRef} className="glass hairline-b sticky top-0 z-30 pt-2">
            <CategoryNav categories={navCategories} activeId={activeCategoryId} onSelect={(id) => scrollTo(sectionId(id))} sectionId={sectionId} />
          </div>
        )}

        {sections.length === 0 ? (
          <div className="gutter pt-8 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sunk text-muted">
              <UtensilsCrossed className="h-5 w-5" aria-hidden />
            </span>
            <p className="mt-4 font-display text-lg font-semibold">The menu is not up yet</p>
            <p className="mt-1 text-sm text-muted">Check back soon{restaurant.phone ? ', or call the restaurant' : ''}.</p>
          </div>
        ) : (
          <motion.div className="gutter" variants={stagger(0.05)} initial={reduce ? false : 'hidden'} animate="show">
            {sections.map((s) => {
              const id = sectionId(s.category.id);
              const windowText = servingWindowText(s.category);
              const serving = categoryServing(s.category, now);
              const offPercent = canOrder ? happyHourPercent(running, s.category.id) : 0;
              return (
                <motion.section key={s.category.id} id={id} variants={fadeUp} aria-labelledby={`${id}-h`} className="pt-6" style={{ scrollMarginTop: offset }}>
                  <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                    <h3 id={`${id}-h`} className="font-display text-xl font-bold tracking-tight">
                      {s.category.name}
                    </h3>
                    {windowText && (
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.1em]',
                          serving ? 'bg-mint-soft text-[#1b6f49]' : 'bg-sunk text-muted',
                        )}
                      >
                        {serving ? `Serving now · ${windowText}` : `Available ${windowText}`}
                      </span>
                    )}
                  </div>
                  {s.category.description && <p className="mt-1 text-sm text-muted">{s.category.description}</p>}
                  <ul className="mt-1 divide-y divide-line/10">
                    {s.items.map((item) => (
                      <li key={item.id}>
                        <DishCard
                          item={item}
                          qty={qtyByItem.get(item.id) ?? 0}
                          onAdd={() => handleAdd(item)}
                          onIncrement={() => handleIncrement(item)}
                          onDecrement={() => handleDecrement(item)}
                          onOpen={() => setActiveItem(item)}
                          offPercent={offPercent}
                          // A pickup can be scheduled into the serving window, so these stay orderable here;
                          // the checkout prices the order at the pickup time and says if a dish is not served then.
                          servingNote={!serving && windowText ? `Available ${windowText}, schedule your pickup then` : null}
                          readOnly={!canOrder}
                        />
                      </li>
                    ))}
                  </ul>
                </motion.section>
              );
            })}
          </motion.div>
        )}

        <footer className="gutter mt-10 border-t border-line/10 pt-5 text-[12px] text-muted">
          <p>
            Prices are in rupees. Taxes are added at checkout: CGST {restaurant.tax_rate / 2}% + SGST {restaurant.tax_rate / 2}%
            {restaurant.service_charge_rate > 0 ? `, plus a ${restaurant.service_charge_rate}% service charge.` : '.'}
          </p>
          {restaurant.gstin && <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.1em]">GSTIN {restaurant.gstin}</p>}
          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.16em]">Powered by Restaurant OS</p>
        </footer>
      </section>

      {canOrder && <CartBar count={count} subtotal={subtotal} onOpen={() => setCheckoutOpen(true)} cta="Checkout" />}

      <ItemSheet item={activeItem} open={activeItem !== null} onClose={() => setActiveItem(null)} onAdd={handleSheetAdd} disabled={!canOrder} />
      {takeaway && <TakeawayCheckout open={checkoutOpen} onClose={() => setCheckoutOpen(false)} restaurant={restaurant} onPlaced={handlePlaced} />}
      {booking && <BookingSheet open={bookingOpen} onClose={() => setBookingOpen(false)} restaurant={restaurant} />}
    </div>
  );
}
