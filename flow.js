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

const VERSION = "1.1";
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

  /* ── the BAU library ─────────────────────────────────────────────────
     A runbook is one symptom and what to do about it, not one document.
     A system profile is the durable truth about a system — what its API
     lies about, which tables hold the answer — and it is what lets you
     help with a problem nobody has written down yet. Reach for the
     profile first when the symptom does not match anything. */

  /* ── the incident history ────────────────────────────────────────────
     workspace.incidents already carries the counted picture of the last 30
     days. These are for looking wider, or at one slice. */

  incidentReview: { write:false, needs:[], args:{ days:INT, system:STR, group:STR },
    what:"Look at the incident history over a window and show the counted " +
         "picture: volume by system, what repeats, how long things take, and " +
         "where the records are too thin to tell what happened. The numbers " +
         "are computed by the app, not by you. Read them and say what they " +
         "mean — which system is the real problem, what is recurring, what " +
         "should become a problem record. Default window is 30 days." },

  incidentGaps: { write:false, needs:[], args:{ days:INT, kind:STR },
    what:"List the incidents whose records cannot answer what happened: " +
         "closed with no resolution note, a note too short to mean anything, " +
         "no root cause, reopened, or the same fault closed as a workaround " +
         "again and again. kind narrows it — noNotes, thinNotes, noCause, " +
         "reopened, repeatWorkaround, recurring." },

  whoFixedThis: { write:false, needs:["about"], args:{ about:STR },
    what:"Who has resolved this kind of incident before, how often, how fast, " +
         "and how often it came back. This is a count over what actually " +
         "happened, not a guess. Use it when somebody asks who to assign " +
         "something to — and give them the evidence, not just a name, because " +
         "an assignment nobody can argue with is one nobody trusts." },

  findRunbook: { write:false, needs:[], args:{ about:STR, system:STR },
    what:"Find the runbooks that match a symptom. Give about the user's own " +
         "words — the error, what they clicked, what did not happen. This " +
         "searches trigger phrases, so it finds things a title search would " +
         "miss. Use it before answering any \"how do I fix\" question." },

  readRunbook: { write:false, needs:["title"], args:{ title:STR },
    what:"Read one runbook in full — its steps, its checks and its escalation. " +
         "The request carries only the index (titles, systems, trigger phrases), " +
         "never the bodies, so you must read one before you can quote its steps. " +
         "Never invent steps for a runbook you have not read." },

  listRunbooks: { write:false, needs:[], args:{ system:STR },
    what:"List the runbook library, or just one system's. Use it when somebody " +
         "asks what is covered, or when you are about to write a new runbook " +
         "and need to know whether one already exists." },

  readProfile: { write:false, needs:["system"], args:{ system:STR },
    what:"Read what is known about a system: what its API does and does not " +
         "tell you, the tables that hold the truth, who owns it. When a symptom " +
         "matches no runbook, this is what you reason from — an endpoint that " +
         "returns success on failure explains a great many confused tickets." },

  startRunbook: { write:true, needs:["title"],
    args:{ title:STR, requester:STR, ticket:STR, priority:["P1","P2","P3","P4"] },
    what:"Raise a record from a runbook, with its steps already on the " +
         "checklist. Use it once the person agrees this is the right runbook, " +
         "so the work is tracked and there is a record of what was done." },

  saveRunbook: { write:true, needs:["title","system"],
    args:{ title:STR, system:STR, triggers:LIST, severity:["P1","P2","P3","P4"],
           steps:LIST, checks:TXT, escalation:TXT, owner:STR,
           status:["draft","approved"] },
    what:"Write a runbook, or replace one of the same title. triggers are the " +
         "phrases somebody would actually use when they hit this — the error " +
         "text, the symptom in their words — and they are what findRunbook " +
         "matches on, so give several and make them specific. steps is the " +
         "procedure, one instruction per entry. checks is for the queries and " +
         "table lookups that prove what is wrong; put them in a ``` fence. " +
         "New runbooks are drafts until somebody with authority approves them." },

  verifyRunbook: { write:true, needs:["title"], args:{ title:STR },
    what:"Stamp a runbook as checked today. A procedure nobody has confirmed " +
         "in a year is a liability, so say so when one is stale." },

  deleteRunbook: { write:true, needs:["title"], args:{ title:STR },
    what:"Remove a runbook from the library." },

  saveProfile: { write:true, needs:["system"],
    args:{ system:STR, facts:TXT, quirks:TXT, tables:TXT, owner:STR },
    what:"Write what is known about a system. facts is what it does; quirks " +
         "is what it does that surprises people — an endpoint that returns 200 " +
         "whether or not it worked belongs here; tables is where the truth " +
         "actually lives. Keep it to about a page: this travels with every " +
         "question, unlike runbook bodies." },

  draftEmail: { write:false, needs:["subject","body"],
    args:{ to:STR, cc:STR, bcc:STR, subject:STR, body:TXT, record:REF },
    what:"Write an email and show it as a draft they can copy or open in " +
         "their mail app. Nothing is sent — Dossier cannot send mail and does " +
         "not try. Put the whole message in body, with real line breaks. Use " +
         "this for a chase, a hand-over, an incident summary, anything they " +
         "ask you to write to somebody." },

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

  setTheme: { write:true, needs:["theme"], args:{ theme:STR },
    what:"Change the application's theme. The names are in " +
         "workspace.settings.themes." },

  setSetting: { write:true, needs:["key","value"], args:{ key:STR, value:STR },
    what:"Change one setting. The keys you may use are listed in " +
         "workspace.settings.canSet, with what each one takes. Anything else " +
         "is refused — in particular nothing here can reach the endpoint URL." },

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

