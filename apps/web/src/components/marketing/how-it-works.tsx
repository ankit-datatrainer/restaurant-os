'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Reveal } from '@/components/ui';
import { cn } from '@/lib/utils';
import { DeviceScene } from './device-scene';
import { ensureGsap } from './gsap';
import { HOW_SEQUENCE, PhoneMock } from './phone-mock';
import { SectionHeading } from './section-heading';

const STEPS = [
  {
    n: '01',
    title: 'Scan the table QR',
    body: 'A sticker on every table. The guest points their camera at it and the menu opens in the browser. Nothing to install, nothing to type.',
  },
  {
    n: '02',
    title: 'Order from the phone',
    body: 'Photos, veg marks, portions and add-ons. The cart adds GST as they go. They tap “Place order” and can keep the page open to track it.',
  },
  {
    n: '03',
    title: 'Kitchen hears it instantly',
    body: 'The counter board chimes and reads the order aloud: “New order, table one, two paneer tikka.” Hands stay on the stove.',
  },
  {
    n: '04',
    title: 'Pay by UPI or counter',
    body: 'The bill is itemised with CGST and SGST. UPI opens with the amount filled in; or the guest pays at the counter exactly as before.',
  },
  {
    n: '05',
    title: 'Rate the meal, come back',
    body: 'Guests rate the meal and see your Google review link. Those who shared a number and ticked the WhatsApp box can hear from you again.',
  },
] as const;

function StepRow({ step, active, done }: { step: (typeof STEPS)[number]; active: boolean; done: boolean }) {
  const reduce = useReducedMotion();
  return (
    <li className="relative py-4 pl-2">
      <span
        className={cn(
          'absolute -left-8 top-[26px] flex h-4 w-4 -translate-x-1/2 items-center justify-center rounded-full border transition-colors duration-500',
          active || done ? 'border-ember bg-ember' : 'border-paper/20 bg-ink',
        )}
        aria-hidden
      >
        {active && !reduce && <span className="absolute inset-0 rounded-full bg-ember animate-pulse-ring" />}
      </span>
      <div className="flex items-baseline gap-4">
        <span className={cn('font-mono text-xs transition-colors duration-500', active ? 'text-ember' : 'text-muted')}>{step.n}</span>
        <h3 className={cn('font-display text-2xl font-semibold leading-tight transition-colors duration-500 md:text-[1.75rem]', active ? 'text-fg' : 'text-fg/40')}>
          {step.title}
        </h3>
      </div>
      <motion.p className="mt-2 max-w-md text-[15px] leading-relaxed text-muted" animate={{ opacity: active ? 1 : 0.45 }} transition={{ duration: 0.4 }}>
        {step.body}
      </motion.p>
    </li>
  );
}

/**
 * Desktop (lg+, no reduced motion): the section pins for ~2.6 screens; a progress line scrubs with scroll
 * and each step lights up as the sticky device switches state. Mobile / reduced motion: a plain stepped list
 * with an auto-cycling phone whose state drives the highlight.
 */
export function HowItWorks({ index = '02' }: { index?: string }) {
  const sceneRef = React.useRef<HTMLDivElement>(null);
  const lineRef = React.useRef<HTMLSpanElement>(null);
  const stepRef = React.useRef(0);
  const [step, setStep] = React.useState(0);
  const [mobileStep, setMobileStep] = React.useState(0);

  React.useEffect(() => {
    const { gsap, ScrollTrigger } = ensureGsap();
    const scene = sceneRef.current;
    if (!scene) return;
    const mm = gsap.matchMedia();
    const ctx = gsap.context(() => {
      mm.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference)', () => {
        const line = lineRef.current;
        if (!line) return;
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: scene,
            start: 'top top',
            end: () => `+=${Math.round(window.innerHeight * 3.1)}`,
            pin: true,
            scrub: 0.6,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              const s = Math.min(STEPS.length - 1, Math.floor(self.progress * STEPS.length));
              if (s !== stepRef.current) {
                stepRef.current = s;
                setStep(s);
              }
            },
          },
        });
        tl.fromTo(line, { scaleY: 0 }, { scaleY: 1, ease: 'none' });
        return () => {
          tl.scrollTrigger?.kill();
          tl.kill();
        };
      });
    }, scene);
    const raf = requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => {
      cancelAnimationFrame(raf);
      mm.revert();
      ctx.revert();
    };
  }, []);

  return (
    <section id="how" className="relative scroll-mt-20">
      {/* Desktop pinned scene */}
      <div ref={sceneRef} className="container-x hidden h-[100svh] grid-cols-2 items-center gap-16 lg:grid">
        <div className="max-w-xl [@media(max-height:820px)]:scale-[0.9] [@media(max-height:820px)]:origin-left">
          <SectionHeading index={index} eyebrow="How it works" title="From the table to the kitchen, and back again." />
          <ol className="relative mt-10 border-l border-paper/10 pl-8">
            <span ref={lineRef} className="absolute -left-px top-0 h-full w-px origin-top scale-y-0 bg-ember" aria-hidden />
            {STEPS.map((s, i) => (
              <StepRow key={s.n} step={s} active={i === step} done={i < step} />
            ))}
          </ol>
        </div>
        <div className="flex items-center justify-center [@media(max-height:820px)]:scale-[0.82]">
          <DeviceScene step={step} />
        </div>
      </div>

      {/* Mobile / tablet */}
      <div className="container-x py-24 lg:hidden">
        <SectionHeading index={index} eyebrow="How it works" title="From the table to the kitchen, and back again." />
        <Reveal className="mt-12 flex justify-center">
          <PhoneMock sequence={HOW_SEQUENCE} interval={3000} width={250} onStateChange={(_, i) => setMobileStep(Math.max(0, i))} />
        </Reveal>
        <Reveal delay={0.1}>
          <ol className="relative mt-12 border-l border-paper/10 pl-8">
            {STEPS.map((s, i) => (
              <StepRow key={s.n} step={s} active={i === mobileStep} done={i < mobileStep} />
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}
