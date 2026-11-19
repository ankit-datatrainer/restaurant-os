'use client';

import { ArrowUpRight, Check, Megaphone, Plus } from 'lucide-react';
import { Button, Reveal } from '@/components/ui';
import { BILLED_SEPARATELY, COVERED } from '../plans';
import { SectionHeading } from '../section-heading';

const MARKETING = ['Consent-based WhatsApp campaigns', 'Social media', 'Local visibility'];

/** What the subscription pays for, what is billed separately, and the optional managed-marketing add-on. */
export function PricingCoverage() {
  return (
    <section className="border-t border-paper/10 py-20 md:py-28">
      <div className="container-x">
        <SectionHeading
          index="02"
          eyebrow="No surprises"
          title="What your subscription covers."
          lede="The monthly price runs the product for you. Anything that costs us real money on your behalf is listed separately, so it never turns up as a surprise."
        />

        <div className="mt-12 grid gap-4 lg:grid-cols-2">
          <Reveal className="rounded-3xl border border-paper/10 bg-ink-2/70 p-6 md:p-8">
            <p className="eyebrow text-mint">Included in every plan</p>
            <ul className="mt-6 grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
              {COVERED.map((c) => (
                <li key={c} className="flex items-start gap-3 text-sm text-fg/90">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mint/20 text-mint">
                    <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                  </span>
                  {c}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={0.08} className="rounded-3xl border border-paper/10 bg-ink-2/40 p-6 md:p-8">
            <p className="eyebrow text-saffron">Billed separately</p>
            <ul className="mt-6 grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
              {BILLED_SEPARATELY.map((c) => (
                <li key={c} className="flex items-start gap-3 text-sm text-fg/80">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-saffron/40 text-saffron">
                    <Plus className="h-3 w-3" strokeWidth={3} aria-hidden />
                  </span>
                  {c}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-xs leading-relaxed text-muted">
              WhatsApp conversation fees are set and billed by Meta, and payment gateway charges by your gateway; you pay them directly. We quote anything else before the work starts.
            </p>
          </Reveal>
        </div>

        {/* Optional add-on */}
        <Reveal delay={0.12} className="mt-4">
          <article className="group relative overflow-hidden rounded-3xl border border-paper/10 bg-gradient-to-br from-ink-2 to-ink p-6 transition-colors hover:border-ember/40 md:p-8">
            <div aria-hidden className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-ember/0 blur-3xl transition-colors duration-700 group-hover:bg-ember/15" />
            <div className="relative grid gap-6 md:grid-cols-[auto_1fr_auto] md:items-center md:gap-8">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ember/15 text-ember">
                <Megaphone className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <p className="eyebrow">Optional add-on · quoted separately</p>
                <h3 className="mt-2 font-display text-2xl font-semibold leading-tight">Managed restaurant marketing, by Peculiex</h3>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
                  If you would rather not run the marketing yourself, Peculiex, our own marketing agency, can do it for you. Campaigns only ever go to guests who opted in.
                </p>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {MARKETING.map((m) => (
                    <li key={m} className="rounded-full border border-paper/10 px-3 py-1 font-mono text-2xs uppercase tracking-[0.12em] text-fg/80">
                      {m}
                    </li>
                  ))}
                </ul>
              </div>
              <Button href="/contact" variant="outline" size="lg" rightIcon={<ArrowUpRight className="h-4 w-4" aria-hidden />}>
                Ask for a quote
              </Button>
            </div>
          </article>
        </Reveal>
      </div>
    </section>
  );
}
