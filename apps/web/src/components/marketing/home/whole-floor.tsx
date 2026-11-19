'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowUpRight, Boxes, CalendarClock, LayoutGrid, Receipt } from 'lucide-react';
import { Button, Reveal } from '@/components/ui';
import { cn } from '@/lib/utils';
import { FloorMock } from '../features/ops-mocks';
import { SectionHeading } from '../section-heading';

interface Module {
  href: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  plan: 'Every plan' | 'Growth+' | 'Premium';
}

const MODULES: Module[] = [
  {
    href: '/features#pos',
    icon: <LayoutGrid className="h-5 w-5" />,
    title: 'Counter POS and floor view',
    body: 'Ring up dine-in and takeaway at the counter. See every table’s state live. Move or merge tables.',
    plan: 'Every plan',
  },
  {
    href: '/features#billing',
    icon: <Receipt className="h-5 w-5" />,
    title: 'Billing and GST receipts',
    body: 'One bill per table, split across cash, UPI, card and gift card. Tips, refunds, numbered receipts, cash close.',
    plan: 'Every plan',
  },
  {
    href: '/features#bookings',
    icon: <CalendarClock className="h-5 w-5" />,
    title: 'Bookings and takeaway',
    body: 'Your own booking page, a walk-in waitlist and click-and-collect orders. Plus coupons, happy hours and gift cards.',
    plan: 'Growth+',
  },
  {
    href: '/features#inventory',
    icon: <Boxes className="h-5 w-5" />,
    title: 'Inventory and purchasing',
    body: 'Recipes deduct stock as the kitchen accepts orders. Low-stock alerts, food cost per dish, purchase orders.',
    plan: 'Premium',
  },
];

/** "Runs your whole floor": the POS / billing / back-office side of the product, kept to one compact section. */
export function WholeFloor({ index = '03' }: { index?: string }) {
  return (
    <section id="floor" className="relative scroll-mt-20 py-24 md:py-32">
      <div aria-hidden className="pointer-events-none absolute -right-40 top-10 h-[480px] w-[480px] rounded-full bg-saffron/[0.06] blur-[150px]" />
      <div className="container-x relative">
        <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
          <div>
            <SectionHeading
              index={index}
              eyebrow="Runs your whole floor"
              title="QR ordering, POS, billing and inventory in one."
              lede="The orders guests place at the table and the ones your staff ring up at the counter go to the same kitchen, the same bill and the same books. One login, no second system to keep in sync."
            />
            <Reveal delay={0.3} className="mt-8 flex flex-wrap gap-3">
              <Button href="/features#pos" variant="outline" size="lg" rightIcon={<ArrowUpRight className="h-4 w-4" aria-hidden />}>
                See the POS and billing
              </Button>
            </Reveal>
          </div>
          <Reveal className="relative flex justify-center lg:justify-end">
            <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-[340px] w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ember/[0.1] blur-[120px]" />
            <FloorMock className="relative" />
          </Reveal>
        </div>

        <ul className="mt-16 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {MODULES.map((m, i) => (
            <Reveal as="li" key={m.title} delay={0.06 * i} className="min-w-0">
              <Link
                href={m.href}
                className="group relative flex h-full flex-col rounded-3xl border border-paper/10 bg-ink-2/60 p-5 transition-[border-color,box-shadow] duration-500 hover:border-ember/40 hover:shadow-glow md:p-6"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ember/15 text-ember transition-colors duration-300 group-hover:bg-ember group-hover:text-white">
                    {m.icon}
                  </span>
                  <span
                    className={cn(
                      'rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em]',
                      m.plan === 'Premium' ? 'border-saffron/30 text-saffron' : m.plan === 'Growth+' ? 'border-paper/15 text-muted' : 'border-mint/30 text-mint',
                    )}
                  >
                    {m.plan}
                  </span>
                </div>
                <h3 className="mt-6 font-display text-lg font-semibold leading-tight">{m.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{m.body}</p>
                <ArrowUpRight className="mt-5 h-4 w-4 text-muted transition-[color,transform] duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ember" aria-hidden />
              </Link>
            </Reveal>
          ))}
        </ul>
        <Reveal as="p" delay={0.1} className="mt-6 max-w-3xl font-mono text-xs leading-relaxed text-muted">
          Cloud-based, so it needs an internet connection. Receipts and KOTs print through the browser, including to thermal printers set up on your computer or
          tablet; direct printer drivers and cash drawers are not built.
        </Reveal>
      </div>
    </section>
  );
}
