'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/** Read-only value with a copy button. Used for the demo credentials and table link. */
export function CopyField({ label, value, className, mono = true }: { label: string; value: string; className?: string; mono?: boolean }) {
  const [copied, setCopied] = React.useState(false);
  const id = React.useId();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied`);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error('Could not copy. Select the text and copy it manually.');
    }
  };

  return (
    <div className={cn('grid gap-1.5', className)}>
      <label htmlFor={id} className="font-mono text-2xs uppercase tracking-[0.16em] text-muted">
        {label}
      </label>
      <div className="flex items-stretch overflow-hidden rounded-xl border border-paper/10 bg-ink">
        <input
          id={id}
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className={cn('min-w-0 flex-1 bg-transparent px-3.5 py-2.5 text-sm text-fg outline-none', mono && 'font-mono')}
          aria-label={label}
        />
        <button
          type="button"
          onClick={copy}
          aria-label={`Copy ${label.toLowerCase()}`}
          className="flex w-11 shrink-0 items-center justify-center border-l border-paper/10 text-muted transition-colors hover:bg-paper/5 hover:text-fg"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={copied ? 'ok' : 'copy'} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }} transition={{ duration: 0.18 }} className="flex">
              {copied ? <Check className="h-4 w-4 text-mint" /> : <Copy className="h-4 w-4" />}
            </motion.span>
          </AnimatePresence>
        </button>
      </div>
    </div>
  );
}
