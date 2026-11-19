'use client';

import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import { AlertCircle, Check, ExternalLink, Gift, Loader2, PlusCircle, Smartphone, Store, TicketPercent, Trash2, WifiOff, X } from 'lucide-react';
import type { OrderWithItems, PaymentMethod, PlaceOrderInput, PlaceOrderItemInput, Restaurant } from '@restaurant-os/shared';
import { PAYMENT_METHOD_LABEL, marketingConsentText, normalizeIndianPhone, roundMoney } from '@restaurant-os/shared';
import { Button, Input, Sheet, Textarea, VegMark } from '@/components/ui';
import { ApiRequestError, publicApi } from '@/lib/api';
import { getGuestSession, setGuestName as rememberGuestName, setGuestPhone } from '@/lib/session';
import { cn, computeTotals, formatINR, orderCode } from '@/lib/utils';
import { EASE_OUT, pop } from '@/lib/motion';
import { useCart, type CartLine } from '@/store/cart';
import { loyaltyOn, marketingOn, phoneOn } from './features';
import { HI_SAFE, dishName, useLang, type Lang } from './i18n';
import { ordinal } from './loyalty-card';
import { Stepper } from './stepper';
import { useTable } from './table-provider';
import { useLoyalty } from './use-loyalty';
import { useOnline } from './use-online';
import { quoteItems, useQuote } from './use-quote';

function optionsSummary(line: CartLine): string {
  return line.options.map((o) => o.choice_label).join(' · ');
}

/** "+919845012345" → "98450 12345" (the +91 sits in the field's prefix). */
function phoneForInput(phone: string | undefined): string {
  if (!phone) return '';
  const m = /^\+91(\d{5})(\d{5})$/.exec(phone);
  return m ? `${m[1]} ${m[2]}` : phone;
}

