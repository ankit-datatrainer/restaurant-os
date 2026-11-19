'use client';

import { Reveal } from '@/components/ui';
import { SectionHeading } from '../section-heading';

export function Story() {
  return (
    <section className="border-t border-paper/10 py-20 md:py-28">
      <div className="container-x grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <SectionHeading index="01" eyebrow="Why we built it" title="It started with a lost order on a Saturday." />
          <Reveal delay={0.3} className="mt-10 border-l-2 border-ember pl-6">
            <p className="font-serif text-2xl italic leading-snug text-fg/90 md:text-3xl">
              “Two people at the counter, twelve tables, a queue to the door. Somebody shouted ‘table four, two chai’ and nobody heard it.”
            </p>
          </Reveal>
        </div>
        <div className="space-y-6 text-lg leading-relaxed text-muted">
          <Reveal as="p">
            Most restaurant software is made for places with a manager, a POS vendor and an IT person. The cafés we kept eating at had none of those. They had a
            phone, a laminated menu, and a notepad that lived in someone’s back pocket. On a slow Tuesday that works. On a Saturday it does not.
          </Reveal>
          <Reveal as="p" delay={0.05}>
            We watched the same things go wrong again and again. Orders written down and never reaching the kitchen. A guest waving for ten minutes before anyone
            looked up. The bill added in someone’s head and the GST sorted out at month end. A price change that meant reprinting forty menus.
          </Reveal>
          <Reveal as="p" delay={0.1}>
            None of that needs a tablet on every table or an app guests have to install. It needs a sticker, a web page that loads fast on a cheap Android phone,
            and a counter screen that makes a noise.
          </Reveal>
          <Reveal as="p" delay={0.15}>
            So that is where Restaurant OS started. A QR on the table opens the menu. Orders land on the counter board with a chime and are read aloud. Staff
            move them with one tap. The bill does its own CGST and SGST and opens UPI with the amount filled in.
          </Reveal>
          <Reveal as="p" delay={0.18}>
            Getting the order right is only half of it. The other half is the next visit. Most restaurants never find out who their regulars are, so we added
            customer profiles, WhatsApp offers that guests have to opt into themselves, and feedback that shows every guest the same Google review link. The
            guest stays in control the whole way. The demo restaurant on this site, Saffron Lane Café, is the kind of place we built it for.
          </Reveal>
          <Reveal as="p" delay={0.22} className="text-fg">
            We are a small team in India. We charge a flat monthly price and never take a cut of your orders or payments, because a tool for the counter should not
            be paid for by the counter.
          </Reveal>
        </div>
      </div>
    </section>
  );
}
