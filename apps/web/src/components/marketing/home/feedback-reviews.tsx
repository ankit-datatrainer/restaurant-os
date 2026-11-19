'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ExternalLink, Star } from 'lucide-react';
import { Reveal } from '@/components/ui';
import { cn } from '@/lib/utils';
import { EASE_OUT } from '@/lib/motion';
import { SectionHeading } from '../section-heading';

const RULES = [
  {
    title: 'Ask every guest',
    body: 'After the meal, every guest can rate it from 1 to 5 stars and add a comment. You read them all on the Feedback page, low scores included.',
  },
  {
    title: 'One link, whatever the score',
    body: 'Everyone who rates sees your Google review link, whether they gave five stars or two. Nobody is filtered out.',
  },
  {
    title: 'No gating, no rewards',
    body: 'We never steer unhappy guests away from Google and never offer anything in return for a review. Those are Google’s rules, and they keep your reviews worth reading.',
  },
];

/* Illustrative guest screens. */
const CARDS = [
  { rating: 5, comment: 'Best biryani on this street.', rotate: -7, x: '-88%', y: 22 },
  { rating: 3, comment: 'Food good, a bit slow tonight.', rotate: 0, x: '0%', y: 0 },
  { rating: 2, comment: 'Naan arrived cold.', rotate: 7, x: '88%', y: 22 },
];

function RatingCard({ rating, comment }: { rating: number; comment: string }) {
  return (
    <div className="w-[200px] rounded-[26px] bg-paper p-4 text-ink shadow-lift ring-1 ring-ink/5 sm:w-[216px]">
      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-ember">How was your meal?</p>
      <div className="mt-2 flex gap-0.5" aria-label={`${rating} out of 5 stars`}>
        {Array.from({ length: 5 }, (_, i) => (
          <Star key={i} className={cn('h-5 w-5', i < rating ? 'fill-saffron text-saffron' : 'text-ink/15')} strokeWidth={1.6} aria-hidden />
        ))}
      </div>
      <p className="mt-2 min-h-[2.5em] rounded-xl bg-paper-2 px-2.5 py-1.5 text-[11px] leading-snug text-ink/75">{comment}</p>
      <span className="mt-3 flex h-9 items-center justify-center gap-1.5 rounded-full bg-ink text-[11px] font-semibold text-paper">
        Review us on Google <ExternalLink className="h-3 w-3" aria-hidden />
      </span>
    </div>
  );
}

function NoGatingVisual() {
  const reduce = useReducedMotion();
  return (
    <div className="relative">
      {/* Desktop/tablet: fanned stack */}
      <div className="relative mx-auto hidden h-[340px] max-w-[620px] sm:block lg:scale-[0.85] xl:scale-100">
        {CARDS.map((c, i) => (
          <div key={c.rating} className="absolute left-1/2 top-6 -translate-x-1/2" style={{ zIndex: i === 1 ? 3 : 2 }}>
            <motion.div
              initial={reduce ? false : { x: '0%', y: 40, rotate: 0, opacity: 0 }}
              whileInView={{ x: c.x, y: c.y, rotate: c.rotate, opacity: 1 }}
              viewport={{ once: true, margin: '-15% 0px' }}
              transition={{ duration: 0.9, delay: 0.1 * i, ease: EASE_OUT }}
              whileHover={reduce ? undefined : { y: c.y - 10, rotate: c.rotate * 0.6 }}
            >
              <RatingCard rating={c.rating} comment={c.comment} />
            </motion.div>
          </div>
        ))}
      </div>
      {/* Phone: a simple row that scrolls inside its own box */}
      <ul className="no-scrollbar -mx-5 flex snap-x gap-3 overflow-x-auto px-5 pb-2 sm:hidden">
        {CARDS.map((c) => (
          <li key={c.rating} className="shrink-0 snap-center">
            <RatingCard rating={c.rating} comment={c.comment} />
          </li>
        ))}
      </ul>
      <p className="mt-4 text-center font-mono text-2xs uppercase tracking-[0.16em] text-muted">Three guests · three ratings · one link</p>
    </div>
  );
}

export function FeedbackReviews({ index = '05' }: { index?: string }) {
  return (
    <section id="feedback" className="relative scroll-mt-20 overflow-hidden py-24 md:py-32">
      <div aria-hidden className="pointer-events-none absolute right-[-10%] top-1/4 h-[480px] w-[480px] rounded-full bg-saffron/[0.07] blur-[150px]" />
      <div className="container-x relative grid gap-14 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:gap-16">
        <div>
          <SectionHeading
            index={index}
            eyebrow="Feedback and reviews"
            title="Feedback and reviews, done properly."
            lede="Ask everyone how the meal was. Show your Google review link to everyone who answers, not just the happy ones."
          />
          <ol className="mt-10 grid gap-5">
            {RULES.map((r, i) => (
              <Reveal as="li" key={r.title} delay={0.06 * i} className="flex gap-4 border-t border-paper/10 pt-5">
                <span className="font-mono text-xs text-ember">0{i + 1}</span>
                <div>
                  <p className="font-display text-lg font-semibold leading-tight">{r.title}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{r.body}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
        <Reveal delay={0.1}>
          <NoGatingVisual />
        </Reveal>
      </div>
    </section>
  );
}
