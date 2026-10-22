import { emitKeypressEvents } from "node:readline";
import { writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadConfig } from "./config.mjs";
import { getDatabase } from "../../db/local-sqlite.mjs";
import { hashPassword, provisionMaster } from "../../lib/auth-store.mjs";

async function readPassword() {
  if (process.argv.includes("--password-stdin")) {
    let text = "";
    for await (const chunk of process.stdin) { text += chunk; if (text.length > 1024) throw new Error("Entrada muito extensa."); }
    return text.replace(/\r?\n$/, "");
  }
  if (!process.stdin.isTTY) throw new Error("Use um terminal interativo ou --password-stdin. Não informe a senha como argumento.");
  process.stdout.write("Senha do master arthur.hille (oculta): ");
  emitKeypressEvents(process.stdin); process.stdin.setRawMode(true); process.stdin.resume();
  return new Promise((resolvePassword, reject) => {
    let value = "";
    const stop = () => { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.removeListener("keypress", handler); process.stdout.write("\n"); };
    const handler = (text, key) => {
      if (key.ctrl && key.name === "c") { stop(); reject(new Error("Operação cancelada.")); }
      else if (key.name === "return") { stop(); resolvePassword(value); }
      else if (key.name === "backspace") value = value.slice(0, -1);
      else if (text && !key.ctrl && !key.meta) value += text;
    };
    process.stdin.on("keypress", handler);
  });
}
loadConfig();
const database = getDatabase();
try {
  if (database.connection.prepare("SELECT 1 FROM users WHERE username='arthur.hille' COLLATE NOCASE OR role='master'").get()) throw new Error("O acesso master já existe. Sua senha não foi alterada.");
  const passwordHash = await hashPassword(await readPassword());
  const file = resolve(dirname(database.filename), "master-bootstrap.json");
  if (process.argv.includes("--write-bootstrap") && existsSync(file)) throw new Error("O arquivo privado de ativação já existe.");
  provisionMaster(passwordHash, database);
  if (process.argv.includes("--write-bootstrap")) writeFileSync(file, JSON.stringify({ username: "arthur.hille", passwordHash }) + "\n", { encoding: "utf8", mode: 0o600, flag: "wx" });
  console.log("Acesso master arthur.hille criado. Nenhum outro usuário foi cadastrado.");
} finally { database.close(); }
