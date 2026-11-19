'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { backdropVariants, sheetVariants } from '@/lib/motion';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  /** Bottom sheet (mobile-first, default) or right-side drawer (desktop admin). */
  side?: 'bottom' | 'right';
  className?: string;
  /** Sticky footer (e.g. the "Add to order" button) */
  footer?: React.ReactNode;
}

/**
 * Accessible modal sheet: focus is trapped inside, Escape closes, body scroll locks.
 */
export function Sheet({ open, onClose, title, description, children, side = 'bottom', className, footer }: SheetProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  // Callers pass inline arrows; keep the latest one in a ref so the lock/trap/focus effect runs
  // once per open, not on every parent render (which would steal focus from a field mid-typing).
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  });

  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
      if (e.key === 'Tab' && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => {
      const panel = panelRef.current;
      // Never steal focus that is already inside the panel (an autoFocus field, for instance).
      if (!panel || panel.contains(document.activeElement)) return;
      const target =
        panel.querySelector<HTMLElement>('[data-autofocus]') ??
        panel.querySelector<HTMLElement>('input, textarea, select, button:not([aria-label="Close"])');
      target?.focus();
    }, 50);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
    };
  }, [open]);

  const isRight = side === 'right';

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80]" role="presentation">
          <motion.button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]"
            variants={backdropVariants}
            initial="hidden"
            animate="show"
            exit="exit"
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            className={cn(
              'absolute flex flex-col bg-surface text-fg shadow-lift',
              isRight
                ? 'right-0 top-0 h-full w-full max-w-md rounded-l-3xl'
                : 'inset-x-0 bottom-0 mx-auto max-h-[92dvh] w-full max-w-lg rounded-t-[28px]',
              className,
            )}
            variants={isRight ? rightVariants : sheetVariants}
            initial="hidden"
            animate="show"
            exit="exit"
            drag={isRight ? false : 'y'}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (!isRight && (info.offset.y > 120 || info.velocity.y > 800)) onClose();
            }}
          >
            {!isRight && (
              <div className="flex justify-center pt-3" aria-hidden>
                <span className="h-1.5 w-10 rounded-full bg-fg/15" />
              </div>
            )}
            <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-4">
              <div className="min-w-0">
                {title && (
                  <h2 id={titleId} className="font-display text-xl font-semibold leading-tight">
                    {title}
                  </h2>
                )}
                {description && <p className="mt-1 text-sm text-muted">{description}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="-mr-2 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-fg/5 hover:text-fg"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
            {footer && <div className="hairline-t bg-surface px-5 pb-safe pt-3">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

const rightVariants = {
  hidden: { x: '100%' },
  show: { x: 0, transition: { type: 'spring', stiffness: 380, damping: 38 } },
  exit: { x: '100%', transition: { duration: 0.25 } },
} as const;
