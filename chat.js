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
  "hey hi hello ok okay thanks thank pls plz").split(" "));

/* a question is being asked, rather than an instruction given */
const ASKING = new Set(("what which who whose whom when where why how is are was were " +
  "do does did can could should would will any anything something").split(" "));

function normalise(raw){
  let s = " " + String(raw == null ? "" : raw).toLowerCase() + " ";
  s = s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  for (const k in CONTRACTION) s = s.split(" " + k + " ").join(" " + CONTRACTION[k] + " ");
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
  if (a.indexOf(b) === 0 && b.length >= 4) return 0.9;
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
  return terms;
}

/* find the best lexicon entry inside a run of words, so that "release
   management" and "infra / iis" match as the phrases they are */
function findTerms(ws, lex, kinds){
  const hits = [];
  const used = new Array(ws.length).fill(false);
  /* longest phrases first — "data team" must beat "data" */
  const cand = lex.filter(t => !kinds || kinds.indexOf(t.kind) >= 0)
                  .sort((a, b) => b.ws.length - a.ws.length || b.weight - a.weight);
  cand.forEach(t => {
    const n = t.ws.length;
    for (let i = 0; i + n <= ws.length; i++){
      let free = true;
      for (let j = 0; j < n; j++) if (used[i + j]) { free = false; break; }
      if (!free) continue;
      let sc = 1;
      for (let j = 0; j < n && sc; j++) sc = Math.min(sc, close(ws[i + j], t.ws[j]));
      /* a one-word term also matches its squashed form: "infra/iis" */
      if (!sc && n === 1 && t.flat) sc = close(ws[i], t.flat) * 0.95;
      if (sc >= 0.78){
        for (let j = 0; j < n; j++) used[i + j] = true;
        hits.push({ term:t, at:i, len:n, score:sc * t.weight });
        break;
      }
    }
  });
  return { hits: hits.sort((a, b) => b.score - a.score), used };
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

function readSlots(norm, ws, api){
  const h = api.h, lex = api.lex, s = {};
  let m;

  /* D-14, d14, #INC0012345 — nearly always the subject of the sentence */
  const codes = [];
  const codeRe = /\b(d-?\s?\d{1,6}|[a-z]{2,6}\d{4,12})\b/g;
  while ((m = codeRe.exec(norm))){
    const t = h.findByRef(m[1].replace(/\s+/g, ""));
    if (t && codes.indexOf(t) < 0) codes.push(t);
  }
  if (codes.length){ s.record = codes[0]; s.records = codes; }

  if ((m = norm.match(/\bp\s?([1-4])\b/)) || (m = norm.match(/\bpriority ([1-4])\b/))) s.priority = "P" + m[1];
  if (/\bcritical|urgent\b/.test(norm) && !s.priority) s.priority = "P1";

  if ((m = norm.match(/\b(\d{1,3}(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)\b/))) s.minutes = Math.round(parseFloat(m[1]) * 60);
  else if ((m = norm.match(/\b(\d{1,4})\s*(m|min|mins|minute|minutes)\b/))) s.minutes = +m[1];

  if ((m = norm.match(/\bevery (\d{1,3}) (minute|minutes|min|mins|hour|hours|h|day|days)\b/))){
    const n = +m[1];
    s.every = /^(h|hour)/.test(m[2]) ? { unit:"hour", n } : /^d/.test(m[2]) ? { unit:"day", n } : { unit:"minute", n };
  } else if ((m = norm.match(/\bevery (hour|day|morning|minute)\b/))){
    s.every = { unit:m[1] === "morning" ? "day" : m[1], n:1 };
  }

  if ((m = norm.match(/\bat (\d{1,2}):(\d{2})\b/)) && +m[1] < 24 && +m[2] < 60)
    s.time = (m[1].length < 2 ? "0" : "") + m[1] + ":" + m[2];

  s.range = readRange(norm, h);
  s.date = readDate(norm, h);

  /* what the lexicon recognises, best hit per kind */
  const found = findTerms(ws, lex);
  found.hits.forEach(x => {
    const k = x.term.kind;
    if (!s[k]) s[k] = x.term.value;
    if (k === "person" && !s.personTerm) s.personTerm = x.term.text;
  });
  s._used = found.used;

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

/* ═══ ANSWERING ══════════════════════════════════════════════════════════ */

function row(t, api, sub){
  return { id:t.id, code:t.code, text:t.title, sub:sub || "" };
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
  cues:{ next:5, now:2, should:3, first:3, focus:3, priority:2, start:2, working:2,
         important:3, urgent:2, matters:3, tackle:3, doing:2 },
  phrases:[["what next",8],["do next",8],["work on",5],["should i do",8],["get on with",6],
           ["most important",6],["where do i start",8],["what now",6]],
  run(A){
    const api = A.api;
    if (!api.ai) return { say:"I need assist.js for that — it holds the ranking." };
    let q = api.ai.queue(api.ctx());
    if (Object.keys(A.slots).some(k => ["system","person","type","priority","party","tag"].indexOf(k) >= 0))
      q = q.filter(x => applySlots([x.task], A.slots, api).length);
    if (!q.length) return { say:"Nothing live" + slotWords(A.slots) + ". Enjoy it." };
    const top = q[0];
    return {
      say: "Start with " + top.task.code + " — " + top.task.title + ".",
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
  cues:{ overdue:8, late:6, behind:5, missed:4, slipping:6, slipped:6, past:3, due:2, breached:5 },
  phrases:[["past due",8],["running late",6],["over the date",5],["out of time",4]],
  run(A){
    const api = A.api, k = api.h.today();
    const list = applySlots(live(api), A.slots, api)
      .filter(t => t.due && t.due < k)
      .sort((a, b) => a.due < b.due ? -1 : 1);
    if (!list.length) return { say:"Nothing is overdue" + slotWords(A.slots) + "." };
    return {
      say: plural(list.length, "record") + slotWords(A.slots) + " " +
           (list.length === 1 ? "is" : "are") + " overdue.",
      rows: list.slice(0, 12).map(t => row(t, api,
        Math.round((Date.parse(k) - Date.parse(t.due)) / DAY) + "d late · " + t.priority)),
      chips: list.length > 1 ? [{ label:"Show them all", act:{ kind:"filter", ids:list.map(t => t.id), label:"Overdue" } }] : []
    };
  }
});
intent("dueToday", {
  kind:"read", label:"Due today",
  cues:{ today:6, due:4, plate:3, agenda:4, schedule:2 },
  phrases:[["due today",10],["on today",5],["for today",7],["my day",6],["on my plate",8],
           ["today's work",8],["what have i got",5]],
  run(A){
    const api = A.api, k = api.h.today();
    const list = applySlots(live(api), A.slots, api).filter(t => t.due && t.due <= k);
    const late = list.filter(t => t.due < k).length;
    if (!list.length) return { say:"Nothing is due today" + slotWords(A.slots) + "." };
    return {
      say: plural(list.length, "record") + " due today or earlier" + slotWords(A.slots) + ".",
      note: late ? late + " of those " + (late === 1 ? "is" : "are") + " already overdue." : "",
      rows: list.slice(0, 12).map(t => row(t, api, t.priority + (t.dueTime ? " · " + t.dueTime : ""))),
      chips: [{ label:"Open the Day view", act:{ kind:"view", view:"day" } }]
    };
  }
});
intent("dueWeek", {
  kind:"read", label:"Coming up",
  cues:{ week:5, upcoming:7, coming:6, ahead:5, soon:5, rest:3, remainder:4 },
  phrases:[["this week",7],["coming up",9],["rest of the week",9],["next few days",8],["week ahead",9]],
  run(A){
    const api = A.api, k = api.h.today(), end = api.h.addDays(k, 7);
    const list = applySlots(live(api), A.slots, api)
      .filter(t => t.due && t.due >= k && t.due <= end)
      .sort((a, b) => a.due < b.due ? -1 : 1);
    if (!list.length) return { say:"Nothing is dated in the next seven days" + slotWords(A.slots) + "." };
    const byDay = {};
    list.forEach(t => byDay[t.due] = (byDay[t.due] || 0) + 1);
    return {
      say: plural(list.length, "record") + " due in the next seven days" + slotWords(A.slots) + ".",
      note: Object.keys(byDay).sort().map(d => api.h.niceDate(d) + ": " + byDay[d]).join(" · "),
      rows: list.slice(0, 12).map(t => row(t, api, api.h.niceDate(t.due) + " · " + t.priority)),
      chips: [{ label:"Open the Week view", act:{ kind:"view", view:"week" } }]
    };
  }
});

/* ── searching ────────────────────────────────────────────────────────── */
intent("find", {
  kind:"read", label:"Find records",
  cues:{ find:6, show:5, list:6, search:7, records:4, all:3, everything:4, get:3,
         anything:3, related:4, matching:5, about:2, pull:3 },
  phrases:[["show me",6],["look for",7],["pull up",6],["what do i have",6],["give me",5]],
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

/* ── waiting on other people ──────────────────────────────────────────── */
intent("waiting", {
  kind:"read", label:"What I am waiting on",
  cues:{ waiting:8, wait:6, holding:6, others:3, outside:4, pending:5, blocked:4, stuck:2, them:2 },
  phrases:[["waiting on",10],["waiting for",10],["who owes me",9],["with someone else",6],
           ["not with me",6],["in someone else's court",8]],
  run(A){
    const api = A.api, h = api.h;
    const list = applySlots(live(api), A.slots, api).filter(t => t.waitOn)
      .sort((a, b) => h.waitDays(b) - h.waitDays(a));
    if (!list.length) return { say:"Nothing is sitting with anyone else right now." };
    const by = {};
    list.forEach(t => (by[t.waitOn] = by[t.waitOn] || []).push(t));
    const parties = Object.keys(by).sort((a, b) => by[b].length - by[a].length);
    return {
      say: plural(list.length, "record") + " " + (list.length === 1 ? "is" : "are") +
           " waiting on " + listOf(parties, 4) + ".",
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
  cues:{ longest:8, quiet:7, silent:7, slowest:7, oldest:5, ignoring:6, forgotten:4 },
  phrases:[["gone quiet",10],["longest wait",10],["waiting longest",10],["heard nothing",8],
           ["not replied",8],["no reply",8]],
  run(A){
    const api = A.api, h = api.h;
    const list = live(api).filter(t => t.waitOn).sort((a, b) => h.waitDays(b) - h.waitDays(a));
    if (!list.length) return { say:"Nothing is waiting on anyone." };
    const t = list[0];
    return {
      say: t.waitOn + " has had " + t.code + " for " + h.waitDays(t) + " days — the longest of any.",
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
      if (g) return { say: "About " + h.mins(g.minutes) + ", going by " + plural(g.n, "similar record") + " you closed." };
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
      say: "Typically " + (med < 24 ? Math.round(med) + "h" : Math.round(med / 24) + "d") +
           " from opening to closing" + slotWords(s) + ", across " + plural(pool.length, "record") + ".",
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
  cues:{ closed:7, finished:6, completed:6, cleared:6, shipped:4, resolved:6, achieved:4, got:2 },
  phrases:[["did i close",10],["have i closed",10],["did i finish",10],["got done",8],
           ["how many did i",7],["how much did i get",8],["was i productive",8]],
  boost:{ range:4 },
  run(A){
    const api = A.api, h = api.h, s = A.slots;
    const r = s.range || { from:h.today(), to:h.today(), label:"today" };
    const list = applySlots(api.tasks, s, api)
      .filter(t => t.status === "done" && inRange(h.dayOf(t.completed), r));
    const tracked = list.reduce((n, t) => n + h.live(t), 0);
    if (!list.length) return { say:"Nothing closed " + r.label + slotWords(s) + "." };
    return {
      say: "You closed " + plural(list.length, "record") + " " + r.label + slotWords(s) + ".",
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
    if (!list.length) return { say:"Nothing came in " + r.label + slotWords(s) + "." };
    const stillOpen = list.filter(t => h.LIVE.indexOf(t.status) >= 0).length;
    return {
      say: plural(list.length, "record") + " came in " + r.label + slotWords(s) + ".",
      note: stillOpen + " of them " + (stillOpen === 1 ? "is" : "are") + " still live.",
      rows: list.slice(0, 12).map(t => row(t, api, h.stMeta(t.status).label +
            (t.system ? " · " + t.system : ""))),
      chips: [{ label:"Show them", act:{ kind:"filter", ids:list.map(t => t.id), label:"Raised " + r.label } }]
    };
  }
});
intent("worstSystem", {
  kind:"read", label:"Worst system",
  cues:{ system:5, systems:6, worst:8, trouble:7, breaks:7, breaking:7, failing:7,
         problem:5, painful:6, noisiest:8, misbehaving:8 },
  phrases:[["which system",10],["most trouble",10],["gives me the most",9],["biggest problem",8],
           ["what breaks",9],["always breaking",9]],
  run(A){
    const api = A.api, h = api.h, s = A.slots;
    const r = s.range;
    const c = {};
    api.tasks.forEach(t => {
      if (!t.system) return;
      if (r && !inRange(h.dayOf(t.created), r)) return;
      c[t.system] = (c[t.system] || 0) + 1;
    });
    const rank = Object.keys(c).sort((a, b) => c[b] - c[a]);
    if (!rank.length) return { say:"No record carries a system yet." };
    const tot = rank.reduce((n, k) => n + c[k], 0);
    return {
      say: rank[0] + " — " + plural(c[rank[0]], "record") + (r ? " in " + r.label : "") +
           ", " + Math.round(c[rank[0]] / tot * 100) + "% of everything with a system on it.",
      note: rank.slice(1, 6).map(k => k + " " + c[k]).join(" · "),
      rows: [],
      chips: [{ label:"Show " + rank[0], act:{ kind:"filterSys", system:rank[0] } },
              { label:"Open Insight", act:{ kind:"view", view:"insight" } }]
    };
  }
});
intent("topPerson", {
  kind:"read", label:"Who asks the most",
  cues:{ who:4, raises:7, asks:6, requester:7, people:5, person:5, most:4, asking:6, sends:5 },
  phrases:[["who raises",10],["who asks",10],["who sends me",10],["comes from who",8],
           ["which person",9],["who gives me",9]],
  run(A){
    const api = A.api, h = api.h, r = A.slots.range;
    const c = {};
    api.tasks.forEach(t => {
      if (r && !inRange(h.dayOf(t.created), r)) return;
      (h.peopleOf(t) || []).forEach(n => c[n] = (c[n] || 0) + 1);
    });
    const rank = Object.keys(c).sort((a, b) => c[b] - c[a]);
    if (!rank.length) return { say:"No record has a name on it yet." };
    return {
      say: rank[0] + " — " + plural(c[rank[0]], "record") + (r ? " in " + r.label : "") + ".",
      note: rank.slice(1, 6).map(k => k + " " + c[k]).join(" · "),
      rows: [],
      chips: [{ label:"Show " + rank[0] + "'s records", act:{ kind:"filterWho", who:rank[0] } }]
    };
  }
});
intent("solvedBefore", {
  kind:"read", label:"Have I seen this before",
  cues:{ before:8, previously:8, again:5, similar:8, same:4, handled:7, solved:7,
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
    if (!near.length) return { say:"Nothing closed looks like that. It would be a first." };
    const best = near[0].task;
    const sc = (best.scripts || []).map(id => (api.scripts.find(x => x.id === id) || {}).file)
      .filter(Boolean);
    return {
      say: "Yes — " + best.code + ", " + best.title + ".",
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
        say: plural(cards.length, "record") + " " + (cards.length === 1 ? "has" : "have") + " stopped moving.",
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
    if (!old.length) return { say:"Nothing has been sitting untouched." };
    return { say: plural(old.length, "record") + " open more than a week.",
             rows: old.slice(0, 10).map(t => row(t, api,
               Math.round((Date.parse(k) - Date.parse(t.created)) / DAY) + "d old")) };
  }
});
intent("brief", {
  kind:"read", label:"Anything I should know",
  cues:{ know:5, wrong:6, attention:7, worth:5, happening:6, going:3, summary:7,
         update:5, brief:8, situation:7, overview:7, anything:4 },
  phrases:[["what is going on",10],["anything i should know",10],["how are things",9],
           ["anything wrong",10],["catch me up",10],["give me a summary",10],["state of play",9]],
  run(A){
    const api = A.api;
    if (!api.ai) return { say:"I need assist.js for that — it holds the detectors." };
    const b = api.ai.brief(api.ctx());
    if (!b.cards.length)
      return { say:"Nothing worth interrupting you for.", note:"Working from " + b.records + " records." };
    return {
      say: b.cards.length === 1 ? "One thing." : b.cards.length + " things.",
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
    if (!due.length) return { say:"Nothing dated today. The day is yours." };
    let known = 0;
    const need = due.reduce((n, t) => {
      if (+t.estimate){ known++; return n + Math.max(0, +t.estimate - h.live(t)); }
      const g = h.estimateFor(t.title);
      return n + (g ? g.minutes : 30);
    }, 0);
    const d = new Date();
    const left = Math.max(0, (17 * 60 + 30) - (d.getHours() * 60 + d.getMinutes()));
    return {
      say: plural(due.length, "record") + " dated today, about " + h.mins(Math.round(need)) +
           " of work, and " + h.mins(left) + " left before 17:30.",
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
  phrases:[["how much time",9],["time spent",10],["hours on",9],["how long have i spent",10]],
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
  cues:{ many:6, count:8, number:5, total:6, how:2 },
  phrases:[["how many",10],["what is the count",8],["number of",7]],
  run(A){
    const api = A.api, h = api.h, s = A.slots;
    let list = applySlots(api.tasks, s, api);
    if (s.status) list = list.filter(t => t.status === s.status);
    if (s.range) list = list.filter(t => inRange(h.dayOf(t.created), s.range));
    const c = {};
    list.forEach(t => c[t.status] = (c[t.status] || 0) + 1);
    return {
      say: plural(list.length, "record") + slotWords(s) +
           (s.status ? " with status " + h.stMeta(s.status).label : "") +
           (s.range ? " in " + s.range.label : "") + ".",
      note: Object.keys(c).map(k => h.stMeta(k).label + " " + c[k]).join(" · "),
      chips: list.length ? [{ label:"Show them", act:{ kind:"filter", ids:list.map(t => t.id),
                                                       label:("Count" + slotWords(s)).trim() } }] : []
    };
  }
});
intent("scripts", {
  kind:"read", label:"My scripts",
  cues:{ script:8, scripts:9, automation:7, bat:6, tools:5, runnable:7 },
  phrases:[["what scripts",10],["which scripts",10],["can i run",7],["what can i automate",9]],
  run(A){
    const api = A.api;
    if (!api.scripts.length) return { say:"No scripts in the workspace yet — they live in the scripts folder." };
    const sorted = api.scripts.slice().sort((a, b) => (b.uses || 0) - (a.uses || 0));
    return {
      say: plural(api.scripts.length, "script") + " in the workspace.",
      rows: sorted.slice(0, 12).map(s => ({ id:null, code:s.file,
        text:s.name || s.file, sub:(s.uses || 0) + " runs" + (s.desc ? " · " + s.desc : "") })),
      chips: [{ label:"Open the Scripts panel", act:{ kind:"panel", panel:"scripts" } }]
    };
  }
});
intent("routines", {
  kind:"read", label:"My schedules",
  cues:{ routine:8, routines:9, schedule:7, scheduled:7, recurring:8, cron:8, repeat:6, automatic:6 },
  phrases:[["what routines",10],["what is scheduled",10],["what runs automatically",10],
           ["my schedules",10],["what repeats",9]],
  run(A){
    const api = A.api;
    if (!api.routines.length) return { say:"No schedules yet." };
    return {
      say: plural(api.routines.length, "schedule") + " set up.",
      rows: api.routines.map(r => ({ id:null, code:r.paused ? "paused" : "on",
        text:r.title, sub:(r.freq === "cron" ? "cron " + r.cron : r.freq) +
             (r.remind ? " · reminds" : "") + ((r.scripts || []).length ? " · runs a script" : "") })),
      chips: [{ label:"Open Routines", act:{ kind:"panel", panel:"routine" } }]
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
  cues:{ remind:9, reminder:9, alert:7, notify:7, nudge:5, tell:4, every:4, ping:3 },
  phrases:[["remind me",10],["nudge me",10],["tell me every",10],["set a reminder",10],
           ["let me know every",9],["alert me",9]],
  run(A){
    const api = A.api, s = A.slots;
    let title = A.raw.replace(/^.*?\bremind me\b\s*/i, "")
                     .replace(/^.*?\bnudge me\b\s*/i, "")
                     .replace(/\bevery\s+\d*\s*\w+\b/i, "")
                     .replace(/^\s*(to|about|that)\s+/i, "")
                     .replace(/\bat \d{1,2}:\d{2}\b/, "").trim();
    if (!title) title = "Reminder";
    title = title.charAt(0).toUpperCase() + title.slice(1);
    if (!s.every && !s.time && !s.date)
      return { say:"How often? Try \"remind me every 30 minutes to drink water\"." };
    let freq = "daily", cron = "";
    if (s.every){
      if (s.every.unit === "minute"){ freq = "cron"; cron = "*/" + s.every.n + " * * * *"; }
      else if (s.every.unit === "hour"){ freq = "cron"; cron = "0 " + (s.every.n > 1 ? "*/" + s.every.n : "*") + " * * *"; }
      else { freq = "daily"; }
    }
    const when = freq === "cron" ? "cron " + cron : "daily" + (s.time ? " at " + s.time : "");
    return {
      say:"Set a reminder?",
      note:"“" + title + "” — " + when + ", with a notification each time.",
      act:{ kind:"routine", title:title, freq:freq, cron:cron, time:s.time || "09:00",
            remind:true, confirm:"Create the schedule “" + title + "”?" }
    };
  }
});
intent("openRecord", {
  kind:"nav", label:"Open a record",
  needs:["record"],
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
intent("help", {
  kind:"read", label:"What can you do",
  cues:{ help:9, commands:8, capabilities:8, able:6, do:2, ask:4, understand:7, works:4 },
  phrases:[["what can you do",10],["how do i use",10],["what do you understand",10],
           ["give me examples",10],["what can i ask",10],["who are you",8]],
  run(A){
    return {
      say:"I read your records and answer from them. Some things to try:",
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
             "remind me every 30 minutes to drink water" ].join("\n"),
      examples:true
    };
  }
});

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
  let s = 0, hit = 0;
  const seen = {};
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
    if (best){ s += best; hit++; seen[w0] = 1; }
  });
  (intent.phrases || []).forEach(p => { if (norm.indexOf(p[0]) >= 0) s += p[1]; });
  return { s, hit };
}

function scoreOne(intent, norm, ws, mw, slots, asking, firstVerb){
  /* a required slot that is not there disqualifies it outright, which is what
     stops "mark it done" firing when no record was named */
  for (const n of (intent.needs || [])) if (!slots[n]) return 0;

  const c = cueScore(intent, mw, norm);
  let s = c.s;
  if (!s && !(intent.needs || []).length) return 0;

  for (const b in (intent.boost || {})) if (slots[b]) s += intent.boost[b];
  (intent.needs || []).forEach(() => s += 6);

  /* the shape of the sentence */
  if (intent.kind === "read"){
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

function ask(raw, api){
  const text = String(raw == null ? "" : raw).trim();
  if (!text) return { say:"Ask me something. Type \"help\" for examples.", intent:"help", confidence:1 };

  const norm = normalise(text);
  const ws = words(norm);
  const mw = meaningful(ws);
  const firstVerb = mw[0] || "";
  const asking = /\?\s*$/.test(text) || (ws.length && ASKING.has(ws[0])) ||
                 mw.some(w => ASKING.has(w) && mw.indexOf(w) < 2);

  api.lex = lexiconFor(api);
  const slots = readSlots(norm, ws, api);

  const A = { api, slots, ws, mw, norm, raw:text, asking,
              phrase: api.phrase || (p => (p && p.k) || "") };

  /* a phrasing you have already corrected once wins outright */
  const mem = api.memory || {};
  const remembered = mem[norm];
  if (remembered){
    const it = INTENTS.find(x => x.name === remembered);
    if (it) return finish(it, A, 1, [], true);
  }

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
    return {
      intent:null, confidence:0,
      say:"I did not follow that.",
      note:"Try \"help\" to see what I understand. If I keep missing something you " +
           "ask often, tell me which of these you meant and I will remember it.",
      alternatives: INTENTS.filter(x => x.kind === "read").slice(0, 4)
        .map(x => ({ label:x.label, intent:x.name }))
    };
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

function finish(it, A, confidence, altIntents, learned){
  let out;
  try { out = it.run(A) || {}; }
  catch(e){ out = { say:"That one broke on me: " + (e && e.message || e) }; }
  out.intent = it.name;
  out.label = it.label;
  out.confidence = confidence;
  out.learned = !!learned;
  out.kind = it.kind;
  out.slots = {
    system:A.slots.system || "", person:A.slots.person || "", type:A.slots.type || "",
    party:A.slots.party || "", tag:A.slots.tag || "", priority:A.slots.priority || "",
    range:A.slots.range ? A.slots.range.label : "", record:A.slots.record ? A.slots.record.code : ""
  };
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
  const slots = readSlots(norm, ws, api);
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

window.DossierChat = {
  version: "1.0",
  intents: INTENTS.map(i => ({ name:i.name, label:i.label, kind:i.kind })),
  ask: ask,
  run: run,
  forget: () => { LEX = null; LEXKEY = ""; },
  _util: { normalise, words, meaningful, close, editDistance, readRange, readDate, buildLexicon }
};

})();
