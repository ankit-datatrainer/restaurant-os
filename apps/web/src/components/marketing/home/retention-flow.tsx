'use client';

import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, MessageCircle, Repeat2, Send, ShieldCheck, Star } from 'lucide-react';
import { CountUp, OrderStatusBadge, Reveal } from '@/components/ui';
import { cn, formatINR, orderCode } from '@/lib/utils';
import { EASE_OUT } from '@/lib/motion';
import { useLoop, useOnScreen } from '../hooks';
import { ConsentTick } from '../micro/consent-tick';
import { MOCK_RESTAURANT } from '../mock-data';
import { SectionHeading } from '../section-heading';

const STEPS = [
  { n: '01', title: 'They order', body: 'From the QR on the table, exactly like any other order.' },
  { n: '02', title: 'Their number, their tick', body: 'An optional mobile number, and a separate WhatsApp-offers box that stays unticked unless the guest ticks it.' },
  { n: '03', title: 'A profile builds', body: 'Visits, spend and rating add up on their own, order by order.' },
  { n: '04', title: 'You send an offer', body: 'Pick guests who opted in and WhatsApp opens with your message typed in; you press send. On Premium, welcome, win-back and reward messages can go out on their own.' },
  { n: '05', title: 'They come back', body: 'Their next order adds a visit to the same profile, and the cycle starts again.' },
] as const;

const PROMISES = ['Number is optional', 'Offers box starts unticked', 'Opted-in guests only', 'Unsubscribe any time'];

/* ----------------------------------------------------------------------------
   Stage visuals (illustrative product UI, not real customers)
---------------------------------------------------------------------------- */
const ORDER_LINES = [
  { name: 'Paneer Tikka', qty: 1, total: 249 },
  { name: 'Dal Makhani', qty: 1, total: 289 },
  { name: 'Butter Naan', qty: 3, total: 180 },
];

function StageCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('w-full max-w-sm rounded-2xl border border-paper/10 bg-ink p-4 shadow-lift', className)}>{children}</div>;
}

function OrderStage() {
  return (
    <StageCard>
      <div className="flex items-center justify-between">
        <span className="tnum font-mono text-[11px] text-muted">{orderCode(1042)} · Table 6</span>
        <OrderStatusBadge status="placed" />
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {ORDER_LINES.map((l, i) => (
          <motion.li
            key={l.name}
            className="flex justify-between"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 + i * 0.08, duration: 0.4, ease: EASE_OUT }}
          >
            <span className="text-fg/85">
              {l.name} ×{l.qty}
            </span>
            <span className="tnum text-fg/70">{formatINR(l.total)}</span>
          </motion.li>
        ))}
      </ul>
      <p className="mt-3 border-t border-paper/10 pt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Sent to the kitchen · chime on the counter</p>
    </StageCard>
  );
}

function ConsentStage() {
  return (
    <StageCard className="h-[236px]">
      <ConsentTick />
    </StageCard>
  );
}

function ProfileStage() {
  return (
    <StageCard>
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ember font-display text-sm font-bold text-white">AR</span>
        <div className="min-w-0">
          <p className="font-display text-base font-semibold leading-tight">Ananya R.</p>
          <p className="tnum font-mono text-[10px] text-muted">+91 98•••• •210</p>
        </div>
        <span className="ml-auto flex items-center gap-1 rounded-full bg-mint/15 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-mint">
          <MessageCircle className="h-3 w-3" /> Opted in
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2">
        {[
          { k: 'Visits', v: <CountUp value={3} duration={1} /> },
          { k: 'Spent', v: <CountUp value={3960} prefix="₹" duration={1.2} /> },
          {
            k: 'Rating',
            v: (
              <span className="inline-flex items-center gap-1">
                <CountUp value={4.7} decimals={1} duration={1.2} />
                <Star className="h-3.5 w-3.5 fill-saffron text-saffron" />
              </span>
            ),
          },
        ].map((s) => (
          <div key={s.k} className="rounded-xl bg-paper/[0.05] px-2.5 py-2">
            <dt className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">{s.k}</dt>
            <dd className="mt-0.5 font-display text-lg font-bold leading-none">{s.v}</dd>
          </div>
        ))}
      </dl>
      <ol className="mt-4 flex items-center gap-2 font-mono text-[10px] text-muted" aria-label="Visit history">
        {['12 Sep', '3 Oct', '26 Oct'].map((d, i) => (
          <motion.li key={d} className="flex items-center gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 + i * 0.25 }}>
            <span className="h-1.5 w-1.5 rounded-full bg-ember" aria-hidden />
            {d}
            {i < 2 && <span className="h-px w-5 bg-paper/15" aria-hidden />}
          </motion.li>
        ))}
      </ol>
    </StageCard>
  );
}

