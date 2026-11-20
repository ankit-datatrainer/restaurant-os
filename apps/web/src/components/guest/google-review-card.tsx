'use client';

import * as React from 'react';
import { ExternalLink, Star } from 'lucide-react';
import type { Restaurant } from '@restaurant-os/shared';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { safeHttpUrl } from './features';
import { useLang } from './i18n';

/**
 * "Review <restaurant> on Google": the restaurant's own Google Business review link.
 * Shown to every guest once the order is complete — never only after a good rating, and never
 * with a reward attached (Google's review policy). Renders nothing without a valid http(s) link.
 */
export function GoogleReviewCard({
  restaurant,
  id,
  quiet = false,
  className,
}: {
  restaurant: Pick<Restaurant, 'name' | 'google_review_url'>;
  id?: string;
  /** A slimmer card under the in-app rating form. */
  quiet?: boolean;
  className?: string;
}) {
  const { t, uiLang } = useLang();
  const url = safeHttpUrl(restaurant.google_review_url);
  if (!url) return null;
  return (
    <section
      id={id}
      className={cn('scroll-mt-24 rounded-3xl border border-line/10 bg-surface shadow-soft', quiet ? 'p-4' : 'p-5', className)}
      aria-label={t('Review {name} on Google', { name: restaurant.name })}
      lang={uiLang}
    >
      <div className="flex items-start gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-saffron-soft text-saffron" aria-hidden>
          <Star className="h-5 w-5 fill-saffron" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className={cn('font-display font-bold leading-tight tracking-tight', quiet ? 'text-[15px]' : 'text-[17px]')}>
            {t('Review {name} on Google', { name: restaurant.name })}
          </h2>
          <p className="mt-1 text-[13.5px] leading-relaxed text-fg/70">
            {quiet ? t('Prefer Google? Your review helps other diners find them.') : t('If you have a minute, tell other diners how it was.')}
          </p>
        </div>
      </div>
      <Button
        href={url}
        external
        variant={quiet ? 'outline' : 'primary'}
        size="lg"
        className="mt-4 w-full"
        rightIcon={<ExternalLink className="h-4 w-4 opacity-70" aria-hidden />}
      >
        {t('Review on Google')}
        <span className="sr-only">{t('(opens in a new tab)')}</span>
      </Button>
    </section>
  );
}
