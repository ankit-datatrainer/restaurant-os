'use client';

import { uuid } from '@/lib/session';

/**
 * Takeaway identity per restaurant on this phone: a random id the orders carry, so this phone
 * (and only this phone) can list its takeaway orders. Kept much longer than a table visit,
 * because a pickup may be scheduled days ahead. Name and number are remembered for next time.
 */
export interface TakeawaySession {
  id: string;
  created_at: number;
  name?: string;
  /** Normalised +91XXXXXXXXXX. */
  phone?: string;
}

const KEY = (slug: string) => `ros:takeaway:${slug.toLowerCase()}`;
const TTL_MS = 30 * 24 * 3_600_000;

export function getTakeawaySession(slug: string): TakeawaySession {
  const fresh = (): TakeawaySession => ({ id: uuid(), created_at: Date.now() });
  if (typeof window === 'undefined') return fresh();
  try {
    const raw = window.localStorage.getItem(KEY(slug));
    if (raw) {
      const s = JSON.parse(raw) as TakeawaySession;
      if (s.id && Date.now() - s.created_at < TTL_MS) return s;
    }
  } catch {
    /* ignore */
  }
  const s = fresh();
  save(slug, s);
  return s;
}

function save(slug: string, s: TakeawaySession) {
  try {
    window.localStorage.setItem(KEY(slug), JSON.stringify(s));
  } catch {
    /* private mode: lasts for this page only */
  }
}

/** Remember the name and number used at checkout or for a booking. */
export function rememberContact(slug: string, contact: { name?: string; phone?: string | null }) {
  const s = getTakeawaySession(slug);
  if (contact.name !== undefined) s.name = contact.name.trim() || undefined;
  if (contact.phone !== undefined) s.phone = contact.phone?.trim() || undefined;
  save(slug, s);
}

/** "+919845012345" → "98450 12345" for a field with a +91 prefix. */
export function phoneForInput(phone: string | undefined): string {
  if (!phone) return '';
  const m = /^\+91(\d{5})(\d{5})$/.exec(phone);
  return m ? `${m[1]} ${m[2]}` : phone;
}
