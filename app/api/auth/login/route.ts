import { allowedOrigin, publicOrigin } from "../../../../lib/runtime";
import { readSessionToken, sessionCookie, signIn } from "../../../../lib/auth-store.mjs";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (!request.headers.get("origin") || !allowedOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403, headers });
  if (Number(request.headers.get("content-length") || 0) > 4096) return Response.json({ error: "Dados inválidos." }, { status: 413, headers });
  try {
    const body = await request.json() as { username?: unknown; password?: unknown } | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "Dados inválidos." }, { status: 400, headers });
    const origin = publicOrigin(request);
    const result = await signIn(body.username, body.password, readSessionToken(request.headers.get("cookie"), origin));
    if (!result.ok) return Response.json({ error: result.status === 429 ? "Muitas tentativas. Aguarde 15 minutos e tente novamente." : "Login ou senha incorretos." }, {
      status: result.status,
      headers: { ...headers, ...(result.retryAfter ? { "Retry-After": String(result.retryAfter) } : {}) },
    });
    return Response.json({ ok: true }, { headers: { ...headers, "Set-Cookie": sessionCookie(origin, result.token!) } });
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof TypeError) return Response.json({ error: "Dados inválidos." }, { status: 400, headers });
    console.error("Login indisponível.");
    return Response.json({ error: "Não foi possível entrar. Tente novamente." }, { status: 503, headers });
  }
}
