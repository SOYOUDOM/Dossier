// node --test tests/
//
// Answering from documents (sources.js): passages, search, citations, and
// the check that keeps an invented figure from being shown as a document's.
// Every scenario the grounding work was asked to cover is here, by name,
// plus the failure that started it: a standard with no remediation
// timeframe answered with "4 hours".
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const S = require("../sources.js");

const FIX = path.join(__dirname, "fixtures");
const read = f => fs.readFileSync(path.join(FIX, f), "utf8");

/* a small library, the way the app builds one: prepare each document, index them all */
function library(list, opts){
  const docs = [], chunks = [], issues = {};
  list.forEach((x, i) => {
    const kind = /\.pdf\.txt$/.test(x.file) ? "pdf" : "md";
    const r = S.prepare(Object.assign({ id:"doc" + (i + 1), file:x.file.replace(/\.txt$/, ""), kind:kind,
      text:x.text || read(x.file), pages:x.pages || 0 }, x.meta || {}));
    docs.push(r.doc); chunks.push(...r.chunks); issues[r.doc.id] = r.issues;
  });
  const ix = S.createIndex(docs, chunks);
  return { ix, docs, chunks, issues, opts:opts || {} };
}
/* search, gather and pack - what the app sends with a question */
function ask(lib, q, extra){
  const o = Object.assign({ today:"2026-09-30" }, lib.opts, extra || {});
  const found = S.search(lib.ix, q, o);
  const got = S.gather(lib.ix, found, o);
  const pack = { passages:got.passages, searched:found.eligible.docs.length, unproven:found.eligible.unproven,
                 docQuestion:S.isDocQuestion(q) };
  pack.text = S.packText(pack);
  return { found, pack };
}
const names = pack => [...new Set(pack.passages.map(p => p.name + (p.version ? " v" + p.version : "")))];
const withText = (pack, re) => pack.passages.filter(p => re.test(p.text));

const Q_4H = "In the policy and standard, how long would it take to fix the critical internet-facing application?";
const A_4H = "The provided policy and standard do not specify a resolution timeframe for a critical internet-facing application.";

/* ── regression: the failure this work began with ──────────────────────── */
test("regression: no timeframe in the source is not answered with 4 hours", () => {
  const lib = library([
    { file:"application-security-standard-v1.md", meta:{ name:"Application Security Standard" } },
    { file:"runbook-portal-restart.md" }
  ]);
  const { pack } = ask(lib, Q_4H);
  assert.ok(pack.passages.length, "the standard is searched");
  assert.ok(!/4 hours/.test(pack.text), "nothing searched says 4 hours");
  assert.ok(pack.docQuestion, "a question about a standard is held to the documents");

  /* the model that invented it: blocked, and the value is never shown */
  const bad = S.ground({ say:"Per the standard, a critical internet-facing application must be fixed within 4 hours.",
                         cite:[{ s:pack.passages[0].s, quote:"Vulnerabilities must be remediated" }], confidence:"high" }, pack, Q_4H);
  assert.equal(bad.status, "blocked");
  assert.deepEqual(bad.unsupported, ["4 hours"]);
  /* ...and with no citation at all */
  const bare = S.ground({ say:"It should be resolved within 4 hours." }, pack, Q_4H);
  assert.equal(bare.status, "blocked");

  /* the model that follows the rules: the expected answer, as not found */
  const good = S.ground({ say:A_4H, confidence:"not_found" }, pack, Q_4H);
  assert.equal(good.status, "not_found");
  assert.ok(!/4 hours/.test(A_4H));
});

test("regression: the prompt teaches the not-found answer and forbids carrying a P1 target across", () => {
  const prompt = fs.readFileSync(path.join(__dirname, "..", "flow", "prompt.txt"), "utf8");
  assert.ok(prompt.includes(A_4H), "the exact expected sentence is an example");
  assert.ok(prompt.includes(Q_4H), "the exact failing question is an example");
  assert.match(prompt, /a P1 incident target is not a vulnerability timeframe/);
  assert.match(prompt, /\{sources\}/);
  assert.match(prompt, /never quote them as what any policy, standard or SLA document says/);
});

