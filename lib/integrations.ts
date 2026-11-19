import { all, one, run } from "./db";
import { randomHex, sha256Hex } from "./crypto";

export async function getSetting(key: string): Promise<string | null> {
  const row = await one<{ value: string | null }>("SELECT value FROM settings WHERE key = ?", key);
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string | null): Promise<void> {
  await run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, value);
}

export async function logAudit(
  actorId: number | null,
  action: string,
  target?: string | null,
  detail?: string | null,
): Promise<void> {
  await run(
    "INSERT INTO audit_logs (actor_id, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?)",
    actorId,
    action,
    target ?? null,
    detail ?? null,
    new Date().toISOString(),
  );
}

/* ------------------------------------------------------------------ */
/*  Webhooks                                                           */
/* ------------------------------------------------------------------ */

export const WEBHOOK_LIMIT = 50;
export const API_KEY_LIMIT = 50;

export type WebhookRow = {
  id: number;
  name: string;
  kind: string;
  url: string;
  secret: string | null;
  enabled: number;
  created_at: string;
  last_status: string | null;
  last_sent_at: string | null;
};

export function listWebhooks(): Promise<WebhookRow[]> {
  return all<WebhookRow>(
    "SELECT id, name, kind, url, secret, enabled, created_at, last_status, last_sent_at FROM webhooks ORDER BY id DESC",
  );
}

export type ApiKeyRow = {
  id: number;
  name: string;
  prefix: string;
  enabled: number;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export function listApiKeys(): Promise<ApiKeyRow[]> {
  return all<ApiKeyRow>(
    "SELECT id, name, prefix, enabled, created_at, last_used_at, revoked_at FROM api_keys ORDER BY id DESC",
  );
}

export function hashApiKey(key: string): Promise<string> {
  return sha256Hex(key);
}

export async function generateApiKey(): Promise<{ key: string; prefix: string; hash: string }> {
  const key = `skc_${randomHex(24)}`;
  return { key, prefix: key.slice(0, 12), hash: await hashApiKey(key) };
}

/** Resolve a bearer token to an active API key record. */
export async function resolveApiKey(token: string | null): Promise<ApiKeyRow | null> {
  if (!token) return null;
  const row = await one<ApiKeyRow>(
    "SELECT id, name, prefix, enabled, created_at, last_used_at, revoked_at FROM api_keys WHERE key_hash = ?",
    await hashApiKey(token),
  );
  if (!row || !row.enabled || row.revoked_at) return null;
  return row;
}

type DeliveryResult = { ok: boolean; status: string };

async function deliver(kind: string, url: string, secret: string | null, message: string): Promise<DeliveryResult> {
  const timeout = AbortSignal.timeout(6000);
  try {
    let res: Response;
    if (kind === "line") {
      // LINE Notify expects a form body and a bearer token.
      const form = new URLSearchParams({ message });
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
        },
        body: form.toString(),
        signal: timeout,
      });
    } else if (kind === "discord") {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: message.slice(0, 1900), allowed_mentions: { parse: [] } }),
        signal: timeout,
      });
    } else {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(secret ? { Authorization: `Bearer ${secret}` } : {}) },
        body: JSON.stringify({ message, source: "SKC105 Room Hub", sentAt: new Date().toISOString() }),
        signal: timeout,
      });
    }
    return res.ok ? { ok: true, status: `HTTP ${res.status}` } : { ok: false, status: `HTTP ${res.status}` };
  } catch (error) {
    const status = error instanceof Error ? error.message : "network error";
    console.warn("[webhook] failed", url, status);
    return { ok: false, status };
  }
}

/** Send a notification to every enabled webhook (plus legacy env/settings URLs). Never throws. */
export async function notifyChannels(message: string): Promise<{ sent: number; failed: number }> {
  const rows = await listWebhooks();
  const targets: Array<{ id: number | null; kind: string; url: string; secret: string | null }> = rows
    .filter((w) => w.enabled === 1)
    .map((w) => ({ id: w.id, kind: w.kind, url: w.url, secret: w.secret }));

  const legacyDiscord = (await getSetting("webhook_discord")) || process.env.DISCORD_WEBHOOK_URL || "";
  const legacyLine = (await getSetting("webhook_line")) || process.env.LINE_WEBHOOK_URL || "";
  if (legacyDiscord) targets.push({ id: null, kind: "discord", url: legacyDiscord, secret: null });
  if (legacyLine) targets.push({ id: null, kind: "line", url: legacyLine, secret: null });

  if (targets.length === 0) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  await Promise.all(
    targets.map(async (target) => {
      const result = await deliver(target.kind, target.url, target.secret, message);
      if (result.ok) sent += 1;
      else failed += 1;
      if (target.id !== null) {
        await run(
          "UPDATE webhooks SET last_status = ?, last_sent_at = ? WHERE id = ?",
          result.status,
          new Date().toISOString(),
          target.id,
        );
      }
    }),
  );
  return { sent, failed };
}

/** Legacy single-webhook accessor kept for the settings tab. */
export async function webhookConfig(): Promise<{ discord: string; line: string }> {
  return {
    discord: (await getSetting("webhook_discord")) ?? "",
    line: (await getSetting("webhook_line")) ?? "",
  };
}
