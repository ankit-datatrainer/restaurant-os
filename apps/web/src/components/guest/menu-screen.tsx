'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import { Plus, SearchX } from 'lucide-react';
import type { MenuItem, OrderWithItems, Restaurant, SelectedOption } from '@restaurant-os/shared';
import { roundMoney } from '@restaurant-os/shared';
import { Button, DishImage, EmptyState } from '@/components/ui';
import { ApiRequestError, publicApi } from '@/lib/api';
import { cn, orderCode } from '@/lib/utils';
import { fadeUp, stagger } from '@/lib/motion';
import { useCart, type CartLine } from '@/store/cart';
import { CartBar } from './cart-bar';
import { useCartBump } from './cart-bump';
import { CartSheet } from './cart-sheet';
import { CategoryNav } from './category-nav';
import { DishCard } from './dish-card';
import { FabStack } from './fab-stack';
import { HappyHourBanner, categoryServing, happyHourPercent, runningHappyHours, servingWindowText, useClock } from './happy-hour-banner';
import { canAddToOrder, gamesOn, storyOn } from './features';
import { HelpSheet } from './help-sheet';
import { HI_SAFE, pick, pickOptional, searchText, useLang } from './i18n';
import { ItemSheet } from './item-sheet';
import { MenuHeader } from './menu-header';
import { ClosedBanner, MenuSkeleton, TableProblem } from './menu-states';
import { OrderSuccess } from './order-success';
import { Splash } from './splash';
import { StoryTeaser } from './story-card';
import { peekTableCache, useTable } from './table-provider';
import { useHydrated } from './use-hydrated';
import { useScrollSpy } from './use-scroll-spy';

const sectionId = (categoryId: string) => `cat-${categoryId}`;
const NO_LINES: CartLine[] = [];