/* ── 1. the answer is explicitly in one document ───────────────────────── */
test("an answer stated in one document: found, cited to its lines and section, high confidence", () => {
  const lib = library([
    { file:"application-security-standard-v2.md", meta:{ name:"Application Security Standard" } },
    { file:"incident-management-guideline.md" }
  ]);
  const q = "How long do we have to fix a critical vulnerability in an internet-facing application?";
  const { pack } = ask(lib, q);
  const table = withText(pack, /\| Critical \| 7 days \| 14 days \|/)[0];
  assert.ok(table, "the timeframe table is among the passages");
  const g = S.ground({ say:"7 days from confirmation.", cite:[{ s:table.s, quote:"| Critical | 7 days | 14 days |" }], confidence:"high" }, pack, q);
  assert.equal(g.status, "grounded");
  assert.equal(g.confidence, "high");
  const line = read("application-security-standard-v2.md").split("\n").indexOf("| Critical | 7 days | 14 days |") + 1;
  assert.equal(g.cites[0].citation,
    '[Source: application-security-standard-v2.md, version 2.0, line ' + line + ', section "3.3 Remediation Timeframe"]');
});

/* ── 2. the answer needs more than one passage ─────────────────────────── */
test("an answer that needs several passages: all of them are retrieved", () => {
  const change = "# Change Management Standard\n\nVersion: 2.2\n\n## 1. Scope\n\nAll production changes.\n\n" +
    "## 2. Emergency Change Approval\n\nAn emergency change must be approved by the CAB chair before it is implemented.\n\n" +
    "## 3. Standard Changes\n\nStandard changes are pre-approved and follow the catalogue.\n\n" +
    "## 4. Normal Changes\n\nNormal changes go to the weekly CAB.\n\n" +
    "## 5. Post-Implementation Review\n\nEvery emergency change must be reviewed within 2 business days after it is implemented.\n";
  const lib = library([{ file:"change-management-standard.md", text:change }, { file:"patching-standard.md" }]);
  const q = "What approval and review does an emergency change need?";
  const { pack } = ask(lib, q);
  assert.ok(withText(pack, /approved by the CAB chair/).length, "the approval section");
  assert.ok(withText(pack, /reviewed within 2 business days/).length, "the review section");
  const a = withText(pack, /approved by the CAB chair/)[0], b = withText(pack, /reviewed within 2 business days/)[0];
  assert.notEqual(a.id, b.id, "two different passages");
  const g = S.ground({ say:"The CAB chair approves it first, and it is reviewed within 2 business days.",
    cite:[{ s:a.s, quote:"must be approved by the CAB chair" }, { s:b.s, quote:"reviewed within 2 business days after it is implemented" }],
    confidence:"medium" }, pack, q);
  assert.equal(g.status, "grounded");
  assert.equal(g.cites.length, 2);
});

/* ── 3 and 4. no answer in the documents; never invent one ────────────── */
test("no answer in the documents: not found, and an invented figure is blocked", () => {
  const lib = library([{ file:"application-security-standard-v1.md", meta:{ name:"Application Security Standard" } }]);
  const q = "What is the deadline to patch a high severity vulnerability?";
  const { pack } = ask(lib, q);
  assert.equal(S.ground({ say:"The standard does not specify a deadline for high severity vulnerabilities.", confidence:"not_found" }, pack, q).status, "not_found");
  const g = S.ground({ say:"High severity vulnerabilities must be patched within 30 days.", confidence:"medium",
                       cite:[{ s:pack.passages[0].s, quote:"Vulnerabilities are classified by their CVSS base score." }] }, pack, q);
  assert.equal(g.status, "blocked");
  assert.deepEqual(g.unsupported, ["30 days"]);
  /* a quote that is not in the passage it cites does not count */
  const fake = S.ground({ say:"It says to remediate promptly.", confidence:"high",
                          cite:[{ s:pack.passages[0].s, quote:"remediate promptly within the agreed window" }] }, pack, q);
  assert.notEqual(fake.status, "grounded");
});