/* Every file as plain text a prompt can take whole: a header line naming
   it, then what it says. A PDF or a text file arrives already read by the
   app, so its words are here; an image, or a scan with no text in it, is
   described instead, and its bytes are in attachments[].data for the
   recogniser (POWER-AUTOMATE.md 4b). Capped, because a prompt input has a
   ceiling and a report can be long; the cut is marked, so the model knows
   it is not seeing the end. */
const ATTACH_TEXT_CAP = 80000;
function attachmentsAsText(list){
  if (!list.length) return "None.";
  const parts = []; let used = 0;
  for (const x of list){
    const kb = x.size ? Math.max(1, Math.round(x.size / 1024)) + " KB" : "";
    const head = "=== " + x.name + " (" + (x.kind || x.type || "file") + (kb ? ", " + kb : "") +
                 (x.pages ? ", " + x.pages + " page" + (x.pages === 1 ? "" : "s") : "") + ") ===";
    let body;
    if (x.text){
      body = x.text;
      if (x.note === "cut") body += "\n[cut here: the file goes on past what fits]";
      else if (x.note === "partial") body += "\n[some characters in this file could not be decoded]";
    }
    else if (x.kind === "image") body = "[an image: its pixels are in attachments[].data for the recogniser, not here]";
    else if (x.note === "scanned") body = "[a scanned PDF, pictures of pages with no text layer: its pages are in attachments[].data for the recogniser]";
    else if (x.note === "encrypted") body = "[a password-protected PDF: its text could not be read]";
    else body = "[no text could be read from this file]";
    let block = head + "\n" + body;
    if (used + block.length > ATTACH_TEXT_CAP){
      block = block.slice(0, Math.max(head.length + 1, ATTACH_TEXT_CAP - used)) +
              "\n[cut here: the attachments are longer than fits in one question]";
      parts.push(block); break;
    }
    used += block.length + 2; parts.push(block);
  }
  return parts.join("\n\n");
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
      name: a.name, type: a.type, size: a.size, data: a.data || "",
      kind: a.kind || (/^image\//.test(a.type || "") ? "image"
                       : a.type === "application/pdf" ? "pdf" : "text"),
      /* what the app read out of the file before sending - the whole text of
         a PDF or a text file - with its page count, and a note when
         something got in the way: scanned, encrypted, cut, partial, empty,
         unreadable. A file with text here carries no data: the words
         travel, the bytes stay on the PC. */
      text: a.text || "", pages: a.pages || 0, note: a.note || "" })),
    /* The same files as one piece of plain text a prompt can take whole -
       each one's name, then what it says. This is the input the prompt
       already reads, so a PDF that used to arrive as a name now arrives as
       its pages, and nothing in the flow has to change to get that.
       One expression: body('Parse_JSON')?['attachmentsText']. */
    attachmentsText: attachmentsAsText(ctx.attachments || []),
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
      /* what setTheme and setSetting are allowed to touch, listed rather
         than guessed at — and the list is built in the app, so it can never
         drift from what the app will actually accept */
      settings: ctx.settable || {},
      /* What the person has taught this workspace. It travels with every
         question rather than being fetched, because a note nobody looked up
         is a note nobody wrote — and the whole point of writing one is that
         next time you have forgotten you ever did. */
      memory: ctx.memory || [],
      memoryTotal: ctx.memoryTotal || 0,

      /* The runbook library arrives as an index and nothing else: title,
         system, trigger phrases, severity, freshness. A hundred of those
         cost less than one note does, and the bodies — which are the long
         part — are fetched with readRunbook only for the one that matches.
         Send the bodies of all of them and the request grows without bound
         until the model refuses it, which is the failure this shape exists
         to avoid.

         System profiles are the exception and travel in full. There are few
         of them, they are meant to be about a page, and they are what you
         reason from when a symptom matches no runbook at all. */
      runbooks: ctx.runbooks || [],
      runbookTotal: ctx.runbookTotal || 0,

      /* THE ONE TO READ. The app matched the library against what was
         actually asked before sending, so these two or three arrive whole —
         steps, checks, escalation — and are what the answer is built from.
         The index above only says what exists; answering from it is how you
         end up announcing that you will look something up instead of
         helping. */
      runbooksMatched: ctx.runbooksMatched || [],
      /* the identifiers in their sentence — a policy number, a ticket — so
         the checks can be written against the real thing */
      mentioned: ctx.mentioned || [],

      /* The incident history, ALREADY COUNTED. Volume by system, what
         repeats, how long things take, where the records are too thin to
         tell what happened. The rows themselves never travel — there can be
         thousands and nothing about them needs re-counting at your end.
         Read these numbers and say what they MEAN. Do not recompute them
         and do not quote a figure that is not here: a total you worked out
         yourself is a total nobody can check. Absent when no incident
         history has been imported. */
      incidents: ctx.incidents || undefined,
      profiles: ctx.profiles || [],
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

  /* One request, not two.

     This used to probe for reachability first and then ask a real question,
     which meant every press of this button ran the flow twice — once with a
     body that said nothing, which is exactly the run people then went
     looking at when something broke.

     There is no need. A request that fails already comes back classified:
     the relay tells "nothing answered" apart from "it answered and the
     browser would not let us read it". So ask the real question, and read
     reachability off the answer — or off the way it failed. */
  let out = null, err = null;
  try {
    out = await ask("ping from Dossier — reply with say only",
                    Object.assign({}, ctx, { tasks:[] }),
                    Object.assign({}, cfg, { scope:"names" }));
  } catch(e){ err = e; }

  if (err){
    /* "cors", "http" and "timeout" all mean something is there and listening;
       only "blocked" means nothing came back at all */
    const answered = err.kind === "cors" || err.kind === "http" || err.kind === "timeout";
    add("Something answers at that address", answered,
        answered
          ? (err.kind === "timeout" ? "it accepted the connection, then went quiet"
                                    : "it answered")
          : "Nothing came back. This network may block it, or the URL is wrong " +
            "or the flow is off.");
    if (!answered) return { steps, verdict:"unreachable", transcript:S.lastTranscript };
    add("The reply can be read", false, err.message);
    return { steps, verdict:err.kind === "cors" ? "cors" : "failed",
             transcript:S.lastTranscript };
  }
  add("Something answers at that address", true, "it answered the test question");
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
