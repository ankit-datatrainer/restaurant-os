'use client';

import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { springSoft } from '@/lib/motion';

export interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface Pending extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

/**
 * `const { confirm, dialog } = useConfirm();` then `if (await confirm({ title: '…' })) …`
 * Render `{dialog}` once in the component tree.
 */
export function useConfirm() {
  const [pending, setPending] = React.useState<Pending | null>(null);

  const confirm = React.useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...opts, resolve });
      }),
    [],
  );

  const close = React.useCallback(
    (ok: boolean) => {
      setPending((p) => {
        p?.resolve(ok);
        return null;
      });
    },
    [],
  );

  const dialog = <ConfirmDialog pending={pending} onClose={close} />;
  return { confirm, dialog };
}

function ConfirmDialog({ pending, onClose }: { pending: Pending | null; onClose: (ok: boolean) => void }) {
  const reduce = useReducedMotion();
  const confirmRef = React.useRef<HTMLButtonElement>(null);
  const titleId = React.useId();

  React.useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(false);
    };
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => confirmRef.current?.focus(), 40);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
    };
  }, [pending, onClose]);

  return (
    <AnimatePresence>
      {pending && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center p-4 sm:items-center" role="presentation">
          <motion.button
            type="button"
            aria-label="Cancel"
            className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => onClose(false)}
          />
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative w-full max-w-sm rounded-3xl bg-surface p-6 text-fg shadow-lift"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            transition={springSoft}
          >
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                  pending.danger ? 'bg-rose-soft text-rose' : 'bg-ember-soft text-ember',
                )}
                aria-hidden
              >
                <AlertTriangle className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0">
                <h2 id={titleId} className="font-display text-lg font-semibold leading-tight">
                  {pending.title}
                </h2>
                {pending.description && <div className="mt-1.5 text-sm text-muted">{pending.description}</div>}
              </div>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => onClose(false)}>
                {pending.cancelLabel ?? 'Cancel'}
              </Button>
              <Button ref={confirmRef} variant={pending.danger ? 'danger' : 'primary'} onClick={() => onClose(true)}>
                {pending.confirmLabel ?? 'Confirm'}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
