import { ChefHat, Clapperboard, MessageCircle, QrCode, Receipt, Star } from 'lucide-react';
import { TRIAL_DAYS } from '@restaurant-os/shared';

const INCLUDED = [
  { icon: QrCode, title: 'QR ordering at every table', text: 'Guests scan, order and pay from their phone. No app to install.' },
  { icon: ChefHat, title: 'Kitchen display with voice alerts', text: 'Each new order chimes and is read aloud, then moves through the kitchen in one tap.' },
  { icon: Receipt, title: 'Counter POS and GST bills', text: 'Take walk-in orders, split bills, and print CGST/SGST receipts.' },
  { icon: Clapperboard, title: 'Your story video and games', text: 'Something to watch or play while the food is on its way.' },
  { icon: Star, title: 'Google reviews', text: 'Every guest who leaves feedback sees your Google review link.' },
  { icon: MessageCircle, title: 'WhatsApp-ready CRM', text: 'Know your regulars and message the ones who said yes to offers.' },
];

/** Dark right-hand panel on /signup and /admin/setup (desktop only). */
export function SignupSidePanel() {
  return (
    <div className="relative hidden overflow-hidden bg-ink text-paper lg:flex lg:flex-col lg:justify-center lg:p-12 grain">
      <div
        className="pointer-events-none absolute -right-32 -top-32 h-[520px] w-[520px] rounded-full opacity-60 blur-3xl"
        style={{ background: 'radial-gradient(closest-side, rgba(255,92,42,0.45), transparent)' }}
        aria-hidden
      />
      <div className="relative max-w-lg">
        <p className="eyebrow text-paper/50">Included in your trial</p>
        <h2 className="mt-3 font-display text-display-sm font-semibold leading-tight">
          Every feature, <span className="font-serif italic text-ember">for {TRIAL_DAYS} days.</span>
        </h2>
        <ul className="mt-10 grid gap-5">
          {INCLUDED.map((f) => (
            <li key={f.title} className="flex items-start gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-paper/15 bg-paper/5 text-ember" aria-hidden>
                <f.icon className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold">{f.title}</p>
                <p className="mt-1 text-sm text-paper/65">{f.text}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-10 inline-flex items-center gap-2 rounded-full border border-paper/15 bg-paper/5 px-4 py-2 font-mono text-[12px] uppercase tracking-[0.14em] text-paper/80">
          <span className="h-1.5 w-1.5 rounded-full bg-mint" aria-hidden />
          No card needed. Cancel anytime.
        </p>
      </div>
    </div>
  );
}

/** Compact version for phones, shown under the form. */
export function SignupIncludedCompact() {
  return (
    <div className="mt-8 lg:hidden">
      <p className="eyebrow">Included in your {TRIAL_DAYS}-day trial</p>
      <ul className="mt-3 grid grid-cols-1 gap-2 text-sm text-muted min-[420px]:grid-cols-2">
        {INCLUDED.map((f) => (
          <li key={f.title} className="flex items-center gap-2">
            <f.icon className="h-4 w-4 shrink-0 text-ember" aria-hidden />
            <span className="min-w-0">{f.title}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted">No card needed. Cancel anytime.</p>
    </div>
  );
}
