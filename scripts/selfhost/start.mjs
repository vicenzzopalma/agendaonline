import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "./config.mjs";
import { getDatabase, backupDatabase } from "../../db/local-sqlite.mjs";

const config = loadConfig();
const development = process.argv.includes("--dev");
const database = getDatabase(); // Apply pending migrations before listening.
const packagedServer = resolve("server.js");
const standaloneServer = resolve(".next/standalone/server.js");
const args = development
  ? [resolve("node_modules/next/dist/bin/next"), "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(config.port)]
  : [existsSync(packagedServer) ? packagedServer : standaloneServer];
if (!existsSync(args[0])) throw new Error("Execute npm run build antes de iniciar a agenda.");
console.log(`Agenda Realess · ${config.url.origin} · banco local inicializado`);
const child = spawn(process.execPath, args, { stdio: "inherit", env: process.env, windowsHide: true });

let backingUp = false;
async function automaticBackup() {
  if (backingUp) return;
  backingUp = true;
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await backupDatabase(resolve(config.backupDir, `agenda-auto-${stamp}.sqlite`), database);
    // Retention applies only to backups produced by this routine.
    for (const name of readdirSync(config.backupDir)) {
      const file = resolve(config.backupDir, name);
      if (/^agenda-auto-[\dTZ-]+\.sqlite$/.test(name) && statSync(file).mtimeMs < Date.now() - 30 * 86400000) unlinkSync(file);
    }
    console.log("Backup automático verificado com sucesso.");
  } catch (error) { console.error("Backup automático falhou:", error.message); }
  finally { backingUp = false; }
}
const firstBackup = setTimeout(automaticBackup, 60000);
const timer = setInterval(automaticBackup, 24 * 60 * 60 * 1000);
function stop(signal) { child.kill(signal); }
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
child.on("error", (error) => { console.error(error.message); process.exit(1); });
child.on("exit", (code) => {
  clearTimeout(firstBackup); clearInterval(timer);
  process.exit(code ?? 1);
});
