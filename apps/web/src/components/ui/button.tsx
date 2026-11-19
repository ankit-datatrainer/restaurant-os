'use client';

import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'dark' | 'light' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg' | 'xl' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  href?: string;
  external?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const base =
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-[transform,background-color,color,box-shadow,border-color] duration-300 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50';

const variants: Record<Variant, string> = {
  primary: 'bg-ember text-white hover:bg-ember-2 shadow-[0_8px_24px_-10px_rgba(255,92,42,0.7)] hover:shadow-glow',
  secondary: 'bg-fg text-bg hover:opacity-90',
  outline: 'border border-line/15 bg-transparent text-fg hover:bg-fg/5',
  ghost: 'bg-transparent text-fg hover:bg-fg/5',
  dark: 'bg-ink text-paper hover:bg-ink-3',
  light: 'bg-paper text-ink hover:bg-white',
  danger: 'bg-rose text-white hover:bg-[#c73b40]',
  success: 'bg-mint text-white hover:bg-[#27a26b]',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-4 text-[13px]',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-[15px]',
  xl: 'h-14 px-8 text-base',
  icon: 'h-11 w-11 p-0',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading, href, external, leftIcon, rightIcon, children, disabled, ...props },
  ref,
) {
  const classes = cn(base, variants[variant], sizes[size], className);
  const content = (
    <>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </>
  );
  if (href) {
    if (external) {
      return (
        <a href={href} target="_blank" rel="noreferrer" className={classes}>
          {content}
        </a>
      );
    }
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }
  return (
    <button ref={ref} className={classes} disabled={disabled || loading} {...props}>
      {content}
    </button>
  );
});
