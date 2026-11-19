'use client';

/**
 * Customer-facing display: a second window (or a second screen on the counter PC) at
 * /admin/display listens on a BroadcastChannel; the POS, floor and settle sheet post to it.
 * BroadcastChannel only reaches tabs of the same browser on the same device, which is exactly
 * the counter setup. Nothing here touches the network.
 */
import * as React from 'react';
import type { Restaurant } from '@restaurant-os/shared';

export const CUSTOMER_DISPLAY_CHANNEL = 'ros-customer-display';

export interface DisplayLine {
  name: string;
  qty: number;
  amount: number;
}

export interface DisplayBreakdownRow {
  label: string;
  /** Negative for discounts. */
  amount: number;
}

export type CustomerDisplayMessage =
  | { type: 'idle'; restaurantName?: string; logoUrl?: string | null }
  | {
      type: 'bill';
      restaurantName: string;
      billLabel: string;
      lines: DisplayLine[];
      /** Amount the guest pays now (bill total + tip). */
      total: number;
      upiLink: string | null;
      /** Optional subtotal / discount / service charge / GST / tip rows under the lines. */
      breakdown?: DisplayBreakdownRow[];
    }
  | { type: 'paid'; total: number }
  /** Sent by a display when it opens, so an open counter tab can tell it the restaurant name. */
  | { type: 'hello' };

export function displaySupported(): boolean {
  return typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined';
}

/** Post one message to every open display. Returns false when the browser has no BroadcastChannel. */
export function postToDisplay(msg: CustomerDisplayMessage): boolean {
  if (!displaySupported()) return false;
  try {
    const ch = new BroadcastChannel(CUSTOMER_DISPLAY_CHANNEL);
    ch.postMessage(msg);
    ch.close();
    return true;
  } catch {
    return false;
  }
}

/** Listen for display messages; returns the unsubscribe function. */
export function subscribeToDisplay(handler: (msg: CustomerDisplayMessage) => void): () => void {
  if (!displaySupported()) return () => {};
  const ch = new BroadcastChannel(CUSTOMER_DISPLAY_CHANNEL);
  ch.onmessage = (e: MessageEvent) => {
    const data = e.data as CustomerDisplayMessage | null;
    if (data && typeof data === 'object' && typeof data.type === 'string') handler(data);
  };
  return () => ch.close();
}

export function idleMessage(restaurant: Pick<Restaurant, 'name' | 'logo_url'>): CustomerDisplayMessage {
  return { type: 'idle', restaurantName: restaurant.name, logoUrl: restaurant.logo_url };
}

/**
 * Mount on counter screens (POS, floor): when a display opens and says hello, answer with the
 * restaurant name so its welcome screen is branded without the display fetching anything.
 */
export function useDisplayResponder(restaurant: Pick<Restaurant, 'name' | 'logo_url'>) {
  const ref = React.useRef(restaurant);
  ref.current = restaurant;
  React.useEffect(
    () =>
      subscribeToDisplay((msg) => {
        if (msg.type === 'hello') postToDisplay(idleMessage(ref.current));
      }),
    [],
  );
}

/** Open the display in a new window sized for a second screen. */
export function openDisplayWindow() {
  if (typeof window === 'undefined') return;
  window.open('/admin/display', 'ros-customer-display', 'popup=yes,width=1024,height=700');
}
