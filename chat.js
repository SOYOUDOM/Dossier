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
  /* a pasted log line or error can carry markup; the tags are not words and
     matching on them turns "<script>…</script>" into a question about the
     scripts folder */
  s = s.replace(/<[^>]{0,200}>/g, " ");
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
                 "Nothing", "It", "It's", "I'd", "I've", "Everything", "All", "Most",
                 "None", "Just", "Only", "Quite", "No", "Two", "Three", "One", "The"];
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
const SHORTEN = [[/\byou are\b/g, "you're"], [/\bYou are\b/g, "You're"],
                 [/\bthat is\b/g, "that's"], [/\bThat is\b/g, "That's"],
                 [/\bthere is\b/g, "there's"], [/\bThere is\b/g, "There's"],
                 [/\bit is\b/g, "it's"], [/\bIt is\b/g, "It's"],
                 [/\bis not\b/g, "isn't"], [/\bare not\b/g, "aren't"],
                 [/\bhas not\b/g, "hasn't"], [/\bhave not\b/g, "haven't"],
                 [/\bdo not\b/g, "don't"], [/\bdoes not\b/g, "doesn't"],
                 [/\bwill not\b/g, "won't"], [/\bcannot\b/g, "can't"],
                 [/\bI would\b/g, "I'd"], [/\bI have\b/g, "I've"]];
