'use client';

import * as React from 'react';
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion';
import { Check, Clock } from 'lucide-react';
import { Reveal } from '@/components/ui';
import { cn } from '@/lib/utils';
import { SectionHeading } from '../section-heading';

const PHASES = [
  {
    n: 'Now',
    status: 'live' as const,
    title: 'Ordering and guests',
    when: 'Available',
    items: [
      'Table QR ordering, with cart and live order status',
      'Kitchen board with chime and spoken orders',
      'Waiter calls, acknowledged on the guest’s phone',
      'Add dishes to an open order',
      'KOT printing through the browser',
      'Hindi menu alongside English, with an EN / हिं switch',
      'Menu serving windows, such as breakfast till 11 AM',
      'Ludo, tic-tac-toe, memory and a reaction game while guests wait',
    ],
  },
  {
    n: 'Now',
    status: 'live' as const,
    title: 'POS, billing and the floor',
    when: 'Available',
    items: [
      'Counter POS for dine-in and takeaway orders',
      'Live floor view of every table, move and merge tables',
      'One bill for a whole table',
      'Split payment across cash, UPI, card and gift card',
      'Tips, manager-only discounts and refunds with a reason',
      'Numbered GST receipts with CGST / SGST and HSN / SAC codes',
      'Customer-facing display with a UPI QR for the exact amount',
      'Daily cash close with expected vs counted cash and variance',
    ],
  },
  {
    n: 'Now',
    status: 'live' as const,
    title: 'Guests coming back, and the back office',
    when: 'Available',
    items: [
      'Customer CRM: visits, spend, rating, segments, CSV export',
      'WhatsApp consent, with records and unsubscribe links',
      'Feedback with the restaurant’s Google review link',
      'Loyalty rewards that unlock every Nth visit',
      'Automated WhatsApp messages through Meta’s official Cloud API',
      'Advanced reports with period comparison and CSV export',
      'POS / webhook integration with signed events and a delivery log',
      'Table reservations, online booking page and walk-in waitlist',
      'Online takeaway and click and collect with scheduled pickup',
      'Coupons, happy hours and gift cards',
      'Inventory: recipes, automatic stock deduction, low-stock alerts, food cost',
      'Suppliers, purchase orders, waste log and stock counts',
      'Expenses, monthly budgets and profit & loss',
      'Staff invites by code, roles, clock in / out timesheets',
      'Activity log of refunds, discounts, cancellations, price and stock changes',
      'Full data export: JSON backup and orders CSV',
    ],
  },
  {
    n: 'Not yet',
    status: 'next' as const,
    title: 'Not built yet',
    when: 'Not available',
    items: [
      'Offline or local-network mode (Restaurant OS needs the internet today)',
      'Direct USB / ESC-POS printer drivers and cash drawer opening',
      'Multi-branch management: one menu and one dashboard across outlets',
      'Native POS connectors, built with each POS vendor’s partner API',
      'Online payment gateway with automatic UPI confirmation',
      'Delivery and rider management',
      'Scheduled email reports',
      'More languages: Tamil, Telugu, Bengali and others',
    ],
  },
];

const ICON = {
  live: <Check className="h-4 w-4" strokeWidth={3} />,
  next: <Clock className="h-4 w-4" />,
};

export function Roadmap() {
  const ref = React.useRef<HTMLOListElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 70%', 'end 70%'] });
  const smooth = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 });
  const scaleY = useTransform(reduce ? scrollYProgress : smooth, (v) => (reduce ? 1 : v));

  return (
    <section id="roadmap" className="scroll-mt-24 border-t border-paper/10 py-20 md:py-28">
      <div className="container-x">
        <SectionHeading index="03" eyebrow="Roadmap" title="What’s live, and what isn’t." lede="“Now” is what the demo runs on today. “Not yet” is what people ask us about that is not built. None of it is sold as available until it ships." />
        <ol ref={ref} className="relative mt-14 border-l border-paper/10 pl-8 md:pl-12">
          <motion.span className="absolute -left-px top-0 h-full w-px origin-top bg-ember" style={{ scaleY }} aria-hidden />
          {PHASES.map((p, i) => (
            <Reveal as="li" key={p.title} delay={0.08 * i} className="relative pb-14 last:pb-0">
              <span
                className={cn(
                  'absolute -left-8 top-1 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border md:-left-12',
                  p.status === 'live' ? 'border-ember bg-ember text-white' : 'border-saffron bg-ink text-saffron',
                )}
                aria-hidden
              >
                {ICON[p.status]}
              </span>
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="font-mono text-xs uppercase tracking-[0.16em] text-ember">{p.n}</span>
                <span
                  className={cn(
                    'rounded-full px-2.5 py-0.5 font-mono text-2xs uppercase tracking-[0.14em]',
                    p.status === 'live' ? 'bg-mint/15 text-mint' : 'bg-saffron/15 text-saffron',
                  )}
                >
                  {p.when}
                </span>
              </div>
              <h3 className="mt-3 font-display text-2xl font-semibold leading-tight md:text-3xl">{p.title}</h3>
              <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
                {p.items.map((it) => (
                  <li key={it} className="flex items-start gap-2.5 text-sm text-fg/85">
                    <span className={cn('mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full', p.status === 'live' ? 'bg-mint' : 'bg-saffron')} aria-hidden />
                    {it}
                  </li>
                ))}
              </ul>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
