import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../app/chatgpt-auth";
import { configuredCalendarAdmin } from "./holiday-service";
import {
  createDeviceToken,
  deviceCookie,
  deviceCookieName,
  DEVICE_LIFETIME,
  hashDeviceToken,
  readDeviceToken,
} from "./device-identity";

export type AgendaVisitor = {
  userId: string;
  displayName: string;
  email: string;
  isAdmin: boolean;
  tokenHash: string;
};

export async function getAgendaVisitor(
  request: Request,
  create = false,
): Promise<{ user: AgendaVisitor | null; cookie?: string }> {
  const db = env.DB!;
  const token = readDeviceToken(
    request.headers.get("cookie"),
    deviceCookieName(request.url),
  );
  if (token) {
    const hash = await hashDeviceToken(token);
    const record = await db
      .prepare(
        "SELECT visitor_id AS userId,display_name AS displayName,email,is_admin AS isAdmin FROM agenda_visitors WHERE token_hash=? AND expires_at>?",
      )
      .bind(hash, Date.now())
      .first<Omit<AgendaVisitor, "tokenHash">>();
    if (record)
      return {
        // Only an originally trusted identity can be an admin. Re-check the
        // current allowlist so removing an administrator revokes their role.
        user: {
          ...record,
          isAdmin: !!record.isAdmin && configuredCalendarAdmin(record.email),
          tokenHash: hash,
        },
      };
  }
  if (!create) return { user: null };
  // Optional, passive continuity for existing organizers. This never redirects
  // visitors or requires an OpenAI account. Anonymous access is the normal path.
  const previousIdentity = await getChatGPTUser();
  const freshToken = createDeviceToken(),
    hash = await hashDeviceToken(freshToken);
  const user: AgendaVisitor = {
    userId: previousIdentity?.userId || `visitor_${crypto.randomUUID()}`,
    displayName: previousIdentity?.displayName || "Visitante",
    email: previousIdentity?.email || "",
    isAdmin:
      !!previousIdentity && configuredCalendarAdmin(previousIdentity.email),
    tokenHash: hash,
  };
  const now = Date.now();
  await db
    .prepare(
      "INSERT INTO agenda_visitors(token_hash,visitor_id,display_name,email,is_admin,created_at,expires_at) VALUES(?,?,?,?,?,?,?)",
    )
    .bind(
      hash,
      user.userId,
      user.displayName,
      user.email,
      Number(user.isAdmin),
      now,
      now + DEVICE_LIFETIME * 1000,
    )
    .run();
  return { user, cookie: deviceCookie(request.url, freshToken) };
}
