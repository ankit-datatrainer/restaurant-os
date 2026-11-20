/**
 * Web app manifest for a guest page. "Add to Home Screen" on iPhone is the only way to get
 * order notifications with the phone locked, and the saved app must reopen the same table or
 * restaurant page, not the marketing home page.
 */
export function guestManifest(startUrl: string, name: string): Response {
  const body = {
    id: startUrl,
    name,
    short_name: name.length > 12 ? 'Order' : name,
    description: 'Your table, your order, live updates.',
    start_url: startUrl,
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F7F4EE',
    theme_color: '#FF5C2A',
    icons: [{ src: '/icon.svg', type: 'image/svg+xml', sizes: 'any' }],
  };
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}
