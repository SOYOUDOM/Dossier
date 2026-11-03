// node --test
//
// Automations (automations.js): the designs you build on the Automations page,
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

/* ── Conditions: steps with a Yes and a No branch (5.24) ─────────────── */
/* a made-up design: look the policy up; when it is active, regenerate the
   certificate, otherwise only note why; then tell the record either way */
function branchy(){
  return A.normAuto({ id:"Ab", name:"Regenerate when active",
    inputs:[{ key:"policy", label:"Policy number" }],
    steps:[
      { id:"look", kind:"http", name:"Look it up", conn:"Cpol", path:"/policies/{{input.policy}}",
        save:[{ name:"state", from:"json", path:"state", show:"ai" }] },
      { id:"cond", kind:"if", name:"Is it active?", cond:'{{state}} == "ACTIVE"',
        yes:[{ id:"regen", kind:"http", name:"Regenerate", conn:"Cpol", method:"POST", path:"/policies/{{input.policy}}/coi",
               save:[{ name:"job", from:"json", path:"jobId", show:"ai" }] }],
        no:[{ id:"why", kind:"http", name:"Ask why", conn:"Cpol", path:"/policies/{{input.policy}}/reason",
              save:[{ name:"reason", from:"json", path:"reason", show:"ai" }] }] },
      { id:"tell", kind:"http", name:"Tell the record", conn:"Cpol", method:"POST", path:"/notes",
        bodyType:"json", body:'{"job":"{{job}}","reason":"{{reason}}"}' }
    ],
    result:"Done: {{job}}{{reason}}" });
}
test("conditions: normalised as a tree - two levels deep at most, 40 steps in all, no id twice", () => {
  const a = branchy();
  assert.equal(a.steps.length, 3);
  assert.equal(a.steps[1].kind, "if");
  assert.equal(a.steps[1].when, "");
  assert.deepEqual(a.steps[1].yes.map(s => s.id), ["regen"]);
  assert.deepEqual(A.flatSteps(a.steps).map(x => x.s.id + ":" + x.depth + x.branch), ["look:0", "cond:0", "regen:1yes", "why:1no", "tell:0"]);
  assert.equal(A.findStep(a, "why").parent, "cond");
  assert.equal(A.findStep(a, "nope"), null);
  /* a Condition in a Condition is kept; one more level is not */
  const deep = A.normAuto({ steps:[{ kind:"if", cond:"1", yes:[{ kind:"if", cond:"1", yes:[{ kind:"if", cond:"1", yes:[{ kind:"wait" }] }, { kind:"wait" }] }] }] });
  assert.equal(deep.steps[0].yes[0].kind, "if");
  assert.deepEqual(deep.steps[0].yes[0].yes.map(s => s.kind), ["wait"], "the third level is dropped");
  /* the 40 are counted across the branches */
  const many = A.normAuto({ steps:[{ kind:"if", cond:"1", yes:Array.from({ length:30 }, () => ({ kind:"wait" })),
                                     no:Array.from({ length:30 }, () => ({ kind:"wait" })) }, { kind:"wait" }] });
  assert.equal(A.flatSteps(many.steps).length, 40);
  assert.equal(many.steps.length, 1);
  /* a pasted copy with the same ids gets new ones */
  const dup = A.normAuto({ steps:[{ id:"x", kind:"wait" }, { kind:"if", cond:"1", yes:[{ id:"x", kind:"wait" }] }] });
  const ids = A.flatSteps(dup.steps).map(x => x.s.id);
  assert.equal(new Set(ids).size, 3);
  const fresh = A.freshIds(a.steps);
  assert.notEqual(fresh[1].yes[0].id, "regen");
  assert.equal(fresh[1].yes[0].name, "Regenerate");
});
test("conditions: the checks know which values exist on each path", () => {
  const conns = [CONN_POL].map(A.normConn);
  const a = branchy();
  const c = codes(A.check(a, { conns }));
  assert.ok(c.indexOf("maybeEmpty:job@4") >= 0, "a value from one branch only is a warning after it: " + c.join());
  assert.ok(c.indexOf("maybeEmpty:reason@4") >= 0);
  assert.ok(A.check(a, { conns }).filter(p => !p.warn).length === 0, "and nothing that stops a run: " + c.join());
  assert.equal(A.check(a, { conns }).find(p => p.code === "maybeEmpty").id, "tell");
  /* saved in both branches: no warning */
  const both = branchy();
  both.steps[1].no[0].save.push({ name:"job", from:"json", path:"x" });
  both.steps[1].yes[0].save.push({ name:"reason", from:"json", path:"x" });
  assert.ok(!codes(A.check(both, { conns })).some(x => /^maybeEmpty/.test(x)));
  /* a value of the other branch, a test with nothing to test, an empty one */
  const other = branchy();
  other.steps[1].no[0].path = "/x/{{job}}";
  other.steps[1].cond = "";
  other.steps.push(A.normStep({ kind:"if", cond:"{{state}} is empty" }));
  const oc = codes(A.check(other, { conns }));
  assert.ok(oc.indexOf("otherBranch:job@3") >= 0, oc.join());
  assert.ok(oc.indexOf("noCond@1") >= 0, oc.join());
  assert.ok(oc.indexOf("emptyIf@5") >= 0, oc.join());
  /* a test that reads a secret, or a value saved later */
  const sec = branchy();
  sec.steps[1].cond = "{{secret.clientId}} == 1 or {{job}} == 2";
  const sc = codes(A.check(sec, { conns }));
  assert.ok(sc.indexOf("secretInCond:secret.clientId@1") >= 0, sc.join());
  assert.ok(sc.indexOf("usedTooEarly:job@1") >= 0, sc.join());
});
test("conditions: the values a step may read, for the designer", () => {
  const a = branchy();
  const at = id => A.valuesAt(a, id);
  assert.deepEqual(at("look").saved, []);
  assert.equal(at("look").status, false);
  assert.deepEqual(at("look").mine.map(v => v.name), ["state"]);
  assert.deepEqual(at("cond").saved.map(v => v.name), ["state"]);
  assert.equal(at("cond").status, true);
  assert.deepEqual(at("why").saved.map(v => v.name), ["state"], "the No branch does not see the Yes branch's values");
  const end = at("tell").saved;
  assert.deepEqual(end.map(v => v.name + (v.maybe ? "?" : "")), ["state", "job?", "reason?"]);
  assert.deepEqual(at("").saved.map(v => v.name), ["state", "job", "reason"], "the end sees everything");
  assert.deepEqual(at("tell").inputs, [{ name:"input.policy", label:"Policy number", kind:"text" }]);
});
test("conditions: the builder's rows, and back to text", () => {
  const rt = src => { const r = A.condRows(src); return r && A.condText(r.rows, r.join); };
  assert.deepEqual(A.condRows('{{state}} == "DONE" and {{n}} > 3'),
    { join:"and", rows:[{ a:"{{state}}", op:"==", b:"DONE" }, { a:"{{n}}", op:">", b:"3" }] });
  assert.equal(A.condRows("{{d}} not contains x"), null, "a bare word is not a value");
  const r = A.condRows("{{a}} is not empty or not {{b}} or {{c}} starts with 'TMP' or {{d|lower}} not contains \"x y\"");
  assert.equal(r.join, "or");
  assert.deepEqual(r.rows.map(x => x.op), ["is not empty", "is false", "starts with", "not contains"]);
  assert.equal(r.rows[3].a, "{{d|lower}}", "a value keeps its filters");
  assert.equal(rt('{{state}} == "DONE" and {{n}} > 3'), '{{state}} == "DONE" and {{n}} > 3');
  assert.equal(rt("{{a}}"), "{{a}}");
  assert.deepEqual(A.condRows(""), { join:"and", rows:[] });
  /* too much for rows: stays text */
  assert.equal(A.condRows("({{a}} == 1 or {{b}} == 2) and {{c}}"), null);
  assert.equal(A.condRows("{{a}} == 1 and {{b}} == 2 or {{c}}"), null);
  assert.equal(A.condRows('{{a}} == "open'), null);
  /* text written from rows: quotes where needed, and it reads the same */
  const t = A.condText([{ a:"{{msg}}", op:"contains", b:'say "hi"' }, { a:"{{n}}", op:">=", b:"10" },
                        { a:"{{x}}", op:"is empty" }, { a:"", op:"==", b:"skipped" }], "and");
  assert.equal(t, '{{msg}} contains "say \\"hi\\"" and {{n}} >= 10 and {{x}} is empty');
  assert.equal(A.test(t, { msg:'they say "hi" now', n:"12", x:"" }).result, true);
  assert.deepEqual(A.condRows(t).rows[0], { a:"{{msg}}", op:"contains", b:'say "hi"' });
});
test("run: a Condition runs one branch; the other is marked as never in the running", async () => {
  const yes = fakeBridge([{ status:200, json:{ state:"ACTIVE" } }, { status:202, json:{ jobId:"J-9" } }, { status:200, json:{} }]);
  let R = await A.run(branchy(), env(yes));
  assert.equal(R.state, "ok");
  assert.deepEqual(R.steps.map(s => s.sid + ":" + s.state + (s.off ? "!" : "")), ["look:ok", "cond:ok", "regen:ok", "why:skip!", "tell:ok"]);
  assert.equal(R.steps[1].took, "yes");
  assert.equal(R.steps[2].branch, "yes");
  assert.equal(R.steps[2].depth, 1);
  assert.equal(R.steps[2].parent, "cond");
  assert.equal(R.result, "Done: J-9");
  assert.equal(yes.calls.filter(c => c.op === "check")[0].b.when, '{{state}} == "ACTIVE"');
  const no = fakeBridge([{ status:200, json:{ state:"LAPSED" } }, { status:200, json:{ reason:"lapsed in May" } }, { status:200, json:{} }]);
  R = await A.run(branchy(), env(no));
  assert.deepEqual(R.steps.map(s => s.sid + ":" + s.state), ["look:ok", "cond:ok", "regen:skip", "why:ok", "tell:ok"]);
  assert.equal(R.steps[1].took, "no");
  assert.equal(R.result, "Done: lapsed in May");
  /* the history keeps where each step sat */
  const kept = A.normRun(R).steps;
  assert.deepEqual([kept[1].took, kept[2].off, kept[2].branch, kept[3].depth, kept[3].parent], ["no", true, "yes", 1, "cond"]);
  /* the assistant is told the steps of both branches */
  assert.deepEqual(A.forAI(A.normStore({ list:[branchy()] }))[0].steps, ["Look it up", "Is it active?", "Regenerate", "Ask why", "Tell the record"]);
  assert.deepEqual(A.forAI(A.normStore({ list:[branchy()] }))[0].gives, ["state", "job", "reason"]);
});
test("run: a step failing inside a branch stops the run; a test that cannot be read decides nothing", async () => {
  let b = fakeBridge([{ status:200, json:{ state:"ACTIVE" } }, { status:500, json:{} }]);
  let R = await A.run(branchy(), env(b));
  assert.equal(R.state, "failed");
  assert.deepEqual(R.steps.map(s => s.state), ["ok", "ok", "fail", "skip", "wait"]);
  const a = branchy();
  b = fakeBridge([{ status:200, json:{ state:"ACTIVE" } }]);
  const call = async (op, body) => op === "check" ? { ok:false, error:"cannot read it" } : b.call(op, body);
  R = await A.run(a, env(b, { call }));
  assert.equal(R.state, "failed");
  assert.deepEqual(R.steps.map(s => s.state + (s.off ? "!" : "")), ["ok", "fail", "skip!", "skip!", "wait"]);
  assert.equal(R.steps[1].note, "cannot read it");
});
test("run: 'try up to here' stops after a step inside a branch", async () => {
  const b = fakeBridge([{ status:200, json:{ state:"LAPSED" } }, { status:200, json:{ reason:"r" } }]);
  const R = await A.run(branchy(), env(b, { upToId:"why", test:true }));
  assert.equal(R.state, "ok");
  assert.deepEqual(R.steps.map(s => s.state), ["ok", "ok", "skip", "ok", "wait"]);
  /* the older way - a place in the top list - takes a Condition's branch with it */
  const b2 = fakeBridge([{ status:200, json:{ state:"ACTIVE" } }, { status:202, json:{ jobId:"J" } }]);
  const R2 = await A.run(branchy(), env(b2, { upTo:1 }));
  assert.deepEqual(R2.steps.map(s => s.state), ["ok", "ok", "ok", "skip", "wait"]);
});

