// Minimal Chrome DevTools Protocol driver shared by the regression suites (no dependencies; Node 22+ WebSocket).
// Each suite launches its own headless Chrome with a fresh absolute-path profile (a relative --user-data-dir made
// Chrome start too slowly for the debug socket during M1, so it is always absolute here).
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
export const VIEWPORTS = {
  desktop: { width: 1440, height: 900, mobile: false },
  tablet: { width: 768, height: 1024, mobile: true },
  mobile: { width: 390, height: 844, mobile: true },
};
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const KEYS = {
  Tab: { code: "Tab", keyCode: 9 }, Escape: { code: "Escape", keyCode: 27 }, Enter: { code: "Enter", keyCode: 13 },
  ArrowRight: { code: "ArrowRight", keyCode: 39 }, ArrowLeft: { code: "ArrowLeft", keyCode: 37 },
};

export async function launch(port) {
  const profile = mkdtempSync(join(tmpdir(), "suite-"));
  const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
  let wsUrl;
  for (let i = 0; i < 150 && !wsUrl; i++) {
    try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page")?.webSocketDebuggerUrl; } catch {}
    if (!wsUrl) await sleep(200);
  }
  if (!wsUrl) { chrome.kill(); throw new Error(`Chrome debug socket not available on port ${port}`); }
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.addEventListener("open", r, { once: true }); ws.addEventListener("error", j, { once: true }); });

  let nextId = 1; const pending = new Map(); const listeners = new Map();
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method) for (const fn of listeners.get(m.method) ?? []) fn(m.params);
  });
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = nextId++;
    pending.set(id, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
  const on = (method, fn) => { if (!listeners.has(method)) listeners.set(method, []); listeners.get(method).push(fn); };

  // console errors and uncaught exceptions, per navigation
  let errors = [];
  on("Runtime.exceptionThrown", (p) => errors.push("exception: " + (p.exceptionDetails.exception?.description ?? p.exceptionDetails.text).split("\n")[0]));
  on("Runtime.consoleAPICalled", (p) => { if (p.type === "error") errors.push("console: " + p.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 200)); });
  on("Log.entryAdded", (p) => { if (p.entry.level === "error") errors.push("log: " + p.entry.text.slice(0, 200) + (p.entry.url ? " " + p.entry.url : "")); });
  await send("Runtime.enable"); await send("Page.enable"); await send("Log.enable"); await send("Network.enable");

  const page = {
    send, on,
    get errors() { return errors; },
    clearErrors() { errors = []; },
    async ev(expression) {
      const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    },
    async viewport(name) {
      const v = VIEWPORTS[name];
      await send("Emulation.setDeviceMetricsOverride", { width: v.width, height: v.height, deviceScaleFactor: 1, mobile: v.mobile });
    },
    async reducedMotion(on) {
      await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: on ? "reduce" : "no-preference" }] });
    },
    /** Navigate and wait for load, fonts and hydration to settle. */
    async goto(url, settle = 1500) {
      errors = [];
      const loaded = new Promise((r) => { const t = setTimeout(r, 20000); on("Page.loadEventFired", () => { clearTimeout(t); r(); }); });
      await send("Page.navigate", { url });
      await loaded; await sleep(settle);
      try { await page.ev("document.fonts.ready.then(() => true)"); } catch {}
    },
    async reload(settle = 1500) {
      errors = [];
      const loaded = new Promise((r) => { const t = setTimeout(r, 20000); on("Page.loadEventFired", () => { clearTimeout(t); r(); }); });
      await send("Page.reload", { ignoreCache: false });
      await loaded; await sleep(settle);
    },
    async key(name, { shift = false } = {}) {
      const k = KEYS[name];
      const base = { key: name, code: k.code, windowsVirtualKeyCode: k.keyCode, nativeVirtualKeyCode: k.keyCode, modifiers: shift ? 8 : 0 };
      await send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base });
      await send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
      await sleep(120);
    },
    async type(text) { await send("Input.insertText", { text }); await sleep(80); },
    /** Real mouse click at the centre of the first element matching `selector` (scrolled into view). */
    async click(selector, { index = 0 } = {}) {
      const box = await page.ev(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})][${index}]; if (!el) return null; el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      if (!box) throw new Error(`click: no element for ${selector}[${index}]`);
      await sleep(150);
      for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x: box.x, y: box.y, button: "left", clickCount: 1 });
      await sleep(300);
    },
    /** Click the first element whose trimmed text (or aria-label) equals/contains `text`. */
    async clickText(selector, text, { exact = true } = {}) {
      const idx = await page.ev(`[...document.querySelectorAll(${JSON.stringify(selector)})].findIndex(e => { const t = (e.innerText || e.getAttribute("aria-label") || "").trim(); return ${exact ? `t === ${JSON.stringify(text)}` : `t.includes(${JSON.stringify(text)})`}; })`);
      if (idx < 0) throw new Error(`clickText: "${text}" not found in ${selector}`);
      await page.click(selector, { index: idx });
    },
    async setCookie(name, value, url) { await send("Network.setCookie", { name, value, url }); },
    async clearCookies() { await send("Network.clearBrowserCookies"); },
    async cookies() { return (await send("Network.getCookies")).cookies; },
    async screenshot() { return (await send("Page.captureScreenshot", { format: "png" })).data; },
    async close() { try { ws.close(); } catch {} chrome.kill(); await sleep(300); try { rmSync(profile, { recursive: true, force: true }); } catch {} },
  };
  return page;
}

/** Small assertion collector: every check is recorded, failures are listed in `failures`. */
export function recorder(suite) {
  const checks = [];
  return {
    check(name, ok, detail) { checks.push({ name, ok: !!ok, ...(detail !== undefined ? { detail } : {}) }); if (!ok) console.log(`  FAIL ${name}${detail !== undefined ? " — " + JSON.stringify(detail).slice(0, 300) : ""}`); return !!ok; },
    async guard(name, fn) { try { await fn(); } catch (e) { checks.push({ name, ok: false, detail: "threw: " + String(e.message || e).slice(0, 300) }); console.log(`  FAIL ${name} threw: ${e.message}`); } },
    result() { const failures = checks.filter((c) => !c.ok); return { suite, total: checks.length, passed: checks.length - failures.length, failures, checks }; },
  };
}