function LineRow({ line }: { line: CartLine }) {
  const { lang, t, uiLang } = useLang();
  const name = dishName(lang, line.item);
  const increment = useCart((s) => s.increment);
  const decrement = useCart((s) => s.decrement);
  const setNote = useCart((s) => s.setNote);
  const [editing, setEditing] = React.useState(false);
  const summary = optionsSummary(line);

  return (
    <div className="py-4">
      <div className="flex items-start gap-3">
        <VegMark isVeg={line.item.is_veg} className="mt-1" />
        <div className="min-w-0 flex-1">
          <p lang={name.lang} className="font-display text-[15px] font-semibold leading-snug">
            {name.text}
          </p>
          {summary && <p className="mt-0.5 text-[13px] text-muted">{summary}</p>}
          {line.note && !editing && (
            <p className="mt-1 text-[13px] italic text-fg/70">
              “{line.note}”
            </p>
          )}
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            lang={uiLang}
            className={cn('mt-1 inline-flex min-h-[32px] items-center font-mono text-[11px] uppercase tracking-[0.12em] text-ember', HI_SAFE, '[&:lang(hi)]:text-[12.5px]')}
          >
            {editing ? t('Done') : line.note ? t('Edit note') : t('Add note')}
          </button>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Stepper value={line.quantity} onIncrement={() => increment(line.key)} onDecrement={() => decrement(line.key)} label={name.text} />
          <p className="font-mono text-sm font-semibold tnum">{formatINR(line.unitPrice * line.quantity)}</p>
        </div>
      </div>
      {editing && (
        <div className="mt-2 pl-7">
          <Input
            value={line.note ?? ''}
            onChange={(e) => setNote(line.key, e.target.value.slice(0, 200))}
            placeholder={t('e.g. less spicy')}
            aria-label={t('Note for {name}', { name: name.text })}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') setEditing(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

function PaymentPicker({
  restaurant,
  value,
  onChange,
  lang,
  t,
}: {
  restaurant: Restaurant;
  value: PaymentMethod;
  onChange: (m: PaymentMethod) => void;
  lang: Lang;
  t: (key: string) => string;
}) {
  const options: Array<{ method: PaymentMethod; icon: typeof Smartphone; hint: string }> = [];
  if (restaurant.accepts_upi) options.push({ method: 'upi', icon: Smartphone, hint: 'GPay, PhonePe, Paytm' });
  if (restaurant.accepts_counter) options.push({ method: 'counter', icon: Store, hint: 'Cash or card when you leave' });
  const uiLang = lang === 'hi' ? 'hi' : undefined;
  if (options.length === 0) {
    return (
      <p className="rounded-2xl bg-sunk p-4 text-sm text-muted" lang={uiLang}>
        {t('Ask the staff how to pay — payment options are not set up yet.')}
      </p>
    );
  }
  return (
    <div role="radiogroup" aria-label={t('Payment method')} lang={uiLang} className={cn('grid gap-2', options.length > 1 && 'grid-cols-2')}>
      {options.map(({ method, icon: Icon, hint }) => {
        const selected = value === method;
        return (
          <button
            key={method}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(method)}
            className={cn(
              'flex min-h-[76px] flex-col items-start rounded-2xl border p-3.5 text-left transition-[border-color,background-color,transform] duration-200 active:scale-[0.98]',
              selected ? 'border-ink bg-ink text-paper' : 'border-line/10 bg-surface text-fg hover:bg-sunk',
            )}
          >
            <Icon className={cn('h-5 w-5', selected ? 'text-ember' : 'text-muted')} aria-hidden />
            <span className="mt-2 text-sm font-semibold">{t(PAYMENT_METHOD_LABEL[method])}</span>
            <span className={cn('mt-0.5 text-[11px]', selected ? 'text-paper/60' : 'text-muted')}>{t(hint)}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Review + place the order (or, in add mode, add the dishes to an open order).
 * Totals follow the restaurant's tax and service charge rates.
 */
export function CartSheet({
  open,
  onClose,
  restaurant,
  onPlaced,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  restaurant: Restaurant;
  onPlaced: (order: OrderWithItems) => void;
  /** Dishes were added to an existing order. */
  onAdded?: (order: OrderWithItems) => void;
}) {
  const reduce = useReducedMotion();
  const online = useOnline();
  const { code, session, refresh } = useTable();
  const { lang, t, tRich, uiLang } = useLang();
  const lines = useCart((s) => s.lines);
  const paymentMethod = useCart((s) => s.paymentMethod);
  const setPaymentMethod = useCart((s) => s.setPaymentMethod);
  const orderNote = useCart((s) => s.orderNote);
  const setOrderNote = useCart((s) => s.setOrderNote);
  const guestName = useCart((s) => s.guestName);
  const setGuestName = useCart((s) => s.setGuestName);
  const addToOrder = useCart((s) => s.addToOrder);
  const setAddToOrder = useCart((s) => s.setAddToOrder);
  const checkoutRef = useCart((s) => s.checkoutRef);
  const clear = useCart((s) => s.clear);
  const coupon = useCart((s) => s.coupon);
  const setCoupon = useCart((s) => s.setCoupon);
  const [placing, setPlacing] = React.useState(false);

  // Optional phone + WhatsApp offers consent (plan- and setting-dependent).
  const [phone, setPhone] = React.useState('');
  const [phoneTouched, setPhoneTouched] = React.useState(false);
  /** Never pre-ticked and never remembered: reset for every checkout. */
  const [consent, setConsent] = React.useState(false);
  const [addError, setAddError] = React.useState<string | null>(null);
  const phoneRef = React.useRef<HTMLInputElement>(null);

  const addMode = addToOrder !== null;
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const totals = computeTotals(subtotal, restaurant.tax_rate, restaurant.service_charge_rate);
  const count = lines.reduce((s, l) => s + l.quantity, 0);

  // Live price from the server: happy hour + coupon. Dishes added to an open order get the happy
  // hour too, but never a coupon. Local totals show while it loads or when the server is unreachable.
  const items = React.useMemo(() => quoteItems(lines), [lines]);
  const appliedCoupon = addMode ? '' : coupon;
  const pricing = useQuote({ enabled: open && lines.length > 0, tableCode: code, items, couponCode: appliedCoupon || undefined });
  const quote = pricing.quote;
  const shown = quote
    ? { subtotal: quote.subtotal, happyHour: quote.happy_hour_discount, happyHourNames: quote.happy_hour_names, coupon: quote.coupon_discount, service: quote.service_charge, tax: quote.tax, total: quote.total }
    : { subtotal: totals.subtotal, happyHour: 0, happyHourNames: [] as string[], coupon: 0, service: totals.service_charge, tax: totals.tax_amount, total: totals.total };
  const cgst = roundMoney(shown.tax / 2);
  const sgst = roundMoney(shown.tax - cgst);
  /** The code the server accepted for exactly this cart (only then is it sent with the order). */
  const acceptedCoupon = quote && appliedCoupon && quote.coupon_code ? quote.coupon_code : null;
  const couponError = quote && appliedCoupon ? quote.coupon_error : null;
  /** Never place an order while its coupon is still being checked: it would go through at full price. */
  const couponPending = Boolean(appliedCoupon) && pricing.loading;

  const showPhone = !addMode && phoneOn(restaurant);
  const normalizedPhone = phone.trim() ? normalizeIndianPhone(phone) : null;
  const phoneInvalid = phone.trim() !== '' && normalizedPhone === null;
  const showConsent = showPhone && normalizedPhone !== null && marketingOn(restaurant);
  // Legally fixed wording: always shown exactly as written, never translated.
  const consentLabel = marketingConsentText(restaurant.name);

  // Loyalty (Premium): tell guests who are not linked yet what leaving a number earns them.
  const loyalty = useLoyalty({ enabled: open && showPhone && loyaltyOn(restaurant) });
  const loyaltyRequired = loyalty?.visits_required ?? 0;
  const loyaltyReward = loyalty?.reward_text?.trim() ?? '';
  const loyaltyHint =
    loyalty && loyalty.enabled && !loyalty.linked && loyaltyRequired > 0 && loyaltyReward
      ? t('Leave your number to collect visits: every {nth} visit gets {reward}.', {
          n: loyaltyRequired,
          nth: ordinal(loyaltyRequired),
          reward: loyaltyReward,
        })
      : null;

  // Only offer what the restaurant accepts; default to the first accepted method.
  React.useEffect(() => {
    const accepted: PaymentMethod[] = [];
    if (restaurant.accepts_upi) accepted.push('upi');
    if (restaurant.accepts_counter) accepted.push('counter');
    if (accepted.length > 0 && !accepted.includes(paymentMethod)) setPaymentMethod(accepted[0]!);
  }, [restaurant.accepts_upi, restaurant.accepts_counter, paymentMethod, setPaymentMethod]);

  // Remember the guest's name from a previous order at this table.
  React.useEffect(() => {
    if (open && !guestName && session?.name) setGuestName(session.name);
  }, [open, guestName, session?.name, setGuestName]);

  // Every time the sheet opens is a new checkout: the consent box starts unticked again, and the
  // phone number from an earlier order in this visit is filled back in.
  React.useEffect(() => {
    if (!open) return;
    setConsent(false);
    setPhoneTouched(false);
    setAddError(null);
    setPhone((current) => current || phoneForInput(getGuestSession(code).phone));
  }, [open, code]);

  // The box disappears with a cleared or invalid number; it must not stay ticked out of sight.
  React.useEffect(() => {
    if (!showConsent) setConsent(false);
  }, [showConsent]);

  const canOrder =
    lines.length > 0 &&
    restaurant.is_open &&
    !placing &&
    online &&
    !couponPending &&
    (addMode || restaurant.accepts_upi || restaurant.accepts_counter);

  const itemsPayload = (): PlaceOrderItemInput[] => items;

  const placeOrder = async () => {
    if (!canOrder) return;
    if (!session) {
      toast.error(t('Give it a second and try again.'));
      return;
    }
    if (showPhone && phoneInvalid) {
      setPhoneTouched(true);
      phoneRef.current?.focus();
      toast.error(t('Check the mobile number, or leave it empty.'));
      return;
    }
    setPlacing(true);
    try {
      const ticked = showConsent && consent;
      const input: PlaceOrderInput = {
        table_code: code,
        guest_session_id: session.id,
        guest_name: guestName.trim() || undefined,
        payment_method: paymentMethod,
        note: orderNote.trim() || undefined,
        items: itemsPayload(),
        // Same cart, same key: a retry after a timeout returns the order instead of a duplicate.
        client_ref: checkoutRef(),
      };
      if (acceptedCoupon) input.coupon_code = acceptedCoupon;
      if (showPhone && normalizedPhone) {
        input.guest_phone = normalizedPhone;
        input.marketing_consent = ticked;
        if (ticked) input.consent_text = consentLabel;
      }
      const order = await publicApi.placeOrder(input);
      if (guestName.trim()) rememberGuestName(code, guestName);
      if (showPhone) setGuestPhone(code, normalizedPhone);
      setConsent(false);
      clear();
      onPlaced(order);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not place the order. Please try again.');
      void refresh();
    } finally {
      setPlacing(false);
    }
  };

  const placeAsNewOrder = () => {
    setAddToOrder(null);
    setAddError(null);
    toast(t('These dishes will go in as a new order'));
  };

  const addItems = async () => {
    if (!canOrder || !addToOrder) return;
    if (!session) {
      toast.error(t('Give it a second and try again.'));
      return;
    }
    setPlacing(true);
    setAddError(null);
    try {
      // Same cart, same key: tapping again after a lost response does not add the dishes twice.
      const order = await publicApi.addItems(addToOrder.id, { guest_session_id: session.id, items: itemsPayload(), client_ref: checkoutRef() });
      clear();
      setAddToOrder(null);
      toast.success(t('Added to order {code}', { code: orderCode(order.order_number) }));
      onAdded?.(order);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not add these dishes. Please try again.';
      // The server said no (the order moved on, was paid, or is gone): offer a fresh order instead.
      const rejected = e instanceof ApiRequestError && e.status >= 400 && e.status < 500;
      if (rejected) {
        setAddError(message);
        toast.error(message, { action: { label: t('Place as a new order instead'), onClick: placeAsNewOrder }, duration: 8000 });
      } else {
        toast.error(message);
      }
      void refresh();
    } finally {
      setPlacing(false);
    }
  };

  const reveal = {
    initial: reduce ? false : { opacity: 0, height: 0 },
    animate: { opacity: 1, height: 'auto' },
    exit: reduce ? { opacity: 0 } : { opacity: 0, height: 0 },
    transition: { duration: reduce ? 0 : 0.28, ease: EASE_OUT },
  } as const;

  const itemsLabel = t(count === 1 ? '{n} item' : '{n} items', { n: count });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={<span lang={uiLang}>{addToOrder ? t('Add to order {code}', { code: orderCode(addToOrder.number) }) : t('Your order')}</span>}
      description={
        <span lang={uiLang}>
          {count > 0
            ? addMode
              ? t('{items} to add', { items: itemsLabel })
              : t('{items} for {restaurant}', { items: itemsLabel, restaurant: restaurant.name })
            : t('Nothing here yet')}
        </span>
      }
      footer={
        <div className="grid gap-2" lang={uiLang}>
          {!online ? (
            <p className="flex items-center justify-center gap-1.5 text-center text-xs text-rose" role="status">
              <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {addMode ? t("You're offline. Reconnect to add these dishes.") : t("You're offline. Reconnect to place your order.")}
            </p>
          ) : (
            !restaurant.is_open && <p className="text-center text-xs text-rose">{t('The restaurant is not taking orders right now.')}</p>
          )}
          {addMode ? (
            <Button
              size="xl"
              className="w-full"
              onClick={addItems}
              loading={placing}
              disabled={!canOrder}
              leftIcon={<PlusCircle className="h-5 w-5" aria-hidden />}
            >
              {t('Add to order')} <span className="opacity-70">·</span> <span className="tnum">{formatINR(shown.total)}</span>
            </Button>
          ) : (
            <Button size="xl" className="w-full" onClick={placeOrder} loading={placing} disabled={!canOrder}>
              {t('Place order')} <span className="opacity-70">·</span> <span className="tnum">{formatINR(shown.total)}</span>
            </Button>
          )}
        </div>
      }
    >
      {addToOrder && (
        <div
          className={cn(
            'mb-1 rounded-2xl p-4 text-sm',
            addError ? 'bg-rose-soft text-[#a1282c]' : 'bg-ember-soft text-ember-3',
          )}
          role={addError ? 'alert' : undefined}
          lang={addError ? undefined : uiLang}
        >
          {addError ? (
            <>
              <p className="flex items-start gap-2 font-semibold">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0">{addError}</span>
              </p>
              <Button variant="outline" size="md" className="mt-3 w-full border-rose/30 bg-surface text-fg" onClick={placeAsNewOrder}>
                <span lang={uiLang}>{t('Place as a new order instead')}</span>
              </Button>
            </>
          ) : (
            <p>
              {tRich('These dishes join order {code} and go to the kitchen as an addition. You pay for them with the rest of that order.', {
                code: <span className="font-mono font-semibold tnum">{orderCode(addToOrder.number)}</span>,
              })}
            </p>
          )}
        </div>
      )}

      {lines.length === 0 ? (
        <div className="py-10 text-center" lang={uiLang}>
          <p className="font-display text-lg font-semibold">{addMode ? t('Nothing to add yet') : t('Your order is empty')}</p>
          <p className="mt-1 text-sm text-muted">
            {addMode ? t('Pick the dishes you want to add from the menu.') : t('Add a few dishes from the menu and they will show up here.')}
          </p>
          <Button variant="outline" className="mt-5" onClick={onClose}>
            {t('Back to menu')}
          </Button>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-line/10">
            <AnimatePresence initial={false}>
              {lines.map((l) => (
                <motion.li
                  key={l.key}
                  layout={!reduce}
                  variants={pop}
                  initial={reduce ? false : 'hidden'}
                  animate="show"
                  exit={reduce ? undefined : 'exit'}
                >
                  <LineRow line={l} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>

          {!addMode && (
            <div className="mt-2 grid gap-4">
              <div lang={uiLang}>
                <Textarea
                  label={t('Add a note for the kitchen')}
                  placeholder={t('Allergies, timing, anything the kitchen should know')}
                  value={orderNote}
                  onChange={(e) => setOrderNote(e.target.value.slice(0, 300))}
                  rows={2}
                  className="min-h-[72px]"
                />
              </div>
              <div lang={uiLang}>
                <Input
                  label={t('Your name (optional)')}
                  placeholder={t('So the waiter knows who ordered')}
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value.slice(0, 40))}
                  autoComplete="given-name"
                />
              </div>

              {showPhone && (
                <div className="grid gap-2">
                  <div lang={uiLang} className="grid gap-2">
                  <Input
                    ref={phoneRef}
                    label={t('Mobile number (optional)')}
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    prefix="+91"
                    placeholder="98450 12345"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/[^\d\s+-]/g, '').slice(0, 16))}
                    onBlur={() => setPhoneTouched(true)}
                    hint={t('So {restaurant} recognises you next time. Optional.', { restaurant: restaurant.name })}
                    error={phoneInvalid && phoneTouched ? t('Enter a 10-digit mobile number, like 98450 12345, or leave it empty.') : undefined}
                    className="pl-12 tnum"
                  />
                  {loyaltyHint && (
                    <p className="-mt-0.5 flex items-start gap-1.5 text-xs leading-snug text-ember-3">
                      <Gift className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="min-w-0">{loyaltyHint}</span>
                    </p>
                  )}
                  </div>
                  <AnimatePresence initial={false}>
                    {showConsent && (
                      <motion.div key="consent" className="overflow-hidden" {...reveal}>
                        <div className="pt-1">
                          <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-2xl border border-line/10 bg-surface p-3.5 transition-colors hover:bg-sunk/60 has-[:checked]:border-ember/40 has-[:checked]:bg-ember-soft/40">
                            <input
                              type="checkbox"
                              checked={consent}
                              onChange={(e) => setConsent(e.target.checked)}
                              className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded accent-ember"
                            />
                            <span className="min-w-0 text-[13.5px] leading-snug text-fg/85">{consentLabel}</span>
                          </label>
                          <a
                            href="/privacy"
                            target="_blank"
                            rel="noreferrer"
                            lang={uiLang}
                            className="inline-flex min-h-[44px] items-center gap-1 px-1 text-[12.5px] font-semibold text-muted underline-offset-4 hover:text-fg hover:underline"
                          >
                            {t('How we use your number')}
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                            <span className="sr-only">{t('(opens in a new tab)')}</span>
                          </a>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              <div>
                <p className="mb-2 text-[13px] font-semibold text-fg/80" lang={uiLang}>
                  {t('How would you like to pay?')}
                </p>
                <PaymentPicker restaurant={restaurant} value={paymentMethod} onChange={setPaymentMethod} lang={lang} t={t} />
              </div>
            </div>
          )}

          {!addMode && (
            <CouponBox
              applied={appliedCoupon}
              accepted={acceptedCoupon}
              error={couponError}
              checking={couponPending}
              saving={quote?.coupon_discount ?? 0}
              onApply={setCoupon}
              onRemove={() => setCoupon('')}
            />
          )}

          {pricing.error && (
            <p className="mt-4 flex items-start gap-2 rounded-2xl bg-rose-soft p-3.5 text-[13.5px] text-[#a1282c]" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span className="min-w-0">{pricing.error}</span>
            </p>
          )}

          <div className="mt-4 rounded-2xl bg-sunk p-4 text-sm" lang={uiLang} aria-busy={pricing.loading || undefined}>
            <div className="mb-2 flex min-h-[18px] items-center justify-between gap-2">
              {addMode ? <p className={cn('font-mono text-[11px] uppercase tracking-[0.14em] text-muted', HI_SAFE)}>{t('New dishes only')}</p> : <span />}
              {pricing.loading && (
                <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted" role="status">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                  {t('Updating price…')}
                </span>
              )}
            </div>
            <PriceRows
              subtotal={shown.subtotal}
              happyHour={shown.happyHour}
              happyHourNames={shown.happyHourNames}
              coupon={acceptedCoupon ? shown.coupon : 0}
              couponCode={acceptedCoupon}
              service={shown.service}
              serviceRate={restaurant.service_charge_rate}
              cgst={cgst}
              sgst={sgst}
              taxRate={restaurant.tax_rate}
              total={shown.total}
              totalLabel={addMode ? t('For these dishes') : t('Total')}
            />
            {pricing.offline && <p className="mt-2 text-[12px] text-muted">{t('Showing the price without offers. The final total is worked out when you order.')}</p>}
          </div>
          {addMode && (
            <p className="mt-2 px-1 text-[12.5px] text-muted" lang={uiLang}>
              {t('The total of order {code} updates to include these dishes once they are added.', { code: addToOrder ? orderCode(addToOrder.number) : '' })}
            </p>
          )}

          <button
            type="button"
            onClick={() => {
              clear();
              toast(t('Order cleared'));
            }}
            lang={uiLang}
            className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-semibold text-muted hover:text-rose"
          >
            <Trash2 className="h-4 w-4" aria-hidden /> {addMode ? t('Clear these dishes') : t('Clear order')}
          </button>
        </>
      )}
    </Sheet>
  );
}

/** Subtotal, offers, service charge, CGST/SGST and total. Shared by the table cart and takeaway checkout. */
export function PriceRows({
  subtotal,
  happyHour,
  happyHourNames,
  coupon,
  couponCode,
  service,
  serviceRate,
  cgst,
  sgst,
  taxRate,
  total,
  totalLabel,
}: {
  subtotal: number;
  happyHour: number;
  happyHourNames: string[];
  coupon: number;
  couponCode: string | null;
  service: number;
  serviceRate: number;
  cgst: number;
  sgst: number;
  taxRate: number;
  total: number;
  totalLabel: string;
}) {
  const { t } = useLang();
  return (
    <dl className="grid gap-1.5">
      <Row label={t('Subtotal')} value={subtotal} />
      {happyHour > 0 && (
        <DiscountRow label={happyHourNames.length > 0 ? t('Happy hour ({names})', { names: happyHourNames.join(', ') }) : t('Happy hour')} value={happyHour} />
      )}
      {coupon > 0 && couponCode && <DiscountRow label={t('Coupon {code}', { code: couponCode })} value={coupon} />}
      {service > 0 && <Row label={t('Service charge ({rate}%)', { rate: serviceRate })} value={service} />}
      <Row label={`CGST (${taxRate / 2}%)`} value={cgst} />
      <Row label={`SGST (${taxRate / 2}%)`} value={sgst} />
      <div className="hairline-t mt-1.5 flex items-baseline justify-between pt-2.5">
        <dt className="font-display text-base font-bold">{totalLabel}</dt>
        <dd className="font-display text-lg font-bold tnum">{formatINR(total)}</dd>
      </div>
    </dl>
  );
}

function DiscountRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[#1b6f49]">
      <dt className="min-w-0">{label}</dt>
      <dd className="shrink-0 font-mono tnum">−{formatINR(value)}</dd>
    </div>
  );
}

/**
 * "Have a coupon?" → code field + Apply. The live quote checks the code: an accepted code shows
 * the saving, a refused one shows the server's reason. Shared by the table cart and takeaway checkout.
 */
export function CouponBox({
  applied,
  accepted,
  error,
  checking,
  saving,
  onApply,
  onRemove,
}: {
  /** The code currently sent to the quote ('' = none). */
  applied: string;
  /** The code the quote accepted, or null. */
  accepted: string | null;
  error: string | null;
  checking: boolean;
  saving: number;
  onApply: (code: string) => void;
  onRemove: () => void;
}) {
  const { t, uiLang } = useLang();
  const [open, setOpen] = React.useState(Boolean(applied));
  const [draft, setDraft] = React.useState(applied);
  React.useEffect(() => {
    setDraft(applied);
    if (applied) setOpen(true);
  }, [applied]);

  const apply = () => {
    const code = draft.trim().toUpperCase();
    if (code) onApply(code);
  };

  if (applied && accepted) {
    return (
      <div className="mt-5 flex items-center gap-3 rounded-2xl border border-mint/30 bg-mint-soft px-3.5 py-2 text-[#1b6f49]" lang={uiLang} role="status">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/70" aria-hidden>
          <Check className="h-4 w-4" strokeWidth={3} />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-sm font-semibold">{t('Coupon {code} applied', { code: accepted })}</p>
          {saving > 0 && <p className="mt-0.5 text-[12.5px] opacity-80">{t('You save {amount}', { amount: formatINR(saving) })}</p>}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="-mr-1 inline-flex h-11 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] font-semibold hover:bg-white/60"
          aria-label={t('Remove coupon {code}', { code: accepted })}
        >
          <X className="h-4 w-4" aria-hidden />
          {t('Remove')}
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        lang={uiLang}
        className="mt-4 inline-flex min-h-[44px] items-center gap-2 text-[14px] font-semibold text-ember-3 hover:text-ember"
      >
        <TicketPercent className="h-4 w-4" aria-hidden />
        {t('Have a coupon?')}
      </button>
    );
  }

  return (
    <div className="mt-5" lang={uiLang}>
      <form
        className="flex items-start gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <div className="min-w-0 flex-1">
          <Input
            aria-label={t('Coupon code')}
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase().slice(0, 20))}
            placeholder={t('Coupon code')}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className="font-mono uppercase tracking-[0.08em] placeholder:font-sans placeholder:normal-case placeholder:tracking-normal"
            error={error && draft.trim().toUpperCase() === applied ? error : undefined}
          />
        </div>
        <Button type="submit" variant="dark" size="md" className="shrink-0 rounded-xl" loading={checking} disabled={!draft.trim()}>
          {t('Apply')}
        </Button>
      </form>
      {applied && !accepted && !checking && (
        <button type="button" onClick={onRemove} className="mt-1 inline-flex min-h-[40px] items-center text-[12.5px] font-semibold text-muted hover:text-fg">
          {t('Remove coupon')}
        </button>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className="font-mono tnum">{formatINR(value)}</dd>
    </div>
  );
}
