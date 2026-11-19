'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Check, ChevronDown, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Input, Select, Textarea } from '@/components/ui';
import { ApiRequestError, publicApi } from '@/lib/api';
import { EASE_OUT } from '@/lib/motion';

export type PlanInterest = 'demo' | 'founding_partner' | 'starter' | 'growth' | 'premium';

export const INTEREST_OPTIONS: Array<{ value: PlanInterest; label: string }> = [
  { value: 'demo', label: 'Live demo' },
  { value: 'founding_partner', label: 'Founding partner offer' },
  { value: 'starter', label: 'Starter' },
  { value: 'growth', label: 'Growth' },
  { value: 'premium', label: 'Premium' },
];

function toInterest(v: string | null): PlanInterest {
  return INTEREST_OPTIONS.some((o) => o.value === v) ? (v as PlanInterest) : 'demo';
}

type Field = 'name' | 'email' | 'phone' | 'restaurant_name' | 'city' | 'table_count' | 'message';
type Values = Record<Field, string> & { plan_interest: PlanInterest };
type Status = 'idle' | 'loading' | 'success' | 'error';

const emptyValues = (plan: PlanInterest): Values => ({
  name: '',
  email: '',
  phone: '',
  restaurant_name: '',
  city: '',
  table_count: '',
  message: '',
  plan_interest: plan,
});

function validate(v: Values): Partial<Record<Field, string>> {
  const e: Partial<Record<Field, string>> = {};
  if (v.name.trim().length < 2) e.name = 'Please tell us your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email.trim())) e.email = 'That email doesn’t look right.';
  const digits = v.phone.replace(/\D/g, '');
  if (v.phone.trim() && (digits.length < 10 || digits.length > 13)) e.phone = 'Use a 10-digit Indian number, with or without +91.';
  if (v.city.length > 80) e.city = 'Keep it under 80 characters.';
  if (v.table_count.trim()) {
    const n = Number(v.table_count);
    if (!Number.isInteger(n) || n < 1 || n > 1000) e.table_count = 'A whole number, like 24.';
  }
  if (v.message.length > 2000) e.message = 'Keep it under 2,000 characters.';
  return e;
}

