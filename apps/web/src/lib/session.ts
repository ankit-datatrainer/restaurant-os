'use client';

import { GUEST_SESSION_TTL_HOURS } from '@restaurant-os/shared';

/**
 * Guest session: a random id per table visit, kept in localStorage.
 * Orders carry it so the guest (and only the guest) can look their orders up again.
 */
interface StoredSession {
  id: string;
  code: string;
  created_at: number;
  name?: string;
  /** Normalised mobile number (+91XXXXXXXXXX) the guest typed at checkout during this visit. Never the consent. */
  phone?: string;
}

const KEY = (code: string) => `ros:guest:${code.toUpperCase()}`;

/** RFC 4122 v4 id. Used for the guest session and for checkout idempotency keys. */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Fallback for very old browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function getGuestSession(code: string): StoredSession {
  const fresh = (): StoredSession => ({ id: uuid(), code: code.toUpperCase(), created_at: Date.now() });
  if (typeof window === 'undefined') return fresh();
  try {
    const raw = window.localStorage.getItem(KEY(code));
    if (raw) {
      const s = JSON.parse(raw) as StoredSession;
      const ageHours = (Date.now() - s.created_at) / 3_600_000;
      if (s.id && ageHours < GUEST_SESSION_TTL_HOURS) return s;
    }
  } catch {
    /* ignore */
  }
  const s = fresh();
  try {
    window.localStorage.setItem(KEY(code), JSON.stringify(s));
  } catch {
    /* ignore */
  }
  return s;
}

function save(code: string, s: StoredSession) {
  try {
    window.localStorage.setItem(KEY(code), JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function setGuestName(code: string, name: string) {
  const s = getGuestSession(code);
  s.name = name.trim() || undefined;
  save(code, s);
}

/** Remember (or, with an empty value, forget) the guest's mobile number for this table visit. */
export function setGuestPhone(code: string, phone: string | null) {
  const s = getGuestSession(code);
  s.phone = phone?.trim() || undefined;
  save(code, s);
}

export function resetGuestSession(code: string) {
  try {
    window.localStorage.removeItem(KEY(code));
  } catch {
    /* ignore */
  }
}
