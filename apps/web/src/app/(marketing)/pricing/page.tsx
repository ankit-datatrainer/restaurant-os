import type { Metadata } from 'next';
import { PLAN_INFO } from '@restaurant-os/shared';
import { CtaBand } from '@/components/marketing/cta-band';
import { FAQ } from '@/components/marketing/faq';
import { PageHero } from '@/components/marketing/page-hero';
import { PRICING_FAQ } from '@/components/marketing/plans';
import { FoundingOffer } from '@/components/marketing/pricing/founding-offer';
import { PricingCoverage } from '@/components/marketing/pricing/pricing-coverage';
import { PricingPlans } from '@/components/marketing/pricing/pricing-plans';
import { PricingTable } from '@/components/marketing/pricing/pricing-table';
import { formatINR } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Pricing',
  description: `Restaurant OS pricing per outlet: Starter ${formatINR(PLAN_INFO.starter.monthly)}, Growth ${formatINR(PLAN_INFO.growth.monthly)} and Premium ${formatINR(PLAN_INFO.premium.monthly)} a month, plus a one-time setup. No per-order commission. All prices exclude GST.`,
};

export default function PricingPage() {
  return (
    <>
      <PageHero
        eyebrow="Pricing"
        words={[
          { text: 'One' },
          { text: 'flat' },
          { text: 'price' },
          { text: 'per' },
          { text: 'outlet.' },
          { text: 'No', className: 'font-serif font-normal italic text-ember' },
          { text: 'commission.', className: 'font-serif font-normal italic text-ember' },
        ]}
        lede="Every plan includes QR ordering, the counter POS and GST billing. Pick the one that fits how you run the floor today. Every plan starts with menu setup, table QR codes, staff training and a guided pilot. Prices exclude GST."
      />
      <PricingPlans />
      <FoundingOffer />
      <PricingCoverage />
      <PricingTable />
      <FAQ items={PRICING_FAQ} index="04" eyebrow="Pricing questions" title="Straight answers on money." />
      <CtaBand />
    </>
  );
}