/** Wrap in <Suspense>: reads ?plan= to preselect "I'm interested in". */
export function ContactForm() {
  const reduce = useReducedMotion();
  const params = useSearchParams();
  const planParam = toInterest(params.get('plan'));
  const [values, setValues] = React.useState<Values>(() => emptyValues(planParam));
  const [errors, setErrors] = React.useState<Partial<Record<Field, string>>>({});
  const [status, setStatus] = React.useState<Status>('idle');
  const [serverError, setServerError] = React.useState<string | null>(null);

  // Follow ?plan= when the visitor arrives from another link while already on this page.
  React.useEffect(() => {
    setValues((v) => (v.plan_interest === planParam ? v : { ...v, plan_interest: planParam }));
  }, [planParam]);

  const set = (field: Field) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setValues((v) => ({ ...v, [field]: e.target.value }));
    if (errors[field]) setErrors((er) => ({ ...er, [field]: undefined }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate(values);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setStatus('loading');
    setServerError(null);
    try {
      await publicApi.submitLead({
        name: values.name.trim(),
        email: values.email.trim(),
        phone: values.phone.trim() || undefined,
        restaurant_name: values.restaurant_name.trim() || undefined,
        message: values.message.trim() || undefined,
        city: values.city.trim() || undefined,
        table_count: values.table_count.trim() ? Number(values.table_count) : undefined,
        plan_interest: values.plan_interest,
      });
      setStatus('success');
      toast.success('Got it. We reply within a working day.');
    } catch (err) {
      const msg = err instanceof ApiRequestError ? err.message : 'Something went wrong on our side.';
      setServerError(msg);
      setStatus('error');
      toast.error(msg);
    }
  };

  const reset = () => {
    setValues(emptyValues(planParam));
    setErrors({});
    setServerError(null);
    setStatus('idle');
  };

  const interestLabel = INTEREST_OPTIONS.find((o) => o.value === values.plan_interest)?.label ?? 'Live demo';

  return (
    <div className="relative rounded-3xl border border-paper/10 bg-ink-2/70 p-6 md:p-8">
      <AnimatePresence mode="wait" initial={false}>
        {status === 'success' ? (
          <motion.div
            key="success"
            className="flex min-h-[520px] flex-col items-center justify-center text-center"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: EASE_OUT }}
          >
            <motion.span
              className="flex h-16 w-16 items-center justify-center rounded-full bg-mint text-white"
              initial={reduce ? false : { scale: 0.5 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 22, delay: 0.1 }}
            >
              <Check className="h-8 w-8" strokeWidth={3} aria-hidden />
            </motion.span>
            <h3 className="mt-6 font-display text-2xl font-bold">Thanks, {values.name.trim().split(' ')[0]}.</h3>
            <p className="mt-2 max-w-sm text-muted">
              We’ve noted your interest in <span className="text-fg">{interestLabel}</span> and will reply to{' '}
              <span className="text-fg">{values.email.trim()}</span> within a working day to set a time. If you can, have a copy of your menu ready.
            </p>
            <Button variant="outline" size="md" className="mt-8" onClick={reset} leftIcon={<RotateCcw className="h-4 w-4" aria-hidden />}>
              Send another message
            </Button>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            onSubmit={submit}
            noValidate
            className="grid gap-5"
            initial={false}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            aria-busy={status === 'loading'}
          >
            <div className="relative">
              <Select
                label="I’m interested in"
                name="plan_interest"
                value={values.plan_interest}
                onChange={(e) => setValues((v) => ({ ...v, plan_interest: toInterest(e.target.value) }))}
              >
                {INTEREST_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              <ChevronDown className="pointer-events-none absolute bottom-3.5 right-3.5 h-4 w-4 text-muted" aria-hidden />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Input label="Your name" name="name" autoComplete="name" value={values.name} onChange={set('name')} error={errors.name} placeholder="Priya Sharma" required />
              <Input
                label="Email"
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={values.email}
                onChange={set('email')}
                error={errors.email}
                placeholder="priya@saffronlane.in"
                required
              />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Input
                label="Phone (optional)"
                name="phone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                value={values.phone}
                onChange={set('phone')}
                error={errors.phone}
                placeholder="+91 98765 43210"
                hint="For a WhatsApp reply, if you prefer."
              />
              <Input
                label="Restaurant name (optional)"
                name="restaurant_name"
                autoComplete="organization"
                value={values.restaurant_name}
                onChange={set('restaurant_name')}
                placeholder="Saffron Lane Café"
              />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Input
                label="City (optional)"
                name="city"
                autoComplete="address-level2"
                value={values.city}
                onChange={set('city')}
                error={errors.city}
                placeholder="Bengaluru"
              />
              <Input
                label="Number of tables (optional)"
                name="table_count"
                type="number"
                inputMode="numeric"
                min={1}
                max={1000}
                step={1}
                value={values.table_count}
                onChange={set('table_count')}
                error={errors.table_count}
                placeholder="24"
              />
            </div>
            <Textarea
              label="Anything we should know?"
              name="message"
              value={values.message}
              onChange={set('message')}
              error={errors.message}
              placeholder="What you use today (POS, paper KOTs, a tablet), how many outlets, and a good time for the demo."
              rows={4}
            />
            {status === 'error' && serverError && (
              <p role="alert" className="rounded-xl border border-rose/40 bg-rose/10 px-4 py-3 text-sm text-rose">
                {serverError} You can also email us directly; the address is on this page.
              </p>
            )}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-xs text-xs leading-relaxed text-muted">
                We use these details only to reply to you. No newsletter, no sales sequence. See our{' '}
                <Link href="/privacy" className="text-fg/85 underline underline-offset-4 hover:text-fg">
                  privacy notice
                </Link>
                .
              </p>
              <Button type="submit" size="lg" loading={status === 'loading'} rightIcon={<ArrowRight className="h-4 w-4" aria-hidden />}>
                {status === 'loading' ? 'Sending' : 'Book my demo'}
              </Button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Same footprint as the form, shown while the search params resolve. */
export function ContactFormFallback() {
  return (
    <div className="rounded-3xl border border-paper/10 bg-ink-2/70 p-6 md:p-8" aria-hidden>
      <div className="grid gap-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="grid gap-2">
            <span className="h-3 w-28 rounded bg-paper/10" />
            <span className="h-11 rounded-xl bg-paper/[0.06]" />
          </div>
        ))}
      </div>
    </div>
  );
}
