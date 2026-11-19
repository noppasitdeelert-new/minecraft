import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/* ------------------------------------------------------------------ */
/*  Connection                                                         */
/* ------------------------------------------------------------------ */

const DB_FILE = path.resolve(process.cwd(), process.env.DATABASE_PATH || "./data/skc105.db");

function open(): DatabaseSync {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const database = new DatabaseSync(DB_FILE);
  database.exec("PRAGMA journal_mode = WAL;");
  database.exec("PRAGMA foreign_keys = ON;");
  migrate(database);
  ensureOwner(database);
  seed(database);
  return database;
}

const globalForDb = globalThis as unknown as { __skc105db?: DatabaseSync };
export const db: DatabaseSync = globalForDb.__skc105db ?? (globalForDb.__skc105db = open());

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function clean(params: unknown[]): Array<string | number | null | Uint8Array> {
  return params.map((p) => {
    if (p === undefined || p === null) return null;
    if (typeof p === "boolean") return p ? 1 : 0;
    if (p instanceof Date) return p.toISOString();
    return p as string | number | Uint8Array;
  });
}

export function all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
  // node:sqlite returns null-prototype objects; Next.js can only serialize plain
  // objects to Client Components, so copy every row into a plain object.
  const rows = db.prepare(sql).all(...clean(params)) as Array<Record<string, unknown>>;
  return rows.map((row) => ({ ...row })) as T[];
}

export function one<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | null {
  const row = db.prepare(sql).get(...clean(params)) as Record<string, unknown> | undefined | null;
  return row ? ({ ...row } as T) : null;
}

export function run(sql: string, ...params: unknown[]): { changes: number; lastInsertRowid: number } {
  const res = db.prepare(sql).run(...clean(params));
  return {
    changes: Number(res.changes ?? 0),
    lastInsertRowid: Number(res.lastInsertRowid ?? 0),
  };
}

export function nowIso(): string {
  return new Date().toISOString();
}

/* ------------------------------------------------------------------ */
/*  Schema                                                             */
/* ------------------------------------------------------------------ */

