import type { DatabaseSync } from "node:sqlite";
export type SQLValue = string | number | bigint | null | Uint8Array;
export type QueryResult<T = unknown> = { success: boolean; results: T[]; meta: { changes: number; last_row_id?: number } };
export class PreparedStatement {
  bind(...values: unknown[]): PreparedStatement;
  all<T = unknown>(): Promise<QueryResult<T>>;
  run(): Promise<QueryResult>;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
}
export class LocalDatabase {
  constructor(filename?: string);
  filename: string;
  connection: DatabaseSync;
  prepare(sql: string): PreparedStatement;
  batch<T = unknown>(statements: PreparedStatement[]): Promise<QueryResult<T>[]>;
  close(): void;
}
export function databasePath(): string;
export function getDatabase(): LocalDatabase;
export function backupDatabase(destination: string, database?: LocalDatabase): Promise<string>;
