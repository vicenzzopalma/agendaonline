import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { normalizeSearch } from "../lib/calendar.ts";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.BASE_URL || "http://127.0.0.1:5173";
assert.ok(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Local QA only",
);
const out = resolve("outputs/invitations");
mkdirSync(out, { recursive: true });
const reports = [];
const paths = [
  [
    "Chrome",
    process.env.CHROME_PATH ||
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
  ],
  [
    "Edge",
    process.env.EDGE_PATH ||
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ],
];
const dbDir = resolve(".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
const dbFile = readdirSync(dbDir).find(
  (name) => name.endsWith(".sqlite") && name !== "metadata.sqlite",
);
assert.ok(dbFile);
const database = new DatabaseSync(resolve(dbDir, dbFile));
database.exec("PRAGMA busy_timeout=10000");

for (const [name, executablePath] of paths) {
  const browser = await chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext({
    viewport: { width: name === "Chrome" ? 1440 : 390, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
    acceptDownloads: true,
  });
  const page = await context.newPage(),
    errors = [],
    created = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const prefix = `QA convite ${name} ${Date.now()}`;
  async function request(path, body) {
    const response = body
      ? await context.request.post(base + path, { data: body })
      : await context.request.get(base + path);
    return { status: response.status(), body: await response.json() };
  }
  async function post(body) {
    return request("/api/workspace", body);
  }
  async function openRow(title) {
    await page.getByRole("button", { name: "Lista", exact: true }).click();
    await page.locator(".agenda-row").filter({ hasText: title }).click();
    await page.getByRole("heading", { name: title, exact: true }).waitFor();
  }
  async function downloadICS(filename) {
    const pending = page.waitForEvent("download");
    await page
      .getByRole("button", {
        name: "Gerar convite para Outlook (.ics)",
        exact: true,
      })
      .click();
    const file = await pending;
    await file.saveAs(resolve(out, filename));
    return readFileSync(resolve(out, filename), "utf8").replace(
      /\r\n[ \t]/g,
      "",
    );
  }
  try {
    await page.goto(base + "/signin-with-chatgpt?return_to=%2F", {
      waitUntil: "networkidle",
    });
    await page.locator(".calendar-card").waitFor();
    const original = await request(
      "/api/workspace?from=2026-10-01&to=2026-10-31",
    );
    assert.equal(original.status, 200, JSON.stringify(original));
    const user = original.body.user;
    // No OS email client is launched by browser QA: intercept only the user's
    // explicit mailto click, preserving the exact intended handoff URI.
    await page.addInitScript(() => {
      window.__mailHandoffs = [];
      document.addEventListener(
        "click",
        (event) => {
          const anchor = event.target.closest?.("a[href^='mailto:']");
          if (anchor) {
            window.__mailHandoffs.push(anchor.href);
            event.preventDefault();
          }
        },
        true,
      );
    });
    await page.reload({ waitUntil: "networkidle" });
    await page
      .getByRole("button", { name: "Novo compromisso", exact: true })
      .click();
    let dialog = page.locator("dialog[open]");
    await dialog.getByLabel("Título do compromisso").fill(prefix);
    await dialog.getByLabel(/^Data/).fill("2026-10-22");
    await dialog.getByLabel(/^Início/).fill("09:00");
    await dialog.getByLabel(/^Término/).fill("10:30");
    await dialog
      .getByLabel("Link do Google Meet")
      .fill("meet.google.com/abc-defg-hij");
    const input = dialog.getByLabel("Participantes", { exact: true });
    await input.fill("invalido");
    await input.press("Enter");
    await dialog.getByText(/E-mail inválido: invalido/).waitFor();
    assert.equal(await dialog.locator(".recipient-chips li").count(), 0);
    await input.fill("ANA@example.test");
    await input.press("Enter");
    assert.equal(await dialog.locator(".recipient-chips li").count(), 1);
    await input.fill("bruno@example.test; ana@example.test");
    await input.press("Enter");
    assert.equal(await dialog.locator(".recipient-chips li").count(), 2);
    await dialog
      .getByRole("button", { name: "Editar bruno@example.test", exact: true })
      .click();
    assert.equal(await input.inputValue(), "bruno@example.test");
    await input.fill("carol@example.test");
    await input.press("Enter");
    await dialog
      .getByRole("button", { name: "Remover carol@example.test", exact: true })
      .click();
    assert.equal(await dialog.locator(".recipient-chips li").count(), 1);
    // Cover real paste with semicolons, newline and duplicate addresses.
    await input.evaluate((element) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData(
        "text/plain",
        "bruno@example.test; carol@example.test\nANA@example.test",
      );
      element.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    assert.equal(await dialog.locator(".recipient-chips li").count(), 3);
    await dialog
      .getByLabel("Descrição", { exact: false })
      .fill("Alinhamento da equipe e orçamento.");
    await dialog
      .getByRole("button", {
        name: "Salvar compromisso e preparar convite no Outlook",
        exact: true,
      })
      .click();
    await page
      .getByRole("heading", { name: "Preparar convite", exact: true })
      .waitFor();
    const state = await request("/api/workspace?from=2026-10-22&to=2026-10-22");
    const saved = state.body.bookings.find((item) => item.title === prefix);
    assert.ok(saved?.id);
    created.push(saved.id);
    assert.equal(
      saved.participants,
      "ana@example.test, bruno@example.test, carol@example.test",
    );
    assert.equal(saved.link, "https://meet.google.com/abc-defg-hij");
    assert.equal(saved.version, 1);
    assert.deepEqual(
      await page.evaluate(() => window.__mailHandoffs),
      [],
      "Save must not launch email client",
    );
    const mail = page.getByRole("link", {
      name: "Abrir no aplicativo de e-mail",
      exact: true,
    });
    const href = await mail.getAttribute("href"),
      mailURL = new URL(href);
    assert.ok(mailURL.searchParams.get("body").includes(saved.link));
    assert.ok(mailURL.searchParams.get("body").includes("22/10/2026"));
    await mail.click();
    assert.equal((await page.evaluate(() => window.__mailHandoffs)).length, 1);
    const initialICS = await downloadICS(`${name.toLowerCase()}-request.ics`);
    assert.ok(initialICS.includes(`UID:${saved.id}@agenda.realess`));
    assert.ok(initialICS.includes("METHOD:REQUEST\r\n"));
    assert.ok(initialICS.includes("DTSTART:20261022T120000Z"));
    assert.ok(initialICS.includes(`ORGANIZER:mailto:${user.email}`));
    if (process.env.AXE_SCRIPT) {
      await page.addScriptTag({ path: process.env.AXE_SCRIPT });
      const axe = await page.evaluate(
        async () =>
          (
            await window.axe.run(document.querySelector("dialog[open]"), {
              runOnly: ["wcag2a", "wcag2aa", "wcag21aa"],
            })
          ).violations,
      );
      assert.deepEqual(
        axe.map((violation) => ({
          id: violation.id,
          nodes: violation.nodes.map((node) => node.target),
        })),
        [],
      );
    }
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page.screenshot({
      path: resolve(out, `${name.toLowerCase()}-invitation.png`),
    });
    await page.getByRole("button", { name: "Agora não", exact: true }).click();
    await openRow(prefix);
    assert.equal(
      await page
        .getByRole("link", { name: "Entrar no Meet", exact: true })
        .getAttribute("href"),
      saved.link,
    );
    await page
      .getByRole("button", { name: "Editar compromisso", exact: true })
      .click();
    dialog = page.locator("dialog[open]");
    assert.equal(await dialog.locator(".recipient-chips li").count(), 3);
    await dialog
      .getByRole("button", { name: "Remover carol@example.test", exact: true })
      .click();
    await dialog.getByLabel(/^Início/).fill("11:00");
    await dialog.getByLabel(/^Término/).fill("12:00");
    await dialog
      .getByRole("button", {
        name: "Salvar alterações e preparar convite no Outlook",
        exact: true,
      })
      .click();
    await page
      .getByRole("heading", { name: "Preparar atualização", exact: true })
      .waitFor();
    const updateICS = await downloadICS(`${name.toLowerCase()}-update.ics`);
    assert.ok(updateICS.includes(`UID:${saved.id}@agenda.realess`));
    assert.ok(updateICS.includes("SEQUENCE:1\r\n"));
    assert.ok(updateICS.includes("DTSTART:20261022T140000Z"));
    assert.ok(!updateICS.includes("carol@example.test"));
    await page
      .getByRole("button", {
        name: "Avisar participantes removidos",
        exact: true,
      })
      .click();
    await page
      .getByRole("heading", {
        name: "Avisar participantes removidos",
        exact: true,
      })
      .waitFor();
    const withdrawalICS = await downloadICS(
      `${name.toLowerCase()}-withdrawal.ics`,
    );
    assert.ok(withdrawalICS.includes(`UID:${saved.id}@agenda.realess`));
    assert.ok(withdrawalICS.includes("SEQUENCE:1\r\n"));
    assert.ok(withdrawalICS.includes("METHOD:CANCEL\r\n"));
    assert.ok(withdrawalICS.includes("mailto:carol@example.test"));
    assert.ok(!withdrawalICS.includes("mailto:ana@example.test"));
    await page
      .getByText("A reunião continua agendada para os demais participantes.", {
        exact: false,
      })
      .waitFor();
    await page.getByRole("button", { name: "Agora não", exact: true }).click();
    await openRow(prefix);
    await page
      .getByRole("button", { name: "Cancelar compromisso", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirmar cancelamento", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Preparar cancelamento", exact: true })
      .waitFor();
    const cancelICS = await downloadICS(`${name.toLowerCase()}-cancel.ics`);
    assert.ok(cancelICS.includes("METHOD:CANCEL\r\n"));
    assert.ok(cancelICS.includes("STATUS:CANCELLED\r\n"));
    assert.ok(cancelICS.includes("SEQUENCE:2\r\n"));
    assert.ok(cancelICS.includes(`UID:${saved.id}@agenda.realess`));
    await page.getByRole("button", { name: "Agora não", exact: true }).click();
    const history = await request(
      "/api/workspace?mode=history&q=" + encodeURIComponent(prefix),
    );
    assert.equal(history.body.bookings[0].status, "cancelled");
    assert.equal(
      history.body.bookings[0].participants,
      "ana@example.test, bruno@example.test",
    );
    const audit = await request("/api/workspace?audit=" + saved.id);
    assert.equal(audit.status, 200);
    assert.equal(audit.body.history.length, 3);
    const invalid = await post({
      action: "saveBooking",
      title: prefix + " inválido",
      date: "2026-10-22",
      start: "13:00",
      end: "14:00",
      participants: "invalido",
    });
    assert.equal(invalid.status, 400);
    const presencial = await post({
      action: "saveBooking",
      title: prefix + " presencial",
      date: "2026-10-22",
      start: "21:00",
      end: "22:00",
      roomId: "horizonte",
      participants: "pessoa@example.test; PESSOA@example.test",
      link: "",
    });
    assert.equal(presencial.status, 200, JSON.stringify(presencial));
    created.push(presencial.body.id);
    assert.equal(presencial.body.booking.participants, "pessoa@example.test");
    assert.equal(presencial.body.booking.link, "");
    const longEvent = await post({
      action: "saveBooking",
      ...presencial.body.booking,
      description: "Ação, orçamento e alinhamento. ".repeat(55),
    });
    assert.equal(longEvent.status, 200);
    await page.reload({ waitUntil: "networkidle" });
    await openRow(prefix + " presencial");
    await page
      .getByRole("button", {
        name: "Preparar atualização do convite",
        exact: true,
      })
      .click();
    const fallback = page.getByRole("link", {
      name: "Abrir e-mail e colar o texto",
      exact: true,
    });
    assert.ok(!(await fallback.getAttribute("href")).includes("body="));
    assert.ok(
      (await page.locator(".invitation-preview pre").textContent()).includes(
        longEvent.body.booking.description,
      ),
    );
    await page
      .getByRole("button", { name: "Copiar texto completo", exact: true })
      .click();
    assert.ok(
      (await page.evaluate(() => navigator.clipboard.readText())).includes(
        longEvent.body.booking.description,
      ),
    );
    await page.getByRole("button", { name: "Agora não", exact: true }).click();
    const removedAll = await post({
      action: "saveBooking",
      ...longEvent.body.booking,
      participants: "",
    });
    assert.equal(removedAll.status, 200);
    assert.equal(removedAll.body.booking.status, "active");
    assert.equal(removedAll.body.booking.participants, "");
    assert.equal(removedAll.body.removedInvitation.status, "cancelled");
    assert.equal(removedAll.body.removedInvitation.id, presencial.body.id);
    assert.equal(
      removedAll.body.removedInvitation.participants,
      "pessoa@example.test",
    );
    // Existing name-only records remain editable and are not silently erased.
    const legacyId = `qa-legacy-${name}-${Date.now()}`;
    database
      .prepare(
        "INSERT INTO bookings(id,title,date,start,end,participants,owner_id,owner_name,created_at,updated_at,search_text) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        legacyId,
        prefix + " legado",
        "2026-10-22",
        "15:00",
        "16:00",
        "Pessoa antiga, ana@example.test",
        user.id,
        user.name,
        Date.now(),
        Date.now(),
        normalizeSearch(prefix + " legado Pessoa antiga ana@example.test"),
      );
    created.push(legacyId);
    const legacy = (
      await request("/api/workspace?from=2026-10-22&to=2026-10-22")
    ).body.bookings.find((item) => item.id === legacyId);
    const preserved = await post({
      action: "saveBooking",
      ...legacy,
      description: "Atualização sem apagar nomes antigos.",
    });
    assert.equal(preserved.status, 200);
    assert.equal(
      preserved.body.booking.participants,
      "Pessoa antiga, ana@example.test",
    );
    const invalidLegacy = await post({
      action: "saveBooking",
      ...preserved.body.booking,
      participants: "Pessoa nova",
    });
    assert.equal(invalidLegacy.status, 400);
    // A private, other-owner fixture is created in the LOCAL database only.
    const foreignId = `qa-private-${name}-${Date.now()}`;
    const foreignTitle = prefix + " privacidade";
    database
      .prepare(
        "INSERT INTO bookings(id,title,date,start,end,participants,owner_id,owner_name,created_at,updated_at,search_text) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        foreignId,
        foreignTitle,
        "2026-10-22",
        "15:00",
        "16:00",
        "private-secret@example.test",
        "other-qa-owner",
        "Outro organizador QA",
        Date.now(),
        Date.now(),
        normalizeSearch(
          foreignTitle + " Outro organizador QA private-secret@example.test",
        ),
      );
    try {
      const shared = await request(
        "/api/workspace?from=2026-10-22&to=2026-10-22",
      );
      const foreign = shared.body.bookings.find(
        (item) => item.id === foreignId,
      );
      assert.equal(foreign.participants, "");
      assert.equal(foreign.participantsRestricted, true);
      const sharedHistory = await request(
        "/api/workspace?mode=history&q=" + encodeURIComponent(foreignTitle),
      );
      assert.equal(
        sharedHistory.body.bookings.find((item) => item.id === foreignId)
          .participants,
        "",
      );
      const oracle = await request(
        "/api/workspace?mode=history&q=private-secret%40example.test",
      );
      assert.equal(oracle.body.total, 0);
      assert.equal(
        (await request("/api/workspace?audit=" + foreignId)).status,
        403,
      );
      assert.equal(
        (await post({ action: "deleteBooking", id: foreignId })).status,
        403,
      );
      assert.equal(
        (
          await post({
            action: "saveBooking",
            ...foreign,
            participants: "changed@example.test",
          })
        ).status,
        403,
      );
    } finally {
      database
        .prepare(
          "UPDATE bookings SET status='cancelled',cancelled_at=?,updated_at=?,version=version+1 WHERE id=?",
        )
        .run(Date.now(), Date.now(), foreignId);
    }
    assert.deepEqual(errors, []);
    reports.push({
      browser: name,
      version: browser.version(),
      width: name === "Chrome" ? 1440 : 390,
      passed: true,
      checks: [
        "recipient validation, separators, paste, duplicate/edit/remove",
        "real database create/edit/cancel + audit",
        "Meet and presencial with single recipient",
        "explicit mailto handoff intercepted without opening email app",
        "ICS request/update/cancel stable UID and sequence",
        "separate withdrawal notice for removed recipients, including removal of all participants",
        "long mailto fallback and complete clipboard body",
        "legacy name-only participants preserved by server",
        "privacy in list, search, audit and mutations",
        "responsive invitation and axe accessibility",
      ],
    });
  } finally {
    for (const id of created) {
      const state = await request(
        "/api/workspace?mode=history&q=" + encodeURIComponent(prefix),
      );
      const event = state.body.bookings?.find((item) => item.id === id);
      if (event && event.status !== "cancelled")
        await post({ action: "deleteBooking", id, version: event.version });
    }
    await browser.close();
  }
}
database.close();
writeFileSync(resolve(out, "report.json"), JSON.stringify(reports, null, 2));
console.log(JSON.stringify(reports, null, 2));
