// node --test
//
// Automations (automations.js): the designs you build in Menu → Automations,
// the checks on them, the placeholder and condition rules, what the
// assistant may see, and the loop that runs the steps. The tray program that
// really calls the APIs is tested apart, under tests/bridge/run.js; here it
// is stood in for by a small fake that answers the way it does.
// Every name, address and value in this file is made up.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const A = require("../automations.js");

const CONDS = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "auto-conditions.json"), "utf8")).cases;

const CONN_AUTH = { id:"Cauth", name:"Login service (UAT)", base:"https://login.example.local/api", auth:"basic" };
const CONN_POL = { id:"Cpol", name:"Policy API (UAT)", base:"https://policy.example.local/v2", auth:"none", extra:["clientId"] };

/* the design from the owner's example, with made-up addresses: sign in,
   keep the token hidden, regenerate the certificate with it, wait until
   the job says it is done */
function coi(){
  return A.normAuto({
    id:"Acoi", name:"Regenerate COI", about:"Makes a new certificate of insurance for a policy.",
    inputs:[{ key:"policy", label:"Policy number", pattern:"[A-Z]\\d{5}[A-Z]\\d{2}", example:"P10234X56" }],
    steps:[
      { kind:"http", name:"Sign in", conn:"Cauth", method:"POST", path:"/token", bodyType:"json",
        body:'{"user":"{{secret.username}}","password":"{{secret.password}}"}',
        save:[{ name:"token", from:"json", path:"access_token", show:"hidden" }] },
      { kind:"http", name:"Ask for a new COI", conn:"Cpol", method:"POST", path:"/policies/{{input.policy}}/coi",
        headers:[["Authorization", "Bearer {{token}}"], ["X-Client", "{{secret.clientId}}"]],
        save:[{ name:"job", from:"json", path:"jobId", show:"me" }] },
      { kind:"http", name:"Wait until it is ready", conn:"Cpol", method:"GET", path:"/jobs/{{job}}",
        headers:[["Authorization", "Bearer {{token}}"]],
        save:[{ name:"state", from:"json", path:"state", show:"me" }, { name:"coiNumber", from:"json", path:"coi.number", show:"ai" }],
        repeat:{ until:'{{state}} == "DONE"', times:5, every:2 } }
    ],
    result:"COI {{coiNumber}} is ready for {{input.policy}} (job {{job}})."
  });
}

/* ── conditions ──────────────────────────────────────────────────────── */
test("conditions: every shared case gives the same answer", () => {
  CONDS.forEach(c => {
    const r = A.test(c.expr, c.values);
    if (c.error) assert.ok(r.error, c.expr + " should be refused, got " + JSON.stringify(r));
    else assert.equal(r.result, c.result, c.expr + " with " + JSON.stringify(c.values));
  });
});
test("conditions: the names a condition reads", () => {
  assert.deepEqual(A.condNames('{{a}} == 1 and {{input.env|lower}} != "x"').map(p => p.full), ["a", "input.env"]);
  assert.deepEqual(A.condNames("{{a}} ==").map(p => p.full), ["a"], "a half-written one still says what it reads");
  assert.deepEqual(A.condNames('{{a}} == "open'), [], "one that cannot be read reads nothing");
});

