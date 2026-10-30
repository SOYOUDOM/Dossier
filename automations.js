/* ═══════════════════════════════════════════════════════════════════════════
   KALKECH AUTOMATIONS — jobs you design, run one step at a time

   An automation is a short chain of steps that does one support job:
   sign in to an API, call another one with the token it gave, run one of
   your scripts with a value from the reply, wait until a job says DONE.
   You design it once (Menu → Automations); after that you, or the
   assistant when you ask it to, run it with the few values it needs - a
   policy number, an environment.

   This file is the pure half: what a design looks like, the checks on it,
   the placeholder and condition rules, what the assistant is allowed to
   see, and the loop that runs the steps in order. It never touches the
   network and never sees a password. The steps themselves are carried out
   by the KalKech tray program (scripts/bridge/DossierBridge.cs), because a
   page in a browser cannot call your company's APIs or start a program,
   and because the secrets live there:

     - a SECRET (a password, an API key) is typed once into Setup and goes
       straight to the tray program, which keeps it encrypted for your
       Windows account. Nothing - not this page, not the assistant - can
       read it back. A step names it as {{secret.password}} and the tray
       program puts it in at the last moment.
     - a value saved from a reply can be HIDDEN (it stays inside the tray
       program for the run - a token), shown to YOU, or shown to you AND
       THE ASSISTANT. Only the last kind is ever sent to the model.

   window.DossierAuto in the page; module.exports for the unit tests.
   ═══════════════════════════════════════════════════════════════════════════ */
(function(root){
"use strict";

/* ── limits ──────────────────────────────────────────────────────────────
   Generous for a support job and small enough that a mistake - a loop that
   polls every second for an hour - cannot happen by accident. The tray
   program holds the same limits itself; these are for the editor. */
const LIMIT = { steps:40, inputs:20, saves:12, pairs:30, conns:60, autos:200, runs:40,
                times:30, every:300, wait:600, http:120, script:600,
                value:4000, body:100000, name:80 };

const KINDS = ["http", "script", "wait", "confirm"];
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"];
const BODIES = ["none", "json", "form", "xml", "text"];
/* how a connection signs in by itself. "A sign-in step first" is not one of
   these: it is a design - a step that posts to the login address and saves
   the token, hidden, for the steps after it (a starter does exactly that). */
const AUTHS = ["none", "windows", "basic", "header", "bearer"];
const AUTH_SECRETS = { none:[], windows:[], basic:["username", "password"], header:["apiKey"], bearer:["token"] };
const SHOWS = ["hidden", "me", "ai"];
/* when a value is saved: when the step worked, when it failed (an API's
   error reply is often a different JSON from its success reply), or both */
const SAVE_ON = ["ok", "fail", "any"];
/* the whole reply of a step, kept: not at all, for you, or for you and
   the assistant */
const REPLY_SHOWS = ["", "me", "ai"];
const FROM = { http:["json", "header", "status", "regex", "body"], script:["output", "json", "regex", "exit"] };
const INPUT_KINDS = ["text", "number", "date", "choice", "secret"];
/* values every step can use without saving them first */
const BUILTINS = ["today", "now", "time", "uuid"];
const RECORD_FIELDS = ["code", "ticket", "title", "system"];
const FILTERS = ["upper", "lower", "trim", "base64", "raw"];
/* names a saved value may not take: they mean something already */
const RESERVED = ["input", "secret", "record", "today", "now", "time", "uuid", "status",
                  "true", "false", "empty", "not", "and", "or", "contains", "is", "starts", "ends", "with"];
/* headers the tray program sets itself, or that would let a value rewrite
   the request around it */
const FORBIDDEN_HEADERS = ["host", "content-length", "connection", "transfer-encoding", "expect", "te",
                           "upgrade", "keep-alive", "proxy-authorization", "proxy-connection", "trailer"];

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const PH_RE = /\{\{([^{}]*)\}\}/g;
/* a value going to a script may not carry what cmd.exe reads as an
   instruction - an & or a | would start a command of its own, a % or a !
   would be expanded, a quote would end the argument early */
const CMD_BAD = /["%!^&|<>()\r\n\0]/;

/* ── small helpers ───────────────────────────────────────────────────── */
function obj(v){ return (v && typeof v === "object" && !Array.isArray(v)) ? v : {}; }
function arr(v){ return Array.isArray(v) ? v : []; }
function str(v, n){ return String(v == null ? "" : v).slice(0, n || 400); }
function int(v, d){ const n = Math.round(Number(v)); return isFinite(n) ? n : d; }
function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)); }
function uniq(a){ return a.filter((x, i) => a.indexOf(x) === i); }
function rnd(n){
  let s = "";
  const c = (typeof crypto !== "undefined" && crypto.getRandomValues) ? crypto.getRandomValues(new Uint8Array(n)) : null;
  for (let i = 0; i < n; i++) s += "abcdefghijklmnopqrstuvwxyz0123456789"[(c ? c[i] : Math.floor(Math.random() * 256)) % 36];
  return s;
}
function newId(prefix){ return prefix + Date.now().toString(36) + rnd(4); }
function idOk(v){ const s = String(v == null ? "" : v); return ID_RE.test(s) ? s : ""; }
function nameOk(v){ return NAME_RE.test(String(v || "")) && RESERVED.indexOf(String(v).toLowerCase()) < 0; }
function flat(s){ return String(s || "").toLowerCase().replace(/[^a-z0-9ក-៿]+/g, ""); }

/* name/value rows - query, headers, form fields, script values - kept as
   [name, value] pairs so the order you wrote them in is the order they go */
function pairs(v){
  return arr(v).map(p => Array.isArray(p) ? [str(p[0], 200).trim(), str(p[1], LIMIT.value)]
                       : (p && typeof p === "object") ? [str(p.k != null ? p.k : p.name, 200).trim(), str(p.v != null ? p.v : p.value, LIMIT.value)]
                       : null)
    .filter(p => p && p[0]).slice(0, LIMIT.pairs);
}

/* ═══ WHAT A DESIGN LOOKS LIKE ═══════════════════════════════════════════
   Everything read from a workspace goes through these, so a hand-edited
   file, an import from another PC or an old version cannot put a shape
   in front of the runner that it was not written for. */

