/* ═══════════════════════════════════════════════════════════════════════════
   KALKECH AUTOMATIONS — jobs you design, run one step at a time

   An automation is a short chain of steps that does one support job:
   sign in to an API, call another one with the token it gave, run one of
   your scripts with a value from the reply, wait until a job says DONE.
   You design it once (the Automations page); after that you, or the
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
                value:4000, body:100000, name:80,
                /* (5.24) a Condition inside a Condition's branch, and no
                   deeper: two levels already make four lanes side by side.
                   (5.26) A "For each" counts as one of those levels too. */
                nest:2,
                /* (5.26) a list kept as a value (JSON), the items a "For
                   each" goes through, the text a closing message may grow
                   to once its lists are written out */
                list:100000, loop:200, out:20000 };

/* (5.24) "if" is a Condition: a test, and two lists of steps - the ones
   for Yes and the ones for No. Only one list runs; the run goes on with
   the step after the Condition either way. */
/* (5.26) and five that run on this page, with no tray program needed:
     set     Set a value - a name, and what it holds (text, a number, a
             list); or add to it: one more item on a list, a number up,
             more text
     stop    Stop the run here - as done, as failed or as stopped, with
             a message of its own
     each    For each item of a list: the steps inside run once per item,
             with {{item}} (and {{item.name}}...) the one it is on
     select  Shape a list: from each item, only the fields you name
             (renamed, or written as you like) - a new list
     filter  Filter a list: only the items a test is true for */
const KINDS = ["http", "script", "wait", "confirm", "if", "set", "stop", "each", "select", "filter"];
/* the kinds that hold steps of their own, and the names of their lists */
const HOLDS = { if:["yes", "no"], each:["do"] };
/* how "Set a value" sets it */
const SET_HOW = ["set", "append", "add", "text"];
/* how "Stop the run" ends it */
const STOP_AS = ["ok", "fail", "stop"];
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
                  "true", "false", "empty", "not", "and", "or", "contains", "is", "starts", "ends", "with",
                  /* (5.26) what a list's steps and a closing message read */
                  "loop", "this", "null"];
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
function nameOk(v){
  /* (5.26) a name starting with two underscores is the page's own, for a
     value it works out and hands to the tray program for one step */
  return NAME_RE.test(String(v || "")) && RESERVED.indexOf(String(v).toLowerCase()) < 0 && !/^__/.test(String(v));
}
function flat(s){ return String(s || "").toLowerCase().replace(/[^a-z0-9ក-៿]+/g, ""); }

/* name/value rows - query, headers, form fields, script values - kept as
   [name, value] pairs so the order you wrote them in is the order they go */
function pairs(v){
  return arr(v).map(p => Array.isArray(p) ? [str(p[0], 200).trim(), str(p[1], LIMIT.value)]
                       : (p && typeof p === "object") ? [str(p.k != null ? p.k : p.name, 200).trim(), str(p.v != null ? p.v : p.value, LIMIT.value)]
                       : null)
    .filter(p => p && p[0]).slice(0, LIMIT.pairs);
}

/* the fields of "Shape a list": [name, what it holds]. One row with no
   name makes a list of plain values (just the names, say) */
function selFields(v){
  const rows = arr(v).map(p => Array.isArray(p) ? [str(p[0], 60).trim(), str(p[1], LIMIT.value)]
                         : (p && typeof p === "object") ? [str(p.k != null ? p.k : p.name, 60).trim(), str(p.v != null ? p.v : p.value, LIMIT.value)]
                         : null)
    .filter(p => p && (p[0] || p[1].trim())).slice(0, LIMIT.pairs);
  return rows.length > 1 ? rows.filter(p => p[0]) : rows;
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

/* "name, date, links.self" -> "name, date, links.self" (names only) */
function fieldList(v){
  const a = (Array.isArray(v) ? v : String(v == null ? "" : v).split(/[,;\s]+/))
    .map(x => String(x).trim()).filter(x => /^[A-Za-z_$@][\w$@-]*(?:\.[A-Za-z_$@][\w$@-]*)*$/.test(x));
  return uniq(a).slice(0, 30).join(", ");
}
function normSave(kind){
  const from = FROM[kind] || FROM.http;
  return function(x){
    x = obj(x);
    const name = str(x.name, 40).trim();
    if (!name) return null;
    const f = from.indexOf(x.from) >= 0 ? x.from : from[0];
    const out = { name: name, from: f,
                  path: str(x.path, 300).trim(), show: SHOWS.indexOf(x.show) >= 0 ? x.show : "me",
                  on: SAVE_ON.indexOf(x.on) >= 0 ? x.on : "ok" };
    /* (5.26) a list or an object read from JSON can be shaped before it is
       shown: only these fields kept, these left out ("downloadToken"). The
       tray program keeps the whole of it, hidden, for the steps after -
       {{docs[0].downloadToken}} still works there - and shows the rest. */
    if (f === "json"){
      const keep = fieldList(x.keep), drop = fieldList(x.drop);
      if (keep) out.keep = keep;
      if (drop) out.drop = drop;
    }
    /* (5.28) "Show it as it is": the tray program hides a shown value
       that LOOKS like a secret - a field named token, a JWT. That is a
       guess, and the owner knows their API better: a short-lived download
       token is theirs to show. With allow, only the real secrets of the run
       (the connection's, the values typed as secret, the values saved
       hidden) are still masked in it. Only for a value that is shown. */
    if (x.allow === true && out.show !== "hidden") out.allow = true;
    return out;
  };
}

/* one step. depth: how many Conditions it sits inside (0 at the top);
   budget: { left } - steps still allowed in the whole design, counted in
   the order they appear. Both are optional (a step normalised on its own). */
function normStep(s, i, depth, budget){
  s = obj(s);
  depth = typeof depth === "number" && depth >= 0 ? depth : 0;
  budget = budget && typeof budget.left === "number" ? budget : null;
  const kind = KINDS.indexOf(s.kind) >= 0 ? s.kind : "http";
  /* a Condition (or a For each) deeper than the designer draws is not kept */
  if (HOLDS[kind] && depth >= LIMIT.nest) return null;
  if (budget){ if (budget.left <= 0) return null; budget.left--; }
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
  } else if (kind === "if"){
    /* the test, written like any other condition; it has no "only when"
       of its own - it IS one */
    out.when = "";
    out.cond = str(s.cond, 300).trim();
    out.yes = normList(s.yes, depth + 1, budget);
    out.no = normList(s.no, depth + 1, budget);
  } else if (kind === "set"){
    /* var, not name: name is the step's own title on its card */
    out.var = str(s.var, 40).trim();
    out.how = SET_HOW.indexOf(s.how) >= 0 ? s.how : "set";
    out.value = str(s.value, LIMIT.body);
    out.show = s.show === "ai" ? "ai" : "me";
  } else if (kind === "stop"){
    out.as = STOP_AS.indexOf(s.as) >= 0 ? s.as : "fail";
    out.text = str(s.text, LIMIT.body);
  } else if (kind === "each"){
    out.from = str(s.from, 300).trim();
    out.as = str(s.as, 40).trim() || "item";
    out.max = clamp(int(s.max, 50), 1, LIMIT.loop);
    out.do = normList(s.do, depth + 1, budget);
  } else if (kind === "select" || kind === "filter"){
    out.from = str(s.from, 300).trim();
    out.var = str(s.var, 40).trim();
    out.show = s.show === "ai" ? "ai" : "me";
    if (kind === "select") out.fields = selFields(s.fields);
    else out.cond = str(s.cond, 600).trim();
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
    /* (5.28) ...and, when they say so, without the guessing: only the real
       secrets of the run masked, a field named token left as it is */
    if (s.replyRaw === true && out.reply) out.replyRaw = true;
    const r = obj(s.repeat);
    out.repeat = { until: str(r.until, 300).trim(),
                   times: clamp(int(r.times, 10), 1, LIMIT.times),
                   every: clamp(int(r.every, 5), 1, LIMIT.every) };
  }
  if (!out.name) out.name = kind === "if" ? "Condition" : kind === "each" ? "For each" : "Step " + ((i || 0) + 1);
  return out;
}
/* a list of steps: a design's own, or one branch of a Condition */
function normList(list, depth, budget){
  const out = [];
  arr(list).forEach(x => {
    if (budget && budget.left <= 0) return;
    const st = normStep(x, out.length, depth, budget);
    if (st) out.push(st);
  });
  return out;
}

/* ── steps inside Conditions (5.24) ──────────────────────────────────────
   Every step, in the order a run meets it - a Condition, then its Yes
   steps, then its No steps; a For each, then the steps inside it (5.26) -
   with where it sits:
   [{ s, depth, parent (the Condition's id, or ""), branch ("yes" | "no" | "do" | ""),
      list (the array it is in), index (its place there) }] */
function flatSteps(steps, depth, parent, branch, out){
  out = out || [];
  depth = depth || 0;
  arr(steps).forEach((s, index, list) => {
    if (!s || typeof s !== "object") return;
    out.push({ s:s, depth:depth, parent:parent || "", branch:branch || "", list:list, index:index });
    (HOLDS[s.kind] || []).forEach(b => flatSteps(s[b], depth + 1, s.id, b, out));
  });
  return out;
}
/* one step of a design by its id, with where it sits (or null) */
function findStep(a, id){
  if (!id) return null;
  return flatSteps(obj(a).steps).find(x => x.s.id === id) || null;
}
/* the same steps with new ids (a copy of a step, of a design) */
function freshIds(steps){
  return arr(steps).map(s => {
    const c = JSON.parse(JSON.stringify(s || {}));
    c.id = "s" + rnd(6);
    (HOLDS[c.kind] || []).forEach(b => { c[b] = freshIds(c[b]); });
    return c;
  });
}
/* no two steps of one design share an id (a pasted copy, a hand-edited
   file): the second one gets a new one */
