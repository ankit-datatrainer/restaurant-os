'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, QrCode } from 'lucide-react';
import { Button, LogoMark } from '@/components/ui';
import { cn } from '@/lib/utils';
import { EASE_OUT } from '@/lib/motion';

const CODE_RE = /^[A-Z0-9]{3,12}$/;

/** Big single-field form: type the code printed under the table QR. */
export function EnterCodeForm() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [code, setCode] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  const [going, setGoing] = React.useState(false);
  const valid = CODE_RE.test(code);
  const showError = touched && code.length > 0 && !valid;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    setGoing(true);
    router.push(`/t/${code}`);
  };

  return (
    <motion.form
      onSubmit={submit}
      className="flex w-full flex-col items-center"
      initial={reduce ? false : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: EASE_OUT }}
    >
      <LogoMark size={44} />
      <p className="eyebrow mt-6">Restaurant OS</p>
      <h1 className="mt-2 text-center font-display text-3xl font-bold tracking-tight">Enter your table code</h1>
      <p className="mt-2 max-w-xs text-center text-[15px] text-muted">It is printed under the QR sticker on your table. Three to twelve letters or numbers.</p>

      <label htmlFor="table-code" className="sr-only">
        Table code
      </label>
      <input
        id="table-code"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))}
        onBlur={() => setTouched(true)}
        placeholder="DEMO1"
        autoCapitalize="characters"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        inputMode="text"
        enterKeyHint="go"
        maxLength={12}
        aria-invalid={showError || undefined}
        aria-describedby={showError ? 'table-code-error' : undefined}
        className={cn(
          'mt-8 h-20 w-full max-w-sm rounded-2xl border bg-surface text-center font-mono text-3xl font-semibold uppercase tracking-[0.3em] text-fg placeholder:text-muted/40 placeholder:tracking-[0.3em] focus:outline-none',
          showError ? 'border-rose shadow-[0_0_0_3px_rgba(229,72,77,0.2)]' : 'border-line/15 focus:border-ember focus:shadow-ring',
        )}
      />
      <p id="table-code-error" className={cn('mt-2 min-h-[20px] text-sm', showError ? 'text-rose' : 'text-transparent')} aria-live="polite">
        {showError ? 'Codes are 3 to 12 letters or numbers.' : '.'}
      </p>

      <Button type="submit" size="xl" className="mt-4 w-full max-w-sm" disabled={code.length === 0} loading={going} rightIcon={<ArrowRight className="h-4 w-4" aria-hidden />}>
        Open the menu
      </Button>

      <p className="mt-8 inline-flex items-center gap-2 text-sm text-muted">
        <QrCode className="h-4 w-4" aria-hidden />
        or scan the QR on your table
      </p>
    </motion.form>
  );
}