/* ── 5.26: more kinds of step, lists, functions, messages ─────────────── */
/* a stand-in tray program that also shapes a list (leave out / keep only),
   keeps the whole of it hidden, and reads paths into it - as the real one */
function shapeBridge(replies){
  const runs = {}, calls = [], paths = [];
  const shape = (v, keep, drop) => {
    if (Array.isArray(v)) return v.map(x => shape(x, keep, drop));
    if (!v || typeof v !== "object") return v;
    const o = {};
    Object.keys(v).forEach(k => {
      if (keep.length && keep.indexOf(k) < 0) return;
      if (drop.indexOf(k) >= 0) return;
      o[k] = shape(v[k], [], drop);
    });
    return o;
  };
  const call = async (op, b) => {
    calls.push({ op, b:JSON.parse(JSON.stringify(b)) });
    const keep = runs[b.run] || (runs[b.run] = {});
    const look = ph => {
      if (ph.parts && ph.parts.length){
        const src = (b.shaped || []).indexOf(ph.full) >= 0 || b.values[ph.full] == null ? keep[ph.full] : b.values[ph.full];
        const d = A.dig(src, ph.parts);
        return d.found ? A.txt(d.v) : undefined;
      }
      return b.values[ph.full] != null ? b.values[ph.full] : keep[ph.full];
    };
    if (op === "end"){ delete runs[b.run]; return { ok:true }; }
    if (op === "check") return { ok:true, result:A.evalCond(A.parseCond(b.when).ast, look) };
    if (b.when && !A.evalCond(A.parseCond(b.when).ast, look)) return { ok:true, skipped:true };
    paths.push(String(b.step.path || "").replace(/\{\{([^{}]*)\}\}/g, (m, inner) => { const v = look(A.parsePh(inner)); return v == null ? "<none>" : v; }));
    const r = replies.shift();
    if (!r) return { ok:false, error:"no reply scripted" };
    const saved = {}, hidden = [], shaped = [];
    (b.step.save || []).forEach(s => {
      const v = A.jsonGet(r.json || {}, s.path);
      if (v === undefined) return;
      if (s.show === "hidden"){ keep[s.name] = A.txt(v); hidden.push(s.name); return; }
      const fl = x => String(x || "").split(/[,\s]+/).filter(Boolean);
      if ((s.keep || s.drop) && v && typeof v === "object"){
        keep[s.name] = JSON.stringify(v);
        saved[s.name] = JSON.stringify(shape(v, fl(s.keep), fl(s.drop)));
        shaped.push(s.name);
      } else saved[s.name] = A.txt(v);
    });
    return { ok:r.status < 400, status:r.status, saved, hidden, shaped, error:r.status < 400 ? "" : "HTTP " + r.status };
  };
  return { call, calls, runs, paths };
}
const DOCS = [{ name:"Schedule.pdf", type:"PDF", date:"2026-10-01", downloadToken:"dl-aaa111" },
              { name:"Card.png", type:"PNG", date:"2026-10-02", downloadToken:"dl-bbb222" },
              { name:"Wording.pdf", type:"PDF", date:"2026-10-03", downloadToken:"dl-ccc333" }];
