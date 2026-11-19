'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { EASE_OUT } from '@/lib/motion';

/**
 * Re-mounts on every route change inside the marketing group, giving each page a soft entrance.
 * Only opacity + a 12px rise; the transform is cleared once the animation lands so pinned
 * ScrollTrigger scenes further down the page are unaffected.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}
