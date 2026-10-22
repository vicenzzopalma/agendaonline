import { existsSync, readdirSync, rmSync, unlinkSync } from "node:fs";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

// Tracing can copy runtime files on some platforms. They never belong in an artifact.
export function sanitizePrivateBuild() {
  const target = resolve(".next/standalone");
  if (!existsSync(resolve(target, "server.js"))) throw new Error("Pacote standalone não encontrado.");
  for (const folder of ["banco-de-dados", "outputs", "runtime", "logs"]) {
    const candidate = resolve(target, folder);
    if (!candidate.startsWith(target + sep) || candidate === target) throw new Error("Caminho de limpeza fora do pacote.");
    rmSync(candidate, { recursive: true, force: true });
  }
  for (const name of readdirSync(target)) {
    if (/^\.env(?:\.|$)/.test(name)) unlinkSync(resolve(target, name));
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  sanitizePrivateBuild();
  console.log("Pacote verificado sem banco de dados, arquivos privados de ativação ou .env.");
}
