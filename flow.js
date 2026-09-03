/* ═══════════════════════════════════════════════════════════════════════════
   DOSSIER FLOW — asking a Power Automate endpoint, and doing what it says

   chat.js works out what you meant by reading your own workspace, with no
   model and no network. It is good at the forty-odd questions it knows and
   it is honest when it does not know. What it cannot do is the open-ended
   half: a sentence nobody anticipated, a task described three clauses deep,
   a judgement call.

   This file is the other route. It sends the message and a description of
   your workspace to an endpoint you configure — a Power Automate flow with
   a "When an HTTP request is received" trigger — and the flow sends back
   what it wants done. Dossier then does it.

   FOUR THINGS ARE TRUE OF THIS FILE AND HAVE TO STAY TRUE

   1. It does not fetch anything. dossier.html carries connect-src 'none' and
      always will, so every request goes through flow/relay.html, which is
      sandboxed, holds no records, and can only talk to the one origin the
      application pins it to.

   2. Nothing the endpoint returns is trusted. The reply is data to be
      validated, never code and never a command. An action it does not
      recognise is refused by name; an argument of the wrong shape is
      refused; a record reference that resolves to nothing is refused. What
      survives is a list of calls into the application's own functions —
      the same ones the buttons use.

   3. Nothing that writes happens without you. Every write action is
      proposed, shown in full, and waits. A flow cannot close your records,
      however confidently it asks.

   4. Your records leave the folder when you turn this on. That is the whole
      point of it and it is the one promise this feature breaks, so the
      application says so plainly, shows you the exact bytes before they go,
      and lets you choose how much to send.
   ═══════════════════════════════════════════════════════════════════════════ */

