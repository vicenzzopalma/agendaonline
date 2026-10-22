// Runs a built server against an isolated SQLite database. Never touches live data.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, existsSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { LocalDatabase } from "../db/local-sqlite.mjs";
import { hashPassword, provisionMaster } from "../lib/auth-store.mjs";
import { captureLogin } from "../scripts/capture-login.mjs";

const output = resolve("outputs/auth"); mkdirSync(output, { recursive: true });
const directory = mkdtempSync(join(output, "integration-"));
const file = join(directory, "test.sqlite");
const db = new LocalDatabase(file);
const password = "Credencial-teste-924!";
const hash = await hashPassword(password);
provisionMaster(hash, db);
db.connection.prepare("INSERT INTO users(id,name,email,password_hash,created_at,updated_at,username,role) VALUES('member-test','Pessoa de teste','test@example.invalid',?,1,1,'pessoa.teste','member')").run(hash);
db.connection.prepare("INSERT INTO bookings(id,title,date,start,end,owner_id,owner_name,created_at) VALUES('legacy-test','Reunião anterior','2026-10-27','10:00','11:00','old-device','Outra pessoa',1)").run();
db.connection.prepare("INSERT OR REPLACE INTO holiday_cache VALUES(2026,'[]',?,'fresh')").run(Date.now());
const origin = "http://127.0.0.1:3138";
const child = spawn(process.execPath, [resolve(".next/standalone/server.js")], {
  cwd: resolve(".next/standalone"), windowsHide: true,
  env: { ...process.env, NODE_ENV: "production", PORT: "3138", HOSTNAME: "127.0.0.1", PUBLIC_URL: origin, AGENDA_DB_PATH: file, AGENDA_MIGRATIONS_DIR: resolve("drizzle"), AGENDA_MASTER_BOOTSTRAP: join(directory, "unused.json"), AGENDA_MASTER_PASSWORD_HASH: "" },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = ""; child.stdout.on("data", (data) => { logs += data; }); child.stderr.on("data", (data) => { logs += data; });
const request = (path, options = {}) => fetch(origin + path, { redirect: "manual", ...options });
const post = (path, body, cookie = "", site = origin) => request(path, { method: "POST", headers: { "Content-Type": "application/json", Origin: site, Cookie: cookie }, body: JSON.stringify(body) });
const checks = [];
try {
  let ready = false;
  for (let i = 0; i < 90; i++) {
    try { if ((await request("/login")).status === 200) { ready = true; break; } } catch { /* Wait for owned server. */ }
    if (child.exitCode !== null) throw new Error(logs);
    await new Promise((done) => setTimeout(done, 1000));
  }
  assert.ok(ready, logs);
  const loginHTML = await (await request("/login")).text();
  const stylesheets = [...loginHTML.matchAll(/href="([^"]+\.css(?:\?[^"]*)?)"/g)].map((match) => match[1].replaceAll("&amp;", "&"));
  assert.ok(stylesheets.length > 0, "A tela precisa carregar uma folha de estilos.");
  for (const path of stylesheets) {
    const sheet = await request(path); assert.equal(sheet.status, 200, `Folha de estilos indisponível: ${path}`);
    assert.ok((await sheet.text()).includes(".login-page"), "Os estilos da tela de login precisam estar no pacote.");
  }
  const initial = await request("/"); assert.equal(initial.status, 307); assert.equal(initial.headers.get("location"), "/login");
  assert.equal((await request("/api/workspace")).status, 401);
  assert.equal((await request("/api/holidays?year=2026")).status, 401);
  assert.equal((await post("/api/calendar-policy", {})).status, 401);
  assert.equal((await post("/api/workspace", { action: "deleteBooking", id: "legacy-test" })).status, 401);
  assert.equal((await request("/api/workspace", { headers: { Cookie: `realess_device=${"a".repeat(64)}` } })).status, 401);
  checks.push("Páginas e APIs bloqueiam acesso anônimo e cookies antigos");
  const wrong = await post("/api/auth/login", { username: "arthur.hille", password: "errada" });
  assert.equal(wrong.status, 401);
  const unknown = await post("/api/auth/login", { username: "nao.existe", password });
  assert.deepEqual(await wrong.json(), await unknown.json());
  assert.equal((await post("/api/auth/login", { username: "arthur.hille", password }, "", "https://outro.example")).status, 403);
  checks.push("Credenciais inválidas e requisições de outra origem são recusadas");
  const login = await post("/api/auth/login", { username: "arthur.hille", password }); assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const page = await request("/", { headers: { Cookie: cookie } }); assert.equal(page.status, 200);
  const workspace = await request("/api/workspace", { headers: { Cookie: cookie } }); assert.equal(workspace.status, 200);
  assert.equal((await workspace.json()).user.isAdmin, true);
  const cancelled = await post("/api/workspace", { action: "deleteBooking", id: "legacy-test", version: 1 }, cookie);
  assert.equal(cancelled.status, 200); assert.equal((await cancelled.json()).booking.status, "cancelled");
  const payload = { action: "saveBooking", title: "Reunião de teste de acesso", date: "2026-10-27", start: "12:00", end: "13:00", kind: "appointment", organizerName: "Nome falso", participants: "", roomId: "", link: "" };
  const created = await post("/api/workspace", payload, cookie); assert.equal(created.status, 200);
  const booking = (await created.json()).booking; assert.equal(booking.ownerName, "Arthur Hille"); assert.equal(booking.createdByName, "Arthur Hille");
  checks.push("Master cancela reuniões antigas; organizador vem da conta autenticada");
  const memberLogin = await post("/api/auth/login", { username: "pessoa.teste", password });
  const memberCookie = memberLogin.headers.get("set-cookie").split(";")[0];
  assert.equal((await post("/api/workspace", { action: "deleteBooking", id: booking.id, isAdmin: true }, memberCookie)).status, 403);
  assert.equal((await post("/api/workspace", { ...payload, id: booking.id, version: 1 }, memberCookie)).status, 403);
  assert.equal((await post("/api/calendar-policy", {}, memberCookie)).status, 403);
  db.connection.prepare("UPDATE users SET active=0 WHERE id='member-test'").run();
  assert.equal((await request("/api/workspace", { headers: { Cookie: memberCookie } })).status, 401);
  checks.push("Permissões são verificadas no servidor e revogação invalida a sessão");
  assert.equal((await post("/api/auth/logout", {}, cookie)).status, 200);
  assert.equal((await request("/api/workspace", { headers: { Cookie: cookie } })).status, 401);
  checks.push("Sair revoga o token e bloqueia o acesso anterior");
  const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
  if (existsSync(chrome)) {
    await captureLogin(origin, output, join(directory, "chrome"));
    checks.push("Tela de login renderizada em desktop e celular");
  }
  writeFileSync(join(output, "integration-results.json"), JSON.stringify({ passed: true, checks }, null, 2));
  console.log(checks.join("\n"));
} catch (error) {
  writeFileSync(join(output, "server.log"), logs);
  throw error;
} finally { child.kill(); db.close(); }
