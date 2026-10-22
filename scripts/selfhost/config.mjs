import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

export function loadConfig() {
  const file = resolve(".env");
  if (existsSync(file)) process.loadEnvFile(file);
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("PORT deve estar entre 1024 e 65535.");
  const url = new URL(process.env.PUBLIC_URL || `http://127.0.0.1:${port}`);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("PUBLIC_URL deve ser uma origem HTTP/HTTPS sem caminhos.");
  process.env.PUBLIC_URL = url.origin;
  process.env.PORT = String(port);
  process.env.HOSTNAME = "127.0.0.1";
  process.env.TZ = "America/Sao_Paulo";
  process.env.NEXT_TELEMETRY_DISABLED = "1";
  process.env.AGENDA_DB_PATH = resolve(process.env.AGENDA_DB_PATH || "banco-de-dados/agenda.sqlite");
  const backupDir = resolve(process.env.AGENDA_BACKUP_DIR || "banco-de-dados/backups");
  const logDir = resolve(process.env.AGENDA_LOG_DIR || "logs");
  mkdirSync(backupDir, { recursive: true });
  mkdirSync(logDir, { recursive: true });
  return { port, url, backupDir, logDir };
}
