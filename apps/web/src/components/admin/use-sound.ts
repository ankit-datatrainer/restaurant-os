'use client';

import * as React from 'react';
import { callAnnouncement, isAudioUnlocked, orderAnnouncement, playChime, speak, stopSpeaking, unlockAudio } from '@/lib/audio';

const STORAGE_KEY = 'ros-admin-sound';

export interface SoundControls {
  /** Chime on/off */
  enabled: boolean;
  /** Spoken announcements on/off */
  voice: boolean;
  /** Browser has allowed audio (needs a user gesture first). */
  unlocked: boolean;
  setEnabled: (v: boolean) => void;
  setVoice: (v: boolean) => void;
  /** Call from a click handler: unlocks audio and plays a confirmation chime. */
  start: () => Promise<boolean>;
  test: () => void;
  notifyOrder: (order: Parameters<typeof orderAnnouncement>[0]) => void;
  notifyCall: (call: Parameters<typeof callAnnouncement>[0]) => void;
  /** A guest added dishes to an open order. `count` = dishes in the new round, null when unknown. */
  notifyItemsAdded: (order: ItemsAddedOrder, count: number | null) => void;
}

type ItemsAddedOrder = { order_number: number; table?: { label: string; area: string | null } | null };

/** e.g. "Table 1, Indoor Window added 2 dishes to order 1003." */
export function itemsAddedAnnouncement(o: ItemsAddedOrder, count: number | null): string {
  const where = o.table ? `${o.table.label}${o.table.area ? `, ${o.table.area}` : ''}` : 'A table';
  const what = count && count > 0 ? `${count} dish${count === 1 ? '' : 'es'}` : 'dishes';
  return `${where} added ${what} to order ${o.order_number}.`;
}

/** Sound preferences persisted in localStorage (read in an effect, never during render). */
export function useSound(): SoundControls {
  const [enabled, setEnabledState] = React.useState(true);
  const [voice, setVoiceState] = React.useState(true);
  const [unlocked, setUnlocked] = React.useState(false);
  const [hydrated, setHydrated] = React.useState(false);
  const enabledRef = React.useRef(true);
  const voiceRef = React.useRef(true);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { enabled?: unknown; voice?: unknown };
        if (typeof parsed.enabled === 'boolean') {
          setEnabledState(parsed.enabled);
          enabledRef.current = parsed.enabled;
        }
        if (typeof parsed.voice === 'boolean') {
          setVoiceState(parsed.voice);
          voiceRef.current = parsed.voice;
        }
      }
    } catch {
      // Private mode or blocked storage: defaults stay.
    }
    setUnlocked(isAudioUnlocked());
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled, voice }));
    } catch {
      // ignore
    }
  }, [enabled, voice, hydrated]);

  const setEnabled = React.useCallback((v: boolean) => {
    enabledRef.current = v;
    setEnabledState(v);
  }, []);
  const setVoice = React.useCallback((v: boolean) => {
    voiceRef.current = v;
    setVoiceState(v);
    // "Voice off" means now, not after the queued announcements finish.
    if (!v) stopSpeaking();
  }, []);

  const start = React.useCallback(async () => {
    const ok = await unlockAudio();
    setUnlocked(ok);
    if (ok) playChime('success');
    return ok;
  }, []);

  const test = React.useCallback(() => {
    playChime('order');
    if (voiceRef.current) speak('Sound check. The counter is listening.');
  }, []);

  const notifyOrder = React.useCallback<SoundControls['notifyOrder']>((order) => {
    if (enabledRef.current) playChime('order');
    if (voiceRef.current) speak(orderAnnouncement(order));
  }, []);

  const notifyCall = React.useCallback<SoundControls['notifyCall']>((call) => {
    if (enabledRef.current) playChime('call');
    if (voiceRef.current) speak(callAnnouncement(call));
  }, []);

  const notifyItemsAdded = React.useCallback<SoundControls['notifyItemsAdded']>((order, count) => {
    if (enabledRef.current) playChime('order');
    if (voiceRef.current) speak(itemsAddedAnnouncement(order, count));
  }, []);

  return { enabled, voice, unlocked, setEnabled, setVoice, start, test, notifyOrder, notifyCall, notifyItemsAdded };
}
