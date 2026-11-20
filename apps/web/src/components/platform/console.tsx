'use client';

import * as React from 'react';
import { ArrowUpRight, Building2, Check, Copy, Eye, EyeOff, Inbox, LogOut, RefreshCw, ShieldAlert, ShieldCheck, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { ApiRequestError, platformApi } from '@/lib/api';
import { cn, timeAgo } from '@/lib/utils';
import { Button, Input, LogoMark, Spinner } from '@/components/ui';
import { useNow } from '@/components/admin/use-now';
import { errorMessage, usePlatformData } from './use-platform';
import { OverviewTiles } from './overview';
import { RestaurantsView } from './restaurants-view';
import { RestaurantSheet } from './restaurant-sheet';
import { LeadsView } from './leads-view';

type Gate =
  | { kind: 'checking' }
  | { kind: 'error'; message: string }
  | { kind: 'denied'; email: string | null }
  | { kind: 'ok'; email: string | null };

/** Restaurant OS console (/platform): for the SaaS team, gated by a row in public.platform_admins. */
export function PlatformConsole() {
  const { session, signOut } = useAuth();
  const token = session?.access_token ?? null;
  const userId = session?.user.id ?? null;
  const fallbackEmail = session?.user.email ?? null;
  const [gate, setGate] = React.useState<Gate>({ kind: 'checking' });
  const tokenRef = React.useRef(token);
  tokenRef.current = token;

  const check = React.useCallback(async () => {
    const t = tokenRef.current;
    if (!t) return;
    setGate({ kind: 'checking' });
    try {
      const me = await platformApi.me(t);
      setGate(me.admin ? { kind: 'ok', email: me.email ?? fallbackEmail } : { kind: 'denied', email: me.email ?? fallbackEmail });
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 403) setGate({ kind: 'denied', email: fallbackEmail });
      else if (e instanceof ApiRequestError && e.status === 401) {
        toast.error('Your session expired. Sign in again.');
        await signOut();
      } else setGate({ kind: 'error', message: errorMessage(e, 'Could not check console access.') });
    }
  }, [fallbackEmail, signOut]);

  // Re-check when the signed-in account changes (not on every silent token refresh).
  React.useEffect(() => {
    if (userId) void check();
    else setGate({ kind: 'checking' });
  }, [userId, check]);

  if (session === undefined) return <FullPageSpinner label="Loading" />;
  if (session === null) return <SignIn />;
  if (gate.kind === 'checking') return <FullPageSpinner label="Checking console access" />;
  if (gate.kind === 'error')
    return (
      <CenteredCard>
        <StateIcon tone="rose">
          <WifiOff className="h-5 w-5" />
        </StateIcon>
        <h1 className="mt-4 font-display text-xl font-semibold">Couldn&apos;t open the console</h1>
        <p className="mt-1.5 text-sm text-muted">{gate.message}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={() => void check()} leftIcon={<RefreshCw className="h-4 w-4" />}>
            Try again
          </Button>
          <Button variant="ghost" onClick={() => void signOut()} leftIcon={<LogOut className="h-4 w-4" />}>
            Sign out
          </Button>
        </div>
      </CenteredCard>
    );
  if (gate.kind === 'denied') return <NoAccess email={gate.email} onSignOut={() => void signOut()} onRetry={() => void check()} />;
  return <Console email={gate.email} token={token} onSignOut={() => void signOut()} onForbidden={() => setGate({ kind: 'denied', email: gate.email })} />;
}

/* ------------------------------------------------------------------ console */

type Tab = 'restaurants' | 'leads';

