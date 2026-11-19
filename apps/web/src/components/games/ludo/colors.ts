import type { Color } from './engine';

/** The four classic Ludo colours, tuned to the design system (ember, mint, saffron, sky). */
export const LUDO_HEX: Record<Color, string> = {
  red: '#FF5C2A',
  green: '#2FB87A',
  yellow: '#F2B33D',
  blue: '#3B7DD8',
};

export const LUDO_SOFT: Record<Color, string> = {
  red: '#FFE9E0',
  green: '#DDF5E9',
  yellow: '#FDF1D6',
  blue: '#E1ECFA',
};

/** Darker edge for token rims and text on soft backgrounds. */
export const LUDO_DEEP: Record<Color, string> = {
  red: '#B83A12',
  green: '#1B6F49',
  yellow: '#8A5A00',
  blue: '#1F5AA8',
};

/** StatChip tone per colour. */
export const LUDO_TONE = { red: 'ember', green: 'mint', yellow: 'saffron', blue: 'sky' } as const satisfies Record<Color, string>;
