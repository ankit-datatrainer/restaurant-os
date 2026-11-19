'use client';

import * as React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Button, Reveal, Tilt } from '@/components/ui';
import { cn } from '@/lib/utils';
import { SectionHeading } from './section-heading';
import { AddRound, BellRing, BillLines, ChimeWave, ConsentTick, CrmList, FeedbackStars, KotPrint, LangSwitch, LoyaltyStamps, StatusFlip, UpiFill } from './micro';

interface Card {
  title: string;
  body: string;
  visual: React.ReactNode;
  span: string;
  /** Plan the feature starts on, when it is not in every plan. */
  plan?: 'Growth' | 'Premium';
}

const CARDS: Card[] = [
  {
    title: 'The counter hears every order',
    body: 'A chime, then the order read aloud. Nobody has to keep an eye on a screen while the pan is hot.',
    visual: <ChimeWave />,
    span: 'md:col-span-3',
  },
  {
    title: 'Status the guest can see',
    body: 'Placed, accepted, preparing, ready, served. One tap on the board moves it; the phone updates by itself.',
    visual: <StatusFlip />,
    span: 'md:col-span-3',
  },
  {
    title: 'Know your regulars',
    body: 'Every guest who leaves a number gets a profile: visits, spend and rating. Filter repeat, new, lapsed or opted-in guests, and export to CSV.',
    visual: <CrmList />,
    span: 'md:col-span-4',
    plan: 'Growth',
  },
  {
    title: 'WhatsApp consent, their tick',
    body: 'A separate box, unticked by default. We store the exact wording and time, and every message carries an unsubscribe link.',
    visual: <ConsentTick />,
    span: 'md:col-span-2',
    plan: 'Growth',
  },
  {
    title: 'Feedback + your Google link',
    body: 'Guests rate the meal from 1 to 5. Everyone who rates sees your Google review link, whatever they gave.',
    visual: <FeedbackStars />,
    span: 'md:col-span-2',
    plan: 'Growth',
  },
  {
    title: 'Add dishes to an open order',
    body: 'One more naan goes on the same order and the same bill. The kitchen sees what was added, marked as new.',
    visual: <AddRound />,
    span: 'md:col-span-2',
    plan: 'Growth',
  },
  {
    title: 'KOT printing',
    body: 'Print a kitchen order ticket for any order from the dashboard, for kitchens that still run on paper.',
    visual: <KotPrint />,
    span: 'md:col-span-2',
  },
  {
    title: 'Waiter calls, acknowledged',
    body: 'The request rings on staff phones. When someone picks it up, the guest’s phone says help is on the way.',
    visual: <BellRing />,
    span: 'md:col-span-2',
  },
  {
    title: 'UPI with the amount filled in',
    body: 'The bill opens the guest’s UPI app with your ID, the amount and a reference. They tap “I have paid”; you confirm.',
    visual: <UpiFill />,
    span: 'md:col-span-2',
  },
  {
    title: 'GST on every bill',
    body: 'Your tax rate split into CGST and SGST, GSTIN on top, totals that match your books.',
    visual: <BillLines />,
    span: 'md:col-span-2',
  },
  {
    title: 'The menu in Hindi, one tap away',
    body: 'Dish and category names and descriptions in Hindi, with an EN / हिं switch the guest controls. The key guest screens switch too.',
    visual: <LangSwitch />,
    span: 'md:col-span-3',
  },
  {
    title: 'Rewards for regulars',
    body: 'Every 5th visit, or whatever you choose, unlocks a reward with a code on the guest’s phone. Staff redeem it in the dashboard; it expires when you say.',
    visual: <LoyaltyStamps />,
    span: 'md:col-span-3',
    plan: 'Premium',
  },
];

function BentoCard({ card, index }: { card: Card; index: number }) {
  return (
    <Reveal as="li" delay={0.05 * (index % 3)} className={cn('min-w-0', card.span)}>
      <Tilt max={4} className="h-full">
        <article className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-paper/10 bg-ink-2 p-6 transition-[border-color,box-shadow] duration-500 hover:border-ember/40 hover:shadow-glow md:p-7">
          <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-ember/0 blur-3xl transition-colors duration-700 group-hover:bg-ember/20" />
          {card.plan && (
            <span className="absolute right-5 top-5 z-10 rounded-full border border-paper/10 bg-ink/70 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted backdrop-blur">
              {card.plan === 'Premium' ? 'Premium' : `${card.plan}+`}
            </span>
          )}
          <div className={cn('relative min-h-[164px] flex-1', card.plan && 'pt-6')}>{card.visual}</div>
          <div className="relative mt-7">
            <h3 className="font-display text-xl font-semibold leading-tight">{card.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{card.body}</p>
          </div>
        </article>
      </Tilt>
    </Reveal>
  );
}

export function FeaturesBento({ index = '04' }: { index?: string }) {
  return (
    <section id="features" className="py-24 md:py-32">
      <div className="container-x">
        <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <SectionHeading
            index={index}
            eyebrow="What you get"
            title="Everything the floor needs. And what comes after."
            lede="Twelve things that happen hundreds of times a day, from the first order to the guest who comes back. Each one made boring in the best way."
          />
          <Reveal delay={0.3} className="shrink-0">
            <Button href="/features" variant="outline" size="lg" rightIcon={<ArrowUpRight className="h-4 w-4" aria-hidden />}>
              All features
            </Button>
          </Reveal>
        </div>
        <ul className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-6">
          {CARDS.map((c, i) => (
            <BentoCard key={c.title} card={c} index={i} />
          ))}
        </ul>
        <p className="mt-6 font-mono text-xs text-muted">
          Cards marked Growth+ are on the Growth and Premium plans; Premium cards are on Premium. Everything else, including the Hindi menu, is in every plan.
        </p>
      </div>
    </section>
  );
}
