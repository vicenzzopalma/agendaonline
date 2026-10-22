import { publicOrigin } from "./runtime";
import { getSessionUser } from "./auth-store.mjs";

export type AgendaVisitor = {
  userId: string;
  displayName: string;
  email: string;
  isAdmin: boolean;
  tokenHash: string;
};

export async function getAgendaVisitor(
  request: Request,
): Promise<{ user: AgendaVisitor | null; cookie?: string }> {
  // Device cookies from the public agenda no longer grant access.
  const user = getSessionUser(request.headers.get("cookie"), publicOrigin(request));
  return { user: user ? {
    userId: user.id,
    displayName: user.name,
    email: user.email,
    isAdmin: user.isAdmin,
    tokenHash: user.tokenHash,
  } : null };
}
