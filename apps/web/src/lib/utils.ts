import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export { formatINR, orderCode, tableDisplay, minutesSince, computeTotals, buildUpiLink } from '@restaurant-os/shared';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export const demo = {
  tableCode: process.env.NEXT_PUBLIC_DEMO_TABLE_CODE ?? 'DEMO1',
  adminEmail: process.env.NEXT_PUBLIC_DEMO_ADMIN_EMAIL ?? 'demo@restaurantos.app',
  adminPassword: process.env.NEXT_PUBLIC_DEMO_ADMIN_PASSWORD ?? 'demo1234',
};

/** Absolute URL of a table's guest menu. */
export function tableUrl(code: string): string {
  return `${siteUrl}/t/${code}`;
}

export function timeAgo(iso: string, now: number = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** Random, URL-safe table code like "K7Q3M". Avoids look-alike characters. */
export function randomTableCode(len = 5): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const arr = new Uint32Array(len);
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) out += alphabet[(arr[i] ?? Math.floor(Math.random() * 1e9)) % alphabet.length];
  return out;
}
