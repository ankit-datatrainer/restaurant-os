'use client';

import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Clock, Plus } from 'lucide-react';
import type { MenuItem } from '@restaurant-os/shared';
import { DishImage, ItemBadgePill, VegMark } from '@/components/ui';
import { cn, formatINR } from '@/lib/utils';
import { springSoft } from '@/lib/motion';
import { HI_SAFE, dishDescription, dishName, useLang } from './i18n';
import { Stepper } from './stepper';

export function DishCard({
  item,
  qty,
  onAdd,
  onIncrement,
  onDecrement,
  onOpen,
  offPercent = 0,
  servingNote,
  blocked = false,
  readOnly = false,
}: {
  item: MenuItem;
  qty: number;
  /** ADD tapped (opens the sheet for customisable dishes). */
  onAdd: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
  /** Tap on the name or photo: show details. */
  onOpen: () => void;
  /** A happy hour running now takes this percent off at checkout (0 = none). */
  offPercent?: number;
  /** Serving window of the dish's category, e.g. "Available 7:00 AM – 11:00 AM" (already translated). */
  servingNote?: string | null;
  /** Outside its serving window: greyed out and cannot be added (the server would refuse it). */
  blocked?: boolean;
  /** Menu-only view: details open, nothing can be added. */
  readOnly?: boolean;
}) {
  const reduce = useReducedMotion();
  const { lang, t, uiLang } = useLang();
  const soldOut = !item.is_available;
  /** Shown but not orderable right now (sold out, or its category is not being served). */
  const inert = soldOut || blocked;
  const customisable = item.option_groups.length > 0;
  const name = dishName(lang, item);
  const description = dishDescription(lang, item);

  const details = (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <VegMark isVeg={item.is_veg} />
        {item.badges.map((b) => (
          <ItemBadgePill key={b} badge={b} lang={lang} />
        ))}
      </div>
      <h3 lang={name.lang} className={cn('mt-1.5 font-display text-[16px] font-semibold leading-snug tracking-tight', soldOut && 'text-muted')}>
        {name.text}
      </h3>
      {description && (
        <p lang={description.lang} className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-muted">
          {description.text}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <p className={cn('font-mono text-[15px] font-semibold tnum', inert ? 'text-muted' : 'text-fg')}>{formatINR(item.price)}</p>
        {offPercent > 0 && !inert && (
          <span
            className="inline-flex h-5 items-center rounded-md bg-ember px-1.5 font-mono text-[11px] font-semibold text-white tnum"
          >
            <span aria-hidden>−{offPercent}%</span>
            <span className="sr-only" lang={uiLang}>
              {' '}
              {t('{percent}% off right now, applied at checkout', { percent: offPercent })}
            </span>
          </span>
        )}
      </div>
      {servingNote && (
        <p lang={uiLang} className={cn('mt-1.5 inline-flex items-center gap-1.5 text-[12px] font-medium', blocked ? 'text-muted' : 'text-fg/70')}>
          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="min-w-0">{servingNote}</span>
        </p>
      )}
    </>
  );

  return (
    <article className={cn('flex gap-4 py-4', inert && 'opacity-70')} aria-label={name.text}>
      {inert ? (
        <div className="min-w-0 flex-1">{details}</div>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 rounded-xl text-left"
          aria-label={t('{name}, {price}. Show details', { name: name.text, price: formatINR(item.price) })}
          lang={uiLang}
        >
          {details}
        </button>
      )}

      <div className="relative w-28 shrink-0">
        {inert ? (
          <DishImage src={item.image_url} alt={name.text} isVeg={item.is_veg} sizes="112px" className="aspect-square w-full rounded-2xl grayscale" />
        ) : (
          <button type="button" onClick={onOpen} tabIndex={-1} aria-hidden className="group block w-full rounded-2xl">
            <DishImage src={item.image_url} alt="" isVeg={item.is_veg} sizes="112px" className="aspect-square w-full rounded-2xl" />
          </button>
        )}

        <div className={cn('absolute inset-x-0 -bottom-3 flex justify-center', readOnly && !inert && 'hidden')}>
          {inert ? (
            <span
              lang={uiLang}
              className={cn(
                'inline-flex h-8 items-center whitespace-nowrap rounded-lg bg-surface px-3 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted shadow-soft ring-1 ring-line/10',
                HI_SAFE,
              )}
            >
              {soldOut ? t('Sold out') : t('Later')}
            </span>
          ) : (
            <AnimatePresence initial={false} mode="popLayout">
              {qty > 0 ? (
                <motion.div
                  key="stepper"
                  initial={reduce ? false : { opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={reduce ? undefined : { opacity: 0, scale: 0.9 }}
                  transition={springSoft}
                >
                  <Stepper value={qty} onIncrement={onIncrement} onDecrement={onDecrement} label={name.text} />
                </motion.div>
              ) : (
                <motion.div
                  key="add"
                  initial={reduce ? false : { opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={reduce ? undefined : { opacity: 0, scale: 0.9 }}
                  transition={springSoft}
                >
                  <button
                    type="button"
                    onClick={onAdd}
                    lang={uiLang}
                    className={cn(
                      'relative inline-flex h-11 w-[104px] items-center justify-center rounded-xl border border-ember/25 bg-surface font-mono text-[13px] font-semibold uppercase tracking-[0.16em] text-ember shadow-soft transition-[transform,background-color] duration-300 ease-out hover:bg-ember-soft active:scale-95',
                      HI_SAFE,
                      '[&:lang(hi)]:text-[14px]',
                    )}
                    aria-label={customisable ? t('Add {name}, choose options', { name: name.text }) : t('Add {name}', { name: name.text })}
                  >
                    {t('Add')}
                    <Plus className="absolute right-1.5 top-1.5 h-3 w-3" strokeWidth={3} aria-hidden />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
        {customisable && !inert && !readOnly && (
          <p lang={uiLang} className={cn('mt-4 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-muted', HI_SAFE, '[&:lang(hi)]:text-[11px]')} aria-hidden>
            {t('customisable')}
          </p>
        )}
      </div>
    </article>
  );
}
