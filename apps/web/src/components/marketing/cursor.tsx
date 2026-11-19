'use client';

import * as React from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

const INTERACTIVE = 'a, button, [role="button"], input, textarea, select, label, summary, [data-cursor]';

/**
 * Dot + lagging ring cursor. Desktop pointers only (pointer: fine), skipped under reduced motion.
 * Position is driven by motion values → transform-only updates, no React re-render per move.
 */
export function Cursor() {
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const rx = useSpring(x, { stiffness: 320, damping: 30, mass: 0.45 });
  const ry = useSpring(y, { stiffness: 320, damping: 30, mass: 0.45 });
  const [enabled, setEnabled] = React.useState(false);
  const [visible, setVisible] = React.useState(false);
  const [hover, setHover] = React.useState(false);
  const [pressed, setPressed] = React.useState(false);

  React.useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)').matches;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!fine || reduce) return;

    let shown = false;
    let hovering = false;

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      x.set(e.clientX);
      y.set(e.clientY);
      if (!shown) {
        shown = true;
        setEnabled(true);
        setVisible(true);
        document.body.dataset.customCursor = 'on';
      }
    };
    const onOver = (e: PointerEvent) => {
      const target = e.target as Element | null;
      const next = Boolean(target?.closest(INTERACTIVE));
      if (next !== hovering) {
        hovering = next;
        setHover(next);
      }
    };
    const onOut = (e: MouseEvent) => {
      if (!e.relatedTarget) setVisible(false);
    };
    const onEnter = () => {
      if (shown) setVisible(true);
    };
    const onDown = () => setPressed(true);
    const onUp = () => setPressed(false);

    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerover', onOver, { passive: true });
    document.addEventListener('mouseout', onOut);
    document.addEventListener('mouseover', onEnter);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('mouseout', onOut);
      document.removeEventListener('mouseover', onEnter);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      delete document.body.dataset.customCursor;
    };
  }, [x, y]);

  if (!enabled) return null;

  return (
    <>
      <style>{`body[data-custom-cursor="on"], body[data-custom-cursor="on"] * { cursor: none !important; }`}</style>
      <motion.div
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[100] h-2 w-2 rounded-full bg-ember"
        style={{ x, y, translateX: '-50%', translateY: '-50%' }}
        animate={{ opacity: visible ? 1 : 0, scale: hover ? 0.5 : pressed ? 0.7 : 1 }}
        transition={{ duration: 0.2 }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[100] h-9 w-9 rounded-full border border-paper mix-blend-difference"
        style={{ x: rx, y: ry, translateX: '-50%', translateY: '-50%' }}
        animate={{
          opacity: visible ? (hover ? 0.9 : 0.55) : 0,
          scale: hover ? 1.7 : pressed ? 0.8 : 1,
          backgroundColor: hover ? 'rgba(247,244,238,0.18)' : 'rgba(247,244,238,0)',
        }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      />
    </>
  );
}
