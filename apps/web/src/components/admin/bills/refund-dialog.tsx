'use client';

import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { Button, Textarea } from '@/components/ui';
import { springSoft } from '@/lib/motion';

const MIN_REASON = 3;

/**
 * Confirm a bill refund with a required reason. Same look as the shared confirm dialog,
 * plus the reason field (the API rejects a refund without one).
 */
export function RefundDialog({
  open,
  title,
  description,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: React.ReactNode;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const reduce = useReducedMotion();
  const titleId = React.useId();
  const fieldRef = React.useRef<HTMLTextAreaElement>(null);
  const [reason, setReason] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  const valid = reason.trim().length >= MIN_REASON;
  const latest = React.useRef({ busy, onCancel });
  latest.current = { busy, onCancel };

  React.useEffect(() => {
    if (!open) return;
    setReason('');
    setTouched(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !latest.current.busy) latest.current.onCancel();
    };
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => fieldRef.current?.focus(), 40);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
    };
  }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid || busy) return;
    onConfirm(reason.trim());
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center p-4 sm:items-center print:hidden" role="presentation">
          <motion.button
            type="button"
            aria-label="Cancel"
            className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => !busy && onCancel()}
          />
          <motion.form
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onSubmit={submit}
            className="relative w-full max-w-sm rounded-3xl bg-surface p-6 text-fg shadow-lift"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            transition={springSoft}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-soft text-rose" aria-hidden>
                <AlertTriangle className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0">
                <h2 id={titleId} className="font-display text-lg font-semibold leading-tight">
                  {title}
                </h2>
                <div className="mt-1.5 text-sm text-muted">{description}</div>
              </div>
            </div>
            <div className="mt-5">
              <Textarea
                ref={fieldRef}
                label="Reason"
                value={reason}
                maxLength={300}
                onChange={(e) => setReason(e.target.value)}
                onBlur={() => setTouched(true)}
                placeholder="e.g. Guest was charged twice"
                className="min-h-[80px]"
                error={touched && !valid ? 'Write a short reason so the refund is on record.' : undefined}
              />
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
                Keep the bill
              </Button>
              <Button type="submit" variant="danger" loading={busy} disabled={!valid}>
                Mark refunded
              </Button>
            </div>
          </motion.form>
        </div>
      )}
    </AnimatePresence>
  );
}