test("a figure that sits in a passage the answer did not cite is not support for it", () => {
  const lib = library([
    { file:"application-security-standard-v1.md", meta:{ name:"Application Security Standard" } },
    { file:"incident-management-guideline.md" }
  ]);
  const { pack } = ask(lib, Q_4H);
  assert.ok(withText(pack, /4 hours/).length, "the incident targets were searched too");
  const std = pack.passages.find(p => /remediated by the application owner/.test(p.text));
  const g = S.ground({ say:"Critical issues are fixed within 4 hours.", confidence:"high",
                       cite:[{ s:std.s, quote:"Vulnerabilities must be remediated by the application owner." }] }, pack, Q_4H);
  assert.equal(g.status, "blocked");
  assert.equal(g.uncited.length, 1, "diagnostics say where the figure really was");
});

/* ── 5. two documents disagree ─────────────────────────────────────────── */
test("conflicting documents: both are retrieved, and an answer citing both is grounded", () => {
  const lib = library([
    { file:"application-security-standard-v2.md", meta:{ name:"Application Security Standard" } },
    { file:"patching-standard.md" }
  ]);
  const q = "How quickly must critical vulnerabilities on internet-facing systems be fixed?";
  const { pack } = ask(lib, q);
  const a = withText(pack, /\| Critical \| 7 days/)[0], b = withText(pack, /within 3 days/)[0];
  assert.ok(a && b, "both documents' passages: " + names(pack).join(", "));
  const g = S.ground({ say:"The two documents differ: 7 days in one, 3 days in the other.", confidence:"high",
    cite:[{ s:a.s, quote:"| Critical | 7 days | 14 days |" },
          { s:b.s, quote:"must be applied within 3 days" }] }, pack, q);
  assert.equal(g.status, "grounded");
  assert.deepEqual(g.cites.map(c => c.name).sort(), ["Application Security Standard", "Server Patching Standard"]);
});

/* ── 6. a newer version replaces an older one ──────────────────────────── */
test("versions: a superseded version is not searched; active versions resolve by their own metadata", () => {
  const q = "How long to fix a critical vulnerability in an internet-facing application?";
  const v1 = { file:"application-security-standard-v1.md", meta:{ name:"Application Security Standard" } };
  const v2 = { file:"application-security-standard-v2.md", meta:{ name:"Application Security Standard" } };
  assert.equal(S.familyKey("Application Security Standard v1.0"), S.familyKey("Application Security Standard (v2.0).pdf"));

  const replaced = library([{ ...v1, meta:{ ...v1.meta, status:"superseded" } }, v2]);
  assert.deepEqual(names(ask(replaced, q).pack), ["Application Security Standard v2.0"]);

  /* both left active: the effective dates prove which is current */
  const both = library([v1, v2]);
  assert.deepEqual(names(ask(both, q).pack), ["Application Security Standard v2.0"]);

  /* nothing proves it: both are searched, and the prompt is told */
  const unproven = library([
    { file:"appsec-a.md", meta:{ name:"Application Security Standard" }, text:read(v1.file).replace(/Version: .*\n|Effective date: .*\n/g, "") },
    { file:"appsec-b.md", meta:{ name:"Application Security Standard" }, text:read(v2.file).replace(/Version: .*\n|Effective date: .*\n/g, "") }
  ]);
  const up = ask(unproven, q);
  assert.equal(new Set(up.pack.passages.map(p => p.doc)).size, 2);
  assert.match(up.pack.text, /More than one version is active/);

  /* the one uploaded last is not current because it came last */
  const cur = S.currentOf([{ id:"a", status:"active", version:"3.0", effective:"2026-01-01" },
                           { id:"b", status:"active", version:"2.9", effective:"2025-06-01" }], "2026-09-30");
  assert.equal(cur.current[0].id, "a");

  /* asked for by version, an older one can still be read */
  const byVer = ask(replaced, "What did version 1.0 of the Application Security Standard say about remediation?");
  assert.deepEqual(names(byVer.pack), ["Application Security Standard v1.0"]);
});