function normConn(c){
  c = obj(c);
  const auth = AUTHS.indexOf(c.auth) >= 0 ? c.auth : "none";
  return {
    id: idOk(c.id) || newId("C"),
    name: str(c.name, LIMIT.name).trim() || "Connection",
    /* the address every step on it starts with; a step's path goes after
       it, and the tray program will not send a request anywhere else */
    base: str(c.base, 500).trim().replace(/\/+$/, ""),
    auth: auth,
    /* the header an API key goes in, for auth "header" */
    header: str(c.header, 80).trim() || (auth === "header" ? "X-API-Key" : ""),
    /* secrets of your own beyond the sign-in's - a client id, a second key */
    extra: uniq(arr(c.extra).map(x => str(x, 40).trim()).filter(nameOk)).slice(0, 12),
    timeout: clamp(int(c.timeout, 30), 1, LIMIT.http),
    proxy: c.proxy === "none" ? "none" : "system",
    note: str(c.note, 500)
  };
}
/* every secret name a connection's steps may use */
function connSecrets(c){
  if (!c) return [];
  return uniq((AUTH_SECRETS[c.auth] || []).concat(arr(c.extra)));
}
/* "https://api.example.local:8443/policy" -> its parts, or null */
function baseParts(base){
  const m = /^(https?):\/\/([^\/?#@\s]+)(\/[^?#\s]*)?$/i.exec(String(base || "").trim());
  if (!m) return null;
  return { scheme:m[1].toLowerCase(), host:m[2].toLowerCase(), path:(m[3] || "").replace(/\/+$/, "") };
}

function normSave(kind){
  const from = FROM[kind] || FROM.http;
  return function(x){
    x = obj(x);
    const name = str(x.name, 40).trim();
    if (!name) return null;
    return { name: name, from: from.indexOf(x.from) >= 0 ? x.from : from[0],
             path: str(x.path, 300).trim(), show: SHOWS.indexOf(x.show) >= 0 ? x.show : "me",
             on: SAVE_ON.indexOf(x.on) >= 0 ? x.on : "ok" };
  };
}

function normStep(s, i){
  s = obj(s);
  const kind = KINDS.indexOf(s.kind) >= 0 ? s.kind : "http";
  const out = { id: idOk(s.id) || ("s" + rnd(6)), kind: kind,
                name: str(s.name, LIMIT.name).trim(),
                /* run this step only when... (empty: always) */
                when: str(s.when, 300).trim(),
                onFail: s.onFail === "continue" ? "continue" : "stop" };
  if (kind === "http"){
    const m = String(s.method || "").toUpperCase();
    out.conn = idOk(s.conn);
    out.method = METHODS.indexOf(m) >= 0 ? m : "GET";
    out.path = str(s.path, 2000).trim();
    out.query = pairs(s.query);
    out.headers = pairs(s.headers);
    out.bodyType = BODIES.indexOf(s.bodyType) >= 0 ? s.bodyType : "none";
    out.body = str(s.body, LIMIT.body);
    out.form = pairs(s.form);
    /* which answers count as success: "2xx", "200,201", "2xx,404", "any" */
    out.expect = str(s.expect, 60).trim() || "2xx";
  } else if (kind === "script"){
    out.script = str(s.script, 80);
    out.args = pairs(s.args);
    /* a connection whose secrets this script may be handed (optional) */
    out.conn = idOk(s.conn);
    out.timeout = clamp(int(s.timeout, 120), 1, LIMIT.script);
    out.expect = str(s.expect, 60).trim() || "0";
  } else if (kind === "wait"){
    out.seconds = clamp(int(s.seconds, 10), 1, LIMIT.wait);
  } else if (kind === "confirm"){
    out.text = str(s.text, 2000);
  }
  if (kind === "http" || kind === "script"){
    out.save = arr(s.save).slice(0, LIMIT.saves).map(normSave(kind)).filter(Boolean);
    /* the status is not always the whole story: an API that answers 200
       with {"success": false} has failed. This is read after the values
       are saved, and the step only counts as done when it is true. */
    out.okWhen = str(s.okWhen, 300).trim();
    /* keep the whole reply (or a script's whole output), as it came -
       passwords and tokens masked - for you, or for you and the assistant */
    out.reply = REPLY_SHOWS.indexOf(s.reply) >= 0 ? s.reply : "";
    const r = obj(s.repeat);
    out.repeat = { until: str(r.until, 300).trim(),
                   times: clamp(int(r.times, 10), 1, LIMIT.times),
                   every: clamp(int(r.every, 5), 1, LIMIT.every) };
  }
  if (!out.name) out.name = "Step " + ((i || 0) + 1);
  return out;
}

function normInput(x){
  x = obj(x);
  const kind = INPUT_KINDS.indexOf(x.kind) >= 0 ? x.kind : "text";
  return { key: str(x.key, 40).trim(), label: str(x.label, LIMIT.name).trim(), kind: kind,
           required: x.required !== false,
           /* the whole value must match it - "[A-Z]\d{8}" means exactly that */
           pattern: kind === "secret" ? "" : str(x.pattern, 300),
           example: kind === "secret" ? "" : str(x.example, 200),
           choices: kind === "choice" ? uniq(arr(x.choices).map(c => str(c, 120).trim()).filter(Boolean)).slice(0, 40) : [] };
}

function normAuto(a){
  a = obj(a);
  return {
    id: idOk(a.id) || newId("A"),
    name: str(a.name, LIMIT.name).trim() || "New automation",
    about: str(a.about, 600).trim(),
    system: str(a.system, 120).trim(),
    inputs: arr(a.inputs).slice(0, LIMIT.inputs).map(normInput).filter(i => i.key),
    steps: arr(a.steps).slice(0, LIMIT.steps).map(normStep),
    /* the line shown when it finishes: "COI {{coiNumber}} is ready" */
    result: str(a.result, 1000),
    /* ...and when it fails: "Not regenerated: {{errorMessage}}" */
    resultFail: str(a.resultFail, 1000),
    /* may the assistant start it, and does it ask you first when it does */
    ai: a.ai !== false,
    ask: a.ask !== false,
    updated: str(a.updated, 40)
  };
}

/* a past run, as kept in the history: never a hidden value (the page never
   had one), never a secret input, never the reply text */
function normRun(r, replyMax){
  r = obj(r);
  const rmax = replyMax == null ? 20000 : replyMax;
  const vals = {};
  Object.keys(obj(r.values)).slice(0, 40).forEach(k => {
    const v = obj(r.values[k]);
    if (NAME_RE.test(k) && (v.show === "me" || v.show === "ai")) vals[k] = { v:str(v.v, 600), show:v.show };
  });
  const ins = {};
  Object.keys(obj(r.inputs)).slice(0, LIMIT.inputs).forEach(k => { ins[str(k, 40)] = str(r.inputs[k], 300); });
  return { id: idOk(r.id) || newId("r"), auto: idOk(r.auto), name: str(r.name, LIMIT.name),
           by: r.by === "assistant" ? "assistant" : "me", record: str(r.record, 40),
           started: str(r.started, 40), ended: str(r.ended, 40), ms: Math.max(0, int(r.ms, 0)),
           state: ["ok", "failed", "partial", "stopped", "running"].indexOf(r.state) >= 0 ? (r.state === "running" ? "stopped" : r.state) : "failed",
           inputs: ins, values: vals, hidden: arr(r.hidden).map(x => str(x, 40)).filter(x => NAME_RE.test(x)).slice(0, 40),
           steps: arr(r.steps).slice(0, LIMIT.steps).map(s => {
             s = obj(s);
             return { name: str(s.name, LIMIT.name), kind: KINDS.indexOf(s.kind) >= 0 ? s.kind : "http",
                      state: str(s.state, 12), status: int(s.status, 0) || undefined, ms: Math.max(0, int(s.ms, 0)),
                      tries: int(s.tries, 0) || undefined, note: str(s.note, 300) || undefined,
                      reply: s.reply && rmax ? str(s.reply, rmax) : undefined,
                      replyShow: s.reply && rmax && (s.replyShow === "ai" || s.replyShow === "me") ? s.replyShow : undefined,
                      replyCut: s.reply && rmax && (s.replyCut || String(s.reply).length > rmax) ? true : undefined };
           }),
           result: str(r.result, 1200), error: str(r.error, 300) };
}

/* the whole store, as it sits in settings.automations */
function normStore(x){
  x = obj(x);
  return { v: 1,
           /* may the assistant run automations at all (one switch for all) */
           aiCan: x.aiCan !== false,
           conns: arr(x.conns).slice(0, LIMIT.conns).map(normConn),
           list: arr(x.list).slice(0, LIMIT.autos).map(normAuto),
           runs: arr(x.runs).slice(0, LIMIT.runs).map(normRun) };
}

/* ═══ PLACEHOLDERS ═══════════════════════════════════════════════════════
   {{input.policy}}      a value given when it runs
   {{token}}             a value an earlier step saved
   {{secret.password}}   a secret of the step's connection - filled in by
                         the tray program, never seen here
   {{record.code}}       the record it was run for (code, ticket, title, system)
   {{today}} {{now}} {{time}} {{uuid}}
   ...each with filters after a bar: {{input.policy|upper}}.
   They are filled in ONCE, in one pass: a value that happens to contain
   "{{secret.password}}" - from an API reply, or typed - is text, and is
   never filled in a second time. */

function parsePh(inner){
  const bits = String(inner).split("|").map(x => x.trim());
  const m = /^(?:(input|secret|record)\.)?([A-Za-z_][A-Za-z0-9_]*)$/.exec(bits[0]);
  const filters = bits.slice(1).map(x => x.toLowerCase());
  if (!m) return { bad:"name", raw:String(inner), filters:filters };
  const bf = filters.filter(f => FILTERS.indexOf(f) < 0);
  return { ns: m[1] || "", name: m[2], full: (m[1] ? m[1] + "." : "") + m[2], filters: filters,
           bad: bf.length ? "filter" : "", badFilters: bf, raw: String(inner) };
}
function placeholders(text){
  const out = [];
  String(text == null ? "" : text).replace(PH_RE, (m, inner) => { out.push(parsePh(inner)); return m; });
  return out;
}
function utf8b64(s){
  if (typeof Buffer !== "undefined") return Buffer.from(String(s), "utf8").toString("base64");
  const bytes = new TextEncoder().encode(String(s));
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function filtered(v, filters){
  let s = String(v == null ? "" : v);
  (filters || []).forEach(f => {
    if (f === "upper") s = s.toUpperCase();
    else if (f === "lower") s = s.toLowerCase();
    else if (f === "trim") s = s.trim();
    else if (f === "base64") s = utf8b64(s);
  });
  return s;
}
/* A text with its placeholders filled in for SHOWING - a confirm step's
   question, the line at the end, a preview. Never for sending: secrets and
   hidden values are not here to fill in, and show as 🔒name. masks: name ->
   what to show instead (a value shown to you only, in a line the
   assistant will read, is "(shown to you only)"). */
function show(text, values, hidden, masks){
  values = obj(values); hidden = arr(hidden); masks = obj(masks);
  return String(text == null ? "" : text).replace(PH_RE, (m, inner) => {
    const p = parsePh(inner);
    if (p.bad === "name") return m;
    if (p.ns === "secret" || hidden.indexOf(p.full) >= 0) return "🔒" + p.full;
    if (masks[p.full] != null) return masks[p.full];
    const v = values[p.full];
    return v == null ? m : filtered(v, p.filters);
  });
}

/* the values every step can use: today, now, time, uuid, and the record */
function builtins(when, record){
  const d = when instanceof Date ? when : new Date();
  const p2 = n => String(n).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  const out = {
    today: d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()),
    time: p2(d.getHours()) + ":" + p2(d.getMinutes()),
    now: d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()) + "T" + p2(d.getHours()) + ":" +
         p2(d.getMinutes()) + ":" + p2(d.getSeconds()) + (off >= 0 ? "+" : "-") + p2(Math.floor(Math.abs(off) / 60)) + ":" + p2(Math.abs(off) % 60),
    uuid: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID()
        : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
            const r = Math.floor(Math.random() * 16); return (c === "x" ? r : (r & 3) | 8).toString(16); })
  };
  const r = obj(record);
  RECORD_FIELDS.forEach(k => { out["record." + k] = str(r[k], 400); });
  return out;
}

