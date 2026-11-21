/**
 * บอท AI อย่างง่ายสำหรับโหมดซ้อม (Practice vs Bot)
 * เลือกตาเดินที่ถูกกติกาเสมอ โดยคิดจาก engine ตัวเดียวกับที่ผู้เล่นใช้
 */

import {
  checkersMoves,
  type CheckersState,
} from "./checkers";
import { chessApply, chessMoves, type ChessState } from "./chess";
import { GOMOKU_SIZE, winningLine, type GomokuState } from "./gomoku";
import { C4_COLS, C4_ROWS, dropRow, winningFour, type Connect4State } from "./connect4";
import { applyEngineMove, connect4OpenColumns, type AnyMove, type GameKey, type GameState, type Seat } from "./index";

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/* ------------------------------------------------------------------ */
/*  หมากฮอส                                                            */
/* ------------------------------------------------------------------ */

function checkersBot(state: CheckersState, seat: Seat): AnyMove | null {
  const moves = checkersMoves(state);
  if (moves.length === 0) return null;

  let best: AnyMove | null = null;
  let bestScore = -Infinity;
  for (const move of moves) {
    const outcome = applyEngineMove("checkers", state, seat, { from: move.from, path: move.path });
    if (!outcome.ok) continue;
    const captures = move.path.length;
    const lands = move.path[move.path.length - 1];
    const row = lands >> 3;
    const promotion = (seat === 0 && row === 0) || (seat === 1 && row === 7);
    const advance = seat === 0 ? 7 - row : row;
    let exposure = 0;
    const replies = checkersMoves(outcome.state as CheckersState);
    exposure = replies.reduce((max, reply) => Math.max(max, reply.path.length), 0);
    const score = captures * 100 + (promotion ? 60 : 0) + advance * 1.5 - exposure * 40 + Math.random() * 2;
    if (score > bestScore) {
      bestScore = score;
      best = { from: move.from, path: move.path };
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/*  หมากรุก                                                            */
/* ------------------------------------------------------------------ */

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3.2, r: 5, q: 9, k: 0 };

const CENTER_BONUS = [0, 0.05, 0.1, 0.15, 0.15, 0.1, 0.05, 0];

function chessEval(state: ChessState, seat: Seat): number {
  let score = 0;
  for (let index = 0; index < 64; index += 1) {
    const piece = state.board[index];
    if (!piece) continue;
    const white = piece === piece.toUpperCase();
    const kind = piece.toLowerCase();
    const owner: Seat = white ? 0 : 1;
    const row = index >> 3;
    const col = index & 7;
    let value = PIECE_VALUE[kind] ?? 0;
    value += CENTER_BONUS[col] + CENTER_BONUS[row];
    if (kind === "p") value += (white ? 6 - row : row - 1) * 0.05;
    score += owner === seat ? value : -value;
  }
  return score;
}

function chessBot(state: ChessState, seat: Seat): AnyMove | null {
  const moves = chessMoves(state);
  if (moves.length === 0) return null;

  let best: AnyMove | null = null;
  let bestScore = -Infinity;
  for (const move of moves) {
    const outcome = chessApply(state, seat, move);
    if (!outcome.ok) continue;
    let score = chessEval(outcome.state, seat);
    if (outcome.over && outcome.result === "win") score += 1000;
    if (outcome.over && outcome.result === "draw") score -= 2;
    if (outcome.check) score += 0.4;
    // กันตาพลาดง่าย: ถ้าเดินแล้วถูกกินควีนทันทีให้ลดคะแนน
    const replyCaptures = chessMoves(outcome.state);
    const punished = replyCaptures.some((reply) => outcome.state.board[reply.to]?.toLowerCase() === "q");
    if (punished) score -= 1.5;
    score += Math.random() * 0.2;
    if (score > bestScore) {
      bestScore = score;
      best = { from: move.from, to: move.to, promotion: move.promotion };
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/*  เกมเรียง 5                                                          */
/* ------------------------------------------------------------------ */

function gomokuLineScore(board: string[], index: number, stone: string): number {
  const row = Math.floor(index / GOMOKU_SIZE);
  const col = index % GOMOKU_SIZE;
  const directions: Array<[number, number]> = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  let total = 0;
  for (const [dr, dc] of directions) {
    let count = 1;
    let open = 0;
    for (const sign of [-1, 1]) {
      let r = row + dr * sign;
      let c = col + dc * sign;
      while (r >= 0 && r < GOMOKU_SIZE && c >= 0 && c < GOMOKU_SIZE && board[r * GOMOKU_SIZE + c] === stone) {
        count += 1;
        r += dr * sign;
        c += dc * sign;
      }
      if (r >= 0 && r < GOMOKU_SIZE && c >= 0 && c < GOMOKU_SIZE && !board[r * GOMOKU_SIZE + c]) open += 1;
    }
    if (count >= 5) total += 1_000_000;
    else if (count === 4 && open === 2) total += 100_000;
    else if (count === 4 && open === 1) total += 10_000;
    else if (count === 3 && open === 2) total += 2_000;
    else if (count === 3 && open === 1) total += 200;
    else if (count === 2 && open === 2) total += 60;
    else total += count * 2;
  }
  return total;
}

function gomokuBot(state: GomokuState, seat: Seat): AnyMove | null {
  const mine = seat === 0 ? "b" : "w";
  const theirs = seat === 0 ? "w" : "b";
  const board = [...state.board];
  const center = Math.floor(GOMOKU_SIZE / 2) * GOMOKU_SIZE + Math.floor(GOMOKU_SIZE / 2);
  const candidates: number[] = [];

  if (!board.some(Boolean)) return { index: center };

  for (let index = 0; index < board.length; index += 1) {
    if (board[index]) continue;
    const row = Math.floor(index / GOMOKU_SIZE);
    const col = index % GOMOKU_SIZE;
    let near = false;
    for (let dr = -2; dr <= 2 && !near; dr += 1) {
      for (let dc = -2; dc <= 2; dc += 1) {
        const r = row + dr;
        const c = col + dc;
        if (r < 0 || r >= GOMOKU_SIZE || c < 0 || c >= GOMOKU_SIZE) continue;
        if (board[r * GOMOKU_SIZE + c]) {
          near = true;
          break;
        }
      }
    }
    if (near) candidates.push(index);
  }

  let best: number | null = null;
  let bestScore = -Infinity;
  for (const index of candidates) {
    board[index] = mine;
    if (winningLine(board, index)) {
      board[index] = "";
      return { index };
    }
    board[index] = "";
  }
  for (const index of candidates) {
    board[index] = theirs;
    const blocksWin = Boolean(winningLine(board, index));
    board[index] = "";
    if (blocksWin) return { index };
  }

  for (const index of candidates) {
    board[index] = mine;
    const attack = gomokuLineScore(board, index, mine);
    board[index] = theirs;
    const defend = gomokuLineScore(board, index, theirs);
    board[index] = "";
    const score = attack * 1.15 + defend + Math.random() * 5;
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  }
  return best === null ? null : { index: best };
}

/* ------------------------------------------------------------------ */
/*  เกมเรียง 4                                                          */
/* ------------------------------------------------------------------ */

function connect4Evaluate(board: string[], me: string, them: string): number {
  let score = 0;
  const cells = (row: number, col: number): string => board[row * C4_COLS + col] || "";
  const scoreWindow = (window: string[]) => {
    const mine = window.filter((cell) => cell === me).length;
    const theirs = window.filter((cell) => cell === them).length;
    if (mine && theirs) return 0;
    if (mine === 4) return 100000;
    if (mine === 3) return 120;
    if (mine === 2) return 12;
    if (theirs === 4) return -100000;
    if (theirs === 3) return -140;
    if (theirs === 2) return -14;
    return 0;
  };

  for (let row = 0; row < C4_ROWS; row += 1) {
    for (let col = 0; col < C4_COLS; col += 1) {
      if (col + 3 < C4_COLS) scoreWindow([cells(row, col), cells(row, col + 1), cells(row, col + 2), cells(row, col + 3)]);
      if (row + 3 < C4_ROWS) scoreWindow([cells(row, col), cells(row + 1, col), cells(row + 2, col), cells(row + 3, col)]);
      if (row + 3 < C4_ROWS && col + 3 < C4_COLS)
        scoreWindow([cells(row, col), cells(row + 1, col + 1), cells(row + 2, col + 2), cells(row + 3, col + 3)]);
      if (row + 3 < C4_ROWS && col - 3 >= 0)
        scoreWindow([cells(row, col), cells(row + 1, col - 1), cells(row + 2, col - 2), cells(row + 3, col - 3)]);
    }
  }
  return score;
}

const CENTER_ORDER = [3, 2, 4, 1, 5, 0, 6];

function connect4Search(board: string[], me: string, them: string, depth: number, maximizing: boolean, alpha: number, beta: number): number {
  const columns = connect4OpenColumns(board);
  if (columns.length === 0) return 0;
  if (depth === 0) return connect4Evaluate(board, me, them);

  let best = maximizing ? -Infinity : Infinity;
  const ordered = CENTER_ORDER.filter((col) => columns.includes(col));
  for (const col of ordered) {
    const row = dropRow(board, col);
    if (row < 0) continue;
    const index = row * C4_COLS + col;
    const next = [...board];
    next[index] = maximizing ? me : them;
    if (winningFour(next, index)) {
      const value = maximizing ? 100000 - (4 - depth) : -100000 + (4 - depth);
      if (maximizing) best = Math.max(best, value);
      else best = Math.min(best, value);
    } else {
      const value = connect4Search(next, me, them, depth - 1, !maximizing, alpha, beta);
      if (maximizing) best = Math.max(best, value);
      else best = Math.min(best, value);
    }
    if (maximizing) alpha = Math.max(alpha, best);
    else beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

function connect4Bot(state: Connect4State, seat: Seat): AnyMove | null {
  const me = seat === 0 ? "r" : "y";
  const them = seat === 0 ? "y" : "r";
  const columns = connect4OpenColumns(state.board);
  if (columns.length === 0) return null;

  for (const col of columns) {
    const row = dropRow(state.board, col);
    const board = [...state.board];
    board[row * C4_COLS + col] = me;
    if (winningFour(board, row * C4_COLS + col)) return { col };
  }
  for (const col of columns) {
    const row = dropRow(state.board, col);
    const board = [...state.board];
    board[row * C4_COLS + col] = them;
    if (winningFour(board, row * C4_COLS + col)) return { col };
  }

  let bestCol = columns[0];
  let bestScore = -Infinity;
  for (const col of CENTER_ORDER.filter((value) => columns.includes(value))) {
    const row = dropRow(state.board, col);
    const board = [...state.board];
    board[row * C4_COLS + col] = me;
    const score = connect4Search(board, me, them, 3, false, -Infinity, Infinity) + Math.random() * 4;
    if (score > bestScore) {
      bestScore = score;
      bestCol = col;
    }
  }
  return { col: bestCol };
}

/* ------------------------------------------------------------------ */

export function chooseBotMove(game: GameKey, state: GameState, seat: Seat): AnyMove | null {
  switch (game) {
    case "checkers":
      return checkersBot(state as CheckersState, seat);
    case "chess":
      return chessBot(state as ChessState, seat);
    case "gomoku":
      return gomokuBot(state as GomokuState, seat);
    case "connect4":
      return connect4Bot(state as Connect4State, seat);
  }
}

/** กันบอทค้าง: ถ้าเลือกไม่ได้จริง ๆ ให้หยิบตาแรกที่ถูกกติกา */
export function fallbackMove(game: GameKey, state: GameState): AnyMove | null {
  if (game === "gomoku") {
    const index = (state as GomokuState).board.findIndex((cell) => !cell);
    return index >= 0 ? { index } : null;
  }
  if (game === "connect4") {
    const col = connect4OpenColumns((state as Connect4State).board)[0];
    return col === undefined ? null : { col };
  }
  if (game === "checkers") {
    const moves = shuffle(checkersMoves(state as CheckersState).map((move) => ({ from: move.from, path: move.path })));
    return moves[0] ?? null;
  }
  const moves = shuffle(chessMoves(state as ChessState).map((move) => ({ from: move.from, to: move.to })));
  return moves[0] ?? null;
}