function docsAuto(extra){
  return A.normAuto(Object.assign({
    id:"Adocs", name:"Policy documents", inputs:[{ key:"policy", label:"Policy number" }],
    steps:[
      { id:"list", kind:"http", name:"List them", conn:"Cpol", method:"GET", path:"/policies/{{input.policy}}/documents",
        save:[{ name:"docs", from:"json", path:"documents", show:"ai", drop:"downloadToken" }] },
      { id:"pdfs", kind:"filter", name:"Only the PDFs", from:"{{docs}}", var:"pdfs", cond:'{{item.type}} == "PDF"', show:"ai" },
      { id:"names", kind:"select", name:"Their names", from:"{{pdfs}}", var:"names", fields:[["", "{{item.name}}"]], show:"me" },
      { id:"each", kind:"each", name:"Each document", from:"{{docs}}", as:"doc", do:[
        { id:"isPdf", kind:"if", name:"A PDF?", cond:'{{doc.type}} == "PDF"', yes:[
          { id:"dl", kind:"http", name:"Download it", conn:"Cpol", method:"GET", path:"/download/{{doc.downloadToken}}?n={{loop.n}}&u={{upper(doc.name)}}",
            save:[{ name:"file", from:"json", path:"file", show:"ai" }] },
          { id:"keep", kind:"set", name:"Keep its name", var:"got", how:"append", value:"{{file}}", show:"ai" }], no:[] }] },
      { id:"n", kind:"set", name:"Count", var:"n", how:"set", value:"{{count(got)}}", show:"ai" }],
    result:"## Documents of {{input.policy}}\n\n{{table(docs, \"name\", \"date\")}}\n\n{{#each got}}\n- {{this}}\n{{/each}}\n{{code(names)}}"
  }, extra || {}));
}
const docsReplies = () => [{ status:200, json:{ documents:DOCS } }, { status:200, json:{ file:"Schedule.pdf" } }, { status:200, json:{ file:"Wording.pdf" } }];

