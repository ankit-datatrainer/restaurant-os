import { demo, tableUrl } from '@/lib/utils';

/** Static site facts used across the marketing pages. */
export const site = {
  name: 'Restaurant OS',
  tagline: 'From the first order to the next visit.',
  category: 'QR ordering, POS, billing & inventory in one',
  /* Contact details — replace with the real ones before launch. */
  email: 'hello@restaurantos.app',
  whatsapp: '+91 98 7654 3210',
  location: 'Bengaluru, India',
  hours: 'Mon–Sat, 10:00–19:00 IST',
  demoTableUrl: tableUrl(demo.tableCode),
  demoTableCode: demo.tableCode,
} as const;

export const NAV_LINKS = [
  { href: '/features', label: 'Features' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/restaurants', label: 'Restaurants' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
  { href: '/demo', label: 'Demo' },
] as const;

export const FOOTER_COLUMNS = [
  {
    title: 'Product',
    links: [
      { href: '/features', label: 'Features' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/pricing#founding', label: 'Founding partners' },
      { href: '/signup', label: 'Start free trial' },
      { href: '/demo', label: 'Live demo' },
      { href: '/#how', label: 'How it works' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/restaurants', label: 'Restaurants' },
      { href: '/contact', label: 'Contact' },
      { href: '/about#roadmap', label: 'Roadmap' },
      { href: '/privacy', label: 'Privacy' },
    ],
  },
  {
    title: 'Open',
    links: [
      { href: '/admin/login', label: 'Staff login' },
      { href: '/demo', label: 'Demo as staff' },
      { href: site.demoTableUrl, label: 'Demo table (guest)', external: true },
    ],
  },
] as const;
