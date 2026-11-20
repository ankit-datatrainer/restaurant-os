/**
 * Per-device preferences for staff alerts (no React, so admin-provider can read them without an
 * import cycle). Browser permission cannot be revoked from a page, so "Turn off on this device"
 * also mutes the local system notifications the open dashboard would otherwise show.
 */
const MUTED_KEY = 'ros:alerts-muted';
export const ALERTS_CHANGED_EVENT = 'ros:alerts-changed';

export function localAlertsMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setLocalAlertsMuted(muted: boolean): void {
  try {
    if (muted) window.localStorage.setItem(MUTED_KEY, '1');
    else window.localStorage.removeItem(MUTED_KEY);
  } catch {
    /* private mode: the session simply keeps the default */
  }
}

/** Tell every alerts control on the page (topbar, Settings) to re-check its state. */
export function announceAlertsChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ALERTS_CHANGED_EVENT));
}
