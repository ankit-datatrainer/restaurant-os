import type { Metadata } from 'next';
import { ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui';
import { BuiltForIndia } from '@/components/marketing/built-for-india';
import { CtaBand } from '@/components/marketing/cta-band';
import { ComparisonTable } from '@/components/marketing/features/comparison-table';
import { FeatureSections } from '@/components/marketing/features/feature-sections';
import { ModuleIndex } from '@/components/marketing/features/module-index';
import { PageHero } from '@/components/marketing/page-hero';

export const metadata: Metadata = {
  title: 'Features',
  description:
    'Everything in Restaurant OS: QR table ordering, a counter POS and live floor view, billing with split payments, tips and numbered GST receipts, a customer display with a UPI QR, daily cash close, staff invites, timesheets and an activity log, on every plan. Growth adds reservations, a waitlist, online takeaway, coupons, happy hours, gift cards, expenses and P&L, plus customer CRM, consent-based WhatsApp offers and feedback. Premium adds inventory and purchasing, loyalty, advanced reports, automated WhatsApp messages and POS / webhook integration.',
};

export default function FeaturesPage() {
  return (
    <>
      <PageHero
        eyebrow="Features"
        words={[
          { text: 'Order,' },
          { text: 'bill,' },
          { text: 'stock,' },
          { text: 'repeat.' },
          { text: 'One', className: 'font-serif font-normal italic text-ember' },
          { text: 'system.', className: 'font-serif font-normal italic text-ember' },
        ]}
        lede="QR ordering at the table, a counter POS, billing and GST receipts, bookings, stock and the books, and the tools that bring guests back. Built for the guest, the counter, the kitchen and the owner."
      >
        <Button href="/contact?plan=demo" size="lg" rightIcon={<ArrowUpRight className="h-4 w-4" aria-hidden />}>
          Book a 5-minute demo
        </Button>
        <Button href="/demo" variant="outline" size="lg">
          Open live demo
        </Button>
        <Button href="/pricing" variant="ghost" size="lg">
          See pricing
        </Button>
      </PageHero>
      <ModuleIndex />
      <FeatureSections />
      <BuiltForIndia index="13" />
      <ComparisonTable index="14" />
      <CtaBand />
    </>
  );
}
