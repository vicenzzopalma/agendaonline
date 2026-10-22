import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalDatabase } from "../db/local-sqlite.mjs";
import { hashPassword, provisionMaster, signIn, getSessionUser, sessionCookie, verifyPassword } from "../lib/auth-store.mjs";
import { createUser, listUsers, setUserActive } from "../lib/user-accounts.mjs";

const origin = "https://agenda.example.test";
const password = "Senha-de-teste-752!";
const hash = await hashPassword(password);
function fixture() {
  const db = new LocalDatabase(join(mkdtempSync(join(tmpdir(), "realess-users-")), "agenda.sqlite"));
  provisionMaster(hash, db);
  return { db, master: db.connection.prepare("SELECT id FROM users WHERE role='master'").get().id };
}
test("migration preserves master credentials and sessions while allowing more accounts without e-mail", async () => {
  const root = mkdtempSync(join(tmpdir(), "realess-account-upgrade-"));
  const oldDirectory = join(root, "migrations"); mkdirSync(oldDirectory);
  for (const name of ["0000_plain_cassandra_nova.sql", "0001_whole_terror.sql", "0002_cheerful_sharon_carter.sql", "0003_auth_and_creators.sql", "0004_account_access.sql"]) copyFileSync(new URL(`../drizzle/${name}`, import.meta.url), join(oldDirectory, name));
  const previous = process.env.AGENDA_MIGRATIONS_DIR;
  let db;
  try {
    process.env.AGENDA_MIGRATIONS_DIR = oldDirectory;
    db = new LocalDatabase(join(root, "agenda.sqlite"));
  } finally {
    if (previous === undefined) delete process.env.AGENDA_MIGRATIONS_DIR; else process.env.AGENDA_MIGRATIONS_DIR = previous;
  }
  provisionMaster(hash, db);
  const before = db.connection.prepare("SELECT * FROM users").get();
  const login = await signIn("arthur.hille", password, null, db);
  const file = db.filename; db.close(); db = new LocalDatabase(file);
  try {
    assert.deepEqual(db.connection.prepare("SELECT * FROM users WHERE id=?").get(before.id), before);
    assert.equal(getSessionUser(sessionCookie(origin, login.token), origin, db).isAdmin, true);
    await createUser(before.id, { name: "Colaborador", username: "colaborador", password }, db);
    assert.equal(listUsers(before.id, db).length, 2);
  } finally { db.close(); }
});
test("Master cria acessos individuais, com senhas protegidas e sem expor credenciais na lista ou auditoria", async () => {
  const { db, master } = fixture();
  try {
    const anna = await createUser(master, { name: "Anna Silva", username: " ANNA.SILVA ", password }, db);
    const bruna = await createUser(master, { name: "Bruna", username: "bruna", password }, db);
    assert.equal(anna.username, "anna.silva"); assert.equal(anna.role, "member"); assert.equal(anna.active, true);
    assert.equal(listUsers(master, db).length, 3);
    assert.ok(!JSON.stringify(listUsers(master, db)).includes("password"));
    assert.equal(db.connection.prepare("SELECT COUNT(*) AS n FROM users WHERE email=''").get().n, 3);
    const stored = db.connection.prepare("SELECT password_hash FROM users WHERE id=?").get(anna.id).password_hash;
    assert.notEqual(stored, password); assert.equal(await verifyPassword(password, stored), true);
    const login = await signIn("anna.silva", password, null, db);
    assert.equal(login.ok, true);
    const identity = getSessionUser(sessionCookie(origin, login.token), origin, db);
    assert.equal(identity.name, "Anna Silva"); assert.equal(identity.isAdmin, false);
    const audits = db.connection.prepare("SELECT actor_id,snapshot FROM user_account_history").all();
    assert.equal(audits.length, 2); assert.equal(audits[0].actor_id, master);
    assert.equal(JSON.stringify(audits).includes(password), false); assert.equal(JSON.stringify(audits).includes(stored), false);
    assert.notEqual(anna.id, bruna.id);
  } finally { db.close(); }
});
test("colaboradores não gerenciam usuários; duplicidades e tentativas de criar outro Master são recusadas", async () => {
  const { db, master } = fixture();
  try {
    const user = await createUser(master, { name: "Pessoa", username: "pessoa", password }, db);
    assert.throws(() => listUsers(user.id, db), { status: 403 });
    await assert.rejects(createUser(user.id, { name: "Outra", username: "outra", password }, db), { status: 403 });
    await assert.rejects(createUser(master, { name: "Pessoa", username: "PESSOA", password }, db), { status: 409 });
    await assert.rejects(createUser(master, { name: "Outra", username: "outra", password, role: "master" }, db), { status: 403 });
    await assert.rejects(createUser(master, { name: "Outra", username: "login inválido", password }, db), { status: 400 });
    await assert.rejects(createUser(master, { name: "Outra", username: "outra", password: "curta" }, db), { status: 400 });
    assert.equal(db.connection.prepare("SELECT COUNT(*) AS n FROM users WHERE role='master'").get().n, 1);
  } finally { db.close(); }
});
test("desativação encerra sessões sem remover reuniões; reativar não recupera tokens antigos", async () => {
  const { db, master } = fixture();
  try {
    const user = await createUser(master, { name: "Pessoa", username: "pessoa", password }, db);
    db.connection.prepare("INSERT INTO bookings(id,title,date,start,end,owner_id,owner_name,created_at) VALUES('reuniao','Teste','2026-10-27','09:00','10:00',?,'Pessoa',1)").run(user.id);
    const login = await signIn("pessoa", password, null, db);
    const cookie = sessionCookie(origin, login.token);
    assert.ok(getSessionUser(cookie, origin, db));
    assert.throws(() => setUserActive(user.id, user.id, false, db), { status: 403 });
    assert.throws(() => setUserActive(master, master, false, db), { status: 403 });
    setUserActive(master, user.id, false, db);
    assert.equal(getSessionUser(cookie, origin, db), null);
    assert.equal((await signIn("pessoa", password, null, db)).status, 401);
    assert.equal(db.connection.prepare("SELECT COUNT(*) AS n FROM bookings WHERE id='reuniao'").get().n, 1);
    setUserActive(master, user.id, true, db);
    assert.equal(getSessionUser(cookie, origin, db), null);
    assert.equal((await signIn("pessoa", password, null, db)).ok, true);
    assert.deepEqual(db.connection.prepare("SELECT action FROM user_account_history WHERE user_id=? ORDER BY id").all(user.id).map((row) => row.action), ["created", "deactivated", "activated"]);
  } finally { db.close(); }
});
