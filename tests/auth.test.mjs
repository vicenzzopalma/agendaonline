import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDatabase } from "../db/local-sqlite.mjs";
import { hashPassword, verifyPassword, provisionMaster, signIn, getSessionUser, signOut, sessionCookie, SESSION_SECONDS } from "../lib/auth-store.mjs";

const origin = "https://agenda.example.test";
const password = "Senha-teste-privada-825!";
const hash = await hashPassword(password);
const create = () => new LocalDatabase(join(mkdtempSync(join(tmpdir(), "realess-auth-")), "agenda.sqlite"));
test("senha usa sal e hash; conta master é única e não é sobrescrita", async () => {
  const database = create();
  try {
    assert.equal(hash.includes(password), false);
    assert.equal(await verifyPassword(password, hash), true);
    assert.equal(await verifyPassword("errada", hash), false);
    assert.notEqual(await hashPassword(password), hash);
    assert.equal(provisionMaster(hash, database), true);
    assert.equal(provisionMaster(await hashPassword("outra-senha-532"), database), false);
    assert.equal(database.connection.prepare("SELECT count(*) AS n FROM users").get().n, 1);
    assert.equal(database.connection.prepare("SELECT role FROM users").get().role, "master");
  } finally { database.close(); }
});
test("sessões: login, token com hash, expiração, rotação e logout", async () => {
  const database = create();
  try {
    provisionMaster(hash, database);
    assert.equal((await signIn("arthur.hille", "errada", null, database)).status, 401);
    assert.equal((await signIn("nao.existe", password, null, database)).status, 401);
    const now = Date.now();
    const first = await signIn(" ARTHUR.HILLE ", password, null, database, now);
    assert.equal(first.ok, true);
    const cookie = sessionCookie(origin, first.token);
    assert.match(cookie, /__Host-realess_session=/);
    assert.match(cookie, /HttpOnly; SameSite=Strict/);
    assert.match(cookie, /; Secure$/);
    const user = getSessionUser(cookie, origin, database, now);
    assert.equal(user.name, "Arthur Hille"); assert.equal(user.isAdmin, true);
    assert.notEqual(database.connection.prepare("SELECT token_hash FROM sessions").get().token_hash, first.token);
    assert.equal(getSessionUser(cookie, origin, database, now + SESSION_SECONDS * 1000), null);
    assert.equal(getSessionUser(`__Host-realess_device=${first.token}`, origin, database), null);
    assert.equal(getSessionUser(`__Host-realess_session=${"a".repeat(64)}`, origin, database), null);
    const second = await signIn("arthur.hille", password, first.token, database, now);
    assert.equal(getSessionUser(cookie, origin, database, now), null);
    const nextCookie = sessionCookie(origin, second.token);
    assert.ok(getSessionUser(nextCookie, origin, database, now));
    signOut(nextCookie, origin, database);
    assert.equal(getSessionUser(nextCookie, origin, database, now), null);
  } finally { database.close(); }
});
test("bloqueio de tentativas persiste ao reabrir o banco e expira após 15 minutos", async () => {
  let database = create();
  const file = database.filename;
  const now = Date.now();
  try {
    provisionMaster(hash, database);
    for (let i = 0; i < 5; i++) assert.equal((await signIn("arthur.hille", "errada", null, database, now)).status, 401);
    database.close(); database = new LocalDatabase(file);
    const blocked = await signIn("arthur.hille", password, null, database, now);
    assert.equal(blocked.status, 429); assert.ok(blocked.retryAfter > 0);
    assert.equal((await signIn("arthur.hille", password, null, database, now + 900001)).ok, true);
  } finally { database.close(); }
});
test("revogar uma conta invalida a sessão já emitida e impede novos logins", async () => {
  const database = create();
  try {
    provisionMaster(hash, database);
    const result = await signIn("arthur.hille", password, null, database);
    database.connection.prepare("UPDATE users SET active=0").run();
    assert.equal(getSessionUser(sessionCookie(origin, result.token), origin, database), null);
    assert.equal((await signIn("arthur.hille", password, null, database)).status, 401);
  } finally { database.close(); }
});
