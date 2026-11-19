'use client';

import * as React from 'react';
import { Star } from 'lucide-react';
import type { CustomerSummary } from '@restaurant-os/shared';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui';
import { consentState, shortDate } from './crm';

/** Five stars filled to `value` (fractions allowed), with an accessible label. */
export function Stars({ value, size = 14, className }: { value: number; size?: number; className?: string }) {
  const v = Math.max(0, Math.min(5, value));
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} role="img" aria-label={`${v.toFixed(1)} out of 5 stars`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, v - i));
        return (
          <span key={i} className="relative inline-block shrink-0" style={{ width: size, height: size }} aria-hidden>
            <Star size={size} className="absolute inset-0 text-fg/15" fill="currentColor" strokeWidth={0} />
            {fill > 0 && (
              <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star size={size} className="max-w-none text-saffron" fill="currentColor" strokeWidth={0} />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/** Average rating as stars + one decimal, or an em dash when there is none. */
export function RatingCell({ value }: { value: number | null }) {
  if (value === null || value === undefined) return <span className="text-muted">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Stars value={value} size={12} />
      <span className="tnum font-mono text-xs text-muted">{value.toFixed(1)}</span>
    </span>
  );
}

/** "Opted in · 12 Oct" (mint), "Unsubscribed · 14 Oct" (rose), or "Not opted in". */
export function ConsentBadge({ customer, className }: { customer: Pick<CustomerSummary, 'marketing_consent' | 'consent_at' | 'consent_revoked_at'>; className?: string }) {
  const state = consentState(customer);
  if (state === 'opted_in') {
    return (
      <Badge tone="mint" dot className={cn('whitespace-nowrap', className)}>
        Opted in{customer.consent_at ? ` · ${shortDate(customer.consent_at)}` : ''}
      </Badge>
    );
  }
  if (state === 'unsubscribed') {
    return (
      <Badge tone="rose" className={cn('whitespace-nowrap', className)}>
        Unsubscribed · {shortDate(customer.consent_revoked_at!)}
      </Badge>
    );
  }
  return (
    <Badge tone="neutral" className={cn('whitespace-nowrap', className)}>
      Not opted in
    </Badge>
  );
}
