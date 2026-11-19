'use client';

import * as React from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * Hosts next/image may optimise (mirrors `images.remotePatterns` in next.config.ts).
 * Anything else is rendered `unoptimized` (plain <img> semantics): the owner may paste a photo
 * from their own site or CDN, and an unlisted host must never throw in dev or 400 in production.
 */
const OPTIMISED_HOSTS = /^(images\.unsplash\.com|[^/]+\.supabase\.(co|in))$/i;

function classify(src: string): 'optimised' | 'plain' | 'invalid' {
  try {
    const u = new URL(src);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'invalid';
    return u.protocol === 'https:' && OPTIMISED_HOSTS.test(u.hostname) ? 'optimised' : 'plain';
  } catch {
    return 'invalid';
  }
}

/**
 * Dish photo with a graceful fallback (gradient + first letter) when there is no image,
 * the URL is malformed, or the remote image fails to load.
 */
export function DishImage({
  src,
  alt,
  className,
  sizes = '(max-width: 640px) 40vw, 240px',
  priority,
  isVeg,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
  isVeg?: boolean;
}) {
  // Remember which URL failed so a new URL (editor preview) gets a fresh attempt.
  const [failedSrc, setFailedSrc] = React.useState<string | null>(null);
  const kind = src ? classify(src) : 'invalid';
  const show = Boolean(src) && kind !== 'invalid' && failedSrc !== src;
  return (
    <div className={cn('relative overflow-hidden bg-sunk', className)}>
      {show ? (
        <Image
          src={src as string}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          unoptimized={kind === 'plain'}
          className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
          onError={() => setFailedSrc(src as string)}
        />
      ) : (
        <div
          className={cn(
            'flex h-full w-full items-center justify-center font-display text-3xl font-bold text-white/90',
            isVeg === false ? 'bg-gradient-to-br from-[#b84a1f] to-[#5e2612]' : 'bg-gradient-to-br from-[#2f8f5e] to-[#17402d]',
          )}
          aria-hidden
        >
          {alt.trim().charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  );
}