/* ── 7. a document switched off is never used ─────────────────────────── */
test("an inactive document is not searched, counted or named", () => {
  const lib = library([
    { file:"legacy-backup-procedure.md", meta:{ status:"inactive" } },
    { file:"patching-standard.md" }
  ]);
  const { found, pack } = ask(lib, "How long are nightly backups kept?");
  assert.equal(withText(pack, /400 days/).length, 0);
  assert.equal(found.eligible.docs.length, 1);
  assert.ok(!/Legacy Backup/.test(pack.text));
});

/* ── 8. a follow-up in the same conversation ──────────────────────────── */
test("follow-ups: 'how about low severity?' and 'the previous section' are answered from the documents again", () => {
  const lib = library([{ file:"application-security-standard-v2.md", meta:{ name:"Application Security Standard" } },
                       { file:"incident-management-guideline.md" }]);
  const q1 = "How long to fix a critical vulnerability in an internet-facing application?";
  const first = ask(lib, q1);
  const prev = { query:q1, docs:[...new Set(first.pack.passages.map(p => p.doc))],
                 chunks:withText(first.pack, /\| Critical \| 7 days/).map(p => p.id) };
  const f = S.followUp("how about low severity?", prev);
  assert.ok(f.follow);
  const second = ask(lib, "how about low severity?", { context:f.context, boostDocs:f.boostDocs });
  assert.ok(withText(second.pack, /\| Low \| 180 days/).length, "the same table, found again");

  const f2 = S.followUp("what does the previous section say?", prev);
  assert.equal(f2.dir, "prev");
  const extra = S.beside(lib.ix, prev.chunks, "prev");
  assert.ok(extra.length);
  const before = lib.ix.chunks[extra[0]];
  assert.notEqual(before.section, lib.ix.chunks[lib.ix.byId.get(prev.chunks[0])].section);

  /* a new question is not a follow-up */
  assert.equal(S.followUp("Which servers are in the Portal cluster and who owns the database backups?", prev).follow, false);
});

/* ── 9. a document the person may not read ────────────────────────────── */
test("access: a restricted document is filtered out before anything is scored, sent or named", () => {
  const list = [{ file:"security-incident-playbook.md", meta:{ label:"security-restricted" } },
                { file:"incident-management-guideline.md" }];
  const q = "How fast must an affected host be isolated during a security incident?";
  const denied = ask(library(list), q, { clearance:[] });
  assert.equal(withText(denied.pack, /15 minutes/).length, 0);
  assert.ok(!/Security Incident Playbook|isolate/i.test(denied.pack.text), "not named, not quoted");
  assert.equal(denied.found.eligible.docs.length, 1, "not even counted");
  const g = S.ground({ say:"Isolate it within 15 minutes.", confidence:"high" }, denied.pack, q);
  assert.equal(g.status, "blocked", "and cannot be answered from memory");

  const allowed = ask(library(list), q, { clearance:["security-restricted"] });
  assert.ok(withText(allowed.pack, /15 minutes/).length);

  /* a document kept on this PC: searched locally, never sent to the assistant */
  const local = library([{ file:"security-incident-playbook.md", meta:{ assistant:false } }]);
  assert.equal(ask(local, q, { purpose:"flow" }).pack.passages.length, 0);
  assert.ok(ask(local, q, { purpose:"local" }).pack.passages.length);
});

/* ── 10. a PDF page read badly ────────────────────────────────────────── */
test("poor extraction: the page is flagged, the passage says so, and it cannot carry full confidence", () => {
  const lib = library([{ file:"data-retention-standard.pdf.txt", pages:3, meta:{ name:"Data Retention Standard" } }]);
  assert.deepEqual(lib.issues.doc1.filter(i => !i.info).map(i => i.page), [3]);
  const q = "What does the disposal section of the data retention standard say?";
  const { pack } = ask(lib, q);
  const low = pack.passages.find(p => p.page === 3);
  assert.ok(low && low.quality === "low");
  assert.match(pack.text, /could not be read reliably/);
  const g = S.ground({ say:"Disposal after 30 days.", confidence:"high", cite:[{ s:low.s, quote:"30" }] }, pack, q);
  assert.notEqual(g.confidence, "high");
});