/* ═══ CONDITIONS ═════════════════════════════════════════════════════════
   "Only run this step when" and "Repeat until" are short tests, written the
   way you would say them:

     {{status}} == 200          {{state}} == "DONE"         {{count}} > 0
     {{coiUrl}}                 (it has a value)            not {{error}}
     {{message}} contains "ready"     {{id}} is empty     {{id}} is not empty
     {{a}} == 1 and ({{b}} != "x" or {{c}} starts with "TMP")

   No code runs: this is a small reader of its own, and the tray program has
   the same one (it is the one that decides, because a hidden value is only
   there). == and != ignore capitals and the spaces around; two numbers
   are compared as numbers. A value that was never set is empty. */

function lexCond(src){
  const s = String(src || ""), out = [];
  let i = 0;
  while (i < s.length){
    const c = s[i];
    if (/\s/.test(c)){ i++; continue; }
    if (s.startsWith("{{", i)){
      const j = s.indexOf("}}", i + 2);
      if (j < 0) return { error:"brace", at:i };
      out.push({ t:"ph", p:parsePh(s.slice(i + 2, j)) });
      i = j + 2; continue;
    }
    if (c === '"' || c === "'"){
      let j = i + 1, v = "";
      while (j < s.length && s[j] !== c){
        if (s[j] === "\\" && j + 1 < s.length){ v += s[j + 1]; j += 2; }
        else v += s[j++];
      }
      if (j >= s.length) return { error:"quote", at:i };
      out.push({ t:"lit", v:v }); i = j + 1; continue;
    }
    const num = /^-?\d+(?:\.\d+)?/.exec(s.slice(i));
    if (num && (c !== "-" || !out.length || out[out.length - 1].t === "op")){
      out.push({ t:"lit", v:num[0] }); i += num[0].length; continue;
    }
    const op = /^(==|!=|>=|<=|&&|\|\||=|>|<|!|\(|\))/.exec(s.slice(i));
    if (op){
      const v = op[0] === "=" ? "==" : op[0] === "&&" ? "and" : op[0] === "||" ? "or" : op[0] === "!" ? "not" : op[0];
      out.push({ t:"op", v:v }); i += op[0].length; continue;
    }
    const w = /^[A-Za-z]+/.exec(s.slice(i));
    if (w){
      const lw = w[0].toLowerCase();
      if (["and", "or", "not", "contains", "is", "empty", "starts", "ends", "with"].indexOf(lw) >= 0) out.push({ t:"op", v:lw });
      else if (lw === "true" || lw === "false") out.push({ t:"lit", v:lw });
      else return { error:"word", at:i, word:w[0] };
      i += w[0].length; continue;
    }
    return { error:"char", at:i, char:c };
  }
  return { tokens:out };
}

