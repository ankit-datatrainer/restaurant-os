'use client';

import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { DiningTable, Restaurant } from '@restaurant-os/shared';
import { Spinner } from '@/components/ui';
import { cn } from '@/lib/utils';
import { EASE_OUT, springBouncy } from '@/lib/motion';

/**
 * Branded first-load screen. Shows the restaurant initial (or logo) in an ember
 * circle, then the name and table, then fades into the menu.
 */
export function Splash({ visible, restaurant, table }: { visible: boolean; restaurant: Restaurant | null; table: DiningTable | null }) {
  const reduce = useReducedMotion();
  const initial = restaurant ? restaurant.name.trim().charAt(0).toUpperCase() : null;
  const tableLine = table ? (table.area ? `${table.label} · ${table.area}` : table.label) : null;

  // Stay mounted for the fade, then unmount on a plain timer. The layer stops catching taps the
  // moment it starts hiding, so a stalled animation (background tab, slow phone) can never leave an
  // invisible full-screen overlay that swallows the guest's first tap.
  const [mounted, setMounted] = React.useState(visible);
  React.useEffect(() => {
    if (visible) {
      setMounted(true);
      return;
    }
    const t = window.setTimeout(() => setMounted(false), reduce ? 50 : 550);
    return () => window.clearTimeout(t);
  }, [visible, reduce]);

  if (!mounted) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-[90] flex flex-col items-center justify-center bg-paper px-6 text-ink transition-[opacity,transform] ease-out',
        reduce ? 'duration-0' : 'duration-500',
        visible ? 'opacity-100' : 'pointer-events-none scale-[1.03] opacity-0',
      )}
      aria-live="polite"
      aria-busy={!restaurant}
      aria-hidden={!visible}
    >
      <motion.div className="relative" initial={reduce ? false : { scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={springBouncy}>
        {!reduce && <span className="absolute inset-0 animate-pulse-ring rounded-full bg-ember/30" aria-hidden />}
        <div className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-ember text-white shadow-glow">
          {restaurant?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={restaurant.logo_url} alt="" className="h-full w-full object-cover" />
          ) : initial ? (
            <span className="font-display text-5xl font-bold leading-none">{initial}</span>
          ) : (
            <Spinner className="h-7 w-7 text-white" />
          )}
        </div>
      </motion.div>

      <div className="mt-7 flex min-h-[72px] flex-col items-center text-center">
        <AnimatePresence>
          {restaurant && (
            <motion.div
              key="meta"
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE_OUT }}
            >
              <p className="font-display text-2xl font-bold tracking-tight">{restaurant.name}</p>
              {tableLine && <p className="mt-1.5 font-mono text-xs uppercase tracking-[0.18em] text-muted">{tableLine}</p>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <p className="eyebrow absolute bottom-10">Powered by Restaurant OS</p>
    </div>
  );
}
