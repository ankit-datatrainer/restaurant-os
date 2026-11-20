'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { EASE_OUT } from '@/lib/motion';
import { getLenis } from './gsap';
import { NAV_LINKS, site } from './site';

export function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reduce = useReducedMotion();
  const pathname = usePathname();
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const lenis = getLenis();
    lenis?.stop();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => panelRef.current?.querySelector<HTMLElement>('a')?.focus(), 80);
    return () => {
      lenis?.start();
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          id="mobile-menu"
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Site menu"
          className="grain fixed inset-0 z-[55] flex flex-col bg-ink text-paper lg:hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div aria-hidden className="pointer-events-none absolute -left-20 top-10 h-[360px] w-[360px] rounded-full bg-ember/[0.18] blur-[120px]" />
          <div className="container-x relative flex min-h-0 flex-1 flex-col overflow-y-auto pb-safe pt-24">
            <ul>
              {NAV_LINKS.map((l, i) => {
                const active = pathname === l.href;
                return (
                  <li key={l.href} className="overflow-hidden border-b border-paper/10">
                    <motion.div
                      initial={reduce ? false : { y: '100%' }}
                      animate={{ y: 0 }}
                      exit={reduce ? undefined : { y: '100%' }}
                      transition={{ duration: 0.6, delay: 0.04 + i * 0.06, ease: EASE_OUT }}
                    >
                      <Link
                        href={l.href}
                        onClick={onClose}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex items-baseline gap-4 py-3.5 font-display text-[clamp(2.1rem,8.5vw,3.25rem)] font-semibold leading-none tracking-tight',
                          active ? 'text-ember' : 'text-paper',
                        )}
                      >
                        <span className="font-mono text-xs text-muted">0{i + 1}</span>
                        {l.label}
                      </Link>
                    </motion.div>
                  </li>
                );
              })}
            </ul>

            <motion.div
              className="mt-auto grid gap-4 pt-8"
              initial={reduce ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.36, duration: 0.6, ease: EASE_OUT }}
            >
              <div className="flex items-center gap-4 rounded-3xl border border-paper/10 bg-ink-2 p-4">
                <div className="shrink-0 rounded-2xl bg-white p-2">
                  <QRCodeSVG value={site.demoTableUrl} size={96} bgColor="#ffffff" fgColor="#0C0D10" level="M" title="QR code for the demo table" />
                </div>
                <div className="min-w-0">
                  <p className="font-display text-lg font-semibold leading-tight">Scan the demo</p>
                  <p className="mt-1 text-sm text-muted">Point another phone here to open the demo table, or</p>
                  <a href={site.demoTableUrl} className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-ember" onClick={onClose}>
                    open it on this one <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                  </a>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 pb-4">
                <Button href="/signup" size="lg" className="col-span-2" rightIcon={<ArrowUpRight className="h-4 w-4" aria-hidden />}>
                  Start free trial
                </Button>
                <Button href="/contact?plan=demo" variant="outline" size="lg">
                  Book a demo
                </Button>
                <Button href="/admin/login" variant="outline" size="lg">
                  Staff login
                </Button>
              </div>
              <p className="-mt-2 pb-4 text-center font-mono text-2xs uppercase tracking-[0.14em] text-muted">14 days of everything · No card needed</p>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
