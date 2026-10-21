// Browser regression suite. Dependencies may live outside the application:
// PLAYWRIGHT_MODULE, AXE_SCRIPT and CHROME_PATH select local QA tools.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const { addDays, dateKey, monday } = await import("../lib/calendar.ts");
const { baseHolidays, DEFAULT_POLICY, citySource } =
  await import("../lib/holidays.ts");
const output = resolve("outputs/responsive");
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH }
    : {}),
});
const baseURL = process.env.BASE_URL || "http://127.0.0.1:5173";
assert.ok(
  new URL(baseURL).hostname === "127.0.0.1" ||
    new URL(baseURL).hostname === "localhost",
  "Run fixtures only against a local preview.",
);
const today = dateKey(new Date());
const rooms = [
  { id: "horizonte", name: "Sala de reunião 1", color: "green" },
  { id: "conexao", name: "Sala de reunião 2", color: "blue" },
].map((room) => ({
  ...room,
  active: 1,
  capacity: 0,
  equipment: "TV, Quadro branco",
  location: "Realess",
}));
const user = {
  id: "qa-user",
  name: "Pessoa de teste",
  email: "qa@example.test",
};
function booking(index, overrides = {}) {
  return {
    id: `fixture-${index}`,
    title: `Compromisso ${index} — alinhamento e planejamento com a equipe da Realess`,
    date: today,
    start: "09:00",
    end: "10:00",
    roomId: rooms[index % 2].id,
    kind: index % 2 ? "online" : "meeting",
    description: "Pauta detalhada. ".repeat(25),
    participants: "Equipe Realess, Cliente",
    link: "https://meet.google.com/abc-defg-hij",
    ownerId: user.id,
    ownerName: user.name,
    ...overrides,
  };
}
const fixtures = [
  ...Array.from({ length: 18 }, (_, index) =>
    booking(index, {
      start: `${String(8 + Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`,
      end: `${String(9 + Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`,
    }),
  ),
  ...Array.from({ length: 20 }, (_, index) =>
    booking(20 + index, { date: addDays(monday(today), index - 7) }),
  ),
  booking(99, {
    title: "TítuloSemEspaços".repeat(8),
    date: addDays(today, 1),
    ownerName: "Organizador".repeat(12),
  }),
];
const results = [];
const errors = [];
async function setup(width, height = 900) {
  const page = await browser.newPage({
    viewport: { width, height },
    reducedMotion: "reduce",
  });
  let state = {
    rooms,
    bookings: structuredClone(fixtures),
    user,
    started: true,
  };
  let mode = "normal";
  let release;
  await page.route("**/api/holidays**", (route) => {
    const year = Number(
      new URL(route.request().url()).searchParams.get("year"),
    );
    return route.fulfill({
      status: 200,
      json: {
        year,
        holidays: baseHolidays(year),
        state: "fresh",
        checkedAt: Date.now(),
        source: citySource(year),
        policy: DEFAULT_POLICY,
        isAdmin: false,
      },
    });
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/workspace**", async (route) => {
    if (mode === "loading")
      await new Promise((resolve) => {
        release = resolve;
      });
    if (mode === "error")
      return route.fulfill({
        status: 503,
        json: { error: "Não foi possível carregar a agenda. Tente novamente." },
      });
    if (mode === "signin")
      return route.fulfill({
        status: 401,
        json: {
          signIn: true,
          error: "Entre na sua conta para acessar a agenda.",
        },
      });
    const request = route.request();
    if (request.method() === "POST") {
      const body = request.postDataJSON();
      if (body.action === "saveBooking") {
        const id = body.id || "created-in-browser";
        state.bookings = state.bookings.filter((event) => event.id !== id);
        const saved = { ...booking(100), ...body, id };
        state.bookings.push(saved);
        return route.fulfill({
          status: 200,
          json: { ok: true, id, booking: saved },
        });
      }
      return route.fulfill({ status: 200, json: { ok: true } });
    }
    return route.fulfill({ status: 200, json: state });
  });
  await page.goto(baseURL, { waitUntil: "networkidle" });
  await page.locator(".calendar-card").waitFor();
  return {
    page,
    setMode: (value) => {
      mode = value;
    },
    setEmpty: () => {
      state.bookings = [];
    },
    release: () => release?.(),
    state: () => state,
  };
}
async function fits(page, label) {
  const overflow = await page.evaluate(() => ({
    viewport: innerWidth,
    scroll: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert.ok(
    overflow.scroll <= overflow.viewport + 1 &&
      overflow.body <= overflow.viewport + 1,
    `${label}: ${JSON.stringify(overflow)}`,
  );
  for (const selector of [
    ".stats-grid",
    ".calendar-card",
    ".daily-panel",
    ".rooms-grid",
    "dialog[open]",
  ]) {
    for (const bounds of await page.locator(selector).evaluateAll((elements) =>
      elements.map((element) => {
        const r = element.getBoundingClientRect();
        return { left: r.left, right: r.right };
      }),
    )) {
      assert.ok(
        bounds.left >= -1 && bounds.right <= overflow.viewport + 1,
        `${label}, ${selector}: ${JSON.stringify(bounds)}`,
      );
    }
  }
}
async function accessibility(page, label) {
  if (!process.env.AXE_SCRIPT) return { label, skipped: true };
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
    return {
      violations: result.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
      incomplete: result.incomplete.map((v) => ({
        id: v.id,
        targets: v.nodes.map((node) => node.target),
      })),
    };
  });
  writeFileSync(
    resolve(output, `a11y-${label}.json`),
    JSON.stringify(audit, null, 2),
  );
  assert.deepEqual(
    audit.violations,
    [],
    `Accessibility ${label}: ${JSON.stringify(audit.violations)}`,
  );
  return { label, ...audit };
}
try {
  for (const width of [320, 375, 390, 430, 768, 1024, 1440, 1920]) {
    const { page, state } = await setup(width, width >= 768 ? 1000 : 844);
    const checks = [];
    await fits(page, `week-${width}`);
    await page.screenshot({ path: resolve(output, `home-${width}.png`) });
    assert.ok(
      await page
        .locator(".time-slot")
        .first()
        .evaluate((e) => e.getBoundingClientRect().height >= 44),
    );
    await page.getByRole("button", { name: "Mês", exact: true }).click();
    await fits(page, `month-${width}`);
    assert.equal(await page.locator(".month-weekday").count(), 7);
    const grid = await page.locator(".month-calendar").evaluate((e) => ({
      width: e.clientWidth,
      scroll: e.scrollWidth,
      columns: getComputedStyle(e).gridTemplateColumns.split(" ").length,
    }));
    assert.equal(grid.columns, 7);
    assert.ok(grid.scroll <= grid.width + 1, JSON.stringify(grid));
    assert.ok(
      await page
        .locator(".month-day-number")
        .first()
        .evaluate((e) => {
          const r = e.getBoundingClientRect();
          return r.height >= 44 && r.width >= 24;
        }),
    );
    await page.locator(`.month-day-number[data-date="${today}"]`).click();
    assert.equal(
      await page.locator(".selected-day-event").count(),
      fixtures.filter((e) => e.date === today).length,
    );
    await page.locator(`.month-day-number[data-date="${today}"]`).focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(
      await page
        .locator(".month-day-number[aria-pressed=true]")
        .getAttribute("data-date"),
      addDays(today, 1),
    );
    await page
      .getByRole("button", { name: "Próximo período", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Período anterior", exact: true })
      .click();
    await page.getByRole("button", { name: "Hoje", exact: true }).click();
    checks.push(
      "seven-column fluid month, date indicators, selected-day appointments, keyboard dates, month navigation",
    );
    if (width === 390) await accessibility(page, "month-390");
    await page.screenshot({ path: resolve(output, `month-${width}.png`) });
    await page
      .locator(".month-calendar")
      .screenshot({ path: resolve(output, `calendar-${width}.png`) });
    await page
      .getByRole("button", { name: "Filtros da agenda", exact: true })
      .click();
    const filters = page.locator("#agenda-filters");
    await filters
      .getByRole("button", { name: "Sala de reunião 1", exact: true })
      .click();
    assert.equal(
      await filters
        .getByRole("button", { name: "Sala de reunião 1", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    await filters.getByLabel("Tipo de encontro").selectOption("online");
    await filters.getByLabel("Exibir fim de semana").check();
    await fits(page, `filters-${width}`);
    if (width === 390) await accessibility(page, "filters-390");
    await filters
      .getByRole("button", { name: "Limpar filtros", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Filtros da agenda", exact: true })
      .click();
    checks.push("room/category filters, selected state, weekends, reset");
    await page
      .getByRole("button", { name: "Novo compromisso", exact: true })
      .click();
    let dialog = page.locator("dialog[open]");
    await dialog
      .getByLabel("Título do compromisso")
      .fill(`Teste responsivo ${width}`);
    await dialog.getByLabel("Data", { exact: false }).first().fill(today);
    await dialog.getByLabel("Início").fill("17:00");
    await dialog.getByLabel("Término").fill("18:00");
    await dialog
      .getByLabel("Link do Google Meet")
      .fill("https://meet.google.com/xyz-abcd-efg");
    await dialog
      .getByLabel("Participantes", { exact: true })
      .fill("equipe@example.test");
    await dialog.getByLabel("Participantes", { exact: true }).press("Enter");
    await dialog.getByLabel("Descrição").fill("Pauta longa ".repeat(80));
    await fits(page, `form-${width}`);
    assert.ok(
      await dialog
        .locator("input")
        .first()
        .evaluate((e) => parseFloat(getComputedStyle(e).fontSize) >= 16),
    );
    const save = dialog.getByRole("button", {
      name: "Salvar compromisso e preparar convite no Outlook",
      exact: true,
    });
    await save.scrollIntoViewIfNeeded();
    const saveBounds = await save.boundingBox();
    assert.ok(
      saveBounds.y >= 0 &&
        saveBounds.y + saveBounds.height <= page.viewportSize().height + 1,
      "Save button outside viewport",
    );
    if (width === 320 || width === 390 || width === 1440)
      await page.screenshot({ path: resolve(output, `form-${width}.png`) });
    if (width === 390) await accessibility(page, "form-390");
    await save.click();
    await page.getByRole("button", { name: "Agora não", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.ok(
      state().bookings.some(
        (event) => event.title === `Teste responsivo ${width}`,
      ),
    );
    await page.getByRole("button", { name: "Lista", exact: true }).click();
    await page
      .locator(".agenda-row")
      .filter({ hasText: `Teste responsivo ${width}` })
      .click();
    dialog = page.locator("dialog[open]");
    assert.equal(
      await dialog
        .getByRole("link", { name: "Entrar no Meet", exact: true })
        .getAttribute("href"),
      "https://meet.google.com/xyz-abcd-efg",
    );
    await dialog
      .getByRole("button", { name: "Editar compromisso", exact: true })
      .click();
    await page
      .locator("dialog[open]")
      .getByLabel("Título do compromisso")
      .fill(`Editado ${width}`);
    await page
      .locator("dialog[open]")
      .getByRole("button", {
        name: "Salvar alterações e preparar convite no Outlook",
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: "Agora não", exact: true }).click();
    await page.locator("dialog[open]").waitFor({ state: "hidden" });
    await fits(page, `list-${width}`);
    checks.push(
      "create/edit form, long description, save actions, Meet details, list",
    );
    if (width < 1200) {
      const trigger = page.getByRole("button", {
        name: "Abrir menu",
        exact: true,
      });
      await trigger.click();
      assert.equal(await trigger.getAttribute("aria-expanded"), "true");
      assert.equal(
        await page.locator(".main-shell").evaluate((e) => e.inert),
        true,
      );
      if (width === 390) await accessibility(page, "drawer-390");
      const panel = page.locator(".sidebar");
      const focusables = panel.locator("button,a[href]");
      await focusables.first().focus();
      await page.keyboard.press("Shift+Tab");
      assert.ok(
        await focusables.last().evaluate((e) => e === document.activeElement),
      );
      await page.keyboard.press("Escape");
      assert.ok(await trigger.evaluate((e) => e === document.activeElement));
      await trigger.click();
      await panel
        .getByRole("button", { name: "Salas de reunião", exact: false })
        .first()
        .click();
      assert.equal(await page.locator(".sidebar.is-open").count(), 0);
      checks.push("drawer focus trap, Escape, return focus, navigation");
    } else
      await page
        .getByRole("button", { name: "Salas de reunião", exact: false })
        .first()
        .click();
    await fits(page, `rooms-${width}`);
    assert.equal(await page.locator(".room-card").count(), 2);
    await page
      .getByRole("button", { name: "Editar Sala de reunião 1", exact: true })
      .click();
    await page
      .locator("dialog[open]")
      .getByLabel("Nome da sala")
      .fill("Sala de reunião 1");
    await fits(page, `room-form-${width}`);
    await page.keyboard.press("Escape");
    if (width < 1200)
      await page
        .getByRole("button", { name: "Abrir menu", exact: true })
        .click();
    await page
      .getByRole("button", { name: "Meus compromissos", exact: true })
      .click();
    await fits(page, `mine-${width}`);
    if (width < 1200)
      await page
        .getByRole("button", { name: "Abrir menu", exact: true })
        .click();
    await page
      .getByRole("button", { name: "Ajuda e informações", exact: true })
      .click();
    await fits(page, `help-${width}`);
    await page.keyboard.press("Escape");
    checks.push("rooms, room editing, my appointments, help");
    if (width === 390 || width === 1440)
      await accessibility(page, `main-${width}`);
    results.push({ width, height: page.viewportSize().height, checks });
    await page.close();
    console.log(`Passed ${width}px`);
  }
  for (const [width, height] of [
    [667, 375],
    [844, 390],
    [1024, 768],
  ]) {
    const { page } = await setup(width, height);
    await page.getByRole("button", { name: "Mês", exact: true }).click();
    await fits(page, `landscape-${width}x${height}`);
    await page
      .getByRole("button", { name: "Novo compromisso", exact: true })
      .click();
    await page
      .locator("dialog[open]")
      .getByLabel("Descrição")
      .fill("Teste horizontal e altura reduzida.");
    const save = page
      .locator("dialog[open]")
      .getByRole("button", { name: "Salvar compromisso", exact: true });
    await save.scrollIntoViewIfNeeded();
    const bounds = await save.boundingBox();
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= height + 1);
    await fits(page, `landscape-form-${width}`);
    await page.keyboard.press("Escape");
    results.push({
      width,
      height,
      checks: ["landscape, reduced-height form, visible save, month"],
    });
    await page.close();
  }
  for (const width of [320, 768, 1920]) {
    const app = await setup(width);
    const { page } = app;
    for (const mode of ["loading", "error", "signin", "empty"]) {
      if (mode === "empty") {
        app.setEmpty();
        app.setMode("normal");
      } else app.setMode(mode);
      await page.reload({ waitUntil: "domcontentloaded" });
      if (mode === "loading") {
        await page
          .getByRole("heading", { name: "Preparando sua agenda…" })
          .waitFor();
        await fits(page, `${mode}-${width}`);
        app.setMode("normal");
        app.release();
        await page.locator(".calendar-card").waitFor();
      } else if (mode === "empty") {
        await page.getByRole("button", { name: "Lista", exact: true }).click();
        await page.locator(".empty-state").waitFor();
        await fits(page, `${mode}-${width}`);
      } else {
        await page.locator(".error-panel").waitFor();
        await fits(page, `${mode}-${width}`);
      }
    }
    results.push({
      width,
      checks: ["loading, retry/error, sign-in, empty state"],
    });
    await page.close();
  }
  {
    const { page } = await setup(390, 844);
    await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForFunction(
      () => !document.querySelector(".main-shell").inert,
    );
    assert.equal(await page.locator(".sidebar.is-open").count(), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("button", { name: "Novo compromisso", exact: true })
      .click();
    await page.setViewportSize({ width: 390, height: 380 });
    await page
      .locator("dialog[open]")
      .getByLabel("Descrição")
      .fill("Altura reduzida durante a edição.");
    const dialog = page.locator("dialog[open]");
    const bounds = await dialog.boundingBox();
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 381);
    await fits(page, "reduced-visual-viewport");
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "200%"),
    );
    await page.getByRole("button", { name: "Mês", exact: true }).click();
    await fits(page, "200-percent-font");
    results.push({
      width: 390,
      checks: [
        "drawer closes on desktop resize",
        "reduced visual viewport",
        "200% font size",
      ],
    });
    await page.close();
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    resolve(output, "results.json"),
    JSON.stringify(
      {
        passed: true,
        results,
        browserErrors: errors,
        physicalDeviceTested: false,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      passed: true,
      scenarios: results.length,
      browserErrors: errors,
    }),
  );
} finally {
  await browser.close();
}
