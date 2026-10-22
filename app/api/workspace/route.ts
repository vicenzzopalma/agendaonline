import { env, allowedOrigin } from "../../../lib/runtime";
import {
  getAgendaVisitor,
  type AgendaVisitor,
} from "../../../lib/agenda-visitor";
import { getAuthenticatedUser } from "../../../lib/auth";
import { workspaceSetupStatements } from "../../../lib/workspace-setup";
import {
  addDays,
  dateKey,
  monday,
  normalizeSearch,
  MEETING_LINK_ERROR,
  normalizeMeetingLink,
  type Booking,
} from "../../../lib/calendar";
import {
  blockedHoliday,
  holidayMessage,
  validDate,
} from "../../../lib/holidays";
import { getHolidayYear, isCalendarAdmin } from "../../../lib/holiday-service";
import {
  normalizeRecipients,
  splitRecipients,
  validEmail,
  visibleBooking,
  publicSearchSQL,
  invitationRecipients,
} from "../../../lib/recipients";

export const dynamic = "force-dynamic";
const responseJSON = (data: unknown, status = 200, cookie?: string) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(cookie ? { "Set-Cookie": cookie } : {}),
    },
  });
const json = responseJSON;
const clean = (value: unknown, length = 500) =>
  typeof value === "string" ? value.trim().slice(0, length) : "";
const fields =
  "id,title,date,start,end,room_id AS roomId,kind,description,participants,link,owner_id AS ownerId,owner_name AS ownerName,organizer_email AS organizerEmail,created_by_name AS createdByName,created_by_email AS createdByEmail,created_at AS createdAt,updated_at AS updatedAt,cancelled_at AS cancelledAt,status,version";
async function initialize() {
  await env.DB!.batch(
    workspaceSetupStatements.map((statement) => env.DB!.prepare(statement)),
  );
}
const userInfo = (user: AgendaVisitor) => ({
  id: user.userId,
  name: user.displayName,
  email: user.email,
  isAdmin: isCalendarAdmin(user),
});