function Console({ email, token, onSignOut, onForbidden }: { email: string | null; token: string | null; onSignOut: () => void; onForbidden: () => void }) {
  const data = usePlatformData(token);
  const [tab, setTab] = React.useState<Tab>('restaurants');
  const [openId, setOpenId] = React.useState<string | null>(null);
  const now = useNow(30_000);

  // Access revoked while the page was open.
  React.useEffect(() => {
    if (data.error?.status === 403) onForbidden();
  }, [data.error, onForbidden]);

  const selected = openId ? data.restaurants?.find((r) => r.id === openId) ?? null : null;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-line/10 bg-bg/85 backdrop-blur supports-[backdrop-filter]:bg-bg/70">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <LogoMark size={30} />
            <div className="min-w-0">
              <p className="truncate font-display text-[15px] font-bold leading-tight tracking-tight md:text-base">Restaurant OS console</p>
              {email && <p className="truncate text-xs text-muted">{email}</p>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 md:gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void data.refresh()}
              disabled={data.refreshing}
              aria-label="Refresh"
              className="px-3"
              leftIcon={<RefreshCw className={cn('h-4 w-4', data.refreshing && 'animate-spin motion-reduce:animate-none')} />}
            >
              <span className="hidden md:inline">Refresh</span>
            </Button>
            <Button href="/" external variant="ghost" size="sm" className="hidden px-3 sm:inline-flex" rightIcon={<ArrowUpRight className="h-4 w-4" />}>
              Public site
            </Button>
            <Button variant="outline" size="sm" onClick={onSignOut} aria-label="Sign out" className="px-3" leftIcon={<LogOut className="h-4 w-4" />}>
              <span className="hidden md:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 pb-16 pt-6 md:gap-8 md:px-6 md:pt-8">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow mb-1.5">Platform</p>
            <h1 className="font-display text-2xl font-semibold leading-tight tracking-tight md:text-[28px]">Every restaurant on Restaurant OS</h1>
          </div>
          <p className="text-xs text-muted" aria-live="polite">
            {data.updatedAt ? `Updated ${timeAgo(new Date(data.updatedAt).toISOString(), now)} · refreshes every minute` : 'Loading…'}
            <a href="/" target="_blank" rel="noreferrer" className="ml-2 text-fg/70 underline-offset-2 hover:underline sm:hidden">
              Public site
            </a>
          </p>
        </div>

        {data.error && !data.overview ? (
          <div className="rounded-2xl border border-rose/25 bg-rose-soft/40 p-5">
            <p className="font-display text-lg font-semibold">The console data didn&apos;t load</p>
            <p className="mt-1 text-sm text-fg/80">{data.error.message}</p>
            <p className="mt-1 text-xs text-muted">
              If this is a new database, run migration <code className="font-mono">0007_saas_platform_notifications.sql</code> in the Supabase SQL editor first.
            </p>
            <Button className="mt-4" size="sm" onClick={() => void data.refresh()} loading={data.refreshing} leftIcon={<RefreshCw className="h-4 w-4" />}>
              Try again
            </Button>
          </div>
        ) : (
          <OverviewTiles overview={data.overview} />
        )}

        <div className="grid gap-4">
          <div role="tablist" aria-label="Console sections" className="inline-flex w-full max-w-sm rounded-full border border-line/10 bg-sunk p-1 sm:w-auto">
            <TabButton active={tab === 'restaurants'} onClick={() => setTab('restaurants')} icon={<Building2 className="h-4 w-4" />} count={data.restaurants?.length}>
              Restaurants
            </TabButton>
            <TabButton active={tab === 'leads'} onClick={() => setTab('leads')} icon={<Inbox className="h-4 w-4" />} count={data.leads?.length}>
              Leads
            </TabButton>
          </div>

          {tab === 'restaurants' ? (
            data.error && !data.restaurants ? null : (
              <RestaurantsView restaurants={data.restaurants} pending={data.pending} onOpen={setOpenId} />
            )
          ) : (
            <LeadsView leads={data.leads} error={data.leadsError} onRetry={() => void data.loadLeads()} />
          )}
        </div>
      </main>

      <RestaurantSheet
        restaurant={selected}
        open={Boolean(openId)}
        onClose={() => setOpenId(null)}
        pendingAction={openId ? data.pending[openId] : undefined}
        onUpdate={data.updateRestaurant}
      />
    </div>
  );
}

function TabButton({ active, onClick, icon, count, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; count?: number; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full px-4 text-[13px] font-semibold transition sm:flex-none',
        active ? 'bg-surface text-fg shadow-soft' : 'text-fg/60 hover:text-fg',
      )}
    >
      {icon}
      {children}
      {count !== undefined && <span className="tnum rounded-full bg-sunk px-1.5 font-mono text-2xs text-muted">{count}</span>}
    </button>
  );
}