/* ── placeholders ────────────────────────────────────────────────────── */
test("placeholders: read with their filters; a bad one is marked, not guessed", () => {
  const ps = A.placeholders("/p/{{input.policy|upper}}/{{ token }}/{{secret.password}}/{{record.code}}/{{a b}}/{{x|shout}}");
  assert.deepEqual(ps.map(p => p.full || p.raw), ["input.policy", "token", "secret.password", "record.code", "a b", "x"]);
  assert.deepEqual(ps[0].filters, ["upper"]);
  assert.equal(ps[4].bad, "name");
  assert.equal(ps[5].bad, "filter");
});
test("show: hidden values and secrets are never filled in, only named", () => {
  const s = A.show("{{input.policy|lower}} {{token}} {{secret.password}} {{job}} {{nope}}",
                   { "input.policy":"P10234X56", token:"tok-1", job:"J-1" }, ["token"]);
  assert.equal(s, "p10234x56 \uD83D\uDD12token \uD83D\uDD12secret.password J-1 {{nope}}");
  assert.ok(!/tok-1/.test(s));
});
test("show: one pass - a value that contains a placeholder stays text", () => {
  assert.equal(A.show("{{a}}", { a:"{{secret.password}}", "secret.password":"pw" }), "{{secret.password}}");
  assert.equal(A.show("{{a|base64}}", { a:"user:pass" }), Buffer.from("user:pass").toString("base64"));
});
test("built-ins: today, now, time, uuid and the record", () => {
  const b = A.builtins(new Date(2026, 9, 29, 9, 5, 7), { code:"D-0153", ticket:"INC0012345", title:"COI missing", system:"Portal" });
  assert.equal(b.today, "2026-10-29");
  assert.equal(b.time, "09:05");
  assert.match(b.now, /^2026-10-29T09:05:07[+-]\d\d:\d\d$/);
  assert.match(b.uuid, /^[0-9a-f-]{36}$/);
  assert.equal(b["record.code"], "D-0153");
  assert.equal(b["record.ticket"], "INC0012345");
});

/* ── designs from anywhere are made safe to run ──────────────────────── */
test("normalising: garbage in, a design the runner was written for out", () => {
  const st = A.normStore({ aiCan:"yes", conns:[{ id:"bad id!", base:"https://x.example.local/a/", auth:"magic", timeout:9999 }],
                           list:[{ name:"", steps:[{ kind:"rm -rf" }, { kind:"wait", seconds:-5 }, { kind:"http", method:"TRACE",
                             repeat:{ times:1000, every:0 }, save:[{ name:"x", from:"cookie", show:"everyone" }, { from:"json" }] }],
                             inputs:[{ key:"p", kind:"secret", pattern:".*", example:"hunter2" }, { label:"no key" }] }],
                           runs:new Array(90).fill({ state:"running", values:{ a:{ v:"1", show:"hidden" }, b:{ v:"2", show:"ai" } } }) });
  assert.equal(st.aiCan, true);
  assert.match(st.conns[0].id, /^C/);
  assert.equal(st.conns[0].base, "https://x.example.local/a");
  assert.equal(st.conns[0].auth, "none");
  assert.equal(st.conns[0].timeout, A.LIMIT.http);
  const a = st.list[0];
  assert.equal(a.name, "New automation");
  assert.equal(a.steps[0].kind, "http");
  assert.equal(a.steps[1].seconds, 1);
  assert.equal(a.steps[2].method, "GET");
  assert.deepEqual(a.steps[2].repeat, { until:"", times:A.LIMIT.times, every:1 });
  assert.deepEqual(a.steps[2].save, [{ name:"x", from:"json", path:"", show:"me", on:"ok" }]);
  assert.equal(a.steps[2].okWhen, "");
  assert.equal(a.steps[2].reply, "", "the whole reply is not kept unless asked for");
  assert.equal(a.inputs.length, 1);
  assert.equal(a.inputs[0].pattern, "", "a secret input keeps no pattern or example");
  assert.equal(a.inputs[0].example, "");
  assert.equal(a.ask, true);
  assert.equal(a.ai, true);
  assert.equal(st.runs.length, A.LIMIT.runs);
  assert.equal(st.runs[0].state, "stopped", "a run still going when the page closed is a stopped one");
  assert.deepEqual(Object.keys(st.runs[0].values), ["b"], "a hidden value is never kept in the history");
});

