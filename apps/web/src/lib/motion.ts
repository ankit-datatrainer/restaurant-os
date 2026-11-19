/**
 * Shared motion vocabulary (framer-motion). Keep animations on this grammar so the
 * marketing site, guest app and admin feel like one product.
 */
import type { Transition, Variants } from 'framer-motion';

export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;

export const spring: Transition = { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 };
export const springSoft: Transition = { type: 'spring', stiffness: 260, damping: 30 };
export const springBouncy: Transition = { type: 'spring', stiffness: 520, damping: 22 };

export const tween = (duration = 0.6, delay = 0): Transition => ({ duration, delay, ease: EASE_OUT });

/** Fade + rise, for sections and cards entering the viewport. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.7, delay: i * 0.08, ease: EASE_OUT } }),
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.6, ease: EASE_OUT } },
};

/** Parent that staggers its children (use with fadeUp children). */
export const stagger = (staggerChildren = 0.08, delayChildren = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren, delayChildren } },
});

/** Mask-reveal for headline words: wrap each word in an overflow-hidden span. */
export const wordReveal: Variants = {
  hidden: { y: '110%', rotate: 2 },
  show: (i: number = 0) => ({ y: 0, rotate: 0, transition: { duration: 0.9, delay: 0.05 * i, ease: EASE_OUT } }),
};

/** Bottom sheet */
export const sheetVariants: Variants = {
  hidden: { y: '100%' },
  show: { y: 0, transition: { type: 'spring', stiffness: 380, damping: 38 } },
  exit: { y: '100%', transition: { duration: 0.28, ease: EASE_IN_OUT } },
};

export const backdropVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.25 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

/** Scale-pop for new list items (orders arriving, cart lines). */
export const pop: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 8 },
  show: { opacity: 1, scale: 1, y: 0, transition: springSoft },
  exit: { opacity: 0, scale: 0.98, y: -6, transition: { duration: 0.2 } },
};

export const viewportOnce = { once: true, margin: '-10% 0px -10% 0px' } as const;
