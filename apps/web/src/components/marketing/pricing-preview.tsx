'use client';

import { ArrowUpRight } from 'lucide-react';
import { Button, Reveal } from '@/components/ui';
import { PlanCard } from './plan-card';
import { PLANS, PRICE_FOOTNOTE } from './plans';
import { FoundingOffer } from './pricing/founding-offer';
import { TrialNote } from './pricing/pricing-plans';
import { SectionHeading } from './section-heading';

export function PricingPreview({ index = '07' }: { index?: string }) {
  return (
    <section className="relative py-24 md:py-32">
      <div className="container-x">
        <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <SectionHeading
            index={index}
            eyebrow="Pricing"
            title="Three plans. One flat price per outlet."
            lede="No per-order commission, no cut of payments. Every plan starts with menu setup, table QR codes, staff training and a guided pilot."
          >
            <Reveal delay={0.3} className="mt-6">
              <TrialNote />
            </Reveal>
          </SectionHeading>
          <Reveal delay={0.3} className="shrink-0">
            <Button href="/pricing" variant="outline" size="lg" rightIcon={<ArrowUpRight className="h-4 w-4" aria-hidden />}>
              Compare every feature
            </Button>
          </Reveal>
        </div>
        <ul className="mt-14 grid gap-5 lg:grid-cols-3">
          {PLANS.map((p, i) => (
            <PlanCard key={p.id} plan={p} billing="monthly" index={i} />
          ))}
        </ul>
        <Reveal as="p" delay={0.2} className="mt-6 max-w-3xl font-mono text-xs leading-relaxed text-muted">
          {PRICE_FOOTNOTE}
        </Reveal>
      </div>
      <FoundingOffer compact id="founding-home" className="mt-10" />
    </section>
  );
}
