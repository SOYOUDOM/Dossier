// node scripts/check-assistant-docs.js
//
// The assistant answers questions about Resolv itself from README.md and
// CHANGELOG.md, and names the section every answer came from. This checks
// that against the files as they stand, the ways it can go wrong without
// anybody noticing:
//   - both files index cleanly: every release heading gives a version and a
//     date, and nothing inside a block of code is taken for a heading;
//   - the version in dossier.html has an entry in the release notes;
//   - questions about the product find the section that is about them, and
//     questions that are not about the product find nothing;
//   - every answer is the documentation's own words - each line of it is in
//     the section it cites - so "which source supports this answer?" is true;
//   - "which source supports this answer?" is answered for each kind of
//     answer: quoted, counted from records, written by a flow's model, none;
//   - questions about your own work are not taken for questions about Resolv.
// Expectations are read from the files where they can be (the newest
// release, the release that first mentions something), so editing the
// documentation does not break this - only breaking the answers does.
const fs = require("fs"), path = require("path"), vm = require("vm");
const root = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(root, f), "utf8");

const win = { addEventListener(){} };
const ctx = vm.createContext({ window:win, console, Date, Math, JSON, Object, Array, String, Number,
  RegExp, Set, Map, WeakMap, isNaN, parseInt, parseFloat, Intl });
vm.runInContext(read("chat.js"), ctx, { filename:"chat.js" });
const C = win.DossierChat;
/* each question runs under a watchdog: a loop in an intent is a failure, not a hang */
const ask = (q, api) => { ctx.__q = q; ctx.__a = api;
  return vm.runInContext("window.DossierChat.ask(__q, __a)", ctx, { timeout:3000 }); };

const readme = read("README.md"), changelog = read("CHANGELOG.md");
const version = (/^const APP_VERSION = "([^"]+)"/m.exec(read("dossier.html")) || [])[1] || "";
const docs = C.docsIndex([{ name:"README.md", kind:"guide", text:readme },
                          { name:"CHANGELOG.md", kind:"release", text:changelog }]);

/* just enough of the application for a question to be asked of it */
const pad2 = n => String(n).padStart(2, "0");
const dkey = d => { const x = d instanceof Date ? d : new Date(d);
  return x.getFullYear() + "-" + pad2(x.getMonth() + 1) + "-" + pad2(x.getDate()); };
const day = k => new Date(String(k).slice(0, 10) + "T00:00:00");
const ws = JSON.parse(read("demo/dossier.json"));
const h = new Proxy({
  tok: s => String(s || "").toLowerCase().split(/\W+/).filter(Boolean), idf: () => 1, similar: () => [],
  today: () => dkey(new Date()), dkey, dayOf: s => String(s || "").slice(0, 10),
  addDays: (k, n) => dkey(new Date(day(k).getTime() + n * 864e5)), dow: k => day(k).getDay(),
  mondayOf: k => { const d = day(k); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dkey(d); },
  niceDate: k => String(k), mins: m => m + "m", live: () => 0, peopleOf: t => t.people || [],
  canonPerson: x => x, splitPeople: x => [x], knownValues: () => [], repeatCandidates: () => [],
  LIVE:["open", "processing", "blocked"], PRIS:["P1", "P2", "P3", "P4"]
}, { get: (o, k) => k in o ? o[k] : (() => null) });
const api = extra => Object.assign({ tasks:ws.tasks || [], routines:ws.routines || [], scripts:ws.scripts || [],
  settings:ws.settings || {}, now:Date.now(), cacheKey:"check", memory:{}, aliases:[], convo:{},
  phrase: p => (p && p.k) || "", ai:null, ctx: () => ({}), h,
  docs, docsState:"ok", version, built:"" }, extra || {});

let bad = 0, n = 0;
const fail = m => { bad++; console.log("  ! " + m); };
const check = (ok, m) => { n++; if (!ok) fail(m); };
const cite = s => s ? s.file + " > " + (s.version ? s.version + " > " : "") + s.title : "(no source)";

/* ── the files index cleanly ─────────────────────────────────────────── */
const releases = docs.secs.filter(s => s.kind === "release" && s.level === 2 && s.version);
changelog.split("\n").filter(l => /^## \d/.test(l)).forEach(l =>
  check(releases.some(r => l.indexOf(r.version) >= 0 && l.indexOf(r.date) >= 0),
        "CHANGELOG.md heading gives no version and date: " + l));
check(!docs.secs.some(s => s.file === "README.md" && /^(overdue|waiting on|codes|line 1)/i.test(s.title)),
      "a comment inside a README.md code block was taken for a heading");
check(docs.secs.filter(s => !s.skip).length > 50, "README.md and CHANGELOG.md index to only " + docs.n + " sections");
check(!!version, "no APP_VERSION in dossier.html");
check(releases.some(r => r.version === version),
      "dossier.html is " + version + " and CHANGELOG.md has no entry for it");

/* ── every answer is the documentation's own words ───────────────────── */
const flat = t => String(t || "").replace(/\[([^\]\n]+)\]\((?:[^)\s]+)\)/g, "$1").replace(/\s+/g, " ").trim();
function quoted(r, q){
  const sec = r.sources && docs.secs.find(s => s.id === r.sources[0].id);
  if (!sec) return fail("\"" + q + "\" cites a section that is not in the index");
  const body = flat(sec.body);
  String(r.say).split("\n").map(l => flat(l.replace(/\s*…\s*$/, "")))
    .filter(l => l && !/^(This is Resolv|The latest release is|The release notes first mention|That is in|\d+\.\d+.*(came as|, \d+ \w+ \d{4}:))/.test(l))
    .forEach(l => check(body.indexOf(l) >= 0,
      "\"" + q + "\": a line of the answer is not in " + cite(r.sources[0]) + ": " + l.slice(0, 90)));
}

