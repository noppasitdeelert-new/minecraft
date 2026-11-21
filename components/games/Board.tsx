"use client";

import { useEffect, useMemo, useState } from "react";
import { GAMES, type AnyMove, type GameKey, type Seat } from "@/lib/games";

export type BoardProps = {
  game: GameKey;
  cells: string[];
  legal: AnyMove[];
  mySeat: Seat | null;
  canMove: boolean;
  turnSeat: Seat;
  check: boolean;
  lastMove: AnyMove | null;
  onMove: (move: AnyMove) => void;
};

const CHESS_GLYPH: Record<string, string> = {
  k: "♚",
  q: "♛",
  r: "♜",
  b: "♝",
  n: "♞",
  p: "♟",
};

const FILES = "abcdefgh";
const GOMOKU_CELLS = 15;

function isWhitePiece(piece: string): boolean {
  return Boolean(piece) && piece === piece.toUpperCase();
}

function sameMove(a: AnyMove | null, b: AnyMove | null): boolean {
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export default function Board({ game, cells, legal, mySeat, canMove, turnSeat, check, lastMove, onMove }: BoardProps) {
  const meta = GAMES[game];
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    setSelected(null);
  }, [game, turnSeat, canMove]);

  /* ---------------- หมากรุก + หมากฮอส ---------------- */
  const flip = (game === "chess" || game === "checkers") && mySeat === 1;

  const chessTargets = useMemo(() => {
    if (game !== "chess" || selected === null) return new Set<number>();
    const set = new Set<number>();
    for (const move of legal) if (move.from === selected && typeof move.to === "number") set.add(move.to);
    return set;
  }, [game, legal, selected]);

  const checkerTargets = useMemo(() => {
    if (game !== "checkers" || selected === null) return new Map<number, AnyMove>();
    const map = new Map<number, AnyMove>();
    for (const move of legal) {
      if (move.from !== selected) continue;
      const last = move.path?.[move.path.length - 1];
      if (typeof last === "number" && !map.has(last)) map.set(last, move);
    }
    return map;
  }, [game, legal, selected]);

  const legalFroms = useMemo(() => {
    const set = new Set<number>();
    if (game === "chess") for (const move of legal) if (typeof move.from === "number") set.add(move.from);
    if (game === "checkers") for (const move of legal) if (typeof move.from === "number") set.add(move.from);
    return set;
  }, [game, legal]);

  if (game === "chess" || game === "checkers") {
    const attackable = new Set<number>();
    if (check && game === "chess") {
      const king = turnSeat === 0 ? "K" : "k";
      const index = cells.indexOf(king);
      if (index >= 0) attackable.add(index);
    }

    return (
      <div className="mx-auto w-full max-w-[min(92vw,560px)]">
        <div className="grid grid-cols-8 overflow-hidden rounded-xl border-2 border-slate-700/70 shadow-2xl shadow-black/40">
          {Array.from({ length: 64 }).map((_, display) => {
            const index = flip ? 63 - display : display;
            const row = index >> 3;
            const col = index & 7;
            const dark = (row + col) % 2 === 1;
            const piece = cells[index] ?? "";
            const isSelected = selected === index;
            const isTarget = game === "chess" ? chessTargets.has(index) : checkerTargets.has(index);
            const selectable = canMove && mySeat !== null && legalFroms.has(index);
            const lastFrom = lastMove && Number(lastMove.from) === index;
            const lastTo =
              lastMove &&
              (game === "chess"
                ? Number(lastMove.to) === index
                : Number(lastMove.path?.[lastMove.path.length - 1]) === index);

            return (
              <button
                key={index}
                type="button"
                disabled={!canMove}
                aria-label={`${FILES[col]}${8 - row}${piece ? ` ${piece}` : ""}`}
                onClick={() => {
                  if (!canMove || mySeat === null) return;
                  if (game === "chess") {
                    if (selected !== null && chessTargets.has(index)) {
                      onMove({ from: selected, to: index });
                      setSelected(null);
                      return;
                    }
                    if (piece && ((mySeat === 0 && isWhitePiece(piece)) || (mySeat === 1 && !isWhitePiece(piece)))) {
                      setSelected(index === selected ? null : index);
                    } else {
                      setSelected(null);
                    }
                    return;
                  }
                  const target = checkerTargets.get(index);
                  if (selected !== null && target) {
                    onMove(target);
                    setSelected(null);
                    return;
                  }
                  if (piece && ((mySeat === 0 && (piece === "w" || piece === "W")) || (mySeat === 1 && (piece === "b" || piece === "B")))) {
                    setSelected(index === selected ? null : index);
                  } else {
                    setSelected(null);
                  }
                }}
                className={`relative flex aspect-square items-center justify-center transition ${
                  dark ? "bg-[#4a5b7a]" : "bg-[#dfe7f2]"
                } ${selectable ? "cursor-pointer" : "cursor-default"} ${isSelected ? "ring-2 ring-inset ring-amber-400" : ""}`}
              >
                {(lastFrom || lastTo) && !isSelected ? <span className="absolute inset-0 bg-amber-300/25" /> : null}
                {attackable.has(index) ? <span className="absolute inset-0 bg-rose-500/40" /> : null}

                {game === "chess" && piece ? (
                  <span
                    className={`relative select-none text-[clamp(20px,6.4vw,40px)] leading-none ${
                      isWhitePiece(piece)
                        ? "text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)]"
                        : "text-slate-900 drop-shadow-[0_1px_1px_rgba(255,255,255,0.25)]"
                    }`}
                  >
                    {CHESS_GLYPH[piece.toLowerCase()] ?? ""}
                  </span>
                ) : null}

                {game === "checkers" && piece ? (
                  <span
                    className={`relative flex size-[72%] items-center justify-center rounded-full text-[10px] font-black ${
                      piece === "w" || piece === "W"
                        ? "bg-gradient-to-br from-white to-slate-300 text-slate-700 ring-1 ring-slate-500/50"
                        : "bg-gradient-to-br from-slate-700 to-slate-900 text-amber-300 ring-1 ring-black/60"
                    }`}
                  >
                    {piece === "W" || piece === "B" ? "★" : ""}
                  </span>
                ) : null}

                {isTarget ? (
                  <span className="pointer-events-none absolute size-[30%] rounded-full bg-emerald-400/70 ring-2 ring-emerald-200/60" />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (game === "gomoku") {
    return (
      <div className="mx-auto w-full max-w-[min(94vw,620px)]">
        <div
          className="grid gap-px overflow-hidden rounded-xl border border-amber-900/40 bg-amber-200/90 p-1 shadow-2xl shadow-black/40"
          style={{ gridTemplateColumns: `repeat(${GOMOKU_CELLS}, minmax(0, 1fr))` }}
        >
          {cells.map((cell, index) => {
            const mine = cell === "b" || cell === "w";
            return (
              <button
                key={index}
                type="button"
                disabled={!canMove || mine}
                aria-label={`ช่อง ${String.fromCharCode(65 + (index % 15))}${Math.floor(index / 15) + 1}`}
                onClick={() => canMove && !mine && onMove({ index })}
                className={`flex aspect-square items-center justify-center ${
                  canMove && !mine ? "hover:bg-amber-300/70" : ""
                }`}
              >
                <span
                  className={`size-[78%] rounded-full ${
                    cell === "b"
                      ? "bg-gradient-to-br from-slate-700 to-black shadow-inner"
                      : cell === "w"
                        ? "bg-gradient-to-br from-white to-slate-300 shadow-inner ring-1 ring-slate-400/60"
                        : ""
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Connect 4
  const cols = meta.cols;
  return (
    <div className="mx-auto w-full max-w-[min(94vw,560px)]">
      <div className="grid grid-cols-7 gap-1 rounded-2xl bg-[#1b2b57] p-2 shadow-2xl shadow-black/40">
        {Array.from({ length: cols }).map((_, col) => {
          const columnFull = Array.from({ length: 6 }).every((__, row) => Boolean(cells[row * cols + col]));
          return (
            <button
              key={`drop-${col}`}
              type="button"
              disabled={!canMove || columnFull}
              onClick={() => canMove && !columnFull && onMove({ col })}
              className={`rounded-md py-1 text-[10px] font-semibold transition ${
                canMove && !columnFull ? "bg-indigo-500/40 text-indigo-100 hover:bg-indigo-500/70" : "bg-white/5 text-slate-500"
              }`}
            >
              หยอด
            </button>
          );
        })}
        {Array.from({ length: 42 }).map((_, index) => {
          const cell = cells[index] ?? "";
          const col = index % cols;
          const columnFull = Array.from({ length: 6 }).every((__, row) => Boolean(cells[row * cols + col]));
          return (
            <button
              key={index}
              type="button"
              disabled={!canMove || columnFull}
              onClick={() => canMove && !columnFull && onMove({ col })}
              className="flex aspect-square items-center justify-center rounded-full bg-[#0a1020]"
              aria-label={`แถว ${Math.floor(index / cols) + 1} คอลัมน์ ${col + 1}`}
            >
              <span
                className={`size-[76%] rounded-full transition ${
                  cell === "r"
                    ? "bg-gradient-to-br from-rose-400 to-rose-600 ring-1 ring-rose-200/40"
                    : cell === "y"
                      ? "bg-gradient-to-br from-yellow-300 to-amber-500 ring-1 ring-yellow-100/50"
                      : "bg-[#0a1020]"
                }`}
              />
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-500">แตะคอลัมน์เพื่อหยอดหมาก</p>
    </div>
  );
}
