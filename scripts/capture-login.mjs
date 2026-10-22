import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

// Uses the installed Chrome with an isolated profile, never the user's browser session.
export async function captureLogin(origin, output, profile) {
  const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { windowsHide: true, stdio: "ignore" });
  let socket;
  try {
    let page;
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        const portFile = join(profile, "DevToolsActivePort");
        if (existsSync(portFile)) {
          const port = Number(readFileSync(portFile, "utf8").split("\n")[0]);
          page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((target) => target.type === "page");
          if (page) break;
        }
      } catch { /* Chrome is starting. */ }
      await new Promise((done) => setTimeout(done, 200));
    }
    assert.ok(page, "Chrome não iniciou a sessão de captura.");
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((done, fail) => { socket.addEventListener("open", done, { once: true }); socket.addEventListener("error", fail, { once: true }); });
    let sequence = 0;
    const pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      const action = pending.get(message.id);
      if (!action) return;
      clearTimeout(action.timer); pending.delete(message.id);
      if (message.error) action.fail(new Error(JSON.stringify(message.error))); else action.done(message.result);
    });
    const send = (method, params = {}) => new Promise((done, fail) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); fail(new Error(`Chrome timeout: ${method}`)); }, 15000);
      pending.set(id, { done, fail, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
    await send("Page.enable");
    for (const [name, width, height, mobile] of [["desktop", 1440, 1000, false], ["mobile", 390, 844, true]]) {
      await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
      await send("Page.navigate", { url: origin + "/login" });
      for (let attempt = 0; attempt < 50; attempt++) {
        const ready = await send("Runtime.evaluate", { expression: "document.readyState === 'complete' && !!document.querySelector('.login-form')", returnByValue: true });
        if (ready.result?.value) break;
        await new Promise((done) => setTimeout(done, 200));
      }
      const layout = await send("Runtime.evaluate", { expression: "(async () => { await document.fonts.ready; return { width: innerWidth, scroll: document.documentElement.scrollWidth, styled: getComputedStyle(document.querySelector('.login-page')).display }; })()", awaitPromise: true, returnByValue: true });
      assert.equal(layout.result.value.width, width);
      assert.ok(layout.result.value.scroll <= width, `Overflow na tela ${name}: ${JSON.stringify(layout.result.value)}`);
      assert.equal(layout.result.value.styled, "grid");
      const capture = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      writeFileSync(join(output, `login-${name}.png`), Buffer.from(capture.data, "base64"));
    }
    await send("Browser.close");
  } finally { socket?.close(); chrome.kill(); }
}
