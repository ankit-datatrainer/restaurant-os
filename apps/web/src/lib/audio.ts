'use client';

/**
 * Sound + voice for the admin dashboard. No audio files: the chimes are synthesised
 * with the Web Audio API, and announcements use the browser's SpeechSynthesis.
 *
 * Browsers block sound until the user interacts with the page, so call `unlockAudio()`
 * from a click handler (the "Start shift" / "Sound on" button) before anything else.
 */

let ctx: AudioContext | null = null;
let unlocked = false;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

export async function unlockAudio(): Promise<boolean> {
  const c = getCtx();
  if (!c) return false;
  try {
    if (c.state === 'suspended') await c.resume();
    // Play a silent blip so iOS/Safari consider audio "started".
    const osc = c.createOscillator();
    const g = c.createGain();
    g.gain.value = 0.0001;
    osc.connect(g).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + 0.01);
    unlocked = c.state === 'running';
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      // Warm up the voices list (Chrome loads it lazily).
      window.speechSynthesis.getVoices();
    }
    return unlocked;
  } catch {
    return false;
  }
}

export function isAudioUnlocked() {
  return unlocked && getCtx()?.state === 'running';
}

function tone(c: AudioContext, freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.18) {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g).connect(c.destination);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

export type ChimeKind = 'order' | 'call' | 'success' | 'tick';

/** Short, pleasant chimes. `order` = three rising notes, `call` = two-note doorbell. */
export function playChime(kind: ChimeKind = 'order') {
  const c = getCtx();
  if (!c || c.state !== 'running') return;
  const t = c.currentTime;
  switch (kind) {
    case 'order':
      tone(c, 659.25, t, 0.18); // E5
      tone(c, 830.61, t + 0.14, 0.18); // G#5
      tone(c, 1046.5, t + 0.28, 0.42); // C6
      break;
    case 'call':
      tone(c, 987.77, t, 0.35, 'triangle', 0.2); // B5
      tone(c, 783.99, t + 0.3, 0.5, 'triangle', 0.2); // G5
      break;
    case 'success':
      tone(c, 523.25, t, 0.12);
      tone(c, 783.99, t + 0.1, 0.3);
      break;
    case 'tick':
      tone(c, 1200, t, 0.06, 'square', 0.05);
      break;
  }
}

let speakQueue: string[] = [];
let speaking = false;
// Kept referenced on purpose: Chromium drops the `end` event when the utterance object is
// garbage-collected mid-speech, which would stall the queue for the rest of the shift.
let current: SpeechSynthesisUtterance | null = null;
let watchdog: number | undefined;

function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  const prefer = ['en-IN', 'en-GB', 'en-US'];
  for (const lang of prefer) {
    const v = voices.find((v) => v.lang === lang && /Google|Natural|Neural|Online/i.test(v.name)) ?? voices.find((v) => v.lang === lang);
    if (v) return v;
  }
  return voices[0] ?? null;
}

/** Speak a sentence (queued so announcements never overlap). */
export function speak(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  speakQueue.push(text);
  if (!speaking) drain();
}

function drain() {
  const next = speakQueue.shift();
  if (!next) {
    speaking = false;
    current = null;
    return;
  }
  speaking = true;
  const u = new SpeechSynthesisUtterance(next);
  const v = pickVoice();
  if (v) u.voice = v;
  u.rate = 0.98;
  u.pitch = 1;
  u.volume = 1;
  const finish = () => {
    if (current !== u) return;
    if (watchdog !== undefined) window.clearTimeout(watchdog);
    watchdog = undefined;
    current = null;
    drain();
  };
  u.onend = finish;
  u.onerror = finish;
  current = u;
  // If the browser never reports the end (background tab, lost event), cancel and move on.
  watchdog = window.setTimeout(() => {
    if (current !== u) return;
    window.speechSynthesis.cancel();
    finish();
  }, 1500 + next.length * 90);
  window.speechSynthesis.speak(u);
}

/** Drop everything queued and silence the current announcement (voice off, page unmount). */
export function stopSpeaking() {
  speakQueue = [];
  speaking = false;
  current = null;
  if (typeof window === 'undefined') return;
  if (watchdog !== undefined) window.clearTimeout(watchdog);
  watchdog = undefined;
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

/** Sentence read out for a new order, e.g. "New order 1003 from Table 1, Indoor Window. Two items, 869 rupees." */
export function orderAnnouncement(o: { order_number: number; total: number; items: Array<{ quantity: number }>; table?: { label: string; area: string | null } | null }) {
  const count = o.items.reduce((s, i) => s + i.quantity, 0);
  const where = o.table ? `${o.table.label}${o.table.area ? `, ${o.table.area}` : ''}` : 'a table';
  return `New order ${o.order_number} from ${where}. ${count} item${count === 1 ? '' : 's'}, ${Math.round(o.total)} rupees.`;
}

export function callAnnouncement(c: { type: string; table?: { label: string; area: string | null } | null }) {
  const where = c.table ? `${c.table.label}${c.table.area ? `, ${c.table.area}` : ''}` : 'a table';
  const what: Record<string, string> = {
    waiter: 'is calling a waiter',
    water: 'needs water',
    cutlery: 'needs cutlery',
    bill: 'wants the bill',
    other: 'needs help',
  };
  return `${where} ${what[c.type] ?? 'needs help'}.`;
}
