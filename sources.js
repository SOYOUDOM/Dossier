/* ══════════════════════════════════════════════════════════════════════════
   SOURCES — answering from your runbooks and standards, and only from them

   A guideline handed to the assistant used to travel whole with the one
   question it was attached to, and after that it was gone: the next
   question carried a six-line summary of the conversation, a new
   conversation carried nothing, and "study this guideline" rewrote it into
   runbooks in the model's own words. So a later question about it was
   answered from what was left - and where the document had been, the model
   filled the gap. That is how a standard with no remediation timeframe in
   it came back as "4 hours": the only 4 hours anywhere in the request was
   Resolv's own target date for a P1 record.

   This file keeps the document itself as the source of truth and makes the
   answer come from it:

     read    the text the app already extracts (PDF pages, Markdown, Word),
             into sections and passages, each with the page, the lines and
             the heading it came from, and an id that stays the same while
             the words do;
     search  every active document you are cleared for, by the words of the
             question (BM25, with a small list of the words people use for
             the same thing), keeping the passages around a hit so a table
             is not cut from its heading;
     cite    each passage in the form people check: document, version,
             page, lines, section;
     check   the answer that comes back: every quote must be in the passage
             it cites, and every figure it states - a duration, a
             percentage, a severity - must be written in a passage that was
             searched. An answer that states a figure no passage contains is
             not shown as the documents' answer.

   Pure: no DOM, no files, no network. dossier.html reads the files, keeps
   them in the workspace folder and draws the answers; tests/ runs this
   under Node.
   ══════════════════════════════════════════════════════════════════════════ */
(function(root){
"use strict";

const VERSION = "1.0";
/* the shape of passages: raise it and every document is cut again, from
   the text already kept, the next time the workspace opens */
const ALGO = 1;
const CHUNK_TARGET = 1100, CHUNK_MAX = 1800;
const BUDGET = 14000;                   /* characters of passages per question */

/* ── words ─────────────────────────────────────────────────────────────── */
const STOP = new Set(("a an the and or of to in on for with by at from as is are was were be been being it its " +
  "this that these those which what who whom whose when where why how do does did done can could should would " +
  "may might will shall i me my we our you your he she his her they them their there here so such any all " +
  "each per into onto over under about above below than then too very just also only other some if not no " +
  "yes am let tell please say says said give show know need want get got").split(" "));
/* The words people use for the same thing. Only for finding passages -
   never for answering: a passage found through "remediate" still has to
   say what the answer says. */
const SYNONYMS = [
  ["fix", "remediate", "remediation", "resolve", "resolution", "patch", "mitigate", "correct", "rectify", "close"],
  ["timeframe", "deadline", "due", "within", "duration", "turnaround", "sla", "target", "time"],
  ["critical", "severe", "severity"],
  ["internet", "external", "public", "exposed", "facing", "dmz"],
  ["application", "app", "system", "service"],
  ["vulnerability", "vuln", "cve", "finding", "weakness", "flaw"],
  ["policy", "standard", "guideline", "procedure", "runbook", "sop"],
  ["password", "credential", "passphrase"],
  ["restart", "reboot", "recycle", "bounce"],
  ["escalate", "escalation", "notify", "contact"],
  ["incident", "outage", "issue", "problem"],
  ["backup", "restore", "recovery"],
  ["approve", "approval", "authorise", "authorize", "signoff"],
  ["require", "requirement", "mandatory", "must", "shall"],
  ["environment", "production", "prod", "uat", "sit", "dev", "test", "dr"]
];
const ENVS = { prod:"production", production:"production", live:"production", uat:"uat", sit:"sit",
               staging:"staging", stage:"staging", dev:"development", development:"development",
               test:"test", testing:"test", dr:"dr", preprod:"preprod", "pre-prod":"preprod" };

/* an environment, only when it is plainly named as one: "in UAT", "PROD",
   "the production servers" - not every "test" in a sentence */
function envsIn(q){
  const s = String(q || ""), out = new Set();
  let m;
  const re1 = /\b(?:in|on|for|at|to|from)\s+(?:the\s+)?(prod|production|live|uat|sit|staging|dev|development|dr|preprod|pre-prod)\b/gi;
  while ((m = re1.exec(s))) out.add(ENVS[m[1].toLowerCase()]);
  const re2 = /\b(PROD|UAT|SIT|DEV|DR|PREPROD)\b/g;
  while ((m = re2.exec(s))) out.add(ENVS[m[1].toLowerCase()]);
  const re3 = /\b(prod|production|uat|sit|staging|dev|development|dr|test)\s+(?:environment|env|servers?|region)\b/gi;
  while ((m = re3.exec(s))) out.add(ENVS[m[1].toLowerCase()]);
  return [...out].filter(Boolean);
}
function stem(w){
  w = String(w || "").toLowerCase();
  if (w.length <= 3 || /^\d/.test(w)) return w;
  if (/ies$/.test(w) && w.length > 4) return w.slice(0, -3) + "y";
  const ends = ["ations", "ation", "ating", "ated", "ates", "ate", "ings", "ing", "ed", "es", "s"];
  for (const e of ends){
    if (w.endsWith(e) && w.length - e.length >= 3){
      if (e === "s" && /ss$/.test(w)) break;
      w = w.slice(0, -e.length);
      break;
    }
  }
  return w.length > 3 ? w.replace(/e$/, "") : w;
}
const SYN = new Map();
SYNONYMS.forEach(g => { const s = g.map(stem); s.forEach(x => { SYN.set(x, (SYN.get(x) || []).concat(s.filter(y => y !== x))); }); });

/* the words of a text as the index sees them */
function words(text){
  return String(text || "").toLowerCase()
    .replace(/[‐-―]/g, "-")
    .split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}
function terms(text){
  return words(text).filter(w => !STOP.has(w) && (w.length > 1 || /\d/.test(w))).map(stem);
}

/* Text for comparing: lower case, number words as digits, and nothing but
   letters and digits between single spaces - so "four (4) hours." and
   "4 hours" are the same four characters apart. */
const UNITS = { zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10,
  eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16, seventeen:17, eighteen:18, nineteen:19 };
const TENS = { twenty:20, thirty:30, forty:40, fifty:50, sixty:60, seventy:70, eighty:80, ninety:90 };
function numberWords(s){
  return s.replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[\s-]+(one|two|three|four|five|six|seven|eight|nine))?\b/g,
                   (m, t, u) => String(TENS[t] + (u ? UNITS[u] : 0)))
          .replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)\b/g,
                   (m, u) => String(UNITS[u]))
          .replace(/\b(\d+)\s*\(\s*\1\s*\)/g, "$1");     /* "4 (4)" after "four (4)" */
}
function norm(s){
  return numberWords(String(s || "").toLowerCase()
    .replace(/[‘’‚‛′]/g, "'").replace(/[“”„″]/g, '"')
    .replace(/[‐-―]/g, "-").replace(/­/g, ""))
    .replace(/(\d)[,](\d{3})\b/g, "$1$2")
    .replace(/[^\p{L}\p{N}.]+/gu, " ").replace(/(^|\s)\.+|\.+(\s|$)/g, " ")
    .replace(/\s+/g, " ").trim();
}

