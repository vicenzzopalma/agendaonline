import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  baseHolidays,
  easter,
  blockedHoliday,
  applyPolicy,
  mergeHolidays,
  parseCityCalendar,
  holidayMessage,
} from "../lib/holidays.ts";
import { workspaceSetupStatements } from "../lib/workspace-setup.ts";
import { normalizeSearch, overlaps } from "../lib/calendar.ts";
const oldSQL = readFileSync(
    new URL("../drizzle/0000_plain_cassandra_nova.sql", import.meta.url),
    "utf8",
  ),
  newSQL = ["0001_whole_terror.sql", "0002_cheerful_sharon_carter.sql", "0003_auth_and_creators.sql", "0004_account_access.sql"]
    .map((name) => readFileSync(new URL(`../drizzle/${name}`, import.meta.url), "utf8")).join("\n");
const setup = (db) => {
  for (const sql of workspaceSetupStatements) db.exec(sql);
};
test("Brazilian, Santa Catarina and Joinville dates distinguish official holidays from optional dates", () => {
  const days = baseHolidays(2026);
  assert.equal(easter(2026), "2026-04-05");
  assert.equal(blockedHoliday("2026-11-20", days).scope, "nacional");
  assert.equal(
    blockedHoliday("2026-03-09", days).name,
    "Aniversário de Joinville",
  );
  assert.equal(blockedHoliday("2026-04-03", days).scope, "municipal");
  assert.equal(blockedHoliday("2026-06-04", days).name, "Corpus Christi");
  assert.equal(blockedHoliday("2026-02-17", days), undefined);
  assert.equal(days.find((d) => d.date === "2026-02-17").kind, "optional");
  assert.equal(blockedHoliday("2026-08-11", days), undefined);
  assert.equal(blockedHoliday("2026-08-16", days).scope, "estadual");
  assert.equal(blockedHoliday("2026-11-29", days).scope, "estadual");
  assert.equal(
    baseHolidays(2023).some((d) => d.date === "2023-11-20"),
    false,
  );
  assert.equal(easter(2027), "2027-03-28");
});
test("policy blocks optional days only by choice, and records explicit allow/block exceptions", () => {
  const days = baseHolidays(2026);
  const policy = {
    blockOptional: true,
    overrides: [
      { date: "2026-03-09", allowBooking: true, note: "Exceção autorizada" },
      {
        date: "2026-10-23",
        allowBooking: false,
        note: "Fechamento da empresa",
      },
    ],
  };
  const result = applyPolicy(days, policy);
  assert.ok(blockedHoliday("2026-02-17", result));
  assert.equal(blockedHoliday("2026-03-09", result), undefined);
  assert.ok(blockedHoliday("2026-10-23", result));
  assert.equal(
    holidayMessage(blockedHoliday("2026-12-25", result)),
    "Não é possível agendar reuniões nesta data, pois é feriado: Natal.",
  );
});
test("official municipal HTML parser handles rowspans and rejects partial or changed pages", () => {
  const rows = baseHolidays(2026)
    .filter((d) => d.kind === "holiday" && d.scope !== "estadual")
    .map(
      (d) =>
        `<tr><td>${d.date.slice(8)}/${d.date.slice(5, 7)}</td><td>Feriado</td><td>${d.name}</td><td>Lei</td></tr>`,
    );
  rows.push(
    "<tr><td>Jun</td><td>05/06</td><td>Ponto Facultativo</td><td>Referente Corpus Christi</td><td>Decreto</td></tr>",
  );
  const city = parseCityCalendar(`<table>${rows.join("")}</table>`, 2026),
    merged = mergeHolidays(2026, city);
  assert.equal(merged.find((d) => d.date === "2026-06-05").kind, "optional");
  assert.equal(merged.filter((d) => d.date === "2026-03-09").length, 1);
  assert.ok(merged.some((d) => d.scope === "estadual"));
  assert.throws(
    () => parseCityCalendar("<html>Maintenance</html>", 2026),
    /incompleto/,
  );
});
test("schema upgrade preserves old rows and initializes their searchable audit once", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(oldSQL);
  db.exec(
    "INSERT INTO rooms(id,name,capacity)VALUES('a','Sala A',0);INSERT INTO bookings(id,title,date,start,end,room_id,owner_id,owner_name,created_at)VALUES('legacy','REUNIÃO FINANCEIRO','2025-10-15','09:00','10:00','a','user','Pessoa',123)",
  );
  db.exec(newSQL);
  setup(db);
  const row = db.prepare("SELECT * FROM bookings WHERE id='legacy'").get();
  assert.equal(row.title, "REUNIÃO FINANCEIRO");
  assert.equal(row.date, "2025-10-15");
  assert.equal(row.created_at, 123);
  assert.equal(row.updated_at, 123);
  assert.equal(row.status, "active");
  assert.ok(row.search_text.includes(normalizeSearch("Reunião Financeiro")));
  const count = db.prepare("SELECT COUNT(*) AS n FROM booking_history").get().n;
  setup(db);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM booking_history").get().n,
    count,
  );
  db.close();
});
test("cancelled records remain permanent, release their room, and keep previous versions", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(oldSQL);
  db.exec(newSQL);
  setup(db);
  db.exec(
    "INSERT INTO bookings(id,title,date,start,end,room_id,owner_id,owner_name,created_at,updated_at)VALUES('one','Original','2026-10-15','09:00','10:00','horizonte','user','Pessoa',1,1)",
  );
  assert.throws(
    () =>
      db.exec(
        "INSERT INTO bookings(id,title,date,start,end,room_id,owner_id,owner_name,created_at)VALUES('collision','Outra','2026-10-15','09:30','10:30','horizonte','user','Pessoa',1)",
      ),
    /ROOM_CONFLICT/,
  );
  db.exec(
    "INSERT INTO bookings(id,title,date,start,end,room_id,owner_id,owner_name,created_at)VALUES('other-room','Outra sala','2026-10-15','09:30','10:30','conexao','user','Pessoa',1)",
  );
  db.exec(
    "UPDATE bookings SET title='Alterado',updated_at=2,version=2 WHERE id='one';UPDATE bookings SET status='cancelled',cancelled_at=3,updated_at=3,version=3 WHERE id='one'",
  );
  db.exec(
    "INSERT INTO bookings(id,title,date,start,end,room_id,owner_id,owner_name,created_at)VALUES('released','Sala liberada','2026-10-15','09:00','10:00','horizonte','user','Pessoa',4)",
  );
  assert.equal(
    db.prepare("SELECT status FROM bookings WHERE id='one'").get().status,
    "cancelled",
  );
  assert.deepEqual(
    db
      .prepare(
        "SELECT action FROM booking_history WHERE booking_id='one' ORDER BY id",
      )
      .all()
      .map((r) => r.action),
    ["created", "updated", "cancelled"],
  );
  assert.equal(
    JSON.parse(
      db
        .prepare(
          "SELECT snapshot FROM booking_history WHERE booking_id='one' ORDER BY id LIMIT 1",
        )
        .get().snapshot,
    ).title,
    "Original",
  );
  assert.throws(
    () => db.exec("DELETE FROM bookings WHERE id='one'"),
    /HISTORY_PERMANENT/,
  );
  assert.throws(
    () => db.exec("DELETE FROM booking_history"),
    /HISTORY_PERMANENT/,
  );
  assert.equal(
    overlaps(
      {
        date: "2026-10-15",
        start: "09:00",
        end: "10:00",
        roomId: "a",
        status: "cancelled",
      },
      { date: "2026-10-15", start: "09:00", end: "10:00", roomId: "a" },
    ),
    false,
  );
  db.close();
});
test("records survive closing and reopening the persistent database across months and years", () => {
  const path = join(
    mkdtempSync(join(tmpdir(), "realess-history-")),
    "history.sqlite",
  );
  let db = new DatabaseSync(path);
  db.exec(oldSQL);
  db.exec(newSQL);
  setup(db);
  db.exec(
    "INSERT INTO bookings(id,title,date,start,end,owner_id,owner_name,created_at)VALUES('persist','Reunião Financeiro','2025-10-15','09:00','10:00','user','Pessoa',1)",
  );
  db.close();
  db = new DatabaseSync(path);
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM bookings WHERE date BETWEEN '2025-11-01' AND '2025-12-31'",
      )
      .get().n,
    0,
  );
  assert.equal(
    db
      .prepare(
        "SELECT title FROM bookings WHERE date BETWEEN '2025-10-01' AND '2025-10-31'",
      )
      .get().title,
    "Reunião Financeiro",
  );
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM bookings WHERE date BETWEEN '2026-01-01' AND '2026-12-31'",
      )
      .get().n,
    0,
  );
  assert.equal(
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM booking_history WHERE booking_id='persist'",
      )
      .get().n,
    1,
  );
  db.close();
});
