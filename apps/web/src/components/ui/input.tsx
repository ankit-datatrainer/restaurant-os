'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

const fieldBase =
  'w-full rounded-xl border border-line/15 bg-surface px-3.5 text-[15px] text-fg placeholder:text-muted/70 transition focus:border-ember focus:shadow-ring focus:outline-none disabled:opacity-60';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?: string;
  hint?: string;
  error?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, hint, error, prefix, suffix, id, ...props },
  ref,
) {
  const auto = React.useId();
  const inputId = id ?? auto;
  return (
    <div className="grid gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-[13px] font-semibold text-fg/80">
          {label}
        </label>
      )}
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-muted">{prefix}</span>}
        <input
          ref={ref}
          id={inputId}
          className={cn(fieldBase, 'h-11', prefix && 'pl-9', suffix && 'pr-12', error && 'border-rose focus:border-rose', className)}
          aria-invalid={error ? true : undefined}
          {...props}
        />
        {suffix && <div className="absolute inset-y-0 right-0 flex items-center">{suffix}</div>}
      </div>
      {error ? <p className="text-xs text-rose">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
});

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, label, hint, error, id, ...props },
  ref,
) {
  const auto = React.useId();
  const inputId = id ?? auto;
  return (
    <div className="grid gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-[13px] font-semibold text-fg/80">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={inputId}
        className={cn(fieldBase, 'min-h-[96px] resize-y py-2.5', error && 'border-rose', className)}
        aria-invalid={error ? true : undefined}
        {...props}
      />
      {error ? <p className="text-xs text-rose">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
});

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select({ className, label, hint, id, children, ...props }, ref) {
  const auto = React.useId();
  const inputId = id ?? auto;
  return (
    <div className="grid gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-[13px] font-semibold text-fg/80">
          {label}
        </label>
      )}
      <select ref={ref} id={inputId} className={cn(fieldBase, 'h-11 appearance-none pr-9', className)} {...props}>
        {children}
      </select>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
});

/** iOS-style switch */
export function Toggle({
  checked,
  onChange,
  label,
  description,
  id,
  size = 'md',
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: React.ReactNode;
  description?: React.ReactNode;
  id?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
}) {
  const auto = React.useId();
  const switchId = id ?? auto;
  const dims = size === 'sm' ? { w: 'w-9', h: 'h-5', knob: 'h-4 w-4', x: 'translate-x-4' } : { w: 'w-12', h: 'h-7', knob: 'h-6 w-6', x: 'translate-x-5' };
  return (
    <label htmlFor={switchId} className={cn('flex cursor-pointer select-none items-center justify-between gap-3', disabled && 'opacity-60')}>
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-[15px] font-medium">{label}</span>}
          {description && <span className="block text-xs text-muted">{description}</span>}
        </span>
      )}
      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex shrink-0 items-center rounded-full p-0.5 transition-colors duration-300',
          dims.w,
          dims.h,
          checked ? 'bg-mint' : 'bg-fg/20',
        )}
      >
        <span className={cn('block rounded-full bg-white shadow transition-transform duration-300 ease-spring', dims.knob, checked ? dims.x : 'translate-x-0')} />
      </button>
    </label>
  );
}