/* ── checking a design ───────────────────────────────────────────────── */
const codes = probs => probs.map(p => p.code + (p.name ? ":" + p.name : "") + (p.step >= 0 ? "@" + p.step : ""));
test("check: the owner's design is clean", () => {
  assert.deepEqual(A.check(coi(), { conns:[CONN_AUTH, CONN_POL].map(A.normConn) }), []);
});
test("check: a value read before the step that saves it, or never saved", () => {
  const a = coi();
  a.steps[0].body = '{"after":"{{job}}","x":"{{jobb}}"}';
  const c = codes(A.check(a, { conns:[CONN_AUTH, CONN_POL].map(A.normConn) }));
  assert.ok(c.indexOf("usedTooEarly:job@0") >= 0, c.join());
  assert.ok(c.indexOf("unknownPh:jobb@0") >= 0, c.join());
});
test("check: a secret belongs to its own connection only", () => {
  const a = coi();
  a.steps[1].headers.push(["X-Pass", "{{secret.password}}"]);
  a.steps.push(A.normStep({ kind:"confirm", text:"Send {{secret.password}}?" }));
  const c = codes(A.check(a, { conns:[CONN_AUTH, CONN_POL].map(A.normConn) }));
  assert.ok(c.indexOf("secretUnknown:secret.password@1") >= 0, c.join());
  assert.ok(c.indexOf("secretNoConn:secret.password@3") >= 0, c.join());
});
test("check: headers KalKech sets itself, a body on a GET, a bad condition, a bad pattern", () => {
  const a = coi();
  a.steps[2].headers.push(["Host", "evil.example"], ["Bad Header", "x"]);
  a.steps[2].bodyType = "json";
  a.steps[2].when = '{{state}} == "x" and';
  a.steps[1].save.push({ name:"r", from:"regex", path:"(unclosed", show:"me" });
  a.steps[1].path = "policies/{{input.policy}}";
  a.inputs[0].pattern = "[A-Z";
  const c = codes(A.check(a, { conns:[CONN_AUTH, CONN_POL].map(A.normConn) }));
  ["setByKalKech:Host@2", "badHeader:Bad Header@2", "getBody@2", "badCond@2", "badRegex:r@1", "pathSlash@1", "badPattern:policy"]
    .forEach(x => assert.ok(c.indexOf(x) >= 0, x + " in " + c.join()));
});
test("check: a condition may not read a secret", () => {
  const a = coi();
  a.steps[0].when = '{{secret.password}} starts with "a"';
  const c = codes(A.check(a, { conns:[CONN_AUTH, CONN_POL].map(A.normConn) }));
  assert.deepEqual(c, ["secretInCond:secret.password@0"]);
});
test("check: 'repeat until' may read what its own step saves, and {{status}}", () => {
  const a = coi();
  a.steps[2].repeat.until = '{{state}} == "DONE" or {{status}} == 404';
  assert.deepEqual(A.check(a, { conns:[CONN_AUTH, CONN_POL].map(A.normConn) }), []);
});
test("check: a token shown to the assistant is warned about, not refused", () => {
  const a = coi();
  a.steps[0].save[0].show = "ai";
  const p = A.check(a, { conns:[CONN_AUTH, CONN_POL].map(A.normConn) });
  assert.equal(p.length, 1);
  assert.equal(p[0].code, "aiSeesSecret");
  assert.equal(p[0].warn, true);
});
test("check: script steps - only .bat and .cmd, and its blanks filled", () => {
  const a = A.normAuto({ name:"Clear cache", steps:[{ kind:"script", script:"S1", args:[["env", "UAT"]] },
                                                     { kind:"script", script:"S2" }, { kind:"script", script:"gone" }] });
  const scripts = [{ id:"S1", file:"clear-cache.bat", params:["env", "server"] }, { id:"S2", file:"tidy.ps1", params:[] }];
  const c = codes(A.check(a, { scripts }));
  assert.ok(c.indexOf("argMissing:server@0") >= 0, c.join());
  assert.ok(c.indexOf("scriptKind:tidy.ps1@1") >= 0, c.join());
  assert.ok(c.indexOf("scriptGone@2") >= 0, c.join());
});
test("expect: the answers that count as success", () => {
  ["2xx", "200", "200, 201", "2xx,404", "any", "ANY"].forEach(e => assert.ok(A.expectOk(e), e));
  ["", "2x", "20", "ok", "200;201"].forEach(e => assert.ok(!A.expectOk(e), e));
});

