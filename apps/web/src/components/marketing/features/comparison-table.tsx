'use client';

import { Check, X } from 'lucide-react';
import { Reveal } from '@/components/ui';
import { SectionHeading } from '../section-heading';

const ROWS: Array<{ label: string; paper: string; os: string }> = [
  { label: 'Getting the menu', paper: 'Wait for a waiter. One copy for six people.', os: 'Scan. The menu is on every phone in three seconds.' },
  { label: 'Reading it in Hindi', paper: 'A second printed menu, if anyone made one.', os: 'One tap on EN / हिं switches dishes and descriptions.' },
  { label: 'Placing an order', paper: 'Wave, shout, repeat. Someone writes it down.', os: 'Tap. It reaches the counter in under a second.' },
  { label: 'Mistakes', paper: 'Misheard, mis-written, forgotten on a notepad.', os: 'Exactly what the guest chose, with options and notes.' },
  { label: 'Knowing when it is ready', paper: 'Walk to the counter and ask.', os: 'Status on the phone. A “ready” alert.' },
  { label: 'Asking for water or the bill', paper: 'Make eye contact and hope.', os: 'One tap. It rings for staff, and the phone shows when someone is on the way.' },
  { label: 'The bill', paper: 'Hand-written. GST worked out later.', os: 'Itemised, CGST + SGST, GSTIN on top, UPI pre-filled.' },
  { label: 'Splitting the bill', paper: 'A calculator passed around the table.', os: 'One bill, split across cash, UPI, card and gift card.' },
  { label: 'Closing the day', paper: 'Count the drawer and hope it matches the notebook.', os: 'Expected vs counted cash, with the variance recorded.' },
  { label: 'Changing a price', paper: 'Reprint and laminate forty menus.', os: 'Edit once. Live on every table instantly.' },
  { label: 'A dish runs out', paper: 'Guests order it anyway and are disappointed.', os: 'Toggle availability. It disappears from the menu.' },
  { label: 'Running out of paneer', paper: 'Found out halfway through Saturday dinner.', os: 'A low-stock alert from your recipes, before service (Premium).' },
  { label: 'Knowing who came back', paper: 'A face someone half remembers.', os: 'A profile with visits, spend and rating, for guests who left a number.' },
  { label: 'Rewarding regulars', paper: 'A stamp card that gets lost in a wallet.', os: 'Every Nth visit unlocks a reward code on their phone (Premium).' },
  { label: 'Asking for a review', paper: 'Only when the table looks happy.', os: 'Every guest who rates sees your Google link. No gating.' },
];

export function ComparisonTable({ index = '05' }: { index?: string }) {
  return (
    <section className="border-t border-paper/10 py-20 md:py-28">
      <div className="container-x">
        <SectionHeading index={index} eyebrow="Side by side" title="Paper and notepads vs Restaurant OS." lede="The same dinner, two ways." />
        <Reveal className="mt-12 overflow-hidden rounded-3xl border border-paper/10">
          <div className="hidden grid-cols-[1.1fr_1fr_1fr] bg-paper/[0.04] font-mono text-2xs uppercase tracking-[0.16em] text-muted md:grid">
            <span className="px-6 py-4">Moment</span>
            <span className="px-6 py-4">Paper and notepad</span>
            <span className="px-6 py-4 text-ember">Restaurant OS</span>
          </div>
          <ul>
            {ROWS.map((r, i) => (
              <Reveal as="li" key={r.label} delay={0.03 * i} className="grid gap-3 border-t border-paper/10 p-5 md:grid-cols-[1.1fr_1fr_1fr] md:gap-0 md:p-0">
                <p className="font-display text-lg font-semibold leading-tight md:px-6 md:py-5">{r.label}</p>
                <p className="flex items-start gap-2.5 text-sm text-muted md:px-6 md:py-5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose/15 text-rose">
                    <X className="h-3 w-3" strokeWidth={3} aria-hidden />
                  </span>
                  <span>
                    <span className="font-mono text-2xs uppercase tracking-[0.14em] text-muted md:hidden">Paper · </span>
                    {r.paper}
                  </span>
                </p>
                <p className="flex items-start gap-2.5 text-sm text-fg/90 md:bg-ember/[0.04] md:px-6 md:py-5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mint/20 text-mint">
                    <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                  </span>
                  <span>
                    <span className="font-mono text-2xs uppercase tracking-[0.14em] text-ember md:hidden">Restaurant OS · </span>
                    {r.os}
                  </span>
                </p>
              </Reveal>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
