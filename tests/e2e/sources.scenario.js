// Runs inside dossier.html (tests/e2e/run.js evaluates it). Returns { checks }.
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const until = async (f, ms) => { const t = Date.now(); while (Date.now() - t < (ms || 15000)) { try { if (await f()) return true; } catch (e) {} await sleep(60); } return false; };
  const checks = [];
  const check = (name, ok, detail) => { checks.push({ name, ok:!!ok, detail:ok ? "" : String(detail === undefined ? "" : detail).slice(0, 600) }); };
  const shot = async name => { window.__shot = name; await until(() => !window.__shot, 8000); };
  for (let i = 0; i < 300 && !(typeof openWorkspace === "function" && window.DossierFlow && window.DossierSources); i++) await sleep(100);
  check("the app loads sources.js", !!window.DossierSources);

  /* a workspace of its own, in the browser's private storage */
  const root = await navigator.storage.getDirectory();
  try { await root.removeEntry("e2e-sources", { recursive:true }); } catch (e) {}
  const ws = await root.getDirectoryHandle("e2e-sources", { create:true });
  const fh = await ws.getFileHandle("dossier.json", { create:true });
  const w = await fh.createWritable();
  await w.write(JSON.stringify({ app:"dossier", version:3, savedAt:"2026-09-29T08:00:00.000Z", wsId:"wE2E", seq:1,
    settings:{ chatUI:{ skin:"lumen", skinPicked:true, confirm:true } }, routines:[], scripts:[], incidents:[], chats:[], tasks:[] }));
  await w.close();
  await openWorkspace(ws, true);
  if (typeof hideBanner === "function") hideBanner();
  const style = document.createElement("style");
  style.textContent = ".pet,.toasts{display:none!important}";
  document.head.appendChild(style);
  await srcLoad(true);

  const file = async (name, type) => new File([await (await fetch("tests/fixtures/" + name, { cache:"no-store" })).arrayBuffer()], name, { type });
  const addDoc = async (name, type, ans) => {
    const f = await file(name, type);
    const x = await srcExtract(f);
    const meta = DossierSources.detectMeta(x.text, name);
    return srcStore(f, x, Object.assign({ name:meta.title, version:meta.version, effective:meta.effective, assistant:true }, ans || {}), "you");
  };

  /* ── adding documents ─────────────────────────────────────────────── */
  const v1 = await addDoc("application-security-standard-v1.md", "text/markdown", { name:"Application Security Standard" });
  check("a Markdown standard is added, with its version and effective date", v1.version === "1.0" && v1.effective === "2025-01-15" && v1.chunks > 0,
        JSON.stringify({ v:v1.version, e:v1.effective, c:v1.chunks }));
  const pdf = await addDoc("data-retention-standard.pdf", "application/pdf", { name:"Data Retention Standard" });
  const pdfText = await srcText(pdf);
  check("a PDF is read page by page by the app's reader", pdf.pages === 3 && /\[page 2\]/.test(pdfText) && /System logs are kept for 90 days/.test(pdfText),
        JSON.stringify({ pages:pdf.pages, text:pdfText.slice(0, 300) }));
  check("the PDF's version and effective date are read from its first page", pdf.version === "3.2" && pdf.effective === "2026-03-01", pdf.version + " " + pdf.effective);
  check("no page of the PDF is flagged", !(pdf.issues || []).filter(i => !i.info).length, JSON.stringify(pdf.issues));
  const inc = await addDoc("incident-management-guideline.md", "text/markdown");
  const dir = await (await ws.getDirectoryHandle("sources")).getDirectoryHandle(pdf.id);
  const names = []; for await (const k of dir.keys()) names.push(k);
  check("the original, its text and its passages are kept in the workspace folder", ["data-retention-standard.pdf", "text.txt", "chunks.json"].every(n => names.includes(n)), names.join(", "));
  const cat = JSON.parse(await (await (await (await ws.getDirectoryHandle("sources")).getFileHandle("catalog.json")).getFile()).text());
  check("the catalog lists every document", cat.docs.length === 3 && cat.algo === DossierSources.ALGO, JSON.stringify(cat.docs.map(d => d.name)));

  /* reopened: the same passages, with the same ids */
  const before = [...SRC.chunks.values()].flat().map(c => c.id).sort().join();
  await srcLoad(true);
  check("reopening reads the same passages back, with the same ids", [...SRC.chunks.values()].flat().map(c => c.id).sort().join() === before);

  /* ── asking, with a stand-in for the flow ─────────────────────────── */
  S.settings.flow = { on:true, url:"https://flow.example/invoke", scope:"live", cap:60, timeout:30, fallback:false, shape:"classic", tiers:{ on:false } };
  const sent = [];
  let plan = null;
  DossierFlow.ask = async (text, ctx, cfg) => {
    const req = DossierFlow.buildRequest(text, ctx, cfg);
    const prompt = DossierFlow.fillPrompt(ctx.promptTemplate || DossierFlow.PROMPT, req);
    sent.push({ text, req, prompt });
    await sleep(20);
    const o = DossierFlow.validate(plan ? plan(req) : { say:"ok" }); o.ms = 5; return o;
  };
  const label = (req, re) => {
    const hit = String(req.sourcesText || "").split(/\n(?=\[S\d+\] )/).find(p => re.test(p));
    return hit ? /^\[(S\d+)\]/.exec(hit)[1] : "";
  };
  const answers = () => [...document.querySelectorAll("#chatLog .chb.ans")];
  const ask = async q => {
    const n = answers().length;
    await chatAsk(q);
    await until(() => !$("chat").classList.contains("busy") && answers().length > n, 15000);
    await sleep(200);
    return answers().pop();
  };
  openChat(); chatNew(true); chatPaint();

  const Q = "In the policy and standard, how long would it take to fix the critical internet-facing application?";
  const A = "The provided policy and standard do not specify a resolution timeframe for a critical internet-facing application.";

  /* the failure this began with: a model that invents "4 hours" */
  plan = req => ({ say:"Per the standard, a critical internet-facing application must be fixed within 4 hours.",
                   cite:[{ s:label(req, /remediated by the application owner/), quote:"Vulnerabilities must be remediated by the application owner." }],
                   confidence:"high" });
  let el = await ask(Q);
  let last = sent[sent.length - 1];
  check("regression: the question carries the standard's passages, labelled", /=== THEIR DOCUMENTS \(SOURCES\) ===/.test(last.prompt) &&
        /\[S1\] /.test(last.prompt) && /Application Security Standard/.test(last.req.sourcesText), last.req.sourcesText.slice(0, 400));
  check("regression: the invented '4 hours' is not shown", !/4 hours/.test(el.textContent), el.textContent);
  check("regression: the answer says it was held back, with no supporting source", /held back/i.test(el.textContent) && el.querySelector(".srcans.blocked"), el.textContent.slice(0, 400));
  const logged = SRC.log.find(e => e.kind === "answer");
  check("diagnostics: the held-back answer is logged with the figure and no document text",
        logged && logged.status === "blocked" && logged.unsupportedFigures.includes("4 hours") && !/remediated by the application owner/.test(JSON.stringify(logged)),
        JSON.stringify(logged).slice(0, 500));
  await shot("1-held-back");

  /* the model that follows the prompt */
  plan = req => ({ say:A, confidence:"not_found",
                   cite:[{ s:label(req, /remediated by the application owner/), quote:"Vulnerabilities must be remediated by the application owner." }] });
  el = await ask(Q);
  check("regression: the expected not-found answer is shown as not found", el.textContent.includes(A) && /Not found/.test(el.textContent) &&
        /No supporting source found/.test(el.textContent) && !/4 hours/.test(el.textContent), el.textContent.slice(0, 400));
  el = await ask("why was it not found?");
  check("'why was it not found?' is answered from what was searched", /searched \d+ active documents/i.test(el.textContent), el.textContent.slice(0, 300));
  await shot("2-not-found");

  /* ── a new version, through the Add dialog, replacing the old one ──── */
  const v2file = await file("application-security-standard-v2.md", "text/markdown");
  const adding = srcAddFiles([v2file]);
  await until(() => document.getElementById("srcDlg"), 8000);
  check("the Add dialog sees a new version of a document already there", /new version of/i.test($("srcDlg").textContent) &&
        $("sdVer").value === "2.0" && $("sdEff").value === "2026-02-01", $("srcDlg").textContent.slice(0, 300));
  await shot("3-add-dialog");
  $("sdOk").click();
  await adding;
  const v2 = srcDocs().find(d => d.version === "2.0");
  check("replacing it keeps the old version, no longer searched", v2 && srcDoc(v1.id).status === "superseded" && srcDoc(v1.id).supersededBy === v2.id,
        JSON.stringify(srcDocs().map(d => [d.name, d.version, d.status])));

  const Q2 = "How long do we have to fix a critical vulnerability in an internet-facing application?";
  plan = req => ({ say:"**7 days** from confirmation.", confidence:"high",
                   cite:[{ s:label(req, /\| Critical \| 7 days/), quote:"| Critical | 7 days | 14 days |" }] });
  el = await ask(Q2);
  last = sent[sent.length - 1];
  const firstPassages = JSON.stringify(last.req.workspace.sources.passages);
  check("the superseded version is not searched", !/Remediation is tracked in the vulnerability register until closed/.test(last.req.sourcesText));
  const src = read => (read.match(/\n/g) || []).length;
  const row = (await (await fetch("tests/fixtures/application-security-standard-v2.md")).text()).split("\n").indexOf("| Critical | 7 days | 14 days |") + 1;
  const want = '[Source: application-security-standard-v2.md, version 2.0, line ' + row + ', section "3.3 Remediation Timeframe"]';
  const cite = el.querySelector(".srccite");
  check("a grounded answer shows its source, to the line and section", cite && cite.textContent === want, cite ? cite.textContent : el.textContent.slice(0, 300));
  check("...its evidence, and high confidence", /\| Critical \| 7 days \| 14 days \|/.test((el.querySelector(".srcq") || {}).textContent || "") &&
        /High/.test((el.querySelector(".srcconf") || {}).textContent || ""), el.textContent.slice(0, 400));
  await shot("4-grounded");
  cite.click();
  await until(() => document.querySelector("#srcView .srcl.on"), 5000);
  const on = document.querySelector("#srcView .srcl.on");
  check("the citation opens the document at the cited line, marked", on && /\| Critical \| 7 days \| 14 days \|/.test(on.textContent) &&
        on.querySelector("i").textContent === String(row), on ? on.textContent : "no viewer");
  await shot("5-viewer");
  if ($("svClose")) $("svClose").click();

  el = await ask("which source supports this answer?");
  check("'which source supports this answer?' lists the citation", el.textContent.includes(want), el.textContent.slice(0, 300));

  /* ── a follow-up ────────────────────────────────────────────────────── */
  plan = req => ({ say:"180 days.", confidence:"high", cite:[{ s:label(req, /\| Low \| 180 days/), quote:"| Low | 180 days | 180 days |" }] });
  el = await ask("how about low severity?");
  last = sent[sent.length - 1];
  check("a follow-up is searched again, with the question before it", /\| Low \| 180 days/.test(last.req.sourcesText) && el.querySelector(".srcans.grounded"),
        last.req.sourcesText.slice(0, 300));

  /* ── the same question in a new conversation ─────────────────────── */
  chatNew(true); chatPaint();
  plan = req => ({ say:"7 days.", confidence:"high", cite:[{ s:label(req, /\| Critical \| 7 days/), quote:"| Critical | 7 days | 14 days |" }] });
  el = await ask(Q2);
  check("a new conversation finds the same passages", JSON.stringify(sent[sent.length - 1].req.workspace.sources.passages) === firstPassages);

  /* ── a PDF citation: page and line on the page ───────────────────── */
  plan = req => ({ say:"90 days.", confidence:"high", cite:[{ s:label(req, /System logs are kept for 90 days/), quote:"System logs are kept for 90 days." }] });
  el = await ask("How long are system logs kept?");
  const pc = el.querySelector(".srccite");
  check("a PDF answer cites the page, the line on it and the section",
        pc && pc.textContent === '[Source: Data Retention Standard, version 3.2, page 2, line 3, section "2 Retention Periods"]', pc ? pc.textContent : el.textContent.slice(0, 300));
  pc.click();
  await until(() => document.querySelector("#srcView .srcl.on"), 5000);
  check("...and opens on that page", /System logs are kept for 90 days/.test((document.querySelector("#srcView .srcl.on") || {}).textContent || "") &&
        /Page 2 of 3/.test($("srcView").textContent));
  if ($("svClose")) $("svClose").click();

  /* ── a document attached in the conversation is kept ─────────────── */
  await chatAttach([await file("patching-standard.md", "text/markdown")]);
  await until(() => CHAT.files.length && !CHAT.files[0].reading, 8000);
  plan = req => ({ say:"Within 3 days of the vendor release.", confidence:"high",
                   cite:[{ s:label(req, /within 3 days/), quote:"must be applied within 3 days" }] });
  el = await ask("What does this say about critical patches?");
  last = sent[sent.length - 1];
  const kept = srcDocs().find(d => d.from === "chat");
  check("an attached document goes into Sources, and its passages travel labelled", kept && /within 3 days/.test(last.req.sourcesText) &&
        /kept in Sources/.test(last.req.attachments[0].text) && el.querySelector(".srcans.grounded"),
        JSON.stringify({ kept:!!kept, att:(last.req.attachments[0] || {}).text }));
  await until(async () => { try { await (await (await ws.getDirectoryHandle("sources")).getDirectoryHandle(kept.id)).getFileHandle("chunks.json"); return true; } catch (e) { return false; } }, 8000);
  const later = srcSearch("How quickly must critical security patches be applied on internet-facing servers?", null, {});
  check("...and is found again by a later question", later.passages.some(p => /within 3 days/.test(p.text)));

  /* ── access labels ─────────────────────────────────────────────────── */
  await addDoc("security-incident-playbook.md", "text/markdown", { label:"security-restricted" });
  plan = req => ({ say:"Isolate it within 15 minutes.", confidence:"high" });
  el = await ask("How fast must an affected host be isolated during a security incident?");
  last = sent[sent.length - 1];
  check("a restricted document is not searched, named or sent", !/Security Incident Playbook|Isolate the affected host/i.test(last.prompt), last.req.sourcesText.slice(0, 300));
  check("...and an answer from memory about it is held back", !/15 minutes/.test(el.textContent) && el.querySelector(".srcans.blocked"), el.textContent.slice(0, 200));
  srcCfg().clearance = ["security-restricted"];
  el = await ask("How fast must an affected host be isolated during a security incident?");
  check("cleared for the label, it is searched", /Isolate the affected host from the network within 15 minutes/.test(sent[sent.length - 1].req.sourcesText));

  /* ── switched off ─────────────────────────────────────────────────── */
  await srcSetStatus(inc.id, "inactive");
  plan = req => ({ say:"ok" });
  await ask("What is the resolution target for a P1 incident?");
  check("a document switched off is not searched", !/Resolution target/.test(sent[sent.length - 1].req.sourcesText), sent[sent.length - 1].req.sourcesText.slice(0, 300));

  /* ── no flow: the passages themselves ─────────────────────────────── */
  S.settings.flow.on = false;
  el = await ask("How long are audit logs kept according to the data retention standard?");
  check("with no flow, the documents' own words come back, cited", /Audit logs are kept for 2 years/.test(el.textContent) &&
        /\[Source: Data Retention Standard, version 3\.2, page 2/.test(el.textContent), el.textContent.slice(0, 300));
  await shot("6-no-flow");

  /* ── the panel ────────────────────────────────────────────────────── */
  closeChat();
  if (typeof setView === "function") setView("library");
  await sleep(300);
  const panel = document.querySelector(".srcpanel");
  check("the Library shows Sources with every document and its status", panel && panel.querySelectorAll(".srcdoc").length === srcDocs().length &&
        /superseded/.test(panel.textContent) && /switched off/.test(panel.textContent), panel ? panel.textContent.slice(0, 300) : "no panel");
  panel.querySelector("details.srcset:last-of-type").open = true;
  check("the diagnostics list the searches, with no document text", SRC.log.filter(e => e.kind === "answer").length >= 8 &&
        !SRC.log.some(e => /Isolate the affected host|kept for 90 days|remediated by the application owner/.test(JSON.stringify(e))));
  await shot("7-panel");
  return { checks };
})()
