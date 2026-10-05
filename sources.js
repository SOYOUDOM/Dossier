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
             searched. A line that states a figure no passage it cites
             contains is taken out, and an answer that rested on one is not
             shown as the documents' answer.

   Pure: no DOM, no files, no network. dossier.html reads the files, keeps
   them in the workspace folder and draws the answers; tests/ runs this
   under Node.
   ══════════════════════════════════════════════════════════════════════════ */
(function(root){
"use strict";

const VERSION = "1.0";
/* the shape of passages: raise it and every document is cut again, from
   the text already kept, the next time the workspace opens
   (2: a PDF's running header and footer are left out of its passages) */
const ALGO = 2;
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
/* "VERSION: 1.0", "DATE: 26/01/2023", "CLASSIFICATION: OFFICIAL" - a field
   of the document's own details, in capitals, is not a heading */
const META_LINE = /^(?:version|ver|date|dated|reference|ref|doc(?:ument)?\s*(?:ref(?:erence)?|no|number|id|size)|(?:security\s+|government\s+security\s+)?classification|protective\s+marking|marking|copyright|page|owner|author|status|issued|issue\s+date|approved(?:\s+(?:by|on))?|effective(?:\s+date)?|(?:next\s+|planned\s+)?review(?:\s+date)?|distribution)\s*:\s*\S/i;
function isHeadingPdf(t){
  if (t.length < 3 || t.length > 90) return 0;
  if (/[.;,:]$/.test(t) && !/^\d+(\.\d+)*\.$/.test(t)) return 0;
  if (META_LINE.test(t)) return 0;
  /* nor a run of control references ("AC-1, AC-2", "IA-3, IA-4,"), nor a
     web address ("NCSC.GOV.UK") - capitals, but not a section */
  if (t.split(/[\s,;]+/).filter(Boolean).every(w => /^[A-Z]{1,4}-?\d+(?:\.\d+)*$/.test(w))) return 0;
  if (!/\s/.test(t) && /\.[A-Za-z]{2,}/.test(t) && !/^\d/.test(t)) return 0;
  /* nor a line cut off mid-phrase ("Cyber Security -", "Policy &"), nor a
     table row read out as cells between tabs ("0.1  Tim  Initial version") */
  if (/\s[-–&]$/.test(t) || (t.match(/\t/g) || []).length >= 2) return 0;
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
/* Lines printed at the top or the bottom of most pages - a running header
   ("VERSION: 1.0", "CLASSIFICATION : OFFICIAL"), a footer, the page number
   - are not the document's words. Read as text, a header in capitals
   became a heading on every page, so the second page of a rule was cited
   as section "CLASSIFICATION : OFFICIAL" instead of the rule it continues,
   and every passage carried the same seven lines. They still count as
   lines of their page (a person counting lines on the printed page counts
   them), but no passage carries them and none is a heading.

   A line is furniture when the same words stand at the same place - the
   same line from the top (of the first eight) or from the bottom (of the
   last four) - on at least 60% of the pages, and on three. Only the page
   number is ignored when comparing ("Page 3 of 17" matches "Page 4 of
   17"), never another number: "Minimum Length: 16 characters" near the top
   of one page and "Minimum Length: 20 characters" on the next are rules,
   not a header. */
const FURN_TOP = 8, FURN_BOTTOM = 4;
const LONE_NUM = /(?<![\w./:-])\d+(?![\w./-])/g;
function furnSig(s, pageNo){
  const t = String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
  return pageNo == null ? t : t.replace(LONE_NUM, n => +n === pageNo ? "#" : n);
}
function furnitureOf(src){
  const pages = new Map();
  let pg = 1;
  src.forEach(raw => {
    const pm = /^\[page (\d+)\]\s*$/.exec(raw);
    if (pm){ pg = +pm[1]; return; }
    if (!raw.trim()) return;
    if (!pages.has(pg)) pages.set(pg, []);
    pages.get(pg).push(raw.trim());
  });
  if (pages.size < 3) return null;
  const need = Math.max(3, Math.ceil(pages.size * 0.6));
  const zone = (ls, i) => i < FURN_TOP ? "t" + i : i >= ls.length - FURN_BOTTOM ? "b" + (ls.length - 1 - i) : "";
  /* the printed page number: the number, alone on a short line near the
     top or the bottom, that stands the same distance from the page's place
     in the file on most pages (a cover that is not numbered shifts it) */
  const offs = new Map();
  pages.forEach((ls, n) => {
    const got = new Set();
    ls.forEach((l, i) => {
      if (!zone(ls, i) || l.length > 60) return;
      (l.match(LONE_NUM) || []).forEach(x => { const o = +x - n; if (Math.abs(o) <= 5) got.add(o); });
    });
    got.forEach(o => offs.set(o, (offs.get(o) || 0) + 1));
  });
  let off = null, best = 0;
  offs.forEach((c, o) => { if (c > best || (c === best && Math.abs(o) < Math.abs(off))){ best = c; off = o; } });
  if (best < need) off = null;
  const printed = n => off == null ? null : n + off;
  const count = new Map();
  pages.forEach((ls, n) => {
    const seen = new Set();
    ls.forEach((l, i) => {
      const z = zone(ls, i);
      if (!z || l.length > 120) return;
      const key = z + "\u0000" + furnSig(l, printed(n));
      if (seen.has(key)) return;
      seen.add(key);
      count.set(key, (count.get(key) || 0) + 1);
    });
  });
  const keys = new Set();
  count.forEach((c, k) => { if (c >= need) keys.add(k); });
  if (!keys.size) return null;
  return { pages:pages, is:(n, i, raw) => {
    const ls = pages.get(n) || [], z = zone(ls, i);
    return !!z && keys.has(z + "\u0000" + furnSig(raw.trim(), printed(n)));
  } };
}
function readLines(kind, text){
  const out = [];
  const src = String(text || "").replace(/\r\n?/g, "\n").split("\n");
  const furn = kind === "pdf" ? furnitureOf(src) : null;
  let page = kind === "pdf" ? 1 : 0, pline = 0;
  for (let i = 0; i < src.length; i++){
    const raw = src[i];
    if (kind === "pdf"){
      const pm = /^\[page (\d+)\]\s*$/.exec(raw);
      if (pm){ page = +pm[1]; pline = 0; continue; }
      if (!raw.trim()) { out.push({ t:"", page:page, line:0, blank:true }); continue; }
      pline++;
      if (furn && furn.is(page, pline - 1, raw)){
        out.push({ t:raw, page:page, line:pline, furn:true });
        continue;
      }
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
    if (ln.furn) continue;
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
  /* the title: a "title:" at the top of a Markdown file, or its "# heading";
     failing both, the first line - which says where it came from, because a
     first line is as often a bullet or a sentence as a title */
  const fm = /^\s*---[ \t]*\n([\s\S]*?)\n---/.exec(head);
  const ft = fm && /^[ \t]*title[ \t]*:[ \t]*["']?(.+?)["']?[ \t]*$/mi.exec(fm[1]);
  const h = /^\s*#\s+(.+)$/m.exec(head);
  if (ft && plainTitle(ft[1])){ meta.title = plainTitle(ft[1]); meta.titleFrom = "front"; }
  else if (h){ meta.title = plainTitle(h[1]); meta.titleFrom = "heading"; }
  else {
    const first = head.split("\n").map(s => s.trim()).find(s => s && !/^\[page \d+\]$/.test(s) && s.length <= 100);
    meta.title = first || ""; meta.titleFrom = "line";
    /* a first line that is all bold and is not a sentence is a title too -
       Word documents turned into Markdown write theirs that way */
    const bold = /^(\*\*|__)([^*_]+)\1$/.exec(first || "");
    if (bold && !/[.!?:]$/.test(bold[2].trim())){ meta.title = plainTitle(bold[2]); meta.titleFrom = "heading"; }
  }
  return meta;
}
/* A line that is to be a name, without its Markdown: "**Data** `Objects`",
   "- Introduction & Step by Step", "[Setup](setup.md)", "## Scope". */
function plainTitle(s){
  return String(s || "")
    .replace(/^\s*(?:#+|[-*+\u2022>]|\d+[.)])\s+/, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*|__|`|~~/g, "")
    .replace(/(^|\s)[*_](?=\S)([^*_]*?\S)[*_](?=\s|$|[.,;:!?])/g, "$1$2")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+#+\s*$/, "")
    .replace(/\s+/g, " ").trim();
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
/* A document's name: the title it gives itself when that is a real title,
   otherwise its file name. The first line of a PDF is often a logo's words
   or a company name - "AIA", "CONFIDENTIAL" - and a file called
   "ITSR.039 Vulnerability Management Standard.pdf" says more. */
function weakTitle(t){
  const s = String(t || "").replace(/^#+\s*/, "").trim();
  const letters = s.replace(/[^\p{L}]/gu, "").length;
  const ws = s.split(/\s+/).filter(w => /\p{L}{2,}/u.test(w));
  return !s || letters < 8 || ws.length < 2 || s.length > 90 || /^(confidential|internal|restricted|draft|public|page \d+)\b/i.test(s);
}
function genericFile(name){
  const b = String(name || "").replace(/\.[^.]+$/, "").trim();
  return !b || /^(document|doc|scan|scanned|file|untitled|download|img|image|new|copy|attachment|readme|index|default|main)[\s_\-\d()]*$/i.test(b) ||
         b.replace(/[^\p{L}]/gu, "").length < 4;
}
function tidyName(s){
  s = String(s || "").replace(/[_]+|(?<=\p{L})-(?=\p{L})/gu, " ").replace(/\s+/g, " ").trim();
  /* "data retention standard" and "DATA RETENTION STANDARD" read as a name */
  if (s === s.toLowerCase() || (s === s.toUpperCase() && /\p{L}{4,}/u.test(s)))
    s = s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (m, a, c) => a + c.toUpperCase());
  return s;
}
/* from: where the title came from (detectMeta's titleFrom). A heading is
   trusted; a first line only when the file's own name says nothing - it is
   "- Introduction & Step by Step" or "**Data Transfer Objects** are used to
   transfer data between the..." as often as it is a title. */
function nameFor(title, fileName, kind, from){
  const base = tidyName(String(fileName || "").replace(/\.[^.]+$/, ""));
  const t = plainTitle(title);
  if (kind === "md" || kind === "docx"){
    if (from === "line" && base && !genericFile(fileName)) return base;
    /* a heading of one word is a title too: "About", "Multi-Tenancy" */
    const good = from === "heading" || from === "front"
      ? t.replace(/[^\p{L}]/gu, "").length >= 3 && t.length <= 90
      : !weakTitle(t) && !(from === "line" && sentenceLike(t));
    return good ? t : base || t || "Untitled";
  }
  /* a PDF's first line is too often a logo to be trusted over its file name */
  if (!genericFile(fileName)) return base;
  return !weakTitle(t) ? tidyName(t) : base || t || "Untitled";
}
/* what makes two files the same document: its name without the version,
   the year, and words like draft or final */
/* reads as a sentence rather than a title: many words, or a verb in the
   middle of it ("... are used to ...") */
function sentenceLike(t){
  const ws = String(t || "").split(/\s+/).filter(Boolean);
  return ws.length >= 9 || /[.!?]$/.test(t) || (ws.length >= 5 && /\b(is|are|was|were|will|can|should|must|used|allows?)\b/i.test(t));
}
/* A name given to a document before 5.9.4 that is broken: Markdown marks in
   it, or the first line of the text taken for a title. firstLine is the first
   line of the document's text. Returns the better name, or "" to keep it. A
   name somebody typed is neither, and is kept. */
function betterName(name, firstLine, fileName, kind){
  const n = String(name || ""), line = String(firstLine || "").trim();
  if (kind !== "md" && kind !== "docx" && kind !== "text") return "";
  const marks = /^\s*(?:#|[-*+\u2022>]\s|\d+[.)]\s)|\*\*|__|`|\[[^\]]*\]\(/.test(n);
  const pn = plainTitle(n), pl = plainTitle(line);
  /* the first line, or the start of it - a long one was cut to fit */
  const fromLine = !!pl && !/^#/.test(line) && (pl === pn || (pn.length >= 20 && pl.indexOf(pn) === 0));
  if (!marks && !fromLine) return "";
  /* a first line all in bold is a title, as it is for a document added now */
  const dm = detectMeta(line, fileName), from = dm.titleFrom === "heading" ? "heading" : "line";
  const want = fromLine || sentenceLike(pn) ? nameFor(from === "heading" ? dm.title : line || n, fileName, kind, from) : pn;
  return want && want !== n ? want : "";
}
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
/* How much a passage lays down a rule: a minimum or a maximum, a must or a
   must-not, a number of characters, days or attempts, a "within" or an
   "every". Asked what something should be, the passage that sets the rule
   is the answer, and the one that only talks about the subject is not -
   "what should a password be?" in a password standard, where every passage
   says "password". A lift of a tenth per kind of cue, never a filter. */
const RULE_CUES = [
  /\bminimum\b|\bat least\b|\bno (?:fewer|less) than\b/i,
  /\bmaximum\b|\bno more than\b|\bat most\b|\bno later than\b/i,
  /\bmust\b|\bshall\b|\b(?:is|are) required\b|\bmandatory\b/i,
  /\b(?:must|shall) not\b|\bprohibited\b|\bnot (?:be )?(?:permitted|allowed)\b|\bblocked\b/i,
  /\b\d+(?:\.\d+)?\s*-?\s*(?:(?:characters?|chars?|digits?|letters?|words?|attempts?|minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?|percent)\b|%)/i,
  /\bwithin\b|\bevery\b|\bexpires?\b|\bdeadline\b/i
];
const RULE_WEIGHT = 0.1;
function ruleCues(text){ return RULE_CUES.filter(re => re.test(String(text || ""))).length; }
function createIndex(docs, chunks){
  const ix = { docs:new Map(), chunks:[], post:new Map(), dl:[], avgdl:0, byDoc:new Map(), byId:new Map(), rule:[] };
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
    ix.rule.push(ruleCues(c.text));
    /* pairs of words, for "internet facing" meaning more than the two apart
       - within a sentence: "...the System Access standard. Passwords
       represent..." is not a "standard password", and neither is a title
       over two lines ("ACCESS STANDARD" / "Passwords and Passphrases"). A
       line that starts in lower case carries on the one before it. */
    String(c.text).split(/[.!?;:]+(?=\s|$)|\n(?=\s*[^\p{Ll}\s])/u).forEach(seg => {
      const ts = terms(seg);
      for (let k = 0; k + 1 < ts.length; k++) bump(ts[k] + "_" + ts[k + 1], 0.5);
    });
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
/* A document attached in a conversation belongs to that conversation
   (scope "chat", chat = the conversation's id): read for every question
   in it, and for no other. It is not part of the library of documents
   every question searches - "just for this chat" means exactly that. */
function inScope(doc, opts){
  return doc.scope !== "chat" || (!!opts.chat && doc.chat === opts.chat);
}
function eligible(ix, q, opts){
  const qn = " " + norm(q) + " ";
  const all = [...ix.docs.values()].filter(d => cleared(d, opts) && inScope(d, opts) && !(opts.purpose === "flow" && d.assistant === false));
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

/* ── a slip of the keyboard ───────────────────────────────────────────────
   "what is the stardard password", "pasword rules", "the doucment": a word
   of the question that no document uses, one letter away from one they do
   (two for a long word), is searched as that word, at a little less
   weight. Only words of five letters or more, never numbers, and the first
   letter has to match - a typo rarely starts wrong, and a different word
   usually does. It only decides which passages are read: an answer still
   has to be in their words. */
function editWithin(a, b, max){
  /* letters changed, added, dropped or swapped, stopping once past max */
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  let prev2 = null, prev = [];
  for (let j = 0; j <= lb; j++) prev.push(j);
  for (let i = 1; i <= la; i++){
    const cur = [i];
    let low = i;
    for (let j = 1; j <= lb; j++){
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      if (v < low) low = v;
    }
    if (low > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[lb];
}
/* real words one letter from a document word - "complaint" is not a
   mistyped "compliant", nor "police" a mistyped "policy". Checked against
   an English word list of 114,000 words: these are the common ones. */
const NOT_TYPOS = new Set(["complaint", "police", "polity", "requirer", "allower"].reduce((a, w) => a.concat([w, stem(w)]), []));
function nearTerm(ix, t){
  if (t.length < 5 || /\d/.test(t) || ix.post.has(t) || NOT_TYPOS.has(t)) return "";
  if (!ix.vocab){
    ix.vocab = new Map();
    ix.post.forEach((p, k) => {
      if (k.indexOf("_") >= 0 || /\d/.test(k) || k.length < 4) return;
      if (!ix.vocab.has(k.length)) ix.vocab.set(k.length, []);
      ix.vocab.get(k.length).push(k);
    });
  }
  const max = t.length >= 8 ? 2 : 1;
  let best = "", bd = max + 1, bdf = 0;
  for (let n = t.length - max; n <= t.length + max; n++){
    (ix.vocab.get(n) || []).forEach(v => {
      if (v[0] !== t[0]) return;
      const d = editWithin(t, v, max);
      if (d > max) return;
      const df = ix.post.get(v).length;
      if (d < bd || (d === bd && df > bdf)){ best = v; bd = d; bdf = df; }
    });
  }
  return best;
}

/* ── searching ─────────────────────────────────────────────────────────── */
const K1 = 1.2, B = 0.75;
function queryTerms(q, weight, fix, common){
  const soft = new Set();
  const base = terms(q).map(t => { const n = fix ? fix(t) : t; if (n !== t) soft.add(n); return n; });
  const out = new Map();
  const add = (t, w) => out.set(t, Math.max(out.get(t) || 0, w));
  base.forEach(t => add(t, soft.has(t) ? weight * 0.85 : weight));
  /* a word already in most of the passages searched - "password" in a
     password standard - is found plenty without its synonyms, and they
     only add noise: "standard" reaching for "procedure" found the helpdesk
     procedures before the rules */
  base.forEach(t => { if (!(common && common(t))) (SYN.get(t) || []).forEach(s => add(s, weight * 0.5)); });
  if (/\bhow long\b|\bhow soon\b|\bhow quickly\b|\bby when\b/i.test(q)){
    const tf = stem("timeframe");
    (SYN.get(tf) || []).concat([tf]).forEach(s => add(s, weight * 0.6));
  }
  for (let k = 0; k + 1 < base.length; k++) add(base[k] + "_" + base[k + 1], weight * 0.8);
  return { terms:out, base:[...new Set(base)] };
}
/* The words of a long text - an email, a screenshot's words, the last
   answer - that would find something in these documents: the rarest ones
   that occur in them, most distinctive first. A request that says "please
   generate the monthly listing of dormant accounts for September" becomes
   the few words a guideline about that report is written in, not forty
   words of greeting and signature (5.16). */
function keyTerms(ix, text, n){
  if (!ix || !ix.chunks || !ix.chunks.length || !text) return "";
  const N = ix.chunks.length;
  const best = new Map();
  words(text).forEach(w => {
    if (STOP.has(w) || w.length < 3 || (/^\d+$/.test(w) && w.length < 4)) return;
    const t = stem(w);
    if (!ix.post.has(t)) return;
    const e = best.get(t);
    if (e) e.count++; else best.set(t, { word:w, count:1 });
  });
  return [...best.entries()].map(([t, e]) => {
    const df = ix.post.get(t).length;
    /* in a third of all passages: it says nothing about which one */
    if (N >= 10 && df / N > 0.3) return null;
    return { word:e.word, score:Math.log(1 + (N - df + 0.5) / (df + 0.5)) * Math.min(3, e.count) };
  }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, n || 12).map(x => x.word).join(" ");
}
function search(ix, q, opts){
  opts = opts || {};
  const el = eligible(ix, q + " " + (opts.context || ""), opts);
  const ok = new Set(el.docs.map(d => d.id));
  const fixed = [];
  const fix = t => {
    if (ix.post.has(t)) return t;
    const n = nearTerm(ix, t);
    if (!n) return t;
    if (!fixed.some(f => f[0] === t)) fixed.push([t, n]);
    return n;
  };
  let pool = 0;
  ix.chunks.forEach(c => { if (ok.has(c.doc)) pool++; });
  const common = t => {
    const p = ix.post.get(t);
    if (!p || pool < 4) return false;
    let n = 0;
    for (const [i] of p) if (ok.has(ix.chunks[i].doc)) n++;
    return n / pool > 0.5;
  };
  const qt = queryTerms(q, 1, fix, common);
  if (opts.context){
    const ct = queryTerms(opts.context, 0.45, fix, common);
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
    const rule = 1 + RULE_WEIGHT * (ix.rule[i] || 0);
    return { i:i, chunk:c, score:s * (boost.has(c.doc) ? 1.5 : 1) * quality * rule, coverage:cov, matched:[...got] };
  }).sort((a, b) => b.score - a.score);
  const top = ranked.length ? ranked[0].score : 0;
  /* a question made of the words of what it is about (a vague one, with
     the words of its picture or of the conversation added) covers less of
     them in any one passage: it says so with minCov */
  const minCov = opts.minCov != null ? opts.minCov : base.length >= 4 ? 0.25 : base.length ? 1 / base.length - 0.01 : 1;
  ranked = ranked.filter(r => r.score >= top * (opts.floor || 0.3) && r.coverage >= minCov);
  /* spread: no more than four from one document before the others get a turn */
  const k = opts.k || 6, per = new Map(), primary = [];
  for (const r of ranked){
    if (primary.length >= k) break;
    const n = per.get(r.chunk.doc) || 0;
    if (n >= 4 && ranked.some(x => x.chunk.doc !== r.chunk.doc && primary.indexOf(x) < 0 && (per.get(x.chunk.doc) || 0) < 4)) continue;
    per.set(r.chunk.doc, n + 1); primary.push(r);
  }
  return { hits:primary, eligible:el, candidates:ranked.length, terms:qt.base.length, fixed:fixed };
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
             lines:c.lines || [], heads:c.heads || [], chat:d.scope === "chat",
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
    if (p.chat) bits.push("ATTACHED IN THIS CONVERSATION");
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
/* ...and the same question with a word mistyped: "what does the stardard
   say", "the pasword polisy". One letter off only, so "selection" is never
   read as "section" and a troubleshooting question stays one. */
const DOC_WORDS = ("policy policies standard standards guideline guidelines guidance runbook runbooks procedure " +
  "procedures requirement requirements required mandatory compliance compliant vulnerability vulnerabilities " +
  "remediation remediate document documents documented deadline timeframe severity critical permitted prohibited " +
  "allowed appendix according").split(" ");
/* "policy" that is not a policy document: an insurance policy, named by
   its number or its holder - "search for the policy number and the life
   insured", "policy A018346A10 has no COI letter". Such a message is about
   a customer's policy and is no more a question about what a policy says
   than "the change number" is one about change management. */
const NOT_DOC = new RegExp("\\bpolic(?:y|ies)[ -]?(?:numbers?|nos?\\b\\.?|#|ids?|holders?|owners?|codes?|refs?|references?|records?|" +
  "premiums?|lapsed?|issued?|start|end|expiry|anniversar(?:y|ies)|year|values?|loans?|benefits?|details?|schedules?)\\b|" +
  "\\bpolicyholders?\\b|\\b(?:insurance|life|motor|health|medical|travel|customer'?s?|client'?s?|their|his|her) polic(?:y|ies)\\b|" +
  "\\bpolic(?:y|ies)\\s+(?=[A-Z]{0,4}\\d[A-Z0-9-]{4,}\\b)", "gi");
function isDocQuestion(q){
  const s = String(q || "").replace(NOT_DOC, " ");
  if (DOC_Q.test(s)) return true;
  return words(s).some(w => w.length >= 6 && !/\d/.test(w) && !NOT_TYPOS.has(w) &&
    DOC_WORDS.some(d => d[0] === w[0] && d !== w && editWithin(w, d, 1) <= 1));
}

/* a follow-up leans on the last question: "how about low severity?",
   "and in UAT?", "what does the previous section say?" */
function followUp(q, prev){
  const s = String(q || "").trim().toLowerCase();
  if (!prev || !prev.query) return { follow:false };
  const n = s.split(/\s+/).filter(Boolean).length;
  const ana = /\b(that|this|those|these|same|above|previous|prior|preceding|next|following|it|its|there)\b/.test(s) &&
              /\b(polic(y|ies)|standard|guideline|document|doc|section|runbook|procedure|table|page|part|clause|one|rule|it)\b/.test(s);
  const lead = /^(and|also|what about|how about|and for|for|same for|what if|then|so|but)\b/.test(s);
  /* "what do you mean by step two?", "explain step 3", "more detail on
     that" - about the answer just given (5.16) */
  const more = /\bstep\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b|\bwhat (do|did) you mean\b|\bexplain\b|\bmore detail|\belaborate\b|\bwhich (sql|query|script|one)\b/.test(s);
  const follow = ana || lead || more || n <= 5;
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
/* the number and its unit both in the passage, but not side by side - how a
   PDF reader can hand back a table, a column at a time ("7 14 30" on one
   line, "days days days" on the next). Accepted, never at full confidence. */
const UNIT_WORDS = { minute:/\b(min|mins|minutes?)\b/, hour:/\b(h|hr|hrs|hours?)\b/, day:/\bdays?\b/, week:/\b(wks?|weeks?)\b/,
                     month:/\bmonths?\b/, year:/\b(yrs?|years?)\b/, percent:/%|\bper ?cent\b/ };
function hasFigureLoose(text, f){
  const m = /^(\d+(?:\.\d+)?) (\w+)$/.exec(f.key);
  if (!m || !UNIT_WORDS[m[2]]) return false;
  const t = " " + norm(text) + " ";
  return t.indexOf(" " + m[1] + " ") >= 0 && UNIT_WORDS[m[2]].test(String(text).toLowerCase());
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

/* ── taking out only what cannot be shown ─────────────────────────────────
   An answer is sentences, list items and table rows. When one of them
   states a figure that no passage it cites contains, that one is taken out
   - not the whole answer. A password standard answered correctly for user
   accounts, with one line about administrators' passwords that cited
   nothing for its "30 days", used to be held back whole and replaced by
   "the documents do not specify this" - when they plainly did. Now the
   line goes, the rest is shown with its sources, and the answer says a
   line was taken out. The figure itself is never shown.

   A heading or an introduction ("For local administrators:") left with
   nothing under it goes too, and so does a table left with no rows. */
const ABBR = /(?:^|[\s(])(?:e\.g|i\.e|etc|vs|approx|incl|no|nos|rev|fig|sec|para|ref|min|max|cf|al|mr|mrs|ms|dr|st)\.$/i;
function sentencesOf(s){
  const out = [];
  const re = /([.!?])(["”’')\]*_]*)(\s+)(?=["“‘'(\[*_]*[\p{Lu}\d])/gu;
  let from = 0, m;
  while ((m = re.exec(s))){
    const end = m.index + m[1].length + m[2].length;
    const head = s.slice(from, m.index + 1);
    /* "e.g. Sunny", "Rev. 5", "J. Smith" are not the end of a sentence */
    if (m[1] === "." && (ABBR.test(head) || /(?:^|\s)\p{Lu}\.$/u.test(head))) continue;
    out.push(s.slice(from, end)); from = end + m[3].length;
  }
  out.push(s.slice(from));
  return out.filter(x => x.trim());
}
function trimSay(say, badKeys){
  const hit = t => figures(t).some(f => badKeys.indexOf(f.key) >= 0);
  const src = String(say || "").replace(/\r\n?/g, "\n").split("\n");
  /* each line: its text now ("" when taken out) and whether it was cut */
  const rows = src.map(t => ({ t:t, was:t, gone:false }));
  let removed = 0;
  for (let i = 0; i < rows.length; i++){
    const r = rows[i];
    /* a fenced block - code, or text to copy - is one piece */
    const fm = /^\s*(```|~~~)/.exec(r.t);
    if (fm){
      let j = i + 1;
      while (j < rows.length && !new RegExp("^\\s*" + fm[1]).test(rows[j].t)) j++;
      j = Math.min(j, rows.length - 1);
      if (hit(rows.slice(i, j + 1).map(x => x.t).join("\n"))){
        for (let k = i; k <= j; k++){ rows[k].t = ""; rows[k].gone = true; }
        removed++;
      }
      i = j;
      continue;
    }
    if (!hit(r.t)) continue;
    /* a table row or a heading: the whole line */
    if (/^\s*\|/.test(r.t) || /^\s*#/.test(r.t)){ r.t = ""; r.gone = true; removed++; continue; }
    const lead = (/^\s*(?:(?:[-*+•]|\d+[.)])\s+|>\s*)*/.exec(r.t) || [""])[0];
    const parts = sentencesOf(r.t.slice(lead.length));
    const keep = parts.filter(p => !hit(p));
    const rest = keep.join(" ").trim();
    if (keep.length === parts.length || !/[\p{L}\p{N}]/u.test(rest)){ r.t = ""; r.gone = true; removed += Math.max(1, parts.length - keep.length); continue; }
    removed += parts.length - keep.length;
    r.t = lead + rest;
  }
  if (!removed) return { say:String(say || ""), removed:0 };
  const blank = r => !r.gone && !r.t.trim();
  const listy = t => /^\s*(?:[-*+•]|\d+[.)])\s+|^\s*\||^\s{2,}\S/.test(t);
  /* an introduction whose list or table was all taken out */
  rows.forEach((r, i) => {
    if (r.gone || !/:\**\s*$/.test(r.t.trim())) return;
    let j = i + 1, under = 0, left = 0;
    while (j < rows.length && (blank(rows[j]) || rows[j].gone || listy(rows[j].was))){
      if (listy(rows[j].was)){ under++; if (!rows[j].gone) left++; }
      j++;
    }
    if (under && !left){ r.t = ""; r.gone = true; }
  });
  /* a heading whose section was all taken out */
  rows.forEach((r, i) => {
    const hm = /^\s*(#{1,6})\s/.exec(r.t);
    if (r.gone || !hm) return;
    let j = i + 1, under = 0, left = 0;
    while (j < rows.length){
      const h2 = /^\s*(#{1,6})\s/.exec(rows[j].was);
      if (h2 && h2[1].length <= hm[1].length) break;
      if (rows[j].was.trim()){ under++; if (!rows[j].gone) left++; }
      j++;
    }
    if (under && !left){ r.t = ""; r.gone = true; }
  });
  /* a table left with its header and no rows */
  for (let i = 0; i < rows.length; i++){
    if (!/^\s*\|/.test(rows[i].t)) continue;
    let j = i; const body = [];
    while (j < rows.length && (/^\s*\|/.test(rows[j].t) || (rows[j].gone && /^\s*\|/.test(rows[j].was)))){ body.push(j); j++; }
    const live = body.filter(k => !rows[k].gone && !/^\s*\|?\s*:?-{2,}/.test(rows[k].t));
    if (live.length <= 1 && body.some(k => rows[k].gone)) body.forEach(k => { rows[k].t = ""; rows[k].gone = true; });
    i = j;
  }
  const text = rows.filter(r => !r.gone).map(r => r.t).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { say:text, removed:removed };
}
/* enough left to be an answer: a few real words, not only "Sure!" */
function substantial(text){
  return (String(text || "").replace(/[#*_>|`~]/g, " ").match(/\p{L}{2,}/gu) || []).length >= 5;
}
/* reply: { say, cite:[{s, quote}], confidence, suggest }
   pack:  { passages, docQuestion }
   ->     { status, confidence, cites, unsupported, uncited, notes, and when
            lines were taken out: say (what is left), removed (how many) }

   status  grounded   every figure is in a passage it cites
           partial    some lines stated a figure no cited passage has; they
                      were taken out, and what is left is grounded
           not_found  the documents do not say it (and nothing is invented)
           blocked    the answer rested on a figure no cited passage has,
                      and nothing worth showing is left without it
           unsupported  no figure, but no passage it cites holds up either
           general    not an answer about the documents */
/* What the person said themselves, as statements - "add a credit, valid
   until exactly 5 years after the start date". A figure written there is
   theirs, not an invention. A figure in a question they asked ("is it 4
   hours?") is not: that is the very thing they want checked. */
const ASKING = /^\W*(?:is|are|was|were|does|do|did|can|could|should|would|will|must|may|what|how|when|which|who|whom|whose|why|where)\b/i;
function statedIn(q){
  return String(q || "").replace(/^\s*\[\w+\]\s*/, "").replace(/\r\n?/g, "\n").split(/\n+/)
    .map(l => sentencesOf(l).filter(x => !/\?\s*["”’')\]]*\s*$/.test(x) && !ASKING.test(x)).join(" "))
    .filter(x => x.trim()).join("\n");
}
/* own: what else the person wrote that the reply may lean on - the
   runbooks of their own that matched the question: [{ from:"runbook",
   name, text }]. Their runbooks are their procedures; a figure in one is
   not an invention either. It is never taken for what a document says:
   such an answer is marked as coming from the runbook, not the document. */
function ground(reply, pack, question, own){
  const P = (pack && pack.passages) || [];
  const say = String((reply && reply.say) || "");
  const raw = Array.isArray(reply && reply.cite) ? reply.cite : [];
  const conf = String((reply && reply.confidence) || "").toLowerCase().replace(/[^a-z_]/g, "");
  const docMode = !!(pack && pack.docQuestion) || raw.length > 0 || /^(high|medium|not_?found|low)$/.test(conf);
  const res = { status:"general", confidence:"", cites:[], unsupported:[], uncited:[], loose:[], notes:[], removed:0, own:[] };
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
  /* their own words: their runbooks always; what they wrote in this very
     message only when the reply cites no document - a figure typed into a
     question about a standard is not evidence of what the standard says */
  const mine = (own || []).filter(o => o && o.text).map(o => ({ from:o.from || "runbook", name:o.name || "", text:String(o.text) }));
  if (!good.length){ const st = statedIn(question); if (st) mine.unshift({ from:"message", name:"", text:st }); }
  const badKeys = [];
  figures(say).forEach(f => {
    if (notFound && qFig.indexOf(f.key) >= 0) return;         /* "the standard does not say 4 hours" */
    if (good.some(c => hasFigure(c.text, f))) return;
    if (good.some(c => hasFigureLoose(c.text, f))){ res.loose.push(f.text); return; }
    const theirs = mine.find(o => hasFigure(o.text, f));
    if (theirs){ if (!res.own.some(o => o.figure === f.text)) res.own.push({ figure:f.text, from:theirs.from, name:theirs.name }); return; }
    /* written in a passage the answer did not cite - an incident target
       sitting next to a vulnerability question is not support for it */
    const other = P.filter(p => hasFigure(p.text, f));
    if (other.length) res.uncited.push({ figure:f.text, in:other.map(p => p.s),
      /* the line it is on, so the app can point at it */
      at:other.map(p => ({ s:p.s, line:String(p.text).split("\n").find(l => hasFigure(l, f)) || "" })) });
    res.unsupported.push(f.text);
    badKeys.push(f.key);
  });
  if (res.unsupported.length){
    /* take out the lines that state them, and see what is left */
    const t = trimSay(say, badKeys);
    if (t.removed && substantial(t.say)){
      res.say = t.say; res.removed = t.removed;
      res.notes.push(t.removed + " line(s) taken out for a figure no cited passage states");
      if (/^not_?found$/.test(conf) || (!good.length && unverifiable(t.say))){
        res.status = "not_found"; res.confidence = "not_found"; return res;
      }
      if (good.length){
        res.status = "partial"; res.confidence = "medium";
        if (res.loose.length) res.notes.push("a figure is in the cited passage, but not next to its unit - a table read column by column");
        return res;
      }
      /* what is left rests on their own runbook or their own words */
      if (res.own.length){ res.status = "own"; res.confidence = "own"; return res; }
    }
    res.status = "blocked"; res.confidence = "not_found"; return res;
  }
  if (notFound){ res.status = "not_found"; res.confidence = "not_found"; return res; }
  /* from their runbook, or from what they wrote: not a document's word,
     and not an invention either */
  if (!good.length && res.own.length){ res.status = "own"; res.confidence = "own"; return res; }
  if (!good.length){ res.status = "unsupported"; res.confidence = "not_found"; return res; }
  res.status = "grounded";
  const lowOnly = good.every(c => c.quality === "low");
  res.confidence = conf === "high" && !lowOnly && !res.loose.length && !res.own.length ? "high" : "medium";
  if (res.own.length) res.notes.push("a figure is from their runbook, not from the cited passage: " + res.own.map(o => o.figure).join(", "));
  if (res.loose.length) res.notes.push("a figure is in the cited passage, but not next to its unit - a table read column by column");
  if (lowOnly) res.notes.push("every cited passage is from a page that could not be read reliably");
  return res;
}

/* A draft runbook, note or profile written from a document: the figures in
   it that the document does not state anywhere. Shown on the draft before
   it is saved - a draft is where an invented figure would stay. */
function unsupportedIn(text, sourceTexts){
  const all = (sourceTexts || []).join("\n");
  return figures(text).filter(f => !hasFigure(all, f) && !hasFigureLoose(all, f)).map(f => f.text);
}

/* ── one line of diagnostics, with no document text in it ──────────────── */
function diagnose(q, found, packed, g){
  return {
    at: new Date().toISOString(),
    words: (found && found.terms) || 0,
    /* a mistyped word read as the one the documents use: ["stardard", "standard"] */
    typos: (found && found.fixed) || [],
    searched: found ? found.eligible.docs.length : 0,
    filters: found ? found.eligible.filters : {},
    candidates: found ? found.candidates : 0,
    retrieved: ((packed && packed.passages) || []).map(p => ({ s:p.s, chunk:p.id, doc:p.name, version:p.version || "",
      page:p.page || 0, lines:p.lineStart ? p.lineStart + "-" + p.lineEnd : "", score:p.score, role:p.role })),
    cited: g ? g.cites.map(c => ({ chunk:c.id, verified:c.verified, citation:c.citation })) : [],
    status: g ? g.status : "",
    unsupported: g ? g.unsupported.length : 0,
    removed: g ? g.removed || 0 : 0,
    noEvidence: !((packed && packed.passages) || []).length
  };
}

/* ── names in an answer, and whether they were ever given ─────────────────
   A support answer goes wrong most quietly in its names: a stored
   procedure, a table, a script that sounds right and does not exist. The
   figures check (ground) cannot see those. namesIn() picks out the specific
   names an answer writes - the ones a person would type or run - and
   unknownNames() returns the ones found nowhere in what the model was
   given: their documents, scripts, runbooks, workspace and their own words.
   The app shows those under the answer as possibly made up. Nothing is
   taken out: a name can be right and simply new to KalKech (5.15). */
const NAME_SKIP = new Set(("select from where join update insert into delete exec execute set declare begin end case when then " +
  "else null not and or order group by having top distinct values as on inner left right outer cross union all with nolock " +
  "getdate dateadd datediff count sum max min avg cast convert isnull coalesce len ltrim rtrim upper lower dbo sys tempdb " +
  "master true false table procedure proc function view index exists if return go use print raiserror throw try catch " +
  "transaction commit rollback output inserted deleted object_id newid sysdatetime getutcdate").split(" "));
const SCRIPT_FILE = /\.(?:sql|ps1|psm1|bat|cmd|py|sh|vbs)$/i;
function nameClean(t){ return String(t || "").replace(/^[\[\]"'`(<{*]+|[\[\]"'`)>},;:!?*]+$/g, "").replace(/\.$/, ""); }
/* a word that is a specific name: a script file, an underscore name, a
   schema.object, CamelCase with two or more humps, or a usp_/tbl-style
   prefix - not a keyword, a variable, a number, a switch or a command */
function looksLikeName(w){
  const t = nameClean(w);
  if (t.length < 4 || t.length > 80 || /\s/.test(t)) return "";
  if (/^[@#$\-\/\\\d]/.test(t) || /^https?:/i.test(t) || /[<>]/.test(t)) return "";
  if (NAME_SKIP.has(t.toLowerCase())) return "";
  if (/^[A-Z][a-z]+-[A-Z][A-Za-z]+$/.test(t)) return "";            /* Get-Service: a command */
  if (SCRIPT_FILE.test(t)) return t;
  if (/^[A-Za-z]\w*_\w*[A-Za-z0-9]$/.test(t) && /[A-Za-z]{2}/.test(t)) return t;
  if (/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+$/.test(t) && !/\.(?:com|net|org|html?|json|xml|txt|md|pdf|docx?|xlsx?|csv|log|config|exe|dll)$/i.test(t)) return t;
  if (/[a-z][A-Z].*[a-z][A-Z]/.test(t) && /^[A-Za-z]\w*$/.test(t)) return t;
  if (/^(?:usp|sp|fn|udf|tbl|vw)[A-Z_]\w+$/.test(t)) return t;
  return "";
}
function namesIn(say){
  const s = String(say || "");
  const out = new Map();
  const add = (w, loose) => {
    let n = looksLikeName(w);
    /* what a query reads or runs is a name even as one plain word */
    if (!n && loose){
      const t = nameClean(w).replace(/[\[\]]/g, "");
      if (t.length >= 4 && /^[A-Za-z_][\w.]*$/.test(t) && !NAME_SKIP.has(t.toLowerCase()) && !/^#/.test(t)) n = t;
    }
    if (n && !out.has(n.toLowerCase())) out.set(n.toLowerCase(), n.replace(/[\[\]]/g, ""));
  };
  const blocks = s.match(/(~~~|```)[^\n]*\n[\s\S]*?\n\1/g) || [];
  blocks.forEach(b => {
    /* code only: an email, a message, a note or a diagram is not a query,
       and its "From John" is not a table */
    const lang = (/^(?:~~~|```)\s*([\w-]*)/.exec(b) || [])[1].toLowerCase();
    if (/^(?:email|mail|message|msg|note|text|txt|teams|chat|mermaid|diagram|flowchart|markdown|md)$/.test(lang)) return;
    const body = b.replace(/^[^\n]*\n/, "");
    const re = /\b(?:EXEC(?:UTE)?|FROM|JOIN|UPDATE|INTO|TABLE|PROC(?:EDURE)?)\s+(\[?[A-Za-z_#][\w]*\]?(?:\.\[?[A-Za-z_][\w]*\]?)*)/gi;
    let m;
    while ((m = re.exec(body))) add(m[1], true);
    (body.match(/[\w.-]+\.(?:sql|ps1|psm1|bat|cmd|py|sh|vbs)\b/gi) || []).forEach(w => add(w));
  });
  let prose = blocks.reduce((x, b) => x.split(b).join(" "), s);
  (prose.match(/`[^`\n]{2,160}`/g) || []).forEach(m => m.slice(1, -1).split(/[\s,;()=]+/).forEach(w => add(w)));
  prose = prose.replace(/`[^`\n]*`/g, " ").replace(/\]\([^)]*\)/g, "]").replace(/https?:\/\/\S+/g, " ");
  (prose.match(/[A-Za-z][\w.-]*\w/g) || []).forEach(w => {
    if (/_/.test(w) || SCRIPT_FILE.test(w) || /[a-z][A-Z].*[a-z][A-Z]/.test(w)) add(w);
  });
  return [...out.values()];
}
/* the names no part of what the model was given contains - compared
   without case, brackets or quotes; a schema-qualified name counts when
   its last part is there */
function unknownNames(say, evidence){
  const ev = String(evidence || "").toLowerCase().replace(/[\[\]"'`]/g, "");
  return namesIn(say).filter(n => {
    const k = n.toLowerCase();
    if (ev.indexOf(k) >= 0) return false;
    const last = k.split(".").pop();
    if (k.indexOf(".") > 0 && !SCRIPT_FILE.test(k) && last.length >= 4 && ev.indexOf(last) >= 0) return false;
    /* a script named without its extension, or with spaces for underscores */
    const base = k.replace(SCRIPT_FILE, "");
    if (base !== k && ev.indexOf(base) >= 0) return false;
    if (/_/.test(k) && ev.indexOf(k.replace(/_/g, " ")) >= 0) return false;
    return true;
  });
}

/* ── where a block of code came from (5.16) ──────────────────────────────
   "Run the SQL" and then a query nobody wrote: the model filled a gap with
   a query of its own, and nothing on the screen said so. Every code block
   in an answer is now compared with what it was given - the passages of
   their documents, their scripts, their runbooks, their own words - and
   labelled with where it came from, or as written by the assistant.
   Compared as runs of four tokens after the values are taken out (strings,
   numbers, dates, {{param}}, @var, <placeholder>), so the guideline's query
   with September filled in for August, laid out on other lines, is still
   the guideline's query. */
const CODE_TEXT_KINDS = /^(?:email|mail|message|msg|note|text|txt|teams|chat|mermaid|diagram|flowchart|markdown|md)$/;
function codeBlocks(say){
  const out = [], re = /(~~~|```)([^\n]*)\n([\s\S]*?)\n\1/g;
  let m;
  while ((m = re.exec(String(say || "")))){
    const lang = (m[2].trim().split(/\s+/)[0] || "").toLowerCase();
    if (CODE_TEXT_KINDS.test(lang)) continue;
    out.push({ lang:lang, body:m[3].replace(/\s+$/, "") });
  }
  return out;
}
function codeTokens(text){
  return String(text || "").toLowerCase()
    .replace(/\{\{[^}\n]*\}\}|<[^<>\n]{1,40}>|@\w+|'[^'\n]*'|"[^"\n]*"|\b\d+(?:[.:\/-]\d+)*\b/g, " ? ")
    .match(/[a-z_][\w.$#]*|\?|[^\s\w]/g) || [];
}
function codeShingles(tokens, k){
  const out = new Set();
  if (tokens.length < k){ if (tokens.length) out.add(tokens.join(" ")); return out; }
  for (let i = 0; i + k <= tokens.length; i++) out.add(tokens.slice(i, i + k).join(" "));
  return out;
}
/* sources: [{kind, name, text}] - the best one that holds most of the
   block (60% of its runs of four), or null: written by the assistant */
function codeOrigin(body, sources){
  const bt = codeTokens(body);
  if (bt.length < 3) return null;
  const mine = codeShingles(bt, 4);
  let best = null;
  (sources || []).forEach(s => {
    if (!s || !s.text) return;
    const st = codeTokens(s.text);
    const theirs = codeShingles(st, 4);
    let hit = 0;
    if (bt.length < 4){ if (st.join(" ").indexOf(bt.join(" ")) >= 0) hit = mine.size; }
    else mine.forEach(x => { if (theirs.has(x)) hit++; });
    const share = hit / (mine.size || 1);
    if (share >= 0.6 && (!best || share > best.share)) best = { kind:s.kind, name:s.name || "", share:Math.round(share * 100) / 100 };
  });
  return best;
}
/* the same key for a block on both sides: here, and where the app draws it */
function codeKey(body){ return hash36(String(body || "").replace(/\s+/g, " ").trim()); }

const API = {
  VERSION: VERSION, ALGO: ALGO, BUDGET: BUDGET,
  stem: stem, terms: terms, norm: norm, hash36: hash36,
  readLines: readLines, chunkDocument: chunkDocument, detectMeta: detectMeta, parseDate: parseDate,
  familyKey: familyKey, cmpVersion: cmpVersion, currentOf: currentOf, textQuality: textQuality,
  prepare: prepare, diffChunks: diffChunks, envsIn: envsIn,
  createIndex: createIndex, eligible: eligible, search: search, gather: gather, packText: packText, keyTerms: keyTerms,
  locate: locate, citation: citation, lastHead: lastHead,
  isDocQuestion: isDocQuestion, followUp: followUp, beside: beside,
  figures: figures, ground: ground, diagnose: diagnose, unsupportedIn: unsupportedIn,
  trimSay: trimSay, sentencesOf: sentencesOf, statedIn: statedIn,
  nameFor: nameFor, weakTitle: weakTitle, plainTitle: plainTitle, betterName: betterName,
  namesIn: namesIn, unknownNames: unknownNames, inScope: inScope,
  codeBlocks: codeBlocks, codeOrigin: codeOrigin, codeKey: codeKey
};
if (typeof module === "object" && module.exports) module.exports = API;
if (root) root.DossierSources = API;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);
