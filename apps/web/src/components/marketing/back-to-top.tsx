'use client';

import * as React from 'react';
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'framer-motion';
import { ArrowUp } from 'lucide-react';
import { getLenis } from './gsap';

export function BackToTop() {
  const { scrollY } = useScroll();
  const [show, setShow] = React.useState(false);

  useMotionValueEvent(scrollY, 'change', (y) => {
    setShow(y > window.innerHeight * 1.2);
  });

  const toTop = () => {
    const lenis = getLenis();
    if (lenis) lenis.scrollTo(0);
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.button
          type="button"
          onClick={toTop}
          aria-label="Back to top"
          className="glass-dark fixed bottom-5 right-5 z-[50] inline-flex h-12 w-12 items-center justify-center rounded-full border border-paper/15 text-paper shadow-lift transition-colors hover:border-ember hover:text-ember md:bottom-8 md:right-8"
          initial={{ opacity: 0, y: 16, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.9 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          <ArrowUp className="h-5 w-5" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