function Hero({ restaurant, dishes, categories }: { restaurant: Restaurant; dishes: number; categories: number }) {
  const { t, uiLang } = useLang();
  return (
    <div className="gutter mt-3">
      <div className="relative overflow-hidden rounded-3xl bg-ink text-paper">
        {restaurant.cover_url && (
          <DishImage src={restaurant.cover_url} alt="" sizes="(max-width: 640px) 100vw, 560px" priority className="absolute inset-0 h-full w-full rounded-none" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/35 to-ink/5" aria-hidden />
        <div className="relative flex aspect-[21/9] min-h-[132px] flex-col justify-end p-5">
          {restaurant.tagline ? (
            <p className="font-serif text-[22px] italic leading-tight text-paper/95">{restaurant.tagline}</p>
          ) : (
            <p lang={uiLang} className="font-serif text-[22px] italic leading-tight text-paper/95 [&:lang(hi)]:font-sans [&:lang(hi)]:not-italic">
              {t('Order from your phone. We will bring it over.')}
            </p>
          )}
          <p lang={uiLang} className={cn('mt-2 font-mono text-[11px] uppercase tracking-[0.16em] text-paper/60', HI_SAFE)}>
            {t('{dishes} dishes · {categories} categories', { dishes, categories })}
          </p>
        </div>
      </div>
    </div>
  );
}

export function MenuScreen() {
  const router = useRouter();
  const reduce = Boolean(useReducedMotion());
  const { code, data, loading, error, refresh, session } = useTable();
  const { lang, t, tRich, uiLang } = useLang();
  const hydrated = useHydrated();

  // Cart (persisted per table in localStorage; read only after hydration).
  const setTable = useCart((s) => s.setTable);
  const lines = useCart((s) => s.lines);
  const add = useCart((s) => s.add);
  const increment = useCart((s) => s.increment);
  const decrement = useCart((s) => s.decrement);
  const syncLines = useCart((s) => s.syncLines);
  const addToOrder = useCart((s) => s.addToOrder);
  const setAddToOrder = useCart((s) => s.setAddToOrder);
  const bump = useCartBump((s) => s.bump);

  React.useEffect(() => {
    setTable(code);
  }, [code, setTable]);

  const cartLines = hydrated ? lines : NO_LINES;
  /** The open order the guest is adding dishes to (read only after hydration: it lives in localStorage). */
  const addTarget = hydrated ? addToOrder : null;
  const count = cartLines.reduce((s, l) => s + l.quantity, 0);
  const subtotal = roundMoney(cartLines.reduce((s, l) => s + l.unitPrice * l.quantity, 0));
  const qtyByItem = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const l of cartLines) m.set(l.item.id, (m.get(l.item.id) ?? 0) + l.quantity);
    return m;
  }, [cartLines]);

  // UI state
  const [search, setSearch] = React.useState('');
  const [vegOnly, setVegOnly] = React.useState(false);
  const [activeItem, setActiveItem] = React.useState<MenuItem | null>(null);
  const [cartOpen, setCartOpen] = React.useState(false);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const [placed, setPlaced] = React.useState<OrderWithItems | null>(null);
  const [ordersCount, setOrdersCount] = React.useState(0);

  // Splash: only on the first load in this tab (skipped when the menu is cached).
  const [splash, setSplash] = React.useState(false);
  const splashStarted = React.useRef(false);
  React.useEffect(() => {
    if (splashStarted.current) return;
    splashStarted.current = true;
    if (!peekTableCache(code)) setSplash(true);
  }, [code]);
  React.useEffect(() => {
    if (!splash) return;
    if (error) {
      setSplash(false);
      return;
    }
    const t = window.setTimeout(() => setSplash(false), data ? (reduce ? 250 : 850) : 6000);
    return () => window.clearTimeout(t);
  }, [splash, data, error, reduce]);

  // Badge on the "My orders" icon.
  React.useEffect(() => {
    if (!session) return;
    let cancelled = false;
    publicApi
      .sessionOrders(code, session.id)
      .then((orders) => {
        if (!cancelled) setOrdersCount(orders.length);
      })
      .catch(() => {
        /* badge is best-effort */
      });
    return () => {
      cancelled = true;
    };
  }, [code, session]);

  // Re-check every cart line against the live menu whenever it (re)loads: a dish may have sold
  // out, a price or option may have changed, or the cart may be left over from an earlier visit.
  // The server always charges the menu price, so the total on the button must match it.
  React.useEffect(() => {
    if (!data) return;
    const { dropped, repriced } = syncLines(data.items);
    if (dropped.length > 0) {
      toast(
        dropped.length === 1
          ? `${dropped[0]!.item.name} is no longer available and was removed from your order`
          : `${dropped.length} dishes are no longer available and were removed from your order`,
      );
    }
    if (repriced) toast('Menu prices changed, so your order total was updated');
  }, [data, syncLines]);

  React.useEffect(() => {
    router.prefetch(`/t/${code}/orders`);
  }, [router, code]);

  // "Add to order" mode may be stale (the order moved on, was paid, or the visit ended): check it once.
  const addTargetId = addTarget?.id ?? null;
  React.useEffect(() => {
    if (!addTargetId || !session) return;
    let cancelled = false;
    publicApi
      .getOrder(addTargetId, session.id)
      .then((o) => {
        if (cancelled || canAddToOrder(o)) return;
        setAddToOrder(null);
        toast(`Order ${orderCode(o.order_number)} can't take more dishes now, so anything you pick goes in a new order.`);
      })
      .catch((e) => {
        if (!cancelled && e instanceof ApiRequestError && e.status === 404) setAddToOrder(null);
      });
    return () => {
      cancelled = true;
    };
  }, [addTargetId, session, setAddToOrder]);

  // Filtering
  const q = search.trim().toLowerCase();
  const sections = React.useMemo(() => {
    if (!data) return [];
    const cats = data.categories.filter((c) => c.is_active).sort((a, b) => a.sort_order - b.sort_order);
    const items = [...data.items].sort((a, b) => a.sort_order - b.sort_order);
    // Search matches the English and the Hindi name/description, whichever language is on screen.
    const matches = (i: MenuItem) => (!vegOnly || i.is_veg) && (!q || searchText(i).includes(q));
    return cats
      .map((category) => ({ category, items: items.filter((i) => i.category_id === category.id && matches(i)) }))
      .filter((s) => s.items.length > 0);
  }, [data, vegOnly, q]);
  const navCategories = React.useMemo(() => sections.map((s) => ({ ...s.category, count: s.items.length })), [sections]);
  const ids = React.useMemo(() => sections.map((s) => sectionId(s.category.id)), [sections]);

  // Sticky header height drives the scroll-spy offset and section scroll margin.
  const stickyRef = React.useRef<HTMLDivElement>(null);
  const [stickyH, setStickyH] = React.useState(120);
  const hasData = data !== null;
  React.useEffect(() => {
    const el = stickyRef.current;
    if (!el) return;
    const measure = () => setStickyH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasData]);
  const offset = stickyH + 8;
  const { active, scrollTo } = useScrollSpy(ids, offset, reduce);
  // The hook speaks in section element ids; the chip row speaks in category ids.
  const activeCategoryId = React.useMemo(() => sections.find((s) => sectionId(s.category.id) === active)?.category.id ?? null, [sections, active]);
  const selectCategory = React.useCallback((categoryId: string) => scrollTo(sectionId(categoryId)), [scrollTo]);

  const restaurant = data?.restaurant ?? null;
  const table = data?.table ?? null;
  const isOpen = restaurant?.is_open ?? true;

  // Menu timing: happy hours running now, and categories outside their serving window.
  const now = useClock();
  const running = React.useMemo(() => runningHappyHours(data?.happy_hours, now), [data?.happy_hours, now]);
  const servingByCategory = React.useMemo(() => {
    const m = new Map<string, boolean>();
    for (const c of data?.categories ?? []) m.set(c.id, categoryServing(c, now));
    return m;
  }, [data?.categories, now]);
  const isServing = (item: MenuItem) => servingByCategory.get(item.category_id) ?? true;
  const notServingNotice = (item: MenuItem) => {
    const cat = data?.categories.find((c) => c.id === item.category_id);
    toast(t('{name} is only served {window}', { name: pick(lang, item.name, item.name_hi).text, window: cat ? servingWindowText(cat) : '' }));
  };

  // Cart handlers. A closed restaurant shows the menu but takes nothing into the cart.
  const closedNotice = () => toast(t('Not taking orders right now. Ask the staff when ordering reopens.'));
  const addedToast = (item: MenuItem) => toast.success(t('{name} added', { name: pick(lang, item.name, item.name_hi).text }));
  const handleAdd = (item: MenuItem) => {
    if (!isOpen) {
      closedNotice();
      return;
    }
    if (!isServing(item)) {
      notServingNotice(item);
      return;
    }
    if (item.option_groups.length > 0) {
      setActiveItem(item);
      return;
    }
    add(item);
    bump();
    addedToast(item);
  };
  const handleIncrement = (item: MenuItem) => {
    if (!isOpen) {
      closedNotice();
      return;
    }
    if (!isServing(item)) {
      notServingNotice(item);
      return;
    }
    if (item.option_groups.length > 0) {
      setActiveItem(item);
      return;
    }
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
    if (!isOpen) {
      closedNotice();
      return;
    }
    if (!isServing(item)) {
      notServingNotice(item);
      return;
    }
    add(item, options, note || undefined, quantity);
    bump();
    setActiveItem(null);
    addedToast(item);
  };
  const cancelAdd = () => {
    setAddToOrder(null);
    toast(t('Okay. Anything you pick now goes in a new order'));
  };
  const handleAdded = (order: OrderWithItems) => {
    setCartOpen(false);
    router.push(`/t/${code}/orders/${order.id}`);
  };
  const handlePlaced = (order: OrderWithItems) => {
    setCartOpen(false);
    setPlaced(order);
    setOrdersCount((c) => c + 1);
    window.setTimeout(() => router.push(`/t/${code}/orders/${order.id}`), reduce ? 900 : 2000);
  };

  return (
    <div className="relative pb-40">
      <Splash visible={splash} restaurant={restaurant} table={table} />

      {!data && loading && <MenuSkeleton />}
      {!data && !loading && error && <TableProblem code={code} error={error} onRetry={() => void refresh()} />}

      {data && restaurant && table && (
        <>
          <div ref={stickyRef} className="glass hairline-b sticky top-[var(--guest-offline-h,0px)] z-30">
            {addTarget && (
              <div className="gutter flex min-h-[44px] items-center gap-2.5 bg-ember-soft text-[13px] text-ember-3" role="status">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ember text-white" aria-hidden>
                  <Plus className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
                <p className="min-w-0 flex-1 leading-tight" lang={uiLang}>
                  {tRich('Adding to order {code}', { code: <span className="font-mono font-semibold tnum">{orderCode(addTarget.number)}</span> })}
                  <span className="mx-1.5 opacity-60" aria-hidden>
                    ·
                  </span>
                  <button
                    type="button"
                    onClick={cancelAdd}
                    className="-my-3 inline-flex min-h-[44px] items-center font-semibold text-fg underline decoration-ember/40 underline-offset-4 hover:decoration-ember"
                    aria-label={t('Cancel adding to order {code}', { code: orderCode(addTarget.number) })}
                  >
                    {t('Cancel')}
                  </button>
                </p>
              </div>
            )}
            <MenuHeader
              restaurant={restaurant}
              table={table}
              code={code}
              search={search}
              onSearch={setSearch}
              vegOnly={vegOnly}
              onVegOnly={setVegOnly}
              ordersCount={ordersCount}
            />
            {navCategories.length > 0 && <CategoryNav categories={navCategories} activeId={activeCategoryId} onSelect={selectCategory} sectionId={sectionId} />}
          </div>

          {!restaurant.is_open && <ClosedBanner />}
          {restaurant.is_open && running.length > 0 && <HappyHourBanner running={running} categories={data.categories} className="mt-3" />}
          {!q && !vegOnly && <Hero restaurant={restaurant} dishes={data.items.length} categories={data.categories.filter((c) => c.is_active).length} />}

          <main className="gutter">
            {sections.length === 0 ? (
              <div className="pt-8">
                <div lang={uiLang}>
                <EmptyState
                  icon={<SearchX className="h-5 w-5" aria-hidden />}
                  title={q ? t('Nothing matches “{q}”', { q: search.trim() }) : vegOnly ? t('No vegetarian dishes right now') : t('The menu is empty')}
                  description={
                    q ? t('Try a shorter word, or browse the categories.') : vegOnly ? t('Turn off the veg filter to see everything.') : t('Ask the staff — they may be updating it.')
                  }
                  action={
                    (q || vegOnly) && (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSearch('');
                          setVegOnly(false);
                        }}
                      >
                        {t('Show everything')}
                      </Button>
                    )
                  }
                />
                </div>
              </div>
            ) : (
              <motion.div variants={stagger(0.06)} initial={reduce ? false : 'hidden'} animate="show">
                {sections.map((s) => {
                  const id = sectionId(s.category.id);
                  const catName = pick(lang, s.category.name, s.category.name_hi);
                  const catDesc = pickOptional(lang, s.category.description, s.category.description_hi);
                  const serving = servingByCategory.get(s.category.id) ?? true;
                  const windowText = servingWindowText(s.category);
                  const servingNote = !serving && windowText ? t('Available {window}', { window: windowText }) : null;
                  const offPercent = happyHourPercent(running, s.category.id);
                  return (
                    <motion.section key={s.category.id} id={id} variants={fadeUp} aria-labelledby={`${id}-h`} className="pt-6" style={{ scrollMarginTop: offset }}>
                      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                        <h2 id={`${id}-h`} lang={catName.lang} className={cn('font-display text-xl font-bold tracking-tight', !serving && 'text-muted')}>
                          {catName.text}
                        </h2>
                        {windowText && (
                          <span
                            lang={uiLang}
                            className={cn(
                              'inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.1em]',
                              HI_SAFE,
                              serving ? 'bg-mint-soft text-[#1b6f49]' : 'bg-sunk text-muted',
                            )}
                          >
                            {serving ? t('Serving now · {window}', { window: windowText }) : t('Available {window}', { window: windowText })}
                          </span>
                        )}
                      </div>
                      {catDesc && (
                        <p lang={catDesc.lang} className="mt-1 text-sm text-muted">
                          {catDesc.text}
                        </p>
                      )}
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
                              servingNote={servingNote}
                              blocked={!serving}
                            />
                          </li>
                        ))}
                      </ul>
                    </motion.section>
                  );
                })}
              </motion.div>
            )}

            {storyOn(restaurant) && !q && !vegOnly && (
              <div className="mt-10">
                <StoryTeaser restaurant={restaurant} />
              </div>
            )}

            <footer className="mt-10 border-t border-line/10 pt-5 text-[12px] text-muted">
              <p>
                Taxes are added at checkout: CGST {restaurant.tax_rate / 2}% + SGST {restaurant.tax_rate / 2}%
                {restaurant.service_charge_rate > 0 ? `, plus a ${restaurant.service_charge_rate}% service charge.` : '.'}
              </p>
              {restaurant.gstin && <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.1em]">GSTIN {restaurant.gstin}</p>}
              <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.16em]">Powered by Restaurant OS</p>
            </footer>
          </main>

          <CartBar count={count} subtotal={subtotal} onOpen={() => setCartOpen(true)} cta={addTarget ? t('Add to order') : undefined} />
          <FabStack lifted={count > 0} onHelp={() => setHelpOpen(true)} gamesHref={gamesOn(restaurant) ? `/t/${code}/games` : null} />

          <ItemSheet item={activeItem} open={activeItem !== null} onClose={() => setActiveItem(null)} onAdd={handleSheetAdd} disabled={!restaurant.is_open} />
          <CartSheet open={cartOpen} onClose={() => setCartOpen(false)} restaurant={restaurant} onPlaced={handlePlaced} onAdded={handleAdded} />
          <HelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} code={code} guestSessionId={session?.id ?? null} />
        </>
      )}

      <OrderSuccess order={placed} />
    </div>
  );
}
