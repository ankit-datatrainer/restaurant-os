import type { Metadata } from 'next';
import { Principles } from '@/components/marketing/about/principles';
import { Roadmap } from '@/components/marketing/about/roadmap';
import { Story } from '@/components/marketing/about/story';
import { CtaBand } from '@/components/marketing/cta-band';
import { PageHero } from '@/components/marketing/page-hero';

export const metadata: Metadata = {
  title: 'About',
  description: 'Why Restaurant OS exists, the six rules behind it, and an honest roadmap: what is live today for ordering, POS, billing, inventory and customer retention, and what is not built yet.',
};

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="About"
        words={[{ text: 'Built' }, { text: 'at' }, { text: 'the' }, { text: 'counter,' }, { text: 'for' }, { text: 'the' }, { text: 'counter.', className: 'font-serif font-normal italic text-ember' }]}
        lede="A small team in India building what a busy restaurant actually needs: ordering that works at the table, a counter screen that makes a noise, and a fair way to see guests again."
      />
      <Story />
      <Principles />
      <Roadmap />
      <CtaBand />
    </>
  );
}
