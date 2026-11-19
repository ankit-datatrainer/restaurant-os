'use client';

import * as React from 'react';
import { Reveal, SplitWords } from '@/components/ui';
import { cn } from '@/lib/utils';

/**
 * Standard section opener: mono eyebrow with an index, split-word headline, optional lede.
 */
export function SectionHeading({
  index,
  eyebrow,
  title,
  lede,
  align = 'left',
  className,
  titleClassName,
  as = 'h2',
  children,
}: {
  index?: string;
  eyebrow: string;
  title: string;
  lede?: React.ReactNode;
  align?: 'left' | 'center';
  className?: string;
  titleClassName?: string;
  as?: 'h1' | 'h2' | 'h3';
  children?: React.ReactNode;
}) {
  const center = align === 'center';
  return (
    <div className={cn('max-w-3xl', center && 'mx-auto text-center', className)}>
      <Reveal as="p" className={cn('eyebrow flex items-center gap-3', center && 'justify-center')}>
        {index && <span className="text-ember">{index}</span>}
        {index && <span className="h-px w-6 bg-line/20" aria-hidden />}
        <span>{eyebrow}</span>
      </Reveal>
      <SplitWords
        as={as}
        text={title}
        className={cn('mt-5 text-display-md font-bold', center && 'justify-center', titleClassName)}
        stagger={0.035}
      />
      {lede && (
        <Reveal as="p" delay={0.2} className={cn('mt-5 text-base leading-relaxed text-muted md:text-lg', center && 'mx-auto', 'max-w-2xl')}>
          {lede}
        </Reveal>
      )}
      {children}
    </div>
  );
}
