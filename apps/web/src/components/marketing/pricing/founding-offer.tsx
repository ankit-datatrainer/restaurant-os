'use client';

import * as React from 'react';
import { ArrowUpRight, Sparkles } from 'lucide-react';
import { Button, Magnetic, Reveal } from '@/components/ui';
import { cn, formatINR } from '@/lib/utils';
import { MaskWords } from '../mask-words';
import { FOUNDING } from '../plans';

const TERMS = [
  {
    k: 'Rate',
    v: `${FOUNDING.planName} at ${formatINR(FOUNDING.monthly)} a month per outlet, instead of ${formatINR(FOUNDING.standardMonthly)}.`,
  },
  {
    k: 'Onboarding',
    v: `${formatINR(FOUNDING.setup)} one-time, instead of ${formatINR(FOUNDING.standardSetup)}. Menu setup, table QR codes and staff training.`,
  },
  {
    k: 'Pilot',
    v: `A ${FOUNDING.pilotDays}-day guided pilot, credited toward your first subscription.`,
  },
  {
    k: 'Lock',
    v: `The founding rate stays locked for ${FOUNDING.lockMonths} months, subject to agreed usage limits.`,
  },
];

/** Ticket-style band for the founding restaurant partner offer. `compact` is the homepage version. */
export function FoundingOffer({ compact = false, className, id = 'founding' }: { compact?: boolean; className?: string; id?: string }) {
  return (
    <section id={id} className={cn('scroll-mt-24', compact ? 'pt-6' : 'py-20 md:py-28', className)}>
      <div className="container-x">
        <Reveal>
          <div className="grain relative isolate overflow-hidden rounded-[2rem] border border-ember/40 bg-ink-2">
            <div aria-hidden className="pointer-events-none absolute -right-24 -top-32 h-[420px] w-[420px] rounded-full bg-ember/[0.22] blur-[130px]" />
            <div aria-hidden className="pointer-events-none absolute -bottom-40 left-1/4 h-[360px] w-[360px] rounded-full bg-saffron/[0.10] blur-[130px]" />

            <div className="relative grid lg:grid-cols-[1.05fr_auto_0.95fr]">
              {/* left: the offer */}
              <div className={cn('p-7 md:p-10', !compact && 'lg:p-14')}>
                <p className="eyebrow flex items-center gap-2 text-ember">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  Founding restaurant partner offer
                </p>
                <MaskWords
                  as={compact ? 'h3' : 'h2'}
                  className={cn('mt-5 font-bold', compact ? 'text-display-sm' : 'text-display-md')}
                  words={[
                    { text: 'For' },
                    { text: 'the' },
                    { text: 'first' },
                    { text: `${FOUNDING.outlets}` },
                    { text: 'partner' },
                    { text: 'outlets.', className: 'font-serif font-normal italic text-ember' },
                  ]}
                />
                <p className="mt-4 max-w-md text-base leading-relaxed text-muted">
                  Help shape the product with us from day one, and keep a better rate for it. We work closely with every founding partner through setup and the pilot.
                </p>

                <div className="mt-8 flex flex-wrap items-end gap-x-4 gap-y-2">
                  <span className="font-display text-display-md font-bold leading-none">
                    <span className="tnum">{formatINR(FOUNDING.monthly)}</span>
                  </span>
                  <span className="pb-1 text-sm text-muted">/ month per outlet</span>
                  <span className="pb-1 font-mono text-sm text-muted line-through decoration-ember/70" aria-label={`Standard price ${formatINR(FOUNDING.standardMonthly)}`}>
                    {formatINR(FOUNDING.standardMonthly)}
                  </span>
                </div>
                <p className="mt-2 font-mono text-xs text-fg/80">
                  {FOUNDING.planName} plan · + {formatINR(FOUNDING.setup)} one-time onboarding · excl. GST and third-party charges
                </p>

                <div className="mt-8 flex flex-wrap gap-3">
                  <Magnetic>
                    <Button href={FOUNDING.href} size="lg" rightIcon={<ArrowUpRight className="h-4 w-4" aria-hidden />}>
                      Apply as a founding partner
                    </Button>
                  </Magnetic>
                  {compact && (
                    <Button href="/pricing#founding" variant="outline" size="lg">
                      Read the terms
                    </Button>
                  )}
                </div>
              </div>

              {/* perforation */}
              <div aria-hidden className="relative hidden w-px lg:block">
                <span className="absolute -top-4 left-1/2 h-8 w-8 -translate-x-1/2 rounded-full border border-ember/40 bg-ink" />
                <span className="absolute inset-y-6 left-0 w-px border-l border-dashed border-paper/15" />
                <span className="absolute -bottom-4 left-1/2 h-8 w-8 -translate-x-1/2 rounded-full border border-ember/40 bg-ink" />
              </div>
              <div aria-hidden className="mx-7 border-t border-dashed border-paper/15 md:mx-10 lg:hidden" />

              {/* right: the terms */}
              <dl className={cn('grid content-center gap-0 p-7 md:p-10', !compact && 'lg:p-14')}>
                {TERMS.map((t, i) => (
                  <Reveal key={t.k} delay={0.08 * i} className="grid grid-cols-[5.5rem_1fr] gap-4 border-b border-paper/10 py-4 first:pt-0 last:border-b-0 last:pb-0">
                    <dt className="pt-0.5 font-mono text-2xs uppercase tracking-[0.16em] text-ember">{t.k}</dt>
                    <dd className="text-sm leading-relaxed text-fg/85">{t.v}</dd>
                  </Reveal>
                ))}
              </dl>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
