import { ApiError } from "./api";
import { all, one, nowIso, run } from "./db";
import { awardXp } from "./xp";
import { levelFromXp } from "./levels";
import { logAudit } from "./integrations";
import { chooseBotMove, fallbackMove } from "./games/bot";
import {
  applyEngineMove,
  boardCells,
  GAMES,
  initialBoard,
  isGameKey,
  legalMoves,
  notationFor,
  turnInfo,
  turnSeat,
  type AnyMove,
  type GameKey,
  type GameState,
  type Seat,
} from "./games";

/* ------------------------------------------------------------------ */
/*  เกมกระดาน 1v1 — ชั้นฐานข้อมูลและกติกาห้อง                          */
/* ------------------------------------------------------------------ */

export type RoomMode = "pvp" | "bot";
export type RoomStatus = "waiting" | "playing" | "finished";
export type FinishResult = "win" | "draw" | "resign" | "timeout" | "abandon";

export const BOT_SEAT: Seat = 1;
export const GAME_XP_DAILY_CAP = 150;
export const MAX_OPEN_ROOMS = 3;
export const WAITING_TTL_HOURS = 2;
export const TURN_SECONDS = [30, 60, 120, 300] as const;

const GAME_XP: Record<RoomMode, { win: number; draw: number; loss: number }> = {
  pvp: { win: 30, draw: 15, loss: 10 },
  bot: { win: 12, draw: 8, loss: 5 },
};

