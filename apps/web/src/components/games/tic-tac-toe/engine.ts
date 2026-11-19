/** Pure tic-tac-toe rules + a minimax "chef" opponent. No React in here. */

export type Player = 'X' | 'O';
export type Cell = Player | null;
export type Board = Cell[];
export type Line = readonly [number, number, number];

export const LINES: readonly Line[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function emptyBoard(): Board {
  return Array.from({ length: 9 }, () => null);
}

export function other(p: Player): Player {
  return p === 'X' ? 'O' : 'X';
}

export function findWinner(board: Board): { player: Player; line: Line } | null {
  for (const line of LINES) {
    const [a, b, c] = line;
    const v = board[a];
    if (v && v === board[b] && v === board[c]) return { player: v, line };
  }
  return null;
}

export function isFull(board: Board): boolean {
  return board.every((c) => c !== null);
}

export function emptyCells(board: Board): number[] {
  const out: number[] = [];
  board.forEach((c, i) => {
    if (c === null) out.push(i);
  });
  return out;
}

/** Minimax score from the AI's point of view. Faster wins and slower losses score better. */
function evaluate(board: Board, ai: Player, turn: Player, depth: number): number {
  const w = findWinner(board);
  if (w) return w.player === ai ? 10 - depth : depth - 10;
  if (isFull(board)) return 0;
  let best = turn === ai ? -Infinity : Infinity;
  for (const i of emptyCells(board)) {
    board[i] = turn;
    const s = evaluate(board, ai, other(turn), depth + 1);
    board[i] = null;
    best = turn === ai ? Math.max(best, s) : Math.min(best, s);
  }
  return best;
}

/**
 * Best move for `ai`. Ties are broken at random so games do not repeat move-for-move.
 * On an empty board it opens from a corner or the centre without searching.
 */
export function bestMove(board: Board, ai: Player): number {
  const moves = emptyCells(board);
  if (moves.length === 0) return -1;
  if (moves.length === 9) {
    const openers = [0, 2, 4, 6, 8];
    return openers[Math.floor(Math.random() * openers.length)] ?? 4;
  }
  const scratch = board.slice();
  const scored = moves.map((i) => {
    scratch[i] = ai;
    const s = evaluate(scratch, ai, other(ai), 1);
    scratch[i] = null;
    return { i, s };
  });
  const top = Math.max(...scored.map((m) => m.s));
  const candidates = scored.filter((m) => m.s === top);
  return candidates[Math.floor(Math.random() * candidates.length)]?.i ?? moves[0] ?? -1;
}
