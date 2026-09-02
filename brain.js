/* ═══════════════════════════════════════════════════════════════════════════
   brain.js — the small language model, and the very small job it is given

   Dossier answers your questions by counting your own records. It reads a
   sentence by scoring it against a list of known question shapes, and it is
   right about 97 times in 100. This file is about the other three.

   When it misreads you it is almost never lost. The right reading is usually
   sitting second or third in its own ranking and merely not first — because
   ranking a sentence against seventy-eight candidates is a language problem,
   and chat.js does arithmetic, not language.

   So a language model is put in exactly that gap and nowhere else:

       you type  →  chat.js reads it            (instant, and usually right)
                 →  unsure?  →  chat.js hands over its shortlist
                              →  the model PICKS ONE OF THEM
                              →  offered to you as "I think you meant…"
                              →  you accept  →  chat.js answers, and the
                                                shape is learned for good

   Three things that arrangement buys, and they are the reason for it:

   It cannot invent. The model never writes a word you read. It returns one
   name from a list chat.js already knows how to answer, and anything else it
   says is thrown away. There is no path by which it can tell you a number.

   It cannot slow you down. It runs only when chat.js is already unsure — a
   few times a day, not on every question — and behind a timeout. If it is
   loading, stuck, or absent, you get exactly what you got before it existed.

   It gets asked less over time. Accepting its guess teaches the shape, so
   the question it was needed for is answered instantly the next time. The
   model is a teacher for chat.js rather than a dependency of it.

   ── on the download, and where it is allowed to happen ─────────────────────
   dossier.html has carried this since long before there was a model:

       <meta http-equiv="Content-Security-Policy"
             content="connect-src 'none'; form-action 'none'">

   The application cannot open a connection to anywhere. Not a leak, not a
   mistake, not a library that decided to phone home — the browser refuses
   before the request is made. That line is what makes "nothing leaves this
   folder" checkable rather than merely claimed.

   A downloaded model needs the network, and the first version of this file
   ignored that and was blocked by Dossier's own policy, which was the correct
   outcome. Deleting the line would have fixed it and weakened the guarantee
   for everyone, including everyone who never turns the model on.

   So nothing here fetches anything. This file drives model/run.html in a
   hidden frame, and that page — which holds no records, and can reach the
   library CDN and Hugging Face and nowhere else — does the downloading. The
   policy on dossier.html is untouched and still true: with the model off AND
   with it on, the application itself cannot make a network call.

   The frame is created when you switch the model on and destroyed when you
   switch it off. What crosses between them is a sentence and a list of
   question labels going out, and a number coming back.

   ── if this file is missing ────────────────────────────────────────────────
   Everything else works exactly as before. That is the point of it being a
   separate file.
   ═══════════════════════════════════════════════════════════════════════════ */

