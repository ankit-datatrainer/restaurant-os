'use client';

import * as React from 'react';
import { ArrowUpRight, Bell, Camera, Gamepad2, IndianRupee, LayoutDashboard, Printer, Volume2, Wifi } from 'lucide-react';
import { Button, Reveal, SplitWords } from '@/components/ui';
import { cn } from '@/lib/utils';
import { site } from './site';

interface Point {
  icon: React.ReactNode;
  title: string;
  body: string;
}

const GUESTS: Point[] = [
  { icon: <Camera className="h-5 w-5" />, title: 'Scan, no download', body: 'The camera app opens the menu. Works on any phone from the last eight years.' },
  { icon: <Wifi className="h-5 w-5" />, title: 'Fast on 4G', body: 'A light page with photos that load as you scroll. Built for everyday Android phones.' },
  { icon: <Bell className="h-5 w-5" />, title: 'Help in one tap', body: 'Call a waiter or ask for the bill. The phone shows when someone has picked it up.' },
  { icon: <Gamepad2 className="h-5 w-5" />, title: 'Something to do while waiting', body: 'Live order status, your story video and games, Ludo included, on the same page. All optional.' },
];

const STAFF: Point[] = [
  { icon: <Volume2 className="h-5 w-5" />, title: 'Hear every order', body: 'The board chimes and reads the order aloud. Hands stay on the tawa.' },
  { icon: <LayoutDashboard className="h-5 w-5" />, title: 'One board for the floor', body: 'QR and counter orders together. Placed → accepted → preparing → ready → served. Tap to move. Everyone sees it.' },
  { icon: <Printer className="h-5 w-5" />, title: 'Paper when you want it', body: 'Print a KOT for any order. Dishes a guest adds later are marked as new.' },
  { icon: <IndianRupee className="h-5 w-5" />, title: 'Bills that add up', body: 'Numbered GST receipts with CGST and SGST. One bill per table, split across cash, UPI, card or gift card.' },
];

function Column({ eyebrow, title, points, cta, delay = 0 }: { eyebrow: string; title: string; points: Point[]; cta: React.ReactNode; delay?: number }) {
  return (
    <div>
      <Reveal as="p" className="eyebrow text-ember" delay={delay}>
        {eyebrow}
      </Reveal>
      <SplitWords as="h3" text={title} className="mt-4 text-display-sm font-bold" delay={delay} />
      <ul className="mt-8 grid gap-6">
        {points.map((p, i) => (
          <Reveal as="li" key={p.title} delay={delay + 0.08 * i} className="flex gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sunk text-ember">{p.icon}</span>
            <div>
              <p className="font-display text-lg font-semibold leading-tight">{p.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">{p.body}</p>
            </div>
          </Reveal>
        ))}
      </ul>
      <Reveal delay={delay + 0.4} className="mt-8">
        {cta}
      </Reveal>
    </div>
  );
}

/** Light "paper" band: guests on the left, staff on the right. */
export function SplitSection({ className }: { className?: string }) {
  return (
    <section className={cn('theme-light relative bg-bg py-24 text-fg md:py-32', className)}>
      <div className="container-x">
        <div className="grid gap-16 lg:grid-cols-2 lg:gap-12">
          <Column
            eyebrow="For guests"
            title="Nothing to learn. Nothing to download."
            points={GUESTS}
            cta={
              <Button href={site.demoTableUrl} external variant="dark" size="lg" rightIcon={<ArrowUpRight className="h-4 w-4" aria-hidden />}>
                Open the guest demo
              </Button>
            }
          />
          <div className="relative lg:pl-12">
            <span aria-hidden className="absolute left-0 top-0 hidden h-full w-px bg-line/10 lg:block" />
            <Column
              eyebrow="For staff"
              title="One board for the whole floor."
              points={STAFF}
              delay={0.1}
              cta={
                <Button href="/demo" variant="outline" size="lg" rightIcon={<ArrowUpRight className="h-4 w-4" aria-hidden />}>
                  Try the staff dashboard
                </Button>
              }
            />
          </div>
        </div>
      </div>
    </section>
  );
}