function OfferStage() {
  const reduce = useReducedMotion();
  const phase = useLoop(3, 1300, true);
  return (
    <StageCard>
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Segment · WhatsApp opted in</p>
      <div className="mt-3 rounded-2xl rounded-tl-sm border border-mint/25 bg-mint/[0.08] p-3 text-[12.5px] leading-snug text-fg/90">
        Hi Ananya, it’s {MOCK_RESTAURANT.name}. Our monsoon menu starts this Friday, and your table gets a free masala chai. See you soon!
        <span className="mt-2 block font-mono text-[10px] text-muted">Unsubscribe: link in every message</span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-[11px] text-muted">You tap send. One guest at a time.</span>
        <motion.span
          className={cn(
            'relative flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-semibold transition-colors duration-300',
            phase === 2 ? 'bg-mint text-white' : 'bg-paper text-ink',
          )}
          animate={phase === 1 && !reduce ? { scale: [1, 0.93, 1] } : { scale: 1 }}
          transition={{ duration: 0.35 }}
        >
          {phase === 2 ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <Send className="h-3.5 w-3.5" />}
          {phase === 2 ? 'Sent' : 'Send'}
        </motion.span>
      </div>
    </StageCard>
  );
}

function ReturnStage() {
  const phase = useLoop(2, 1600, true);
  const back = phase === 1;
  return (
    <StageCard>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ember font-display text-sm font-bold text-white">AR</span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-semibold leading-tight">Ananya R.</p>
          <p className="font-mono text-[10px] text-muted">Last seen: {back ? 'today' : '26 Oct'}</p>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-ember/15 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-ember">
          <Repeat2 className="h-3 w-3" /> Repeat
        </span>
      </div>
      <div className="mt-4 flex items-end gap-3">
        <div className="relative h-12 w-14 overflow-hidden">
          <AnimatePresence initial={false}>
            <motion.span
              key={back ? 4 : 3}
              className="tnum absolute inset-0 font-display text-5xl font-bold leading-none"
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '-100%', opacity: 0 }}
              transition={{ duration: 0.45, ease: EASE_OUT }}
            >
              {back ? 4 : 3}
            </motion.span>
          </AnimatePresence>
        </div>
        <p className="pb-1 text-sm text-muted">visits</p>
      </div>
      <p className={cn('mt-3 border-t border-paper/10 pt-3 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors', back ? 'text-mint' : 'text-muted')}>
        {back ? `${orderCode(1107)} · Table 2 · same profile` : 'Waiting for the next visit'}
      </p>
    </StageCard>
  );
}

const STAGES = [OrderStage, ConsentStage, ProfileStage, OfferStage, ReturnStage];

/* ----------------------------------------------------------------------------
   Illustrative example
---------------------------------------------------------------------------- */
const EXAMPLE: Array<{ value: number; decimals?: number; label: string; op?: string; strong?: boolean }> = [
  { value: 80, label: 'tables served a day' },
  { value: 2.5, decimals: 1, label: 'guests per table', op: '×' },
  { value: 200, label: 'diners a day', op: '=' },
  { value: 6000, label: 'diners a month', op: '× 30 days' },
  { value: 1800, label: 'contacts, if 30% share a number', op: '× 30%', strong: true },
];

