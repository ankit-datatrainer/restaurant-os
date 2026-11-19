'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, MessageCircle, QrCode, Sparkles, Users, Volume2 } from 'lucide-react';
import { Reveal } from '@/components/ui';
import { EASE_OUT } from '@/lib/motion';
import { SectionHeading } from '../section-heading';

interface Row {
  problem: string;
  action: string;
  result: string;
  icon: React.ReactNode;
}

const ROWS: Row[] = [
  {
    problem: 'Waiters are busy taking orders',
    action: 'Guests order themselves from a QR on the table',
    result: 'Less routine ordering work for your team',
    icon: <QrCode className="h-4 w-4" />,
  },
  {
    problem: 'Orders get delayed or misheard',
    action: 'Orders go straight to the dashboard with a chime',
    result: 'Fewer manual handoffs',
    icon: <Volume2 className="h-4 w-4" />,
  },
  {
    problem: 'Guests wait with no updates',
    action: 'Live order status, your story video and games',
    result: 'A more engaging wait',
    icon: <Sparkles className="h-4 w-4" />,
  },
  {
    problem: 'You don’t know who visited',
    action: 'Customer profiles with order history',
    result: 'Retention opportunities',
    icon: <Users className="h-4 w-4" />,
  },
  {
    problem: 'Guests forget to come back',
    action: 'WhatsApp offers, only to guests who opted in',
    result: 'A reason to return',
    icon: <MessageCircle className="h-4 w-4" />,
  },
];

function Connector({ delay }: { delay: number }) {
  const reduce = useReducedMotion();
  return (
    <span className="relative hidden h-px w-12 shrink-0 overflow-hidden bg-paper/10 lg:block" aria-hidden>
      <motion.span
        className="absolute inset-y-0 left-0 w-full origin-left bg-gradient-to-r from-ember/0 via-ember to-ember/0"
        initial={reduce ? false : { scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true, margin: '-10% 0px' }}
        transition={{ duration: 0.9, delay, ease: EASE_OUT }}
      />
    </span>
  );
}

/** Problem → what Restaurant OS does → result, five rows. */
export function OwnerChanges({ index = '01' }: { index?: string }) {
  return (
    <section id="owner" className="relative scroll-mt-20 py-24 md:py-32">
      <div aria-hidden className="pointer-events-none absolute -left-40 top-1/3 h-[480px] w-[480px] rounded-full bg-ember/[0.06] blur-[150px]" />
      <div className="container-x relative">
        <SectionHeading
          index={index}
          eyebrow="What changes for the owner"
          title="Five things that go wrong on a busy floor. What changes."
          lede="Plain cause and effect: the problem you already know, what Restaurant OS does about it, and what you get."
        />

        <div className="mt-14 hidden grid-cols-[3rem_1fr_1.15fr_1fr] gap-6 border-b border-paper/10 pb-4 font-mono text-2xs uppercase tracking-[0.16em] text-muted lg:grid">
          <span aria-hidden />
          <span>The problem</span>
          <span className="text-ember">What Restaurant OS does</span>
          <span>The result</span>
        </div>

        <ol className="mt-8 grid gap-3 lg:mt-0 lg:gap-0">
          {ROWS.map((r, i) => (
            <Reveal
              as="li"
              key={r.problem}
              delay={0.06 * i}
              className="group relative grid gap-4 rounded-3xl border border-paper/10 bg-ink-2/50 p-5 transition-colors duration-500 hover:bg-ember/[0.03] lg:grid-cols-[3rem_1fr_1.15fr_1fr] lg:items-center lg:gap-6 lg:rounded-none lg:border-x-0 lg:border-t-0 lg:bg-transparent lg:px-0 lg:py-7"
            >
              <span className="font-mono text-xs text-muted transition-colors duration-300 group-hover:text-ember">0{i + 1}</span>

              <div className="flex items-start gap-3">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-rose" aria-hidden />
                <p className="text-base leading-snug text-fg/60">
                  <span className="mb-1 block font-mono text-2xs uppercase tracking-[0.16em] text-muted lg:hidden">The problem</span>
                  {r.problem}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ember/15 text-ember transition-colors duration-300 group-hover:bg-ember group-hover:text-white">
                  {r.icon}
                </span>
                <p className="min-w-0 flex-1 text-base font-medium leading-snug text-fg">
                  <span className="mb-1 block font-mono text-2xs uppercase tracking-[0.16em] text-ember lg:hidden">What Restaurant OS does</span>
                  {r.action}
                </p>
                <Connector delay={0.2 + 0.06 * i} />
              </div>

              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-mint/15 text-mint" aria-hidden>
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
                <p className="font-display text-lg font-semibold leading-snug">
                  <span className="mb-1 block font-mono text-2xs font-normal uppercase tracking-[0.16em] text-muted lg:hidden">The result</span>
                  {r.result}
                </p>
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
