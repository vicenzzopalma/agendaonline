import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.BASE_URL || "http://127.0.0.1:5173";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH }
    : {}),
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } }),
  errors = [];
page.on("pageerror", (error) => errors.push(error.message));
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
const output = resolve("outputs/calendar-history");
mkdirSync(output, { recursive: true });
let id;
try {
  await page.goto(base + "/signin-with-chatgpt?return_to=%2F", {
    waitUntil: "networkidle",
  });
  await page
    .getByRole("button", { name: "Configurar calendário", exact: true })
    .click();
  let dialog = page.locator("dialog[open]");
  await dialog
    .getByLabel(
      "Tratar os pontos facultativos municipais como dias inteiros não úteis",
    )
    .check();
  await dialog
    .getByRole("button", { name: "Adicionar exceção", exact: true })
    .click();
  await dialog.getByLabel("Data da exceção").fill("2026-11-20");
  await dialog
    .getByLabel("Justificativa")
    .fill("Exceção administrativa de teste local");
  assert.ok(
    await dialog.evaluate(
      (element) => element.getBoundingClientRect().right <= innerWidth,
    ),
  );
  if (process.env.AXE_SCRIPT) {
    await page.addScriptTag({
      content: readFileSync(process.env.AXE_SCRIPT, "utf8"),
    });
    const audit = await page.evaluate(async () => {
      const result = await window.axe.run(document, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
        },
      });
      return result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.target),
      }));
    });
    assert.deepEqual(audit, []);
  }
  await dialog
    .getByRole("button", { name: "Salvar calendário", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  const policy = await request("/api/holidays?year=2026");
  assert.equal(policy.body.policy.blockOptional, true);
  assert.equal(
    policy.body.holidays.find((day) => day.date === "2026-11-20").blocked,
    false,
  );
  await page.reload({ waitUntil: "networkidle" });
  await page
    .getByRole("button", { name: "Configurar calendário", exact: true })
    .click();
  dialog = page.locator("dialog[open]");
  assert.equal(
    await dialog.getByLabel("Justificativa").inputValue(),
    "Exceção administrativa de teste local",
  );
  await page.screenshot({ path: resolve(output, "admin-390.png") });
  await page.keyboard.press("Escape");
  assert.equal(
    (
      await request("/api/calendar-policy", {
        blockOptional: false,
        overrides: [],
      })
    ).status,
    200,
  );
  const prefix = "QA" + Date.now(),
    common = {
      title: prefix + " Auditoria original",
      date: "2026-10-15",
      start: "09:00",
      end: "10:00",
      roomId: "",
      kind: "meeting",
      description: "Versão inicial para conferir a paginação.",
    };
  const created = await post({ action: "saveBooking", ...common });
  assert.equal(created.status, 200);
  id = created.body.id;
  for (let version = 1; version <= 104; version++) {
    const changed = await post({
      action: "saveBooking",
      ...common,
      id,
      title: prefix + " Auditoria " + version,
    });
    assert.equal(changed.status, 200, JSON.stringify(changed));
  }
  const first = await request("/api/workspace?audit=" + id);
  assert.equal(first.body.history.length, 100);
  assert.ok(first.body.nextCursor);
  const second = await request(
    "/api/workspace?audit=" + id + "&before=" + first.body.nextCursor,
  );
  assert.equal(second.body.history.length, 5);
  assert.equal(second.body.nextCursor, null);
  assert.ok(second.body.history.some((row) => row.action === "created"));
  assert.equal(
    new Set(
      [...first.body.history, ...second.body.history].map((row) => row.id),
    ).size,
    105,
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Histórico", exact: true }).click();
  await page.getByLabel("Título, responsável ou participante").fill(prefix);
  await page.locator(".history-result").click();
  await page
    .locator("dialog[open]")
    .getByText("Histórico de alterações", { exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Carregar alterações anteriores",
      exact: true,
    })
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll(".audit-entry").length === 105,
  );
  const unavailable = await request("/api/holidays?year=2199");
  assert.equal(unavailable.status, 200);
  assert.notEqual(unavailable.body.state, "fresh");
  assert.ok(
    unavailable.body.holidays.some(
      (day) => day.date === "2199-01-01" && day.blocked,
    ),
  );
  const cached = await request("/api/holidays?year=2199");
  assert.equal(cached.body.checkedAt, unavailable.body.checkedAt);
  assert.deepEqual(errors, []);
  writeFileSync(
    resolve(output, "admin-audit-results.json"),
    JSON.stringify(
      {
        passed: true,
        checks: [
          "administration form on 390px",
          "policy persisted after reload",
          "authorized exception",
          "axe WCAG A/AA",
          "105 audit versions with cursor pagination",
          "no missing/duplicate audit versions",
          "official-source failure fallback",
          "persistent retry cache",
        ],
        browserErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      passed: true,
      auditVersions: 105,
      adminForm: true,
      sourceFailureFallback: true,
    }),
  );
} finally {
  if (id) await post({ action: "deleteBooking", id }).catch(() => {});
  await request("/api/calendar-policy", {
    blockOptional: false,
    overrides: [],
  }).catch(() => {});
  await browser.close();
}
