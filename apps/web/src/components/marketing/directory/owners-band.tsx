'use client';

import { ArrowUpRight, CalendarDays, Globe, ShoppingBag } from 'lucide-react';
import { Button, Magnetic, Reveal } from '@/components/ui';
import { MaskWords } from '../mask-words';

const POINTS = [
  { icon: Globe, text: 'Your own page at a short web address, with your menu and opening hours.' },
  { icon: ShoppingBag, text: 'Guests order takeaway for a pickup time, with no aggregator commission.' },
  { icon: CalendarDays, text: 'Guests book a table, and the booking lands on your dashboard.' },
];

/** Bottom band on /restaurants for owners: listing is optional and free with any plan. */
export function OwnersBand() {
  return (
    <section className="pb-24 md:pb-32">
      <div className="container-x">
        <Reveal>
          <div className="grain relative isolate overflow-hidden rounded-[2rem] border border-paper/10 bg-ink-2 px-6 py-12 md:px-12 md:py-16">
            <div aria-hidden className="pointer-events-none absolute -right-24 -top-32 h-[420px] w-[420px] rounded-full bg-ember/[0.18] blur-[130px]" />
            <div aria-hidden className="pointer-events-none absolute -bottom-40 left-1/4 h-[340px] w-[340px] rounded-full bg-saffron/[0.08] blur-[130px]" />

            <div className="relative grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
              <div>
                <p className="eyebrow flex items-center gap-3 text-ember">
                  <span className="h-px w-6 bg-ember/60" aria-hidden />
                  For restaurant owners
                </p>
                <MaskWords
                  as="h2"
                  className="mt-5 text-display-md font-bold"
                  stagger={0.06}
                  words={[
                    { text: 'Run' },
                    { text: 'a' },
                    { text: 'restaurant?' },
                    { text: 'List' },
                    { text: 'it' },
                    { text: 'here', className: 'font-serif font-normal italic text-ember' },
                    { text: 'free', className: 'font-serif font-normal italic text-ember' },
                    { text: 'when' },
                    { text: 'you' },
                    { text: 'join.' },
                  ]}
                />
                <p className="mt-5 max-w-xl text-base leading-relaxed text-muted md:text-lg">
                  Listing is optional and costs nothing extra. Switch it on in your settings and guests can find you here. Takeaway ordering and table
                  booking appear on Growth and Premium.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Magnetic>
                    <Button href="/signup" size="lg" rightIcon={<ArrowUpRight className="h-4 w-4" aria-hidden />}>
                      Start free trial
                    </Button>
                  </Magnetic>
                  <Button href="/contact?plan=demo" variant="outline" size="lg">
                    Book a demo
                  </Button>
                </div>
                <p className="mt-4 font-mono text-2xs uppercase tracking-[0.14em] text-muted">14 days of everything · No card needed</p>
              </div>

              <ul className="grid gap-3">
                {POINTS.map(({ icon: Icon, text }, i) => (
                  <Reveal as="li" key={text} delay={0.1 + i * 0.08} className="flex items-start gap-4 rounded-2xl border border-paper/10 bg-ink/40 p-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ember/15 text-ember">
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <p className="pt-1 text-sm leading-relaxed text-fg/85">{text}</p>
                  </Reveal>
                ))}
              </ul>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
