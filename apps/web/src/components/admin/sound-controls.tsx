'use client';

import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Bell, Mic, MicOff, Settings2, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Toggle } from '@/components/ui';
import { useAdmin } from './admin-provider';

/**
 * Topbar sound cluster. Browsers refuse to play audio until the user clicks something,
 * so the "Start shift" pill stays until that first gesture.
 */
export function SoundControls({ compact = false }: { compact?: boolean }) {
  const { sound } = useAdmin();
  const [open, setOpen] = React.useState(false);
  const popRef = React.useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const start = async () => {
    const ok = await sound.start();
    if (ok) toast.success('Sound is on. You will hear every new order.');
    else toast.error('Your browser blocked audio. Check the tab is not muted and try again.');
  };

  if (!sound.unlocked) {
    return (
      <button
        type="button"
        onClick={() => void start()}
        className="relative inline-flex h-9 shrink-0 items-center gap-2 rounded-full bg-ember px-3.5 text-[13px] font-semibold text-white shadow-[0_8px_24px_-10px_rgba(255,92,42,0.7)] transition hover:bg-ember-2 active:scale-[0.97]"
      >
        <span className="relative flex h-2 w-2" aria-hidden>
          {!reduce && <span className="absolute inline-flex h-full w-full rounded-full bg-white/80 animate-pulse-ring" />}
          <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
        </span>
        <span className={cn(compact && 'hidden sm:inline')}>Start shift — enable sound</span>
        <span className={cn('sm:hidden', !compact && 'hidden')}>Start shift</span>
      </button>
    );
  }

  return (
    <div className="relative flex shrink-0 items-center gap-1" ref={popRef}>
      <button
        type="button"
        onClick={sound.test}
        className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-fg/80 transition hover:bg-fg/5 hover:text-fg"
        title="Play the new-order chime"
      >
        <Bell className="h-4 w-4" aria-hidden />
        <span className="hidden lg:inline">Test chime</span>
      </button>
      <button
        type="button"
        role="switch"
        aria-checked={sound.voice}
        onClick={() => sound.setVoice(!sound.voice)}
        className={cn(
          'inline-flex h-9 items-center gap-1.5 rounded-full px-3 font-mono text-2xs font-semibold uppercase tracking-[0.12em] transition',
          sound.voice ? 'bg-mint-soft text-[#1b6f49]' : 'bg-sunk text-muted',
        )}
        title="Read new orders aloud"
      >
        {sound.voice ? <Mic className="h-3.5 w-3.5" aria-hidden /> : <MicOff className="h-3.5 w-3.5" aria-hidden />}
        <span className="hidden sm:inline">Voice {sound.voice ? 'on' : 'off'}</span>
      </button>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn('inline-flex h-9 w-9 items-center justify-center rounded-full text-fg/70 transition hover:bg-fg/5 hover:text-fg', open && 'bg-fg/5 text-fg')}
        title="Sound options"
        aria-label="Sound options"
      >
        <Settings2 className="h-4 w-4" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Sound options"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="absolute right-0 top-11 z-50 w-72 rounded-2xl border border-line/10 bg-surface p-4 shadow-lift"
          >
            <p className="flex items-center gap-2 font-display text-[15px] font-semibold">
              <Volume2 className="h-4 w-4 text-ember" aria-hidden /> Sound options
            </p>
            <p className="mt-1 text-xs text-muted">Applies to this device only. Audio is unlocked for this tab.</p>
            <div className="mt-4 space-y-4">
              <Toggle size="sm" checked={sound.enabled} onChange={sound.setEnabled} label="Chime" description="A short chime for every order and call" />
              <Toggle size="sm" checked={sound.voice} onChange={sound.setVoice} label="Voice" description="Reads the order and table aloud" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
