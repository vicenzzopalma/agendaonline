import { cpSync, existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
const root = resolve(".next/standalone");
if (!existsSync(resolve(root, "server.js"))) throw new Error("Execute npm run build primeiro.");
for (const file of ["runtime/node.exe", "runtime/caddy.exe"]) if (!existsSync(file)) throw new Error("Execute deploy/windows/PrepararRuntime.ps1 antes de empacotar.");
const target = resolve("releases/AgendaRealess-Windows");
const archiveOnly = process.argv.includes("--archive-only");
if (!archiveOnly) {
if (existsSync(target)) throw new Error("O diretório de saída já existe. Mova o pacote anterior antes de criar outro.");
mkdirSync(target, { recursive: true });
cpSync(root, target, { recursive: true });
// Operational scripts may change without recompiling the React application.
for (const directory of ["scripts/selfhost", "deploy/windows"]) cpSync(directory, resolve(target, directory), { recursive: true });
// Windows PowerShell 5.1 needs a BOM to decode Portuguese strings as UTF-8.
for (const file of readdirSync(resolve(target, "deploy/windows"))) if (file.endsWith(".ps1")) {
  const path = resolve(target, "deploy/windows", file);
  writeFileSync(path, "\uFEFF" + readFileSync(path, "utf8").replace(/^\uFEFF/, ""), "utf8");
}
mkdirSync(resolve(target, "runtime"));
for (const file of ["node.exe", "caddy.exe", "LICENSE-Node.txt", "LICENSE-Caddy.txt"]) if (existsSync(resolve("runtime", file))) cpSync(resolve("runtime", file), resolve(target, "runtime", file));
cpSync(".env.example", resolve(target, ".env.example"));
cpSync("docs/hospedagem-windows.md", resolve(target, "LEIA-ME.md"));
if (existsSync("outputs/selfhost/agenda-sites-20261021.sqlite")) {
  mkdirSync(resolve(target, "migracao"));
  cpSync("outputs/selfhost/agenda-sites-20261021.sqlite", resolve(target, "migracao/agenda-sites-20261021.sqlite"));
}
writeFileSync(resolve(target, "TestarLocal.cmd"), '@echo off\r\ncd /d "%~dp0"\r\nset PUBLIC_URL=http://127.0.0.1:3000\r\nset AGENDA_DB_PATH=./banco-de-dados/teste-local.sqlite\r\n"runtime\\node.exe" "scripts\\selfhost\\start.mjs"\r\npause\r\n');
} else if (!existsSync(resolve(target, "server.js"))) throw new Error("O pacote completo ainda não foi preparado.");
const zip = resolve("releases/AgendaRealess-Windows.zip");
if (existsSync(zip)) throw new Error("O ZIP de saída já existe. Preserve o pacote anterior antes de substituir.");
// Native Windows tar includes dotfiles and avoids Compress-Archive's per-file
// PowerShell overhead. Windows 10/Server 2019 and later ship bsdtar.
const result = spawnSync("tar.exe", ["-a", "-cf", zip, "-C", resolve("releases"), "AgendaRealess-Windows"], { stdio: "inherit", windowsHide: true });
if (result.status !== 0) throw new Error("Falha ao compactar o pacote.");
console.log(zip);