function IllustrativeExample() {
  return (
    <Reveal className="mt-16 md:mt-20">
      <div className="relative overflow-hidden rounded-[2rem] border border-paper/10 bg-ink-2/70 p-6 md:p-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="rounded-full border border-saffron/40 bg-saffron/10 px-3 py-1 font-mono text-2xs uppercase tracking-[0.16em] text-saffron">Illustrative example</span>
          <span className="font-mono text-2xs uppercase tracking-[0.16em] text-muted">Arithmetic, not a forecast</span>
        </div>
        <h3 className="mt-5 max-w-2xl font-display text-display-sm font-bold">How many guests could a busy restaurant get to know in a month?</h3>

        <ol className="mt-10 grid gap-2.5 xl:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1.2fr] xl:items-end xl:gap-4">
          {EXAMPLE.map((e, i) => (
            <React.Fragment key={e.label}>
              {e.op && (
                <li aria-hidden className="flex items-center gap-3 pl-4 font-mono text-xs text-ember xl:justify-center xl:pb-8 xl:pl-0">
                  <span className="h-px w-6 bg-ember/40 xl:hidden" />
                  {e.op}
                </li>
              )}
              <Reveal as="li" delay={0.1 * i} className={cn('flex items-baseline gap-4 rounded-2xl border p-4 xl:block xl:p-5', e.strong ? 'border-ember/50 bg-ember/[0.08]' : 'border-paper/10 bg-ink/40')}>
                <span className={cn('block shrink-0 font-display text-[clamp(2rem,2.6vw,2.75rem)] font-bold leading-none', e.strong && 'text-ember')}>
                  <CountUp value={e.value} decimals={e.decimals ?? 0} duration={1.4} />
                </span>
                <span className="block text-sm leading-snug text-muted xl:mt-2">{e.label}</span>
              </Reveal>
            </React.Fragment>
          ))}
        </ol>

        <p className="mt-8 max-w-3xl text-sm leading-relaxed text-muted">
          <span className="font-semibold text-fg">Real, consented contacts will be lower.</span> Not every guest shares a number, fewer tick the WhatsApp box, and you can
          only send offers to people who did. This shows the arithmetic, not a result from any restaurant.
        </p>
      </div>
    </Reveal>
  );
}

