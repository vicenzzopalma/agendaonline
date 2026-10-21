import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.BASE_URL || "http://127.0.0.1:5173";
assert.ok(
  ["localhost", "127.0.0.1"].includes(new URL(base).hostname),
  "Local integration tests only",
);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH }
    : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const output = resolve("outputs/calendar-history");
mkdirSync(output, { recursive: true });
const request = (path, body) =>
  page.evaluate(
    async ({ path, body }) => {
      const response = await fetch(
        path,
        body
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          : undefined,
      );
      return { status: response.status, body: await response.json() };
    },
    { path, body },
  );
const post = (body) => request("/api/workspace", body);
const filename = resolve(output, "restart-records.json");
const mode = process.env.HISTORY_TEST_PHASE || "prepare";
try {
  await page.goto(base + "/signin-with-chatgpt?return_to=%2F", {
    waitUntil: "networkidle",
  });
  await page.locator(".calendar-card").waitFor();
  const holiday = await request("/api/holidays?year=2026");
  assert.equal(holiday.status, 200, JSON.stringify(holiday));
  assert.ok(
    holiday.body.holidays.some(
      (item) => item.date === "2026-03-09" && item.blocked,
    ),
  );
  assert.ok(
    holiday.body.holidays.some(
      (item) => item.date === "2026-08-16" && item.scope === "estadual",
    ),
  );
  if (mode === "verify") {
    const state = JSON.parse(readFileSync(filename, "utf8"));
    const found = await request(
      "/api/workspace?mode=history&q=" + encodeURIComponent(state.prefix),
    );
    assert.equal(found.status, 200);
    assert.ok(
      found.body.bookings.some(
        (item) => item.id === state.persistId && item.date === "2025-10-15",
      ),
    );
    assert.equal(
      found.body.user.isAdmin,
      false,
      "Restart without local admin env must remove administrative permission",
    );
    assert.equal(
      (
        await request("/api/calendar-policy", {
          blockOptional: false,
          overrides: [],
        })
      ).status,
      403,
    );
    const persisted = found.body.bookings.find(
      (item) => item.id === state.persistId,
    );
    const edited = {
      action: "saveBooking",
      ...persisted,
      title: state.prefix + " Reunião Financeiro atualizada",
    };
    assert.equal((await post(edited)).status, 200);
    assert.equal(
      (await post(edited)).status,
      409,
      "A stale version must not overwrite a newer edit",
    );
    for (const event of found.body.bookings.filter(
      (item) => item.status !== "cancelled",
    ))
      assert.equal(
        (
          await post({
            action: "deleteBooking",
            id: event.id,
          })
        ).status,
        200,
      );
    assert.equal(
      (
        await request(
          "/api/workspace?mode=history&q=" +
            encodeURIComponent(state.prefix) +
            "&status=cancelled",
        )
      ).body.total,
      found.body.total,
    );
    writeFileSync(
      resolve(output, "restart-verified.json"),
      JSON.stringify(
        {
          passed: true,
          recordId: state.persistId,
          persistenceAfterWorkerRestart: true,
          adminAuthorization: true,
          browserErrors: errors,
        },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify({
        passed: true,
        phase: mode,
        persistenceAfterWorkerRestart: true,
      }),
    );
  } else {
    assert.equal(
      holiday.body.isAdmin,
      true,
      "Start local preview with AGENDA_ADMIN_EMAILS=seedy@sites.test",
    );
    const previous = await request(
      "/api/workspace?mode=history&q=QA&status=active",
    );
    for (const event of previous.body.bookings.filter((item) =>
      /^QA\d{13} /.test(item.title),
    ))
      await post({ action: "deleteBooking", id: event.id });
    const prefix = "QA" + Date.now(),
      ids = [];
    const create = async (overrides = {}) => {
      const result = await post({
        action: "saveBooking",
        title: prefix + " Reunião Financeiro",
        date: "2026-10-15",
        start: "09:00",
        end: "10:00",
        roomId: "horizonte",
        kind: "meeting",
        description: "Pauta original para teste local.",
        participants: "pessoa@example.test",
        link: "https://meet.google.com/abc-defg-hij",
        ...overrides,
      });
      if (result.status === 200) ids.push(result.body.id);
      return result;
    };
    assert.equal((await create({ date: "2026-03-09" })).status, 409);
    assert.equal((await create({ date: "2026-11-20" })).status, 409);
    assert.equal((await create({ date: "2026-08-16" })).status, 409);
    const first = await create();
    assert.equal(first.status, 200, JSON.stringify(first));
    assert.equal((await create({ start: "09:30", end: "10:30" })).status, 409);
    const other = await create({
      roomId: "conexao",
      start: "09:30",
      end: "10:30",
    });
    assert.equal(other.status, 200);
    assert.equal(
      (
        await post({
          action: "saveBooking",
          id: other.body.id,
          title: prefix + " Outra sala",
          date: "2026-10-15",
          start: "09:30",
          end: "10:30",
          roomId: "horizonte",
          kind: "meeting",
        })
      ).status,
      409,
    );
    assert.equal((await create({ start: "10:00", end: "11:00" })).status, 200);
    const past = await create({ date: "2025-10-15", roomId: "" });
    assert.equal(past.status, 200);
    const carnaval = await create({ date: "2026-02-17", roomId: "" });
    assert.equal(
      carnaval.status,
      200,
      "Optional carnival day is available by default",
    );
    let policy = await request("/api/calendar-policy", {
      blockOptional: true,
      overrides: [],
    });
    assert.equal(policy.status, 200);
    assert.equal(
      (await create({ date: "2026-02-17", roomId: "" })).status,
      409,
    );
    policy = await request("/api/calendar-policy", {
      blockOptional: false,
      overrides: [
        {
          date: "2026-03-09",
          allowBooking: true,
          note: "Exceção autorizada para teste local",
        },
      ],
    });
    assert.equal(policy.status, 200);
    assert.equal(
      (await create({ date: "2026-03-09", roomId: "" })).status,
      200,
    );
    assert.equal(
      (
        await request("/api/calendar-policy", {
          blockOptional: false,
          overrides: [],
        })
      ).status,
      200,
    );
    const cancel = await post({ action: "deleteBooking", id: first.body.id });
    assert.equal(cancel.status, 200);
    assert.equal(
      (await create()).status,
      200,
      "Cancelled reservation must release its room",
    );
    const audit = await request("/api/workspace?audit=" + first.body.id);
    assert.equal(audit.status, 200);
    assert.ok(audit.body.history.some((item) => item.action === "cancelled"));
    const old = await request("/api/workspace?from=2025-10-01&to=2025-10-31");
    assert.ok(old.body.bookings.some((item) => item.id === past.body.id));
    await page.getByRole("button", { name: "Mês", exact: true }).click();
    await page.getByLabel("Selecionar mês e ano").fill("2026-03");
    await page.locator('.month-day-number[data-date="2026-03-09"]').click();
    await page
      .getByRole("region", { name: "Compromissos do dia selecionado" })
      .getByText("Aniversário de Joinville", { exact: false })
      .first()
      .waitFor();
    assert.equal(
      await page
        .getByRole("region", { name: "Compromissos do dia selecionado" })
        .getByRole("button", { name: "Adicionar compromisso", exact: true })
        .isDisabled(),
      true,
    );
    await page.getByLabel("Selecionar mês e ano").fill("2026-10");
    await page
      .getByRole("button", { name: "Novo compromisso", exact: true })
      .click();
    const dialog = page.locator("dialog[open]");
    await dialog
      .getByLabel("Título do compromisso")
      .fill("Teste de data bloqueada");
    await dialog
      .getByLabel("Data", { exact: false })
      .first()
      .fill("2026-11-20");
    await dialog
      .getByRole("alert")
      .filter({ hasText: "Não é possível agendar reuniões" })
      .waitFor();
    assert.equal(
      await dialog
        .getByRole("button", { name: "Salvar compromisso", exact: true })
        .isDisabled(),
      true,
    );
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Histórico", exact: true }).click();
    await page.getByLabel("Título, responsável ou participante").fill(prefix);
    await page.locator(".history-result").first().waitFor();
    await page.getByLabel("De", { exact: true }).fill("2025-10-01");
    await page.getByLabel("Até", { exact: true }).fill("2025-10-31");
    await page.waitForFunction(
      () => document.querySelectorAll(".history-result").length === 1,
    );
    await page.locator(".history-result").click();
    await page.locator("dialog[open]").waitFor();
    await page.keyboard.press("Escape");
    assert.equal(
      await page.getByLabel("Selecionar mês e ano").inputValue(),
      "2025-10",
    );
    for (const value of ["2026-11", "2027-02", "2025-10"]) {
      await page.getByLabel("Selecionar mês e ano").fill(value);
      await page.locator(".month-calendar").waitFor();
    }
    await page.locator('.month-day-number[data-date="2025-10-15"]').click();
    await page
      .locator(".selected-day-event")
      .filter({ hasText: prefix })
      .waitFor();
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Mês", exact: true }).click();
    await page.getByLabel("Selecionar mês e ano").fill("2025-10");
    await page.locator('.month-day-number[data-date="2025-10-15"]').click();
    await page
      .locator(".selected-day-event")
      .filter({ hasText: prefix })
      .waitFor();
    assert.ok(
      await page
        .locator(".brand-logo")
        .evaluate((image) => image.naturalWidth >= 1000),
    );
    for (const width of [320, 375, 390, 430, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const shape = await page.evaluate(() => ({
        width: innerWidth,
        page: document.documentElement.scrollWidth,
        columns: getComputedStyle(
          document.querySelector(".month-calendar"),
        ).gridTemplateColumns.split(" ").length,
      }));
      assert.ok(shape.page <= shape.width + 1, JSON.stringify(shape));
      assert.equal(shape.columns, 7);
      await page
        .locator(".month-calendar")
        .screenshot({ path: resolve(output, `calendar-${width}.png`) });
    }
    const unsigned = await browser.newContext();
    assert.equal(
      (await unsigned.request.get(base + "/api/workspace")).status(),
      401,
    );
    await unsigned.close();
    assert.deepEqual(errors, []);
    writeFileSync(
      filename,
      JSON.stringify({ prefix, ids, persistId: past.body.id }, null, 2),
    );
    writeFileSync(
      resolve(output, "integration-results.json"),
      JSON.stringify(
        {
          passed: true,
          holidaySourceState: holiday.body.state,
          holidayCount: holiday.body.holidays.length,
          browserErrors: errors,
          checks: [
            "server holiday rejection",
            "optional policy",
            "authorized exception",
            "same-room collision on create/edit",
            "simultaneous different rooms",
            "back-to-back",
            "logical cancellation",
            "audit snapshots",
            "month/year navigation",
            "reload",
            "historic search",
            "eight responsive widths",
            "original HD logo",
            "anonymous request rejected",
          ],
        },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify({
        passed: true,
        phase: mode,
        prefix,
        persistId: past.body.id,
        holidaySourceState: holiday.body.state,
      }),
    );
  }
} finally {
  await browser.close();
}