/* ── questions about the product find their section ──────────────────── */
const guide = [
  ["what is breeze", /design/i], ["how do I switch the assistant to Breeze", /design/i],
  ["what does the pixel set do", /pixel set/i], ["what keyboard shortcuts are there", /keyboard/i],
  ["how do I change the theme", /theme/i], ["how do I create a routine", /routine/i],
  ["what is resolv", /^Resolv$/], ["what is this app", /^Resolv$/]
];
guide.forEach(([q, want]) => {
  const r = ask(q, api());
  const s = (r.sources || [])[0];
  check(s && s.file === "README.md" && want.test(s.title),
        "\"" + q + "\" -> " + cite(s) + " (" + r.intent + "), expected a README.md section matching " + want);
  if (s) quoted(r, q);
});

const newest = releases[0];
[["what's new in resolv", newest], ["release notes", newest], ["what's the latest release", newest],
 ["what changed in " + newest.version, newest], ["what version is this", releases.find(r => r.version === version) || newest]
].forEach(([q, rel]) => {
  const r = ask(q, api());
  const s = (r.sources || [])[0];
  check(s && s.file === "CHANGELOG.md" && s.version === rel.version,
        "\"" + q + "\" -> " + cite(s) + " (" + r.intent + "), expected CHANGELOG.md " + rel.version);
  if (s) quoted(r, q);
});
/* "when was X added" is the oldest release that mentions it - the notes are newest first */
[["when was the desk pet added", /desk pet/i], ["when was the pixel set introduced", /pixel (set|art|animations)/i]].forEach(([q, re]) => {
  const all = releases.filter(r => docs.secs.some(s => s.kind === "release" && s.version === r.version &&
                                                      s.date === r.date && re.test(s.title + "\n" + s.body)));
  const first = all[all.length - 1];
  const r = ask(q, api());
  const s = (r.sources || [])[0];
  check(first && s && s.version === first.version,
        "\"" + q + "\" -> " + cite(s) + ", expected the first release that mentions it: " + (first ? first.version : "none"));
});

/* ── and questions it has nothing on find nothing ─────────────────────── */
["how do I get a pizza delivered to resolv", "does resolv support bluetooth barcode scanners"].forEach(q => {
  const r = ask(q, api());
  check(!(r.sources || []).length, "\"" + q + "\" was answered from " + cite((r.sources || [])[0]));
});
{
  const r = ask("what is breeze", api({ docs:null, docsState:"file" }));
  check(r.docs && r.docs.state === "unreadable" && !(r.sources || []).length && /Resolv\.bat/.test(r.note || ""),
        "with the documentation unreadable, \"what is breeze\" did not say so (" + r.intent + ": " + r.say + ")");
}

/* ── which source supports this answer ───────────────────────────────── */
const Q = "Which source supports this answer?";
{
  const doc = ask("what does the pixel set do", api());
  const last = { intent:doc.intent, label:doc.label, kind:"read", say:doc.say, sources:doc.sources, docs:doc.docs };
  const r = ask(Q, api({ last }));
  check(r.intent === "source" && (r.sources || [])[0] && r.sources[0].id === doc.sources[0].id,
        "after a documentation answer, \"" + Q + "\" -> " + r.intent + " " + cite((r.sources || [])[0]));
  const again = ask(Q, api({ last:null }));
  check(/no answer above/i.test(again.say), "with nothing above, \"" + Q + "\" said: " + again.say);
  const rec = ask(Q, api({ last:{ intent:"overdue", label:"What is overdue", kind:"read", say:"1 overdue.", count:1, rows:1 } }));
  check(/your own records/i.test(rec.say) && !(rec.sources || []).length,
        "after a records answer, \"" + Q + "\" said: " + rec.say);
  const flow = ask(Q, api({ last:{ via:"flow", say:"Switch it from the look sheet.", src:"how do I switch the assistant design" } }));
  check(/model/i.test(flow.say) && (flow.sources || []).length,
        "after a flow answer about Resolv, \"" + Q + "\" said: " + flow.say.slice(0, 80) + " / " + cite((flow.sources || [])[0]));
  const work = ask(Q, api({ last:{ via:"flow", say:"Here is a C# example.", src:"show me a simple C# example" } }));
  check(/model/i.test(work.say) && !(work.sources || []).length,
        "after a flow answer about work, \"" + Q + "\" cited " + cite((work.sources || [])[0]));
  const sure = ask("are you sure", api({ last:{ via:"flow", say:"Yes.", src:"what does breeze do" } }));
  check(/model/i.test(sure.say), "\"are you sure\" after a flow answer claimed: " + sure.say.slice(0, 80));
  ["cite your source", "is that documented", "where is that documented", "what is the source for that"].forEach(q => {
    const r = ask(q, api({ last }));
    check(r.intent === "source", "\"" + q + "\" -> " + r.intent + ", expected source");
  });
}

/* ── questions about the work stay questions about the work ──────────── */
[["what is overdue", "overdue"], ["what should I do next", "next"], ["who am I waiting on", "waiting"],
 ["what's new", "opened"], ["biggest source of work", "topPerson"], ["how do I fix the imaging pool crash", "guide"]
].forEach(([q, want]) => {
  const r = ask(q, api());
  check(r.intent === want && !(r.sources || []).length, "\"" + q + "\" -> " + r.intent + " " + cite((r.sources || [])[0]) +
        ", expected " + want + " from the records");
});

console.log("assistant docs: " + docs.secs.length + " sections from README.md and CHANGELOG.md, " +
            releases.length + " releases, newest " + newest.version + " (page " + version + "); " +
            n + " checks - " + (bad ? bad + " problem(s)" : "all good"));
process.exit(bad ? 1 : 0);
