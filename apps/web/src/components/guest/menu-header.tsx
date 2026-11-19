'use client';

import * as React from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ClipboardList, Search, X } from 'lucide-react';
import type { DiningTable, Restaurant } from '@restaurant-os/shared';
import { Toggle, VegMark } from '@/components/ui';
import { cn, tableDisplay } from '@/lib/utils';
import { EASE_OUT } from '@/lib/motion';
import { useLang } from './i18n';

/** "EN / हिं" switch. Compact on screen, with a 44px-tall hit area. */
function LangSwitch() {
  const { lang, setLang, t } = useLang();
  const hindi = lang === 'hi';
  return (
    <button
      type="button"
      onClick={() => setLang(hindi ? 'en' : 'hi')}
      aria-label={hindi ? t('Show the menu in English') : t('Show the menu in Hindi')}
      title={t('Menu language')}
      className="relative inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-line/15 bg-surface px-2 text-[11.5px] font-semibold text-fg/55 transition-colors before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-[''] hover:border-line/30"
    >
      <span className={cn('transition-colors', !hindi && 'text-ember')}>EN</span>
      <span aria-hidden className="text-fg/25">/</span>
      <span lang="hi" className={cn('transition-colors', hindi && 'text-ember')}>
        हिं
      </span>
    </button>
  );
}

export function MenuHeader({
  restaurant,
  table,
  code,
  search,
  onSearch,
  vegOnly,
  onVegOnly,
  ordersCount,
}: {
  restaurant: Restaurant;
  table: DiningTable;
  code: string;
  search: string;
  onSearch: (q: string) => void;
  vegOnly: boolean;
  onVegOnly: (v: boolean) => void;
  ordersCount: number;
}) {
  const reduce = useReducedMotion();
  const { available, t, uiLang } = useLang();
  const [open, setOpen] = React.useState(false);

  const close = () => {
    setOpen(false);
    onSearch('');
  };

  const fade = {
    initial: reduce ? false : { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    exit: reduce ? undefined : { opacity: 0, y: -6 },
    transition: { duration: 0.22, ease: EASE_OUT },
  } as const;

  return (
    <div className="gutter relative flex h-[68px] items-center">
      <AnimatePresence mode="wait" initial={false}>
        {open ? (
          <motion.div key="search" className="flex w-full items-center gap-2" {...fade}>
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <input
                autoFocus
                type="search"
                inputMode="search"
                enterKeyHint="search"
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') close();
                }}
                placeholder={t('Search dishes')}
                aria-label={t('Search the menu')}
                lang={uiLang}
                className="h-11 w-full rounded-full border border-line/15 bg-surface pl-10 pr-4 text-[15px] text-fg placeholder:text-muted/70 focus:border-ember focus:shadow-ring focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={close}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fg transition hover:bg-fg/5"
              aria-label={t('Close search')}
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </motion.div>
        ) : (
          <motion.div key="title" className="flex w-full items-center gap-1" {...fade}>
            <div className="min-w-0 flex-1 pr-1">
              <h1 className="truncate font-display text-[16px] font-bold leading-tight tracking-tight">{restaurant.name}</h1>
              <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
                <p className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-sunk px-2 py-0.5 text-[11.5px] font-medium text-fg/75">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mint" aria-hidden />
                  <span className="truncate">{tableDisplay(table)}</span>
                </p>
                {available && <LangSwitch />}
              </div>
            </div>

            <Link
              href={`/t/${code}/orders`}
              className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fg transition hover:bg-fg/5"
              aria-label={ordersCount > 0 ? t('My orders, {n} placed', { n: ordersCount }) : t('My orders')}
              prefetch
            >
              <ClipboardList className="h-[22px] w-[22px]" strokeWidth={1.75} aria-hidden />
              {ordersCount > 0 && (
                <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-ember px-1 font-mono text-[10px] font-semibold text-white tnum">
                  {ordersCount > 9 ? '9+' : ordersCount}
                </span>
              )}
            </Link>

            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fg transition hover:bg-fg/5"
              aria-label={t('Search the menu')}
            >
              <Search className="h-[22px] w-[22px]" strokeWidth={1.75} aria-hidden />
            </button>

            <div
              title={t('Veg only')}
              className={cn(
                'flex h-11 shrink-0 items-center gap-1.5 rounded-full border py-0 pl-2 pr-1.5 transition-colors',
                vegOnly ? 'border-veg/30 bg-mint-soft' : 'border-line/10 bg-surface',
              )}
            >
              <VegMark isVeg size={12} />
              <span className="sr-only" lang={uiLang}>
                {t('Show vegetarian dishes only')}
              </span>
              <Toggle size="sm" checked={vegOnly} onChange={onVegOnly} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
