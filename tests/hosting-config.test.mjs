import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const configURL = new URL("../scripts/selfhost/config.mjs", import.meta.url).href;
const databaseURL = new URL("../db/local-sqlite.mjs", import.meta.url).href;
const migrations = new URL("../drizzle/", import.meta.url);

function runIsolated(source, overrides = {}, dotenv) {
  const root = mkdtempSync(join(tmpdir(), "agenda-hosting-"));
  const env = { ...process.env };
  for (const key of ["PUBLIC_URL", "PORT", "AGENDA_DB_PATH", "AGENDA_BACKUP_DIR", "AGENDA_LOG_DIR"])
    delete env[key];
  if (dotenv) writeFileSync(join(root, ".env"), dotenv);
  try {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import assert from 'node:assert/strict';
      import { resolve } from 'node:path';
      import { fileURLToPath } from 'node:url';
      import { loadConfig } from ${JSON.stringify(configURL)};
      import { getDatabase } from ${JSON.stringify(databaseURL)};
      process.env.AGENDA_MIGRATIONS_DIR = fileURLToPath(new URL(${JSON.stringify(migrations.href)}));
      ${source}
    `], { cwd: root, env: { ...env, ...overrides }, encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, result.stderr + result.stdout);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("hosting environment takes precedence over .env for port and database", () => {
  runIsolated(`
    const config = loadConfig();
    assert.equal(config.port, 3401);
    assert.equal(config.url.origin, 'https://agenda.realess.com.br');
    assert.equal(process.env.AGENDA_DB_PATH, resolve('hostinger-db/agenda.sqlite'));
    assert.equal(config.backupDir, resolve('hostinger-backups'));
    const database = getDatabase();
    assert.equal(database.filename, process.env.AGENDA_DB_PATH);
    database.close();
  `, {
    PUBLIC_URL: "https://agenda.realess.com.br",
    PORT: "3401",
    AGENDA_DB_PATH: "hostinger-db/agenda.sqlite",
    AGENDA_BACKUP_DIR: "hostinger-backups",
  }, "PUBLIC_URL=http://127.0.0.1:3000\nPORT=3000\nAGENDA_DB_PATH=old-db.sqlite\nAGENDA_BACKUP_DIR=old-backups\n");
});

test("new database stays under the project root and survives reopening", () => {
  runIsolated(`
    const config = loadConfig();
    assert.equal(process.env.AGENDA_DB_PATH, resolve('banco-de-dados/agenda.sqlite'));
    assert.equal(config.backupDir, resolve('banco-de-dados/backups'));
    const database = getDatabase();
    assert.equal(database.connection.prepare('SELECT COUNT(*) AS n FROM bookings').get().n, 0);
    database.connection.prepare("INSERT INTO rooms(id,name,capacity) VALUES('test-room','Sala de teste',4)").run();
    database.close();
    const { LocalDatabase } = await import(${JSON.stringify(databaseURL)});
    const reopened = new LocalDatabase();
    assert.equal(reopened.connection.prepare('SELECT name FROM rooms WHERE id=?').get('test-room').name, 'Sala de teste');
    reopened.close();
  `);
});
