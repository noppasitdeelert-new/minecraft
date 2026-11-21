/** เกมเรียง 4 (Connect 4) — 7 คอลัมน์ x 6 แถว หยอดหมากลงช่อง ใครเรียง 4 ก่อนชนะ */

export type Seat = 0 | 1;

export type Connect4State = {
  board: string[]; // 42: "" | "r" (seat 0) | "y" (seat 1), row 0 = แถวบนสุด
  turn: Seat;
  last: number | null;
};

export type Connect4Move = { col: number };

export type Outcome = {
  ok: true;
  state: Connect4State;
  over: boolean;
  result: "win" | "draw" | null;
  winnerSeat: Seat | null;
  note: string;
  check: boolean;
};

export const C4_COLS = 7;
export const C4_ROWS = 6;

export function initialConnect4(): Connect4State {
  return { board: Array<string>(C4_COLS * C4_ROWS).fill(""), turn: 0, last: null };
}

function stoneFor(seat: Seat): string {
  return seat === 0 ? "r" : "y";
}

export function dropRow(board: string[], col: number): number {
  for (let row = C4_ROWS - 1; row >= 0; row -= 1) {
    const index = row * C4_COLS + col;
    if (!board[index]) return row;
  }
  return -1;
}

export function winningFour(board: string[], index: number): number[] | null {
  const stone = board[index];
  if (!stone) return null;
  const row = Math.floor(index / C4_COLS);
  const col = index % C4_COLS;
  const directions: Array<[number, number]> = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  for (const [dr, dc] of directions) {
    const line = [index];
    for (const sign of [-1, 1]) {
      let r = row + dr * sign;
      let c = col + dc * sign;
      while (r >= 0 && r < C4_ROWS && c >= 0 && c < C4_COLS && board[r * C4_COLS + c] === stone) {
        line.push(r * C4_COLS + c);
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (line.length >= 4) return line;
  }
  return null;
}

export function connect4Apply(state: Connect4State, seat: Seat, move: Connect4Move): Outcome | { ok: false; error: string } {
  if (state.turn !== seat) return { ok: false, error: "ยังไม่ถึงตาของคุณ" };
  const col = Number(move?.col);
  if (!Number.isInteger(col) || col < 0 || col >= C4_COLS) return { ok: false, error: "คอลัมน์ไม่ถูกต้อง" };

  const row = dropRow(state.board, col);
  if (row < 0) return { ok: false, error: "คอลัมน์นี้เต็มแล้ว" };

  const board = [...state.board];
  const index = row * C4_COLS + col;
  board[index] = stoneFor(seat);
  const line = winningFour(board, index);
  const full = board.every(Boolean);
  const next: Connect4State = { board, turn: seat === 0 ? 1 : 0, last: index };

  if (line) {
    return { ok: true, state: next, over: true, result: "win", winnerSeat: seat, note: "เรียงครบ 4 ตัวติดกัน", check: false };
  }
  if (full) {
    return { ok: true, state: next, over: true, result: "draw", winnerSeat: null, note: "กระดานเต็ม — เสมอ", check: false };
  }
  return { ok: true, state: next, over: false, result: null, winnerSeat: null, note: "", check: false };
}

export function connect4Turn(state: Connect4State): {
  turn: Seat;
  check: boolean;
  over: boolean;
  result: "win" | "draw" | null;
  winnerSeat: Seat | null;
  note: string;
} {
  return { turn: state.turn, check: false, over: false, result: null, winnerSeat: null, note: "" };
}

export function connect4Notation(col: number): string {
  return `คอลัมน์ ${col + 1}`;
}
