import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  normalizeRecipients,
  validEmail,
  invitationRecipients,
  visibleBooking,
  publicSearchSQL,
} from "../lib/recipients.ts";
import {
  createInvitationICS,
  invitationMessage,
  saoPauloInstant,
} from "../lib/invitations.ts";

const booking = {
  id: "real-persisted-id",
  title: "Reunião, orçamento; ação",
  date: "2026-10-22",
  start: "09:00",
  end: "10:30",
  roomId: "one",
  kind: "meeting",
  description: "Pauta:\nAção & revisão",
  participants: "ana@example.test, bruno@example.test",
  link: "https://meet.google.com/abc-defg-hij",
  ownerId: "owner",
  ownerName: "Organizador",
  createdAt: Date.parse("2026-10-21T12:00:00Z"),
  version: 1,
  status: "active",
};
const rooms = [{ id: "one", name: "Sala de reunião 1" }];
const organizer = { email: "organizador@example.test", name: "Organizador" };
const unfold = (value) => value.replace(/\r\n[ \t]/g, "");

test("recipients validate one/many, separators, deduplication, removal and preserved legacy records", () => {
  assert.equal(
    normalizeRecipients(
      "Ana@Example.test; bruno@example.test\nana@example.test, carol+equipe@example.test",
    ),
    "ana@example.test, bruno@example.test, carol+equipe@example.test",
  );
  assert.equal(normalizeRecipients("ana@example.test"), "ana@example.test");
  assert.equal(normalizeRecipients(""), "");
  for (const bad of [
    "nome",
    "a@localhost",
    "a..b@example.test",
    ".a@example.test",
    "a@-x.test",
    "a@x..test",
    "a@x.test\rBcc:other@x.test",
    "a @x.test",
    "Nome <a@x.test>",
  ]) {
    assert.equal(validEmail(bad), false, bad);
    assert.throws(() => normalizeRecipients(bad), /inválido/);
  }
  assert.throws(() => normalizeRecipients("a".repeat(1001)), /1.000/);
  assert.equal(
    normalizeRecipients("Pessoa antiga, ana@example.test", ["Pessoa antiga"]),
    "Pessoa antiga, ana@example.test",
  );
  assert.throws(
    () => normalizeRecipients("Pessoa nova", ["Pessoa antiga"]),
    /inválido/,
  );
  assert.deepEqual(
    invitationRecipients("ana@example.test, ANA@example.test, Pessoa antiga"),
    ["ana@example.test"],
  );
});

test("mail message includes saved event, Meet, room, dates, accents and full encoded body", () => {
  const msg = invitationMessage(booking, rooms);
  assert.equal(msg.recipients.length, 2);
  const url = new URL(msg.mailto);
  assert.equal(
    decodeURIComponent(url.pathname),
    "ana@example.test,bruno@example.test",
  );
  assert.equal(
    url.searchParams.get("subject"),
    "Convite de reunião — " + booking.title,
  );
  assert.equal(url.searchParams.get("body"), msg.body);
  assert.equal(msg.body.replace(/\r\n/g, "").includes("\n"), false);
  for (const expected of [
    "22/10/2026",
    "09:00 às 10:30",
    "São Paulo",
    rooms[0].name,
    booking.link,
    "Ação & revisão",
  ])
    assert.ok(msg.body.includes(expected), expected);
  const presencial = invitationMessage({ ...booking, link: "" }, rooms);
  assert.ok(!presencial.body.includes("Link da reunião"));
  assert.ok(presencial.body.includes("Sala de reunião 1"));
  const long = invitationMessage(
    { ...booking, description: "Ação ".repeat(350) },
    rooms,
  );
  assert.equal(long.longMailto, true);
  assert.ok(long.body.includes("Ação ".repeat(350)));
  assert.ok(!long.shortMailto.includes("body="));
  assert.equal(
    invitationMessage(
      { ...booking, status: "cancelled", version: 3 },
      rooms,
    ).subject.startsWith("Cancelamento"),
    true,
  );
  const withdrawal = invitationMessage(
    { ...booking, status: "cancelled", version: 2 },
    rooms,
    true,
  );
  assert.ok(withdrawal.subject.startsWith("Cancelamento de participação"));
  assert.ok(
    withdrawal.body.includes(
      "A reunião continua agendada para os demais participantes.",
    ),
  );
});