/* ----------------------------------------------------------------------------
   Section
---------------------------------------------------------------------------- */
export function RetentionFlow({ index = '03' }: { index?: string }) {
  const { ref, inView } = useOnScreen<HTMLDivElement>();
  const reduce = useReducedMotion();
  const [paused, setPaused] = React.useState(false);
  const auto = useLoop(STEPS.length, 3200, inView && !paused && !reduce);
  const [picked, setPicked] = React.useState(0);
  const active = paused || reduce ? picked : auto;
  const Stage = STAGES[active] ?? OrderStage;

  const pick = (i: number) => {
    setPicked(i);
    setPaused(true);
  };

  return (
    <section id="retention" className="relative scroll-mt-20 overflow-hidden border-y border-paper/10 bg-ink-2/30 py-24 md:py-32">
      <div aria-hidden className="pointer-events-none absolute -right-40 top-10 h-[520px] w-[520px] rounded-full bg-ember/[0.08] blur-[160px]" />
      <div className="container-x relative">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <SectionHeading
            index={index}
            eyebrow="Customer retention"
            title="From the first order to the next visit."
            lede="Most restaurants never find out who their regulars are. Restaurant OS builds that picture from the orders guests already place, and only ever contacts the people who said yes."
          />
          <Reveal delay={0.2}>
            <ul className="flex flex-wrap gap-2 lg:justify-end">
              {PROMISES.map((p) => (
                <li key={p} className="flex items-center gap-1.5 rounded-full border border-paper/10 bg-ink/50 px-3 py-1.5 font-mono text-2xs uppercase tracking-[0.12em] text-fg/80">
                  <ShieldCheck className="h-3 w-3 text-mint" aria-hidden />
                  {p}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <div ref={ref} className="mt-14 grid gap-8 lg:grid-cols-[1fr_0.9fr] lg:gap-14">
          {/* steps */}
          <ol className="relative grid gap-2" aria-label="Retention steps">
            {STEPS.map((s, i) => {
              const on = i === active;
              const done = i < active;
              return (
                <li key={s.n} className="relative">
                  {i < STEPS.length - 1 && (
                    <span aria-hidden className="absolute left-[22px] top-[23px] h-[calc(100%+8px)] w-px overflow-hidden bg-paper/10">
                      <motion.span
                        className="absolute inset-0 origin-top bg-ember"
                        initial={false}
                        animate={{ scaleY: done ? 1 : 0 }}
                        transition={{ duration: reduce ? 0 : 0.5, ease: EASE_OUT }}
                      />
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => pick(i)}
                    aria-current={on ? 'step' : undefined}
                    className={cn(
                      'group relative flex w-full items-start gap-5 rounded-2xl p-3 text-left transition-colors duration-300',
                      on ? 'bg-paper/[0.05]' : 'hover:bg-paper/[0.03]',
                    )}
                  >
                    <span
                      className={cn(
                        'relative z-10 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border font-mono text-[9px] transition-colors duration-300',
                        on || done ? 'border-ember bg-ember text-white' : 'border-paper/20 bg-ink text-muted',
                      )}
                    >
                      {done ? <Check className="h-3 w-3" strokeWidth={3} aria-hidden /> : i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className={cn('block font-display text-xl font-semibold leading-tight transition-colors duration-300 md:text-2xl', on ? 'text-fg' : 'text-fg/50 group-hover:text-fg/80')}>
                        {s.title}
                      </span>
                      <span className="mt-1.5 block text-[15px] leading-relaxed text-muted lg:hidden">{s.body}</span>
                      <motion.span
                        className="hidden overflow-hidden text-[15px] leading-relaxed text-muted lg:block"
                        initial={false}
                        animate={{ height: on ? 'auto' : 0, opacity: on ? 1 : 0, marginTop: on ? 6 : 0 }}
                        transition={{ duration: reduce ? 0 : 0.4, ease: EASE_OUT }}
                      >
                        {s.body}
                      </motion.span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          {/* stage */}
          <div className="relative flex min-h-[360px] items-center justify-center rounded-[2rem] md:min-h-[400px] border border-paper/10 bg-ink/60 p-6 md:p-10">
            <div aria-hidden className="pointer-events-none absolute inset-0 rounded-[2rem] opacity-40 [background-image:radial-gradient(rgba(247,244,238,0.08)_1px,transparent_1px)] [background-size:18px_18px]" />
            <span className="absolute left-5 top-5 font-mono text-2xs uppercase tracking-[0.16em] text-muted">
              Step {STEPS[active]?.n} · {STEPS[active]?.title}
            </span>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={active}
                className="relative flex w-full justify-center pt-6"
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.98 }}
                transition={{ duration: 0.45, ease: EASE_OUT }}
                aria-hidden
              >
                <Stage />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <Reveal as="p" delay={0.1} className="mt-6 max-w-3xl text-xs leading-relaxed text-muted">
          On Growth, your staff send each offer themselves, one guest at a time. On Premium, a welcome message, a win-back after a set number of days, a
          loyalty-reward note and one-tap offer broadcasts can go out automatically through Meta’s official WhatsApp Cloud API, from your own WhatsApp
          Business account. Either way, only guests who opted in hear from you, and every message has an unsubscribe link.
        </Reveal>

        <IllustrativeExample />
      </div>
    </section>
  );
}
