'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, ChevronRight, QrCode, Smartphone, UtensilsCrossed, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { EASE_OUT } from '@/lib/motion';
import { Button } from '@/components/ui';

function formatTrialEnd(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

/**
 * One-time welcome after sign-up. Opens when the dashboard is loaded with ?welcome=1
 * (the signup flow redirects to /admin?welcome=1), then strips the parameter and remembers
 * it was shown for this restaurant, so a reload or a shared link does not bring it back.
 *
 * Render it anywhere inside the admin (app) shell (it needs useAuth + useSearchParams),
 * wrapped in <Suspense fallback={null}>.
 */
export function WelcomeDialog() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { staff, restaurant } = useAuth();
  const [open, setOpen] = React.useState(false);
  const wantsWelcome = params.get('welcome') === '1';

  React.useEffect(() => {
    if (!wantsWelcome || !restaurant) return;
    const key = `ros-welcome-seen:${restaurant.id}`;
    let seen = false;
    try {
      seen = window.localStorage.getItem(key) === '1';
      window.localStorage.setItem(key, '1');
    } catch {
      /* storage blocked: the stripped URL still keeps it one-time for this visit */
    }
    const rest = new URLSearchParams(params.toString());
    rest.delete('welcome');
    const qs = rest.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
    if (!seen) setOpen(true);
  }, [wantsWelcome, restaurant, params, pathname, router]);

  const firstName = (staff?.display_name ?? '').trim().split(/\s+/)[0] ?? '';
  const trialEnd = formatTrialEnd(restaurant?.trial_ends_at ?? null);

  return (
    <WelcomeModal open={open} onClose={() => setOpen(false)} firstName={firstName} trialEnd={trialEnd} restaurantName={restaurant?.name ?? 'your restaurant'} />
  );
}

function WelcomeModal({
  open,
  onClose,
  firstName,
  trialEnd,
  restaurantName,
}: {
  open: boolean;
  onClose: () => void;
  firstName: string;
  trialEnd: string | null;
  restaurantName: string;
}) {
  const reduce = useReducedMotion();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const primaryRef = React.useRef<HTMLButtonElement>(null);
  const titleId = React.useId();
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  });

  React.useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
      if (e.key === 'Tab' && panelRef.current) {
        const f = panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
        if (f.length === 0) return;
        const first = f[0]!;
        const last = f[f.length - 1]!;
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
    const t = window.setTimeout(() => primaryRef.current?.focus(), 60);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
      previous?.focus?.();
    };
  }, [open]);

  const steps = [
    { href: '/admin/menu', icon: UtensilsCrossed, title: 'Check your menu', text: 'Fix names and prices, add photos, mark what’s sold out.' },
    { href: '/admin/tables', icon: QrCode, title: 'Print your table QR codes', text: 'One code per table. Download, print and stick them on.' },
    { href: '/admin/tables', icon: Smartphone, title: 'Place a test order', text: 'Scan a code with your phone and order. Watch it land here with a chime.' },
  ];

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-6" role="presentation">
          <motion.button
            type="button"
            aria-label="Close"
            tabIndex={-1}
            className="absolute inset-0 bg-ink/55 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative max-h-[92dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-[28px] bg-surface text-fg shadow-lift sm:rounded-[28px]"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 32, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.98 }}
            transition={{ duration: 0.45, ease: EASE_OUT }}
          >
            <div className="relative overflow-hidden bg-ink px-6 pb-7 pt-8 text-paper grain">
              <div
                className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full opacity-70 blur-3xl"
                style={{ background: 'radial-gradient(closest-side, rgba(255,92,42,0.5), transparent)' }}
                aria-hidden
              />
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="absolute right-3 top-3 grid h-10 w-10 place-items-center rounded-full text-paper/70 transition hover:bg-paper/10 hover:text-paper"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
              <p className="eyebrow relative text-paper/55">{restaurantName} is live</p>
              <h2 id={titleId} className="relative mt-2 pr-8 font-display text-2xl font-semibold leading-tight sm:text-[28px]">
                Welcome to Restaurant OS{firstName ? `, ${firstName}` : ''}!
              </h2>
              {trialEnd && (
                <p className="relative mt-2 text-sm text-paper/75">
                  Your free trial runs until <span className="font-semibold text-paper">{trialEnd}</span>. Every feature is switched on.
                </p>
              )}
            </div>

            <div className="px-6 pb-6 pt-5">
              <p className="text-sm font-semibold text-fg/80">Next, three quick things:</p>
              <ol className="mt-3 grid gap-2">
                {steps.map((s, i) => (
                  <li key={s.title}>
                    <Link
                      href={s.href}
                      onClick={onClose}
                      className="group flex items-center gap-3 rounded-2xl border border-line/10 p-3 transition hover:border-ember/40 hover:bg-ember-soft/40"
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sunk text-ember" aria-hidden>
                        <s.icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold">
                          <span className="tnum mr-1.5 font-mono text-xs text-muted">0{i + 1}</span>
                          {s.title}
                        </span>
                        <span className="block text-xs text-muted">{s.text}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-ember" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ol>

              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Link
                  href="/admin/menu"
                  onClick={onClose}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-line/15 px-5 text-sm font-semibold transition hover:bg-fg/5"
                >
                  Menu
                </Link>
                <Link
                  href="/admin/tables"
                  onClick={onClose}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-line/15 px-5 text-sm font-semibold transition hover:bg-fg/5"
                >
                  Tables &amp; QR
                </Link>
                <Button ref={primaryRef} onClick={onClose} rightIcon={<ArrowRight className="h-4 w-4" />}>
                  Let’s go
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
