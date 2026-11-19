'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { LogOut } from 'lucide-react';
import { planHas } from '@restaurant-os/shared';
import { useAuth } from '@/lib/auth';
import { cn, initials } from '@/lib/utils';
import { Logo } from '@/components/ui';
import { useAdmin } from './admin-provider';
import { NAV_GROUPS, isNavActive, navFor } from './nav';
import { NavLock, PlanChip } from './plan';

export function Sidebar() {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const { restaurant, staff, orders, calls } = useAdmin();
  const { signOut } = useAuth();
  const counts = { orders: orders.length, calls: calls.length };

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[260px] flex-col bg-ink text-paper md:flex print:hidden" aria-label="Admin navigation">
      <div className="px-5 pb-4 pt-6">
        <Logo light href="/admin" className="text-paper" />
        <p className="mt-4 truncate text-sm font-medium text-paper/90">{restaurant.name}</p>
        <p className="mt-0.5 flex items-center gap-1.5 font-mono text-2xs uppercase tracking-[0.14em] text-paper/45">
          <span className={cn('h-1.5 w-1.5 rounded-full', restaurant.is_open ? 'bg-mint' : 'bg-rose')} aria-hidden />
          {restaurant.is_open ? 'Taking orders' : 'Closed for orders'}
        </p>
        <PlanChip plan={restaurant.plan} className="mt-3" />
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {NAV_GROUPS.map((group) => {
          const items = navFor(staff.role).filter((n) => n.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group} className="mb-3">
              <p className="px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-paper/35">{group}</p>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active = isNavActive(pathname, item.href);
                  const badge = item.badge ? counts[item.badge] : 0;
                  const Icon = item.icon;
                  const locked = item.feature ? !planHas(restaurant.plan, item.feature) : false;
                  return (
                    <li key={item.href} className="relative">
                      {active && (
                        <motion.span
                          layoutId={reduce ? undefined : 'sidebar-active'}
                          className="absolute inset-0 rounded-xl bg-paper/10"
                          transition={{
                            type: 'spring',
                            stiffness: 420,
                            damping: 36,
                          }}
                          aria-hidden
                        />
                      )}
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'relative flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] font-medium transition-colors',
                          active ? 'text-paper' : 'text-paper/60 hover:bg-paper/5 hover:text-paper',
                        )}
                      >
                        <Icon className={cn('h-[18px] w-[18px] shrink-0', active ? 'text-ember' : 'text-paper/50')} aria-hidden />
                        <span className="flex-1 truncate">{item.label}</span>
                        {locked && item.feature && <NavLock feature={item.feature} className="text-paper/40" />}
                        {badge > 0 && (
                          <span
                            className={cn(
                              'tnum inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-mono text-2xs font-semibold',
                              item.badge === 'calls' ? 'bg-saffron text-ink' : 'bg-ember text-white',
                            )}
                          >
                            {badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-paper/10 p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ember/20 font-mono text-xs font-semibold text-ember" aria-hidden>
            {initials(staff.display_name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{staff.display_name}</p>
            <p className="truncate font-mono text-2xs uppercase tracking-[0.14em] text-paper/45">{staff.role}</p>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-paper/60 transition hover:bg-paper/10 hover:text-paper"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
