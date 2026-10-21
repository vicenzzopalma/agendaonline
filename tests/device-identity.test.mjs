import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  createDeviceToken,
  readDeviceToken,
  hashDeviceToken,
  deviceCookie,
  deviceCookieName,
} from "../lib/device-identity.ts";

test("anonymous device tokens are random, opaque and stored as digests", async () => {
  const first = createDeviceToken(),
    second = createDeviceToken();
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, second);
  const hash = await hashDeviceToken(first);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.notEqual(hash, first);
  assert.equal(await hashDeviceToken(first), hash);
  assert.equal(readDeviceToken(`other=value; realess_device=${first}`), first);
  for (const value of [
    null,
    "",
    "realess_device=visitor_owner",
    `realess_device=${first}; realess_device=${second}`,
    "realess_device=bad\r\nadmin=true",
  ])
    assert.equal(readDeviceToken(value), null);
});

test("device cookie is HttpOnly, same-site and secure in production", () => {
  const cookie = deviceCookie(
    "https://agenda.example.test",
    createDeviceToken(),
  );
  assert.ok(cookie.includes("HttpOnly"));
  assert.ok(cookie.includes("SameSite=Lax"));
  assert.ok(cookie.includes("; Secure"));
  assert.ok(cookie.includes("Path=/"));
  assert.ok(cookie.startsWith("__Host-realess_device="));
  const secureName = deviceCookieName("https://agenda.example.test");
  assert.equal(
    readDeviceToken(`realess_device=${createDeviceToken()}`, secureName),
    null,
  );
  const hostToken = createDeviceToken();
  assert.equal(
    readDeviceToken(`__Host-realess_device=${hostToken}`, secureName),
    hostToken,
  );
  assert.ok(!cookie.includes("Domain="));
  assert.ok(
    !deviceCookie("http://127.0.0.1:5173", createDeviceToken()).includes(
      "; Secure",
    ),
  );
});

test("anonymous access migration preserves bookings, historical identity and audit", () => {
  const db = new DatabaseSync(":memory:");
  for (const filename of [
    "0000_plain_cassandra_nova.sql",
    "0001_whole_terror.sql",
  ])
    db.exec(
      readFileSync(new URL(`../drizzle/${filename}`, import.meta.url), "utf8"),
    );
  db.prepare(
    "INSERT INTO bookings(id,title,date,start,end,owner_id,owner_name,participants,link,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
  ).run(
    "old-real-booking",
    "Reunião preservada",
    "2026-10-22",
    "09:00",
    "10:00",
    "old-platform-owner",
    "Organizador antigo",
    "pessoa@example.test",
    "https://meet.google.com/abc-defg-hij",
    123,
  );
  const before = db.prepare("SELECT * FROM bookings").get();
  const historyBefore = db
    .prepare("SELECT COUNT(*) AS n FROM booking_history")
    .get().n;
  db.exec(
    readFileSync(
      new URL("../drizzle/0002_cheerful_sharon_carter.sql", import.meta.url),
      "utf8",
    ),
  );
  const after = db.prepare("SELECT * FROM bookings").get();
  for (const key of Object.keys(before))
    assert.equal(after[key], before[key], key);
  assert.equal(after.organizer_email, "");
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM booking_history").get().n,
    historyBefore,
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM agenda_visitors").get().n,
    0,
  );
  db.close();
});
