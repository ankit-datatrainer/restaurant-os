'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/**
 * False during server render and hydration, true afterwards.
 * Gate anything that depends on localStorage (cart, session) so the first client
 * render matches the server markup.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
