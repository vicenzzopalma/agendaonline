import { DatabaseSync, backup } from "node:sqlite";
import { createConnection } from "node:net";
import { existsSync, renameSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { loadConfig } from "./config.mjs";
import { databasePath, LocalDatabase, backupDatabase } from "../../db/local-sqlite.mjs";
const config = loadConfig();
const source = process.argv[2] && resolve(process.argv[2]);
if (!source || !existsSync(source)) throw new Error("Informe um arquivo de backup existente.");
const target = databasePath();
if (source === target) throw new Error("O backup deve ser diferente do banco atual.");
const running = await new Promise((done) => {
  const socket = createConnection({ host: "127.0.0.1", port: config.port });
  socket.once("connect", () => { socket.destroy(); done(true); });
  socket.once("error", () => done(false));
  socket.setTimeout(1000, () => { socket.destroy(); done(true); });
});
if (running) throw new Error("Pare a agenda antes de restaurar: a porta interna ainda está em uso.");
const staged = `${target}.restoring-${randomUUID()}`;
const original = new DatabaseSync(source, { readOnly: true });
try {
  if (original.prepare("PRAGMA quick_check").get().quick_check !== "ok" || original.prepare("PRAGMA foreign_key_check").all().length) throw new Error("Backup inválido.");
  for (const name of ["bookings", "rooms", "booking_history", "agenda_visitors"]) if (!original.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)) throw new Error(`Tabela ausente no backup: ${name}`);
  await backup(original, staged);
} finally { original.close(); }
try {
  const stagedDb = new LocalDatabase(staged);
  stagedDb.connection.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  stagedDb.close();
  if (existsSync(target)) {
    const current = new LocalDatabase(target);
    const preserved = resolve(config.backupDir, `agenda-antes-restauracao-${Date.now()}.sqlite`);
    await backupDatabase(preserved, current);
    current.connection.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    current.close();
    // Both files are on the same local volume; preserve the old file as well.
    const old = `${target}.anterior-${Date.now()}`;
    renameSync(target, old);
    try { renameSync(staged, target); }
    catch (error) { renameSync(old, target); throw error; }
    console.log(`Banco anterior preservado: ${preserved}`);
  } else renameSync(staged, target);
  console.log("Backup restaurado e migrações verificadas. Inicie a agenda após conferir os dados.");
} finally {
  for (const suffix of ["", "-wal", "-shm"]) if (existsSync(staged + suffix)) unlinkSync(staged + suffix);
}
