'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, useMotionValueEvent, useReducedMotion, useScroll } from 'framer-motion';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import { Button, Logo } from '@/components/ui';
import { cn } from '@/lib/utils';
import { EASE_OUT, spring } from '@/lib/motion';
import { MobileMenu } from './mobile-menu';
import { NAV_LINKS } from './site';

/**
 * Fixed glass nav. Hides on scroll down, returns on scroll up; active link gets a sliding pill.
 */
export function Nav() {
  const pathname = usePathname();
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const [hidden, setHidden] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  useMotionValueEvent(scrollY, 'change', (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    const down = y > prev + 2;
    const up = y < prev - 2;
    if (down && y > 160) setHidden(true);
    else if (up || y < 80) setHidden(false);
    setScrolled(y > 24);
  });

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const close = React.useCallback(() => setOpen(false), []);

  return (
    <>
      <motion.header
        className="fixed inset-x-0 top-0 z-[60]"
        animate={{ y: hidden && !open ? '-120%' : '0%' }}
        transition={{ duration: reduce ? 0 : 0.5, ease: EASE_OUT }}
      >
        <div className="container-x">
          <nav
            aria-label="Primary"
            className={cn(
              'mt-3 flex h-14 items-center justify-between rounded-full border pl-5 pr-2.5 transition-[background-color,border-color,box-shadow] duration-500 md:mt-4',
              scrolled || open ? 'glass-dark border-paper/10 shadow-lift' : 'border-transparent',
            )}
          >
            <Logo light className="text-paper" />

            <ul className="hidden items-center gap-0.5 lg:flex">
              {NAV_LINKS.map((l) => {
                const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
                return (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'relative block rounded-full px-3.5 py-2 text-sm font-medium transition-colors duration-300',
                        active ? 'text-paper' : 'text-paper/60 hover:text-paper',
                      )}
                    >
                      {active && (
                        <motion.span layoutId="nav-active-pill" className="absolute inset-0 rounded-full bg-paper/10" transition={reduce ? { duration: 0 } : spring} aria-hidden />
                      )}
                      <span className="relative">{l.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div className="hidden items-center gap-1.5 lg:flex">
              <Button href="/admin/login" variant="ghost" size="sm" className="text-paper/80 hover:bg-paper/10 hover:text-paper">
                Staff login
              </Button>
              <Button href="/contact?plan=demo" size="sm" rightIcon={<ArrowUpRight className="h-4 w-4" aria-hidden />}>
                Book a demo
              </Button>
            </div>

            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls="mobile-menu"
              aria-label={open ? 'Close menu' : 'Open menu'}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-paper transition-colors hover:bg-paper/10 lg:hidden"
            >
              <motion.span key={open ? 'x' : 'menu'} initial={{ rotate: -45, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} transition={{ duration: 0.25 }} className="flex">
                {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </motion.span>
            </button>
          </nav>
        </div>
      </motion.header>
      <MobileMenu open={open} onClose={close} />
    </>
  );
}
