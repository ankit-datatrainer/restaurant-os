/**
 * localStorage keys + safe read/write helpers for the table games.
 * Reads must run inside effects (never during render) so SSR markup matches the client.
 */

export const GAME_KEYS = {
  tttScorePass: 'ros.games.ttt.score.pass',
  tttScoreChef: 'ros.games.ttt.score.chef',
  memoryBest: 'ros.games.memory.best',
  reactionBest: 'ros.games.reaction.best',
  /** In-progress Ludo game (so a phone lock does not lose it). */
  ludoGame: 'ros.games.ludo.game',
  /** First-place finishes per colour. */
  ludoWins: 'ros.games.ludo.wins',
} as const;

export interface TttScore {
  x: number;
  o: number;
  draws: number;
}

export interface MemoryBest {
  ms: number;
  moves: number;
}

export const EMPTY_TTT_SCORE: TttScore = { x: 0, o: 0, draws: 0 };

export interface LudoWins {
  red: number;
  green: number;
  yellow: number;
  blue: number;
}

export const EMPTY_LUDO_WINS: LudoWins = { red: 0, green: 0, yellow: 0, blue: 0 };

export function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or blocked storage: the game still works, it just forgets.
  }
}

/** "1.2s" style timer label for the memory game. */
export function formatSeconds(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
}