function migrate(database: DatabaseSync) {
  database.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    email          TEXT NOT NULL UNIQUE,
    real_name      TEXT NOT NULL,
    nickname       TEXT NOT NULL,
    role           TEXT NOT NULL DEFAULT 'member',
    status         TEXT NOT NULL DEFAULT 'active',
    password_hash  TEXT,
    avatar_color   TEXT NOT NULL DEFAULT '#6366f1',
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

  CREATE TABLE IF NOT EXISTS task_status (
    task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status      TEXT NOT NULL DEFAULT 'todo',
    updated_at  TEXT NOT NULL,
    PRIMARY KEY (task_id, user_id)
  );

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

  CREATE TABLE IF NOT EXISTS attendance (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date        TEXT NOT NULL,
    status      TEXT NOT NULL,
    note        TEXT,
    created_at  TEXT NOT NULL,
    UNIQUE (user_id, date)
  );

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

  CREATE TABLE IF NOT EXISTS poll_votes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    poll_id    INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    option_id  INTEGER NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    UNIQUE (poll_id, user_id)
  );

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

  CREATE TABLE IF NOT EXISTS qa_posts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    body       TEXT NOT NULL,
    subject    TEXT,
    resolved   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS qa_answers (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id    INTEGER NOT NULL REFERENCES qa_posts(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

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

  CREATE TABLE IF NOT EXISTS gallery_photos (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    image_url  TEXT NOT NULL,
    caption    TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action     TEXT NOT NULL,
    target     TEXT,
    detail     TEXT,
    created_at TEXT NOT NULL
  );

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
    source       TEXT NOT NULL DEFAULT 'itunes',
    mime         TEXT NOT NULL DEFAULT 'audio/mp4',
    added_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at   TEXT NOT NULL
  );

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
  `);

  ensureColumn(database, "songs", "source", "TEXT NOT NULL DEFAULT 'itunes'");
  ensureColumn(database, "songs", "mime", "TEXT NOT NULL DEFAULT 'audio/mp4'");
}

/** Add a column when an older database file predates it. */
function ensureColumn(database: DatabaseSync, table: string, column: string, definition: string) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (columns.some((c) => c.name === column)) return;
  database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

/* ------------------------------------------------------------------ */
/*  Password hashing (scrypt)                                          */
/* ------------------------------------------------------------------ */

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

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
function ensureOwner(database: DatabaseSync): void {
  const email = (process.env.ADMIN_EMAIL || "noppasitdeelert@gmail.com").toLowerCase();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD || "";
  if (!password) return;

  const name = process.env.ADMIN_NAME || "Noppasit Deelert";
  const nickname = process.env.ADMIN_NICKNAME || "Admin";
  const now = new Date().toISOString();
  const existing = database
    .prepare("SELECT id, role, password_hash FROM users WHERE email = ?")
    .get(email) as { id: number; role: string; password_hash: string | null } | undefined;

  if (!existing) {
    database
      .prepare(
        "INSERT INTO users (email, real_name, nickname, role, status, password_hash, avatar_color, created_at) VALUES (?, ?, ?, 'owner', 'active', ?, '#f59e0b', ?)",
      )
      .run(email, name, nickname, hashPassword(password), now);
    return;
  }

  const matches = verifyPassword(password, existing.password_hash);
  if (matches && existing.role === "owner") return;
  database
    .prepare("UPDATE users SET role = 'owner', status = 'active', password_hash = ? WHERE id = ?")
    .run(hashPassword(password), existing.id);
}

function seed(database: DatabaseSync) {
  const seeded = database.prepare("SELECT value FROM settings WHERE key = 'seeded'").get() as { value?: string } | undefined;
  if (seeded) return;

  const now = new Date().toISOString();
  const adminEmail = (process.env.ADMIN_EMAIL || "noppasitdeelert@gmail.com").toLowerCase();
  const adminName = process.env.ADMIN_NAME || "Noppasit Deelert";
  const adminNick = process.env.ADMIN_NICKNAME || "Admin";

  const existing = database.prepare("SELECT id FROM users WHERE email = ?").get(adminEmail) as { id: number } | undefined;
  const passwordHash = process.env.ADMIN_BOOTSTRAP_PASSWORD ? hashPassword(process.env.ADMIN_BOOTSTRAP_PASSWORD) : null;

  let adminId: number;
  if (existing) {
    adminId = Number(existing.id);
    if (passwordHash) database.prepare("UPDATE users SET role = 'owner', password_hash = ? WHERE id = ?").run(passwordHash, adminId);
  } else {
    const res = database
      .prepare(
        "INSERT INTO users (email, real_name, nickname, role, status, password_hash, avatar_color, created_at) VALUES (?, ?, ?, 'owner', 'active', ?, '#f59e0b', ?)",
      )
      .run(adminEmail, adminName, adminNick, passwordHash, now);
    adminId = Number(res.lastInsertRowid);
  }

  const channels: Array<[string, string, string, string, number]> = [
    ["general", "คุยทั่วไป", "พูดคุยเรื่องทั่วไปของห้อง SKC105", "💬", 1],
    ["study", "เรื่องเรียน-การบ้าน", "สอบถามการบ้าน สรุปบทเรียน และติวด้วยกัน", "📚", 2],
    ["games", "นัดเล่นเกม", "ชวนเล่นเกม ปาร์ตี้ และกิจกรรมว่าง", "🎮", 3],
    ["admin", "แจ้งแอดมิน", "แจ้งปัญหา ข้อเสนอแนะ และเรื่องด่วนถึงแอดมิน", "🛎️", 4],
  ];
  const insertChannel = database.prepare(
    "INSERT OR IGNORE INTO channels (slug, name, description, icon, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  for (const c of channels) insertChannel.run(...c, now);

  database
    .prepare("INSERT INTO announcements (author_id, title, body, pinned, important, created_at, updated_at) VALUES (?, ?, ?, 1, 1, ?, ?)")
    .run(
      adminId,
      "ยินดีต้อนรับสู่ SKC105 Room Hub 🎉",
      "ศูนย์กลางของห้อง SKC105 อยู่ที่นี่แล้ว — ประกาศ การบ้าน ตารางเรียน ห้องประชุม และคลังไฟล์สรุป\n\nเริ่มต้นด้วยการกดเช็กชื่อที่หน้าแรก แล้วอ่านประกาศปักหมุดให้ครบก่อนนะ",
      now,
      now,
    );

  database
    .prepare("INSERT INTO announcements (author_id, title, body, pinned, important, created_at, updated_at) VALUES (?, ?, ?, 0, 1, ?, ?)")
    .run(
      adminId,
      "กำหนดการสอบกลางภาค",
      "สอบกลางภาคสัปดาห์หน้า ตรวจสอบตารางสอบได้ที่หน้าตารางเรียน และอย่าลืมแจ้งสถานะการเข้าเรียนให้เรียบร้อย",
      now,
      now,
    );

  const tasks: Array<[string, string, string, number]> = [
    ["คณิตศาสตร์", "แบบฝึกหัดบทที่ 4 (ตรีโกณมิติ)", "ทำข้อ 1-20 ในหนังสือแบบฝึกหัด ส่งเป็นไฟล์ PDF", 1],
    ["ภาษาอังกฤษ", "Essay: My Future Career", "ความยาว 250 คำ ตรวจไวยากรณ์ก่อนส่ง", 2],
    ["วิทยาศาสตร์", "รายงานการทดลอง pH", "ส่งรายงานกลุ่ม กลุ่มละ 1 ไฟล์", 4],
  ];
  const insertTask = database.prepare(
    "INSERT INTO tasks (subject, title, description, due_date, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  for (const [subject, title, desc, inDays] of tasks) {
    const due = new Date(Date.now() + inDays * 86400000).toISOString().slice(0, 10);
    insertTask.run(subject, title, desc, due, adminId, now);
  }

  const classes: Array<[string, string, number, string, string]> = [
    ["คณิตศาสตร์", "อ.สมชาย", 1, "08:30", "10:00"],
    ["ภาษาอังกฤษ", "อ.มานี", 1, "10:15", "11:45"],
    ["วิทยาศาสตร์", "อ.ปิติ", 2, "08:30", "10:00"],
    ["สังคมศึกษา", "อ.วีระ", 3, "13:00", "14:30"],
    ["คอมพิวเตอร์", "อ.นภา", 4, "10:15", "11:45"],
  ];
  const insertSchedule = database.prepare(
    "INSERT INTO schedule_entries (kind, title, subject, location, day_of_week, start_time, end_time, created_by, created_at) VALUES ('class', ?, ?, 'SKC105', ?, ?, ?, ?, ?)",
  );
  for (const [title, subject, dow, start, end] of classes) {
    insertSchedule.run(title, subject, dow, start, end, adminId, now);
  }

  const duties: Array<[string, number]> = [
    ["ทำความสะอาดกระดาน", 1],
    ["ทิ้งขยะ + ถูพื้น", 2],
    ["จัดโต๊ะเรียน", 3],
    ["รดน้ำต้นไม้", 4],
    ["เช็กอุปกรณ์โปรเจกเตอร์", 5],
  ];
  const insertDuty = database.prepare(
    "INSERT INTO schedule_entries (kind, title, day_of_week, created_by, created_at) VALUES ('duty', ?, ?, ?, ?)",
  );
  for (const [title, dow] of duties) insertDuty.run(title, dow, adminId, now);

  const poll = database
    .prepare("INSERT INTO polls (question, description, created_by, created_at) VALUES (?, ?, ?, ?)")
    .run("ทริปห้อง SKC105 ปลายเทอมไปไหนดี?", "โหวตได้ 1 ครั้งต่อบัญชี ปิดโหวตสิ้นเดือนนี้", adminId, now);
  const pollId = Number(poll.lastInsertRowid);
  const insertOption = database.prepare("INSERT INTO poll_options (poll_id, label) VALUES (?, ?)");
  for (const label of ["ทะเลพัทยา", "ภูเขาเขาใหญ่", "สวนสนุกดรีมเวิลด์", "คาเฟ่ในเมือง"]) {
    insertOption.run(pollId, label);
  }

  const insertResource = database.prepare(
    "INSERT INTO resources (title, description, url, category, subject, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  insertResource.run(
    "ชีทสรุปตรีโกณมิติ",
    "สรุปสูตรและตัวอย่างโจทย์บทที่ 4",
    "https://drive.google.com/",
    "sheet",
    "คณิตศาสตร์",
    adminId,
    now,
  );
  insertResource.run(
    "คลังข้อสอบเก่า",
    "รวมข้อสอบปีก่อนพร้อมเฉลย",
    "https://drive.google.com/",
    "exam",
    "ทุกรายวิชา",
    adminId,
    now,
  );

  const insertItem = database.prepare(
    "INSERT INTO inventory_items (name, description, total_qty, created_at) VALUES (?, ?, ?, ?)",
  );
  insertItem.run("ไม้บรรทัดยาว 1 เมตร", "สำหรับงานศิลปะ/เขียนแบบ", 3, now);
  insertItem.run("เครื่องคิดเลขวิทยาศาสตร์", "ยืมได้เฉพาะคาบสอบ", 5, now);
  insertItem.run("ลำโพงบลูทูธ", "ใช้ในกิจกรรมห้อง", 1, now);

  const insertAudit = database.prepare(
    "INSERT INTO audit_logs (actor_id, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  insertAudit.run(adminId, "system.bootstrap", "system", "สร้างฐานข้อมูลและบัญชีแอดมินสูงสุด", now);

  database.prepare("INSERT INTO settings (key, value) VALUES ('seeded', ?)").run(now);
}
