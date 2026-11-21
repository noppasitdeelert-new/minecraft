/**
 * Router ของ engine เกมกระดานทั้ง 4 ตัว
 * ทุกการเดินถูกตรวจที่ฝั่งเซิร์ฟเวอร์เท่านั้น (client ส่งได้แค่ "เจตนาเดิน")
 */

import {
  checkersApply,
  checkersMoves,
  checkersNotation,
  checkersTurn,
  initialCheckers,
  type CheckersState,
} from "./checkers";
import { chessApply, chessMoves, chessNotation, chessTurn, initialChess, type ChessState } from "./chess";
import { gomokuApply, gomokuNotation, gomokuTurn, initialGomoku, GOMOKU_SIZE, type GomokuState } from "./gomoku";
import {
  connect4Apply,
  connect4Notation,
  connect4Turn,
  dropRow,
  initialConnect4,
  C4_COLS,
  C4_ROWS,
  type Connect4State,
} from "./connect4";

export type GameKey = "checkers" | "chess" | "gomoku" | "connect4";
export type Seat = 0 | 1;
export type GameState = CheckersState | ChessState | GomokuState | Connect4State;

export type AnyMove = {
  from?: number;
  to?: number;
  path?: number[];
  index?: number;
  col?: number;
  promotion?: string;
};

export type EngineOutcome =
  | {
      ok: true;
      state: GameState;
      over: boolean;
      result: "win" | "draw" | null;
      winnerSeat: Seat | null;
      note: string;
      check: boolean;
    }
  | { ok: false; error: string };

export type TurnInfo = {
  turn: Seat;
  check: boolean;
  over: boolean;
  result: "win" | "draw" | null;
  winnerSeat: Seat | null;
  note: string;
};

export type GameMeta = {
  key: GameKey;
  name: string;
  tagline: string;
  description: string;
  rows: number;
  cols: number;
  seats: [string, string];
  seatColors: [string, string];
  rules: string[];
};

export const GAMES: Record<GameKey, GameMeta> = {
  checkers: {
    key: "checkers",
    name: "หมากฮอส",
    tagline: "8x8 · กินข้าม · ฮอส",
    description: "กระดาน 8x8 เดินเบี้ย กินข้าม กินต่อเนื่อง และเข้าฮอส (King) พร้อมไฮไลต์ช่องที่เดินได้",
    rows: 8,
    cols: 8,
    seats: ["ขาว", "ดำ"],
    seatColors: ["#f8fafc", "#1f2937"],
    rules: [
      "เบี้ยเดินทแยงไปข้างหน้าทีละช่อง และกินได้ทั้ง 4 ทิศ",
      "ถ้ามีท่ากิน ต้องกิน และกินต่อเนื่องได้ในตาเดียว",
      "ถึงแถวสุดท้ายของฝั่งตรงข้าม = ฮอส เดิน/กินได้ 4 ทิศ",
      "ชนะเมื่ออีกฝั่งไม่มีหมากหรือไม่มีตาเดิน",
    ],
  },
  chess: {
    key: "chess",
    name: "หมากรุก",
    tagline: "8x8 · รุก/รุกจน/เสมอ",
    description: "กระดาน 8x8 ตรวจสอบกติกาการเดินหมากทุกตัว แจ้งเตือนสถานะรุก (Check) / รุกจน (Checkmate) / เสมอ (Draw)",
    rows: 8,
    cols: 8,
    seats: ["ขาว", "ดำ"],
    seatColors: ["#f8fafc", "#1f2937"],
    rules: [
      "เดินหมากตามกติกาสากล รองรับ castle และ en passant",
      "เบี้ยถึงแถวสุดท้ายเลื่อนขั้นเป็นควีนอัตโนมัติ",
      "แจ้งรุก (Check), รุกจน (Checkmate), อับจน (Stalemate)",
      "เสมอเมื่อ 50 ตาไม่มีการกิน/เดินเบี้ย หรือหมากไม่พอชนะ",
    ],
  },
  gomoku: {
    key: "gomoku",
    name: "เกมเรียง 5",
    tagline: "15x15 · Gomoku",
    description: "วางหมากขาว-ดำสลับตา ใครเรียงครบ 5 ตัวติดกันก่อนชนะ",
    rows: GOMOKU_SIZE,
    cols: GOMOKU_SIZE,
    seats: ["ดำ", "ขาว"],
    seatColors: ["#111827", "#f8fafc"],
    rules: ["ผลัดกันวางหมาก 1 ตัวต่อตา", "เรียงแนวตั้ง/นอน/ทแยง ครบ 5 ตัวติดกันชนะ", "กระดานเต็มโดยไม่มีใครครบ 5 = เสมอ"],
  },
  connect4: {
    key: "connect4",
    name: "เกมเรียง 4",
    tagline: "7x6 · Connect 4",
    description: "หยอดหมากลงคอลัมน์ ใครเรียงครบ 4 ตัวก่อนชนะ",
    rows: C4_ROWS,
    cols: C4_COLS,
    seats: ["แดง", "เหลือง"],
    seatColors: ["#ef4444", "#facc15"],
    rules: ["เลือกคอลัมน์ หมากจะตกลงช่องว่างล่างสุด", "เรียง 4 ตัวติดกันแนวตั้ง/นอน/ทแยงชนะ", "กระดานเต็มโดยไม่มีใครครบ 4 = เสมอ"],
  },
};

