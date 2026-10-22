import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { LocalDatabase } from "../../db/local-sqlite.mjs";

export function importSitesSnapshot(snapshot, destination) {
  const tables = ["rooms", "settings", "bookings", "booking_history", "calendar_policy", "calendar_policy_history", "holiday_overrides", "agenda_visitors"];
  if (snapshot.format !== "agenda-realess-sites-v1" || snapshot.complete !== true || tables.some((table) => !Array.isArray(snapshot.tables?.[table]?.rows))) throw new Error("Snapshot incompleto ou formato inválido.");
  const target = resolve(destination);
  if (existsSync(target)) throw new Error("O banco de destino já existe. A importação nunca substitui dados existentes.");
  const database = new LocalDatabase(target);
  const db = database.connection;
  const quote = (name) => `"${name.replaceAll('"', '""')}"`;
  try {
    db.exec("BEGIN IMMEDIATE");
    // Recreate triggers after loading original rows: historical inserts must
    // not create a second audit trail or reject past bookings in archived rooms.
    const triggers = db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND tbl_name='bookings'").all();
    for (const trigger of triggers) db.exec(`DROP TRIGGER ${quote(trigger.name)}`);
    for (const table of tables) {
      const columns = db.prepare(`PRAGMA table_info(${quote(table)})`).all().map((column) => column.name);
      const source = snapshot.tables[table];
      if (source.columns.length !== columns.length || columns.some((name) => !source.columns.includes(name))) throw new Error(`Esquema incompatível: ${table}`);
      const insert = db.prepare(`INSERT INTO ${quote(table)}(${columns.map(quote).join(",")}) VALUES(${columns.map(() => "?").join(",")})`);
      for (const row of source.rows) {
        if (columns.some((name) => !Object.hasOwn(row, name))) throw new Error(`Linha incompleta: ${table}`);
        insert.run(...columns.map((name) => row[name]));
      }
    }
    for (const trigger of triggers) db.exec(trigger.sql);
    if (db.prepare("PRAGMA foreign_key_check").all().length) throw new Error("A importação tem referências inválidas.");
    if (db.prepare("PRAGMA quick_check").get().quick_check !== "ok") throw new Error("O banco importado não passou na verificação de integridade.");
    db.exec("COMMIT");
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    database.close();
    for (const suffix of ["", "-wal", "-shm"]) if (existsSync(target + suffix)) unlinkSync(target + suffix);
    throw error;
  }
  database.close();
  return { destination: target, bookings: snapshot.tables.bookings.rows.length, history: snapshot.tables.booking_history.rows.length, exportedAt: snapshot.exportedAt };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [source, destination] = process.argv.slice(2);
  if (!source || !destination) throw new Error("Uso: node scripts/selfhost/import-sites.mjs snapshot.json novo-banco.sqlite");
  console.log(JSON.stringify(importSitesSnapshot(JSON.parse(readFileSync(source, "utf8")), destination)));
}
