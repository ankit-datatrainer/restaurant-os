'use client';

import { ArrowUpRight, CalendarCheck } from 'lucide-react';
import { Button, Magnetic, Reveal } from '@/components/ui';
import { MaskWords } from './mask-words';

export function CtaBand() {
  return (
    <section className="grain relative isolate overflow-hidden py-28 md:py-40">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[640px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ember/[0.14] blur-[160px]" />
      <div className="container-x relative text-center">
        <Reveal as="p" className="eyebrow justify-center text-ember">
          From the first order to the next visit
        </Reveal>
        <MaskWords
          as="h2"
          className="mx-auto mt-6 justify-center text-display-xl font-bold"
          stagger={0.1}
          words={[{ text: 'See' }, { text: 'it' }, { text: 'on' }, { text: 'your', className: 'font-serif font-normal italic text-ember' }, { text: 'menu.', className: 'font-serif font-normal italic text-ember' }]}
        />
        <Reveal as="p" delay={0.3} className="mx-auto mt-7 max-w-xl text-lg text-muted">
          Make restaurant service smarter, simpler and more connected. Book a 5-minute demo and we load your own menu first, or try the demo restaurant right now.
        </Reveal>
        <Reveal delay={0.45} className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Magnetic>
            <Button href="/contact?plan=demo" size="xl" leftIcon={<CalendarCheck className="h-5 w-5" aria-hidden />}>
              Book a 5-minute demo
            </Button>
          </Magnetic>
          <Magnetic>
            <Button href="/demo" variant="outline" size="xl" rightIcon={<ArrowUpRight className="h-4 w-4" aria-hidden />}>
              Open live demo
            </Button>
          </Magnetic>
        </Reveal>
      </div>
    </section>
  );
}