/* ------------------------------------------------------------------ gate screens */

function FullPageSpinner({ label }: { label: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 text-muted">
      <Spinner />
      <p className="text-sm">{label}…</p>
    </div>
  );
}

function CenteredCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className={cn('w-full max-w-md rounded-3xl border border-line/10 bg-surface p-6 shadow-soft md:p-8', className)}>{children}</div>
    </div>
  );
}

function StateIcon({ tone, children }: { tone: 'rose' | 'ember' | 'ink'; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'flex h-11 w-11 items-center justify-center rounded-2xl',
        tone === 'rose' && 'bg-rose-soft text-rose',
        tone === 'ember' && 'bg-ember-soft text-ember',
        tone === 'ink' && 'bg-ink text-paper',
      )}
      aria-hidden
    >
      {children}
    </span>
  );
}

function SignIn() {
  const { signIn } = useAuth();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [show, setShow] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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
      // The session listener swaps this screen for the access check.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
      setBusy(false);
    }
  };

  return (
    <CenteredCard>
      <StateIcon tone="ink">
        <ShieldCheck className="h-5 w-5" />
      </StateIcon>
      <h1 className="mt-4 font-display text-2xl font-semibold leading-tight tracking-tight">Restaurant OS console</h1>
      <p className="mt-1.5 text-sm text-muted">For the Restaurant OS team. Sign in with the account that has console access.</p>
      <form onSubmit={submit} className="mt-6 grid gap-4" noValidate>
        <Input label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        <Input
          label="Password"
          type={show ? 'text' : 'password'}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          suffix={
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="mr-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-fg/5 hover:text-fg"
              aria-label={show ? 'Hide password' : 'Show password'}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
        />
        {error && (
          <p className="rounded-xl bg-rose-soft px-3 py-2 text-sm text-[#a1282c]" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" loading={busy} size="lg">
          Sign in
        </Button>
      </form>
      <a href="/" className="mt-5 inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
        Back to the public site <ArrowUpRight className="h-3 w-3" aria-hidden />
      </a>
    </CenteredCard>
  );
}

function NoAccess({ email, onSignOut, onRetry }: { email: string | null; onSignOut: () => void; onRetry: () => void }) {
  const [copied, setCopied] = React.useState(false);
  const safeEmail = (email ?? 'you@example.com').replace(/'/g, "''");
  const sql = `insert into public.platform_admins (user_id)\nselect id from auth.users where email = '${safeEmail}';`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error('Could not copy. Select the SQL and copy it by hand.');
    }
  };

  return (
    <CenteredCard className="max-w-lg">
      <StateIcon tone="ember">
        <ShieldAlert className="h-5 w-5" />
      </StateIcon>
      <h1 className="mt-4 font-display text-xl font-semibold leading-tight">This account doesn&apos;t have console access</h1>
      <p className="mt-1.5 text-sm text-muted">
        You&apos;re signed in as <span className="font-medium text-fg">{email ?? 'an account without an email'}</span>. Console access is granted with
        SQL. Run this in the Supabase SQL editor, then check again:
      </p>
      <div className="relative mt-4">
        <pre className="overflow-x-auto whitespace-pre rounded-2xl bg-ink p-4 pr-12 font-mono text-[12.5px] leading-relaxed text-paper">
          <code>{sql}</code>
        </pre>
        <button
          type="button"
          onClick={() => void copy()}
          className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-paper/70 transition hover:bg-white/10 hover:text-paper"
          aria-label={copied ? 'Copied' : 'Copy SQL'}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">If it fails because platform_admins doesn&apos;t exist, run migration 0007 first.</p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button onClick={onRetry} leftIcon={<RefreshCw className="h-4 w-4" />}>
          Check again
        </Button>
        <Button variant="ghost" onClick={onSignOut} leftIcon={<LogOut className="h-4 w-4" />}>
          Sign out
        </Button>
      </div>
    </CenteredCard>
  );
}
