/**
 * หมากรุกสากล 8x8 — กติกาครบสำหรับเล่นจริงในเบราว์เซอร์
 * รองรับ: เดินหมากทุกตัว, รุก (check), รุกจน (checkmate), เสมอ (stalemate /
 * 50-move rule / insufficient material), การเข้าปราสาท (castling),
 * กินผ่านทาง (en passant) และเลื่อนขั้นเป็นควีนอัตโนมัติ
 *
 * พิกัด: index 0 = a8, 7 = h8, 56 = a1, 63 = h1 (เหมือนลำดับ FEN)
 */

export type Seat = 0 | 1;

export type ChessState = {
  board: string[]; // 64: "" | "KQRBNP" (ขาว) | "kqrbnp" (ดำ)
  turn: "w" | "b";
  castling: string; // "KQkq" subset
  ep: number | null;
  halfmove: number;
  fullmove: number;
};

export type ChessMove = { from: number; to: number; promotion?: string };

export type Outcome = {
  ok: true;
  state: ChessState;
  over: boolean;
  result: "win" | "draw" | null;
  winnerSeat: Seat | null;
  note: string;
  check: boolean;
};
export type Failure = { ok: false; error: string };

const FILES = "abcdefgh";

const KNIGHT_DIRS: Array<[number, number]> = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
];
const DIAGONALS: Array<[number, number]> = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];
const ORTHOGONALS: Array<[number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
const ALL_DIRS = [...DIAGONALS, ...ORTHOGONALS];

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
export function squareName(index: number): string {
  return `${FILES[colOf(index)]}${8 - rowOf(index)}`;
}
function isWhite(piece: string): boolean {
  return Boolean(piece) && piece === piece.toUpperCase();
}
function colorOf(piece: string): "w" | "b" | null {
  if (!piece) return null;
  return isWhite(piece) ? "w" : "b";
}
function other(color: "w" | "b"): "w" | "b" {
  return color === "w" ? "b" : "w";
}
function seatOf(color: "w" | "b"): Seat {
  return color === "w" ? 0 : 1;
}

const START_BOARD = ["r", "n", "b", "q", "k", "b", "n", "r"];

export function initialChess(): ChessState {
  const board = Array<string>(64).fill("");
  START_BOARD.forEach((piece, col) => {
    board[box(0, col)] = piece;
    board[box(1, col)] = "p";
    board[box(6, col)] = "P";
    board[box(7, col)] = piece.toUpperCase();
  });
  return { board, turn: "w", castling: "KQkq", ep: null, halfmove: 0, fullmove: 1 };
}

type Internal = ChessMove & { piece: string; capture?: string; castle?: "K" | "Q"; ep?: boolean };

function attacked(board: string[], target: number, by: "w" | "b"): boolean {
  const tr = rowOf(target);
  const tc = colOf(target);

  const pawn = by === "w" ? "P" : "p";
  const fromRow = by === "w" ? tr + 1 : tr - 1;
  for (const dc of [-1, 1]) {
    if (inside(fromRow, tc + dc) && board[box(fromRow, tc + dc)] === pawn) return true;
  }

  const knight = by === "w" ? "N" : "n";
  for (const [dr, dc] of KNIGHT_DIRS) {
    if (!inside(tr + dr, tc + dc)) continue;
    if (board[box(tr + dr, tc + dc)] === knight) return true;
  }

  const king = by === "w" ? "K" : "k";
  for (const [dr, dc] of ALL_DIRS) {
    if (!inside(tr + dr, tc + dc)) continue;
    if (board[box(tr + dr, tc + dc)] === king) return true;
  }

  const bishop = by === "w" ? ["B", "Q"] : ["b", "q"];
  for (const [dr, dc] of DIAGONALS) {
    let row = tr + dr;
    let col = tc + dc;
    while (inside(row, col)) {
      const piece = board[box(row, col)];
      if (piece) {
        if (bishop.includes(piece)) return true;
        break;
      }
      row += dr;
      col += dc;
    }
  }

  const rook = by === "w" ? ["R", "Q"] : ["r", "q"];
  for (const [dr, dc] of ORTHOGONALS) {
    let row = tr + dr;
    let col = tc + dc;
    while (inside(row, col)) {
      const piece = board[box(row, col)];
      if (piece) {
        if (rook.includes(piece)) return true;
        break;
      }
      row += dr;
      col += dc;
    }
  }

  return false;
}

function kingSquare(board: string[], color: "w" | "b"): number {
  const king = color === "w" ? "K" : "k";
  return board.indexOf(king);
}

function pseudoMoves(state: ChessState, color: "w" | "b"): Internal[] {
  const { board } = state;
  const moves: Internal[] = [];

  for (let from = 0; from < 64; from += 1) {
    const piece = board[from];
    if (colorOf(piece) !== color) continue;
    const row = rowOf(from);
    const col = colOf(from);
    const kind = piece.toLowerCase();

    if (kind === "p") {
      const dir = color === "w" ? -1 : 1;
      const startRow = color === "w" ? 6 : 1;
      const promoRow = color === "w" ? 0 : 7;
      const oneRow = row + dir;
      if (inside(oneRow, col) && !board[box(oneRow, col)]) {
        const to = box(oneRow, col);
        if (oneRow === promoRow) moves.push({ from, to, piece, promotion: "q" });
        else moves.push({ from, to, piece });
        const twoRow = row + dir * 2;
        if (row === startRow && !board[box(twoRow, col)]) moves.push({ from, to: box(twoRow, col), piece });
      }
      for (const dc of [-1, 1]) {
        if (!inside(oneRow, col + dc)) continue;
        const target = box(oneRow, col + dc);
        const victim = board[target];
        if (victim && colorOf(victim) === other(color)) {
          if (oneRow === promoRow) moves.push({ from, to: target, piece, capture: victim, promotion: "q" });
          else moves.push({ from, to: target, piece, capture: victim });
        } else if (!victim && state.ep === target && victim === "") {
          const victimSquare = box(row, col + dc);
          const victimPiece = board[victimSquare];
          if (victimPiece && colorOf(victimPiece) === other(color)) {
            moves.push({ from, to: target, piece, capture: victimPiece, ep: true });
          }
        }
      }
      continue;
    }

    if (kind === "n" || kind === "k") {
      const dirs = kind === "n" ? KNIGHT_DIRS : ALL_DIRS;
      for (const [dr, dc] of dirs) {
        if (!inside(row + dr, col + dc)) continue;
        const to = box(row + dr, col + dc);
        const victim = board[to];
        if (victim && colorOf(victim) === color) continue;
        moves.push({ from, to, piece, capture: victim || undefined });
      }
      continue;
    }

    const dirs = kind === "b" ? DIAGONALS : kind === "r" ? ORTHOGONALS : ALL_DIRS;
    for (const [dr, dc] of dirs) {
      let nextRow = row + dr;
      let nextCol = col + dc;
      while (inside(nextRow, nextCol)) {
        const to = box(nextRow, nextCol);
        const victim = board[to];
        if (victim) {
          if (colorOf(victim) !== color) moves.push({ from, to, piece, capture: victim });
          break;
        }
        moves.push({ from, to, piece });
        nextRow += dr;
        nextCol += dc;
      }
    }
  }

  // Castling — ตรวจสิทธิ์, ช่องว่าง และช่องที่เดินผ่านต้องไม่ถูกรุก
  if (color === "w" && kingSquare(board, "w") === 60) {
    if (state.castling.includes("K") && board[63] === "R" && !board[61] && !board[62]) {
      if (!attacked(board, 60, "b") && !attacked(board, 61, "b") && !attacked(board, 62, "b")) {
        moves.push({ from: 60, to: 62, piece: "K", castle: "K" });
      }
    }
    if (state.castling.includes("Q") && board[56] === "R" && !board[59] && !board[58] && !board[57]) {
      if (!attacked(board, 60, "b") && !attacked(board, 59, "b") && !attacked(board, 58, "b")) {
        moves.push({ from: 60, to: 58, piece: "K", castle: "Q" });
      }
    }
  }
  if (color === "b" && kingSquare(board, "b") === 4) {
    if (state.castling.includes("k") && board[7] === "r" && !board[5] && !board[6]) {
      if (!attacked(board, 4, "w") && !attacked(board, 5, "w") && !attacked(board, 6, "w")) {
        moves.push({ from: 4, to: 6, piece: "k", castle: "K" });
      }
    }
    if (state.castling.includes("q") && board[0] === "r" && !board[3] && !board[2] && !board[1]) {
      if (!attacked(board, 4, "w") && !attacked(board, 3, "w") && !attacked(board, 2, "w")) {
        moves.push({ from: 4, to: 2, piece: "k", castle: "Q" });
      }
    }
  }

  return moves;
}

function stripCastling(rights: string, removals: string): string {
  let next = rights;
  for (const letter of removals) next = next.replace(letter, "");
  return next;
}

function rightsForSquare(index: number): string {
  if (index === 63) return "K";
  if (index === 56) return "Q";
  if (index === 7) return "k";
  if (index === 0) return "q";
  return "";
}

function applyInternal(state: ChessState, move: Internal): ChessState {
  const board = [...state.board];
  const piece = board[move.from];
  board[move.from] = "";
  board[move.to] = move.promotion
    ? isWhite(piece)
      ? move.promotion.toUpperCase()
      : move.promotion.toLowerCase()
    : piece;

  if (move.ep) {
    const pawnRow = isWhite(piece) ? rowOf(move.to) + 1 : rowOf(move.to) - 1;
    board[box(pawnRow, colOf(move.to))] = "";
  }

  if (move.castle) {
    const white = isWhite(piece);
    if (move.castle === "K") {
      const rookFrom = white ? 63 : 7;
      const rookTo = white ? 61 : 5;
      board[rookTo] = board[rookFrom];
      board[rookFrom] = "";
    } else {
      const rookFrom = white ? 56 : 0;
      const rookTo = white ? 59 : 3;
      board[rookTo] = board[rookFrom];
      board[rookFrom] = "";
    }
  }

  let castling = state.castling;
  if (piece.toLowerCase() === "k") castling = stripCastling(castling, isWhite(piece) ? "KQ" : "kq");
  const lostFrom = rightsForSquare(move.from);
  const lostTo = rightsForSquare(move.to);
  if (lostFrom) castling = stripCastling(castling, lostFrom);
  if (lostTo) castling = stripCastling(castling, lostTo);

  const movedTwo = piece.toLowerCase() === "p" && Math.abs(rowOf(move.to) - rowOf(move.from)) === 2;
  const ep = movedTwo ? (move.from + move.to) / 2 : null;
  const reset = piece.toLowerCase() === "p" || Boolean(move.capture);

  return {
    board,
    turn: other(isWhite(piece) ? "w" : "b"),
    castling,
    ep,
    halfmove: reset ? 0 : state.halfmove + 1,
    fullmove: state.fullmove + (isWhite(piece) ? 0 : 1),
  };
}

export function chessMoves(state: ChessState): ChessMove[] {
  const color = state.turn;
  const legal: ChessMove[] = [];
  for (const move of pseudoMoves(state, color)) {
    const next = applyInternal(state, move);
    const king = kingSquare(next.board, color);
    if (king < 0 || attacked(next.board, king, other(color))) continue;
    legal.push({ from: move.from, to: move.to, ...(move.promotion ? { promotion: move.promotion } : {}) });
  }
  return legal;
}

function insufficientMaterial(board: string[]): boolean {
  const pieces: string[] = [];
  for (const piece of board) if (piece && piece.toLowerCase() !== "k") pieces.push(piece.toLowerCase());
  if (pieces.length === 0) return true;
  if (pieces.length === 1 && (pieces[0] === "b" || pieces[0] === "n")) return true;
  if (pieces.length === 2 && pieces.every((piece) => piece === "b")) {
    // สอง bishop คนละสีบนคนละฝั่งยังชนะได้ยาก — ถือว่าไม่พอชนะถ้าอยู่คนละฝั่งเท่านั้น
    return false;
  }
  return false;
}

export function chessTurn(state: ChessState): {
  turn: Seat;
  check: boolean;
  over: boolean;
  result: "win" | "draw" | null;
  winnerSeat: Seat | null;
  note: string;
} {
  const turn = seatOf(state.turn);
  const inCheck = attacked(state.board, kingSquare(state.board, state.turn), other(state.turn));
  const hasMoves = chessMoves(state).length > 0;

  if (!hasMoves) {
    if (inCheck) {
      return {
        turn,
        check: true,
        over: true,
        result: "win",
        winnerSeat: seatOf(other(state.turn)),
        note: "รุกจน (Checkmate)",
      };
    }
    return { turn, check: false, over: true, result: "draw", winnerSeat: null, note: "อับจน (Stalemate) — เสมอ" };
  }
  if (state.halfmove >= 100) {
    return { turn, check: inCheck, over: true, result: "draw", winnerSeat: null, note: "ครบ 50 ตาไม่มีการกิน/เดินเบี้ย — เสมอ" };
  }
  if (insufficientMaterial(state.board)) {
    return { turn, check: inCheck, over: true, result: "draw", winnerSeat: null, note: "หมากไม่พอจะชนะ — เสมอ" };
  }
  return { turn, check: inCheck, over: false, result: null, winnerSeat: null, note: inCheck ? "รุก (Check)" : "" };
}

export function chessApply(state: ChessState, seat: Seat, move: ChessMove): Outcome | Failure {
  if (seatOf(state.turn) !== seat) return { ok: false, error: "ยังไม่ถึงตาของคุณ" };
  const from = Number(move?.from);
  const to = Number(move?.to);
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from > 63 || to < 0 || to > 63) {
    return { ok: false, error: "รูปแบบการเดินไม่ถูกต้อง" };
  }

  const legal = chessMoves(state);
  const chosen = legal.find((candidate) => candidate.from === from && candidate.to === to);
  if (!chosen) return { ok: false, error: "ท่าเดินนี้ไม่ถูกกติกา" };

  const piece = state.board[from];
  const victim = state.board[to];
  const internal: Internal = { ...chosen, piece, capture: victim || undefined };
  if (state.ep === to && piece.toLowerCase() === "p") {
    internal.ep = true;
    internal.capture = state.board[box(rowOf(from), colOf(to))] || "p";
  }
  const next = applyInternal(state, internal);
  const status = chessTurn(next);
  return { ok: true, state: next, ...status };
}

export function chessNotation(state: ChessState, move: ChessMove): string {
  const piece = state.board[move.from];
  const kind = piece.toUpperCase();
  const capture = Boolean(state.board[move.to]) || state.ep === move.to;
  if (kind === "K" && Math.abs(move.to - move.from) === 2) {
    return move.to > move.from ? "O-O" : "O-O-O";
  }
  const prefix = kind === "P" ? "" : kind;
  return `${prefix}${capture ? "×" : ""}${squareName(move.to)}`;
}
