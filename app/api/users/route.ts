import { getAgendaVisitor } from "../../../lib/agenda-visitor";
import { allowedOrigin } from "../../../lib/runtime";
import { AccountError, changeUserPassword, createUser, listUsers, setUserActive } from "../../../lib/user-accounts.mjs";

export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
function failure(error: unknown) {
  if (error instanceof AccountError) return json({ error: error.message }, error.status);
  if (error instanceof SyntaxError) return json({ error: "Dados inválidos." }, 400);
  console.error("Não foi possível gerenciar os acessos.");
  return json({ error: "Não foi possível concluir a operação. Tente novamente." }, 503);
}
export async function GET(request: Request) {
  try {
    const { user } = await getAgendaVisitor(request);
    if (!user) return json({ error: "Entre com seu login para continuar." }, 401);
    if (!user.isAdmin) return json({ error: "Somente o acesso Master pode gerenciar usuários." }, 403);
    return json({ users: listUsers(user.userId) });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const { user } = await getAgendaVisitor(request);
    if (!user) return json({ error: "Entre com seu login para continuar." }, 401);
    if (!user.isAdmin) return json({ error: "Somente o acesso Master pode gerenciar usuários." }, 403);
    if (!request.headers.get("origin") || !allowedOrigin(request)) return json({ error: "Origem inválida." }, 403);
    if (Number(request.headers.get("content-length") || 0) > 4096) return json({ error: "Dados muito extensos." }, 413);
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > 4096) return json({ error: "Dados muito extensos." }, 413);
    const body = JSON.parse(text) as Record<string, unknown> | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Dados inválidos." }, 400);
    if (body.action === "create") return json({ user: await createUser(user.userId, body) }, 201);
    if (body.action === "setActive") return json({ user: setUserActive(user.userId, body.id, body.active) });
    if (body.action === "changePassword") return json({ user: await changeUserPassword(user.userId, body.id, body.password, user.tokenHash) });
    return json({ error: "Operação inválida." }, 400);
  } catch (error) { return failure(error); }
}
