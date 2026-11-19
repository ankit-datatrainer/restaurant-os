'use client';

import { Reveal, Tilt } from '@/components/ui';
import { SectionHeading } from '../section-heading';

const PRINCIPLES = [
  {
    n: '01',
    title: 'No app. Ever.',
    body: 'If a guest has to install something, the sticker has already failed. Everything runs in the browser they already have.',
  },
  {
    n: '02',
    title: 'Sound beats screens.',
    body: 'Kitchens are loud and hands are busy. A chime and a spoken order reach people; a notification badge does not.',
  },
  {
    n: '03',
    title: 'Rupees, GST and UPI are first-class.',
    body: 'Not a currency setting bolted on. Tax splits, GSTIN on the bill and UPI intents are in the core, built around how Indian cafés actually bill.',
  },
  {
    n: '04',
    title: 'Works on the phone you already own.',
    body: 'A few hundred kilobytes, no heavy scripts, fine on an ₹8,000 Android over patchy 4G. Fast for everyone, not just flagship phones.',
  },
  {
    n: '05',
    title: 'Consent, not contact lists.',
    body: 'Guests choose whether to leave a number and whether to hear from you. The offers box starts unticked, every message can be unsubscribed from, and reviews are never gated.',
  },
  {
    n: '06',
    title: 'Flat price, no cut.',
    body: 'We never touch your money and never charge per order. The plan price is the whole price.',
  },
];

export function Principles() {
  return (
    <section className="border-t border-paper/10 py-20 md:py-28">
      <div className="container-x">
        <SectionHeading index="02" eyebrow="Principles" title="Six rules we don’t break." />
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PRINCIPLES.map((p, i) => (
            <Reveal as="li" key={p.n} delay={0.06 * (i % 3)} className="min-w-0">
              <Tilt max={4} className="h-full">
                <article className="group flex h-full flex-col rounded-3xl border border-paper/10 bg-ink-2/60 p-6 transition-colors hover:border-ember/40 md:p-7">
                  <span className="font-mono text-xs text-ember">{p.n}</span>
                  <h3 className="mt-5 font-display text-2xl font-semibold leading-tight">{p.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-muted">{p.body}</p>
                </article>
              </Tilt>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
