/* ═══════════════════════════════════════════════════════════════════════════
   DOSSIER CHAT — asking the application questions in plain English

   No model, no download, no network — the same rule as assist.js. What makes
   that workable is that this is not a general conversation: it is a bounded
   one. Every system, person, work type, tag, script and record code you might
   name is already sitting in your workspace, so the half of the problem that
   normally needs a model — knowing what your words refer to — is answered by
   reading your own data.

   What is left is working out which of about forty questions you are asking.
   That is done by weighing evidence rather than matching patterns, so word
   order and filler words stop mattering:

     "imaging stuff from last week?"     → find, system=Imaging, range=last week
     "show me records for Imaging in     → the same intent, the same slots
      the past 7 days"

   Three habits keep it from being annoying:

     it guesses freely on questions and asks first on anything that writes;
     when the top two readings are close it offers both rather than picking;
     when you pick one, it remembers that phrasing for next time.

   It returns plain data — sentences, rows, chips, a pending action — and never
   touches the DOM. The app renders it and runs the actions.
   ═══════════════════════════════════════════════════════════════════════════ */

(function(){
"use strict";

const DAY = 86400000;

/* ═══ NORMALISING WHAT WAS TYPED ═════════════════════════════════════════
   Everything downstream sees lower-case words with the punctuation and the
   apostrophes taken out, so "What's overdue?" and "what is overdue" are the
   same six letters by the time anything looks at them. */

const CONTRACTION = {
  "what's":"what is", "whats":"what is", "who's":"who is", "whos":"who is",
  "how's":"how is", "hows":"how is", "where's":"where is", "wheres":"where is",
  "i'm":"i am", "im":"i am", "i've":"i have", "ive":"i have",
  "don't":"do not", "dont":"do not", "doesn't":"does not", "doesnt":"does not",
  "didn't":"did not", "didnt":"did not", "isn't":"is not", "isnt":"is not",
  "aren't":"are not", "arent":"are not", "can't":"can not", "cant":"can not",
  "won't":"will not", "wont":"will not", "let's":"let us", "lets":"let us",
  "there's":"there is", "theres":"there is", "that's":"that is", "thats":"that is",
  "it's":"it is", "its":"it is", "i'll":"i will", "ill":"i will",
  "we're":"we are", "were":"we are", "you're":"you are", "youre":"you are"
};

/* words that carry no signal about which question is being asked */
const NOISE = new Set(("a an the of for to in on at is are am was were be been do does did " +
  "my me i we you your our it its this that these those please can could would should " +
  "will just any some there here about with from by as and or but if then so " +
  "pls plz").split(" "));
/* hi, hello, hey, thanks and ok used to live in that list, because nothing
   could do anything with them. Stripping them meant a bare "hi" reached the
   matcher as an empty sentence and came back "I did not follow that", which
   is a poor first impression from something calling itself an assistant. */

/* a question is being asked, rather than an instruction given */
const ASKING = new Set(("what which who whose whom when where why how is are was were " +
  "do does did can could should would will any anything something").split(" "));

/* ═══ HOW PEOPLE ACTUALLY TYPE ═══════════════════════════════════════════
   "who are u" is the same question as "who are you", and it was coming back
   "I did not follow that". Nobody types carefully into a chat box at half
   past five, and an assistant that only understands full spelling understands
   about half of what it is sent.

   Expanded before anything else looks at the sentence, so every phrase and
   cue downstream sees ordinary words. */

const SHORTHAND = {
  /* texting */
  /* No bare digits and no single letters beyond u/r/y. "2" was mapped to
     "to" for b4-style shorthand, which turned "every 2 hours" into "every to
     hours"; "m" to "am" would have eaten "30 m"; and "min" was in here twice,
     the second one winning and making it "minimum". Numbers and units are
     data in this application, not abbreviations. */
  "u":"you", "ur":"your", "urs":"yours", "r":"are", "y":"why",
  "kk":"ok", "im":"i am", "iam":"i am", "ive":"i have",
  "id":"i would", "ill":"i will", "dont":"do not", "cant":"can not", "wont":"will not",
  "isnt":"is not", "arent":"are not", "wasnt":"was not", "werent":"were not",
  "hasnt":"has not", "havent":"have not", "didnt":"did not", "doesnt":"does not",
  "couldnt":"could not", "shouldnt":"should not", "wouldnt":"would not",
  "aint":"is not", "gonna":"going to", "wanna":"want to", "gotta":"got to",
  "lemme":"let me", "gimme":"give me", "kinda":"kind of", "sorta":"sort of",
  "cuz":"because", "coz":"because", "bcoz":"because", "bcz":"because", "becoz":"because",
  "b4":"before",
  /* abbreviations people use at work */
  "pls":"please", "plz":"please", "plse":"please", "thx":"thanks", "ty":"thanks",
  "tks":"thanks", "tnx":"thanks", "np":"no problem", "yw":"you are welcome",
  "asap":"urgently", "fyi":"for information", "imo":"in my opinion",
  "idk":"i do not know", "btw":"by the way", "rn":"right now", "atm":"at the moment",
  "afaik":"as far as i know", "eod":"end of day", "eow":"end of week",
  "cob":"end of day", "tba":"to be announced", "tbd":"to be decided",
  "wip":"in progress", "eta":"expected time", "poc":"point of contact",
  "ppl":"people", "msg":"message", "msgs":"messages", "req":"request",
  "reqs":"requests", "info":"information", "docs":"documents", "doc":"document",
  "acct":"account", "acc":"account", "admin":"administrator", "config":"configuration",
  "cfg":"configuration", "env":"environment", "prod":"production", "uat":"testing",
  "dev":"development", "sys":"system", "sysm":"system", "db":"database",
  "srv":"server", "svr":"server", "svc":"service", "app":"application",
  "apps":"applications", "prob":"problem", "probs":"problems", "temp":"temporary",
  "avg":"average", "qty":"quantity",
  "amt":"amount", "pymt":"payment", "pmt":"payment", "txn":"transaction",
  "txns":"transactions", "ref":"reference", "cust":"customer", "custs":"customers",
  "vend":"vendor", "mgr":"manager", "mgmt":"management", "dept":"department",
  "wk":"week",
  "yday":"yesterday", "tdy":"today", "tmrw":"tomorrow", "tmr":"tomorrow",
  "tmw":"tomorrow", "2day":"today", "2moro":"tomorrow", "2morrow":"tomorrow",
  /* the ones that get mistyped constantly */
  "teh":"the", "adn":"and", "nad":"and", "waht":"what", "wat":"what", "whta":"what",
  "wht":"what", "wht's":"what is", "hwo":"how", "hwat":"what", "hte":"the",
  "taht":"that", "thier":"their", "recieve":"receive", "recieved":"received",
  "seperate":"separate", "occured":"occurred", "occuring":"occurring",
  "definately":"definitely", "compeleted":"completed", "compelte":"complete",
  "completd":"completed", "finsihed":"finished", "finshed":"finished",
  "overdu":"overdue", "overdeu":"overdue", "ovedue":"overdue", "overude":"overdue",
  "pendign":"pending", "pendin":"pending", "waitin":"waiting", "watiing":"waiting",
  "waitng":"waiting", "recrod":"record", "recrods":"records", "reocrd":"record",
  "taks":"task", "tsak":"task", "taksk":"task", "shedule":"schedule",
  "schedual":"schedule", "sceduled":"scheduled", "reminde":"remind",
  "notifcation":"notification", "notificaiton":"notification", "notif":"notification",
  "notifs":"notifications", "sytem":"system", "sytems":"systems", "systm":"system",
  "sysetm":"system", "imaigng":"imaging", "imagin":"imaging", "imgaing":"imaging",
  "shoudl":"should", "shuold":"should", "woudl":"would", "coudl":"could",
  "frequntly":"frequently", "freqently":"frequently", "frequenlty":"frequently",
  "usualy":"usually", "usualyl":"usually", "comon":"common", "commmon":"common",
  "priorty":"priority", "prioirty":"priority", "prioroty":"priority",
  "assigend":"assigned", "asigned":"assigned", "attachd":"attached",
  "documnet":"document", "documetn":"document", "scritp":"script", "scrpit":"script",
  "sript":"script", "runing":"running", "runnig":"running", "faild":"failed",
  "faled":"failed", "erro":"error", "errror":"error", "problm":"problem"
};

function normalise(raw){
  let s = " " + String(raw == null ? "" : raw).toLowerCase() + " ";
  s = s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  /* a pasted log line or error can carry markup; the tags are not words and
     matching on them turns "<script>…</script>" into a question about the
     scripts folder */
  s = s.replace(/<[^>]{0,200}>/g, " ");
  /* shorthand out of the way before contractions, so "u" is "you" by the
     time anything tries to read the sentence */
  s = s.replace(/[^a-z0-9'\s./:@#$%+-]+/g, " ").replace(/\s+/g, " ").trim();
  /* Word by word, so a boundary is never in question. The contractions used
     to be done with a padded split, and adding the shorthand pass in front of
     it trimmed away the padding — after which "whats" at the start of a
     sentence stopped expanding, and "whats my priority" was read as a
     greeting because "whats" looks like the front of "whatsup". */
  s = s.split(" ").map(function(w){
    return SHORTHAND[w] || CONTRACTION[w] || w;
  }).join(" ");
  return s.replace(/\s+/g, " ").trim();
}
function words(norm){
  return norm.replace(/[^a-z0-9\-/:.]+/g, " ").split(/\s+/).filter(Boolean);
}
function meaningful(ws){ return ws.filter(w => !NOISE.has(w) && w.length > 1); }

/* ═══ FUZZY ══════════════════════════════════════════════════════════════
   "imagin", "Imagin" and "imgaing" all have to reach Imaging, or half of what
   gets typed in a hurry falls on the floor. Bounded edit distance: cheap,
   and it gives up early rather than scoring every pair of words. */

function editDistance(a, b, cap){
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > cap) return cap + 1;
  let prev = new Array(lb + 1), cur = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++){
    cur[0] = i;
    let best = cur[0];
    for (let j = 1; j <= lb; j++){
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1,
                        prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > cap) return cap + 1;
    const t = prev; prev = cur; cur = t;
  }
  return prev[lb];
}
/* how much slack a word of this length has earned */
function slack(n){ return n <= 4 ? 0 : n <= 6 ? 1 : 2; }

function close(a, b){
  if (a === b) return 1;
  if (!a || !b) return 0;
  if (b.indexOf(a) === 0 && a.length >= 4) return 0.92;     // a prefix you stopped typing
  /* The other direction is not symmetrical. "chased" starting with "chase" is
     the same word inflected; "priority" starting with "prior" is a different
     word entirely — and that one quietly sent every question about priority
     to "have I seen this before". Only an inflection counts. */
  if (a.indexOf(b) === 0 && b.length >= 4)
    return /^(s|es|ed|d|ing|ings|er|ers)$/.test(a.slice(b.length)) ? 0.9 : 0;
  const cap = slack(Math.max(a.length, b.length));
  if (!cap) return 0;
  const d = editDistance(a, b, cap);
  return d > cap ? 0 : 1 - d / (Math.max(a.length, b.length) + 1);
}

/* ═══ THE LEXICON ════════════════════════════════════════════════════════
   Built from the workspace, so it knows your systems and your colleagues
   without anybody typing them in twice. Rebuilt whenever the records change. */

function flat(s){ return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, ""); }

function buildLexicon(api){
  const terms = [];
  const add = (text, kind, value, weight) => {
    const t = String(text || "").trim();
    if (!t) return;
    terms.push({ text:t, low:t.toLowerCase(), flat:flat(t), kind, value:value == null ? t : value,
                 weight:weight || 1, ws:t.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean) });
  };

  (api.settings.systems || []).forEach(s => add(s.name || s, "system", s.name || s));
  (api.settings.types || []).forEach(t => add(t, "type", t));
  (api.settings.parties || []).forEach(p => add(p, "party", p));
  (api.scripts || []).forEach(s => {
    add(s.name, "script", s.id); add(s.file, "script", s.id);
    add(String(s.file || "").replace(/\.[a-z0-9]+$/i, ""), "script", s.id);
  });

  /* people and tags come out of the records themselves */
  const people = {}, tags = {}, systems = {}, types = {};
  api.tasks.forEach(t => {
    (api.h.peopleOf(t) || []).forEach(n => people[n] = (people[n] || 0) + 1);
    (t.tags || []).forEach(g => tags[g] = (tags[g] || 0) + 1);
    if (t.system) systems[t.system] = (systems[t.system] || 0) + 1;
    if (t.type) types[t.type] = (types[t.type] || 0) + 1;
    if (t.waitOn) add(t.waitOn, "party", t.waitOn);
  });
  Object.keys(people).forEach(n => add(n, "person", n, 1 + Math.min(2, people[n] / 8)));
  Object.keys(tags).forEach(g => add(g, "tag", g));
  Object.keys(systems).forEach(s => add(s, "system", s));
  Object.keys(types).forEach(s => add(s, "type", s));

  (api.settings.STATUS_WORDS || []).forEach(x => add(x.word, "status", x.id));

  /* Words you told it yourself. "When I say the portal I mean CX Portal" is
     the cheapest kind of teaching there is — one sentence, and every question
     you ask from then on understands a word it had never seen. They carry a
     little extra weight so your own name for something beats a fuzzy match on
     somebody else's. */
  (api.aliases || []).forEach(a => {
    if (a && a.from && a.kind && a.value) add(a.from, a.kind, a.value, 1.7);
  });
  return terms;
}

/* find the best lexicon entry inside a run of words, so that "release
   management" and "infra / iis" match as the phrases they are */
function findTerms(ws, lex, kinds, mask){
  const hits = [];
  const used = (mask || new Array(ws.length).fill(false)).slice();
  /* longest phrases first — "data team" must beat "data" */
  const cand = lex.filter(t => !kinds || kinds.indexOf(t.kind) >= 0)
                  .sort((a, b) => b.ws.length - a.ws.length || b.weight - a.weight);
  cand.forEach(t => {
    const n = t.ws.length;
    /* A workspace with a system called "Other" turned "whats pending with
       others" into a question about that one system, and the answer flipped
       from "one waiting on Vendor" to "no open waits" — the same question,
       two different facts. Short names and ordinary words have to be typed
       exactly; only a distinctive name is worth guessing at. */
    const strict = n === 1 && (NOISE.has(t.low) || ASKING.has(t.low) || t.low.length <= 5);
    for (let i = 0; i + n <= ws.length; i++){
      let free = true;
      for (let j = 0; j < n; j++) if (used[i + j]) { free = false; break; }
      if (!free) continue;
      let sc = 1;
      for (let j = 0; j < n && sc; j++) sc = Math.min(sc, close(ws[i + j], t.ws[j]));
      /* a one-word term also matches its squashed form: "infra/iis" */
      if (!sc && n === 1 && t.flat) sc = close(ws[i], t.flat) * 0.95;
      if (strict && sc < 1) continue;
      if (sc >= 0.78){
        for (let j = 0; j < n; j++) used[i + j] = true;
        hits.push({ term:t, at:i, len:n, score:sc * t.weight });
        break;
      }
    }
  });
  return { hits: hits.sort((a, b) => b.score - a.score), used };
}

/* ═══ WHAT THE QUESTION IS ABOUT ═════════════════════════════════════════
   "What is the most frequently raised system" came back with a colleague's
   name, because "raised" is a strong word for who-raised-what and "system"
   was only a mild one. That is the wrong way round: the verb says what kind
   of question it is, but the NOUN says what the answer must be about, and
   the noun has to win.

   Two things are read out of the sentence here — the dimension being asked
   about, and whether it is a ranking question — and between them they decide
   far more reliably than any keyword can. "Most" plus "system" is one
   question; "most" plus "who" is a different one; and neither can be
   mistaken for the other once both halves are read. */

const DIMS = {
  system:  "system systems application applications app apps platform platforms " +
           "service services module modules product products estate component",
  person:  "person people who whom requester requesters reporter reporters caller " +
           "callers user users colleague colleagues staff name names someone " +
           "everyone anybody somebody individual",
  type:    "type types category categories kind kinds classification classifications " +
           "sort sorts nature",
  tag:     "tag tags label labels keyword keywords marker markers",
  status:  "status statuses state states stage stages",
  priority:"priority priorities severity urgency criticality",
  script:  "script scripts automation automations batch batches macro macros tool tools",
  routine: "routine routines schedule schedules cron crons timer timers",
  party:   "party parties vendor vendors supplier suppliers counterparty externals",
  day:     "day days weekday weekdays date dates monday tuesday wednesday thursday " +
           "friday saturday sunday",
  hour:    "hour hours time",
  month:   "month months",
  record:  "record records task tasks ticket tickets job jobs item items issue issues " +
           "case cases request requests work"
};
const DIMWORD = (function(){
  const m = {};
  for (const d in DIMS) DIMS[d].split(" ").forEach(w => { if (!m[w]) m[w] = d; });
  return m;
})();

const AGG_MOST = ("most commonest frequent frequently often oftenest top highest biggest " +
  "largest worst main majority mostly greatest maximum max leading dominant chief " +
  "primary principal busiest heaviest peak busy popular predominant prevalent " +
  "usual typical recurring worst-offending").split(" ");
const AGG_LEAST = ("least fewest lowest smallest rarest seldom minimum min rarely " +
  "quietest lightest uncommon unusual scarcest emptiest").split(" ");

function readDimension(ws, norm){
  const out = { dim:"", dims:[], agg:"" };
  /* every dimension named, in the order they appear */
  ws.forEach(w => {
    variants(w).forEach(v => {
      const d = DIMWORD[v];
      if (d && out.dims.indexOf(d) < 0) out.dims.push(d);
    });
  });
  /* "record" is what everything is made of, so it only counts as the subject
     when nothing more specific was named */
  const specific = out.dims.filter(d => d !== "record");
  out.dim = specific.length ? specific[0] : (out.dims[0] || "");

  ws.forEach(w => {
    variants(w).forEach(v => {
      if (!out.agg && AGG_MOST.indexOf(v) >= 0) out.agg = "most";
      if (!out.agg && AGG_LEAST.indexOf(v) >= 0) out.agg = "least";
    });
  });
  if (!out.agg && /\bthe most\b|\bmost of\b/.test(norm)) out.agg = "most";
  if (!out.agg && /\bthe least\b/.test(norm)) out.agg = "least";
  return out;
}

/* ═══ WHAT THE QUESTION IS NOT ABOUT ═════════════════════════════════════
   "The ones that are not done" was answered with what WAS done — the exact
   opposite. Negation was simply not read. */

const NEG_MAP = {
  done:"done", finished:"done", complete:"done", completed:"done", closed:"done",
  resolved:"done", started:"processing", begun:"processing", processing:"processing",
  blocked:"blocked", cancelled:"cancelled", canceled:"cancelled", open:"open",
  dated:"due", due:"due", scheduled:"due",
  assigned:"system", tagged:"tag", chased:"chase", estimated:"estimate",
  attached:"file", documented:"file", noted:"notes",
  /* the noun forms, as in "no estimate", "without a system", "no notes" */
  estimate:"estimate", system:"system", tag:"tag", tags:"tag", date:"due",
  deadline:"due", notes:"notes", note:"notes", script:"script", scripts:"script",
  owner:"system", attachment:"file", attachments:"file", documents:"file",
  document:"file", chase:"chase", chases:"chase", steps:"checklist",
  checklist:"checklist", comment:"notes", comments:"notes"
};
function readNegation(norm){
  const out = {};
  let m;
  /* "without a system" put an article between the negation and the noun, and
     the noun was never captured — so the whole sentence read as a question
     about systems, which is the opposite of what was asked. */
  const re = /\b(?:not|never|without|no|lacking|missing)\s+(?:a|an|the|any|its|their)?\s*([a-z]{3,14})\b/g;
  while ((m = re.exec(norm))){
    const k = NEG_MAP[m[1]];
    if (k) out[k] = true;
  }
  /* "unfinished", "undated", "unassigned", "untagged" as single words */
  const re2 = /\bun(finished|done|dated|assigned|tagged|started|chased|estimated)\b/g;
  while ((m = re2.exec(norm))){
    const k = NEG_MAP[m[1]] || NEG_MAP[{ finished:"finished", dated:"dated",
      assigned:"assigned", tagged:"tagged", started:"started", chased:"chased",
      estimated:"estimated", done:"done" }[m[1]]];
    if (k) out[k] = true;
  }
  return Object.keys(out).length ? out : null;
}

/* ═══ ONE FIELD OF ONE RECORD ════════════════════════════════════════════════
   "What is the ticket of task D-0032" had no answer anywhere in this file.
   The record card carried status, priority, system, due date and time
   tracked — and the ticket number, which is the one thing you actually paste
   into an email, was not on it. Neither was the requester, the estimate, the
   folder, or the tags.

   A question that names a record AND names a field is asking for that field
   and nothing else. So the field is read out of the sentence the same way the
   dimension is: once, in one place, for every field a record has. */

const FIELDS = [
  { id:"ticket",    label:"ticket number", words:"ticket tickets ticketno ticketnumber reference references ref refs refno snow servicenow" },
  { id:"system",    label:"system",        words:"system systems application applications app apps platform platforms" },
  { id:"type",      label:"type",          words:"type types category categories" },
  { id:"priority",  label:"priority",      words:"priority priorities severity urgency criticality" },
  { id:"status",    label:"status",        words:"status statuses state states stage stages" },
  { id:"title",     label:"title",         words:"title titles subject subjects headline" },
  { id:"code",      label:"reference",     words:"code codes" },
  { id:"requester", label:"requester",     words:"requester requesters requestor reporter reporters caller callers raiser" },
  { id:"tags",      label:"tags",          words:"tag tags label labels" },
  { id:"folder",    label:"folder",        words:"folder folders directory directories subfolder" },
  { id:"estimate",  label:"estimate",      words:"estimate estimated estimates budget budgeted" },
  { id:"spent",     label:"time spent",    words:"spent tracked elapsed" },
  { id:"waitOn",    label:"waiting party",  words:"waiton" },
  { id:"created",   label:"date it was logged", words:"created creation" },
  { id:"completed", label:"date it closed", words:"completed" },
  { id:"started",   label:"date it started", words:"started" },
  { id:"scripts",   label:"scripts",       words:"script scripts automation automations" },
  { id:"blockedBy", label:"records holding it", words:"blockedby" }
];
const FIELDWORD = (function(){
  const m = {};
  FIELDS.forEach(f => f.words.split(" ").forEach(w => { if (!m[w]) m[w] = f.id; }));
  return m;
})();
const FIELDBY = (function(){ const m = {}; FIELDS.forEach(f => m[f.id] = f); return m; })();

/* "who raised it" and "who is it waiting on" name a field without ever using
   the field's own word */
const FIELD_PHRASE = [
  [/\bwho (?:raised|reported|logged|asked for|requested|sent|opened)\b/, "requester"],
  [/\b(?:raised|reported|logged|requested|sent) by\b/, "requester"],
  [/\bwaiting (?:on|for) (?:whom|who)\b/, "waitOn"],
  [/\bwho is it (?:waiting on|with)\b/, "waitOn"],
  [/\bwhat is it called\b/, "title"],
  [/\btime (?:spent|logged|tracked)\b/, "spent"],
  [/^(?:is|are|was|were|has|have)\b.*\b(?:open|closed|done|blocked|finished|cancelled|canceled|in progress)\b/, "status"],
  [/\bwhat (?:state|stage) (?:is|it)\b/, "status"],
  [/\b(?:how much|how many) (?:time|hours|minutes)\b/, "spent"],
  [/\bhow long\b.{0,24}\b(?:taken|spent|been on)\b/, "spent"],
  [/\bwho\b.{0,24}\bwaiting (?:on|for)\b/, "waitOn"],
  [/\bwaiting (?:on|for)\s*\??\s*$/, "waitOn"],
  [/\bholding it up\b/, "blockedBy"]
];

function readField(ws, norm){
  for (const p of FIELD_PHRASE) if (p[0].test(norm)) return { id:p[1], word:"" };
  for (let i = 0; i < ws.length; i++){
    const vs = variants(ws[i]);
    for (const v of vs){
      const id = FIELDWORD[v];
      if (id) return { id:id, word:ws[i] };
    }
  }
  return null;
}

/* one field, read off one record, as a sentence-ready string. Empty means the
   field is genuinely blank — which is an answer, and a useful one. */
function fieldOf(t, id, api){
  const h = api.h;
  switch (id){
    case "ticket":    return t.ticket || "";
    case "system":    return t.system || "";
    case "type":      return t.type || "";
    case "priority":  return t.priority || "";
    case "status":    return h.stMeta(t.status).label;
    case "title":     return t.title || "";
    case "code":      return t.code || "";
    case "requester": return t.requester || "";
    case "tags":      return (t.tags || []).join(", ");
    case "folder":    return t.folder || "";
    case "estimate":  return t.estimate ? h.mins(t.estimate) : "";
    case "spent":     return h.live(t) ? h.mins(h.live(t)) : "";
    case "due":       return t.due ? h.niceDate(t.due) + (t.dueTime ? " at " + t.dueTime : "") : "";
    case "created":   return t.created ? h.stamp(t.created) : "";
    case "completed": return t.completed ? h.stamp(t.completed) : "";
    case "started":   return t.started ? h.stamp(t.started) : "";
    case "waitOn":    return t.waitOn ? t.waitOn + ", " + h.waitDays(t) + " days so far" : "";
    case "checklist": return (t.checklist || []).length
                             ? (t.checklist.filter(c => c.done).length + " of " + t.checklist.length + " done")
                             : "";
    case "scripts":   return (t.scripts || []).map(sid => {
                        const sc = (api.scripts || []).find(x => x.id === sid);
                        return (sc && (sc.file || sc.name)) || sid;
                      }).join(", ");
    case "blockedBy": return (t.blockedBy || []).map(bid => {
                        const o = (api.tasks || []).find(x => x.id === bid);
                        return o ? o.code : "";
                      }).filter(Boolean).join(", ");
  }
  return "";
}

/* ═══════════════════════════════════════════════════════════════════════════
   MODIFIERS — the part that composes

   "Worst system except others" was answered as if the exclusion had not been
   typed, because the matcher is a classifier: it picks one question out of a
   fixed list, and a list has no room for "…but not that one".

   That is the wrong shape for language. What people actually do is take a
   question and hang conditions off it — except this, only that, more than
   three, longer than a week — and any condition can hang off any question.
   Written as seventy separate intents it is impossible; written once, as
   modifiers that attach to whatever was asked, it is a few hundred lines and
   it works on questions nobody has written yet.

   Three kinds are read here:

     exclude   except / excluding / apart from / other than / not counting …
     only      only / just / limited to / nothing but …
     compare   more than 3 / older than a week / under an hour / at least 5 …

   They are applied in one place, so every answer in the file inherits them.
   ═══════════════════════════════════════════════════════════════════════════ */

const EXCL_1 = {};
("except excepting excluding exclude excl ignoring ignore omitting omit " +
 "minus bar less").split(" ").forEach(w => EXCL_1[w] = 1);
const EXCL_2 = {};
("except for|apart from|other than|aside from|not counting|but not|leaving out|" +
 "save for|besides that|barring the|other then").split("|").forEach(w => EXCL_2[w] = 1);

const ONLY_1 = {};
("only just solely purely exclusively".split(" ")).forEach(w => ONLY_1[w] = 1);
const ONLY_2 = {};
("limited to|restricted to|nothing but|confined to|and only|but only".split("|")).forEach(w => ONLY_2[w] = 1);

/* words that end a list of values — a preposition or a time expression means
   the exclusion has finished and the rest of the sentence has resumed */
const VALUE_STOP = {};
("in on at for from by with during over under before after since until till " +
 "last this next past week weeks month months day days year years today " +
 "yesterday tomorrow please show list give tell me my our").split(" ")
  .forEach(w => VALUE_STOP[w] = 1);

const STATUS_WORD = { open:"open", opened:"open", processing:"processing",
  started:"processing", progress:"processing", blocked:"blocked", held:"blocked",
  done:"done", closed:"done", finished:"done", complete:"done", completed:"done",
  cancelled:"cancelled", canceled:"cancelled", dropped:"cancelled" };

/* Resolve one value sitting after "except" or "only": a system, a person, a
   party, a type, a tag, a priority or a status. Plurals are stripped because
   "except others" means the system called Other. */
function resolveValue(ws, i, lex){
  const tries = [3, 2, 1];
  for (const n of tries){
    if (i + n > ws.length) continue;
    const phrase = ws.slice(i, i + n);
    const bare = phrase.map(w => (w.length > 3 && /s$/.test(w) && !/ss$/.test(w))
      ? w.slice(0, -1) : w);
    for (const t of lex){
      if (t.ws.length !== n) continue;
      let hit = true;
      for (let j = 0; j < n; j++)
        if (t.ws[j] !== phrase[j] && t.ws[j] !== bare[j]) { hit = false; break; }
      if (hit) return { kind:t.kind, value:t.value, len:n };
    }
  }
  const w = ws[i], b = (w.length > 3 && /s$/.test(w)) ? w.slice(0, -1) : w;
  if (/^p[1-4]$/.test(w)) return { kind:"priority", value:w.toUpperCase(), len:1 };
  if (STATUS_WORD[w]) return { kind:"status", value:STATUS_WORD[w], len:1 };
  if (STATUS_WORD[b]) return { kind:"status", value:STATUS_WORD[b], len:1 };
  return null;
}

const CMP_FIELD = {
  day:"age", days:"age", week:"age", weeks:"age", month:"age", months:"age",
  hour:"time", hours:"time", minute:"time", minutes:"time", min:"time", mins:"time",
  time:"time", chase:"chase", chases:"chase", step:"step", steps:"step",
  document:"file", documents:"file", file:"file", files:"file",
  record:"count", records:"count"
};
const CMP_MUL = { day:1, days:1, week:7, weeks:7, month:30, months:30,
                  hour:60, hours:60, minute:1, minutes:1, min:1, mins:1 };
const WORDNUM = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8,
                  nine:9, ten:10, a:1, an:1, couple:2, few:3, several:4, dozen:12 };

function readComparison(ws, norm){
  const OPS = [
    [/\b(?:more|greater|bigger|higher|longer|older|larger)\s+than\b/, ">"],
    [/\b(?:less|fewer|lower|shorter|newer|younger|smaller)\s+than\b/, "<"],
    [/\bat\s+least\b/, ">="], [/\bat\s+most\b/, "<="],
    [/\bover\b/, ">"], [/\bunder\b/, "<"], [/\babove\b/, ">"], [/\bbelow\b/, "<"],
    [/\bbeyond\b/, ">"], [/\bpast\b/, ">"]
  ];
  let op = "", at = -1;
  for (const [re, sign] of OPS){
    const m = norm.match(re);
    if (m && (at < 0 || m.index < at)){ op = sign; at = m.index; }
  }
  if (!op) return null;
  /* the number and unit that follow */
  const tail = norm.slice(at).split(/\s+/).slice(1, 6);
  let n = null, unit = "";
  for (const w of tail){
    if (n == null){
      if (/^\d+(\.\d+)?$/.test(w)) { n = parseFloat(w); continue; }
      if (WORDNUM[w] != null) { n = WORDNUM[w]; continue; }
    } else if (!unit && CMP_FIELD[w]) { unit = w; break; }
  }
  if (n == null) return null;
  const field = unit ? CMP_FIELD[unit] : (/\b(old|open|wait|waiting|late|overdue)\b/.test(norm) ? "age" : "count");
  if (field === "count") return null;          /* "more than 3 records" is not a filter */
  return { op, n: n * (CMP_MUL[unit] || 1), field, unit: unit || "days" };
}

function readModifiers(ws, norm, lex){
  const mods = { exclude:{}, only:{}, cmp:null, used:{}, mask:new Array(ws.length).fill(false),
                 sawTrigger:"", resolvedAny:false };
  const put = (bag, kind, value) => {
    (bag[kind] = bag[kind] || []);
    if (bag[kind].indexOf(value) < 0) bag[kind].push(value);
  };

  for (let i = 0; i < ws.length; i++){
    const one = ws[i], two = one + " " + (ws[i + 1] || "");
    let bag = null, skip = 0;
    if (EXCL_2[two]) { bag = mods.exclude; skip = 2; }
    else if (EXCL_1[one]) { bag = mods.exclude; skip = 1; }
    else if (ONLY_2[two]) { bag = mods.only; skip = 2; }
    else if (ONLY_1[one]) { bag = mods.only; skip = 1; }
    /* "without Imaging" excludes a system; "without a system" is a negation
       and belongs to the other reader, so it only counts here if a real
       value follows it */
    else if (one === "without" || one === "excluding") { bag = mods.exclude; skip = 1; }
    if (!bag) continue;

    mods.sawTrigger = mods.sawTrigger || ws.slice(i, i + skip).join(" ");
    let j = i + skip, took = 0;
    while (j < ws.length && took < 4){
      const w = ws[j];
      if (w === "and" || w === "or" || w === "the" || w === "a" || w === "an"){ j++; continue; }
      if (VALUE_STOP[w]) break;
      const v = resolveValue(ws, j, lex);
      if (!v) break;
      put(bag, v.kind, v.value);
      mods.resolvedAny = true;
      for (let k = 0; k < v.len; k++){ mods.used[ws[j + k]] = 1; mods.mask[j + k] = true; }
      j += v.len; took++;
    }
    if (took) for (let k = 0; k < skip; k++){ mods.used[ws[i + k]] = 1; mods.mask[i + k] = true; }
  }

  mods.cmp = readComparison(ws, norm);
  if (mods.cmp){
    mods.resolvedAny = true;
    /* "more than a week" has been read; leaving those words in play let them
       score for unrelated intents — "records open more than a week" was
       offering to log a record */
    const spent = ("more less greater fewer bigger lower higher shorter longer older newer " +
      "larger smaller than at least most over under above below beyond past " +
      "day days week weeks month months hour hours minute minutes min mins " +
      "one two three four five six seven eight nine ten couple few several dozen").split(" ");
    ws.forEach((w, i) => { if (spent.indexOf(w) >= 0 || /^\d+(\.\d+)?$/.test(w)) mods.mask[i] = true; });
  }
  const any = Object.keys(mods.exclude).length || Object.keys(mods.only).length || mods.cmp;
  return any || mods.sawTrigger ? mods : null;
}

/* ── applying them, in one place, to every answer ────────────────────── */

function fieldValues(t, kind, h){
  switch (kind){
    case "system":   return t.system ? [t.system] : [];
    case "type":     return t.type ? [t.type] : [];
    case "tag":      return t.tags || [];
    case "party":    return t.waitOn ? [t.waitOn] : [];
    case "person":   return h.peopleOf(t) || [];
    case "priority": return t.priority ? [t.priority] : [];
    case "status":   return t.status ? [t.status] : [];
    case "script":   return t.scripts || [];
    default:         return [];
  }
}
function cmpValue(t, field, h){
  switch (field){
    case "age":   return t.created ? (Date.now() - Date.parse(t.created)) / DAY : 0;
    case "time":  return h.live(t) || +t.estimate || 0;
    case "chase": return (t.chases || []).length;
    case "step":  return (t.checklist || []).length;
    case "file":  return (t.files || []).length;
    default:      return 0;
  }
}
function applyMods(list, mods, api){
  if (!mods) return list;
  const h = api.h;
  return list.filter(t => {
    for (const k in mods.exclude){
      const have = fieldValues(t, k, h);
      if (mods.exclude[k].some(v => have.indexOf(v) >= 0)) return false;
    }
    for (const k in mods.only){
      const have = fieldValues(t, k, h);
      if (!mods.only[k].some(v => have.indexOf(v) >= 0)) return false;
    }
    if (mods.cmp){
      const v = cmpValue(t, mods.cmp.field, h), n = mods.cmp.n;
      if (mods.cmp.op === ">"  && !(v >  n)) return false;
      if (mods.cmp.op === ">=" && !(v >= n)) return false;
      if (mods.cmp.op === "<"  && !(v <  n)) return false;
      if (mods.cmp.op === "<=" && !(v <= n)) return false;
    }
    return true;
  });
}
/* said back to you, so a misread condition is visible rather than silent */
function modWords(mods){
  if (!mods) return "";
  const bits = [];
  for (const k in mods.exclude) bits.push("not " + mods.exclude[k].join(" or "));
  for (const k in mods.only) bits.push("only " + mods.only[k].join(" or "));
  if (mods.cmp){
    const c = mods.cmp;
    const amount = c.field === "age" ? Math.round(c.n) + " days"
                 : c.field === "time" ? Math.round(c.n) + " minutes"
                 : c.n + " " + c.field + (c.n === 1 ? "" : "s");
    bits.push((c.op === ">" ? "more than " : c.op === ">=" ? "at least "
             : c.op === "<" ? "under " : "at most ") + amount);
  }
  return bits.join(", ");
}

/* ═══ SLOTS ══════════════════════════════════════════════════════════════
   The concrete things a sentence mentions: a system, a person, a date range,
   a record code. Pulled out first, because knowing that "Imaging" is a system
   and "last week" is a range makes the question underneath much easier to
   read — and because a naked record code is nearly always the whole point of
   the sentence. */

const MONTH = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, sept:8, oct:9, nov:10, dec:11 };
const DOWNAME = { sun:0, sunday:0, mon:1, monday:1, tue:2, tues:2, tuesday:2, wed:3, wednesday:3,
                  thu:4, thur:4, thurs:4, thursday:4, fri:5, friday:5, sat:6, saturday:6 };

/* a window of days, for "how many did I close last week" */
function readRange(norm, h){
  const k = h.today();
  const R = (from, to, label) => ({ from, to, label });
  let m;

  if (/\b(today|so far today|this morning|this afternoon)\b/.test(norm)) return R(k, k, "today");
  if (/\byesterday\b/.test(norm)) { const y = h.addDays(k, -1); return R(y, y, "yesterday"); }
  if (/\btomorrow\b/.test(norm)) { const t = h.addDays(k, 1); return R(t, t, "tomorrow"); }

  if (/\b(this week|the week)\b/.test(norm)) return R(h.mondayOf(k), h.addDays(h.mondayOf(k), 6), "this week");
  if (/\blast week\b/.test(norm)){
    const m0 = h.addDays(h.mondayOf(k), -7);
    return R(m0, h.addDays(m0, 6), "last week");
  }
  if (/\b(next week)\b/.test(norm)){
    const m0 = h.addDays(h.mondayOf(k), 7);
    return R(m0, h.addDays(m0, 6), "next week");
  }
  if (/\bthis month\b/.test(norm)) return R(k.slice(0,7) + "-01", k, "this month");
  if (/\blast month\b/.test(norm)){
    const d = new Date(k.slice(0,4), +k.slice(5,7) - 1, 1);
    d.setMonth(d.getMonth() - 1);
    const s = h.dkey(d);
    const e = h.dkey(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    return R(s, e, "last month");
  }
  if (/\bthis year\b/.test(norm)) return R(k.slice(0,4) + "-01-01", k, "this year");

  if ((m = norm.match(/\b(?:in |over |for |the )?(?:last|past|previous) (\d{1,3}) (day|days|week|weeks|month|months)\b/))){
    const n = +m[1], unit = m[2];
    const days = /^w/.test(unit) ? n * 7 : /^m/.test(unit) ? n * 30 : n;
    return R(h.addDays(k, -(days - 1)), k, "the last " + n + " " + unit);
  }
  if ((m = norm.match(/\b(?:in |over |for )?(?:the )?(?:last|past) (day|week|fortnight|month|year)\b/))){
    const days = { day:1, week:7, fortnight:14, month:30, year:365 }[m[1]];
    return R(h.addDays(k, -(days - 1)), k, "the last " + m[1]);
  }
  if ((m = norm.match(/\bsince (\d{4})-(\d{2})-(\d{2})\b/)))
    return R(m[1] + "-" + m[2] + "-" + m[3], k, "since " + m[1] + "-" + m[2] + "-" + m[3]);
  if ((m = norm.match(/\bin (jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/))){
    const mo = MONTH[m[1]], yr = +k.slice(0,4);
    const s = new Date(yr, mo, 1), e = new Date(yr, mo + 1, 0);
    return R(h.dkey(s), h.dkey(e), m[1]);
  }
  return null;
}

/* a single date, for "due friday" or "remind me tomorrow" */
function readDate(norm, h){
  const k = h.today();
  let m;
  if (/\btoday\b/.test(norm)) return k;
  if (/\btomorrow\b|\btmr\b/.test(norm)) return h.addDays(k, 1);
  if (/\byesterday\b/.test(norm)) return h.addDays(k, -1);
  if ((m = norm.match(/\bin (\d{1,3}) (day|days|week|weeks)\b/)))
    return h.addDays(k, (+m[1]) * (/^w/.test(m[2]) ? 7 : 1));
  if ((m = norm.match(/\b(\d{4})-(\d{2})-(\d{2})\b/))) return m[1] + "-" + m[2] + "-" + m[3];
  if ((m = norm.match(/\b(?:next |on |by |this )?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|rsday|urday)?\b/))){
    const want = DOWNAME[m[1]];
    if (want == null) return "";
    let d = h.addDays(k, 1);
    while (h.dow(d) !== want) d = h.addDays(d, 1);
    return d;
  }
  return "";
}

function readSlots(norm, ws, api, raw0){
  const h = api.h, lex = api.lex, s = {};
  let m;

  /* D-14, d14, #INC0012345 — nearly always the subject of the sentence.
     A code that resolves to nothing is the important case: saying "I have no
     D-000267" is right, and quietly dropping it and answering some other
     question is the worst thing this file could do. */
  const codes = [], missing = [];
  const codeRe = /\b(d-?\s?\d{1,7}|[a-z]{2,6}\d{4,12})\b/g;
  while ((m = codeRe.exec(norm))){
    const raw = m[1].replace(/\s+/g, "");
    const rec = h.findByRef(raw);
    if (rec){ if (codes.indexOf(rec) < 0) codes.push(rec); }
    else if (/^d-?\d/i.test(raw) && missing.indexOf(raw) < 0) missing.push(raw);
  }
  if (codes.length){ s.record = codes[0]; s.records = codes; }
  if (missing.length && !codes.length) s.unknownCode = missing[0].toUpperCase();

  if ((m = norm.match(/\bp\s?([1-4])\b/)) || (m = norm.match(/\bpriority ([1-4])\b/))) s.priority = "P" + m[1];
  if (/\bcritical|urgent\b/.test(norm) && !s.priority) s.priority = "P1";

  if ((m = norm.match(/\b(\d{1,3}(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)\b/))) s.minutes = Math.round(parseFloat(m[1]) * 60);
  else if ((m = norm.match(/\b(\d{1,4})\s*(m|min|mins|minute|minutes)\b/))) s.minutes = +m[1];

  /* "every 30mn" is how it gets typed in a hurry, and mn is not a unit any
     dictionary knows — but it is unmistakably minutes */
  if ((m = norm.match(/\bevery\s*(\d{1,3})\s*(minute|minutes|min|mins|mn|m|hour|hours|hr|hrs|h|day|days|d)\b/))){
    const n = +m[1], u = m[2];
    s.every = /^(h|hr|hour)/.test(u) ? { unit:"hour", n }
            : /^d/.test(u) ? { unit:"day", n } : { unit:"minute", n };
  } else if ((m = norm.match(/\bevery (half an hour|half hour)\b/))){
    s.every = { unit:"minute", n:30 };
  } else if ((m = norm.match(/\bevery (hour|day|morning|minute|weekday|week)\b/))){
    s.every = { unit:m[1] === "morning" ? "day" : m[1] === "weekday" ? "weekday" : m[1], n:1 };
  } else if (/\bhourly\b/.test(norm)) s.every = { unit:"hour", n:1 };
  else if (/\bdaily\b/.test(norm)) s.every = { unit:"day", n:1 };

  /* "from 8 am to 5pm", "between 8 and 17", "8am-5pm" — the hours it should
     actually fire in, which is the difference between a nudge at your desk
     and a nudge at three in the morning */
  const winRe = [
    /\b(?:from|between)\s*(\d{1,2})\s*(am|pm)?\s*(?:to|until|till|-|and|through)\s*(\d{1,2})\s*(am|pm)?\b/,
    /\b(\d{1,2})\s*(am|pm)\s*(?:to|until|till|-)\s*(\d{1,2})\s*(am|pm)\b/
  ];
  for (const re of winRe){
    const w = norm.match(re);
    if (!w) continue;
    const h24 = (v, mer) => {
      let x = +v;
      if (mer === "pm" && x < 12) x += 12;
      if (mer === "am" && x === 12) x = 0;
      /* no meridiem on the closing hour: "8 to 5" means the working day */
      if (!mer && x < 7) x += 12;
      return x;
    };
    const a = h24(w[1], w[2]), b = h24(w[3], w[4]);
    if (a >= 0 && a <= 23 && b >= 0 && b <= 23 && a !== b){ s.window = { from:a, to:b }; break; }
  }

  if ((m = norm.match(/\bat (\d{1,2}):(\d{2})\b/)) && +m[1] < 24 && +m[2] < 60)
    s.time = (m[1].length < 2 ? "0" : "") + m[1] + ":" + m[2];

  /* create me a task named "Drinking water" — whatever is in quotes is the
     name, and nothing else in the sentence is */
  const quoted = String(raw0 || "").match(/["“]([^"”]{2,80})["”]/);
  if (quoted) s.quoted = quoted[1].trim();

  s.mods = readModifiers(ws, norm, lex);
  /* which single field of a record is being asked for, if any */
  s.field = readField(ws, norm);
  /* and which one of whatever comes back */
  s.pick = readPick(ws, norm);
  /* whether there is a list on screen to point at, which is the difference
     between "open the second one" and "what should I do first" */
  s.hasRows = !!(api.convo && api.convo.rows && api.convo.rows.length);
  const d = readDimension(ws, norm);
  s.dim = d.dim; s.dims = d.dims; s.agg = d.agg;
  s.neg = readNegation(norm);

  /* a yes-or-no question deserves a yes or a no before the detail */
  s.yesno = /^(is|are|was|were|do|does|did|have|has|had|can|could|will|would|should|any|anything|am)\b/.test(norm);

  s.range = readRange(norm, h);
  s.date = readDate(norm, h);

  /* What the lexicon recognises — but never a word an exclusion already
     spent. "Excluding Other" was setting the system filter to Other AND
     excluding it, which selects nothing at all. */
  const found = findTerms(ws, lex, null, s.mods ? s.mods.mask : null);
  found.hits.forEach(x => {
    const k = x.term.kind;
    if (!s[k]) s[k] = x.term.value;
    if (k === "person" && !s.personTerm) s.personTerm = x.term.text;
  });
  s._used = found.used;
  s._usedWords = ws.filter((w, i) => found.used[i]);

  /* an explicit status word */
  if (/\bopen\b/.test(norm) && !/\bopen (it|d-|the record)\b/.test(norm)) s.status = "open";
  if (/\bin progress|processing|being worked|started\b/.test(norm)) s.status = "processing";
  if (/\bblocked\b/.test(norm)) s.status = "blocked";
  if (/\bcancelled|canceled\b/.test(norm)) s.status = "cancelled";

  /* whatever is left over is probably free text — a title, or something to
     search for. Words the lexicon claimed are removed so that "log a crash
     for imaging" does not end up titled "crash for imaging". */
  const rest = [];
  ws.forEach((w, i) => { if (!found.used[i]) rest.push(w); });
  s.rest = rest;
  return s;
}

/* ═══ SAYING IT IN WORDS ═════════════════════════════════════════════════
   A fact said the same way every time reads like a form letter, and three
   different questions answered with one identical sentence reads like a
   lookup table — which is what this was.

   So the wording is composed rather than stored. Each situation carries
   several ways of putting it, and which one comes out is decided by a hash
   of what you actually asked plus the numbers involved. The phrasing varies
   naturally between questions and between days, but the same question about
   the same data answers the same way twice — a bot that rewords itself at
   random is unsettling rather than lively.

   Wording varies. Facts never do: every number in every variant comes from
   the same place. */

function hash(s){
  let h = 2166136261;
  s = String(s);
  for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  /* FNV on its own leaves the low bits leaning on the last few characters, and
     every key here ends with the same JSON tail — four different questions all
     landed on variant 0, so nothing varied at all. Avalanche the high bits down
     before anything takes a modulo of it. */
  h ^= h >>> 15; h = Math.imul(h, 2246822519);
  h ^= h >>> 13; h = Math.imul(h, 3266489917);
  h ^= h >>> 16;
  return h >>> 0;
}
/* one of several ways of putting it, chosen by what was asked */
function one(list, key){ return list[hash(key) % list.length]; }
function fill(tpl, v){
  return String(tpl).replace(/\{(\w+)\}/g, function(m, k){
    return (v && v[k] != null) ? String(v[k]) : m;
  });
}
function say(list, v, key){ return fill(one(list, String(key) + "|" + JSON.stringify(v || {})), v); }

function qty(n, noun, plur){
  if (!n) return "no " + (plur || noun + "s");
  if (n === 1) return "one " + noun;
  return n + " " + (plur || noun + "s");
}
function be(n){ return n === 1 ? "is" : "are"; }
function hav(n){ return n === 1 ? "has" : "have"; }
function itThem(n){ return n === 1 ? "it" : "them"; }

/* a human sense of scale, so twelve overdue does not read like two */
function heft(n, small, medium, large){
  return n <= 2 ? small : n <= 6 ? (medium || small) : (large || medium || small);
}
function andList(a, max){
  const l = a.slice(0, max || 3);
  const more = a.length - l.length;
  let s = l.length > 1 ? l.slice(0, -1).join(", ") + " and " + l[l.length - 1] : (l[0] || "");
  if (more > 0) s += ", plus " + more + " more";
  return s;
}
/* durations people actually say out loud */
function span(days){
  const d = Math.round(days);
  if (d <= 0) return "today";
  if (d === 1) return "a day";
  if (d < 14) return d + " days";
  if (d < 60) return Math.round(d / 7) + " weeks";
  return Math.round(d / 30) + " months";
}
function pad2(n){ return String(n).length < 2 ? "0" + n : String(n); }
function minutesWord(m){
  const n = Math.round(m);
  if (n < 60) return n + " minutes";
  const h = Math.round(n / 30) / 2;
  return h === 1 ? "an hour" : h + " hours";
}

/* ═══ TALKING LIKE A PERSON ══════════════════════════════════════════════
   Picking between three fixed sentences is still a lookup table with extra
   rows — you can hear it. What actually makes writing sound human is not
   vocabulary but shape:

     a person leads with the surprising part when there is one;
     they add a detail only if it is worth adding;
     they have a view about what they are telling you;
     they refer back to what was already said;
     and they get terser when the answer is boring.

   So a reply is assembled from up to four pieces — the fact, an observation
   drawn from the same data, a stance, and a link to the conversation — and
   the sentence structure joining them is chosen too, not just the words. When
   there is nothing to observe and no view worth having, it says the fact and
   stops, which is also what a person does. */

/* lower-case an opening word, but never a name, a code or a system */
/* Words safe to lower-case when a clause moves into the middle of a sentence.
   A name, a system or a record code must keep its capital, so anything not on
   this list is left exactly as it was — the contracted forms have to be here
   too, or "You've" comes back capitalised mid-sentence. */
const OPENERS = ["You", "You've", "You're", "That", "That's", "There", "There's",
                 "Nothing", "It", "It's", "I'd", "I've", "Everything", "Every", "All",
                 "Most", "None", "Just", "Only", "Quite", "No", "Two", "Three", "One",
                 "The", "Mostly", "Least", "Well", "Not", "Both", "Some", "Half",
                 "Nobody", "Everyone", "Your", "Its", "This", "These", "Those"];
function lower(s){
  const first = String(s).split(" ")[0].replace(/[^A-Za-z']/g, "");
  if (OPENERS.indexOf(first) < 0 && !/^\d/.test(String(s))) return s;
  return String(s).charAt(0).toLowerCase() + String(s).slice(1);
}
function upper(s){ return String(s).charAt(0).toUpperCase() + String(s).slice(1); }
function trimStop(s){ return String(s || "").replace(/\s*[.]\s*$/, ""); }

/* the fact, plus whatever else is worth saying, in a shape that varies */
function compose(core, obs, stance, link, key){
  const c = trimStop(core);
  /* a core that already carries a dash cannot take a second one — two in a
     sentence reads like a fault rather than a flourish */
  const dashed = c.indexOf("—") >= 0;
  let out;
  if (obs && stance) out = one(dashed
    ? [ c + ". " + upper(trimStop(obs)) + ". " + stance,
        upper(trimStop(obs)) + ". " + c + ". " + stance ]
    : [ c + " — " + lower(trimStop(obs)) + ". " + stance,
        c + ". " + upper(trimStop(obs)) + ". " + stance,
        upper(trimStop(obs)) + ", and " + lower(c) + ". " + stance ], key);
  else if (obs) out = one(dashed
    ? [ c + ". " + upper(trimStop(obs)) + ".",
        upper(trimStop(obs)) + ". " + c + "." ]
    : [ c + " — " + lower(trimStop(obs)) + ".",
        c + ". " + upper(trimStop(obs)) + ".",
        upper(trimStop(obs)) + ", and " + lower(c) + "." ], key);
  else if (stance) out = one(dashed
    ? [ c + ". " + stance ]
    : [ c + ". " + stance, c + " — " + lower(trimStop(stance)) + "." ], key);
  else out = c + ".";
  return out + (link ? " " + link : "");
}

/* Something true about this particular set that the count alone does not say.
   Returns "" when the data is unremarkable, which is most of the time — an
   assistant that finds something profound in every answer is exhausting. */
function observe(list, api, key){
  if (!list || list.length < 2) return "";
  const h = api.h, notes = [];

  const sys = {}, who = {};
  let p1 = 0, oldest = 0, undated = 0, waiting = 0;
  list.forEach(t => {
    if (t.system) sys[t.system] = (sys[t.system] || 0) + 1;
    (h.peopleOf(t) || []).forEach(n => who[n] = (who[n] || 0) + 1);
    if (t.priority === "P1") p1++;
    if (!t.due) undated++;
    if (t.waitOn) waiting++;
    const age = t.created ? (Date.now() - Date.parse(t.created)) / DAY : 0;
    if (age > oldest) oldest = age;
  });

  /* the shape of the set, beyond the count */
  let est = 0, noEst = 0, started = 0, chased = 0, tagged = 0, withFiles = 0, sameDay = 0;
  const days = {};
  list.forEach(t => {
    if (+t.estimate) est += +t.estimate; else noEst++;
    if (t.status === "processing") started++;
    if ((t.chases || []).length) chased++;
    if ((t.tags || []).length) tagged++;
    if ((t.files || []).length) withFiles++;
    const d = h.dayOf(t.created);
    if (d){ days[d] = (days[d] || 0) + 1; if (days[d] > sameDay) sameDay = days[d]; }
  });

  const topSys = Object.keys(sys).sort((a, b) => sys[b] - sys[a])[0];
  if (topSys && sys[topSys] === list.length && list.length > 2)
    notes.push("every one of them is " + topSys);
  else if (topSys && sys[topSys] / list.length >= 0.6)
    notes.push("most of them are " + topSys);

  const topWho = Object.keys(who).sort((a, b) => who[b] - who[a])[0];
  if (topWho && who[topWho] === list.length && list.length > 2)
    notes.push("all of them came from " + topWho);

  if (p1 === 1) notes.push("one of them is a P1");
  else if (p1 > 1) notes.push(p1 + " of them are P1");

  if (oldest > 9) notes.push("the oldest goes back " + span(oldest));
  if (undated && undated === list.length && list.length > 2) notes.push("none of them carry a date");
  else if (undated > 1) notes.push(undated + " of them have no date");
  if (waiting > 1 && waiting === list.length) notes.push("all of them are sitting with someone else");
  else if (waiting > 1) notes.push(waiting + " of them are with someone else");

  if (started === 1 && list.length > 2) notes.push("one of them is already started");
  else if (started > 1) notes.push(started + " of them are already underway");
  if (est && noEst === 0 && list.length > 2)
    notes.push("they add up to about " + h.mins(Math.round(est)));
  else if (noEst === list.length && list.length > 3)
    notes.push("not one of them carries an estimate");
  if (chased && chased === waiting && waiting > 1) notes.push("all of them have been chased at least once");
  if (withFiles > 1 && withFiles === list.length) notes.push("every one has a document on it");
  if (sameDay > 2 && sameDay >= list.length * 0.6)
    notes.push(sameDay + " of them landed on the same day");
  if (Object.keys(sys).length === 1 && list.length > 3 && !topSys)
    notes.push("none of them name a system");

  return notes.length ? one(notes, key) : "";
}

/* A view, where there is one worth having. Silence is the default. */
function stanceFor(n, kind, key){
  if (kind === "overdue"){
    if (n >= 8) return one(["That needs a morning to itself.",
                            "That is a backlog, not a to-do list.",
                            "Worth blocking out time rather than picking at it."], key);
    if (n >= 4) return one(["Worth clearing before anything new comes in.",
                            "I would start there."], key);
    return "";
  }
  if (kind === "load"){
    if (n > 0) return one(["Something wants moving.",
                           "One of those will have to give.",
                           "Worth telling someone now rather than at five."], key);
    return "";
  }
  if (kind === "clear"){
    return one(["Nothing to chase.", "Nothing needs you.", "Enjoy it."], key);
  }
  if (kind === "quiet"){
    return one(["Worth a nudge.", "I would chase that one.", "It will not move on its own.",
                "That one needs poking.", "A short email would move it."], key);
  }
  if (kind === "busy"){
    if (n >= 12) return one(["That is a heavy week.",
                             "Busier than it looks from the count alone.",
                             "Worth flagging if it keeps up."], key);
    return "";
  }
  if (kind === "good"){
    return one(["Good going.", "That is a solid day's work.", "Not bad at all."], key);
  }
  if (kind === "stale"){
    return one(["Worth a decision either way — close it or move it.",
                "Either it matters or it does not; leaving it open helps nobody.",
                "I would pick these up or drop them."], key);
  }
  return "";
}

/* Where this answer sits against the last time you asked the same thing.
   "Still three" is the kind of thing only someone who was listening says. */
function linkClause(A, n){
  const prev = A.before;
  if (prev == null || typeof n !== "number" || typeof prev !== "number") return "";
  const d = n - prev;
  if (d === 0) return one(["Same as when you last asked.",
                           "No change since you asked.",
                           "Unchanged."], A.norm + n);
  if (d > 0) return one([(d === 1 ? "One more" : d + " more") + " than last time.",
                         "Up " + d + " since you asked."], A.norm + n);
  return one([(-d === 1 ? "One fewer" : (-d) + " fewer") + " than last time.",
              "Down " + (-d) + " since you asked."], A.norm + n);
}

/* people write "you've", not "you have" */
/* "you have" only contracts before a participle — "you've closed" is right,
   "you've 9 records" is not — so it is written out where it belongs instead */
/* English will not let you contract a verb that ends its clause. "Ready when
   you are." is right and "Ready when you're." is not English at all, and the
   rule fired on every sentence that finished on one — which was most of the
   friendly ones. So each pair only contracts with a word still to come after
   it. */
const ENDS = "(?=\\s+\\S)";
const SHORTEN = [["you are", "you're"], ["You are", "You're"],
                 ["that is", "that's"], ["That is", "That's"],
                 ["there is", "there's"], ["There is", "There's"],
                 ["it is", "it's"], ["It is", "It's"],
                 ["is not", "isn't"], ["are not", "aren't"],
                 ["has not", "hasn't"], ["have not", "haven't"],
                 ["do not", "don't"], ["does not", "doesn't"],
                 ["will not", "won't"], ["cannot", "can't"],
                 ["I would", "I'd"], ["I have", "I've"]]
  .map(x => [new RegExp("\\b" + x[0] + "\\b" + ENDS, "g"), x[1]]);
function contract(s){
  let out = String(s || "");
  SHORTEN.forEach(r => { out = out.replace(r[0], r[1]); });
  return out;
}

/* ═══ ANSWERING ══════════════════════════════════════════════════════════ */

function row(t, api, sub){
  return { id:t.id, code:t.code, text:t.title, sub:sub || "", kind:"record" };
}
function plural(n, one, many){ return n + " " + (n === 1 ? one : (many || one + "s")); }
function listOf(names, max){
  const a = names.slice(0, max || 3);
  if (names.length > (max || 3)) return a.join(", ") + " and " + (names.length - a.length) + " more";
  return a.length > 1 ? a.slice(0, -1).join(", ") + " and " + a[a.length - 1] : (a[0] || "");
}
function inRange(key, r){ return !r || (key && key >= r.from && key <= r.to); }

function applySlots(list, s, api){
  const h = api.h;
  /* every condition hung off the question, applied once, so an intent written
     years ago inherits a modifier written today */
  list = applyMods(list, s.mods, api);
  return list.filter(t => {
    if (s.system && t.system !== s.system) return false;
    if (s.type && t.type !== s.type) return false;
    if (s.priority && t.priority !== s.priority) return false;
    if (s.tag && (t.tags || []).indexOf(s.tag) < 0) return false;
    if (s.party && t.waitOn !== s.party) return false;
    if (s.person && !(h.peopleOf(t) || []).some(n => n === s.person)) return false;
    return true;
  });
}
/* the words a filter adds to a sentence: "3 open records on Imaging for Sokha" */
function slotWords(s){
  const bits = [];
  if (s.priority) bits.push(s.priority);
  if (s.type) bits.push(String(s.type).toLowerCase());
  if (s.system) bits.push("on " + s.system);
  if (s.person) bits.push("from " + s.person);
  if (s.party) bits.push("with " + s.party);
  if (s.tag) bits.push("tagged " + s.tag);
  return bits.length ? " " + bits.join(" ") : "";
}
function live(api, list){ return (list || api.tasks).filter(t => api.h.LIVE.indexOf(t.status) >= 0); }

const INTENTS = [];
function intent(name, def){ def.name = name; INTENTS.push(def); }

/* ── what should I be doing ───────────────────────────────────────────── */
intent("next", {
  kind:"read", label:"What to do next",
  cues:{ next:7, now:2, should:3, first:4, focus:4, priority:7, start:2, working:2,
         important:3, urgent:2, matters:3, tackle:3, doing:2 },
  phrases:[["what next",8],["do next",8],["work on",11],["should i work",13],
           ["should i do",8],["get on with",6],
           ["most important",6],["where do i start",18],["where to start",18],
           ["what now",6],["what first",10],["top priority",13],["highest priority",13],
           ["biggest priority",13],["most urgent",13]],
  run(A){
    const api = A.api;
    if (!api.ai) return { say:"I need assist.js for that — it holds the ranking." };
    let q = api.ai.queue(api.ctx());
    if (Object.keys(A.slots).some(k => ["system","person","type","priority","party","tag"].indexOf(k) >= 0))
      q = q.filter(x => applySlots([x.task], A.slots, api).length);
    if (!q.length) return { say: say(["Nothing live{w}. Enjoy it.",
                                      "You are clear{w} — nothing open.",
                                      "Nothing open{w} at all."],
                                     { w:slotWords(A.slots) }, A.norm) };
    const top = q[0];
    return {
      say: say(["Start with {code} — {title}.",
                "{code} first: {title}.",
                "I would take {code} — {title}.",
                "Top of the pile is {code}, {title}."],
               { code:top.task.code, title:top.task.title }, A.norm),
      note: top.why.map(w => A.phrase(w)).join(" · "),
      rows: q.slice(1, 6).map(x => row(x.task, api, x.why.map(A.phrase).join(" · "))),
      chips: [{ label:"Open it", act:{ kind:"open", id:top.task.id } },
              { label:"Open the Assist tab", act:{ kind:"view", view:"assist" } }]
    };
  }
});

/* ── overdue, today, this week ────────────────────────────────────────── */
intent("overdue", {
  kind:"read", label:"What is overdue",
  cues:{ overdue:11, late:7, behind:6, missed:5, slipping:8, slipped:8, past:3, due:2, breached:7 },
  phrases:[["past due",8],["running late",6],["over the date",5],["out of time",4]],
  run(A){
    const api = A.api, k = api.h.today();
    const list = applySlots(live(api), A.slots, api)
      .filter(t => t.due && t.due < k)
      .sort((a, b) => a.due < b.due ? -1 : 1);
    if (!list.length) return { count:0, say: compose(
      say(["Nothing is overdue{w}", "You are on top of it{w}", "No overdue work{w}"],
          { w:slotWords(A.slots) }, A.norm),
      "", stanceFor(0, "clear", A.norm), linkClause(A, 0), A.norm) };
    const worst = Math.round((Date.parse(k) - Date.parse(list[0].due)) / DAY);
    return {
      count: list.length,
      say: compose(
        say(list.length === 1
          ? ["One record is overdue{w} — {code}",
             "Just the one{w}: {code} is past its date",
             "{code} is the only thing overdue{w}"]
          : ["{n} records are overdue{w}",
             "You've got {n} past their date{w}",
             "{n} are overdue{w}"],
          { n:list.length, w:slotWords(A.slots), code:list[0].code }, A.norm),
        worst > 5 ? "the oldest by " + span(worst) : observe(list, api, A.norm),
        stanceFor(list.length, "overdue", A.norm),
        linkClause(A, list.length), A.norm),
      note: "",
      rows: list.slice(0, 12).map(t => row(t, api,
        Math.round((Date.parse(k) - Date.parse(t.due)) / DAY) + "d late · " + t.priority)),
      chips: list.length > 1 ? [{ label:"Show them all", act:{ kind:"filter", ids:list.map(t => t.id), label:"Overdue" } }] : []
    };
  }
});
intent("dueToday", {
  kind:"read", label:"Due today",
  cues:{ today:7, due:4, plate:4, agenda:5, schedule:2 },
  phrases:[["due today",12],["on today",11],["for today",10],["my day",7],["on my plate",10],
           ["today's work",8],["what have i got",5]],
  run(A){
    const api = A.api, k = api.h.today();
    const list = applySlots(live(api), A.slots, api).filter(t => t.due && t.due <= k);
    const late = list.filter(t => t.due < k).length;
    if (!list.length) return { count:0, say: compose(
      say(["Nothing is due today{w}", "Your day is clear{w}", "Nothing dated for today{w}"],
          { w:slotWords(A.slots) }, A.norm),
      "", "", linkClause(A, 0), A.norm) };
    return {
      count: list.length,
      say: compose(
        say(["{n} due today or earlier{w}", "You've got {n} on today{w}", "{n} {v} doing today{w}"],
            { n:qty(list.length, "record"), w:slotWords(A.slots),
              v:(list.length === 1 ? "wants" : "want") }, A.norm),
        late ? (late === list.length ? "all of them are already overdue"
                                     : late + " of those " + be(late) + " already late")
             : observe(list, api, A.norm),
        "", linkClause(A, list.length), A.norm),
      note: "",
      rows: list.slice(0, 12).map(t => row(t, api, t.priority + (t.dueTime ? " · " + t.dueTime : ""))),
      chips: [{ label:"Open the Day view", act:{ kind:"view", view:"day" } }]
    };
  }
});
intent("dueWeek", {
  kind:"read", label:"Coming up",
  /* "this week" says when, not what — readRange already takes it as a date
     range, and an intent that scores on it steals every question that happens
     to mention the week: what closed this week, time spent this week, busier
     than this week. */
  cues:{ week:3, upcoming:7, coming:6, ahead:5, soon:5, rest:3, remainder:4 },
  phrases:[["coming up",9],["rest of the week",9],["next few days",8],["week ahead",9],
           ["due this week",13],["due next week",13],["what is coming",10]],
  run(A){
    const api = A.api, k = api.h.today(), end = api.h.addDays(k, 7);
    const list = applySlots(live(api), A.slots, api)
      .filter(t => t.due && t.due >= k && t.due <= end)
      .sort((a, b) => a.due < b.due ? -1 : 1);
    if (!list.length) return { say: say(["Nothing is dated in the next seven days{w}.",
                                        "The week ahead is empty{w}.",
                                        "Nothing scheduled this week{w}."],
                                       { w:slotWords(A.slots) }, A.norm) };
    const byDay = {};
    list.forEach(t => byDay[t.due] = (byDay[t.due] || 0) + 1);
    return {
      say: say(["{n} due in the next seven days{w}.",
                "{n} coming up this week{w}.",
                "The week holds {n}{w}."],
               { n:qty(list.length, "record"), w:slotWords(A.slots) }, A.norm),
      note: Object.keys(byDay).sort().map(d => api.h.niceDate(d) + ": " + byDay[d]).join(" · "),
      rows: list.slice(0, 12).map(t => row(t, api, api.h.niceDate(t.due) + " · " + t.priority)),
      chips: [{ label:"Open the Week view", act:{ kind:"view", view:"week" } }]
    };
  }
});

/* ── searching ────────────────────────────────────────────────────────── */
intent("find", {
  kind:"read", label:"Find records",
  /* show / list / give me are how you want it presented, not what you are
     asking about — they turned up in nearly every question and let the
     catch-all outvote the intent that actually knew the answer */
  /* "records except Other" is a search with a condition on it. Once the
     condition is read and its words are spent, what is left is thin — thin
     enough that "record" scored for the work log and for logging a new one. */
  probe(mw, norm, slots){
    if (!slots.mods) return 0;
    return (slots.mods.cmp || Object.keys(slots.mods.exclude).length ||
            Object.keys(slots.mods.only).length) ? 9 : 0;
  },
  cues:{ find:5, show:2, list:2, search:7, records:4, all:3, get:2,
         related:4, matching:5, containing:6, regarding:5, pull:2, display:2 },
  phrases:[["look for",7],["search for",9],["what do i have",6],["anything about",8],
           ["anything on",10],["anything for",9],["anything with",9],["anything from",8],
           ["records for",7],["records on",7],["stuff on",9]],
  boost:{ system:5, person:5, type:4, tag:5, range:3, party:4, priority:3 },
  run(A){
    const api = A.api, s = A.slots;
    let list = applySlots(api.tasks, s, api);
    if (s.status) list = list.filter(t => t.status === s.status);
    if (s.range) list = list.filter(t => inRange(api.h.dayOf(t.created), s.range));
    const free = s.rest.filter(w => w.length > 2 && !ASKING.has(w)).join(" ");
    if (free && list.length > 6){
      const near = api.h.similar(free, null, 40, 0.25).map(x => x.task.id);
      if (near.length) list = list.filter(t => near.indexOf(t.id) >= 0);
    }
    if (!list.length)
      return { say:"Nothing matches" + slotWords(s) + (s.range ? " in " + s.range.label : "") + "." };
    const openN = list.filter(t => api.h.LIVE.indexOf(t.status) >= 0).length;
    return {
      say: plural(list.length, "record") + slotWords(s) + (s.range ? " in " + s.range.label : "") +
           (openN ? " — " + openN + " still live." : " — all closed."),
      rows: list.slice(0, 12).map(t => row(t, api, api.h.stMeta(t.status).label +
            (t.due ? " · due " + api.h.niceDate(t.due) : ""))),
      chips: [{ label:"Show them all", act:{ kind:"filter", ids:list.map(t => t.id),
                                            label:("Search" + slotWords(s)).trim() } }]
    };
  }
});
intent("record", {
  kind:"read", label:"One record",
  needs:["record"],
  cues:{ status:4, where:3, about:2, going:2, happening:3, tell:3, detail:4, up:1 },
  phrases:[["what is the status",8],["where is",5],["tell me about",8],["what about",5]],
  run(A){
    const api = A.api, t = A.slots.record, h = api.h;
    const bits = [h.stMeta(t.status).label, t.priority];
    if (t.system) bits.push(t.system);
    if (t.due) bits.push("due " + h.niceDate(t.due));
    if (t.waitOn) bits.push("waiting on " + t.waitOn + " for " + h.waitDays(t) + "d");
    if (h.live(t)) bits.push(h.mins(h.live(t)) + " tracked");
    const lastLog = (t.log || []).slice(-1)[0];
    return {
      say: t.code + " — " + t.title,
      note: bits.join(" · ") + (lastLog ? "\nLast entry: " + lastLog.text : ""),
      rows: [],
      chips: [{ label:"Open it", act:{ kind:"open", id:t.id } }]
        .concat(api.h.LIVE.indexOf(t.status) >= 0
          ? [{ label:"Mark it done", act:{ kind:"status", id:t.id, status:"done",
                                           confirm:"Mark " + t.code + " done?" } }] : [])
    };
  }
});

intent("field", {
  kind:"read", label:"One detail",
  eg:"what is the ticket of D-0032",
  needs:["record", "field"],
  cues:{},
  /* This one is a question, never an instruction. "Run the recycle script on
     D-0004" names a record and a field and means neither of them. */
  only(mw, norm, slots){
    return !/^\s*(?:run|log|add|create|mark|close|chase|remind|undo|open|go|start|put|set|attach|remove|delete|make|schedule)\b/.test(norm);
  },
  /* No cue list can carry this: the evidence is that a record and a field were
     both named, which is exactly what a field question is and nothing else.
     The extra when a dimension is named keeps it level with the intents that
     collect the dimension's +9 — "what scripts are on D-0027" is a question
     about D-0027, not about the scripts folder. */
  probe(mw, norm, slots){
    if (!slots.record || !slots.field) return 0;
    return 14 + (slots.dim && slots.dim !== "record" ? 12 : 0);
  },
  run(A){
    const api = A.api, h = api.h, t = A.slots.record, f = A.slots.field;
    const def = FIELDBY[f.id] || { label:f.id };
    const v = fieldOf(t, f.id, api);
    /* Some fields are lists rather than values, and a list you cannot point
       at is half an answer \u2014 "run the second script on it" has to have
       something to count. */
    let rows = [];
    if (f.id === "scripts")
      rows = (t.scripts || []).map((sid, i) => {
        const sc = (api.scripts || []).find(x => x.id === sid) || {};
        return { id:t.id, code:String(i + 1), kind:"script", scriptId:sid,
                 text:sc.file || sc.name || sid, sub:sc.name || "" };
      });
    else if (f.id === "tags")
      rows = (t.tags || []).map((tg, i) => ({ id:t.id, code:String(i + 1), kind:"tag", text:tg, sub:"" }));
    else if (f.id === "blockedBy")
      rows = (t.blockedBy || []).map(bid => {
        const o = (api.tasks || []).find(x => x.id === bid);
        return o ? row(o, api, api.h.stMeta(o.status).label) : null;
      }).filter(Boolean);
    const sub = "\u201c" + t.title + "\u201d \u00b7 " + h.stMeta(t.status).label +
                (t.priority ? " \u00b7 " + t.priority : "") +
                (t.system ? " \u00b7 " + t.system : "");
    const more = [{ label:"Open it", act:{ kind:"open", id:t.id } },
                  { label:"The whole record", act:{ kind:"say", text:"tell me about " + t.code } }];
    if (!v) return {
      say: say(["{code} has no {what} on it.",
                "Nothing is filled in for the {what} on {code}.",
                "{code} \u2014 {what}: nothing recorded."],
               { code:t.code, what:def.label }, A.norm),
      note: sub,
      chips: more
    };
    /* a field's name may be singular or plural \u2014 "the tags is Pool" is the
       sort of thing that makes a sentence read like a form letter, so none of
       these variants puts a verb between the name and the value */
    return {
      say: say(["{code} \u2014 {what}: {v}.",
                "The {what} on {code}: {v}.",
                "{code} carries {v} as its {what}."],
               { code:t.code, what:def.label, v:v }, A.norm),
      note: sub,
      rows: rows,
      chips: more
    };
  }
});

/* ── waiting on other people ──────────────────────────────────────────── */
intent("waiting", {
  kind:"read", label:"What I am waiting on",
  cues:{ waiting:8, wait:6, holding:6, others:3, outside:4, pending:5, blocked:4, stuck:2, them:2 },
  /* not "who" — on its own it is a question about anything at all */
  phrases:[["waiting on",10],["waiting for",10],["who owes me",9],["with someone else",6],
           ["not with me",6],["in someone else's court",8]],
  run(A){
    const api = A.api, h = api.h;
    const list = applySlots(live(api), A.slots, api).filter(t => t.waitOn)
      .sort((a, b) => h.waitDays(b) - h.waitDays(a));
    if (!list.length) return { count:0, say: compose(
      say(["Nothing is sitting with anyone else right now",
           "Nobody owes you anything at the moment",
           "No open waits — it is all with you"], {}, A.norm),
      "", "", linkClause(A, 0), A.norm) };
    const by = {};
    list.forEach(t => (by[t.waitOn] = by[t.waitOn] || []).push(t));
    const parties = Object.keys(by).sort((a, b) => by[b].length - by[a].length);
    return {
      count: list.length,
      say: compose(
        say(["{n} {be} waiting on {who}", "{who} {hav} {n} of yours",
             "You are waiting on {who} — {n} in all"],
            { n:qty(list.length, "record"), be:be(list.length),
              hav:hav(parties.length), who:andList(parties, 4) }, A.norm),
        parties.length === 1 && list.length > 2 ? "all of it with the one party"
          : Math.max.apply(null, list.map(h.waitDays)) > 5
            ? "the longest has been " + span(Math.max.apply(null, list.map(h.waitDays)))
            : "",
        list.some(x => !(x.chases || []).length && h.waitDays(x) > 3)
          ? stanceFor(1, "quiet", A.norm) : "",
        linkClause(A, list.length), A.norm),
      note: parties.map(p => p + ": " + by[p].length + " (longest " +
            Math.max.apply(null, by[p].map(h.waitDays)) + "d)").join(" · "),
      rows: list.slice(0, 12).map(t => row(t, api, t.waitOn + " · " + h.waitDays(t) + "d" +
            ((t.chases || []).length ? " · chased " + t.chases.length + "×" : " · never chased"))),
      chips: [{ label:"Open the chase sheet", act:{ kind:"chaseSheet" } }]
    };
  }
});
intent("quietest", {
  kind:"read", label:"Longest wait",
  cues:{ longest:5, quiet:7, silent:7, slowest:7, ignoring:6, forgotten:4 },
  phrases:[["gone quiet",10],["longest wait",10],["waiting longest",10],["heard nothing",8],
           ["not replied",8],["no reply",8]],
  run(A){
    const api = A.api, h = api.h;
    const list = live(api).filter(t => t.waitOn).sort((a, b) => h.waitDays(b) - h.waitDays(a));
    if (!list.length) return { say:"Nothing is waiting on anyone." };
    const t = list[0];
    return {
      say: say(["{who} has had {code} for {days} — the longest of any.",
                "{who} is the quiet one: {days} on {code}.",
                "Longest wait is {code}, {days} with {who}."],
               { who:t.waitOn, code:t.code, days:span(h.waitDays(t)) }, A.norm),
      note: (t.chases || []).length ? "Chased " + t.chases.length + " times, last " + h.chaseDays(t) + "d ago."
                                    : "Never chased.",
      rows: list.slice(1, 8).map(x => row(x, api, x.waitOn + " · " + h.waitDays(x) + "d")),
      chips: [{ label:"Chase " + t.waitOn, act:{ kind:"chase", id:t.id,
                                                 confirm:"Log a chase to " + t.waitOn + " on " + t.code + "?" } },
              { label:"Open it", act:{ kind:"open", id:t.id } }]
    };
  }
});

/* ── how the work behaves ─────────────────────────────────────────────── */
intent("howLong", {
  kind:"read", label:"How long it takes",
  cues:{ long:6, take:6, takes:6, usually:6, typically:6, average:7, normally:6,
         duration:6, quick:3, estimate:5, expect:5 },
  phrases:[["how long",10],["how much time",9],["usually take",10],["on average",8],
           ["should it take",8],["will it take",8]],
  run(A){
    const api = A.api, h = api.h, s = A.slots;
    const subject = s.record ? s.record.title : s.rest.join(" ");
    if (subject && subject.length > 3){
      const g = h.estimateFor(subject);
      if (g) return { say: say(["About {t}, going by {n} you have closed.",
                                "{t} or so — that is the median of {n}.",
                                "Past ones took about {t}, across {n}."],
                               { t:h.mins(g.minutes), n:plural(g.n, "similar record") }, A.norm) };
    }
    const pool = applySlots(api.tasks, s, api)
      .filter(t => t.status === "done" && t.created && t.completed);
    if (pool.length < 3)
      return { say:"Not enough closed records" + slotWords(s) + " to say — I need at least three." };
    const hrs = pool.map(t => (Date.parse(t.completed) - Date.parse(t.created)) / 3600000)
                    .filter(x => x >= 0).sort((a, b) => a - b);
    const med = hrs[hrs.length >> 1];
    const worked = pool.map(h.live).filter(x => x > 0);
    return {
      say: say(["Typically {t} from opening to closing{w}, across {n}.",
                "About {t} start to finish{w} — that is the middle of {n}.",
                "{t} is the usual{w}, measured over {n}."],
               { t:(med < 24 ? Math.round(med) + "h" : Math.round(med / 24) + "d"),
                 w:slotWords(s), n:plural(pool.length, "record") }, A.norm),
      note: worked.length >= 3
        ? "Hands-on time is a different number: about " +
          h.mins(Math.round(worked.slice().sort((a,b)=>a-b)[worked.length >> 1])) + " of tracked work."
        : "",
      rows: []
    };
  }
});
intent("closed", {
  kind:"read", label:"What I closed",
  cues:{ closed:7, finished:6, completed:6, cleared:6, shipped:4, resolved:6, achieved:4,
         got:2, done:6 },
  phrases:[["did i close",10],["have i closed",10],["did i finish",10],["got done",13],
           ["get done",13],["did i get done",14],["how many did i",7],
           ["how much did i get",13],["was i productive",8],["did i achieve",10]],
  boost:{ range:4 },
  run(A){
    const api = A.api, h = api.h, s = A.slots;
    const r = s.range || { from:h.today(), to:h.today(), label:"today" };
    const list = applySlots(api.tasks, s, api)
      .filter(t => t.status === "done" && inRange(h.dayOf(t.completed), r));
    const tracked = list.reduce((n, t) => n + h.live(t), 0);
    if (!list.length) return { count:0, say: say(["Nothing closed {when}{w}.",
                                        "You did not close anything {when}{w}.",
                                        "Nothing went out {when}{w}."],
                                       { when:r.label, w:slotWords(s) }, A.norm) };
    return {
      count: list.length,
      say: compose(
        say(["You closed {n} {when}{w}", "{n} went out {when}{w}",
             "{when}: {n} closed{w}", "{n} finished {when}{w}"],
            { n:qty(list.length, "record"), when:r.label, w:slotWords(s) }, A.norm),
        observe(list, api, A.norm),
        tracked > 240 ? "That is " + h.mins(Math.round(tracked)) + " of tracked work."
                      : list.length >= 8 ? stanceFor(list.length, "good", A.norm) : "",
        linkClause(A, list.length), A.norm),
      note: tracked ? h.mins(Math.round(tracked)) + " of tracked time against them." : "",
      rows: list.slice(0, 12).map(t => row(t, api, h.niceDate(h.dayOf(t.completed)) +
            (h.live(t) ? " · " + h.mins(h.live(t)) : ""))),
      chips: [{ label:"Show them", act:{ kind:"filter", ids:list.map(t => t.id), label:"Closed " + r.label } }]
    };
  }
});
intent("opened", {
  kind:"read", label:"What came in",
  cues:{ opened:6, raised:7, came:5, arrived:5, logged:5, new:4, created:5, incoming:6 },
  phrases:[["came in",9],["how many came",9],["did i log",8],["was raised",8],["landed on me",8]],
  boost:{ range:4 },
  run(A){
    const api = A.api, h = api.h, s = A.slots;
    const r = s.range || { from:h.today(), to:h.today(), label:"today" };
    const list = applySlots(api.tasks, s, api).filter(t => inRange(h.dayOf(t.created), r));
    if (!list.length) return { count:0, say: say(["Nothing came in {when}{w}.",
                                        "A quiet one — nothing arrived {when}{w}.",
                                        "No new work {when}{w}."],
                                       { when:r.label, w:slotWords(s) }, A.norm) };
    const stillOpen = list.filter(t => h.LIVE.indexOf(t.status) >= 0).length;
    return {
      count: list.length,
      say: compose(
        say(["{n} came in {when}{w}", "{when} brought {n}{w}", "{n} landed on you {when}{w}"],
            { n:qty(list.length, "record"), when:r.label, w:slotWords(s) }, A.norm),
        observe(list, api, A.norm), stanceFor(list.length, "busy", A.norm),
        linkClause(A, list.length), A.norm),
      note: stillOpen + " of them " + (stillOpen === 1 ? "is" : "are") + " still live.",
      rows: list.slice(0, 12).map(t => row(t, api, h.stMeta(t.status).label +
            (t.system ? " · " + t.system : ""))),
      chips: [{ label:"Show them", act:{ kind:"filter", ids:list.map(t => t.id), label:"Raised " + r.label } }]
    };
  }
});
intent("worstSystem", {
  kind:"read", dim:"system", label:"Worst system",
  cues:{ system:5, systems:6, worst:8, trouble:7, breaks:7, breaking:7, failing:7,
         problem:5, painful:6, noisiest:8, misbehaving:8 },
  phrases:[["which system",10],["most trouble",10],["gives me the most",9],["biggest problem",8],
           ["what breaks",9],["always breaking",9]],
  run(A){
    const api = A.api, h = api.h, s = A.slots;
    const r = s.range;
    const c = {};
    applySlots(api.tasks, s, api).forEach(t => {
      if (!t.system) return;
      if (r && !inRange(h.dayOf(t.created), r)) return;
      c[t.system] = (c[t.system] || 0) + 1;
    });
    const rank = Object.keys(c).sort((a, b) => c[b] - c[a]);
    if (!rank.length) return { say:"No record carries a system yet." };
    const tot = rank.reduce((n, k) => n + c[k], 0);
    return {
      say: say(["{sys} — {n}{when}, {pct}% of everything with a system on it.",
                "{sys}, easily: {n}{when}. That is {pct}% of the lot.",
                "{sys} gives you the most trouble — {n}{when}, {pct}% of the total."],
               { sys:rank[0], n:qty(c[rank[0]], "record"),
                 when:(r ? " in " + r.label : ""),
                 pct:Math.round(c[rank[0]] / tot * 100) }, A.norm),
      note: rank.slice(1, 6).map(k => k + " " + c[k]).join(" · "),
      rows: [],
      chips: [{ label:"Show " + rank[0], act:{ kind:"filterSys", system:rank[0] } },
              { label:"Open Insight", act:{ kind:"view", view:"insight" } }]
    };
  }
});
intent("topPerson", {
  kind:"read", dim:"person", label:"Who asks the most",
  cues:{ raises:7, asks:6, requester:7, people:5, person:5, asking:6, sends:5 },
  phrases:[["who raises",10],["who asks",10],["who sends me",10],["comes from who",8],
           ["which person",9],["who gives me",9],["raises the most",13],["asks the most",13],
           ["sends me the most",13],["top requester",13],["most requests",12]],
  run(A){
    const api = A.api, h = api.h, s = A.slots, r = s.range;
    const c = {};
    applySlots(api.tasks, s, api).forEach(t => {
      if (r && !inRange(h.dayOf(t.created), r)) return;
      (h.peopleOf(t) || []).forEach(n => c[n] = (c[n] || 0) + 1);
    });
    const rank = Object.keys(c).sort((a, b) => c[b] - c[a]);
    if (!rank.length) return { say:"No record has a name on it yet." };
    return {
      say: say(["{who} — {n}{when}.",
                "{who}, with {n}{when}.",
                "Most of it comes from {who}: {n}{when}."],
               { who:rank[0], n:qty(c[rank[0]], "record"),
                 when:(r ? " in " + r.label : "") }, A.norm),
      note: rank.slice(1, 6).map(k => k + " " + c[k]).join(" · "),
      rows: [],
      chips: [{ label:"Show " + rank[0] + "'s records", act:{ kind:"filterWho", who:rank[0] } }]
    };
  }
});
intent("solvedBefore", {
  kind:"read", label:"Have I seen this before",
  cues:{ before:10, previously:9, again:5, similar:8, same:4, handled:7, solved:7,
         fixed:6, seen:6, encountered:7, familiar:7 },
  phrases:[["seen this before",10],["done this before",10],["fixed this before",10],
           ["how did i fix",10],["last time",8],["have i had this",9],["what did i do",7]],
  run(A){
    const api = A.api, h = api.h, s = A.slots;
    /* The words the lexicon claimed are stripped for filtering, but here the
       system name is part of what to look for: "an imaging pool crash" without
       "imaging" matches almost nothing. Search the sentence itself, with the
       question stripped off the front, and let the tokeniser drop the rest. */
    const subject = s.record ? s.record.title
      : A.raw.replace(/^\s*(have|has|had|did|do|does|can|could|would|will|is|are|was|were)\s+(i|we|you|it|this|that)\b\s*/i, "")
             .replace(/\b(ever|before|previously|again|last time|in the past)\b/gi, " ")
             .replace(/^\s*(fixed|fix|seen|see|handled|handle|solved|solve|done|had|hit|got)\b\s*/i, "")
             .replace(/\s+/g, " ").trim();
    if (!subject || subject.length < 4)
      return { say:"Tell me what it is and I will look — \"have I fixed an imaging pool crash before?\"" };
    const near = h.similar(subject, s.record ? s.record.id : null, 8, 0.3)
      .filter(x => x.task.status === "done");
    if (!near.length) return { say: say(["Nothing closed looks like that — it would be a first.",
                                        "No, this one is new to you.",
                                        "Nothing in your history matches it."], {}, A.norm) };
    const best = near[0].task;
    const sc = (best.scripts || []).map(id => (api.scripts.find(x => x.id === id) || {}).file)
      .filter(Boolean);
    return {
      say: say(["Yes — {code}, {title}.",
                "You have: {code}, {title}.",
                "Once before — {code}, {title}."],
               { code:best.code, title:best.title }, A.norm),
      note: (sc.length ? "Fixed by running " + sc.join(", ") + ". " : "") +
            (String(best.notes || "").trim() ? "It carries notes." : "") +
            (best.completed ? " Closed " + h.niceDate(h.dayOf(best.completed)) + "." : ""),
      rows: near.slice(1, 6).map(x => row(x.task, api, Math.round(x.score * 100) + "% match")),
      chips: [{ label:"Open " + best.code, act:{ kind:"open", id:best.id } }]
    };
  }
});
intent("stalled", {
  kind:"read", label:"What has stopped moving",
  cues:{ stuck:8, stalled:9, moving:6, idle:7, sitting:6, forgotten:7, dragging:7,
         rotting:7, languishing:7, neglected:7 },
  phrases:[["not moving",10],["gone stale",9],["been sitting",9],["dropped the ball",8],
           ["falling through",8],["losing track",7]],
  run(A){
    const api = A.api, h = api.h;
    if (api.ai){
      const cards = api.ai.brief(api.ctx()).cards.filter(c => c.kind === "stalled");
      if (cards.length) return {
        say: say(["{n} {hav} stopped moving.",
                  "{n} {be} going nowhere.",
                  "{n} {hav} gone quiet on you."],
                 { n:qty(cards.length, "record"), hav:hav(cards.length), be:be(cards.length) }, A.norm),
        rows: cards.map(c => {
          const t = api.tasks.find(x => x.id === c.ids[0]);
          return t ? row(t, api, A.phrase(c.why[0])) : null;
        }).filter(Boolean),
        chips: [{ label:"Open the Assist tab", act:{ kind:"view", view:"assist" } }]
      };
    }
    const k = h.today();
    const old = live(api).filter(t => !t.waitOn &&
      (Date.parse(k) - Date.parse(t.created)) / DAY > 7).sort((a, b) => a.created < b.created ? -1 : 1);
    if (!old.length) return { say: say(["Nothing has been sitting untouched.",
                                       "Everything open is recent.",
                                       "No stale work."], {}, A.norm) };
    return { say: plural(old.length, "record") + " open more than a week.",
             rows: old.slice(0, 10).map(t => row(t, api,
               Math.round((Date.parse(k) - Date.parse(t.created)) / DAY) + "d old")) };
  }
});
intent("brief", {
  kind:"read", label:"Anything I should know",
  cues:{ know:5, wrong:6, attention:7, happening:6, going:3, summary:7,
         update:5, brief:8, situation:11, overview:9, anything:4, roundup:11, digest:10 },
  phrases:[["worth knowing",12],["worth a look",11],
           ["what is going on",10],["anything i should know",10],["how are things",9],
           ["anything wrong",10],["catch me up",10],["give me a summary",10],["state of play",9]],
  run(A){
    const api = A.api;
    if (!api.ai) return { say:"I need assist.js for that — it holds the detectors." };
    const b = api.ai.brief(api.ctx());
    if (!b.cards.length)
      return { say: say(["Nothing worth interrupting you for.",
                         "All quiet.",
                         "Nothing that needs you right now."], {}, A.norm),
               note:"Working from " + qty(b.records, "record") + "." };
    return {
      say: say(b.cards.length === 1
             ? ["One thing.", "Just the one thing.", "One thing worth knowing."]
             : ["{n} things.", "{n} worth knowing.", "{n} things caught my eye."],
             { n:b.cards.length }, A.norm),
      note: b.cards.slice(0, 5).map(c => "· " + A.phrase(c.title) + " — " + A.phrase(c.body)).join("\n"),
      chips: [{ label:"Open the Assist tab", act:{ kind:"view", view:"assist" } }]
    };
  }
});
intent("workload", {
  kind:"read", label:"How loaded I am",
  cues:{ busy:7, load:7, fit:6, room:6, capacity:8, overloaded:9, enough:5, swamped:8,
         manageable:7, realistic:6, left:3 },
  phrases:[["how busy",10],["will it fit",9],["too much",8],["can i finish",9],
           ["enough time",9],["how loaded",10],["am i overbooked",10]],
  run(A){
    const api = A.api, h = api.h, k = h.today();
    const due = live(api).filter(t => t.due && t.due <= k && !t.waitOn);
    if (!due.length) return { count:0, yes:true, say: say(["Nothing dated today. The day is yours.",
                                       "Today is empty — nothing promised.",
                                       "No commitments today."], {}, A.norm) };
    let known = 0;
    const need = due.reduce((n, t) => {
      if (+t.estimate){ known++; return n + Math.max(0, +t.estimate - h.live(t)); }
      const g = h.estimateFor(t.title);
      return n + (g ? g.minutes : 30);
    }, 0);
    const d = new Date();
    const left = Math.max(0, (17 * 60 + 30) - (d.getHours() * 60 + d.getMinutes()));
    return {
      count: due.length,
      /* the question "can I finish today" is about the hours, not the count */
      yes: need <= left,
      say: compose(
        say(["{n} dated today, about {need} of work, and {left} before 17:30",
             "{need} of work against {left} of day — {n} on the list",
             "You've got {left} left and about {need} promised, over {n}"],
            { n:qty(due.length, "record"), need:h.mins(Math.round(need)), left:h.mins(left) }, A.norm),
        "", need > left ? stanceFor(1, "load", A.norm) : "", "", A.norm),
      note: need > left ? "That is " + h.mins(Math.round(need - left)) + " more than the day holds — " +
                          "something wants moving." + (known < due.length
                            ? " (" + (due.length - known) + " of those are guessed from past jobs.)" : "")
                        : "It fits, with " + h.mins(Math.round(left - need)) + " to spare.",
      rows: due.slice(0, 10).map(t => row(t, api, (+t.estimate ? h.mins(t.estimate) : "no estimate") +
            " · " + t.priority))
    };
  }
});
intent("timeSpent", {
  kind:"read", label:"Time tracked",
  cues:{ spent:8, tracked:8, hours:6, logged:4, clocked:8, effort:7, timesheet:8 },
  phrases:[["how much time",9],["time spent",12],["hours on",9],["how long have i spent",12],
           ["hours logged",12],["time logged",12],["time tracked",12],["effort on",10],
           ["hours this",10],["time this",10]],
  run(A){
    const api = A.api, h = api.h, s = A.slots;
    if (s.record)
      return { say: s.record.code + " has " + (h.live(s.record) ? h.mins(h.live(s.record)) : "no time") +
                    " tracked against it." +
                    (s.record.estimate ? " Estimated " + h.mins(s.record.estimate) + "." : "") };
    const r = s.range;
    const pool = applySlots(api.tasks, s, api)
      .filter(t => !r || inRange(h.dayOf(t.completed) || h.dayOf(t.created), r));
    const total = pool.reduce((n, t) => n + h.live(t), 0);
    if (!total) return { say:"No time is tracked" + slotWords(s) + (r ? " in " + r.label : "") + "." };
    const top = pool.filter(t => h.live(t) > 0).sort((a, b) => h.live(b) - h.live(a));
    return {
      say: h.mins(Math.round(total)) + " tracked" + slotWords(s) + (r ? " in " + r.label : "") +
           ", across " + plural(top.length, "record") + ".",
      rows: top.slice(0, 8).map(t => row(t, api, h.mins(h.live(t))))
    };
  }
});
intent("count", {
  kind:"read", label:"How many",
  /* "how many overdue" is a question about overdue work, and every one of
     those answers opens with its own count — so counting is only the question
     when nothing else in the sentence is. That is exactly testable: if the
     rest of the sentence is only filters, counting IS the question. */
  probe(mw, norm, slots){
    if (!/^how many\b|^what is the (?:count|total|number)\b/.test(norm)) return 0;
    const spent = {};
    (slots._usedWords || []).forEach(w => spent[w] = 1);
    if (slots.mods) for (const w in slots.mods.used) spent[w] = 1;
    const rest = mw.filter(w => !spent[w] && !ALWAYS_READ[w] && !NOISE.has(w) &&
                                !ASKING.has(w) && !/^p[1-4]$/.test(w) &&
                                !STATUS_WORD[w] && !DIMWORD[w] &&
                                ["many", "count", "total", "number", "altogether"].indexOf(w) < 0);
    return rest.length ? 0 : 10;
  },
  cues:{ many:4, count:9, number:5, total:7, how:2 },
  phrases:[["how many",4],["what is the count",9],["number of",7],["in total",12],
           ["altogether",12],["the tally",12],["all in",9],["grand total",13]],
  run(A){
    const api = A.api, h = api.h, s = A.slots;
    let list = applySlots(api.tasks, s, api);
    if (s.status) list = list.filter(t => t.status === s.status);
    if (s.range) list = list.filter(t => inRange(h.dayOf(t.created), s.range));
    const c = {};
    list.forEach(t => c[t.status] = (c[t.status] || 0) + 1);
    return {
      count: list.length,
      say: say(["{n}{w}{st}{when}.",
                "That comes to {n}{w}{st}{when}.",
                "I count {n}{w}{st}{when}."],
               { n:qty(list.length, "record"), w:slotWords(s),
                 st:(s.status ? " with status " + h.stMeta(s.status).label : ""),
                 when:(s.range ? " in " + s.range.label : "") }, A.norm),
      note: Object.keys(c).map(k => h.stMeta(k).label + " " + c[k]).join(" · "),
      chips: list.length ? [{ label:"Show them", act:{ kind:"filter", ids:list.map(t => t.id),
                                                       label:("Count" + slotWords(s)).trim() } }] : []
    };
  }
});
intent("scripts", {
  kind:"read", dim:"script", label:"My scripts",
  cues:{ script:11, scripts:12, automation:9, automations:11, bat:6, batch:10, batches:11,
         tools:5, tooling:10, runnable:7, macros:10, executables:11 },
  phrases:[["what scripts",10],["which scripts",10],["can i run",7],["what can i automate",9]],
  run(A){
    const api = A.api;
    if (!api.scripts.length) return { say:"No scripts in the workspace yet — they live in the scripts folder." };
    const least = A.slots.agg === "least";
    const sorted = api.scripts.slice().sort((a, b) =>
      least ? (a.uses || 0) - (b.uses || 0) : (b.uses || 0) - (a.uses || 0));
    /* asked which one, answer which one — not how many there are */
    if (A.slots.agg && sorted.length > 1){
      const first = sorted[0];
      return {
        say: say(least
          ? ["{f} — you have barely touched it, {n}.",
             "Least used is {f}: {n}.",
             "{f}, run {n}."]
          : ["{f} — {n}, more than any other.",
             "{f} is the one you reach for: {n}.",
             "Most used by far: {f}, {n}."],
          { f:first.file, n:(first.uses || 0) + " run" + ((first.uses || 0) === 1 ? "" : "s") },
          A.norm),
        note: sorted.slice(0, 8).map(x => x.file + " " + (x.uses || 0)).join(" · "),
        chips:[{ label:"Open the Scripts panel", act:{ kind:"panel", panel:"scripts" } }]
      };
    }
    return {
      count: api.scripts.length,
      say: say(["{n} in the workspace.",
                "You have {n} to hand.",
                "{n}, most-used first."],
               { n:qty(api.scripts.length, "script") }, A.norm),
      rows: sorted.slice(0, 12).map(s => ({ id:null, code:s.file,
        text:s.name || s.file, sub:(s.uses || 0) + " runs" + (s.desc ? " · " + s.desc : "") })),
      chips: [{ label:"Open the Scripts panel", act:{ kind:"panel", panel:"scripts" } }]
    };
  }
});
intent("routines", {
  kind:"read", dim:"routine", label:"My schedules",
  cues:{ routine:11, routines:12, schedule:9, schedules:11, scheduled:9, recurring:11,
         cron:10, cronjob:11, cronjobs:11, timers:10, repeat:6, automatic:6 },
  phrases:[["what routines",10],["what is scheduled",10],["what runs automatically",10],
           ["my schedules",10],["what repeats",9]],
  run(A){
    const api = A.api;
    if (!api.routines.length) return { say: say(["No schedules yet.",
                                                "Nothing runs on a schedule so far.",
                                                "You have not set any up."], {}, A.norm) };
    return {
      count: api.routines.length,
      say: say(["{n} set up.",
                "{n} running.",
                "You have {n}."],
               { n:qty(api.routines.length, "schedule") }, A.norm),
      rows: api.routines.map(r => ({ id:null, code:r.paused ? "paused" : "on",
        text:r.title, sub:(r.freq === "cron" ? "cron " + r.cron : r.freq) +
             (r.remind ? " · reminds" : "") + ((r.scripts || []).length ? " · runs a script" : "") })),
      chips: [{ label:"Open Routines", act:{ kind:"panel", panel:"routine" } }]
    };
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   WHAT THE JOB IS MADE OF

   Everything else in this file reads your records. This part is the only
   thing here that is not about you: it is what an application-support
   engineer runs into, and what is worth checking first.

   Three rules kept it honest while writing it:

     it says what to CHECK, never what the answer is — your estate is not
     mine to guess at, and a confident wrong cause costs more than no cause;
     where you have solved the same thing before, your own history leads and
     this is only the fallback;
     nothing here touches a system. It is a checklist, not a runbook that
     runs.

   Each entry is symptoms, first checks, the usual causes, and what to
   capture while the evidence is still there — that last one matters most,
   because the log you did not take is the one the vendor asks for.
   ═══════════════════════════════════════════════════════════════════════════ */

const KB = {};
/* Only distinctive words are worth matching on. "by one cent … do not match"
   in an entry's word list meant the word "not" selected it, and a question
   about premiums came back about rounding. Filler is stripped at load rather
   than left to be noticed one entry at a time. */
function kb(id, words, o){
  o.id = id;
  o.words = String(words).split(/\s+/)
    .filter(w => w.length > 2 && !NOISE.has(w) && !ASKING.has(w))
    .join(" ");
  KB[id] = o;
}

/* ── platform and Windows ────────────────────────────────────────────── */

kb("apppool", "app pool application pool iis pool worker process w3wp recycle recycling 503 502 site down",
{ name:"An application pool that has stopped or keeps recycling",
  signs:["The site returns 503 Service Unavailable, or 502 from a proxy in front of it",
         "w3wp.exe is missing from Task Manager, or pinned at 100% CPU",
         "Requests hang and then time out rather than failing quickly"],
  check:["Is the pool actually started? IIS Manager → Application Pools — a crashed pool shows Stopped",
         "Event Viewer → Windows Logs → Application, filtered to the minute it went down. Look for the faulting module name",
         "Event Viewer → System for WAS events 5009 / 5011 — those name the pool and say it terminated",
         "The pool's Rapid-Fail Protection: five crashes in five minutes stops it and it stays stopped",
         "Recycling settings — a memory limit or a fixed schedule will look like a crash to a user"],
  causes:["An unhandled exception introduced by the last deployment",
          "A private-memory or virtual-memory limit reached, so WAS recycled it",
          "The identity's password rotated and the pool can no longer start",
          "A dependency it calls at startup — a database, a share, a certificate — is unavailable"],
  capture:["The Event ID, the faulting module and the exception type from the application log",
           "The exact minute it stopped, so it can be lined up against a deployment or a batch",
           "Whether it recovered by itself or needed starting"],
  note:"Starting the pool clears the symptom in seconds and destroys nothing — but the event log is the only thing that says why, and it rolls. Take that first." });

kb("service", "windows service will not start service stopped stuck starting sc net start",
{ name:"A Windows service that will not start",
  signs:["Error 1053: the service did not respond to the start request in a timely fashion",
         "It starts and stops immediately",
         "Error 1069: the service did not start due to a logon failure"],
  check:["Event Viewer → Application and System at the moment of the attempt",
         "The service's Log On account — 1069 is almost always a rotated or expired password",
         "Whether the executable path still exists and the account can read it",
         "Dependencies tab — a service it needs may itself be stopped",
         "Try starting it from an elevated command prompt to see the error directly"],
  causes:["Service account password changed or expired",
          "A config file it reads at startup is missing, malformed, or newly locked down",
          "A .NET or runtime version it needs was removed by patching",
          "It is genuinely slow to start and is hitting the 30-second timeout"],
  capture:["The exact error number and the event",
           "Which account it runs as",
           "Whether it ever started since the last reboot or patch window"],
  note:"1053 with a service that works fine when run interactively usually means it is waiting on something the service account cannot reach." });

kb("disk", "disk full no space left drive full c drive storage space cleanup",
{ name:"A disk that has filled up",
  signs:["Writes fail, logs stop, the database goes read-only or refuses connections",
         "Backups fail without an obvious error",
         "The application behaves oddly rather than failing cleanly"],
  check:["Which drive, and how much is actually free right now",
         "The usual offenders: SQL transaction logs, IIS logs under inetpub\\logs, Windows temp, application temp folders, old deployment folders",
         "Whether something is writing fast — a runaway log level, a loop dumping to disk",
         "Shadow copies and Windows Update leftovers on an older server"],
  causes:["A log left at Debug after troubleshooting",
          "A transaction log that cannot truncate because a backup chain broke",
          "Someone copied a large file to the server and left it",
          "Growth over months that nobody was watching"],
  capture:["Free space before and after anything you delete",
           "What you deleted and where it was — this matters for the change record",
           "The growth rate if you can see it, so the fix can be permanent"],
  note:"Deleting to get out of trouble is fine and usually necessary. Deleting without writing down what you removed is how the next person loses a day." });

kb("cpu", "high cpu server slow 100 percent cpu spike load performance sluggish",
{ name:"A server sitting at high CPU",
  signs:["Everything on the box is slow, not just one application",
         "Requests queue and time out under load that used to be fine"],
  check:["Which process — Task Manager sorted by CPU, or Resource Monitor for more detail",
         "Whether it is one thread or all of them",
         "If it is w3wp, which application pool: the PID maps to a pool in IIS Manager",
         "If it is sqlservr, look at the query side rather than the box",
         "Whether it started at a particular minute — that usually points at a deployment or a job"],
  causes:["A query without an index doing a scan under load",
          "An infinite or near-infinite loop in a recent change",
          "Antivirus scanning a folder it should be excluding",
          "Genuine load — more users than the box was sized for"],
  capture:["Process name, PID and sustained percentage",
           "A memory dump if it is reproducible and you have somewhere to send it",
           "The start time"],
  note:"High CPU with a clear start time is a change. High CPU that crept up over weeks is capacity." });

kb("memory", "memory leak out of memory oom high ram outofmemoryexception paging",
{ name:"Memory climbing until something breaks",
  signs:["OutOfMemoryException in the log",
         "The process grows steadily and only a restart brings it back",
         "The server starts paging and everything slows together"],
  check:["Is it one process or the whole box",
         "Private bytes over time, not just current — a leak has a slope",
         "Whether recycling on a memory limit is already masking it",
         "Anything that loads a whole file or result set into memory"],
  causes:["A result set that grew with the data — fine at 1,000 rows, fatal at 500,000",
          "Objects held in a static cache that is never evicted",
          "A file processed in one read rather than streamed"],
  capture:["Private bytes at intervals so the slope is visible",
           "The exception and the stack if there is one",
           "What size of input triggers it"],
  note:"A leak that only shows after a data volume grew is not really a leak — it is a design that assumed small input." });

kb("cert", "certificate expired ssl tls cert https not secure chain untrusted handshake",
{ name:"A certificate problem",
  signs:["Browsers show Not Secure or a warning page",
         "Clients fail with a TLS handshake error while browsers seem fine",
         "It stopped working overnight with no deployment"],
  check:["The expiry date on the certificate actually bound in IIS — not the one in the folder",
         "Whether the whole chain is installed: an intermediate missing breaks non-browser clients while browsers repair it silently",
         "The binding: hostname, port, and SNI",
         "The private key is present and the account can read it",
         "The server's clock — a skewed clock invalidates a valid certificate"],
  causes:["Simple expiry that nobody was tracking",
          "A renewal installed but never bound, so the old one is still serving",
          "An intermediate certificate missing after a rebuild",
          "A client pinned to a protocol version the server has since disabled"],
  capture:["Thumbprint, subject, issuer and expiry of what is actually bound",
           "The exact client error text — handshake errors are specific",
           "Whether browsers and API clients behave differently"],
  note:"Browsers fetch missing intermediates by themselves. Java, .NET and curl do not. If it works in Chrome and fails from an application, suspect the chain first." });

kb("port", "port blocked firewall connection refused cannot connect timeout telnet nc",
{ name:"A connection that will not open",
  signs:["Connection refused, or a hang that ends in a timeout",
         "It works from one machine and not another"],
  check:["Refused or timed out — refused means something answered and said no, timed out means nothing answered. They point in opposite directions",
         "Is the service listening at all: netstat -an on the server for that port",
         "Test from the client with Test-NetConnection or telnet, not from the server itself",
         "The Windows firewall on the server, then anything between: network firewall, security group, proxy",
         "Whether the client is resolving the name to the address you think"],
  causes:["A firewall rule changed or a new segment introduced",
          "The service is bound to localhost only rather than all interfaces",
          "The service is simply not running",
          "DNS pointing at an old address"],
  capture:["Refused versus timeout, exactly",
           "Source and destination addresses and the port",
           "Whether it works from the server locally"],
  note:"Test from where the failure is, not from somewhere convenient. Half of these turn out to be a path you never actually tested." });

kb("dns", "dns not resolving name resolution host file nslookup wrong ip stale",
{ name:"A name resolving to the wrong place, or not at all",
  signs:["Works by IP address, fails by name",
         "Works on one machine, fails on another",
         "Started after a migration or a failover"],
  check:["nslookup from the failing machine, and compare with a working one",
         "The hosts file — old entries left behind after a cutover outlive everyone's memory",
         "The DNS cache: ipconfig /flushdns, then test again",
         "TTL on the record if it was changed recently"],
  causes:["A cutover where the record changed but the cache or hosts file did not",
          "A hosts-file entry added during an old incident and never removed",
          "Split DNS resolving differently inside and outside"],
  capture:["What it resolves to, from which machine",
           "The contents of any hosts entry you find",
           "What it should resolve to"],
  note:"A hosts file entry is the commonest cause of \"it works everywhere except this one server\"." });

kb("task", "scheduled task did not run task scheduler 0x1 last run result job",
{ name:"A scheduled task that did not run, or ran and did nothing",
  signs:["Last Run Result is 0x1 or 0x41301, or the task shows as never run",
         "The task says it succeeded but nothing happened"],
  check:["History tab — it is off by default on some servers; turn it on before the next occurrence",
         "The account it runs as, and whether Run whether user is logged on is set",
         "Start in — a task with a relative path and no working directory fails silently",
         "Whether the last run overlapped the next and the task is set not to run in parallel",
         "Run it by hand from Task Scheduler and watch"],
  causes:["Password rotated on the run-as account",
          "Working directory not set, so relative paths resolve somewhere unexpected",
          "The previous run never finished",
          "The server was rebooting at the scheduled minute"],
  capture:["Last Run Time and Last Run Result",
           "The account and the exact command line",
           "Whether it works run by hand as the same account"],
  note:"0x1 means the program ran and returned 1 — the task worked, the script failed. That is a different investigation." });

kb("permission", "access denied permission denied acl share unauthorized 401 file access",
{ name:"Access denied to a file, folder or share",
  signs:["Access is denied, or UnauthorizedAccessException",
         "It works for you interactively but not for the service"],
  check:["Which account is actually being used — yours is rarely the one that matters",
         "NTFS permissions and share permissions both — the more restrictive wins",
         "Whether the path is a UNC and the account is a local account that cannot reach it",
         "Effective access from the folder's Advanced Security dialog",
         "Whether a recent group change removed something"],
  causes:["A service account not in the group it needs",
          "A folder recreated without inheriting permissions",
          "A local account being used for a network path",
          "Double-hop: the credential does not survive one machine to the next"],
  capture:["The full path, the account and the exact error",
           "Effective access output",
           "Whether interactive access works with the same account"],
  note:"Test as the account that fails. Testing as yourself proves nothing except that your own access works." });

/* ── databases ───────────────────────────────────────────────────────── */

kb("sqltimeout", "sql timeout query timeout command timeout slow query database slow execution timeout expired",
{ name:"A query timing out",
  signs:["Timeout expired. The timeout period elapsed prior to completion of the operation",
         "The same screen works in the morning and times out in the afternoon",
         "It works in SSMS but times out from the application"],
  check:["Is it slow, or is it blocked? sp_whoisactive, or sys.dm_exec_requests for blocking_session_id — those are different problems with different fixes",
         "The actual execution plan, looking for scans where a seek belongs",
         "Whether statistics are stale on the tables involved",
         "The command timeout in the application — often 30 seconds while SSMS has none, which is why one works and the other does not",
         "Whether the row count grew: a plan that was fine at 10,000 rows may be hopeless at 10 million"],
  causes:["A missing or unused index after a data volume change",
          "Blocking by another session holding a lock",
          "Parameter sniffing — a plan cached for one parameter and terrible for another",
          "Statistics out of date after a bulk load"],
  capture:["The exact statement and its parameters",
           "The execution plan if you can get it",
           "Whether it is reproducible and at what time of day",
           "blocking_session_id if there was one"],
  note:"\"Works in SSMS, times out in the app\" is nearly always either the application's command timeout or a different execution plan from different connection settings — not a network problem." });

kb("deadlock", "deadlock victim transaction deadlocked lock blocking blocked process 1205",
{ name:"A deadlock",
  signs:["Error 1205: transaction was deadlocked on lock resources and has been chosen as the deadlock victim",
         "It happens under load and not when you test it"],
  check:["The deadlock graph — the system_health extended event session has it by default",
         "Which two statements, and in which order they took their locks",
         "Whether a transaction is doing more than it needs to inside its scope",
         "Whether an index would let one of them take fewer locks"],
  causes:["Two processes taking the same locks in opposite order",
          "A transaction held open across a user interaction or a slow call",
          "A missing index forcing a scan that locks far more than it needs"],
  capture:["The deadlock graph XML — it names both statements",
           "How often, and under what load",
           "Whether the application retries automatically"],
  note:"A deadlock victim is retryable by design. If the application does not retry, that is worth raising alongside the database fix." });

kb("logfull", "transaction log full ldf growing log file cannot shrink 9002",
{ name:"A transaction log that will not stop growing",
  signs:["Error 9002: the transaction log for database X is full",
         "The .ldf is many times the size of the .mdf"],
  check:["log_reuse_wait_desc in sys.databases — it names the reason in one word",
         "Recovery model: FULL without log backups grows forever, and someone usually set it without setting up the backups",
         "Whether a long-running or abandoned transaction is holding it",
         "Whether replication or an availability group is behind"],
  causes:["FULL recovery with no log backup chain",
          "A transaction opened and never committed",
          "A large one-off operation done in a single transaction"],
  capture:["log_reuse_wait_desc",
           "The recovery model and when the last log backup ran",
           "The file sizes before and after"],
  note:"log_reuse_wait_desc answers this question on its own about nine times in ten. Read it before doing anything else." });

kb("connpool", "connection pool exhausted timeout obtaining connection max pool size",
{ name:"The connection pool running out",
  signs:["Timeout expired. The timeout period elapsed prior to obtaining a connection from the pool",
         "It fails under load and recovers when load drops"],
  check:["Whether connections are being closed — a missing using block leaks one per call",
         "The pool size in the connection string against the number of concurrent requests",
         "Long-running queries holding connections longer than expected",
         "Whether several connection strings differ slightly, so you have several pools without meaning to"],
  causes:["Connections not disposed on an error path",
          "Queries slow enough that the pool cannot turn over",
          "Pool size left at the default for a workload that outgrew it"],
  capture:["The error text, which distinguishes this from a query timeout",
           "Concurrent request count at the time",
           "Whether it clears on its own"],
  note:"This error and a query timeout read almost the same but mean opposite things: one is too many connections, the other is one slow query." });

kb("login", "login failed for user 18456 cannot open database orphaned user sql login",
{ name:"A database login failing",
  signs:["Login failed for user X (Error 18456)",
         "Cannot open database requested by the login"],
  check:["The state number in the SQL error log — the message to the client is deliberately vague, the log is not. State 5 is no such login, 8 is wrong password, 18 is password must change, 38 is no access to that database",
         "Whether the login exists but the database user is orphaned after a restore",
         "Whether the account is locked or expired in AD",
         "Whether it is a service account whose password rotated"],
  causes:["Password rotation on a service account",
          "A database restored from another server leaving orphaned users",
          "Permissions removed by a cleanup",
          "Wrong database name in the connection string after an environment copy"],
  capture:["The error state from the SQL log, not the client message",
           "Which account, from which host",
           "When it last worked"],
  note:"The client message is deliberately unhelpful so it does not tell an attacker which half was wrong. The server log has the state number and that names the cause." });

kb("backup", "backup failed job failed maintenance plan backup chain restore verify",
{ name:"A backup that failed",
  signs:["The Agent job reports failure, or reports success while writing nothing",
         "It failed quietly some nights ago and nobody noticed"],
  check:["The job history step by step — the failing step names the reason",
         "Free space on the backup target",
         "Whether the account can write to the target, especially if it is a UNC path",
         "backupset in msdb for when a good backup was last actually taken",
         "Whether the chain is broken — a missing full makes subsequent differentials useless"],
  causes:["Target full or unreachable",
          "Permissions on a share changed",
          "A database added and never included in the plan",
          "Someone took an ad-hoc full backup and broke the differential chain"],
  capture:["The last successful backup of each database, from msdb",
           "The failing step and its message",
           "Whether the chain is intact"],
  note:"A backup nobody has restored is a hope, not a backup. If this is the second failure in a row, the restore test matters more than the fix." });

kb("blocking", "blocking chain head blocker sessions waiting lock waits sp_who",
{ name:"Sessions piling up behind one another",
  signs:["Many sessions waiting, all ultimately on one",
         "The application appears frozen rather than slow"],
  check:["The head of the chain — the session blocking everything that is itself blocked by nothing",
         "What it is running, and how long it has been running",
         "Whether it is a genuine long transaction or an open one nobody committed",
         "Whether it is an application session or someone in SSMS"],
  causes:["An open transaction in a query window somebody left running",
          "A long report against live tables",
          "A batch running in the working day that belongs overnight"],
  capture:["The head blocker's session id, login, host and statement",
           "How long the chain has been building",
           "Who owns it, before you kill anything"],
  note:"Killing the head blocker clears it instantly and rolls that transaction back — which may be exactly what you must not do if it is mid-batch. Find out what it is first." });

/* ── files, transfers and integrations ──────────────────────────────── */

kb("sftp", "sftp ftp connection refused host key changed transfer failed cannot connect winscp",
{ name:"An SFTP transfer that will not connect or complete",
  signs:["Connection refused, or a hang that ends in timeout",
         "Host key verification failed, or a warning that the key changed",
         "Authentication fails for an account that worked yesterday"],
  check:["Refused or timed out — refused means it answered, timed out means the path is blocked",
         "Whether the host key changed: that happens legitimately after a server rebuild, and is also what an interception looks like. Confirm it with the other side before accepting it",
         "Whether it is password or key authentication, and whether the key's permissions are still right",
         "The account on the far side — expiry and lock-out apply there too",
         "Whether your source address is still allowlisted; those lists get cleaned"],
  causes:["Far-side server rebuilt or rotated its key",
          "Password expired on the transfer account",
          "Firewall or allowlist changed at either end",
          "The far side moved to a new host and told somebody who is on leave"],
  capture:["The exact client log, which names the stage it failed at",
           "The new host key fingerprint if it changed",
           "When the last successful transfer was"],
  note:"Never accept a changed host key just to get the file through. Confirm the fingerprint with the other side first — that warning is the only thing standing between you and a redirected transfer." });

kb("filenotpicked", "file not picked up file stuck in folder not processed landing folder watcher",
{ name:"A file that arrived but was never processed",
  signs:["The file is sitting in the folder, unprocessed",
         "The job reports success having found nothing"],
  check:["The exact filename against the pattern the job matches — a changed prefix, date format or extension case is the commonest cause",
         "Whether the file is still locked by the process that wrote it",
         "Whether the job looks at a different folder than you are looking at, especially after an environment copy",
         "Whether it already ran, found the file, and moved it to an error folder you have not checked",
         "File size — a zero-byte file often means an interrupted transfer"],
  causes:["Filename pattern changed at the source",
          "The file was still being written when the job looked",
          "Processed already and moved somewhere you have not looked",
          "Permissions on the folder changed"],
  capture:["The exact filename, its size and timestamp",
           "The pattern the job expects",
           "Anything in the error or archive folders"],
  note:"Check the archive and error folders before concluding it was never processed. Half of these were processed and rejected, which is a different problem entirely." });

kb("encoding", "encoding utf8 bom garbled characters khmer unicode question marks mojibake",
{ name:"Text arriving garbled",
  signs:["Khmer or accented characters show as boxes, question marks or Ã-style pairs",
         "The first field of the first row has invisible junk in front of it",
         "It looks right in Notepad and wrong in the application"],
  check:["The file's actual encoding, not what it is supposed to be",
         "Whether there is a byte-order mark — a BOM on a UTF-8 CSV breaks the first column name in a lot of parsers",
         "What encoding the reader assumes when none is declared",
         "The database column type: varchar cannot hold Khmer, nvarchar can",
         "Whether the collation matters for comparison as well as storage"],
  causes:["A file saved as ANSI or Windows-1252 where UTF-8 was expected",
          "A BOM added by whatever wrote it",
          "varchar where nvarchar is needed",
          "Double encoding — text already encoded once, encoded again"],
  capture:["A hex dump of the first bytes, which settles the BOM question",
           "One example of the wrong output alongside what it should be",
           "Where in the chain it is still correct — that locates the step that breaks it"],
  note:"Find the last point in the chain where the text is still right. The step immediately after that is the one to fix, and it is rarely the one being blamed." });

kb("csv", "csv malformed column count mismatch delimiter quotes import failed row rejected",
{ name:"A CSV that will not import",
  signs:["Column count mismatch on a particular row",
         "Everything shifts one column right from a point in the file",
         "Only some rows fail"],
  check:["The failing row — a comma inside an unquoted field shifts everything after it",
         "Embedded line breaks inside a quoted field, which split one record into two",
         "Whether quoting is consistent, and how escaped quotes are written",
         "The delimiter: a file produced in a locale that uses semicolons will look wrong everywhere",
         "The trailing newline, and whether a final empty line is being read as a row"],
  causes:["A free-text field containing the delimiter and not quoted",
          "A newline inside a description field",
          "The producer changed its export settings",
          "Excel opened it, reformatted it and saved it back"],
  capture:["The exact failing row, raw",
           "The row number and total rows",
           "Whether the same file imported before"],
  note:"If a person opened the file in Excel between production and import, assume it changed: dates, leading zeros and long numbers all get quietly rewritten." });

kb("api401", "api 401 unauthorized token expired oauth bearer authentication failed",
{ name:"An API rejecting authentication",
  signs:["401 Unauthorized, or 403 Forbidden",
         "It worked until a certain time and then stopped for everything"],
  check:["401 or 403 — 401 is who are you, 403 is I know who you are and no. Completely different investigations",
         "Whether the token has expired, and whether the refresh flow actually ran",
         "The clock on the calling machine: token validation is time-sensitive and a few minutes of skew fails everything",
         "Whether a secret or key rotated on the far side",
         "Whether the scope or role changed rather than the credential"],
  causes:["Client secret rotated and not updated everywhere it lives",
          "Token cached past its expiry",
          "Clock skew",
          "Permission removed during an access review"],
  capture:["The status code and the response body — most APIs say more in the body than the code",
           "The token's expiry claim if you can decode it",
           "When it last worked and what changed near then"],
  note:"403 with a valid token is a permissions change, not an authentication problem. Chasing the credential there wastes the afternoon." });

kb("api5xx", "api 500 502 503 504 gateway timeout bad gateway upstream error internal server error",
{ name:"An API returning a server error",
  signs:["500 Internal Server Error, or 502 / 503 / 504 from something in front of it",
         "Intermittent, or only for certain payloads"],
  check:["Which component is answering — a 502 or 504 usually comes from a proxy or load balancer, not the application",
         "Whether it is all requests or only some: if only some, compare the payloads",
         "The far side's own logs, with a correlation id if there is one",
         "Whether it correlates with size — large payloads hitting a limit",
         "Whether a retry succeeds, which points at load or a timeout rather than the request"],
  causes:["An unhandled error on the far side for a particular input",
          "A timeout between proxy and application on a slow call",
          "A payload over a size limit",
          "The far side deploying"],
  capture:["Status code, response body, and any correlation or request id",
           "One request that fails and one that succeeds, for comparison",
           "The exact time, for the other team's logs"],
  note:"A correlation id in the response is worth more to the other team than any description you can write. Always take it." });

kb("api429", "429 too many requests rate limit throttled quota exceeded backoff",
{ name:"Being rate limited",
  signs:["429 Too Many Requests",
         "It works when tested by hand and fails during the batch"],
  check:["The limit and the window — the Retry-After header usually says",
         "Whether the caller retries immediately, which makes it worse",
         "Whether several of your processes share the same quota without knowing",
         "Whether a retry storm from an earlier failure is the actual cause"],
  causes:["A batch calling in a tight loop",
          "Retries with no backoff turning one failure into a hundred",
          "A quota reduced on the far side",
          "Another team sharing your key"],
  capture:["The Retry-After value and the headers",
           "Calls per minute you are actually making",
           "Whether the volume changed"],
  note:"Retrying immediately on a 429 is the one thing guaranteed to make it worse. If there is no backoff in the caller, that is the finding." });

kb("webhook", "webhook not received callback missing notification not delivered listener",
{ name:"A callback that never arrived",
  signs:["The far side says it sent; nothing was received",
         "Some arrive and some do not"],
  check:["Whether it reached you at all — the web server log answers this before anyone argues about it",
         "The endpoint the far side has configured, against the one you are watching",
         "Whether your endpoint answered non-2xx, in which case many senders drop it after retries",
         "Whether a firewall or allowlist sits in front",
         "Whether it arrived and failed processing after acceptance — that looks identical from outside"],
  causes:["Endpoint URL out of date on their side",
          "Your endpoint returning an error, so their retries eventually stopped",
          "Certificate problem on your endpoint that their client will not accept",
          "It arrived and the handler failed silently"],
  capture:["Your access log for the window, filtered to that path",
           "Their delivery log with their attempt ids",
           "The exact URL they are configured to call"],
  note:"Prove receipt or non-receipt from your own web server log first. Every one of these conversations goes in circles until someone does." });

/* ── identity and access ─────────────────────────────────────────────── */

kb("password", "password expired account locked cannot login user locked out reset password",
{ name:"An account locked out or expired",
  signs:["The user cannot sign in and the message is vague",
         "It started at a policy boundary — 90 days, or the first Monday of a month"],
  check:["Locked or expired — they need different fixes and the message rarely distinguishes them",
         "Where the lockout came from: a phone or a mapped drive holding an old password will re-lock the account within minutes of every reset",
         "Whether it is one user or many, which separates an account problem from a policy change",
         "Whether a service account is involved, in which case something automated is failing too"],
  causes:["Ordinary expiry nobody was warned about",
          "A cached credential on a phone or a mapped drive retrying",
          "A service account rotated without updating every place it is used",
          "A policy change applied to a group"],
  capture:["The exact account and the exact message",
           "The lockout source if the domain logs it",
           "Whether it re-locks after a reset — that is the tell for a cached credential"],
  note:"An account that locks again within minutes of a reset is not a password problem. Something is retrying with the old one, and until you find it you will reset forever." });

kb("sso", "sso saml okta federation single sign on assertion redirect loop idp",
{ name:"Single sign-on failing",
  signs:["A redirect loop between application and identity provider",
         "Signed in everywhere else, refused here",
         "Works for some users, not others"],
  check:["Whether it fails before or after the identity provider — the browser's network trace shows which side stopped",
         "The clock on both ends: assertions are time-limited and skew invalidates them",
         "Whether the user is in the group the application requires",
         "Whether the signing certificate on either side was rotated",
         "The reply URL and entity id, which break silently after an environment copy"],
  causes:["Signing certificate rotated at the identity provider",
          "Group membership changed",
          "Reply URL wrong after a URL change",
          "Clock skew"],
  capture:["A network trace of the redirects, or at least the last URL before failure",
           "Whether it is one user or all",
           "The exact error the provider shows, which is usually more specific than the application's"],
  note:"One user failing is membership or profile. Everyone failing at once is certificate or configuration. That split saves an hour." });

kb("serviceacct", "service account password rotation expired credential automation stopped",
{ name:"A service account whose password changed",
  signs:["Several unrelated things break at once",
         "Everything worked until a rotation date"],
  check:["Everywhere that account is used: services, application pools, scheduled tasks, connection strings, linked servers, saved credentials in transfer tools",
         "Whether the account is now locked from repeated failures",
         "Whether it is set to expire at all — service accounts often should not"],
  causes:["A rotation that updated some places and not others",
          "An expiry policy applied to an account that should have been exempt"],
  capture:["The full list of places the account is used — this is the artefact worth keeping",
           "Which ones were updated and which were missed",
           "The rotation date"],
  note:"The list of places a service account is used is the single most valuable thing to write down while you are hunting. Next rotation, it turns a day into ten minutes." });

/* ── batches and jobs ────────────────────────────────────────────────── */

kb("batch", "batch failed job failed halfway partial run rerun overnight job did not complete",
{ name:"A batch that failed part way through",
  signs:["It reports failure after processing some records",
         "Some downstream data is updated and some is not"],
  check:["Where exactly it stopped — the record or file it was on",
         "Whether it is safe to rerun: does it skip what it already did, or would it double-process",
         "Whether it runs in one transaction or commits as it goes, which decides what state you are in",
         "What triggered the stop — an error, a timeout, or the window closing",
         "Whether anything downstream already consumed the partial output"],
  causes:["One bad record it did not expect",
          "A dependency unavailable part way",
          "Running past its window and being stopped",
          "Volume grown beyond what the window allows"],
  capture:["The last successfully processed record or key",
           "The error and the record that caused it",
           "Whether the run is idempotent — write it down, because this question comes back every time"],
  note:"Before rerunning, be certain whether it is idempotent. A rerun that double-posts is far worse than an hour spent finding out, and this is where a partial run does real damage." });

kb("idempotent", "duplicate processed twice double posted reran duplicate transaction",
{ name:"Something processed twice",
  signs:["Duplicate records, doubled amounts, two notifications for one event"],
  check:["Whether it was a rerun after a partial failure",
         "Whether the source sent twice — many senders retry when they do not get a clean acknowledgement",
         "Whether there is a natural key that should have prevented it",
         "How far the duplicate travelled — if it reached a ledger or a customer, that changes the response"],
  causes:["A rerun of a job that is not idempotent",
          "A retry after a timeout where the first call actually succeeded",
          "No unique constraint where there should be one"],
  capture:["Both records, with their timestamps and any source ids",
           "What triggered the second one",
           "Everything downstream that already saw it"],
  note:"A timeout is not a failure — the far side may well have succeeded and only the answer was lost. That is where most double-processing comes from." });

kb("window", "job overran batch window still running morning slow overnight not finished",
{ name:"A job that no longer fits its window",
  signs:["It used to finish by 04:00 and now runs into the working day",
         "The day starts slow because last night is still going"],
  check:["Runtime over the last weeks — the trend matters more than last night",
         "Whether volume grew, or something got slower at the same volume",
         "Whether it now overlaps something else",
         "Whether it can be split, or restarted from a checkpoint"],
  causes:["Data volume growth",
          "A query that degraded as a table grew",
          "Another job moved into the same window",
          "The window shortened by a change elsewhere"],
  capture:["Runtime for the last several runs, so the slope is visible",
           "Row counts for the same runs",
           "When it started missing"],
  note:"Runtime alongside row count over a few weeks tells you immediately whether this is growth or a regression. They need opposite fixes." });

/* ── the application itself ──────────────────────────────────────────── */

kb("slow", "slow application users complaining performance degraded takes forever laggy",
{ name:"Users saying it is slow",
  signs:["Vague reports, no error, everything technically works"],
  check:["Slow for everyone or for some — that halves the problem immediately",
         "Slow always, or at particular times, which points at load or a job",
         "One screen or all of them: one screen is a query, all of them is infrastructure",
         "Whether it is slow to first byte or slow to render — server or client",
         "What changed: a deployment, a data load, a patch, more users"],
  causes:["A query degrading as data grew",
          "A batch running in working hours",
          "Network path changed",
          "Genuine growth in users"],
  capture:["Who, which screen, what time, how long",
           "One concrete example with a timestamp — vague reports cannot be investigated",
           "Whether it is reproducible"],
  note:"\"Slow\" is not a symptom you can work with. One user, one screen, one timestamp, one duration turns it into something you can find." });

kb("intermittent", "intermittent sometimes fails random cannot reproduce works sometimes flaky",
{ name:"Something that fails only sometimes",
  signs:["It works when you watch it",
         "No pattern anybody has noticed yet"],
  check:["Whether there is a pattern nobody spotted: time of day, one user, one branch, one server behind a load balancer, one data shape",
         "If there are several servers, whether it is always the same one — that is the commonest hidden pattern",
         "Whether it correlates with a job, a backup, or a peak",
         "What the failures have in common, rather than what the successes do"],
  causes:["One node out of several with different configuration",
          "A race that only shows under concurrency",
          "A particular data shape that is rare",
          "A dependency that is intermittently slow"],
  capture:["Every occurrence with its exact time — the pattern only appears once there are several",
           "Which server, which user, which record",
           "What was running at the same moment"],
  note:"With several servers behind a balancer, check whether failures all land on one node before anything else. That single question resolves a large share of these." });

kb("worksforme", "works on my machine works for me not for them user specific browser cache",
{ name:"Works for you, not for them",
  signs:["You cannot reproduce what the user is certain they see"],
  check:["Their browser and version, and whether it is the supported one",
         "Their cached copy — a hard refresh or a private window separates cache from code",
         "Their permissions, which are rarely yours",
         "Their data: the record they are on may be the one that breaks it",
         "Their network path — VPN, proxy or office versus home"],
  causes:["Cached old version",
          "Different permissions",
          "A specific record with unusual data",
          "A different browser"],
  capture:["A screenshot including the URL and the time",
           "The exact record or reference they were on",
           "Browser, version, and where they were working from"],
  note:"Ask for the record reference before anything else. Most of these are one row of data, not the application." });

kb("timezone", "timezone wrong time offset utc dates shifted date wrong by hours dst",
{ name:"Times showing wrong",
  signs:["Dates off by a fixed number of hours",
         "A record created late in the evening shows the next day",
         "It changed when the clocks did somewhere"],
  check:["Where the conversion happens — database, application, or browser. Two of them converting is the classic fault",
         "What the database column stores: a plain datetime has no offset and is only meaningful with a convention",
         "The server's own time zone, and whether it matches assumptions",
         "Whether the offset is exactly your own — Phnom Penh is UTC+7 and a seven-hour shift is the giveaway"],
  causes:["A value converted twice",
          "UTC stored but displayed as local without conversion, or the reverse",
          "A server in a different zone from the users",
          "Daylight saving somewhere in the chain"],
  capture:["One record with what is stored, what is displayed, and what it should be",
           "The size of the offset — it names the cause",
           "Whether every record is wrong or only some"],
  note:"A consistent offset is a conversion bug. An inconsistent one is usually daylight saving, which means it is time-of-year dependent and will come back." });

kb("rounding", "rounding round rounded cent cents decimal precision float totals penny " +
   "fraction discrepancy mismatch centavo",
{ name:"Amounts out by a small difference",
  signs:["Totals differ by a cent or two",
         "The difference grows with the number of rows"],
  check:["Where rounding happens — per line or on the total. Rounding each line and summing gives a different answer from summing and rounding once",
         "The data type: float cannot represent money exactly and will drift; decimal can",
         "The number of decimal places at each step",
         "Whether two systems round differently and are being compared"],
  causes:["float used for money somewhere in the chain",
          "Rounding applied at a different point than the other system",
          "Different precision between database and application"],
  capture:["One example with every intermediate value",
           "The two totals being compared and their difference",
           "Whether the difference scales with row count"],
  note:"A difference that grows with the number of rows is accumulation — per-line rounding, or float. A constant difference is one step in the chain." });

kb("report", "report blank empty report no data wrong figures report slow export",
{ name:"A report empty, slow or wrong",
  signs:["Blank output, or figures that do not match another source"],
  check:["Whether the parameters actually select anything — dates and a default that excludes everything are the commonest cause of blank",
         "Whether the user's permissions filter the data underneath them",
         "For wrong figures: which source is right, and what each one includes. They usually count different things rather than one being broken",
         "Whether it reads live tables or a copy, and how stale the copy is",
         "For slow: the same investigation as any slow query"],
  causes:["Parameters excluding everything",
          "Row-level security filtering silently",
          "Two reports defining the same word differently",
          "A stale data copy"],
  capture:["The exact parameters used",
           "The two figures being compared and what each claims to count",
           "Whether anyone changed the definition"],
  note:"Most \"wrong figures\" turn out to be two correct answers to two slightly different questions. Establish what each one counts before assuming a fault." });

kb("deploy", "deployment failed rollback release went wrong after deployment broke version",
{ name:"Something broken after a release",
  signs:["It worked before the deployment and not after",
         "Errors started at a time that matches the release"],
  check:["What actually shipped, against what was meant to",
         "Whether configuration went with it — most \"code\" failures after a release are configuration that did not travel",
         "Whether a database change is needed and did not run, or ran and the code is behind",
         "Whether all nodes got it, or only some",
         "Whether rollback is genuinely possible, which a database change may prevent"],
  causes:["Configuration not deployed with the code",
          "A migration missed or half-applied",
          "One node out of several missed",
          "A dependency version changed"],
  capture:["The version before and after",
           "The exact deployment time against the first error",
           "Whether all nodes are on the same version"],
  note:"Check whether every node got it before anything else. \"Intermittent after a release\" and \"one node missed\" are the same sentence." });

kb("config", "config drift environment difference works in uat not production settings different",
{ name:"Works in one environment, not another",
  signs:["Fine in test, fails in production, same version"],
  check:["A line-by-line comparison of configuration, not a glance",
         "Connection strings, endpoints, timeouts, feature flags, certificate names",
         "Whether the environments genuinely have the same data shape and volume",
         "Whether permissions differ — production is usually tighter",
         "Whether something is present in one and absent in the other: a file, a certificate, a folder"],
  causes:["A setting changed in one environment during an earlier incident",
          "A firewall rule that exists in test and not in production",
          "Data volume differences exposing a query that was never fast",
          "Permissions tighter in production"],
  capture:["A diff of the two configurations",
           "What is present in one and missing in the other",
           "Whether the failing thing is reachable from that environment at all"],
  note:"Diff the configuration properly. Every one of these hides in a line somebody was sure was the same." });

kb("cache", "stale cache old data showing not refreshing cached value clear cache",
{ name:"Old data still showing",
  signs:["A change was made and the screen still shows the old value",
         "It corrects itself after a while, or after a restart"],
  check:["Which cache — browser, application memory, a distributed cache, a proxy, or a materialised copy. There are usually several",
         "How long each is meant to hold, and whether that matches what you see",
         "Whether it corrects on hard refresh, which points at the browser rather than the server",
         "Whether one node is stale and another is not"],
  causes:["A cache with a longer lifetime than anyone remembers",
          "Invalidation that does not fire on that path",
          "One node not receiving the invalidation",
          "A proxy caching something it should not"],
  capture:["How long it takes to correct itself — that names the layer",
           "Whether a hard refresh fixes it",
           "Whether every user sees it or only some"],
  note:"How long it takes to correct itself identifies the layer more reliably than anything else. Time it before you start clearing things." });

kb("upload", "upload failed file too large 413 attachment size limit maxrequestlength",
{ name:"An upload that fails on larger files",
  signs:["Small files work, large ones fail",
         "413 Request Entity Too Large, or a generic failure with no message"],
  check:["The limit at each layer: browser, web server, application framework, and anything in front. The smallest wins and it is rarely the one you changed",
         "In IIS both maxAllowedContentLength and maxRequestLength exist and are in different units",
         "Whether it fails at a consistent size, which confirms a limit rather than a timeout",
         "Whether it is size or duration — a slow connection can time out before the limit"],
  causes:["A limit at a layer nobody remembered",
          "A proxy limit in front of the application",
          "Timeout on a slow connection rather than size"],
  capture:["The size that works and the size that fails",
           "The exact error and which component produced it",
           "Whether it is reproducible at that size"],
  note:"Find the exact size where it starts failing. A sharp cut-off is a limit; a vague one is a timeout, and they are fixed in different places." });

/* ── insurance and payments ──────────────────────────────────────────── */

kb("policynotfound", "policy not found missing policy cannot find policy number does not exist",
{ name:"A policy that cannot be found",
  signs:["The number the customer quotes returns nothing",
         "It exists in one system and not another"],
  check:["The number exactly as given — leading zeros, prefixes and separators are dropped by spreadsheets and by people",
         "Whether it exists but in a status the search filters out: cancelled, lapsed, pending, archived",
         "Whether the search is scoped to a branch, product or date range that excludes it",
         "Whether it is in one system and not yet replicated to the one being searched",
         "Whether it was migrated and renumbered"],
  causes:["Leading zeros lost, usually via Excel",
          "A status filter excluding it",
          "Replication lag between systems",
          "Renumbered at migration"],
  capture:["The number exactly as the customer gave it, character for character",
           "Where it was found and where it was not",
           "The status if you find it"],
  note:"Search on a partial number before concluding it does not exist. Excel silently strips leading zeros, and that one habit accounts for a great many of these." });

kb("premium", "premium premiums mismatch calculation incorrect rate rating ratetable " +
   "prorata proration levy quote quotation sumassured cover coverage",
{ name:"A premium that does not match expectation",
  signs:["The system's figure differs from a quote, a spreadsheet, or the customer's expectation"],
  check:["Which rate table and version applied, and its effective date — a rate change mid-term explains most of these",
         "Whether an endorsement or adjustment is included in one figure and not the other",
         "Whether taxes, levies and fees are inside the number being compared",
         "Pro-rata against full-term: a mid-term change is charged proportionally",
         "Rounding, per line versus on the total"],
  causes:["A rate version effective from a different date",
          "An endorsement included on one side only",
          "Tax treated differently in the two figures",
          "Pro-rata not accounted for"],
  capture:["Both figures with their full breakdowns",
           "The effective dates in play",
           "Which rate version the system used"],
  note:"Get both figures broken down before comparing totals. These are nearly always two different scopes rather than a calculation fault." });

kb("endorsement", "endorsement not applied amendment change not reflected mid term adjustment",
{ name:"An endorsement that has not taken effect",
  signs:["The change was made but the policy still shows the old terms",
         "Documents still print the previous version"],
  check:["Its status — raised, approved, applied are different states and only the last one changes anything",
         "The effective date against today: a future-dated endorsement is correct to show as not yet applied",
         "Whether an approval step is waiting on somebody",
         "Whether it applied to the record but the document was generated before"],
  causes:["Awaiting an approval nobody knows about",
          "Future effective date, working as designed",
          "Applied but documents cached or generated earlier",
          "Failed part way and left in an intermediate state"],
  capture:["The endorsement reference and its current status",
           "Its effective date",
           "What the customer was told to expect and when"],
  note:"Check the effective date before treating it as a fault. A good share of these are future-dated and behaving exactly as designed." });

kb("renewal", "renewal not generated renewal notice missing lapse renewal batch",
{ name:"A renewal that was not produced",
  signs:["A policy due for renewal has no renewal record or notice",
         "Some renewed in the batch and some did not"],
  check:["Whether the policy meets the criteria the batch selects on: status, product, expiry window, block flags",
         "Whether it was excluded deliberately — a hold, a claim in progress, a cancellation request",
         "Whether the batch ran at all, and whether it completed",
         "The batch's own exception list, which usually explains each exclusion",
         "Whether it renewed but the notice failed separately"],
  causes:["Excluded by a flag on the policy",
          "Outside the selection window by a day",
          "The batch failed part way",
          "Renewed correctly but the document or email failed"],
  capture:["The policy number and the expected renewal date",
           "The batch run and its exception list",
           "Whether other policies in the same batch worked"],
  note:"Whether it renewed and whether the customer was told are two separate steps. Find out which one failed before promising anything." });

kb("claimstuck", "claim stuck claim status not moving claim workflow pending approval",
{ name:"A claim not moving through its workflow",
  signs:["It has sat in one status longer than it should",
         "The next step is not available to anybody"],
  check:["Which status, and who owns that status — most of these are waiting on a person, not a system",
         "Whether a required document or field is missing and blocking the transition",
         "Whether an approval limit routes it to someone unavailable",
         "Whether an integration step failed silently",
         "The workflow history, which shows where it stopped"],
  causes:["Waiting on an approver who is away",
          "A mandatory field or document missing",
          "An automated step failed and did not raise anything",
          "Routing rule sending it to an empty queue"],
  capture:["The claim reference, current status, and how long in it",
           "The last successful transition and its timestamp",
           "Who the queue belongs to"],
  note:"An empty approval queue — someone left, and the rule still routes to them — is the version of this that can sit for weeks unnoticed." });

kb("payment", "payment not reconciled payment missing settlement mismatch bank file unmatched",
{ name:"A payment that has not matched",
  signs:["The customer has paid; the policy still shows unpaid",
         "The bank file and the system do not agree"],
  check:["Whether the payment arrived at all, in the bank file",
         "The matching key — reference, policy number, or amount. A customer typing their own reference is the usual break",
         "Whether the amount differs, even slightly, from what was expected",
         "Timing: paid after the file cut-off appears in tomorrow's",
         "Whether it matched to a different policy — over-matching is worse than not matching"],
  causes:["Wrong or missing payment reference",
          "Amount differs, so exact matching fails",
          "Timing across the cut-off",
          "Matched to the wrong account"],
  capture:["The bank reference, the amount and the value date",
           "What the system expected to match on",
           "Proof of payment from the customer if there is one"],
  note:"Check whether it matched somewhere it should not have before concluding it is missing. A wrong match is a harder problem discovered later." });

kb("khqr", "khqr qr payment e-payment callback gateway not credited payment gateway",
{ name:"An electronic payment that did not credit",
  signs:["The customer has a successful payment on their side; the system shows nothing",
         "Some succeed and some do not"],
  check:["Whether the gateway's callback reached you at all — your web server log settles it before any discussion",
         "The transaction reference on both sides",
         "Whether the callback arrived and processing failed after acceptance",
         "Whether the amount or currency differs",
         "Whether it is one channel or all of them"],
  causes:["Callback never delivered, or delivered to an old endpoint",
          "Callback received and the handler failed quietly",
          "Reference mismatch so it could not be matched",
          "A duplicate suppressed as already seen"],
  capture:["The gateway transaction id and the customer's receipt",
           "Your access log for the callback path in that window",
           "The exact timestamp on both sides"],
  note:"Whether the callback arrived is the first fork and everything else depends on it. Prove it from your own log, not from what the gateway says it sent." });

kb("refund", "refund file rejected refund failed disbursement returned payment rejected",
{ name:"A refund or disbursement rejected",
  signs:["The bank returns the file or the individual item",
         "Money has not reached the customer"],
  check:["The rejection code — banks are specific and the code names the reason",
         "Account details: number, name and branch, and whether the name matches exactly",
         "Whether the account is closed or dormant",
         "File format and any header or control totals",
         "Whether it was one item or the whole file"],
  causes:["Account details wrong or out of date",
          "Name mismatch against the account",
          "Closed account",
          "File format or control total wrong"],
  capture:["The rejection code and its text",
           "The item as sent, field by field",
           "Whether other items in the same file went through"],
  note:"One item rejected is data. The whole file rejected is format. That split decides who you talk to next." });

kb("commission", "commission calculation agent commission wrong intermediary payout",
{ name:"Commission that does not look right",
  signs:["An agent disputes their statement",
         "Two systems disagree on the same period"],
  check:["The rate and which version applied at the transaction date",
         "Whether the basis is gross or net, and of what",
         "Whether cancellations and refunds claw back, and whether both sides include them",
         "The period boundary — a transaction on the last day is a common disagreement",
         "Whether an override or special arrangement exists for that agent"],
  causes:["Rate version by date",
          "Different basis on the two sides",
          "Clawbacks included in one and not the other",
          "Period boundary"],
  capture:["The statement and the underlying transactions",
           "The rate applied and its effective date",
           "The period definition each side used"],
  note:"Ask what period each side used and whether clawbacks are in. Nearly every commission dispute is one of those two." });

kb("regreport", "regulatory report deadline submission returned filing central bank",
{ name:"A regulatory submission",
  signs:["A deadline approaching, or a submission returned"],
  check:["The exact deadline and what is actually required this period — templates change",
         "Whether the figures reconcile to the source before submitting, not after",
         "Whether the template version is current",
         "What was returned and why, if it came back",
         "Who signs it off and whether they are available"],
  causes:["Template changed since last period",
          "Figures not reconciled to source",
          "Late sign-off"],
  capture:["The submission reference and the exact deadline",
           "The reconciliation between report and source",
           "Any correspondence about what was wrong"],
  note:"Reconcile before submitting, every time. A returned submission costs far more than the hour it takes, and the deadline does not move." });

/* ── how the work is done ────────────────────────────────────────────── */

kb("evidence", "evidence audit proof what to capture screenshot log for audit trail",
{ name:"What to keep while you are working",
  signs:["It will be asked for later, and by then it is gone"],
  check:["The error exactly as shown, with the timestamp visible",
         "The record or reference it happened on",
         "Who reported it and when",
         "What you changed, and what it was before",
         "Logs from the window — they roll, so take them now"],
  causes:[],
  capture:["A screenshot with the URL and clock visible",
           "The log extract, saved rather than read",
           "The before and after of anything you changed"],
  note:"Take the log before you fix it. The fix destroys the evidence, and the question about what happened always comes later." });

kb("afterhours", "after hours change emergency fix out of hours weekend urgent change",
{ name:"Changing something outside the working day",
  signs:["It is urgent and nobody senior is awake"],
  check:["Whether it can genuinely wait until morning — most things can, and the ones that cannot are usually obvious",
         "Who needs to know now rather than tomorrow",
         "Whether it is reversible, and how, before doing it",
         "Whether anyone else is working on the same thing",
         "What you will write down so tomorrow makes sense"],
  causes:[],
  capture:["What you did, in order, with times",
           "What you observed before and after",
           "Who you told and when"],
  note:"Write it down as you go, not afterwards. At two in the morning you are certain you will remember, and by nine you will not." });

kb("handover", "handover shift change passing on leaving for the day someone else picks up",
{ name:"Handing work to someone else",
  signs:["The next person needs to continue without you"],
  check:["What is done and what is not, plainly",
         "What you tried that did not work — that saves them repeating it",
         "Who has been told what, so the customer hears one story",
         "What is waiting on someone else and since when",
         "What you would do next if you were staying"],
  causes:[],
  capture:["The current state in a sentence or two",
           "The dead ends",
           "Every promise made to anyone"],
  note:"What you tried and ruled out is the most valuable part, and the part most often left out. It is the difference between continuing and starting again." });

kb("rootcause", "root cause why did it happen prevent recurrence permanent fix underlying",
{ name:"Finding why, once it is working again",
  signs:["Service is restored and the cause is still unknown"],
  check:["What changed shortly before — deployment, configuration, data volume, patching, a new integration",
         "Whether it has happened before, and how often",
         "Whether the fix addressed the cause or the symptom, and be honest about which",
         "What would have caught it earlier",
         "Whether anything else shares the same weakness"],
  causes:[],
  capture:["A timeline of what happened and when",
           "What was changed to restore service",
           "What is still unexplained"],
  note:"Restarting it fixed the symptom. Writing down that a restart was the fix, and nothing more, is how the same incident happens monthly for a year." });

/* ═══ LEARNING HOW YOU RESOLVE THINGS ════════════════════════════════════
   The runbook detector in assist.js points at the one closest record you
   already closed. This goes further: it reads every closed record that looks
   like the one in front of you and works out what you actually do — which
   steps come up every time, which script you reach for, who you end up
   waiting on, how long it takes, and where it tends to go wrong.

   None of that is written down anywhere as a procedure. It is only visible
   because you have done the job five times and each time left a checklist, a
   note and a log behind. This reads those back to you as one set of steps. */

/* two step texts that mean the same thing, written slightly differently */
function stepKey(s){
  return String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/).filter(w => w.length > 2 && !STOP_STEP.has(w)).sort().join(" ");
}
const STOP_STEP = new Set("the a an and or of for to in on at is are be with from by as it this that".split(" "));

function mergeSteps(recs){
  const seen = {};
  recs.forEach(t => {
    const cl = t.checklist || [];
    cl.forEach((c, i) => {
      const key = stepKey(c.text);
      if (!key) return;
      /* fold near-duplicates into whichever spelling came first */
      let hit = null;
      for (const k in seen){
        const a = k.split(" "), bwords = key.split(" ");
        const share = a.filter(w => bwords.indexOf(w) >= 0).length;
        if (share && share / Math.max(a.length, bwords.length) >= 0.7){ hit = k; break; }
      }
      const k = hit || key;
      const e = seen[k] || (seen[k] = { text:c.text, n:0, pos:0, done:0 });
      e.n++;
      e.pos += cl.length > 1 ? i / (cl.length - 1) : 0;
      if (c.done) e.done++;
    });
  });
  return Object.keys(seen)
    .map(k => ({ text:seen[k].text, n:seen[k].n, done:seen[k].done, pos:seen[k].pos / seen[k].n }))
    .sort((a, b) => b.n - a.n || a.pos - b.pos);
}

/* the free-text lines someone wrote while working, minus the bookkeeping */
function workNotes(recs){
  const out = [];
  recs.forEach(t => {
    (t.log || []).forEach(e => {
      const s = String(e.text || "").trim();
      if (!s || e.kind === "status") return;
      if (/^(timer|opened|attached|waiting on|chased|ran |no longer|waits for)/i.test(s)) return;
      if (s.length < 12) return;
      out.push({ text:s, code:t.code });
    });
  });
  return out;
}

function buildGuide(subject, exclude, api){
  const h = api.h;
  let near = [];
  try { near = h.similar(subject, exclude, 14, 0.26) || []; } catch(e){ near = []; }
  const done = near.map(x => x.task).filter(t => t.status === "done");
  if (!done.length) return null;

  const steps = mergeSteps(done);
  const notes = done.map(t => ({ code:t.code, text:String(t.notes || "").trim() }))
                    .filter(x => x.text.length > 20);
  const scripts = {};
  done.forEach(t => (t.scripts || []).forEach(id => scripts[id] = (scripts[id] || 0) + 1));
  const scriptList = Object.keys(scripts)
    .map(id => ({ id, n:scripts[id], file:((api.scripts || []).find(s => s.id === id) || {}).file || id }))
    .sort((a, b) => b.n - a.n);

  const parties = {};
  done.forEach(t => (t.waitLog || []).forEach(w => { if (w && w.party) parties[w.party] = (parties[w.party] || 0) + 1; }));
  const partyList = Object.keys(parties).sort((a, b) => parties[b] - parties[a]);

  const hours = done.filter(t => t.created && t.completed)
    .map(t => (Date.parse(t.completed) - Date.parse(t.created)) / 3600000)
    .filter(x => x >= 0).sort((a, b) => a - b);
  const worked = done.map(h.live).filter(x => x > 0).sort((a, b) => a - b);
  const blocked = done.filter(t => (t.waitLog || []).length).length;

  return {
    from: done, n: done.length,
    steps: steps.filter(s => done.length < 3 || s.n >= 2).slice(0, 9),
    loose: steps.filter(s => done.length >= 3 && s.n === 1).slice(0, 4),
    notes, scriptList, partyList,
    hours: hours.length ? hours[hours.length >> 1] : 0,
    worked: worked.length ? worked[worked.length >> 1] : 0,
    blocked, work: workNotes(done).slice(0, 4),
    best: done[0]
  };
}

intent("guide", {
  kind:"read", label:"How you usually do this",
  cues:{ guide:9, walk:7, resolve:8, resolving:8, approach:8, procedure:9, process:7,
         steps:5, runbook:10, playbook:10, method:8, handle:6, tackle:5, fix:5,
         normally:6, usually:6, habit:7, routine:2 },
  phrases:[["how do i resolve",14],["how do i fix",13],["how do i handle",14],
           ["walk me through",14],["guide me",14],["how do i usually",14],
           ["what do i normally do",14],["how do i approach",14],["what did i do last time",18],["what did i do the last",18],
           ["give me the steps",13],["what are the steps",13],["how is this done",12],
           ["talk me through",14],["show me how i",13],["what is my process",14],
           ["how to resolve",15],["how to fix",15],["how to handle",15],["how to deal with",15],
           ["the procedure for",15],["the runbook for",15],["the usual way to",14],
           ["standard approach",14],["how it is done",13]],
  /* naming a system, a work type or a record means you are asking about the
     job. Naming a part of the app means you are asking about the app. */
  boost:{ record:6, system:5, type:4 },
  run(A){
    const api = A.api, h = api.h, s = A.slots;
    const t = s.record;
    const subject = t ? t.title : A.raw
      .replace(/^.*?\b(how do i|walk me through|guide me|talk me through|show me how i|what are the steps (for|to)?|give me the steps (for|to)?|what do i normally do (about|with|for)?)\b\s*/i, "")
      .replace(/\b(usually|normally|again|this one|this)\b/gi, " ")
      .replace(/\s+/g, " ").trim();

    if (!subject || subject.length < 4)
      return { say:"Which one? Give me a code, or say what it is — \"how do I resolve an imaging pool crash\".",
               awaiting:{ intent:"guide", slot:"record" } };

    const g = buildGuide(subject, t ? t.id : null, api);
    if (!g){
      /* no history — fall back to the general checklist rather than nothing */
      const e = kbFind(meaningful(words(normalise(subject))), normalise(subject));
      return { say: e
                 ? say(["Nothing of yours to go on, so here is the general version.",
                        "You have not closed one like this — the general checklist instead.",
                        "First time for this. Here is where most people start."], {}, A.norm)
                 : say(["I have nothing on that — not from your records and not generally.",
                        "First time for this one, and it is outside what I know generally too.",
                        "Nothing of yours looks similar, and I have no general checklist for it."], {}, A.norm),
               note:(e ? kbLines(e) + "\n\n" : "") +
                    "Once you close it with a note and a checklist, I will hand your own version back next time." };
    }

    /* the procedure, as a numbered thing you can follow */
    const lines = [];
    if (g.steps.length){
      g.steps.forEach((st, i) => {
        const every = st.n === g.n && g.n > 1;
        lines.push((i + 1) + ". " + st.text +
          (g.n > 1 ? "   (" + (every ? "every time" : st.n + " of " + g.n) + ")" : ""));
      });
    }
    if (g.loose.length)
      lines.push("", "Came up once, may not apply: " + g.loose.map(x => x.text).join("; ") + ".");

    const detail = [];
    if (g.scriptList.length)
      detail.push("You ran " + g.scriptList.map(x => x.file + (x.n > 1 ? " (" + x.n + "×)" : "")).join(" and ") + ".");
    if (g.partyList.length)
      detail.push("It went through " + andList(g.partyList, 3) + " " +
        (g.blocked === g.n ? "every time" : g.blocked + " of " + g.n + " times") + " — worth warning them early.");
    if (g.hours)
      detail.push("Usually about " + (g.hours < 24 ? Math.round(g.hours) + "h" : Math.round(g.hours / 24) + "d") +
        " end to end" + (g.worked ? ", of which " + h.mins(Math.round(g.worked)) + " was hands-on" : "") + ".");
    if (g.notes.length)
      detail.push("", "What you wrote last time (" + g.notes[0].code + "):", g.notes[0].text);
    if (g.work.length)
      detail.push("", "From the work log:", g.work.map(w => "· " + w.text + "  [" + w.code + "]").join("\n"));

    return {
      say: say(g.n === 1
             ? ["You have done this once — {code}. Here is how it went.",
                "Only one to go on, {code}, but here it is.",
                "One previous, {code}. What you did:"]
             : ["You have done this {n} times. Here is what it usually takes.",
                "{n} of these behind you — this is the shape of it.",
                "Going by the {n} you have closed, here is how it goes."],
             { n:g.n, code:g.best.code }, A.norm),
      note: lines.join("\n") + (lines.length && detail.length ? "\n\n" : "") + detail.join("\n"),
      rows: g.from.slice(0, 5).map(x => row(x, api,
        (x.completed ? "closed " + h.niceDate(h.dayOf(x.completed)) : "") +
        ((x.checklist || []).length ? " · " + x.checklist.length + " steps" : "") +
        ((x.scripts || []).length ? " · script" : ""))),
      chips: (t && g.steps.length)
        ? [{ label:"Put these steps on " + t.code,
             act:{ kind:"applySteps", id:t.id, steps:g.steps.map(x => x.text),
                   confirm:"Add " + g.steps.length + " steps to " + t.code + "?" } }]
        : (g.scriptList.length && t)
          ? [{ label:"Attach " + g.scriptList[0].file,
               act:{ kind:"attachScript", id:t.id, scriptId:g.scriptList[0].id,
                     confirm:"Attach " + g.scriptList[0].file + " to " + t.code + "?" } }]
          : [{ label:"Open " + g.best.code, act:{ kind:"open", id:g.best.id } }]
    };
  }
});

/* ── finding the right entry, and knowing when yours beats it ────────── */

function kbBest(mw, norm){
  let best = null, bestScore = 0;
  for (const id in KB){
    const e = KB[id], words = e.words.split(" ");
    let s = 0;
    /* "deadlock" or "certificate" on its own is enough to know which entry is
       meant — one exact word was scoring 2 against a threshold of 4, so the
       single most obvious question about each entry missed it */
    mw.forEach(w => variants(w).forEach(v => { if (words.indexOf(v) >= 0) s += 3; }));
    words.forEach(w => { if (w.length > 6 && norm.indexOf(w) >= 0) s += 1; });
    if (s > bestScore){ bestScore = s; best = e; }
  }
  return { entry: bestScore >= 4 ? best : null, score: bestScore };
}
function kbFind(mw, norm){ return kbBest(mw, norm).entry; }

function kbLines(e){
  const out = [];
  if ((e.signs || []).length){ out.push("What it looks like:"); e.signs.forEach(s => out.push("  · " + s)); }
  if ((e.check || []).length){
    out.push("", "First things to check:");
    e.check.forEach((s, i) => out.push("  " + (i + 1) + ". " + s));
  }
  if ((e.causes || []).length){ out.push("", "Usually it turns out to be:"); e.causes.forEach(s => out.push("  · " + s)); }
  if ((e.capture || []).length){
    out.push("", "Worth capturing now, before it is gone:");
    e.capture.forEach(s => out.push("  · " + s));
  }
  if (e.note) out.push("", e.note);
  return out.join("\n");
}

intent("troubleshoot", {
  kind:"read", label:"What to check",
  cues:{ check:7, diagnose:9, troubleshoot:10, debug:8, investigate:8, cause:6, causes:7,
         wrong:4, failing:5, broken:6, error:5, failure:5, symptom:8, why:3, first:2 },
  phrases:[["what should i check",14],["what do i check",14],["where do i start with",13],
           ["how do i diagnose",14],["what causes",13],["what would cause",14],
           ["troubleshoot",13],["what is wrong with",12],["help me with",11],
           ["what do i look at",13],["first things to check",15],["where to look",12],
           ["what should i capture",15],["what to capture",15],["what do i keep",13],
           ["what evidence",14],["for the audit",13],["what should i grab",13]],
  boost:{ record:4, system:3 },
  /* A probe should say how sure it is, not simply that it matched. A flat
     bonus let one generic word — "pending" appearing in the claims entry —
     outvote the intent that actually knew the answer, and "whats pending with
     others" came back about claim workflow. */
  probe(mw, norm){
    const m = kbBest(mw, norm);
    return m.score >= 9 ? 9 : m.score >= 6 ? 4 : 0;
  },
  run(A){
    const api = A.api, s = A.slots;
    /* strip the question frame before searching your own records: "what
       should I check for an imaging pool crash" searched literally dilutes
       the words that matter with words that do not */
    const bare = String(A.raw)
      .replace(/^.*?\b(what should i check(?: for| on| with)?|what do i check(?: for| on| when)?|first things to check(?: for| on)?|how do i (?:diagnose|troubleshoot|debug|fix)|what causes?|what would cause|troubleshoot|help me with|what is wrong with|where do i start with)\b\s*/i, "")
      .replace(/\b(an?|the|my|our)\b\s*/gi, " ")
      .replace(/\s+/g, " ").trim();
    const subject = s.record ? s.record.title : (bare.length > 3 ? bare : A.raw);
    const mw = s.record ? meaningful(words(normalise(s.record.title))).concat(A.mw) : A.mw;
    const e = kbFind(mw, normalise(subject) + " " + A.norm);

    /* your own history beats anything general, every time */
    const g = buildGuide(subject, s.record ? s.record.id : null, api);

    if (!e && !g)
      return { say: say(["I do not have anything on that.",
                         "That one is outside what I know.",
                         "Nothing here covers that."], {}, A.norm),
               note:"I know about " + andList(Object.keys(KB).map(k => KB[k].name.toLowerCase()), 6) +
                    " and around " + (Object.keys(KB).length - 6) + " others — and about anything " +
                    "you have closed before, which is better." };

    if (g && g.n >= 2){
      /* you have done this before: lead with that, and offer the general
         checklist underneath rather than instead */
      const steps = g.steps.slice(0, 6).map((st, i) => (i + 1) + ". " + st.text +
        (g.n > 1 ? "   (" + (st.n === g.n ? "every time" : st.n + " of " + g.n) + ")" : ""));
      return {
        say: say(["You have handled this {n} times — your own way first.",
                  "Before anything general: you have done this {n} times.",
                  "{n} of these behind you, so start with what worked."],
                 { n:g.n }, A.norm),
        note: steps.join("\n") +
              (g.scriptList.length ? "\n\nYou ran " + g.scriptList[0].file + " each time." : "") +
              (e ? "\n\n— If that does not cover it —\n\n" + kbLines(e) : ""),
        rows: g.from.slice(0, 4).map(x => row(x, api, "closed " + api.h.niceDate(api.h.dayOf(x.completed)))),
        chips: (s.record && g.steps.length)
          ? [{ label:"Put these steps on " + s.record.code,
               act:{ kind:"applySteps", id:s.record.id, steps:g.steps.map(x => x.text),
                     confirm:"Add " + g.steps.length + " steps to " + s.record.code + "?" } }] : []
      };
    }

    if (!e)
      return { say:"Nothing general on that, but you have closed one like it: " + g.best.code + ".",
               note:g.notes.length ? g.notes[0].text : "",
               rows:g.from.slice(0, 4).map(x => row(x, api, "closed")) };

    return {
      say: say(["{name}. Here is where I would start.",
                "That sounds like {lower}. Start here.",
                "{name} — the usual first moves."],
               { name:e.name, lower:e.name.charAt(0).toLowerCase() + e.name.slice(1) }, A.norm),
      note: kbLines(e) +
            (g ? "\n\n— You have one like this on file —\n" + g.best.code + ": " +
                 (g.notes.length ? g.notes[0].text : g.best.title) : ""),
      rows: g ? g.from.slice(0, 3).map(x => row(x, api, "closed")) : [],
      chips: s.record
        ? [{ label:"Open " + s.record.code, act:{ kind:"open", id:s.record.id } }]
        : [{ label:"Have I had this before?",
             act:{ kind:"say", text:"have i had " + String(subject).slice(0, 50) + " before" } }]
    };
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   BEING SPOKEN TO

   It could tell you what was overdue and could not answer "hi". That is not
   an assistant, it is a query box with a chat window around it — and the
   first thing anyone types is a greeting.

   None of this is padding. A greeting is where you find out whether the thing
   is listening; being asked what it is deserves a straight answer rather than
   silence; and "sorry, that came out wrong" needs somewhere to land. What it
   must never do is pretend: it is not a person, it did not have a weekend,
   and it does not have opinions about the weather.

   The rule throughout: acknowledge, be brief, and get back to something
   useful. Nobody opened a work tool to chat.
   ═══════════════════════════════════════════════════════════════════════════ */

function partOfDay(h){
  const hr = h.getHours ? h.getHours() : new Date().getHours();
  return hr < 5 ? "night" : hr < 12 ? "morning" : hr < 17 ? "afternoon" : hr < 22 ? "evening" : "night";
}

/* a greeting that has actually looked at the day is worth more than "hello" */
function openingLine(A){
  const api = A.api, h = api.h, k = h.today();
  const liveOnes = api.tasks.filter(x => h.LIVE.indexOf(x.status) >= 0);
  const over = liveOnes.filter(x => x.due && x.due < k);
  const today = liveOnes.filter(x => x.due && x.due === k);
  const waits = liveOnes.filter(x => x.waitOn);
  if (!api.tasks.length) return { line:"", chips:[] };
  if (over.length)
    return { line: today.length
               ? say(["{n} overdue and {t} due today.",
                      "You have {n} past their date and {t} more due today.",
                      "{n} overdue — {t} due today on top."],
                     { n:over.length, t:today.length }, A.norm)
               : say(["{n} overdue, nothing else due today.",
                      "You have {n} past their date and nothing new due.",
                      "{n} overdue — that is the whole of it."],
                     { n:over.length }, A.norm),
             chips:[{ label:"Show me the overdue", act:{ kind:"say", text:"what is overdue" } },
                    { label:"What should I do first", act:{ kind:"say", text:"what should i do next" } }] };
  if (today.length)
    return { line: say(["{t} due today, nothing overdue.",
                        "Nothing late — {t} on today.",
                        "{t} on today and nothing behind."],
                       { t:today.length }, A.norm),
             chips:[{ label:"What's on today", act:{ kind:"say", text:"what is due today" } }] };
  if (waits.length)
    return { line: say(["Nothing due, though {w} are sitting with other people.",
                        "Your side is clear — {w} waiting on someone else.",
                        "Nothing on you today. {w} out with others."],
                       { w:waits.length }, A.norm),
             chips:[{ label:"Who has them", act:{ kind:"say", text:"who am i waiting on" } }] };
  return { line: say(["Nothing overdue, nothing due today.",
                      "Board's clear.",
                      "Nothing pressing."], {}, A.norm),
           chips:[{ label:"Anything I should know", act:{ kind:"say", text:"anything i should know" } }] };
}

intent("greet", {
  kind:"social",
  /* only when it is the whole message, not a preamble to one */
  only(mw){ return mw.length <= 3; }, label:"Hello",
  cues:{ hi:12, hello:12, hey:11, morning:8, afternoon:8, evening:8, yo:9, hiya:12,
         howdy:12, greetings:11, sup:9, wassup:12, heya:12, hii:11, helo:11,
         hallo:11, aloha:11, salut:10, oi:8, knock:7 },
  phrases:[["whats up",13],["what is up",12],
           ["good morning",14],["good afternoon",14],["good evening",14],["good day",13],
           ["hi there",14],["hello there",14],["hey there",14],["morning all",13],
           ["are you there",13],["you there",12],["you awake",12],["anyone there",13],
           ["hey you",12],["long time",10],["im back",11],["i am back",11],["back again",11]],
  run(A){
    const when = partOfDay(new Date());
    const o = openingLine(A);
    /* said hello already this conversation — do not start over */
    if (A.convo && A.convo.greeted)
      return { say: say(["Still here.", "Hello again.", "Yes?", "Go on."], {}, A.norm),
               greeted:true };
    const hello = when === "morning" ? one(["Morning.", "Good morning.", "Morning —"], A.norm)
                : when === "afternoon" ? one(["Afternoon.", "Good afternoon.", "Hello —"], A.norm)
                : when === "evening" ? one(["Evening.", "Good evening.", "Hello —"], A.norm)
                : one(["Hello.", "Still at it?", "Evening —"], A.norm);
    return {
      say: hello + (o.line ? " " + o.line : " What do you need?"),
      note: api0(A) ? "" : "",
      chips: o.chips.length ? o.chips : [{ label:"What can you do", act:{ kind:"say", text:"what can you do" } }],
      greeted: true
    };
  }
});
function api0(A){ return false; }

intent("identity", {
  kind:"social", label:"What I am",
  cues:{ robot:9, bot:8, machine:7, human:8, real:5, person:5, sentient:10, conscious:10,
         chatgpt:12, gpt:11, gemini:11, llm:12, model:5, trained:8, learn:3 },
  phrases:[["who are you",16],["what are you",16],["who am i talking to",16],
           ["what is your name",16],["whats your name",16],["do you have a name",15],
           ["are you an ai",16],["are you a bot",16],["are you a robot",16],
           ["are you human",16],["are you real",15],["are you chatgpt",16],
           ["who made you",15],["who built you",15],["who created you",15],
           ["are you alive",15],["do you think",13],["are you conscious",15],
           ["how do you work",18],["how do you do that",17],["how were you made",15],
           ["what model are you",16],
           ["are you connected to the internet",16],["do you send my data",16],
           ["where does my data go",15],["is this private",14],
           ["how old are you",18],["what is your age",17],["how long have you been here",16],
           ["are you smart",16],["are you clever",16],["are you intelligent",16],
           ["how clever are you",16],["can you think",15],["do you understand english",16],
           ["do you learn",15],["can you learn",15],["do you remember me",15],
           ["do you get bored",15],["do you sleep",15],["do you have feelings",16],
           ["are you a language model",17],["do you use ai",16],["are you offline",15]],
  run(A){
    const api = A.api;
    const n = api.tasks.length;
    return {
      say: say(["I'm the assistant built into Dossier. Not a person, and not a language model either.",
                "I'm part of Dossier — no model behind me, and no connection to anything.",
                "I'm Dossier's assistant. Nothing clever: arithmetic over your own records."],
               {}, A.norm),
      note: "Everything I say comes from counting what's in this workspace" +
            (n ? " — " + qty(n, "record") + " at the moment" : "") + ", plus a set of " +
            "checklists for the kind of problems this job throws up.\n\n" +
            "I run entirely on this PC. Nothing is downloaded, nothing is sent anywhere, and " +
            "there is no model to call — which is why I work with the network off and why I " +
            "cannot hold a conversation about anything outside your work.\n\n" +
            "That also means I can't invent an answer. If I don't know, I say so.",
      chips:[{ label:"What can you do", act:{ kind:"say", text:"what can you do" } },
             { label:"What is Dossier", act:{ kind:"say", text:"what is dossier" } }]
    };
  }
});

intent("howareyou", {
  kind:"social",
  /* only when it is the whole message, not a preamble to one */
  only(mw){ return mw.length <= 3; }, label:"How I am",
  cues:{},
  phrases:[["how are you",16],["how are things with you",16],["how you doing",16],
           ["how do you do",15],["you ok",14],["you alright",14],["are you well",14],
           ["hows it going with you",15],["you good",13],["everything ok with you",15],
           ["how was your weekend",15],["how is your day",15],["you busy",13],["you tired",13],
           ["how is life",16],["hows life",16],["how is everything",15],["how goes it",15],
           ["you still awake",16],["you still there",15],["still with me",15],
           ["what are you up to",16],["having a good day",15],["you having fun",15],
           ["hows your day going",16],["you enjoying yourself",15],["all good with you",15]],
  run(A){
    const api = A.api;
    const live = api.tasks.filter(x => api.h.LIVE.indexOf(x.status) >= 0).length;
    return {
      say: say(["Nothing to report — I don't have days. You've {n} open, though.",
                "I'm a counter, so: fine. You've {n} open.",
                "Same as always. Your side: {n} open."],
               { n:live }, A.norm),
      chips:[{ label:"What should I do next", act:{ kind:"say", text:"what should i do next" } }]
    };
  }
});

intent("thanks", {
  kind:"social",
  /* only when it is the whole message, not a preamble to one */
  only(mw){ return mw.length <= 3; }, label:"Thanks",
  cues:{ thanks:13, thank:12, thx:13, ty:11, cheers:11, appreciated:12, appreciate:11,
         grateful:12, nice:4, lovely:8, brilliant:8, perfect:7, great:5 },
  phrases:[["thank you",16],["thanks a lot",16],["thanks very much",16],["many thanks",16],
           ["much appreciated",16],["that helps",14],["that helped",14],["you are a star",14],
           ["nice one",13],["good job",13],["well done",13],["that is great",12],
           ["exactly what i needed",15],["spot on",13],["perfect thanks",16]],
  run(A){
    return { say: say(["Any time.", "Glad it helped.", "No trouble.",
                       "That's what I'm here for.", "Pleased it was useful."], {}, A.norm) };
  }
});

intent("bye", {
  kind:"social", label:"Goodbye",
  cues:{ bye:13, goodbye:14, farewell:12, cya:12, ciao:11, adios:11 },
  phrases:[["see you",14],["see ya",14],["talk later",14],["catch you later",15],
           ["good night",15],["goodnight",15],["night night",15],["im off",14],
           ["i am off",14],["logging off",15],["signing off",15],["done for today",20],
           ["that is me done",18],["finished for the day",20],["going home",14],
           ["heading home",14],["end of shift",14],["clocking off",15],["until tomorrow",14],
           ["thanks bye",20],["thanks goodbye",20],["ok bye",18],["right bye",18],
           ["cheers bye",20],["thanks see you",20],["ok goodnight",19],["thanks good night",20],
           ["that is all for today",19],["im out",15],["i am out",15],["shutting down",15],
           ["packing up",16],["calling it a day",19],["knocking off",16]],
  run(A){
    const api = A.api, h = api.h, k = h.today();
    const liveOnes = api.tasks.filter(x => h.LIVE.indexOf(x.status) >= 0);
    const over = liveOnes.filter(x => x.due && x.due <= k);
    const unchased = liveOnes.filter(x => x.waitOn && !(x.chases || []).length && h.waitDays(x) > 2);
    const bits = [];
    if (over.length) bits.push(qty(over.length, "record") + " still dated today or earlier");
    if (unchased.length) bits.push(qty(unchased.length, "wait") + " nobody has chased");
    return {
      say: say(["Right — see you.", "Goodbye.", "See you tomorrow.", "Off you go."], {}, A.norm),
      note: bits.length ? "Before you go: " + andList(bits, 2) + "." : "",
      chips: over.length ? [{ label:"Show me those", act:{ kind:"say", text:"what is due today" } }] : []
    };
  }
});

intent("sorry", {
  kind:"social",
  /* only when it is the whole message, not a preamble to one */
  only(mw){ return mw.length <= 3; }, label:"No need",
  cues:{ sorry:13, apologies:13, apologise:13, apologize:13, oops:11, whoops:11 },
  phrases:[["my bad",14],["my mistake",14],["i was wrong",13],["ignore that",13],
           ["that came out wrong",14],["i meant",8],["let me rephrase",14],["scratch that",14]],
  run(A){
    return { say: say(["No need — ask again.",
                       "Nothing to apologise for. Try me again.",
                       "That's fine. What did you mean?",
                       "No harm done. Go on."], {}, A.norm) };
  }
});

intent("praise", {
  kind:"social",
  /* only when it is the whole message, not a preamble to one */
  only(mw){ return mw.length <= 3; }, label:"Glad it worked",
  cues:{ clever:11, smart:10, impressive:12, amazing:11, awesome:10, excellent:10,
         useful:9, helpful:10, brilliant:8 },
  phrases:[["that is clever",14],["you are good",13],["i like that",13],["that is useful",14],
           ["very helpful",14],["works well",12],["love it",13],["that is exactly",13]],
  run(A){
    return { say: say(["Good — it's your own records doing the work.",
                       "Glad it landed.",
                       "It's only counting what you've written down, but I'll take it."], {}, A.norm) };
  }
});

intent("complain", {
  kind:"social", label:"That missed",
  cues:{ useless:12, rubbish:12, stupid:11, dumb:11, terrible:11, awful:11, hopeless:12,
         nonsense:11, garbage:11 },
  phrases:[["that is wrong",14],["you are wrong",14],["not what i asked",16],
           ["that is not what i meant",16],["you do not understand",15],
           ["that makes no sense",15],["you did not answer",15],["that is not right",14],
           ["wrong answer",14],["you missed",13],["not helpful",14],["that is useless",14]],
  run(A){
    return {
      say: say(["Fair enough — I read it wrong.",
                "Sorry, that missed. Let me try again.",
                "I got that wrong."], {}, A.norm),
      note:"Say it another way and I'll have another go. If I keep missing something you ask " +
           "often, pick the right one from the buttons I offer and I'll remember that phrasing " +
           "for next time.",
      chips:[{ label:"What can you do", act:{ kind:"say", text:"what can you do" } }]
    };
  }
});

intent("feeling", {
  kind:"social", label:"Long day",
  cues:{ tired:11, exhausted:12, knackered:12, stressed:12, overwhelmed:12, swamped:9,
         drowning:11, fed:6, frustrated:12, annoyed:11, bored:10, sick:7,
         ugh:14, argh:14, aargh:14, meh:6, chaos:11, mess:8, hate:9, relentless:12,
         nonstop:11, burnout:13, burnt:7, shattered:11, wrecked:10, hopeless:6,
         miserable:12, headache:12, brutal:10, grind:9, monday:6, mondays:8 },
  phrases:[["long day",14],["rough day",14],["bad day",14],["hard day",14],
           ["i am tired",14],["im tired",14],["i am done",12],["too much",10],
           ["fed up",14],["cannot cope",14],["losing my mind",14],["so busy",12],
           ["need a break",14],["need coffee",13],["hate this",12],
           ["this is a mess",16],["what a mess",16],["everything is broken",16],
           ["why is everything broken",17],["nothing is working",16],
           ["i cannot focus",16],["cant focus",16],["i cannot think",15],
           ["my head hurts",16],["i have a headache",16],["i hate mondays",16],
           ["i hate this job",16],["sick of this",16],["over it",13],["had enough",15],
           ["killing me",15],["no energy",14],["burnt out",16],["burned out",16],
           ["im drowning",16],["i am drowning",16],["so much work",14],
           ["never ends",15],["not going well",15],["going badly",15],
           ["worst day",15],["everything at once",15],["pulling my hair out",17]],
  run(A){
    const api = A.api, h = api.h, k = h.today();
    const closed = api.tasks.filter(x => x.status === "done" && h.dayOf(x.completed) === k);
    const liveOnes = api.tasks.filter(x => h.LIVE.indexOf(x.status) >= 0);
    const quick = liveOnes.filter(x => +x.estimate && +x.estimate <= 15 && x.due && x.due <= k);
    return {
      say: say(["Sounds like it \u2014 here is where you actually are.",
                "Understood. For what it is worth, this is the shape of it.",
                "Right. It may help to see it as a number rather than a feeling.",
                "That kind of day. Here is what is actually on the pile."], {}, A.norm),
      note: (closed.length
              ? "For what it's worth you've closed " + qty(closed.length, "record") + " today.\n"
              : "") +
            (quick.length
              ? "If you want something easy: " + qty(quick.length, "record") +
                " due today under a quarter of an hour each."
              : liveOnes.length
                ? "There are " + qty(liveOnes.length, "record") + " open. I can pick one if that helps."
                : "Nothing's open. That's something."),
      chips: quick.length
        ? [{ label:"Show me the quick ones", act:{ kind:"filter", ids:quick.map(x => x.id), label:"Quick wins" } }]
        : [{ label:"What should I do next", act:{ kind:"say", text:"what should i do next" } }]
    };
  }
});

intent("joke", {
  kind:"social", label:"Not my department",
  cues:{ joke:13, funny:11, laugh:11, poem:12, song:11, story:8, riddle:12, game:9 },
  phrases:[["tell me a joke",16],["make me laugh",16],["cheer me up",15],
           ["say something funny",16],["sing me",14],["entertain me",15]],
  run(A){
    return { say: say(["Not my department, I'm afraid.",
                       "You'd be disappointed — I only know your records.",
                       "I'd be terrible at it."], {}, A.norm),
             note:"I can tell you what's overdue, which is rarely funnier." };
  }
});

intent("affirm", {
  kind:"social",
  /* only when it is the whole message, not a preamble to one */
  only(mw){ return mw.length <= 3; }, label:"Go on",
  cues:{},
  phrases:[["yes",14],["yep",14],["yeah",14],["yup",14],["sure",13],["ok",12],["okay",12],
           ["please do",15],["go on",14],["go ahead",15],["do it",14],["sounds good",14],
           ["that one",12],["correct",12],["right",10]],
  run(A){
    /* a bare yes with nothing pending is just politeness */
    return { say: say(["What would you like?",
                       "Go on then — ask me.",
                       "Ready when you are."], {}, A.norm),
             chips:[{ label:"What should I do next", act:{ kind:"say", text:"what should i do next" } },
                    { label:"Anything I should know", act:{ kind:"say", text:"anything i should know" } }] };
  }
});

intent("nevermind", {
  kind:"social",
  /* only when it is the whole message, not a preamble to one */
  only(mw){ return mw.length <= 3; }, label:"Dropped",
  cues:{ forget:11, cancel:6, nevermind:14, whatever:10 },
  phrases:[["never mind",16],["forget it",15],["forget that",15],["dont worry",14],
           ["do not worry",14],["leave it",14],["it does not matter",14],["skip it",14],
           ["not important",13],["ignore me",14]],
  run(A){
    return { say: say(["Dropped.", "Fine.", "Forgotten.", "As you like."], {}, A.norm),
             clearContext:true };
  }
});

intent("repeat", {
  kind:"social", label:"Again",
  cues:{ repeat:12, again:5, pardon:12, sorry:2 },
  phrases:[["say that again",16],["what did you say",16],["come again",15],
           ["i missed that",15],["one more time",14],["what was that",15],
           ["what did i just ask",16],["what did i ask",15],["what was my last question",16],
           ["what have i asked",14]],
  run(A){
    const c = A.convo || {};
    if (!c.lastIntent)
      return { say: say(["Nothing yet — this is where we started.",
                         "You haven't asked me anything in this conversation yet."], {}, A.norm) };
    const it = INTENTS.find(x => x.name === c.lastIntent);
    return { say: say(["You asked about {what}. Here it is again.",
                       "Last thing was {what}.",
                       "{what} — again:"],
                      { what:(it ? it.label.toLowerCase() : c.lastIntent) }, A.norm),
             chips:[{ label:"Ask it again", act:{ kind:"rerun", intent:c.lastIntent } }] };
  }
});

/* ── things it genuinely knows the answer to ─────────────────────────── */

intent("clock", {
  kind:"read", label:"The time",
  cues:{ time:5, clock:11, oclock:13 },
  phrases:[["the time",12],["what time is it",16],["whats the time",16],["what is the time",16],
           ["do you have the time",15],["time now",13],["current time",14],
           ["how long until",12],["how long till",12],["time left",11],["how much of the day",14]],
  run(A){
    const now = new Date();
    const hh = pad2(now.getHours()), mm = pad2(now.getMinutes());
    const endMin = 17 * 60 + 30;
    const left = endMin - (now.getHours() * 60 + now.getMinutes());
    return {
      say: say(["{t}.", "It's {t}.", "{t} — {part}."],
               { t:hh + ":" + mm, part:partOfDay(now) }, A.norm),
      note: left > 0
        ? A.api.h.mins(left) + " until 17:30."
        : left > -180 ? "Past 17:30 — " + A.api.h.mins(-left) + " over."
        : ""
    };
  }
});

intent("dateToday", {
  kind:"read", label:"The date",
  cues:{ date:6, today:2, day:4, month:5, year:4, weekend:6 },
  phrases:[["what is the date",16],["whats the date",16],["what date is it",16],
           ["what day is it",16],["what day is today",16],["is it friday",15],
           ["is it monday",15],["what is today",14],["todays date",15],
           ["what month is it",15],["what year is it",15],["how many days left in the month",16],
           ["how long until friday",15],["is it the weekend",15]],
  run(A){
    const api = A.api, h = api.h, k = h.today();
    const now = new Date();
    const dowName = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][now.getDay()];
    const eom = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const leftInMonth = eom - now.getDate();
    let toFri = (5 - now.getDay() + 7) % 7;
    return {
      /* niceDate says "Today" here, which is true and useless — a question
         about the date wants the date */
      say: say(["{d}, {full}.", "It's {d}, {full}.", "{full} — a {d}."],
               { d:dowName, full:now.getDate() + " " +
                 ["January","February","March","April","May","June","July","August",
                  "September","October","November","December"][now.getMonth()] +
                 " " + now.getFullYear() }, A.norm),
      note: (now.getDay() === 0 || now.getDay() === 6 ? "Weekend."
             : toFri === 0 ? "Friday — end of the week."
             : toFri + " working " + (toFri === 1 ? "day" : "days") + " to Friday.") +
            "  " + leftInMonth + " " + (leftInMonth === 1 ? "day" : "days") + " left in the month."
    };
  }
});

intent("smalltalk", {
  kind:"social", label:"Outside what I know",
  cues:{ weather:12, rain:9, hot:7, cold:7, football:11, news:9, politics:11, sport:10,
         food:8, lunch:7, holiday:4, movie:11, film:11, music:9, recipe:11, restaurant:11,
         capital:9, president:11, election:11, currency:8, translate:8, wikipedia:12,
         google:10, celebrity:11, cricket:11, tennis:10, worldcup:12 },
  phrases:[["what is the weather",16],["is it raining",15],["whats the news",15],
           ["did you see",12],["what do you think about",13],["your opinion on",14],
           ["do you like",13],["favourite",12],["favorite",12],
           ["who won",15],["who is winning",15],["what is the score",15],
           ["what should i eat",16],["where should i eat",16],["what is for lunch",15],
           ["what is the capital",16],["who is the president",16],["how do you say",14],
           ["what does that word mean",15],["tell me about the world",15]],
  run(A){
    return { say: say(["I've no idea — I only see this workspace.",
                       "Outside what I know, I'm afraid.",
                       "Can't help there. Nothing outside your records reaches me."], {}, A.norm),
             note:"No network, no model, nothing but what's in your folder." };
  }
});

/* ═══ ABOUT DOSSIER ITSELF ═══════════════════════════════════════════════
   "What is this application used for" once answered "11 systems on the
   list", and "how do I create a routine" answered "5 records came in
   today". Both were questions about the app, and the app had nothing to
   say about itself.

   The knowledge below is the only content in this file that is not read out
   of your workspace, because it is about the software rather than the work.
   It is kept as facts — where a thing lives, what it is for, what to press —
   and turned into sentences at the point of asking, like everything else. */

const GUIDE = [
  { id:"routine", name:"a routine or schedule",
    words:"routine routines schedule scheduled scheduling recurring repeat repeating cron daily weekly automatic automate",
    where:"Menu (⋯) → Routines",
    how:["Open Menu → Routines and fill in the form at the top.",
         "Give it a name, then pick how often: weekdays, daily, weekly, monthly, or cron for anything else.",
         "Set Remind me to Yes if you want a notification each time — it starts at No, and a schedule with it off just raises a record and stays silent.",
         "Under What it does you can attach a script, which the runner will execute when it fires."],
    tip:"Or just tell me: \"remind me every 30 minutes to drink water\" and I will set it up for you." },

  { id:"script", name:"a script",
    words:"script scripts bat batch automation automate runner execute run powershell",
    where:"the scripts folder in your workspace",
    how:["Drop the .bat file into the scripts folder inside your workspace folder.",
         "Open Menu → Scripts and press Rescan; Dossier picks up anything new.",
         "Attach it to a record from that record's Scripts section, then press Run.",
         "For it to actually execute rather than just hand you the command line, dossier-runner.bat has to be running."],
    tip:"Ask me \"what scripts do I have\" to see the ones it already knows about." },

  { id:"record", name:"a record",
    words:"record records task tasks ticket log logging capture raise create add new entry",
    where:"the compose bar at the top",
    how:["Type into the bar at the top and press Enter.",
         "Shorthand saves typing: p1 for priority, @System, :Type, ~Name for who raised it, 2h for an estimate, and today or friday for a date.",
         "So: restart imaging pool p1 @Imaging ~Sokha 30m today.",
         "Ctrl+V pastes a screenshot straight onto whichever record is open."],
    tip:"Or say \"log imaging pool crash p1 @Imaging today\" here and I will offer it for you to confirm." },

  { id:"notification", name:"Windows notifications",
    words:"notification notifications notify alert alerts popup pop toast windows desktop bell remind reminders",
    where:"the bell in the top right, and Menu → Setup → Reminders",
    how:["Press the bell in the top right to switch reminders on.",
         "The browser then asks for permission — allow it, and reminders appear as Windows notifications even when the tab is behind Outlook.",
         "Opening dossier.html straight from the folder blocks them: Chrome and Edge refuse notification permission on file:// with no way to allow it.",
         "Run dossier-serve.bat instead, which serves the same file from 127.0.0.1 where permission can be granted."],
    tip:"I can turn them on for you — just say \"turn on notifications\"." },

  { id:"workspace", name:"the workspace folder",
    words:"workspace folder save saving saved backup backups file files where storage store data lost",
    where:"Menu → Workspace",
    how:["Press Choose workspace folder and pick a folder on your PC.",
         "Everything lives there as ordinary files: dossier.json for the records, tasks/ for attachments, scripts/, lang/ and backups/.",
         "It saves as you work, and keeps 30 daily backups in backups/.",
         "Nothing is uploaded anywhere — Dossier makes no network calls at all."],
    tip:"Until you pick a folder, records only exist in the browser tab." },

  { id:"chase", name:"chasing someone",
    words:"chase chasing chased waiting wait vendor party follow followup nudge remind them",
    where:"a record's Waiting on someone else section",
    how:["On the record, open Waiting on someone else and set who has it and why.",
         "Dossier then counts the days and tells you when they have gone quiet for longer than that person usually takes.",
         "Press Chase them to log a chase; press They came back to clear it."],
    tip:"Ask me \"who has gone quiet\" and I will tell you who to chase first." },

  { id:"attach", name:"attaching a document",
    words:"attach attachment document documents file upload screenshot email msg drop evidence",
    where:"a record's Documents section",
    how:["Open the record and drop files onto the Documents box.",
         "They are copied into tasks/<record>/ inside your workspace folder.",
         "Ctrl+V pastes a screenshot straight in without saving it first."],
    tip:"Those files are ordinary unencrypted files — worth remembering if the folder ever sits on shared storage." },

  { id:"holiday", name:"holidays and leave",
    words:"holiday holidays leave festival public calendar off nonworking",
    where:"Menu → Setup → Holidays and festivals",
    how:["Open Menu → Setup → Holidays and festivals.",
         "Paste a whole year as JSON, or add a date range in one go rather than one day at a time.",
         "Dossier then skips them when it works out target dates."],
    tip:"" },

  { id:"language", name:"the language",
    words:"language languages khmer english translate translation locale xml",
    where:"Menu → Setup → Language",
    how:["Language files live in the lang folder as XML, one per language.",
         "Each phrase is a <text name= source= value= /> line; fill in value to translate it.",
         "Pick the language in Menu → Setup. Anything left untranslated falls back to English rather than going blank."],
    tip:"" },

  { id:"assist", name:"the Assist tab",
    words:"assist tab detector detectors surge stalled runbook suggestion suggestions insight",
    where:"the Assist tab, or press 7",
    how:["Press 7 or click Assist.",
         "The left column ranks what to do next and says why each one is there.",
         "The right column is what noticed itself: a system failing more than usual, a wait gone quiet, work that stopped moving, or something you have already solved once."],
    tip:"" },

  { id:"backup", name:"backups and safety",
    words:"backup backups restore export import csv json safe copy",
    where:"Menu → Workspace",
    how:["A dated backup is written to backups/ each day, and 30 are kept.",
         "Export a JSON copy or a CSV from Menu → Workspace at any time.",
         "Import a JSON export from the same place."],
    tip:"" },

  { id:"shortcut", name:"keyboard shortcuts",
    words:"shortcut shortcuts keyboard key keys hotkey press",
    where:"press ?",
    how:["Press ? for the full sheet.",
         "1 to 7 switch views, N starts a new record, / searches, A opens me, W is the work console.",
         "J and K move the cursor, Enter opens, Space cycles status, D marks done."],
    tip:"" }
];

function guideBest(mw, norm){
  let best = null, bestScore = 0;
  GUIDE.forEach(g => {
    const words = g.words.split(" ");
    let s = 0;
    mw.forEach(w => variants(w).forEach(v => { if (words.indexOf(v) >= 0) s += 2; }));
    if (norm.indexOf(g.id) >= 0) s += 3;
    if (s > bestScore){ bestScore = s; best = g; }
  });
  /* One shared word is not a topic. "How do I resolve a payroll export
     failure" hit the backups page because the word "export" appears in it,
     and answered a question about the job with a menu path. */
  return { entry: bestScore >= 4 ? best : null, score: bestScore };
}
function guideFor(mw, norm){ return guideBest(mw, norm).entry; }

intent("howTo", {
  kind:"read", label:"How to do something",
  /* "how do I create a routine" names a routine, which would otherwise hand
     the question to the intent that lists your routines */
  probe(mw, norm){
    if (!/\bhow (do|to|can|would)\b|\bwhere (do|is)\b/.test(norm)) return 0;
    const g = guideBest(mw, norm);
    return g.score >= 6 ? 12 : g.score >= 4 ? 6 : 0;
  },
  cues:{ how:5, where:4, add:3, create:3, make:3, set:3, setup:5, configure:6, enable:6,
         turn:3, use:4, work:2, do:2, change:3, find:2, attach:4, install:6, start:2 },
  phrases:[["how do i",12],["how to",12],["how can i",12],["where do i find",12],
           ["how do you",6],
           ["where do i put",12],["where do i go",10],["where is",6],
           ["how does",8],["show me how",12],["walk me through",12],["what do i press",10],
           ["is it possible to",9],["can i",5],["teach me",11],["explain how",12]],
  run(A){
    const g = guideFor(A.mw, A.norm);
    if (!g) return {
      say: say(["I am not sure which part you mean.",
                "I do not know that one.",
                "That one I cannot help with."], {}, A.norm),
      note:"I can explain: " + andList(GUIDE.map(x => x.name), 12) + ".",
      chips: GUIDE.slice(0, 4).map(x => ({ label:x.name, act:{ kind:"say", text:"how do i set up " + x.id } }))
    };
    return {
      say: say(["Setting up {name} — it lives in {where}.",
                "{Name}: you will find it under {where}.",
                "That is {where}.",
                "For {name}, go to {where}."],
               { name:g.name, Name:g.name.charAt(0).toUpperCase() + g.name.slice(1), where:g.where },
               A.norm),
      note: g.how.join("\n") + (g.tip ? "\n\n" + g.tip : ""),
      chips: g.id === "routine" ? [{ label:"Open Routines", act:{ kind:"panel", panel:"routine" } }]
           : g.id === "script"  ? [{ label:"Open Scripts", act:{ kind:"panel", panel:"scripts" } }]
           : g.id === "workspace" ? [{ label:"Open Workspace", act:{ kind:"panel", panel:"ws" } }]
           : g.id === "assist"  ? [{ label:"Open Assist", act:{ kind:"view", view:"assist" } }]
           : g.id === "notification" ? [{ label:"Turn them on",
               act:{ kind:"notify", on:true, confirm:"Switch reminders on?" } }]
           : g.id === "shortcut" ? [{ label:"Show the shortcuts", act:{ kind:"keys" } }]
           : [{ label:"Open Setup", act:{ kind:"panel", panel:"setup" } }]
    };
  }
});

intent("about", {
  kind:"read", label:"About Dossier",
  /* "this application" is this application; "which application gets raised
     most" is one of the systems you look after. The determiner tells them
     apart, and nothing else does. */
  probe(mw, norm){
    return /\b(?:this|the) (?:app|application|thing|tool|program|software|system)\b/.test(norm)
        || /\bdossier\b/.test(norm) ? 14 : 0;
  },
  /* nothing in a workspace is called "dossier" except the application */
  /* "this application" is Dossier; "applications" are the systems you look
     after. The singular lives in the phrases below so the plural cannot reach
     it through a suffix strip. */
  cues:{ dossier:14, program:9, software:9, tool:6, purpose:8,
         for:1, about:2, point:6, does:2, is:1 },
  phrases:[["what is this",12],["what is dossier",14],["what does this do",13],
           ["this application",13],["this app",13],["the application",11],
           ["what all this is",13],["all this is",11],["all this for",12],
           ["what is this app",14],["used for",12],["what is it for",13],
           ["the point of this",12],["why would i use",12],["what does it do",12],
           ["who made this",9],["what are you",10]],
  run(A){
    const api = A.api, h = api.h;
    const n = api.tasks.length;
    const live = api.tasks.filter(x => h.LIVE.indexOf(x.status) >= 0).length;
    const sys = {};
    api.tasks.forEach(x => { if (x.system) sys[x.system] = (sys[x.system] || 0) + 1; });
    const top = Object.keys(sys).sort((a, b) => sys[b] - sys[a]).slice(0, 3);
    return {
      say: say(["Dossier is a record of your support work — everything you are asked to do, what you did about it, and what is still owed.",
                "It is where your support work is written down: what came in, what you did, and what is still outstanding.",
                "Dossier keeps track of application-support work — the jobs, who asked, what you ran, and what is still open."],
               {}, A.norm),
      note: (n
        ? "Right now it holds " + qty(n, "record") + ", " + live + " of them still live" +
          (top.length ? ", mostly across " + andList(top, 3) : "") + ".\n\n"
        : "It is empty so far — log something and it starts learning from it.\n\n") +
        "Everything lives in one folder on this PC as ordinary files. Nothing is uploaded, " +
        "and there is no model anywhere in it: the Assist tab and I both work by counting " +
        "what is already in your own records.\n\n" +
        "The parts: the Day, Board, Register, Week and Library views for looking at work; " +
        "Insight for the numbers; Assist for what it noticed by itself; routines for anything " +
        "that repeats; scripts for the commands you keep re-running; and me for asking about it in words.",
      chips:[{ label:"What can you do", act:{ kind:"say", text:"what can you do" } },
             { label:"Open Assist", act:{ kind:"view", view:"assist" } }]
    };
  }
});

/* ═══ ABOUT ONE RECORD, IN DETAIL ════════════════════════════════════════
   The questions you ask once you are already looking at something. Each of
   these needs a record, and will take one from earlier in the conversation
   if the sentence only says "it". */

intent("steps", {
  kind:"read", label:"What is left to do",
  cues:{ step:9, steps:9, left:8, remaining:9, checklist:10, todo:8, outstanding:9,
         incomplete:9, unfinished:9, pending:5, next:3, still:5, complete:3, completed:4 },
  phrases:[["what is left",10],["whats left",10],["left to do",10],["steps left",10],
           ["still to do",10],["have not done",9],["havent done",9],["not completed",10],
           ["not finished",9],["what remains",10],["where was i",8],["how far",7]],
  boost:{ record:6 },
  run(A){
    const api = A.api, t = A.slots.record;
    if (!t) return { say:"Which record? Name it — \"what is left on D-0004\".",
                     awaiting:{ intent:"steps", slot:"record" } };
    const cl = t.checklist || [];
    if (!cl.length){
      const bits = [];
      if (t.waitOn) bits.push("It is waiting on " + t.waitOn + ".");
      if ((t.blockedBy || []).length) bits.push("It is held by " + t.blockedBy.length + " other record(s).");
      return { say: t.code + " has no steps written down.",
               note:(bits.join(" ") || "Open it and add a checklist if it needs one.") +
                    "\nStatus: " + api.h.stMeta(t.status).label + ".",
               chips:[{ label:"Open it", act:{ kind:"open", id:t.id } }] };
    }
    const left = cl.filter(c => !c.done), done = cl.length - left.length;
    if (!left.length)
      return { say:"All " + cl.length + " steps on " + t.code + " are ticked off.",
               note:"“" + t.title + "” is " + api.h.stMeta(t.status).label.toLowerCase() +
                    (api.h.LIVE.indexOf(t.status) >= 0 ? " — it may be ready to close." : "."),
               chips: api.h.LIVE.indexOf(t.status) >= 0
                 ? [{ label:"Mark it done", act:{ kind:"status", id:t.id, status:"done",
                                                  confirm:"Mark " + t.code + " done?" } }] : [] };
    return {
      say: left.length + " of " + cl.length + " steps still to do on " + t.code + ".",
      note: "“" + t.title + "” · " + done + " done" +
            (t.waitOn ? " · waiting on " + t.waitOn : ""),
      rows: left.map((c, i) => ({ id:t.id, code:"☐", text:c.text,
                                  sub:i === 0 ? "next" : "" })),
      chips:[{ label:"Open it", act:{ kind:"open", id:t.id } }]
    };
  }
});

intent("why", {
  kind:"read", label:"Why it is stuck",
  cues:{ why:9, blocked:7, holding:7, held:7, reason:8, because:7, cause:7, stopping:8 },
  phrases:[["why is",9],["what is holding",10],["what is blocking",10],["why can i not",10],
           ["why has not",9],["what is stopping",10]],
  boost:{ record:6 },
  run(A){
    const api = A.api, h = api.h, t = A.slots.record;
    if (!t) return { say:"Which one? Name it — \"why is D-0004 blocked\".",
                     awaiting:{ intent:"why", slot:"record" } };
    const held = (t.blockedBy || []).map(id => api.tasks.find(x => x.id === id)).filter(Boolean);
    const bits = [];
    if (t.waitOn) bits.push(t.waitOn + " has had it for " + h.waitDays(t) + " days" +
      ((t.chases || []).length ? ", chased " + t.chases.length + "×" : ", never chased") + ".");
    held.forEach(b => bits.push("Held by " + b.code + " (" + h.stMeta(b.status).label.toLowerCase() + ") — " + b.title + "."));
    if (!bits.length && t.status === "blocked") bits.push("Marked blocked, but nothing is recorded as holding it.");
    if (!bits.length) bits.push("Nothing is holding it — it is " + h.stMeta(t.status).label.toLowerCase() + ".");
    return {
      say: t.code + " — " + t.title,
      note: bits.join("\n"),
      rows: held.map(b => row(b, api, h.stMeta(b.status).label)),
      chips: t.waitOn ? [{ label:"Chase " + t.waitOn, act:{ kind:"chase", id:t.id,
                             confirm:"Log a chase to " + t.waitOn + " on " + t.code + "?" } }]
                      : [{ label:"Open it", act:{ kind:"open", id:t.id } }]
    };
  }
});

intent("history", {
  kind:"read", label:"What happened on it",
  cues:{ happened:9, history:9, log:6, timeline:9, progress:6, activity:8, done:2, far:4 },
  phrases:[["what happened",10],["what has happened",10],["the history",9],["what did i do on",10],
           ["how did it go",8],["so far on",8],["what changed",8]],
  boost:{ record:6 },
  run(A){
    const api = A.api, h = api.h, t = A.slots.record;
    if (!t) return { say:"On which record? Name it — \"what happened on D-0004\".",
                     awaiting:{ intent:"history", slot:"record" } };
    const log = (t.log || []).slice(-10);
    if (!log.length) return { say:"Nothing is logged against " + t.code + " yet." };
    return {
      say: t.code + " — " + log.length + " of " + (t.log || []).length + " entries.",
      note: log.map(e => h.stamp(e.at) + "  " + e.text).join("\n"),
      chips:[{ label:"Open it", act:{ kind:"open", id:t.id } }]
    };
  }
});

intent("notes", {
  kind:"read", label:"Its notes",
  needs:["record"],
  cues:{ note:8, notes:9, wrote:8, written:8, said:5, detail:6, description:8 },
  phrases:[["the notes on",10],["what did i write",10],["any notes",10]],
  run(A){
    const t = A.slots.record, n = String(t.notes || "").trim();
    if (!n) return { say:"No notes on " + t.code + ".",
                     chips:[{ label:"Open it", act:{ kind:"open", id:t.id } }] };
    return { say: t.code + " — " + t.title, note:n,
             chips:[{ label:"Open it", act:{ kind:"open", id:t.id } }] };
  }
});

intent("files", {
  kind:"read", label:"Its documents",
  needs:["record"],
  cues:{ file:8, files:9, document:9, documents:9, attachment:9, attached:8, screenshot:7, email:5 },
  phrases:[["any documents",10],["what files",10],["anything attached",10]],
  run(A){
    const t = A.slots.record, f = t.files || [];
    if (!f.length) return { say:"No documents filed against " + t.code + "." };
    return { say: f.length + " document" + (f.length === 1 ? "" : "s") + " on " + t.code + ".",
             /* kind and file are what let "open the second one" mean anything */
             rows: f.slice(0, 20).map((x, i) => ({ id:t.id, code:String(i + 1), kind:"file",
               file:x.name, text:x.name || "(unnamed)",
               sub:(x.size ? Math.round(x.size / 1024) + " KB" : "") + (x.added ? " · " + A.api.h.stamp(x.added) : "") })),
             chips:[{ label:"Open the record", act:{ kind:"open", id:t.id } }] };
  }
});

intent("when", {
  kind:"read", label:"When it is due",
  needs:["record"],
  cues:{ when:8, due:7, deadline:9, date:6, expected:6 },
  phrases:[["when is",9],["when does",9],["what is the deadline",10],["due date",9]],
  run(A){
    const api = A.api, h = api.h, t = A.slots.record, k = h.today();
    if (!t.due) return { say: t.code + " has no date on it.",
                         note:"Undated records do not appear in the Day view — that is where work goes quiet.",
                         chips:[{ label:"Open it", act:{ kind:"open", id:t.id } }] };
    const d = Math.round((Date.parse(t.due) - Date.parse(k)) / DAY);
    return { say: t.code + " is due " + h.niceDate(t.due) + (t.dueTime ? " at " + t.dueTime : "") +
                  (d < 0 ? " — " + (-d) + " days ago." : d === 0 ? " — today." : " — in " + d + " days."),
             note:"“" + t.title + "” · " + h.stMeta(t.status).label,
             chips:[{ label:"Open it", act:{ kind:"open", id:t.id } }] };
  }
});

intent("similarTo", {
  kind:"read", label:"Anything like it",
  needs:["record"],
  cues:{ similar:9, like:7, related:8, same:5, others:6, resemble:9 },
  phrases:[["anything like",10],["similar to",10],["others like",10],["same kind",8]],
  run(A){
    const api = A.api, t = A.slots.record;
    const near = api.h.similar(t.title, t.id, 8, 0.3);
    if (!near.length) return { say: say(["Nothing else looks like {code}.",
                                        "{code} stands alone.",
                                        "No near matches for {code}."],
                                       { code:t.code }, A.norm) };
    return { say: say(["{n} look like {code}.",
                       "{n} in the same family as {code}.",
                       "{code} has {n} close to it."],
                      { n:qty(near.length, "record"), code:t.code }, A.norm),
             rows: near.map(x => row(x.task, api, Math.round(x.score * 100) + "% match · " +
                   api.h.stMeta(x.task.status).label)),
             chips:[{ label:"Show them", act:{ kind:"filter",
               ids:near.map(x => x.task.id).concat([t.id]), label:"Like " + t.code } }] };
  }
});

/* ═══ ACROSS EVERYTHING ══════════════════════════════════════════════════ */

intent("blocked", {
  kind:"read", label:"What is blocked",
  cues:{ blocked:12, held:8, holding:6, stuck:4, dependencies:9, depends:9, waiting:2,
         impeded:11, obstructed:11, halted:10, gated:10, stopped:7 },
  phrases:[["what is blocked",10],["anything blocked",10],["what is held up",10]],
  run(A){
    const api = A.api, h = api.h;
    const list = applySlots(api.tasks.filter(t => t.status === "blocked"), A.slots, api);
    if (!list.length) return { count:0, say: say(["Nothing is blocked.",
                                        "Nothing held up.",
                                        "All clear — nothing blocked."], {}, A.norm) };
    return { count: list.length,
             say: compose(
               say(["{n} blocked", "{n} held up", "{n} cannot move", "{n} waiting on something"],
                   { n:qty(list.length, "record") }, A.norm),
               observe(list, api, A.norm), "", linkClause(A, list.length), A.norm),
             rows: list.slice(0, 12).map(t => row(t, api,
               t.waitOn ? "waiting on " + t.waitOn + " · " + h.waitDays(t) + "d"
                        : (t.blockedBy || []).length + " holding it")),
             chips:[{ label:"Show them", act:{ kind:"filter", ids:list.map(t => t.id), label:"Blocked" } }] };
  }
});

intent("oldest", {
  kind:"read", label:"Oldest open work",
  cues:{ oldest:9, longest:6, ancient:8, age:7, old:7, earliest:8, open:4 },
  phrases:[["oldest open",10],["open the longest",12],["open longest",12],
           ["been open",8],["what is my oldest",10],["longest open",12],
           ["around the longest",9],["sitting the longest",10]],
  run(A){
    const api = A.api, h = api.h, k = h.today();
    const list = applySlots(live(api), A.slots, api)
      .filter(t => t.created).sort((a, b) => a.created < b.created ? -1 : 1);
    if (!list.length) return { say:"Nothing is open." };
    const age = t => Math.round((Date.now() - Date.parse(t.created)) / DAY);
    return { say: say(["{code} — open {age}. “{title}”",
                       "{code} has been around {age}: “{title}”",
                       "The oldest is {code}, open {age} — “{title}”"],
                      { code:list[0].code, age:span(age(list[0])), title:list[0].title }, A.norm),
             rows: list.slice(1, 8).map(t => row(t, api, age(t) + "d old · " + h.stMeta(t.status).label)),
             chips:[{ label:"Open it", act:{ kind:"open", id:list[0].id } }] };
  }
});

intent("neverChased", {
  kind:"read", label:"Never chased",
  cues:{ chased:8, chase:5, never:8, silent:5, forgotten:6, nudged:8 },
  phrases:[["never chased",12],["not chased",12],["have not chased",12],["no chase",9],
           ["not been chased",13],["never nudged",12],["unchased",12]],
  run(A){
    const api = A.api, h = api.h;
    const list = live(api).filter(t => t.waitOn && !(t.chases || []).length)
      .sort((a, b) => h.waitDays(b) - h.waitDays(a));
    if (!list.length) return { say: say(["Everything you are waiting on has been chased at least once.",
                                        "No forgotten waits — all of them have been chased.",
                                        "You have chased them all."], {}, A.norm) };
    return { say: say(["{n} waiting and never chased.",
                       "{n} nobody has been reminded about.",
                       "{n} sitting with someone, unchased."],
                      { n:qty(list.length, "record") }, A.norm),
             rows: list.slice(0, 10).map(t => row(t, api, t.waitOn + " · " + h.waitDays(t) + "d")),
             chips:[{ label:"Chase " + list[0].waitOn, act:{ kind:"chase", id:list[0].id,
               confirm:"Log a chase to " + list[0].waitOn + " on " + list[0].code + "?" } }] };
  }
});

intent("undated", {
  kind:"read", label:"Work with no date",
  cues:{ undated:13, date:5, dateless:12, unscheduled:11, missing:6, without:5, no:2 },
  phrases:[["no date",10],["without a date",10],["not dated",10],["no due date",10],
           ["missing a date",10]],
  run(A){
    const api = A.api;
    const list = applySlots(live(api), A.slots, api).filter(t => !t.due);
    if (!list.length) return { say: say(["Everything live has a date on it.",
                                        "All dated — nothing adrift.",
                                        "Nothing undated."], {}, A.norm) };
    return { count: list.length,
             say: compose(
               say(["{n} with no date", "{n} adrift without a date", "{n} carry no date at all",
                    "{n} have nothing in the date field"],
                   { n:qty(list.length, "record") }, A.norm),
               observe(list, api, A.norm), stanceFor(list.length, "stale", A.norm),
               linkClause(A, list.length), A.norm),
             note:"Undated work never shows in the Day view, which is where it goes quiet.",
             rows: list.slice(0, 12).map(t => row(t, api, api.h.stMeta(t.status).label + " · " + t.priority)),
             chips:[{ label:"Show them", act:{ kind:"filter", ids:list.map(t => t.id), label:"No date" } }] };
  }
});

intent("aboutPerson", {
  kind:"read", dim:"person", label:"About a person",
  needs:["person"],
  cues:{ usually:6, tend:7, typical:6, about:2, from:2, brings:7, sends:6, ask:4, raise:5 },
  phrases:[["what does",6],["usually ask",10],["tend to",8],["what do they",8],
           ["their records",9],["tell me about",10],["what about",4],["anything from",9]],
  run(A){
    const api = A.api, h = api.h, who = A.slots.person;
    const mine = api.tasks.filter(t => (h.peopleOf(t) || []).indexOf(who) >= 0);
    if (!mine.length) return { say:"Nothing from " + who + "." };
    const sys = {}, typ = {};
    mine.forEach(t => { if (t.system) sys[t.system] = (sys[t.system] || 0) + 1;
                        if (t.type) typ[t.type] = (typ[t.type] || 0) + 1; });
    const topS = Object.keys(sys).sort((a, b) => sys[b] - sys[a])[0];
    const topT = Object.keys(typ).sort((a, b) => typ[b] - typ[a])[0];
    const openN = mine.filter(t => h.LIVE.indexOf(t.status) >= 0).length;
    return {
      say: say(["{who} — {n}, {live} still live.",
                "{who} has brought you {n}; {live} still open.",
                "{n} from {who}, {live} of them live."],
               { who:who, n:qty(mine.length, "record"), live:openN }, A.norm),
      note: (topS ? "Mostly " + topS + (topT ? ", mostly " + topT.toLowerCase() : "") + ". " : "") +
            "First seen " + h.niceDate(h.dayOf(mine[mine.length - 1].created)) + ".",
      rows: mine.filter(t => h.LIVE.indexOf(t.status) >= 0).slice(0, 8)
              .map(t => row(t, api, h.stMeta(t.status).label + (t.due ? " · due " + h.niceDate(t.due) : ""))),
      chips:[{ label:"Show all of " + who + "'s", act:{ kind:"filterWho", who:who } }]
    };
  }
});

intent("standup", {
  kind:"read", label:"Stand-up summary",
  cues:{ standup:10, summary:6, report:6, yesterday:4, meeting:6, recap:9, rundown:9 },
  phrases:[["stand up",10],["standup",10],["what do i say",9],["for the meeting",9],
           ["give me a rundown",10],["sum up",8]],
  run(A){
    const api = A.api, h = api.h, k = h.today(), y = h.addDays(k, -1);
    const closedY = api.tasks.filter(t => t.status === "done" && h.dayOf(t.completed) === y);
    const closedT = api.tasks.filter(t => t.status === "done" && h.dayOf(t.completed) === k);
    const dueT = live(api).filter(t => t.due && t.due <= k);
    const blocked = live(api).filter(t => t.waitOn || t.status === "blocked");
    const L = [];
    L.push("Closed yesterday: " + (closedY.length ? closedY.map(t => t.code).join(", ") : "nothing"));
    if (closedT.length) L.push("Closed today: " + closedT.map(t => t.code).join(", "));
    L.push("On today: " + (dueT.length ? plural(dueT.length, "record") + " — " +
           dueT.slice(0, 4).map(t => t.code).join(", ") : "nothing dated"));
    L.push("Blocked: " + (blocked.length ? blocked.map(t => t.code + " (" +
           (t.waitOn || "held") + ")").join(", ") : "nothing"));
    return { say:"Stand-up, " + h.niceDate(k) + ":", note:L.join("\n"),
             rows: dueT.slice(0, 6).map(t => row(t, api, t.priority +
               (t.waitOn ? " · waiting on " + t.waitOn : ""))) };
  }
});

intent("compare", {
  kind:"read", label:"Busier or quieter",
  cues:{ busier:14, quieter:14, compare:14, comparison:14, than:5, versus:12, vs:10,
         worse:6, better:6, more:3, less:4 },
  phrases:[["busier than",10],["quieter than",10],["compared to",10],["more than last",10],
           ["worse than last",10],["this week compare",10],["week against",9]],
  run(A){
    const api = A.api, h = api.h, k = h.today();
    const thisW = h.mondayOf(k), lastW = h.addDays(thisW, -7);
    const inW = (t, from) => { const d = h.dayOf(t.created);
      return d >= from && d <= h.addDays(from, 6); };
    const a = api.tasks.filter(t => inW(t, thisW)).length;
    const b = api.tasks.filter(t => inW(t, lastW)).length;
    const dc = api.tasks.filter(t => t.status === "done" && h.dayOf(t.completed) >= thisW).length;
    const db = api.tasks.filter(t => t.status === "done" && h.dayOf(t.completed) >= lastW &&
                                     h.dayOf(t.completed) < thisW).length;
    const word = a > b ? "busier" : a < b ? "quieter" : "about the same";
    return { say: say(["This week is {word} — {a} in, against {b} last week.",
                       "{word.}: {a} this week, {b} last.",
                       "{a} came in this week against {b} last — {word}."],
                      { word:word, "word.":word.charAt(0).toUpperCase() + word.slice(1),
                        a:a, b:b }, A.norm),
             note:"Closed: " + dc + " this week, " + db + " last week." +
                  (a > b && dc < db ? "\nMore coming in and less going out — that gap is where a backlog starts." : "") };
  }
});

intent("tags", {
  kind:"read", dim:"tag", label:"Tags in use",
  cues:{ tag:11, tags:12, tagged:11, label:8, labels:10, keywords:11, categories:10 },
  phrases:[["what tags",10],["which tags",10],["tags do i use",10]],
  run(A){
    const api = A.api, c = {};
    applySlots(api.tasks, A.slots, api).forEach(t => (t.tags || []).forEach(g => c[g] = (c[g] || 0) + 1));
    const rank = Object.keys(c).sort((a, b) => c[b] - c[a]);
    if (!rank.length) return { say: say(["No tags in use yet — add them with +tag when you log something.",
                                        "You have not tagged anything yet.",
                                        "No tags so far."], {}, A.norm) };
    return { say: say(["{n} in use.", "You use {n}.", "{n}, commonest first."],
                      { n:qty(rank.length, "tag") }, A.norm),
             note: rank.slice(0, 20).map(k => k + " " + c[k]).join(" · ") };
  }
});

intent("systems", {
  kind:"read", dim:"system", label:"Systems in use",
  cues:{ system:5, systems:12, applications:13, apps:11, platforms:11, estate:10,
         cover:6, support:6, list:3 },
  phrases:[["what systems",10],["which systems",10],["systems do i",10],["what do i support",10]],
  run(A){
    const api = A.api, c = {};
    applySlots(api.tasks, A.slots, api).forEach(t => { if (t.system) c[t.system] = (c[t.system] || 0) + 1; });
    (api.settings.systems || []).forEach(s => { const n = s.name || s; if (!c[n]) c[n] = 0; });
    const rank = Object.keys(c).sort((a, b) => c[b] - c[a]);
    if (!rank.length) return { say: say(["No systems set up yet.",
                                        "You have not named any systems.",
                                        "Nothing is set up under systems."], {}, A.norm) };
    return { say: say(["{n} on the list.",
                       "You cover {n}.",
                       "{n}, busiest first.",
                       "There are {n} in play."],
                      { n:qty(rank.length, "system") }, A.norm),
             note: rank.map(k => k + " (" + c[k] + ")").join(" · "),
             chips:[{ label:"Show " + rank[0], act:{ kind:"filterSys", system:rank[0] } }] };
  }
});

/* ── ranking any dimension ───────────────────────────────────────────────
   Systems and people had their own answers; types, statuses, priorities,
   parties, days of the week and hours of the day had none, so "which type is
   most common" fell through to whichever intent happened to like one of its
   words. One question shape — most or least of some dimension — answered in
   one place, for every dimension that has no answer of its own. */

const DEDICATED_DIMS = ["system", "person", "tag", "script", "routine"];
const DOWFULL = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONFULL = ["January","February","March","April","May","June","July","August",
                 "September","October","November","December"];

function tallyBy(list, dim, api){
  const h = api.h, c = {};
  const bump = k => { if (k) c[k] = (c[k] || 0) + 1; };
  list.forEach(t => {
    switch (dim){
      case "type":     bump(t.type); break;
      case "status":   bump(h.stMeta(t.status).label); break;
      case "priority": bump(t.priority); break;
      case "party":    bump(t.waitOn);
                       (t.waitLog || []).forEach(w => bump(w && w.party)); break;
      case "day":      if (t.created) bump(DOWFULL[new Date(t.created).getDay()]); break;
      case "hour":     if (t.created) bump(pad2(new Date(t.created).getHours()) + ":00"); break;
      case "month":    if (t.created) bump(MONFULL[new Date(t.created).getMonth()] + " " +
                                           new Date(t.created).getFullYear()); break;
      default:         bump(t.system || t.type || "(unclassified)");
    }
  });
  return c;
}
const DIMNOUN = { type:"work type", status:"status", priority:"priority", party:"party",
                  day:"day of the week", hour:"hour of the day", month:"month",
                  record:"kind of work" };

intent("rank", {
  kind:"read", label:"Most and least",
  cues:{},
  probe(mw, norm, slots){
    /* "records" is what everything is made of, not a dimension you can rank
       by — "the most tasks" is not a question, and treating it as one had
       this stealing every ranking question that mentioned the word */
    if (!slots.agg || !slots.dim || slots.dim === "record") return 0;
    return DEDICATED_DIMS.indexOf(slots.dim) < 0 ? 16 : 0;
  },
  run(A){
    const api = A.api, h = api.h, s = A.slots;
    const dim = s.dim, least = s.agg === "least";
    let list = applySlots(api.tasks, s, api);
    if (s.range) list = list.filter(x => inRange(h.dayOf(x.created), s.range));
    if (!list.length)
      return { say: say(["Nothing to rank{w}.", "No records{w} to count.",
                         "Nothing there{w}."], { w:slotWords(s) }, A.norm) };

    const c = tallyBy(list, dim, api);
    const keys = Object.keys(c);
    if (!keys.length)
      return { say:"None of them carry a " + (DIMNOUN[dim] || dim) + "." };
    keys.sort((a, b) => least ? c[a] - c[b] : c[b] - c[a]);
    const top = keys[0], tot = keys.reduce((n, k) => n + c[k], 0);

    /* a ranking of one is not a ranking */
    if (keys.length === 1)
      return { say: say(["Only one {noun} in play: {top}, all {n} of them.",
                         "{top} is the only {noun} — {n} records.",
                         "They are all the same {noun}: {top}."],
                        { noun:DIMNOUN[dim] || dim, top:top, n:c[top] }, A.norm) };

    const ids = list.filter(x => {
      const k = tallyBy([x], dim, api);
      return Object.keys(k)[0] === top;
    }).map(x => x.id);

    return {
      count: c[top],
      say: compose(
        say(least
          ? ["{top} — the fewest, {n} of {tot}.",
             "Least of all is {top}, with {n}.",
             "{top} is the quiet one: {n} out of {tot}."]
          : ["{top} — {n} of {tot}, {pct}% of the lot.",
             "{top}, easily: {n} out of {tot}.",
             "Mostly {top} — {n} of {tot}."],
          { top:top, n:c[top], tot:tot, pct:Math.round(c[top] / tot * 100) }, A.norm),
        keys.length > 2 && !least && c[keys[0]] > c[keys[1]] * 2
          ? "well ahead of " + keys[1] + " on " + c[keys[1]] : "",
        "", "", A.norm),
      note: keys.slice(0, 8).map(k => k + " " + c[k]).join(" · ") +
            (keys.length > 8 ? " · and " + (keys.length - 8) + " more" : ""),
      chips: ids.length ? [{ label:"Show the " + top + " ones",
                             act:{ kind:"filter", ids:ids, label:top } }] : []
    };
  }
});

/* ── what is NOT the case ─────────────────────────────────────────────────
   "The ones that are not done" was answered with what WAS done. */

intent("negFind", {
  kind:"read", label:"The ones that are not",
  cues:{},
  /* "anything without a system" names a system and is not a question about
     systems. A negation is the strongest thing in a sentence that has one. */
  probe(mw, norm, slots){
    if (!slots.neg) return 0;
    /* undated work and unchased waits have their own answers, which say more
       than a generic filtered list does — leave those to them */
    const k = Object.keys(slots.neg);
    if (k.length === 1 && (k[0] === "due" || k[0] === "chase")) return 0;
    return 20;
  },
  run(A){
    const api = A.api, h = api.h, s = A.slots, n = s.neg || {};
    let list = applySlots(api.tasks, s, api);
    const said = [];
    if (n.done){ list = list.filter(x => x.status !== "done"); said.push("not closed"); }
    if (n.processing){ list = list.filter(x => x.status !== "processing"); said.push("not started"); }
    if (n.blocked){ list = list.filter(x => x.status !== "blocked"); said.push("not blocked"); }
    if (n.cancelled){ list = list.filter(x => x.status !== "cancelled"); said.push("not cancelled"); }
    if (n.open){ list = list.filter(x => x.status !== "open"); said.push("not open"); }
    if (n.due){ list = list.filter(x => !x.due); said.push("with no date"); }
    if (n.system){ list = list.filter(x => !x.system); said.push("with no system"); }
    if (n.tag){ list = list.filter(x => !(x.tags || []).length); said.push("untagged"); }
    if (n.chase){ list = list.filter(x => x.waitOn && !(x.chases || []).length); said.push("never chased"); }
    if (n.estimate){ list = list.filter(x => !+x.estimate); said.push("with no estimate"); }
    if (n.file){ list = list.filter(x => !(x.files || []).length); said.push("with nothing attached"); }
    if (n.notes){ list = list.filter(x => !String(x.notes || "").trim()); said.push("with no notes"); }
    if (n.script){ list = list.filter(x => !(x.scripts || []).length); said.push("with no script"); }
    if (n.checklist){ list = list.filter(x => !(x.checklist || []).length); said.push("with no steps"); }
    if (s.range) list = list.filter(x => inRange(h.dayOf(x.created), s.range));

    if (!list.length)
      return { count:0, say: say(["Nothing {what}{w}.",
                                  "None{w} — everything is accounted for.",
                                  "There are none {what}{w}."],
                                 { what:andList(said, 3), w:slotWords(s) }, A.norm) };
    return {
      count: list.length,
      say: compose(
        say(["{n} {what}{w}.", "{n} {what}{w} — here they are.",
             "That is {n} {what}{w}."],
            { n:qty(list.length, "record"), what:andList(said, 3), w:slotWords(s) }, A.norm),
        observe(list, api, A.norm), "", "", A.norm),
      rows: list.slice(0, 12).map(x => row(x, api, h.stMeta(x.status).label +
            (x.due ? " · due " + h.niceDate(x.due) : " · no date"))),
      chips:[{ label:"Show them all", act:{ kind:"filter", ids:list.map(x => x.id),
                                           label:andList(said, 2) } }]
    };
  }
});

/* ═══ THINGS THAT CHANGE SOMETHING ═══════════════════════════════════════
   Every one of these comes back as a proposal, never as a done deed. The app
   shows it and waits for a click. Misreading a question costs two seconds;
   misreading an instruction edits a customer's record. */

intent("log", {
  kind:"write", label:"Log a record",
  cues:{ log:8, add:6, create:7, new:5, raise:6, record:4, note:4, capture:6, jot:6, open:2 },
  phrases:[["log a",10],["add a",8],["make a record",10],["new record",10],["raise a",9],
           ["write down",9],["take a note",8],["put in",6]],
  run(A){
    const api = A.api;
    /* strip the instruction itself, then let the app's own quick-add parser
       read what is left — it already understands p1, @system, ~name, 2h, today */
    let text = A.raw.replace(/^\s*(please\s+)?(can you\s+|could you\s+)?(log|add|create|raise|make|new|note|capture|jot(?:\s+down)?|put(?:\s+in)?|write(?:\s+down)?)\b\s*/i, "")
                    .replace(/^\s*(a|an|the)\s+/i, "")
                    .replace(/^\s*(new\s+)?(record|task|job|ticket|note)\s+(for|about|that|to)?\s*/i, "");
    const p = api.h.parseQuick(text);
    if (!p.title || p.title.length < 2)
      return { say:"What should it say? Try \"log imaging pool crash p1 @Imaging today\"." };
    const bits = [];
    if (p.priority) bits.push(p.priority);
    if (p.system) bits.push("@" + p.system);
    if (p.type) bits.push(":" + p.type);
    if (p.requester) bits.push("~" + p.requester);
    if (p.due) bits.push("due " + api.h.niceDate(p.due));
    if (p.estimate) bits.push(api.h.mins(p.estimate));
    return {
      say: "Log this?",
      note: "“" + p.title + "”" + (bits.length ? "\n" + bits.join(" · ") : ""),
      act: { kind:"log", fields:p, confirm:"Log “" + p.title + "”?" }
    };
  }
});
intent("markDone", {
  kind:"write", label:"Mark it done",
  needs:["record"],
  cues:{ done:8, finished:7, complete:7, completed:7, close:7, closed:6, resolved:7,
         fixed:6, sorted:6, mark:5, sort:4 },
  phrases:[["mark it done",10],["is done",8],["close it",9],["finished with",9],["all done",8],
           ["tick off",9],["that is fixed",9]],
  run(A){
    const t = A.slots.record;
    if (A.api.h.LIVE.indexOf(t.status) < 0)
      return { say: t.code + " is already " + A.api.h.stMeta(t.status).label.toLowerCase() + "." };
    return { say:"Close " + t.code + "?", note:"“" + t.title + "”",
             act:{ kind:"status", id:t.id, status:"done", confirm:"Mark " + t.code + " done?" } };
  }
});
intent("markStart", {
  kind:"write", label:"Start work",
  needs:["record"],
  cues:{ start:7, starting:7, begin:7, working:6, processing:7, pick:5, take:4, on:1 },
  phrases:[["start on",10],["working on",9],["pick this up",10],["i am on it",9],
           ["begin work",9],["in progress",9]],
  run(A){
    const t = A.slots.record;
    if (t.status === "processing") return { say: t.code + " is already in progress." };
    return { say:"Start " + t.code + "?", note:"“" + t.title + "”",
             act:{ kind:"status", id:t.id, status:"processing", confirm:"Move " + t.code + " to in progress?" } };
  }
});
intent("markWait", {
  kind:"write", label:"Hand it to someone",
  needs:["record"],
  cues:{ waiting:6, wait:6, block:6, blocked:6, hold:6, held:6, pending:6, handed:7, sent:5, with:2 },
  phrases:[["waiting on",8],["handed to",10],["sent to",8],["with the vendor",8],
           ["passed to",10],["over to",8],["put on hold",10]],
  boost:{ party:6 },
  run(A){
    const t = A.slots.record, party = A.slots.party || A.slots.person;
    if (!party) return { say:"Who has it? Try \"D-14 is with the vendor\"." };
    return { say:"Mark " + t.code + " as waiting on " + party + "?", note:"“" + t.title + "”",
             act:{ kind:"wait", id:t.id, party:party,
                   confirm:"Set " + t.code + " waiting on " + party + "?" } };
  }
});
intent("chase", {
  kind:"write", label:"Chase someone",
  cues:{ chase:9, nudge:8, ping:7, poke:7, followup:8, follow:5, remind:3, prod:8 },
  phrases:[["follow up",10],["chase them",10],["chase up",10],["give them a nudge",10],
           ["ask them again",9]],
  boost:{ record:4, party:5 },
  run(A){
    const api = A.api, h = api.h, s = A.slots;
    let t = s.record;
    if (!t){
      const pool = live(api).filter(x => x.waitOn && (!s.party || x.waitOn === s.party))
                            .sort((a, b) => h.waitDays(b) - h.waitDays(a));
      if (!pool.length) return { say: s.party ? "Nothing is waiting on " + s.party + "." : "Nothing is waiting on anyone." };
      t = pool[0];
    }
    if (!t.waitOn) return { say: t.code + " is not waiting on anybody." };
    return { say:"Chase " + t.waitOn + " on " + t.code + "?",
             note:"“" + t.title + "” — waiting " + h.waitDays(t) + " days" +
                  ((t.chases || []).length ? ", chased " + t.chases.length + "× already." : ", never chased."),
             act:{ kind:"chase", id:t.id, confirm:"Log a chase to " + t.waitOn + " on " + t.code + "?" } };
  }
});
intent("run", {
  kind:"write", label:"Run a script",
  cues:{ run:8, execute:8, launch:7, fire:6, trigger:7, kick:5, start:2 },
  phrases:[["run the",9],["kick off",9],["fire off",9],["execute the",10]],
  boost:{ script:8 },
  needs:["script"],
  run(A){
    const api = A.api;
    const sc = api.scripts.find(x => x.id === A.slots.script);
    if (!sc) return { say:"I do not have that script." };

    /* a script runs against a record — its output is logged there. If the
       sentence did not name one, look for the live records that already
       carry this script rather than guessing or refusing. */
    let t = A.slots.record;
    if (!t){
      const carrying = live(api).filter(x => (x.scripts || []).indexOf(sc.id) >= 0);
      if (carrying.length === 1) t = carrying[0];
      else if (carrying.length > 1) return {
        say:"Which record should " + sc.file + " run against?",
        rows: carrying.slice(0, 8).map(x => row(x, api, api.h.stMeta(x.status).label)),
        note:"Say the code — \"run " + sc.name + " on " + carrying[0].code + "\"."
      };
      else return {
        say:"Which record should " + sc.file + " run against?",
        note:"Nothing live has it attached yet. Name one — \"run " + sc.name + " on D-14\"."
      };
    }
    return { say:"Run " + sc.file + " on " + t.code + "?",
             note: (sc.desc ? sc.desc + "\n" : "") + "“" + t.title + "”",
             act:{ kind:"run", scriptId:sc.id, id:t.id,
                   confirm:"Run " + sc.file + " on " + t.code + "?" } };
  }
});
intent("remind", {
  kind:"write", label:"Set a reminder",
  cues:{ remind:9, reminder:9, alert:5, notify:6, nudge:5, every:5, ping:3,
         trigger:7, recurring:7, hourly:8, schedule:4, routine:5 },
  phrases:[["remind me",12],["nudge me",12],["tell me every",12],["tell me each",12],
           ["set a reminder",12],["let me know every",10],["alert me",9],
           ["trigger every",12],["fire every",11],["every day at",10],["keep telling me",11]],
  boost:{ every:6, window:4 },
  run(A){
    const api = A.api, s = A.slots;

    /* the name: whatever was quoted, else the sentence with the instruction
       stripped off the front and the timing stripped out of the middle */
    let title = s.quoted || A.raw
      .replace(/^.*?\b(remind|nudge|alert|tell|notify)\s+me\b\s*/i, "")
      .replace(/^.*?\b(create|make|add|set)\s+(me\s+)?(a\s+|an\s+|the\s+)?(new\s+)?(task|record|routine|reminder|schedule|job)?\s*(name[d]?\s+as\s+|called\s+|named\s+|for\s+|to\s+)?/i, "")
      .replace(/\band also\b.*$/i, "")
      .replace(/\b(every|each)\s*\d*\s*(minute|minutes|min|mins|mn|m|hour|hours|hr|hrs|h|day|days|d|half an hour)\b/gi, " ")
      .replace(/\b(?:from|between)\s*\d{1,2}\s*(?:am|pm)?\s*(?:to|until|till|-|and|through)\s*\d{1,2}\s*(?:am|pm)?\b/gi, " ")
      .replace(/\bat \d{1,2}:\d{2}\b/gi, " ")
      .replace(/\b(hourly|daily|weekdays?|and|also|as well|please|trigger|turn on the window notification)\b/gi, " ")
      .replace(/^\s*(to|about|that|for|and)\s+/i, "")
      .replace(/[\s.,;]+$/, "")
      .replace(/\s+/g, " ").trim();
    if (!title) title = "Reminder";
    title = title.charAt(0).toUpperCase() + title.slice(1);

    if (!s.every && !s.time && !s.date)
      return { say: say(["How often should I nudge you?",
                         "How often?",
                         "At what interval?"], {}, A.norm),
               note:"Say it like \"every 30 minutes from 8am to 5pm\", or \"every day at 08:30\".",
               awaiting:{ intent:"remind", slot:"every" } };

    /* every N minutes/hours becomes cron; anything daily stays a plain
       daily schedule, which is cheaper for the app to reason about */
    let freq = "daily", cron = "", every = s.every;
    const w = s.window;
    const hourField = w ? (w.from === w.to ? String(w.from)
                        : w.from < w.to ? w.from + "-" + w.to
                        : w.from + "-23,0-" + w.to) : "*";
    if (every && every.unit === "minute"){
      freq = "cron"; cron = "*/" + Math.max(1, Math.min(59, every.n)) + " " + hourField + " * * *";
    } else if (every && every.unit === "hour"){
      freq = "cron";
      cron = "0 " + (w ? (every.n > 1 ? hourField + "/" + every.n : hourField)
                       : (every.n > 1 ? "*/" + every.n : "*")) + " * * *";
    } else if (every && every.unit === "weekday"){
      freq = "weekdays";
    } else if (w && !every){
      freq = "cron"; cron = "0 " + hourField + " * * *";
    }

    const when = freq === "cron"
      ? (every && every.unit === "minute" ? "every " + minutesWord(every.n)
         : every && every.unit === "hour" ? (every.n > 1 ? "every " + every.n + " hours" : "every hour")
         : "every hour") +
        (w ? " between " + pad2(w.from) + ":00 and " + pad2(w.to) + ":00" : ", around the clock")
      : freq === "weekdays" ? "every weekday" + (s.time ? " at " + s.time : " at 09:00")
      : "once a day" + (s.time ? " at " + s.time : " at 09:00");

    const perDay = freq === "cron" && every && every.unit === "minute"
      ? Math.floor(60 / Math.max(1, every.n)) * (w ? (w.to - w.from + 1) : 24) : 0;

    return {
      say: say(["I can set that up.",
                "That is a schedule — here it is.",
                "Right, a repeating nudge."], {}, A.norm),
      note: "“" + title + "” — " + when + ", with a notification each time." +
            (perDay ? "\nThat is about " + perDay + " nudges a day." : "") +
            (!w && every && every.unit === "minute"
              ? "\nNo hours given, so it will fire overnight too. Say \"from 8am to 5pm\" to keep it to the working day."
              : ""),
      act:{ kind:"routine", title:title, freq:freq, cron:cron, time:s.time || "09:00",
            remind:true, confirm:"Create the schedule “" + title + "”?" }
    };
  }
});

intent("notify", {
  kind:"write", label:"Windows notifications",
  cues:{ notification:9, notifications:9, notify:7, alerts:6, popup:8, popups:8,
         bell:7, windows:5, desktop:6, toast:6, reminders:5, on:2, off:3, enable:5, disable:5 },
  phrases:[["turn on notification",14],["turn on the notification",14],["turn on windows",13],
           ["enable notification",14],["switch on notification",14],["turn off notification",14],
           ["disable notification",14],["turn notifications on",14],["window notification",13],
           ["turn on reminders",13],["switch reminders on",13]],
  run(A){
    const off = /\b(off|disable|stop|silence|mute|no more)\b/.test(A.norm);
    return {
      say: off ? "Switch reminders off?" : "Switch reminders on?",
      note: off ? "Nothing will nudge you until you turn them back on."
                : "The browser will ask for permission the first time. If it refuses, you are " +
                  "opening dossier.html straight from the folder — run dossier-serve.bat and " +
                  "use 127.0.0.1 instead, where permission can be granted.",
      act:{ kind:"notify", on:!off,
            confirm: off ? "Turn reminders off?" : "Turn reminders on?" }
    };
  }
});

intent("openRecord", {
  kind:"nav", label:"Open a record",
  needs:["record"],
  /* "open it" is an instruction; "is D-0001 open" is a question about its
     status, and answering it by opening the record is not an answer */
  only(mw, norm, slots){
    return !/^(?:is|are|was|were|has|have|does|did|can|could|will|would|should|what|which|who|when|why|how)\b/.test(norm);
  },
  cues:{ open:7, bring:5, pull:5, show:4, see:4, view:4, look:4 },
  phrases:[["open it",9],["bring it up",10],["pull it up",10],["let me see",8],["show me the record",9]],
  run(A){
    const t = A.slots.record;
    return { say:"Opening " + t.code + " — " + t.title, act:{ kind:"open", id:t.id, silent:true } };
  }
});
intent("undo", {
  kind:"write", label:"Undo",
  cues:{ undo:10, revert:9, mistake:7, oops:8, back:4, wrong:4, unde:6 },
  phrases:[["undo that",10],["take it back",9],["i made a mistake",10],["never mind",7],
           ["put it back",9]],
  run(A){ return { say:"Undo the last change?", act:{ kind:"undo", confirm:"Undo the last change?" } }; }
});
intent("goto", {
  kind:"nav", label:"Switch view",
  cues:{ go:5, switch:7, tab:6, view:6, take:3, jump:7 },
  phrases:[["go to",9],["switch to",10],["take me to",10],["open the tab",9],["jump to",9]],
  run(A){
    const n = A.norm;
    const v = /\bday\b/.test(n) ? "day" : /\bboard\b/.test(n) ? "board"
            : /\bregister\b/.test(n) ? "register" : /\bweek\b/.test(n) ? "week"
            : /\blibrary\b/.test(n) ? "library" : /\binsight/.test(n) ? "insight"
            : /\bassist\b/.test(n) ? "assist" : "";
    if (!v) return { say:"Which one? Day, Board, Register, Week, Library, Insight or Assist." };
    return { say:"Opening " + v + ".", act:{ kind:"view", view:v, silent:true } };
  }
});
/* ═══ TEACHING IT A WORD ═════════════════════════════════════════════════════
   Half of what it fails to understand is not grammar, it is vocabulary. You
   call it "the portal"; the workspace calls it "CX Portal"; nobody is wrong
   and the question still comes back blank.

   One sentence fixes that permanently, and it is the sentence a person would
   say anyway: "when I say the portal I mean CX Portal". After that, every
   question you ever ask understands the word — not because a phrase was added
   to a list, but because the word joins the lexicon the readers already use,
   so it works with exclusions, comparisons, filters and everything else at
   the same time. */

const ALIAS_RE = [
  /\bwhen (?:i|we) say (.{2,40}?) (?:i|we) (?:mean|meant|am talking about|are talking about|refer to)\s+(.{2,40})$/,
  /\bby (.{2,40}?) (?:i|we) mean\s+(.{2,40})$/,
  /^(?:remember|note) (?:that )?(.{2,40}?)\s+(?:means|is short for|is another name for|is the same as)\s+(.{2,40})$/,
  /^(.{2,40}?)\s+(?:means|is short for|is another word for|is another name for|is the same as)\s+(.{2,40})$/,
  /^treat (.{2,40}?)\s+as\s+(.{2,40})$/,
  /^(.{2,30}?)\s*=\s*(.{2,40})$/
];
const KINDNAME = { system:"system", person:"person", party:"party", type:"type",
                   tag:"tag", script:"script", status:"status" };

function readAlias(norm){
  for (const re of ALIAS_RE){
    const m = String(norm || "").match(re);
    if (!m) continue;
    const from = m[1].replace(/^(?:the|a|an)\s+/, "").replace(/[?.!,]+$/, "").trim();
    const to = m[2].replace(/[?.!,]+$/, "").trim();
    if (from && to && from !== to && from.split(" ").length <= 4) return { from, to, said:m[1].trim() };
  }
  return null;
}

intent("teachAlias", {
  kind:"write", label:"Remember a word",
  cues:{ mean:5, means:7, meant:5, synonym:9, alias:9, nickname:8, shorthand:7 },
  phrases:[["when i say",12],["by that i mean",12],["is short for",12],["another name for",12]],
  probe(mw, norm, slots){ return readAlias(norm) ? 15 : 0; },
  run(A){
    const api = A.api, a = readAlias(A.norm);
    if (!a) return { say:"Say it like this: when I say the portal I mean CX Portal." };
    const lex = api.lex || [];
    const hits = findTerms(words(a.to), lex, ["system", "person", "party", "type", "tag", "script"], null).hits;
    const hit = hits[0];
    if (!hit) return {
      say: "I have nothing called \u201c" + a.to + "\u201d in this workspace yet.",
      note: "I can only tie a word to something that already exists here \u2014 a system, a colleague, " +
            "a vendor, a type or a tag. Add it first and then tell me again.",
      chips: [{ label:"Open settings", act:{ kind:"panel", panel:"ws" } }]
    };
    /* a word that already means something else is a bad word to reuse */
    const clash = findTerms(words(a.from), lex, null, null).hits[0];
    const already = clash && clash.term.value !== hit.term.value
      ? "\u201c" + a.from + "\u201d already reads as " + clash.term.text + " here \u2014 this replaces that."
      : "";
    return {
      say: "\u201c" + a.from + "\u201d will mean " + hit.term.text + " from now on.",
      note: (already ? already + "\n" : "") +
            "It becomes a " + (KINDNAME[hit.term.kind] || hit.term.kind) +
            " name like any other, so it works in every question \u2014 filters, exclusions, " +
            "comparisons and all.",
      act: { kind:"alias", from:a.from, value:hit.term.value, ofKind:hit.term.kind,
             shown:hit.term.text,
             confirm:"Remember that \u201c" + a.from + "\u201d means " + hit.term.text + "?" }
    };
  }
});

intent("taught", {
  kind:"read", label:"What you have taught me",
  cues:{ taught:11, teach:8, learned:10, learnt:10, lessons:9, corrections:9,
         remembered:8, correcting:8 },
  phrases:[["what have i taught you",12],["what have you learned",12],["what did i teach you",12],
           ["what do you remember",10],["what have i corrected",12],["things i taught you",12]],
  run(A){
    const api = A.api;
    const mem = api.memory || {}, al = api.aliases || [];
    const shapes = [], exacts = [];
    for (const k in mem){
      const name = lessonIntent(mem[k]);
      if (!name) continue;
      const it = INTENTS.find(x => x.name === name);
      const label = it ? it.label : name;
      if (k.charAt(0) === "~") shapes.push(k.slice(1) + "  \u2192  " + label);
      else exacts.push(k + "  \u2192  " + label);
    }
    const n = shapes.length + exacts.length + al.length;
    if (!n) return {
      say: "Nothing yet \u2014 you have not had to correct me.",
      note: "When I get something wrong, use \u201cnot what I meant\u201d under the answer and pick the right " +
            "one. I keep the shape of the question, not the sentence, so teaching me about one record " +
            "teaches me about all of them.",
      chips: [{ label:"Teach me something", act:{ kind:"teach", text:"" } }]
    };
    return {
      say: say(["{n} so far.", "You have taught me {n}.", "{n} on the books."],
               { n:qty(n, "thing") }, A.norm),
      note: (shapes.length ? "Shapes I learned from you:\n  " + shapes.slice(0, 12).join("\n  ") + "\n" : "") +
            (exacts.length ? "Exact wordings:\n  " + exacts.slice(0, 8).join("\n  ") + "\n" : "") +
            (al.length ? "Words you gave me:\n  " +
              al.slice(0, 12).map(a => "\u201c" + a.from + "\u201d = " + (a.value || "")).join("\n  ") : ""),
      chips: [{ label:"Review and delete", act:{ kind:"taught" } }]
    };
  }
});
/* ═══ HAVING A VIEW, AND OWNING UP TO IT ═════════════════════════════════════
   Two things people say to anything that has just told them a number, and
   neither of them had an answer here.

   The first is "what do you think" \u2014 asking for a judgement rather than a
   count. Answering that with a list is a dodge. It reads the same signals a
   person would read at the end of a day (how far past its date the worst
   thing is, who has gone quiet and never been chased, what has not moved in
   a fortnight, what is open with no date on it at all) and then commits to
   one of them, with the reason, so the view can be argued with.

   The second is "are you sure" \u2014 asking it to show its working. It can,
   because everything it says is arithmetic over records you wrote: it knows
   which question it took yours for, how sure it was, how many records went
   into the answer and which filters were on. Something that cannot say where
   a number came from should not be trusted with the number. */

function concerns(api){
  const h = api.h, k = h.today();
  const liveOnes = api.tasks.filter(t => h.LIVE.indexOf(t.status) >= 0);
  const daysAgo = iso => iso ? Math.round((Date.now() - Date.parse(iso)) / DAY) : 0;
  const out = [];

  const over = liveOnes.filter(t => t.due && t.due < k);
  if (over.length){
    const worst = over.slice().sort((a, b) => String(a.due).localeCompare(String(b.due)))[0];
    const late = Math.max(1, Math.round((Date.parse(k) - Date.parse(worst.due)) / DAY));
    const p1 = over.filter(t => t.priority === "P1").length;
    out.push({ w: 4 + over.length * 0.4 + late * 0.35 + p1 * 2,
      head: qty(over.length, "record") + " past its date",
      why: "the oldest of them, " + worst.code + ", is " + span(late) + " late" +
           (p1 ? ", and " + p1 + " of the set " + be(p1) + " P1" : ""),
      bad: over.length > 3 || late > 7 || p1 > 0,
      move: "Clear the oldest one first \u2014 " + worst.code + ".",
      ask: "what is overdue", label:"Show me the overdue" });
  }

  const quiet = liveOnes.filter(t => t.waitOn && h.waitDays(t) > 3);
  const never = quiet.filter(t => !(t.chases || []).length);
  if (never.length){
    const worst = never.slice().sort((a, b) => h.waitDays(b) - h.waitDays(a))[0];
    out.push({ w: 3 + never.length * 1.1 + h.waitDays(worst) * 0.3,
      head: qty(never.length, "record") + " waiting on somebody nobody has chased",
      why: worst.waitOn + " has had " + worst.code + " for " + span(h.waitDays(worst)) +
           " and has never been asked about it",
      bad: h.waitDays(worst) > 5 || never.length > 2,
      move: "Chase " + worst.waitOn + " on " + worst.code + ".",
      ask: "who has gone quiet", label:"Show me the waits" });
  }

  const stalled = liveOnes.filter(t => {
    const last = (t.log || []).slice(-1)[0];
    return daysAgo(last ? last.at : t.created) > 10;
  });
  if (stalled.length){
    const worst = stalled.slice().sort((a, b) => {
      const la = (a.log || []).slice(-1)[0], lb = (b.log || []).slice(-1)[0];
      return Date.parse(la ? la.at : a.created) - Date.parse(lb ? lb.at : b.created);
    })[0];
    const lastAt = ((worst.log || []).slice(-1)[0] || {}).at || worst.created;
    out.push({ w: 2 + stalled.length * 0.7 + daysAgo(lastAt) * 0.15,
      head: qty(stalled.length, "record") + " nothing has been written on in over a week",
      why: worst.code + " has been silent for " + span(daysAgo(lastAt)),
      bad: stalled.length > 3,
      move: "Either write a line on " + worst.code + " or close it.",
      ask: "what has stalled", label:"Show me the quiet ones" });
  }

  const undated = liveOnes.filter(t => !t.due);
  if (undated.length > 2){
    out.push({ w: 1.5 + undated.length * 0.35,
      head: qty(undated.length, "record") + " open with no date on " + itThem(undated.length),
      why: "undated work does not appear in the Day view, so it goes quiet without anyone deciding it should",
      bad: undated.length > 6,
      move: "Put a date on them, even a rough one.",
      ask: "what has no date", label:"Show me the undated" });
  }

  const p1open = liveOnes.filter(t => t.priority === "P1");
  if (p1open.length > 2){
    out.push({ w: 2 + p1open.length * 0.8,
      head: qty(p1open.length, "record") + " sitting at P1",
      why: "when everything is urgent the priority has stopped telling you anything",
      bad: p1open.length > 4,
      move: "Demote the ones that are not really P1.",
      ask: "what is p1", label:"Show me the P1s" });
  }

  const bySys = {};
  liveOnes.forEach(t => { if (t.system) bySys[t.system] = (bySys[t.system] || 0) + 1; });
  const sysRank = Object.keys(bySys).sort((a, b) => bySys[b] - bySys[a]);
  const totSys = sysRank.reduce((n, x) => n + bySys[x], 0);
  if (sysRank.length > 1 && bySys[sysRank[0]] / totSys > 0.5 && bySys[sysRank[0]] > 3){
    out.push({ w: 2 + bySys[sysRank[0]] * 0.3,
      head: sysRank[0] + " is over half of everything open",
      why: bySys[sysRank[0]] + " of " + totSys + " live records are on it, which is a cause rather than a queue",
      bad: false,
      move: "Worth one permanent fix rather than " + bySys[sysRank[0]] + " more of the same.",
      ask: "which system gives me the most trouble", label:"Look at " + sysRank[0] });
  }

  return out.sort((a, b) => b.w - a.w);
}

intent("opinion", {
  kind:"read", label:"What I make of it",
  cues:{ advice:11, advise:11, recommend:10, suggest:8, worry:11, worried:11,
         concerned:10, opinion:11, honest:9, verdict:10, view:6, gut:9, instinct:9 },
  phrases:[["what do you think",17],["what do you reckon",17],["any advice",16],
           ["what would you do",17],["what should i worry about",17],["should i worry",17],
           ["is that bad",16],["is this bad",16],["how bad is it",16],
           ["does that seem normal",16],["is that normal",16],["is this normal",16],
           ["am i doing ok",16],["am i doing well",16],["how am i doing",15],
           ["your honest opinion",17],["be honest with me",16],["what is your take",17],
           ["how does that look",15],["how does it look",15],["is that a problem",16],
           ["anything to worry about",17],["should i be worried",17],
           ["what would you say",15],["if you were me",16],["tell me straight",16]],
  run(A){
    const api = A.api, n = A.norm;
    const list = concerns(api);
    const asked = /\b(?:worry|worried|bad|serious|normal|problem|concern|ok|okay|well)\b/.test(n);
    const wantsMove = /\b(?:advice|advise|recommend|suggest|do about|would you do|should i do|next)\b/.test(n);

    if (!list.length) return {
      /* the lead below is written here, so finish must not prepend another */
      say: say(["Nothing I would lose sleep over.",
                "Honestly \u2014 it looks fine.",
                "No, this looks in hand."], {}, n),
      note:"Nothing overdue, nothing waiting unchased, nothing gone silent. " +
           "That is rarer than it sounds.",
      chips:[{ label:"What should I do next", act:{ kind:"say", text:"what should i do next" } }]
    };

    const top = list[0], rest = list.slice(1, 3);
    const worrying = list.some(x => x.bad);
    /* asked whether to worry, answer that. Asked what to do, say what to do.
       Asked what I think, say what I think. Three different questions, and
       one answer for all three is what makes a thing feel like a form. */
    const lead = wantsMove
      ? one(["If it were me: ", "What I would do: ", "One thing, then. "], n)
      : asked
      ? (worrying
          ? one(["Yes \u2014 one thing. ", "Yes, and it is this. ", "A bit, yes. "], n)
          : one(["Not really. ", "No, nothing alarming. ", "Nothing serious. "], n))
      : one(["If you want it straight: ", "My read: ", "Honestly: ", ""], n);

    return {
      say: lead + (wantsMove ? top.move : top.head + " \u2014 " + top.why + "."),
      note: (wantsMove ? "Because " + top.head + " \u2014 " + top.why + ".\n"
                       : worrying ? top.move + "\n" : "") +
            (rest.length
              ? "Also: " + rest.map(x => x.head).join("; ") + "."
              : "That is the only thing standing out.") +
            "\n\nThat is my reading of the records, not a fact \u2014 I am counting dates and " +
            "silence, and I cannot see what you know about any of it.",
      chips: [{ label:top.label, act:{ kind:"say", text:top.ask } }]
        .concat(rest.length ? [{ label:rest[0].label, act:{ kind:"say", text:rest[0].ask } }] : [])
    };
  }
});

intent("justify", {
  kind:"read", label:"Where that came from",
  keepLast:true,
  cues:{ sure:9, certain:10, positive:5, confident:11, accurate:10, reliable:10,
         guessing:12, guess:6, made:4, invented:12, checked:8, verify:10, prove:11 },
  phrases:[["are you sure",17],["you sure",16],["are you certain",17],["how sure are you",17],
           ["how confident are you",17],["how do you know",17],["how do you know that",17],
           ["where did you get that",17],["where does that come from",17],
           ["why do you say that",17],["what makes you say that",17],
           ["did you make that up",17],["are you guessing",17],["are you making this up",17],
           ["can you be wrong",16],["could you be wrong",16],["is that right",14],
           ["show me your working",17],["how did you work that out",17],
           ["do you actually read my records",17],["did you actually check",16],
           ["prove it",15],["says who",15],["based on what",16],
           ["what does that mean",16],["what do you mean",16],["what does this mean",16],
           ["explain that",16],["explain",10],["in plain english",16],
           ["i do not understand",15],["i dont get it",15],["what are you saying",15],
           ["how did you get that",17],["what is that based on",17],["says it who",14]],
  run(A){
    const api = A.api, c = A.convo || {}, l = c.last;
    if (!l) return {
      say: say(["Everything I tell you is counted out of your own records \u2014 nothing else reaches me.",
                "I only ever count what is in this workspace, so yes, I can be checked.",
                "Fair thing to ask. Everything I say is arithmetic over your own records."], {}, A.norm),
      note:"There is no model here and no network, so I have nothing to invent from: every " +
           "number I give you is a count of records you wrote, and I can list every one that " +
           "went into it. Where I am unsure it is the question I am unsure about, not the " +
           "arithmetic \u2014 which is why I tell you how sure I was of the reading.\n\n" +
           "Ask me something and then ask me this again, and I will show you the working.",
      chips:[{ label:"Anything I should know", act:{ kind:"say", text:"anything i should know" } }]
    };
    if (l.kind === "social") return {
      keepLast:true,
      say:"That one was not a fact, just conversation.",
      note:"Ask me something about the work and I will show you where the number came from."
    };
    const bits = [];
    bits.push("I read \u201c" + (l.say || "") + "\u201d as " + l.label.toLowerCase() + ".");
    if (l.count != null) bits.push("The " + l.count + " is a count of records in this workspace, " +
      "not an estimate \u2014 I can list every one of them.");
    if (l.rows) bits.push(l.rows + " of them were shown above.");
    if (l.filters) bits.push("Filtered to: " + l.filters + ".");
    if (l.applied) bits.push("Condition applied: " + l.applied + ".");
    if (l.learned) bits.push(l.taught === "shape"
      ? "I took that reading from a shape you taught me, not from my own guess."
      : "I took that reading from a correction you gave me.");
    else bits.push("How sure I was of the reading: " + Math.round((l.confidence || 0) * 100) + "%.");

    const solid = l.count != null || l.rows > 0;
    const explaining = /\b(?:mean|means|meaning|explain|understand|saying|plain english)\b/.test(A.norm);
    return {
      keepLast:true,
      say: say(explaining
        ? ["Putting it plainly:",
           "What I meant was this.",
           "In other words:"]
        : solid
        ? ["Sure of the number, less sure I heard you right \u2014 here is both.",
           "The arithmetic, yes. The question I answered, judge for yourself.",
           "Yes, in this sense:"]
        : ["Here is exactly what I did.",
           "I can show you the working, such as it is.",
           "Fair question. This is where it came from."], {}, A.norm),
      note: bits.join("\n") +
            "\n\nAll of it is counted out of dossier.json on this PC. Nothing is fetched and " +
            "nothing is invented \u2014 when I do not know, I say I do not know.",
      chips:[{ label:"Ask it again", act:{ kind:"rerun", intent:l.intent } },
             { label:"That was the wrong question", act:{ kind:"teach", text:"" } }]
    };
  }
});

intent("decline", {
  kind:"social", label:"No then",
  /* only when it is the whole message \u2014 "no date on it" is not a refusal */
  only(mw, norm, slots){
    return mw.length <= 3 && !slots.record && !slots.system && !slots.person && !slots.party;
  },
  cues:{},
  phrases:[["no",14],["nope",15],["nah",15],["no thanks",16],["no thank you",16],
           ["not now",15],["not really",16],["not yet",15],["not quite",15],["dont",12],
           ["do not",12],["leave it",13],["rather not",15],["id rather not",16],
           ["maybe",13],["perhaps",12],["i guess",14],["i suppose",14],["not sure",15],
           ["dunno",14],["no idea",14],["if you say so",15],["i doubt it",15],
           ["hmm",12],["meh",13],["whatever",11],["kind of",13],["sort of",13],
           ["fine",11],["alright then",13],["ok then",12],["not exactly",15]],
  run(A){
    const c = A.convo || {};
    const hedging = /\b(?:maybe|perhaps|guess|suppose|not sure|dunno|no idea|kind of|sort of|hmm|meh|doubt)\b/
      .test(A.norm);
    /* a no to a question this thread actually asked is a real no */
    if (c.awaiting && c.awaiting.intent && !hedging)
      return { say: say(["Right, leaving it.", "Fine \u2014 dropped.", "Understood, not that then."], {}, A.norm),
               clearContext:true };
    if (hedging) return {
      say: say(["Fair enough.", "Understood.", "Take your time."], {}, A.norm),
      note:"If you are not sure what to ask, \u201canything I should know\u201d is usually the useful one.",
      chips:[{ label:"Anything I should know", act:{ kind:"say", text:"anything i should know" } },
             { label:"What should I do next", act:{ kind:"say", text:"what should i do next" } }]
    };
    return {
      say: say(["Right.", "No then.", "Understood.", "Fine."], {}, A.norm),
      chips:[{ label:"Something else", act:{ kind:"say", text:"what can you do" } }]
    };
  }
});

intent("hold", {
  kind:"social", label:"Waiting",
  /* "wait" on its own is a pause. "What am I waiting on" is work. */
  only(mw, norm, slots){
    return mw.length <= 4 && !slots.record && !slots.party && !slots.system && !slots.person;
  },
  cues:{},
  phrases:[["wait",14],["hold on",16],["hang on",16],["hold up",15],["one moment",16],
           ["a moment",15],["one second",16],["one sec",16],["just a sec",16],
           ["give me a second",17],["give me a minute",17],["give me a moment",17],
           ["let me think",17],["let me check",17],["let me look",16],["thinking",12],
           ["stand by",15],["standby",15],["brb",15],["be right back",16],
           ["bear with me",16],["two seconds",16],["just a minute",16],["wait a moment",17]],
  run(A){
    return { say: say(["Take your time.", "No rush.", "Here when you are.",
                       "I will wait.", "Whenever you are ready."], {}, A.norm) };
  }
});

intent("pickOne", {
  kind:"nav", label:"That one",
  /* it does its own selecting, so the layer in finish() leaves it alone */
  picks: true,
  /* Only when the sentence is nothing but a pointing finger. "Open the first
     document of D-0034" is answered by the documents intent with the
     selection applied to it; this is for "the second one" said on its own,
     after a list is already on screen. */
  only(mw, norm, slots){
    return !!slots.pick && (slots.hasRows || slots.pick.counted) &&
           !slots.record && !slots.system &&
           !slots.person && !slots.party && !slots.type && mw.length <= 5;
  },
  cues:{},
  probe(mw, norm, slots){ return (slots.pick && (slots.hasRows || slots.pick.counted)) ? 16 : 0; },
  run(A){
    const rows = (A.convo && A.convo.rows) || [];
    if (!rows.length) return {
      say: say(["I have no list on screen to point at.",
                "Ask me for something first, then say which one of it."], {}, A.norm),
      note:"For example: \u201cwhat documents are on D-0004\u201d, then \u201copen the second one\u201d."
    };
    const got = choose(rows, A.slots.pick);
    if (got && got.over) return {
      say:"There " + be(got.have) + " only " + got.have + " of them in that list.",
      rows: rows
    };
    if (!got || !got.row) return {
      say:"Nothing in that list is called \u201c" + (A.slots.pick.named || "") + "\u201d.",
      rows: rows
    };
    const r = got.row, act = actOn(r);
    const which = A.slots.pick.named ? "\u201c" + A.slots.pick.named + "\u201d"
                : A.slots.pick.n === -1 ? "The last" : "Number " + got.at;
    if (act && (OPEN_VERB.test(A.norm) || act.kind !== "run")){
      if (act.kind === "run")
        return { say: which + ": " + r.text + ".", rows:[r],
                 act: Object.assign({}, act, { confirm:"Run " + r.text + "?" }) };
      return { say:"Opening " + r.text + ".", note:which + " of " + rows.length + ".",
               rows:[r], act:act };
    }
    return { say: which + ": " + r.text + ".", note:r.sub || "", rows:[r],
             chips: act ? [{ label:"Open it", act:act }] : [] };
  }
});
intent("help", {
  kind:"read", label:"What can you do",
  cues:{ help:9, commands:8, capabilities:8, able:6, do:2, ask:4, understand:7, works:4 },
  phrases:[["what can you do",10],["how do i use",10],["what do you understand",10],
           ["give me examples",10],["what can i ask",10],["who are you",8]],
  run(A){
    return {
      say:"I read your records and answer from them. When I get one wrong, press " +
          "\u201cnot what I meant\u201d under the answer and pick the right one \u2014 I keep the " +
          "shape of the question, so correcting me once about D-0004 corrects me about every " +
          "record. Some things to try:",
      note:[ "what should I do next",
             "what is overdue",
             "anything I should know",
             "how many did I close last week",
             "which system gives me the most trouble",
             "who am I waiting on",
             "have I fixed an imaging pool crash before",
             "how long does a data fix usually take",
             "am I overloaded today",
             "D-14",
             "log imaging pool crash p1 @Imaging today",
             "chase the vendor",
             "remind me every 30 minutes to drink water",
             "what is the ticket of D-0004",
             "when I say the portal I mean CX Portal",
             "what have I taught you" ].join("\n"),
      examples:true
    };
  }
});

/* ═══ THE PHRASE BANK ════════════════════════════════════════════════════
   Everything above declares the few words that most obviously mean an intent.
   This is the rest of the language: the other ways the same thing gets said
   at a desk on a Tuesday. Kept apart from the intents so the intents stay
   readable, and folded in at load.

   Weights here are deliberately below the hand-picked cues above — a synonym
   should be enough to be understood, never enough to outvote a word that was
   chosen on purpose. */

const SYN = {
  overdue:     "late tardy delayed lapsed expired breached overrun overrunning overshot " +
               "pastdue unmet blown burning",
  dueToday:    "today todays plate agenda diary docket lineup slate",
  dueWeek:     "upcoming forthcoming horizon incoming approaching imminent shortly",
  /* not "recommend" or "suggest" — they are about anything at all, and
     "recommend a restaurant" reached "what should I do next" through them */
  next:        "prioritise prioritize triage urgent pressing foremost immediate attention",
  find:        "locate retrieve fetch surface dig lookup filter concerning",
  waiting:     "awaiting pending parked handed owed external supplier counterparty",
  quietest:    "unresponsive unanswered ignored stale silence lagging",
  neverChased: "unchased unnudged unreminded untouched forgotten neglected",
  closed:      "resolved delivered dispatched wrapped concluded settled banked " +
               "productivity output throughput accomplished",
  opened:      "inbound arrived intake influx received logged submitted reported " +
               "volume workload demand",
  worstSystem: "unstable unreliable flaky fragile brittle offender culprit repeat " +
               "worst noisy nuisance",
  topPerson:   "requester requesters reporter reporters caller callers stakeholder " +
               "colleague colleagues frequent",
  howLong:     "duration elapsed lead cycle turnaround throughput median average " +
               "typical estimate estimation forecast",
  solvedBefore:"precedent prior historic known previously encountered",
  guide:       "runbook playbook procedure protocol method methodology recipe " +
               "instructions checklist workflow standard sop",
  stalled:     "stagnant dormant rotting languishing lingering idle frozen abandoned drifting",
  blocked:     "impeded obstructed halted stopped gated dependent dependency prerequisite",
  brief:       "briefing digest roundup overview situation posture " +
               "noteworthy notable alarming",
  standup:     "scrum huddle sync catchup checkin handover shift report",
  workload:    "capacity bandwidth utilisation utilization saturated stretched " +
               "committed commitment realistic achievable",
  timeSpent:   "effort logged billable expended consumed invested duration",
  count:       "tally quantity volume aggregate sum figure numbers headcount",
  scripts:     "automations executables commands macros batches tooling utilities",
  routines:    "schedules cronjobs crons timers recurrences recurrence",
  steps:       "remaining outstanding unfinished incomplete todo",
  why:         "reason rationale cause blocker obstacle impediment holdup bottleneck",
  history:     "timeline chronology audit trail journal diary activity events",
  notes:       "commentary remarks writeup summary description findings",
  files:       "attachments docs paperwork evidence artefacts artifacts uploads",
  when:        "deadline duedate target eta expected timing",
  similarTo:   "comparable analogous alike resembling kindred equivalent related",
  oldest:      "eldest longest ancient earliest stalest veteran",
  undated:     "dateless unscheduled unplanned floating orphan orphaned adrift",
  aboutPerson: "profile background pattern habits history dealings",
  compare:     "trend trending direction movement delta change versus against",
  tags:        "labels keywords categories markers",
  systems:     "applications apps platforms services estate portfolio landscape",
  about:       "purpose rationale overview introduction explain describe",
  howTo:       "instructions setup configure enable activate install steps tutorial",
  log:         "capture jot register enter raise",
  markDone:    "close finish complete resolve settle finalise finalize tick clear",
  markStart:   "begin commence undertake progress",
  markWait:    "delegate escalate transfer handoff assign park",
  chase:       "pursue prompt hasten expedite escalate",
  run:         "invoke execute trigger launch fire",
  remind:      "alarm prompt buzz beep",
  notify:      "notifications alerting popups toasts desktop bell",
  undo:        "revert rollback reverse unwind",
  help:        "capabilities commands abilities usage manual",
  record:      "detail details status state summary"
};

/* Whole phrases, which carry more weight than single words because they are
   unambiguous. Same idea: the ordinary ways of saying it. */
const BANK_PHRASES = {
  overdue:     [["past the date",11],["out of time",10],["over the line",9],["missed the date",12],
                ["blown the date",11],["run out of time",11],["gone past",9],["should have been done",12]],
  dueToday:    [["for today",10],["today's list",12],["on the list today",12],["needs doing today",12],
                ["landing today",10],["today's jobs",12]],
  dueWeek:     [["over the week",10],["before friday",11],["by the end of the week",12],
                ["next few days",10],["days ahead",9]],
  next:        [["what first",11],["start with",10],["top of the list",12],["highest priority",12],
                ["most urgent",12],["deal with first",12],["biggest priority",12],["what matters",10]],
  waiting:     [["sitting with",11],["in their court",12],["on their side",11],["out for review",10],
                ["with the vendor",10],["with someone else",12],["not with me",11],["blocked on",10]],
  quietest:    [["heard nothing",12],["no reply",11],["gone silent",12],["not come back",12],
                ["still waiting",10],["dragging on",10]],
  closed:      [["got through",10],["shipped",8],["put to bed",12],["signed off",10],
                ["cleared today",11],["off the list",11]],
  opened:      [["came through",10],["landed",8],["turned up",10],["hit the queue",11],
                ["new work",9],["fresh in",10]],
  worstSystem: [["always breaking",13],["keeps failing",13],["most trouble",12],["biggest headache",13],
                ["giving me grief",13],["worst offender",13],["never works",12]],
  howLong:     [["how long does",13],["how much time does",13],["typical time",12],["usually take",12],
                ["turnaround on",12],["time to close",12]],
  guide:       [["how do i deal with",14],["what is the procedure",14],["standard approach",13],
                ["the usual way",13],["how it is normally done",14],["best way to",12],
                ["what worked before",13],["how did i sort",13],["how do i sort",13]],
  solvedBefore:[["come up before",12],["happened before",12],["seen it before",13],["ring a bell",12]],
  stalled:     [["going nowhere",13],["no movement",13],["stopped dead",13],["gathering dust",13],
                ["been sitting",11]],
  blocked:     [["held up",12],["can not move",12],["cannot move",12],["waiting on something",11]],
  brief:       [["how are we",10],["where do things stand",13],["state of things",13],
                ["anything urgent",12],["anything on fire",13],["all good",9]],
  workload:    [["too much on",12],["can i fit",12],["do i have time",13],["enough hours",12],
                ["over committed",13],["realistic",8]],
  steps:       [["still to do",13],["what is missing",12],["anything left",12],["how much left",12],
                ["where did i get to",13],["where was i up to",13]],
  why:         [["what is the hold up",14],["why has it not",13],["what is in the way",13],
                ["why is it stuck",14]],
  standup:     [["for the standup",14],["morning meeting",12],["what do i report",13],
                ["update for the team",13]],
  compare:     [["up or down",12],["better or worse",13],["how does it compare",14],
                ["more than usual",12],["less than usual",12]],
  oldest:      [["been here longest",13],["around longest",13],["gathering dust longest",12]],
  undated:     [["without dates",12],["no deadline",12],["nothing set",10]],
  aboutPerson: [["what do they send",13],["what do they usually",13],["their usual",11]],
  notify:      [["turn on alerts",13],["switch on alerts",13],["enable popups",13],
                ["want notifications",12],["get notified",12]],
  remind:      [["poke me",12],["buzz me",12],["ping me every",13],["prompt me",11]],
  markDone:    [["all finished",11],["that is done",12],["sorted",8],["job done",12],["wrap it up",12]],
  markWait:    [["hand it to",13],["pass it to",13],["park it with",13],["escalate to",12]],
  log:         [["make a note",12],["write this down",12],["book it in",11],["put it on the list",12]],
  about:       [["what is all this",13],["what does dossier",14],["explain this app",14]],
  howTo:       [["how do you",10],["what is the way to",12],["remind me how",12]]
};

(function fold(){
  Object.keys(SYN).forEach(name => {
    const it = INTENTS.find(x => x.name === name);
    if (!it) return;
    SYN[name].split(/\s+/).filter(Boolean).forEach(w => {
      /* never overwrite a weight chosen by hand, and never steal a word that
         already means something stronger somewhere else */
      if (it.cues[w] == null) it.cues[w] = 6;
    });
  });
  Object.keys(BANK_PHRASES).forEach(name => {
    const it = INTENTS.find(x => x.name === name);
    if (!it) return;
    /* A phrase the intent already declared must not be added twice — it would
       score double and outvote everything else. But skipping it outright was
       worse: "out of time" existed at 4 and the bank had it at 10, so the
       upgrade was dropped and the phrase stayed below the floor. Keep one
       copy, at whichever weight is higher. */
    const best = {};
    (it.phrases || []).forEach(p => { best[p[0]] = Math.max(best[p[0]] || 0, p[1]); });
    BANK_PHRASES[name].forEach(p => { best[p[0]] = Math.max(best[p[0]] || 0, p[1]); });
    it.phrases = Object.keys(best).map(k => [k, best[k]]);
  });
})();

/* ═══ WORKING OUT WHICH ONE YOU MEANT ════════════════════════════════════
   Evidence, weighed — not patterns, matched. Every intent scores itself
   against the sentence and the best one answers, so word order and filler
   stop mattering and one unexpected word cannot make the whole thing fail.

   The single biggest thing keeping it honest is the question/instruction
   split: "what did I finish today" and "mark D-14 finished" share their
   strongest word, and only the shape of the sentence tells them apart. */

/* "scripts" and "script", "today's" and "today", "waiting" and "wait" are the
   same word as far as any of this is concerned. Cheap suffix stripping beats
   a real stemmer here: the cue lists are hand-written, so the only job is to
   meet them halfway. */
function variants(w){
  const out = [w];
  if (w.length > 3 && /'s$/.test(w)) out.push(w.slice(0, -2));
  if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) out.push(w.slice(0, -1));
  if (w.length > 5 && /ing$/.test(w)) out.push(w.slice(0, -3));
  if (w.length > 4 && /ed$/.test(w)) out.push(w.slice(0, -2));
  return out;
}

function cueScore(intent, mw, norm){
  let s = 0, hit = 0, best = 0, phrase = false;
  const seen = {};
  let top = 0;
  mw.forEach(w0 => {
    if (seen[w0]) return;
    let best = 0;
    /* the best any form of the word can do, never the sum of them */
    variants(w0).forEach(w => { if (intent.cues[w] > best) best = intent.cues[w]; });
    const w = w0;
    if (!best && w.length >= 5){
      for (const c in intent.cues){
        if (c.length < 5) continue;
        if (close(w, c) >= 0.86) best = Math.max(best, intent.cues[c] * 0.8);
      }
    }
    if (best){ s += best; hit++; seen[w0] = 1; if (best > top) top = best; }
  });
  /* Phrase matching was a plain substring search, which was survivable while
     every phrase was several words long. It is not survivable now: "yes"
     would match inside "yesterday", "ok" inside "broken", "hi" inside
     "this". Pad both sides and the boundaries come for free. */
  const padded = " " + norm + " ";
  (intent.phrases || []).forEach(p => {
    if (padded.indexOf(" " + p[0] + " ") >= 0){ s += p[1]; phrase = true; }
  });
  return { s, hit, best:top, phrase };
}

/* Some intents know something no cue list can express: whether they actually
   have an answer for this. "The transaction log is full, what do I do"
   contains no word meaning troubleshooting, and the word it does contain —
   log — means something else entirely. A probe lets an intent say "I have a
   page on exactly this", which is better evidence than any keyword. */
function scoreOne(intent, norm, ws, mw, slots, asking, firstVerb){
  /* a required slot that is not there disqualifies it outright, which is what
     stops "mark it done" firing when no record was named */
  for (const n of (intent.needs || [])) if (!slots[n]) return 0;

  /* The dimension named in the sentence decides what the answer must be
     about. An intent that answers about systems cannot serve a question about
     types, however well its verbs match — that is how "which type is most
     common" came back with a person's name. */
  /* Only a SPECIFIC dimension gates. "Which system raises the most tasks"
     names both a system and tasks; tasks is what everything is made of, and
     letting it disqualify the systems answer left the question unanswered
     altogether. readDimension already prefers the specific one, so a dim of
     "record" means nothing more precise was named. */
  if (slots.dim && slots.dim !== "record" && intent.dim && intent.dim !== slots.dim) return 0;

  /* "ok" and "right" and "hi" are answers when they are the whole message and
     throat-clearing when they are not. "ok what is overdue right now" was
     coming back as a bare acknowledgement because "ok" and "right" both
     scored. An intent may say it only counts on its own. */
  if (intent.only && !intent.only(mw, norm, slots)) return 0;

  const c = cueScore(intent, mw, norm);
  let s = c.s;
  /* an intent with a probe must be allowed to speak even when not one of its
     cue words appears — that is the whole point of having one */
  if (!s && !(intent.needs || []).length && !intent.probe) return 0;

  for (const b in (intent.boost || {})) if (slots[b]) s += intent.boost[b];
  (intent.needs || []).forEach(() => s += 6);
  if (slots.dim && slots.dim !== "record" && intent.dim === slots.dim) s += 9;

  /* "who is the prime minister" once reached "who raises the most" on the
     strength of the single word "who", and answered it with a colleague's
     name. One weak generic word is not evidence: something has to be
     distinctive — a heavy cue, a whole phrase, two separate words, or a
     concrete thing named in the sentence — or the score is capped below the
     floor and the bot says it did not follow. */
  const named = (intent.needs || []).some(n => slots[n]) ||
                Object.keys(intent.boost || {}).some(k => slots[k]);
  let probed = 0;
  if (intent.probe){
    try { probed = intent.probe(mw, norm, slots) || 0; } catch(e){ probed = 0; }
  }
  if (!(c.best >= 4 || c.phrase || c.hit >= 2 || named || probed)) s = Math.min(s, 4);
  s += probed;

  /* the shape of the sentence */
  if (intent.kind === "read" || intent.kind === "social"){
    if (asking) s += 4;
  } else if (intent.kind === "write"){
    if (asking) s -= 7;
    else s += 3;
    if (firstVerb && intent.cues[firstVerb] >= 6) s += 6;
  }
  return s;
}

/* what the app should show when nothing scored well enough */
function puzzled(slots, api){
  if (slots.record)
    return { intent:"record", forced:true };
  if (slots.system || slots.person || slots.type || slots.tag || slots.party || slots.range)
    return { intent:"find", forced:true };
  return null;
}

/* ═══ SAYING WHAT IT DID NOT USE ═════════════════════════════════════════
   The worst thing this file did was not misunderstanding — it was
   misunderstanding silently. "Worst system except others" was answered
   exactly as "worst system" would have been, with the same confidence and no
   sign that two words had been thrown away.

   So after an answer is chosen, the words that went into it are subtracted
   from the words that were typed, and whatever is left over is said out loud.
   A wrong answer you can see is wrong is worth several right ones. */

/* words that are always understood, whichever intent wins */
const ALWAYS_READ = {};
("today yesterday tomorrow week weeks month months year years day days hour hours " +
 "minute minutes morning afternoon evening night now last next this past since until " +
 "recent recently ago mon monday tue tuesday wed wednesday thu thursday fri friday " +
 "sat saturday sun sunday jan feb mar apr may jun jul aug sep sept oct nov dec " +
 "record records task tasks job jobs item items ticket tickets thing things stuff " +
 "one two three four five six seven eight nine ten " +
 "show list give tell find get pull display see look want need know " +
 "ones one thing anything everything something nothing please kindly quickly " +
 "right currently still actually really maybe perhaps also too again already " +
 "much many more less any some all every each other others").split(" ")
  .forEach(w => ALWAYS_READ[w] = 1);

/* which of the typed words this intent actually scored on */
function cueWords(intent, mw, norm){
  const hit = {};
  mw.forEach(w => {
    variants(w).forEach(v => { if (intent.cues && intent.cues[v] != null) hit[w] = 1; });
    if (!hit[w] && w.length >= 5 && intent.cues){
      for (const c in intent.cues){
        if (c.length >= 5 && close(w, c) >= 0.86) { hit[w] = 1; break; }
      }
    }
  });
  const padded = " " + norm + " ";
  (intent.phrases || []).forEach(p => {
    if (padded.indexOf(" " + p[0] + " ") >= 0)
      p[0].split(" ").forEach(w => hit[w] = 1);
  });
  return hit;
}

function leftoverWords(it, A){
  const s = A.slots, mw = A.mw || [];
  const used = cueWords(it, mw, A.norm);
  /* everything the readers already consumed */
  if (s.mods) for (const w in s.mods.used) used[w] = 1;
  if (s._usedWords) s._usedWords.forEach(w => used[w] = 1);
  if (s.field && s.field.word) used[s.field.word] = 1;
  if (s.pick && s.pick.word) String(s.pick.word).split(" ").forEach(w => used[w] = 1);
  if (s.pick && s.pick.named) String(s.pick.named).split(" ").forEach(w => used[w] = 1);
  [s.dim, s.agg].forEach(() => {});
  const out = [];
  mw.forEach(w => {
    if (used[w] || ALWAYS_READ[w] || NOISE.has(w) || ASKING.has(w)) return;
    if (w.length < 3 || /^\d/.test(w)) return;
    if (DIMWORD[w] || AGG_MOST.indexOf(w) >= 0 || AGG_LEAST.indexOf(w) >= 0) return;
    if (STATUS_WORD[w] || NEG_MAP[w]) return;
    if (out.indexOf(w) < 0) out.push(w);
  });
  return out.slice(0, 4);
}

/* ═══ SHAPES AND SMALL HELP ══════════════════════════════════════════════ */

/* every reply leaves here with the same fields, so nothing downstream has to
   test whether the bot understood before reading what it said */
function blank(say, note, chips){
  return { intent:null, kind:"none", label:"", confidence:0, learned:false,
           say:say || "", note:note || "", rows:[], chips:chips || [],
           alternatives:[], slots:{ system:"", person:"", type:"", party:"", tag:"",
           priority:"", range:"", record:"" }, context:{} };
}

/* a code that names nothing — what might it have been? */
function nearCodes(api, raw){
  const want = String(raw).toUpperCase().replace(/^D-?/, "").replace(/^0+/, "");
  if (!want) return [];
  const out = [];
  api.tasks.forEach(t => {
    const n = String(t.code).toUpperCase().replace(/^D-?/, "").replace(/^0+/, "");
    if (!n) return;
    const d = editDistance(want, n, 3);
    if (d <= 2) out.push({ code:t.code, title:t.title, id:t.id, d });
  });
  return out.sort((a, b) => a.d - b.d || a.code.localeCompare(b.code)).slice(0, 3);
}
function firstCode(api){
  const c = api.tasks.map(t => t.code).filter(Boolean).sort();
  return c[0] || "D-0001";
}
function lastCode(api){
  const c = api.tasks.map(t => t.code).filter(Boolean).sort();
  return c[c.length - 1] || "D-0001";
}

/* when it has no idea, offer the questions closest to what was typed rather
   than the same four every time */
function pickSuggestions(mw, slots){
  const scored = INTENTS.filter(x => x.kind === "read")
    .map(it => ({ it, s: cueScore(it, mw, mw.join(" ")).s }))
    .sort((a, b) => b.s - a.s);
  const top = scored.filter(x => x.s > 0).slice(0, 3).map(x => x.it);
  const filler = INTENTS.filter(x => ["next", "brief", "overdue", "help"].indexOf(x.name) >= 0);
  filler.forEach(f => { if (top.length < 4 && top.indexOf(f) < 0) top.push(f); });
  return top.slice(0, 4);
}

/* ═══ THE THREAD OF THE CONVERSATION ═════════════════════════════════════
   What separates a chat from a search box: "it", "that one", "and last
   week?" only mean anything if the last few turns are still around. The app
   hands the running context in as api.convo and stores back what comes out,
   so each thread of conversation carries its own.

   Nothing here guesses across a change of subject: a pronoun reaches back for
   a record, a bare follow-up reaches back for an intent, and an explicit
   mention of anything always wins over both. */

/* "it" alone points back at whatever we were discussing. "this application"
   does not — the noun after it says what is meant, and borrowing a record
   there produced "still about D-0004" on a question about the software.
   So: only a pronoun standing on its own, or one followed by a word that is
   plainly not a noun. */
const PRONOUN = /\b(?:it|its|it's|them|they|that one|this one|the one|the same)\b(?!\s+[a-z]{3,})|\b(?:it|them)\b\s*[?.!]?\s*$|\bon it\b|\babout it\b|\bwith it\b|\bfor it\b|\bis it\b/;
const FOLLOWUP = /^(and|also|then|what about|how about|ok what about|okay what about|but)\b/;
const BARE_YES = /^(yes|yeah|yep|ok|okay|sure|go on|do it|please do)\b/;

/* Where one sentence stops being one request. Only splits on connectives
   that genuinely join two instructions — "log X and Y" is one record with a
   long name, but "log X and also turn on notifications" is two jobs. */
const JOIN = /\s+(?:and\s+also|and\s+then|,\s*and\s+also|;\s*|\.\s+also\s+|\s+then\s+also\s+)\s*/i;
function splitRequests(text){
  const raw = String(text || "").trim();
  if (raw.length < 24) return [raw];
  const parts = raw.split(JOIN).map(x => x.replace(/^[\s,;.]+|[\s,;.]+$/g, "")).filter(x => x.length > 3);
  return parts.length > 1 ? parts.slice(0, 3) : [raw];
}

/* ═══ LEARNING THE SHAPE, NOT THE SENTENCE ═══════════════════════════════════
   Telling it what you meant used to store the sentence you typed, word for
   word. So you would teach it "what is the ticket of task D-0032", it would
   get that one right forever, and the next morning you would ask the same
   thing about D-0045 and be a stranger again. That is not learning. That is a
   lookup table with one more row in it.

   What gets stored now is the sentence with its particulars taken out:

        what is the ticket of task D-0032   →   what is the ticket of task <code>

   and that one lesson answers D-0045, D-0117 and every code you will ever
   type. The same is done for system names, people, parties, types, tags,
   dates, priorities and plain numbers — anything a reader could fill in
   again — so teaching it "how is Imaging doing" also teaches it about Policy.

   Two lessons are kept from every correction: the exact sentence (so the
   thing you actually typed is certain to work) and the shape (so everything
   like it works too). The shape is the one that earns its keep. */

const PLACE_KIND = { system:"<system>", person:"<person>", party:"<party>",
                     type:"<type>", tag:"<tag>", script:"<script>", status:"<status>" };

/* words that are a date rather than a thing */
const WHENWORD = {};
("today yesterday tomorrow tonight now week weeks month months year years " +
 "monday tuesday wednesday thursday friday saturday sunday " +
 "jan january feb february mar march apr april may jun june jul july aug august " +
 "sep sept september oct october nov november dec december").split(" ")
  .forEach(w => WHENWORD[w] = 1);

const CODE_ONE = /^(?:d-?\d{1,7}|[a-z]{2,6}\d{4,12})$/;

function templateOf(norm, api){
  const ws = words(String(norm || ""));
  if (!ws.length) return "";
  const out = ws.slice();
  const lex = api.lex || lexiconFor(api);

  /* codes first — the most particular thing any sentence about work carries */
  for (let i = 0; i < out.length; i++) if (CODE_ONE.test(out[i])) out[i] = "<code>";
  /* "d 0032", typed with the space left in */
  for (let i = 0; i + 1 < out.length; i++)
    if (out[i] === "d" && /^\d{1,7}$/.test(out[i + 1])){ out[i] = "<code>"; out[i + 1] = ""; }

  /* names this workspace knows — a system, a colleague, a vendor, a type */
  const found = findTerms(ws, lex, null, null);
  found.hits.forEach(x => {
    const ph = PLACE_KIND[x.term.kind];
    if (!ph) return;
    for (let j = 0; j < x.len; j++){
      if (out[x.at + j] === "<code>") return;
    }
    for (let j = 0; j < x.len; j++) out[x.at + j] = j === 0 ? ph : "";
  });

  for (let i = 0; i < out.length; i++){
    const w = out[i];
    if (!w || w.charAt(0) === "<") continue;
    if (/^p[1-4]$/.test(w)){ out[i] = "<pri>"; continue; }
    if (WHENWORD[w]){ out[i] = "<when>"; continue; }
    if (/^\d+$/.test(w)){ out[i] = "<n>"; continue; }
  }

  /* "last week" and "next month" leave two <when>s in a row; one is enough */
  const kept = [];
  out.forEach(w => {
    if (!w) return;
    if (w === "<when>" && kept[kept.length - 1] === "<when>") return;
    kept.push(w);
  });
  return kept.join(" ");
}

/* Words that carry no meaning of their own in a taught shape. "Show me the
   ticket for D-0032" and "what is the ticket of D-0045" are the same lesson;
   only "ticket" is doing any work in either of them. */
const TPL_SKIP = {};
("record records task tasks job jobs item items ticketno thing things stuff ones " +
 "show list give tell find get pull display see want need know please kindly " +
 "me my our your the a an is are was were do does did can could would should will " +
 "of for to in on at with from by as and or but if then so about there here " +
 "one two now still just also again really actually currently").split(" ")
  .forEach(w => TPL_SKIP[w] = 1);

function tplParts(tpl){
  const ws = String(tpl || "").split(" ").filter(Boolean);
  const slots = [], content = [];
  ws.forEach(w => {
    if (w.charAt(0) === "<"){ if (slots.indexOf(w) < 0) slots.push(w); return; }
    if (TPL_SKIP[w] || NOISE.has(w) || ASKING.has(w) || w.length < 2) return;
    if (content.indexOf(w) < 0) content.push(w);
  });
  return { slots, content };
}

/* the value stored against a lesson may be a bare intent name (what earlier
   versions wrote) or a small record of when and why it was taught */
function lessonIntent(v){ return (v && typeof v === "object") ? v.intent : v; }

/* Nearest taught shape, when nothing matches outright. A lesson only carries
   across if every placeholder it was taught with is present again — a lesson
   about "<code>" is not a lesson about a question with no record in it — and
   if what the two have in common is most of what either of them is. One word
   in common is a coincidence unless it is a long and particular word. */
function nearestTaught(tpl, mem){
  const mine = tplParts(tpl);
  let best = null, bestScore = 0;
  for (const k in mem){
    if (k.charAt(0) !== "~") continue;
    const name = lessonIntent(mem[k]);
    if (!name) continue;
    const theirs = tplParts(k.slice(1));
    if (!theirs.content.length && !theirs.slots.length) continue;
    if (!theirs.slots.every(x => mine.slots.indexOf(x) >= 0)) continue;
    const shared = theirs.content.filter(w => mine.content.indexOf(w) >= 0);
    if (!shared.length) continue;
    if (shared.length < 2 && !shared.some(w => w.length >= 5)) continue;
    const cover = shared.length / theirs.content.length;
    const focus = shared.length / Math.max(1, mine.content.length);
    if (cover < 0.6 || focus < 0.5) continue;
    const sc = cover * 0.6 + focus * 0.4;
    if (sc > bestScore){ bestScore = sc; best = { intent:name, key:k, score:Math.round(sc * 100) / 100 }; }
  }
  return best;
}

/* Both keys a correction writes: the sentence, and its shape. The app calls
   this so the two files can never disagree about how a lesson is filed. */
function teachKeys(raw, api){
  const norm = normalise(raw);
  if (!norm) return null;
  api.lex = lexiconFor(api);
  const tpl = templateOf(norm, api);
  return { exact:norm, shape:tpl ? "~" + tpl : "", template:tpl };
}

/* ═══ WHICH ONE ═════════════════════════════════════════════════════════════
   "Open the first document of D-0034" could not be asked, and no amount of
   teaching could make it askable, because teaching maps a whole sentence onto
   one of a fixed list of verbs and there is nowhere in that to put *which
   one*. You could teach it "show me the documents" and get all four. Wanting
   the second one meant reading the list and clicking.

   That is the same shape of problem as "except Other" was: not a missing
   verb, a missing DIMENSION of the sentence. So it is solved the same way —
   read once, applied everywhere, so it works on answers written years before
   anybody thought of it.

   Every answer that comes back as a list is now addressable:

       open the first document of D-0034
       the second one
       run the last script on it
       open the one called invoice
       number 3

   and the same six words work on documents, records, scripts, steps and
   anything else that ever returns rows. Nothing has to be taught, and nothing
   had to be written per intent. */

const ORDINAL = { first:1, "1st":1, second:2, "2nd":2, third:3, "3rd":3, fourth:4, "4th":4,
  fifth:5, "5th":5, sixth:6, "6th":6, seventh:7, "7th":7, eighth:8, "8th":8,
  ninth:9, "9th":9, tenth:10, "10th":10 };
const LAST_WORD = { last:1, latest:1, final:1, newest:1, bottom:1 };
/* "top" is a superlative everywhere else in this file, but "the top one"
   said after a list is plainly the first row of it */
ORDINAL.top = 1;

/* the nouns an ordinal can be counting. "Last week" is a date and "first
   thing" is a figure of speech; only these make it a selection. */
/* Deliberately narrow. "The first THING I should do" is what to work on next
   and "the first STEP" is a checklist \u2014 both are owned by other questions and
   neither is a selection, so those words are not on this list. */
const PICK_NOUN = {};
("one ones document documents doc docs file files attachment attachments " +
 "record records item items row rows result results entry entries " +
 "script scripts note notes").split(" ").forEach(w => PICK_NOUN[w] = 1);

function readPick(ws, norm){
  /* "the one called invoice", "the file named contract" */
  let m = norm.match(/\b(?:one|file|document|record|script|item)\s+(?:called|named|titled)\s+(.{2,60}?)\s*$/);
  if (m){
    /* "the document called invoice ON D-0034" \u2014 the name ends where the
       sentence goes back to talking about where it lives */
    const nm = m[1].trim().replace(/\s+(?:on|in|of|for|from|at|inside|under)\s+.*$/, "").trim();
    if (nm.length >= 2) return { named:nm, word:"called", counted:true };
  }

  /* "number 3", "no. 2", "item 4" */
  m = norm.match(/\b(?:number|no|item|row|entry)\s+(\d{1,2})\b/);
  if (m && +m[1] > 0) return { n:+m[1], word:m[0], counted:true };

  for (let i = 0; i < ws.length; i++){
    const w = ws[i];
    const ord = ORDINAL[w], isLast = LAST_WORD[w];
    if (!ord && !isLast) continue;
    /* it has to be counting something, or standing where a noun would be */
    const a = ws[i + 1] || "", b = ws[i + 2] || "";
    const counting = PICK_NOUN[a] || PICK_NOUN[b];
    const standalone = (i === ws.length - 1) && ws[i - 1] === "the";
    if (!counting && !standalone) continue;
    /* whether a noun was actually being counted. "Open the last ONE" is
       pointing at a list even when there is no list yet, and saying so beats
       offering to log a record called "open the last one". */
    return isLast ? { n:-1, word:w, counted:!!counting }
                  : { n:ord, word:w, counted:!!counting };
  }
  return null;
}

/* pick one row out of a list, given what was asked for */
function choose(rows, pick){
  if (!rows || !rows.length || !pick) return null;
  if (pick.named){
    const want = flat(pick.named);
    const hit = rows.find(r => flat(r.text).indexOf(want) >= 0) ||
                rows.find(r => flat(r.code || "").indexOf(want) >= 0);
    return hit ? { row:hit, at:rows.indexOf(hit) + 1 } : null;
  }
  if (pick.n === -1) return { row:rows[rows.length - 1], at:rows.length };
  if (pick.n >= 1 && pick.n <= rows.length) return { row:rows[pick.n - 1], at:pick.n };
  return { over:true, want:pick.n, have:rows.length };
}

/* what pressing on that row would do, which depends on what kind of thing it
   turned out to be rather than on which question produced it */
function actOn(r){
  if (!r) return null;
  if (r.kind === "file" && r.file) return { kind:"openFile", id:r.id, name:r.file };
  if (r.kind === "script" && r.scriptId) return { kind:"run", id:r.id, scriptId:r.scriptId };
  if (r.id) return { kind:"open", id:r.id };
  return null;
}
const OPEN_VERB = /\b(?:open|show|view|see|read|bring|pull|get|display|look at|run|launch|execute)\b/;

/* ═══ WHAT PEOPLE PUT IN FRONT OF A QUESTION ═════════════════════════════════
   "Right, show me imaging" came back "What would you like?" — it read the
   agreement and threw the request away. So did "hi what is overdue", which
   said good morning and never mentioned the nine overdue records.

   Nobody opens their mouth with the question. They open with hello, or with
   right, or with sorry, and then they ask. Two moves in one breath, and an
   assistant that can only hear the first of them is one you learn to type
   carefully at — which is the opposite of a conversation.

   So the opener is peeled off and answered as an opener, and what is left is
   answered as the question. Only when something is genuinely left: "ok" on
   its own is still an answer, not a preamble to nothing. */

const LEAD_IN = [
  [/^(?:good morning|good afternoon|good evening|good day|hi there|hey there|hello there|hi|hey|hello|hiya|heya|yo|morning|afternoon|evening|greetings)\b[\s,.:;!?-]*/, "greet"],
  [/^(?:ok then|okay then|alright then|right then|ok|okay|okey|alright|right|sure|yes|yeah|yep|yup|fine|cool|great|good|perfect|nice)\b[\s,.:;!?-]*/, "affirm"],
  [/^(?:thanks a lot|thank you|thanks|thankyou|thx|cheers|ta)\b[\s,.:;!?-]*/, "thanks"],
  [/^(?:i am sorry|im sorry|sorry|my bad|apologies|oops|whoops)\b[\s,.:;!?-]*/, "sorry"],
  [/^(?:so|well|anyway|anyhow|now|then|hmm|hm|um|erm|er|actually|basically|listen|look)\b[\s,.:;!?-]*/, ""],
  [/^(?:please|kindly|quickly|just)\b[\s,.:;!?-]*/, ""]
];
const HAS_CODE = /\b(?:d-?\s?\d{1,7}|[a-z]{2,6}\d{4,12})\b/;

function readLeadIn(norm, lex){
  let rest = String(norm || ""), kind = "", cuts = 0;
  for (let pass = 0; pass < 3; pass++){
    let cut = false;
    for (const pair of LEAD_IN){
      const m = rest.match(pair[0]);
      if (!m || !m[0].trim()) continue;
      const after = rest.slice(m[0].length).trim();
      /* Something has to be left behind that could be a request on its own.
         Two plain words will do, a record code will do, and so will a single
         word behind a question or an instruction \u2014 "hey can you help me" is
         only "help" once the greeting and the politeness are gone. */
      if (meaningful(words(after)).length < 2 && !HAS_CODE.test(after) &&
          !/^(?:can|could|would|will|shall|what|which|who|whose|when|where|why|how|is|are|am|do|does|did|have|has|show|give|tell|find|list|log|add|run|mark|open|go|any|anything|help)\b/.test(after) &&
          !/^(?:and|also|then|but|plus|what about|how about)\b/.test(after) &&
          !(lex && findTerms(words(after), lex, null, null).hits.length))
        continue;
      rest = after;
      if (pair[1] && !kind) kind = pair[1];
      cuts++; cut = true; break;
    }
    if (!cut) break;
  }
  return cuts ? { rest:rest, kind:kind } : null;
}

/* the acknowledgement that goes back in front of the answer, so peeling the
   opener off does not make it curt */
function leadWords(kind, norm, when){
  if (kind === "greet")
    return when === "morning" ? one(["Morning \u2014 ", "Good morning. ", "Morning. "], norm)
         : when === "afternoon" ? one(["Afternoon \u2014 ", "Good afternoon. ", "Afternoon. "], norm)
         : when === "evening" ? one(["Evening \u2014 ", "Good evening. ", "Evening. "], norm)
         : one(["Hello \u2014 ", "Hello. ", "Still at it? "], norm);
  if (kind === "thanks") return one(["Any time \u2014 ", "Glad it helped \u2014 ", "No trouble \u2014 "], norm);
  if (kind === "sorry")  return one(["No need \u2014 ", "Nothing to apologise for \u2014 ", "That is fine \u2014 "], norm);
  if (kind === "affirm") return one(["Right \u2014 ", "Sure \u2014 ", "Of course \u2014 ", "Yes \u2014 "], norm);
  return "";
}

function ask(raw, api){
  const text = String(raw == null ? "" : raw).trim();
  if (!text) return blank("Ask me something. Type \"help\" for examples.", "help");

  const norm0 = normalise(text);
  /* built here rather than below, because peeling an opener needs to know
     whether what is left is one of your own system or people names \u2014
     "right, policy?" is a follow-up, not an acknowledgement */
  api.lex = lexiconFor(api);
  /* hello-and-then-the-question: answer both halves rather than the first */
  const lead = readLeadIn(norm0, api.lex);
  const norm = lead ? lead.rest : norm0;
  const ws = words(norm);
  let mw = meaningful(ws);
  const firstVerb = mw[0] || "";
  /* "the transaction log is full, what do i do" is a question, but the
     question word is at the end — testing only the first couple of words read
     it as an instruction to log a record called "transaction log is full" */
  const asking = /\?\s*$/.test(text) || (ws.length && ASKING.has(ws[0])) ||
                 mw.some(w => ASKING.has(w) && mw.indexOf(w) < 2) ||
                 (/\b(what|which|who|when|where|why|how)\b/.test(norm) &&
                  !/^\s*(log|add|create|run|mark|close|chase|remind|undo|open|go|start|put|set)\b/.test(norm));

  const slots = readSlots(norm, ws, api, text);
  /* words a modifier consumed have been understood; leaving them in the bag
     lets them vote for intents that have nothing to do with the question */
  if (slots.mods && slots.mods.mask){
    const keep = ws.filter((w, i) => !slots.mods.mask[i]);
    mw = meaningful(keep);
  }
  const convo = api.convo || {};

  /* a code that names nothing — say so, and offer what it might have been,
     rather than answering a question that was never asked */
  if (slots.unknownCode){
    const near = nearCodes(api, slots.unknownCode);
    return blank("I have no " + slots.unknownCode + " in this workspace.",
      near.length ? "Closest codes I do have: " + near.map(x => x.code).join(", ") + "."
                  : "Codes here run from " + firstCode(api) + " to " + lastCode(api) + ".",
      near.map(x => ({ label:x.code + " — " + x.title.slice(0, 34),
                       act:{ kind:"open", id:x.id } })));
  }

  /* "what is left on it" — a pronoun with no record of its own borrows the
     one this thread was already talking about */
  if (!slots.record && convo.record && PRONOUN.test(norm)){
    const rec = api.tasks.find(x => x.id === convo.record);
    if (rec){ slots.record = rec; slots.borrowed = "record"; }
  }
  ["system", "person", "party", "type"].forEach(k => {
    if (!slots[k] && convo[k] && (PRONOUN.test(norm) || FOLLOWUP.test(norm))){
      slots[k] = convo[k]; slots.borrowed = slots.borrowed || k;
    }
  });

  const A = { api, slots, ws, mw, norm, raw:text, asking, convo, lead:lead,
              phrase: api.phrase || (p => (p && p.k) || "") };

  /* "create a reminder … and also turn on the notifications" is two requests
     in one breath, and answering only the first half is how an assistant
     loses your trust. Split it, and offer both. */
  const parts = splitRequests(text);
  if (parts.length > 1){
    const done = [], seen = {};
    parts.forEach(part => {
      const r = askOne(part, api, convo);
      if (!r || !r.intent || seen[r.intent]) return;
      if (!r.act && r.kind !== "read") return;
      seen[r.intent] = 1;
      done.push(r);
    });
    if (done.length > 1 && done.some(r => r.act)){
      const out = blank(
        say(["Two things there — here is each of them.",
             "That is two requests. Both below.",
             "I read that as two things."], {}, norm),
        "Confirm them one at a time.");
      out.intent = "plan";
      out.label = "Two things";
      out.confidence = Math.min.apply(null, done.map(r => r.confidence || 0.7));
      out.steps = done.map(r => ({ say:r.say, note:r.note, act:r.act, label:r.label }));
      out.context = done[done.length - 1].context || {};
      return out;
    }
  }

  /* answering a question this thread asked you: "which record?" → "D-0004" */
  if (convo.awaiting && convo.awaiting.intent){
    const want = convo.awaiting.slot;
    if (!want || slots[want]){
      const it = INTENTS.find(x => x.name === convo.awaiting.intent);
      if (it) return finish(it, A, 0.95, []);
    }
  }

  /* "and last week?" — same question, new detail */
  if (FOLLOWUP.test(norm) && convo.lastIntent){
    const carriesSomething = slots.range || slots.system || slots.person ||
                             slots.type || slots.party || slots.priority || slots.record;
    if (carriesSomething){
      const it = INTENTS.find(x => x.name === convo.lastIntent);
      /* only if the fragment adds nothing that looks like a question of its own */
      if (it && mw.filter(w => !NOISE.has(w)).length <= 4)
        return finish(it, A, 0.9, [], false, true);
    }
  }

  /* Something you have already corrected wins outright — and so does anything
     built the same way, which is the whole point of keeping the shape. Three
     chances, in order of how sure they are: the sentence itself, the shape of
     it, then the nearest shape you have taught that this could be. */
  const mem = api.memory || {};
  let remembered = lessonIntent(mem[norm]), how = "exact", from = norm, near = null;
  if (!remembered){
    const tpl = templateOf(norm, api);
    if (tpl){
      remembered = lessonIntent(mem["~" + tpl]);
      if (remembered){ how = "shape"; from = tpl; }
      else {
        near = nearestTaught(tpl, mem);
        if (near){ remembered = near.intent; how = "near"; from = near.key.slice(1); }
      }
    }
  }
  if (remembered){
    const it = INTENTS.find(x => x.name === remembered);
    /* a lesson cannot conjure a record out of a sentence that has none — when
       what it needs is missing, fall through and answer honestly */
    if (it && (it.needs || []).every(n => slots[n])){
      const out = finish(it, A, how === "near" ? 0.9 : 1, [], true);
      out.taught = { how:how, from:from, score:near ? near.score : 1 };
      return out;
    }
  }

  const answer = rank(A, norm, ws, mw, slots, asking, firstVerb, convo);

  /* The opener turns out to have been the whole message. "Thanks, that is
     what I needed" leaves "that is what I needed" behind, which means nothing
     on its own \u2014 so peeling was the wrong call and the thanks was the point.
     Rather than guess up front, guess late and check: if what is left does not
     answer to anything, answer the opener instead. */
  if (lead && lead.kind && (!answer.intent || (answer.confidence || 0) < 0.45)){
    const it = INTENTS.find(x => x.name === lead.kind);
    if (it){
      const ws0 = words(norm0), mw0 = meaningful(ws0);
      const A0 = { api, slots:readSlots(norm0, ws0, api, text), ws:ws0, mw:mw0,
                   norm:norm0, raw:text, asking, convo,
                   phrase: api.phrase || (p => (p && p.k) || "") };
      return finish(it, A0, 0.9, []);
    }
  }
  return answer;
}

/* score one request and answer it — the ordinary path, and what each half of
   a compound request goes through on its own */
function askOne(text, api, convo){
  const norm = normalise(text), ws = words(norm), mw = meaningful(ws);
  const slots = readSlots(norm, ws, api, text);
  const asking = /\?\s*$/.test(text) || (ws.length && ASKING.has(ws[0]));
  const A = { api, slots, ws, mw, norm, raw:text, asking, convo:convo || {},
              phrase: api.phrase || (p => (p && p.k) || "") };
  return rank(A, norm, ws, mw, slots, asking, mw[0] || "", convo || {});
}

function rank(A, norm, ws, mw, slots, asking, firstVerb, convo){
  const api = A.api;
  const ranked = INTENTS
    .map(it => ({ it, s: scoreOne(it, norm, ws, mw, slots, asking, firstVerb) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s);

  if (!ranked.length || ranked[0].s < 5){
    const f = puzzled(slots, api);
    if (f){
      const it = INTENTS.find(x => x.name === f.intent);
      if (it) return finish(it, A, 0.55, ranked.slice(0, 2).map(x => x.it));
    }
    const out = blank("I did not follow that.",
      "Tell me which of these you meant and I will remember the phrasing. " +
      "Or type \"help\" for the full list.");
    out.alternatives = pickSuggestions(mw, slots)
      .map(x => ({ label:x.label, intent:x.name }));
    return out;
  }

  const top = ranked[0], second = ranked[1];
  const gap = second ? top.s / (top.s + second.s) : 1;
  const strength = Math.min(1, top.s / 14);
  const confidence = Math.round((gap * 0.6 + strength * 0.4) * 100) / 100;

  /* two readings too close to call: offer both rather than guess */
  const alts = [];
  if (second && gap < 0.6) alts.push({ label:second.it.label, intent:second.it.name });
  if (ranked[2] && ranked[2].s > top.s * 0.7) alts.push({ label:ranked[2].it.label, intent:ranked[2].it.name });

  return finish(top.it, A, confidence, alts.map(a => INTENTS.find(x => x.name === a.intent)));
}

function finish(it, A, confidence, altIntents, learned, followed){
  let out;
  /* what this same question came back with last time in this thread, so the
     answer can say "same as when you asked" instead of repeating itself flat */
  A.self = it.name;
  A.before = (A.convo && A.convo.seen) ? A.convo.seen[it.name] : null;
  try { out = it.run(A) || {}; }
  catch(e){ out = { say:"That one broke on me: " + (e && e.message || e) }; }
  out.intent = it.name;
  out.label = it.label;
  out.confidence = confidence;
  out.learned = !!learned;
  out.followUp = !!followed;
  out.kind = it.kind;
  /* below this the reading is a guess, and the answer should be read as one */
  out.unsure = confidence < 0.62 && !learned;
  out.borrowed = A.slots.borrowed || "";
  out.applied = modWords(A.slots.mods);
  /* what it did not use — said out loud rather than dropped */
  const mods = A.slots.mods;
  if (mods && mods.sawTrigger && !mods.resolvedAny)
    out.ignored = { kind:"condition", words:[mods.sawTrigger] };
  else if (it.kind !== "social" && it.name !== "help" && it.name !== "about"){
    const left = leftoverWords(it, A);
    if (left.length) out.ignored = { kind:"words", words:left };
  }
  out.rows = out.rows || [];
  out.chips = out.chips || [];

  /* ── which one of them ──────────────────────────────────────────────────
     The answer has been worked out; this narrows it to the one that was
     asked for. It sits here rather than in any intent so that it works on
     every list this file can produce, including ones written long before
     there was a way to say "the second". */
  if (A.slots.pick && out.rows.length && !it.picks){
    const got = choose(out.rows, A.slots.pick);
    if (got && got.over){
      out.say = "There " + be(got.have) + " only " + got.have + " of them \u2014 " +
                "you asked for number " + got.want + ".";
      out.note = "";
    } else if (got && got.row){
      const r = got.row, act = actOn(r);
      const which = A.slots.pick.named ? "\u201c" + A.slots.pick.named + "\u201d"
                  : A.slots.pick.n === -1 ? "the last" : "number " + got.at;
      out.picked = { at:got.at, of:out.rows.length, text:r.text };
      out.rows = [r];
      /* Naming a thing and a verb in the same breath means do it. Opening
         and running change nothing that cannot be closed again, so they go
         ahead; anything that writes still asks, as it always did. */
      if (act && OPEN_VERB.test(A.norm)){
        if (act.kind === "run"){
          out.act = Object.assign({}, act, { confirm:"Run " + r.text + "?" });
          out.say = which + " of " + out.picked.of + ": " + r.text + ".";
        } else {
          out.act = act;
          out.say = "Opening " + r.text + (r.kind === "file" ? "" : " \u2014 " + (r.code || "")) + ".";
          out.note = which + " of " + out.picked.of + " on " + (A.slots.record ? A.slots.record.code : "the list") + ".";
        }
      } else {
        out.say = which + " of " + out.picked.of + ": " + r.text + ".";
        out.note = r.sub || out.note || "";
        if (act) out.chips = [{ label: act.kind === "openFile" ? "Open it"
                                 : act.kind === "run" ? "Run it" : "Open it", act:act }]
                              .concat(out.chips || []);
      }
    } else if (got === null && A.slots.pick.named){
      out.say = "Nothing in that list is called \u201c" + A.slots.pick.named + "\u201d.";
      out.note = out.rows.map((x, i) => (i + 1) + ". " + x.text).join("\n");
    }
  }
  out.slots = {
    system:A.slots.system || "", person:A.slots.person || "", type:A.slots.type || "",
    party:A.slots.party || "", tag:A.slots.tag || "", priority:A.slots.priority || "",
    range:A.slots.range ? A.slots.range.label : "", record:A.slots.record ? A.slots.record.code : "",
    dim:A.slots.dim || "", agg:A.slots.agg || "", yesno:!!A.slots.yesno,
    field:A.slots.field ? A.slots.field.id : "",
    neg:A.slots.neg ? Object.keys(A.slots.neg).join(",") : ""
  };
  /* what the next turn in this thread should still know */
  out.context = {
    lastIntent: it.name,
    record: A.slots.record ? A.slots.record.id
          : (out.rows.length === 1 && out.rows[0].id) ? out.rows[0].id
          : (A.convo && A.convo.record) || "",
    system: A.slots.system || (A.convo && A.convo.system) || "",
    person: A.slots.person || (A.convo && A.convo.person) || "",
    party:  A.slots.party  || (A.convo && A.convo.party)  || "",
    type:   A.slots.type   || (A.convo && A.convo.type)   || "",
    awaiting: out.awaiting || null,
    /* the list just shown, so the next sentence can point at one of them
       without naming the record again */
    rows: (out.rows || []).slice(0, 20).map(r => ({ id:r.id, code:r.code, text:r.text,
            sub:r.sub, kind:r.kind, file:r.file, scriptId:r.scriptId })),
    greeted: !!(out.greeted || (A.convo && A.convo.greeted))
  };
  /* "never mind" wipes the thread's subject rather than leaving it to be
     picked up by the next pronoun */
  if (out.clearContext){
    out.context.record = ""; out.context.system = ""; out.context.person = "";
    out.context.party = ""; out.context.type = ""; out.context.awaiting = null;
  }
  out.context.seen = Object.assign({}, (A.convo && A.convo.seen) || {});
  if (typeof out.count === "number") out.context.seen[it.name] = out.count;

  /* Where the last answer came from, kept so the next turn can be asked
     about it. "Are you sure?" and "how do you know?" are ordinary things to
     say to something that has just told you a number, and until now there
     was no way to answer them: nothing survived the turn except the name of
     the intent. An intent that talks ABOUT the last answer keeps it rather
     than replacing it, or the second "are you sure" would be about the
     first one. */
  out.context.last = (out.keepLast || it.keepLast)
    ? ((A.convo && A.convo.last) || null)
    : { intent:it.name, label:it.label,
        count: (typeof out.count === "number") ? out.count : null,
        confidence: confidence, learned: !!learned,
        taught: (out.taught && out.taught.how) || "",
        filters: slotWords(A.slots).trim(),
        applied: out.applied || "",
        rows: (out.rows || []).length,
        kind: it.kind,
        say: String(out.say || "").slice(0, 170) };
  /* "Is anything overdue?" was answered "3 records are overdue" — true, and
     not what was asked. Anything that reports a count can answer the question
     that was actually put, and then go on. */
  /* "Can I finish today?" has a count of three records and the answer is no —
     the count is not always what the yes-or-no is about, so an intent can say
     which it is. */
  if (A.slots.yesno && out.say && !out.steps &&
      (typeof out.yes === "boolean" || typeof out.count === "number")){
    if (typeof out.yes !== "boolean") out.yes = out.count > 0;
    /* only dash and comma joins, so the clause after it keeps flowing as one
       sentence — "Yes. one record waiting" needed a capital it was not going
       to get, and "There is, yes" contracts into nonsense */
    const lead = out.yes
      ? one(["Yes — ", "Yes, ", "Yes: "], A.norm + out.count)
      : one(["No — ", "No, ", "Not quite — "], A.norm + out.count);
    out.say = lead + lower(out.say);
  }

  /* An opener that was peeled off at the top is answered here, in front of
     whatever the rest of the sentence turned out to mean. "Hi what is
     overdue" gets a good morning AND the nine records. */
  if (A.lead && A.lead.kind && out.say && !out.steps){
    const pre = leadWords(A.lead.kind, A.norm, partOfDay(new Date()));
    if (pre && !(A.lead.kind === "greet" && A.convo && A.convo.greeted)){
      out.say = pre + lower(out.say);
      if (A.lead.kind === "greet") out.greeted = true;
    }
  }
  if (out.greeted) out.context.greeted = true;

  /* Contractions go on the sentence, never on the note. The note carries
     checklists and quoted system messages — "the service did not respond to
     the start request in a timely fashion" is Windows' wording, and rewriting
     it to "didn't" makes it unsearchable and slightly wrong. */
  out.say = contract(out.say);
  out.alternatives = (altIntents || []).filter(Boolean)
    .map(x => ({ label:x.label, intent:x.name }));
  return out;
}

/* run a named intent directly — what a "did you mean" button does */
function run(name, raw, api){
  const it = INTENTS.find(x => x.name === name);
  if (!it) return { say:"I do not have that one." };
  const norm = normalise(raw), ws = words(norm);
  api.lex = lexiconFor(api);
  const slots = readSlots(norm, ws, api, raw);
  const A = { api, slots, ws, mw:meaningful(ws), norm, raw:String(raw || ""), asking:true,
              phrase: api.phrase || (p => (p && p.k) || "") };
  return finish(it, A, 1, []);
}

/* ═══ CACHING THE LEXICON ════════════════════════════════════════════════
   Rebuilt only when the workspace actually changed — the app passes a stamp
   it can compute cheaply. */
let LEX = null, LEXKEY = "";
function lexiconFor(api){
  const key = api.cacheKey == null ? String(api.tasks.length) : String(api.cacheKey);
  if (LEX && key === LEXKEY) return LEX;
  LEX = buildLexicon(api); LEXKEY = key;
  return LEX;
}

/* ═══ THE SHORTLIST, FOR SOMETHING ELSE TO CHOOSE FROM ═══════════════════════
   When the matcher is unsure it is rarely lost \u2014 the right reading is usually
   in its top few and merely not first. That is a ranking problem, and a
   ranking problem is exactly what a small language model is good at and this
   file is not.

   So this hands out the candidates without the confidence floor that normally
   hides them, each with its label and an example, and something else decides.
   What comes back can only ever be one of these names, which is the whole
   safety of the arrangement: the model picks a question this file already
   knows how to answer, and cannot say anything to you itself. */

function shortlist(raw, api, n){
  const text = String(raw == null ? "" : raw).trim();
  if (!text) return [];
  api.lex = lexiconFor(api);
  const norm0 = normalise(text);
  const lead = readLeadIn(norm0, api.lex);
  const norm = lead ? lead.rest : norm0;
  const ws = words(norm);
  let mw = meaningful(ws);
  const slots = readSlots(norm, ws, api, text);
  if (slots.mods && slots.mods.mask)
    mw = meaningful(ws.filter((w, i) => !slots.mods.mask[i]));
  const asking = /\?\s*$/.test(text) || (ws.length && ASKING.has(ws[0])) ||
                 mw.some(w => ASKING.has(w) && mw.indexOf(w) < 2);
  const firstVerb = mw[0] || "";

  const ranked = INTENTS
    .map(it => ({ it, s: scoreOne(it, norm, ws, mw, slots, asking, firstVerb) }))
    .sort((a, b) => b.s - a.s)
    .filter(x => x.it.name !== "help");

  const card = it => ({ name:it.name, label:it.label, kind:it.kind, score:0,
    eg:(it.eg || (it.phrases && it.phrases[0] && it.phrases[0][0]) || "") });

  /* n of 0 means every question there is. That is not a fallback for a bad
     shortlist \u2014 it is the right list when the score says nothing: a sentence
     this file has no purchase on cannot be narrowed down BY this file, and
     handing over its arbitrary top eight is worse than handing over the menu.
     Seventy-odd short labels is a page of text, which is nothing to a model
     and everything to the odds of the right one being in front of it. */
  const all = !n || n <= 0;
  const want = all ? INTENTS.length : Math.max(3, Math.min(24, n));

  const out = [];
  ranked.forEach(x => {
    if (out.length >= want || (!all && x.s <= 0)) return;
    out.push(Object.assign(card(x.it), { score:x.s }));
  });
  /* Scores run out long before the candidates do \u2014 for a sentence with no
     word this file knows, forty intents tie on nothing and the right one is
     not among the eight that happened to sort first. "How much of my week
     went on Imaging" ranked find, howTo, dueWeek, troubleshoot \u2026 and never
     offered time spent at all, which is the answer.

     So the tail is not padding: it is one from each family of question this
     file can answer, in the order they are actually asked, so whatever the
     chooser is looking at it has seen the whole menu rather than one corner
     of it. */
  if (all){
    INTENTS.forEach(it => {
      if (it.name === "help" || out.some(o => o.name === it.name)) return;
      out.push(card(it));
    });
    return out;
  }
  if (out.length < want){
    const fill = ["next", "overdue", "dueToday", "dueWeek", "find", "record", "field",
                  "waiting", "quietest", "timeSpent", "howLong", "count", "closed",
                  "opened", "brief", "workload", "worstSystem", "topPerson", "history",
                  "notes", "steps", "files", "when", "blocked", "stalled", "oldest",
                  "undated", "tags", "systems", "rank", "compare", "solvedBefore",
                  "troubleshoot", "guide", "howTo", "opinion", "standup", "scripts",
                  "routines", "log"];
    fill.forEach(nm => {
      if (out.length >= want || out.some(o => o.name === nm)) return;
      const it = INTENTS.find(x => x.name === nm);
      if (it) out.push(card(it));
    });
  }
  return out;
}

window.DossierChat = {
  version: "1.1",
  /* the picker in the app needs something to show for each one, and the first
     phrase an intent matches on is the plainest example there is */
  intents: INTENTS.map(i => ({ name:i.name, label:i.label, kind:i.kind,
    eg: i.eg || (i.phrases && i.phrases[0] && i.phrases[0][0]) ||
        (i.cues && Object.keys(i.cues)[0]) || "" })),
  ask: ask,
  run: run,
  /* what a correction should be filed under: the sentence and its shape */
  keys: teachKeys,
  /* the readings it was weighing up, for something else to choose between */
  shortlist: shortlist,
  template: (raw, api) => { const k = teachKeys(raw, api); return k ? k.template : ""; },
  forget: () => { LEX = null; LEXKEY = ""; },
  _util: { normalise, words, meaningful, close, editDistance, readRange, readDate,
           buildLexicon, templateOf, nearestTaught, tplParts }
};

})();