/* ── 11. citations point at the right page, section and lines ─────────── */
test("citations: PDF page and line on the page, Markdown file lines, and the heading over the quote", () => {
  const lib = library([{ file:"data-retention-standard.pdf.txt", pages:3, meta:{ name:"Data Retention Standard" } },
                       { file:"application-security-standard-v2.md", meta:{ name:"Application Security Standard" } }]);
  const q = "How long are system logs kept?";
  const { pack } = ask(lib, q);
  const p = withText(pack, /System logs are kept for 90 days/)[0];
  const g = S.ground({ say:"System logs are kept for 90 days.", confidence:"high",
                       cite:[{ s:p.s, quote:"System logs are kept for 90 days." }] }, pack, q);
  assert.equal(g.status, "grounded");
  assert.equal(g.cites[0].citation, '[Source: Data Retention Standard, version 3.2, page 2, line 3, section "2 Retention Periods"]');

  const q2 = "Who must approve an exception to the remediation timeframe?";
  const r2 = ask(lib, q2).pack;
  const e = withText(r2, /Chief Information/)[0];
  const g2 = S.ground({ say:"The CISO.", confidence:"high",
    cite:[{ s:e.s, quote:"An exception must be approved by the Chief Information Security Officer" }] }, r2, q2);
  const src = read("application-security-standard-v2.md").split("\n");
  const from = src.findIndex(l => l.startsWith("request an exception. An exception must be approved")) + 1;
  assert.equal(g2.cites[0].citation,
    '[Source: application-security-standard-v2.md, version 2.0, lines ' + from + "-" + (from + 1) + ', section "3.4 Exceptions"]');
});

/* ── 12. more than a hundred documents ─────────────────────────────────── */
test("scale: 150 documents are indexed and searched, and the right one comes first", () => {
  const list = [];
  for (let i = 1; i <= 150; i++){
    const n = String(i).padStart(3, "0");
    list.push({ file:"system-" + n + "-runbook.md", meta:{ systems:["SYS" + n] },
      text:"# System " + n + " runbook\n\nVersion: 1." + (i % 7) + "\n\n## Restart\n\nRestart the service SVC" + n +
           " on host HOST" + n + ", then check the health page.\n\n## Escalation\n\nEscalate to team T" + (i % 9) +
           " if it fails twice.\n\n## Backups\n\nBackups of SYS" + n + " are kept for " + (10 + i) + " days.\n" });
  }
  list.push({ file:"application-security-standard-v2.md", meta:{ name:"Application Security Standard" } });
  const t0 = Date.now();
  const lib = library(list);
  const built = Date.now() - t0;
  assert.equal(lib.docs.length, 151);
  const t1 = Date.now();
  const { found, pack } = ask(lib, "How long are SYS097 backups kept?");
  const took = Date.now() - t1;
  /* the system named in the question leaves its own runbook and the
     documents about no system in particular - not the other 149 */
  assert.deepEqual(found.eligible.docs.map(d => d.name).sort(), ["Application Security Standard", "System 097 runbook"]);
  assert.deepEqual(found.eligible.filters, { system:["SYS097"] });
  assert.match(pack.passages[0].text, /Backups of SYS097 are kept for 107 days/);
  const open = ask(lib, "Which host does SVC042 run on?");
  assert.match(open.pack.passages[0].text, /SVC042 on host HOST042/);
  assert.ok(built < 5000 && took < 500, "built in " + built + " ms, searched in " + took + " ms");
});