export type RoomRow = {
  id: number;
  game: GameKey;
  mode: RoomMode;
  status: RoomStatus;
  host_id: number;
  guest_id: number | null;
  turn_seat: number;
  board: string;
  turn_seconds: number;
  deadline_at: string | null;
  winner_seat: number | null;
  result: string | null;
  result_note: string | null;
  move_count: number;
  draw_offer_seat: number | null;
  last_move: string | null;
  version: number;
  host_seen: string | null;
  guest_seen: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

type JoinedRoom = RoomRow & {
  host_nickname: string;
  host_role: string;
  host_title: string | null;
  host_avatar_color: string;
  host_avatar_url: string | null;
  host_xp: number;
  guest_nickname: string | null;
  guest_role: string | null;
  guest_title: string | null;
  guest_avatar_color: string | null;
  guest_avatar_url: string | null;
  guest_xp: number | null;
};

const ROOM_SELECT = `
SELECT r.id, r.game, r.mode, r.status, r.host_id, r.guest_id, r.turn_seat, r.board, r.turn_seconds,
       r.deadline_at, r.winner_seat, r.result, r.result_note, r.move_count, r.draw_offer_seat,
       r.last_move, r.version, r.host_seen, r.guest_seen, r.created_at, r.started_at, r.finished_at,
       h.nickname AS host_nickname, h.role AS host_role, h.title AS host_title,
       h.avatar_color AS host_avatar_color, h.avatar_url AS host_avatar_url, h.xp AS host_xp,
       g.nickname AS guest_nickname, g.role AS guest_role, g.title AS guest_title,
       g.avatar_color AS guest_avatar_color, g.avatar_url AS guest_avatar_url, g.xp AS guest_xp
  FROM game_rooms r
  JOIN users h ON h.id = r.host_id
  LEFT JOIN users g ON g.id = r.guest_id`;

export type GameStatsRow = {
  user_id: number;
  game: string;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  rating: number;
  best_rating: number;
  streak: number;
};

const STATS_COLUMNS = `user_id, game, played, wins, losses, draws, rating, best_rating, streak`;

export async function statsFor(userId: number, game: GameKey): Promise<GameStatsRow> {
  const row = await one<GameStatsRow>(
    `SELECT ${STATS_COLUMNS} FROM game_stats WHERE user_id = ? AND game = ?`,
    userId,
    game,
  );
  if (row) return row;
  return {
    user_id: userId,
    game,
    played: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    rating: 1200,
    best_rating: 1200,
    streak: 0,
  };
}

async function saveStats(row: GameStatsRow): Promise<void> {
  await run(
    `INSERT INTO game_stats (${STATS_COLUMNS}, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, game) DO UPDATE SET
       played = excluded.played, wins = excluded.wins, losses = excluded.losses, draws = excluded.draws,
       rating = excluded.rating, best_rating = excluded.best_rating, streak = excluded.streak,
       updated_at = excluded.updated_at`,
    row.user_id,
    row.game,
    row.played,
    row.wins,
    row.losses,
    row.draws,
    row.rating,
    row.best_rating,
    row.streak,
    nowIso(),
  );
}

function startOfToday(): string {
  return `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
}

export async function gameXpToday(userId: number): Promise<number> {
  const row = await one<{ total: number | null }>(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM xp_log WHERE user_id = ? AND amount > 0 AND reason LIKE 'game:%' AND created_at >= ?",
    userId,
    startOfToday(),
  );
  return Number(row?.total ?? 0);
}

/** ให้ XP ตามผลเกม แต่ไม่เกินโควตาต่อวัน (กันการปั๊มแต้ม) */
async function awardGameXp(userId: number, game: GameKey, mode: RoomMode, outcome: "win" | "draw" | "loss"): Promise<number> {
  const used = await gameXpToday(userId);
  const remaining = Math.max(0, GAME_XP_DAILY_CAP - used);
  const wanted = GAME_XP[mode][outcome];
  const amount = Math.min(wanted, remaining);
  if (amount <= 0) return 0;
  await awardXp(userId, amount, `game:${game}:${outcome}`);
  return amount;
}

function eloDelta(ratingA: number, ratingB: number, scoreA: number, k = 24): number {
  const expected = 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
  return Math.round(k * (scoreA - expected));
}

/* ------------------------------------------------------------------ */
/*  Lobby / room creation                                              */
/* ------------------------------------------------------------------ */

export type LobbyRoom = {
  id: number;
  game: GameKey;
  gameName: string;
  hostNickname: string;
  hostRole: string;
  hostTitle: string | null;
  hostColor: string;
  hostLevel: number;
  turnSeconds: number;
  createdAt: string;
  isMine: boolean;
};

export type LeaderRow = {
  user_id: number;
  nickname: string;
  avatar_color: string;
  title: string | null;
  xp?: number;
  level: number;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  rating: number;
  streak: number;
};

export async function lobbyState(user: { id: number }) {
  const cutoff = new Date(Date.now() - WAITING_TTL_HOURS * 3600000).toISOString();
  await run(
    "UPDATE game_rooms SET status = 'finished', result = 'abandon', result_note = 'ห้องรอคู่แข่งนานเกินไป', finished_at = ? WHERE status = 'waiting' AND created_at < ?",
    nowIso(),
    cutoff,
  );

  const [rooms, active] = await Promise.all([
    all<JoinedRoom>(
      `${ROOM_SELECT} WHERE r.status = 'waiting' AND r.mode = 'pvp' AND r.created_at >= ? ORDER BY r.id DESC LIMIT 40`,
      cutoff,
    ),
    all<JoinedRoom>(
      `${ROOM_SELECT} WHERE (r.host_id = ? OR r.guest_id = ?) AND r.status != 'finished' ORDER BY r.id DESC LIMIT 5`,
      user.id,
      user.id,
    ),
  ]);

  const leaderboards: Record<string, LeaderRow[]> = {};
  for (const key of Object.keys(GAMES) as GameKey[]) {
    const rows = await all<LeaderRow>(
      `SELECT s.user_id, u.nickname, u.avatar_color, u.title, u.xp,
              s.played, s.wins, s.losses, s.draws, s.rating, s.streak
         FROM game_stats s JOIN users u ON u.id = s.user_id
        WHERE s.game = ? AND s.played > 0
        ORDER BY s.rating DESC, s.wins DESC, s.played ASC LIMIT 5`,
      key,
    );
    leaderboards[key] = rows.map((row) => ({
      ...row,
      level: levelFromXp(Number((row as unknown as { xp?: number }).xp ?? 0)),
    }));
  }

  const myStats: Record<string, GameStatsRow> = {};
  await Promise.all(
    (Object.keys(GAMES) as GameKey[]).map(async (key) => {
      myStats[key] = await statsFor(user.id, key);
    }),
  );

  const todo: LobbyRoom[] = rooms.map((room) => ({
    id: room.id,
    game: room.game,
    gameName: GAMES[room.game].name,
    hostNickname: room.host_nickname,
    hostRole: room.host_role,
    hostTitle: room.host_title,
    hostColor: room.host_avatar_color,
    hostLevel: levelFromXp(room.host_xp),
    turnSeconds: room.turn_seconds,
    createdAt: room.created_at,
    isMine: room.host_id === user.id,
  }));

  return {
    rooms: todo,
    active: active.map(slimRoom),
    leaderboards,
    myStats,
    xpToday: await gameXpToday(user.id),
    xpCap: GAME_XP_DAILY_CAP,
  };
}

function slimRoom(room: JoinedRoom) {
  return {
    id: room.id,
    game: room.game,
    gameName: GAMES[room.game]?.name ?? room.game,
    mode: room.mode,
    status: room.status,
    hostNickname: room.host_nickname,
    guestNickname: room.mode === "bot" ? "Nox Bot" : room.guest_nickname,
    turnSeconds: room.turn_seconds,
    createdAt: room.created_at,
  };
}

export async function createRoom(
  user: { id: number; nickname: string },
  input: { game: unknown; mode: unknown; turnSeconds: unknown },
): Promise<{ id: number }> {
  if (!isGameKey(input.game)) throw new ApiError(400, "เลือกเกมไม่ถูกต้อง");
  const game = input.game;
  const mode: RoomMode = input.mode === "bot" ? "bot" : "pvp";
  const turnSeconds = TURN_SECONDS.includes(Number(input.turnSeconds) as (typeof TURN_SECONDS)[number])
    ? Number(input.turnSeconds)
    : 60;

  const open = await one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM game_rooms WHERE host_id = ? AND status != 'finished'",
    user.id,
  );
  if (Number(open?.n ?? 0) >= MAX_OPEN_ROOMS) {
    throw new ApiError(429, `คุณมีห้องที่ยังไม่จบ ${MAX_OPEN_ROOMS} ห้องแล้ว — จบหรือออกจากห้องเดิมก่อน`);
  }

  const now = nowIso();
  const status: RoomStatus = mode === "bot" ? "playing" : "waiting";
  const inserted = await one<{ id: number }>(
    `INSERT INTO game_rooms (game, mode, status, host_id, guest_id, turn_seat, board, turn_seconds,
        deadline_at, created_at, started_at, host_seen, version)
     VALUES (?, ?, ?, ?, NULL, 0, ?, ?, ?, ?, ?, ?, 0) RETURNING id`,
    game,
    mode,
    status,
    user.id,
    JSON.stringify(initialBoard(game)),
    turnSeconds,
    mode === "bot" ? new Date(Date.now() + turnSeconds * 1000).toISOString() : null,
    now,
    mode === "bot" ? now : null,
    now,
  );
  if (!inserted) throw new ApiError(500, "สร้างห้องไม่สำเร็จ");

  await logAudit(user.id, "games.create", `game:${inserted.id}`, `สร้างห้อง ${GAMES[game].name} (${mode === "bot" ? "ซ้อมกับบอท" : "รอคู่แข่ง"})`);
  return { id: Number(inserted.id) };
}

/* ------------------------------------------------------------------ */
/*  Room helpers                                                       */
/* ------------------------------------------------------------------ */

export async function loadRoom(id: number): Promise<JoinedRoom | null> {
  return one<JoinedRoom>(`${ROOM_SELECT} WHERE r.id = ?`, id);
}

export async function joinRoom(user: { id: number; nickname: string }, id: number): Promise<void> {
  const room = await loadRoom(id);
  if (!room) throw new ApiError(404, "ไม่พบห้องนี้");
  if (room.mode === "bot") throw new ApiError(400, "ห้องนี้เป็นโหมดซ้อมกับบอท เข้าร่วมไม่ได้");
  if (room.host_id === user.id) throw new ApiError(400, "คุณเป็นเจ้าของห้องนี้อยู่แล้ว");
  if (room.status !== "waiting" || room.guest_id) throw new ApiError(409, "ห้องนี้เริ่มเกมหรือเต็มแล้ว");

  const now = nowIso();
  const deadline = new Date(Date.now() + room.turn_seconds * 1000).toISOString();
  const res = await run(
    `UPDATE game_rooms
        SET guest_id = ?, status = 'playing', started_at = ?, deadline_at = ?,
            guest_seen = ?, version = version + 1
      WHERE id = ? AND status = 'waiting' AND guest_id IS NULL`,
    user.id,
    now,
    deadline,
    now,
    id,
  );
  if (res.changes === 0) throw new ApiError(409, "มีคนเข้าห้องนี้ไปแล้ว");
  await logAudit(user.id, "games.join", `game:${id}`, `เข้าร่วมห้อง ${GAMES[room.game].name} ของ ${room.host_nickname}`);
}

type PlayerView = {
  id: number | null;
  nickname: string;
  role: string;
  title: string | null;
  avatarColor: string;
  avatarUrl: string | null;
  level: number;
  isBot: boolean;
  rating: number | null;
  wins: number;
  losses: number;
  draws: number;
};

export type RoomView = {
  id: number;
  game: GameKey;
  gameName: string;
  mode: RoomMode;
  status: RoomStatus;
  turnSeconds: number;
  deadlineAt: string | null;
  turnSeat: Seat;
  winnerSeat: Seat | null;
  result: string | null;
  resultNote: string | null;
  moveCount: number;
  drawOfferSeat: number | null;
  check: boolean;
  cells: string[];
  legal: AnyMove[];
  lastMove: AnyMove | null;
  mySeat: Seat | null;
  isSpectator: boolean;
  canMove: boolean;
  players: [PlayerView, PlayerView];
  spectators: string[];
  moves: Array<{ id: number; seat: number; ply: number; notation: string | null; created_at: string }>;
  messages: Array<{ id: number; user_id: number; nickname: string; body: string; created_at: string }>;
  serverTime: string;
};

async function playerView(
  seat: Seat,
  room: JoinedRoom,
): Promise<PlayerView> {
  if (seat === 0) {
    const stats = await statsFor(room.host_id, room.game);
    return {
      id: room.host_id,
      nickname: room.host_nickname,
      role: room.host_role,
      title: room.host_title,
      avatarColor: room.host_avatar_color,
      avatarUrl: room.host_avatar_url,
      level: levelFromXp(room.host_xp),
      isBot: false,
      rating: stats.played > 0 ? stats.rating : null,
      wins: stats.wins,
      losses: stats.losses,
      draws: stats.draws,
    };
  }
  if (room.mode === "bot") {
    return {
      id: null,
      nickname: "Nox Bot",
      role: "member",
      title: "บอทซ้อมมือ",
      avatarColor: "#7c3aed",
      avatarUrl: null,
      level: 1,
      isBot: true,
      rating: null,
      wins: 0,
      losses: 0,
      draws: 0,
    };
  }
  if (!room.guest_id) {
    return {
      id: null,
      nickname: "รอผู้ท้าชิง…",
      role: "member",
      title: null,
      avatarColor: "#334155",
      avatarUrl: null,
      level: 1,
      isBot: false,
      rating: null,
      wins: 0,
      losses: 0,
      draws: 0,
    };
  }
  const stats = await statsFor(room.guest_id, room.game);
  return {
    id: room.guest_id,
    nickname: room.guest_nickname ?? "ผู้ท้าชิง",
    role: room.guest_role ?? "member",
    title: room.guest_title,
    avatarColor: room.guest_avatar_color ?? "#6366f1",
    avatarUrl: room.guest_avatar_url,
    level: levelFromXp(room.guest_xp ?? 0),
    isBot: false,
    rating: stats.played > 0 ? stats.rating : null,
    wins: stats.wins,
    losses: stats.losses,
    draws: stats.draws,
  };
}

function parseState(room: JoinedRoom): GameState {
  try {
    return JSON.parse(room.board) as GameState;
  } catch {
    return initialBoard(room.game);
  }
}

/** นาฬิกาหมดเวลา → แพ้ (ทำแบบ lazy เมื่อมีคนเรียกดูห้อง) */
async function resolveClock(room: JoinedRoom): Promise<JoinedRoom> {
  if (room.status !== "playing" || !room.deadline_at) return room;
  if (new Date(room.deadline_at).getTime() > Date.now()) return room;
  const loser = room.turn_seat === 0 ? 0 : 1;
  const winnerSeat: Seat = loser === 0 ? 1 : 0;
  await finishRoom(room, {
    winnerSeat,
    result: "timeout",
    note: "หมดเวลาเดินหมาก",
  });
  return (await loadRoom(room.id)) ?? room;
}

export async function roomView(user: { id: number }, id: number): Promise<RoomView> {
  let room = await loadRoom(id);
  if (!room) throw new ApiError(404, "ไม่พบห้องนี้");
  room = await resolveClock(room);

  const now = nowIso();
  const nowMs = Date.now();
  if (room.host_id === user.id) {
    if (!room.host_seen || nowMs - new Date(room.host_seen).getTime() > 8000) {
      await run("UPDATE game_rooms SET host_seen = ? WHERE id = ?", now, room.id);
    }
  } else if (room.guest_id === user.id) {
    if (!room.guest_seen || nowMs - new Date(room.guest_seen).getTime() > 8000) {
      await run("UPDATE game_rooms SET guest_seen = ? WHERE id = ?", now, room.id);
    }
  } else {
    await run(
      `INSERT INTO game_spectators (room_id, user_id, last_seen) VALUES (?, ?, ?)
       ON CONFLICT(room_id, user_id) DO UPDATE SET last_seen = excluded.last_seen
        WHERE excluded.last_seen > game_spectators.last_seen`,
      room.id,
      user.id,
      now,
    );
  }

  await run("DELETE FROM game_spectators WHERE room_id = ? AND last_seen < ?", room.id, new Date(nowMs - 45000).toISOString());

  const [players, moves, messages, spectators] = await Promise.all([
    Promise.all([playerView(0, room), playerView(1, room)]),
    all<{ id: number; seat: number; ply: number; notation: string | null; created_at: string }>(
      "SELECT id, seat, ply, notation, created_at FROM game_moves WHERE room_id = ? ORDER BY ply DESC LIMIT 40",
      room.id,
    ),
    all<{ id: number; user_id: number; nickname: string; body: string; created_at: string }>(
      `SELECT m.id, m.user_id, u.nickname, m.body, m.created_at
         FROM game_messages m JOIN users u ON u.id = m.user_id
        WHERE m.room_id = ? ORDER BY m.id DESC LIMIT 50`,
      room.id,
    ),
    all<{ nickname: string }>(
      `SELECT u.nickname FROM game_spectators s JOIN users u ON u.id = s.user_id
        WHERE s.room_id = ? AND s.user_id != ? ORDER BY s.last_seen DESC LIMIT 20`,
      room.id,
      room.host_id,
    ),
  ]);

  const state = parseState(room);
  const info = turnInfo(room.game, state);
  const mySeat: Seat | null =
    room.mode === "bot"
      ? room.host_id === user.id
        ? 0
        : null
      : room.host_id === user.id
        ? 0
        : room.guest_id === user.id
          ? 1
          : null;
  const isSpectator = mySeat === null;

  return {
    id: room.id,
    game: room.game,
    gameName: GAMES[room.game].name,
    mode: room.mode,
    status: room.status,
    turnSeconds: room.turn_seconds,
    deadlineAt: room.deadline_at,
    turnSeat: turnSeat(state),
    winnerSeat: room.winner_seat === 0 || room.winner_seat === 1 ? (room.winner_seat as Seat) : null,
    result: room.result,
    resultNote: room.result_note,
    moveCount: room.move_count,
    drawOfferSeat: room.draw_offer_seat,
    check: info.check,
    cells: boardCells(state),
    legal: room.status === "playing" ? legalMoves(room.game, state) : [],
    lastMove: room.last_move ? (JSON.parse(room.last_move) as AnyMove) : null,
    mySeat,
    isSpectator,
    canMove:
      room.status === "playing" && mySeat !== null && turnSeat(state) === mySeat,
    players: players as [PlayerView, PlayerView],
    spectators: spectators.map((row) => row.nickname).filter(Boolean),
    moves: moves.reverse(),
    messages: messages.reverse(),
    serverTime: now,
  };
}

/* ------------------------------------------------------------------ */
/*  Finish / stats / Elo                                               */
/* ------------------------------------------------------------------ */

async function finishRoom(
  room: JoinedRoom,
  opts: { winnerSeat: Seat | null; result: FinishResult; note: string },
): Promise<void> {
  const now = nowIso();
  const res = await run(
    `UPDATE game_rooms
        SET status = 'finished', winner_seat = ?, result = ?, result_note = ?,
            finished_at = ?, draw_offer_seat = NULL, deadline_at = NULL, version = version + 1
      WHERE id = ? AND status = 'playing'`,
    opts.winnerSeat,
    opts.result,
    opts.note,
    now,
    room.id,
  );
  if (res.changes === 0) return;

  if (room.mode === "bot") {
    const hostOutcome = opts.winnerSeat === 0 ? "win" : opts.winnerSeat === 1 ? "loss" : "draw";
    await awardGameXp(room.host_id, room.game, "bot", hostOutcome);
    return;
  }
  if (!room.guest_id) return;

  const [hostStats, guestStats] = await Promise.all([
    statsFor(room.host_id, room.game),
    statsFor(room.guest_id, room.game),
  ]);

  const hostScore = opts.winnerSeat === null ? 0.5 : opts.winnerSeat === 0 ? 1 : 0;
  const guestScore = 1 - hostScore;
  const hostDelta = eloDelta(hostStats.rating, guestStats.rating, hostScore);
  const guestDelta = eloDelta(guestStats.rating, hostStats.rating, guestScore);

  const settle = (row: GameStatsRow, delta: number, score: number): GameStatsRow => {
    const next: GameStatsRow = {
      ...row,
      played: row.played + 1,
      wins: row.wins + (score === 1 ? 1 : 0),
      losses: row.losses + (score === 0 ? 1 : 0),
      draws: row.draws + (score === 0.5 ? 1 : 0),
      rating: Math.max(100, row.rating + delta),
      streak: score === 1 ? Math.max(1, row.streak + 1) : 0,
    };
    next.best_rating = Math.max(row.best_rating, next.rating);
    return next;
  };

  const nextHost = settle(hostStats, hostDelta, hostScore);
  const nextGuest = settle(guestStats, guestDelta, guestScore);
  await Promise.all([saveStats(nextHost), saveStats(nextGuest)]);

  await Promise.all([
    awardGameXp(room.host_id, room.game, "pvp", hostScore === 1 ? "win" : hostScore === 0 ? "loss" : "draw"),
    awardGameXp(room.guest_id, room.game, "pvp", guestScore === 1 ? "win" : guestScore === 0 ? "loss" : "draw"),
  ]);
}

/* ------------------------------------------------------------------ */
/*  Moves                                                              */
/* ------------------------------------------------------------------ */

function seatOfUser(room: JoinedRoom, userId: number): Seat | null {
  if (room.host_id === userId) return 0;
  if (room.guest_id === userId) return 1;
  return null;
}

async function persistMove(
  room: JoinedRoom,
  seat: Seat,
  move: AnyMove,
  state: GameState,
): Promise<{ outcome: ReturnType<typeof applyEngineMove>; room: JoinedRoom }> {
  const outcome = applyEngineMove(room.game, state, seat, move);
  if (!outcome.ok) throw new ApiError(400, outcome.error);

  const notation = notationFor(room.game, state, move);
  const now = nowIso();
  const nextTurn = turnSeat(outcome.state);
  const deadline = outcome.over ? null : new Date(Date.now() + room.turn_seconds * 1000).toISOString();

  await run(
    `UPDATE game_rooms
        SET board = ?, turn_seat = ?, move_count = move_count + 1, version = version + 1,
            last_move = ?, deadline_at = ?, draw_offer_seat = NULL
      WHERE id = ?`,
    JSON.stringify(outcome.state),
    nextTurn,
    JSON.stringify(move),
    deadline,
    room.id,
  );
  await run(
    "INSERT INTO game_moves (room_id, seat, ply, move, notation, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    room.id,
    seat,
    room.move_count + 1,
    JSON.stringify(move),
    notation,
    now,
  );

  let fresh = (await loadRoom(room.id)) ?? room;
  if (outcome.over) {
    // เกมยังคง status='playing' จนถึงตรงนี้ เพื่อให้ finishRoom แจกแต้ม/อันดับได้ครั้งเดียว
    await finishRoom(fresh, {
      winnerSeat: outcome.winnerSeat,
      result: outcome.result === "draw" ? "draw" : "win",
      note: outcome.note || "จบเกม",
    });
    fresh = (await loadRoom(room.id)) ?? fresh;
  }

  return { outcome, room: fresh };
}

async function runBotIfNeeded(roomId: number): Promise<void> {
  for (let guard = 0; guard < 3; guard += 1) {
    const room = await loadRoom(roomId);
    if (!room || room.mode !== "bot" || room.status !== "playing") return;
    const state = parseState(room);
    if (turnSeat(state) !== BOT_SEAT) return;
    const move = chooseBotMove(room.game, state, BOT_SEAT) ?? fallbackMove(room.game, state);
    if (!move) return;
    const result = await persistMove(room, BOT_SEAT, move, state);
    if (result.outcome.ok && result.outcome.over) return;
  }
}

export async function playMove(user: { id: number }, id: number, move: AnyMove): Promise<RoomView> {
  let room = await loadRoom(id);
  if (!room) throw new ApiError(404, "ไม่พบห้องนี้");
  room = await resolveClock(room);
  if (room.status !== "playing") throw new ApiError(409, "เกมนี้จบแล้ว");
  if (room.mode === "bot" && room.host_id !== user.id) throw new ApiError(403, "คุณไม่ได้อยู่ในห้องนี้");

  const seat = seatOfUser(room, user.id);
  if (seat === null) throw new ApiError(403, "ผู้ชมดูได้อย่างเดียว");

  const state = parseState(room);
  if (turnSeat(state) !== seat) throw new ApiError(409, "ยังไม่ถึงตาของคุณ");

  await persistMove(room, seat, move, state);
  if (room.mode === "bot") await runBotIfNeeded(room.id);

  return roomView(user, id);
}

/* ------------------------------------------------------------------ */
/*  Actions: resign / draw / leave / chat                              */
/* ------------------------------------------------------------------ */

export type RoomAction = "resign" | "offer-draw" | "accept-draw" | "decline-draw" | "leave";

export type RoomActionOutcome = { closed: true } | { closed: false; view: RoomView };

export async function roomAction(user: { id: number }, id: number, action: RoomAction): Promise<RoomActionOutcome> {
  let room = await loadRoom(id);
  if (!room) throw new ApiError(404, "ไม่พบห้องนี้");
  room = await resolveClock(room);
  const seat = seatOfUser(room, user.id);

  if (action === "leave") {
    if (room.status === "waiting" && room.host_id === user.id) {
      await run("DELETE FROM game_rooms WHERE id = ? AND status = 'waiting'", id);
      return { closed: true };
    }
    if (room.status !== "playing" || seat === null) throw new ApiError(400, "ออกจากห้องนี้ไม่ได้");
    await finishRoom(room, {
      winnerSeat: seat === 0 ? 1 : 0,
      result: "resign",
      note: `${participantName(room, seat)} ออกจากห้อง`,
    });
    return { closed: false, view: await roomView(user, id) };
  }

  if (seat === null) throw new ApiError(403, "ผู้ชมทำรายการนี้ไม่ได้");
  if (room.status !== "playing") throw new ApiError(409, "เกมนี้จบแล้ว");

  if (action === "resign") {
    await finishRoom(room, {
      winnerSeat: seat === 0 ? 1 : 0,
      result: "resign",
      note: participantName(room, seat) + " ยอมแพ้",
    });
    return { closed: false, view: await roomView(user, id) };
  }

  if (room.mode === "bot") throw new ApiError(400, "โหมดซ้อมกับบอทไม่มีระบบขอเสมอ");

  if (action === "offer-draw") {
    if (room.draw_offer_seat !== null) throw new ApiError(409, "มีคำขอเสมอค้างอยู่แล้ว");
    await run("UPDATE game_rooms SET draw_offer_seat = ?, version = version + 1 WHERE id = ?", seat, id);
    return { closed: false, view: await roomView(user, id) };
  }

  if (action === "decline-draw") {
    if (room.draw_offer_seat === null) throw new ApiError(400, "ไม่มีคำขอเสมอ");
    if (room.draw_offer_seat === seat) throw new ApiError(400, "คุณเป็นคนขอเสมอเอง");
    await run("UPDATE game_rooms SET draw_offer_seat = NULL, version = version + 1 WHERE id = ?", id);
    return { closed: false, view: await roomView(user, id) };
  }

  if (action === "accept-draw") {
    if (room.draw_offer_seat === null || room.draw_offer_seat === seat) {
      throw new ApiError(400, "ไม่มีคำขอเสมอจากอีกฝ่าย");
    }
    await finishRoom(room, { winnerSeat: null, result: "draw", note: "ตกลงเสมอ" });
    return { closed: false, view: await roomView(user, id) };
  }

  throw new ApiError(400, "ไม่รู้จักคำสั่งนี้");
}

function participantName(room: JoinedRoom, seat: Seat): string {
  if (seat === 0) return room.host_nickname;
  return room.mode === "bot" ? "Nox Bot" : room.guest_nickname ?? "ผู้ท้าชิง";
}

export async function sendChat(user: { id: number; nickname: string }, id: number, raw: string): Promise<void> {
  const room = await loadRoom(id);
  if (!room) throw new ApiError(404, "ไม่พบห้องนี้");
  const body = raw.trim().slice(0, 200);
  if (!body) throw new ApiError(400, "พิมพ์ข้อความก่อนส่ง");

  const recent = await one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM game_messages WHERE room_id = ? AND user_id = ? AND created_at >= ?",
    id,
    user.id,
    new Date(Date.now() - 10000).toISOString(),
  );
  if (Number(recent?.n ?? 0) >= 5) throw new ApiError(429, "ส่งถี่เกินไป รอสักครู่แล้วลองใหม่");

  await run(
    "INSERT INTO game_messages (room_id, user_id, body, created_at) VALUES (?, ?, ?, ?)",
    id,
    user.id,
    body,
    nowIso(),
  );
}
