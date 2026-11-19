import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ContactAside } from '@/components/marketing/contact/contact-aside';
import { ContactForm, ContactFormFallback } from '@/components/marketing/contact/contact-form';
import { PageHero } from '@/components/marketing/page-hero';

export const metadata: Metadata = {
  title: 'Book a demo',
  description:
    'Book a 5-minute Restaurant OS demo with your own menu. Tell us your city, how many tables you have and which plan or the founding partner offer interests you. We reply within a working day.',
};

export default function ContactPage() {
  return (
    <>
      <PageHero
        eyebrow="Contact"
        words={[
          { text: 'Book' },
          { text: 'a' },
          { text: '5-minute' },
          { text: 'demo' },
          { text: 'with' },
          { text: 'your', className: 'font-serif font-normal italic text-ember' },
          { text: 'menu.', className: 'font-serif font-normal italic text-ember' },
        ]}
        lede="Tell us a little about your restaurant. We load your menu into the demo before we meet, so you see your own dishes on the phone and on the dashboard. One reply, no sales sequence."
      />
      <section className="pb-24 md:pb-32">
        <div className="container-x grid gap-6 lg:grid-cols-[1.4fr_0.9fr] lg:gap-8">
          <Suspense fallback={<ContactFormFallback />}>
            <ContactForm />
          </Suspense>
          <ContactAside />
        </div>
      </section>
    </>
  );
}
