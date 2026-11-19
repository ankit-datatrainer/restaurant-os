import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import type { RestaurantPageResponse } from '@restaurant-os/shared';
import { RestaurantShell } from '@/components/restaurant/restaurant-provider';

export const viewport: Viewport = {
  themeColor: '#F7F4EE',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

const API = (process.env.API_PROXY_TARGET ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');

/** Name, tagline and cover for the page title and link previews. Cached for 5 minutes; never blocks the page for long. */
async function fetchRestaurant(slug: string): Promise<RestaurantPageResponse['restaurant'] | null> {
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) return null;
  try {
    const res = await fetch(`${API}/api/public/restaurants/${encodeURIComponent(slug)}`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as RestaurantPageResponse;
    return data.restaurant ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const r = await fetchRestaurant(slug.toLowerCase());
  if (!r) {
    return { title: 'Order takeaway or book a table', description: 'See the menu, order for pickup and book a table.' };
  }
  const actions = [r.takeaway_enabled ? 'order takeaway' : null, r.reservations_enabled ? 'book a table' : null].filter(Boolean).join(' or ');
  const description = [r.tagline, r.address, actions ? `See the menu and ${actions} online.` : 'See the menu.'].filter(Boolean).join(' · ');
  return {
    title: r.name,
    description,
    openGraph: {
      title: r.name,
      description,
      type: 'website',
      images: r.cover_url ? [{ url: r.cover_url }] : undefined,
    },
  };
}

/** Public restaurant page shell (/r/[slug] and /r/[slug]/orders): light theme, data loads client-side. */
export default async function RestaurantLayout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <RestaurantShell slug={slug}>{children}</RestaurantShell>;
}
