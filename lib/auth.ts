import { cache } from "react";
import { cookies } from "next/headers";
import { one, run, nowIso } from "./db";
import { randomHex } from "./crypto";
import { ApiError } from "./api";
import type { Role, UserStatus } from "./labels";

export const SESSION_COOKIE = "skc_session";
const SESSION_DAYS = 30;

export type { Role, UserStatus };
export { ROLE_LABEL, ROLE_STYLE } from "./labels";

export type SessionUser = {
  id: number;
  email: string;
  real_name: string;
  nickname: string;
  role: Role;
  status: UserStatus;
  avatar_color: string;
  created_at: string;
  last_login_at: string | null;
};

export function canManage(role: Role | string | undefined): boolean {
  return role === "owner" || role === "admin";
}

export function canModerate(role: Role | string | undefined): boolean {
  return role === "owner" || role === "admin" || role === "moderator";
}

function sessionId(): string {
  return randomHex(32);
}

export async function createSession(userId: number, userAgent?: string | null): Promise<string> {
  const id = sessionId();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  await run(
    "INSERT INTO sessions (id, user_id, user_agent, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
    id,
    userId,
    userAgent ?? null,
    nowIso(),
    expires,
  );
  const store = await cookies();
  store.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  return id;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const id = store.get(SESSION_COOKIE)?.value;
  if (id) await run("DELETE FROM sessions WHERE id = ?", id);
  store.delete(SESSION_COOKIE);
}

/** Memoised per request: the app layout and the page share one session lookup. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  let id: string | undefined;
  try {
    const store = await cookies();
    id = store.get(SESSION_COOKIE)?.value;
  } catch {
    return null;
  }
  if (!id) return null;

  const user = await one<SessionUser>(
    `SELECT u.id, u.email, u.real_name, u.nickname, u.role, u.status, u.avatar_color, u.created_at, u.last_login_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.expires_at > ?`,
    id,
    nowIso(),
  );
  if (!user) return null;
  if (user.status !== "active") return null;
  return user;
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new ApiError(401, "กรุณาเข้าสู่ระบบก่อนใช้งาน");
  return user;
}

export async function requireManager(): Promise<SessionUser> {
  const user = await requireUser();
  if (!canManage(user.role)) throw new ApiError(403, "เฉพาะแอดมินเท่านั้น");
  return user;
}
