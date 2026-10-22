import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { sanitizePrivateBuild } from "./sanitize-private-build.mjs";
process.env.NEXT_TELEMETRY_DISABLED = "1";
const built = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build", "--webpack"], { stdio: "inherit", env: process.env, windowsHide: true });
if (built.status !== 0) process.exit(built.status || 1);
const target = resolve(".next/standalone");
if (!existsSync(resolve(target, "server.js"))) throw new Error("A saída standalone do Next.js não foi gerada.");
for (const [from, to] of [["public", "public"], [".next/static", ".next/static"], ["drizzle", "drizzle"], ["db/local-sqlite.mjs", "db/local-sqlite.mjs"], ["lib/auth-store.mjs", "lib/auth-store.mjs"], ["scripts/selfhost", "scripts/selfhost"]]) {
  mkdirSync(resolve(target, to, ".."), { recursive: true });
  cpSync(resolve(from), resolve(target, to), { recursive: true });
}
sanitizePrivateBuild();
console.log("Versão local pronta em .next/standalone.");
