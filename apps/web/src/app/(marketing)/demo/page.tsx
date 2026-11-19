import type { Metadata } from 'next';
import { CtaBand } from '@/components/marketing/cta-band';
import { DemoHub } from '@/components/marketing/demo/demo-hub';
import { PageHero } from '@/components/marketing/page-hero';

export const metadata: Metadata = {
  title: 'Live demo',
  description:
    'The 5-minute Restaurant OS demo: scan the sample table QR, place an order, watch it land on the dashboard with a chime, call a waiter, then rate the meal and open Customers and Feedback.',
};

export default function DemoPage() {
  return (
    <>
      <PageHero
        eyebrow="Live demo · Saffron Lane Café"
        words={[{ text: 'Five' }, { text: 'minutes,' }, { text: 'one' }, { text: 'phone,' }, { text: 'one', className: 'font-serif font-normal italic text-ember' }, { text: 'screen.', className: 'font-serif font-normal italic text-ember' }]}
        lede="A demo restaurant with real tables and real dishes, running on the same code a paying restaurant uses. Phone in one hand, dashboard on this screen, from the first order to the feedback."
      />
      <DemoHub />
      <CtaBand />
    </>
  );
}