test("5.26 normalising: the new kinds, a For each counts as a level, keep/drop only on JSON saves", () => {
  const a = A.normAuto({ steps:[
    { kind:"set", var:"x", how:"bogus", value:"1", show:"everyone" },
    { kind:"stop", as:"maybe", text:"bye" },
    { kind:"each", from:"{{docs}}", max:9999, do:[{ kind:"each", do:[{ kind:"each" }] }] },
    { kind:"select", from:"{{docs}}", var:"s", fields:[["", "{{item.name}}"]] },
    { kind:"select", from:"{{docs}}", var:"t", fields:[["", "x"], ["b", "y"]] },
    { kind:"filter", from:"{{docs}}", var:"f", cond:"{{item.a}}" },
    { kind:"http", save:[{ name:"a", from:"json", path:"x", drop:"token, links.sig, no!pe" }, { name:"b", from:"header", path:"x", drop:"y" }] }] });
  const s = a.steps;
  assert.deepEqual([s[0].how, s[0].show, s[1].as, s[2].as, s[2].max], ["set", "me", "fail", "item", A.LIMIT.loop]);
  assert.equal(s[2].do.length, 1, "a For each inside a For each is kept");
  assert.equal(s[2].do[0].do.length, 0, "...a third level is not");
  assert.deepEqual(s[3].fields, [["", "{{item.name}}"]], "one row with no name: a list of plain values");
  assert.deepEqual(s[4].fields, [["b", "y"]], "with more rows, every row needs a name");
  assert.equal(s[6].save[0].drop, "token, links.sig");
  assert.equal(s[6].save[1].drop, undefined);
  assert.deepEqual(A.flatSteps(a.steps).map(x => x.branch).slice(2, 4), ["", "do"]);
});

