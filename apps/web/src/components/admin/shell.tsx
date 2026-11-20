'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ExternalLink, LogOut, MoreHorizontal, RefreshCw } from 'lucide-react';
import { planHas } from '@restaurant-os/shared';
import { useAuth } from '@/lib/auth';
import { cn, initials, tableUrl } from '@/lib/utils';
import { Button, Sheet } from '@/components/ui';
import { useAdmin } from './admin-provider';
import { PRIMARY_TAB_COUNT, isNavActive, navFor, pageTitle } from './nav';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { NotificationLayer } from './notification-layer';
import { NavLock, planName } from './plan';
import { AccountBanner } from './account-banner';

/**
 * The counter dashboard frame: dark sidebar (desktop), topbar, bottom tab bar (phones),
 * and the global notification layer. Chrome hides itself when printing.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const title = pageTitle(pathname);

  return (
    <div className="min-h-dvh bg-bg text-fg md:pl-[260px] print:pl-0">
      <Sidebar />
      <Topbar title={title} />
      <main className="gutter pb-28 pt-5 md:pb-12 md:pt-7 print:p-0">
        <AccountBanner />
        <LoadErrorBanner />
        {children}
      </main>
      <BottomTabs />
      <NotificationLayer />
    </div>
  );
}

/** The live board could not be loaded (API down, network): say so and offer a retry, on every page. */
function LoadErrorBanner() {
  const { loadError, loading, refresh } = useAdmin();
  const [busy, setBusy] = React.useState(false);
  if (!loadError) return null;
  const retry = async () => {
    setBusy(true);
    try {
      await refresh();
    } catch {
      // The banner keeps showing the latest message from the provider.
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="mb-4 flex flex-col gap-3 rounded-xl bg-rose-soft px-4 py-3 text-sm font-medium text-[#a1282c] sm:flex-row sm:items-center print:hidden"
      role="alert"
    >
      <p className="flex-1">
        Live orders are not loading. {loadError} {!loading && 'Retrying in the background.'}
      </p>
      <Button variant="outline" size="sm" loading={busy || loading} leftIcon={<RefreshCw className="h-4 w-4" />} onClick={() => void retry()} className="shrink-0 self-start sm:self-auto">
        Retry now
      </Button>
    </div>
  );
}

function BottomTabs() {
  const pathname = usePathname();
  const { orders, calls, tables, staff, restaurant } = useAdmin();
  const { signOut } = useAuth();
  const [more, setMore] = React.useState(false);
  const counts = { orders: orders.length, calls: calls.length };
  const nav = navFor(staff.role);
  const primary = nav.slice(0, PRIMARY_TAB_COUNT);
  const rest = nav.slice(PRIMARY_TAB_COUNT);
  const moreActive = rest.some((n) => isNavActive(pathname, n.href));
  const firstTable = tables.find((t) => t.is_active) ?? tables[0];

  React.useEffect(() => {
    setMore(false);
  }, [pathname]);

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line/10 glass pb-safe md:hidden print:hidden" aria-label="Primary">
        <ul className="grid grid-cols-5">
          {primary.map((item) => {
            const active = isNavActive(pathname, item.href);
            const badge = item.badge ? counts[item.badge] : 0;
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn('relative flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium', active ? 'text-ember' : 'text-muted')}
                >
                  <span className="relative">
                    <Icon className="h-5 w-5" aria-hidden />
                    {badge > 0 && (
                      <span
                        className={cn(
                          'tnum absolute -right-2.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[10px] font-semibold',
                          item.badge === 'calls' ? 'bg-saffron text-ink' : 'bg-ember text-white',
                        )}
                      >
                        {badge}
                      </span>
                    )}
                  </span>
                  {item.short}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setMore(true)}
              className={cn('flex h-14 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium', moreActive ? 'text-ember' : 'text-muted')}
              aria-haspopup="dialog"
            >
              <MoreHorizontal className="h-5 w-5" aria-hidden />
              More
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={more} onClose={() => setMore(false)} title="More" description={`${restaurant.name} · ${planName(restaurant.plan)} plan`}>
        <ul className="grid gap-1">
          {rest.map((item) => {
            const Icon = item.icon;
            const active = isNavActive(pathname, item.href);
            const locked = item.feature ? !planHas(restaurant.plan, item.feature) : false;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn('flex h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-medium', active ? 'bg-ember-soft text-ember-3' : 'hover:bg-fg/5')}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                  <span className="flex-1">{item.label}</span>
                  {locked && item.feature && <NavLock feature={item.feature} className="text-muted" />}
                </Link>
              </li>
            );
          })}
          {firstTable && (
            <li>
              <a href={tableUrl(firstTable.code)} target="_blank" rel="noreferrer" className="flex h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-medium hover:bg-fg/5">
                <ExternalLink className="h-5 w-5" aria-hidden />
                Open guest menu
              </a>
            </li>
          )}
        </ul>
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-sunk p-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ember/15 font-mono text-xs font-semibold text-ember" aria-hidden>
            {initials(staff.display_name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{staff.display_name}</p>
            <p className="font-mono text-2xs uppercase tracking-[0.14em] text-muted">{staff.role}</p>
          </div>
          <button type="button" onClick={() => void signOut()} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-fg/80 hover:bg-fg/5">
            <LogOut className="h-4 w-4" aria-hidden /> Sign out
          </button>
        </div>
      </Sheet>
    </>
  );
}
