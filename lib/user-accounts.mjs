import { randomUUID } from "node:crypto";
import { getDatabase } from "../db/local-sqlite.mjs";
import { hashPassword } from "./auth-store.mjs";

export class AccountError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const fields = "id,name,username,role,active,created_at AS createdAt";
function requireMaster(actorId, db) {
  if (!db.prepare("SELECT 1 FROM users WHERE id=? AND role='master' AND active=1").get(actorId)) throw new AccountError("Somente o acesso Master pode gerenciar usuários.", 403);
}
const visibleUser = (row) => ({ ...row, active: !!row.active });
function record(db, actorId, user, action, now) {
  db.prepare("INSERT INTO user_account_history(actor_id,user_id,action,recorded_at,snapshot) VALUES(?,?,?,?,?)")
    .run(actorId, user.id, action, now, JSON.stringify(user));
}
export function listUsers(actorId, database = getDatabase()) {
  const db = database.connection;
  requireMaster(actorId, db);
  return db.prepare(`SELECT ${fields} FROM users WHERE username IS NOT NULL ORDER BY CASE role WHEN 'master' THEN 0 ELSE 1 END, name COLLATE NOCASE, username`).all().map(visibleUser);
}
export async function createUser(actorId, input, database = getDatabase()) {
  const db = database.connection;
  requireMaster(actorId, db);
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const username = typeof input.username === "string" ? input.username.trim().toLowerCase() : "";
  if (name.length < 2 || name.length > 80 || /[\x00-\x1f\x7f]/.test(name)) throw new AccountError("Informe o nome completo, entre 2 e 80 caracteres.");
  if (!/^[a-z0-9._-]{3,80}$/.test(username)) throw new AccountError("O login deve ter de 3 a 80 caracteres: letras, números, ponto, hífen ou sublinhado.");
  if (typeof input.password !== "string" || input.password.trim().length < 8 || input.password.length > 128) throw new AccountError("A senha deve ter entre 8 e 128 caracteres.");
  if (input.role !== undefined && input.role !== "member") throw new AccountError("Novos usuários recebem o perfil Colaborador.", 403);
  if (db.prepare("SELECT 1 FROM users WHERE username=? COLLATE NOCASE").get(username)) throw new AccountError("Esse login já está cadastrado. Escolha outro.", 409);
  const passwordHash = await hashPassword(input.password);
  const now = Date.now(), id = randomUUID();
  db.exec("BEGIN IMMEDIATE");
  try {
    requireMaster(actorId, db);
    if (db.prepare("SELECT 1 FROM users WHERE username=? COLLATE NOCASE").get(username)) throw new AccountError("Esse login já está cadastrado. Escolha outro.", 409);
    db.prepare("INSERT INTO users(id,name,email,password_hash,created_at,updated_at,username,role,active) VALUES(?,?,'',?,?,?,?,'member',1)")
      .run(id, name, passwordHash, now, now, username);
    const user = visibleUser(db.prepare(`SELECT ${fields} FROM users WHERE id=?`).get(id));
    record(db, actorId, user, "created", now);
    db.exec("COMMIT"); return user;
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
export function setUserActive(actorId, id, active, database = getDatabase()) {
  if (typeof id !== "string" || !id.length || id.length > 100 || typeof active !== "boolean") throw new AccountError("Confira o usuário e a situação do acesso.");
  const db = database.connection;
  db.exec("BEGIN IMMEDIATE");
  try {
    requireMaster(actorId, db);
    const previous = db.prepare(`SELECT ${fields} FROM users WHERE id=? AND username IS NOT NULL`).get(id);
    if (!previous) throw new AccountError("Usuário não encontrado.", 404);
    if (previous.role === "master" || id === actorId) throw new AccountError("O acesso Master é protegido e não pode ser desativado por esta tela.", 403);
    const now = Date.now();
    if (!active) db.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
    if (!!previous.active !== active) {
      db.prepare("UPDATE users SET active=?,updated_at=? WHERE id=? AND role='member'").run(Number(active), now, id);
      record(db, actorId, { ...visibleUser(previous), active }, active ? "activated" : "deactivated", now);
    }
    db.exec("COMMIT"); return { ...visibleUser(previous), active };
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
