/**
 * Ludo rules engine. Pure functions, no React, no randomness except `rollDie()`.
 *
 * Board: 15×15 grid, (row, col) from the top-left. Four yards in the corners
 * (red top-left, green top-right, yellow bottom-right, blue bottom-left), a 52-square
 * cross-shaped track walked clockwise, a 5-square home column per colour and the centre home.
 *
 * A token's position is its `progress` along its own route:
 *   -1        in the yard
 *   0..50     on the shared track (0 = the colour's start square)
 *   51..55    in the colour's home column
 *   56        home (finished)
 *
 * Rules implemented:
 * - roll a 6 to bring a token out of the yard onto its start square;
 * - a 6 earns another roll; three 6s in a row forfeit the turn;
 * - landing on an opponent outside a safe square sends it back to its yard and earns another roll;
 * - start squares and star squares are safe;
 * - a token needs the exact roll to reach home;
 * - first to bring all four tokens home wins; the rest may keep playing for the next places.
 * - with no legal move the turn passes (after a 6 the player still rolls again).
 */

export const COLORS = ['red', 'green', 'yellow', 'blue'] as const;
export type Color = (typeof COLORS)[number];

export const COLOR_LABEL: Record<Color, string> = { red: 'Red', green: 'Green', yellow: 'Yellow', blue: 'Blue' };

export type SeatKind = 'human' | 'computer';
export interface Seat {
  color: Color;
  kind: SeatKind;
}

export type Phase = 'roll' | 'move' | 'winner' | 'over';

export interface GameState {
  version: 1;
  /** Seats in play, in turn order (clockwise). */
  seats: Seat[];
  /** progress of the four tokens of every colour (colours not in play stay in the yard). */
  tokens: Record<Color, number[]>;
  /** Index into `seats`. */
  turn: number;
  /** The die value waiting to be used (phase "move"). */
  dice: number | null;
  /** The last value rolled (kept for the die face). */
  lastRoll: number | null;
  /** Consecutive 6s rolled by the current player this turn. */
  sixes: number;
  phase: Phase;
  /** Colours in the order they brought all four tokens home. */
  finished: Color[];
  /** Total rolls so far (handy as an animation key). */
  rollCount: number;
}

export interface Capture {
  color: Color;
  token: number;
}

export type GameEvent =
  | { type: 'rolled'; color: Color; value: number }
  | { type: 'no-move'; color: Color; value: number; rollAgain: boolean }
  | { type: 'three-sixes'; color: Color }
  | {
      type: 'moved';
      color: Color;
      token: number;
      from: number;
      to: number;
      value: number;
      captured: Capture[];
      /** The same player rolls again (rolled a 6 or captured). */
      extraTurn: boolean;
      /** The token reached home. */
      tokenHome: boolean;
      /** 1 = first place, 2 = second… when this move brought the last token home. */
      place: number | null;
      /** The colour that finished last when the game ended. */
      lastPlace: Color | null;
    };

