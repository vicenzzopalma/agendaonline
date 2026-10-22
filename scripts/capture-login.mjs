import { spawn } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

// Uses the installed Chrome with an isolated profile, never the user's browser session.
export async function captureLogin(origin, output, profile, sessions = null) {
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
    if (sessions) {
      const evaluate = async (expression) => {
        const response = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
        if (response.exceptionDetails) throw new Error(JSON.stringify(response.exceptionDetails));
        return response.result?.value;
      };
      const waitFor = async (expression) => {
        for (let attempt = 0; attempt < 100; attempt++) {
          if (await evaluate(expression)) return;
          await new Promise((done) => setTimeout(done, 200));
        }
        throw new Error(`A interface não ficou pronta: ${expression}`);
      };
      const setSession = async (cookie) => {
        await send("Network.clearBrowserCookies");
        const index = cookie.indexOf("=");
        await send("Network.setCookie", { url: origin, name: cookie.slice(0, index), value: cookie.slice(index + 1), httpOnly: true, sameSite: "Strict" });
      };
      await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
      await setSession(sessions.master);
      await send("Page.navigate", { url: origin + "/" });
      await waitFor("Array.from(document.querySelectorAll('.nav-item')).some(el => el.textContent.includes('Usuários e acessos'))");
      const order = await evaluate("Array.from(document.querySelectorAll('.nav-item')).map(el => el.textContent.trim())");
      assert.equal(order.indexOf("Usuários e acessos"), order.indexOf("Meus compromissos") + 1);
      await evaluate("Array.from(document.querySelectorAll('.nav-item')).find(el => el.textContent.includes('Usuários e acessos')).click()");
      await waitFor("!!document.querySelector('.access-users-table')");
      let capture = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      writeFileSync(join(output, "users-desktop.png"), Buffer.from(capture.data, "base64"));
      await evaluate("Array.from(document.querySelectorAll('.user-access button')).find(el => el.textContent.includes('Novo usuário')).click()");
      await waitFor("!!document.querySelector('.access-create-form')");
      capture = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      writeFileSync(join(output, "users-create.png"), Buffer.from(capture.data, "base64"));
      await evaluate("(() => { const f=document.querySelector('.access-create-form'); f.elements.name.value='Usuário de teste visual'; f.elements.username.value='ui.teste'; f.elements.password.value='Senha-teste-visual-943!'; f.requestSubmit(); })()");
      await waitFor("!document.querySelector('.access-create-form') && document.querySelector('.access-users-table')?.textContent.includes('ui.teste')");
      await setSession(sessions.member);
      await send("Page.navigate", { url: origin + "/" });
      await waitFor("!!document.querySelector('.account-summary strong')?.textContent.trim() && document.querySelector('.account-summary small')?.textContent === 'Colaborador'");
      assert.equal(await evaluate("Array.from(document.querySelectorAll('.nav-item')).some(el => el.textContent.includes('Usuários e acessos'))"), false);
      assert.equal(await evaluate("fetch('/api/users').then(r => r.status)"), 403);
    }
    await send("Browser.close");
  } finally { socket?.close(); chrome.kill(); }
}
