/** เกมเรียง 5 (Gomoku) กระดาน 15x15 — เรียง 5 ตัวติดกันก่อนชนะ */

export type Seat = 0 | 1;

export type GomokuState = {
  board: string[]; // 225: "" | "b" | "w"
  turn: Seat;
  last: number | null;
};

export type GomokuMove = { index: number };

export type Outcome = {
  ok: true;
  state: GomokuState;
  over: boolean;
  result: "win" | "draw" | null;
  winnerSeat: Seat | null;
  note: string;
  check: boolean;
};

export const GOMOKU_SIZE = 15;

export function initialGomoku(): GomokuState {
  return { board: Array<string>(GOMOKU_SIZE * GOMOKU_SIZE).fill(""), turn: 0, last: null };
}

function stoneFor(seat: Seat): string {
  return seat === 0 ? "b" : "w";
}

const DIRECTIONS: Array<[number, number]> = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

export function winningLine(board: string[], index: number): number[] | null {
  const stone = board[index];
  if (!stone) return null;
  const row = Math.floor(index / GOMOKU_SIZE);
  const col = index % GOMOKU_SIZE;
  for (const [dr, dc] of DIRECTIONS) {
    const line = [index];
    for (const sign of [-1, 1]) {
      let r = row + dr * sign;
      let c = col + dc * sign;
      while (r >= 0 && r < GOMOKU_SIZE && c >= 0 && c < GOMOKU_SIZE && board[r * GOMOKU_SIZE + c] === stone) {
        line.push(r * GOMOKU_SIZE + c);
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (line.length >= 5) return line;
  }
  return null;
}

export function gomokuApply(state: GomokuState, seat: Seat, move: GomokuMove): Outcome | { ok: false; error: string } {
  if (state.turn !== seat) return { ok: false, error: "ยังไม่ถึงตาของคุณ" };
  const index = Number(move?.index);
  if (!Number.isInteger(index) || index < 0 || index >= GOMOKU_SIZE * GOMOKU_SIZE) {
    return { ok: false, error: "ตำแหน่งวางหมากไม่ถูกต้อง" };
  }
  if (state.board[index]) return { ok: false, error: "ช่องนี้มีหมากอยู่แล้ว" };

  const board = [...state.board];
  board[index] = stoneFor(seat);
  const line = winningLine(board, index);
  const full = board.every(Boolean);
  const next: GomokuState = { board, turn: seat === 0 ? 1 : 0, last: index };

  if (line) {
    return { ok: true, state: next, over: true, result: "win", winnerSeat: seat, note: "เรียงครบ 5 ตัวติดกัน", check: false };
  }
  if (full) {
    return { ok: true, state: next, over: true, result: "draw", winnerSeat: null, note: "กระดานเต็ม — เสมอ", check: false };
  }
  return { ok: true, state: next, over: false, result: null, winnerSeat: null, note: "", check: false };
}

export function gomokuTurn(state: GomokuState): {
  turn: Seat;
  check: boolean;
  over: boolean;
  result: "win" | "draw" | null;
  winnerSeat: Seat | null;
  note: string;
} {
  return { turn: state.turn, check: false, over: false, result: null, winnerSeat: null, note: "" };
}

export function gomokuNotation(index: number): string {
  const col = String.fromCharCode(65 + (index % GOMOKU_SIZE));
  const row = Math.floor(index / GOMOKU_SIZE) + 1;
  return `${col}${row}`;
}
