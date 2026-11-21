/**
 * หมากฮอส 8x8 (variant แบบเล่นกันทั่วไปในห้องเรียน)
 * - เบี้ยเดินหน้าได้ทิศเดียว แต่กินได้ทั้ง 4 ทิศ
 * - กินบังคับ: ถ้ามีท่ากิน ต้องกิน และกินต่อเนื่องได้ในตาเดียว
 * - ถึงแถวสุดท้าย = ฮอส (king) เดิน/กินได้ 4 ทิศ
 * - แพ้เมื่อไม่มีหมากหรือไม่มีตาเดิน, เสมอเมื่อ 80 ตาไม่มีการกิน/เลื่อนขั้น
 */

export type Seat = 0 | 1;

export type CheckersState = {
  board: string[]; // 64: "" | "w" | "W" | "b" | "B"
  turn: Seat;
  quiet: number;
};

export type CheckersMove = { from: number; path: number[] };
export type Outcome = {
  ok: true;
  state: CheckersState;
  over: boolean;
  result: "win" | "draw" | null;
  winnerSeat: Seat | null;
  note: string;
  check: boolean;
};
export type Failure = { ok: false; error: string };

const ALL_DIRS: Array<[number, number]> = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

function rowOf(index: number): number {
  return index >> 3;
}
function colOf(index: number): number {
  return index & 7;
}
function inside(row: number, col: number): boolean {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}
function box(row: number, col: number): number {
  return row * 8 + col;
}
function isKing(piece: string): boolean {
  return piece === "W" || piece === "B";
}
function owned(piece: string, seat: Seat): boolean {
  if (!piece) return false;
  return seat === 0 ? piece === "w" || piece === "W" : piece === "b" || piece === "B";
}
function crown(seat: Seat): string {
  return seat === 0 ? "W" : "B";
}
function promotionRow(seat: Seat): number {
  return seat === 0 ? 0 : 7;
}

export function initialCheckers(): CheckersState {
  const board = Array<string>(64).fill("");
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      if ((row + col) % 2 === 0) continue; // เล่นบนช่องสีเข้ม
      if (row < 3) board[box(row, col)] = "b";
      else if (row > 4) board[box(row, col)] = "w";
    }
  }
  return { board, turn: 0, quiet: 0 };
}

function jumpSequences(
  board: string[],
  seat: Seat,
  origin: number,
  current: number,
  piece: string,
  path: number[],
  captured: Set<number>,
): CheckersMove[] {
  const out: CheckersMove[] = [];
  const row = rowOf(current);
  const col = colOf(current);

  for (const [dr, dc] of ALL_DIRS) {
    const midRow = row + dr;
    const midCol = col + dc;
    const landRow = row + dr * 2;
    const landCol = col + dc * 2;
    if (!inside(landRow, landCol)) continue;
    const mid = box(midRow, midCol);
    const land = box(landRow, landCol);
    if (captured.has(mid)) continue;
    const victim = board[mid];
    if (!victim || owned(victim, seat)) continue;
    if (board[land]) continue;

    const nextPath = [...path, land];
    const nextCaptured = new Set(captured);
    nextCaptured.add(mid);

    const promoted = !isKing(piece) && landRow === promotionRow(seat);
    if (promoted) {
      out.push({ from: origin, path: nextPath });
      continue;
    }
    const deeper = jumpSequences(board, seat, origin, land, piece, nextPath, nextCaptured);
    if (deeper.length) out.push(...deeper);
    else out.push({ from: origin, path: nextPath });
  }

  return out;
}

