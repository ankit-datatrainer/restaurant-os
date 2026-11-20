'use client';

import Link from 'next/link';
import * as React from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { ArrowUpRight, Bell, CalendarCheck, Repeat2, Volume2 } from 'lucide-react';
import { Button, Magnetic, Reveal, scrollToId } from '@/components/ui';
import { EASE_OUT } from '@/lib/motion';
import { MaskWords } from './mask-words';
import { PhoneMock } from './phone-mock';
import { QRCard } from './qr-card';
import { SoundWave } from './micro/sound-wave';

const FACTS = ['No app to install', 'Counter POS + floor view', 'Split bills, GST receipts', 'WhatsApp offers, opt-in only'];

export function Hero() {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const yPhone = useTransform(scrollY, [0, 900], [0, reduce ? 0 : 110]);
  const yCopy = useTransform(scrollY, [0, 900], [0, reduce ? 0 : -50]);
  const fade = useTransform(scrollY, [0, 600], [1, reduce ? 1 : 0.25]);

  return (
    <section className="grain relative isolate overflow-hidden pb-20 pt-32 md:pt-40 lg:min-h-[100svh] lg:pb-28">
      {/* ambient light */}
      <div aria-hidden className="pointer-events-none absolute -left-32 -top-40 h-[560px] w-[560px] rounded-full bg-ember/[0.16] blur-[150px]" />
      <div aria-hidden className="pointer-events-none absolute right-[-12%] top-[22%] h-[480px] w-[480px] rounded-full bg-saffron/[0.08] blur-[150px]" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(rgba(247,244,238,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(247,244,238,0.05)_1px,transparent_1px)] [background-size:72px_72px] [mask-image:radial-gradient(ellipse_at_center,#000_30%,transparent_75%)]"
      />

      <div className="container-x relative grid items-center gap-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
        <motion.div style={{ y: yCopy, opacity: fade }} className="relative z-10">
          <Reveal as="p" className="eyebrow flex items-center gap-3" y={12}>
            <span className="relative flex h-2 w-2">
              {!reduce && <span className="absolute inline-flex h-full w-full rounded-full bg-ember animate-pulse-ring" />}
              <span className="relative inline-flex h-2 w-2 rounded-full bg-ember" />
            </span>
            QR ordering, POS, billing &amp; inventory in one
          </Reveal>

          <MaskWords
            as="h1"
            immediate
            delay={0.15}
            stagger={0.1}
            className="mt-6 text-[clamp(2.75rem,7vw,6.75rem)] font-bold leading-[0.92] tracking-[-0.03em]"
            words={[
              { text: 'From' },
              { text: 'first' },
              { text: 'order' },
              { text: 'to' },
              { text: 'next', className: 'font-serif font-normal italic text-ember' },
              { text: 'visit.', className: 'font-serif font-normal italic text-ember' },
            ]}
          />

          <Reveal as="p" delay={0.55} className="mt-7 max-w-xl text-lg leading-relaxed text-muted md:text-xl">
            Guests order and pay from the table. Your staff get every order the second it lands, and bill the whole floor from the same screen. And
            you finally know who your regulars are, so you can bring them back, with their permission.
          </Reveal>

          <Reveal delay={0.7} className="mt-9 flex flex-wrap items-center gap-3">
            <Magnetic>
              <Button href="/signup" size="xl" rightIcon={<ArrowUpRight className="h-5 w-5" aria-hidden />}>
                Start free trial
              </Button>
            </Magnetic>
            <Magnetic>
              <Button href="/contact?plan=demo" variant="outline" size="xl" leftIcon={<CalendarCheck className="h-5 w-5" aria-hidden />}>
                Book a 5-minute demo
              </Button>
            </Magnetic>
          </Reveal>

          <Reveal as="p" delay={0.78} className="mt-4 text-sm text-muted">
            14 days of everything, no card needed. Or{' '}
            <Link href="/demo" className="font-semibold text-fg underline-offset-4 hover:text-ember hover:underline">
              open the live demo
            </Link>{' '}
            first.
          </Reveal>

          <Reveal delay={0.85} className="mt-8 flex flex-wrap gap-x-7 gap-y-2 font-mono text-xs text-muted">
            {FACTS.map((f) => (
              <span key={f} className="flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-ember" aria-hidden />
                {f}
              </span>
            ))}
          </Reveal>
        </motion.div>

        <motion.div style={{ y: yPhone }} className="relative mx-auto w-full max-w-[560px] lg:max-w-none">
          <div className="relative flex flex-col items-center gap-6 lg:block lg:h-[700px]">
            <motion.div
              className="relative lg:absolute lg:left-1/2 lg:top-0 lg:-translate-x-[42%]"
              initial={reduce ? false : { opacity: 0, y: 60, rotate: -4 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              transition={{ duration: 1.2, delay: 0.3, ease: EASE_OUT }}
            >
              <div className={reduce ? undefined : 'animate-float [animation-duration:7s]'}>
                <PhoneMock width={290} />
              </div>

              {/* floating product chips */}
              <motion.div
                className="absolute -left-6 top-[18%] hidden items-center gap-3 rounded-2xl border border-paper/10 bg-ink-2/90 px-3.5 py-2.5 shadow-lift backdrop-blur-md sm:flex lg:-left-24"
                initial={reduce ? false : { opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.1, duration: 0.8, ease: EASE_OUT }}
                aria-hidden
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-ember text-white">
                  <Volume2 className="h-4 w-4" />
                </span>
                <div className="text-xs">
                  <p className="font-semibold">Kitchen hears it</p>
                  <SoundWave bars={7} height={10} className="mt-1 text-ember" />
                </div>
              </motion.div>
              <motion.div
                className="absolute -right-4 top-[58%] hidden items-center gap-3 rounded-2xl border border-paper/10 bg-ink-2/90 px-3.5 py-2.5 shadow-lift backdrop-blur-md sm:flex lg:-right-20"
                initial={reduce ? false : { opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.3, duration: 0.8, ease: EASE_OUT }}
                aria-hidden
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-saffron text-ink">
                  <Bell className="h-4 w-4" />
                </span>
                <div className="text-xs">
                  <p className="font-semibold">Table 4 · Call waiter</p>
                  <p className="text-muted">Guest sees: on the way</p>
                </div>
              </motion.div>
              <motion.div
                className="absolute -right-2 top-[6%] hidden items-center gap-2 rounded-full border border-paper/10 bg-ink-2/90 py-1.5 pl-1.5 pr-3 font-mono text-[11px] shadow-lift backdrop-blur-md sm:flex lg:-right-14"
                initial={reduce ? false : { opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.5, duration: 0.8, ease: EASE_OUT }}
                aria-hidden
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-mint/20 text-mint">
                  <Repeat2 className="h-3.5 w-3.5" />
                </span>
                <span>Repeat guest</span>
                <span className="text-muted">· 4th visit · opted in</span>
              </motion.div>
            </motion.div>

            <motion.div
              className="w-full max-w-[360px] lg:absolute lg:bottom-0 lg:left-0 lg:max-w-[340px]"
              initial={reduce ? false : { opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1, duration: 0.9, ease: EASE_OUT }}
            >
              <QRCard />
            </motion.div>
          </div>
        </motion.div>
      </div>

      {/* scroll hint */}
      <motion.button
        type="button"
        onClick={() => scrollToId('owner', -24)}
        className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 font-mono text-2xs uppercase tracking-[0.2em] text-muted transition-colors hover:text-fg lg:flex"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.8 }}
        aria-label="Scroll to the next section"
      >
        Scroll
        <span className="relative block h-10 w-px overflow-hidden bg-paper/15">
          {!reduce && (
            <motion.span
              className="absolute left-0 top-0 h-4 w-px bg-ember"
              animate={{ y: [-16, 40] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
        </span>
      </motion.button>
    </section>
  );
}
