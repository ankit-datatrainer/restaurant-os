'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { BellOff, CheckCircle2, LinkIcon, RotateCw } from 'lucide-react';
import type { UnsubscribeInfo } from '@restaurant-os/shared';
import { Button, Logo, Skeleton } from '@/components/ui';
import { ApiRequestError, publicApi } from '@/lib/api';
import { EASE_OUT } from '@/lib/motion';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; info: UnsubscribeInfo }
  | { kind: 'done'; info: UnsubscribeInfo }
  | { kind: 'invalid' }
  | { kind: 'error'; message: string };

/** WhatsApp offers opt-out, reached from the link at the bottom of every offer message. */
export function UnsubscribeCard({ token }: { token: string }) {
  const reduce = useReducedMotion();
  const [state, setState] = React.useState<State>({ kind: 'loading' });
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const info = await publicApi.unsubscribeInfo(token);
      setState({ kind: 'ready', info });
    } catch (e) {
      if (e instanceof ApiRequestError && (e.status === 404 || e.status === 400)) setState({ kind: 'invalid' });
      else setState({ kind: 'error', message: e instanceof Error ? e.message : 'Something went wrong. Please try again.' });
    }
  }, [token]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const unsubscribe = async () => {
    if (busy || state.kind !== 'ready') return;
    setBusy(true);
    try {
      const info = await publicApi.unsubscribe(token);
      setState({ kind: 'done', info: { ...state.info, ...info } });
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 404) setState({ kind: 'invalid' });
      else setState({ kind: 'error', message: e instanceof Error ? e.message : 'Could not unsubscribe. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  // Enter-only animation: each state replaces the previous one immediately, so the content never
  // waits on an exit animation (which can stall in background tabs and leave the skeleton up).
  const swap = {
    initial: reduce ? false : { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduce ? 0 : 0.35, ease: EASE_OUT },
  } as const;

  return (
    <div className="w-full max-w-md">
      <div className="mb-8 flex justify-center">
        <Logo />
      </div>

      <section className="rounded-3xl border border-line/10 bg-surface p-6 shadow-soft sm:p-8" aria-live="polite" aria-busy={state.kind === 'loading'}>
          {state.kind === 'loading' && (
            <motion.div key="loading" {...swap} aria-label="Loading">
              <Skeleton className="h-12 w-12 rounded-2xl" />
              <Skeleton className="mt-5 h-7 w-4/5" />
              <Skeleton className="mt-3 h-4 w-3/5" />
              <Skeleton className="mt-7 h-12 w-full rounded-full" />
            </motion.div>
          )}

          {state.kind === 'ready' && state.info.subscribed && (
            <motion.div key="ask" {...swap}>
              <Icon tone="ember">
                <BellOff className="h-5 w-5" aria-hidden />
              </Icon>
              <h1 className="mt-5 font-display text-2xl font-bold leading-tight tracking-tight">Stop WhatsApp offers from {state.info.restaurant}?</h1>
              <p className="mt-2 text-[15px] text-muted">
                For <span className="font-mono font-semibold text-fg tnum">{state.info.phone}</span>. You can still order at {state.info.restaurant} as usual.
              </p>
              <Button size="lg" variant="dark" className="mt-7 w-full" onClick={unsubscribe} loading={busy}>
                Unsubscribe
              </Button>
            </motion.div>
          )}

          {state.kind === 'ready' && !state.info.subscribed && (
            <motion.div key="already" {...swap}>
              <Icon tone="mint">
                <CheckCircle2 className="h-5 w-5" aria-hidden />
              </Icon>
              <h1 className="mt-5 font-display text-2xl font-bold leading-tight tracking-tight">You are already unsubscribed</h1>
              <p className="mt-2 text-[15px] text-muted">
                {state.info.restaurant} will not send offers to <span className="font-mono font-semibold text-fg tnum">{state.info.phone}</span>. There is nothing
                else to do.
              </p>
            </motion.div>
          )}

          {state.kind === 'done' && (
            <motion.div key="done" {...swap}>
              <Icon tone="mint">
                <CheckCircle2 className="h-5 w-5" aria-hidden />
              </Icon>
              <h1 className="mt-5 font-display text-2xl font-bold leading-tight tracking-tight">Done. {state.info.restaurant} will not send you offers any more.</h1>
              <p className="mt-2 text-[15px] text-muted">
                You can still order at {state.info.restaurant} as usual.
              </p>
            </motion.div>
          )}

          {state.kind === 'invalid' && (
            <motion.div key="invalid" {...swap}>
              <Icon tone="neutral">
                <LinkIcon className="h-5 w-5" aria-hidden />
              </Icon>
              <h1 className="mt-5 font-display text-2xl font-bold leading-tight tracking-tight">This link is not valid or has expired.</h1>
              <p className="mt-2 text-[15px] text-muted">Check that you opened the whole link from the message, or ask the staff at the restaurant to stop offers for your number.</p>
            </motion.div>
          )}

          {state.kind === 'error' && (
            <motion.div key="error" {...swap}>
              <Icon tone="rose">
                <RotateCw className="h-5 w-5" aria-hidden />
              </Icon>
              <h1 className="mt-5 font-display text-2xl font-bold leading-tight tracking-tight">Something went wrong</h1>
              <p className="mt-2 text-[15px] text-muted">{state.message}</p>
              <Button size="lg" variant="outline" className="mt-7 w-full" onClick={() => void load()}>
                Try again
              </Button>
            </motion.div>
          )}
      </section>

      <p className="mt-6 text-center text-[13px] text-muted">
        <Link href="/privacy" className="inline-flex min-h-[44px] items-center font-semibold text-fg underline-offset-4 hover:underline">
          How we use your number
        </Link>
      </p>
    </div>
  );
}

const TONES = {
  ember: 'bg-ember-soft text-ember',
  mint: 'bg-mint-soft text-[#1b6f49]',
  rose: 'bg-rose-soft text-[#a1282c]',
  neutral: 'bg-sunk text-fg/70',
} as const;

function Icon({ tone, children }: { tone: keyof typeof TONES; children: React.ReactNode }) {
  return <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${TONES[tone]}`}>{children}</span>;
}