function parseCond(src){
  const lx = lexCond(src);
  if (lx.error) return lx;
  const t = lx.tokens;
  if (!t.length) return { error:"empty" };
  let i = 0;
  const peek = v => t[i] && t[i].t === "op" && t[i].v === v;
  const fail = (code) => { throw { error:code, at:i }; };
  function atom(){
    const k = t[i];
    if (!k) fail("end");
    if (k.t === "ph"){ if (k.p.bad) fail("name"); i++; return { op:"val", ph:k.p }; }
    if (k.t === "lit"){ i++; return { op:"val", lit:k.v }; }
    if (peek("(")){ i++; const e = orE(); if (!peek(")")) fail("paren"); i++; return e; }
    fail("operand");
  }
  function cmp(){
    const a = atom();
    if (peek("is")){
      i++;
      let neg = false;
      if (peek("not")){ neg = true; i++; }
      if (!peek("empty")) fail("isEmpty");
      i++;
      return { op:"empty", a:a, neg:neg };
    }
    if (peek("not") && t[i + 1] && t[i + 1].t === "op" && t[i + 1].v === "contains"){
      i += 2; return { op:"not", a:{ op:"cmp", cmp:"contains", a:a, b:atom() } };
    }
    if (peek("starts") || peek("ends")){
      const which = t[i].v; i++;
      if (!peek("with")) fail("with");
      i++;
      return { op:"cmp", cmp:which, a:a, b:atom() };
    }
    for (const o of ["==", "!=", ">=", "<=", ">", "<", "contains"]){
      if (peek(o)){ i++; return { op:"cmp", cmp:o, a:a, b:atom() }; }
    }
    return a;
  }
  function notE(){
    if (peek("not")){ i++; return { op:"not", a:notE() }; }
    return cmp();
  }
  function andE(){
    let a = notE();
    while (peek("and")){ i++; a = { op:"and", a:a, b:notE() }; }
    return a;
  }
  function orE(){
    let a = andE();
    while (peek("or")){ i++; a = { op:"or", a:a, b:andE() }; }
    return a;
  }
  try {
    const ast = orE();
    if (i < t.length) return { error:"extra", at:i };
    return { ast:ast };
  } catch(e){
    if (e && e.error) return e;
    throw e;
  }
}
/* the names a condition reads, for the editor's checks */
function condNames(src){
  const lx = lexCond(src);
  return lx.error ? [] : lx.tokens.filter(k => k.t === "ph" && !k.p.bad).map(k => k.p);
}

const NUM_RE = /^\s*-?\d+(?:\.\d+)?\s*$/;
function truthy(v){
  if (v == null) return false;
  const s = String(v).trim();
  return s !== "" && !/^(false|0|null|undefined|no)$/i.test(s);
}
/* lookup(placeholder) -> its value as text, or undefined when not set */
function evalCond(ast, lookup){
  const val = n => n.op === "val" ? (n.ph ? lookup(n.ph) : n.lit) : (evalNode(n) ? "true" : "false");
  function evalNode(n){
    switch (n.op){
      case "or": return evalNode(n.a) || evalNode(n.b);
      case "and": return evalNode(n.a) && evalNode(n.b);
      case "not": return !evalNode(n.a);
      case "val": return truthy(n.ph ? lookup(n.ph) : n.lit);
      case "empty": {
        const v = val(n.a);
        const e = v == null || String(v).trim() === "";
        return n.neg ? !e : e;
      }
      case "cmp": {
        const a = val(n.a), b = val(n.b);
        const as = a == null ? "" : String(a).trim(), bs = b == null ? "" : String(b).trim();
        const nums = NUM_RE.test(as) && NUM_RE.test(bs);
        const al = as.toLowerCase(), bl = bs.toLowerCase();
        switch (n.cmp){
          case "==": return nums ? Number(as) === Number(bs) : al === bl;
          case "!=": return nums ? Number(as) !== Number(bs) : al !== bl;
          case ">":  return nums ? Number(as) > Number(bs) : al > bl;
          case "<":  return nums ? Number(as) < Number(bs) : al < bl;
          case ">=": return nums ? Number(as) >= Number(bs) : al >= bl;
          case "<=": return nums ? Number(as) <= Number(bs) : al <= bl;
          case "contains": return al.indexOf(bl) >= 0;
          case "starts": return al.indexOf(bl) === 0;
          case "ends": return bl.length <= al.length && al.slice(al.length - bl.length) === bl;
        }
        return false;
      }
    }
    return false;
  }
  return evalNode(ast);
}
/* one condition against plain values - for the tests, and for a stand-in */
function test(src, values){
  const p = parseCond(src);
  if (p.error) return { error:p.error };
  values = obj(values);
  return { result: evalCond(p.ast, ph => {
    const v = values[ph.full];
    return v == null ? undefined : filtered(v, ph.filters);
  }) };
}

/* ═══ CHECKING A DESIGN ══════════════════════════════════════════════════
   Before it is saved and before it runs: every placeholder a step reads
   must be something that exists by then - an input, a value an EARLIER
   step saves, a secret of the step's own connection. Problems come back as
   codes with what they are about; the page says them in words.
   { step: index or -1, field, code, name?, warn? } */