/* ── 13. look-alike runbooks for different systems and environments ───── */
test("look-alikes: the system and the environment named in the question pick the runbook", () => {
  const lib = library([
    { file:"runbook-imaging-restart-prod.md", meta:{ systems:["Imaging"], environment:"production" } },
    { file:"runbook-imaging-restart-uat.md", meta:{ systems:["Imaging"], environment:"uat" } },
    { file:"runbook-portal-restart.md", meta:{ systems:["Portal"], environment:"production" } }
  ]);
  const uat = ask(lib, "How do I restart the Imaging application pool in UAT?");
  assert.deepEqual(names(uat.pack), ["Imaging - restart the application pool (UAT)"]);
  assert.deepEqual(uat.found.eligible.filters, { system:["Imaging"], environment:["uat"] });
  const prod = ask(lib, "How do I restart the Imaging application pool in production?");
  assert.deepEqual(names(prod.pack), ["Imaging - restart the application pool (production)"]);
  const portal = ask(lib, "restart the Portal application pool");
  assert.match(portal.pack.passages[0].text, /PORTAL_POOL/);
  assert.ok(!portal.pack.passages.some(p => /IMG_POOL/.test(p.text)));
  /* "test" in a sentence is not the test environment */
  assert.deepEqual(S.envsIn("I want to test whether the restart works"), []);
});

/* ── 14. the same question in a new conversation ──────────────────────── */
test("a new conversation: the same question finds the same passages, and re-reading keeps their ids", () => {
  const mk = () => library([{ file:"application-security-standard-v2.md", meta:{ name:"Application Security Standard" } },
                            { file:"patching-standard.md" }]);
  const q = "How long to fix a critical vulnerability in an internet-facing application?";
  const a = ask(mk(), q).pack.passages.map(p => p.id), b = ask(mk(), q).pack.passages.map(p => p.id);
  assert.deepEqual(a, b);
  const d = S.diffChunks(mk().chunks, mk().chunks);
  assert.equal(d.added + d.removed, 0);
  /* an updated guideline with one clause changed: that passage gets a new
     id, and every other passage keeps the one it had */
  const text = read("application-security-standard-v2.md");
  const r1 = S.prepare({ id:"x", name:"Application Security Standard", kind:"md", text:text });
  const r2 = S.prepare({ id:"x", name:"Application Security Standard", kind:"md", text:text.replace("by at most 30 days", "by at most 45 days") });
  const diff = S.diffChunks(r1.chunks, r2.chunks);
  assert.deepEqual(diff, { added:1, removed:1, kept:r1.chunks.length - 1 });
  assert.ok(r1.chunks.length >= 3);
});

/* ── the pieces underneath ─────────────────────────────────────────────── */
test("reading: headings, tables kept whole, metadata", () => {
  const r = S.prepare({ id:"v2", name:"", file:"application-security-standard-v2.md", kind:"md", text:read("application-security-standard-v2.md") });
  assert.equal(r.doc.name, "Application Security Standard");
  assert.equal(r.doc.version, "2.0");
  assert.equal(r.doc.effective, "2026-02-01");
  const t = r.chunks.find(c => /\| Critical \| 7 days/.test(c.text));
  assert.match(t.text, /\| Severity \| Internet-facing application \| Internal application \|/, "the header row travels with the rows");
  assert.ok(r.chunks.every(c => !/^Application Security Standard ›/.test(c.section)), "the title is not a section");
  const big = "# Big\n\n## Table\n\n| a | b |\n|---|---|\n" + Array.from({ length:120 }, (_, i) => "| row " + i + " | value " + i + " |").join("\n") + "\n";
  const rb = S.prepare({ id:"b", name:"Big", kind:"md", text:big });
  assert.ok(rb.chunks.length > 1);
  assert.ok(rb.chunks.every(c => /\| a \| b \|/.test(c.text)), "each part of a long table has its header");
  assert.equal(S.parseDate("1 March 2026"), "2026-03-01");
  assert.equal(S.parseDate("March 1, 2026"), "2026-03-01");
});

test("figures: what counts as a figure an answer must be able to cite", () => {
  const keys = t => S.figures(t).map(f => f.key);
  assert.deepEqual(keys("within 4 hours"), ["4 hour"]);
  assert.deepEqual(keys("within four (4) hours"), ["4 hour"]);
  assert.deepEqual(keys("30 business days, or 72h"), ["30 day", "72 hour"]);
  assert.deepEqual(keys("a P1 incident"), ["p1"]);
  assert.deepEqual(keys("see page 12, section 4.2, step 3"), []);
  assert.ok(keys("CVSS score of 9.0 or higher").includes("score 9.0"));
});

