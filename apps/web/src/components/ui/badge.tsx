import * as React from 'react';
import { cn } from '@/lib/utils';
import type { ItemBadge, OrderStatus, PaymentStatus } from '@restaurant-os/shared';
import { ITEM_BADGE_LABEL, ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from '@restaurant-os/shared';

type Tone = 'neutral' | 'ember' | 'saffron' | 'mint' | 'rose' | 'sky' | 'ink';

const tones: Record<Tone, string> = {
  neutral: 'bg-sunk text-fg/80',
  ember: 'bg-ember-soft text-ember-3',
  saffron: 'bg-saffron-soft text-[#8a5a00]',
  mint: 'bg-mint-soft text-[#1b6f49]',
  rose: 'bg-rose-soft text-[#a1282c]',
  sky: 'bg-sky-soft text-[#245a9f]',
  ink: 'bg-ink text-paper',
};

export function Badge({
  tone = 'neutral',
  className,
  dot,
  children,
}: {
  tone?: Tone;
  className?: string;
  dot?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-2xs font-medium uppercase tracking-[0.12em]',
        tones[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

const statusTone: Record<OrderStatus, Tone> = {
  placed: 'ember',
  accepted: 'sky',
  preparing: 'saffron',
  ready: 'mint',
  served: 'neutral',
  cancelled: 'rose',
};

export function OrderStatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <Badge tone={statusTone[status]} dot className={className}>
      {ORDER_STATUS_LABEL[status]}
    </Badge>
  );
}

const paymentTone: Record<PaymentStatus, Tone> = {
  pending: 'neutral',
  claimed: 'saffron',
  paid: 'mint',
  refunded: 'rose',
};

export function PaymentStatusBadge({ status, className }: { status: PaymentStatus; className?: string }) {
  return (
    <Badge tone={paymentTone[status]} className={className}>
      {PAYMENT_STATUS_LABEL[status]}
    </Badge>
  );
}

const itemBadgeTone: Record<ItemBadge, Tone> = {
  bestseller: 'saffron',
  chef_special: 'ember',
  new: 'sky',
  spicy: 'rose',
};

const ITEM_BADGE_LABEL_HI: Record<ItemBadge, string> = {
  bestseller: 'सबसे लोकप्रिय',
  chef_special: 'शेफ़ स्पेशल',
  new: 'नया',
  spicy: 'तीखा',
};

export function ItemBadgePill({ badge, className, lang = 'en' }: { badge: ItemBadge; className?: string; lang?: 'en' | 'hi' }) {
  if (lang === 'hi') {
    // Devanagari must not be uppercased or letter-spaced like the mono English label.
    return (
      <Badge tone={itemBadgeTone[badge]} className={cn('font-sans normal-case tracking-normal text-[11px]', className)}>
        <span lang="hi">{ITEM_BADGE_LABEL_HI[badge]}</span>
      </Badge>
    );
  }
  return (
    <Badge tone={itemBadgeTone[badge]} className={className}>
      {ITEM_BADGE_LABEL[badge]}
    </Badge>
  );
}

/** Indian FSSAI-style veg / non-veg mark. */
export function VegMark({ isVeg, className, size = 14 }: { isVeg: boolean; className?: string; size?: number }) {
  const color = isVeg ? '#1F8A3D' : '#A33A1A';
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-[3px] border-[1.5px] bg-white', className)}
      style={{ width: size, height: size, borderColor: color }}
      role="img"
      aria-label={isVeg ? 'Vegetarian' : 'Non-vegetarian'}
      title={isVeg ? 'Veg' : 'Non-veg'}
    >
      {isVeg ? (
        <span className="rounded-full" style={{ width: size * 0.45, height: size * 0.45, background: color }} />
      ) : (
        <span
          style={{
            width: 0,
            height: 0,
            borderLeft: `${size * 0.26}px solid transparent`,
            borderRight: `${size * 0.26}px solid transparent`,
            borderBottom: `${size * 0.46}px solid ${color}`,
          }}
        />
      )}
    </span>
  );
}
