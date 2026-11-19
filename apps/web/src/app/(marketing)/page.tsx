import type { Metadata } from 'next';
import { CtaBand } from '@/components/marketing/cta-band';
import { FAQ } from '@/components/marketing/faq';
import { HOME_FAQ } from '@/components/marketing/faq-data';
import { FeaturesBento } from '@/components/marketing/features-bento';
import { Hero } from '@/components/marketing/hero';
import { BuiltFor } from '@/components/marketing/home/built-for';
import { ExtrasSwitch } from '@/components/marketing/home/extras-switch';
import { FeedbackReviews } from '@/components/marketing/home/feedback-reviews';
import { OwnerChanges } from '@/components/marketing/home/owner-changes';
import { RetentionFlow } from '@/components/marketing/home/retention-flow';
import { HowItWorks } from '@/components/marketing/how-it-works';
import { Marquee } from '@/components/marketing/marquee';
import { PricingPreview } from '@/components/marketing/pricing-preview';
import { SplitSection } from '@/components/marketing/split-section';
import { WholeFloor } from '@/components/marketing/home/whole-floor';

export const metadata: Metadata = {
  title: { absolute: 'Restaurant OS — QR ordering, POS, billing & inventory in one' },
  description:
    'From the first order to the next visit. Guests order and pay from the table, staff ring up counter and takeaway orders on the same system, bills split any way guests pay with numbered GST receipts, and you learn who your regulars are so you can bring them back, with their permission. No app to install.',
};

export default function HomePage() {
  return (
    <>
      <Hero />
      <Marquee />
      <OwnerChanges index="01" />
      <HowItWorks index="02" />
      <WholeFloor index="03" />
      <RetentionFlow index="04" />
      <FeaturesBento index="05" />
      <FeedbackReviews index="06" />
      <ExtrasSwitch />
      <SplitSection />
      <BuiltFor index="07" />
      <PricingPreview index="08" />
      <FAQ items={HOME_FAQ} index="09" title="The honest answers to the usual objections." />
      <CtaBand />
    </>
  );
}
