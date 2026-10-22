import { env } from "../../../lib/runtime";
import {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  getAuthenticatedUser,
  isRequestSecure,
} from "../../../lib/auth";
import { validEmail } from "../../../lib/recipients";
import { workspaceSetupStatements } from "../../../lib/workspace-setup";

export const dynamic = "force-dynamic";

const responseJSON = (data: unknown, status = 200, cookie?: string) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(cookie ? { "Set-Cookie": cookie } : {}),
    },
  });

async function initialize() {
  await env.DB!.batch(
    workspaceSetupStatements.map((statement) => env.DB!.prepare(statement)),
  );
}

export async function GET(request: Request) {
  try {
    if (!env.DB) throw new Error("Database unavailable");
    await initialize();
    const user = await getAuthenticatedUser(request);
    return responseJSON({ user, authenticated: !!user });
  } catch (error) {
    console.error("Auth GET error", error);
    return responseJSON({ error: "Erro ao verificar autenticação." }, 500);
  }
}

export async function POST(request: Request) {
  try {
    if (!env.DB) throw new Error("Database unavailable");
    await initialize();
    const db = env.DB;
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action || "");
    const secure = isRequestSecure(request);

    if (action === "logout") {
      const { cookie } = await destroySession(request, secure);
      return responseJSON({ ok: true }, 200, cookie);
    }

    if (action === "register") {
      const name = String(body.name || "").trim().slice(0, 100);
      const email = String(body.email || "").trim().toLowerCase().slice(0, 254);
      const password = String(body.password || "");

      if (name.length < 2) {
        return responseJSON({ error: "Informe seu nome completo (mínimo 2 caracteres)." }, 400);
      }
      if (!email || !validEmail(email)) {
        return responseJSON({ error: "Informe um e-mail válido." }, 400);
      }
      if (password.length < 4) {
        return responseJSON({ error: "A senha deve ter pelo menos 4 caracteres." }, 400);
      }

      // Check if user already exists
      const existing = await db
        .prepare("SELECT id FROM users WHERE email = ?")
        .bind(email)
        .first();

      if (existing) {
        return responseJSON(
          { error: "Este e-mail já está cadastrado. Alterne para a aba 'Entrar' para fazer login." },
          409,
        );
      }

      const id = crypto.randomUUID();
      const pwdHash = hashPassword(password);
      const now = Date.now();

      await db
        .prepare(
          "INSERT INTO users(id, name, email, password_hash, created_at, updated_at) VALUES(?,?,?,?,?,?)",
        )
        .bind(id, name, email, pwdHash, now, now)
        .run();

      // Immediately log the user in
      const { cookie } = await createSession(id, secure);
      return responseJSON(
        { ok: true, user: { id, name, email, isAdmin: true } },
        201,
        cookie,
      );
    }

    if (action === "login") {
      const email = String(body.email || "").trim().toLowerCase().slice(0, 254);
      const password = String(body.password || "");

      if (!email || !password) {
        return responseJSON({ error: "Informe o e-mail e a senha." }, 400);
      }

      const user = await db
        .prepare("SELECT id, name, email, password_hash FROM users WHERE email = ?")
        .bind(email)
        .first<{ id: string; name: string; email: string; password_hash: string }>();

      if (!user || !verifyPassword(password, user.password_hash)) {
        return responseJSON({ error: "E-mail ou senha incorretos." }, 401);
      }

      const { cookie } = await createSession(user.id, secure);
      return responseJSON(
        {
          ok: true,
          user: { id: user.id, name: user.name, email: user.email, isAdmin: true },
        },
        200,
        cookie,
      );
    }

    return responseJSON({ error: "Ação não suportada." }, 400);
  } catch (error) {
    console.error("Auth POST error", error);
    return responseJSON({ error: "Não foi possível processar a autenticação. Tente novamente." }, 500);
  }
}