test("RFC5545 invitations retain UID and advance sequence for update/cancel with UTC, organizer and attendees", () => {
  const initial = createInvitationICS(booking, rooms, organizer);
  const update = createInvitationICS(
    { ...booking, version: 2, start: "11:00", end: "12:00" },
    rooms,
    organizer,
  );
  const cancel = createInvitationICS(
    { ...booking, version: 3, status: "cancelled" },
    rooms,
    organizer,
  );
  for (const [content, sequence] of [
    [initial, 0],
    [update, 1],
    [cancel, 2],
  ]) {
    const text = unfold(content);
    assert.ok(text.includes("UID:real-persisted-id@agenda.realess\r\n"));
    assert.ok(text.includes(`SEQUENCE:${sequence}\r\n`));
    assert.ok(text.includes("ORGANIZER:mailto:organizador@example.test"));
    assert.ok(text.includes("mailto:ana@example.test"));
    assert.ok(text.includes("mailto:bruno@example.test"));
    assert.ok(text.includes("LOCATION:Sala de reunião 1"));
    assert.ok(text.includes("URL:" + booking.link));
    assert.ok(text.includes("SUMMARY:Reunião\\, orçamento\\; ação"));
    assert.ok(text.includes("DESCRIPTION:Pauta:\\nAção & revisão\\n\\n"));
    assert.ok(content.endsWith("END:VCALENDAR\r\n"));
    assert.ok(
      content
        .split("\r\n")
        .every((line) => Buffer.byteLength(line, "utf8") <= 75),
    );
    assert.equal(content.replace(/\r\n/g, "").includes("\n"), false);
  }
  assert.ok(initial.includes("METHOD:REQUEST\r\n"));
  assert.ok(initial.includes("DTSTART:20261022T120000Z\r\n"));
  assert.ok(initial.includes("DTEND:20261022T133000Z\r\n"));
  assert.ok(update.includes("DTSTART:20261022T140000Z\r\n"));
  assert.ok(cancel.includes("METHOD:CANCEL\r\n"));
  assert.ok(cancel.includes("STATUS:CANCELLED\r\n"));
  assert.ok(!cancel.includes("RSVP=TRUE"));
  assert.equal(
    saoPauloInstant("2018-12-10", "09:00").toISOString(),
    "2018-12-10T11:00:00.000Z",
  );
});

test("calendar serialization prevents header injection and rejects unresolved legacy recipients", () => {
  assert.ok(
    !invitationMessage(
      { ...booking, link: "javascript:alert(1)" },
      rooms,
    ).body.includes("javascript:"),
  );
  assert.throws(
    () =>
      createInvitationICS(
        { ...booking, link: "javascript:alert(1)" },
        rooms,
        organizer,
      ),
    /válido/,
  );
  const content = unfold(
    createInvitationICS(
      {
        ...booking,
        title: "Teste\r\nATTENDEE:mailto:attacker@example.test",
        description: "Linha\rOutra linha\n" + "Ação ".repeat(100),
      },
      rooms,
      organizer,
    ),
  );
  assert.ok(
    content.includes(
      "SUMMARY:Teste\\nATTENDEE:mailto:attacker@example.test\r\n",
    ),
  );
  assert.equal(
    content.split("\r\n").filter((line) => line.startsWith("ATTENDEE")).length,
    2,
  );
  assert.throws(
    () =>
      createInvitationICS(booking, rooms, { email: "bad\r\nheader", name: "" }),
    /válido/,
  );
  assert.throws(
    () =>
      createInvitationICS(
        { ...booking, participants: "Pessoa antiga, ana@example.test" },
        rooms,
        organizer,
      ),
    /Substitua/,
  );
  assert.throws(
    () =>
      createInvitationICS({ ...booking, participants: "" }, rooms, organizer),
    /participante/,
  );
});

test("nonowners receive no participants and searches cannot infer other participants", () => {
  assert.equal(
    visibleBooking(booking, "owner").participants,
    booking.participants,
  );
  assert.equal(visibleBooking(booking, "other").participants, "");
  assert.equal(visibleBooking(booking, "other").participantsRestricted, true);
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE bookings(title TEXT, owner_name TEXT, owner_id TEXT, search_text TEXT)",
  );
  db.prepare("INSERT INTO bookings VALUES(?,?,?,?)").run(
    "REUNIÃO Orçamento",
    "Álvaro",
    "owner",
    "reuniao orcamento alvaro ana@example.test",
  );
  const query = db.prepare(
    `SELECT * FROM bookings WHERE instr(${publicSearchSQL()},?)>0 OR (owner_id=? AND instr(search_text,?)>0)`,
  );
  assert.equal(
    query.all("ana@example.test", "other", "ana@example.test").length,
    0,
  );
  assert.equal(
    query.all("ana@example.test", "owner", "ana@example.test").length,
    1,
  );
  assert.equal(query.all("reuniao", "other", "reuniao").length, 1);
  assert.equal(query.all("alvaro", "other", "alvaro").length, 1);
  db.close();
});
