'use client';

import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import { AlertCircle, CalendarClock, ExternalLink, Loader2, ShoppingBag, Smartphone, Store, Timer, WifiOff } from 'lucide-react';
import type { OrderWithItems, PaymentMethod, PlaceOrderInput, Restaurant } from '@restaurant-os/shared';
import { PAYMENT_METHOD_LABEL, marketingConsentText, normalizeIndianPhone, roundMoney } from '@restaurant-os/shared';
import { Button, Input, Select, Sheet, Textarea, VegMark } from '@/components/ui';
import { publicApi } from '@/lib/api';
import { cn, computeTotals, formatINR } from '@/lib/utils';
import { EASE_OUT, pop } from '@/lib/motion';
import { CouponBox, PriceRows } from '@/components/guest/cart-sheet';
import { marketingOn } from '@/components/guest/features';
import { useClock } from '@/components/guest/happy-hour-banner';
import { Stepper } from '@/components/guest/stepper';
import { useOnline } from '@/components/guest/use-online';
import { quoteItems, useQuote } from '@/components/guest/use-quote';
import type { CartLine } from '@/store/cart';
import { addDaysKey, formatIstTime, hoursText, istDateKey, relativeDay, slotsForDay, withinHours } from './hours';
import { useRestaurant } from './restaurant-provider';
import { useTakeawayCart } from './takeaway-cart';
import { phoneForInput, rememberContact } from './takeaway-session';

type PickupMode = 'asap' | 'later';
const NO_SLOTS: number[] = [];

function LineRow({ line }: { line: CartLine }) {
  const increment = useTakeawayCart((s) => s.increment);
  const decrement = useTakeawayCart((s) => s.decrement);
  const opts = line.options.map((o) => o.choice_label).join(' · ');
  return (
    <div className="flex items-start gap-3 py-4">
      <VegMark isVeg={line.item.is_veg} className="mt-1" />
      <div className="min-w-0 flex-1">
        <p className="font-display text-[15px] font-semibold leading-snug">{line.item.name}</p>
        {opts && <p className="mt-0.5 text-[13px] text-muted">{opts}</p>}
        {line.note && <p className="mt-1 text-[13px] italic text-fg/70">“{line.note}”</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <Stepper value={line.quantity} onIncrement={() => increment(line.key)} onDecrement={() => decrement(line.key)} label={line.item.name} />
        <p className="font-mono text-sm font-semibold tnum">{formatINR(line.unitPrice * line.quantity)}</p>
      </div>
    </div>
  );
}

function ChoiceCard({
  selected,
  disabled,
  onClick,
  icon,
  title,
  hint,
}: {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex min-h-[76px] flex-col items-start rounded-2xl border p-3.5 text-left transition-[border-color,background-color,transform] duration-200 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
        selected ? 'border-ink bg-ink text-paper' : 'border-line/10 bg-surface text-fg hover:bg-sunk',
      )}
    >
      <span className={cn(selected ? 'text-ember' : 'text-muted')}>{icon}</span>
      <span className="mt-2 text-sm font-semibold">{title}</span>
      <span className={cn('mt-0.5 text-[11.5px] leading-snug', selected ? 'text-paper/65' : 'text-muted')}>{hint}</span>
    </button>
  );
}

/**
 * Takeaway checkout: dishes, name + mobile (required), pickup ASAP or at a 15-minute slot today or
 * tomorrow, payment, note, coupon with a live quote (priced at the pickup time), and the optional
 * WhatsApp offers checkbox. Retries reuse the same client_ref, so a lost answer never doubles an order.
 */