(function(){
"use strict";

const VERSION = "1.0";
let RELAY_SRC = "flow/relay.html";

/* ═══ WHAT AN ENDPOINT MAY ASK FOR ═══════════════════════════════════════
   One table, read by three things that must never disagree: the validator
   below, the executor in dossier.html, and the contract the flow is written
   against. Adding an action here is the only way to add one.

     write   does it change the workspace — if so it is always confirmed
     needs   arguments that must be present
     args    every argument, and its shape
     what    one line, sent to the endpoint so it knows what it may ask for   */

const REF = "ref", STR = "string", TXT = "text", INT = "int", BOOL = "bool";
const DATE = "date", TIME = "time", LIST = "list";

const ACTIONS = {
  /* ── reading ─────────────────────────────────────────────────────────── */
  say: { write:false, needs:["text"], args:{ text:TXT },
    what:"Say something back. Use for an answer that needs no change." },

  find: { write:false, needs:[], what:"Show a filtered list of records.",
    args:{ text:STR, status:["open","processing","blocked","done","cancelled","live","any"],
           system:STR, person:STR, party:STR, type:STR, tag:STR,
           priority:["P1","P2","P3","P4"], dueBefore:DATE, dueAfter:DATE,
           createdAfter:DATE, overdue:BOOL, undated:BOOL, waiting:BOOL,
           limit:INT, label:STR } },

  open: { write:false, needs:["record"], args:{ record:REF },
    what:"Open one record in the drawer." },

  openFile: { write:false, needs:["record","name"], args:{ record:REF, name:STR },
    what:"Open one document attached to a record." },

  view: { write:false, needs:["view"],
    args:{ view:["day","board","register","week","library","insight","assist"] },
    what:"Switch the main view." },

  panel: { write:false, needs:["panel"],
    args:{ panel:["ws","report","routine","scripts","look","setup","help"] },
    what:"Open one of the menu panels." },

  report: { write:false, needs:[],
    args:{ period:["week","lastWeek","month"], format:["summary","standup","handover"] },
    what:"Open the Reports panel at a period and format." },

  getRecord: { write:false, needs:["record"], args:{ record:REF },
    what:"Read one record in full — its notes, every checklist step, its work " +
         "log and its documents. Use this when the summary you were sent is not enough." },

  listRoutines: { write:false, needs:[], args:{ includePaused:BOOL },
    what:"List the schedules with what each one does and when it next fires." },

  listHolidays: { write:false, needs:[], args:{ from:DATE, to:DATE },
    what:"List the holidays and office closures in a date range." },

  chaseSheet: { write:false, needs:[], args:{},
    what:"Open the chase sheet for everything that is due a chase." },

  recall: { write:false, needs:[], args:{ about:STR, tag:STR, system:STR },
    what:"Read back what you were taught. Every note is already in " +
         "workspace.memory, so use this to SHOW one to the person, not to " +
         "find out what it says." },

  /* ── writing: every one of these is confirmed before it runs ─────────── */
  createRecord: { write:true, needs:["title"],
    args:{ title:STR, system:STR, type:STR, priority:["P1","P2","P3","P4"],
           due:DATE, dueTime:TIME, requester:STR, ticket:STR, tags:LIST,
           notes:TXT, estimate:INT, checklist:LIST, scripts:LIST,
           waitOn:STR, waitNote:STR },
    what:"Raise a new record. title is required; everything else is optional." },

  updateRecord: { write:true, needs:["record"],
    args:{ record:REF, title:STR, system:STR, type:STR,
           priority:["P1","P2","P3","P4"], due:DATE, dueTime:TIME,
           requester:STR, ticket:STR, tags:LIST, notes:TXT, estimate:INT },
    what:"Change fields on an existing record. Only the fields you send change." },

  setStatus: { write:true, needs:["record","status"],
    args:{ record:REF, status:["open","processing","blocked","done","cancelled"] },
    what:"Move a record to another status." },

  setDue: { write:true, needs:["record"], args:{ record:REF, due:DATE, dueTime:TIME },
    what:"Set or clear a target date. Send due as \"\" to clear it." },

  addLog: { write:true, needs:["record","text"], args:{ record:REF, text:TXT },
    what:"Add a line to a record's work log." },

  addSteps: { write:true, needs:["record","steps"], args:{ record:REF, steps:LIST },
    what:"Add checklist steps to a record. Steps it already has are skipped." },

  tickStep: { write:true, needs:["record","step"],
    args:{ record:REF, step:STR, done:BOOL },
    what:"Tick or untick one checklist step, matched by its text." },

  setWait: { write:true, needs:["record","waitOn"],
    args:{ record:REF, waitOn:STR, waitNote:STR, waitUntil:DATE },
    what:"Hand a record to someone else and start the waiting clock." },

  chase: { write:true, needs:["record"], args:{ record:REF },
    what:"Open the chase sheet for a record that is sitting with someone." },

  attachScript: { write:true, needs:["record","script"],
    args:{ record:REF, script:STR, args:"object" },
    what:"Attach a registered script to a record, with its parameters filled in." },

  runScript: { write:true, needs:["record","script"],
    args:{ record:REF, script:STR, args:"object" },
    what:"Run a script against a record. Needs the runner to be listening." },

  createRoutine: { write:true, needs:["title","freq"],
    args:{ title:STR, freq:["daily","weekly","monthly","cron"], cron:STR,
           days:LIST, dom:INT, time:TIME, system:STR, type:STR,
           priority:["P1","P2","P3","P4"], checklist:LIST, scripts:LIST,
           message:STR, autoRun:BOOL },
    what:"Create a schedule that raises a record, or nudges you, on a cadence." },

  pauseRoutine: { write:true, needs:["routine"], args:{ routine:STR, paused:BOOL },
    what:"Pause or resume a routine, by its title or id." },

  clearWait: { write:true, needs:["record"], args:{ record:REF, note:STR },
    what:"They came back. Stops the waiting clock and files how long it took." },

  logTime: { write:true, needs:["record","minutes"],
    args:{ record:REF, minutes:INT, note:STR },
    what:"Add minutes of work to a record. Use minutes, not hours." },

  timer: { write:true, needs:["record"], args:{ record:REF, on:BOOL },
    what:"Start or stop the clock on a record. Starting one stops any other." },

  block: { write:true, needs:["record","blockedBy"], args:{ record:REF, blockedBy:LIST },
    what:"Say this record cannot finish until other records do. Give their codes." },

  unblock: { write:true, needs:["record"], args:{ record:REF, blockedBy:LIST },
    what:"Remove what was holding a record up. Give codes to remove some, or " +
         "nothing to clear them all." },

  tags: { write:true, needs:["record"], args:{ record:REF, add:LIST, remove:LIST },
    what:"Add or remove tags on a record." },

  updateRoutine: { write:true, needs:["routine"],
    args:{ routine:STR, title:STR, freq:["daily","weekly","monthly","cron"], cron:STR,
           days:LIST, dom:INT, time:TIME, system:STR, type:STR,
           priority:["P1","P2","P3","P4"], checklist:LIST, scripts:LIST,
           message:STR, autoRun:BOOL },
    what:"Change a schedule. Name it by title or id. Only the fields you send change." },

  deleteRoutine: { write:true, needs:["routine"], args:{ routine:STR },
    what:"Delete a schedule. The records it already raised are left alone." },

  runRoutine: { write:true, needs:["routine"], args:{ routine:STR },
    what:"Raise this routine's record now, without waiting for its time." },

  addHoliday: { write:true, needs:["date","name"],
    args:{ date:DATE, name:STR, kind:["public","office"] },
    what:"Mark a day as a holiday or an office closure. A public holiday is " +
         "not a working day; an office closure is marked but still counts." },

  removeHoliday: { write:true, needs:["date"], args:{ date:DATE },
    what:"Unmark a day that is not a holiday after all." },

  addName: { write:true, needs:["kind","name"],
    args:{ kind:["system","type","party"], name:STR, colour:STR },
    what:"Add a system, a work type, or a party you wait on, so it can be " +
         "used from now on. Offer this when they name one you do not have." },

  deleteRecord: { write:true, needs:["record"], args:{ record:REF },
    what:"Delete a record. Its folder and documents stay on disk. Prefer " +
         "setStatus to cancelled, which keeps the history." },

  remember: { write:true, needs:["title","body"],
    args:{ title:STR, body:TXT, tags:LIST, system:STR, replaces:STR },
    what:"Keep what you were just told, so it can be recalled in any later " +
         "conversation. Use it whenever someone explains how something is " +
         "done, what caused something, or what to check next time. title is " +
         "how they will ask for it again; body is the method in full, and may " +
         "be several paragraphs with code blocks in ``` fences. Pass replaces " +
         "with an existing note's title to correct that note instead of " +
         "adding a second one about the same thing." },

  forget: { write:true, needs:["title"], args:{ title:STR },
    what:"Delete a note from memory, by its title." },

  notify: { write:true, needs:["on"], args:{ on:BOOL },
    what:"Turn Windows reminders on or off." },

  undo: { write:true, needs:[], args:{},
    what:"Undo the last change to the workspace." }
};

/* ═══ VALIDATION ═════════════════════════════════════════════════════════
   Everything below assumes the reply is hostile, because the honest reason
   to assume otherwise — "it is my own flow" — stops being true the moment
   the flow's prompt reads a mail, a ticket, or a file that somebody else
   wrote. A model that has been told to close every record will ask; this
   is the layer that says no. */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function str(v, max){
  if (v == null) return "";
  const s = String(typeof v === "object" ? JSON.stringify(v) : v).trim();
  return s.slice(0, max || 200);
}
function coerce(spec, v, name){
  if (Array.isArray(spec)){
    const s = str(v, 40);
    if (!s) return { skip:true };
    const hit = spec.find(x => x.toLowerCase() === s.toLowerCase());
    if (!hit) return { bad:name + " must be one of " + spec.join(", ") + " — got \"" + s + "\"" };
    return { value:hit };
  }
  switch (spec){
    case STR:  { const s = str(v, 200);  return s ? { value:s } : { skip:true }; }
    case TXT:  { const s = str(v, 20000); return s ? { value:s } : { skip:true }; }
    case REF:  { const s = str(v, 60);   return s ? { value:s } : { skip:true }; }
    case INT: {
      if (v === "" || v == null) return { skip:true };
      const n = Math.round(Number(v));
      if (!isFinite(n)) return { bad:name + " must be a number" };
      return { value: Math.max(0, Math.min(100000, n)) };
    }
    case BOOL: {
      if (v == null || v === "") return { skip:true };
      if (typeof v === "boolean") return { value:v };
      const s = str(v, 8).toLowerCase();
      if (["true","yes","on","1"].indexOf(s) >= 0) return { value:true };
      if (["false","no","off","0"].indexOf(s) >= 0) return { value:false };
      return { bad:name + " must be true or false" };
    }
    case DATE: {
      if (v === "") return { value:"" };          /* an explicit clear */
      const s = str(v, 40);
      if (!s) return { skip:true };
      if (DATE_RE.test(s)) return { value:s };
      /* an ISO instant is a common and harmless mistake; take its day */
      const d = new Date(s);
      if (!isNaN(d.getTime()))
        return { value: d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) };
      return { bad:name + " must be a date as YYYY-MM-DD — got \"" + s + "\"" };
    }
    case TIME: {
      if (v === "") return { value:"" };
      const s = str(v, 10);
      if (!s) return { skip:true };
      if (TIME_RE.test(s)) return { value:s };
      const m = s.match(/^(\d{1,2}):(\d{2})/);
      if (m && +m[1] < 24) return { value: pad(+m[1]) + ":" + m[2] };
      return { bad:name + " must be a 24-hour time as HH:MM — got \"" + s + "\"" };
    }
    case LIST: {
      if (v == null || v === "") return { skip:true };
      const arr = Array.isArray(v) ? v : String(v).split(/\s*[,;\n]\s*/);
      const out = arr.map(x => str(x, 200)).filter(Boolean).slice(0, 60);
      return out.length ? { value:out } : { skip:true };
    }
    case "object": {
      if (v == null || v === "") return { skip:true };
      if (typeof v !== "object" || Array.isArray(v))
        return { bad:name + " must be an object of name/value pairs" };
      const out = {};
      Object.keys(v).slice(0, 30).forEach(k => { out[str(k, 60)] = str(v[k], 400); });
      return { value:out };
    }
  }
  return { skip:true };
}
function pad(n){ return String(n).padStart(2, "0"); }

/* One action in, one validated action out — or a refusal that says why in
   words a person can act on, because these end up on screen. */
function checkAction(raw){
  if (!raw || typeof raw !== "object")
    return { bad:"an action must be an object" };
  const name = str(raw.do || raw.action || raw.kind, 40);
  if (!name) return { bad:"an action with no \"do\" was ignored" };
  const def = ACTIONS[name];
  if (!def)
    return { bad:"\"" + name + "\" is not something Dossier can do. " +
                 "The list it accepts is in the request it sent you." };

  const out = { do:name, write:def.write, args:{} };
  const src = (raw.args && typeof raw.args === "object" && !Array.isArray(raw.args))
              ? Object.assign({}, raw, raw.args) : raw;

  for (const k in def.args){
    if (!(k in src)) continue;
    const r = coerce(def.args[k], src[k], k);
    if (r.bad) return { bad:"in " + name + ": " + r.bad };
    if (!r.skip) out.args[k] = r.value;
  }
  for (const k of def.needs)
    if (!(k in out.args))
      return { bad:name + " needs " + k + ", and it was not there" };

  if (raw.why) out.why = str(raw.why, 300);
  return { action:out };
}

/* The whole reply. Anything unusable is dropped with a reason rather than
   quietly ignored — a flow being wrong in a way nobody is told about is how
   this sort of integration rots. */
function validate(payload){
  const out = { say:"", ask:"", actions:[], refused:[], note:"" };
  let body = payload;

  if (typeof body === "string"){
    try { body = JSON.parse(body); }
    catch(e){
      /* A flow with no Response action, or one returning plain text, lands
         here. Rather than fail, treat the text as the answer — it is very
         often exactly what the author meant. */
      const t = String(payload || "").trim();
      if (!t) return { say:"", ask:"", actions:[], refused:[],
                       note:"The endpoint answered with nothing at all. A flow " +
                            "needs a Response action for Dossier to hear anything." };
      if (t.length < 2000 && t.charAt(0) !== "{" && t.charAt(0) !== "[")
        return { say:t, ask:"", actions:[], refused:[], note:"plain text" };
      return { say:"", ask:"", actions:[], refused:[],
               note:"The endpoint answered with something that is not JSON:\n\n" +
                    t.slice(0, 400) };
    }
  }
  if (Array.isArray(body)) body = { actions:body };
  if (!body || typeof body !== "object")
    return { say:"", ask:"", actions:[], refused:[], note:"The reply was not an object." };

  /* Power Automate's Response action often nests the real body one level
     down, depending on how it was built. Look there before giving up. */
  if (!body.say && !body.actions && !body.ask && body.body && typeof body.body === "object")
    body = body.body;

  out.say = str(body.say || body.message || body.text || body.reply, 20000);
  out.ask = str(body.ask || body.question, 500);

  const list = Array.isArray(body.actions) ? body.actions
             : body.action ? [body.action] : [];
  list.slice(0, 25).forEach(a => {
    const r = checkAction(a);
    if (r.bad) out.refused.push(r.bad);
    else out.actions.push(r.action);
  });
  if (Array.isArray(body.actions) && body.actions.length > 25)
    out.refused.push("only the first 25 actions were read; " +
                     body.actions.length + " were sent");

  if (!out.say && !out.actions.length && !out.ask && !out.refused.length)
    out.note = "The endpoint answered, but with nothing to say and nothing to do.";
  return out;
}

/* ═══ WHAT GETS SENT ═════════════════════════════════════════════════════
   The endpoint cannot answer "what is overdue" without knowing what is
   overdue, so the workspace goes with the question. How much of it is your
   decision, because it is your data:

     names    the vocabulary only — systems, people, types, scripts. No
              records at all. Enough to raise work, not to report on it.
     live     the vocabulary, plus every record that is not finished.
     all      everything, closed records included.

   Records are trimmed to the fields a question could turn on. Notes and work
   logs are the bulkiest and the most sensitive part of a record, so they are
   summarised rather than sent, unless you ask for them. */

function slimTask(t, deep){
  const o = {
    code: t.code, title: t.title, status: t.status, priority: t.priority,
    system: t.system, type: t.type
  };
  if (t.ticket) o.ticket = t.ticket;
  if (t.requester) o.requester = t.requester;
  if (t.due) o.due = t.due;
  if (t.dueTime) o.dueTime = t.dueTime;
  if (t.created) o.created = String(t.created).slice(0, 10);
  if (t.completed) o.completed = String(t.completed).slice(0, 10);
  if ((t.tags || []).length) o.tags = t.tags;
  if (t.waitOn){ o.waitOn = t.waitOn; if (t.waitSince) o.waitSince = String(t.waitSince).slice(0, 10); }
  if (t.waitNote) o.waitNote = String(t.waitNote).slice(0, 200);
  if ((t.blockedBy || []).length) o.blockedBy = t.blockedBy.length;
  if (t.estimate) o.estimate = t.estimate;
  if (t.spent) o.spent = Math.round(t.spent);
  if ((t.checklist || []).length){
    o.steps = t.checklist.length;
    o.stepsLeft = t.checklist.filter(c => !c.done).length;
  }
  if ((t.files || []).length) o.files = t.files.map(f => f.name).slice(0, 20);
  if ((t.scripts || []).length) o.scripts = t.scripts.slice();
  if ((t.log || []).length) o.logLines = t.log.length;
  if (deep){
    if (t.notes) o.notes = String(t.notes).slice(0, 2000);
    if ((t.checklist || []).length)
      o.checklist = t.checklist.map(c => ({ text:c.text, done:!!c.done }));
    if ((t.log || []).length)
      o.log = t.log.slice(-12).map(l => ({ at:l.at, text:String(l.text || "").slice(0, 500) }));
  }
  return o;
}

function buildRequest(text, ctx, cfg){
  const st = ctx.settings || {};
  const scope = (cfg && cfg.scope) || "live";
  const deep = !!(cfg && cfg.deep);
  const cap = Math.max(0, Math.min(2000, (cfg && +cfg.cap) || 400));

  const live = ["open", "processing", "blocked"];
  let rows = [];
  if (scope !== "names"){
    const all = (ctx.tasks || []).slice();
    const pick = scope === "all" ? all : all.filter(t => live.indexOf(t.status) >= 0);
    /* if it has to be cut, cut the least useful: finished, then oldest */
    pick.sort((a, b) => {
      const la = live.indexOf(a.status) >= 0 ? 0 : 1, lb = live.indexOf(b.status) >= 0 ? 0 : 1;
      if (la !== lb) return la - lb;
      return String(b.created || "").localeCompare(String(a.created || ""));
    });
    rows = pick.slice(0, cap).map(t => slimTask(t, deep));
  }

  const req = {
    dossier: 1,
    protocol: VERSION,
    askedAt: new Date().toISOString(),
    today: ctx.today || "",
    weekday: ctx.weekday || "",
    calendar: ctx.calendar || {},
    timezone: (function(){ try { return Intl.DateTimeFormat().resolvedOptions().timeZone; }
                           catch(e){ return ""; } })(),
    message: String(text || ""),
    /* Files the person attached to this question. A PDF or a screenshot is
       often the whole of what they are asking about, and typing out what an
       error dialog says is how detail gets lost. */
    attachments: (ctx.attachments || []).map(a => ({
      name: a.name, type: a.type, size: a.size, data: a.data })),
    conversation: (ctx.conversation || []).slice(-6),
    owner: st.owner || "",
    workspace: {
      scope: scope,
      systems: (st.systems || []).map(s => s.name),
      types: (st.types || []).slice(),
      parties: (st.parties || []).slice(),
      statuses: ["open", "processing", "blocked", "done", "cancelled"],
      priorities: ["P1", "P2", "P3", "P4"],
      people: (ctx.people || []).slice(0, 200),
      tags: (ctx.tags || []).slice(0, 200),
      scripts: (ctx.scripts || []).map(s => ({ id:s.id, name:s.name, file:s.file,
                 params:(s.params || []).slice(), desc:s.desc || "" })),
      /* the app works these out and hands them over, because it has the
         calendar and the holiday list and this file does not */
      routines: ctx.routineDetail || (ctx.routines || []).map(r => ({ id:r.id, title:r.title })),
      holidays: ctx.holidays || [],
      holidaysTotal: ctx.holidaysTotal || 0,
      policy: ctx.policy || {},
      /* What the person has taught this workspace. It travels with every
         question rather than being fetched, because a note nobody looked up
         is a note nobody wrote — and the whole point of writing one is that
         next time you have forgotten you ever did. */
      memory: ctx.memory || [],
      memoryTotal: ctx.memoryTotal || 0,
      counts: ctx.counts || {},
      recordsSent: rows.length,
      recordsTotal: (ctx.tasks || []).length,
      records: rows
    },
    can: Object.keys(ACTIONS).map(k => ({ do:k, write:ACTIONS[k].write,
           what:ACTIONS[k].what, needs:ACTIONS[k].needs.slice(),
           args:describeArgs(ACTIONS[k].args) })),
    reply: {
      say: "a sentence for the person, in their own language",
      ask: "a question back, if you need one thing before you can act",
      actions: "a list of { do: …, …arguments… } drawn only from can[]"
    }
  };
  return req;
}

function describeArgs(args){
  const o = {};
  for (const k in args){
    const s = args[k];
    o[k] = Array.isArray(s) ? s.join(" | ")
         : s === LIST ? "list of text"
         : s === "object" ? "object of name/value"
         : s === DATE ? "YYYY-MM-DD"
         : s === TIME ? "HH:MM"
         : s;
  }
  return o;
}

/* ═══ THE RELAY ══════════════════════════════════════════════════════════ */

const S = { frame:null, ready:false, busy:false, seq:0, waiting:{},
            lastTranscript:"", lastMs:0, pinned:"" };

function relaySrc(v){ if (v != null) RELAY_SRC = v; return RELAY_SRC; }

function openFrame(){
  if (S.frame && S.ready) return Promise.resolve(S.frame);
  if (S.opening) return S.opening;
  S.opening = new Promise((resolve, reject) => {
    let f = S.frame;
    if (!f){
      f = document.createElement("iframe");
      f.title = "Dossier flow relay";
      f.setAttribute("aria-hidden", "true");
      f.style.cssText = "position:fixed;right:14px;bottom:14px;width:520px;height:300px;" +
        "border:1px solid #3a352c;border-radius:10px;z-index:60;display:none;background:#12100e";
      f.src = RELAY_SRC + (RELAY_SRC.indexOf("?") < 0 ? "?v=" : "&v=") + VERSION;
      document.body.appendChild(f);
      S.frame = f;
    }
    const t = setTimeout(() => reject(new Error(
      "flow/relay.html did not load. It has to sit next to dossier.html, in a " +
      "folder called flow.")), 10000);
    const done = () => { clearTimeout(t); S.ready = true; resolve(f); };
    if (S.ready) return done();
    S.onReady = done;
    f.addEventListener("error", () => { clearTimeout(t);
      reject(new Error("flow/relay.html could not be loaded.")); });
  });
  S.opening.catch(() => { S.opening = null; });
  return S.opening;
}

window.addEventListener("message", function(ev){
  const m = ev.data;
  if (!m || m.__dossier !== 1) return;
  if (m.evt === "ready"){ S.ready = true; if (S.onReady) S.onReady(); return; }
  if (m.transcript != null) S.lastTranscript = m.transcript;
  const w = S.waiting[m.id];
  if (!w) return;
  delete S.waiting[m.id];
  clearTimeout(w.timer);
  if (m.ok) w.resolve(m.result);
  else { const e = new Error(m.error || "the relay failed"); e.kind = m.kind || "error"; w.reject(e); }
});

function talk(cmd, payload, ms){
  return openFrame().then(f => new Promise((resolve, reject) => {
    const id = "f" + (++S.seq);
    const timer = setTimeout(() => {
      delete S.waiting[id];
      reject(new Error("the relay stopped answering"));
    }, ms || 40000);
    S.waiting[id] = { resolve, reject, timer };
    f.contentWindow.postMessage(Object.assign({ __dossier:1, id:id, cmd:cmd }, payload), "*");
  }));
}

function originOf(u){ try { return new URL(u).origin; } catch(e){ return ""; } }

async function pin(url){
  const o = originOf(url);
  if (o && o !== S.pinned){ await talk("pin", { origin:o }, 8000); S.pinned = o; }
  return o;
}

/* ═══ THE ONE CALL THE APPLICATION MAKES ═════════════════════════════════ */

async function ask(text, ctx, cfg){
  const url = String((cfg && cfg.url) || "").trim();
  if (!url) throw new Error("No endpoint yet. Put your flow's URL in " +
    "Menu → Setup → Ask through Power Automate.");

  const req = buildRequest(text, ctx, cfg);
  const body = JSON.stringify(req);
  await pin(url);

  const t0 = Date.now();
  const r = await talk("post", { url:url, body:body,
    timeout: Math.max(5000, ((cfg && +cfg.timeout) || 30) * 1000) },
    Math.max(15000, ((cfg && +cfg.timeout) || 30) * 1000 + 15000));
  S.lastMs = Date.now() - t0;

  const out = validate(r.text);
  out.ms = S.lastMs;
  out.status = r.status;
  out.sent = body.length;
  out.request = req;
  return out;
}

/* ═══ THE DIAGNOSTIC ═════════════════════════════════════════════════════
   Six things have to be true, and when one of them is not the browser says
   "Failed to fetch" for all six. So each is asked separately and the answer
   names the rung that broke. */

async function test(cfg, ctx){
  const steps = [];
  const url = String((cfg && cfg.url) || "").trim();
  const add = (name, ok, detail) => { steps.push({ name, ok, detail }); return ok; };

  if (!add("An endpoint is set", !!url, url ? "" : "Nothing typed in yet."))
    return { steps, verdict:"no endpoint" };
  if (!add("It is a readable https address", /^https:\/\//i.test(url) && !!originOf(url),
      /^https:\/\//i.test(url) ? "" : "It must begin with https://"))
    return { steps, verdict:"bad url" };
  add("It looks like a Power Automate trigger",
      /logic\.azure|powerplatform|powerautomate|azure-apihub/i.test(url),
      /logic\.azure|powerplatform|powerautomate/i.test(url) ? "" :
      "Not a Microsoft address — fine if you meant that, worth a look if not.");
  add("The signature is present", /[?&]sig=/i.test(url),
      /[?&]sig=/i.test(url) ? "" :
      "A Power Automate URL ends with &sig=… . Copy the whole thing.");

  try { await openFrame(); add("The relay frame loaded", true, ""); }
  catch(e){ add("The relay frame loaded", false, String(e.message)); return { steps, verdict:"no relay" }; }

  await pin(url);

  let reach = false;
  try { const r = await talk("reach", { url:url, timeout:8000 }, 15000); reach = !!(r && r.reachable); }
  catch(e){}
  if (!add("Something answers at that address", reach,
      reach ? "" : "Nothing came back. This network may block it, or the URL " +
                   "is wrong or the flow is off."))
    return { steps, verdict:"unreachable", transcript:S.lastTranscript };

  /* the real thing, with a tiny payload */
  let out = null, err = null;
  try {
    out = await ask("ping from Dossier — reply with say only",
                    Object.assign({}, ctx, { tasks:[] }),
                    Object.assign({}, cfg, { scope:"names" }));
  } catch(e){ err = e; }

  if (err){
    add("The reply can be read", false, err.message);
    return { steps, verdict:err.kind === "cors" ? "cors" : "failed",
             transcript:S.lastTranscript };
  }
  add("The reply can be read", true, "answered " + out.status + " in " + out.ms + " ms");
  add("The reply is the shape Dossier expects",
      !!(out.say || out.actions.length || out.ask),
      out.note || (out.actions.length ? out.actions.length + " action(s)" : "said something"));
  if (out.refused.length) add("Every action was understood", false, out.refused.join(" · "));

  return { steps, verdict: steps.every(s => s.ok) ? "ok" : "partly",
           reply:out, transcript:S.lastTranscript };
}

function show(on){
  if (!S.frame) return false;
  S.frame.style.display = on ? "" : "none";
  return on;
}
function shown(){ return !!(S.frame && S.frame.style.display !== "none"); }

window.DossierFlow = {
  version: VERSION,
  ACTIONS: ACTIONS,
  ask: ask,
  test: test,
  validate: validate,
  buildRequest: buildRequest,
  checkAction: checkAction,
  describeArgs: describeArgs,
  show: show,
  shown: shown,
  transcript: () => S.lastTranscript,
  /* for the tests, the diagnostic page, and anyone swapping the relay */
  _relaySrc: relaySrc,
  _frameTest: async () => { await openFrame(); return await talk("ping", {}, 8000); },
  /* the relay, driven directly — for the tests, and for the diagnostic page */
  _post: o => talk("post", o, 45000),
  _pinned: () => S.pinned,
  _slim: slimTask
};

})();
