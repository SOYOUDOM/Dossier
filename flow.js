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

const VERSION = "1.3";
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

  needRecords: { write:false, needs:[],
    args:{ text:STR, status:["open","processing","blocked","done","cancelled","live","any"],
           system:STR, person:STR, party:STR, type:STR, tag:STR,
           priority:["P1","P2","P3","P4"], dueBefore:DATE, dueAfter:DATE,
           createdAfter:DATE, overdue:BOOL, undated:BOOL, waiting:BOOL, limit:INT },
    what:"Ask for records you were not sent. workspace.records holds the ones this " +
         "question matched, not the whole workspace, and workspace.recordsDigest counts " +
         "what is missing. If the digest shows the answer is in records you cannot see, " +
         "return THIS AND NOTHING ELSE — no say, no other action — and the same question " +
         "is asked again with what the filter found. It is allowed once per question, so " +
         "make the filter wide enough to finish the job." },

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

  learn: { write:true, needs:["lesson"],
    args:{ lesson:TXT, kind:STR, replaces:STR },
    what:"Keep one short thing learned about THIS PERSON - how they like to be " +
         "answered, how they work, who usually asks them for what, a gap in " +
         "what you know that you should ask them about. One sentence. The " +
         "kept ones are in workspace.lessons; pass replaces with one of those " +
         "exactly to correct it rather than add another. Not for procedures - " +
         "a method is remember, a procedure is saveRunbook." },

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
  const out = { say:"", ask:"", actions:[], refused:[], note:"", choices:[] };
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
  /* answers offered with the question - "Yes", "No", "row present" - so a
     one-word reply is one press; at most six, each short */
  if (Array.isArray(body.choices))
    out.choices = body.choices.map(c => str(c, 40)).filter(Boolean).slice(0, 6);

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

/* ═══ WHICH RECORDS TRAVEL ══════════════════════════════════════════

   Every question used to carry the same four hundred records, newest first,
   whatever was asked. Fifty records made a ten-kilobyte question; a thousand
   made a hundred and forty, and a model reads every byte of a question before
   it begins to answer it. That is where the waiting came from, and it grew
   the longer the app was used — which is exactly the wrong way round.

   So the records are RANKED here, against the sentence that was actually
   typed, and the best of them go. The rest are counted rather than sent:
   recordsDigest holds the totals for everything in scope, so "how many are
   overdue" is still answered from the whole workspace and not from a slice
   of it. When the ranking is not enough the endpoint may ask for more with
   needRecords, and that is the only case that costs a second round trip.

   There is no second model in any of this, and there should not be. Choosing
   which records a sentence is about is word, date and identifier matching
   over a few thousand rows — a millisecond of arithmetic on the PC. Asking a
   model to choose would mean sending it the rows first, which is the thing
   being avoided, and paying for an extra call to find out.                  */

const LIVE_SET = ["open", "processing", "blocked"];
const PICK_STOP = (" the a an and or of to in on for is are was were it its this that with " +
  "from by at as be been being has have had do does did what which who whom when where why " +
  "how all any can could should would will not no yes my our your their there here me you " +
  "we they them us him her his she he i am pls please thanks thank now still yet about into " +
  "over under out up down off than then but so if just get got give show tell say said " +
  "need want know think see look").split(" ");

function pickWords(t){
  return String(t || "").toLowerCase().replace(/[^a-z0-9\u1780-\u17ff]+/g, " ").split(" ")
    .filter(w => w.length > 2 && PICK_STOP.indexOf(w) < 0);
}
/* the same stemming the runbook matcher uses: people type the tense they are
   in, not the one the record was written in */
