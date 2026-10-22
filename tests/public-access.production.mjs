// Read-only anonymous smoke check. Never creates or modifies meetings.
import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const base = process.env.PUBLIC_URL;
assert.ok(
  base && new URL(base).protocol === "https:",
  "Pass the actual deployed PUBLIC_URL",
);
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHROME_PATH ||
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
try {
  const context = await browser.newContext({ ignoreHTTPSErrors: ["localhost", "127.0.0.1"].includes(new URL(base).hostname) });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto(base, {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  assert.equal(response.status(), 200);
  assert.equal(new URL(page.url()).origin, new URL(base).origin);
  await page.locator(".calendar-card").waitFor({ timeout: 30000 });
  assert.equal(new URL(await page.locator('meta[property="og:image"]').getAttribute("content")).origin, new URL(base).origin);
  assert.equal(await page.locator("a[href*='signin-with-chatgpt']").count(), 0);
  const api = await context.request.get(new URL("/api/workspace", base).href);
  assert.equal(api.status(), 200);
  const body = await api.json();
  assert.ok(body.user.id.startsWith("visitor_"));
  assert.equal(body.user.isAdmin, false);
  assert.equal(body.user.email, "");
  const identity = body.user.id;
  const cookie = (await context.cookies()).find(
    (item) => item.name === "__Host-realess_device",
  );
  assert.ok(cookie?.secure && cookie.httpOnly);
  assert.equal(cookie.sameSite, "Lax");
  for (const list of [body.bookings, body.todayBookings, body.upcoming])
    for (const event of list || []) {
      assert.equal(event.participants, "");
      assert.equal(event.organizerEmail, "");
    }
  await page.reload({ waitUntil: "networkidle" });
  const again = await context.request.get(new URL("/api/workspace", base).href);
  assert.equal((await again.json()).user.id, identity);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      passed: true,
      url: base,
      anonymous: true,
      openaiSignInRequired: false,
      browserIdentityPersists: true,
      existingMeetingsModified: false,
    }),
  );
} finally {
  await browser.close();
}