/* ── the values it is run with ───────────────────────────────────────── */
test("inputs: checked against the design, never guessed", () => {
  const a = A.normAuto({ inputs:[
    { key:"policy", label:"Policy number", pattern:"[A-Z]\\d{5}[A-Z]\\d{2}", example:"P10234X56" },
    { key:"env", kind:"choice", choices:["UAT", "PROD"] },
    { key:"from", kind:"date", required:false },
    { key:"count", kind:"number", required:false },
    { key:"otp", kind:"secret" }] });
  let r = A.inputsCheck(a, { "Policy number":" P10234X56 ", env:"uat", count:"3", otp:"123456" });
  assert.deepEqual(r.errors, []);
  assert.equal(r.values.policy, "P10234X56", "found by its label, and trimmed");
  assert.equal(r.values.env, "UAT", "a choice is put back the way it was written");
  r = A.inputsCheck(a, { policy:"P10234X56X", env:"DEV", from:"2026-02-30", count:"three" });
  assert.deepEqual(r.errors.map(e => e.key + ":" + e.code), ["policy:pattern", "env:choice", "from:date", "count:number", "otp:typeIt"]);
  r = A.inputsCheck(a, { policy:"P10234X56", env:"UAT", otp:"1", count:"1\n2" });
  assert.deepEqual(r.errors.map(e => e.code), ["lines"]);
  r = A.inputsCheck(a, {});
  assert.equal(r.errors[0].code, "needed");
});
test("a value for a script's command line: no character cmd.exe would act on", () => {
  assert.equal(A.cmdSafe("P10234X56"), "");
  assert.equal(A.cmdSafe("C:\\Work\\file name.txt"), "");
  ['a & del *', "a|b", "50%", "!x!", 'say "hi"', "a^b", "a>b", "(x)", "a\nb"].forEach(v => assert.notEqual(A.cmdSafe(v), "", v));
});

/* ── what the assistant is told ──────────────────────────────────────── */
test("forAI: names, inputs and step names - never an address, a header or a secret's name", () => {
  const store = A.normStore({ aiCan:true, conns:[CONN_AUTH, CONN_POL], list:[coi(), { name:"Private one", ai:false, steps:[{ kind:"wait" }] }] });
  const ai = A.forAI(store);
  assert.equal(ai.length, 1);
  assert.equal(ai[0].name, "Regenerate COI");
  assert.deepEqual(ai[0].inputs, [{ name:"policy", label:"Policy number", kind:"text", required:true, example:"P10234X56" }]);
  assert.deepEqual(ai[0].steps, ["Sign in", "Ask for a new COI", "Wait until it is ready"]);
  assert.deepEqual(ai[0].gives, ["coiNumber"], "only the values marked for the assistant");
  assert.equal(ai[0].asksFirst, true);
  const text = JSON.stringify(ai);
  ["example.local", "Login service", "Policy API", "password", "username", "clientId", "Bearer", "token", "/policies"]
    .forEach(w => assert.ok(text.indexOf(w) < 0, w + " leaked: " + text));
  assert.deepEqual(A.forAI(Object.assign({}, store, { aiCan:false })), []);
});
test("find and fromText: by name, and the values a sentence already holds", () => {
  const store = A.normStore({ list:[coi(), { name:"Restart imaging service", inputs:[{ key:"server", kind:"choice", choices:["IMG01", "IMG02"] }] }] });
  assert.equal(A.find(store, "regenerate coi").id, "Acoi");
  assert.equal(A.find(store, "Regen").id, "Acoi");
  assert.equal(A.find(store, "nothing like it"), null);
  let r = A.fromText(store, "please run regenerate COI for P10234X56 today");
  assert.equal(r.auto.id, "Acoi");
  assert.deepEqual(r.inputs, { policy:"P10234X56" });
  r = A.fromText(store, "restart imaging service on img02");
  assert.deepEqual(r.inputs, { server:"img02" });
  assert.equal(A.fromText(store, "regenerate the report"), null);
});

/* ── reading a reply ─────────────────────────────────────────────────── */
test("json paths: what a reply offers to save, and reading one back", () => {
  const reply = '{"access_token":"x","coi":{"number":"C-1","files":[{"url":"u1"},{"url":"u2"}]},"odd key":1,"n":null}';
  assert.deepEqual(A.jsonPaths(reply).map(p => p.path), ["access_token", "coi.number", "coi.files[0].url", '["odd key"]', "n"]);
  const o = JSON.parse(reply);
  assert.equal(A.jsonGet(o, "coi.files[1].url"), "u2");
  assert.equal(A.jsonGet(o, "$.coi.files.1.url"), "u2");
  assert.equal(A.jsonGet(o, '["odd key"]'), 1);
  assert.equal(A.jsonGet(o, "coi.files[5].url"), undefined);
  assert.equal(A.jsonGet(o, "coi.number.length"), undefined);
  assert.deepEqual(A.jsonPaths("not json"), []);
});