/** ตาเดินที่ถูกกติกาทั้งหมดของฝั่งที่ถึงตา (กินบังคับ) */
export function checkersMoves(state: CheckersState): CheckersMove[] {
  const { board, turn } = state;
  const jumps: CheckersMove[] = [];

  for (let index = 0; index < 64; index += 1) {
    const piece = board[index];
    if (!owned(piece, turn)) continue;
    jumps.push(...jumpSequences(board, turn, index, index, piece, [], new Set()));
  }
  if (jumps.length) {
    const seen = new Set<string>();
    return jumps.filter((move) => {
      const key = `${move.from}:${move.path.join("-")}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  const moves: CheckersMove[] = [];
  const forward = turn === 0 ? -1 : 1;
  for (let index = 0; index < 64; index += 1) {
    const piece = board[index];
    if (!owned(piece, turn)) continue;
    const row = rowOf(index);
    const col = colOf(index);
    const dirs: Array<[number, number]> = isKing(piece)
      ? ALL_DIRS
      : ALL_DIRS.filter(([dr]) => dr === forward);
    for (const [dr, dc] of dirs) {
      const nextRow = row + dr;
      const nextCol = col + dc;
      if (!inside(nextRow, nextCol)) continue;
      const land = box(nextRow, nextCol);
      if (board[land]) continue;
      moves.push({ from: index, path: [land] });
    }
  }
  return moves;
}

function evaluate(state: CheckersState): { over: boolean; result: "win" | "draw" | null; winnerSeat: Seat | null; note: string } {
  const { board, turn, quiet } = state;
  let white = 0;
  let black = 0;
  for (const piece of board) {
    if (piece === "w" || piece === "W") white += 1;
    else if (piece === "b" || piece === "B") black += 1;
  }
  const noPieces = white === 0 || black === 0;
  const stuck = checkersMoves(state).length === 0;
  if (noPieces || stuck) {
    const winnerSeat: Seat = turn === 0 ? 1 : 0;
    const byCapture = noPieces;
    return {
      over: true,
      result: "win",
      winnerSeat,
      note: byCapture ? "กินหมากฝั่งตรงข้ามจนหมดกระดาน" : "ฝั่งตรงข้ามไม่มีตาเดิน",
    };
  }
  if (quiet >= 80) return { over: true, result: "draw", winnerSeat: null, note: "80 ตาไม่มีการกินหรือเลื่อนขั้น เสมอ" };
  return { over: false, result: null, winnerSeat: null, note: "" };
}

export function checkersApply(
  state: CheckersState,
  seat: Seat,
  move: { from?: number; path?: number[] },
): Outcome | Failure {
  if (state.turn !== seat) return { ok: false, error: "ยังไม่ถึงตาของคุณ" };
  const from = Number(move?.from);
  const path = Array.isArray(move?.path) ? move.path.map((value) => Number(value)) : [];
  if (!Number.isInteger(from) || from < 0 || from > 63 || path.length === 0) {
    return { ok: false, error: "รูปแบบการเดินไม่ถูกต้อง" };
  }

  const legal = checkersMoves(state);
  const chosen = legal.find(
    (candidate) => candidate.from === from && candidate.path.length === path.length && candidate.path.every((step, i) => step === path[i]),
  );
  if (!chosen) return { ok: false, error: "ท่าเดินนี้ไม่ถูกกติกา (ถ้ามีท่ากิน ต้องกิน)" };

  const board = [...state.board];
  const piece = board[from];
  if (!piece) return { ok: false, error: "ไม่พบหมากบนช่องนี้" };

  let cursor = from;
  for (const step of chosen.path) {
    const mid = (cursor + step) / 2;
    board[mid] = "";
    cursor = step;
  }
  board[from] = "";
  const finalRow = rowOf(cursor);
  board[cursor] = !isKing(piece) && finalRow === promotionRow(seat) ? crown(seat) : piece;

  // กินข้าม = กระโดด 2 ช่องทแยง (ผลต่างดัชนี 14 หรือ 18) เดินธรรมดาคือ 7 หรือ 9
  const jumped = chosen.path.some((step, i) => Math.abs(step - (i === 0 ? from : chosen.path[i - 1])) >= 14);
  const promoted = board[cursor] === crown(seat) && piece !== crown(seat);

  const next: CheckersState = {
    board,
    turn: seat === 0 ? 1 : 0,
    quiet: jumped || promoted ? 0 : state.quiet + 1,
  };
  const status = evaluate(next);
  return { ok: true, state: next, check: false, ...status };
}

export function checkersTurn(state: CheckersState): {
  turn: Seat;
  check: boolean;
  over: boolean;
  result: "win" | "draw" | null;
  winnerSeat: Seat | null;
  note: string;
} {
  const status = evaluate(state);
  return { turn: state.turn, check: false, ...status };
}

export function checkersNotation(move: { from: number; path: number[] }): string {
  const name = (index: number) => String.fromCharCode(97 + colOf(index)) + String(8 - rowOf(index));
  return [name(move.from), ...move.path.map(name)].join("→");
}
