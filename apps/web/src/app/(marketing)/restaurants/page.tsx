import type { Metadata } from 'next';
import { DirectoryBrowser } from '@/components/marketing/directory/directory-browser';
import { OwnersBand } from '@/components/marketing/directory/owners-band';
import { PageHero } from '@/components/marketing/page-hero';

export const metadata: Metadata = {
  title: { absolute: 'Restaurants on Restaurant OS' },
  description:
    'Find cafés and restaurants that run on Restaurant OS. Order takeaway for a pickup time or book a table straight from the restaurant’s own page, with no aggregator in between.',
  alternates: { canonical: '/restaurants' },
  openGraph: {
    title: 'Restaurants on Restaurant OS',
    description: 'Order takeaway or book a table straight from the restaurant’s own page.',
    url: '/restaurants',
  },
};

export default function RestaurantsPage() {
  return (
    <>
      <PageHero
        eyebrow="Directory"
        className="pb-10 md:pb-14"
        words={[
          { text: 'Restaurants' },
          { text: 'on' },
          { text: 'Restaurant', className: 'font-serif font-normal italic text-ember' },
          { text: 'OS.', className: 'font-serif font-normal italic text-ember' },
        ]}
        lede="Order takeaway for a pickup time or book a table, straight from the restaurant’s own page. No app to install."
      />
      <DirectoryBrowser />
      <OwnersBand />
    </>
  );
}
