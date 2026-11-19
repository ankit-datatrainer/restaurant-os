'use client';

import * as React from 'react';
import { Building2, Gamepad2, Users, UtensilsCrossed } from 'lucide-react';
import { Reveal, Tilt } from '@/components/ui';
import { cn } from '@/lib/utils';
import { SectionHeading } from '../section-heading';

interface Segment {
  icon: React.ReactNode;
  figure: string;
  unit: string;
  /** Words rather than a number: set in the italic serif accent. */
  serif?: boolean;
  title: string;
  body: string;
  span: string;
}

const SEGMENTS: Segment[] = [
  {
    icon: <UtensilsCrossed className="h-5 w-5" />,
    figure: '15–40',
    unit: 'tables',
    title: 'Casual dining',
    body: 'Busy enough that orders slip at peak hours, with enough regulars to be worth getting to know.',
    span: 'lg:col-span-7',
  },
  {
    icon: <Users className="h-5 w-5" />,
    figure: 'Big',
    unit: 'tables, long menus',
    serif: true,
    title: 'Family restaurants',
    body: 'Big tables and long menus. Everyone can browse on their own phone, and “one more naan” goes on the same order.',
    span: 'lg:col-span-5',
  },
  {
    icon: <Building2 className="h-5 w-5" />,
    figure: '2–10',
    unit: 'branches',
    title: 'Multi-outlet groups',
    body: 'Each outlet gets its own menu, tables and dashboard, priced per outlet. Premium includes onboarding across your outlets. A single dashboard across branches is not built yet.',
    span: 'lg:col-span-5',
  },
  {
    icon: <Gamepad2 className="h-5 w-5" />,
    figure: 'Long',
    unit: 'stays, repeat groups',
    serif: true,
    title: 'Theme and gaming cafés',
    body: 'Long sessions and groups that come back. Orders from the table without leaving the game, and offers that give the group a reason to return.',
    span: 'lg:col-span-7',
  },
];

export function BuiltFor({ index = '06' }: { index?: string }) {
  return (
    <section className="relative py-24 md:py-32">
      <div className="container-x">
        <SectionHeading
          index={index}
          eyebrow="Who it’s for"
          title="Built for these restaurants."
          lede="Restaurant OS fits best where tables are busy, guests sit down to eat, and the same faces come back."
        />
        <ul className="mt-14 grid gap-4 lg:grid-cols-12">
          {SEGMENTS.map((s, i) => (
            <Reveal as="li" key={s.title} delay={0.06 * (i % 2)} className={cn('min-w-0', s.span)}>
              <Tilt max={3} className="h-full">
                <article className="group relative flex h-full flex-col justify-between gap-10 overflow-hidden rounded-3xl border border-paper/10 bg-ink-2/60 p-6 transition-[border-color,box-shadow] duration-500 hover:border-ember/40 hover:shadow-glow md:p-8">
                  <div aria-hidden className="pointer-events-none absolute -bottom-24 -right-16 h-56 w-56 rounded-full bg-ember/0 blur-3xl transition-colors duration-700 group-hover:bg-ember/15" />
                  <div className="relative flex items-start justify-between gap-4">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ember/15 text-ember transition-colors duration-300 group-hover:bg-ember group-hover:text-white">
                      {s.icon}
                    </span>
                    <p className="text-right">
                      <span
                        className={cn(
                          'block text-[clamp(2.25rem,4vw,3.5rem)] leading-none tracking-tight',
                          s.serif ? 'font-serif italic text-ember' : 'tnum font-display font-bold',
                        )}
                      >
                        {s.figure}
                      </span>
                      <span className="mt-1 block font-mono text-2xs uppercase tracking-[0.16em] text-muted">{s.unit}</span>
                    </p>
                  </div>
                  <div className="relative">
                    <h3 className="font-display text-2xl font-semibold leading-tight">{s.title}</h3>
                    <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">{s.body}</p>
                  </div>
                </article>
              </Tilt>
            </Reveal>
          ))}
        </ul>
        <Reveal as="p" delay={0.1} className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-muted">
          <span className="font-semibold text-fg/85">Also works for</span> premium casual dining and takeaway counters: staff ring up takeaway at the
          counter POS on every plan, and on Growth and Premium guests can order ahead for pickup from your own page.
        </Reveal>
      </div>
    </section>
  );
}