function check(a, ctx){
  a = normAuto(a);
  ctx = obj(ctx);
  const conns = arr(ctx.conns), scripts = arr(ctx.scripts);
  const out = [];
  const add = (step, field, code, extra) => out.push(Object.assign({ step:step, field:field, code:code }, extra || {}));

  if (!a.steps.length) add(-1, "steps", "noSteps");
  const keys = {};
  a.inputs.forEach((inp, i) => {
    if (!nameOk(inp.key)) add(-1, "input" + i, "inputKey", { name:inp.key });
    else if (keys[inp.key.toLowerCase()]) add(-1, "input" + i, "inputTwice", { name:inp.key });
    keys[inp.key.toLowerCase()] = 1;
    if (inp.kind === "choice" && !inp.choices.length) add(-1, "input" + i, "noChoices", { name:inp.key });
    if (inp.pattern){ try { new RegExp(inp.pattern); } catch(e){ add(-1, "input" + i, "badPattern", { name:inp.key }); } }
  });

  /* what exists so far: inputs, the built-ins, the record */
  const known = {};
  a.inputs.forEach(inp => { known["input." + inp.key] = "input"; });
  BUILTINS.forEach(k => { known[k] = "builtin"; });
  RECORD_FIELDS.forEach(k => { known["record." + k] = "builtin"; });
  const saved = {};

  const reads = (si, field, text, conn, extra) => {
    placeholders(text).forEach(p => {
      if (p.bad === "name") return add(si, field, "badPh", { name:p.raw });
      if (p.bad === "filter") add(si, field, "badFilter", { name:p.full, filters:p.badFilters.join(", ") });
      if (p.ns === "secret"){
        if (!conn) add(si, field, "secretNoConn", { name:p.full });
        else if (connSecrets(conn).indexOf(p.name) < 0) add(si, field, "secretUnknown", { name:p.full, conn:conn.name });
        return;
      }
      if (known[p.full] || (extra && extra[p.full])) return;
      add(si, field, saved[p.full] === "later" ? "usedTooEarly" : "unknownPh", { name:p.full });
    });
  };
  const readsCond = (si, field, src, conn, extra) => {
    if (!src) return;
    const pc = parseCond(src);
    if (pc.error) return add(si, field, "badCond", { why:pc.error });
    /* a test that could read a secret could be used to guess it, a
       character at a time; the tray program refuses one, and so does this */
    const names = condNames(src);
    names.filter(p => p.ns === "secret").forEach(p => add(si, field, "secretInCond", { name:p.full }));
    reads(si, field, names.filter(p => p.ns !== "secret").map(p => "{{" + p.raw + "}}").join(" "), conn, extra);
  };

  /* every name saved anywhere, so "used too early" can say so */
  a.steps.forEach(s => (s.save || []).forEach(v => { if (!saved[v.name]) saved[v.name] = "later"; }));

  a.steps.forEach((s, si) => {
    const conn = s.conn ? conns.find(c => c.id === s.conn) || null : null;
    readsCond(si, "when", s.when, conn);
    if (s.kind === "http"){
      if (!s.conn) add(si, "conn", "noConn");
      else if (!conn) add(si, "conn", "connGone");
      else if (!baseParts(conn.base)) add(si, "conn", "badBase", { conn:conn.name });
      if (s.path && !/^[\/?]/.test(s.path) && !/^\{\{/.test(s.path)) add(si, "path", "pathSlash");
      reads(si, "path", s.path, conn);
      s.query.forEach(q => { reads(si, "query", q[0] + " " + q[1], conn); });
      s.headers.forEach(h => {
        if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(h[0])) add(si, "headers", "badHeader", { name:h[0] });
        else if (FORBIDDEN_HEADERS.indexOf(h[0].toLowerCase()) >= 0) add(si, "headers", "setByKalKech", { name:h[0] });
        reads(si, "headers", h[1], conn);
      });
      if ((s.method === "GET" || s.method === "HEAD") && s.bodyType !== "none") add(si, "body", "getBody");
      if (s.bodyType === "form") s.form.forEach(f => reads(si, "body", f[0] + " " + f[1], conn));
      else if (s.bodyType !== "none") reads(si, "body", s.body, conn);
      if (!expectOk(s.expect)) add(si, "expect", "badExpect");
    } else if (s.kind === "script"){
      const sc = scripts.find(x => x.id === s.script) || null;
      if (!s.script) add(si, "script", "noScript");
      else if (!sc) add(si, "script", "scriptGone");
      else if (!/\.(bat|cmd)$/i.test(sc.file || "")) add(si, "script", "scriptKind", { name:sc.file });
      if (s.conn && !conn) add(si, "conn", "connGone");
      s.args.forEach(p => reads(si, "args", p[1], conn));
      if (sc) arr(sc.params).forEach(pn => {
        if (!s.args.some(p => p[0].toLowerCase() === String(pn).toLowerCase())) add(si, "args", "argMissing", { name:pn, warn:true });
      });
      if (!/^(any|\d+(,\d+)*)$/i.test(s.expect)) add(si, "expect", "badExpect");
    } else if (s.kind === "confirm"){
      reads(si, "text", s.text, null);
    }
    /* what this step saves exists from here on: for its own "repeat
       until", and for every step after it */
    const mine = {};
    (s.save || []).forEach(v => {
      if (!nameOk(v.name)) add(si, "save", "saveName", { name:v.name });
      if (["json", "header", "regex"].indexOf(v.from) >= 0 && !v.path) add(si, "save", "savePath", { name:v.name });
      if (v.from === "regex" && v.path){ try { new RegExp(v.path); } catch(e){ add(si, "save", "badRegex", { name:v.name }); } }
      if (v.show === "ai" && /pass|secret|token|key|cookie|session|credential/i.test(v.name))
        add(si, "save", "aiSeesSecret", { name:v.name, warn:true });
      mine[v.name] = 1;
    });
    if (s.repeat && s.repeat.until) readsCond(si, "until", s.repeat.until, conn, Object.assign({ status:1 }, mine));
    if (s.okWhen) readsCond(si, "okWhen", s.okWhen, conn, Object.assign({ status:1 }, mine));
    if (s.reply === "ai") add(si, "reply", "aiSeesReply", { warn:true });
    Object.keys(mine).forEach(k => { known[k] = "saved"; });
    if (s.kind === "http" || s.kind === "script") known.status = "builtin";
  });
  reads(-1, "result", a.result, null);
  reads(-1, "resultFail", a.resultFail, null);
  return out;
}
/* "2xx", "200", "200,201,404", "2xx,404", "any" */
function expectOk(e){ return /^(any|([1-5]xx|\d{3})(\s*,\s*([1-5]xx|\d{3}))*)$/i.test(String(e || "").trim()); }

/* ═══ THE VALUES IT IS RUN WITH ══════════════════════════════════════════
   given: { key or label: value }, from the run form or from the assistant.
   Every value is checked against what the design says it must look like,
   and a missing one is reported rather than guessed. */
function inputsCheck(a, given){
  a = normAuto(a);
  given = obj(given);
  const lower = {};
  Object.keys(given).forEach(k => { lower[flat(k)] = given[k]; });
  const values = {}, errors = [];
  a.inputs.forEach(inp => {
    let v = given[inp.key];
    if (v == null) v = lower[flat(inp.key)];
    if (v == null && inp.label) v = lower[flat(inp.label)];
    v = (v == null ? "" : (typeof v === "object" ? JSON.stringify(v) : String(v))).trim();
    const err = (code, extra) => errors.push(Object.assign({ key:inp.key, label:inp.label || inp.key, code:code }, extra || {}));
    if (!v.trim()){
      values[inp.key] = "";
      if (inp.required) err(inp.kind === "secret" ? "typeIt" : "needed");
      return;
    }
    if (v.length > LIMIT.value) return err("long");
    if (/[\r\n\0]/.test(v) && inp.kind !== "text") return err("lines");
    if (inp.kind === "number" && !NUM_RE.test(v)) return err("number");
    if (inp.kind === "date"){
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
      const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
      if (!m || !d || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return err("date");
    }
    if (inp.kind === "choice"){
      const hit = inp.choices.find(c => c.toLowerCase() === v.trim().toLowerCase());
      if (!hit) return err("choice", { choices:inp.choices.join(", ") });
      v = hit;
    }
    if (inp.pattern){
      let re = null;
      try { re = new RegExp("^(?:" + inp.pattern + ")$"); } catch(e){}
      if (re && !re.test(v)) return err("pattern", { example:inp.example || inp.pattern });
    }
    values[inp.key] = v;
  });
  return { values:values, errors:errors };
}
/* a value bound for a script's command line: "" when it is safe, or the
   first character that is not */
function cmdSafe(v){
  const m = CMD_BAD.exec(String(v == null ? "" : v));
  return m ? (m[0] === "\r" || m[0] === "\n" ? "line break" : m[0] === "\0" ? "NUL" : m[0]) : "";
}

/* ═══ WHAT THE ASSISTANT IS TOLD ═════════════════════════════════════════
   The names of the jobs it may start, what each is for, the values each
   needs, the names of its steps and of the values it will be shown. No
   address, no connection, no header, no secret's name, no script: it does
   not need them to ask for a run, and they are not its business. */
function forAI(store){
  store = normStore(store);
  if (!store.aiCan) return [];
  /* no empty keys: what is not there is not sent */
  const compact = o => { Object.keys(o).forEach(k => { if (o[k] === undefined) delete o[k]; }); return o; };
  return store.list.filter(a => a.ai && a.steps.length).slice(0, 40).map(a => {
    const gives = [], givesOnFail = [];
    a.steps.forEach(s => (s.save || []).forEach(v => {
      if (v.show !== "ai") return;
      const list = v.on === "fail" ? givesOnFail : gives;
      if (list.indexOf(v.name) < 0) list.push(v.name);
    }));
    const replies = a.steps.filter(s => s.reply === "ai").map(s => s.name);
    return compact({
      name: a.name,
      about: a.about || undefined,
      system: a.system || undefined,
      inputs: a.inputs.map(i => compact({
        name: i.key, label: i.label || undefined, kind: i.kind === "secret" ? "typed by them" : i.kind,
        required: i.required, example: i.example || undefined,
        choices: i.choices.length ? i.choices : undefined })),
      asksFirst: a.ask,
      steps: a.steps.map(s => s.name),
      gives: gives,
      /* values it is given only when the job fails - the API's error */
      givesOnFail: givesOnFail.length ? givesOnFail : undefined,
      /* steps whose whole reply it is shown after a run */
      replies: replies.length ? replies : undefined
    });
  });
}

/* an automation by what somebody called it: id, name, a start of one */
function find(store, q){
  const list = arr(obj(store).list);
  const w = flat(q);
  if (!w) return null;
  return list.find(a => a.id === q) || list.find(a => flat(a.name) === w)
      || list.find(a => flat(a.name).indexOf(w) === 0) || list.find(a => w.length > 3 && flat(a.name).indexOf(w) >= 0)
      || null;
}
/* "run regenerate COI for P10234X56": which automation, and the values the
   sentence already holds - each input with a pattern takes the first word
   that fits it; a single required input with no pattern takes a word that
   looks like a reference (letters and digits). Only ever fills in a form
   you then look at; nothing is run from this. */
function fromText(store, text){
  const list = arr(obj(store).list);
  const t = String(text || "");
  const low = " " + t.toLowerCase().replace(/[^a-z0-9ក-៿]+/g, " ") + " ";
  let best = null, bestN = 0;
  list.forEach(a => {
    const words = String(a.name || "").toLowerCase().replace(/[^a-z0-9ក-៿]+/g, " ").split(" ").filter(x => x.length > 1);
    if (!words.length) return;
    const n = words.filter(x => low.indexOf(" " + x + " ") >= 0).length;
    if (n === words.length && n > bestN){ best = a; bestN = n; }
  });
  if (!best) return null;
  const nameWords = String(best.name).toLowerCase().split(/[^a-z0-9]+/);
  const tokens = t.split(/[\s,;]+/).map(x => x.replace(/^["'(\[]+|["')\].:!?]+$/g, "")).filter(Boolean)
    .filter(x => nameWords.indexOf(x.toLowerCase()) < 0);
  const used = {}, inputs = {};
  best.inputs.forEach(inp => {
    if (inp.kind === "secret") return;
    let re = null;
    if (inp.pattern){ try { re = new RegExp("^(?:" + inp.pattern + ")$"); } catch(e){} }
    let hit = null;
    if (re) hit = tokens.find(x => !used[x] && re.test(x));
    else if (inp.kind === "choice") hit = tokens.find(x => !used[x] && inp.choices.some(c => c.toLowerCase() === x.toLowerCase()));
    else if (inp.kind === "date") hit = tokens.find(x => !used[x] && /^\d{4}-\d{2}-\d{2}$/.test(x));
    else if (inp.kind === "number") hit = tokens.find(x => !used[x] && NUM_RE.test(x));
    else if (best.inputs.filter(x => x.required && !x.pattern && x.kind === "text").length === 1)
      hit = tokens.find(x => !used[x] && /[0-9]/.test(x) && /^[A-Za-z0-9][A-Za-z0-9_\-\/.]{2,}$/.test(x));
    if (hit){ used[hit] = 1; inputs[inp.key] = hit; }
  });
  return { auto:best, inputs:inputs };
}

/* ═══ READING A REPLY, FOR THE EDITOR ════════════════════════════════════
   The editor's "Try it" shows a step's reply; these turn a JSON reply into
   the paths you can save from - click one, and it becomes a "save" row. The
   tray program reads the same paths when the step really runs. */
function jsonPathParts(path){
  let p = String(path || "").trim().replace(/^\$\.?/, "");
  const out = [];
  let i = 0;
  while (i < p.length){
    if (p[i] === "."){ i++; continue; }
    if (p[i] === "["){
      const j = p.indexOf("]", i);
      if (j < 0) return null;
      let k = p.slice(i + 1, j).trim();
      if (/^["'].*["']$/.test(k)) k = k.slice(1, -1);
      out.push(k); i = j + 1; continue;
    }
    let j = i;
    while (j < p.length && p[j] !== "." && p[j] !== "[") j++;
    out.push(p.slice(i, j)); i = j;
  }
  return out;
}
function jsonGet(o, path){
  const parts = jsonPathParts(path);
  if (!parts) return undefined;
  let cur = o;
  for (const k of parts){
    if (cur == null || typeof cur !== "object") return undefined;
    if (Array.isArray(cur)){
      const n = Number(k);
      if (!/^\d+$/.test(k) || n >= cur.length) return undefined;
      cur = cur[n];
    } else {
      if (!Object.prototype.hasOwnProperty.call(cur, k)) return undefined;
      cur = cur[k];
    }
  }
  return cur;
}
/* a value as text: a string as it is, anything else as JSON */
function asText(v){
  if (v == null) return "";
  return typeof v === "string" ? v : typeof v === "object" ? JSON.stringify(v) : String(v);
}
function jsonPaths(text, max){
  let o;
  try { o = JSON.parse(String(text || "")); } catch(e){ return []; }
  const out = [];
  const lim = max || 60;
  const walk = (v, path) => {
    if (out.length >= lim) return;
    if (v && typeof v === "object"){
      if (Array.isArray(v)){
        if (v.length) walk(v[0], path + "[0]");
        return;
      }
      Object.keys(v).forEach(k => {
        const seg = /^[A-Za-z_$][\w$]*$/.test(k) ? (path ? path + "." : "") + k : path + '["' + k.replace(/"/g, "") + '"]';
        walk(v[k], seg);
      });
      return;
    }
    out.push({ path:path, sample:asText(v).slice(0, 80) });
  };
  walk(o, "");
  return out.filter(x => x.path);
}

/* ═══ RUNNING ONE ════════════════════════════════════════════════════════
   The steps, in order, with the page's helpers in env:

     env.call(op, body)   one request to the tray program: "step" (an API
                          call or a script), "check" (a condition for a
                          wait or a question) and "end" (forget this run's
                          hidden values). Resolves to its JSON answer.
     env.sleep(ms)        resolves true, or false when the run was stopped
     env.ask(text, step)  a "check with me" step: resolves true to go on
     env.tick(run)        something changed - redraw the card
     env.stopped()        true once you pressed Stop
     env.conns, env.scripts, env.values (inputs as input.x, the built-ins
     and the record), env.mask (names whose values must never be shown -
     secret inputs), env.by ("me" or "assistant"), env.record, env.upTo
     (stop after this step: the editor's "Try it"), env.test (ask for the
     reply's text as well, redacted).

   The run object it keeps up to date is what the card draws and what the
   history keeps; a hidden value appears in it by NAME only. */
function stepWire(s, ctx){
  const w = { kind:s.kind, name:s.name };
  if (s.kind === "http"){
    ["method", "path", "query", "headers", "bodyType", "body", "form", "expect"].forEach(k => { w[k] = s[k]; });
  } else if (s.kind === "script"){
    const sc = arr(ctx.scripts).find(x => x.id === s.script) || {};
    w.file = sc.file || "";
    /* in the order the script reads them (%1, %2, ...), then any others,
       which it gets only as KK_ variables */
    const params = arr(sc.params).map(String);
    const byName = {};
    s.args.forEach(p => { byName[p[0].toLowerCase()] = p; });
    w.args = params.map(pn => [pn, (byName[pn.toLowerCase()] || [pn, ""])[1]])
      .concat(s.args.filter(p => !params.some(pn => pn.toLowerCase() === p[0].toLowerCase())));
    w.timeout = s.timeout;
    w.expect = s.expect;
  }
  w.save = (s.save || []).map(v => ({ name:v.name, from:v.from, path:v.path, show:v.show, on:v.on }));
  w.okWhen = s.okWhen || "";
  w.reply = s.reply || "";
  return w;
}
function connWire(c){
  if (!c) return null;
  return { id:c.id, name:c.name, base:c.base, auth:c.auth, header:c.header, timeout:c.timeout,
           proxy:c.proxy, secrets:connSecrets(c) };
}

async function run(a, env){
  a = normAuto(a);
  env = env || {};
  const conns = arr(env.conns).map(normConn);
  const vals = Object.assign({}, obj(env.values));
  const mask = arr(env.mask).slice();
  const R = {
    id: idOk(env.runId) || newId("r"),
    auto: a.id, name: a.name, by: env.by === "assistant" ? "assistant" : "me", record: str(env.record, 40),
    started: new Date().toISOString(), state: "running",
    inputs: {}, values: {}, hidden: [],
    steps: a.steps.map(s => ({ name:s.name, kind:s.kind, state:"wait" })),
    result: "", error: ""
  };
  a.inputs.forEach(inp => {
    if (inp.kind === "secret") R.inputs[inp.key] = vals["input." + inp.key] ? "🔒" : "";
    else R.inputs[inp.key] = str(vals["input." + inp.key], 300);
  });
  const t0 = Date.now();
  const tick = () => { try { if (env.tick) env.tick(R); } catch(e){} };
  const stopped = () => { try { return !!(env.stopped && env.stopped()); } catch(e){ return false; } };
  const body = (extra) => Object.assign({ run:R.id, values:vals, mask:mask, hidden:R.hidden.slice() }, extra);
  const call = async (op, b) => {
    const r = await env.call(op, b);
    return (r && typeof r === "object") ? r : { ok:false, error:"noAnswer" };
  };
  tick();

  let failed = false;
  const last = env.upTo == null ? a.steps.length - 1 : Math.min(a.steps.length - 1, env.upTo);
  for (let i = 0; i <= last; i++){
    const s = a.steps[i], st = R.steps[i];
    if (stopped()){ R.state = "stopped"; break; }
    st.state = "run"; tick();
    const began = Date.now();
    try {
      if (s.kind === "wait" || s.kind === "confirm"){
        if (s.when){
          const c = await call("check", body({ when:s.when }));
          if (!c.ok){ st.state = "fail"; st.note = c.error || "check"; if (s.onFail !== "continue"){ failed = true; break; } continue; }
          if (!c.result){ st.state = "skip"; continue; }
        }
        if (s.kind === "wait"){
          st.state = "sleep"; st.until = Date.now() + s.seconds * 1000; tick();
          const ok = await env.sleep(s.seconds * 1000);
          if (!ok){ st.state = "stop"; R.state = "stopped"; break; }
          st.state = "ok";
        } else {
          st.state = "ask"; tick();
          const yes = await env.ask(show(s.text, vals, R.hidden), s);
          if (!yes){ st.state = "no"; R.state = "stopped"; break; }
          st.state = "ok";
        }
        continue;
      }

      const conn = s.conn ? conns.find(c => c.id === s.conn) || null : null;
      const wire = stepWire(s, env);
      const tries = s.repeat && s.repeat.until ? s.repeat.times : 1;
      let resp = null;
      for (let t = 1; t <= tries; t++){
        st.tries = tries > 1 ? t : undefined;
        resp = await call("step", body({ kind:s.kind, step:wire, conn:connWire(conn), when:s.when,
                                         until:(s.repeat && s.repeat.until) || "", test:!!env.test }));
        if (resp.skipped) break;
        /* what it saved: shown values join the run, hidden ones are only
           named - and a name saved hidden now is no longer a shown one */
        Object.keys(obj(resp.saved)).forEach(k => {
          if (!NAME_RE.test(k)) return;
          const v = str(resp.saved[k], LIMIT.value);
          const how = ((s.save || []).find(x => x.name === k) || {}).show || "me";
          vals[k] = v;
          R.values[k] = { v:v, show:how === "ai" ? "ai" : "me" };
          R.hidden = R.hidden.filter(x => x !== k);
        });
        arr(resp.hidden).forEach(k => {
          if (!NAME_RE.test(k)) return;
          if (R.hidden.indexOf(k) < 0) R.hidden.push(k);
          delete vals[k]; delete R.values[k];
        });
        st.status = resp.status != null && resp.status !== "" ? resp.status : undefined;
        /* {{status}}: the HTTP status, or a script's exit code, of the step
           that ran last - for the "only when" of the next one */
        if (resp.status != null && resp.status !== "") vals.status = String(resp.status);
        st.missing = arr(resp.missing).length ? arr(resp.missing).slice(0, 12) : undefined;
        /* the whole reply, when the step keeps it - on success and on
           failure alike, since the error reply is the one worth reading */
        if (s.reply && resp.reply != null){
          st.reply = str(resp.reply, 200000); st.replyShow = s.reply; st.replyCut = !!resp.replyCut;
          st.type = str(resp.contentType, 120);
        }
        if (env.test){ st.excerpt = str(resp.excerpt, 20000); st.type = str(resp.contentType, 120); st.url = str(resp.url, 600);
                       st.exit = resp.exit; st.headers = resp.headers; }
        if (!resp.ok || !s.repeat || !s.repeat.until || resp.until === true) break;
        if (t < tries){
          st.state = "again"; st.until = Date.now() + s.repeat.every * 1000; tick();
          const ok = await env.sleep(s.repeat.every * 1000);
          if (!ok){ st.state = "stop"; R.state = "stopped"; break; }
          st.state = "run"; tick();
        }
      }
      if (R.state === "stopped") break;
      if (resp.skipped){ st.state = "skip"; continue; }
      const gaveUp = resp.ok && s.repeat && s.repeat.until && resp.until !== true;
      if (!resp.ok || gaveUp){
        st.state = "fail";
        st.note = gaveUp ? "stillNot" : str(resp.error || "failed", 300);
        if (s.onFail === "continue") continue;
        failed = true; break;
      }
      st.state = "ok";
    } catch(e){
      st.state = "fail"; st.note = str((e && e.message) || e, 300);
      if (s.onFail !== "continue"){ failed = true; break; }
    } finally {
      st.ms = Date.now() - began;
      tick();
    }
  }
  if (R.state === "running")
    R.state = failed ? "failed" : R.steps.slice(0, last + 1).some(x => x.state === "fail") ? "partial" : "ok";
  /* the hidden values are forgotten now, not when the tray program next
     tidies up */
  try { await call("end", { run:R.id }); } catch(e){}
  R.ended = new Date().toISOString();
  R.ms = Date.now() - t0;
  const tpl = resultTemplate(a, R);
  R.result = tpl ? show(tpl, vals, R.hidden) : "";
  tick();
  return R;
}
/* which line it ends with: the success one, or - when it failed - the
   failure one (none when you stopped it) */
function resultTemplate(a, R){
  if (!R || R.state === "stopped" || R.state === "running") return "";
  return R.state === "failed" ? (a.resultFail || "") : (a.result || "");
}

/* The values a finished run shows, split by who may see them: "ai" ones
   go into the line the assistant reads; "me" ones only on your screen. The
   result line for the assistant has your-eyes-only values masked. */
function split(a, R){
  a = normAuto(a);
  const ai = {}, me = {};
  Object.keys(obj(R && R.values)).forEach(k => {
    const v = R.values[k];
    if (v.show === "ai") ai[k] = v.v; else me[k] = v.v;
  });
  const masks = {}, ins = {}, hidden = arr(R && R.hidden).slice();
  Object.keys(me).forEach(k => { masks[k] = "(shown to you only)"; });
  /* the values it was run with are part of the story - the assistant
     asked for them, or you typed them - except a secret one */
  Object.keys(obj(R && R.inputs)).forEach(k => {
    const v = R.inputs[k];
    if (v === "\uD83D\uDD12") hidden.push("input." + k); else ins["input." + k] = v;
  });
  const vals = Object.assign({}, ins, me, ai);
  const tpl = resultTemplate(a, R || {});
  /* the whole replies the assistant may read, each as it came (masked by
     the tray program), cut to a size a model reads without trouble */
  const replies = arr(R && R.steps).filter(st => st.replyShow === "ai" && st.reply)
    .map(st => ({ step:st.name, status:st.status, text:str(st.reply, 4000), cut:!!st.replyCut || String(st.reply).length > 4000 }));
  return { ai:ai, me:me, replies:replies,
           resultForAI: tpl ? show(tpl, vals, hidden, masks) : "",
           result: tpl ? show(tpl, vals, hidden) : "" };
}

const api = {
  LIMIT, KINDS, METHODS, BODIES, AUTHS, AUTH_SECRETS, SHOWS, SAVE_ON, REPLY_SHOWS, FROM, INPUT_KINDS, BUILTINS, RECORD_FIELDS,
  FILTERS, RESERVED, FORBIDDEN_HEADERS,
  newId, nameOk, normConn, normStep, normInput, normAuto, normRun, normStore, connSecrets, baseParts,
  parsePh, placeholders, show, builtins, filtered,
  lexCond, parseCond, evalCond, condNames, test,
  check, expectOk, inputsCheck, cmdSafe,
  forAI, find, fromText,
  jsonPathParts, jsonGet, jsonPaths, asText,
  stepWire, connWire, run, split, resultTemplate
};
if (typeof module !== "undefined" && module.exports) module.exports = api;
if (root) root.DossierAuto = api;
})(typeof window !== "undefined" ? window : null);
