/**
 * Crypto helpers that run on both Node and Cloudflare Workers.
 * WebCrypto (`globalThis.crypto`) exists in Node 20+ and workerd, while the
 * Node-only APIs (scryptSync, timingSafeEqual, randomBytes) do not.
 */

const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

function fromHex(hex: string): Uint8Array {
  const clean = hex.length % 2 ? `0${hex}` : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Random hex string (same shape as crypto.randomBytes(n).toString("hex")). */
export function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return toHex(buffer);
}

/** Random string from an alphabet, used for invite keys. */
export function randomCode(length: number, alphabet: string): string {
  const buffer = new Uint8Array(length);
  crypto.getRandomValues(buffer);
  let out = "";
  for (let i = 0; i < length; i += 1) out += alphabet[buffer[i] % alphabet.length];
  return out;
}

async function digest(algorithm: "SHA-1" | "SHA-256", data: string | Uint8Array): Promise<string> {
  const input = typeof data === "string" ? encoder.encode(data) : data;
  const hash = await crypto.subtle.digest(algorithm, input as unknown as ArrayBuffer);
  return toHex(new Uint8Array(hash));
}

export function sha256Hex(data: string): Promise<string> {
  return digest("SHA-256", data);
}

export function sha1Hex(data: string | Uint8Array): Promise<string> {
  return digest("SHA-1", data);
}

const PBKDF2_ITERATIONS = 100_000;

async function pbkdf2(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: encoder.encode(salt) as unknown as ArrayBuffer, iterations: PBKDF2_ITERATIONS },
    key,
    256,
  );
  return toHex(new Uint8Array(bits));
}

/** `pbkdf2$<salt>$<hash>` — verified without leaking timing information. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomHex(16);
  return `pbkdf2$${salt}$${await pbkdf2(password, salt)}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2" || !salt || !hash) return false;
  const candidate = await pbkdf2(password, salt);
  if (candidate.length !== hash.length) return false;
  const a = fromHex(candidate);
  const b = fromHex(hash);
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}