(function(){
"use strict";

/* The library, pinned. Editable in Setup, because a version that has moved on
   should be something you can fix without opening a text editor. */
const DEFAULT_LIB = "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.79/+esm";

/* Which model, in the order we would try them. The real list is read out of
   the library once it loads — these are only the preferences, matched against
   whatever it actually offers, so a renamed model does not break anything.

   Small is deliberate. The job is "which of these eight questions is this",
   which needs no knowledge of the world and about forty tokens of output. A
   larger model would be slower at it and no better. */
const WANT = [
  { id:"Qwen2.5-0.5B-Instruct-q4f16_1-MLC",  mb:380,  note:"fastest, and enough for this job" },
  { id:"Qwen2.5-1.5B-Instruct-q4f16_1-MLC",  mb:1100, note:"steadier on odd phrasing" },
  { id:"Llama-3.2-1B-Instruct-q4f16_1-MLC",  mb:880,  note:"a middle option" },
  { id:"Llama-3.2-3B-Instruct-q4f16_1-MLC",  mb:2300, note:"only worth it on a real GPU" },
  { id:"gemma-2-2b-it-q4f16_1-MLC",          mb:1500, note:"" },
  { id:"Phi-3.5-mini-instruct-q4f16_1-MLC",  mb:2200, note:"" }
];

const S = {
  status: "off",        /* off | unsupported | loading | ready | failed */
  model: "",
  progress: 0,
  message: "",
  error: "",
  loadedAt: 0,
  local: false,        /* loaded out of the folder rather than off the network */
  asked: 0,
  answered: 0,
  lastMs: 0
};

let engine = null;      /* what actually runs the model */
let loading = null;     /* the in-flight load, so two switches do not race */

/* ── the frame that is allowed to reach the network ─────────────────────── */

let FRAME_SRC = "model/run.html";
let frame = null, frameReady = null, msgId = 0;
const waiting = {};      /* id → { resolve, reject } */
let onFrameProgress = null;

function listen(){
  if (listen.on) return;
  listen.on = true;
  window.addEventListener("message", e => {
    const m = e.data;
    if (!m || m.__dossier !== 1) return;
    if (!frame || e.source !== frame.contentWindow) return;
    if (m.evt === "up"){ if (frameReady) frameReady.go(); return; }
    if (m.evt === "progress"){
      S.progress = Math.max(0, Math.min(1, m.progress || 0));
      S.message = m.text || S.message;
      if (onFrameProgress) onFrameProgress();
      return;
    }
    const w = waiting[m.id];
    if (!w) return;
    delete waiting[m.id];
    if (m.ok) w.resolve(m.result); else w.reject(new Error(m.error || "failed"));
  });
}

/* Put the frame up and wait for it to say hello. A missing run.html is the
   commonest way this goes wrong, and it is silent — the frame simply never
   speaks — so it is given a deadline and a sentence saying where to look. */
function openFrame(){
  if (frameReady && frame) return frameReady.p;
  listen();
  frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.setAttribute("title", "Dossier model runner");
  frame.style.cssText = "position:absolute;width:1px;height:1px;left:-9999px;top:0;border:0";
  let go, fail;
  const p = new Promise((res, rej) => { go = res; fail = rej; });
  frameReady = { p:p, go:go };
  const timer = setTimeout(() => fail(new Error(
    "model/run.html did not answer. It has to sit in a model folder next to " +
    "dossier.html, and Dossier has to be opened through dossier-serve.bat " +
    "rather than from the folder.")), 10000);
  p.then(() => clearTimeout(timer), () => clearTimeout(timer));
  frame.src = FRAME_SRC;
  document.body.appendChild(frame);
  return p;
}

function closeFrame(){
  Object.keys(waiting).forEach(k => {
    try { waiting[k].reject(new Error("stopped")); } catch(e){}
    delete waiting[k];
  });
  if (frame && frame.parentNode) frame.parentNode.removeChild(frame);
  frame = null; frameReady = null;
}

function send(cmd, extra, ms){
  return new Promise((resolve, reject) => {
    if (!frame || !frame.contentWindow) return reject(new Error("the model runner is not up"));
    const id = ++msgId;
    waiting[id] = { resolve, reject };
    const timer = setTimeout(() => {
      if (waiting[id]){ delete waiting[id]; reject(new Error("the model runner did not answer")); }
    }, ms || 0);
    if (!ms) clearTimeout(timer);
    try {
      frame.contentWindow.postMessage(
        Object.assign({ __dossier:1, id:id, cmd:cmd }, extra || {}), "*");
    } catch(e){ delete waiting[id]; reject(e); }
  });
}

/* ── can this browser do it at all ──────────────────────────────────────── */

function why(){
  if (typeof navigator === "undefined") return "no browser";
  if (!window.isSecureContext)
    return "This page is not a secure context. Open Dossier through " +
           "dossier-serve.bat (127.0.0.1) rather than from the folder — a model " +
           "cannot start on a file:// page.";
  if (!navigator.gpu)
    return "This browser has no WebGPU. Edge or Chrome 113 and above have it; " +
           "run model/check.html to see what yours reports.";
  return "";
}
/* Cheap and synchronous, and therefore only half the truth: navigator.gpu
   existing does not mean there is a graphics chip behind it. Some browsers
   expose the object and then hand out no adapter at all. */
function available(){ return !why(); }

/* The honest one. Actually asks for an adapter, which is the only way to
   find out. Costs a few milliseconds and has to be awaited, so the settings
   panel uses it and the synchronous guard above stays for hot paths. */
async function probe(){
  const blocked = why();
  if (blocked) return { ok:false, reason:blocked };
  try {
    const a = await navigator.gpu.requestAdapter();
    if (!a) return { ok:false, reason:"WebGPU is present but this machine offers no " +
      "graphics adapter to it. On a laptop that usually means the browser is on the " +
      "power-saving GPU or graphics drivers need updating." };
    const info = (a.info || {});
    return { ok:true, vendor:info.vendor || "", arch:info.architecture || "",
             maxBuffer:(a.limits && a.limits.maxBufferSize) || 0 };
  } catch(e){
    return { ok:false, reason:"Asking for a graphics adapter failed: " +
             String((e && e.message) || e) };
  }
}

/* ── loading it ─────────────────────────────────────────────────────────── */

function pick(list, prefer){
  const have = {};
  (list || []).forEach(m => { if (m && m.model_id) have[m.model_id] = 1; });
  if (prefer && have[prefer]) return prefer;
  for (const w of WANT) if (have[w.id]) return w.id;
  /* nothing we know by name — take the smallest thing that looks instruction
     tuned and quantised, rather than giving up */
  const guess = (list || [])
    .map(m => m.model_id)
    .filter(id => /q4f16|q4f32/i.test(id) && /instruct|-it-|chat/i.test(id))
    .sort((a, b) => a.length - b.length)[0];
  return guess || "";
}

/* What the library offers, so the picker shows real names rather than the
   ones this file happened to be written against. */
async function catalogue(libUrl){
  await openFrame();
  const list = await send("catalogue", { lib: libUrl || DEFAULT_LIB });
  const known = {};
  WANT.forEach(w => known[w.id] = w);
  return (list || []).map(m => ({
    id: m.id,
    mb: known[m.id] ? known[m.id].mb : (m.mb || 0),
    note: known[m.id] ? known[m.id].note : "",
    preferred: !!known[m.id]
  }));
}

async function load(opts){
  opts = opts || {};
  if (loading) return loading;
  if (S.status === "ready" && (!opts.model || opts.model === S.model)) return engine;

  const blocked = why();
  if (blocked){ S.status = "unsupported"; S.error = blocked; note(opts.onProgress); throw new Error(blocked); }

  S.status = "loading"; S.progress = 0; S.error = ""; S.message = "starting";
  note(opts.onProgress);

  loading = (async () => {
    try {
      const lib = opts.lib || DEFAULT_LIB;
      S.message = "starting the runner";
      note(opts.onProgress);
      onFrameProgress = () => note(opts.onProgress);
      await openFrame();

      S.message = "fetching the runtime";
      note(opts.onProgress);
      const list = await send("catalogue", { lib:lib });
      const id = pick((list || []).map(m => ({ model_id:m.id })), opts.model);
      if (!id) throw new Error("That library offers no model this file recognises. " +
                               "Pick one by name in Setup.");
      S.model = id;
      S.message = "downloading " + id;
      note(opts.onProgress);

      const got = await send("load", { lib:lib, model:id, host:opts.host || "" });
      S.local = !!(got && got.local);

      /* What the rest of this file talks to. It has the shape the runtime
         has, so nothing above here knows or cares that the model is on the
         other side of a frame. */
      engine = { chat: { completions: { create: o => send("chat", { opts:o })
        .then(r => ({ choices:[{ message:{ content:(r && r.text) || "" } }] })) } } };

      S.status = "ready"; S.progress = 1; S.loadedAt = Date.now();
      S.message = "ready";
      note(opts.onProgress);
      return engine;
    } catch (e){
      S.status = "failed";
      S.error = String((e && e.message) || e);
      S.message = "";
      note(opts.onProgress);
      throw e;
    } finally {
      loading = null;
    }
  })();
  return loading;
}

async function unload(){
  try { if (frame) await send("unload", {}, 4000); } catch(e){}
  closeFrame();
  onFrameProgress = null;
  engine = null;
  S.status = "off"; S.progress = 0; S.message = ""; S.error = "";
  return true;
}

function note(cb){ if (typeof cb === "function") { try { cb(state()); } catch(e){} } }
function state(){ return Object.assign({}, S, { ready: S.status === "ready" }); }

/* ── the one question it is ever asked ──────────────────────────────────── */

/* Deliberately rigid. It is given the sentence and a numbered list, and asked
   for a number. A number is the smallest thing that can be wrong, and the
   easiest to check: anything that is not one of the numbers offered is thrown
   away, so a model having a bad day fails closed rather than loudly. */
function buildPrompt(text, list){
  const lines = list.map((x, i) =>
    (i + 1) + ". " + x.label + (x.eg ? "  — e.g. “" + x.eg + "”" : ""));
  return {
    system: "You match a support engineer's message to one of a numbered list of " +
            "questions their record-keeping app can answer. Reply with the number " +
            "alone. If none of them fits, reply 0. Never explain.",
    user: "Message: “" + text + "”\n\n" +
          lines.join("\n") + "\n\n" +
          "Which number? Reply with the number only."
  };
}

function readNumber(out, max){
  /* the minus sign is taken in deliberately: a model that replies "-1" means
     something, and whatever it means it is not candidate one */
  const m = String(out == null ? "" : out).match(/-?\d+/);
  if (!m) return 0;
  const n = parseInt(m[0], 10);
  return (n >= 1 && n <= max) ? n : 0;
}

/* Never allowed to hang the chat. If the model has not answered in time, the
   answer is "I do not know", which is what the app would have said anyway. */
function withTimeout(p, ms){
  return new Promise((resolve, reject) => {
    let done = false;
    const t = setTimeout(() => { if (!done){ done = true; reject(new Error("timed out")); } }, ms);
    p.then(v => { if (!done){ done = true; clearTimeout(t); resolve(v); } },
           e => { if (!done){ done = true; clearTimeout(t); reject(e); } });
  });
}

async function guess(text, list, opts){
  opts = opts || {};
  const q = String(text == null ? "" : text).trim();
  const shortlist = (list || []).filter(x => x && x.name);
  if (!q || !shortlist.length) return null;
  if (S.status !== "ready" || !engine) return null;

  const p = buildPrompt(q, shortlist);
  const t0 = Date.now();
  S.asked++;
  let raw = "";
  try {
    raw = await withTimeout(runOnce(p), opts.timeout || 12000);
  } catch (e){
    S.lastMs = Date.now() - t0;
    return { intent:"", raw:"", error:String((e && e.message) || e), ms:S.lastMs };
  }
  S.lastMs = Date.now() - t0;
  const n = readNumber(raw, shortlist.length);
  if (!n) return { intent:"", raw:raw, none:true, ms:S.lastMs };
  S.answered++;
  const chosen = shortlist[n - 1];
  return { intent:chosen.name, label:chosen.label, pick:n, raw:raw, ms:S.lastMs };
}

async function runOnce(p){
  const r = await engine.chat.completions.create({
    messages: [{ role:"system", content:p.system }, { role:"user", content:p.user }],
    temperature: 0,
    max_tokens: 6
  });
  return (r && r.choices && r.choices[0] && r.choices[0].message &&
          r.choices[0].message.content) || "";
}

/* ── the seam ───────────────────────────────────────────────────────────────
   Everything above except the model itself can be exercised without a GPU by
   putting something else in this chair. That is how the wiring is tested on a
   machine that has no WebGPU at all, and it is also how you would swap in a
   different runtime later without touching the rest. */
function useEngine(fake, name){
  engine = fake;
  S.status = fake ? "ready" : "off";
  S.model = name || (fake ? "test engine" : "");
  S.progress = fake ? 1 : 0;
  S.message = fake ? "ready" : "";
  S.error = "";
  return state();
}

window.DossierBrain = {
  version: "1.0",
  DEFAULT_LIB: DEFAULT_LIB,
  WANT: WANT,
  available: available,
  probe: probe,
  why: why,
  state: state,
  catalogue: catalogue,
  load: load,
  unload: unload,
  guess: guess,
  /* for the test harness, and for anyone swapping the runtime */
  _useEngine: useEngine,
  /* brings the frame up and asks it to say hello — proves the plumbing
     without downloading anything */
  _frameTest: async () => { await openFrame(); return await send("ping", {}, 5000); },
  _frameSrc: v => { if (v != null) FRAME_SRC = v; return FRAME_SRC; },
  _buildPrompt: buildPrompt,
  _readNumber: readNumber
};

})();
