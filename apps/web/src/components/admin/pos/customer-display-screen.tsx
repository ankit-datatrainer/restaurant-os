'use client';

import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { Check, Maximize, Minimize } from 'lucide-react';
import { cn, formatINR, initials } from '@/lib/utils';
import { EASE_OUT } from '@/lib/motion';
import { displaySupported, postToDisplay, subscribeToDisplay, type CustomerDisplayMessage } from '../customer-display';

type Screen = Exclude<CustomerDisplayMessage, { type: 'hello' }>;

const BRAND_KEY = 'ros-display-brand';
const PAID_MS = 8_000;

interface Brand {
  name: string;
  logoUrl: string | null;
}

function readBrand(): Brand | null {
  try {
    const raw = window.localStorage.getItem(BRAND_KEY);
    return raw ? (JSON.parse(raw) as Brand) : null;
  } catch {
    return null;
  }
}

function saveBrand(b: Brand) {
  try {
    window.localStorage.setItem(BRAND_KEY, JSON.stringify(b));
  } catch {
    // Private mode: the name simply is not remembered after a reload.
  }
}

function money(n: number) {
  return n < 0 ? `−${formatINR(-n)}` : formatINR(n);
}

/** Guest-facing second screen: welcome → bill with UPI QR → thank you. Listens only, never fetches. */
export function CustomerDisplayScreen() {
  const reduce = useReducedMotion();
  const [screen, setScreen] = React.useState<Screen>({ type: 'idle' });
  const [brand, setBrand] = React.useState<Brand | null>(null);
  const [supported, setSupported] = React.useState(true);
  const [fullscreen, setFullscreen] = React.useState(false);
  const [clock, setClock] = React.useState<string>('');
  const paidTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    setBrand(readBrand());
    if (!displaySupported()) {
      setSupported(false);
      return;
    }
    const off = subscribeToDisplay((msg) => {
      if (msg.type === 'hello') return;
      if (paidTimer.current) {
        window.clearTimeout(paidTimer.current);
        paidTimer.current = null;
      }
      if (msg.type === 'idle' && msg.restaurantName) {
        const b = { name: msg.restaurantName, logoUrl: msg.logoUrl ?? null };
        setBrand(b);
        saveBrand(b);
      }
      if (msg.type === 'bill' && msg.restaurantName) {
        setBrand((prev) => {
          const b = { name: msg.restaurantName, logoUrl: prev?.logoUrl ?? null };
          saveBrand(b);
          return b;
        });
      }
      if (msg.type === 'paid') {
        paidTimer.current = window.setTimeout(() => setScreen({ type: 'idle' }), PAID_MS);
      }
      setScreen(msg);
    });
    // Ask any open counter tab who we are, so the welcome screen carries the restaurant's name.
    postToDisplay({ type: 'hello' });
    return () => {
      off();
      if (paidTimer.current) window.clearTimeout(paidTimer.current);
    };
  }, []);

  React.useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }));
    tick();
    const id = window.setInterval(tick, 15_000);
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('fullscreenchange', onFs);
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // Some browsers refuse without a direct gesture or inside an iframe; nothing else to do.
    }
  };

  const name = (screen.type === 'idle' && screen.restaurantName) || brand?.name || '';
  const logo = (screen.type === 'idle' && screen.logoUrl) || brand?.logoUrl || null;
  const fade = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -12 } };

  return (
    <div className="theme-dark fixed inset-0 overflow-hidden bg-ink text-paper">
      <div className="pointer-events-none absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-ember/15 blur-[120px]" aria-hidden />
      <div className="pointer-events-none absolute -bottom-48 -right-40 h-[560px] w-[560px] rounded-full bg-saffron/10 blur-[140px]" aria-hidden />

      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-6 py-5 md:px-10">
        <span className="tnum font-mono text-sm text-paper/50">{clock}</span>
        {!fullscreen && (
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-paper/15 px-4 text-xs font-medium text-paper/60 transition hover:border-paper/30 hover:text-paper"
          >
            <Maximize className="h-4 w-4" aria-hidden /> Full screen
          </button>
        )}
        {fullscreen && (
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-paper/20 transition hover:text-paper/70"
            aria-label="Exit full screen"
          >
            <Minimize className="h-4 w-4" />
          </button>
        )}
      </header>

      <main className="relative flex h-full w-full items-center justify-center px-6 py-20 md:px-10">
        <AnimatePresence mode="wait">
          {screen.type === 'idle' && (
            <motion.section key="idle" {...fade} transition={{ duration: 0.6, ease: EASE_OUT }} className="flex flex-col items-center text-center">
              {logo ? (
                // Plain <img>: the logo can be any URL the restaurant set.
                <img src={logo} alt="" className="mb-8 h-24 w-24 rounded-3xl object-cover shadow-lift md:h-32 md:w-32" />
              ) : name ? (
                <span className="mb-8 flex h-24 w-24 items-center justify-center rounded-3xl bg-paper/10 font-display text-4xl font-semibold text-paper md:h-28 md:w-28" aria-hidden>
                  {initials(name)}
                </span>
              ) : null}
              <p className="font-serif text-3xl italic text-paper/70 md:text-5xl">Welcome</p>
              {name && <h1 className="mt-3 max-w-4xl font-display text-5xl font-semibold leading-[1.02] tracking-tight md:text-7xl">{name}</h1>}
              {!supported && (
                <p className="mt-10 max-w-md text-sm text-paper/60">This browser cannot receive bills from the counter. Open this page in Chrome, Edge or Firefox on the counter computer.</p>
              )}
            </motion.section>
          )}

          {screen.type === 'bill' && (
            <motion.section
              key="bill"
              {...fade}
              transition={{ duration: 0.5, ease: EASE_OUT }}
              className="grid h-full max-h-[820px] w-full max-w-6xl gap-8 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:gap-12"
            >
              <div className="flex min-h-0 flex-col">
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-paper/50">{screen.restaurantName}</p>
                <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight md:text-4xl">{screen.billLabel}</h1>
                <ul className="no-scrollbar mt-6 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                  {screen.lines.map((l, i) => (
                    <li key={`${l.name}-${i}`} className="flex items-baseline gap-4 border-b border-paper/10 pb-3 text-lg md:text-xl">
                      <span className="tnum w-10 shrink-0 font-mono text-paper/50">{l.qty}×</span>
                      <span className="min-w-0 flex-1">{l.name}</span>
                      <span className="tnum shrink-0 font-mono">{formatINR(l.amount)}</span>
                    </li>
                  ))}
                </ul>
                {screen.breakdown && screen.breakdown.length > 0 && (
                  <dl className="mt-4 space-y-1.5 text-base text-paper/70">
                    {screen.breakdown.map((r) => (
                      <div key={r.label} className="flex justify-between gap-4">
                        <dt>{r.label}</dt>
                        <dd className={cn('tnum font-mono', r.amount < 0 && 'text-mint')}>{money(r.amount)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>

              <div className="flex flex-col items-center justify-center rounded-[32px] border border-paper/10 bg-paper/[0.04] p-6 text-center md:p-10">
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-paper/50">Amount to pay</p>
                <p className="tnum mt-2 font-display text-6xl font-semibold tracking-tight md:text-7xl">{formatINR(screen.total)}</p>
                {screen.upiLink ? (
                  <>
                    <div className="mt-8 rounded-3xl bg-white p-4 shadow-lift">
                      <QRCodeSVG value={screen.upiLink} size={240} level="M" bgColor="#ffffff" fgColor="#0C0D10" />
                    </div>
                    <p className="mt-5 text-lg font-medium">Scan with any UPI app</p>
                    <p className="mt-1 text-sm text-paper/50">Google Pay · PhonePe · Paytm · BHIM</p>
                  </>
                ) : (
                  <p className="mt-8 text-lg text-paper/70">Please pay at the counter.</p>
                )}
              </div>
            </motion.section>
          )}

          {screen.type === 'paid' && (
            <motion.section key="paid" {...fade} transition={{ duration: 0.6, ease: EASE_OUT }} className="flex flex-col items-center text-center">
              <div className="relative mb-10 flex h-36 w-36 items-center justify-center">
                {!reduce && (
                  <motion.span
                    className="absolute inset-0 rounded-full border-2 border-mint/50"
                    initial={{ scale: 0.8, opacity: 0.8 }}
                    animate={{ scale: 1.5, opacity: 0 }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
                    aria-hidden
                  />
                )}
                <motion.span
                  className="flex h-36 w-36 items-center justify-center rounded-full bg-mint text-ink"
                  initial={reduce ? false : { scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 220, damping: 18 }}
                  aria-hidden
                >
                  <Check className="h-16 w-16" strokeWidth={2.5} />
                </motion.span>
              </div>
              <p className="font-serif text-5xl italic md:text-7xl">Thank you</p>
              <p className="tnum mt-4 font-mono text-xl text-paper/70">{formatINR(screen.total)} paid</p>
              {name && <p className="mt-8 text-lg text-paper/50">See you again at {name}.</p>}
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      {screen.type === 'idle' && (
        <p className="pointer-events-none absolute inset-x-0 bottom-6 px-6 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-paper/30">
          Customer display · shows bills sent from the counter in this browser
        </p>
      )}
    </div>
  );
}
