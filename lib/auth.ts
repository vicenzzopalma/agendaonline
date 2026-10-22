import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { env } from "./runtime";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
};

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, key] = storedHash.split(":");
    if (!salt || !key) return false;
    const keyBuffer = Buffer.from(key, "hex");
    const derivedKey = scryptSync(password, salt, 64);
    return timingSafeEqual(keyBuffer, derivedKey);
  } catch {
    return false;
  }
}

export function isRequestSecure(request: Request): boolean {
  const proto = request.headers.get("x-forwarded-proto");
  return proto === "https" || request.url.startsWith("https://");
}

export async function createSession(
  userId: string,
  isSecure = false,
): Promise<{ token: string; cookie: string }> {
  const db = env.DB!;
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const now = Date.now();
  const maxAge = 30 * 24 * 60 * 60; // 30 days
  const expiresAt = now + maxAge * 1000;

  await db
    .prepare(
      "INSERT INTO sessions(token_hash, user_id, created_at, expires_at) VALUES(?,?,?,?)",
    )
    .bind(tokenHash, userId, now, expiresAt)
    .run();

  const secureFlag = isSecure ? "; Secure" : "";
  const cookie = `agenda_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureFlag}`;
  return { token, cookie };
}

export async function getAuthenticatedUser(
  request: Request,
): Promise<AuthUser | null> {
  const db = env.DB;
  if (!db) return null;
  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.match(/(?:^|;\s*)agenda_session=([a-f0-9]{64})/);
  if (!match) return null;

  const token = match[1];
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const now = Date.now();

  const record = await db
    .prepare(
      "SELECT u.id, u.name, u.email FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token_hash = ? AND s.expires_at > ?",
    )
    .bind(tokenHash, now)
    .first<{ id: string; name: string; email: string }>();

  if (!record) return null;
  return { ...record, isAdmin: true };
}

export async function destroySession(
  request: Request,
  isSecure = false,
): Promise<{ cookie: string }> {
  const db = env.DB;
  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.match(/(?:^|;\s*)agenda_session=([a-f0-9]{64})/);

  if (match && db) {
    const token = match[1];
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await db
      .prepare("DELETE FROM sessions WHERE token_hash = ?")
      .bind(tokenHash)
      .run();
  }

  const secureFlag = isSecure ? "; Secure" : "";
  const cookie = `agenda_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag}`;
  return { cookie };
}
