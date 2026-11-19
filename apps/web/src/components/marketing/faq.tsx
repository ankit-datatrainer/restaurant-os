'use client';

import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { Reveal } from '@/components/ui';
import { cn } from '@/lib/utils';
import { EASE_OUT } from '@/lib/motion';
import type { FaqItem } from './faq-data';
import { SectionHeading } from './section-heading';

function Item({ item, open, onToggle, index }: { item: FaqItem; open: boolean; onToggle: () => void; index: number }) {
  const id = React.useId();
  const reduce = useReducedMotion();
  return (
    <Reveal as="li" delay={0.05 * index} className="border-b border-line/10">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={onToggle}
          className="group flex w-full items-start justify-between gap-6 py-6 text-left"
        >
          <span className={cn('font-display text-lg font-semibold leading-snug transition-colors md:text-xl', open ? 'text-fg' : 'text-fg/85 group-hover:text-fg')}>
            {item.q}
          </span>
          <span
            className={cn(
              'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors duration-300',
              open ? 'border-ember bg-ember text-white' : 'border-line/20 text-fg/70 group-hover:border-line/40',
            )}
            aria-hidden
          >
            <motion.span animate={{ rotate: open ? 45 : 0 }} transition={{ duration: reduce ? 0 : 0.35, ease: EASE_OUT }} className="flex">
              <Plus className="h-4 w-4" />
            </motion.span>
          </span>
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            key="answer"
            className="overflow-hidden"
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.45, ease: EASE_OUT }}
          >
            <p className="max-w-2xl pb-7 pr-10 text-base leading-relaxed text-muted">{item.a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </Reveal>
  );
}

export function FAQ({
  items,
  index = '07',
  eyebrow = 'Questions',
  title = 'Things people ask before switching.',
  lede,
  className,
}: {
  items: FaqItem[];
  index?: string;
  eyebrow?: string;
  title?: string;
  lede?: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = React.useState<number | null>(0);
  return (
    <section className={cn('py-24 md:py-32', className)}>
      <div className="container-x grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
        <SectionHeading index={index} eyebrow={eyebrow} title={title} lede={lede} className="lg:sticky lg:top-32 lg:self-start" />
        <ul className="border-t border-line/10">
          {items.map((it, i) => (
            <Item key={it.q} item={it} index={i} open={open === i} onToggle={() => setOpen(open === i ? null : i)} />
          ))}
        </ul>
      </div>
    </section>
  );
}
