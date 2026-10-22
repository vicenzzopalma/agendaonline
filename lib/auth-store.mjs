import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getDatabase } from "../db/local-sqlite.mjs";

const derive = promisify(scrypt);
const COST = { N: 65536, r: 8, p: 2, maxmem: 128 * 1024 * 1024 };
export const SESSION_SECONDS = 12 * 60 * 60;
const WINDOW = 15 * 60 * 1000;
const digest = (text) => createHash("sha256").update(text).digest("hex");
export const sessionCookieName = (origin) => new URL(origin).protocol === "https:" ? "__Host-realess_session" : "realess_session";
export function readSessionToken(header, origin) {
  const name = sessionCookieName(origin);
  const parts = (header || "").split(";").map((part) => part.trim()).filter((part) => part.startsWith(`${name}=`));
  if (parts.length !== 1) return null;
  const token = parts[0].slice(name.length + 1);
  return /^[a-f0-9]{64}$/.test(token) ? token : null;
}
export function sessionCookie(origin, token, maxAge = SESSION_SECONDS) {
  return `${sessionCookieName(origin)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${new URL(origin).protocol === "https:" ? "; Secure" : ""}`;
}
export async function hashPassword(password) {
  if (typeof password !== "string" || password.length < 7 || password.length > 128) throw new Error("A senha deve ter entre 7 e 128 caracteres.");
  const salt = randomBytes(16).toString("hex");
  const key = await derive(password, salt, 64, COST);
  return `scrypt$65536$8$2$${salt}$${key.toString("hex")}`;
}
export async function verifyPassword(password, encoded) {
  // Unknown users consume the same KDF work and receive the same public error.
  const fallback = `scrypt$65536$8$2$${"0".repeat(32)}$${"0".repeat(128)}`;
  const stored = typeof encoded === "string" && /^scrypt\$65536\$8\$2\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(encoded) ? encoded : fallback;
  const [, , , , salt, expected] = stored.split("$");
  const key = await derive(password, salt, 64, COST);
  return timingSafeEqual(key, Buffer.from(expected, "hex")) && stored !== fallback;
}
export function provisionMaster(passwordHash, database = getDatabase()) {
  if (!/^scrypt\$65536\$8\$2\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(passwordHash)) throw new Error("Hash de senha inválido.");
  const db = database.connection;
  db.exec("BEGIN IMMEDIATE");
  try {
    const existing = db.prepare("SELECT id FROM users WHERE username='arthur.hille' COLLATE NOCASE OR role='master'").get();
    if (existing) { db.exec("COMMIT"); return false; }
    const now = Date.now();
    db.prepare("INSERT INTO users(id,name,email,password_hash,created_at,updated_at,username,role,active) VALUES(?,?,?,?,?,?,'arthur.hille','master',1)")
      .run(randomUUID(), "Arthur Hille", "", passwordHash, now, now);
    db.exec("COMMIT");
    return true;
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
export function bootstrapMaster(database = getDatabase()) {
  if (database.connection.prepare("SELECT 1 FROM users WHERE username='arthur.hille' COLLATE NOCASE OR role='master'").get()) return;
  const file = resolve(process.env.AGENDA_MASTER_BOOTSTRAP || resolve(dirname(database.filename), "master-bootstrap.json"));
  let passwordHash = process.env.AGENDA_MASTER_PASSWORD_HASH;
  if (!passwordHash && existsSync(file)) passwordHash = JSON.parse(readFileSync(file, "utf8")).passwordHash;
  if (passwordHash) provisionMaster(passwordHash, database);
}
export function getSessionUser(cookieHeader, origin, database = getDatabase(), now = Date.now()) {
  bootstrapMaster(database);
  const token = readSessionToken(cookieHeader, origin);
  if (!token) return null;
  const record = database.connection.prepare("SELECT u.id,u.name,u.email,u.username,u.role,s.token_hash AS tokenHash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1 AND u.username IS NOT NULL")
    .get(digest(token), now);
  return record ? { ...record, isAdmin: record.role === "master" } : null;
}
function reserveAttempt(db, username, now) {
  const keys = [[digest(`account:${username}`), 5], [digest("global:login"), 60]];
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("DELETE FROM login_attempts WHERE window_start<=?").run(now - WINDOW);
    for (const [key, max] of keys) {
      const row = db.prepare("SELECT attempts,window_start FROM login_attempts WHERE key_hash=?").get(key);
      if (row && row.attempts >= max) {
        db.exec("COMMIT");
        return Math.max(1, Math.ceil((row.window_start + WINDOW - now) / 1000));
      }
    }
    for (const [key] of keys) db.prepare("INSERT INTO login_attempts VALUES(?,1,?) ON CONFLICT(key_hash) DO UPDATE SET attempts=attempts+1").run(key, now);
    db.exec("COMMIT");
    return 0;
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
export async function signIn(username, password, oldToken = null, database = getDatabase(), now = Date.now()) {
  bootstrapMaster(database);
  const name = typeof username === "string" ? username.trim().toLowerCase() : "";
  if (!/^[a-z0-9._-]{3,80}$/.test(name) || typeof password !== "string" || !password.length || password.length > 128) return { ok: false, status: 401 };
  const db = database.connection;
  const retryAfter = reserveAttempt(db, name, now);
  if (retryAfter) return { ok: false, status: 429, retryAfter };
  const user = db.prepare("SELECT id,password_hash,active FROM users WHERE username=? COLLATE NOCASE").get(name);
  const correct = await verifyPassword(password, user?.password_hash);
  if (!correct || !user?.active) return { ok: false, status: 401 };
  const token = randomBytes(32).toString("hex");
  // Recheck the credential after hashing so concurrent revocation cannot issue a session.
  db.exec("BEGIN IMMEDIATE");
  try {
    if (!db.prepare("SELECT 1 FROM users WHERE id=? AND password_hash=? AND active=1").get(user.id, user.password_hash)) {
      db.exec("COMMIT"); return { ok: false, status: 401 };
    }
    db.prepare("DELETE FROM sessions WHERE expires_at<=?").run(now);
    if (oldToken) db.prepare("DELETE FROM sessions WHERE token_hash=?").run(digest(oldToken));
    db.prepare("INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)").run(digest(token), user.id, now, now + SESSION_SECONDS * 1000);
    db.prepare("DELETE FROM login_attempts WHERE key_hash=?").run(digest(`account:${name}`));
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
  return { ok: true, token };
}
export function signOut(cookieHeader, origin, database = getDatabase()) {
  const token = readSessionToken(cookieHeader, origin);
  if (token) database.connection.prepare("DELETE FROM sessions WHERE token_hash=?").run(digest(token));
}