test("the flow reads cite, confidence and suggest, and fills {sources}", () => {
  global.window = { addEventListener(){}, location:{ origin:"http://127.0.0.1" } };
  global.document = { createElement(){ return { style:{}, setAttribute(){}, addEventListener(){} }; }, body:{ appendChild(){} } };
  eval(fs.readFileSync(path.join(__dirname, "..", "flow.js"), "utf8"));
  const F = global.window.DossierFlow;
  const v = F.validate({ say:"x", cite:[{ s:"S1", quote:"q" }, "S2"], confidence:"Not found", suggest:"try y" });
  assert.deepEqual(v.cite, [{ s:"S1", quote:"q" }, { s:"S2", quote:"" }]);
  assert.equal(v.confidence, "not_found");
  assert.equal(v.suggest, "try y");
  const req = { message:"m", workspace:{ sources:{ searched:2 } }, sourcesText:"[S1] Doc\nwords" };
  assert.match(F.fillPrompt("{sources}", req), /\[S1\] Doc/);
  assert.ok(!("sources" in JSON.parse(F.fillPrompt("{workspace}{sources}", req).replace(/\[S1\][\s\S]*$/, ""))));
  assert.match(F.fillPrompt("{sources}", { workspace:{} }), /No runbooks or standards are indexed/);
  /* a prompt from before {sources} still gets the passages, inside workspace */
  assert.match(F.fillPrompt("{workspace}", req), /\[S1\] Doc/);
});

/* ── after 5.9.0: studying a guideline, names, and tables read by column ─ */
test("names: a PDF whose first line is a logo takes its file's name", () => {
  assert.equal(S.nameFor("AIA", "ITSR.039 Vulnerability Management Standard.pdf", "pdf"), "ITSR.039 Vulnerability Management Standard");
  assert.equal(S.nameFor("ACME", "SEC.014 Patch Management Standard.pdf", "pdf"), "SEC.014 Patch Management Standard");
  assert.equal(S.nameFor("DATA RETENTION STANDARD", "data-retention-standard.pdf", "pdf"), "Data Retention Standard");
  assert.equal(S.nameFor("Vulnerability Management Standard", "scan0001.pdf", "pdf"), "Vulnerability Management Standard");
  assert.equal(S.nameFor("Application Security Standard", "appsec.md", "md"), "Application Security Standard");
  assert.ok(S.weakTitle("AIA") && !S.weakTitle("Patch Management Standard"));
});

test("a table the PDF reader gives a column at a time still supports its figure, at medium confidence", () => {
  const text = "[page 1]\nPatch Management Standard\n1 Patch Timeframes\nSecurity patches are applied within the timeframe for their severity:\n" +
               "Critical High Medium\n14 30 90\n(calendar days from the vendor release)\n";
  const lib = library([{ file:"patch.pdf.txt", text:text, pages:1, meta:{ name:"Patch Management Standard" } }]);
  const q = "How long do we have to apply a critical security patch?";
  const { pack } = ask(lib, q);
  const p = withText(pack, /14 30 90/)[0];
  assert.ok(p);
  const g = S.ground({ say:"Critical patches: within 14 days of the vendor release.", confidence:"high",
                       cite:[{ s:p.s, quote:"Critical High Medium" }] }, pack, q);
  assert.equal(g.status, "grounded");
  assert.equal(g.confidence, "medium");
  assert.deepEqual(g.loose, ["14 days"]);
  /* but a figure the table does not have is still held back */
  assert.equal(S.ground({ say:"Critical patches: within 7 days.", confidence:"high",
                          cite:[{ s:p.s, quote:"Critical High Medium" }] }, pack, q).status, "blocked");
});

test("drafts written from a document: figures it does not state are named", () => {
  const doc = ["Security patches are applied within the timeframe for their severity:\nCritical High Medium\n14 30 90\n(calendar days)"];
  assert.deepEqual(S.unsupportedIn("Apply critical patches within 14 days. Escalate to the CAB after 4 hours.", doc), ["4 hours"]);
  assert.deepEqual(S.unsupportedIn("Apply high patches within 30 days.", doc), []);
});
