'use client';

import * as React from 'react';
import { ArrowDownRight } from 'lucide-react';
import { Reveal, scrollToId } from '@/components/ui';
import { cn } from '@/lib/utils';
import { SectionHeading } from '../section-heading';

interface IndexLink {
  id: string;
  label: string;
  plan?: 'Growth+' | 'Premium';
}

const GROUPS: Array<{ n: string; title: string; body: string; links: IndexLink[] }> = [
  {
    n: '01–03',
    title: 'Take the order',
    body: 'QR ordering at the table, a counter board that speaks, a kitchen screen.',
    links: [
      { id: 'guests', label: 'For guests' },
      { id: 'counter', label: 'For the counter' },
      { id: 'kitchen', label: 'Kitchen and waiters' },
    ],
  },
  {
    n: '04–05',
    title: 'Run the floor',
    body: 'Counter POS, live floor view, split payments, GST receipts, cash close.',
    links: [
      { id: 'pos', label: 'Counter POS and floor view' },
      { id: 'billing', label: 'Billing and receipts' },
    ],
  },
  {
    n: '06–09',
    title: 'Fill tables again',
    body: 'Bookings, takeaway, promotions, customer profiles, loyalty and WhatsApp.',
    links: [
      { id: 'bookings', label: 'Reservations and takeaway', plan: 'Growth+' },
      { id: 'promotions', label: 'Coupons, happy hours, gift cards', plan: 'Growth+' },
      { id: 'customers', label: 'Customers and offers', plan: 'Growth+' },
      { id: 'premium', label: 'Loyalty, reports, automation', plan: 'Premium' },
    ],
  },
  {
    n: '10–12',
    title: 'Back office',
    body: 'Stock and purchasing, expenses and P&L, staff, attendance and your data.',
    links: [
      { id: 'inventory', label: 'Inventory and purchasing', plan: 'Premium' },
      { id: 'accounts', label: 'Expenses, budgets, P&L', plan: 'Growth+' },
      { id: 'team', label: 'Team and your data' },
    ],
  },
];

/** Table of contents for the features page: four groups, each link scrolls to its section. */
export function ModuleIndex() {
  return (
    <section aria-labelledby="modules-title" className="border-t border-paper/10 py-16 md:py-24">
      <div className="container-x">
        <SectionHeading
          eyebrow="One system"
          title="QR ordering, POS, billing and inventory. One login."
          lede="Everything below runs on the same orders, tables and menu, so nothing is typed twice. Unmarked modules are in every plan."
        />
        <ol className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {GROUPS.map((g, i) => (
            <Reveal as="li" key={g.title} delay={0.06 * i} className="min-w-0">
              <div className="flex h-full flex-col rounded-3xl border border-paper/10 bg-ink-2/60 p-5 transition-colors duration-500 hover:border-paper/20 md:p-6">
                <p className="font-mono text-2xs uppercase tracking-[0.16em] text-ember">{g.n}</p>
                <h3 className="mt-3 font-display text-xl font-semibold leading-tight">{g.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{g.body}</p>
                <ul className="mt-5 grid gap-1 border-t border-paper/10 pt-3">
                  {g.links.map((l) => (
                    <li key={l.id}>
                      <a
                        href={`#${l.id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          scrollToId(l.id, -24);
                          history.replaceState(null, '', `#${l.id}`);
                        }}
                        className="group flex items-center gap-2 rounded-lg py-1.5 text-sm text-fg/80 transition-colors hover:text-fg"
                      >
                        <ArrowDownRight className="h-3.5 w-3.5 shrink-0 text-muted transition-colors group-hover:text-ember" aria-hidden />
                        <span className="min-w-0 flex-1">{l.label}</span>
                        {l.plan && (
                          <span
                            className={cn(
                              'shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em]',
                              l.plan === 'Premium' ? 'border-saffron/30 text-saffron' : 'border-paper/15 text-muted',
                            )}
                          >
                            {l.plan}
                          </span>
                        )}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
