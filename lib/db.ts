import { getCloudflareContext } from "@opennextjs/cloudflare";
import { hashPassword, verifyPassword } from "./crypto";

/* ------------------------------------------------------------------ */
/*  Bindings (Cloudflare D1 + R2)                                      */
/* ------------------------------------------------------------------ */

type D1Meta = { changes?: number; last_row_id?: number; duration?: number };

type D1Prepared = {
  bind(...values: unknown[]): D1Prepared;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[]; meta?: D1Meta; success: boolean }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ meta?: D1Meta; success: boolean }>;
};

export type D1Database = {
  prepare(sql: string): D1Prepared;
  exec(sql: string): Promise<{ count: number; duration: number }>;
};

export type R2ObjectBody = {
  body: ReadableStream;
  size: number;
  httpEtag?: string;
  writeHttpMetadata?(headers: Headers): void;
};

export type R2Bucket = {
  get(key: string, options?: { range?: { offset: number; length?: number } }): Promise<R2ObjectBody | null>;
  put(
    key: string,
    value: ArrayBuffer | Uint8Array | string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  delete(key: string): Promise<void>;
  head(key: string): Promise<{ size: number } | null>;
};

export type Bindings = {
  DB: D1Database;
  FILES: R2Bucket;
  [key: string]: unknown;
};

async function bindings(): Promise<Bindings> {
  const { env } = await getCloudflareContext({ async: true });
  const resolved = env as unknown as Bindings;
  if (!resolved?.DB) throw new Error("ไม่พบฐานข้อมูล D1 (binding: DB)");
  return resolved;
}

/** R2 bucket that stores uploaded/downloaded song files. */
export async function files(): Promise<R2Bucket> {
  const env = await bindings();
  if (!env.FILES) throw new Error("ไม่พบที่เก็บไฟล์ R2 (binding: FILES)");
  return env.FILES;
}

/* ------------------------------------------------------------------ */
/*  Lazy, per-isolate initialisation                                   */
/* ------------------------------------------------------------------ */

let ready: Promise<D1Database> | null = null;

async function database(): Promise<D1Database> {
  if (!ready) {
    ready = initialise().catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}

async function initialise(): Promise<D1Database> {
  const env = await bindings();
  await migrate(env.DB);
  await ensureOwner(env.DB);
  await seed(env.DB);
  return env.DB;
}

/**
 * Schema version. Bump it whenever SCHEMA changes so existing databases run the
 * statements again; unchanged databases skip the whole block (one cheap query).
 */
const SCHEMA_VERSION = "2026-11-21.2";

/** Columns added after the first release — existing databases need ALTER TABLE. */
const ADDED_COLUMNS: Array<{ table: string; column: string; statement: string }> = [
  { table: "users", column: "xp", statement: "ALTER TABLE users ADD COLUMN xp INTEGER NOT NULL DEFAULT 0" },
  { table: "users", column: "bio", statement: "ALTER TABLE users ADD COLUMN bio TEXT" },
  { table: "users", column: "title", statement: "ALTER TABLE users ADD COLUMN title TEXT" },
  { table: "users", column: "avatar_url", statement: "ALTER TABLE users ADD COLUMN avatar_url TEXT" },
  { table: "messages", column: "edited_at", statement: "ALTER TABLE messages ADD COLUMN edited_at TEXT" },
];

async function ensureColumns(db: D1Database): Promise<void> {
  for (const entry of ADDED_COLUMNS) {
    const info = await db.prepare(`PRAGMA table_info(${entry.table})`).all<{ name?: string }>();
    const names = (info.results ?? []).map((row) => String(row.name ?? ""));
    if (names.includes(entry.column)) continue;
    await db.prepare(entry.statement).run();
  }
}

/** D1's exec() is line-oriented, so apply the schema statement by statement. */
async function migrate(db: D1Database): Promise<void> {
  const current = await db
    .prepare("SELECT value FROM settings WHERE key = 'schema_version'")
    .first<{ value?: string }>()
    .catch(() => null);
  if (current?.value === SCHEMA_VERSION) return;

  const statements = SCHEMA.split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
  for (const statement of statements) {
    await db.prepare(statement).run();
  }
  await ensureColumns(db);
  await db
    .prepare(
      "INSERT INTO settings (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .bind(SCHEMA_VERSION)
    .run();
}

/* ------------------------------------------------------------------ */
/*  Query helpers                                                      */
/* ------------------------------------------------------------------ */

function clean(params: unknown[]): Array<string | number | null | ArrayBuffer> {
  return params.map((param) => {
    if (param === undefined || param === null) return null;
    if (typeof param === "boolean") return param ? 1 : 0;
    if (param instanceof Date) return param.toISOString();
    if (param instanceof Uint8Array) return param.buffer.slice(param.byteOffset, param.byteOffset + param.byteLength) as ArrayBuffer;
    return param as string | number;
  });
}

export async function all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> {
  const db = await database();
  const result = await db.prepare(sql).bind(...clean(params)).all<T>();
  return (result.results ?? []).map((row) => ({ ...row })) as T[];
}

export async function one<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T | null> {
  const rows = await all<T>(sql, ...params);
  return rows[0] ?? null;
}

export async function run(sql: string, ...params: unknown[]): Promise<{ changes: number; lastInsertRowid: number }> {
  const db = await database();
  const result = await db.prepare(sql).bind(...clean(params)).run();
  return {
    changes: Number(result.meta?.changes ?? 0),
    lastInsertRowid: Number(result.meta?.last_row_id ?? 0),
  };
}

export function nowIso(): string {
  return new Date().toISOString();
}

export { hashPassword, verifyPassword };

/* ------------------------------------------------------------------ */
/*  Schema                                                             */
/* ------------------------------------------------------------------ */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  email          TEXT NOT NULL UNIQUE,
  real_name      TEXT NOT NULL,
  nickname       TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'member',
  status         TEXT NOT NULL DEFAULT 'active',
  password_hash  TEXT,
  avatar_color   TEXT NOT NULL DEFAULT '#6366f1',
  avatar_url     TEXT,
  xp             INTEGER NOT NULL DEFAULT 0,
  bio            TEXT,
  title          TEXT,
  created_at     TEXT NOT NULL,
  last_login_at  TEXT
);

CREATE TABLE IF NOT EXISTS invite_keys (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL UNIQUE,
  note        TEXT,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL,
  used_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  used_at     TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_agent  TEXT,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS channels (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  icon        TEXT NOT NULL DEFAULT '#',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id  INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, id);

CREATE TABLE IF NOT EXISTS announcements (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  pinned      INTEGER NOT NULL DEFAULT 0,
  important   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_announcements_pinned ON announcements(pinned, created_at);

CREATE TABLE IF NOT EXISTS meetings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  agenda      TEXT,
  room_code   TEXT NOT NULL UNIQUE,
  starts_at   TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'scheduled',
  notes       TEXT,
  created_by  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON meetings(status, starts_at);

CREATE TABLE IF NOT EXISTS meeting_participants (
  meeting_id  INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hand_raised INTEGER NOT NULL DEFAULT 0,
  joined_at   TEXT NOT NULL,
  last_seen   TEXT NOT NULL,
  PRIMARY KEY (meeting_id, user_id)
);

CREATE TABLE IF NOT EXISTS meeting_messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id  INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  subject     TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  due_date    TEXT,
  created_by  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);

CREATE TABLE IF NOT EXISTS task_status (
  task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'todo',
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (task_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_task_status_user ON task_status(user_id);

CREATE TABLE IF NOT EXISTS schedule_entries (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  kind         TEXT NOT NULL DEFAULT 'class',
  title        TEXT NOT NULL,
  subject      TEXT,
  location     TEXT,
  day_of_week  INTEGER,
  start_time   TEXT,
  end_time     TEXT,
  date         TEXT,
  note         TEXT,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_schedule_kind_day ON schedule_entries(kind, day_of_week);

CREATE TABLE IF NOT EXISTS attendance (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,
  status      TEXT NOT NULL,
  note        TEXT,
  created_at  TEXT NOT NULL,
  UNIQUE (user_id, date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);

CREATE TABLE IF NOT EXISTS polls (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  question    TEXT NOT NULL,
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'open',
  created_by  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS poll_options (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id  INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  label    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_poll_options_poll ON poll_options(poll_id);

CREATE TABLE IF NOT EXISTS poll_votes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  poll_id    INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  option_id  INTEGER NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE (poll_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON poll_votes(poll_id);

CREATE TABLE IF NOT EXISTS resources (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  description TEXT,
  url         TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'sheet',
  subject     TEXT,
  created_by  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_resources_created ON resources(created_at);

CREATE TABLE IF NOT EXISTS qa_posts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  subject    TEXT,
  resolved   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_qa_posts_created ON qa_posts(created_at);

CREATE TABLE IF NOT EXISTS qa_answers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id    INTEGER NOT NULL REFERENCES qa_posts(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_qa_answers_post ON qa_answers(post_id);

CREATE TABLE IF NOT EXISTS inventory_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT,
  total_qty   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory_loans (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id      INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  qty          INTEGER NOT NULL DEFAULT 1,
  borrowed_at  TEXT NOT NULL,
  due_at       TEXT,
  returned_at  TEXT,
  note         TEXT
);
CREATE INDEX IF NOT EXISTS idx_inventory_loans_item ON inventory_loans(item_id);

CREATE TABLE IF NOT EXISTS gallery_photos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  image_url  TEXT NOT NULL,
  caption    TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gallery_created ON gallery_photos(created_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  target     TEXT,
  detail     TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS webhooks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'discord',
  url          TEXT NOT NULL,
  secret       TEXT,
  enabled      INTEGER NOT NULL DEFAULT 1,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL,
  last_status  TEXT,
  last_sent_at TEXT
);

CREATE TABLE IF NOT EXISTS api_keys (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  prefix       TEXT NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,
  enabled      INTEGER NOT NULL DEFAULT 1,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at   TEXT
);

CREATE TABLE IF NOT EXISTS songs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  artist       TEXT NOT NULL,
  album        TEXT,
  artwork_url  TEXT,
  file_path    TEXT NOT NULL,
  duration_ms  INTEGER,
  source_id    TEXT,
  source       TEXT NOT NULL DEFAULT 'upload',
  mime         TEXT NOT NULL DEFAULT 'audio/mpeg',
  added_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_songs_created ON songs(created_at);

CREATE TABLE IF NOT EXISTS xp_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount     INTEGER NOT NULL,
  reason     TEXT NOT NULL,
  actor_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_xp_log_user ON xp_log(user_id, id);

CREATE TABLE IF NOT EXISTS user_titles (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  granted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, label)
);

CREATE TABLE IF NOT EXISTS nox_messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nox_messages_user ON nox_messages(user_id, id);

CREATE TABLE IF NOT EXISTS music_queue (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id    INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  added_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status     TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  started_at TEXT,
  played_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_music_queue_status ON music_queue(status, id);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket   TEXT PRIMARY KEY,
  hits     INTEGER NOT NULL DEFAULT 0,
  reset_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS key_shares (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  token          TEXT NOT NULL UNIQUE,
  label          TEXT,
  max_uses       INTEGER NOT NULL DEFAULT 10,
  uses           INTEGER NOT NULL DEFAULT 0,
  expires_at     TEXT NOT NULL,
  revoked_at     TEXT,
  created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL,
  last_viewed_at TEXT
);

CREATE TABLE IF NOT EXISTS key_requests (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose    TEXT,
  status     TEXT NOT NULL DEFAULT 'pending',
  code       TEXT,
  handled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  handled_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_key_requests_status ON key_requests(status, id);

CREATE TABLE IF NOT EXISTS message_reactions (
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS announcement_reads (
  announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at      TEXT NOT NULL,
  PRIMARY KEY (announcement_id, user_id)
);

CREATE TABLE IF NOT EXISTS rewards (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT,
  cost        INTEGER NOT NULL DEFAULT 50,
  stock       INTEGER,
  active      INTEGER NOT NULL DEFAULT 1,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reward_redemptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  reward_id  INTEGER NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cost       INTEGER NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',
  handled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  handled_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_status ON reward_redemptions(status, id);

CREATE TABLE IF NOT EXISTS user_badges (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code      TEXT NOT NULL,
  earned_at TEXT NOT NULL,
  UNIQUE (user_id, code)
);
CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id);
`;

/* ------------------------------------------------------------------ */
/*  Seed                                                               */
/* ------------------------------------------------------------------ */

const AVATAR_COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#8b5cf6", "#ef4444", "#14b8a6"];
export function randomAvatarColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

/**
 * Keep the super-admin account in sync with the environment on every boot.
 * The seeded owner can always log in with ADMIN_EMAIL + ADMIN_BOOTSTRAP_PASSWORD.
 */
async function ensureOwner(db: D1Database): Promise<void> {
  const email = (process.env.ADMIN_EMAIL || "noppasitdeelert@gmail.com").toLowerCase();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD || "";
  if (!password) return;

  const name = process.env.ADMIN_NAME || "Noppasit Deelert";
  const nickname = process.env.ADMIN_NICKNAME || "Admin";
  const now = new Date().toISOString();
  const existing = await db
    .prepare("SELECT id, role, password_hash FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: number; role: string; password_hash: string | null }>();

  if (!existing) {
    await db
      .prepare(
        "INSERT INTO users (email, real_name, nickname, role, status, password_hash, avatar_color, created_at) VALUES (?, ?, ?, 'owner', 'active', ?, '#f59e0b', ?)",
      )
      .bind(email, name, nickname, await hashPassword(password), now)
      .run();
    return;
  }

  const matches = await verifyPassword(password, existing.password_hash);
  if (matches && existing.role === "owner") return;
  await db
    .prepare("UPDATE users SET role = 'owner', status = 'active', password_hash = ? WHERE id = ?")
    .bind(await hashPassword(password), existing.id)
    .run();
}

async function seed(db: D1Database): Promise<void> {
  const seeded = await db.prepare("SELECT value FROM settings WHERE key = 'seeded'").first<{ value?: string }>();
  if (seeded) return;

  const now = new Date().toISOString();
  const adminEmail = (process.env.ADMIN_EMAIL || "noppasitdeelert@gmail.com").toLowerCase();
  const adminName = process.env.ADMIN_NAME || "Noppasit Deelert";
  const adminNick = process.env.ADMIN_NICKNAME || "Admin";

  const existing = await db.prepare("SELECT id FROM users WHERE email = ?").bind(adminEmail).first<{ id: number }>();
  const passwordHash = process.env.ADMIN_BOOTSTRAP_PASSWORD ? await hashPassword(process.env.ADMIN_BOOTSTRAP_PASSWORD) : null;

  let adminId: number;
  if (existing) {
    adminId = Number(existing.id);
    if (passwordHash) {
      await db.prepare("UPDATE users SET role = 'owner', password_hash = ? WHERE id = ?").bind(passwordHash, adminId).run();
    }
  } else {
    const res = await db
      .prepare(
        "INSERT INTO users (email, real_name, nickname, role, status, password_hash, avatar_color, created_at) VALUES (?, ?, ?, 'owner', 'active', ?, '#f59e0b', ?)",
      )
      .bind(adminEmail, adminName, adminNick, passwordHash, now)
      .run();
    adminId = Number(res.meta?.last_row_id ?? 0);
  }

  const channels: Array<[string, string, string, string, number]> = [
    ["general", "คุยทั่วไป", "พูดคุยเรื่องทั่วไปของห้อง SKC105", "💬", 1],
    ["study", "เรื่องเรียน-การบ้าน", "สอบถามการบ้าน สรุปบทเรียน และติวด้วยกัน", "📚", 2],
    ["games", "นัดเล่นเกม", "ชวนเล่นเกม ปาร์ตี้ และกิจกรรมว่าง", "🎮", 3],
    ["admin", "แจ้งแอดมิน", "แจ้งปัญหา ข้อเสนอแนะ และเรื่องด่วนถึงแอดมิน", "🛎️", 4],
  ];
  const insertChannel = db.prepare(
    "INSERT OR IGNORE INTO channels (slug, name, description, icon, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  for (const channel of channels) await insertChannel.bind(...channel, now).run();

  await db
    .prepare("INSERT INTO announcements (author_id, title, body, pinned, important, created_at, updated_at) VALUES (?, ?, ?, 1, 1, ?, ?)")
    .bind(
      adminId,
      "ยินดีต้อนรับสู่ SKC105 Room Hub 🎉",
      "ศูนย์กลางของห้อง SKC105 อยู่ที่นี่แล้ว — ประกาศ การบ้าน ตารางเรียน ห้องประชุม และคลังไฟล์สรุป\n\nเริ่มต้นด้วยการกดเช็กชื่อที่หน้าแรก แล้วอ่านประกาศปักหมุดให้ครบก่อนนะ",
      now,
      now,
    )
    .run();

  await db
    .prepare("INSERT INTO announcements (author_id, title, body, pinned, important, created_at, updated_at) VALUES (?, ?, ?, 0, 1, ?, ?)")
    .bind(
      adminId,
      "กำหนดการสอบกลางภาค",
      "สอบกลางภาคสัปดาห์หน้า ตรวจสอบตารางสอบได้ที่หน้าตารางเรียน และอย่าลืมแจ้งสถานะการเข้าเรียนให้เรียบร้อย",
      now,
      now,
    )
    .run();

  const tasks: Array<[string, string, string, number]> = [
    ["คณิตศาสตร์", "แบบฝึกหัดบทที่ 4 (ตรีโกณมิติ)", "ทำข้อ 1-20 ในหนังสือแบบฝึกหัด ส่งเป็นไฟล์ PDF", 1],
    ["ภาษาอังกฤษ", "Essay: My Future Career", "ความยาว 250 คำ ตรวจไวยากรณ์ก่อนส่ง", 2],
    ["วิทยาศาสตร์", "รายงานการทดลอง pH", "ส่งรายงานกลุ่ม กลุ่มละ 1 ไฟล์", 4],
  ];
  const insertTask = db.prepare(
    "INSERT INTO tasks (subject, title, description, due_date, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  for (const [subject, title, description, inDays] of tasks) {
    const due = new Date(Date.now() + inDays * 86400000).toISOString().slice(0, 10);
    await insertTask.bind(subject, title, description, due, adminId, now).run();
  }

  const classes: Array<[string, string, number, string, string]> = [
    ["คณิตศาสตร์", "อ.สมชาย", 1, "08:30", "10:00"],
    ["ภาษาอังกฤษ", "อ.มานี", 1, "10:15", "11:45"],
    ["วิทยาศาสตร์", "อ.ปิติ", 2, "08:30", "10:00"],
    ["สังคมศึกษา", "อ.วีระ", 3, "13:00", "14:30"],
    ["คอมพิวเตอร์", "อ.นภา", 4, "10:15", "11:45"],
  ];
  const insertSchedule = db.prepare(
    "INSERT INTO schedule_entries (kind, title, subject, location, day_of_week, start_time, end_time, created_by, created_at) VALUES ('class', ?, ?, 'SKC105', ?, ?, ?, ?, ?)",
  );
  for (const [title, subject, day, start, end] of classes) {
    await insertSchedule.bind(title, subject, day, start, end, adminId, now).run();
  }

  const duties: Array<[string, number]> = [
    ["ทำความสะอาดกระดาน", 1],
    ["ทิ้งขยะ + ถูพื้น", 2],
    ["จัดโต๊ะเรียน", 3],
    ["รดน้ำต้นไม้", 4],
    ["เช็กอุปกรณ์โปรเจกเตอร์", 5],
  ];
  const insertDuty = db.prepare(
    "INSERT INTO schedule_entries (kind, title, day_of_week, created_by, created_at) VALUES ('duty', ?, ?, ?, ?)",
  );
  for (const [title, day] of duties) await insertDuty.bind(title, day, adminId, now).run();

  const poll = await db
    .prepare("INSERT INTO polls (question, description, created_by, created_at) VALUES (?, ?, ?, ?)")
    .bind("ทริปห้อง SKC105 ปลายเทอมไปไหนดี?", "โหวตได้ 1 ครั้งต่อบัญชี ปิดโหวตสิ้นเดือนนี้", adminId, now)
    .run();
  const pollId = Number(poll.meta?.last_row_id ?? 0);
  const insertOption = db.prepare("INSERT INTO poll_options (poll_id, label) VALUES (?, ?)");
  for (const label of ["ทะเลพัทยา", "ภูเขาเขาใหญ่", "สวนสนุกดรีมเวิลด์", "คาเฟ่ในเมือง"]) {
    await insertOption.bind(pollId, label).run();
  }

  const insertResource = db.prepare(
    "INSERT INTO resources (title, description, url, category, subject, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  await insertResource
    .bind("ชีทสรุปตรีโกณมิติ", "สรุปสูตรและตัวอย่างโจทย์บทที่ 4", "https://drive.google.com/", "sheet", "คณิตศาสตร์", adminId, now)
    .run();
  await insertResource
    .bind("คลังข้อสอบเก่า", "รวมข้อสอบปีก่อนพร้อมเฉลย", "https://drive.google.com/", "exam", "ทุกรายวิชา", adminId, now)
    .run();

  const insertItem = db.prepare("INSERT INTO inventory_items (name, description, total_qty, created_at) VALUES (?, ?, ?, ?)");
  await insertItem.bind("ไม้บรรทัดยาว 1 เมตร", "สำหรับงานศิลปะ/เขียนแบบ", 3, now).run();
  await insertItem.bind("เครื่องคิดเลขวิทยาศาสตร์", "ยืมได้เฉพาะคาบสอบ", 5, now).run();
  await insertItem.bind("ลำโพงบลูทูธ", "ใช้ในกิจกรรมห้อง", 1, now).run();

  await db
    .prepare("INSERT INTO audit_logs (actor_id, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(adminId, "system.bootstrap", "system", "สร้างฐานข้อมูลและบัญชีแอดมินสูงสุด", now)
    .run();

  await db.prepare("INSERT INTO settings (key, value) VALUES ('seeded', ?)").bind(now).run();
}