/* ── running one ─────────────────────────────────────────────────────── */
/* A stand-in for the tray program: it keeps hidden values to itself, as the
   real one does, and answers each step from a script of replies. */
function fakeBridge(replies){
  const runs = {}, calls = [];
  const call = async (op, b) => {
    calls.push({ op, b:JSON.parse(JSON.stringify(b)) });
    const keep = runs[b.run] || (runs[b.run] = {});
    const look = ph => b.values[ph.full] != null ? b.values[ph.full] : keep[ph.full];
    if (op === "end"){ delete runs[b.run]; return { ok:true }; }
    if (op === "check"){
      const p = A.parseCond(b.when);
      return { ok:true, result:A.evalCond(p.ast, look) };
    }
    if (b.when){
      const p = A.parseCond(b.when);
      if (!A.evalCond(p.ast, look)) return { ok:true, skipped:true };
    }
    const r = replies.shift();
    if (!r) return { ok:false, error:"no reply scripted" };
    const saved = {}, hidden = [];
    (b.step.save || []).forEach(s => {
      const v = A.jsonGet(r.json || {}, s.path);
      if (v === undefined) return;
      if (s.show === "hidden"){ keep[s.name] = String(v); hidden.push(s.name); }
      else saved[s.name] = A.asText(v);
    });
    let until = null;
    if (b.until){
      const all = Object.assign({}, b.values, saved, { status:String(r.status) });
      until = A.evalCond(A.parseCond(b.until).ast, ph => all[ph.full] != null ? all[ph.full] : keep[ph.full]);
    }
    return { ok:r.status < 400, status:r.status, saved, hidden, until, error:r.status < 400 ? "" : "HTTP " + r.status,
             excerpt:b.test ? JSON.stringify(r.json) : "" };
  };
  return { call, calls, runs };
}
function env(bridge, extra){
  const sleeps = [];
  return Object.assign({
    conns:[CONN_AUTH, CONN_POL], call:bridge.call,
    values:Object.assign({ "input.policy":"P10234X56" }, A.builtins(new Date(), {})),
    sleep:async ms => { sleeps.push(ms); return true; }, ask:async () => true, tick:() => {}, stopped:() => false,
    sleeps
  }, extra || {});
}

