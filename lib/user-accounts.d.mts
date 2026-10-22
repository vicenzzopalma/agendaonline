import type { LocalDatabase } from "../db/local-sqlite.mjs";
export type ManagedUser = { id: string; name: string; username: string; role: "master" | "member"; active: boolean; createdAt: number };
export class AccountError extends Error { status: number; constructor(message: string, status?: number); }
export function listUsers(actorId: string, database?: LocalDatabase): ManagedUser[];
export function createUser(actorId: string, input: Record<string, unknown>, database?: LocalDatabase): Promise<ManagedUser>;
export function setUserActive(actorId: string, id: unknown, active: unknown, database?: LocalDatabase): ManagedUser;
