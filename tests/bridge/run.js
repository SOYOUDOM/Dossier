// node tests/bridge/run.js
//
// The tray program's automation routes, for real: DossierBridge.cs is
// compiled (mcs under Mono, or the csc.exe in the Windows folder), started
// headless with no database and no runner, and driven the way the page
// drives it - through automations.js's own run loop - against a small API
// server made up here. What it checks is what was promised:
//
//   - a secret goes in and never comes out (not from /secrets, not in a
//     reply's text, not in an error, not as a saved value);
//   - a hidden value (the sign-in token) is used by the next step and never
//     reaches the page;
//   - a value cannot rewrite the request around it: placeholders are filled
//     once, escaped for where they land, a header cannot hold a line break,
//     the address stays under the connection's own, redirects are not
//     followed;
//   - a secret is not sent to a connection whose address changed;
//   - the conditions read the same as automations.js's
//     (tests/fixtures/auto-conditions.json);
//   - a script runs from the workspace's scripts folder only, and a value
//     with a character cmd.exe would act on is refused.
//
// With no compiler it says so and passes (exit 0). Every name, address and
// password here is made up.
"use strict";
const { spawn, spawnSync } = require("child_process");
const fs = require("fs"), path = require("path"), http = require("http"), os = require("os");
const A = require("../../automations.js");

const ROOT = path.join(__dirname, "..", "..");
const SRC = path.join(ROOT, "scripts", "bridge", "DossierBridge.cs");
const WIN = process.platform === "win32";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok:!!ok, detail:ok ? "" : String(detail === undefined ? "" : detail).slice(0, 700) }); };

function compiler(){
  if (WIN){
    const csc = [path.join(process.env.WINDIR || "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe"),
                 path.join(process.env.WINDIR || "C:\\Windows", "Microsoft.NET", "Framework", "v4.0.30319", "csc.exe")]
      .find(p => fs.existsSync(p));
    return csc ? { kind:"csc", exe:csc } : null;
  }
  const r = spawnSync("mcs", ["--version"], { encoding:"utf8" });
  const m = spawnSync("mono", ["--version"], { encoding:"utf8" });
  return (!r.error && r.status === 0 && !m.error && m.status === 0) ? { kind:"mcs", exe:"mcs" } : null;
}

/* ── the made-up API ─────────────────────────────────────────────────── */
const API = { seen:[], issued:"", jobPolls:0, elsewhereHits:0 };
const USER = "svc_test", PASS = "pw-Secret-42", KEY = "key-0123456789abcdef";
function readBody(req){ return new Promise(r => { const b = []; req.on("data", c => b.push(c)); req.on("end", () => r(Buffer.concat(b).toString("utf8"))); }); }
function startApi(){
  return new Promise(res => {
    const srv = http.createServer(async (req, rs) => {
      const body = await readBody(req);
      const u = new URL(req.url, "http://x");
      API.seen.push({ method:req.method, path:u.pathname, raw:req.url, headers:req.headers, body });
      const send = (st, obj, extra) => { rs.writeHead(st, Object.assign({ "Content-Type":"application/json" }, extra || {})); rs.end(typeof obj === "string" ? obj : JSON.stringify(obj)); };
      const bearer = String(req.headers.authorization || "").replace(/^Bearer\s+/, "");
      if (req.method === "POST" && u.pathname === "/login/api/token"){
        let j = {}; try { j = JSON.parse(body); } catch (e) { return send(400, { error:"bad json" }); }
        if (j.user !== USER || j.password !== PASS) return send(401, { error:"wrong user or password" });
        API.issued = "tok-" + Math.random().toString(36).slice(2) + "-" + Date.now();
        return send(200, { access_token:API.issued, refresh_token:"ref-" + Math.random().toString(36).slice(2, 12), token_type:"Bearer", expires_in:3600 });
      }
      if (u.pathname.indexOf("/policy/v2/") === 0){
        const rest = u.pathname.slice("/policy/v2".length);
        if (rest === "/echo") return send(200, { headers:req.headers, query:Object.fromEntries(u.searchParams), body });
        if (rest === "/redirect") return send(302, { moved:true }, { Location:"http://127.0.0.1:" + API.elsewherePort + "/steal" });
        if (rest === "/slow"){ await sleep(3000); return send(200, { late:true }); }
        if (rest === "/basic"){
          const want = "Basic " + Buffer.from(USER + ":" + PASS).toString("base64");
          return req.headers.authorization === want ? send(200, { ok:true, who:USER }) : send(401, { error:"no" });
        }
        if (rest === "/key") return req.headers["x-api-key"] === KEY ? send(200, { ok:true }) : send(403, { error:"no key" });
        if (rest === "/text") return send(200, "Reference: REF-998877 ready", { "Content-Type":"text/plain" });
        /* success and failure answer with different JSON - as real APIs do */
        let mm = /^\/maybe\/([^/]+)$/.exec(rest);
        if (mm) return mm[1] === "bad" ? send(404, { error:{ code:"NOT_FOUND", message:"Policy BAD not found" } })
                                       : send(200, { ok:true, data:{ ref:"R-" + mm[1] } });
        mm = /^\/soft\/([^/]+)$/.exec(rest);
        if (mm) return mm[1] === "lapsed" ? send(200, { success:false, errorMessage:"Policy is lapsed", traceId:"T-1" })
                                          : send(200, { success:true, data:{ ref:"S-" + mm[1] } });
        const signedIn = bearer === API.issued && !!API.issued;
        if (/^\/(policies|jobs|whoami)/.test(rest) && !signedIn) return send(401, { error:"not signed in" });
        let m = /^\/policies\/([^/]+)\/coi$/.exec(rest);
        if (m && req.method === "POST") return send(202, { jobId:"J-77", policy:decodeURIComponent(m[1]) });
        if (rest === "/jobs/J-77"){
          API.jobPolls++;
          return send(200, API.jobPolls < 3 ? { state:"RUNNING" }
                                            : { state:"DONE", coi:{ number:"COI-2026-0042", url:"https://files.example.local/coi/COI-2026-0042.pdf" } });
        }
        if (rest === "/whoami") return send(200, { user:USER, token:bearer });
      }
      send(404, { error:"no such thing" });
    }).listen(0, "127.0.0.1", () => res(srv));
  });
}
function startElsewhere(){
  return new Promise(res => {
    const srv = http.createServer((req, rs) => { API.elsewhereHits++; rs.writeHead(200); rs.end("stolen"); }).listen(0, "127.0.0.1", () => res(srv));
  });
}

