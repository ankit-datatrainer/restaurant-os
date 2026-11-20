/**
 * Browser notifications for guests (order updates) and staff (new orders, waiter calls).
 *
 * Two layers:
 * 1. Web Push (works with the page closed / phone locked): service worker /sw.js + a subscription
 *    saved by the API. Android Chrome: any tab. iPhone / iPad: iOS 16.4+ and only after
 *    "Add to Home Screen" (Safari tabs cannot receive push).
 * 2. Local notifications while a page is open but hidden: `notifyLocal` asks the service worker to
 *    show one (Android Chrome cannot use `new Notification()` from a page).
 *
 * Ask for permission only after a tap that explains the value (never on page load).
 */
import type { PushSubscriptionJSON } from '@restaurant-os/shared';
import { publicApi } from '@/lib/api';

export type PushSupport =
  | 'supported'
  /** iPhone/iPad Safari tab: works only after Add to Home Screen. */
  | 'ios-needs-install'
  | 'unsupported';

export type PushPermission = NotificationPermission | 'unsupported';

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported';
  const hasApis = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (isIOS() && !isStandalone()) return 'ios-needs-install';
  return hasApis ? 'supported' : 'unsupported';
}

export function permission(): PushPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

let registration: Promise<ServiceWorkerRegistration | null> | null = null;

/** Register /sw.js once per page load. Never throws. */
export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return Promise.resolve(null);
  registration ??= navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => null);
  return registration;
}

let keyCache: Promise<string | null> | null = null;
function vapidKey(): Promise<string | null> {
  keyCache ??= publicApi
    .pushConfig()
    .then((c) => (c.enabled ? c.publicKey : null))
    .catch(() => null);
  return keyCache;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Ask permission (call from a click handler) and return this browser's push subscription, or null
 * when the user said no / push is not available. The caller saves it with the right API.
 */
export async function subscribeToPush(): Promise<PushSubscriptionJSON | null> {
  if (pushSupport() !== 'supported') return null;
  // Ask first, before any other await: Safari only shows the prompt straight from the tap.
  const result = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  if (result !== 'granted') return null;
  const [key, reg] = await Promise.all([vapidKey(), registerServiceWorker()]);
  if (!reg) return null;
  // Local notifications work even when the server has no push keys.
  if (!key) return null;
  await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }));
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null;
  return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
}

/** Warm up the service worker and the server key on mount, so the tap that subscribes is quick. */
export function preparePush(): void {
  if (pushSupport() !== 'supported') return;
  void registerServiceWorker();
  void vapidKey();
}

/** The current subscription's endpoint, if this browser is subscribed. */
export async function currentEndpoint(): Promise<string | null> {
  const reg = await registerServiceWorker();
  if (!reg) return null;
  const sub = await reg.pushManager.getSubscription().catch(() => null);
  return sub?.endpoint ?? null;
}

/** Unsubscribe this browser (the caller also tells the API). Returns the old endpoint. */
export async function unsubscribeFromPush(): Promise<string | null> {
  const reg = await registerServiceWorker();
  const sub = await reg?.pushManager.getSubscription().catch(() => null);
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => undefined);
  return endpoint;
}

export interface LocalNotification {
  title: string;
  body: string;
  url: string;
  tag: string;
  requireInteraction?: boolean;
  vibrate?: number[];
}

/** System notification from an open page (shown only while the tab is hidden; visible pages use banners). */
export async function notifyLocal(n: LocalNotification): Promise<void> {
  if (typeof document === 'undefined' || document.visibilityState === 'visible') return;
  if (permission() !== 'granted') return;
  const reg = await registerServiceWorker();
  if (reg?.active) {
    reg.active.postMessage({ type: 'notify', ...n, kind: 'order', renotify: true });
    return;
  }
  try {
    new Notification(n.title, { body: n.body, tag: n.tag, icon: '/icon.svg' });
  } catch {
    /* Android without a service worker: nothing more we can do */
  }
}

/** Short buzz on phones that support it (ignored elsewhere and under reduced motion). */
export function buzz(pattern: number[] = [120]): void {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* ignored */
  }
}

/** Listen for pushes delivered while a page is open (the service worker forwards them). */
export function onPushMessage(listener: (payload: { title?: string; body?: string; url?: string; tag?: string; kind?: string }) => void): () => void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return () => undefined;
  const handler = (e: MessageEvent) => {
    if (e.data?.type === 'push') listener(e.data.payload ?? {});
  };
  navigator.serviceWorker.addEventListener('message', handler);
  return () => navigator.serviceWorker.removeEventListener('message', handler);
}