test("run: sign in, use the hidden token, poll until done - the page never holds the token", async () => {
  const b = fakeBridge([
    { status:200, json:{ access_token:"tok-SECRET-1" } },
    { status:202, json:{ jobId:"J-77" } },
    { status:200, json:{ state:"RUNNING" } },
    { status:200, json:{ state:"RUNNING" } },
    { status:200, json:{ state:"DONE", coi:{ number:"COI-2026-0042" } } }]);
  const e = env(b);
  const R = await A.run(coi(), e);
  assert.equal(R.state, "ok");
  assert.deepEqual(R.steps.map(s => s.state), ["ok", "ok", "ok"]);
  assert.equal(R.steps[2].tries, 3);
  assert.deepEqual(e.sleeps, [2000, 2000], "waited between tries, not after the last");
  assert.deepEqual(R.hidden, ["token"]);
  assert.deepEqual(R.values, { job:{ v:"J-77", show:"me" }, state:{ v:"DONE", show:"me" }, coiNumber:{ v:"COI-2026-0042", show:"ai" } });
  assert.equal(R.result, "COI COI-2026-0042 is ready for P10234X56 (job J-77).");
  /* the token went into the tray program and never came out */
  const sent = JSON.stringify(b.calls) + JSON.stringify(R);
  assert.ok(sent.indexOf("tok-SECRET-1") < 0, "the token reached the page");
  assert.equal(b.calls.filter(c => c.op === "end").length, 1, "the run is ended once, so the token is forgotten");
  assert.deepEqual(b.runs, {});
  /* the wire: the step carries its connection with secret NAMES only */
  const first = b.calls[0].b;
  assert.deepEqual(first.conn.secrets, ["username", "password"]);
  assert.equal(first.step.path, "/token");
  assert.ok(!("password" in first.values));
  const sp = A.split(coi(), R);
  assert.deepEqual(sp.ai, { coiNumber:"COI-2026-0042" });
  assert.equal(sp.resultForAI, "COI COI-2026-0042 is ready for P10234X56 (job (shown to you only)).");
});
test("run: gives up after the last try, and says why", async () => {
  const a = coi();
  a.steps[2].repeat.times = 2;
  const b = fakeBridge([{ status:200, json:{ access_token:"t" } }, { status:202, json:{ jobId:"J" } },
                        { status:200, json:{ state:"RUNNING" } }, { status:200, json:{ state:"RUNNING" } }]);
  const R = await A.run(a, env(b));
  assert.equal(R.state, "failed");
  assert.equal(R.steps[2].state, "fail");
  assert.equal(R.steps[2].note, "stillNot");
});
test("run: a failing step stops the run - or not, when it says carry on", async () => {
  let b = fakeBridge([{ status:401, json:{} }]);
  let R = await A.run(coi(), env(b));
  assert.equal(R.state, "failed");
  assert.deepEqual(R.steps.map(s => s.state), ["fail", "wait", "wait"]);
  assert.equal(R.steps[0].note, "HTTP 401");
  const a = coi();
  a.steps[0].onFail = "continue";
  b = fakeBridge([{ status:500, json:{} }, { status:202, json:{ jobId:"J" } }, { status:200, json:{ state:"DONE" } }]);
  R = await A.run(a, env(b));
  assert.equal(R.state, "partial");
});
test("run: 'only when' skips; a wait waits; 'check with me' can stop it", async () => {
  const a = A.normAuto({ name:"x", steps:[
    { kind:"http", conn:"Cpol", path:"/a", when:"{{input.policy}} starts with \"Z\"" },
    { kind:"wait", seconds:3 },
    { kind:"confirm", text:"Go on with {{input.policy}} and {{token}}?" },
    { kind:"http", conn:"Cpol", path:"/b" }] });
  const b = fakeBridge([]);
  let asked = "";
  const e = env(b, { ask:async t => { asked = t; return false; } });
  const R = await A.run(a, e);
  assert.deepEqual(R.steps.map(s => s.state), ["skip", "ok", "no", "wait"]);
  assert.equal(R.state, "stopped");
  assert.deepEqual(e.sleeps, [3000]);
  assert.equal(asked, "Go on with P10234X56 and {{token}}?");
});
test("run: Stop is honoured between steps and during a wait", async () => {
  const a = A.normAuto({ name:"x", steps:[{ kind:"wait", seconds:5 }, { kind:"http", conn:"Cpol", path:"/a" }] });
  const b = fakeBridge([{ status:200, json:{} }]);
  const R = await A.run(a, env(b, { sleep:async () => false }));
  assert.equal(R.state, "stopped");
  assert.deepEqual(R.steps.map(s => s.state), ["stop", "wait"]);
  assert.equal(b.calls.filter(c => c.op === "step").length, 0);
});
test("run: 'try it' stops after the step asked for, with the reply's text", async () => {
  const b = fakeBridge([{ status:200, json:{ access_token:"t", expires:3600 } }]);
  const R = await A.run(coi(), env(b, { upTo:0, test:true }));
  assert.equal(R.state, "ok");
  assert.deepEqual(R.steps.map(s => s.state), ["ok", "wait", "wait"]);
  assert.equal(R.steps[0].excerpt, '{"access_token":"t","expires":3600}');
});
test("run: script steps send the file and the values in the script's own order", async () => {
  const a = A.normAuto({ name:"x", steps:[{ kind:"script", script:"S1", args:[["server", "IMG02"], ["extra", "1"], ["env", "{{input.policy}}"]] }] });
  const b = fakeBridge([{ status:0, json:{} }]);
  await A.run(a, env(b, { scripts:[{ id:"S1", file:"restart.bat", params:["env", "server"] }] }));
  const w = b.calls[0].b.step;
  assert.equal(w.file, "restart.bat");
  assert.deepEqual(w.args, [["env", "{{input.policy}}"], ["server", "IMG02"], ["extra", "1"]]);
});