function hash36(s){
  /* FNV-1a, twice over, for an id that does not change while the words do not */
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995;
  const t = String(s);
  for (let i = 0; i < t.length; i++){
    const c = t.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return (h1.toString(36) + h2.toString(36)).slice(0, 10);
}

/* ── a document, read into lines, headings and pages ─────────────────────
   kind "pdf": the text the app's PDF reader gives, with "[page N]" lines
   between pages; lines are counted on each page, text lines only, as a
   person counts them on the printed page.
   kind "md" / "text": lines are the file's own lines, as an editor numbers
   them.
   kind "docx": the reader's text, with "# Heading" lines; no pages, and no
   line numbers worth quoting - a citation names the section. */
function isHeadingPdf(t){
  if (t.length < 3 || t.length > 90) return 0;
  if (/[.;,:]$/.test(t) && !/^\d+(\.\d+)*\.$/.test(t)) return 0;
  let m = /^((?:\d+\.)*\d+)\.?\s+(.{2,80})$/.exec(t);
  if (m){
    const ws = m[2].split(/\s+/);
    if (ws.length > 10 || /\.$/.test(m[2])) return 0;
    const small = /^(a|an|the|and|or|of|to|in|on|for|with|by|at|from|as)$/i;
    const big = ws.filter(w => !small.test(w));
    const caps = big.filter(w => /^[\p{Lu}\p{N}(]/u.test(w)).length;
    if (!big.length || caps / big.length < 0.6) return 0;
    return m[1].split(".").length;
  }
  if (/^(section|chapter|appendix|annex|part|schedule)\s+[\dA-Z]+\b/i.test(t) && t.split(/\s+/).length <= 10) return 1;
  const letters = t.replace(/[^\p{L}]/gu, "");
  if (letters.length >= 4 && letters === letters.toUpperCase() && /\p{Lu}/u.test(letters) && t.split(/\s+/).length <= 8) return 1;
  return 0;
}
function readLines(kind, text){
  const out = [];
  const src = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  let page = kind === "pdf" ? 1 : 0, pline = 0;
  for (let i = 0; i < src.length; i++){
    const raw = src[i];
    if (kind === "pdf"){
      const pm = /^\[page (\d+)\]\s*$/.exec(raw);
      if (pm){ page = +pm[1]; pline = 0; continue; }
      if (!raw.trim()) { out.push({ t:"", page:page, line:0, blank:true }); continue; }
      pline++;
      out.push({ t:raw, page:page, line:pline, head:isHeadingPdf(raw.trim()) });
      continue;
    }
    const lineNo = kind === "docx" ? 0 : i + 1;
    let head = 0, title = "";
    const hm = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(raw);
    if (hm && kind !== "text"){ head = hm[1].length; title = hm[2]; }
    else if (kind === "md" && raw.trim() && i + 1 < src.length && /^\s*(=+|-+)\s*$/.test(src[i + 1]) &&
             !/^\s*([-*+]|\d+\.)\s/.test(raw) && !/^\s*\|/.test(raw) && src[i + 1].trim().length >= 3){
      head = /=/.test(src[i + 1]) ? 1 : 2; title = raw.trim();
      out.push({ t:raw, page:0, line:lineNo, head:head, title:title });
      i++;
      out.push({ t:src[i], page:0, line:i + 1, rule:true });
      continue;
    }
    else if (kind === "text" && raw.trim()) head = isHeadingPdf(raw.trim());
    if (!raw.trim()) out.push({ t:"", page:0, line:lineNo, blank:true });
    else out.push({ t:raw, page:0, line:lineNo, head:head, title:title || (head ? raw.trim() : "") });
  }
  return out;
}

/* ── cutting it into passages ─────────────────────────────────────────────
   A passage is a run of whole paragraphs, list items and table rows from
   one section of one page, about a thousand characters. A table split
   across two passages takes its header row with it into the second. Small
   sections next to each other share a passage, and every line of a
   passage knows the heading it sits under, so a citation can name the
   exact section of the words it quotes. */
function blocksOf(lines){
  const blocks = []; let cur = null;
  const flush = () => { if (cur && cur.lines.length) blocks.push(cur); cur = null; };
  for (const ln of lines){
    if (ln.rule) { if (cur) cur.lines.push(ln); continue; }
    if (ln.head){ flush(); blocks.push({ kind:"head", lines:[ln], level:ln.head, title:(ln.title || ln.t).trim() }); continue; }
    if (ln.blank){ flush(); continue; }
    const table = /^\s*\|/.test(ln.t);
    const item = /^\s*([-*+•▪●]|\d+[.)]|[a-z][.)])\s+/.test(ln.t);
    const kind = table ? "table" : "para";
    if (!cur || cur.kind !== kind || (kind === "para" && item) || (cur.page !== ln.page)){
      flush(); cur = { kind:kind, lines:[], page:ln.page };
    }
    cur.lines.push(ln);
  }
  flush();
  return blocks;
}
function chunkDocument(doc, text){
  const kind = doc.kind || "text";
  const lines = readLines(kind, text);
  const blocks = blocksOf(lines);
  const chunks = [];
  const path = [];                        /* [{level, title}] */
  const secName = () => path.map(p => p.title).join(" › ");
  let cur = null;
  const seen = {};
  const close = () => {
    if (!cur || !cur.lines.length) { cur = null; return; }
    const body = cur.lines.map(l => l.t).join("\n");
    if (!body.replace(/[#|\-\s]/g, "").length) { cur = null; return; }
    const numbered = cur.lines.filter(l => l.line > 0);
    const first = numbered[0], last = numbered[numbered.length - 1];
    const section = (cur.heads.find(h => h[1]) || cur.heads[0] || [0, ""])[1];
    let h = hash36(section + "|" + norm(body));
    if (seen[h]) h = h + "-" + (++seen[h]); else seen[h] = 1;
    chunks.push({
      id: doc.id + ":" + h, key: h, doc: doc.id, n: chunks.length + 1,
      page: cur.page || 0,
      lineStart: first ? first.line : 0, lineEnd: last ? last.line : 0,
      /* for each line of the text below, its line number (0: not counted) */
      lines: cur.lines.map(l => l.line || 0),
      heads: cur.heads.slice(),            /* [[line offset, "Section › Sub"], ...] */
      section: section,
      text: body
    });
    cur = null;
  };
  const open = page => { cur = { page:page, lines:[], heads:[], size:0, body:0 }; };
  const add = (ls, sec, head) => {
    if (!cur) open(ls[0].page);
    if (!cur.heads.length || cur.heads[cur.heads.length - 1][1] !== sec) cur.heads.push([cur.lines.length, sec]);
    ls.forEach(l => { cur.lines.push(l); cur.size += l.t.length + 1; if (!head) cur.body++; });
  };
  /* a heading on its own is never left behind: it goes with what follows */
  const onlyHeads = () => cur && !cur.body;
  /* the document's own title, first thing in it, is not a section: every
     section would otherwise be "Standard › 3. Scope" */
  const title = blocks.length && blocks[0].kind === "head" ? blocks[0] : null;
  const levels = blocks.filter(b => b.kind === "head" && b !== title).map(b => b.level);
  const top = levels.length ? Math.min(...levels) : 1;
  for (const b of blocks){
    if (b.kind === "head"){
      if (b === title){ add(b.lines, "", true); continue; }
      while (path.length && path[path.length - 1].level >= b.level) path.pop();
      path.push({ level:b.level, title:b.title });
      /* a new top-level section starts a new passage unless the one before
         is tiny; a sub-section joins the passage before it only while that
         one is still small */
      if (cur && !onlyHeads() && (cur.page !== b.lines[0].page ||
          (b.level <= top ? cur.size >= 300 : cur.size > CHUNK_TARGET * 0.6))) close();
      else if (cur && cur.page !== b.lines[0].page) close();
      add(b.lines, secName(), true);
      continue;
    }
    const sec = secName();
    const page = b.lines[0].page;
    if (cur && cur.page !== page) close();
    const size = b.lines.reduce((n, l) => n + l.t.length + 1, 0);
    if (cur && cur.size + size > CHUNK_TARGET && !onlyHeads()) close();
    if (size <= CHUNK_MAX){ add(b.lines, sec); continue; }
    if (cur && !onlyHeads()) close();
    /* a block too long for one passage: by lines, and a table keeps its
       header (and the |---| line under it) at the top of every part */
    const hdr = b.kind === "table" ? b.lines.slice(0, /^\s*\|?\s*:?-{2,}/.test((b.lines[1] || {}).t || "") ? 2 : 1) : [];
    let part = [];
    let psize = 0;
    const rest = b.lines.slice(hdr.length);
    for (const l of rest){
      if (psize + l.t.length > CHUNK_TARGET && part.length){
        add(part, sec); close();
        part = []; psize = 0;
      }
      if (!part.length && hdr.length){ part = hdr.map(x => Object.assign({}, x)); psize = hdr.reduce((n, x) => n + x.t.length + 1, 0); }
      part.push(l); psize += l.t.length + 1;
    }
    if (part.length) add(part, sec);
  }
  close();
  return chunks;
}

/* ── what a document says about itself ──────────────────────────────────── */
function detectMeta(text, fileName){
  const head = String(text || "").slice(0, 6000);
  const meta = { title:"", version:"", effective:"" };
  const vm = /\b(?:version|ver\.?|revision|rev\.?)\s*[:#]?\s*v?(\d+(?:\.\d+){0,3})\b/i.exec(head) ||
             /\bv(\d+\.\d+(?:\.\d+)?)\b/.exec(head) ||
             /\bv(\d+(?:\.\d+){0,2})\b/i.exec(String(fileName || ""));
  if (vm) meta.version = vm[1];
  const em = /\b(?:effective|effective date|effective from|valid from|in force from|approved on|date of issue|issue date)\s*[:\-]?\s*([^\n|]{6,40})/i.exec(head);
  if (em) meta.effective = parseDate(em[1]);
  const h = /^\s*#\s+(.+)$/m.exec(head);
  if (h) meta.title = h[1].trim();
  else {
    const first = head.split("\n").map(s => s.trim()).find(s => s && !/^\[page \d+\]$/.test(s) && s.length <= 100);
    meta.title = first || "";
  }
  return meta;
}
const MONTHS = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, sept:9, oct:10, nov:11, dec:12 };
function parseDate(s){
  s = String(s || "").trim().toLowerCase();
  let m = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(s);
  const iso = (y, mo, d) => (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) ? y + "-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0") : "";
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\.?,?\s+(\d{4})\b/.exec(s);
  if (m && MONTHS[m[2].slice(0, 4)] || m && MONTHS[m[2].slice(0, 3)]) return iso(+m[3], MONTHS[m[2].slice(0, 4)] || MONTHS[m[2].slice(0, 3)], +m[1]);
  m = /\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/.exec(s);
  if (m && (MONTHS[m[1].slice(0, 4)] || MONTHS[m[1].slice(0, 3)])) return iso(+m[3], MONTHS[m[1].slice(0, 4)] || MONTHS[m[1].slice(0, 3)], +m[2]);
  m = /\b(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})\b/.exec(s);
  if (m) return +m[1] > 12 ? iso(+m[3], +m[2], +m[1]) : +m[2] > 12 ? iso(+m[3], +m[1], +m[2]) : iso(+m[3], +m[2], +m[1]);
  m = /\b([a-z]{3,9})\s+(\d{4})\b/.exec(s);
  if (m && MONTHS[m[1].slice(0, 3)]) return iso(+m[2], MONTHS[m[1].slice(0, 3)], 1);
  return "";
}
/* what makes two files the same document: its name without the version,
   the year, and words like draft or final */
function familyKey(name){
  return String(name || "").toLowerCase()
    .replace(/\.(pdf|md|markdown|txt|docx?)$/i, "")
    .replace(/\b(v|ver|version|rev|revision)\s*\.?\s*\d+(\.\d+)*\b/g, " ")
    .replace(/\bv\d+(\.\d+)*\b/g, " ").replace(/\b(19|20)\d\d\b/g, " ")
    .replace(/\b(draft|final|updated?|new|old|copy|latest|current|approved)\b/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
function cmpVersion(a, b){
  const x = String(a || "").split(".").map(n => +n || 0), y = String(b || "").split(".").map(n => +n || 0);
  for (let i = 0; i < Math.max(x.length, y.length); i++){ const d = (x[i] || 0) - (y[i] || 0); if (d) return d; }
  return 0;
}
/* Which of several active versions of one document is the current one -
   only when their own metadata proves it. The one uploaded last is not
   the approved one because it was uploaded last. */
function currentOf(docs, today){
  const act = docs.filter(d => d.status === "active");
  if (act.length < 2) return { current:act, proven:true };
  const t = today || "9999-12-31";
  if (act.every(d => d.effective)){
    const live = act.filter(d => d.effective <= t);
    const pool = live.length ? live : act;
    const best = pool.reduce((a, b) => b.effective > a.effective ? b : a);
    if (pool.filter(d => d.effective === best.effective).length === 1) return { current:[best], proven:true, by:"effective" };
  }
  if (act.every(d => d.version)){
    const best = act.reduce((a, b) => cmpVersion(b.version, a.version) > 0 ? b : a);
    if (act.filter(d => cmpVersion(d.version, best.version) === 0).length === 1) return { current:[best], proven:true, by:"version" };
  }
  return { current:act, proven:false };
}

/* ── how good a page's text is ────────────────────────────────────────────
   Too little to go on, mostly characters that are not letters, words with
   no vowels in them: a scan read badly, or a font the reader could not
   decode. Such a page can be searched, but it cannot support an answer. */
function textQuality(t){
  const s = String(t || "").replace(/\s+/g, " ").trim();
  if (s.length < 20) return { ok:false, why:"almost no text" };
  const letters = (s.match(/[\p{L}\p{N}]/gu) || []).length;
  const odd = (s.match(/[^\p{L}\p{N}\s.,;:!?'"()\[\]\-\/%&@#*+=<>|_$–—‘’“”•]/gu) || []).length;
  if (odd / s.length > 0.12 || letters / s.length < 0.55) return { ok:false, why:"garbled characters" };
  const ws = s.split(" ").filter(w => /^\p{L}{4,}$/u.test(w));
  const bad = ws.filter(w => !/[aeiouyAEIOUYÀ-ɏ]/.test(w) && /^[A-Za-z]+$/.test(w)).length;
  if (ws.length >= 8 && bad / ws.length > 0.3) return { ok:false, why:"words that are not words" };
  return { ok:true, why:"" };
}

/* ── a document, made ready to search ─────────────────────────────────────
   input: { id, name, file, kind, text, pages (count), pageStats:[{n, lost,
   glyphs, ocr}], and what you said about it: version, effective, systems,
   environment, category, label, assistant, status }
   -> { doc, chunks, issues }: the passages, each page's text checked, and
   a list of what could not be read, by page. */
function prepare(input){
  const meta = detectMeta(input.text, input.file || input.name);
  const name = String(input.name || meta.title || input.file || "Untitled").trim();
  const doc = {
    id: input.id, family: input.family || familyKey(name), name: name, file: input.file || "",
    kind: input.kind || "text", version: String(input.version || meta.version || ""),
    effective: String(input.effective || meta.effective || ""),
    systems: (input.systems || []).filter(Boolean), environment: input.environment || "",
    category: input.category || "", label: input.label || "", assistant: input.assistant !== false,
    status: input.status || "active", pages: input.pages || 0
  };
  const chunks = chunkDocument(doc, input.text);
  const issues = [];
  const pageQ = {};
  if (doc.kind === "pdf"){
    const texts = {};
    let pg = 1;
    String(input.text || "").split("\n").forEach(l => {
      const m = /^\[page (\d+)\]\s*$/.exec(l);
      if (m){ pg = +m[1]; return; }
      texts[pg] = (texts[pg] || "") + l + "\n";
    });
    const stats = {};
    (input.pageStats || []).forEach(st => { stats[st.n] = st; });
    for (let n = 1; n <= Math.max(doc.pages || 0, ...Object.keys(texts).map(Number)); n++){
      const st = stats[n] || {}, t = texts[n] || "";
      let why = "";
      if (!t.trim()) why = st.images ? "a scanned page with no text that could be read" : "no text on this page";
      else if (st.glyphs && st.lost / st.glyphs > 0.15) why = "characters the reader could not decode";
      else { const q = textQuality(t); if (!q.ok) why = q.why; }
      if (why){ pageQ[n] = why; issues.push({ page:n, what:why }); }
      else if (st.ocr) issues.push({ page:n, what:"read from a scan by the recogniser - check figures against the original", info:true });
    }
  }
  chunks.forEach(c => {
    const why = c.page ? pageQ[c.page] : "";
    if (why){ c.quality = "low"; c.qualityWhy = why; return; }
    if (c.text.length > 120){ const q = textQuality(c.text); if (!q.ok){ c.quality = "low"; c.qualityWhy = q.why; } }
  });
  if (!chunks.length) issues.push({ page:0, what:"no text could be read from this document" });
  doc.chunks = chunks.length;
  return { doc:doc, chunks:chunks, issues:issues };
}
/* what changed between two readings of a document, by passage */
function diffChunks(before, after){
  const a = new Set((before || []).map(c => c.key)), b = new Set((after || []).map(c => c.key));
  return { added:[...b].filter(k => !a.has(k)).length, removed:[...a].filter(k => !b.has(k)).length,
           kept:[...b].filter(k => a.has(k)).length };
}

/* ── the index ─────────────────────────────────────────────────────────── */
function createIndex(docs, chunks){
  const ix = { docs:new Map(), chunks:[], post:new Map(), dl:[], avgdl:0, byDoc:new Map(), byId:new Map() };
  (docs || []).forEach(d => ix.docs.set(d.id, d));
  let total = 0;
  (chunks || []).forEach(c => {
    const d = ix.docs.get(c.doc); if (!d) return;
    const i = ix.chunks.length;
    ix.chunks.push(c); ix.byId.set(c.id, i);
    if (!ix.byDoc.has(c.doc)) ix.byDoc.set(c.doc, []);
    ix.byDoc.get(c.doc).push(i);
    const tf = new Map();
    const bump = (t, w) => tf.set(t, (tf.get(t) || 0) + w);
    const body = terms(c.text);
    body.forEach(t => bump(t, 1));
    const heads = (c.heads || []).map(h => h[1]).join(" ");
    terms(heads).forEach(t => bump(t, 2));
    terms(d.name).forEach(t => bump(t, 0.5));
    let len = body.length;
    ix.dl.push(len); total += len;
    /* pairs of words, for "internet facing" meaning more than the two apart */
    for (let k = 0; k + 1 < body.length; k++) bump(body[k] + "_" + body[k + 1], 0.5);
    tf.forEach((w, t) => { if (!ix.post.has(t)) ix.post.set(t, []); ix.post.get(t).push([i, w]); });
  });
  ix.avgdl = ix.chunks.length ? total / ix.chunks.length : 1;
  ix.byDoc.forEach(list => list.sort((a, b) => ix.chunks[a].n - ix.chunks[b].n));
  return ix;
}

/* ── which documents a question may read ──────────────────────────────────
   Before anything is scored: documents you are not cleared for, documents
   switched off or replaced by a newer version, and - when the passages are
   going to the assistant - documents marked to stay on this PC, are not
   candidates at all. They are not searched, not counted to the assistant,
   and not named. */
function cleared(doc, opts){
  const label = String(doc.label || "").trim().toLowerCase();
  if (!label) return true;
  return (opts.clearance || []).map(x => String(x).trim().toLowerCase()).indexOf(label) >= 0;
}
function eligible(ix, q, opts){
  const qn = " " + norm(q) + " ";
  const all = [...ix.docs.values()].filter(d => cleared(d, opts) && !(opts.purpose === "flow" && d.assistant === false));
  /* a version asked for by name: "version 1.2 of the access standard" */
  const askedVer = (/\b(?:version|ver|v)\s*\.?\s*(\d+(?:\.\d+)*)\b/i.exec(q) || [])[1] || "";
  let named = all.filter(d => { const n = norm(d.name).replace(/\b(md|pdf|docx|txt)\b/g, "").trim();
                                return n.length >= 6 && qn.indexOf(" " + n + " ") >= 0; });
  if (!named.length){
    /* or its family name, without the version in it */
    named = all.filter(d => { const f = familyKey(d.name); return f.length >= 6 && qn.indexOf(" " + norm(f) + " ") >= 0; });
  }
  const filters = {};
  let pool = all.filter(d => d.status === "active" ||
    (askedVer && d.status === "superseded" && named.indexOf(d) >= 0 && cmpVersion(d.version, askedVer) === 0));
  if (named.length){
    const fams = new Set(named.map(d => d.family || familyKey(d.name)));
    pool = pool.filter(d => fams.has(d.family || familyKey(d.name)));
    filters.document = [...new Set(named.map(d => d.name))];
  }
  if (askedVer && named.length){
    const exact = pool.filter(d => cmpVersion(d.version, askedVer) === 0);
    if (exact.length){ pool = exact; filters.version = askedVer; }
  }
  /* a system or an environment named in the question: documents about a
     different one drop out; documents about no one in particular stay */
  const sysNames = new Set();
  pool.forEach(d => (d.systems || []).forEach(s => sysNames.add(s)));
  (opts.systems || []).forEach(s => sysNames.add(s));
  const sysHit = [...sysNames].filter(s => { const n = norm(s); return n.length >= 2 && qn.indexOf(" " + n + " ") >= 0; });
  if (sysHit.length){
    const want = new Set(sysHit.map(s => norm(s)));
    pool = pool.filter(d => !(d.systems || []).length || d.systems.some(s => want.has(norm(s))));
    filters.system = sysHit;
  }
  const envHit = envsIn(q);
  if (envHit.length){
    pool = pool.filter(d => !d.environment || envHit.indexOf(ENVS[String(d.environment).toLowerCase()] || String(d.environment).toLowerCase()) >= 0);
    filters.environment = envHit;
  }
  if (opts.category){
    pool = pool.filter(d => String(d.category || "").toLowerCase() === String(opts.category).toLowerCase());
    filters.category = opts.category;
  }
  /* several active versions of one document: the current one, when their
     metadata proves which it is; all of them, flagged, when it does not */
  const fam = new Map();
  pool.forEach(d => { const k = d.family || familyKey(d.name); if (!fam.has(k)) fam.set(k, []); fam.get(k).push(d); });
  const out = [], unproven = [];
  fam.forEach(list => {
    if (filters.version) { out.push(...list); return; }
    const cur = currentOf(list, opts.today);
    out.push(...cur.current.concat(list.filter(d => d.status !== "active")));
    if (!cur.proven) unproven.push(list.map(d => d.name + (d.version ? " v" + d.version : "")));
  });
  /* a document attached to this very question is read, whatever else is current */
  (opts.pinDocs || []).forEach(id => {
    const d = ix.docs.get(id);
    if (d && d.status === "active" && all.indexOf(d) >= 0 && out.indexOf(d) < 0) out.push(d);
  });
  return { docs:out, filters:filters, unproven:unproven, total:all.length };
}

/* ── searching ─────────────────────────────────────────────────────────── */
const K1 = 1.2, B = 0.75;
function queryTerms(q, weight){
  const base = terms(q);
  const out = new Map();
  const add = (t, w) => out.set(t, Math.max(out.get(t) || 0, w));
  base.forEach(t => add(t, weight));
  base.forEach(t => (SYN.get(t) || []).forEach(s => add(s, weight * 0.5)));
  if (/\bhow long\b|\bhow soon\b|\bhow quickly\b|\bby when\b/i.test(q)){
    const tf = stem("timeframe");
    (SYN.get(tf) || []).concat([tf]).forEach(s => add(s, weight * 0.6));
  }
  for (let k = 0; k + 1 < base.length; k++) add(base[k] + "_" + base[k + 1], weight * 0.8);
  return { terms:out, base:[...new Set(base)] };
}
function search(ix, q, opts){
  opts = opts || {};
  const el = eligible(ix, q + " " + (opts.context || ""), opts);
  const ok = new Set(el.docs.map(d => d.id));
  const qt = queryTerms(q, 1);
  if (opts.context){
    const ct = queryTerms(opts.context, 0.45);
    ct.terms.forEach((w, t) => { if (!qt.terms.has(t)) qt.terms.set(t, w); });
  }
  const N = ix.chunks.length || 1;
  const score = new Map(), hitTerms = new Map();
  qt.terms.forEach((w, t) => {
    const p = ix.post.get(t); if (!p) return;
    const df = p.length;
    const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
    for (const [i, tf] of p){
      const c = ix.chunks[i];
      if (!ok.has(c.doc)) continue;
      const dl = ix.dl[i] || 1;
      const s = w * idf * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * dl / ix.avgdl));
      score.set(i, (score.get(i) || 0) + s);
      if (!t.includes("_")){
        if (!hitTerms.has(i)) hitTerms.set(i, new Set());
        hitTerms.get(i).add(t);
      }
    }
  });
  const boost = new Set((opts.boostDocs || []).concat(opts.pinDocs || []));
  const base = qt.base.length ? qt.base : [];
  let ranked = [...score.entries()].map(([i, s]) => {
    const c = ix.chunks[i];
    const got = hitTerms.get(i) || new Set();
    /* how much of the question this passage speaks to, counting a word
       found through one of its synonyms */
    const cov = base.length ? base.filter(t => got.has(t) || (SYN.get(t) || []).some(x => got.has(x))).length / base.length : 0;
    const quality = c.quality === "low" ? 0.6 : 1;
    return { i:i, chunk:c, score:s * (boost.has(c.doc) ? 1.5 : 1) * quality, coverage:cov, matched:[...got] };
  }).sort((a, b) => b.score - a.score);
  const top = ranked.length ? ranked[0].score : 0;
  const minCov = base.length >= 4 ? 0.25 : base.length ? 1 / base.length - 0.01 : 1;
  ranked = ranked.filter(r => r.score >= top * (opts.floor || 0.3) && r.coverage >= minCov);
  /* spread: no more than four from one document before the others get a turn */
  const k = opts.k || 6, per = new Map(), primary = [];
  for (const r of ranked){
    if (primary.length >= k) break;
    const n = per.get(r.chunk.doc) || 0;
    if (n >= 4 && ranked.some(x => x.chunk.doc !== r.chunk.doc && primary.indexOf(x) < 0 && (per.get(x.chunk.doc) || 0) < 4)) continue;
    per.set(r.chunk.doc, n + 1); primary.push(r);
  }
  return { hits:primary, eligible:el, candidates:ranked.length, terms:qt.base.length };
}

/* The passages around a hit, so an answer that depends on the paragraph
   before - the heading of a table, the "unless" in the next section - has
   it. Then everything in reading order, labelled S1, S2..., within the
   budget. A document attached to this question comes first, whole if it
   fits. */
function gather(ix, found, opts){
  opts = opts || {};
  const budget = opts.budget || BUDGET;
  const pick = new Map();             /* chunk index -> role */
  const put = (i, role) => { if (!pick.has(i)) pick.set(i, role); };
  const pinned = (opts.pinDocs || []).filter(id => ix.byDoc.has(id) && found.eligible.docs.some(d => d.id === id));
  /* a document attached to this question travels whole when it fits its
     own allowance (what an attachment always could), and outside the
     budget for everything else; longer, its best passages compete */
  const pinBudget = opts.pinBudget || budget * 0.75;
  let used = 0;
  for (const id of pinned){
    const list = ix.byDoc.get(id);
    const size = list.reduce((n, i) => n + ix.chunks[i].text.length, 0);
    if (used + size <= pinBudget){ list.forEach(i => put(i, "attached")); used += size; }
  }
  found.hits.forEach(h => put(h.i, "match"));
  /* neighbours of the best three: the one before and after in the same
     document, when it is the same section, or the hit is short */
  found.hits.slice(0, 3).forEach(h => {
    const list = ix.byDoc.get(h.chunk.doc) || [], at = list.indexOf(h.i);
    [at - 1, at + 1].forEach(j => {
      if (j < 0 || j >= list.length) return;
      const c = ix.chunks[list[j]];
      if (c.section === h.chunk.section || h.chunk.text.length < 500) put(list[j], "context");
    });
  });
  (opts.extra || []).forEach(i => put(i, "context"));
  const scoreOf = new Map(found.hits.map(h => [h.i, h.score]));
  const order = [...pick.keys()].sort((a, b) => {
    const ra = pick.get(a), rb = pick.get(b);
    const pa = ra === "attached" ? 0 : ra === "match" ? 1 : 2, pb = rb === "attached" ? 0 : rb === "match" ? 1 : 2;
    return pa - pb || (scoreOf.get(b) || 0) - (scoreOf.get(a) || 0);
  });
  const chosen = [];
  let chars = 0, pinChars = 0, others = 0;
  for (const i of order){
    const c = ix.chunks[i];
    if (pick.get(i) === "attached"){ chosen.push(i); pinChars += c.text.length; continue; }
    /* the first passage always goes, however long; after it, the budget */
    if (others && chars + c.text.length > budget) continue;
    chosen.push(i); chars += c.text.length; others++;
  }
  chars += pinChars;
  /* documents by their best passage - one attached to the question first -
     and each document's passages in reading order */
  const rank = new Map();
  chosen.forEach(i => {
    const c = ix.chunks[i], r = pick.get(i) === "attached" ? 1e9 : (scoreOf.get(i) || 0);
    rank.set(c.doc, Math.max(rank.get(c.doc) || 0, r));
  });
  chosen.sort((a, b) => {
    const ca = ix.chunks[a], cb = ix.chunks[b];
    return ca.doc === cb.doc ? ca.n - cb.n : (rank.get(cb.doc) - rank.get(ca.doc)) || String(ca.doc).localeCompare(String(cb.doc));
  });
  const passages = chosen.map((i, k) => {
    const c = ix.chunks[i], d = ix.docs.get(c.doc);
    const h = found.hits.find(x => x.i === i);
    return { s:"S" + (k + 1), id:c.id, doc:d.id, name:d.name, file:d.file || "", kind:d.kind, version:d.version || "",
             effective:d.effective || "", status:d.status, page:c.page || 0, lineStart:c.lineStart || 0, lineEnd:c.lineEnd || 0,
             section:c.section || "", quality:c.quality || "ok", qualityWhy:c.qualityWhy || "", role:pick.get(i),
             lines:c.lines || [], heads:c.heads || [],
             score:h ? Math.round(h.score * 100) / 100 : 0, text:c.text };
  });
  return { passages:passages, chars:chars, pinned:pinned };
}

/* the passages as the prompt reads them */
function packText(res){
  const P = res.passages || [];
  const head = "Searched " + (res.searched || 0) + " document" + (res.searched === 1 ? "" : "s") +
    (res.filterText ? " (" + res.filterText + ")" : "") + ". " +
    (P.length ? P.length + " passage" + (P.length === 1 ? "" : "s") + " below, labelled S1-S" + P.length + "."
              : "No passage matched this question.");
  const lines = [head];
  if (res.unproven && res.unproven.length)
    lines.push("More than one version is active and their metadata does not say which is current: " +
      res.unproven.map(g => g.join(" / ")).join("; ") + ". If they differ, give both, each with its citation.");
  P.forEach(p => {
    const bits = [p.name];
    if (p.version) bits.push("version " + p.version);
    if (p.effective) bits.push("effective " + p.effective);
    if (p.status === "superseded") bits.push("SUPERSEDED - asked for by version");
    if (p.page) bits.push("page " + p.page);
    if (p.lineStart && p.kind !== "docx") bits.push("lines " + p.lineStart + (p.lineEnd && p.lineEnd !== p.lineStart ? "-" + p.lineEnd : ""));
    const secs = [...new Set((p.heads || []).map(h => lastHead(h[1])).filter(Boolean))];
    if (secs.length > 1) bits.push("sections " + secs.map(x => '"' + x + '"').join(", "));
    else if (p.section) bits.push('section "' + p.section + '"');
    lines.push("");
    lines.push("[" + p.s + "] " + bits.join(" · "));
    if (p.quality === "low") lines.push("[the text of this page could not be read reliably (" + (p.qualityWhy || "poor extraction") +
      "): it cannot support a definite answer - say so, and point them to the original page]");
    lines.push(p.text);
  });
  return lines.join("\n");
}

/* ── citations ─────────────────────────────────────────────────────────── */
function lastHead(section){ const s = String(section || "").split(" › "); return s[s.length - 1] || ""; }
/* the lines a quote sits on, and the heading over them */
function locate(p, quote){
  const lines = String(p.text || "").split("\n");
  const nums = p.lines && p.lines.length === lines.length ? p.lines : null;
  let offs = [], acc = "";
  lines.forEach((l, i) => { offs.push(acc.length); acc += (i ? " " : "") + norm(l); });
  const hay = acc;
  const parts = String(quote || "").split(/\.\.\.|…/).map(norm).filter(x => x.length >= 3);
  if (!parts.length) return null;
  const a = hay.indexOf(parts[0]);
  if (a < 0) return null;
  let b = a + parts[0].length, from = b;
  for (let k = 1; k < parts.length; k++){ const j = hay.indexOf(parts[k], from); if (j < 0) return null; from = j + parts[k].length; b = from; }
  const lineAt = pos => { let i = 0; while (i + 1 < offs.length && offs[i + 1] <= pos) i++; return i; };
  const i0 = lineAt(a), i1 = lineAt(Math.max(a, b - 1));
  let section = p.section || "";
  (p.heads || []).forEach(h => { if (h[0] <= i0) section = h[1]; });
  const ln = i => nums ? nums[i] : (p.lineStart ? p.lineStart + i : 0);
  let l0 = ln(i0), l1 = ln(i1);
  if (!l0) for (let i = i0; i <= i1 && !l0; i++) l0 = ln(i);
  if (!l1) for (let i = i1; i >= i0 && !l1; i--) l1 = ln(i);
  return { from:i0, to:i1, lineStart:l0 || 0, lineEnd:l1 || 0, section:section };
}
function citation(c){
  const md = c.kind === "md" || c.kind === "text";
  const bits = [md && c.file ? c.file : c.name];
  if (c.version) bits.push("version " + c.version);
  if (c.page) bits.push("page " + c.page);
  if (c.lineStart && c.kind !== "docx") bits.push(c.lineEnd && c.lineEnd !== c.lineStart ? "lines " + c.lineStart + "-" + c.lineEnd : "line " + c.lineStart);
  const h = lastHead(c.section);
  if (h) bits.push('section "' + h + '"');
  return "[Source: " + bits.join(", ") + "]";
}

/* ── is this a question the documents should answer ─────────────────────── */
const DOC_Q = /\b(polic(?:y|ies)|standards?|guidelines?|guidance|runbooks?|procedures?|processes|sops?|slas?|requirements?|required|requires?|mandatory|must|allowed|permitted|prohibited|timeframes?|time ?frames?|deadlines?|how long|how soon|how quickly|within how|severity|critical|compliance|compliant|audit|vulnerabilit(?:y|ies)|remediat\w*|according to|document(?:s|ed)?|what does (?:the|our|this) \w+ say|which (?:section|page|document|clause)|clause|section|annex|appendix)\b/i;
function isDocQuestion(q){ return DOC_Q.test(String(q || "")); }

/* a follow-up leans on the last question: "how about low severity?",
   "and in UAT?", "what does the previous section say?" */
function followUp(q, prev){
  const s = String(q || "").trim().toLowerCase();
  if (!prev || !prev.query) return { follow:false };
  const n = s.split(/\s+/).filter(Boolean).length;
  const ana = /\b(that|this|those|these|same|above|previous|prior|preceding|next|following|it|its|there)\b/.test(s) &&
              /\b(polic(y|ies)|standard|guideline|document|doc|section|runbook|procedure|table|page|part|clause|one|rule|it)\b/.test(s);
  const lead = /^(and|also|what about|how about|and for|for|same for|what if|then|so|but)\b/.test(s);
  const follow = ana || lead || n <= 5;
  if (!follow) return { follow:false };
  const dir = /\b(previous|prior|preceding|earlier) (section|part|clause|page)|section before\b/.test(s) ? "prev"
            : /\b(next|following) (section|part|clause|page)|section after\b/.test(s) ? "next" : "";
  return { follow:true, context:prev.query, boostDocs:prev.docs || [], dir:dir };
}
/* the passages next to the ones cited last time, for "the previous section" */
function beside(ix, chunkIds, dir){
  const out = [];
  (chunkIds || []).forEach(id => {
    const i = ix.byId.get(id); if (i == null) return;
    const c = ix.chunks[i], list = ix.byDoc.get(c.doc) || [], at = list.indexOf(i);
    const step = dir === "prev" ? -1 : 1;
    for (let j = at + step; j >= 0 && j < list.length; j += step){
      const o = ix.chunks[list[j]];
      if (o.section !== c.section){ out.push(list[j]); break; }
    }
  });
  return out;
}

/* ── checking the answer ──────────────────────────────────────────────────
   What a figure is: a number with a unit of time, a percentage, a
   priority or severity level, a score. Those are the things that turn a
   guess into a rule, so each one in an answer must be written in a
   passage that was searched - in one it cites, for full confidence. */
const UNIT = [
  [/^(?:min|mins|minute|minutes)$/, "minute"], [/^(?:h|hr|hrs|hour|hours)$/, "hour"], [/^(?:d|day|days)$/, "day"],
  [/^(?:wk|wks|week|weeks)$/, "week"], [/^(?:mo|mos|month|months)$/, "month"], [/^(?:yr|yrs|year|years)$/, "year"],
  [/^(?:%|percent|per cent)$/, "percent"]
];
function unitOf(u){ u = String(u || "").toLowerCase(); for (const [re, v] of UNIT) if (re.test(u)) return v; return ""; }
function figures(text){
  const s = numberWords(String(text || "").toLowerCase()).replace(/\[source:[^\]]*\]/g, " ");
  const out = [];
  const add = (key, raw) => { if (!out.some(x => x.key === key)) out.push({ key:key, text:raw.trim() }); };
  const re = /(\d+(?:\.\d+)?)(?:\s*(?:-|–|to|or)\s*(\d+(?:\.\d+)?))?\s*(?:business|working|calendar|clock)?\s*(minutes?|mins?|hours?|hrs?|h|days?|weeks?|wks?|months?|years?|yrs?|%|percent)\b/g;
  let m;
  while ((m = re.exec(s))){
    const u = unitOf(m[3]); if (!u) continue;
    add(m[1] + " " + u, m[0]);
    if (m[2]) add(m[2] + " " + u, m[0]);
  }
  const re2 = /\b(?:p|priority|sev|severity|severity level)\s*-?\s*([1-5])\b/g;
  while ((m = re2.exec(s))) add("p" + m[1], m[0]);
  const re3 = /\b(?:cvss(?:\s*(?:v?\d(?:\.\d)?)?)?(?:\s*(?:base\s*)?score)?(?:\s*of)?|score\s*of)\s*(\d{1,2}(?:\.\d)?)\b/g;
  while ((m = re3.exec(s))) add("score " + m[1], m[0]);
  const re4 = /(\d+(?:\.\d+)?)\s*(?:or\s+(?:more|higher|above|greater|less|lower|below|fewer))\b/g;
  while ((m = re4.exec(s))) add("n " + m[1], m[0]);
  return out;
}
function hasFigure(text, f){
  const got = figures(text).map(x => x.key);
  if (got.indexOf(f.key) >= 0) return true;
  /* "72 hours" said as "3 days", or the other way: not the same words, and
     not accepted - the answer has to say what the document says */
  if (/^n /.test(f.key)) return (" " + norm(text) + " ").indexOf(" " + f.key.slice(2) + " ") >= 0;
  return false;
}
function unverifiable(say){
  return /\b(not (?:specified|stated|mentioned|covered|defined|say|said|found|included|given|provided|set out)|does(?:n't| not) (?:specify|state|say|mention|cover|define|include|give|set)|no (?:information|mention|reference|timeframe|figure|value|requirement)|isn't (?:specified|stated|covered)|cannot find|could not find|couldn't find)\b/i.test(String(say || ""));
}
/* reply: { say, cite:[{s, quote}], confidence, suggest }
   pack:  { passages, docQuestion }
   ->     { status, confidence, cites, unsupported, uncited, notes } */
function ground(reply, pack, question){
  const P = (pack && pack.passages) || [];
  const say = String((reply && reply.say) || "");
  const raw = Array.isArray(reply && reply.cite) ? reply.cite : [];
  const conf = String((reply && reply.confidence) || "").toLowerCase().replace(/[^a-z_]/g, "");
  const docMode = !!(pack && pack.docQuestion) || raw.length > 0 || /^(high|medium|not_?found|low)$/.test(conf);
  const res = { status:"general", confidence:"", cites:[], unsupported:[], uncited:[], notes:[] };
  if (!docMode) return res;
  const bySid = new Map(P.map(p => [String(p.s).toUpperCase(), p]));
  const byId = new Map(P.map(p => [p.id, p]));
  raw.forEach(c => {
    const sid = String((c && (c.s || c.source || c.id)) || "").trim();
    const p = bySid.get(sid.toUpperCase().replace(/^\[|\]$/g, "")) || byId.get(sid);
    if (!p){ res.notes.push("cited " + sid + ", which was not among the passages"); return; }
    const quote = String((c && (c.quote || c.evidence)) || "").trim();
    const at = quote ? locate(p, quote) : null;
    const cite = Object.assign({}, p, { quote:quote, verified:!!at });
    if (at){ cite.lineStart = at.lineStart || p.lineStart; cite.lineEnd = at.lineEnd || at.lineStart || p.lineEnd; cite.section = at.section || p.section; }
    else res.notes.push(sid + (quote ? ": the quote is not in that passage" : ": no quote given"));
    cite.citation = citation(cite);
    if (!res.cites.some(x => x.id === cite.id && x.quote === cite.quote)) res.cites.push(cite);
  });
  const good = res.cites.filter(c => c.verified);
  const qFig = figures(question || "").map(f => f.key);
  const notFound = /^not_?found$/.test(conf) || (!good.length && unverifiable(say));
  figures(say).forEach(f => {
    if (notFound && qFig.indexOf(f.key) >= 0) return;         /* "the standard does not say 4 hours" */
    if (good.some(c => hasFigure(c.text, f))) return;
    /* written in a passage the answer did not cite - an incident target
       sitting next to a vulnerability question is not support for it */
    const other = P.filter(p => hasFigure(p.text, f));
    if (other.length) res.uncited.push({ figure:f.text, in:other.map(p => p.s) });
    res.unsupported.push(f.text);
  });
  if (res.unsupported.length){ res.status = "blocked"; res.confidence = "not_found"; return res; }
  if (notFound){ res.status = "not_found"; res.confidence = "not_found"; return res; }
  if (!good.length){ res.status = "unsupported"; res.confidence = "not_found"; return res; }
  res.status = "grounded";
  const lowOnly = good.every(c => c.quality === "low");
  res.confidence = conf === "high" && !lowOnly ? "high" : "medium";
  if (lowOnly) res.notes.push("every cited passage is from a page that could not be read reliably");
  return res;
}

/* ── one line of diagnostics, with no document text in it ──────────────── */
function diagnose(q, found, packed, g){
  return {
    at: new Date().toISOString(),
    words: (found && found.terms) || 0,
    searched: found ? found.eligible.docs.length : 0,
    filters: found ? found.eligible.filters : {},
    candidates: found ? found.candidates : 0,
    retrieved: ((packed && packed.passages) || []).map(p => ({ s:p.s, chunk:p.id, doc:p.name, version:p.version || "",
      page:p.page || 0, lines:p.lineStart ? p.lineStart + "-" + p.lineEnd : "", score:p.score, role:p.role })),
    cited: g ? g.cites.map(c => ({ chunk:c.id, verified:c.verified, citation:c.citation })) : [],
    status: g ? g.status : "",
    unsupported: g ? g.unsupported.length : 0,
    noEvidence: !((packed && packed.passages) || []).length
  };
}

const API = {
  VERSION: VERSION, ALGO: ALGO, BUDGET: BUDGET,
  stem: stem, terms: terms, norm: norm, hash36: hash36,
  readLines: readLines, chunkDocument: chunkDocument, detectMeta: detectMeta, parseDate: parseDate,
  familyKey: familyKey, cmpVersion: cmpVersion, currentOf: currentOf, textQuality: textQuality,
  prepare: prepare, diffChunks: diffChunks, envsIn: envsIn,
  createIndex: createIndex, eligible: eligible, search: search, gather: gather, packText: packText,
  locate: locate, citation: citation, lastHead: lastHead,
  isDocQuestion: isDocQuestion, followUp: followUp, beside: beside,
  figures: figures, ground: ground, diagnose: diagnose
};
if (typeof module === "object" && module.exports) module.exports = API;
if (root) root.DossierSources = API;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);
