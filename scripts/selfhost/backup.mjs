import { resolve } from "node:path";
import { loadConfig } from "./config.mjs";
import { backupDatabase } from "../../db/local-sqlite.mjs";
const { backupDir } = loadConfig();
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
console.log(await backupDatabase(resolve(process.argv[2] || resolve(backupDir, `agenda-manual-${stamp}.sqlite`))));