export const GAME_KEYS = Object.keys(GAMES) as GameKey[];

export function isGameKey(value: unknown): value is GameKey {
  return typeof value === "string" && (GAME_KEYS as string[]).includes(value);
}

export function initialBoard(game: GameKey): GameState {
  switch (game) {
    case "checkers":
      return initialCheckers();
    case "chess":
      return initialChess();
    case "gomoku":
      return initialGomoku();
    case "connect4":
      return initialConnect4();
  }
}

/** ตาเดินที่ถูกกติกาของฝั่งที่ถึงตา (gomoku/connect4 ใช้การคำนวณฝั่ง client) */
export function legalMoves(game: GameKey, state: GameState): AnyMove[] {
  switch (game) {
    case "checkers":
      return checkersMoves(state as CheckersState).map((move) => ({ from: move.from, path: move.path }));
    case "chess":
      return chessMoves(state as ChessState).map((move) => ({ from: move.from, to: move.to, promotion: move.promotion }));
    default:
      return [];
  }
}

export function applyEngineMove(game: GameKey, state: GameState, seat: Seat, move: AnyMove): EngineOutcome {
  switch (game) {
    case "checkers":
      return checkersApply(state as CheckersState, seat, { from: Number(move.from), path: move.path });
    case "chess":
      return chessApply(state as ChessState, seat, {
        from: Number(move.from),
        to: Number(move.to),
        promotion: move.promotion,
      });
    case "gomoku":
      return gomokuApply(state as GomokuState, seat, { index: Number(move.index) });
    case "connect4":
      return connect4Apply(state as Connect4State, seat, { col: Number(move.col) });
  }
}

export function turnInfo(game: GameKey, state: GameState): TurnInfo {
  switch (game) {
    case "checkers":
      return checkersTurn(state as CheckersState);
    case "chess":
      return chessTurn(state as ChessState);
    case "gomoku":
      return gomokuTurn(state as GomokuState);
    case "connect4":
      return connect4Turn(state as Connect4State);
  }
}

export function boardCells(state: GameState): string[] {
  return (state as { board: string[] }).board;
}

export function turnSeat(state: GameState): Seat {
  // หมากรุกเก็บตาเป็น "w"/"b" ส่วนเกมอื่นเก็บเป็น 0/1
  const value = (state as { turn: Seat | "w" | "b" }).turn;
  if (value === "w") return 0;
  if (value === "b") return 1;
  return value === 1 ? 1 : 0;
}

export function notationFor(game: GameKey, state: GameState, move: AnyMove): string {
  switch (game) {
    case "checkers":
      return checkersNotation({ from: Number(move.from), path: (move.path ?? []).map(Number) });
    case "chess":
      return chessNotation(state as ChessState, { from: Number(move.from), to: Number(move.to) });
    case "gomoku":
      return gomokuNotation(Number(move.index));
    case "connect4":
      return connect4Notation(Number(move.col));
  }
}

/** ช่องที่ยังหยอดได้ของ Connect 4 (ใช้ทั้ง UI และบอท) */
export function connect4OpenColumns(board: string[]): number[] {
  const open: number[] = [];
  for (let col = 0; col < C4_COLS; col += 1) if (dropRow(board, col) >= 0) open.push(col);
  return open;
}