export function TakeawayCheckout({
  open,
  onClose,
  restaurant,
  onPlaced,
}: {
  open: boolean;
  onClose: () => void;
  restaurant: Restaurant;
  onPlaced: (order: OrderWithItems) => void;
}) {
  const reduce = useReducedMotion();
  const online = useOnline();
  const { slug, session, refresh } = useRestaurant();
  const lines = useTakeawayCart((s) => s.lines);
  const paymentMethod = useTakeawayCart((s) => s.paymentMethod);
  const setPaymentMethod = useTakeawayCart((s) => s.setPaymentMethod);
  const orderNote = useTakeawayCart((s) => s.orderNote);
  const setOrderNote = useTakeawayCart((s) => s.setOrderNote);
  const coupon = useTakeawayCart((s) => s.coupon);
  const setCoupon = useTakeawayCart((s) => s.setCoupon);
  const checkoutRef = useTakeawayCart((s) => s.checkoutRef);
  const clear = useTakeawayCart((s) => s.clear);

  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  const [consent, setConsent] = React.useState(false);
  const [placing, setPlacing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Pickup time
  const now = useClock(30_000);
  const prep = Math.max(0, restaurant.takeaway_prep_minutes || 0);
  const asapOk = restaurant.is_open && withinHours(restaurant, now + prep * 60_000);
  const [mode, setMode] = React.useState<PickupMode>('asap');
  const today = istDateKey(now);
  const dayOptions = React.useMemo(() => {
    const minAt = now + prep * 60_000;
    const maxAt = now + 7 * 86_400_000;
    return [today, addDaysKey(today, 1)].map((key) => ({ key, slots: slotsForDay(restaurant, key, { minAt, maxAt }) })).filter((d) => d.slots.length > 0);
  }, [restaurant, today, now, prep]);
  const [day, setDay] = React.useState<string | null>(null);
  const [slot, setSlot] = React.useState<number | null>(null);
  const daySlots = dayOptions.find((d) => d.key === day)?.slots ?? NO_SLOTS;

  // Keep the pickup choice valid as time passes (or the restaurant closes).
  React.useEffect(() => {
    if (!asapOk && mode === 'asap') setMode('later');
  }, [asapOk, mode]);
  React.useEffect(() => {
    if (dayOptions.length === 0) {
      setDay(null);
      return;
    }
    if (!day || !dayOptions.some((d) => d.key === day)) setDay(dayOptions[0]!.key);
  }, [dayOptions, day]);
  React.useEffect(() => {
    if (slot === null || !daySlots.includes(slot)) setSlot(daySlots[0] ?? null);
  }, [daySlots, slot]);

  // Every opening of the sheet is a new checkout: consent unticked, contact filled from last time.
  React.useEffect(() => {
    if (!open) return;
    setConsent(false);
    setTouched(false);
    setError(null);
    setName((v) => v || session?.name || '');
    setPhone((v) => v || phoneForInput(session?.phone));
  }, [open, session]);

  // Only what the restaurant accepts; default to the first accepted.
  React.useEffect(() => {
    const accepted: PaymentMethod[] = [];
    if (restaurant.accepts_upi) accepted.push('upi');
    if (restaurant.accepts_counter) accepted.push('counter');
    if (accepted.length > 0 && !accepted.includes(paymentMethod)) setPaymentMethod(accepted[0]!);
  }, [restaurant.accepts_upi, restaurant.accepts_counter, paymentMethod, setPaymentMethod]);

  const normalizedPhone = normalizeIndianPhone(phone);
  const showConsent = normalizedPhone !== null && marketingOn(restaurant);
  const consentLabel = marketingConsentText(restaurant.name);
  React.useEffect(() => {
    if (!showConsent) setConsent(false);
  }, [showConsent]);

  const pickupAt = mode === 'later' && slot !== null ? new Date(slot).toISOString() : undefined;

  // Live price at the pickup time (happy hours and serving windows depend on it).
  const items = React.useMemo(() => quoteItems(lines), [lines]);
  const pricing = useQuote({ enabled: open && lines.length > 0, restaurantSlug: slug, items, couponCode: coupon || undefined, pickupAt });
  const quote = pricing.quote;
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const local = computeTotals(subtotal, restaurant.tax_rate, restaurant.service_charge_rate);
  const shown = quote
    ? { subtotal: quote.subtotal, happyHour: quote.happy_hour_discount, names: quote.happy_hour_names, coupon: quote.coupon_discount, service: quote.service_charge, tax: quote.tax, total: quote.total }
    : { subtotal: local.subtotal, happyHour: 0, names: [] as string[], coupon: 0, service: local.service_charge, tax: local.tax_amount, total: local.total };
  const cgst = roundMoney(shown.tax / 2);
  const acceptedCoupon = quote && coupon && quote.coupon_code ? quote.coupon_code : null;
  const couponError = quote && coupon ? quote.coupon_error : null;
  const couponPending = Boolean(coupon) && pricing.loading;

  const count = lines.reduce((s, l) => s + l.quantity, 0);
  const paymentReady = restaurant.accepts_upi || restaurant.accepts_counter;
  const pickupReady = mode === 'asap' ? asapOk : pickupAt !== undefined;
  const canPlace = lines.length > 0 && restaurant.is_open && online && !placing && !couponPending && paymentReady && pickupReady;

  const place = async () => {
    setTouched(true);
    setError(null);
    if (!name.trim() || !normalizedPhone) {
      setError(!name.trim() ? 'Add your name so the counter knows whose order it is.' : 'Add a valid 10-digit mobile number so the restaurant can reach you about the pickup.');
      return;
    }
    if (!canPlace || !session) return;
    setPlacing(true);
    try {
      const ticked = showConsent && consent;
      const input: PlaceOrderInput = {
        order_type: 'takeaway',
        restaurant_slug: slug,
        guest_session_id: session.id,
        guest_name: name.trim(),
        guest_phone: normalizedPhone,
        marketing_consent: ticked,
        payment_method: paymentMethod,
        note: orderNote.trim() || undefined,
        items,
        client_ref: checkoutRef(),
      };
      if (ticked) input.consent_text = consentLabel;
      if (pickupAt) input.pickup_at = pickupAt;
      if (acceptedCoupon) input.coupon_code = acceptedCoupon;
      const order = await publicApi.placeOrder(input);
      rememberContact(slug, { name, phone: normalizedPhone });
      setConsent(false);
      clear();
      onPlaced(order);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not place the order. Please try again.';
      setError(message);
      toast.error(message);
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

  const payOptions: Array<{ method: PaymentMethod; icon: typeof Smartphone; hint: string }> = [];
  if (restaurant.accepts_upi) payOptions.push({ method: 'upi', icon: Smartphone, hint: 'Pay now with GPay, PhonePe, Paytm' });
  if (restaurant.accepts_counter) payOptions.push({ method: 'counter', icon: Store, hint: 'Cash or card when you collect' });

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Your takeaway"
      description={count > 0 ? `${count} ${count === 1 ? 'item' : 'items'} from ${restaurant.name}` : 'Nothing here yet'}
      footer={
        lines.length > 0 ? (
          <div className="grid gap-2">
            {!online ? (
              <p className="flex items-center justify-center gap-1.5 text-center text-xs text-rose" role="status">
                <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
                You&apos;re offline. Reconnect to place your order.
              </p>
            ) : !restaurant.is_open ? (
              <p className="text-center text-xs text-rose">{restaurant.name} is not taking orders right now.</p>
            ) : null}
            <Button size="xl" className="w-full" onClick={place} loading={placing} disabled={!canPlace}>
              Place order <span className="opacity-70">·</span> <span className="tnum">{formatINR(shown.total)}</span>
            </Button>
          </div>
        ) : undefined
      }
    >
      {lines.length === 0 ? (
        <div className="py-10 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-sunk text-muted">
            <ShoppingBag className="h-5 w-5" aria-hidden />
          </span>
          <p className="mt-4 font-display text-lg font-semibold">Your takeaway is empty</p>
          <p className="mt-1 text-sm text-muted">Add a few dishes from the menu and they will show up here.</p>
          <Button variant="outline" className="mt-5" onClick={onClose}>
            Back to menu
          </Button>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-line/10">
            <AnimatePresence initial={false}>
              {lines.map((l) => (
                <motion.li key={l.key} layout={!reduce} variants={pop} initial={reduce ? false : 'hidden'} animate="show" exit={reduce ? undefined : 'exit'}>
                  <LineRow line={l} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>

          <div className="mt-2 grid grid-cols-1 gap-6">
            {/* Pickup */}
            <section aria-labelledby="pickup-h">
              <p id="pickup-h" className="mb-2 text-[13px] font-semibold text-fg/80">
                When will you pick it up?
              </p>
              <div role="radiogroup" aria-labelledby="pickup-h" className="grid grid-cols-2 gap-2">
                <ChoiceCard
                  selected={mode === 'asap'}
                  disabled={!asapOk}
                  onClick={() => setMode('asap')}
                  icon={<Timer className="h-5 w-5" aria-hidden />}
                  title="As soon as possible"
                  hint={asapOk ? `About ${prep} min` : 'Not available right now'}
                />
                <ChoiceCard
                  selected={mode === 'later'}
                  disabled={dayOptions.length === 0}
                  onClick={() => setMode('later')}
                  icon={<CalendarClock className="h-5 w-5" aria-hidden />}
                  title="Schedule"
                  hint={dayOptions.length > 0 ? 'Today or tomorrow' : 'No slots left'}
                />
              </div>
              {!asapOk && restaurant.is_open && (
                <p className="mt-2 text-[12.5px] text-muted">
                  The kitchen is closed for now{hoursText(restaurant) ? ` (open ${hoursText(restaurant)})` : ''}. Schedule a pickup instead.
                </p>
              )}
              <AnimatePresence initial={false}>
                {mode === 'later' && dayOptions.length > 0 && (
                  <motion.div key="later" className="overflow-hidden" {...reveal}>
                    <div className="grid grid-cols-[auto,1fr] items-end gap-2 pt-3">
                      <div role="radiogroup" aria-label="Pickup day" className="flex gap-1.5">
                        {dayOptions.map((d) => (
                          <button
                            key={d.key}
                            type="button"
                            role="radio"
                            aria-checked={day === d.key}
                            onClick={() => setDay(d.key)}
                            className={cn(
                              'h-11 rounded-xl border px-3.5 text-[13px] font-semibold transition active:scale-95',
                              day === d.key ? 'border-ink bg-ink text-paper' : 'border-line/10 bg-surface hover:bg-sunk',
                            )}
                          >
                            {relativeDay(d.key, now)}
                          </button>
                        ))}
                      </div>
                      <Select aria-label="Pickup time" value={slot ?? ''} onChange={(e) => setSlot(Number(e.target.value))} className="tnum">
                        {daySlots.map((s) => (
                          <option key={s} value={s}>
                            {formatIstTime(s)}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>

            {/* Contact */}
            <section className="grid gap-4" aria-label="Your details">
              <Input
                label="Name"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 40))}
                autoComplete="name"
                placeholder="For the pickup counter"
                error={touched && !name.trim() ? 'Add your name for the pickup.' : undefined}
              />
              <div className="grid gap-2">
                <Input
                  label="Mobile number"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  prefix="+91"
                  placeholder="98450 12345"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/[^\d\s+-]/g, '').slice(0, 16))}
                  onBlur={() => phone.trim() && setTouched(true)}
                  hint="So the restaurant can reach you about the pickup."
                  error={touched && !normalizedPhone ? 'Enter a 10-digit mobile number, like 98450 12345.' : undefined}
                  className="pl-12 tnum"
                />
                <AnimatePresence initial={false}>
                  {showConsent && (
                    <motion.div key="consent" className="overflow-hidden" {...reveal}>
                      <div className="pt-1">
                        <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-2xl border border-line/10 bg-surface p-3.5 transition-colors hover:bg-sunk/60 has-[:checked]:border-ember/40 has-[:checked]:bg-ember-soft/40">
                          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded accent-ember" />
                          <span className="min-w-0 text-[13.5px] leading-snug text-fg/85">{consentLabel}</span>
                        </label>
                        <a
                          href="/privacy"
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-[44px] items-center gap-1 px-1 text-[12.5px] font-semibold text-muted underline-offset-4 hover:text-fg hover:underline"
                        >
                          How we use your number
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                          <span className="sr-only">(opens in a new tab)</span>
                        </a>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </section>

            {/* Payment */}
            <section>
              <p className="mb-2 text-[13px] font-semibold text-fg/80" id="pay-h">
                How would you like to pay?
              </p>
              {payOptions.length === 0 ? (
                <p className="rounded-2xl bg-sunk p-4 text-sm text-muted">Online payment options are not set up here yet. Call the restaurant to order.</p>
              ) : (
                <div role="radiogroup" aria-labelledby="pay-h" className={cn('grid gap-2', payOptions.length > 1 && 'grid-cols-2')}>
                  {payOptions.map(({ method, icon: Icon, hint }) => (
                    <ChoiceCard
                      key={method}
                      selected={paymentMethod === method}
                      onClick={() => setPaymentMethod(method)}
                      icon={<Icon className="h-5 w-5" aria-hidden />}
                      title={PAYMENT_METHOD_LABEL[method]}
                      hint={hint}
                    />
                  ))}
                </div>
              )}
              {paymentMethod === 'upi' && <p className="mt-2 text-[12.5px] text-muted">You get the UPI payment link right after placing the order.</p>}
            </section>

            <Textarea
              label="Note for the kitchen (optional)"
              placeholder="Allergies, less spicy, extra napkins…"
              value={orderNote}
              onChange={(e) => setOrderNote(e.target.value.slice(0, 300))}
              rows={2}
              className="min-h-[72px]"
            />
          </div>

          <CouponBox
            applied={coupon}
            accepted={acceptedCoupon}
            error={couponError}
            checking={couponPending}
            saving={quote?.coupon_discount ?? 0}
            onApply={setCoupon}
            onRemove={() => setCoupon('')}
          />

          {pricing.error && (
            <p className="mt-4 flex items-start gap-2 rounded-2xl bg-rose-soft p-3.5 text-[13.5px] text-[#a1282c]" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span className="min-w-0">
                {pricing.error}
                {mode === 'later' ? ' Try another pickup time.' : ''}
              </span>
            </p>
          )}

          <div className="mt-4 rounded-2xl bg-sunk p-4 text-sm" aria-busy={pricing.loading || undefined}>
            {pricing.loading && (
              <p className="mb-2 flex items-center justify-end gap-1.5 text-[11.5px] text-muted" role="status">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                Updating price…
              </p>
            )}
            <PriceRows
              subtotal={shown.subtotal}
              happyHour={shown.happyHour}
              happyHourNames={shown.names}
              coupon={acceptedCoupon ? shown.coupon : 0}
              couponCode={acceptedCoupon}
              service={shown.service}
              serviceRate={restaurant.service_charge_rate}
              cgst={cgst}
              sgst={roundMoney(shown.tax - cgst)}
              taxRate={restaurant.tax_rate}
              total={shown.total}
              totalLabel="Total"
            />
            {pricing.offline && <p className="mt-2 text-[12px] text-muted">Showing the price without offers. The final total is worked out when you order.</p>}
          </div>

          {error && (
            <p className="mt-4 flex items-start gap-2 rounded-2xl bg-rose-soft p-3.5 text-[13.5px] text-[#a1282c]" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span className="min-w-0">{error}</span>
            </p>
          )}
        </>
      )}
    </Sheet>
  );
}