function dedupeIds(steps){
  const seen = {};
  flatSteps(steps).forEach(x => {
    while (seen[x.s.id]) x.s.id = "s" + rnd(6);
    seen[x.s.id] = 1;
  });
  return steps;
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
    steps: dedupeIds(normList(a.steps, 0, { left:LIMIT.steps })),
    /* the line shown when it finishes: "COI {{coiNumber}} is ready" */
    result: str(a.result, 8000),
    /* ...and when it fails: "Not regenerated: {{errorMessage}}". (5.26)
       Both are Markdown - a heading, a list, a table, a code block - and
       can write out a list: {{#each docs}}- {{name}}{{/each}} */
    resultFail: str(a.resultFail, 8000),
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
  /* (5.26) a value can be a list now: kept whole for a run you are looking
     at, cut shorter in the history (replyMax 2000 is the history's) */
  const vmax = rmax >= 20000 ? LIMIT.list : 4000;
  const vals = {};
  Object.keys(obj(r.values)).slice(0, 40).forEach(k => {
    const v = obj(r.values[k]);
    if (NAME_RE.test(k) && (v.show === "me" || v.show === "ai")) vals[k] = { v:str(v.v, vmax), show:v.show };
  });
  const ins = {};
  Object.keys(obj(r.inputs)).slice(0, LIMIT.inputs).forEach(k => { ins[str(k, 40)] = str(r.inputs[k], 300); });
  return { id: idOk(r.id) || newId("r"), auto: idOk(r.auto), name: str(r.name, LIMIT.name),
           by: r.by === "assistant" ? "assistant" : "me", record: str(r.record, 40),
           started: str(r.started, 40), ended: str(r.ended, 40), ms: Math.max(0, int(r.ms, 0)),
           state: ["ok", "failed", "partial", "stopped", "running"].indexOf(r.state) >= 0 ? (r.state === "running" ? "stopped" : r.state) : "failed",
           inputs: ins, values: vals, hidden: arr(r.hidden).map(x => str(x, 40)).filter(x => NAME_RE.test(x)).slice(0, 40),
           steps: arr(r.steps).slice(0, LIMIT.steps + 10).map(s => {
             s = obj(s);
             return { name: str(s.name, LIMIT.name), kind: KINDS.indexOf(s.kind) >= 0 ? s.kind : "http",
                      /* (5.24) which step of the design, and where it sat: the
                         run is drawn again from these, as it went */
                      sid: idOk(s.sid) || undefined, depth: clamp(int(s.depth, 0), 0, LIMIT.nest) || undefined,
                      branch: s.branch === "yes" || s.branch === "no" || s.branch === "do" ? s.branch : undefined,
                      parent: idOk(s.parent) || undefined,
                      took: s.took === "yes" || s.took === "no" ? s.took : undefined,
                      off: s.off ? true : undefined,
                      /* (5.26) a For each: items done, of how many; a step
                         inside one: how many times it ran, and failed */
                      n: s.n != null ? Math.max(0, int(s.n, 0)) : undefined,
                      of: s.of != null ? Math.max(0, int(s.of, 0)) : undefined,
                      times: int(s.times, 0) > 1 ? int(s.times, 0) : undefined,
                      fails: int(s.fails, 0) || undefined,
                      state: str(s.state, 12), status: int(s.status, 0) || undefined, ms: Math.max(0, int(s.ms, 0)),
                      tries: int(s.tries, 0) || undefined, note: str(s.note, 300) || undefined,
                      redacted: arr(s.redacted).filter(x => NAME_RE.test(String(x))).slice(0, 12).length
                        ? arr(s.redacted).filter(x => NAME_RE.test(String(x))).slice(0, 12) : undefined,
                      reply: s.reply && rmax ? str(s.reply, rmax) : undefined,
                      replyShow: s.reply && rmax && (s.replyShow === "ai" || s.replyShow === "me") ? s.replyShow : undefined,
                      replyCut: s.reply && rmax && (s.replyCut || String(s.reply).length > rmax) ? true : undefined };
           }),
           result: str(r.result, rmax >= 20000 ? LIMIT.out : 4000), error: str(r.error, 300),
           /* (5.26) which values hold more than is shown - the tray program
              kept the fields left out ("shaped") */
           shaped: arr(r.shaped).map(x => str(x, 40)).filter(x => NAME_RE.test(x)).slice(0, 40) };
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

/* ── what is inside {{ }} (5.26) ─────────────────────────────────────────
   A name, as before - {{token}}, {{input.policy}}, {{secret.password}} -
   and now also a way into a value that is a list or an object, and a
   function:

     {{docs[0].name}}          the first item's name
     {{result.items}}          a part of what a step kept
     {{count(docs)}}           a function; the list of them is FN below
     {{join(field(docs, "name"), ", ")}}
     {{item.downloadToken}}    in a For each: the item it is on

   Filters still come after a bar: {{docs[0].name|upper}}. Nothing here
   runs code: it is a small reader of its own, like the conditions. */
const NS = ["input", "secret", "record"];
function exLex(src){
  const s = String(src == null ? "" : src), t = [];
  let i = 0;
  while (i < s.length){
    const c = s[i];
    if (/\s/.test(c)){ i++; continue; }
    if (c === '"' || c === "'"){
      let j = i + 1, v = "";
      while (j < s.length && s[j] !== c){
        if (s[j] === "\\" && j + 1 < s.length){ const n = s[j + 1]; v += n === "n" ? "\n" : n === "t" ? "\t" : n; j += 2; }
        else v += s[j++];
      }
      if (j >= s.length) return { error:"quote" };
      t.push({ k:"str", v:v }); i = j + 1; continue;
    }
    const prev = t[t.length - 1];
    const afterValue = prev && (prev.k !== "p" || prev.v === ")" || prev.v === "]");
    const num = /^-?\d+(?:\.\d+)?/.exec(s.slice(i));
    if (num && (c !== "-" || !afterValue)){ t.push({ k:"num", v:num[0] }); i += num[0].length; continue; }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
    if (id){ t.push({ k:"id", v:id[0] }); i += id[0].length; continue; }
    if ("()[],.|".indexOf(c) >= 0){ t.push({ k:"p", v:c }); i++; continue; }
    return { error:"char", char:c };
  }
  return { tokens:t };
}
function exParse(src){
  const lx = exLex(src);
  if (lx.error) return { error:lx.error };
  const t = lx.tokens;
  if (!t.length) return { error:"empty" };
  let i = 0;
  const at = v => t[i] && t[i].k === "p" && t[i].v === v;
  const fail = code => { throw { error:code }; };
  function tail(node){
    for (;;){
      if (at(".")){
        i++;
        const k = t[i];
        if (!k || (k.k !== "id" && k.k !== "num")) fail("path");
        node.parts.push(String(k.v)); i++; continue;
      }
      if (at("[")){
        i++;
        const k = t[i];
        if (!k || (k.k !== "num" && k.k !== "str")) fail("path");
        node.parts.push(String(k.v)); i++;
        if (!at("]")) fail("path");
        i++; continue;
      }
      return node;
    }
  }
  function primary(){
    const k = t[i];
    if (!k) fail("end");
    if (k.k === "str"){ i++; return { t:"lit", v:k.v }; }
    if (k.k === "num"){ i++; return { t:"lit", v:Number(k.v) }; }
    if (k.k !== "id") fail("operand");
    const w = k.v; i++;
    if (at("(")){
      i++;
      const args = [];
      if (!at(")")){
        for (;;){ args.push(primary()); if (at(",")){ i++; continue; } break; }
      }
      if (!at(")")) fail("paren");
      i++;
      return tail({ t:"call", fn:w.toLowerCase(), name:w, args:args, parts:[] });
    }
    const lw = w.toLowerCase();
    if (lw === "true" || lw === "false") return { t:"lit", v:lw === "true" };
    if (lw === "null") return { t:"lit", v:null };
    if (NS.indexOf(w) >= 0 && at(".") && t[i + 1] && t[i + 1].k === "id"){
      i++;
      const n = t[i].v; i++;
      return tail({ t:"ref", ns:w, name:n, full:w + "." + n, parts:[] });
    }
    return tail({ t:"ref", ns:"", name:w, full:w, parts:[] });
  }
  try {
    const ast = primary();
    const filters = [];
    while (at("|")){
      i++;
      const f = t[i];
      if (!f || f.k !== "id") fail("filter");
      filters.push(f.v.toLowerCase()); i++;
    }
    if (i < t.length) fail("extra");
    return { ast:ast, filters:filters };
  } catch(e){
    if (e && e.error) return e;
    throw e;
  }
}
/* "[0].name" from ["0", "name"] - the way a path is written back */
function partsPath(parts){
  return arr(parts).map(k => /^\d+$/.test(k) ? "[" + k + "]" : /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? "." + k : '["' + String(k).replace(/"/g, "") + '"]').join("");
}
/* one placeholder, read: { ast, raw, filters, refs (every name it reads),
   fns, ns/name/full/parts (when it is a name, with or without a path),
   simple (a plain name), bad: "name" | "fn" | "args" | "filter" | "" } */
function parsePh(inner){
  const raw = String(inner == null ? "" : inner);
  const x = exParse(raw);
  if (x.error) return { bad:"name", raw:raw, filters:[], refs:[], fns:[], badFns:[], argBad:[], badFilters:[], parts:[], ns:"", name:"", full:"" };
  const refs = [], fns = [], badFns = [], argBad = [];
  const walk = n => {
    if (n.t === "ref") refs.push({ ns:n.ns, name:n.name, full:n.full, parts:n.parts.slice() });
    else if (n.t === "call"){
      fns.push(n.fn);
      const f = FN[n.fn];
      if (!f) badFns.push(n.name);
      else if (n.args.length < f.min || n.args.length > f.max) argBad.push(f.name || n.fn);
      n.args.forEach(walk);
    }
  };
  walk(x.ast);
  const a = x.ast;
  const root = a.t === "ref" ? refs[0] : null;
  const bf = x.filters.filter(f => FILTERS.indexOf(f) < 0);
  const out = { ast:a, raw:raw, filters:x.filters, refs:refs, fns:fns, badFns:badFns, argBad:argBad, badFilters:bf,
                ns:root ? root.ns : "", name:root ? root.name : "", full:root ? root.full : "", parts:root ? root.parts : [],
                simple:!!root && !root.parts.length,
                bad:badFns.length ? "fn" : argBad.length ? "args" : bf.length ? "filter" : "" };
  /* a secret is one value, not a thing with parts */
  if (refs.some(r => r.ns === "secret" && r.parts.length)) out.bad = "name";
  return out;
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

/* ── values that are lists ──────────────────────────────────────────────
   A value travels as text; one that is JSON - a list, an object - is
   read as what it is when a path or a function needs it. */
const DATA_CACHE = new Map();
function dataOf(v){
  if (typeof v !== "string") return v;
  const t = v.trim();
  if (!/^[\[{]/.test(t)) return v;
  if (DATA_CACHE.has(v)) return DATA_CACHE.get(v);
  let o = v;
  try { o = JSON.parse(t); } catch(e){ o = v; }
  if (DATA_CACHE.size > 80) DATA_CACHE.clear();
  DATA_CACHE.set(v, o);
  return o;
}
/* a value as text: a list or an object as its JSON */
function txt(v){
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return isFinite(v) ? String(Math.round(v * 1e10) / 1e10) : "";
  if (typeof v === "boolean") return v ? "true" : "false";
  try { return JSON.stringify(v); } catch(e){ return ""; }
}
function dig(v, parts){
  let cur = dataOf(v);
  for (const k of arr(parts)){
    cur = dataOf(cur);
    if (cur == null || typeof cur !== "object") return { found:false };
    if (Array.isArray(cur)){
      if (!/^\d+$/.test(k) || +k >= cur.length) return { found:false };
      cur = cur[+k];
    } else {
      if (!Object.prototype.hasOwnProperty.call(cur, k)) return { found:false };
      cur = cur[k];
    }
  }
  return { found:true, v:cur };
}
function asList(v){
  v = dataOf(v);
  if (Array.isArray(v)) return v;
  if (v == null || v === "") return [];
  return [v];
}
function isEmpty(v){
  v = dataOf(v);
  if (v == null || v === "") return true;
  if (typeof v === "string") return !v.trim();
  if (Array.isArray(v)) return !v.length;
  if (typeof v === "object") return !Object.keys(v).length;
  return false;
}
/* a field of an item: "name", "links.self", "" for the item itself */
function fieldOf(x, f){
  f = txt(f);
  if (!f) return x;
  const d = dig(x, jsonPathParts(f) || [f]);
  return d.found ? d.v : undefined;
}
function numOf(v){ const n = Number(txt(dataOf(v)).trim()); return isFinite(n) ? n : 0; }
/* what a list item is, in one cell of a table or one line of a list */
function cellOf(v){
  v = dataOf(v);
  if (v && typeof v === "object" && !Array.isArray(v))
    v = Object.keys(v).slice(0, 6).map(k => k + ": " + txt(v[k])).join(" · ");
  return txt(v).replace(/\r?\n/g, " ").replace(/\|/g, "/").trim().slice(0, 400);
}
function mdTable(list, fields){
  const rows = asList(list).slice(0, 500);
  if (!rows.length) return "";
  const first = dataOf(rows[0]);
  const objs = !!first && typeof first === "object" && !Array.isArray(first);
  let f = fields.map(txt).filter(Boolean);
  if (!f.length) f = objs ? Object.keys(first).slice(0, 8) : ["value"];
  /* a table needs two columns to be one: a single field gets a number */
  const num = f.length < 2;
  const head = "| " + (num ? "# | " : "") + f.join(" | ") + " |";
  const rule = "| " + (num ? "--- | " : "") + f.map(() => "---").join(" | ") + " |";
  const body = rows.map((r, i) => {
    const d = dataOf(r);
    const isObj = !!d && typeof d === "object" && !Array.isArray(d);
    return "| " + (num ? (i + 1) + " | " : "") + f.map(k => (isObj ? cellOf(fieldOf(d, k)) : cellOf(d)) || " ").join(" | ") + " |";
  });
  return [head, rule].concat(body).join("\n");
}
function toDate(x){
  if (x instanceof Date) return new Date(x.getTime());
  const t = txt(x).trim();
  if (!t) return new Date();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(t);
  return isNaN(d.getTime()) ? null : d;
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(x, fmt){
  const d = toDate(x);
  if (!d) return txt(x);
  const p2 = n => String(n).padStart(2, "0");
  return String(fmt || "yyyy-MM-dd").replace(/yyyy|MMM|MM|dd|HH|mm|ss/g, k => ({
    yyyy:d.getFullYear(), MMM:MONTHS[d.getMonth()], MM:p2(d.getMonth() + 1), dd:p2(d.getDate()),
    HH:p2(d.getHours()), mm:p2(d.getMinutes()), ss:p2(d.getSeconds()) })[k]);
}

/* ── the functions (5.26) ────────────────────────────────────────────────
   g: the group the designer lists it under; sig: how it is written. Each
   takes its values already worked out, and gives one back - text, a
   number, a list. The table/bullets/code ones write Markdown, for a
   closing message. */
const FN = {
  /* text */
  upper:   { g:"text", sig:"upper(text)", min:1, max:1, f:a => txt(a[0]).toUpperCase() },
  lower:   { g:"text", sig:"lower(text)", min:1, max:1, f:a => txt(a[0]).toLowerCase() },
  trim:    { g:"text", sig:"trim(text)", min:1, max:1, f:a => txt(a[0]).trim() },
  replace: { g:"text", sig:'replace(text, "find", "with")', min:3, max:3, f:a => { const f = txt(a[1]); return f ? txt(a[0]).split(f).join(txt(a[2])) : txt(a[0]); } },
  left:    { g:"text", sig:"left(text, n)", min:2, max:2, f:a => txt(a[0]).slice(0, Math.max(0, numOf(a[1]))) },
  right:   { g:"text", sig:"right(text, n)", min:2, max:2, f:a => { const t = txt(a[0]), n = Math.max(0, numOf(a[1])); return n ? t.slice(-n) : ""; } },
  concat:  { g:"text", sig:"concat(a, b, …)", min:1, max:20, f:a => a.map(txt).join("") },
  split:   { g:"text", sig:'split(text, ",")', min:1, max:2, f:a => txt(a[0]).split(a.length > 1 && txt(a[1]) ? txt(a[1]) : ",").map(x => x.trim()).filter(Boolean) },
  length:  { g:"text", sig:"length(text or list)", min:1, max:1, f:a => { const v = dataOf(a[0]); return Array.isArray(v) ? v.length : txt(v).length; } },
  default: { g:"text", sig:'default(value, "if empty")', min:2, max:2, f:a => isEmpty(a[0]) ? a[1] : a[0] },
  date:    { g:"text", sig:'date(value, "yyyy-MM-dd")', min:0, max:2, f:a => fmtDate(a.length ? a[0] : "", a.length > 1 ? txt(a[1]) : "yyyy-MM-dd") },
  adddays: { g:"text", name:"addDays", sig:"addDays(date, n)", min:2, max:2,
             f:a => { const d = toDate(a[0]); if (!d) return ""; d.setDate(d.getDate() + numOf(a[1])); return fmtDate(d, "yyyy-MM-dd"); } },
  base64:  { g:"text", sig:"base64(text)", min:1, max:1, f:a => utf8b64(txt(a[0])) },
  json:    { g:"text", sig:"json(value)", min:1, max:1, f:a => { const v = dataOf(a[0]); return typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v == null ? null : v, null, 2); } },
  /* lists */
  count:   { g:"list", sig:"count(list)", min:1, max:1, f:a => asList(a[0]).length },
  first:   { g:"list", sig:"first(list)", min:1, max:1, f:a => asList(a[0])[0] },
  last:    { g:"list", sig:"last(list)", min:1, max:1, f:a => { const l = asList(a[0]); return l[l.length - 1]; } },
  join:    { g:"list", sig:'join(list, ", ")', min:1, max:2, f:a => asList(a[0]).map(cellOf).join(a.length > 1 ? txt(a[1]) : ", ") },
  field:   { g:"list", sig:'field(list, "name")', min:2, max:2, f:a => asList(a[0]).map(x => fieldOf(x, a[1])) },
  where:   { g:"list", sig:'where(list, "field", "value")', min:3, max:3,
             f:a => asList(a[0]).filter(x => txt(fieldOf(x, a[1])).trim().toLowerCase() === txt(a[2]).trim().toLowerCase()) },
  sort:    { g:"list", sig:'sort(list, "field", "desc")', min:1, max:3, f:a => {
               const f = a.length > 1 ? a[1] : "", down = a.length > 2 && /^desc/i.test(txt(a[2]));
               const key = x => fieldOf(x, f);
               const l = asList(a[0]).slice();
               l.sort((x, y) => {
                 const p = txt(key(x)), q = txt(key(y));
                 const n = /^-?\d+(\.\d+)?$/.test(p.trim()) && /^-?\d+(\.\d+)?$/.test(q.trim());
                 const r = n ? Number(p) - Number(q) : p.localeCompare(q, undefined, { sensitivity:"base", numeric:true });
                 return down ? -r : r;
               });
               return l; } },
  unique:  { g:"list", sig:"unique(list)", min:1, max:1, f:a => { const seen = {}; return asList(a[0]).filter(x => { const k = txt(x); if (seen[k]) return false; seen[k] = 1; return true; }); } },
  take:    { g:"list", sig:"take(list, n)", min:2, max:2, f:a => asList(a[0]).slice(0, Math.max(0, numOf(a[1]))) },
  keys:    { g:"list", sig:"keys(object)", min:1, max:1, f:a => {
               const v = dataOf(a[0]);
               const o = Array.isArray(v) ? dataOf(v[0]) : v;
               return o && typeof o === "object" && !Array.isArray(o) ? Object.keys(o) : []; } },
  /* numbers */
  sum:     { g:"num", sig:'sum(list, "field")', min:1, max:2, f:a => asList(a[0]).reduce((n, x) => n + numOf(a.length > 1 ? fieldOf(x, a[1]) : x), 0) },
  number:  { g:"num", sig:"number(text)", min:1, max:1, f:a => numOf(a[0]) },
  add:     { g:"num", sig:"add(a, b)", min:2, max:2, f:a => numOf(a[0]) + numOf(a[1]) },
  sub:     { g:"num", sig:"sub(a, b)", min:2, max:2, f:a => numOf(a[0]) - numOf(a[1]) },
  mul:     { g:"num", sig:"mul(a, b)", min:2, max:2, f:a => numOf(a[0]) * numOf(a[1]) },
  div:     { g:"num", sig:"div(a, b)", min:2, max:2, f:a => numOf(a[1]) ? numOf(a[0]) / numOf(a[1]) : "" },
  round:   { g:"num", sig:"round(number, places)", min:1, max:2, f:a => { const p = Math.max(0, Math.min(10, a.length > 1 ? numOf(a[1]) : 0)); return Number(numOf(a[0]).toFixed(p)); } },
  /* tests */
  if:      { g:"logic", sig:'if(test, "yes", "no")', min:2, max:3, f:a => { const v = dataOf(a[0]); const yes = Array.isArray(v) ? v.length > 0 : truthy(txt(v)); return yes ? a[1] : (a.length > 2 ? a[2] : ""); } },
  equals:  { g:"logic", sig:"equals(a, b)", min:2, max:2, f:a => txt(a[0]).trim().toLowerCase() === txt(a[1]).trim().toLowerCase() },
  contains:{ g:"logic", sig:"contains(list or text, value)", min:2, max:2, f:a => {
               const v = dataOf(a[0]), w = txt(a[1]).trim().toLowerCase();
               return Array.isArray(v) ? v.some(x => txt(x).trim().toLowerCase() === w) : txt(v).toLowerCase().indexOf(w) >= 0; } },
  empty:   { g:"logic", sig:"empty(value)", min:1, max:1, f:a => isEmpty(a[0]) },
  not:     { g:"logic", sig:"not(test)", min:1, max:1, f:a => { const v = dataOf(a[0]); return Array.isArray(v) ? !v.length : !truthy(txt(v)); } },
  /* written out, for a closing message (Markdown) */
  table:   { g:"md", sig:'table(list, "field", …)', min:1, max:12, f:a => mdTable(a[0], a.slice(1)) },
  bullets: { g:"md", sig:'bullets(list, "field")', min:1, max:2, f:a => asList(a[0]).slice(0, 500).map(x => "- " + cellOf(a.length > 1 ? fieldOf(x, a[1]) : x)).join("\n") },
  numbered:{ g:"md", sig:'numbered(list, "field")', min:1, max:2, f:a => asList(a[0]).slice(0, 500).map((x, i) => (i + 1) + ". " + cellOf(a.length > 1 ? fieldOf(x, a[1]) : x)).join("\n") },
  code:    { g:"md", sig:'code(value, "json")', min:1, max:2, f:a => {
               const v = dataOf(a[0]);
               const body = typeof v === "string" ? v : JSON.stringify(v == null ? null : v, null, 2);
               const lang = a.length > 1 ? txt(a[1]).replace(/[^A-Za-z0-9_+-]/g, "") : (typeof v === "string" ? "" : "json");
               /* a fence inside the value would end the block early */
               return "```" + lang + "\n" + String(body).replace(/```/g, "``​`") + "\n```"; } }
};
/* the list the designer shows: name as written, how, which group */
function fnList(){
  return Object.keys(FN).map(k => ({ key:k, name:FN[k].name || k, sig:FN[k].sig, g:FN[k].g }));
}

/* ── working one out ────────────────────────────────────────────────────
   scope: { values (name -> text), hidden (names kept by the tray program),
   masks (name -> what to show instead), locals: [{ vars, fields, src }] -
   the item of a For each (and loop), innermost first; src is where the
   item sits in a value the tray program has ("docs[2]"), so a field the
   page was not shown can still be asked for there }. */
function refGet(n, scope){
  scope = scope || {};
  if (n.ns === "secret") return { hidden:n.full };
  let base, found = false, src = null;
  if (!n.ns){
    for (const l of arr(scope.locals)){
      if (l.vars && Object.prototype.hasOwnProperty.call(l.vars, n.name)){
        base = l.vars[n.name]; found = true;
        src = l.src && l.src.as === n.name ? l.src.path : null;
        break;
      }
      if (l.fields && Object.prototype.hasOwnProperty.call(l.fields, n.name)){
        base = l.fields[n.name]; found = true;
        src = l.src && l.src.path ? l.src.path + partsPath([n.name]) : null;
        break;
      }
    }
  }
  if (!found){
    const masks = obj(scope.masks);
    if (masks[n.full] != null) return { masked:masks[n.full] };
    if (arr(scope.hidden).indexOf(n.full) >= 0) return { hidden:n.full };
    const vals = obj(scope.values);
    if (!Object.prototype.hasOwnProperty.call(vals, n.full) || vals[n.full] == null) return { missing:n.full };
    base = vals[n.full]; found = true;
  }
  if (!n.parts.length) return { found:true, v:base };
  const d = dig(base, n.parts);
  if (d.found) return { found:true, v:d.v };
  return { missing:n.full, bridge:src ? src + partsPath(n.parts) : null };
}
function exEval(n, scope, ctx, top){
  if (n.t === "lit") return n.v;
  if (n.t === "ref"){
    const r = refGet(n, scope);
    if (r.found) return r.v;
    if (r.masked != null){ if (ctx.masked == null) ctx.masked = r.masked; return undefined; }
    if (r.hidden){ ctx.hidden = ctx.hidden || r.hidden; return undefined; }
    if (top){ ctx.missing = r.missing; ctx.bridge = r.bridge || null; }
    return undefined;
  }
  const f = FN[n.fn];
  if (!f) throw new Error("“" + n.name + "” is not a function KalKech knows");
  if (n.args.length < f.min || n.args.length > f.max)
    throw new Error((f.name || n.fn) + " takes " + (f.min === f.max ? f.min : f.min + "-" + f.max) + " value(s): " + f.sig);
  const args = n.args.map(x => exEval(x, scope, ctx, false));
  if (ctx.masked != null || ctx.hidden) return undefined;
  let v = f.f(args);
  if (n.parts.length){ const d = dig(v, n.parts); v = d.found ? d.v : undefined; }
  return v;
}
/* one placeholder against a scope: { ok, v (as it is), text (filtered) }
   or { hidden: name } / { masked: text } / { missing: name, bridge } /
   { error } / { bad } */
function evalPh(p, scope){
  if (!p || p.bad === "name" || !p.ast) return { bad:(p && p.bad) || "name" };
  const ctx = { hidden:"", masked:null, missing:"", bridge:null };
  let v;
  try { v = exEval(p.ast, scope || {}, ctx, true); }
  catch(e){ return { error:String((e && e.message) || e) }; }
  if (ctx.masked != null) return { masked:ctx.masked };
  if (ctx.hidden) return { hidden:ctx.hidden };
  if (ctx.missing) return { missing:ctx.missing, bridge:ctx.bridge };
  return { ok:true, v:v, text:filtered(txt(v), p.filters) };
}

/* ── templates (5.26) ───────────────────────────────────────────────────
   What this page writes itself - the closing messages, a Stop's message,
   a value you set, a question to you - can also hold blocks:

     {{#each docs}}- {{name}} ({{date}}){{/each}}
     {{#each docs as doc}}…{{doc.name}}…{{/each}}
     {{#if count(docs) > 0}}Found {{count(docs)}}.{{else}}None.{{/if}}

   Inside an each, the item's own fields are names too ({{name}}), and so
   are {{this}} (the item) and {{loop.n}} (1, 2, 3 …), {{loop.count}}. */
const TAG_RE = /\{\{([^{}]*)\}\}/g;
const IF_OPS = [" is not empty", " is empty", " not contains ", " contains ", " starts with ", " ends with ",
                "==", "!=", ">=", "<=", ">", "<"];
function ifParse(src){
  let s = String(src == null ? "" : src).trim(), neg = false;
  if (/^not\s+/i.test(s)){ neg = true; s = s.replace(/^not\s+/i, ""); }
  let depth = 0, q = "";
  for (let i = 0; i < s.length; i++){
    const c = s[i];
    if (q){ if (c === "\\") i++; else if (c === q) q = ""; continue; }
    if (c === '"' || c === "'"){ q = c; continue; }
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    if (depth) continue;
    for (const op of IF_OPS){
      if (s.substr(i, op.length).toLowerCase() !== op) continue;
      const o = op.trim().toLowerCase();
      const unary = o === "is empty" || o === "is not empty";
      return { neg:neg, a:parsePh(s.slice(0, i)), op:o, b:unary ? null : parsePh(s.slice(i + op.length)) };
    }
  }
  return { neg:neg, a:parsePh(s), op:"", b:null };
}
function tplParse(text){
  const src = String(text == null ? "" : text);
  const root = { kids:[] }, stack = [root];
  let cur = root.kids, last = 0, m, error = "";
  const re = new RegExp(TAG_RE.source, "g");
  while ((m = re.exec(src))){
    const inner = m[1].trim();
    /* a block tag alone on its line takes the line with it, so a template
       written one tag per line does not leave empty lines behind */
    let upto = m.index, next = m.index + m[0].length;
    if (/^(?:#each\b|#if\b|else$|\/each$|\/if$)/i.test(inner)){
      const ls = src.lastIndexOf("\n", m.index - 1) + 1;
      const nl = src.indexOf("\n", next);
      const le = nl < 0 ? src.length : nl;
      if (/^[ \t]*$/.test(src.slice(ls, m.index)) && /^[ \t\r]*$/.test(src.slice(next, le))){
        upto = Math.max(last, ls);
        next = nl < 0 ? src.length : nl + 1;
      }
    }
    if (upto > last) cur.push({ t:"text", v:src.slice(last, upto) });
    last = next;
    re.lastIndex = next;
    if (/^#each\b/i.test(inner)){
      const mm = /^#each\s+(.+?)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?\s*$/i.exec(inner);
      const node = { t:"each", raw:m[0], p:parsePh(mm ? mm[1] : ""), as:mm && mm[2] ? mm[2] : "", body:[], alt:[] };
      cur.push(node); stack.push(node); cur = node.body; continue;
    }
    if (/^#if\b/i.test(inner)){
      const node = { t:"if", raw:m[0], c:ifParse(inner.replace(/^#if\s*/i, "")), body:[], alt:[] };
      cur.push(node); stack.push(node); cur = node.body; continue;
    }
    if (/^else$/i.test(inner)){
      const top = stack[stack.length - 1];
      if (top === root || top.inAlt){ error = error || "else"; cur.push({ t:"text", v:m[0] }); continue; }
      top.inAlt = true; cur = top.alt; continue;
    }
    const close = /^\/(each|if)$/i.exec(inner);
    if (close){
      const top = stack[stack.length - 1];
      if (top === root || top.t !== close[1].toLowerCase()){ error = error || "close"; cur.push({ t:"text", v:m[0] }); continue; }
      stack.pop();
      const up = stack[stack.length - 1];
      cur = up === root ? root.kids : (up.inAlt ? up.alt : up.body);
      continue;
    }
    if (/^[#\/]/.test(inner)){ error = error || "block"; cur.push({ t:"text", v:m[0] }); continue; }
    cur.push({ t:"ph", raw:m[0], p:parsePh(m[1]) });
  }
  if (last < src.length) cur.push({ t:"text", v:src.slice(last) });
  if (stack.length > 1) error = error || "open";
  return { nodes:root.kids, error:error };
}
function ifTrue(c, scope){
  if (!c || !c.a || c.a.bad === "name") return false;
  const a = evalPh(c.a, scope);
  const av = a.ok ? dataOf(a.v) : undefined;
  let res;
  if (!c.op) res = Array.isArray(av) ? av.length > 0 : av && typeof av === "object" ? Object.keys(av).length > 0 : truthy(txt(av));
  else if (c.op === "is empty" || c.op === "is not empty"){ res = isEmpty(av); if (c.op === "is not empty") res = !res; }
  else {
    const b = c.b ? evalPh(c.b, scope) : { ok:true, v:"" };
    const bv = b.ok ? b.v : "";
    if ((c.op === "contains" || c.op === "not contains") && Array.isArray(av)){
      const w = txt(bv).trim().toLowerCase();
      res = av.some(x => txt(x).trim().toLowerCase() === w);
      if (c.op === "not contains") res = !res;
    } else if (c.op === "not contains") res = !cmpOp("contains", txt(av), txt(bv));
    else res = cmpOp(c.op === "starts with" ? "starts" : c.op === "ends with" ? "ends" : c.op, txt(av), txt(bv));
  }
  return c.neg ? !res : res;
}
/* scope.keep: a placeholder with no value stays as it was written (true,
   the default - a preview shows what is missing) or goes (false);
   scope.onHidden(name): told when a hidden value was asked for */
function tplRender(nodes, scope){
  let out = "";
  for (const n of arr(nodes)){
    if (out.length > LIMIT.out) break;
    if (n.t === "text"){ out += n.v; continue; }
    if (n.t === "ph"){
      const r = evalPh(n.p, scope);
      if (r.masked != null) out += r.masked;
      else if (r.hidden){ if (scope.onHidden) scope.onHidden(r.hidden); out += "🔒" + r.hidden; }
      else if (r.ok) out += r.text;
      else out += scope.keep === false ? "" : n.raw;
      continue;
    }
    if (n.t === "each"){
      const r = evalPh(n.p, scope);
      if (r.masked != null){ out += r.masked; continue; }
      if (r.hidden){ if (scope.onHidden) scope.onHidden(r.hidden); out += "🔒" + r.hidden; continue; }
      const list = r.ok ? asList(r.v) : [];
      if (!list.length){ out += tplRender(n.alt, scope); continue; }
      list.slice(0, 500).forEach((it, i) => {
        if (out.length > LIMIT.out) return;
        const vars = { this:it, loop:{ n:i + 1, index:i, count:list.length, first:i === 0, last:i === list.length - 1 } };
        if (n.as) vars[n.as] = it;
        const d = dataOf(it);
        const loc = { vars:vars, fields:d && typeof d === "object" && !Array.isArray(d) ? d : null };
        out += tplRender(n.body, Object.assign({}, scope, { locals:[loc].concat(arr(scope.locals)) }));
      });
      continue;
    }
    if (n.t === "if") out += tplRender(ifTrue(n.c, scope) ? n.body : n.alt, scope);
  }
  return out.length > LIMIT.out ? out.slice(0, LIMIT.out) + "\n…" : out;
}
function render(text, scope){ return tplRender(tplParse(text).nodes, scope || {}); }
/* A text with its placeholders filled in for SHOWING - a confirm step's
   question, the message at the end, a preview. Never for sending: secrets
   and hidden values are not here to fill in, and show as 🔒name. masks:
   name -> what to show instead (a value shown to you only, in a message
   the assistant will read, is "(shown to you only)"). */
function show(text, values, hidden, masks){
  return render(text, { values:obj(values), hidden:arr(hidden), masks:obj(masks) });
}
/* a value a step works out on this page - "Set a value", a field of
   "Shape a list": one {{...}} alone keeps what it is (a list stays a
   list); anything else is text with the values written in */
function valueOf(text, scope){
  const t = String(text == null ? "" : text);
  const one = /^\s*\{\{([^{}]*)\}\}\s*$/.exec(t);
  if (one && !/^\s*(?:[#\/]|else\s*$)/.test(one[1])){
    const p = parsePh(one[1]);
    const r = evalPh(p, scope);
    if (r.hidden) return { hidden:r.hidden };
    if (r.error) return { error:r.error };
    if (r.bad) return { error:"{{" + p.raw + "}} cannot be read" };
    if (!r.ok) return { ok:true, v:"" };
    return { ok:true, v:p.filters.length ? r.text : r.v };
  }
  let hidden = "";
  const out = render(t, Object.assign({}, scope, { keep:false, onHidden:n => { hidden = hidden || n; } }));
  return hidden ? { hidden:hidden } : { ok:true, v:out };
}

/* ── what goes to the tray program (5.26) ───────────────────────────────
   The tray program reads plain names, and paths into them; a function, or
   the item of a For each, is worked out here first and handed over as a
   value of its own for this one step ({{__kk1}}) - still filled in by the
   tray program, once, escaped for where it lands. A field this page was
   not shown (one the tray program kept back, "downloadToken") is asked
   for where the item sits: {{item.downloadToken}} -> {{docs[2].downloadToken}}. */
function wireText(text, scope, temps){
  if (text == null || text === "") return text;
  return String(text).replace(PH_RE, (m, inner) => {
    const p = parsePh(inner);
    if (p.bad || !p.ast) return m;
    const keepRaw = p.filters.indexOf("raw") >= 0;
    const fl = p.filters.length ? "|" + p.filters.join("|") : "";
    const isRef = p.ast.t === "ref";
    const local = isRef && !p.ns && arr(scope && scope.locals).some(l =>
      (l.vars && Object.prototype.hasOwnProperty.call(l.vars, p.name)) || (l.fields && Object.prototype.hasOwnProperty.call(l.fields, p.name)));
    /* a plain name the tray program has (or a secret): as it is */
    if (isRef && !local && (p.ns === "secret" || !p.parts.length)) return m;
    const r = evalPh(p, scope);
    if (r.ok){
      const k = "__kk" + (Object.keys(temps).length + 1);
      temps[k] = r.text;
      return "{{" + k + (keepRaw ? "|raw" : "") + "}}";
    }
    if (r.missing && r.bridge) return "{{" + r.bridge + fl + "}}";
    return m;
  });
}
/* a step as it goes to the tray program, every text in it through wireText */
function wireStep(w, scope, temps){
  const W = t => wireText(t, scope, temps);
  const P = rows => arr(rows).map(p => [W(p[0]), W(p[1])]);
  const out = Object.assign({}, w);
  ["path", "body", "okWhen"].forEach(k => { if (typeof out[k] === "string") out[k] = W(out[k]); });
  ["query", "headers", "form", "args"].forEach(k => { if (out[k]) out[k] = P(out[k]); });
  return out;
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
      out.push({ t:"ph", p:parsePh(s.slice(i + 2, j)), at:i, end:j + 2 });
      i = j + 2; continue;
    }
    if (c === '"' || c === "'"){
      let j = i + 1, v = "";
      while (j < s.length && s[j] !== c){
        if (s[j] === "\\" && j + 1 < s.length){ v += s[j + 1]; j += 2; }
        else v += s[j++];
      }
      if (j >= s.length) return { error:"quote", at:i };
      out.push({ t:"lit", v:v, q:true, at:i, end:j + 1 }); i = j + 1; continue;
    }
    const num = /^-?\d+(?:\.\d+)?/.exec(s.slice(i));
    if (num && (c !== "-" || !out.length || out[out.length - 1].t === "op")){
      out.push({ t:"lit", v:num[0], at:i, end:i + num[0].length }); i += num[0].length; continue;
    }
    const op = /^(==|!=|>=|<=|&&|\|\||=|>|<|!|\(|\))/.exec(s.slice(i));
    if (op){
      const v = op[0] === "=" ? "==" : op[0] === "&&" ? "and" : op[0] === "||" ? "or" : op[0] === "!" ? "not" : op[0];
      out.push({ t:"op", v:v, at:i, end:i + op[0].length }); i += op[0].length; continue;
    }
    const w = /^[A-Za-z]+/.exec(s.slice(i));
    if (w){
      const lw = w[0].toLowerCase();
      if (["and", "or", "not", "contains", "is", "empty", "starts", "ends", "with"].indexOf(lw) >= 0) out.push({ t:"op", v:lw, at:i, end:i + w[0].length });
      else if (lw === "true" || lw === "false") out.push({ t:"lit", v:lw, at:i, end:i + w[0].length });
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

/* ── the Condition builder's rows (5.24) ────────────────────────────────
   A condition that is a plain list of tests joined by one word - and, or -
   is shown as rows: [value] [is equal to] [value]. Anything else (brackets,
   "and" and "or" mixed, a "not" in front) stays text: condRows gives null.
   condText writes rows back as the text the runner reads. */
const COND_OPS = ["==", "!=", ">", ">=", "<", "<=", "contains", "not contains", "starts with", "ends with",
                  "is empty", "is not empty", "is true", "is false"];
function condRows(src){
  src = String(src == null ? "" : src);
  if (!src.trim()) return { join:"and", rows:[] };
  const lx = lexCond(src);
  if (lx.error) return null;
  const t = lx.tokens;
  const isOp = (k, v) => k && k.t === "op" && k.v === v;
  const operand = k => k && (k.t === "ph" || k.t === "lit");
  const text = k => k.t === "ph" ? src.slice(k.at, k.end) : k.v;
  /* split on the joining words; one kind only */
  const parts = [[]];
  let join = "";
  for (const k of t){
    if (isOp(k, "(") || isOp(k, ")")) return null;
    if (isOp(k, "and") || isOp(k, "or")){
      if (join && join !== k.v) return null;
      join = k.v; parts.push([]); continue;
    }
    parts[parts.length - 1].push(k);
  }
  const rows = [];
  for (const p of parts){
    let row = null;
    if (p.length === 1 && operand(p[0])) row = { a:text(p[0]), op:"is true", b:"" };
    else if (p.length === 2 && isOp(p[0], "not") && operand(p[1])) row = { a:text(p[1]), op:"is false", b:"" };
    else if (p.length === 3 && operand(p[0]) && operand(p[2]) && p[1].t === "op" &&
             ["==", "!=", ">", ">=", "<", "<=", "contains"].indexOf(p[1].v) >= 0) row = { a:text(p[0]), op:p[1].v, b:text(p[2]) };
    else if (p.length === 3 && operand(p[0]) && isOp(p[1], "is") && isOp(p[2], "empty")) row = { a:text(p[0]), op:"is empty", b:"" };
    else if (p.length === 4 && operand(p[0]) && isOp(p[1], "is") && isOp(p[2], "not") && isOp(p[3], "empty"))
      row = { a:text(p[0]), op:"is not empty", b:"" };
    else if (p.length === 4 && operand(p[0]) && operand(p[3]) && isOp(p[1], "not") && isOp(p[2], "contains"))
      row = { a:text(p[0]), op:"not contains", b:text(p[3]) };
    else if (p.length === 4 && operand(p[0]) && operand(p[3]) && (isOp(p[1], "starts") || isOp(p[1], "ends")) && isOp(p[2], "with"))
      row = { a:text(p[0]), op:p[1].v + " with", b:text(p[3]) };
    if (!row) return null;
    rows.push(row);
  }
  return { join:join || "and", rows:rows };
}
/* one side of a test, as the runner reads it: a {{value}} or a number as it
   is, anything else in quotes */
function condOperand(v){
  v = String(v == null ? "" : v).trim();
  if (/^\{\{[^{}]*\}\}$/.test(v) || /^-?\d+(?:\.\d+)?$/.test(v) || /^(true|false)$/i.test(v)) return v;
  return '"' + v.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}
function condText(rows, join){
  const j = join === "or" ? " or " : " and ";
  return arr(rows).filter(r => r && String(r.a == null ? "" : r.a).trim()).map(r => {
    const a = condOperand(r.a), op = COND_OPS.indexOf(r.op) >= 0 ? r.op : "==";
    if (op === "is true") return a;
    if (op === "is false") return "not " + a;
    if (op === "is empty" || op === "is not empty") return a + " " + op;
    return a + " " + op + " " + condOperand(r.b);
  }).join(j);
}

const NUM_RE = /^\s*-?\d+(?:\.\d+)?\s*$/;
function truthy(v){
  if (v == null) return false;
  const s = String(v).trim();
  return s !== "" && !/^(false|0|null|undefined|no)$/i.test(s);
}
/* two values compared: == and != ignore capitals and the spaces around;
   two numbers are compared as numbers */
function cmpOp(cmp, a, b){
  const as = a == null ? "" : String(a).trim(), bs = b == null ? "" : String(b).trim();
  const nums = NUM_RE.test(as) && NUM_RE.test(bs);
  const al = as.toLowerCase(), bl = bs.toLowerCase();
  switch (cmp){
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
      case "cmp": return cmpOp(n.cmp, val(n.a), val(n.b));
    }
    return false;
  }
  return evalNode(ast);
}
/* one condition against plain values - for the tests, and for a stand-in */
function test(src, values){
  const p = parseCond(src);
  if (p.error) return { error:p.error };
  const scope = { values:obj(values) };
  return { result: evalCond(p.ast, ph => {
    const r = evalPh(ph, scope);
    return r.ok ? r.text : undefined;
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
  /* step: the step's place in run order (flatSteps), -1 for the design
     itself; id: the step's id (5.24 - the designer finds it by this) */
  const F = flatSteps(a.steps);
  const place = {};
  F.forEach((x, i) => { place[x.s.id] = i; });
  const add = (step, field, code, extra) => out.push(Object.assign({ step:step, field:field, code:code },
    step >= 0 && F[step] ? { id:F[step].s.id } : {}, extra || {}));

  if (!a.steps.length) add(-1, "steps", "noSteps");
  const keys = {};
  a.inputs.forEach((inp, i) => {
    if (!nameOk(inp.key)) add(-1, "input" + i, "inputKey", { name:inp.key });
    else if (keys[inp.key.toLowerCase()]) add(-1, "input" + i, "inputTwice", { name:inp.key });
    keys[inp.key.toLowerCase()] = 1;
    if (inp.kind === "choice" && !inp.choices.length) add(-1, "input" + i, "noChoices", { name:inp.key });
    if (inp.pattern){ try { new RegExp(inp.pattern); } catch(e){ add(-1, "input" + i, "badPattern", { name:inp.key }); } }
  });

  /* what exists so far: inputs, the built-ins, the record. A value saved
     in one branch of a Condition only is "maybe" after it - it is empty
     when the other branch ran. */
  const known = {};
  a.inputs.forEach(inp => { known["input." + inp.key] = "input"; });
  BUILTINS.forEach(k => { known[k] = "builtin"; });
  RECORD_FIELDS.forEach(k => { known["record." + k] = "builtin"; });
  /* where each name is first saved, so "used too early" can say so; and
     the names saved HIDDEN somewhere - never on this page */
  const first = {}, hid = {};
  F.forEach((x, i) => {
    (x.s.save || []).forEach(v => { if (first[v.name] == null) first[v.name] = i; if (v.show === "hidden") hid[v.name] = 1; });
    if (x.s.var && first[x.s.var] == null) first[x.s.var] = i;
  });

  /* One {{...}}: every name it reads must exist by then. mode says where
     the text goes: "wire" (to the tray program: an API call, a script, a
     condition), "show" (written on this page for you to read: a hidden
     value shows as 🔒) or "page" (worked out on this page: a hidden value,
     which never comes here, cannot be used). locals: the names a For each
     or an {{#each}} brings ($any: an {{#each}}'s item fields, unknowable). */
  const onePh = (si, field, p, conn, kn, extra, quiet, mode, locals) => {
    if (p.bad === "name") return add(si, field, "badPh", { name:p.raw });
    if (p.bad === "fn") add(si, field, "badFn", { name:p.badFns.join(", ") });
    if (p.bad === "args") add(si, field, "fnArgs", { name:p.argBad.join(", ") });
    if (p.bad === "filter") add(si, field, "badFilter", { name:p.raw, filters:p.badFilters.join(", ") });
    const isCall = !!p.ast && p.ast.t === "call";
    p.refs.forEach(r => {
      if (r.ns === "secret"){
        /* a secret is put in by the tray program, as it is, in what it
           sends: never in a function, never on this page */
        if (mode !== "wire" || isCall) return add(si, field, mode === "wire" ? "secretHere" : "secretNoConn", { name:r.full });
        if (!conn) add(si, field, "secretNoConn", { name:r.full });
        else if (connSecrets(conn).indexOf(r.name) < 0) add(si, field, "secretUnknown", { name:r.full, conn:conn.name });
        return;
      }
      if (!r.ns && locals && (locals[r.name] || locals.$any)) return;
      if (extra && extra[r.full]) return;
      if (kn[r.full]){
        if (hid[r.full] && mode === "page") add(si, field, "hiddenHere", { name:r.full });
        else if (hid[r.full] && mode === "wire" && isCall) add(si, field, "hiddenInFn", { name:r.full });
        if (kn[r.full] === "maybe" && !quiet && !isCall) add(si, field, "maybeEmpty", { name:r.full, warn:true });
        return;
      }
      const f = first[r.full];
      add(si, field, f == null ? "unknownPh" : (si < 0 || f > si) ? "usedTooEarly" : "otherBranch", { name:r.full });
    });
  };
  /* a text: its placeholders, and - where this page writes it - its blocks */
  const reads = (si, field, text, conn, kn, extra, quiet, mode, locals) => {
    mode = mode || "wire";
    const tp = tplParse(text);
    if (tp.error) add(si, field, "badBlock", { why:tp.error });
    const visit = (nodes, loc) => nodes.forEach(n => {
      if (n.t === "text") return;
      if (n.t !== "ph" && mode !== "show" && mode !== "page") add(si, field, "blockHere");
      if (n.t === "ph") return onePh(si, field, n.p, conn, kn, extra, quiet, mode, loc);
      if (n.t === "each"){
        onePh(si, field, n.p, conn, kn, extra, true, mode, loc);
        const inner = Object.assign({}, loc, { this:1, loop:1, $any:1 });
        if (n.as) inner[n.as] = 1;
        visit(n.body, inner); visit(n.alt, loc);
        return;
      }
      if (n.t === "if"){
        if (n.c.a) onePh(si, field, n.c.a, conn, kn, extra, true, mode, loc);
        if (n.c.b) onePh(si, field, n.c.b, conn, kn, extra, true, mode, loc);
        visit(n.body, loc); visit(n.alt, loc);
      }
    });
    visit(tp.nodes, locals || {});
  };
  const readsCond = (si, field, src, conn, kn, extra, mode, locals) => {
    if (!src) return;
    const pc = parseCond(src);
    if (pc.error) return add(si, field, "badCond", { why:pc.error });
    /* a test that could read a secret could be used to guess it, a
       character at a time; the tray program refuses one, and so does this */
    const names = condNames(src);
    names.forEach(p => {
      if (p.refs.some(r => r.ns === "secret")) add(si, field, "secretInCond", { name:p.full || p.raw });
      else onePh(si, field, p, conn, kn, extra, true, mode || "wire", locals);
    });
  };
  /* "{{docs}}" - a list a step goes through: one {{...}} and nothing else */
  const oneTag = v => /^\s*\{\{[^{}]+\}\}\s*$/.test(String(v || ""));
  const readsList = (si, field, src, kn, locals) => {
    if (!src) return add(si, field, "noFrom");
    if (!oneTag(src)) return add(si, field, "fromOne");
    reads(si, field, src, null, kn, null, true, "page", locals);
  };
  const varName = (si, field, name, locals) => {
    if (!nameOk(name)) add(si, field, "varName", { name:name });
    else if (locals && locals[name]) add(si, field, "varLocal", { name:name });
  };

  const walk = (list, kn, locals) => list.forEach(s => {
    const si = place[s.id];
    const conn = s.conn ? conns.find(c => c.id === s.conn) || null : null;
    if (s.kind === "if"){
      if (!s.cond) add(si, "cond", "noCond");
      else readsCond(si, "cond", s.cond, null, kn, null, "wire", locals);
      if (!s.yes.length && !s.no.length) add(si, "cond", "emptyIf", { warn:true });
      const ky = Object.assign({}, kn), kno = Object.assign({}, kn);
      walk(s.yes, ky, locals); walk(s.no, kno, locals);
      Object.keys(ky).concat(Object.keys(kno)).forEach(k => {
        if (kn[k] && kn[k] !== "maybe") return;
        kn[k] = ky[k] && kno[k] && ky[k] !== "maybe" && kno[k] !== "maybe" ? "saved" : "maybe";
      });
      if (ky.status || kno.status) kn.status = "builtin";
      return;
    }
    readsCond(si, "when", s.when, conn, kn, null, "wire", locals);
    if (s.kind === "each"){
      readsList(si, "from", s.from, kn, locals);
      if (!nameOk(s.as)) add(si, "as", "eachAs", { name:s.as });
      else if (kn[s.as] || (locals && locals[s.as])) add(si, "as", "eachAsTaken", { name:s.as });
      if (!s.do.length) add(si, "from", "emptyEach", { warn:true });
      const kd = Object.assign({}, kn);
      walk(s.do, kd, Object.assign({}, locals, { [s.as]:1, loop:1 }));
      /* what the steps inside keep is there after it (empty when the list
         was): no "maybe" warning for that - it is the usual case */
      Object.keys(kd).forEach(k => { if (!kn[k]) kn[k] = kd[k]; });
      return;
    }
    if (s.kind === "set"){
      varName(si, "var", s.var, locals);
      reads(si, "value", s.value, null, kn, null, false, "page", locals);
      if (nameOk(s.var)){ kn[s.var] = "saved"; delete hid[s.var]; }
      return;
    }
    if (s.kind === "select" || s.kind === "filter"){
      readsList(si, "from", s.from, kn, locals);
      varName(si, "var", s.var, locals);
      const inner = Object.assign({}, locals, { item:1, loop:1 });
      if (s.kind === "select"){
        if (!s.fields.length) add(si, "fields", "noFields");
        s.fields.forEach(f => reads(si, "fields", f[1], null, kn, null, true, "page", inner));
      } else {
        if (!s.cond) add(si, "cond", "noCond");
        else readsCond(si, "cond", s.cond, null, kn, null, "page", inner);
      }
      if (nameOk(s.var)){ kn[s.var] = "saved"; delete hid[s.var]; }
      return;
    }
    if (s.kind === "stop"){
      reads(si, "text", s.text, null, kn, null, true, "show", locals);
      return;
    }
    if (s.kind === "http"){
      if (!s.conn) add(si, "conn", "noConn");
      else if (!conn) add(si, "conn", "connGone");
      else if (!baseParts(conn.base)) add(si, "conn", "badBase", { conn:conn.name });
      if (s.path && !/^[\/?]/.test(s.path) && !/^\{\{/.test(s.path)) add(si, "path", "pathSlash");
      reads(si, "path", s.path, conn, kn, null, false, "wire", locals);
      s.query.forEach(q => { reads(si, "query", q[0] + " " + q[1], conn, kn, null, false, "wire", locals); });
      s.headers.forEach(h => {
        if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(h[0])) add(si, "headers", "badHeader", { name:h[0] });
        else if (FORBIDDEN_HEADERS.indexOf(h[0].toLowerCase()) >= 0) add(si, "headers", "setByKalKech", { name:h[0] });
        reads(si, "headers", h[1], conn, kn, null, false, "wire", locals);
      });
      if ((s.method === "GET" || s.method === "HEAD") && s.bodyType !== "none") add(si, "body", "getBody");
      if (s.bodyType === "form") s.form.forEach(f => reads(si, "body", f[0] + " " + f[1], conn, kn, null, false, "wire", locals));
      else if (s.bodyType !== "none") reads(si, "body", s.body, conn, kn, null, false, "wire", locals);
      if (!expectOk(s.expect)) add(si, "expect", "badExpect");
    } else if (s.kind === "script"){
      const sc = scripts.find(x => x.id === s.script) || null;
      if (!s.script) add(si, "script", "noScript");
      else if (!sc) add(si, "script", "scriptGone");
      else if (!/\.(bat|cmd)$/i.test(sc.file || "")) add(si, "script", "scriptKind", { name:sc.file });
      if (s.conn && !conn) add(si, "conn", "connGone");
      s.args.forEach(p => reads(si, "args", p[1], conn, kn, null, false, "wire", locals));
      if (sc) arr(sc.params).forEach(pn => {
        if (!s.args.some(p => p[0].toLowerCase() === String(pn).toLowerCase())) add(si, "args", "argMissing", { name:pn, warn:true });
      });
      if (!/^(any|\d+(,\d+)*)$/i.test(s.expect)) add(si, "expect", "badExpect");
    } else if (s.kind === "confirm"){
      reads(si, "text", s.text, null, kn, null, false, "show", locals);
    }
    /* what this step saves exists from here on: for its own "repeat
       until", and for every step after it */
    const mine = {};
    (s.save || []).forEach(v => {
      if (!nameOk(v.name)) add(si, "save", "saveName", { name:v.name });
      else if (locals && locals[v.name]) add(si, "save", "varLocal", { name:v.name });
      if (["json", "header", "regex"].indexOf(v.from) >= 0 && !v.path) add(si, "save", "savePath", { name:v.name });
      if (v.from === "regex" && v.path){ try { new RegExp(v.path); } catch(e){ add(si, "save", "badRegex", { name:v.name }); } }
      if (v.show === "ai" && !v.allow && /pass|secret|token|key|cookie|session|credential/i.test(v.name))
        add(si, "save", "aiSeesSecret", { name:v.name, warn:true });
      mine[v.name] = 1;
    });
    if (s.repeat && s.repeat.until) readsCond(si, "until", s.repeat.until, conn, kn, Object.assign({ status:1 }, mine), "wire", locals);
    if (s.okWhen) readsCond(si, "okWhen", s.okWhen, conn, kn, Object.assign({ status:1 }, mine), "wire", locals);
    if (s.reply === "ai") add(si, "reply", "aiSeesReply", { warn:true });
    Object.keys(mine).forEach(k => { kn[k] = "saved"; });
    if (s.kind === "http" || s.kind === "script") kn.status = "builtin";
  });
  walk(a.steps, known, {});
  /* the closing lines: a value may well be empty there - no warning */
  reads(-1, "result", a.result, null, known, null, true, "show", {});
  reads(-1, "resultFail", a.resultFail, null, known, null, true, "show", {});
  return out;
}

/* The values a step can read, for the designer's "insert a value" list
   (5.24): what is known before it - the inputs, what earlier steps saved
   (from one branch of a Condition only: maybe), the record, the built-ins
   - and what it saves itself (its own "repeat until" and "success also
   needs" may read those, and {{status}}). id "" or "finish": the end.
   (5.26) Also the values set by "Set a value", "Shape a list" and
   "Filter a list", and - inside a For each - its item and {{loop}}:
   locals [{ name, from, kind:"item" | "loop" }]. */
function valuesAt(a, id){
  a = normAuto(a);
  const kn = {};
  let hit = null;
  const walk = (list, k, loc) => {
    for (const s of list){
      if (hit) return;
      if (s.id === id){ hit = { before:Object.assign({}, k), step:s, locals:loc.slice() }; return; }
      if (s.kind === "if"){
        const ky = Object.assign({}, k), kno = Object.assign({}, k);
        walk(s.yes, ky, loc); if (hit) return;
        walk(s.no, kno, loc); if (hit) return;
        Object.keys(ky).concat(Object.keys(kno)).forEach(n => {
          if (k[n] && !k[n].maybe) return;
          const y = ky[n], o = kno[n];
          k[n] = Object.assign({}, y || o, { maybe:!(y && o && !y.maybe && !o.maybe) });
        });
        continue;
      }
      if (s.kind === "each"){
        const kd = Object.assign({}, k);
        walk(s.do, kd, [{ name:s.as, from:s.from, kind:"item", step:s.name }, { name:"loop.n", kind:"loop" }, { name:"loop.count", kind:"loop" }].concat(loc));
        if (hit) return;
        Object.keys(kd).forEach(n => { if (!k[n]) k[n] = kd[n]; });
        continue;
      }
      if ((s.kind === "set" || s.kind === "select" || s.kind === "filter") && s.var)
        k[s.var] = { name:s.var, step:s.name, show:s.show, on:"ok", maybe:false, list:s.kind !== "set" };
      (s.save || []).forEach(v => { k[v.name] = { name:v.name, step:s.name, show:v.show, on:v.on, maybe:false, shaped:!!(v.keep || v.drop) }; });
      if (s.kind === "http" || s.kind === "script") k.status = { name:"status", step:s.name, maybe:false };
    }
  };
  walk(a.steps, kn, []);
  const before = hit ? hit.before : kn;
  const step = hit ? hit.step : null;
  let locals = hit ? hit.locals : [];
  /* a step that goes through a list (Shape, Filter) has its item too */
  if (step && (step.kind === "select" || step.kind === "filter"))
    locals = [{ name:"item", from:step.from, kind:"item", step:step.name }, { name:"loop.n", kind:"loop" }].concat(locals);
  return {
    inputs: a.inputs.map(i => ({ name:"input." + i.key, label:i.label || i.key, kind:i.kind })),
    saved: Object.keys(before).filter(n => n !== "status").map(n => before[n]),
    status: !!before.status,
    mine: step && step.save ? step.save.map(v => ({ name:v.name, step:step.name, show:v.show, on:v.on })) : [],
    locals: locals,
    builtins: BUILTINS.slice(),
    record: RECORD_FIELDS.map(f => "record." + f)
  };
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
    /* steps inside a Condition's branches count too (5.24) */
    const all = flatSteps(a.steps).map(x => x.s);
    all.forEach(s => (s.save || []).forEach(v => {
      if (v.show !== "ai") return;
      const list = v.on === "fail" ? givesOnFail : gives;
      if (list.indexOf(v.name) < 0) list.push(v.name);
    }));
    /* (5.26) and what "Set a value", "Shape a list", "Filter a list" make */
    all.forEach(s => { if (s.var && s.show === "ai" && gives.indexOf(s.var) < 0) gives.push(s.var); });
    const replies = all.filter(s => s.reply === "ai").map(s => s.name);
    return compact({
      name: a.name,
      about: a.about || undefined,
      system: a.system || undefined,
      inputs: a.inputs.map(i => compact({
        name: i.key, label: i.label || undefined, kind: i.kind === "secret" ? "typed by them" : i.kind,
        required: i.required, example: i.example || undefined,
        choices: i.choices.length ? i.choices : undefined })),
      asksFirst: a.ask,
      steps: all.map(s => s.name),
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
  w.save = (s.save || []).map(v => {
    const o = { name:v.name, from:v.from, path:v.path, show:v.show, on:v.on };
    /* (5.26) the fields to keep, or to leave out, of a list or an object */
    if (v.keep) o.keep = v.keep;
    if (v.drop) o.drop = v.drop;
    if (v.allow) o.allow = true;
    return o;
  });
  w.okWhen = s.okWhen || "";
  w.reply = s.reply || "";
  if (s.replyRaw) w.replyRaw = true;
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
  /* every step in run order, Conditions' branches and the steps inside a
     For each included: the card and the run view draw them from here */
  const F = flatSteps(a.steps);
  const R = {
    id: idOk(env.runId) || newId("r"),
    auto: a.id, name: a.name, by: env.by === "assistant" ? "assistant" : "me", record: str(env.record, 40),
    started: new Date().toISOString(), state: "running",
    inputs: {}, values: {}, hidden: [], shaped: [],
    steps: F.map(x => {
      const st = { sid:x.s.id, name:x.s.name, kind:x.s.kind, state:"wait" };
      if (x.depth){ st.depth = x.depth; st.branch = x.branch; st.parent = x.parent; }
      return st;
    }),
    result: "", error: ""
  };
  const stOf = {};
  F.forEach((x, i) => { stOf[x.s.id] = R.steps[i]; });
  a.inputs.forEach(inp => {
    if (inp.kind === "secret") R.inputs[inp.key] = vals["input." + inp.key] ? "🔒" : "";
    else R.inputs[inp.key] = str(vals["input." + inp.key], 300);
  });
  const t0 = Date.now();
  const tick = () => { try { if (env.tick) env.tick(R); } catch(e){} };
  const stopped = () => { try { return !!(env.stopped && env.stopped()); } catch(e){ return false; } };
  /* (5.26) temps: values this page worked out for one step - a function,
     an item of a For each - handed over beside the others */
  const body = (extra, temps) => Object.assign({ run:R.id, values:temps && Object.keys(temps).length ? Object.assign({}, vals, temps) : vals,
                                                 mask:mask, hidden:R.hidden.slice(), shaped:R.shaped.slice() }, extra);
  const call = async (op, b) => {
    const r = await env.call(op, b);
    return (r && typeof r === "object") ? r : { ok:false, error:"noAnswer" };
  };
  const scopeOf = sc => ({ values:vals, hidden:R.hidden, locals:sc.locals });
  tick();

  /* "Try up to here": stop after this step. upToId (5.24) names any step;
     upTo - a place in the top list - is the older way, and still works */
  let upToId = env.upToId ? String(env.upToId) : "";
  if (!upToId && env.upTo != null && a.steps.length)
    upToId = a.steps[Math.max(0, Math.min(a.steps.length - 1, int(env.upTo, 0)))].id;
  let failed = false, halt = false, ended = false;
  /* the branch a Condition did not take: skipped, and marked as never in
     the running at all */
  const offAll = list => flatSteps(list).forEach(x => { const st = stOf[x.s.id]; st.state = "skip"; st.off = true; });
  const going = () => !(failed || halt || ended || R.state === "stopped");

  /* a condition, read by the tray program (it has the hidden values) */
  async function cond(src, sc){
    const temps = {};
    const w = wireText(src, scopeOf(sc), temps);
    try { return await call("check", body({ when:w }, temps)); }
    catch(e){ return { ok:false, error:str((e && e.message) || e, 300) }; }
  }
  /* a value this page set: shown (to you, or to you and the assistant) */
  function setVal(name, v, how){
    const t = txt(v);
    if (t.length > LIMIT.list) throw new Error("tooLong");
    vals[name] = t;
    R.values[name] = { v:t, show:how === "ai" ? "ai" : "me" };
    R.hidden = R.hidden.filter(x => x !== name);
    R.shaped = R.shaped.filter(x => x !== name);
  }
  /* the list a For each, Shape or Filter goes through */
  function listFrom(s, sc){
    const m = /^\s*\{\{([^{}]*)\}\}\s*$/.exec(s.from || "");
    if (!m) throw new Error("fromOne");
    const p = parsePh(m[1]);
    const r = evalPh(p, scopeOf(sc));
    if (r.hidden) throw new Error("hidden:" + r.hidden);
    if (r.error) throw new Error(r.error);
    if (r.bad) throw new Error("fromOne");
    const v = r.ok ? dataOf(r.v) : undefined;
    if (v != null && v !== "" && typeof v !== "object") throw new Error("notList");
    /* where the list sits in a value the tray program has - so a field
       left out of what this page was shown can still be asked for */
    let src = null;
    if (p.ast && p.ast.t === "ref" && !p.ns){
      const loc = arr(sc.locals).find(l => l.vars && Object.prototype.hasOwnProperty.call(l.vars, p.name));
      if (loc) src = loc.src && loc.src.as === p.name ? loc.src.path + partsPath(p.parts) : null;
      else src = p.name + partsPath(p.parts);
    }
    return { list:asList(v), src:src };
  }
  const noteOf = e => {
    const m = String((e && e.message) || e || "failed");
    return /^hidden:/.test(m) ? "hiddenHere:" + m.slice(7) : m;
  };

  async function runList(list, sc){
    for (const s of list){
      if (!going()) return;
      if (stopped()){ R.state = "stopped"; return; }
      await runOne(s, stOf[s.id], sc);
      if (s.id === upToId) halt = true;
    }
  }

  async function runOne(s, st, sc){
    const inLoop = arr(sc.locals).some(l => l.loop);
    if (inLoop) st.times = (st.times || 0) + 1;
    st.state = "run"; tick();
    const began = Date.now();
    const fail = note => {
      st.state = "fail"; st.note = str(note, 300);
      if (inLoop){ st.fails = (st.fails || 0) + 1; st.failNote = st.note; }
      if (s.onFail !== "continue") failed = true;
    };
    if (s.kind === "if"){
      const c = await cond(s.cond, sc);
      st.ms = Date.now() - began;
      if (!c.ok){
        /* a test that cannot be read decides nothing: neither branch runs */
        fail(c.error || "check");
        offAll(s.yes); offAll(s.no); tick();
        return;
      }
      st.took = c.result ? "yes" : "no";
      st.state = "ok";
      offAll(c.result ? s.no : s.yes);
      flatSteps(c.result ? s.yes : s.no).forEach(x => { delete stOf[x.s.id].off; });
      tick();
      await runList(c.result ? s.yes : s.no, sc);
      return;
    }
    try {
      /* "only when", for every kind but an API call and a script (the tray
         program reads theirs with the step itself) */
      if (s.when && s.kind !== "http" && s.kind !== "script"){
        const c = await cond(s.when, sc);
        if (!c.ok){ fail(c.error || "check"); return; }
        if (!c.result){ st.state = "skip"; return; }
      }
      if (s.kind === "wait"){
        st.state = "sleep"; st.until = Date.now() + s.seconds * 1000; tick();
        const ok = await env.sleep(s.seconds * 1000);
        if (!ok){ st.state = "stop"; R.state = "stopped"; return; }
        st.state = "ok";
        return;
      }
      if (s.kind === "confirm"){
        st.state = "ask"; tick();
        const yes = await env.ask(render(s.text, Object.assign(scopeOf(sc), { keep:true })), s);
        if (!yes){ st.state = "no"; R.state = "stopped"; return; }
        st.state = "ok";
        return;
      }
      /* (5.26) the kinds worked out on this page */
      if (s.kind === "set"){
        const r = valueOf(s.value, scopeOf(sc));
        if (r.hidden) return fail("hiddenHere:" + r.hidden);
        if (r.error) return fail(r.error);
        const cur = vals[s.var];
        let v = r.v;
        if (s.how === "append"){
          const d = dataOf(cur);
          const l = Array.isArray(d) ? d.slice() : (cur == null || cur === "" ? [] : [d]);
          l.push(dataOf(v));
          v = l;
        } else if (s.how === "add") v = numOf(cur) + numOf(v);
        else if (s.how === "text") v = txt(cur) + txt(v);
        setVal(s.var, v, s.show);
        st.state = "ok";
        return;
      }
      if (s.kind === "select" || s.kind === "filter"){
        const L = listFrom(s, sc);
        const pc = s.kind === "filter" ? parseCond(s.cond) : null;
        if (pc && pc.error) return fail("badCond");
        const out = [];
        L.list.slice(0, LIMIT.list).forEach((it, i) => {
          const sc2 = { locals:[{ vars:{ item:it, loop:{ n:i + 1, index:i, count:L.list.length } } }].concat(arr(sc.locals)) };
          const scope = scopeOf(sc2);
          if (s.kind === "filter"){
            const keepIt = evalCond(pc.ast, ph => {
              const r = evalPh(ph, scope);
              if (r.hidden) throw new Error("hidden:" + r.hidden);
              if (r.error) throw new Error(r.error);
              return r.ok ? r.text : undefined;
            });
            if (keepIt) out.push(it);
            return;
          }
          const one = s.fields.length === 1 && !s.fields[0][0];
          const o = {};
          for (const f of s.fields){
            const r = valueOf(f[1], scope);
            if (r.hidden) throw new Error("hidden:" + r.hidden);
            if (r.error) throw new Error(r.error);
            if (one){ out.push(r.v); return; }
            o[f[0]] = r.v;
          }
          out.push(o);
        });
        setVal(s.var, out, s.show);
        st.n = out.length; st.of = L.list.length;
        st.state = "ok";
        return;
      }
      if (s.kind === "stop"){
        /* the run ends here, as you said - with your message, written now
           (it may read the item a For each is on) */
        R.state = s.as === "ok" ? "ok" : s.as === "stop" ? "stopped" : "failed";
        R.endText = render(s.text, Object.assign(scopeOf(sc), { keep:false }));
        R.endForAI = render(s.text, Object.assign(scopeOf(sc), { keep:false, masks:meMasks() }));
        R.endBy = s.id;
        ended = true;
        st.state = "ok";
        return;
      }
      if (s.kind === "each"){
        const L = listFrom(s, sc);
        const items = L.list.slice(0, s.max);
        st.of = L.list.length; st.n = 0;
        const kids = flatSteps(s.do).map(x => stOf[x.s.id]);
        for (let i = 0; i < items.length; i++){
          if (!going()) break;
          if (stopped()){ R.state = "stopped"; break; }
          /* the steps inside start again each time round; how many times
             each ran, and failed, is kept */
          kids.forEach(k => { k.state = "wait"; delete k.off; delete k.took; delete k.note; });
          const loc = { loop:true,
                        vars:{ [s.as]:items[i], loop:{ n:i + 1, index:i, count:items.length, first:i === 0, last:i === items.length - 1 } },
                        src:L.src ? { as:s.as, path:L.src + "[" + i + "]" } : null };
          await runList(s.do, { locals:[loc].concat(arr(sc.locals)) });
          st.n = i + 1; tick();
        }
        kids.forEach(k => { if (k.fails){ k.state = "fail"; k.note = k.failNote; } });
        if (L.list.length > s.max) st.note = "maxItems";
        st.state = failed ? "fail" : "ok";
        if (failed && !st.note) st.note = "loopFailed";
        return;
      }

      const conn = s.conn ? conns.find(c => c.id === s.conn) || null : null;
      const temps = {};
      const scope = scopeOf(sc);
      const wire = wireStep(stepWire(s, env), scope, temps);
      const when = wireText(s.when, scope, temps);
      const until = wireText((s.repeat && s.repeat.until) || "", scope, temps);
      const tries = s.repeat && s.repeat.until ? s.repeat.times : 1;
      let resp = null;
      for (let t = 1; t <= tries; t++){
        st.tries = tries > 1 ? t : undefined;
        resp = await call("step", body({ kind:s.kind, step:wire, conn:connWire(conn), when:when,
                                         until:until, test:!!env.test }, temps));
        if (resp.skipped) break;
        /* what it saved: shown values join the run, hidden ones are only
           named - and a name saved hidden now is no longer a shown one */
        Object.keys(obj(resp.saved)).forEach(k => {
          if (!NAME_RE.test(k)) return;
          const v = str(resp.saved[k], LIMIT.list);
          const how = ((s.save || []).find(x => x.name === k) || {}).show || "me";
          vals[k] = v;
          R.values[k] = { v:v, show:how === "ai" ? "ai" : "me" };
          R.hidden = R.hidden.filter(x => x !== k);
          R.shaped = R.shaped.filter(x => x !== k);
        });
        arr(resp.hidden).forEach(k => {
          if (!NAME_RE.test(k)) return;
          if (R.hidden.indexOf(k) < 0) R.hidden.push(k);
          delete vals[k]; delete R.values[k];
        });
        /* (5.26) shown with fields left out: the tray program has the rest */
        arr(resp.shaped).forEach(k => { if (NAME_RE.test(k) && R.values[k] && R.shaped.indexOf(k) < 0) R.shaped.push(k); });
        st.status = resp.status != null && resp.status !== "" ? resp.status : undefined;
        /* {{status}}: the HTTP status, or a script's exit code, of the step
           that ran last - for the "only when" of the next one */
        if (resp.status != null && resp.status !== "") vals.status = String(resp.status);
        st.missing = arr(resp.missing).length ? arr(resp.missing).slice(0, 12) : undefined;
        /* (5.28) a value set to be shown that the tray program kept hidden,
           because it looked like a secret: the run says so, with a way to
           let it through next time */
        const red = arr(resp.redacted).filter(k => NAME_RE.test(k));
        st.redacted = red.length ? red.slice(0, 12) : undefined;
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
      if (R.state === "stopped") return;
      if (resp.skipped){ st.state = "skip"; return; }
      const gaveUp = resp.ok && s.repeat && s.repeat.until && resp.until !== true;
      if (!resp.ok || gaveUp) return fail(gaveUp ? "stillNot" : (resp.error || "failed"));
      st.state = "ok";
    } catch(e){
      fail(noteOf(e));
    } finally {
      st.ms = (st.ms || 0) + (Date.now() - began);
      tick();
    }
  }
  /* the values shown to you only, as the assistant's copy of a message
     reads them */
  function meMasks(){
    const m = {};
    Object.keys(R.values).forEach(k => { if (R.values[k].show !== "ai") m[k] = "(shown to you only)"; });
    return m;
  }

  await runList(a.steps, { locals:[] });
  if (R.state === "running")
    R.state = failed ? "failed" : R.steps.some(x => x.state === "fail") ? "partial" : "ok";
  /* the hidden values are forgotten now, not when the tray program next
     tidies up */
  try { await call("end", { run:R.id }); } catch(e){}
  R.ended = new Date().toISOString();
  R.ms = Date.now() - t0;
  if (R.endText != null) R.result = R.endText;
  else {
    const tpl = resultTemplate(a, R);
    R.result = tpl ? render(tpl, { values:Object.assign(unsetOf(a), vals), hidden:R.hidden, keep:false }) : "";
  }
  tick();
  return R;
}
/* every value the design saves somewhere, as empty: one a step did not
   save - its branch did not run, it failed first - reads as nothing in
   the closing line, not as {{its name}} */
function unsetOf(a){
  const o = {};
  flatSteps(obj(a).steps).forEach(x => {
    arr(x.s.save).forEach(v => { if (v && v.name) o[v.name] = ""; });
    if (x.s.var) o[x.s.var] = "";
  });
  return o;
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
  const vals = Object.assign(unsetOf(a), ins, me, ai);
  const tpl = resultTemplate(a, R || {});
  /* (5.26) a Stop step's own message, written when it stopped */
  const own = R && R.endText != null;
  /* the whole replies the assistant may read, each as it came (masked by
     the tray program), cut to a size a model reads without trouble */
  const replies = arr(R && R.steps).filter(st => st.replyShow === "ai" && st.reply)
    .map(st => ({ step:st.name, status:st.status, text:str(st.reply, 4000), cut:!!st.replyCut || String(st.reply).length > 4000 }));
  return { ai:ai, me:me, replies:replies,
           resultForAI: own ? str(R.endForAI != null ? R.endForAI : R.endText, LIMIT.out)
                        : tpl ? render(tpl, { values:vals, hidden:hidden, masks:masks, keep:false }) : "",
           result: own ? str(R.endText, LIMIT.out) : tpl ? render(tpl, { values:vals, hidden:hidden, keep:false }) : "" };
}

/* ═══ SAVING TO A FILE, AND BRINGING ONE IN (5.27) ════════════════════════
   An automation file is plain JSON - written by KalKech's Export, or by
   hand, or by an assistant - and it is the same file Import reads:

     {
       "kind": "kalkech.automations",
       "version": 1,
       "exported": "2026-11-01T10:00:00.000Z",
       "automations": [ { "id": …, "name": …, "inputs": […], "steps": […],
                          "result": …, "resultFail": … } ],
       "connections": [ { "id": …, "name": …, "base": "https://…",
                          "auth": "none" | "basic" | "header" | "bearer" | "windows",
                          "extra": ["clientId"] } ]
     }

   What is never in it: a secret (they are kept by the tray program, on one
   PC, and a step only names one - {{secret.password}}), the run history
   (it holds values), and anything of the records.

   Bringing one in: every design and connection goes through the same
   normalising as a workspace's own (normAuto, normConn), so a file written
   by hand cannot put a shape in front of the runner that it was not made
   for; a connection with the same address as one here is that one (its
   secrets keep working); a script step finds its script by file name; and
   whatever the file says, the assistant asks you before it runs one. */
const FILE_KIND = "kalkech.automations";

/* an address as it is compared: scheme, host, path - no trailing slash */
function baseKey(b){
  const p = baseParts(b);
  return p ? p.scheme + "://" + p.host + p.path : "";
}
/* "Policy documents" -> "Policy documents (2)" when that is taken */
function freeName(name, list){
  const taken = {};
  arr(list).forEach(x => { taken[flat(x && x.name)] = 1; });
  if (!taken[flat(name)]) return name;
  const stem = String(name).replace(/\s*\(\d+\)$/, "");
  for (let k = 2; k < 1000; k++){ const n = stem + " (" + k + ")"; if (!taken[flat(n)]) return n; }
  return stem + " (" + rnd(3) + ")";
}

/* the file for some automations (ids), or for all of them (ids null).
   ctx: { scripts (to write a script step's file name beside its id),
   allConns (every connection, not only the ones these use), app } */
function exportFile(store, ids, ctx){
  store = normStore(store);
  ctx = obj(ctx);
  const scripts = arr(ctx.scripts);
  const want = Array.isArray(ids) ? ids : null;
  const list = want ? store.list.filter(a => want.indexOf(a.id) >= 0) : store.list;
  const used = {};
  const autos = list.map(a => {
    const c = JSON.parse(JSON.stringify(a));
    flatSteps(c.steps).forEach(x => {
      if (x.s.conn) used[x.s.conn] = 1;
      if (x.s.kind === "script"){
        const sc = scripts.find(y => y.id === x.s.script);
        if (sc && sc.file) x.s.scriptFile = String(sc.file);
      }
    });
    return c;
  });
  const conns = store.conns.filter(c => (ctx.allConns && !want) || used[c.id]).map(c => JSON.parse(JSON.stringify(c)));
  const out = { kind:FILE_KIND, version:1, exported:new Date().toISOString() };
  if (ctx.app) out.app = str(ctx.app, 40);
  out.automations = autos;
  out.connections = conns;
  return out;
}

/* A file's text (or what it holds) -> { autos, conns } as written, or
   { error: "json" | "shape" | "empty", why }. Generous in what it takes:
   KalKech's own file; a workspace export (Menu → Export) with its
   automations; a list of designs; one design alone; and any of these
   pasted with the ``` fence it was copied with. */
function readFile(input){
  let d = input;
  if (typeof input === "string"){
    let t = input.replace(/^﻿/, "").trim();
    const fence = /^(`{3,}|~{3,})[^\n]*\n([\s\S]*?)\n?\s*\1\s*$/.exec(t);
    if (fence) t = fence[2];
    if (!t) return { error:"empty" };
    try { d = JSON.parse(t); }
    catch(e){ return { error:"json", why:str((e && e.message) || e, 200) }; }
  }
  if (Array.isArray(d)) d = { automations:d };
  if (!d || typeof d !== "object") return { error:"shape" };
  let autos = null, conns = [];
  const st = obj(obj(d.settings).automations);
  if (Array.isArray(st.list)){ autos = st.list; conns = arr(st.conns); }
  else if (Array.isArray(d.automations) || Array.isArray(d.list)){ autos = arr(d.automations || d.list); conns = arr(d.connections || d.conns); }
  else if (d.automation && typeof d.automation === "object"){ autos = [d.automation]; conns = arr(d.connections || d.conns); }
  else if (Array.isArray(d.steps)){ autos = [d]; conns = arr(d.connections || d.conns); }
  if (!autos) return { error:"shape" };
  autos = autos.filter(a => a && typeof a === "object" && !Array.isArray(a)).slice(0, LIMIT.autos);
  conns = conns.filter(c => c && typeof c === "object" && !Array.isArray(c)).slice(0, LIMIT.conns);
  if (!autos.length) return { error:"empty" };
  return { autos:autos, conns:conns, kind:str(d.kind, 40), app:str(d.app || d.appVersion, 40), exported:str(d.exported || d.savedAt, 40) };
}

/* What bringing a file in would do, before anything is changed:
   { autos: [{ a (the design as it would be kept), existing (the one here
     it matches, by id or by name), match: "id" | "name" | "", how: "add" |
     "replace" | "skip" (the default), same (it is already here, unchanged),
     probs (the checker's, as it would be here), scripts (script files it
     needs that are not here), noAsk (the file let the assistant run it
     without asking) }],
     conns: [{ c, how: "new" | "reuse", use (the id here), mine (the
     connection here, for "reuse"), secrets (names its steps may use) }],
     error: "tooMany" when it would not fit }
   ctx: { scripts } - the workspace's, to find a script by its file name */
function planImport(file, store, ctx){
  store = normStore(store);
  ctx = obj(ctx);
  const scripts = arr(ctx.scripts);
  const out = { autos:[], conns:[], error:"" };
  if (!file || file.error) return Object.assign(out, { error:(file && file.error) || "shape" });
  /* connections: the same address (and sign-in) as one here is that one */
  const map = {}, taken = {};
  store.conns.forEach(c => { taken[c.id] = 1; });
  file.conns.forEach(raw => {
    const c = normConn(raw);
    const key = str(raw.id, 80) || c.id;
    const k = baseKey(c.base);
    const mine = k ? store.conns.find(x => baseKey(x.base) === k && x.auth === c.auth) : null;
    if (mine){
      map[key] = mine.id;
      out.conns.push({ c:mine, how:"reuse", use:mine.id, mine:mine, from:c.name, secrets:connSecrets(mine) });
      return;
    }
    if (taken[c.id]) c.id = newId("C");
    taken[c.id] = 1;
    map[key] = c.id;
    out.conns.push({ c:c, how:"new", use:c.id, secrets:connSecrets(c) });
  });
  const connsAfter = store.conns.concat(out.conns.filter(x => x.how === "new").map(x => x.c));
  file.autos.forEach(raw => {
    const r = JSON.parse(JSON.stringify(raw));
    const need = [];
    /* connections and scripts, as they are called here */
    flatSteps(r.steps).forEach(x => {
      const s = x.s;
      if (s.conn != null && map[String(s.conn)]) s.conn = map[String(s.conn)];
      if (s.kind === "script"){
        const f = str(s.scriptFile, 200).trim();
        const sc = f ? scripts.find(y => String(y.file || "").toLowerCase() === f.toLowerCase()) : null;
        if (sc) s.script = sc.id;
        else if (f){ if (!scripts.some(y => y.id === s.script)) need.push(f); }
        delete s.scriptFile;
      }
    });
    const a = normAuto(r);
    const noAsk = a.ai && a.ask === false;
    /* whatever the file says: the assistant asks you before it runs one */
    a.ask = true;
    /* (5.28) and nothing that looks like a secret is shown because a file
       says so: "Show it as it is" is the owner's call, made on this PC */
    let unallowed = 0;
    flatSteps(a.steps).forEach(x => {
      (x.s.save || []).forEach(v => { if (v.allow){ delete v.allow; unallowed++; } });
      if (x.s.replyRaw){ delete x.s.replyRaw; unallowed++; }
    });
    const byId = raw.id != null ? store.list.find(x => x.id === a.id) : null;
    const byName = byId ? null : store.list.find(x => flat(x.name) === flat(a.name));
    const ex = byId || byName || null;
    const strip = x => JSON.stringify(Object.assign({}, x, { updated:"", ask:true }));
    const same = !!byId && strip(normAuto(byId)) === strip(a);
    out.autos.push({ a:a, existing:ex, match:byId ? "id" : byName ? "name" : "", how:same ? "skip" : byId ? "replace" : "add",
                     same:same, noAsk:noAsk, unallowed:unallowed, scripts:uniq(need),
                     probs:check(a, { conns:connsAfter, scripts:scripts }) });
  });
  const adds = out.autos.filter(p => p.how !== "skip" && p.how !== "replace").length;
  if (store.list.length + adds > LIMIT.autos) out.error = "tooMany";
  if (store.conns.length + out.conns.filter(x => x.how === "new").length > LIMIT.conns) out.error = "tooMany";
  return out;
}

/* Bring it in: plan from planImport, choices { index: "add" | "replace" |
   "skip" } (else each one's default), into store - the live one, changed
   in place. A new connection comes in when a design brought in uses it, or
   when no design in the file does (a file of connections). Returns
   { added, replaced, skipped, conns, ids (the designs now here) }. */
function applyImport(plan, choices, store){
  choices = obj(choices);
  const out = { added:0, replaced:0, skipped:0, conns:0, ids:[] };
  if (!plan || plan.error) return out;
  const used = {}, wanted = {};
  plan.autos.forEach(p => flatSteps(p.a.steps).forEach(x => { if (x.s.conn) wanted[x.s.conn] = 1; }));
  const now = new Date().toISOString();
  plan.autos.forEach((p, i) => {
    let how = choices[i] || p.how;
    if (how === "replace" && !p.existing) how = "add";
    if (how === "skip"){ out.skipped++; return; }
    const a = JSON.parse(JSON.stringify(p.a));
    a.updated = now;
    if (how === "replace"){
      /* it keeps the id of the one it replaces: its runs stay its own */
      a.id = p.existing.id;
      const k = store.list.findIndex(x => x.id === p.existing.id);
      if (k >= 0) store.list[k] = a; else store.list.push(a);
      out.replaced++;
    } else {
      if (store.list.some(x => x.id === a.id)) a.id = newId("A");
      a.name = freeName(a.name, store.list);
      store.list.push(a);
      out.added++;
    }
    out.ids.push(a.id);
    flatSteps(a.steps).forEach(x => { if (x.s.conn) used[x.s.conn] = 1; });
  });
  plan.conns.forEach(x => {
    if (x.how !== "new") return;
    if (!used[x.use] && wanted[x.use]) return;
    if (store.conns.some(c => c.id === x.c.id)) return;
    store.conns.push(JSON.parse(JSON.stringify(x.c)));
    out.conns++;
  });
  return out;
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
  stepWire, connWire, run, split, resultTemplate,
  /* 5.24: Conditions and the designer */
  COND_OPS, normList, flatSteps, findStep, freshIds, valuesAt, condRows, condText, condOperand,
  /* 5.26: more kinds, lists, functions, templates */
  HOLDS, SET_HOW, STOP_AS, FN, fnList, fieldList, exParse, evalPh, dataOf, txt, dig, asList, partsPath,
  tplParse, render, valueOf, wireText, wireStep, cmpOp, mdTable, unsetOf,
  /* 5.27: automation files */
  FILE_KIND, exportFile, readFile, planImport, applyImport, baseKey, freeName
};
if (typeof module !== "undefined" && module.exports) module.exports = api;
if (root) root.DossierAuto = api;
})(typeof window !== "undefined" ? window : null);