function contract(s){
  let out = String(s || "");
  SHORTEN.forEach(r => { out = out.replace(r[0], r[1]); });
  return out;
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
    if (!list.length) return { say: say(["Nothing closed {when}{w}.",
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
    if (!list.length) return { say: say(["Nothing came in {when}{w}.",
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
  kind:"read", label:"Who asks the most",
  cues:{ raises:7, asks:6, requester:7, people:5, person:5, most:4, asking:6, sends:5 },
  phrases:[["who raises",10],["who asks",10],["who sends me",10],["comes from who",8],
           ["which person",9],["who gives me",9],["raises the most",13],["asks the most",13],
           ["sends me the most",13],["top requester",13],["most requests",12]],
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
  cues:{ know:5, wrong:6, attention:7, worth:5, happening:6, going:3, summary:7,
         update:5, brief:8, situation:11, overview:9, anything:4, roundup:11, digest:10 },
  phrases:[["what is going on",10],["anything i should know",10],["how are things",9],
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
    if (!due.length) return { say: say(["Nothing dated today. The day is yours.",
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
     when nothing else in the sentence is */
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
  kind:"read", label:"My scripts",
  cues:{ script:11, scripts:12, automation:9, automations:11, bat:6, batch:10, batches:11,
         tools:5, tooling:10, runnable:7, macros:10, executables:11 },
  phrases:[["what scripts",10],["which scripts",10],["can i run",7],["what can i automate",9]],
  run(A){
    const api = A.api;
    if (!api.scripts.length) return { say:"No scripts in the workspace yet — they live in the scripts folder." };
    const sorted = api.scripts.slice().sort((a, b) => (b.uses || 0) - (a.uses || 0));
    return {
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
  kind:"read", label:"My schedules",
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
    if (!g)
      return { say: say(["I have nothing to go on — you have not closed anything like this yet.",
                         "First time for this one. Nothing closed looks similar.",
                         "No history for this. You are working it out fresh."], {}, A.norm),
               note:"Once you close it with a note and a checklist, I will have something to hand back next time." };

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

function guideFor(mw, norm){
  let best = null, bestScore = 0;
  GUIDE.forEach(g => {
    const words = g.words.split(" ");
    let s = 0;
    mw.forEach(w => variants(w).forEach(v => { if (words.indexOf(v) >= 0) s += 2; }));
    if (norm.indexOf(g.id) >= 0) s += 2;
    if (s > bestScore){ bestScore = s; best = g; }
  });
  return bestScore >= 2 ? best : null;
}

intent("howTo", {
  kind:"read", label:"How to do something",
  cues:{ how:5, where:4, add:3, create:3, make:3, set:3, setup:5, configure:6, enable:6,
         turn:3, use:4, work:2, do:2, change:3, find:2, attach:4, install:6, start:2 },
  phrases:[["how do i",12],["how to",12],["how can i",12],["where do i find",12],
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
             rows: f.slice(0, 10).map(x => ({ id:t.id, code:"", text:x.name || "(unnamed)",
               sub:(x.size ? Math.round(x.size / 1024) + " KB" : "") + (x.added ? " · " + A.api.h.stamp(x.added) : "") })),
             chips:[{ label:"Open it", act:{ kind:"open", id:t.id } }] };
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
    if (!list.length) return { say: say(["Nothing is blocked.",
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
  kind:"read", label:"About a person",
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
  kind:"read", label:"Tags in use",
  cues:{ tag:11, tags:12, tagged:11, label:8, labels:10, keywords:11, categories:10 },
  phrases:[["what tags",10],["which tags",10],["tags do i use",10]],
  run(A){
    const api = A.api, c = {};
    api.tasks.forEach(t => (t.tags || []).forEach(g => c[g] = (c[g] || 0) + 1));
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
  kind:"read", label:"Systems in use",
  cues:{ system:5, systems:12, applications:13, apps:11, platforms:11, estate:10,
         cover:6, support:6, list:3 },
  phrases:[["what systems",10],["which systems",10],["systems do i",10],["what do i support",10]],
  run(A){
    const api = A.api, c = {};
    api.tasks.forEach(t => { if (t.system) c[t.system] = (c[t.system] || 0) + 1; });
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
  history:     "timeline chronology audit trail journal diary record activity events",
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
  (intent.phrases || []).forEach(p => {
    if (norm.indexOf(p[0]) >= 0){ s += p[1]; phrase = true; }
  });
  return { s, hit, best:top, phrase };
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

  /* "who is the prime minister" once reached "who raises the most" on the
     strength of the single word "who", and answered it with a colleague's
     name. One weak generic word is not evidence: something has to be
     distinctive — a heavy cue, a whole phrase, two separate words, or a
     concrete thing named in the sentence — or the score is capped below the
     floor and the bot says it did not follow. */
  const named = (intent.needs || []).some(n => slots[n]) ||
                Object.keys(intent.boost || {}).some(k => slots[k]);
  if (!(c.best >= 4 || c.phrase || c.hit >= 2 || named)) s = Math.min(s, 4);

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

function ask(raw, api){
  const text = String(raw == null ? "" : raw).trim();
  if (!text) return blank("Ask me something. Type \"help\" for examples.", "help");

  const norm = normalise(text);
  const ws = words(norm);
  const mw = meaningful(ws);
  const firstVerb = mw[0] || "";
  const asking = /\?\s*$/.test(text) || (ws.length && ASKING.has(ws[0])) ||
                 mw.some(w => ASKING.has(w) && mw.indexOf(w) < 2);

  api.lex = lexiconFor(api);
  const slots = readSlots(norm, ws, api, text);
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

  const A = { api, slots, ws, mw, norm, raw:text, asking, convo,
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

  /* a phrasing you have already corrected once wins outright */
  const mem = api.memory || {};
  const remembered = mem[norm];
  if (remembered){
    const it = INTENTS.find(x => x.name === remembered);
    if (it) return finish(it, A, 1, [], true);
  }

  return rank(A, norm, ws, mw, slots, asking, firstVerb, convo);
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
  out.rows = out.rows || [];
  out.chips = out.chips || [];
  out.slots = {
    system:A.slots.system || "", person:A.slots.person || "", type:A.slots.type || "",
    party:A.slots.party || "", tag:A.slots.tag || "", priority:A.slots.priority || "",
    range:A.slots.range ? A.slots.range.label : "", record:A.slots.record ? A.slots.record.code : ""
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
    awaiting: out.awaiting || null
  };
  out.context.seen = Object.assign({}, (A.convo && A.convo.seen) || {});
  if (typeof out.count === "number") out.context.seen[it.name] = out.count;
  /* contractions last, over the finished sentence, so nothing has to be
     written twice */
  out.say = contract(out.say);
  out.note = contract(out.note);
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

window.DossierChat = {
  version: "1.0",
  intents: INTENTS.map(i => ({ name:i.name, label:i.label, kind:i.kind })),
  ask: ask,
  run: run,
  forget: () => { LEX = null; LEXKEY = ""; },
  _util: { normalise, words, meaningful, close, editDistance, readRange, readDate, buildLexicon }
};

})();
