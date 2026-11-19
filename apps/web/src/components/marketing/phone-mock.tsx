'use client';

import * as React from 'react';
import { AnimatePresence, motion, useInView, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { EASE_OUT } from '@/lib/motion';
import { FeedbackScreen, KitchenScreen, MenuScreen, PayScreen, PlacedScreen, ScanScreen } from './phone-screens';

export type PhoneState = 'scan' | 'menu' | 'placed' | 'kitchen' | 'pay' | 'feedback';

export const HERO_SEQUENCE: PhoneState[] = ['scan', 'menu', 'placed', 'kitchen', 'feedback'];
export const HOW_SEQUENCE: PhoneState[] = ['scan', 'menu', 'kitchen', 'pay', 'feedback'];

export const PHONE_STATE_LABEL: Record<PhoneState, string> = {
  scan: 'Scanning the table QR',
  menu: 'Browsing the menu and adding a dish',
  placed: 'Order placed confirmation',
  kitchen: 'Counter board receiving a new order',
  pay: 'Itemised bill with UPI payment',
  feedback: 'Rating the meal, then the Google review link',
};

function Screen({ state }: { state: PhoneState }) {
  switch (state) {
    case 'scan':
      return <ScanScreen />;
    case 'menu':
      return <MenuScreen />;
    case 'placed':
      return <PlacedScreen />;
    case 'kitchen':
      return <KitchenScreen />;
    case 'pay':
      return <PayScreen />;
    case 'feedback':
      return <FeedbackScreen />;
  }
}

export interface PhoneMockProps {
  /** Controlled state. Omit to auto-cycle through `sequence`. */
  state?: PhoneState;
  sequence?: PhoneState[];
  /** ms between states when auto-cycling */
  interval?: number;
  onStateChange?: (state: PhoneState, index: number) => void;
  className?: string;
  /** Outer width in px; height follows a 9:19 ratio. */
  width?: number;
  /** Mark as decorative (hides from the accessibility tree). */
  decorative?: boolean;
}

/**
 * CSS/SVG-built phone. No raster images. Cycles through product states with AnimatePresence,
 * paused while off-screen so it never burns CPU in the background.
 */
export function PhoneMock({
  state,
  sequence = HERO_SEQUENCE,
  interval = 2600,
  onStateChange,
  className,
  width = 290,
  decorative = true,
}: PhoneMockProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: '0px 0px -10% 0px' });
  const reduce = useReducedMotion();
  const [i, setI] = React.useState(0);
  const controlled = state !== undefined;
  const current: PhoneState = controlled ? state : (sequence[i % sequence.length] ?? sequence[0] ?? 'scan');

  React.useEffect(() => {
    if (controlled || !inView) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') setI((v) => v + 1);
    }, interval);
    return () => window.clearInterval(id);
  }, [controlled, inView, interval]);

  const onChange = React.useRef(onStateChange);
  onChange.current = onStateChange;
  React.useEffect(() => {
    onChange.current?.(current, sequence.indexOf(current));
  }, [current, sequence]);

  return (
    <div
      ref={ref}
      className={cn('relative select-none', className)}
      style={{ width, aspectRatio: '9 / 19' }}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : PHONE_STATE_LABEL[current]}
      aria-hidden={decorative || undefined}
    >
      {/* chassis */}
      <div className="absolute inset-0 rounded-[48px] bg-ink-3 shadow-lift ring-1 ring-paper/10" />
      <div className="absolute inset-[3px] rounded-[45px] bg-ink ring-1 ring-ink-4" />
      {/* side buttons */}
      <span className="absolute -left-[2px] top-[17%] h-7 w-[3px] rounded-l-sm bg-ink-4" aria-hidden />
      <span className="absolute -left-[2px] top-[25%] h-11 w-[3px] rounded-l-sm bg-ink-4" aria-hidden />
      <span className="absolute -left-[2px] top-[34%] h-11 w-[3px] rounded-l-sm bg-ink-4" aria-hidden />
      <span className="absolute -right-[2px] top-[27%] h-16 w-[3px] rounded-r-sm bg-ink-4" aria-hidden />
      {/* screen */}
      <div className="absolute inset-[10px] overflow-hidden rounded-[39px] bg-paper text-ink">
        <AnimatePresence initial={false}>
          <motion.div
            key={current}
            className="absolute inset-0"
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: 36 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: -36 }}
            transition={{ duration: 0.5, ease: EASE_OUT }}
          >
            <Screen state={current} />
          </motion.div>
        </AnimatePresence>
        {/* dynamic island */}
        <span className="absolute left-1/2 top-[9px] z-20 h-[22px] w-[82px] -translate-x-1/2 rounded-full bg-ink" aria-hidden />
      </div>
      {/* glass reflection */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-[10px] rounded-[39px] bg-[linear-gradient(115deg,rgba(255,255,255,0.14)_0%,rgba(255,255,255,0)_32%)]"
      />
    </div>
  );
}