export async function GET(request: Request) {
  try {
    if (!env.DB) throw new Error("Database unavailable");
    await initialize();
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) {
      return responseJSON({
        authenticated: false,
        user: null,
        rooms: [],
        bookings: [],
        started: true,
      });
    }
    const user: AgendaVisitor = {
      userId: authUser.id,
      displayName: authUser.name,
      email: authUser.email,
      isAdmin: true,
      tokenHash: authUser.id,
    };
    const json = (data: unknown, status = 200) => responseJSON(data, status);
    const db = env.DB,
      params = new URL(request.url).searchParams;
    const rooms = await db.prepare("SELECT * FROM rooms ORDER BY rowid").all();
    const visible = (rows: unknown[]) =>
      (rows as Booking[]).map((row) => visibleBooking(row, user.userId));
    const today = dateKey(new Date()),
      time = new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date());
    if (params.get("audit")) {
      const owner = await db
        .prepare("SELECT owner_id AS ownerId FROM bookings WHERE id=?")
        .bind(clean(params.get("audit"), 100))
        .first<{ ownerId: string }>();
      if (!owner || owner.ownerId !== user.userId)
        return json(
          {
            error:
              "O histórico detalhado está disponível apenas para o organizador.",
          },
          403,
        );
      const before = Number(params.get("before"));
      if (
        params.has("before") &&
        (!Number.isSafeInteger(before) || before <= 0)
      )
        return json({ error: "Página de histórico inválida." }, 400);
      const records = await db
        .prepare(
          `SELECT id,action,recorded_at AS recordedAt,snapshot FROM booking_history WHERE booking_id=? ${before ? "AND id<?" : ""} ORDER BY id DESC LIMIT 101`,
        )
        .bind(
          ...(before
            ? [clean(params.get("audit"), 100), before]
            : [clean(params.get("audit"), 100)]),
        )
        .all();
      const history = records.results.slice(0, 100);
      return json({
        history,
        nextCursor:
          records.results.length > 100
            ? (history[history.length - 1] as { id: number }).id
            : null,
      });
    }
    if (params.get("mode") === "history") {
      const conditions: string[] = [],
        values: (string | number)[] = [];
      const q = normalizeSearch(clean(params.get("q"), 120));
      if (q) {
        conditions.push(
          `(instr(${publicSearchSQL()},?)>0 OR (owner_id=? AND instr(search_text,?)>0))`,
        );
        values.push(q, user.userId, q);
      }
      for (const [key, operator] of [
        ["from", ">="],
        ["to", "<="],
      ]) {
        const date = params.get(key);
        if (date) {
          if (!validDate(date))
            return json({ error: "Informe datas válidas." }, 400);
          conditions.push(`date${operator}?`);
          values.push(date);
        }
      }
      const roomIds = params.getAll("room").slice(0, 100);
      if (roomIds.length) {
        conditions.push(
          `COALESCE(room_id,'online') IN (${roomIds.map(() => "?").join(",")})`,
        );
        values.push(...roomIds);
      }
      const kind = clean(params.get("kind"), 30);
      if (kind) {
        conditions.push("kind=?");
        values.push(kind);
      }
      if (params.get("mine") === "1") {
        conditions.push("owner_id=?");
        values.push(user.userId);
      }
      const status = params.get("status") || "all";
      if (status === "cancelled") conditions.push("status='cancelled'");
      else if (["active", "past", "future"].includes(status)) {
        conditions.push("status='active'");
        if (status !== "active") {
          conditions.push(
            status === "past"
              ? "(date<? OR (date=? AND end<=?))"
              : "(date>? OR (date=? AND end>?))",
          );
          values.push(today, today, time);
        }
      }
      const requested = Number(params.get("page") || 1),
        page = Number.isInteger(requested)
          ? Math.max(1, Math.min(requested, 100000))
          : 1,
        pageSize = 30;
      const where = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";
      const [total, bookings] = await db.batch([
        db
          .prepare(`SELECT COUNT(*) AS total FROM bookings ${where}`)
          .bind(...values),
        db
          .prepare(
            `SELECT ${fields} FROM bookings ${where} ORDER BY date DESC,start DESC,id LIMIT ? OFFSET ?`,
          )
          .bind(...values, pageSize, (page - 1) * pageSize),
      ]);
      return json({
        rooms: rooms.results,
        bookings: visible(bookings.results),
        total: (total.results[0] as { total: number }).total,
        page,
        pageSize,
        user: userInfo(user),
      });
    }
    const from = params.get("from") || today.slice(0, 7) + "-01",
      to = params.get("to") || addDays(`${today.slice(0, 7)}-01`, 40);
    if (
      !validDate(from) ||
      !validDate(to) ||
      from > to ||
      Date.parse(to) - Date.parse(from) > 400 * 86400000
    )
      return json(
        { error: "Selecione um período válido de até 400 dias." },
        400,
      );
    const status =
        params.get("includeCancelled") === "1" ? "" : "AND status='active'",
      week = monday(today);
    const [bookings, todayBookings, upcoming, stats] = await db.batch([
      db
        .prepare(
          `SELECT ${fields} FROM bookings WHERE date>=? AND date<=? ${status} ORDER BY date,start`,
        )
        .bind(from, to),
      db
        .prepare(
          `SELECT ${fields} FROM bookings WHERE date=? AND status='active' ORDER BY start`,
        )
        .bind(today),
      db
        .prepare(
          `SELECT ${fields} FROM bookings WHERE date>? AND status='active' ORDER BY date,start LIMIT 4`,
        )
        .bind(today),
      db
        .prepare(
          "SELECT COUNT(*) AS week,SUM(CASE WHEN owner_id=? THEN 1 ELSE 0 END) AS mine FROM bookings WHERE date>=? AND date<=? AND status='active'",
        )
        .bind(user.userId, week, addDays(week, 4)),
    ]);
    return json({
      rooms: rooms.results,
      bookings: visible(bookings.results),
      todayBookings: visible(todayBookings.results),
      upcoming: visible(upcoming.results),
      stats: stats.results[0],
      started: true,
      user: userInfo(user),
    });
  } catch (error) {
    console.error("Workspace read failed", error);
    return json(
      { error: "Não foi possível carregar a agenda. Tente novamente." },
      503,
    );
  }
}

