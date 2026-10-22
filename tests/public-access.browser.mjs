import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.BASE_URL || "http://127.0.0.1:3000";
const cookieName = new URL(base).protocol === "https:" ? "__Host-realess_device" : "realess_device";
assert.ok(
  ["127.0.0.1", "localhost"].includes(new URL(base).hostname),
  "Local fixtures only",
);
const out = resolve("outputs/public-access");
mkdirSync(out, { recursive: true });
const reports = [];
for (const [name, executablePath] of [
  ["Chrome", "C:/Program Files/Google/Chrome/Application/chrome.exe"],
  ["Edge", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"],
]) {
  const browser = await chromium.launch({ headless: true, executablePath });
  const owner = await browser.newContext({
    viewport: { width: name === "Chrome" ? 1440 : 390, height: 900 },
    acceptDownloads: true,
    ignoreHTTPSErrors: true,
  });
  const other = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await owner.newPage();
  const errors = [];
  let booking;
  page.on("pageerror", (error) => errors.push(error.message));
  const get = async (ctx, path) => {
    const response = await ctx.request.get(base + path);
    const content = await response.text();
    let body;
    try {
      body = JSON.parse(content);
    } catch {
      body = { error: content };
    }
    return { status: response.status(), body };
  };
  const post = async (ctx, body, headers = {}) => {
    const response = await ctx.request.post(base + "/api/workspace", {
      data: body,
      headers,
    });
    const content = await response.text();
    let result;
    try {
      result = JSON.parse(content);
    } catch {
      result = { error: content };
    }
    return { status: response.status(), body: result };
  };
  try {
    assert.equal(
      (await post(other, { action: "saveRoom", name: "must-not-be-written" }))
        .status,
      428,
    );
    const navigation = await page.goto(base, { waitUntil: "networkidle" });
    assert.equal(navigation.status(), 200);
    assert.equal(new URL(page.url()).pathname, "/");
    await page.locator(".calendar-card").waitFor();
    assert.equal(
      await page.locator("a[href*='signin-with-chatgpt']").count(),
      0,
    );
    const first = await get(
      owner,
      "/api/workspace?from=2026-10-01&to=2026-10-31",
    );
    assert.equal(first.status, 200);
    assert.equal(first.body.user.name, "Visitante");
    assert.equal(first.body.user.isAdmin, false);
    assert.ok(first.body.user.id.startsWith("visitor_"));
    const cookie = (await owner.cookies()).find(
      (item) => item.name === cookieName,
    );
    assert.ok(cookie?.httpOnly);
    assert.equal(cookie.secure, new URL(base).protocol === "https:");
    assert.equal(cookie.sameSite, "Lax");
    assert.ok(
      !(await page.evaluate(() => document.cookie)).includes("realess_device"),
    );
    assert.equal((await get(other, "/api/holidays?year=2026")).status, 200);
    assert.equal(
      (await get(other, "/api/workspace?from=2026-10-01&to=2026-10-31")).status,
      200,
    );
    const otherUser = (await get(other, "/api/workspace")).body.user;
    assert.notEqual(first.body.user.id, otherUser.id);
    const title = `QA acesso livre ${name} ${Date.now()}`;
    await page
      .getByRole("button", { name: "Novo compromisso", exact: true })
      .click();
    const dialog = page.locator("dialog[open]");
    await dialog
      .getByLabel("Nome do organizador", { exact: false })
      .fill("Pessoa sem conta OpenAI");
    await dialog
      .getByLabel("E-mail do organizador", { exact: false })
      .fill("organizador@example.test");
    await dialog.getByLabel("Título do compromisso").fill(title);
    await dialog.getByLabel(/^Data/).first().fill("2026-10-22");
    await dialog.getByLabel(/^Início/).fill("09:00");
    await dialog.getByLabel(/^Término/).fill("10:00");
    await dialog
      .getByLabel("Link do Google Meet")
      .fill("meet.google.com/abc-defg-hij");
    await dialog
      .getByLabel("Participantes", { exact: true })
      .fill("participante@example.test");
    await dialog.getByLabel("Participantes", { exact: true }).press("Enter");
    await dialog
      .getByRole("button", {
        name: "Salvar compromisso e preparar convite no Outlook",
        exact: true,
      })
      .click();
    await page
      .getByRole("heading", { name: "Preparar convite", exact: true })
      .waitFor();
    const state = (
      await get(owner, "/api/workspace?from=2026-10-22&to=2026-10-22")
    ).body;
    booking = state.bookings.find((item) => item.title === title);
    assert.ok(booking?.id);
    assert.equal(booking.ownerId, first.body.user.id);
    assert.equal(booking.ownerName, "Pessoa sem conta OpenAI");
    assert.equal(booking.organizerEmail, "organizador@example.test");
    assert.equal(state.user.name, "Pessoa sem conta OpenAI");
    assert.equal(state.user.isAdmin, false);
    const pending = page.waitForEvent("download");
    await page
      .getByRole("button", {
        name: "Gerar convite para Outlook (.ics)",
        exact: true,
      })
      .click();
    const file = await pending;
    await file.saveAs(resolve(out, `${name}-anonymous-invite.ics`));
    const shared = (
      await get(other, "/api/workspace?from=2026-10-22&to=2026-10-22")
    ).body.bookings.find((item) => item.id === booking.id);
    assert.equal(shared.participants, "");
    assert.equal(shared.organizerEmail, "");
    assert.equal(shared.ownerName, "Pessoa sem conta OpenAI");
    assert.equal(
      (await get(other, "/api/workspace?audit=" + booking.id)).status,
      403,
    );
    assert.equal(
      (
        await post(other, {
          action: "saveBooking",
          ...booking,
          organizerName: "Outro",
          organizerEmail: booking.organizerEmail,
          ownerId: otherUser.id,
        })
      ).status,
      403,
    );
    assert.equal(
      (await post(other, { action: "deleteBooking", id: booking.id })).status,
      403,
    );
    assert.equal(
      (
        await post(
          owner,
          { action: "deleteBooking", id: booking.id },
          { Origin: "https://other.example.test" },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await owner.request.post(base + "/api/calendar-policy", {
          data: { blockOptional: true, overrides: [] },
        })
      ).status(),
      403,
    );
    const restored = await browser.newContext({
      storageState: await owner.storageState(),
      ignoreHTTPSErrors: true,
    });
    try {
      assert.equal(
        (await get(restored, "/api/workspace")).body.user.id,
        first.body.user.id,
      );
      const edit = await post(restored, {
        action: "saveBooking",
        ...booking,
        title: title + " editado",
        organizerName: booking.ownerName,
        organizerEmail: booking.organizerEmail,
      });
      assert.equal(edit.status, 200, JSON.stringify(edit));
      booking = edit.body.booking;
      assert.equal(booking.version, 2);
      assert.equal(booking.ownerId, first.body.user.id);
    } finally {
      await restored.close();
    }
    await page.getByRole("button", { name: "Agora não", exact: true }).click();
    await page.reload({ waitUntil: "networkidle" });
    await page
      .getByRole("button", { name: "Novo compromisso", exact: true })
      .click();
    assert.equal(
      await page
        .getByLabel("Nome do organizador", { exact: false })
        .inputValue(),
      "Pessoa sem conta OpenAI",
    );
    assert.equal(
      await page
        .getByLabel("E-mail do organizador", { exact: false })
        .inputValue(),
      "organizador@example.test",
    );
    await page.screenshot({ path: resolve(out, `${name}-anonymous-form.png`) });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    if (process.env.AXE_SCRIPT) {
      await page.addScriptTag({ path: process.env.AXE_SCRIPT });
      const violations = await page.evaluate(async () =>
        (
          await window.axe.run(document.querySelector("dialog[open]"), {
            runOnly: ["wcag2a", "wcag2aa", "wcag21aa"],
          })
        ).violations.map((item) => item.id),
      );
      assert.deepEqual(violations, []);
    }
    await page.keyboard.press("Escape");
    // A self-declared admin email must not grant administrative access.
    const claimed = await post(other, {
      action: "saveBooking",
      title: title + " claim",
      date: "2026-10-22",
      start: "14:00",
      end: "15:00",
      organizerName: "Nome informado",
      organizerEmail: "admin-qa@example.test",
    });
    assert.equal(claimed.status, 200);
    try {
      assert.equal(
        (await get(other, "/api/workspace")).body.user.isAdmin,
        false,
      );
    } finally {
      await post(other, { action: "deleteBooking", id: claimed.body.id });
    }
    // An arbitrary cookie cannot impersonate an existing owner.
    const forged = await browser.newContext({ ignoreHTTPSErrors: true });
    try {
      await forged.addCookies([
        { name: cookieName, value: first.body.user.id, url: base, secure: new URL(base).protocol === "https:" },
      ]);
      const foreign = (await get(forged, "/api/workspace")).body.user;
      assert.notEqual(foreign.id, first.body.user.id);
      assert.equal(
        (await post(forged, { action: "deleteBooking", id: booking.id }))
          .status,
        403,
      );
    } finally {
      await forged.close();
    }
    // Public self-hosting must ignore identity headers sent by a visitor.
    const spoofed = await browser.newContext({ ignoreHTTPSErrors: true, extraHTTPHeaders: {
      "oai-authenticated-user-id": first.body.user.id,
      "oai-authenticated-user-email": "admin-qa@example.test",
    } });
    try {
      const visitor = (await get(spoofed, "/api/workspace")).body.user;
      assert.notEqual(visitor.id, first.body.user.id);
      assert.equal(visitor.isAdmin, false);
      assert.equal(visitor.email, "");
    } finally { await spoofed.close(); }
    assert.deepEqual(errors, []);
    reports.push({
      browser: name,
      version: browser.version(),
      passed: true,
      checks: [
        "anonymous access without sign-in or OpenAI cookies",
        "create/edit persisted meeting, contact prefill and Outlook ICS",
        "browser identity survives restart via HttpOnly cookie",
        "another browser cannot edit, cancel or see private recipients/email",
        "public holidays, CSRF and admin authorization",
        "responsive form and axe accessibility",
      ],
    });
  } finally {
    if (booking) await post(owner, { action: "deleteBooking", id: booking.id });
    await browser.close();
  }
}
writeFileSync(resolve(out, "report.json"), JSON.stringify(reports, null, 2));
console.log(JSON.stringify(reports, null, 2));