(async () => {
  const cc = compiler();
  if (!cc){ console.log("bridge: skipped - no C# compiler (mcs with mono, or the Windows csc.exe)"); process.exit(0); }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kalkech-bridge-"));
  const exe = path.join(tmp, "DossierBridge.exe");
  const args = cc.kind === "csc"
    ? ["/nologo", "/target:winexe", "/langversion:5", "/reference:System.Data.dll", "/reference:System.Windows.Forms.dll",
       "/reference:System.Drawing.dll", "/reference:System.Security.dll", "/out:" + exe, SRC]
    : ["-nologo", "-target:winexe", "-langversion:5", "-r:System.Windows.Forms.dll", "-r:System.Drawing.dll", "-r:System.Data.dll",
       "-r:System.Security.dll", "-out:" + exe, SRC];
  const built = spawnSync(cc.exe, args, { encoding:"utf8" });
  if (built.status !== 0){ console.log("bridge: FAILED - it did not compile\n" + built.stdout + built.stderr); process.exit(1); }
  check("it compiles as C# 5 with System.Security (" + cc.kind + ")", true);
  /* csc reads a source file with no byte-order mark in the PC's own code
     page, so a "•" in a string would arrive as three other characters */
  const wide = fs.readFileSync(SRC, "utf8").split("\n").map((l, i) => [i + 1, l.split("//")[0]]).filter(x => /[^\x00-\x7e]/.test(x[1]));
  check("its code is plain ASCII (non-ASCII only in comments)", !wide.length, "lines " + wide.map(x => x[0]).join(", "));

  /* a workspace of its own, with scripts */
  const ws = path.join(tmp, "workspace");
  const sd = path.join(ws, "scripts");
  fs.mkdirSync(sd, { recursive:true });
  fs.writeFileSync(path.join(ws, "dossier.json"), "{}");
  const ext = WIN ? ".bat" : ".sh";
  const sh = s => WIN ? s.bat : s.sh;
  fs.writeFileSync(path.join(sd, "show-policy" + ext), sh({
    bat:"@echo off\r\necho policy=%KK_POLICY%\r\necho first=%~1\r\necho {\"ref\":\"R-%~1\"}\r\nexit /b 0\r\n",
    sh:"echo \"policy=$KK_POLICY\"\necho \"first=$1\"\necho \"{\\\"ref\\\":\\\"R-$1\\\"}\"\nexit 0\n" }));
  fs.writeFileSync(path.join(sd, "fails" + ext), sh({ bat:"@echo off\r\necho broken 1>&2\r\nexit /b 3\r\n", sh:"echo broken 1>&2\nexit 3\n" }));
  fs.writeFileSync(path.join(sd, "slow" + ext), sh({ bat:"@echo off\r\nping -n 8 127.0.0.1 >nul\r\n", sh:"sleep 8\n" }));
  fs.writeFileSync(path.join(sd, "leaks" + ext), sh({ bat:"@echo off\r\necho the password is %KK_PASS%\r\n", sh:"echo \"the password is $KK_PASS\"\n" }));
  fs.writeFileSync(path.join(tmp, "outside" + ext), sh({ bat:"@echo off\r\necho outside\r\n", sh:"echo outside\n" }));

  const api = await startApi(), other = await startElsewhere();
  API.elsewherePort = other.address().port;
  const apiBase = "http://127.0.0.1:" + api.address().port;
  const secretsFile = path.join(tmp, "secrets.dat");
  const env = Object.assign({}, process.env, { DOSSIER_DB:"KalKechTest" + Date.now().toString(36), DOSSIER_NODB:"1",
    DOSSIER_NORUNNER:"1", DOSSIER_OPEN:"0", KALKECH_SECRETS:secretsFile });
  ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy", "NO_PROXY", "no_proxy"].forEach(k => delete env[k]);
  const bridge = cc.kind === "csc" ? spawn(exe, [ws, "--headless"], { env, stdio:"ignore" })
                                   : spawn("mono", [exe, ws, "--headless"], { env, stdio:"ignore" });
  let hand = null;
  for (let i = 0; i < 80 && !hand; i++){
    await sleep(250);
    try { hand = JSON.parse(fs.readFileSync(path.join(ws, ".bridge.json"), "utf8")); } catch (e) {}
  }
  const finish = code => {
    try { bridge.kill(); } catch (e) {}
    api.close(); other.close();
    try { fs.rmSync(tmp, { recursive:true, force:true }); } catch (e) {}
    let bad = 0;
    checks.forEach(c => { if (!c.ok) bad++; console.log((c.ok ? "  ok   " : "  FAIL ") + c.name + (c.ok || !c.detail ? "" : "\n         " + c.detail)); });
    console.log("bridge: " + checks.length + " checks, " + bad + " failed");
    process.exit(code || (bad ? 1 : 0));
  };
  if (!hand){ check("the tray program starts and writes .bridge.json", false, "no handshake"); return finish(1); }
  const B = "http://127.0.0.1:" + hand.port;
  const H = { "X-Dossier-Token":hand.token, "Content-Type":"application/json" };
  const post = async (p, body, headers) => {
    const r = await fetch(B + p, { method:"POST", headers:headers || H, body:typeof body === "string" ? body : JSON.stringify(body) });
    let j = null; const t = await r.text(); try { j = JSON.parse(t); } catch (e) {}
    return { status:r.status, json:j, text:t };
  };
  const call = async (op, body) => (await post("/auto/" + op, body)).json;
  const everything = [];         /* every answer the page got, to search for leaks */
  const callLogged = async (op, body) => { const r = await call(op, body); everything.push(JSON.stringify(r)); return r; };

  try {
    /* ── the door ─────────────────────────────────────────────────────── */
    let r = await fetch(B + "/auto/info", { headers:{ "X-Dossier-Token":hand.token } });
    let j = await r.json();
    check("/auto/info answers: the workspace, scripts, which platform", j.ok && j.workspace === "workspace" && j.scripts === true && j.windows === WIN, JSON.stringify(j));
    r = await fetch(B + "/auto/step", { method:"POST", body:"{}" });
    check("no token, no automations (403)", r.status === 403, r.status);
    r = await fetch(B + "/secrets?conn=Cauth", {});
    check("no token, no secrets (403)", r.status === 403, r.status);
    check("a body that is not JSON is refused", (await post("/auto/step", "{not json")).status === 400);
    check("a run id that is not one is refused", (await post("/auto/step", { run:"../x" })).status === 400);

    /* ── secrets: in, never out ───────────────────────────────────────── */
    const CAUTH = A.normConn({ id:"Cauth", name:"Login (test)", base:apiBase + "/login/api", auth:"none", extra:["user", "password"], proxy:"none", timeout:10 });
    const CPOL = A.normConn({ id:"Cpol", name:"Policy API (test)", base:apiBase + "/policy/v2", auth:"none", proxy:"none", timeout:10 });
    const CBASIC = A.normConn({ id:"Cbasic", name:"Basic (test)", base:apiBase + "/policy/v2", auth:"basic", proxy:"none", timeout:10 });
    const CKEY = A.normConn({ id:"Ckey", name:"Key (test)", base:apiBase + "/policy/v2", auth:"header", header:"X-API-Key", proxy:"none", timeout:10 });
    const CSLOW = A.normConn({ id:"Cslow", name:"Slow (test)", base:apiBase + "/policy/v2", auth:"none", proxy:"none", timeout:1 });
    const setSecret = (conn, name, value) => post("/secrets", { conn:conn.id, base:conn.base, name, value });
    const s1 = await setSecret(CAUTH, "user", USER), s2 = await setSecret(CAUTH, "password", PASS);
    await setSecret(CBASIC, "username", USER); await setSecret(CBASIC, "password", PASS); await setSecret(CKEY, "apiKey", KEY);
    check("a secret is saved (write-only)", s1.json && s1.json.ok && s2.json && s2.json.ok, s1.text + s2.text);
    r = await fetch(B + "/secrets?conn=Cauth&base=" + encodeURIComponent(CAUTH.base), { headers:{ "X-Dossier-Token":hand.token } });
    const listed = await r.text();
    j = JSON.parse(listed);
    check("asking which secrets are saved says which - never what", j.ok && j.names.password.set && j.names.password.same && j.names.user.set &&
          listed.indexOf(PASS) < 0 && listed.indexOf(USER) < 0, listed);
    const onDisk = fs.readFileSync(secretsFile, "utf8");
    check("the file they are kept in holds no password in plain text", onDisk.indexOf(PASS) < 0 && onDisk.indexOf(KEY) < 0 &&
          onDisk.indexOf(Buffer.from(PASS).toString("base64")) < 0, onDisk.slice(0, 300));
    const bad = await post("/secrets", { conn:"Cauth", base:"ftp://x", name:"password", value:"x" });
    check("a secret for a connection with no http(s) address is refused", bad.status === 400, bad.text);

    /* ── the owner's example: sign in, then call with the token ───────── */
    const coi = A.normAuto({
      id:"Acoi", name:"Regenerate COI",
      inputs:[{ key:"policy", label:"Policy number", pattern:"[A-Z]\\d{5}[A-Z]\\d{2}" }],
      steps:[
        { kind:"http", name:"Sign in", conn:"Cauth", method:"POST", path:"/token", bodyType:"json",
          body:'{"user":"{{secret.user}}","password":"{{secret.password}}"}',
          save:[{ name:"token", from:"json", path:"access_token", show:"hidden" }, { name:"kind", from:"json", path:"token_type", show:"me" }] },
        { kind:"http", name:"Ask for a new COI", conn:"Cpol", method:"POST", path:"/policies/{{input.policy}}/coi",
          headers:[["Authorization", "Bearer {{token}}"]],
          save:[{ name:"job", from:"json", path:"jobId", show:"me" }], expect:"202" },
        { kind:"http", name:"Wait until it is ready", conn:"Cpol", method:"GET", path:"/jobs/{{job}}",
          headers:[["Authorization", "Bearer {{token}}"]],
          save:[{ name:"state", from:"json", path:"state", show:"me" }, { name:"coiNumber", from:"json", path:"coi.number", show:"ai" },
                { name:"status", from:"status", show:"me" }].slice(0, 2),
          repeat:{ until:'{{state}} == "DONE"', times:6, every:1 } }],
      result:"COI {{coiNumber}} is ready."
    });
    const values = Object.assign({ "input.policy":"P10234X56" }, A.builtins(new Date(), { code:"D-0153" }));
    const R = await A.run(coi, { conns:[CAUTH, CPOL], call:callLogged, values, sleep:async () => true, ask:async () => true,
                                 tick:() => {}, stopped:() => false });
    check("the run: signed in, asked, waited until DONE", R.state === "ok" && R.steps.map(s => s.state).join() === "ok,ok,ok" && R.steps[2].tries === 3,
          JSON.stringify(R.steps));
    check("the token was used by the next steps (the API saw it)",
          API.seen.filter(x => x.path.indexOf("/policy/v2/") === 0 && x.headers.authorization === "Bearer " + API.issued).length === 4,
          JSON.stringify(API.seen.map(x => x.path + " " + x.headers.authorization)));
    check("the policy number went into the path", API.seen.some(x => x.path === "/policy/v2/policies/P10234X56/coi"));
    check("the run shows the values it may, and names the hidden one only",
          R.values.coiNumber.v === "COI-2026-0042" && R.values.coiNumber.show === "ai" && R.values.job.v === "J-77" &&
          R.values.kind.v === "Bearer" && R.hidden.join() === "token" && R.result === "COI COI-2026-0042 is ready.", JSON.stringify(R));
    const all = everything.join("\n") + JSON.stringify(R);
    check("the token, the password and the user name never reached the page",
          all.indexOf(API.issued) < 0 && all.indexOf(PASS) < 0 && all.indexOf("svc_test") < 0, all.slice(0, 600));

    /* the reply's text, when it is asked for, is redacted */
    const T = await A.run(coi, { conns:[CAUTH, CPOL], call:callLogged, values, upTo:0, test:true, sleep:async () => true,
                                 ask:async () => true, tick:() => {}, stopped:() => false });
    const ex = T.steps[0].excerpt || "";
    check("'Try it' shows the reply with the token and the refresh token masked",
          /"access_token":"\u2022\u2022\u2022\u2022"/.test(ex) && /"refresh_token":"\u2022\u2022\u2022\u2022"/.test(ex) &&
          /"token_type":"Bearer"/.test(ex) && ex.indexOf(API.issued) < 0, ex);

    /* once the run has ended its hidden values are gone */
    const after = await call("step", { run:R.id, kind:"http", conn:A.connWire(CPOL), values:{}, step:A.stepWire(A.normStep(
      { kind:"http", conn:"Cpol", path:"/whoami", headers:[["Authorization", "Bearer {{token}}"]] }), {}) });
    check("after the run ends, its hidden token is gone", after && after.ok === false && /\{\{token\}\} has no value/.test(after.error), JSON.stringify(after));

    /* ── a value cannot rewrite the request around it ─────────────────── */
    const one = async (conn, step, vals, extra) => {
      const id = "t" + Math.random().toString(36).slice(2, 10);
      const ans = await callLogged("step", Object.assign({ run:id, kind:step.kind || "http", conn:A.connWire(conn), values:vals || {},
                                          step:A.stepWire(A.normStep(step), { scripts:[] }) }, extra || {}));
      await call("end", { run:id });
      return ans;
    };
    API.seen.length = 0;
    let a = await one(CPOL, { conn:"Cpol", method:"POST", path:"/echo", bodyType:"json", body:'{"p":"{{input.p}}","q":"{{input.q}}"}' },
                      { "input.p":"{{secret.password}}", "input.q":'A"B\\C' });
    let seen = API.seen.pop() || {};
    let echoed = null; try { echoed = JSON.parse(seen.body); } catch (e) {}
    check("a value holding '{{secret.password}}' stays text (filled in once)", a.ok && echoed && echoed.p === "{{secret.password}}", seen.body);
    check("a value with quotes and backslashes stays inside its JSON string", echoed && echoed.q === 'A"B\\C', seen.body);
    a = await one(CPOL, { conn:"Cpol", method:"GET", path:"/echo/{{input.p}}" }, { "input.p":"../../login/api/token" });
    seen = API.seen.pop() || {};
    check("a value in the path stays one piece of it (%-escaped)", seen.raw === "/policy/v2/echo/..%2F..%2Flogin%2Fapi%2Ftoken", seen.raw);
    a = await one(CPOL, { conn:"Cpol", method:"GET", path:"/{{input.p|raw}}" }, { "input.p":"../../login/api/token" });
    check("an address that comes out outside the connection's is refused", a.ok === false && /outside Policy API/.test(a.error), JSON.stringify(a));
    const hits = API.seen.length;
    a = await one(CPOL, { conn:"Cpol", method:"GET", path:"/echo", headers:[["X-Ref", "{{input.p}}"]] }, { "input.p":"x\r\nX-Evil: 1" });
    check("a header value with a line break is refused, and nothing is sent", a.ok === false && /line break/.test(a.error) && API.seen.length === hits, JSON.stringify(a));
    a = await one(CPOL, { conn:"Cpol", method:"GET", path:"/echo", headers:[["Host", "evil.example"]] }, {});
    check("a Host header is KalKech's own", a.ok === false && /set by KalKech/.test(a.error), JSON.stringify(a));
    a = await one(CPOL, { conn:"Cpol", method:"GET", path:"/echo", query:[["q", "{{input.q}}"], ["n", "1 2&3"]] }, { "input.q":"a&b=c" });
    seen = API.seen.pop() || {};
    check("query values are escaped, so one cannot add another", seen.raw === "/policy/v2/echo?q=a%26b%3Dc&n=1%202%263", seen.raw);
    a = await one(CPOL, { conn:"Cpol", method:"GET", path:"/redirect" }, {});
    check("a redirect is not followed - and says where it pointed", a.ok === false && a.status === 302 && /redirect/.test(a.error) && API.elsewhereHits === 0, JSON.stringify(a));
    a = await one(CPOL, { conn:"Cpol", method:"GET", path:"/echo", body:"x", bodyType:"json" }, {});
    check("a GET with a body is refused", a.ok === false && /cannot carry a body/.test(a.error), JSON.stringify(a));
    a = await one(CPOL, { conn:"Cpol", method:"POST", path:"/echo", bodyType:"json", body:'{"a":{{input.n}}}' }, { "input.n":"1, \"admin\": true" });
    check("a body that is not JSON once filled in is not sent", a.ok === false && /not valid JSON/.test(a.error), JSON.stringify(a));
    a = await one(CPOL, { conn:"Cpol", method:"GET", path:"/echo/{{nothing}}" }, {});
    check("a value nothing gave is an error, not an empty piece of address", a.ok === false && /\{\{nothing\}\} has no value/.test(a.error), JSON.stringify(a));

    /* ── the connection signs in by itself; secrets stay out of replies ── */
    a = await one(CBASIC, { conn:"Cbasic", method:"GET", path:"/basic" }, {});
    check("Basic sign-in from the connection's secrets", a.ok === true && a.status === 200, JSON.stringify(a));
    a = await one(CKEY, { conn:"Ckey", method:"GET", path:"/key" }, {});
    check("an API key in its header from the connection's secret", a.ok === true, JSON.stringify(a));
    a = await one(CBASIC, { conn:"Cbasic", method:"GET", path:"/echo", query:[["k", "{{secret.password}}"]],
                            save:[{ name:"auth", from:"json", path:"headers.authorization", show:"ai" },
                                  { name:"q", from:"json", path:"query.k", show:"me" }] }, {}, { test:true });
    const basic64 = Buffer.from(USER + ":" + PASS).toString("base64");
    const txt = JSON.stringify(a);
    check("an API that echoes the sign-in back: the reply's text is masked", a.ok && txt.indexOf(basic64) < 0 && txt.indexOf(PASS) < 0, txt.slice(0, 500));
    check("...and saving the echo as a shown value keeps it hidden instead",
          !("auth" in a.saved) && !("q" in a.saved) && a.hidden.indexOf("auth") >= 0 && a.redacted.indexOf("auth") >= 0 && a.redacted.indexOf("q") >= 0, txt.slice(0, 500));
    check("...and the address it shows has the secret masked", !/pw-Secret/.test(a.url) && /k=\u2022\u2022\u2022\u2022/.test(a.url), a.url);

    /* a connection whose address changed does not get its secrets */
    const moved = Object.assign({}, CBASIC, { base:apiBase + "/policy" });
    a = await one(moved, { conn:"Cbasic", method:"GET", path:"/v2/basic" }, {});
    check("a secret is not sent to a connection whose address changed", a.ok === false && /has changed since/.test(a.error) && txt.indexOf(PASS) < 0, JSON.stringify(a));
    a = await one(CPOL, { conn:"Cpol", method:"GET", path:"/echo", headers:[["X-P", "{{secret.password}}"]] }, {});
    check("a secret belongs to its own connection", a.ok === false && /not one of the secrets/.test(a.error), JSON.stringify(a));

    a = await one(CSLOW, { conn:"Cslow", method:"GET", path:"/slow" }, {});
    check("no answer within the connection's time: stopped, and said", a.ok === false && /no answer within 1 second/.test(a.error), JSON.stringify(a));
    a = await one(CPOL, { conn:"Cpol", method:"GET", path:"/text", save:[{ name:"ref", from:"regex", path:"Reference: (\\S+)", show:"ai" },
                                                                          { name:"none", from:"regex", path:"nothing (\\d+)", show:"me" }] }, {});
    check("saving with a pattern; one that finds nothing is reported missing", a.ok && a.saved.ref === "REF-998877" && a.missing.join() === "none", JSON.stringify(a));
    a = await one(CPOL, { conn:"Cpol", method:"GET", path:"/nope", expect:"2xx,404", save:[{ name:"st", from:"status", show:"me" }] }, {});
    check("'expect' decides what counts as success (2xx,404)", a.ok && a.status === 404 && a.saved.st === "404", JSON.stringify(a));

    /* ── success and failure have different replies (5.23) ─────────────── */
    const outcomeSaves = [{ name:"ref", from:"json", path:"data.ref", show:"ai", on:"ok" },
                          { name:"errMsg", from:"json", path:"error.message", show:"ai", on:"fail" },
                          { name:"code", from:"status", show:"me", on:"any" }];
    a = await one(CPOL, { conn:"Cpol", method:"GET", path:"/maybe/bad", save:outcomeSaves, reply:"me" }, {});
    check("(5.23) a failed step keeps the values meant for failure, read from its own error reply",
          a.ok === false && a.status === 404 && a.saved.errMsg === "Policy BAD not found" && a.saved.code === "404" && !("ref" in a.saved) &&
          a.missing.length === 0, JSON.stringify(a));
    check("...and its whole reply, when the step keeps it", /"code":"NOT_FOUND"/.test(a.reply || "") && a.replyCut === false, a.reply);
    a = await one(CPOL, { conn:"Cpol", method:"GET", path:"/maybe/7", save:outcomeSaves }, {});
    check("...a step that worked keeps the success values, not the failure ones, and no reply unless asked",
          a.ok === true && a.saved.ref === "R-7" && !("errMsg" in a.saved) && a.saved.code === "200" && !("reply" in a), JSON.stringify(a));
    const softSaves = [{ name:"success", from:"json", path:"success", show:"me", on:"any" },
                       { name:"ref", from:"json", path:"data.ref", show:"ai", on:"ok" },
                       { name:"why", from:"json", path:"errorMessage", show:"ai", on:"fail" }];
    a = await one(CPOL, { conn:"Cpol", method:"GET", path:"/soft/lapsed", save:softSaves, okWhen:"{{success}} == true" }, {});
    check("(5.23) 'success also needs': a 200 that says it failed is a failure, with its own values",
          a.ok === false && a.status === 200 && /the reply says it did not work/.test(a.error) && a.saved.why === "Policy is lapsed" &&
          a.saved.success === "false" && !("ref" in a.saved), JSON.stringify(a));
    a = await one(CPOL, { conn:"Cpol", method:"GET", path:"/soft/9", save:softSaves, okWhen:"{{success}} == true" }, {});
    check("...and one that says it worked is a success", a.ok === true && a.saved.ref === "S-9" && !("why" in a.saved), JSON.stringify(a));
    a = await one(CPOL, { conn:"Cpol", method:"GET", path:"/soft/9", save:softSaves, okWhen:"{{success}} ==" }, {});
    check("...a test that cannot be read fails the step and says why", a.ok === false && /success also needs/.test(a.error), JSON.stringify(a));
    /* the whole reply of a sign-in: the token it saved hidden is masked in it */
    const sid = "r" + Math.random().toString(36).slice(2, 10);
    a = await callLogged("step", { run:sid, kind:"http", conn:A.connWire(CAUTH), values:{},
      step:A.stepWire(A.normStep({ kind:"http", conn:"Cauth", method:"POST", path:"/token", bodyType:"json",
        body:'{"user":"{{secret.user}}","password":"{{secret.password}}"}', reply:"ai",
        save:[{ name:"token", from:"json", path:"access_token", show:"hidden" }] }), {}) });
    await call("end", { run:sid });
    check("(5.23) the whole reply of a sign-in: the token and the refresh token are masked in it",
          a.ok && /"access_token":"\u2022\u2022\u2022\u2022"/.test(a.reply) && /"refresh_token":"\u2022\u2022\u2022\u2022"/.test(a.reply) &&
          a.reply.indexOf(API.issued) < 0 && /"expires_in":3600/.test(a.reply), a.reply);
    /* end to end: the failure line is written from the error reply */
    const failing = A.normAuto({ name:"Look up", inputs:[{ key:"p", label:"Policy" }], resultFail:"Not found: {{errMsg}}", result:"Found {{ref}}",
      steps:[{ kind:"http", conn:"Cpol", method:"GET", path:"/maybe/{{input.p}}", save:outcomeSaves, reply:"ai" }] });
    const FR = await A.run(failing, { conns:[CPOL], call:callLogged, values:{ "input.p":"bad" }, sleep:async () => true,
                                      ask:async () => true, tick:() => {}, stopped:() => false });
    const FS2 = A.split(failing, FR);
    check("...a run that fails ends with its failure line, and the assistant may read the reply it was given",
          FR.state === "failed" && FR.result === "Not found: Policy BAD not found" && FR.steps[0].replyShow === "ai" &&
          FS2.replies.length === 1 && /NOT_FOUND/.test(FS2.replies[0].text) && FS2.resultForAI === "Not found: Policy BAD not found",
          JSON.stringify({ r:FR.result, s:FR.steps[0], sp:FS2 }).slice(0, 600));

    /* ── conditions: the same answers as the page ──────────────────────── */
    const cases = JSON.parse(fs.readFileSync(path.join(ROOT, "tests", "fixtures", "auto-conditions.json"), "utf8")).cases;
    const wrong = [];
    for (const k of cases){
      const ans = await call("check", { run:"cond" + Math.random().toString(36).slice(2, 8), when:k.expr, values:k.values });
      const got = ans && ans.ok ? ans.result : "error";
      if ((k.error && got !== "error") || (!k.error && got !== k.result)) wrong.push(k.expr + " -> " + JSON.stringify(ans));
    }
    check("conditions: every shared case (" + cases.length + ") reads the same as automations.js", !wrong.length, wrong.join("\n"));
    a = await call("check", { run:"cond-secret", when:'{{secret.password}} == "x"', values:{}, conn:A.connWire(CAUTH) });
    check("a condition cannot read a secret", a.ok === false && /cannot read a secret/.test(a.error), JSON.stringify(a));

    /* ── scripts ───────────────────────────────────────────────────────── */
    const sstep = (file, args, extra) => Object.assign({ kind:"script", file, args, timeout:30, expect:"0" }, extra || {});
    const script = async (st, vals, conn) => {
      const id = "s" + Math.random().toString(36).slice(2, 10);
      const ans = await callLogged("step", { run:id, kind:"script", conn:conn ? A.connWire(conn) : null, values:vals || {}, step:st });
      await call("end", { run:id });
      return ans;
    };
    a = await script(sstep("show-policy" + ext, [["policy", "{{input.policy}}"]],
                           { save:[{ name:"out", from:"output", show:"me" }, { name:"ref", from:"regex", path:"\"ref\":\"([^\"]+)\"", show:"ai" },
                                   { name:"code", from:"exit", show:"me" }] }), { "input.policy":"P10234X56" });
    check("a script runs with its value as %1 and as KK_POLICY", a.ok && /policy=P10234X56/.test(a.saved.out) && /first=P10234X56/.test(a.saved.out) &&
          a.saved.ref === "R-P10234X56" && a.saved.code === "0" && a.exit === 0, JSON.stringify(a));
    a = await script(sstep("show-policy" + ext, [["policy", "{{input.policy}}"]], { reply:"me" }), { "input.policy":"P10234X56" });
    check("(5.23) a script step can keep its whole output", a.ok && /policy=P10234X56/.test(a.reply) && /first=P10234X56/.test(a.reply), JSON.stringify(a));
    a = await script(sstep("show-policy" + ext, [["policy", "{{input.policy}}"]]), { "input.policy":"A1 & del *" });
    check("a value with & in it is refused, not passed", a.ok === false && /has & in it/.test(a.error), JSON.stringify(a));
    for (const v of ["50%", "a|b", "x>y", 'q"q', "(x)", "!x!", "a^b"]){
      a = await script(sstep("show-policy" + ext, [["policy", v]]), {});
      if (a.ok !== false){ check("refused: " + v, false, JSON.stringify(a)); break; }
    }
    check("...and so is each of % | > \" ( ) ! ^", true);
    a = await script(sstep("../outside" + ext, []), {});
    check("a script outside the scripts folder is not run", a.ok === false && /not a script this can run/.test(a.error), JSON.stringify(a));
    a = await script(sstep("missing" + ext, []), {});
    check("a script that is not there says so", a.ok === false && /there is no missing/.test(a.error), JSON.stringify(a));
    a = await script(sstep("fails" + ext, []), {});
    check("a script that fails: its exit code and what it printed", a.ok === false && a.exit === 3 && /exit code 3/.test(a.error) && /broken/.test(a.excerpt), JSON.stringify(a));
    a = await script(sstep("slow" + ext, [], { timeout:2 }), {});
    check("a script that runs too long is stopped", a.ok === false && /longer than 2 seconds/.test(a.error), JSON.stringify(a));
    a = await script(sstep("leaks" + ext, [["pass", "{{secret.password}}"]], { save:[{ name:"out", from:"output", show:"ai" }] }), {}, CAUTH);
    check("a script handed a secret that prints it: masked, and its output kept hidden",
          a.ok && JSON.stringify(a).indexOf(PASS) < 0 && a.hidden.indexOf("out") >= 0 && a.redacted.indexOf("out") >= 0, JSON.stringify(a));

    /* ── the page never got a secret, a token or a password ──────────── */
    const page = everything.join("\n");
    check("in everything the page was sent: no password, key, token or Basic pair",
          page.indexOf(PASS) < 0 && page.indexOf(KEY) < 0 && page.indexOf(API.issued) < 0 && page.indexOf(basic64) < 0, "found in the answers");

    r = await fetch(B + "/secrets?conn=Cauth", { method:"DELETE", headers:{ "X-Dossier-Token":hand.token } });
    j = await r.json();
    r = await fetch(B + "/secrets?conn=Cauth&base=" + encodeURIComponent(CAUTH.base), { headers:{ "X-Dossier-Token":hand.token } });
    const left = await r.json();
    check("removing a connection's secrets removes them", j.ok && j.removed === 2 && Object.keys(left.names).length === 0, JSON.stringify([j, left]));
  } catch (e) {
    check("the harness itself", false, e && e.stack || e);
  }
  finish(0);
})();