/* ── 5.23: success and failure answer differently; the whole reply ───── */
test("success and failure: what the assistant is told, and the checks", () => {
  const a = A.normAuto({ name:"Look up", result:"Found {{ref}}", resultFail:"Not found: {{errMsg}} {{nope}}",
    steps:[{ kind:"http", conn:"Cpol", path:"/maybe", reply:"ai", okWhen:'{{success}} == true and {{code}} != ""',
             save:[{ name:"ref", from:"json", path:"data.ref", show:"ai" },
                   { name:"errMsg", from:"json", path:"error.message", show:"ai", on:"fail" },
                   { name:"success", from:"json", path:"success", show:"me", on:"any" },
                   { name:"code", from:"status", show:"me", on:"bogus" }] }] });
  assert.equal(a.steps[0].save[1].on, "fail");
  assert.equal(a.steps[0].save[3].on, "ok", "an unknown 'on' is 'when it works'");
  const c = codes(A.check(a, { conns:[CONN_POL].map(A.normConn) }));
  assert.ok(c.indexOf("unknownPh:nope") >= 0, "the failure line is checked too: " + c.join());
  assert.ok(c.indexOf("aiSeesReply@0") >= 0, "a reply for the assistant is warned about: " + c.join());
  const bad = A.normAuto(Object.assign({}, a, { steps:[Object.assign({}, a.steps[0], { okWhen:"{{success}} ==" })] }));
  assert.ok(codes(A.check(bad, { conns:[CONN_POL].map(A.normConn) })).indexOf("badCond@0") >= 0);
  const ai = A.forAI(A.normStore({ conns:[CONN_POL], list:[a] }))[0];
  assert.deepEqual(ai.gives, ["ref"]);
  assert.deepEqual(ai.givesOnFail, ["errMsg"]);
  assert.deepEqual(ai.replies, ["Step 1"]);
  const w = A.stepWire(a.steps[0], {});
  assert.equal(w.okWhen, a.steps[0].okWhen);
  assert.equal(w.reply, "ai");
  assert.equal(w.save[1].on, "fail");
});
test("run: a failed step keeps its failure values and reply; the run ends with the failure line", async () => {
  const a = A.normAuto({ name:"Look up", result:"Found {{ref}}", resultFail:"Not found: {{errMsg}}",
    steps:[{ kind:"http", conn:"Cpol", path:"/maybe", reply:"ai",
             save:[{ name:"ref", from:"json", path:"data.ref", show:"ai" }, { name:"errMsg", from:"json", path:"error.message", show:"ai", on:"fail" }] }] });
  const call = async op => op === "step"
    ? { ok:false, status:404, saved:{ errMsg:"Policy BAD not found" }, hidden:[], missing:[], error:"the answer was 404",
        reply:'{"error":{"code":"NOT_FOUND","message":"Policy BAD not found"}}', replyCut:false, contentType:"application/json" }
    : { ok:true };
  const R = await A.run(a, { conns:[CONN_POL], call, values:{}, sleep:async () => true, ask:async () => true, tick:() => {}, stopped:() => false });
  assert.equal(R.state, "failed");
  assert.equal(R.result, "Not found: Policy BAD not found");
  assert.equal(R.values.errMsg.v, "Policy BAD not found");
  assert.equal(R.steps[0].replyShow, "ai");
  assert.match(R.steps[0].reply, /NOT_FOUND/);
  const sp = A.split(a, R);
  assert.equal(sp.resultForAI, "Not found: Policy BAD not found");
  assert.equal(sp.replies.length, 1);
  assert.equal(sp.replies[0].status, 404);
  /* the history keeps a short copy of a reply, or none */
  assert.equal(A.normRun(R, 10).steps[0].reply, '{"error":{');
  assert.equal(A.normRun(R, 10).steps[0].replyCut, true);
  assert.equal(A.normRun(R, 0).steps[0].reply, undefined);
  /* stopped: neither line */
  assert.equal(A.resultTemplate(a, { state:"stopped" }), "");
  assert.equal(A.resultTemplate(a, { state:"partial" }), "Found {{ref}}");
});
