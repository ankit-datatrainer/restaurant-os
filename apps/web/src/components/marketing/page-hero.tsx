'use client';

import * as React from 'react';
import { Reveal } from '@/components/ui';
import { cn } from '@/lib/utils';
import { MaskWords, type MaskWord } from './mask-words';

/** Opener for the inner pages: eyebrow, big masked headline, lede and optional actions. */
export function PageHero({
  eyebrow,
  words,
  lede,
  children,
  className,
  align = 'left',
}: {
  eyebrow: string;
  words: MaskWord[];
  lede?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  align?: 'left' | 'center';
}) {
  const center = align === 'center';
  return (
    <section className={cn('grain relative isolate overflow-hidden pb-14 pt-32 md:pb-20 md:pt-44', className)}>
      <div aria-hidden className="pointer-events-none absolute -left-32 -top-32 h-[480px] w-[480px] rounded-full bg-ember/[0.14] blur-[150px]" />
      <div className={cn('container-x relative', center && 'text-center')}>
        <Reveal as="p" className={cn('eyebrow flex items-center gap-3 text-ember', center && 'justify-center')} y={12}>
          <span className="h-px w-6 bg-ember/60" aria-hidden />
          {eyebrow}
        </Reveal>
        <MaskWords as="h1" immediate delay={0.1} stagger={0.07} className={cn('mt-6 max-w-5xl text-display-lg font-bold', center && 'mx-auto justify-center')} words={words} />
        {lede && (
          <Reveal as="p" delay={0.45} className={cn('mt-7 max-w-2xl text-lg leading-relaxed text-muted md:text-xl', center && 'mx-auto')}>
            {lede}
          </Reveal>
        )}
        {children && (
          <Reveal delay={0.6} className={cn('mt-9 flex flex-wrap gap-3', center && 'justify-center')}>
            {children}
          </Reveal>
        )}
      </div>
    </section>
  );
}
