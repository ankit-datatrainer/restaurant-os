'use client';

import { create } from 'zustand';

interface CartBumpState {
  /** Increments every time something is added; the cart bar pulses when it changes. */
  n: number;
  bump: () => void;
}

export const useCartBump = create<CartBumpState>((set) => ({
  n: 0,
  bump: () => set((s) => ({ n: s.n + 1 })),
}));
