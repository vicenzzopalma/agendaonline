import { DatabaseSync, backup } from "node:sqlite";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const databasePath = () => resolve(process.env.AGENDA_DB_PATH || "banco-de-dados/agenda.sqlite");
const poolKey = Symbol.for("realess.sqlite.connections");

function migrate(connection) {
  const directory = resolve(process.env.AGENDA_MIGRATIONS_DIR || "drizzle");
  const files = readdirSync(directory).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
  if (!files.length) throw new Error("As migrações do banco não foram encontradas.");
  connection.exec("CREATE TABLE IF NOT EXISTS _agenda_migrations(name TEXT PRIMARY KEY, sha256 TEXT NOT NULL, applied_at INTEGER NOT NULL)");
  connection.exec("BEGIN IMMEDIATE");
  try {
    for (const name of files) {
      const sql = readFileSync(resolve(directory, name), "utf8");
      const hash = createHash("sha256").update(sql).digest("hex");
      const previous = connection.prepare("SELECT sha256 FROM _agenda_migrations WHERE name=?").get(name);
      if (previous) {
        if (previous.sha256 !== hash) throw new Error(`A migração já aplicada foi modificada: ${name}`);
        continue;
      }
      connection.exec(sql);
      connection.prepare("INSERT INTO _agenda_migrations VALUES(?,?,?)").run(name, hash, Date.now());
    }
    connection.exec("COMMIT");
  } catch (error) {
    connection.exec("ROLLBACK");
    throw error;
  }
}

class PreparedStatement {
  constructor(database, sql, values = []) { this.database = database; this.sql = sql; this.values = values; }
  bind(...values) { return new PreparedStatement(this.database, this.sql, values); }
  execute() {
    const statement = this.database.connection.prepare(this.sql);
    if (statement.columns().length) return { success: true, results: statement.all(...this.values), meta: { changes: 0 } };
    const result = statement.run(...this.values);
    return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }
  async all() { return this.execute(); }
  async run() { return this.execute(); }
  async first(column) {
    const row = this.database.connection.prepare(this.sql).get(...this.values);
    return row ? (column ? row[column] : row) : null;
  }
}

export class LocalDatabase {
  constructor(filename = databasePath()) {
    this.filename = resolve(filename);
    mkdirSync(dirname(this.filename), { recursive: true });
    this.connection = new DatabaseSync(this.filename);
    try {
      this.connection.exec("PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
      migrate(this.connection);
    } catch (error) { this.connection.close(); throw error; }
  }
  prepare(sql) { return new PreparedStatement(this, sql); }
  async batch(statements) {
    this.connection.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) => {
        if (statement.database !== this) throw new Error("Lote de outro banco.");
        return statement.execute();
      });
      this.connection.exec("COMMIT");
      return results;
    } catch (error) { this.connection.exec("ROLLBACK"); throw error; }
  }
  close() { this.connection.close(); }
}

export function getDatabase() {
  const pool = globalThis[poolKey] ||= new Map();
  const filename = databasePath();
  if (!pool.has(filename)) pool.set(filename, new LocalDatabase(filename));
  return pool.get(filename);
}

export async function backupDatabase(destination, database = getDatabase()) {
  const target = resolve(destination);
  if (existsSync(target)) throw new Error("O arquivo de destino já existe. Escolha outro nome.");
  mkdirSync(dirname(target), { recursive: true });
  try {
    await backup(database.connection, target);
    const check = new DatabaseSync(target, { readOnly: true });
    try {
      if (check.prepare("PRAGMA quick_check").get().quick_check !== "ok") throw new Error("A verificação do backup falhou.");
    } finally { check.close(); }
    return target;
  } catch (error) {
    if (existsSync(target)) unlinkSync(target);
    throw error;
  }
}
