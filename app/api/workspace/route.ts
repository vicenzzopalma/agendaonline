import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { workspaceSetupStatements } from "../../../lib/workspace-setup";
import { MEETING_LINK_ERROR, normalizeMeetingLink } from "../../../lib/calendar";

export const dynamic = "force-dynamic";
const colors = ["green", "blue", "purple", "orange"];
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const clean = (value: unknown, length = 500) => typeof value === "string" ? value.trim().slice(0, length) : "";

async function initialize() {
  const db = env.DB!;
  await db.batch(workspaceSetupStatements.map(statement => db.prepare(statement)));
}
export async function GET() {
  try {
    const user = await getChatGPTUser();
    if (!user) return json({ error: "Entre na sua conta para acessar a agenda.", signIn: true }, 401);
    if (!env.DB) throw new Error("Database unavailable");
    await initialize();
    const [rooms, bookings, settings] = await env.DB.batch([
      env.DB.prepare("SELECT * FROM rooms ORDER BY rowid"),
      env.DB.prepare('SELECT id,title,date,start,end,room_id AS roomId,kind,description,participants,link,owner_id AS ownerId,owner_name AS ownerName,created_at AS createdAt FROM bookings ORDER BY date,start'),
      env.DB.prepare("SELECT started FROM settings WHERE id='workspace'"),
    ]);
    return json({ rooms: rooms.results, bookings: bookings.results, started: !!(settings.results[0] as { started?: number })?.started, user: { id: user.userId, name: user.displayName, email: user.email } });
  } catch (error) {
    console.error("Workspace read failed", error);
    return json({ error: "Não foi possível carregar a agenda. Tente novamente." }, 503);
  }
}
export async function POST(request: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user) return json({ error: "Sua sessão expirou. Entre novamente.", signIn: true }, 401);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return json({ error: "Origem inválida." }, 403);
    if (Number(request.headers.get("content-length") || 0) > 20000) return json({ error: "Dados muito extensos." }, 413);
    const body = await request.json() as Record<string, unknown>;
    const db = env.DB!;
    if (body.action === "start") {
      await db.prepare("UPDATE settings SET started=1 WHERE id='workspace'").run();
      return json({ ok: true });
    }
    if (body.action === "saveRoom") {
      const name = clean(body.name, 70);
      const capacity = Number(body.capacity ?? 0);
      if (!name || !Number.isInteger(capacity) || capacity < 0 || capacity > 500) return json({ error: "Informe o nome da sala. A capacidade é opcional e deve ser de até 500 pessoas." }, 400);
      const id = clean(body.id, 100) || crypto.randomUUID();
      const duplicate = await db.prepare("SELECT id FROM rooms WHERE lower(name)=lower(?) AND active=1 AND id<>?").bind(name, id).first();
      if (duplicate) return json({ error: "Já existe uma sala com esse nome." }, 409);
      const color = colors.includes(String(body.color)) ? body.color : "green";
      if (body.id) {
        const result = await db.prepare("UPDATE rooms SET name=?,capacity=?,location=?,equipment=?,color=? WHERE id=? AND active=1").bind(name, capacity, clean(body.location, 100), clean(body.equipment, 300), color, id).run();
        if (!result.meta.changes) return json({ error: "Esta sala não está mais disponível." }, 404);
      } else {
        await db.prepare("INSERT INTO rooms (id,name,capacity,location,equipment,color) VALUES (?,?,?,?,?,?)").bind(id, name, capacity, clean(body.location, 100), clean(body.equipment, 300), color).run();
      }
      return json({ ok: true, id });
    }
    if (body.action === "archiveRoom") {
      const id = clean(body.id, 100);
      const now = new Date();
      const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(now);
      const time = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
      const result = await db.prepare("UPDATE rooms SET active=0 WHERE id=? AND active=1 AND NOT EXISTS (SELECT 1 FROM bookings WHERE room_id=? AND (date>? OR (date=? AND end>?)))").bind(id, id, date, date, time).run();
      if (!result.meta.changes) return json({ error: "A sala tem reservas futuras. Cancele ou transfira essas reservas antes de arquivar." }, 409);
      return json({ ok: true });
    }
    if (body.action === "deleteBooking") {
      const result = await db.prepare("DELETE FROM bookings WHERE id=? AND owner_id=?").bind(clean(body.id, 100), user.userId).run();
      if (!result.meta.changes) return json({ error: "Você só pode cancelar suas próprias reservas." }, 403);
      return json({ ok: true });
    }
    if (body.action !== "saveBooking") return json({ error: "Ação inválida." }, 400);
    const title = clean(body.title, 120), date = clean(body.date, 10), start = clean(body.start, 5), end = clean(body.end, 5);
    const parsed = new Date(`${date}T12:00:00Z`);
    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== date || !/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end) || start >= end) return json({ error: "Confira o título, a data e os horários. O término deve ser depois do início." }, 400);
    const roomId = clean(body.roomId, 100) || null;
    if (roomId && !await db.prepare("SELECT id FROM rooms WHERE id=? AND active=1").bind(roomId).first()) return json({ error: "Selecione uma sala disponível." }, 400);
    const kind = ["appointment", "meeting", "focus", "client", "online"].includes(String(body.kind)) ? body.kind : "appointment";
    let link: string;
    try { link = normalizeMeetingLink(clean(body.link, 500)); }
    catch { return json({ error: MEETING_LINK_ERROR }, 400); }
    const id = clean(body.id, 100) || crypto.randomUUID();
    const values = [title, date, start, end, roomId, kind, clean(body.description, 2000), clean(body.participants, 1000), link];
    if (body.id) {
      const result = await db.prepare("UPDATE bookings SET title=?,date=?,start=?,end=?,room_id=?,kind=?,description=?,participants=?,link=? WHERE id=? AND owner_id=?").bind(...values, id, user.userId).run();
      if (!result.meta.changes) return json({ error: "Você só pode editar suas próprias reservas." }, 403);
    } else {
      await db.batch([
        db.prepare("INSERT INTO bookings (title,date,start,end,room_id,kind,description,participants,link,id,owner_id,owner_name,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(...values, id, user.userId, user.displayName, Date.now()),
        db.prepare("UPDATE settings SET started=1 WHERE id='workspace'"),
      ]);
    }
    return json({ ok: true, id });
  } catch (error) {
    const message = String(error);
    if (message.includes("ROOM_CONFLICT")) return json({ error: "Esta sala já está reservada nesse horário. Escolha outro horário ou outra sala." }, 409);
    if (message.includes("ROOM_INACTIVE")) return json({ error: "Esta sala foi arquivada. Selecione outra sala." }, 409);
    if (error instanceof SyntaxError) return json({ error: "Dados inválidos." }, 400);
    console.error("Workspace mutation failed", error);
    return json({ error: "Não foi possível salvar. Tente novamente." }, 500);
  }
}
