'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Bell, ChefHat, Eye, EyeOff, Receipt, Sparkles, Volume2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { demo } from '@/lib/utils';
import { Button, Input, Logo } from '@/components/ui';
import { EASE_OUT } from '@/lib/motion';

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/admin') || raw.startsWith('/admin/login')) return '/admin';
  return raw;
}

export function LoginScreen() {
  const { session, staff, signIn, error: authError } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const wantsDemo = params.get('demo') === '1';

  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const reduce = useReducedMotion();
  // A failure the provider hit before the redirect here (e.g. "not linked to a restaurant") must not vanish.
  const shownError = error ?? authError;

  React.useEffect(() => {
    if (wantsDemo) {
      setEmail(demo.adminEmail);
      setPassword(demo.adminPassword);
    }
  }, [wantsDemo]);

  // Already signed in → straight to the dashboard.
  React.useEffect(() => {
    if (session && staff) router.replace(next);
  }, [session, staff, router, next]);

  const useDemo = () => {
    setEmail(demo.adminEmail);
    setPassword(demo.adminPassword);
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      router.replace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Left: the form */}
      <div className="flex flex-col gutter py-8 sm:py-12">
        <Logo href="/" />
        <motion.div
          className="my-auto w-full max-w-md py-10"
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE_OUT }}
        >
          <p className="eyebrow">Staff sign in</p>
          <h1 className="mt-3 font-display text-display-sm font-semibold">Open the counter.</h1>
          <p className="mt-3 text-[15px] text-muted">Sign in with the email your restaurant owner added as staff. The dashboard stays open all day.</p>

          <form onSubmit={submit} className="mt-8 grid gap-4 rounded-3xl border border-line/10 bg-surface p-5 shadow-soft sm:p-6" noValidate>
            <Input
              label="Email"
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@restaurant.in"
              required
            />
            <Input
              id="staff-login-password"
              label="Password"
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              className="[&::-ms-reveal]:hidden"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              suffix={
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-controls="staff-login-password"
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="grid h-11 w-11 place-items-center rounded-xl text-muted transition hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ember"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
                </button>
              }
              required
            />
            <AnimatePresence>
              {shownError && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="rounded-xl bg-rose-soft px-3.5 py-2.5 text-sm font-medium text-[#a1282c]"
                  role="alert"
                >
                  {shownError}
                </motion.p>
              )}
            </AnimatePresence>
            <Button type="submit" size="lg" loading={busy} rightIcon={<ArrowRight className="h-4 w-4" />} className="mt-1 w-full">
              Sign in
            </Button>
            <button type="button" onClick={useDemo} className="inline-flex items-center justify-center gap-1.5 text-sm font-medium text-muted transition hover:text-fg">
              <Sparkles className="h-4 w-4 text-ember" aria-hidden /> Use demo account
            </button>
          </form>

          <p className="mt-6 text-xs text-muted">
            Demo restaurant: <span className="font-medium text-fg">Saffron Lane Café</span>. Anything you do there resets regularly.
          </p>
        </motion.div>
      </div>

      {/* Right: dark panel with a live-looking ticker */}
      <div className="relative hidden overflow-hidden bg-ink text-paper lg:flex lg:flex-col lg:justify-between lg:p-12 grain">
        <div
          className="pointer-events-none absolute -right-32 -top-32 h-[520px] w-[520px] rounded-full opacity-60 blur-3xl"
          style={{ background: 'radial-gradient(closest-side, rgba(255,92,42,0.45), transparent)' }}
          aria-hidden
        />
        <div className="relative">
          <p className="eyebrow text-paper/50">What the dashboard does</p>
          <h2 className="mt-3 max-w-md font-display text-display-sm font-semibold leading-tight">
            Every order lands here the second a guest taps <span className="font-serif italic text-ember">Place order</span>.
          </h2>
        </div>
        <Ticker />
        <ul className="relative grid grid-cols-3 gap-4 text-sm text-paper/70">
          <li className="flex items-start gap-2">
            <Volume2 className="mt-0.5 h-4 w-4 shrink-0 text-ember" aria-hidden />
            Chimes and reads each order aloud
          </li>
          <li className="flex items-start gap-2">
            <ChefHat className="mt-0.5 h-4 w-4 shrink-0 text-ember" aria-hidden />
            Kitchen board moves orders in one tap
          </li>
          <li className="flex items-start gap-2">
            <Receipt className="mt-0.5 h-4 w-4 shrink-0 text-ember" aria-hidden />
            GST bills and UPI reconciliation
          </li>
        </ul>
      </div>
    </div>
  );
}

const TICKER = [
  { icon: Bell, tone: 'text-mint', text: 'New order #ORD-1041 · Table 3 (Indoor Window) · ₹645 · 2 items' },
  { icon: ChefHat, tone: 'text-saffron', text: 'Kitchen started #ORD-1040 · Paneer Tikka, Butter Naan ×2' },
  { icon: Bell, tone: 'text-saffron', text: 'Table 6 (Terrace) is calling a waiter' },
  { icon: Receipt, tone: 'text-sky', text: '#ORD-1038 paid by UPI · ₹1,210 · bill shared on WhatsApp' },
  { icon: ChefHat, tone: 'text-mint', text: '#ORD-1039 marked ready · 9 min from order to pass' },
  { icon: Bell, tone: 'text-mint', text: 'New order #ORD-1042 · Table 1 (Indoor Window) · ₹869 · 3 items' },
];

function Ticker() {
  const [i, setI] = React.useState(0);
  const reduce = useReducedMotion();
  React.useEffect(() => {
    const id = window.setInterval(() => setI((v) => (v + 1) % TICKER.length), 2600);
    return () => window.clearInterval(id);
  }, []);
  const visible = [0, 1, 2].map((k) => TICKER[(i + k) % TICKER.length]!);
  return (
    <div className="relative my-10 space-y-2" aria-hidden>
      <AnimatePresence initial={false} mode="popLayout">
        {visible.map((row, k) => {
          const Icon = row.icon;
          return (
            <motion.div
              key={`${row.text}-${(i + k) % TICKER.length}`}
              layout={!reduce}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -14 }}
              animate={{ opacity: k === 0 ? 1 : 0.55 - k * 0.15, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.5, ease: EASE_OUT }}
              className="flex items-center gap-3 rounded-2xl border border-paper/10 bg-paper/5 px-4 py-3 font-mono text-[13px] tnum"
            >
              <Icon className={`h-4 w-4 shrink-0 ${row.tone}`} />
              <span className="truncate">{row.text}</span>
              {k === 0 && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-mint animate-pulse" />}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
