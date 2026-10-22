import { env, allowedOrigin } from "../../../lib/runtime";
import { getAgendaVisitor } from "../../../lib/agenda-visitor";
import {
  isCalendarAdmin,
  readCalendarPolicy,
} from "../../../lib/holiday-service";
import { validDate, type CalendarPolicy } from "../../../lib/holidays";

export async function POST(request: Request) {
  const { user } = await getAgendaVisitor(request);
  if (!user || !isCalendarAdmin(user))
    return Response.json(
      { error: "Somente administradores podem alterar o calendário." },
      { status: 403 },
    );
  if (!allowedOrigin(request))
    return Response.json({ error: "Origem inválida." }, { status: 403 });
  try {
    if (Number(request.headers.get("content-length") || 0) > 60000)
      throw new Error("Configuração muito extensa.");
    const body = (await request.json()) as CalendarPolicy;
    if (
      typeof body.blockOptional !== "boolean" ||
      !Array.isArray(body.overrides) ||
      body.overrides.length > 200
    )
      throw new Error("Confira as configurações.");
    const dates = new Set<string>();
    const overrides = body.overrides.map((item) => {
      if (
        !item ||
        !validDate(item.date) ||
        Number(item.date.slice(0, 4)) < 1900 ||
        Number(item.date.slice(0, 4)) > 2199 ||
        typeof item.allowBooking !== "boolean" ||
        typeof item.note !== "string" ||
        item.note.trim().length < 3 ||
        item.note.length > 300 ||
        dates.has(item.date)
      )
        throw new Error(
          "Cada exceção precisa de uma data única e uma justificativa de 3 a 300 caracteres.",
        );
      dates.add(item.date);
      return { ...item, note: item.note.trim() };
    });
    const timestamp = Date.now(),
      db = env.DB!,
      policy = { blockOptional: body.blockOptional, overrides };
    const before = await readCalendarPolicy();
    await db.batch([
      db
        .prepare(
          "INSERT INTO calendar_policy(id,block_optional,updated_at,updated_by) VALUES('workspace',?,?,?) ON CONFLICT(id) DO UPDATE SET block_optional=excluded.block_optional,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
        )
        .bind(Number(body.blockOptional), timestamp, user.userId),
      db.prepare("DELETE FROM holiday_overrides"),
      ...overrides.map((item) =>
        db
          .prepare(
            "INSERT INTO holiday_overrides(date,allow_booking,note,updated_at,updated_by) VALUES(?,?,?,?,?)",
          )
          .bind(
            item.date,
            Number(item.allowBooking),
            item.note,
            timestamp,
            user.userId,
          ),
      ),
      db
        .prepare(
          "INSERT INTO calendar_policy_history(actor_id,recorded_at,snapshot) VALUES(?,?,?)",
        )
        .bind(
          user.userId,
          timestamp,
          JSON.stringify({ before, after: policy }),
        ),
    ]);
    return Response.json({ ok: true, policy });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível salvar a configuração.",
      },
      { status: 400 },
    );
  }
}
