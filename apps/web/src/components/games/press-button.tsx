'use client';

import * as React from 'react';
import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';
import { spring } from '@/lib/motion';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-ember text-white shadow-[0_10px_28px_-12px_rgba(255,92,42,0.75)] hover:bg-ember-2',
  secondary: 'bg-ink text-paper hover:bg-ink-3',
  outline: 'hairline bg-surface text-fg hover:bg-sunk',
  ghost: 'bg-transparent text-fg hover:bg-fg/5',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-4 text-[13px]',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-[15px]',
};

export interface PressButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: Variant;
  size?: Size;
  leftIcon?: React.ReactNode;
  children: React.ReactNode;
}

/** Spring-tap button for the games: squashes on press, lifts on hover. */
export const PressButton = React.forwardRef<HTMLButtonElement, PressButtonProps>(function PressButton(
  { className, variant = 'primary', size = 'md', leftIcon, children, disabled, type = 'button', ...props },
  ref,
) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      ref={ref}
      type={type}
      disabled={disabled}
      whileTap={reduce || disabled ? undefined : { scale: 0.94 }}
      whileHover={reduce || disabled ? undefined : { y: -1 }}
      transition={spring}
      className={cn(
        'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-colors duration-200 disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {leftIcon}
      {children}
    </motion.button>
  );
});
