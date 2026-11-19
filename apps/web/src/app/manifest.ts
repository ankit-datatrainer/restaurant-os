import type { MetadataRoute } from 'next';

/** Web app manifest so the guest menu can be added to a phone's home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Restaurant OS',
    short_name: 'Restaurant OS',
    description: 'Scan the table QR, order from your phone, track it to the table.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F7F4EE',
    theme_color: '#FF5C2A',
    icons: [{ src: '/icon.svg', type: 'image/svg+xml', sizes: 'any' }],
  };
}
