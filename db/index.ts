import { getDatabase } from "./local-sqlite.mjs";

export function getDb() {
  return getDatabase();
}