test("5.26 placeholders: paths, functions, filters; a secret has no parts", () => {
  const p = A.parsePh('join(field(docs, "name"), ", ")|upper');
  assert.equal(p.bad, "");
  assert.deepEqual(p.refs.map(r => r.full), ["docs"]);
  assert.deepEqual(p.filters, ["upper"]);
  assert.deepEqual(A.parsePh("docs[0].links.self").parts, ["0", "links", "self"]);
  assert.equal(A.parsePh("nosuch(docs)").bad, "fn");
  assert.equal(A.parsePh("count(a, b)").bad, "args");
  assert.equal(A.parsePh("secret.password.x").bad, "name");
  assert.equal(A.parsePh("input.policy").full, "input.policy");
  const v = { docs:JSON.stringify(DOCS), n:"7" };
  const t = x => A.show(x, v);
  assert.equal(t("{{docs[2].name}}"), "Wording.pdf");
  assert.equal(t('{{count(where(docs, "type", "pdf"))}}'), "2");
  assert.equal(t('{{join(field(sort(docs, "date", "desc"), "name"), " / ")}}'), "Wording.pdf / Card.png / Schedule.pdf");
  assert.equal(t("{{add(n, 3)}} {{round(div(n, 3), 2)}} {{default(nothing, \"none\")}}"), "10 2.33 none");
  assert.equal(t('{{date("2026-10-03", "dd MMM yyyy")}} {{addDays("2026-10-30", 3)}}'), "03 Oct 2026 2026-11-02");
  assert.equal(t('{{first(docs).name|lower}}'), "schedule.pdf");
  assert.match(t('{{table(docs, "name", "type")}}'), /^\| name \| type \|\n\| --- \| --- \|\n\| Schedule\.pdf \| PDF \|/);
  assert.equal(t('{{bullets(take(docs, 2), "name")}}'), "- Schedule.pdf\n- Card.png");
  assert.match(t("{{code(field(docs, \"type\"))}}"), /^```json\n\[\n  "PDF",/);
});

test("5.26 messages: {{#each}} and {{#if}}, block lines leave no gaps, masks and hidden values", () => {
  const vals = { docs:JSON.stringify(DOCS), mine:"[1,2]" };
  const tpl = "Found {{count(docs)}}:\n{{#each docs}}\n{{loop.n}}. {{name}} ({{type}})\n{{/each}}\n{{#if count(docs) > 5}}\nmany\n{{else}}\nfew\n{{/if}}";
  assert.equal(A.show(tpl, vals), "Found 3:\n1. Schedule.pdf (PDF)\n2. Card.png (PNG)\n3. Wording.pdf (PDF)\nfew\n");
  assert.equal(A.show("{{#each docs as d}}{{d.type}}{{#if loop.last}}.{{else}},{{/if}}{{/each}}", vals), "PDF,PNG,PDF.");
  assert.equal(A.show("{{#each nothing}}x{{else}}empty{{/each}}", vals), "empty");
  assert.equal(A.show('{{#if docs contains "x"}}y{{else}}n{{/if}} {{#if not mine}}a{{else}}b{{/if}}', vals), "n b");
  assert.equal(A.show("{{#each mine}}{{this}}{{/each}}", vals, [], { mine:"(shown to you only)" }), "(shown to you only)");
  assert.equal(A.show("{{token}} {{count(token)}}", {}, ["token"]), "🔒token 🔒token");
  assert.equal(A.tplParse("{{#each a}}x").error, "open");
  assert.equal(A.tplParse("x{{/if}}").error, "close");
});

test("5.26 check: the new kinds, functions, blocks, hidden values where they cannot go", () => {
  const ok = A.check(docsAuto(), { conns:[CONN_POL].map(A.normConn) });
  assert.deepEqual(ok.filter(p => !p.warn).map(p => p.code), [], JSON.stringify(ok));
  const a = docsAuto();
  a.steps[0].save.push({ name:"tok", from:"json", path:"token", show:"hidden" });
  a.steps.push(A.normStep({ kind:"set", var:"bad name", value:"{{tok}}" }));
  a.steps.push(A.normStep({ kind:"http", conn:"Cpol", path:"/x/{{count(tok)}}", body:"" }));
  a.steps.push(A.normStep({ kind:"http", conn:"Cpol", method:"POST", path:"/x", bodyType:"json", body:"{{#each docs}}{{name}}{{/each}}" }));
  a.steps.push(A.normStep({ kind:"each", from:"docs", as:"docs" }));
  a.steps.push(A.normStep({ kind:"select", from:"{{docs}}", var:"s2" }));
  a.steps.push(A.normStep({ kind:"set", var:"z", value:"{{nosuch(docs)}} {{count(docs, 1)}} {{#each docs}}" }));
  a.steps.push(A.normStep({ kind:"http", conn:"Cpol", path:"/x/{{doc.name}}" }));
  const c = codes(A.check(a, { conns:[CONN_POL].map(A.normConn) }));
  ["varName:bad name", "hiddenHere:tok", "hiddenInFn:tok", "blockHere", "fromOne", "eachAsTaken:docs", "emptyEach", "noFields",
   "badFn:nosuch", "fnArgs:count", "badBlock", "unknownPh:doc"].forEach(k =>
    assert.ok(c.some(x => x.indexOf(k) === 0), k + " in " + c.join()));
  /* the item of a For each is known inside it, not after it */
  assert.ok(!c.some(x => /^unknownPh:doc@[45]$/.test(x)), c.join());
});

test("5.26 valuesAt: inside a For each - its item and loop; values set by steps", () => {
  const v = A.valuesAt(docsAuto(), "dl");
  assert.deepEqual(v.locals.map(x => x.name), ["doc", "loop.n", "loop.count"]);
  assert.ok(v.saved.some(x => x.name === "pdfs" && x.list), JSON.stringify(v.saved));
  assert.ok(v.saved.some(x => x.name === "docs" && x.shaped), "a value with fields left out says so");
  const end = A.valuesAt(docsAuto(), "");
  assert.deepEqual(end.saved.map(x => x.name).sort(), ["docs", "file", "got", "n", "names", "pdfs"]);
  assert.deepEqual(A.valuesAt(docsAuto(), "names").locals.map(x => x.name), ["item", "loop.n"], "Shape a list has its item");
});

test("5.26 run: a list shown without its tokens, filtered, shaped, gone through - each token still used", async () => {
  const b = shapeBridge(docsReplies());
  const R = await A.run(docsAuto(), env(b, { conns:[CONN_POL] }));
  assert.equal(R.state, "ok", JSON.stringify(R.steps));
  assert.deepEqual(JSON.parse(R.values.docs.v).map(d => Object.keys(d).join()), ["name,type,date", "name,type,date", "name,type,date"]);
  assert.deepEqual(R.shaped, ["docs"]);
  assert.deepEqual(JSON.parse(R.values.pdfs.v).map(d => d.name), ["Schedule.pdf", "Wording.pdf"]);
  assert.deepEqual(JSON.parse(R.values.names.v), ["Schedule.pdf", "Wording.pdf"]);
  assert.deepEqual(JSON.parse(R.values.got.v), ["Schedule.pdf", "Wording.pdf"]);
  assert.equal(R.values.n.v, "2");
  /* the token was asked for where the item sits; the function and the loop
     number were worked out here and handed over as values of their own */
  assert.deepEqual(b.paths.slice(1), ["/download/dl-aaa111?n=1&u=SCHEDULE.PDF", "/download/dl-ccc333?n=3&u=WORDING.PDF"]);
  const sent = b.calls.filter(c => c.op === "step")[1].b;
  assert.match(sent.step.path, /^\/download\/\{\{docs\[0\]\.downloadToken\}\}\?n=\{\{__kk\d\}\}&u=\{\{__kk\d\}\}$/);
  assert.deepEqual(sent.shaped, ["docs"]);
  assert.ok(JSON.stringify(R).indexOf("dl-aaa111") < 0, "the page never held a token");
  const st = sid => R.steps.find(s => s.sid === sid);
  assert.deepEqual([st("each").n, st("each").of, st("isPdf").times, st("dl").times, st("keep").times], [3, 3, 3, 2, 2]);
  assert.deepEqual([st("pdfs").n, st("pdfs").of], [2, 3]);
  /* the closing message: a table, a line per item, a code block */
  assert.match(R.result, /\| Wording\.pdf \| 2026-10-03 \|/);
  assert.match(R.result, /\n- Schedule\.pdf\n- Wording\.pdf\n/);
  assert.match(R.result, /```json\n\[\n  "Schedule\.pdf",\n  "Wording\.pdf"\n\]\n```/);
  /* the assistant's copy: what is yours only is not in it */
  const sp = A.split(docsAuto(), R);
  assert.match(sp.resultForAI, /\(shown to you only\)$/);
  assert.ok(sp.resultForAI.indexOf("\"Schedule.pdf\",") < 0);
  assert.deepEqual(A.forAI(A.normStore({ list:[docsAuto()] }))[0].gives, ["docs", "file", "pdfs", "got", "n"]);
  const kept = A.normRun(R, 2000);
  assert.deepEqual([kept.steps.find(s => s.sid === "dl").times, kept.shaped], [2, ["docs"]]);
});

test("5.26 run: Stop ends it - inside a loop too - with its own message; for the assistant, masked", async () => {
  const a = docsAuto();
  a.steps[3].do[0].no.push(A.normStep({ id:"halt", kind:"stop", as:"fail", text:"{{doc.name}} is not a PDF ({{count(names)}} names so far)" }));
  const R = await A.run(a, env(shapeBridge(docsReplies()), { conns:[CONN_POL] }));
  assert.equal(R.state, "failed");
  assert.equal(R.result, "Card.png is not a PDF (2 names so far)");
  assert.equal(R.steps.find(s => s.sid === "each").n, 2, "it stopped on the second item");
  assert.equal(R.steps.find(s => s.sid === "n").state, "wait", "nothing after it ran");
  assert.equal(A.split(a, R).resultForAI, "Card.png is not a PDF ((shown to you only) names so far)");
  const b = A.normAuto({ steps:[{ kind:"set", var:"x", value:"1", show:"ai" }, { kind:"stop", as:"ok", when:"{{x}} == 1", text:"" },
                                { kind:"set", var:"y", value:"2" }], result:"done {{x}}" });
  const R2 = await A.run(b, env(shapeBridge([])));
  assert.deepEqual([R2.state, R2.result, R2.steps.map(s => s.state).join()], ["ok", "", "ok,ok,wait"]);
});

test("5.26 run: a hidden value cannot be used on this page; a list that is not one; append, add, text", async () => {
  const b = shapeBridge([{ status:200, json:{ token:"t-1", n:"x" } }]);
  const a = A.normAuto({ steps:[
    { kind:"http", conn:"Cpol", path:"/t", save:[{ name:"tok", from:"json", path:"token", show:"hidden" }, { name:"n", from:"json", path:"n", show:"me" }] },
    { kind:"set", var:"v", value:"{{tok}}", onFail:"continue" },
    { kind:"each", from:"{{n}}", onFail:"continue", do:[{ kind:"set", var:"q", value:"1" }] },
    { kind:"set", var:"c", how:"add", value:"2" }, { kind:"set", var:"c", how:"add", value:"3" },
    { kind:"set", var:"t", how:"text", value:"a" }, { kind:"set", var:"t", how:"text", value:"b" },
    { kind:"set", var:"l", how:"append", value:'{{split("x,y")}}' }] });
  const R = await A.run(a, env(b, { conns:[CONN_POL] }));
  assert.equal(R.steps[1].state, "fail");
  assert.equal(R.steps[1].note, "hiddenHere:tok");
  assert.equal(R.steps[2].state, "fail");
  assert.equal(R.steps[2].note, "notList");
  assert.deepEqual([R.values.c.v, R.values.t.v, R.values.l.v], ["5", "ab", '[["x","y"]]']);
  assert.equal(R.state, "partial");
});

test("5.26 wireText: functions and a loop's item go over as values of their own; secrets and names as they are", () => {
  const temps = {};
  const scope = { values:{ docs:JSON.stringify([{ name:"a b" }]), "input.x":"P1" }, hidden:["tok"],
                  locals:[{ loop:true, vars:{ doc:{ name:"a b" }, loop:{ n:1 } }, src:{ as:"doc", path:"docs[0]" } }] };
  const w = A.wireText("/{{input.x}}/{{doc.name|upper}}/{{doc.downloadToken}}/{{secret.k}}/{{tok}}/{{tok.x}}/{{json(docs)|raw}}/{{loop.n}}", scope, temps);
  assert.equal(w, "/{{input.x}}/{{__kk1}}/{{docs[0].downloadToken}}/{{secret.k}}/{{tok}}/{{tok.x}}/{{__kk2|raw}}/{{__kk3}}");
  assert.deepEqual(temps, { __kk1:"A B", __kk2:'[\n  {\n    "name": "a b"\n  }\n]', __kk3:"1" });
  assert.equal(A.nameOk("__kk1"), false, "a name with two underscores in front is the page's own");
});

/* ── 5.27: saving automations to a file, and bringing them in ─────────── */
test("5.27 export: the designs asked for, the connections they use, script file names - no secrets, no runs", () => {
  const store = A.normStore({
    conns:[CONN_AUTH, CONN_POL, { id:"Cnot", name:"Unused", base:"https://unused.example.local" }],
    list:[coi(), A.normAuto({ id:"Ascr", name:"Clear cache", steps:[{ kind:"script", script:"S1", args:[["env", "UAT"]] }] })],
    runs:[{ id:"r1", auto:"Acoi", state:"ok", values:{ coiNumber:{ v:"COI-1", show:"ai" } } }] });
  const one = A.exportFile(store, ["Acoi"], { scripts:[{ id:"S1", file:"clear-cache.bat" }], app:"5.27.0" });
  assert.equal(one.kind, "kalkech.automations");
  assert.equal(one.version, 1);
  assert.deepEqual(one.automations.map(a => a.id), ["Acoi"]);
  assert.deepEqual(one.connections.map(c => c.id).sort(), ["Cauth", "Cpol"], "only the connections it uses");
  const text = JSON.stringify(one);
  assert.ok(text.indexOf("COI-1") < 0 && text.indexOf("\"runs\"") < 0, "no run history");
  assert.ok(text.indexOf("{{secret.password}}") >= 0, "a secret only by its name");
  const all = A.exportFile(store, null, { scripts:[{ id:"S1", file:"clear-cache.bat" }], allConns:true });
  assert.equal(all.automations.length, 2);
  assert.equal(all.connections.length, 3, "Export all keeps every connection");
  assert.equal(all.automations[1].steps[0].scriptFile, "clear-cache.bat");
});

test("5.27 readFile: its own file, pasted with a fence, a list, one design, a workspace export; junk refused", () => {
  const f = A.exportFile(A.normStore({ conns:[CONN_POL], list:[coi()] }), null, {});
  assert.equal(A.readFile(JSON.stringify(f)).autos.length, 1);
  assert.equal(A.readFile("```json\n" + JSON.stringify(f, null, 2) + "\n```").autos.length, 1);
  assert.equal(A.readFile("~~~\n" + JSON.stringify(f) + "\n~~~").conns.length, 1);
  assert.equal(A.readFile([{ name:"a", steps:[] }, { name:"b", steps:[] }]).autos.length, 2);
  const bare = A.readFile({ name:"Look it up", steps:[{ kind:"http", conn:"C1", path:"/x" }], connections:[{ id:"C1", base:"https://x.example.local" }] });
  assert.deepEqual([bare.autos.length, bare.conns.length], [1, 1]);
  assert.equal(A.readFile({ kind:"kalkech.export", settings:{ automations:{ list:[coi()], conns:[CONN_POL] } } }).autos.length, 1);
  assert.equal(A.readFile("{ not json").error, "json");
  assert.equal(A.readFile({ hello:"world" }).error, "shape");
  assert.equal(A.readFile({ automations:[] }).error, "empty");
  assert.equal(A.readFile("").error, "empty");
});

test("5.27 planImport: the same address is that connection, an id taken gets a new one, scripts by file name, the assistant asks first", () => {
  const mine = A.normStore({ conns:[{ id:"Cmine", name:"My policy API", base:"https://POLICY.example.local/v2/", auth:"none" },
                                    { id:"Cauth", name:"Something else", base:"https://other.example.local", auth:"none" }],
                             list:[A.normAuto({ id:"Aold", name:"Regenerate COI", steps:[{ kind:"wait" }] })] });
  const design = coi();
  design.ai = true; design.ask = false;
  design.steps.push(A.normStep({ kind:"script", name:"Tidy", script:"Sx" }), A.normStep({ kind:"script", name:"Gone", script:"Sy" }));
  const file = A.exportFile(A.normStore({ conns:[CONN_AUTH, CONN_POL], list:[design] }), null,
                            { scripts:[{ id:"Sx", file:"tidy.bat" }, { id:"Sy", file:"missing.bat" }] });
  const plan = A.planImport(A.readFile(JSON.stringify(file)), mine, { scripts:[{ id:"S7", file:"TIDY.BAT" }] });
  const byFrom = n => plan.conns.find(x => (x.from || x.c.name) === n);
  assert.equal(byFrom("Policy API (UAT)").how, "reuse", "same address (any case, trailing slash) and sign-in");
  assert.equal(byFrom("Policy API (UAT)").use, "Cmine");
  const auth = byFrom("Login service (UAT)");
  assert.equal(auth.how, "new");
  assert.notEqual(auth.use, "Cauth", "its id is taken here by another address: a new one");
  const p = plan.autos[0];
  assert.deepEqual([p.how, p.match, p.existing.id], ["add", "name", "Aold"], "same name, other id: added beside it");
  assert.equal(p.a.ask, true);
  assert.equal(p.noAsk, true);
  assert.equal(p.a.steps[0].conn, auth.use);
  assert.equal(p.a.steps[1].conn, "Cmine");
  assert.equal(p.a.steps[3].script, "S7");
  assert.deepEqual(p.scripts, ["missing.bat"]);
  assert.ok(p.probs.some(x => x.code === "scriptGone"), "the checker says what is missing");
  /* bringing it in */
  const out = A.applyImport(plan, {}, mine);
  assert.deepEqual([out.added, out.replaced, out.conns], [1, 0, 1]);
  assert.equal(mine.list[1].name, "Regenerate COI (2)");
  assert.equal(mine.conns.length, 3);
  /* the same file again: now it is here unchanged - left alone; changed - replaced */
  const again = A.planImport(A.readFile(JSON.stringify(file)), A.normStore({ conns:mine.conns, list:[Object.assign({}, p.a, { id:"Acoi" })] }), { scripts:[{ id:"S7", file:"tidy.bat" }] });
  assert.equal(again.autos[0].how, "skip");
  assert.equal(again.autos[0].same, true);
  const changed = JSON.parse(JSON.stringify(file));
  changed.automations[0].about = "changed";
  const st2 = A.normStore({ conns:mine.conns, list:[Object.assign({}, p.a, { id:"Acoi" })], runs:[{ id:"r9", auto:"Acoi", state:"ok" }] });
  const plan2 = A.planImport(A.readFile(changed), st2, {});
  assert.equal(plan2.autos[0].how, "replace");
  const out2 = A.applyImport(plan2, {}, st2);
  assert.deepEqual([out2.replaced, st2.list.length, st2.list[0].id, st2.list[0].about], [1, 1, "Acoi", "changed"]);
  /* a choice the other way: added as a copy, with a new id */
  const st3 = A.normStore({ conns:mine.conns, list:[Object.assign({}, p.a, { id:"Acoi" })] });
  const out3 = A.applyImport(A.planImport(A.readFile(changed), st3, {}), { 0:"add" }, st3);
  assert.equal(out3.added, 1);
  assert.notEqual(st3.list[1].id, "Acoi");
});

test("5.27 import: a file of connections only brings them in; skipped designs leave theirs out; too many is refused", () => {
  const st = A.normStore({});
  const file = A.readFile({ automations:[A.normAuto({ name:"A", steps:[{ kind:"http", conn:"C1" }] })],
                            connections:[{ id:"C1", name:"One", base:"https://one.example.local" }, { id:"C2", name:"Two", base:"https://two.example.local" }] });
  const plan = A.planImport(file, st, {});
  const out = A.applyImport(plan, { 0:"skip" }, st);
  assert.deepEqual([out.skipped, out.conns, st.conns.map(c => c.name).join()], [1, 1, "Two"], "C1 is only for the skipped design");
  const many = A.readFile({ automations:Array.from({ length:5 }, (x, i) => ({ name:"n" + i, steps:[] })) });
  const full = A.normStore({ list:Array.from({ length:A.LIMIT.autos - 2 }, (x, i) => ({ name:"m" + i, steps:[] })) });
  assert.equal(A.planImport(many, full, {}).error, "tooMany");
  assert.equal(A.planImport({ error:"json" }, st, {}).error, "json");
});

test("5.28 Show it as it is: kept only for a shown value, sent to the tray program, ends the warning; a file cannot switch it on", () => {
  const conns = [A.normConn({ id:"C1", name:"Docs", base:"https://docs.example.local" })];
  const a = A.normAuto({ name:"Docs", steps:[{ kind:"http", conn:"C1", path:"/docs", reply:"ai", replyRaw:true,
    save:[{ name:"docs", from:"json", path:"result", show:"ai", drop:"token", allow:true },
          { name:"token", from:"json", path:"t", show:"ai" },
          { name:"key", from:"json", path:"k", show:"hidden", allow:true }] }] });
  const sv = a.steps[0].save;
  assert.deepEqual([sv[0].allow, sv[1].allow, sv[2].allow, a.steps[0].replyRaw], [true, undefined, undefined, true], "not for a hidden value");
  const w = A.stepWire(a.steps[0], {});
  assert.deepEqual([w.save[0].allow, w.save[2].allow, w.replyRaw], [true, undefined, true]);
  /* no whole reply kept: no "as it is" either */
  assert.equal(A.normAuto({ name:"x", steps:[{ kind:"http", replyRaw:true }] }).steps[0].replyRaw, undefined);
  /* the warning on a value named like a secret - gone once they say so */
  assert.ok(A.check(a, { conns }).some(p => p.code === "aiSeesSecret" && p.name === "token"));
  sv[1].allow = true;
  assert.ok(!A.check(A.normAuto(a), { conns }).some(p => p.code === "aiSeesSecret"));
  /* imported: their call, made on this PC - not the file's */
  const plan = A.planImport(A.readFile({ kind:"kalkech.automations", automations:[A.normAuto(a)], connections:conns }), A.normStore({}), {});
  const ia = plan.autos[0].a;
  assert.equal(plan.autos[0].unallowed, 3);
  assert.ok(!ia.steps[0].save.some(v => v.allow) && !ia.steps[0].replyRaw);
});

test("5.28 a value the tray program kept hidden although shown: the run says which", async () => {
  const a = A.normAuto({ name:"Docs", steps:[{ kind:"http", conn:"C1", path:"/docs", save:[{ name:"docs", from:"json", path:"result", show:"ai" }] }] });
  const conns = [A.normConn({ id:"C1", name:"Docs", base:"https://docs.example.local" })];
  const R = await A.run(a, { conns, values:{}, sleep:async () => true, ask:async () => true, tick:() => {}, stopped:() => false,
    call:async op => op === "step" ? { ok:true, status:200, saved:{}, hidden:["docs"], redacted:["docs", "bad name!"], missing:[] } : { ok:true } });
  assert.deepEqual(R.steps[0].redacted, ["docs"]);
  assert.deepEqual(R.hidden, ["docs"]);
  assert.deepEqual(A.normRun(R).steps[0].redacted, ["docs"], "kept in the run history");
});
