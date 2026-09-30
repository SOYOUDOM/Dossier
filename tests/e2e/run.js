// node tests/e2e/run.js
//
// The app itself, in a real browser: documents added to Sources through the
// same code the Library panel uses (a real PDF read by the app's own reader),
// questions asked in the chat panel with a stand-in for the flow, and what
// ends up on the screen checked - citations, the viewer, answers held back,
// follow-ups, access labels, attachments kept from a conversation.
//
// Needs Chrome, Edge or Chromium. It looks in the usual places; set CHROME
// to the browser's path to choose. With none found it says so and passes
// (exit 0), so `node --test` stays usable on a machine without a browser.
// SHOTS=<folder> keeps screenshots of the answer, the viewer and the panel.
"use strict";
const { spawn } = require("child_process");
const fs = require("fs"), path = require("path"), http = require("http"), os = require("os");
const ROOT = path.join(__dirname, "..", "..");

function findBrowser(){
  if (process.env.CHROME) return process.env.CHROME;
  const list = [];
  try {
    for (const d of fs.readdirSync("/opt/pw-browsers")) if (/^chromium-\d+/.test(d)) list.push(path.join("/opt/pw-browsers", d, "chrome-linux", "chrome"));
  } catch (e) {}
  const pf = [process.env["PROGRAMFILES"], process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean);
  pf.forEach(p => { list.push(path.join(p, "Google", "Chrome", "Application", "chrome.exe"));
                    list.push(path.join(p, "Microsoft", "Edge", "Application", "msedge.exe")); });
  list.push("/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/microsoft-edge",
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge");
  return list.find(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }) || "";
}

const TYPES = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".md":"text/markdown; charset=utf-8",
  ".txt":"text/plain; charset=utf-8", ".pdf":"application/pdf", ".png":"image/png", ".ico":"image/x-icon", ".gif":"image/gif",
  ".json":"application/json", ".woff2":"font/woff2", ".css":"text/css" };
function serve(){
  return new Promise(res => {
    const srv = http.createServer((req, rs) => {
      const u = decodeURIComponent(new URL(req.url, "http://x").pathname);
      const f = path.normalize(path.join(ROOT, u === "/" ? "/dossier.html" : u));
      if (!f.startsWith(ROOT)) { rs.writeHead(403); return rs.end(); }
      fs.readFile(f, (err, b) => {
        if (err) { rs.writeHead(404, { "Content-Type":"text/plain" }); return rs.end("no"); }
        rs.writeHead(200, { "Content-Type":TYPES[path.extname(f)] || "application/octet-stream", "Cache-Control":"no-store" });
        rs.end(b);
      });
    }).listen(0, "127.0.0.1", () => res(srv));
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const exe = findBrowser();
  if (!exe) { console.log("e2e: skipped - no Chrome, Edge or Chromium found (set CHROME=<path>)"); process.exit(0); }
  if (typeof WebSocket === "undefined") { console.log("e2e: skipped - this Node has no WebSocket (Node 22 or later)"); process.exit(0); }
  const srv = await serve();
  const port = srv.address().port;
  const dbg = 9300 + Math.floor(Math.random() * 500);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "resolv-e2e-"));
  const chrome = spawn(exe, ["--headless=new", "--no-sandbox", "--disable-gpu", "--remote-debugging-port=" + dbg,
    "--window-size=1366,900", "--user-data-dir=" + profile, "--no-first-run", "--no-default-browser-check",
    "http://127.0.0.1:" + port + "/dossier.html"], { stdio:"ignore" });
  const shots = process.env.SHOTS || "";
  let target = null;
  for (let i = 0; i < 120 && !target; i++) {
    try { target = (await (await fetch("http://127.0.0.1:" + dbg + "/json")).json()).find(x => x.type === "page" && /dossier/.test(x.url)); } catch (e) {}
    if (!target) await sleep(250);
  }
  if (!target) { console.log("e2e: FAILED - the browser did not open the page"); chrome.kill(); srv.close(); process.exit(1); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0; const wait = new Map(); const errors = [];
  const send = (method, params) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id:i, method, params:params || {} })); });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && wait.has(m.id)) { wait.get(m.id)(m.result); wait.delete(m.id); }
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text);
  };
  await new Promise(r => { ws.onopen = r; });
  await send("Runtime.enable"); await send("Page.enable");
  await sleep(1200);
  let done = false, result = null;
  send("Runtime.evaluate", { expression:fs.readFileSync(path.join(__dirname, "sources.scenario.js"), "utf8"),
                             awaitPromise:true, returnByValue:true, timeout:240000 }).then(r => { result = r; done = true; });
  while (!done) {
    await sleep(150);
    const r = await send("Runtime.evaluate", { expression:"JSON.stringify(window.__shot || null)", returnByValue:true });
    const want = r && r.result && JSON.parse(r.result.value || "null");
    if (want) {
      if (shots) {
        fs.mkdirSync(shots, { recursive:true });
        const s = await send("Page.captureScreenshot", { format:"png" });
        fs.writeFileSync(path.join(shots, want + ".png"), Buffer.from(s.data, "base64"));
      }
      await send("Runtime.evaluate", { expression:"window.__shot = null" });
    }
  }
  ws.close(); chrome.kill(); srv.close();
  try { fs.rmSync(profile, { recursive:true, force:true }); } catch (e) {}
  if (result.exceptionDetails) {
    console.log("e2e: FAILED - the scenario threw: " + (result.exceptionDetails.exception ? result.exceptionDetails.exception.description : result.exceptionDetails.text));
    process.exit(1);
  }
  const out = result.result.value || {};
  let bad = 0;
  (out.checks || []).forEach(c => { if (!c.ok) bad++; console.log((c.ok ? "  ok   " : "  FAIL ") + c.name + (c.ok || !c.detail ? "" : "\n         " + c.detail)); });
  const pageErrors = errors.filter(e => !/favicon|assistant-logo|thinking\.gif|ERR_FILE_NOT_FOUND|404/.test(e));
  pageErrors.forEach(e => { bad++; console.log("  FAIL page error: " + e.split("\n")[0]); });
  console.log("e2e: " + (out.checks || []).length + " checks, " + bad + " failed");
  process.exit(bad ? 1 : 0);
})();
