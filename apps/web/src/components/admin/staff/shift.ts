import type { StaffShift } from '@restaurant-os/shared';

/**
 * The topbar clock pill and the Attendance tab both change the signed-in member's shift.
 * Whoever changes it announces the new state so the other one updates without a refetch.
 */
export const SHIFT_EVENT = 'ros:shift-changed';

export function announceShift(openShift: StaffShift | null): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<StaffShift | null>(SHIFT_EVENT, { detail: openShift }));
}

export function onShiftChange(listener: (openShift: StaffShift | null) => void): () => void {
  const handler = (e: Event) => listener((e as CustomEvent<StaffShift | null>).detail ?? null);
  window.addEventListener(SHIFT_EVENT, handler);
  return () => window.removeEventListener(SHIFT_EVENT, handler);
}

/** Hours between two instants (open shifts count up to `now`). */
export function shiftHours(s: Pick<StaffShift, 'clock_in' | 'clock_out'>, now: number = Date.now()): number {
  const end = s.clock_out ? new Date(s.clock_out).getTime() : now;
  return Math.max(0, (end - new Date(s.clock_in).getTime()) / 3_600_000);
}

/** 7.25 → "7.25" (two decimals, for timesheets). */
export function decimalHours(h: number): string {
  return (Math.round(h * 100) / 100).toFixed(2);
}

/** 195 min → "3h 15m", 40 → "40m". */
export function durationLabel(hours: number): string {
  const mins = Math.max(0, Math.round(hours * 60));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h`;
}

/** "10:02" style clock time in India for a shift badge. */
export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
}