export async function POST(request: Request) {
  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser)
      return json(
        {
          error:
            "Sua sessão expirou ou você não está conectado. Faça login para continuar.",
        },
        401,
      );
    const user: AgendaVisitor = {
      userId: authUser.id,
      displayName: authUser.name,
      email: authUser.email,
      isAdmin: true,
      tokenHash: authUser.id,
    };
    if (!allowedOrigin(request))
      return json({ error: "Origem inválida." }, 403);
    if (Number(request.headers.get("content-length") || 0) > 20000)
      return json({ error: "Dados muito extensos." }, 413);
    const body = (await request.json()) as Record<string, unknown>,
      db = env.DB!;
    await initialize();
    if (body.action === "start") {
      await db
        .prepare("UPDATE settings SET started=1 WHERE id='workspace'")
        .run();
      return json({ ok: true });
    }
    if (body.action === "saveRoom") {
      const name = clean(body.name, 70),
        capacity = Number(body.capacity ?? 0);
      if (
        !name ||
        !Number.isInteger(capacity) ||
        capacity < 0 ||
        capacity > 500
      )
        return json(
          {
            error:
              "Informe o nome da sala. A capacidade é opcional e deve ser de até 500 pessoas.",
          },
          400,
        );
      const id = clean(body.id, 100) || crypto.randomUUID();
      if (
        await db
          .prepare(
            "SELECT id FROM rooms WHERE lower(name)=lower(?) AND active=1 AND id<>?",
          )
          .bind(name, id)
          .first()
      )
        return json({ error: "Já existe uma sala com esse nome." }, 409);
      const color = [
        "green", "blue", "purple", "orange", "teal", "rose", "indigo",
        "red", "cyan", "lime", "slate", "brown",
      ].includes(
        String(body.color),
      )
        ? body.color
        : "green";
      if (body.id) {
        const result = await db
          .prepare(
            "UPDATE rooms SET name=?,capacity=?,location=?,equipment=?,color=? WHERE id=? AND active=1",
          )
          .bind(
            name,
            capacity,
            clean(body.location, 100),
            clean(body.equipment, 300),
            color,
            id,
          )
          .run();
        if (!result.meta.changes)
          return json({ error: "Esta sala não está mais disponível." }, 404);
      } else
        await db
          .prepare(
            "INSERT INTO rooms(id,name,capacity,location,equipment,color) VALUES(?,?,?,?,?,?)",
          )
          .bind(
            id,
            name,
            capacity,
            clean(body.location, 100),
            clean(body.equipment, 300),
            color,
          )
          .run();
      return json({ ok: true, id });
    }
    if (body.action === "archiveRoom") {
      const id = clean(body.id, 100),
        today = dateKey(new Date()),
        time = new Intl.DateTimeFormat("pt-BR", {
          timeZone: "America/Sao_Paulo",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(new Date());
      const result = await db
        .prepare(
          "UPDATE rooms SET active=0 WHERE id=? AND active=1 AND NOT EXISTS(SELECT 1 FROM bookings WHERE room_id=? AND status='active' AND (date>? OR(date=? AND end>?)))",
        )
        .bind(id, id, today, today, time)
        .run();
      if (!result.meta.changes)
        return json(
          {
            error:
              "A sala tem reservas futuras. Cancele ou transfira essas reservas antes de arquivar.",
          },
          409,
        );
      return json({ ok: true });
    }
    const id = clean(body.id, 100) || crypto.randomUUID(),
      existing = body.id
        ? await db
            .prepare(`SELECT ${fields} FROM bookings WHERE id=?`)
            .bind(id)
            .first<Booking>()
        : null;
    if (body.id && !existing)
      return json(
        { error: "Compromisso não encontrado." },
        404,
      );
    if (existing?.status === "cancelled")
      return json(
        {
          error:
            "Este compromisso já foi cancelado. Seu registro permanece no histórico.",
        },
        409,
      );
    if (
      existing &&
      body.version !== undefined &&
      Number(body.version) !== existing.version
    )
      return json(
        {
          error:
            "Este compromisso foi alterado. Atualize a agenda antes de editar novamente.",
        },
        409,
      );
    if (body.action === "deleteBooking") {
      if (!existing) return json({ error: "Compromisso não encontrado." }, 404);
      const timestamp = Date.now(),
        result = await db
          .prepare(
            "UPDATE bookings SET status='cancelled',cancelled_at=?,updated_at=?,last_actor_id=?,version=version+1 WHERE id=? AND version=? AND status='active'",
          )
          .bind(
            timestamp,
            timestamp,
            user.userId,
            id,
            existing.version,
          )
          .run();
      if (!result.meta.changes)
        return json(
          {
            error:
              "O compromisso foi alterado por outra sessão. Atualize a agenda.",
          },
          409,
        );
      const booking = await db
        .prepare(`SELECT ${fields} FROM bookings WHERE id=?`)
        .bind(id)
        .first<Booking>();
      return json({ ok: true, id, status: "cancelled", booking });
    }
    if (body.action !== "saveBooking")
      return json({ error: "Ação inválida." }, 400);
    const title = clean(body.title, 120),
      date = clean(body.date, 10),
      start = clean(body.start, 5),
      end = clean(body.end, 5);
    if (
      !title ||
      !validDate(date) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(start) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(end) ||
      start >= end
    )
      return json(
        {
          error:
            "Confira o título, a data e os horários. O término deve ser depois do início.",
        },
        400,
      );
    const year = Number(date.slice(0, 4));
    if (year < 1900 || year > 2199)
      return json({ error: "Escolha uma data entre 1900 e 2199." }, 400);
    const holiday = blockedHoliday(date, (await getHolidayYear(year)).holidays);
    if (holiday) return json({ error: holidayMessage(holiday) }, 409);
    const roomId = clean(body.roomId, 100) || null;
    if (
      roomId &&
      !(await db
        .prepare("SELECT id FROM rooms WHERE id=? AND active=1")
        .bind(roomId)
        .first())
    )
      return json({ error: "Selecione uma sala disponível." }, 400);
    const kind = [
      "appointment",
      "meeting",
      "focus",
      "client",
      "online",
    ].includes(String(body.kind))
      ? body.kind
      : "appointment";
    let link: string;
    try {
      link = normalizeMeetingLink(clean(body.link, 500));
    } catch {
      return json({ error: MEETING_LINK_ERROR }, 400);
    }
    let participants: string;
    try {
      if (
        body.participants !== undefined &&
        typeof body.participants !== "string"
      )
        throw new Error("Informe os e-mails dos participantes.");
      participants = normalizeRecipients(
        typeof body.participants === "string"
          ? body.participants
          : existing?.participants || "",
        splitRecipients(existing?.participants || "").filter(
          (part) => !validEmail(part),
        ),
      );
    } catch (error) {
      return json({ error: (error as Error).message }, 400);
    }
    const organizerName = clean(body.organizerName, 80) || user.displayName;
    const organizerEmail =
      body.organizerEmail === undefined
        ? existing?.organizerEmail || user.email
        : clean(body.organizerEmail, 254).toLowerCase();
    if (organizerName.length < 2 || organizerName === "Visitante")
      return json(
        { error: "Informe o nome do organizador do compromisso." },
        400,
      );
    if (organizerEmail && !validEmail(organizerEmail))
      return json(
        { error: "Informe um e-mail válido para o organizador." },
        400,
      );
    const description = clean(body.description, 2000),
      timestamp = Date.now(),
      searchText = normalizeSearch(`${title} ${organizerName} ${participants}`),
      values = [
        title,
        date,
        start,
        end,
        roomId,
        kind,
        description,
        participants,
        link,
        timestamp,
        user.userId,
        searchText,
      ];
    if (existing) {
      const result = await db
        .prepare(
          "UPDATE bookings SET title=?,date=?,start=?,end=?,room_id=?,kind=?,description=?,participants=?,link=?,updated_at=?,last_actor_id=?,search_text=?,version=version+1,owner_name=?,organizer_email=? WHERE id=? AND version=? AND status='active'",
        )
        .bind(
          ...values,
          organizerName,
          organizerEmail,
          id,
          existing.version,
        )
        .run();
      if (!result.meta.changes)
        return json(
          {
            error:
              "O compromisso foi alterado por outra sessão. Atualize a agenda.",
          },
          409,
        );
    } else {
      await db
        .prepare(
          "INSERT INTO bookings(title,date,start,end,room_id,kind,description,participants,link,updated_at,last_actor_id,search_text,id,owner_id,owner_name,created_at,organizer_email,created_by_name,created_by_email) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          ...values,
          id,
          user.userId,
          organizerName,
          timestamp,
          organizerEmail,
          user.displayName,
          user.email,
        )
        .run();
    }
    const booking = await db
      .prepare(`SELECT ${fields} FROM bookings WHERE id=?`)
      .bind(id)
      .first<Booking>();
    const currentRecipients = new Set(invitationRecipients(participants));
    const removed = invitationRecipients(existing?.participants || "").filter(
      (email) => !currentRecipients.has(email),
    );
    const removedInvitation =
      existing && booking && removed.length
        ? {
            ...existing,
            participants: removed.join(", "),
            status: "cancelled",
            version: booking.version,
            updatedAt: booking.updatedAt,
          }
        : undefined;
    return json({ ok: true, id, booking, removedInvitation });
  } catch (error) {
    const message = String(error);
    if (message.includes("ROOM_CONFLICT"))
      return json(
        {
          error:
            "Esta sala já está reservada nesse horário. Escolha outro horário ou outra sala.",
        },
        409,
      );
    if (message.includes("ROOM_INACTIVE"))
      return json(
        { error: "Esta sala foi arquivada. Selecione outra sala." },
        409,
      );
    if (error instanceof SyntaxError)
      return json({ error: "Dados inválidos." }, 400);
    console.error("Workspace mutation failed", error);
    return json({ error: "Não foi possível salvar. Tente novamente." }, 500);
  }
}
