'use client';

import { QRCodeSVG } from 'qrcode.react';
import { ArrowUpRight, LayoutDashboard, Monitor, Smartphone } from 'lucide-react';
import { Button, Reveal } from '@/components/ui';
import { demo } from '@/lib/utils';
import { SectionHeading } from '../section-heading';
import { site } from '../site';
import { CopyField } from './copy-field';

const SCRIPT = [
  {
    title: 'Scan the sample table QR',
    body: `Point your phone at the code above. It opens table ${site.demoTableCode} at Saffron Lane Café in the browser, with nothing to install.`,
    minute: '0:00',
  },
  {
    title: 'Browse and place an order',
    body: 'Switch the menu to हिं and back, filter veg, pick a portion, add a note. Place the order, and try adding one more dish to it afterwards.',
    minute: '0:45',
  },
  {
    title: 'Watch it land on the dashboard',
    body: 'With the staff dashboard open on this screen, the order arrives with a chime and is read aloud. Move it through accepted, preparing and ready.',
    minute: '1:45',
  },
  {
    title: 'Tap “Call waiter” on the phone',
    body: 'The call rings on the dashboard. Mark it attended and watch the phone acknowledge it. While you wait, open the games and try Ludo against the computer.',
    minute: '3:00',
  },
  {
    title: 'Rate the meal, then see the owner’s side',
    body: 'Leave a rating on the phone and see the Google review link appear. Then open Customers, Feedback and Reports in the dashboard. The demo café is on Premium, so the Premium features are there to look through too.',
    minute: '4:00',
  },
];

export function DemoHub() {
  return (
    <>
      <section className="pb-16">
        <div className="container-x grid gap-5 lg:grid-cols-2">
          {/* Guest */}
          <Reveal className="min-w-0">
            <article className="flex h-full flex-col rounded-3xl border border-paper/10 bg-ink-2/70 p-6 md:p-8">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-ember text-white">
                  <Smartphone className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="eyebrow">Card A</p>
                  <h2 className="font-display text-2xl font-bold leading-tight">Try as a guest</h2>
                </div>
              </div>
              <div className="mt-7 flex flex-col items-center gap-6 sm:flex-row sm:items-start">
                <div className="shrink-0 rounded-3xl bg-white p-3 shadow-lift">
                  <QRCodeSVG value={site.demoTableUrl} size={184} bgColor="#ffffff" fgColor="#0C0D10" level="M" title="QR code for the demo table" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-relaxed text-muted">
                    Point your phone’s camera at the code. It opens the live menu for table <span className="font-mono text-fg">{site.demoTableCode}</span> at Saffron
                    Lane Café, with 37 real dishes. Order anything; it is a demo, nothing is cooked or charged.
                  </p>
                  <CopyField label="Table link" value={site.demoTableUrl} className="mt-5" />
                  <p className="mt-3 flex items-center gap-2 font-mono text-xs text-saffron">
                    <Smartphone className="h-3.5 w-3.5" aria-hidden /> Tip: open it on your phone, not this screen.
                  </p>
                </div>
              </div>
              <div className="mt-auto pt-7">
                <Button href={site.demoTableUrl} external variant="outline" size="lg" rightIcon={<ArrowUpRight className="h-4 w-4" aria-hidden />}>
                  Open the demo table anyway
                </Button>
              </div>
            </article>
          </Reveal>

          {/* Staff */}
          <Reveal delay={0.1} className="min-w-0">
            <article className="flex h-full flex-col rounded-3xl border border-ember/40 bg-ink-2 p-6 shadow-glow md:p-8">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-paper text-ink">
                  <LayoutDashboard className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="eyebrow">Card B</p>
                  <h2 className="font-display text-2xl font-bold leading-tight">Try as staff</h2>
                </div>
              </div>
              <p className="mt-6 text-sm leading-relaxed text-muted">
                The dashboard for the same café, on the Premium plan: live orders, the kitchen view, waiter calls, customers, feedback, reports, loyalty, menu,
                tables and bills. Use the demo login below; it resets itself.
              </p>
              <div className="mt-6 grid gap-4">
                <CopyField label="Email" value={demo.adminEmail} />
                <CopyField label="Password" value={demo.adminPassword} />
              </div>
              <div className="mt-auto pt-7">
                <Button href="/admin/login?demo=1" size="lg" className="w-full sm:w-auto" rightIcon={<ArrowUpRight className="h-4 w-4" aria-hidden />}>
                  Open the staff dashboard
                </Button>
              </div>
            </article>
          </Reveal>
        </div>

        <Reveal delay={0.2} className="container-x mt-5">
          <p className="flex items-start gap-3 rounded-2xl border border-paper/10 bg-paper/[0.04] px-5 py-4 text-sm text-muted">
            <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-ember" aria-hidden />
            <span>
              <span className="font-semibold text-fg">Best experienced side by side.</span> Dashboard on this screen, the menu on your phone. You will see the order
              arrive on one while you place it on the other.
            </span>
          </p>
        </Reveal>
      </section>

      <section className="border-t border-paper/10 py-20 md:py-28">
        <div className="container-x grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <div>
            <SectionHeading index="02" eyebrow="The 5-minute live demo" title="Five steps. You’ll have seen it all." />
            <Reveal delay={0.2} className="mt-8 rounded-2xl border border-ember/30 bg-ember/[0.06] p-5">
              <p className="font-display text-lg font-semibold leading-tight">For a real meeting, we load your own menu first.</p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">Send us your menu and we’ll run these same five minutes on your dishes, your prices and your tables.</p>
              <Button href="/contact?plan=demo" size="md" className="mt-4" rightIcon={<ArrowUpRight className="h-4 w-4" aria-hidden />}>
                Book a demo with your menu
              </Button>
            </Reveal>
          </div>
          <ol className="grid gap-3">
            {SCRIPT.map((s, i) => (
              <Reveal as="li" key={s.title} delay={0.06 * i} className="flex gap-5 rounded-3xl border border-paper/10 bg-ink-2/60 p-5 md:p-6">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-ember font-mono text-sm text-ember">0{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="font-display text-lg font-semibold leading-tight">{s.title}</span>
                    <span className="tnum font-mono text-2xs uppercase tracking-[0.16em] text-muted">{s.minute}</span>
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