export interface StepResult {
  state: GameState;
  event: GameEvent;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export type Cell = readonly [row: number, col: number];

export const TRACK_LENGTH = 52;
export const LAST_TRACK = 50;
export const HOME = 56;

function segment(from: Cell, to: Cell): Cell[] {
  const out: Cell[] = [];
  const dr = Math.sign(to[0] - from[0]);
  const dc = Math.sign(to[1] - from[1]);
  let r = from[0];
  let c = from[1];
  for (;;) {
    out.push([r, c]);
    if (r === to[0] && c === to[1]) break;
    r += dr;
    c += dc;
  }
  return out;
}

/** The 52 shared squares, clockwise, starting at red's start square (6,1). */
export const TRACK: readonly Cell[] = [
  ...segment([6, 1], [6, 5]),
  ...segment([5, 6], [0, 6]),
  [0, 7],
  ...segment([0, 8], [5, 8]),
  ...segment([6, 9], [6, 14]),
  [7, 14],
  ...segment([8, 14], [8, 9]),
  ...segment([9, 8], [14, 8]),
  [14, 7],
  ...segment([14, 6], [9, 6]),
  ...segment([8, 5], [8, 0]),
  [7, 0],
  [6, 0],
];

/** Track index of each colour's start square. */
export const START: Record<Color, number> = { red: 0, green: 13, yellow: 26, blue: 39 };

/** Start squares and the star square eight steps past each start. */
export const SAFE_SQUARES: ReadonlySet<number> = new Set(COLORS.flatMap((c) => [START[c], (START[c] + 8) % TRACK_LENGTH]));
export const STAR_SQUARES: ReadonlySet<number> = new Set(COLORS.map((c) => (START[c] + 8) % TRACK_LENGTH));

/** The 5 home-column squares of each colour, from the track towards the centre. */
export const HOME_COLUMN: Record<Color, readonly Cell[]> = {
  red: segment([7, 1], [7, 5]),
  green: segment([1, 7], [5, 7]),
  yellow: segment([7, 13], [7, 9]),
  blue: segment([13, 7], [9, 7]),
};

/** Top-left corner of each 6×6 yard. */
export const YARD_ORIGIN: Record<Color, Cell> = { red: [0, 0], green: [0, 9], yellow: [9, 9], blue: [9, 0] };

/** Token resting spots inside a yard (fractional cells, relative to the yard origin). */
const YARD_SPOTS: readonly Cell[] = [
  [1.5, 1.5],
  [1.5, 3.5],
  [3.5, 1.5],
  [3.5, 3.5],
];

/** Finished tokens gather in their colour's triangle of the centre. */
const HOME_SPOT: Record<Color, Cell> = { red: [7, 6.35], green: [6.35, 7], yellow: [7, 7.65], blue: [7.65, 7] };

/** Absolute track index for a colour's progress, or null when off the shared track. */
export function trackIndex(color: Color, progress: number): number | null {
  if (progress < 0 || progress > LAST_TRACK) return null;
  return (START[color] + progress) % TRACK_LENGTH;
}

/** Where to draw a token (fractional row/col of the cell's top-left corner; add 0.5 for its centre). */
export function tokenCell(color: Color, progress: number, token: number): Cell {
  if (progress < 0) {
    const [r0, c0] = YARD_ORIGIN[color];
    const [r, c] = YARD_SPOTS[token] ?? YARD_SPOTS[0]!;
    return [r0 + r - 0.5, c0 + c - 0.5];
  }
  if (progress >= HOME) {
    const [r, c] = HOME_SPOT[color];
    const dr = token < 2 ? -0.2 : 0.2;
    const dc = token % 2 === 0 ? -0.2 : 0.2;
    return [r + dr - 0.5, c + dc - 0.5];
  }
  if (progress > LAST_TRACK) return HOME_COLUMN[color][progress - LAST_TRACK - 1]!;
  return TRACK[trackIndex(color, progress)!]!;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

/** Which colours play for a given number of players (two players sit opposite each other). */
export function colorsFor(count: number): Color[] {
  if (count <= 2) return ['red', 'yellow'];
  if (count === 3) return ['red', 'green', 'yellow'];
  return [...COLORS];
}

export function newGame(seats: Seat[]): GameState {
  const ordered = [...seats].sort((a, b) => COLORS.indexOf(a.color) - COLORS.indexOf(b.color));
  return {
    version: 1,
    seats: ordered,
    tokens: { red: [-1, -1, -1, -1], green: [-1, -1, -1, -1], yellow: [-1, -1, -1, -1], blue: [-1, -1, -1, -1] },
    turn: 0,
    dice: null,
    lastRoll: null,
    sixes: 0,
    phase: 'roll',
    finished: [],
    rollCount: 0,
  };
}

/** Default: two players, you (red) against the computer (yellow). */
export function defaultSeats(): Seat[] {
  return [
    { color: 'red', kind: 'human' },
    { color: 'yellow', kind: 'computer' },
  ];
}

export function rollDie(): number {
  return 1 + Math.floor(Math.random() * 6);
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function currentSeat(s: GameState): Seat {
  return s.seats[s.turn] ?? s.seats[0]!;
}

function canMove(progress: number, value: number): boolean {
  if (progress >= HOME) return false;
  if (progress < 0) return value === 6;
  return progress + value <= HOME;
}

/** Token indices the current player may move with `value` (defaults to the pending die). */
export function legalMoves(s: GameState, value: number | null = s.dice): number[] {
  if (value === null) return [];
  const color = currentSeat(s).color;
  return s.tokens[color].flatMap((p, i) => (canMove(p, value) ? [i] : []));
}

export function destination(progress: number, value: number): number {
  return progress < 0 ? 0 : progress + value;
}

/** Steps a token still needs to get home. */
export function stepsToHome(progress: number): number {
  return progress < 0 ? HOME + 1 : HOME - progress;
}

export function isFinished(s: GameState, color: Color): boolean {
  return s.tokens[color].every((p) => p >= HOME);
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

function nextTurnIndex(s: GameState, from: number): number {
  const n = s.seats.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    if (!s.finished.includes(s.seats[i]!.color)) return i;
  }
  return from;
}

function passTurn(s: GameState): GameState {
  return { ...s, turn: nextTurnIndex(s, s.turn), dice: null, sixes: 0, phase: 'roll' };
}

/** Apply a die roll for the current player. */
export function applyRoll(s: GameState, value: number): StepResult {
  const color = currentSeat(s).color;
  const base: GameState = { ...s, lastRoll: value, rollCount: s.rollCount + 1 };
  if (s.phase !== 'roll') return { state: s, event: { type: 'rolled', color, value } };

  const sixes = value === 6 ? s.sixes + 1 : 0;
  if (sixes >= 3) {
    return { state: passTurn(base), event: { type: 'three-sixes', color } };
  }
  const moves = legalMoves(base, value);
  if (moves.length === 0) {
    if (value === 6) {
      return { state: { ...base, dice: null, sixes, phase: 'roll' }, event: { type: 'no-move', color, value, rollAgain: true } };
    }
    return { state: passTurn(base), event: { type: 'no-move', color, value, rollAgain: false } };
  }
  return { state: { ...base, dice: value, sixes, phase: 'move' }, event: { type: 'rolled', color, value } };
}

/** Opponent tokens that would be captured if `color` landed on `progress`. */
export function capturesAt(s: GameState, color: Color, progress: number): Capture[] {
  const idx = trackIndex(color, progress);
  if (idx === null || SAFE_SQUARES.has(idx)) return [];
  const out: Capture[] = [];
  for (const seat of s.seats) {
    if (seat.color === color) continue;
    s.tokens[seat.color].forEach((p, token) => {
      if (trackIndex(seat.color, p) === idx) out.push({ color: seat.color, token });
    });
  }
  return out;
}

/** Move one of the current player's tokens by the pending die. Illegal moves return the state unchanged. */
export function applyMove(s: GameState, token: number): StepResult {
  const seat = currentSeat(s);
  const color = seat.color;
  const value = s.dice;
  const from = s.tokens[color][token];
  if (s.phase !== 'move' || value === null || from === undefined || !canMove(from, value)) {
    return { state: s, event: { type: 'rolled', color, value: value ?? 0 } };
  }

  const to = destination(from, value);
  const captured = capturesAt(s, color, to);
  const tokens: Record<Color, number[]> = {
    red: [...s.tokens.red],
    green: [...s.tokens.green],
    yellow: [...s.tokens.yellow],
    blue: [...s.tokens.blue],
  };
  tokens[color][token] = to;
  for (const c of captured) tokens[c.color][c.token] = -1;

  let next: GameState = { ...s, tokens, dice: null };
  const tokenHome = to >= HOME;
  let place: number | null = null;
  let lastPlace: Color | null = null;
  let extraTurn = false;

  if (tokens[color].every((p) => p >= HOME)) {
    const finished = [...s.finished, color];
    place = finished.length;
    next = { ...next, finished };
    const remaining = next.seats.filter((x) => !finished.includes(x.color));
    if (remaining.length <= 1) {
      if (remaining[0]) {
        lastPlace = remaining[0].color;
        next = { ...next, finished: [...finished, remaining[0].color] };
      }
      next = { ...next, phase: 'over', sixes: 0 };
    } else {
      next = passTurn(next);
      // The first winner pauses the game so the table can decide to keep playing.
      if (place === 1) next = { ...next, phase: 'winner' };
    }
  } else if (value === 6 || captured.length > 0) {
    extraTurn = true;
    next = { ...next, phase: 'roll', sixes: value === 6 ? s.sixes : 0 };
  } else {
    next = passTurn(next);
  }

  return { state: next, event: { type: 'moved', color, token, from, to, value, captured, extraTurn, tokenHome, place, lastPlace } };
}

/** "Keep playing for 2nd place" after the first winner. */
export function continueGame(s: GameState): GameState {
  return s.phase === 'winner' ? { ...s, phase: 'roll' } : s;
}

// ---------------------------------------------------------------------------
// Computer player
// ---------------------------------------------------------------------------

/** Could an opponent land on this track square with one roll? */
function threatened(s: GameState, color: Color, progress: number): boolean {
  const idx = trackIndex(color, progress);
  if (idx === null || SAFE_SQUARES.has(idx)) return false;
  for (const seat of s.seats) {
    if (seat.color === color || s.finished.includes(seat.color)) continue;
    const relTarget = (idx - START[seat.color] + TRACK_LENGTH) % TRACK_LENGTH;
    if (relTarget > LAST_TRACK) continue; // that colour turns into its home column before reaching it
    for (const p of s.tokens[seat.color]) {
      if (p < 0 || p > LAST_TRACK) continue;
      const dist = relTarget - p;
      if (dist >= 1 && dist <= 6) return true;
    }
  }
  return false;
}

/**
 * Simple, readable priorities: capture, then reach home / the home column, then leave the yard,
 * then move the most advanced token that ends up safe (or escapes a threat).
 */
export function chooseComputerMove(s: GameState): number | null {
  const moves = legalMoves(s);
  if (moves.length === 0 || s.dice === null) return null;
  const color = currentSeat(s).color;
  const value = s.dice;
  let best = moves[0]!;
  let bestScore = -Infinity;
  for (const token of moves) {
    const from = s.tokens[color][token]!;
    const to = destination(from, value);
    const caps = capturesAt(s, color, to);
    let score = 0;
    if (caps.length > 0) score += 10_000 + Math.max(...caps.map((c) => s.tokens[c.color][c.token]!)) * 10;
    else if (to >= HOME) score += 8_000;
    else if (from <= LAST_TRACK && to > LAST_TRACK) score += 6_000;
    else if (from < 0) score += 5_000;
    else {
      score += from * 10; // most advanced first
      const idx = trackIndex(color, to);
      if (to > LAST_TRACK || (idx !== null && SAFE_SQUARES.has(idx))) score += 600;
      if (threatened(s, color, to)) score -= 900;
      if (threatened(s, color, from)) score += 400;
    }
    if (score > bestScore) {
      bestScore = score;
      best = token;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const isProgress = (x: unknown) => typeof x === 'number' && Number.isInteger(x) && x >= -1 && x <= HOME;

/** Validates a saved game from localStorage; anything unexpected is rejected. */
export function parseSavedGame(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<GameState>;
  if (s.version !== 1 || !Array.isArray(s.seats) || s.seats.length < 2 || s.seats.length > 4) return null;
  if (!s.seats.every((x) => x && COLORS.includes(x.color) && (x.kind === 'human' || x.kind === 'computer'))) return null;
  if (!s.tokens || !COLORS.every((c) => Array.isArray(s.tokens![c]) && s.tokens![c].length === 4 && s.tokens![c].every(isProgress))) return null;
  if (typeof s.turn !== 'number' || s.turn < 0 || s.turn >= s.seats.length) return null;
  if (!['roll', 'move', 'winner', 'over'].includes(s.phase as string)) return null;
  if (!Array.isArray(s.finished) || !s.finished.every((c) => COLORS.includes(c))) return null;
  const dice = typeof s.dice === 'number' && s.dice >= 1 && s.dice <= 6 ? s.dice : null;
  const state: GameState = {
    version: 1,
    seats: s.seats,
    tokens: s.tokens,
    turn: s.turn,
    dice,
    lastRoll: typeof s.lastRoll === 'number' ? s.lastRoll : null,
    sixes: typeof s.sixes === 'number' ? s.sixes : 0,
    phase: s.phase as Phase,
    finished: s.finished,
    rollCount: typeof s.rollCount === 'number' ? s.rollCount : 0,
  };
  // A "move" phase without a die (or without a legal move) cannot continue: go back to rolling.
  if (state.phase === 'move' && legalMoves(state).length === 0) return { ...state, phase: 'roll', dice: null };
  return state;
}
