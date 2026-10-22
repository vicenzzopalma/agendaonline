import { env, publicOrigin } from "./runtime";
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
    deviceCookieName(publicOrigin(request)),
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
        user: {
          ...record,
          // Granted/revoked only by the server's offline administration tool.
          isAdmin: !!record.isAdmin,
          tokenHash: hash,
        },
      };
  }
  if (!create) return { user: null };
  // Never trust identity headers supplied by visitors to a public Node server.
  const freshToken = createDeviceToken(),
    hash = await hashDeviceToken(freshToken);
  const user: AgendaVisitor = {
    userId: `visitor_${crypto.randomUUID()}`,
    displayName: "Visitante",
    email: "",
    isAdmin: false,
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
  return { user, cookie: deviceCookie(publicOrigin(request), freshToken) };
}