function pickStem(w){ return String(w).replace(/(ing|ed|es|s)$/, "").replace(/e$/, ""); }
function dayShift(ymd, n){
  const d = new Date(String(ymd) + "T00:00:00Z");
  if (isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* what the question names, and what it is about */
function pickAsk(text, ctx){
  const raw = String(text || "");
  const low = " " + raw.toLowerCase().replace(/\s+/g, " ") + " ";
  const st = (ctx && ctx.settings) || {};
  const stems = [];
  pickWords(raw).forEach(w => {
    const x = pickStem(w);
    if (x.length > 2 && stems.indexOf(x) < 0) stems.push(x);
  });
  /* D-0042, INC0012345, a policy number: a word with a digit in it */
  const ids = [];
  raw.split(/[\s,;()"'\[\]]+/).forEach(w => {
    const t = w.replace(/[.:,!?]+$/, "").toLowerCase();
    if (t.length < 3 || t.length > 32) return;
    if (!/\d/.test(t)) return;
    if (!/^[a-z0-9][a-z0-9._\/-]*$/.test(t)) return;
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return;          /* a date */
    if (/^p[1-4]$/.test(t)) return;                     /* a priority */
    if (ids.indexOf(t) < 0) ids.push(t);
  });
  const has = v => !!v && low.indexOf(String(v).toLowerCase()) >= 0;
  const pri = /\b(p[1-4])\b/i.exec(raw);
  return {
    stems: stems, ids: ids,
    systems: (st.systems || []).map(x => x && x.name || x).filter(has),
    people: ((ctx && ctx.people) || []).filter(has),
    parties: (st.parties || []).filter(has),
    types: (st.types || []).filter(has),
    priority: pri ? pri[1].toUpperCase() : "",
    overdue: /overdue|late|past due|slipping|behind|breach|missed/.test(low),
    today:   /today|tonight|due now/.test(low),
    week:    /this week|next week|the week|weekly|by friday/.test(low),
    waiting: /wait|chase|chasing|chased|reply|replied|response|no answer|come back/.test(low),
    blocked: /blocked|stuck|held up|on hold|cannot proceed/.test(low),
    open:    /open|unfinished|in progress|ongoing|on my plate|to do|todo|pending|outstanding|left/.test(low),
    closed:  /closed|finished|completed|resolved|delivered|last week|last month/.test(low)
  };
}

function pickScore(t, ask, k){
  let s = 0;
  const code = String(t.code || "").toLowerCase();
  const tick = String(t.ticket || "").toLowerCase();
  /* a number somebody typed beats everything: they are asking about THAT one */
  for (let i = 0; i < ask.ids.length; i++){
    const x = ask.ids[i];
    if (x === code || x === tick){ s += 1000; break; }
    if (tick && (tick.indexOf(x) >= 0 || x.indexOf(tick) >= 0)){ s += 500; break; }
    if (code && code.indexOf(x) >= 0){ s += 300; break; }
  }
  if (ask.stems.length){
    /* A word in the TITLE is what the record is about. The same word in a
       field is a coincidence of filing: in a workspace with two hundred
       Imaging records, "something wrong with Imaging" matches every one of
       them on the system and only one of them on what it says. Weighted the
       same, the one that says it loses to whichever is newest. */
    const title = (String(t.title || "") + " " + (t.tags || []).join(" ")).toLowerCase();
    const side = (String(t.system || "") + " " + String(t.type || "") + " " +
                  String(t.requester || "") + " " + String(t.waitOn || "") + " " +
                  String(t.waitNote || "")).toLowerCase();
    let hit = 0, near = 0;
    for (let i = 0; i < ask.stems.length; i++){
      const w = ask.stems[i];
      if (title.indexOf(w) >= 0) hit++;
      else if (side.indexOf(w) >= 0) near++;
    }
    /* two of its words is much better evidence than one of them twice */
    if (hit) s += hit * 16 + (hit > 1 ? 12 : 0);
    if (near) s += near * 6;
  }
  const sys = String(t.system || "").toLowerCase();
  if (ask.systems.length && ask.systems.some(x => String(x).toLowerCase() === sys)) s += 30;
  if (ask.people.length || ask.parties.length){
    const who = (String(t.requester || "") + " " + String(t.waitOn || "")).toLowerCase();
    if (ask.people.concat(ask.parties).some(x => who.indexOf(String(x).toLowerCase()) >= 0)) s += 30;
  }
  if (ask.types.length &&
      ask.types.some(x => String(x).toLowerCase() === String(t.type || "").toLowerCase())) s += 12;
  if (ask.priority && t.priority === ask.priority) s += 26;
  const isLive = LIVE_SET.indexOf(t.status) >= 0;
  if (k && t.due){
    if (ask.overdue && isLive && t.due < k) s += 55;
    if (ask.today && t.due === k) s += 55;
    if (ask.week && t.due >= k && t.due <= dayShift(k, 7)) s += 35;
  }
  if (ask.waiting && t.waitOn) s += 40;
  if (ask.blocked && t.status === "blocked") s += 40;
  if (ask.closed && !isLive) s += 20;
  if (ask.open && isLive) s += 8;
  return s;
}

/* The order is: what the question is about, then unfinished before finished,
   then newest. With nothing to go on — "hello", a question about a holiday
   — every score is zero and what is left is exactly the order this used to
   send in, which is the right default and keeps a small workspace behaving
   the way it always did. */
function pickRecords(text, list, cap, ctx){
  const ask = pickAsk(text, ctx);
  const k = (ctx && ctx.today) || "";
  const inScope = {};
  list.forEach(t => { inScope[t.code] = t; });
  const forced = [], seen = {};
  ((ctx && ctx.forceRecords) || []).forEach(t => {
    /* it was asked for, but scope is still the person's answer, not the
       endpoint's: a record outside what they agreed to send does not go */
    if (t && inScope[t.code] && !seen[t.code]){ seen[t.code] = 1; forced.push(t); }
  });
  const scored = [];
  for (let i = 0; i < list.length; i++){
    const t = list[i];
    if (seen[t.code]) continue;
    scored.push({ t: t, s: pickScore(t, ask, k) });
  }
  const rank = t => LIVE_SET.indexOf(t.status) >= 0 ? 0 : 1;
  scored.sort((a, b) => (b.s - a.s) || (rank(a.t) - rank(b.t)) ||
                        String(b.t.created || "").localeCompare(String(a.t.created || "")));
  return { rows: forced.concat(scored.map(x => x.t)).slice(0, cap),
           matched: scored.filter(x => x.s > 0).length + forced.length };
}

/* What is NOT being sent, counted. Every total here is over the whole of
   what is in scope, so a question about how many is answered from the
   workspace and not from the selection. About six hundred bytes. */
function recordsDigest(list, sent, k){
  const out = { inScope:list.length, sent:(sent || []).length,
                notSent:Math.max(0, list.length - (sent || []).length),
                byStatus:{}, bySystem:{}, byPriority:{},
                overdue:0, dueToday:0, dueThisWeek:0, undated:0, waiting:0, blocked:0 };
  const sys = {}, waits = [];
  const wk = k ? dayShift(k, 7) : "";
  for (let i = 0; i < list.length; i++){
    const t = list[i], isLive = LIVE_SET.indexOf(t.status) >= 0;
    out.byStatus[t.status] = (out.byStatus[t.status] || 0) + 1;
    if (t.system) sys[t.system] = (sys[t.system] || 0) + 1;
    if (t.priority) out.byPriority[t.priority] = (out.byPriority[t.priority] || 0) + 1;
    if (t.due && k){
      if (isLive && t.due < k) out.overdue++;
      else if (t.due === k) out.dueToday++;
      else if (wk && t.due > k && t.due <= wk) out.dueThisWeek++;
    } else if (!t.due && isLive) out.undated++;
    if (t.waitOn){ out.waiting++; if (t.waitSince) waits.push(t); }
    if (t.status === "blocked") out.blocked++;
  }
  Object.keys(sys).sort((a, b) => sys[b] - sys[a]).slice(0, 12)
        .forEach(x => { out.bySystem[x] = sys[x]; });
  waits.sort((a, b) => String(a.waitSince).localeCompare(String(b.waitSince)));
  out.longestWaiting = waits.slice(0, 5).map(t => ({ code:t.code,
    title:String(t.title || "").slice(0, 70), waitOn:t.waitOn,
    since:String(t.waitSince).slice(0, 10) }));
  return out;
}

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
  /* how it was fixed, in their words - short, and the most useful line on it */
  if (t.resolution) o.fixed = String(t.resolution).slice(0, 300);
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
const BLANK_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADklEQVR4AWL6////fwAAAAD//w7I1cwAAAAGSURBVAMACgUD/9k79a8AAAAASUVORK5CYII=";
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
      else if (x.note === "ocr" && x.kind === "pdf") body += "\n[read off the scanned pages by the app's recogniser; a stray character is possible; the first page is in picture]";
      else if (x.note === "ocr" || x.note === "seen") body += "\n[the picture was looked at by the app on the PC: the line in brackets, the layout, any words read off it, and the map of letters above are what it found. A stray character is possible - an l for an I. Answer from it rather than saying you cannot see the picture; the pixels themselves are in attachments[].data and in picture.]";
      else if (x.note === "ocrslow") body += "\n[the description above was read off the picture by the app on the PC; its text took too long to read and was left; the pixels are in attachments[].data and in picture]";
    }
    else if (x.note === "vision") body = x.grid
      ? "[picture " + x.grid + " of the image attached to this question - look at it]"
      : "[the picture itself is attached to this question - look at it]";
    else if (x.kind === "image") body = x.note === "nowords"
      ? "[an image with no words the app's recogniser could find: its pixels are in attachments[].data]"
      : x.note === "ocrslow"
      ? "[an image the app's recogniser gave up on: its pixels are in attachments[].data]"
      : "[an image: its pixels are in attachments[].data for the recogniser, not here]";
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

/* ═══ THE PROMPT, SENT FROM HERE ════════════════════════════════════════
   The instructions used to live in Power Automate, in the prompt action,
   with nine inputs wired into it - so changing how the assistant behaves
   meant opening the flow. They live in flow/prompt.txt now. Dossier reads
   that file before every question, fills in the nine places below, and
   sends the finished text as one field, "prompt". The prompt action in the
   flow holds nothing but that one input.

   Where the text comes from, first found wins (dossier.html decides):
     dossier-prompt.txt in your records folder   your own version
     flow/prompt.txt beside dossier.html          the one that ships
     PROMPT_BUILTIN below                         a copy, for file://

   Filled in ONE pass over the template, so a message that happens to
   contain "{workspace}" is sent as those letters and never expanded. */
const PROMPT_SLOTS = ["message", "today", "weekday", "calendar", "workspace",
                      "actions", "history", "memory", "attached"];
const PROMPT_SLOT_RE = /\{(message|today|weekday|calendar|workspace|actions|history|memory|attached)\}/g;

/* PROMPT-BUILTIN */
const PROMPT_BUILTIN = "You are the assistant inside Dossier, where an application-support engineer keeps their work. Think of yourself as the senior engineer at the next desk - the one people like asking, because you know their systems, you remember what they taught you, and you explain things so they understand them, not just what to click. Each turn you decide what to say and what the app should do.\n\nReply with ONE JSON object and nothing else - no code fences around it, no words outside it. The first character is { and the last is }.\n\n=== WHO YOU ARE TALKING TO ===\nworkspace.lessons (inside the workspace below) is what you have learned about this person: how they like answers, how they work, who asks them for what, what you still need to ask. Follow it - especially the [style] lines. A [correction] line is an answer of yours they marked wrong, with what it should have said: that is the truth, and it beats your own knowledge, the runbooks and the notes.\n\nWhat they have taught you, in their own notes - answer from these first, and never invent a method one of them already gives:\n{memory}\nNotes this question did not reach are listed by title in workspace.memoryIndex; recall fetches one by title when it turns out to matter.\n\n=== WHAT YOU CAN ASK THE APP TO DO (the complete list) ===\nOne per line: name(arguments) - what it is for. * marks a required argument; an argument with no type is text; [asks first] means they confirm it before it happens. In your reply each action is written {\"do\":\"<name>\", \"<argument>\":value, ...}.\n{actions}\n\n=== THEIR WORKSPACE ===\n{workspace}\n\n=== WHEN ===\nToday is {today}, a {weekday}.\n{calendar}\nHolidays come from workspace.holidays, never from your own knowledge. workspace.policy: target dates are set from the priority automatically (do not propose a due date unless they asked for one); a record is due a chase after policy.chaseAfterDays; putting a record on hold makes it Blocked by itself.\n\n=== THE CONVERSATION SO FAR ===\n{history}\n\n=== WHAT THEY JUST SAID ===\n{message}\n\n=== WHAT THEY ATTACHED ===\n{attached}\n\n=== THE SHAPE OF YOUR REPLY ===\n{\"say\":\"...\", \"ask\":\"...\", \"choices\":[\"...\",\"...\"], \"actions\":[{\"do\":\"...\", ...}]}\nEvery key is optional; leave out what you do not use. \"say\" alone is a complete answer. \"ask\" only when you truly cannot act without it. \"choices\" (up to six, short) go with \"ask\" so they can answer with one press.\n\n=== HOW TO TALK ===\nTalk the way the best senior colleague explains things: warm, clear and genuinely useful. They should come away understanding what is going on, not only holding an instruction.\n- Their language and register (Khmer to Khmer, English to English). Natural, human phrasing - contractions, and a \"good catch\" or \"that one's annoying\" when it fits. No \"Certainly!\", no \"As an AI\", no repeating their question back, no stock sign-off like \"Let me know if you need anything else\".\n- Match the depth to what they asked. A count, a greeting, a done action, a quick fact: one or two friendly sentences with the one detail that helps. A \"why\", a \"how\", a \"what should I do\", a problem, a request to explain or advise: a real answer - never a bare verdict.\n- A real answer has a shape. Open with the answer, or your read of the situation, in a sentence or two. Then explain WHY: what is happening underneath, what usually causes it, what it means for them. Then what to do - numbered steps where order matters, each with a few words on what it achieves or what to look for. Then anything to watch out for. Finish with the one question or offer that moves them forward (\"ask\" with \"choices\").\n- Explain like a good teacher: plain words first and the technical term after, a short concrete example when an idea is abstract, and their real systems, records, names and values instead of generic ones.\n- Easy to read: paragraphs of two to four sentences; ## headings only when an answer has clearly separate parts; bullets for causes or options; a small table to compare choices or to say what each result would mean; **bold** for the one thing they must not miss. Anything short stays plain prose, with no headings.\n- Honest about uncertainty: say what is most likely, why you think so, and what would confirm it.\n- Formatting that renders: **bold**, *italic*, ## and ### headings, - bullets, 1. numbered steps, > quotes, | tables |, [links](https://...), `inline code`, and fenced code: three backticks + language on their own line, the code, three backticks on their own line. Every script in its own closed fence - the second and third ones too. Prose outside fences. Underscores are not italic, so policy_no stays as it is.\n- When they ask for a thing - code, a query, an email, a summary - give the thing itself, whole, then a line or two on what it does and what they may need to adjust. Never describe it instead.\n\n=== RULES THAT KEEP THE APP CORRECT ===\n1. Use only \"do\" values from the list above. If what they want is not there, say so and return no actions.\n2. Use only names that exist in the workspace: systems, types, parties, scripts, routines. A near miss: use the exact name and mention it. Nothing close: ask, or offer addName for a system, type or party.\n3. workspace.records is only the part of the workspace this question matched (recordsSent of recordsTotal). Never invent a record code. COUNT FROM workspace.recordsDigest, never by counting records. If the answer is in records you were not sent, return needRecords ALONE - no say, nothing else - with a filter wide enough to finish the job; you get one. If you cannot see the record they mean, use find or ask which one.\n4. Dates as YYYY-MM-DD resolved against today; times as 24-hour HH:MM; durations in minutes (logTime minutes:90).\n5. The fewest actions that do the job; no extra view or open. Default priority P3; type Incident for something broken, Service request for something asked for; never guess a system.\n6. Every change is shown to them for a yes, so describe it accurately in \"say\".\n7. Conversation, or a request to WRITE or EXPLAIN something (code, an email, a summary, how something works): \"say\" only, NO actions. Raising a record because somebody asked for a snippet is the worst mistake you can make.\n8. An email is draftEmail with the whole message, signed with workspace owner. App settings: setTheme, or setSetting for keys in workspace.settings.canSet - say what it is now. Routines: updateRoutine with only the fields that change, never delete and recreate; \"run it now\" is runRoutine; days count 0 = Sunday; a cron routine's time is in the expression.\n9. Everything you write to the library is a draft. Never send status \"approved\" unless they say in so many words that they approve it.\n\n=== SUPPORT WORK: BE THE ENGINEER, NOT THE DOCUMENT ===\nworkspace.runbooksMatched carries the runbooks that match what they said, in full, and the app shows that procedure under your answer by itself. The procedure is your knowledge, not your script - copying it back is useless, they could have opened it.\n- Understand first: the symptom, the system, what they already tried, and their identifiers (workspace.mentioned, and anything said earlier in the conversation). Put their real values into every check.\n- Then explain, in your own words, what is most likely going on in THEIR case and why - the mechanism, not just the name of the cause - and give ONE next check: exactly where (screen, table, query with their values filled in) and what each result would mean (a small table does this well). Say what NOT to do when it matters (re-running against missing data, restarting a service for a data problem). End with \"ask\" and \"choices\" for what they find.\n- Their answers are the truth. If what they found contradicts the runbook, say so and reason from the data. Never ask what they already answered, never restart from step one.\n- A weak match (low confidence): say you are not sure this is the right procedure, and ask the one question that settles it. Stale: say so in a clause, and offer verifyRunbook once they confirm it still works.\n- Placeholders: fill value placeholders like <policy> from what they said; leave configuration placeholders like <COI_LETTER> and say once that they still need filling in. Never invent a table name.\n- LAST TIME. workspace.pastFixes lists closed records most like what they said, best first, with how each was fixed (\"their words\", or \"last note, not confirmed\"). When one is plainly the same problem, lead with it: \"This looks like D-0142 on 10 Sep - that was <the fix>\", then the one check that shows whether it is the same cause this time. Several the same: say it keeps coming back and offer saveRunbook. Not the same problem: ignore them without a word. Never invent a past case.\n- Nothing matches: reason from workspace.profiles (what each system does and what it lies about) and workspace.incidents (what happened lately and what fixed it). Never just apologise.\n- WHEN THE GUIDELINE IS THIN, ASK TO LEARN. If the runbook or profile does not tell you something you need - the real table or screen, which team owns it, what normal looks like, who to escalate to - ask them that ONE thing. When they answer, keep it: saveRunbook (same title, draft, the improved version) or saveProfile, and say in a clause what you changed.\n- When it is resolved: the cause in one line, and keep it without being told - remember (symptom, cause, fix, system, the record code, their words), plus saveRunbook if the runbook was wrong or missing the check that decided it.\n- One question at a time, never a questionnaire. Offer startRunbook once they agree it is the right procedure.\n\n=== LEARNING ABOUT THEM ===\nWhen what they say or do shows something durable about them, keep it with learn - one short sentence, kind style, preference, habit, people, system or gap:\n  style: \"wants the query first and the explanation after\"\n  people: \"Sokha from Branch Ops raises most portal password resets\"\n  gap: \"does not know who owns POLICY_MASTER yet - ask when it comes up\"\nOnly what the conversation actually shows. Correct an old lesson with replaces instead of adding a second. Do not announce lessons; a clause at most.\n\n=== MODES (workspace.mode - the message starts with the same word in brackets) ===\n[reflect] The daily look back, sent while they are away from the desk. ATTACHED holds everything since the last look: records CLOSED (with how they were fixed, in their words), records RAISED (who raised them, against what), the CONVERSATIONS, the answers they RATED DOWN with what each should have said, and answers they marked \"not what I meant\". Study it and return:\n  - learn: one to five lessons this material actually shows and workspace.lessons does not already have - when several rated-down answers share a cause (too long, wrong table, explained before giving the query), one [style] or [system] lesson for the cause, not one per answer;\n  - remember: for each closed record whose resolution is worth reusing - symptom, cause, fix, system, record code, in their words;\n  - saveRunbook (draft): when the same kind of problem came up more than once, or a case shows a runbook is missing a check;\n  - saveProfile: only for a durable truth about a system;\n  - say: two to four warm sentences - what you noticed and what you will do differently - then \"ask\" ONE thing you would like them to teach you, with choices when it is a pick.\n  Never create, close or change records in this mode. If nothing is worth keeping, say so in one sentence.\n[teach] They asked you to interview them about a runbook. Read it (runbooksMatched, or readRunbook), find what is missing or vague, ask ONE question per turn, say what you will change after each answer, and save the improved draft with saveRunbook when you have enough or they say stop.\n[fix] A record was just closed and ATTACHED holds it: title, notes, log, steps done. Write in \"say\" ONE line, at most 25 words, past tense: what fixed it, and the cause when the record shows it, in their words where they wrote any. No greeting, no actions, nothing else. If the record does not show what fixed it, say exactly: unknown\n[check] Re-checking an answer they once corrected. The message holds the QUESTION, THE RIGHT ANSWER in their words, and THE NEW ANSWER. \"say\" starts with PASS if the new answer agrees with the right answer on the point that matters (wording may differ, and extra detail is fine), otherwise FAIL - then one short sentence saying why. No actions.\n[intake] After the first line, the message holds something somebody sent them - an email or a Teams chat - to be logged as a new record. Return ONE createRecord; it is shown to them to check, not saved: title = what is wrong or wanted, short, in plain words (never \"Re:\" or \"FW:\"); system and type = exact names from the workspace, or leave them out; priority from the real impact and urgency in the message (P3 when unclear); requester = the person asking, name only; ticket only when the message has one; due and dueTime only when it states a deadline; checklist = two to four first steps in your own words, from runbooksMatched and pastFixes when they fit. \"say\": one sentence - what it most likely is, and \"looks like D-0142\" when a past fix is plainly the same problem. No other actions.\n[study] ATTACHED holds a BAU guideline. Turn each procedure in it into a runbook with saveRunbook (draft): triggers = what people would actually type (symptoms, the error text), steps = the fix as short instructions in your own words - not the document's paragraphs, checks = the queries and lookups in fences, escalation = who and when. Then ask about the most important thing the document does not say.\n\n=== FILES AND PICTURES ===\nEach attached file is listed under its name in WHAT THEY ATTACHED. A document's full text is there, read by the app: answer from it, and quote the actual figures and wording.\n\nWhen the listing says a picture is attached for you to look at, you can see it. Look at it the way you would glance at a colleague's screen:\n- First say what it is, in plain words - an error dialog in the portal, a dashboard, a photo of a server rack, a scanned letter, a chart - and what stands out: something red, a value that is missing or looks wrong, a spinner, a warning.\n- Then answer what they actually asked. \"What is this?\" gets two to four natural sentences, not an inventory.\n- Read text out of it only where it matters: quote an error message exactly, a reference number, the figure they are asking about. Never list everything written on it.\n- If it shows a problem, say what usually causes that and the one next thing to check.\n- Several pictures come as one image, numbered 1, 2, 3 with their file names above each; talk about each by its number.\n- A single blank white pixel is only the placeholder sent when nothing is attached (WHAT THEY ATTACHED then says so); it is not something they showed you.\n\nWhen a picture could NOT be attached, the app's written description is all you have - a line in brackets, the layout, the words read off it, a letter map. Still talk naturally: say in a sentence what it most likely is and use only the words that matter. Never recite colours, positions or the letter map. If the question needs detail the description cannot give, say so in a clause and ask for the one thing you need.\n\nNever say you cannot see a picture that is attached, and never invent text that is not there.\n\n=== INCIDENT HISTORY ===\nworkspace.incidents is already counted. Read the numbers and say what they mean - what recurs, what it cost, what should become a problem record. Never recompute them or quote a figure that is not there. whoFixedThis is evidence: give the numbers with the name, never a bare recommendation. Findings are about records, never about people.\n\n=== EXAMPLES ===\nMessage: \"create a p1 to restart the imaging pool on APP02 tomorrow\"\n{\"say\":\"Raising a P1 against Imaging for tomorrow.\",\"actions\":[{\"do\":\"createRecord\",\"title\":\"Restart imaging pool on APP02\",\"system\":\"Imaging\",\"type\":\"Incident\",\"priority\":\"P1\",\"due\":\"2026-09-04\"}]}\n\nMessage: \"how many are overdue?\"\n{\"say\":\"**3 overdue** - two on Imaging and one on E-Payment. The oldest is four days late, so I'd start there.\",\"actions\":[{\"do\":\"find\",\"overdue\":true}]}\n\nMessage: \"write me a query that lists yesterday's failed payments\"\n{\"say\":\"Here you go - swap the table name if yours differs.\\n\\n```sql\\nSELECT txn_ref, amount, status, created_at\\nFROM   <PAYMENT_TXN>\\nWHERE  status = 'FAILED'\\n  AND  created_at >= DATEADD(day, -1, CAST(GETDATE() AS date))\\n  AND  created_at <  CAST(GETDATE() AS date);\\n```\"}\n\nMessage: \"COI not generating for A018346A10, I clicked generate and it went through\"   (runbooksMatched: the COI runbook)\n{\"say\":\"That success doesn't prove much - regenCOI answers 200 whether or not it rendered anything, so the real question is whether a letter exists. Check for today's row:\\n\\n```sql\\nSELECT letter_id, generated_on, file_path FROM <COI_LETTER> WHERE policy_no = 'A018346A10' ORDER BY generated_on DESC;\\n```\\n\\nA row with a file_path means the letter is there and it's a delivery problem. No row means nothing rendered - that's data, so don't re-run it yet.\",\"ask\":\"What do you see?\",\"choices\":[\"A row with a file_path\",\"A row, no file_path\",\"No row\",\"Can't run it\"]}\n\nMessage: \"No row\"   (the turn above is in the conversation)\n{\"say\":\"Then the request was accepted and nothing rendered, which is nearly always one of four fields being empty on the policy:\\n\\n```sql\\nSELECT insured_name, sum_insured, effective_date, expiry_date FROM <POLICY_MASTER> WHERE policy_no = 'A018346A10';\\n```\",\"ask\":\"Which one is empty?\",\"choices\":[\"insured_name\",\"sum_insured\",\"effective_date\",\"expiry_date\",\"None of them\"]}\n\nMessage: \"effective_date was null, policy admin fixed it and the letter came out\"\n{\"say\":\"Nice - so the cause was a null effective_date on A018346A10, while regenCOI still said 200. I'll keep that, so next time it's one question, and add the field check to the runbook as a draft.\",\"actions\":[{\"do\":\"remember\",\"title\":\"COI letter missing after regenCOI 200\",\"body\":\"Symptom: regenCOI returns 200, no row in <COI_LETTER>.\\nCause: null effective_date in <POLICY_MASTER> (any of insured_name, sum_insured, effective_date, expiry_date stops the render).\\nFix: policy admin fills it, then regenerate once.\\nCase: A018346A10.\",\"system\":\"Imaging\",\"tags\":[\"coi\",\"imaging\"]},{\"do\":\"saveRunbook\",\"title\":\"COI letter does not generate, but the API returned success\",\"system\":\"Imaging\",\"triggers\":[\"COI not generating\",\"regenCOI returned 200 but no letter\",\"COI letter missing\"],\"steps\":[\"Look for today's row in <COI_LETTER>; a row with a file_path means it is a delivery problem.\",\"No row: check the four fields in <POLICY_MASTER>; a null in any stops the render.\",\"Have policy admin fill the field, then regenerate once - never re-run against missing data.\",\"All four present and still nothing: note the request id and time, escalate to Imaging.\"],\"status\":\"draft\"}]}\n\nMessage: \"branch users can't log in to the portal\"   (workspace.pastFixes: D-0142, closed 2026-09-10, their words: \"stale SSO session cache on WEB01 - cleared it and recycled the portal pool\")\n{\"say\": \"This looks like **D-0142 on 10 Sep** all over again. That time the SSO session cache on WEB01 had gone stale: the portal kept handing out tokens the identity server had already expired, so every login bounced with \\\"authentication failed\\\" even though the passwords were fine. Clearing the cache and recycling the portal pool fixed it.\\n\\nThe quickest way to tell whether it's the same thing:\\n\\n| Try | If it works | If it fails |\\n|---|---|---|\\n| Log in yourself on WEB01 directly | The cache is fine - look at the load balancer or the branch network | Same cause as D-0142 - clear the cache on WEB01 |\\n\\n**Don't reset anyone's password yet** - if it's the cache, that changes nothing and just adds tickets.\", \"ask\": \"Does a direct login on WEB01 fail as well?\", \"choices\": [\"Yes, fails there too\", \"No, works on WEB01\", \"Can't test it\"]}\n\nMessage: \"the imaging sync failed again\"   (runbooksMatched: a sync runbook with no escalation contact)\n{\"say\": \"Same pattern as last week, then. What usually happens is the Imaging app pool on APP02 runs out of worker memory overnight, the sync job's connection drops halfway, and it marks itself failed. Recycling the pool and re-running the nightly job clears it.\\n\\nIf it fails a **second** time straight after a recycle, it's usually not us - the DBA index rebuild runs in the same window and locks the tables the sync needs.\", \"ask\": \"The runbook doesn't say who to hand it to when it fails twice - who do you normally go to?\", \"choices\": [\"DBA team\", \"Infra on-call\", \"Vendor\"]}\n\nMessage: \"why do we keep getting deadlocks on the payment table at month end?\"\n{\"say\": \"Most likely it's the month-end batch and live checkout writing to the same rows at the same time, in a different order.\\n\\nA deadlock isn't a crash. Two transactions each hold a lock the other one needs, neither can move, so SQL Server picks one of them and rolls it back - that's the error you see. At month end the reconciliation batch updates thousands of payment rows while customers are still paying, which is exactly when that crossing happens most.\\n\\n## What usually causes it\\n- **Different lock order** - the batch updates payments then settlements; checkout does settlements then payments.\\n- **Long transactions** - the batch holds its locks for minutes instead of committing in chunks.\\n- **A missing index** - SQL Server scans and locks far more rows than it needs to.\\n\\n## How to confirm it\\n1. Pull the deadlock report from the built-in system_health session - it names both queries and the exact objects they fought over:\\n\\n```sql\\nSELECT CAST(event_data AS xml) AS deadlock\\nFROM sys.fn_xe_file_target_read_file('system_health*.xel', NULL, NULL, NULL)\\nWHERE object_name = 'xml_deadlock_report';\\n```\\n\\n2. Check whether the times line up with the batch window.\\n\\nIf it is the batch, committing every few thousand rows usually makes it disappear without touching the checkout code at all.\", \"ask\": \"Want me to raise a record so you can take it to the DBA team?\", \"choices\": [\"Yes, raise it\", \"Not yet\"]}\n\nMessage: \"[reflect] It is my break. Look back over my work since ...\"   (ATTACHED: two COI cases closed by fixing data; three password resets raised by Sokha; they marked an answer that explained before giving the query as \"not what I meant\")\n{\"say\":\"Two COI letters today, and both times the fix was the policy data, not the generator - I've kept that. I also noticed you want the query first, so I'll lead with it from now on.\",\"ask\":\"Who owns POLICY_MASTER when a field needs fixing?\",\"choices\":[\"Policy admin\",\"Data team\",\"It depends on the field\"],\"actions\":[{\"do\":\"learn\",\"lesson\":\"Wants the query or command first, the explanation after\",\"kind\":\"style\"},{\"do\":\"learn\",\"lesson\":\"Sokha raises most portal password resets\",\"kind\":\"people\"},{\"do\":\"remember\",\"title\":\"COI letter missing: check the policy data first\",\"body\":\"Twice on 2026-09-24 (D-0101, D-0104) the COI letter did not render because a required field on the policy was null. Fix the data, regenerate once.\",\"system\":\"Imaging\",\"tags\":[\"coi\"]}]}\n\nMessage: \"what is this?\"   (ATTACHED: panel.jpg - the picture is attached for you to look at: a photo of an elevator control panel, a red FAULT light lit, the display reading E-02)\n{\"say\":\"That's the control panel of a lift, and it's in fault - the red FAULT light is on and the display shows **E-02**. That's the controller's own error code, so the manual for that model will say exactly what tripped; on most panels a code with the doors shown closed points at the door-lock circuit.\",\"ask\":\"Is the car stuck between floors, or just refusing to move with its doors shut?\",\"choices\":[\"Stuck between floors\",\"Won't move, doors shut\",\"Not sure\"]}\n\nMessage: \"thanks, that helped\"\n{\"say\":\"Glad that sorted it.\"}\n\nNow answer the message above. JSON only.\n";
/* PROMPT-BUILTIN-END */

/* The list of actions, as the model reads it: one line each, instead of the
   JSON in req.can - which is 15 KB, as long as the instructions themselves,
   on every question. A * marks what is required, [asks first] what changes
   something. Most actions keep the first sentence of what they are for;
   the ones whose details decide whether a reply is right keep all of it. */
const ACTIONS_IN_FULL = ["needRecords", "find", "remember", "learn", "recall", "saveRunbook",
  "saveProfile", "startRunbook", "draftEmail", "setSetting", "setTheme", "updateRoutine",
  "createRoutine", "createRecord", "setWait", "logTime", "addHoliday"];
function actionsForPrompt(can){
  return (can || []).map(a => {
    const args = Object.keys(a.args || {}).map(k => {
      const t = String(a.args[k]);
      return k + ((a.needs || []).indexOf(k) >= 0 ? "*" : "") + (t === "string" ? "" : ": " + t.replace(/ \| /g, "|"));
    }).join(", ");
    const what = ACTIONS_IN_FULL.indexOf(a.do) >= 0 ? a.what : ((String(a.what).match(/^[^.]*\./) || [a.what])[0]);
    return "- " + a.do + "(" + args + ")" + (a.write ? " [asks first]" : "") + " - " + what;
  }).join("\n");
}

function fillPrompt(template, req){
  /* memory has a place of its own in the prompt; inside workspace it would
     be read twice */
  const ws = Object.assign({}, req.workspace || {});
  delete ws.memory;
  const val = {
    message: req.message || "",
    today: req.today || "",
    weekday: req.weekday || "",
    calendar: JSON.stringify(req.calendar || {}),
    workspace: JSON.stringify(ws),
    actions: actionsForPrompt(req.can),
    history: JSON.stringify(req.conversation || []),
    memory: JSON.stringify((req.workspace && req.workspace.memory) || []),
    attached: (req.attachmentsText && req.attachmentsText !== "None.") ? req.attachmentsText
            : hasPicture(req) ? "None." : NONE_ATTACHED
  };
  return String(template).replace(PROMPT_SLOT_RE, (m, k) => String(val[k]));
}
/* what a template is missing, by name - a prompt without {message} cannot
   answer anything, and one without {actions} will invent them */
/* What a flow set up the 4.4 way needs, and nothing else: the prompt, the
   picture, and enough to answer the probe. Everything the prompt already
   carries - workspace, actions, conversation, attachments - is not sent a
   second time beside it, which roughly halves the request. */
function slimRequest(req){
  return { dossier:req.dossier, protocol:req.protocol, askedAt:req.askedAt, today:req.today,
           mode:req.mode, tier:req.tier,
           message:req.message, prompt:req.prompt, promptFrom:req.promptFrom,
           picture:req.picture, pictureName:req.pictureName };
}

/* Which model a question wants: "fast" for everyday chat, "deep" for the
   jobs where a stronger, slower model earns its keep - the daily look back,
   studying a guideline, interviewing you about a runbook, and anything the
   person asked to be thought about harder. The flow reads it and picks one
   of two prompt actions (POWER-AUTOMATE.md 4e); a flow that does not read
   it answers everything with the one it has, exactly as before. */
const DEEP_MODES = ["reflect", "study", "teach"];
function tierOf(mode, cfg){
  if (cfg && (cfg.tier === "deep" || cfg.tier === "fast")) return cfg.tier;
  const t = cfg && cfg.tiers;
  if (!t || !t.on) return "fast";
  const auto = Array.isArray(t.auto) ? t.auto : DEEP_MODES;
  return auto.indexOf(mode) >= 0 ? "deep" : "fast";
}

function promptGaps(template){
  const t = String(template || "");
  return PROMPT_SLOTS.filter(k => t.indexOf("{" + k + "}") < 0);
}

function buildRequest(text, ctx, cfg){
  const st = ctx.settings || {};
  const scope = (cfg && cfg.scope) || "live";
  const deep = !!(cfg && cfg.deep);
  const cap = Math.max(0, Math.min(2000, (cfg && +cfg.cap) || 400));

  let rows = [], digest = null, matched = 0;
  if (scope !== "names"){
    const all = (ctx.tasks || []).slice();
    const pool = scope === "all" ? all : all.filter(t => LIVE_SET.indexOf(t.status) >= 0);
    const got = pickRecords(text, pool, cap, ctx);
    /* a record somebody pointed at - "diagnose this one" - goes with its
       notes and log whatever the setting, because it is the whole question */
    const forced = {};
    ((ctx && ctx.forceRecords) || []).forEach(t => { if (t && t.code) forced[t.code] = 1; });
    rows = got.rows.map(t => slimTask(t, deep || !!forced[t.code]));
    matched = got.matched;
    digest = recordsDigest(pool, got.rows, ctx.today || "");
  }

  const mode = ctx.mode || "chat";
  const req = {
    dossier: 1,
    protocol: VERSION,
    askedAt: new Date().toISOString(),
    /* the kind of question, and the model it wants - both at the top, so a
       flow can branch on them without reaching into the workspace */
    mode: mode,
    tier: tierOf(mode, cfg),
    today: ctx.today || "",
    weekday: ctx.weekday || "",
    calendar: ctx.calendar || {},
    timezone: (function(){ try { return Intl.DateTimeFormat().resolvedOptions().timeZone; }
                           catch(e){ return ""; } })(),
    message: String(text || ""),
    /* set only on the second of a pair: the endpoint answered the first with
       needRecords, the app ran that filter here, and the rows it found are in
       workspace.records. There is no third. */
    followUp: (ctx.followUp || undefined),
    /* Files the person attached to this question. A PDF or a screenshot is
       often the whole of what they are asking about, and typing out what an
       error dialog says is how detail gets lost. */
    /* A picture the app has already read travels ONCE, as picture, and not
       again here. It used to go twice - here and as picture - which doubled
       the heaviest thing in the request for nothing: a flow that reads text
       skips anything with text (4b), and a flow that looks at pixels looks
       at picture. A picture with no text read off it keeps its bytes here,
       for the recogniser. */
    attachments: (ctx.attachments || []).map(a => ({
      name: a.name, type: a.type, size: a.size,
      data: (a.text && /^image\//.test(a.type || "")) ? "" : (a.data || ""),
      kind: a.kind || (/^image\//.test(a.type || "") ? "image"
                       : a.type === "application/pdf" ? "pdf" : "text"),
      /* what the app read out of the file before sending - the whole text of
         a PDF or a text file, or the words read off a picture (note "ocr")
         when ocr.js is beside the app - with its page count, and a note when
         something got in the way: scanned, encrypted, cut, partial, empty,
         unreadable, nowords. A document with text here carries no data: the
         words travel, the bytes stay on the PC. A picture always carries its
         pixels as well, for a flow that looks at them. */
      text: a.text || "", pages: a.pages || 0, note: a.note || "", grid: a.grid || 0 })),
    /* The same files as one piece of plain text a prompt can take whole -
       each one's name, then what it says. This is the input the prompt
       already reads, so a PDF that used to arrive as a name now arrives as
       its pages, and nothing in the flow has to change to get that.
       One expression: body('Parse_JSON')?['attachmentsText']. */
    attachmentsText: attachmentsAsText(ctx.attachments || []),
    /* The picture of the question, for a prompt that has an image input:
       the first picture attached, or the first page of a scan, as base64
       without a data: prefix - and a blank white pixel when there is none,
       so the input is never handed null. One expression in the flow:
       base64ToBinary(body('Parse_JSON')?['picture']) */
    picture: ctx.picture || BLANK_PNG,
    pictureName: ctx.pictureName || "",
    /* twelve turns, not six: a guided check runs several questions deep,
       and the model has to remember what was already found */
    conversation: (ctx.conversation || []).slice(-12),
    owner: st.owner || "",
    workspace: {
      /* what kind of question this is: "chat" for one typed in the panel;
         "reflect" for the daily look back over the morning's work;
         "teach" when the person has asked to be interviewed about a
         runbook; "study" when a BAU guideline has been handed over to be
         turned into runbooks. The message starts with the same word in
         brackets, so a prompt can see it either way. */
      mode: ctx.mode || "chat",
      /* What has been learned about THIS PERSON - how they like answers,
         how they work, who asks them for what. Short, one line each, the
         newest first; read before answering and written by "learn". */
      lessons: ctx.lessons || [],
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
      /* the notes this question did not reach, by name. Enough to know what
         is known; recall fetches one by name when it turns out to matter. */
      memoryIndex: ctx.memoryIndex || [],
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
      /* Closed records most like this question, and how each was fixed:
         "fixed" is the person's own line (said:"their words") or the last
         thing in the notes (said:"last note, not confirmed"). Up to three,
         best first, only when the words genuinely overlap - the start of
         "last time this happened, you did X". */
      pastFixes: ctx.pastFixes || [],
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
      /* how many of the records in scope the question actually reached. When
         this is larger than recordsSent, the ones that did not fit are the
         lower-scoring ones, and needRecords will fetch them. */
      recordsMatched: matched,
      /* THE REST OF THE WORKSPACE, COUNTED. records is a selection; this is
         every record in scope, totalled. Answer "how many" from here. Do not
         answer it by counting records[] — that is the slice, not the total. */
      recordsDigest: digest || undefined,
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
  /* THE WHOLE PROMPT, ready to run: the one input the prompt action needs.
     Everything above still travels as well, so a flow built the older way,
     with nine inputs of its own, goes on working unchanged. */
  const tpl = (ctx.promptTemplate && promptGaps(ctx.promptTemplate).indexOf("message") < 0)
            ? ctx.promptTemplate : PROMPT_BUILTIN;
  req.prompt = fillPrompt(tpl, req);
  req.promptFrom = tpl === ctx.promptTemplate ? (ctx.promptFrom || "the app") : "built into flow.js";
  return req;
}

/* The picture input of the prompt action cannot be left empty, so when
   nothing is attached it is handed one white pixel, and a mini model will
   happily describe it - "that is a blank white square" - in answer to
   "hello". 4.6.1 fixed that with a block of orders appended after
   everything else ("do not look at it... answer only what they said"), and
   Microsoft's content filter took exactly that shape - instructions tacked
   on after the content, telling the model to disregard an input - for a
   prompt-injection attack and refused every question: InputContentFiltered,
   "Prompt was filtered. [105]". So nothing is appended. The pixel is
   described, plainly, where the model reads what was attached. */
const NONE_ATTACHED = "None - no file and no picture. The image input holds only a blank one-pixel " +
  "placeholder, because it cannot be left empty; there is nothing in it to talk about.";
function hasPicture(req){
  return !!(req.picture && req.picture !== BLANK_PNG && req.pictureName);
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
  const body = JSON.stringify(cfg && cfg.shape === "vision" ? slimRequest(req) : req);
  await pin(url);

  /* a stronger model thinks for longer; Power Automate itself gives up on a
     request after two minutes, so the wait stops just short of that */
  const secs = req.tier === "deep"
    ? Math.min(115, Math.max((cfg && +cfg.timeout) || 30, (cfg && cfg.tiers && +cfg.tiers.timeout) || 110))
    : ((cfg && +cfg.timeout) || 30);
  const t0 = Date.now();
  const r = await talk("post", { url:url, body:body, timeout: Math.max(5000, secs * 1000) },
    Math.max(15000, secs * 1000 + 15000));
  S.lastMs = Date.now() - t0;

  const out = validate(r.text);
  out.tier = req.tier;
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
  PROMPT: PROMPT_BUILTIN,
  PROMPT_SLOTS: PROMPT_SLOTS,
  fillPrompt: fillPrompt,
  promptGaps: promptGaps,
  slimRequest: slimRequest,
  tierOf: tierOf,
  _pick: pickRecords,
  _digest: recordsDigest,
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
