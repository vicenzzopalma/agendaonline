import { allowedOrigin, publicOrigin } from "../../../../lib/runtime";
import { sessionCookie, signOut } from "../../../../lib/auth-store.mjs";

export async function POST(request: Request) {
  if (!request.headers.get("origin") || !allowedOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
  const origin = publicOrigin(request);
  signOut(request.headers.get("cookie"), origin);
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store", "Set-Cookie": sessionCookie(origin, "", 0) } });
}
