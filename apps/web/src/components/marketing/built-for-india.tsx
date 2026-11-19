'use client';

import * as React from 'react';
import { IndianRupee, Languages, Receipt, Smartphone, Leaf } from 'lucide-react';
import { CountUp, Reveal } from '@/components/ui';
import { MaskWords } from './mask-words';

const SPECIFICS: Array<{ icon: React.ReactNode; title: string; body: string }> = [
  {
    icon: <Receipt className="h-5 w-5" />,
    title: 'GST on every bill',
    body: 'Your tax rate is split into CGST and SGST on the bill, with your GSTIN printed at the top. No spreadsheet at month end.',
  },
  {
    icon: <IndianRupee className="h-5 w-5" />,
    title: 'UPI intent, amount pre-filled',
    body: 'The bill opens GPay, PhonePe, Paytm or BHIM with your UPI ID, the exact amount and the order number as reference.',
  },
  {
    icon: <Leaf className="h-5 w-5" />,
    title: 'Veg / non-veg marks',
    body: 'FSSAI-style green and brown squares on every dish, and a one-tap veg-only filter for the table that needs it.',
  },
  {
    icon: <Languages className="h-5 w-5" />,
    title: 'Menu in Hindi and English',
    body: 'Dish and category names and descriptions in Hindi, with an EN / हिं switch the guest controls. The key guest screens switch too. In every plan.',
  },
  {
    icon: <Smartphone className="h-5 w-5" />,
    title: 'Cheap Android, slow network',
    body: 'A few hundred kilobytes, no app store, no update prompts. Built for ₹8,000 phones on patchy 4G, not just flagships.',
  },
];

/* Product facts only — nothing here is a customer or usage claim. */
const FACTS: Array<{ value: number; prefix?: string; suffix?: string; label: string; display?: string }> = [
  { value: 0, label: 'app downloads needed' },
  { value: 1, label: 'tap to call a waiter' },
  { value: 1, prefix: '<', suffix: ' s', label: 'from order to kitchen board' },
  { value: 5, suffix: '%', label: 'GST computed automatically' },
];

export function BuiltForIndia({ index = '04' }: { index?: string }) {
  return (
    <section className="relative overflow-hidden py-24 md:py-32">
      <div aria-hidden className="pointer-events-none absolute -right-40 top-20 h-[520px] w-[520px] rounded-full bg-saffron/[0.07] blur-[150px]" />
      <div className="container-x relative">
        <div className="grid gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <div className="lg:sticky lg:top-32 lg:self-start">
            <Reveal as="p" className="eyebrow flex items-center gap-3">
              <span className="text-ember">{index}</span>
              <span className="h-px w-6 bg-line/20" aria-hidden />
              Built for India
            </Reveal>
            <MaskWords
              as="h2"
              className="mt-5 text-display-md font-bold"
              words={[{ text: 'Made' }, { text: 'for' }, { text: 'the' }, { text: 'counter,' }, { text: 'not' }, { text: 'the' }, { text: 'demo.', className: 'font-serif font-normal italic text-ember' }]}
            />
            <Reveal as="p" delay={0.25} className="mt-6 max-w-md text-lg leading-relaxed text-muted">
              The details that decide whether a tool survives a Saturday dinner rush at an Indian café: taxes, payments, dietary marks, and the
              phones people already have in their pockets.
            </Reveal>
          </div>
          <ul className="grid gap-3">
            {SPECIFICS.map((s, i) => (
              <Reveal as="li" key={s.title} delay={0.06 * i} className="group flex gap-5 rounded-3xl border border-paper/10 bg-ink-2/60 p-5 transition-colors hover:border-paper/20 md:p-6">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-ember/15 text-ember transition-colors group-hover:bg-ember group-hover:text-white">
                  {s.icon}
                </span>
                <div>
                  <p className="font-display text-lg font-semibold leading-tight">{s.title}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </ul>
        </div>

        <dl className="mt-20 grid grid-cols-2 border-t border-paper/10 lg:grid-cols-4">
          {FACTS.map((f, i) => (
            <Reveal key={f.label} delay={0.08 * i} className="flex flex-col border-b border-paper/10 py-8 pr-6 odd:border-r lg:border-b-0 lg:border-r lg:last:border-r-0">
              <dt className="order-2 mt-2 text-sm text-muted">{f.label}</dt>
              <dd className="order-1 font-display text-display-md font-bold leading-none text-fg">
                <CountUp value={f.value} prefix={f.prefix} suffix={f.suffix} />
              </dd>
            </Reveal>
          ))}
        </dl>
      </div>
    </section>
  );
}
