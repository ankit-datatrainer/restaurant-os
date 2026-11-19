import { cn } from '@/lib/utils';

const ITEMS = [
  'Counter POS',
  'Live floor view',
  'Split payments',
  'GST receipts',
  'Table reservations',
  'Online takeaway',
  'Inventory and recipes',
  'Profit & loss',
  'Customer CRM',
  'WhatsApp offers, opt-in only',
  'Feedback + Google review link',
  'Add dishes to an open order',
  'EN / हिं menu',
  'Loyalty rewards',
  'Ludo while you wait',
  'Reports and CSV export',
  'Webhooks for your POS',
  'Waiter calls, acknowledged',
  'KOT printing',
  'Voice alerts',
  'Cash close',
  'No app to install',
];

/**
 * Infinite strip. Pure CSS animation (.animate-marquee moves -50%), content duplicated for a seamless loop,
 * pauses on hover, stops entirely under reduced motion.
 */
export function Marquee({ className, items = ITEMS }: { className?: string; items?: readonly string[] }) {
  return (
    <div className={cn('hairline-t hairline-b relative overflow-hidden py-5 md:py-6', className)}>
      <p className="sr-only">{items.join('. ')}.</p>
      <div className="mask-fade-x flex w-max animate-marquee [animation-duration:80s] hover:[animation-play-state:paused] motion-reduce:animate-none" aria-hidden>
        {[0, 1].map((dup) =>
          items.map((t, i) => (
            <span
              key={`${dup}-${i}`}
              className="flex items-center gap-6 whitespace-nowrap pr-6 font-display text-xl font-medium tracking-tight text-fg/85 md:text-2xl"
            >
              <span className="h-2 w-2 rounded-full bg-ember" />
              {t}
            </span>
          )),
        )}
      </div>
    </div>
  );
}
