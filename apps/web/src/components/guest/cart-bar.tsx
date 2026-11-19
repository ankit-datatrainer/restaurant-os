'use client';

import * as React from 'react';
import { AnimatePresence, motion, useAnimate, useReducedMotion } from 'framer-motion';
import { ArrowRight, ShoppingBag } from 'lucide-react';
import { cn, formatINR } from '@/lib/utils';
import { EASE_OUT, springSoft } from '@/lib/motion';
import { useCartBump } from './cart-bump';
import { HI_SAFE, useLang } from './i18n';

/**
 * Floating order bar pinned above the safe area. Springs in when the first item
 * is added and pulses whenever something else lands in the cart.
 */
export function CartBar({
  count,
  subtotal,
  onOpen,
  cta,
}: {
  count: number;
  subtotal: number;
  onOpen: () => void;
  /** Button text on the right ("Add to order" while adding dishes to an open order). Defaults to "View order". */
  cta?: string;
}) {
  const reduce = useReducedMotion();
  const { t, uiLang } = useLang();
  const label = cta ?? t('View order');
  const itemsText = t(count === 1 ? '{n} item' : '{n} items', { n: count });
  const bump = useCartBump((s) => s.n);
  const [scope, animate] = useAnimate();
  const visible = count > 0;

  React.useEffect(() => {
    if (!visible || reduce || bump === 0 || !scope.current) return;
    void animate(scope.current, { scale: [1, 1.035, 1] }, { duration: 0.42, ease: EASE_OUT });
  }, [bump, visible, reduce, animate, scope]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40">
      <div className="mx-auto w-full max-w-[560px] px-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))]">
        <AnimatePresence>
          {visible && (
            <motion.div
              key="cart-bar"
              ref={scope}
              initial={reduce ? false : { y: 96, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { y: 96, opacity: 0, transition: { duration: 0.25 } }}
              transition={springSoft}
            >
              <button
                type="button"
                onClick={onOpen}
                className="pointer-events-auto flex h-14 w-full items-center justify-between rounded-2xl bg-ink pl-4 pr-3 text-paper shadow-lift transition-transform duration-300 ease-out active:scale-[0.985]"
                aria-label={`${label}: ${itemsText}, ${formatINR(subtotal)}`}
                lang={uiLang}
              >
                <span className="flex items-center gap-3">
                  <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-paper/10">
                    <ShoppingBag className="h-[18px] w-[18px]" aria-hidden />
                    <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-ember px-1 font-mono text-[11px] font-semibold tnum">
                      {count}
                    </span>
                  </span>
                  <span className="flex flex-col items-start leading-tight">
                    <span className={cn('font-mono text-[11px] uppercase tracking-[0.14em] text-paper/60', HI_SAFE, '[&:lang(hi)]:text-[12px]')}>{itemsText}</span>
                    <span className="font-display text-[17px] font-bold tnum">{formatINR(subtotal)}</span>
                  </span>
                </span>
                <span className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-xl bg-ember px-4 text-sm font-semibold">
                  {label}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
