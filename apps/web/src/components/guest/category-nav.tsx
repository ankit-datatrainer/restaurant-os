'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { MenuCategory } from '@restaurant-os/shared';
import { cn } from '@/lib/utils';
import { spring } from '@/lib/motion';
import { pick, useLang } from './i18n';

/**
 * Horizontal chip row. The active pill slides between chips; the row scrolls so
 * the active chip stays in view while the guest scrolls the menu.
 */
export function CategoryNav({
  categories,
  activeId,
  onSelect,
  sectionId,
}: {
  categories: Array<MenuCategory & { count: number }>;
  activeId: string | null;
  onSelect: (id: string) => void;
  sectionId: (categoryId: string) => string;
}) {
  const reduce = useReducedMotion();
  const { lang, t } = useLang();
  const rowRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const row = rowRef.current;
    if (!row || !activeId) return;
    const chip = row.querySelector<HTMLElement>(`[data-chip="${activeId}"]`);
    if (!chip) return;
    const target = chip.offsetLeft - row.clientWidth / 2 + chip.offsetWidth / 2;
    row.scrollTo({ left: Math.max(0, target), behavior: reduce ? 'auto' : 'smooth' });
  }, [activeId, reduce]);

  return (
    <nav aria-label={t('Menu categories')} className="relative">
      <div ref={rowRef} className="no-scrollbar gutter flex gap-1 overflow-x-auto pb-2 pt-0.5">
        {categories.map((c) => {
          const active = c.id === activeId;
          const name = pick(lang, c.name, c.name_hi);
          return (
            <button
              key={c.id}
              type="button"
              aria-current={active ? 'true' : undefined}
              aria-label={`${name.text}, ${t(c.count === 1 ? '{n} dish' : '{n} dishes', { n: c.count })}`}
              lang={name.lang}
              data-chip={c.id}
              data-section={sectionId(c.id)}
              onClick={() => onSelect(c.id)}
              className="relative flex h-11 shrink-0 items-center py-1 focus-visible:outline-none"
            >
              <span
                className={cn(
                  'relative z-10 inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold transition-colors duration-300',
                  active ? 'text-paper' : 'text-fg/70 hover:text-fg',
                )}
              >
                {name.text}
                <span className={cn('font-mono text-[11px] tnum', active ? 'text-paper/60' : 'text-muted')}>{c.count}</span>
              </span>
              {active && (
                <motion.span
                  layoutId="guest-category-pill"
                  className="absolute inset-x-0 inset-y-1 rounded-full bg-ink"
                  transition={reduce ? { duration: 0 } : spring}
                  aria-hidden
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
