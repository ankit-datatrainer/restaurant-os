'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Percent } from 'lucide-react';
import type { HappyHour, MenuCategory } from '@restaurant-os/shared';
import { WEEKDAY_SHORT, formatClock, windowOpen } from '@restaurant-os/shared';
import { cn } from '@/lib/utils';
import { EASE_OUT } from '@/lib/motion';
import { HI_SAFE, pick, useLang } from './i18n';

/**
 * Menu timing on the guest side: happy hours running right now and category serving windows.
 * Both mirror window_open() in SQL, so what the menu shows is what the server charges / accepts.
 */

/** A timestamp that ticks every `ms` so windows open and close while the menu sits on screen. */
export function useClock(ms = 30_000): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

/** Happy hours running at `at`, biggest discount first. */
export function runningHappyHours(hours: HappyHour[] | null | undefined, at: number = Date.now()): HappyHour[] {
  if (!hours || hours.length === 0) return [];
  const d = new Date(at);
  return hours.filter((h) => h.is_active && windowOpen(h.start_time, h.end_time, h.days, d)).sort((a, b) => b.percent - a.percent);
}

const coversCategory = (h: HappyHour, categoryId: string) => !h.category_ids || h.category_ids.length === 0 || h.category_ids.includes(categoryId);

/** The best running happy-hour percent for a category (0 when none applies). Same rule as the server: highest percent wins. */
export function happyHourPercent(running: HappyHour[], categoryId: string): number {
  let best = 0;
  for (const h of running) if (coversCategory(h, categoryId) && h.percent > best) best = h.percent;
  return best;
}

/** Is a menu category serving at `at`? (No window = all day.) */
export function categoryServing(c: Pick<MenuCategory, 'available_from' | 'available_until' | 'available_days'>, at: number = Date.now()): boolean {
  if (!c.available_from && !c.available_until && (!c.available_days || c.available_days.length === 0)) return true;
  return windowOpen(c.available_from, c.available_until, c.available_days, new Date(at));
}

/** "Mon, Tue" for ISO weekdays; empty when every day. */
export function weekdaysLabel(days: number[] | null | undefined): string {
  if (!days || days.length === 0 || days.length === 7) return '';
  return [...days]
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_SHORT[d - 1])
    .filter(Boolean)
    .join(', ');
}

/** "7:00 AM – 11:00 AM", "Sat, Sun · 7:00 AM – 11:00 AM" (English source string; translate the prefix with t()). */
export function servingWindowText(c: Pick<MenuCategory, 'available_from' | 'available_until' | 'available_days'>): string {
  const time = c.available_from && c.available_until ? `${formatClock(c.available_from)} – ${formatClock(c.available_until)}` : '';
  const days = weekdaysLabel(c.available_days);
  return [days, time].filter(Boolean).join(' · ');
}

/** What part of the menu a happy hour covers, in words. */
function scopeText(h: HappyHour, categories: Array<Pick<MenuCategory, 'id' | 'name' | 'name_hi'>>, lang: 'en' | 'hi', t: (k: string, p?: Record<string, string | number>) => string): string {
  if (!h.category_ids || h.category_ids.length === 0) return t('the whole menu');
  const names = h.category_ids
    .map((id) => categories.find((c) => c.id === id))
    .filter((c): c is Pick<MenuCategory, 'id' | 'name' | 'name_hi'> => Boolean(c))
    .map((c) => pick(lang, c.name, c.name_hi).text);
  if (names.length === 0) return t('selected dishes');
  if (names.length <= 2) return names.join(t(' and '));
  return t('{first} and {n} more', { first: names.slice(0, 2).join(', '), n: names.length - 2 });
}

/**
 * Strip under the menu header while a happy hour runs: "Chai-time · 20% off Beverages · until 6:00 PM".
 * Shows the biggest running offer; mentions any others in one line.
 */
export function HappyHourBanner({
  running,
  categories,
  className,
}: {
  running: HappyHour[];
  categories: Array<Pick<MenuCategory, 'id' | 'name' | 'name_hi'>>;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const { lang, t, uiLang } = useLang();
  const top = running[0];
  if (!top) return null;
  const others = running.length - 1;
  return (
    <motion.div
      className={cn('gutter', className)}
      initial={reduce ? false : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE_OUT }}
    >
      <div
        role="status"
        lang={uiLang}
        className="relative flex items-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-r from-ember to-saffron px-4 py-3 text-white shadow-[0_14px_30px_-18px_rgba(255,92,42,0.9)]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/20" aria-hidden>
          <Percent className="h-4 w-4" strokeWidth={2.75} />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[14px] font-bold">
            <span>{top.name}</span>
            <span className="mx-1.5 opacity-70" aria-hidden>
              ·
            </span>
            {t('{percent}% off {scope}', { percent: top.percent, scope: scopeText(top, categories, lang, t) })}
          </p>
          <p className={cn('mt-0.5 font-mono text-[11px] uppercase tracking-[0.12em] text-white/85', HI_SAFE)}>
            {t('until {time}', { time: formatClock(top.end_time) })}
            {others > 0 && <> · {t(others === 1 ? '+{n} more offer' : '+{n} more offers', { n: others })}</>}
            {' · '}
            {t('applied at checkout')}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
