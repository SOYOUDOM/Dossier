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

  const file = async (name, type) => new File([await (await fetch("tests/fixtures/" + encodeURIComponent(name), { cache:"no-store" })).arrayBuffer()], name, { type });
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
  /* folded to one line until opened, and remembered with the answer */
  const box = answers().pop().querySelector(".srcans"), sumBtn = box && box.querySelector(".srcsum");
  check("the sources under an answer start folded to one line: the document, and how sure", box && !box.classList.contains("open") &&
        getComputedStyle(box.querySelector(".srcbody")).display === "none" &&
        /Source: Application Security Standard/.test(sumBtn.textContent) && /High/.test(sumBtn.textContent),
        box ? box.outerHTML.slice(0, 400) : "no box");
  sumBtn.click();
  check("...a click opens them, with the evidence", box.classList.contains("open") && getComputedStyle(box.querySelector(".srcbody")).display !== "none" &&
        sumBtn.getAttribute("aria-expanded") === "true");
  chatPaint();
  const again = answers().pop().querySelector(".srcans");
  check("...and they stay open when the conversation is drawn again", again && again.classList.contains("open"));

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

  /* the file under the question: a card that opens what was sent, and folds */
  const you = () => [...document.querySelectorAll("#chatLog .chb.you")].pop();
  let card = you().querySelector(".cfcard");
  check("the question shows its file as a card, kept in Sources", card && /patching-standard\.md/.test(card.textContent) && /in Sources/.test(card.textContent),
        you().innerHTML.slice(0, 400));
  card.click();
  await until(() => document.getElementById("srcView"), 3000);
  check("...pressing it opens the document that was sent", /within 3 days/.test(($("srcView") || {}).textContent || ""),
        (($("srcView") || {}).textContent || "no viewer").slice(0, 200));
  if ($("svClose")) $("svClose").click();
  you().querySelector(".cfhide").click();
  const youMsg = chatThread().msgs.filter(m => m.who === "you").pop();
  check("...Hide folds it to one line, kept with the message", you().querySelector(".cfs.min .cfmin") &&
        /1 attached: patching-standard\.md/.test(you().textContent) && youMsg.filesMin === true);
  chatPaint();
  check("...and it stays folded when the conversation is drawn again", !!you().querySelector(".cfs.min"));
  you().querySelector(".cfmin").click();
  check("...and opens again", !!you().querySelector(".cfcard"));
  /* a question saved before 5.9.3 did not note where its document went */
  const oldMsg = { who:"you", text:"an older question", at:"2026-09-01T08:00:00.000Z",
                   files:[{ name:"patching-standard.md", type:"text/markdown", size:2000 }] };
  chatThread().msgs.push(oldMsg); chatPaint();
  const oldCard = [...document.querySelectorAll("#chatLog .chb.you")].find(b => /an older question/.test(b.textContent)).querySelector(".cfcard");
  check("a question sent before this version finds its document in Sources by its name", oldCard && /in Sources/.test(oldCard.textContent) &&
        !oldCard.classList.contains("gone"), oldCard ? oldCard.outerHTML.slice(0, 300) : "no card");
  chatThread().msgs.pop(); chatPaint();

  /* a picture: a small copy is kept with the conversation */
  const cv = document.createElement("canvas"); cv.width = 640; cv.height = 360;
  const cg = cv.getContext("2d"); cg.fillStyle = "#1f4e5f"; cg.fillRect(0, 0, 640, 360); cg.fillStyle = "#fff"; cg.font = "48px sans-serif"; cg.fillText("ERROR 4098", 150, 200);
  const png = await new Promise(r => cv.toBlob(r, "image/png"));
  await chatAttach([new File([png], "error-screen.png", { type:"image/png" })]);
  await until(() => CHAT.files.length && !CHAT.files[0].reading, 8000);
  plan = req => ({ say:"That is error 4098." });
  await ask("what is this error?");
  const picCard = you().querySelector(".cfcard img");
  const picMsg = chatThread().msgs.filter(m => m.who === "you").pop();
  await until(() => picMsg.files[0].thumb, 5000);
  check("a picture shows as a small picture on its card, and a small copy is kept", picCard && /^data:image\//.test(picCard.src) &&
        /^data:image\/jpeg/.test(picMsg.files[0].thumb || "") && picMsg.files[0].thumb.length < 30000,
        JSON.stringify({ card:!!picCard, thumb:(picMsg.files[0].thumb || "").length }));
  you().querySelector(".cfcard").click();
  await until(() => document.querySelector("#srcView .cfvimg img"), 3000);
  check("...pressing it shows the picture that was sent", !!document.querySelector("#srcView .cfvimg img"));
  if ($("svClose")) $("svClose").click();
  await shot("10-file-cards");

  /* ── studying a guideline: a job, not a question - never held back; the
        drafts it proposes are checked instead ─────────────────────────── */
  chatNew(true); chatPaint();
  await chatAttach([await file("SEC.014 Patch Management Standard.pdf", "application/pdf")]);
  await until(() => CHAT.files.length && !CHAT.files[0].reading, 8000);
  plan = req => ({ say:"I saved one draft runbook from it: critical patches go on within 14 days, and anything overdue is escalated after 4 hours.",
                   cite:[{ s:label(req, /14 30 90/), quote:"Critical High Medium" }], confidence:"high",
                   actions:[{ do:"saveRunbook", title:"Critical patch overdue", system:"Patching", status:"draft",
                              triggers:["critical patch not applied"], steps:["Apply critical patches within 14 days of the vendor release.",
                              "Escalate to the change advisory board after 4 hours."] }] });
  const nAsk = sent.length;
  el = await ask("[study] Here is a guideline. Turn each procedure into a runbook.");
  await until(() => ASK.cur, 5000);
  const kept2 = srcDocs().find(d => /Patch Management/.test(d.name));
  check("a PDF whose first line is a logo is kept under its file's name", kept2 && kept2.name === "SEC.014 Patch Management Standard",
        JSON.stringify(srcDocs().map(d => d.name)));
  check("study: the reply is shown, not held back", sent.length > nAsk && !el.querySelector(".srcans") && /I saved one draft runbook/.test(el.textContent),
        el.textContent.slice(0, 300));
  check("study: it says the document is kept in Sources", /Kept in Sources: SEC\.014 Patch Management Standard/.test(el.textContent), el.textContent.slice(0, 400));
  check("study: the draft names the figure its document does not state", ASK.cur && /Not in the document: 4 hours/.test(ASK.cur.note) &&
        !/14 days/.test((/Not in the document:[^\n]*/.exec(ASK.cur.note) || [""])[0]), ASK.cur ? ASK.cur.note : "no dialog");
  await shot("8-study-draft");
  while (ASK.cur) chatDeclineAsked();

  /* and then a question about it: the table, read a column at a time */
  plan = req => ({ say:"Within 14 days of the vendor release.", confidence:"high", cite:[{ s:label(req, /14 30 90/), quote:"Critical High Medium" }] });
  el = await ask("How long do we have to apply a critical security patch?");
  check("a figure from a table read by column is accepted, at medium confidence", el.querySelector(".srcans.grounded") &&
        /Medium/.test((el.querySelector(".srcconf") || {}).textContent || ""), el.textContent.slice(0, 400));

  /* ── 5.9.2: a password standard with its header on every page, asked
        with a typo; a right answer with two lines it could not back ───── */
  chatNew(true); chatPaint();
  const pw = await addDoc("access-password-standard.pdf", "application/pdf", { name:"Access Standard - Passwords" });
  const pwChunks = SRC.chunks.get(pw.id) || [];
  check("the header printed on every page is left out of the passages (the app's own PDF reader)",
        pw.pages === 4 && pwChunks.length && pwChunks.every(c => !/CLASSIFICATION|REFERENCE: ACS/.test(c.text)) &&
        pwChunks.some(c => c.page === 3 && c.section === "ACS-PWD-01" && /at least 12 characters/.test(c.text)),
        JSON.stringify(pwChunks.map(c => [c.page, c.section, c.text.slice(0, 40)])));
  plan = req => ({ say:"For an ordinary **user account** the standard asks for a **passphrase of at least 16 characters**: three or more unrelated words " +
                       "joined by hyphens. Where a system cannot take a passphrase, a longer password is allowed.\n\n" +
                       "For local administrators the password is changed every 60 days.\n\nPasswords should also be changed every 90 days.",
                   cite:[{ s:label(req, /Minimum Length: 16 characters/), quote:"Minimum Length: 16 characters" }], confidence:"high" });
  el = await ask("what is the stardard password should be?");
  last = sent[sent.length - 1];
  check("a mistyped question still finds the rule, and the page it runs on to",
        /Minimum Length: 16 characters/.test(last.req.sourcesText) && /at least 12 characters/.test(last.req.sourcesText), last.req.sourcesText.slice(0, 400));
  check("the answer is shown with only the unsupported lines taken out", el.querySelector(".srcans.partial") &&
        /passphrase of at least 16 characters/.test(el.textContent) && !/60 days|90 days/.test(el.textContent) && !/do not specify/.test(el.textContent),
        el.textContent.slice(0, 600));
  const seen = [...el.querySelectorAll(".srccite")].map(b => b.textContent);
  check("...it says lines were taken out, and points to where the 60 days is written", /Part of the answer was taken out/.test(el.textContent) &&
        /took out 2 line/.test(el.textContent) && seen.includes('[Source: Access Standard - Passwords, version 2.1, page 3, line 13, section "ACS-PWD-02"]'),
        seen.join(" | ") + " :: " + el.textContent.slice(0, 500));
  await shot("9-partial");
  el = await ask("why was it taken out?");
  check("'why was it taken out?' is answered", /took them out/.test(el.textContent), el.textContent.slice(0, 300));
  plan = req => ({ say:"Every 90 days.", confidence:"high", cite:[{ s:label(req, /Minimum Length: 16 characters/), quote:"Minimum Length: 16 characters" }] });
  el = await ask("how often must a user change their password?");
  check("held back whole, it says so plainly - never that the documents are silent - and shows what they do say",
        el.querySelector(".srcans.blocked") && !/90 days/.test(el.textContent) && !/do not specify/.test(el.textContent) &&
        /What they do say/i.test(el.textContent) && /Minimum Length: 16 characters/.test(el.textContent), el.textContent.slice(0, 500));

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

  /* ── a job done with their own words (5.9.5) ────────────────────────
     Made up, after a real report: a resolution pasted in full, "policy
     number" in it, a figure in it, and "please close it with these steps".
     It was held back as an invented figure; the record was closed anyway. */
  const job = addTask({ title:"Rewards credit for a member" });
  const JOBQ = "here is the fix for " + job.code + "\nSteps:\n1. Open the Member Portal, Rewards tab.\n" +
    "2. Find the member by the policy number in the request.\n" +
    "3. Add a Credit of the requested amount, valid until exactly 5 years after the start date.\n" +
    "4. Save, and check the balance.\nplease close it with these steps";
  plan = req => ({ say:"Done - " + job.code + " is closed, with a Credit valid until exactly 5 years after the start date.",
    actions:[{ do:"setStatus", record:job.code, status:"done", resolution:"Added a Credit in Member Portal > Rewards, valid until exactly 5 years after the start date." },
             { do:"addLog", record:job.code, text:"Resolution steps:\n1. Open the Member Portal, Rewards tab.\n3. Add a Credit, valid until exactly 5 years after the start date." }] });
  el = await ask(JOBQ);
  check("closing a record with your own steps is not held back, and has no sources box under it",
        /valid until exactly 5 years/.test(el.textContent) && !/held back/i.test(el.textContent) && !el.querySelector(".srcans"), el.textContent.slice(0, 300));
  await until(() => ASK.cur, 3000);
  while (ASK.cur) chatRunAsked(ASK.cur);
  await sleep(150);
  check("...and it is closed with how it was fixed kept on it, the steps in its work log",
        job.status === "done" && /exactly 5 years after the start date/.test(job.resolution) &&
        job.log.some(l => /Resolution steps/.test(l.text)), job.status + " | " + job.resolution);
  check("...with no 'How was it fixed?' box left to ask", !document.body.classList.contains("fixing"));
  await shot("8-job-closed");

  /* their own runbook: a figure in it is theirs, and the answer says so */
  runbookStore().push(rbNormalise({ title:"Rewards credit for a member", system:"",
    triggers:["rewards credit", "add a credit for a member"], steps:["Open the Member Portal, Rewards tab.",
    "Add a Credit of the requested amount, valid until exactly 5 years after the start date.", "Save, and check the balance."] }));
  plan = req => ({ say:"Your runbook says: add a Credit in the Member Portal, valid until exactly 5 years after the start date, then check the balance." });
  el = await ask("what is the procedure for a rewards credit for a member?");
  check("an answer from your own runbook is shown, marked as from that runbook",
        /exactly 5 years/.test(el.textContent) && el.querySelector(".srcans.own") && /From your runbook: Rewards credit for a member/.test(el.textContent),
        el.textContent.slice(0, 300));
  $("chatLog").scrollTop = 1e9; await sleep(150);
  await shot("8-own-runbook");
  /* the same figure with no runbook and no word of theirs: still held back */
  runbookStore().splice(-1, 1);
  el = await ask("what is the procedure for a rewards credit for a member?");
  check("...and without the runbook the same reply is held back, its figure never shown",
        el.querySelector(".srcans.blocked") && !/5 years/.test(el.textContent), el.textContent.slice(0, 300));
  chatNew(true); chatPaint();

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

  /* ── many documents: find, filter, fold, act on several, add several ── */
  const rowsShown = () => [...document.querySelectorAll(".srcpanel .srcdoc")].filter(r => !r.hidden);
  const find = $("srcFind");
  find.focus(); find.value = "retention"; find.dispatchEvent(new Event("input"));
  check("the panel's search box narrows the list as you type, and keeps its focus",
        rowsShown().length === 1 && /Data Retention Standard/.test(rowsShown()[0].textContent) && document.activeElement === find &&
        !$("srcShown").hidden, rowsShown().map(r => r.dataset.k).join(" | "));
  find.value = ""; find.dispatchEvent(new Event("input"));
  document.querySelector('.srcpanel [data-sf="inactive"]').click();
  check("a filter chip shows only the documents in that state", rowsShown().length && rowsShown().every(r => r.dataset.st === "inactive") &&
        rowsShown().length === srcDocs().filter(d => d.status === "inactive").length, rowsShown().map(r => r.dataset.st).join());
  document.querySelector('.srcpanel [data-sf="all"]').click();
  check("...and All shows every one again", rowsShown().length === document.querySelectorAll(".srcpanel .srcdoc").length);

  /* several at once: switching on never brings back an old version */
  const tick = id => { const c = document.querySelector('.srcpanel [data-src="' + id + '"] [data-ss]'); c.checked = true; c.dispatchEvent(new Event("change")); };
  tick(inc.id); tick(v1.id);
  check("ticking documents shows the bar that acts on them", !$("srcBulk").hidden && /2 selected/.test($("srcBulk").textContent), $("srcBulk").textContent);
  await srcBulk("on");
  check("'Switch on' for several switches on the ones switched off, and leaves a replaced version as it is",
        srcDoc(inc.id).status === "active" && srcDoc(v1.id).status === "superseded", srcDoc(inc.id).status + " " + srcDoc(v1.id).status);
  srcUi().sel.add(inc.id);
  await srcBulk("off");
  check("'Switch off' for several", srcDoc(inc.id).status === "inactive" && srcDoc(v1.id).status === "superseded");
  srcUi().sel.clear(); renderLib();

  /* several files chosen at once: one window for all of them, one save */
  const mk = (name, text) => new File([text], name, { type:name.endsWith(".md") ? "text/markdown" : "text/plain" });
  const nBefore = srcDocs().length;
  const addingMany = srcAddMany([
    mk("change-freeze.md", "**Change Freeze Calendar**\n\nNo production changes are made in the last five working days of the quarter.\n"),
    mk("printer-queue.md", "# Printer queue: clear a stuck job\n\n1. Stop the spooler service.\n2. Delete the files in the spool folder.\n3. Start the spooler service.\n"),
    mk("printer-queue-copy.md", "# Printer queue: clear a stuck job\n\n1. Stop the spooler service.\n2. Delete the files in the spool folder.\n3. Start the spooler service.\n")
  ]);
  await until(() => $("smOk"));
  check("several files open one window that lists them all, a copy left out", $("smOk") && document.querySelectorAll("#srcDlg .srcmany > div").length === 2 &&
        /1 already in Sources|same/i.test($("srcDlg").textContent), ($("srcDlg") || {}).textContent);
  $("smCat").value = "Operations";
  $("smOk").click();
  await addingMany;
  const added = srcDocs().slice(nBefore);
  check("...and adds them together, with what was chosen once", added.length === 2 && added.every(d => d.category === "Operations" && d.status === "active"),
        JSON.stringify(added.map(d => [d.name, d.category])));
  check("...each named cleanly from its own title", added.map(d => d.name).sort().join(" | ") === "Change Freeze Calendar | Printer queue: clear a stuck job",
        added.map(d => d.name).join(" | "));
  check("...and found by the next question", DossierSources.search(SRC.ix, "printer spooler stuck job", { today:"2026-10-01" }).hits.some(h => h.chunk.doc === added.find(d => /Printer/.test(d.name)).id),
        "");

  /* the panel folds to one line, and remembers it */
  $("srcFold").click();
  check("the panel folds to its title line, and remembers it", !document.querySelector(".srcpanel").classList.contains("open") && srcCfg().panelOpen === false &&
        document.querySelector(".srcpanel").getBoundingClientRect().height < 90, document.querySelector(".srcpanel").getBoundingClientRect().height);
  renderLib();
  check("...still folded when drawn again", !document.querySelector(".srcpanel").classList.contains("open"));
  $("srcFold").click();

  /* ── the Crimson skin (5.10): Lumen's layout, its own colours and its own
     character - a heart in place of the robot, everywhere the robot was ── */
  openChat(); openChatFx(); await sleep(150);
  document.querySelector('#chatFxBody [data-skin="crimson"]').click(); await sleep(200);
  const chatEl = $("chat");
  check("Crimson is picked from the Look sheet, on Lumen's layout", chatEl.dataset.skin === "crimson" && "lm" in chatEl.dataset &&
        chatUI().skin === "crimson" && (chatUI().tried || []).includes("crimson"), chatEl.dataset.skin);
  check("...its character is the heart: every sprite has a Crimson drawing",
        ["think", "slow", "orb", "hero", "done", "no", "oops", "ask", "new", "pet-idle", "pet-cheer", "pet-worry", "pet-nap", "pet-work", "pet-stretch", "pet-held"]
          .every(n => pixKey(n) === "crimson/" + n && /^data:image\/gif|\.gif$/.test(PIX[pixKey(n)])), pixKey("think"));
  closeChatFx(); chatNew(true); chatPaint(); await sleep(200);
  if (chatPixOn()){
    const hero = document.querySelector("#chatLog .chhero img.pxl"), orb = document.querySelector("#chatOrb img.pxl");
    check("...the greeting and the header show the heart", hero && hero.getAttribute("data-pix") === "crimson/hero" &&
          orb && orb.getAttribute("data-pix") === "crimson/orb", (hero && hero.getAttribute("data-pix")) + " " + (orb && orb.getAttribute("data-pix")));
  }
  if (typeof petOn === "function" && petOn() && $("petBtn"))
    check("...and so does the desk pet", /^crimson\//.test(($("petBtn").querySelector("img.pxl") || {}).getAttribute("data-pix") || ""));
  check("...the blue star that comes with Resolv does not cover the heart's own mark", !chatEl.classList.contains("ownmark"));
  check("...and the greeting has its heartbeat line", getComputedStyle(document.querySelector("#chatLog .chhero .lmhs"), "::after").backgroundImage.includes("svg"));
  /* back to Lumen: the robot, the star, nothing of Crimson left behind */
  chatUI().skin = "lumen"; applyChatUI(); chatPaint(); await sleep(100);
  check("Lumen is as it was: its layout, the robot, its mark", "lm" in chatEl.dataset && pixKey("think") === "think" &&
        chatEl.classList.contains("ownmark") === !!CHAT_MARKS.base);
  chatUI().skin = "nebula"; applyChatUI(); await sleep(50);
  check("...and a skin without Lumen's layout does not carry it", !("lm" in chatEl.dataset) && pixKey("hero") === "hero");
  chatUI().skin = "lumen"; applyChatUI();

  /* ── diagrams, choices and the suggestion (5.11) ───────────────────── */
  S.settings.flow.on = true;
  chatNew(true); chatPaint();
  plan = req => ({ say:"Here is the path:\n\n```mermaid\nflowchart TD\n  A[\"Request received\"] --> B{\"Identity verified?\"}\n  B -->|Yes| C[\"Reset the password\"]\n  B -->|No| D[\"Ask for the second check\"]\n  D --> B\n```\n\nAnd a kind it does not draw:\n\n```mermaid\npie title Pets\n  \"Dogs\" : 386\n```",
    ask:"What next?", choices:["Sample code structure", "Checklist for setup", "Draw it as a sequence diagram", "Explain the decision step in more detail", "Something else entirely"],
    suggest:"Keep one runbook per request type and link it from the record." });
  el = await ask("draw how a password reset is handled");
  const dg = el.querySelector(".chdiag");
  check("a ```mermaid block in an answer is drawn as a diagram card", dg && dg.querySelectorAll("svg .dg-node").length === 4 &&
        dg.querySelectorAll("svg .dg-lbl").length === 2 && /Identity verified\?/.test(dg.textContent), el.textContent.slice(0, 300));
  dg.querySelector('[data-dgact="code"]').click();
  check("...its code is a click away", !dg.querySelector(".dgcode").hidden && /flowchart TD/.test(dg.querySelector(".dgcode").textContent));
  let dgPng = null; try { dgPng = await diagPng(dg.dataset.dg, dg); } catch (e) {}
  check("...and it can be made into a picture to copy or save", dgPng && dgPng.type === "image/png" && dgPng.size > 2000, dgPng && dgPng.size);
  dg.querySelector('[data-dgact="big"]').click(); await sleep(150);
  check("...and seen larger", !!document.querySelector("#dgView .dgvx svg"));
  document.querySelector('#dgView [data-z="x"]').click();
  check("a kind it cannot draw stays code, with a line saying so", el.querySelectorAll(".chcode").length === 1 && /could not draw this diagram/i.test(el.textContent) &&
        /pie title Pets/.test(el.querySelector(".chcode").textContent));
  const seeds = [...el.querySelectorAll(".chseed button")], logBox = $("chatLog").getBoundingClientRect();
  check("every choice under an answer is in view - five choices wrap onto more lines", seeds.length === 5 &&
        seeds.every(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.right <= logBox.right + 1 && r.left >= logBox.left - 1; }) &&
        new Set(seeds.map(b => Math.round(b.getBoundingClientRect().top))).size > 1, seeds.map(b => Math.round(b.getBoundingClientRect().right)).join());
  const sug = el.querySelector(".srcsug");
  check("the suggestion starts folded to one line", sug && !sug.classList.contains("open") && getComputedStyle(sug.querySelector(".sugbody")).display === "none" &&
        sug.getBoundingClientRect().height < 40, sug && sug.getBoundingClientRect().height);
  sug.querySelector(".sugsum").click();
  check("...opens with a click, and remembers", sug.classList.contains("open") && /one runbook per request type/.test(sug.textContent) &&
        chatThread().msgs.some(m => m.reply && m.reply.sugOpen === true));

  /* ── a flow that strips ``` from replies, a name, the blank picture (5.11.1) ── */
  chatNew(true); chatPaint();
  /* what came back from a flow whose Clean step takes out every ``` */
  plan = req => ({ say:"Here's a simple diagram:\n\nmermaid\nflowchart TD\nA[\"User Action\"] --> B[\"Application Service\"]\nB --> C[\"Domain Service\"]\nC --> D[\"Entity\"]\n\nThis shows how a user action is handled." });
  el = await ask("draw a simple flow of a user action through the layers");
  const bare = el.querySelector(".chdiag");
  check("a diagram whose ``` fences were stripped on the way back is still drawn", bare && bare.querySelectorAll("svg .dg-node").length === 4 &&
        [...el.querySelectorAll("p")].some(p => /^This shows how a user action is handled\.$/.test(p.textContent.trim())) &&
        ![...el.querySelectorAll("p")].some(p => /mermaid|-->/.test(p.textContent)), el.textContent.slice(0, 300));
  check("the prompt asks for diagrams fenced with ~~~, which a Clean step leaves alone", /~~~mermaid on its own line/.test(sent[sent.length - 1].prompt));

  /* "I named you Elle okay?" - answered on the PC, not by a model looking at the blank picture */
  const nSent = sent.length, title = () => $("chat").querySelector('.chh [data-i18n="ChatTitle"]').textContent;
  el = await ask("I named you elle okay?");
  check("'I named you elle okay?' is answered on the PC, without asking the flow", sent.length === nSent && /Elle it is/.test(el.textContent) && chatName() === "Elle",
        sent.length - nSent + " " + el.textContent.slice(0, 200));
  check("...the name is at the top of the panel and in the box you type in", title() === "Elle" && $("chatq").placeholder === "Ask Elle…",
        title() + " | " + $("chatq").placeholder);
  applyI18n();
  check("...and stays there after the language is applied again", title() === "Elle" && $("chatq").placeholder === "Ask Elle…");
  check("...and the desk pet - the same assistant - goes by it too", petName() === "Elle", petName());
  plan = req => ({ say:"ok" });
  await ask("help me word a reply to the user about their locked account");
  check("...and the flow is told the name it was given", sent.length === nSent + 1 && sent[sent.length - 1].req.workspace.yourName === "Elle" &&
        /workspace\.yourName/.test(sent[sent.length - 1].prompt), JSON.stringify(sent[sent.length - 1].req.workspace.yourName));
  el = await ask("use your own name");
  check("'use your own name' goes back to Resolv, with a chip to keep Elle", chatName() === "Resolv" && title() === L("ChatTitle") &&
        !chatUI().name && petName() === "" && /Keep Elle/.test(el.textContent) && sent.length === nSent + 1, el.textContent.slice(0, 200));
  check("'I'll call you later' is not a name", (await ask("I'll call you later"), chatName() === "Resolv" && !chatUI().name));

  /* a mini model that answers the blank picture instead of the question */
  chatNew(true); chatPaint();
  let tries = 0;
  plan = req => (++tries === 1
    ? { say:"It looks like the image you shared is a blank white square. Could you try attaching it again?", title:"Blank image placeholder" }
    : { say:"Monday's patch window is 22:00 to 02:00, so the restart fits after 22:00.", title:"Patch window restart" });
  const pSent = sent.length;
  el = await ask("when can I restart the app server on Monday?");
  check("an answer about the blank picture is asked again, saying no picture was attached",
        sent.length === pSent + 2 && / \(no picture attached\)$/.test(sent[sent.length - 1].text) && /patch window is 22:00/.test(el.textContent) &&
        !/blank white square/.test(el.textContent), sent.slice(pSent).map(x => x.text).join(" | "));
  check("...and the conversation is named after the question, not the picture", chatThread().title === "Patch window restart", chatThread().title);
  chatNew(true); chatPaint();
  plan = req => ({ say:"That image appears to be blank.", title:"Blank image placeholder" });
  el = await ask("what's the restart order for the batch servers?");
  check("twice about the picture: says what happened and where the lasting fix is, and the title is not about the picture",
        /blank picture/.test(el.textContent) && /4f/.test(el.textContent) && !/Blank image placeholder/.test(chatThread().title || ""), el.textContent.slice(0, 300) + " | " + chatThread().title);

  /* ── the pet is the assistant; the panel docked, floating or full screen (5.12) ── */
  const chatBox = $("chat"), appEl = document.querySelector(".app");
  const pev = (el, type, x, y) => el.dispatchEvent(new PointerEvent(type, { bubbles:true, clientX:x, clientY:y, pointerId:7, button:0, isPrimary:true, pointerType:"mouse" }));
  /* a name given to the pet before 5.12 becomes the assistant's */
  delete chatUI().name; S.settings.pet = Object.assign({}, S.settings.pet || {}, { on:true, corner:"br", name:"Pip" });
  petCfg();
  check("a pet named before 5.12: its name becomes the assistant's - one name", chatName() === "Pip" && !("name" in S.settings.pet) && petName() === "Pip");
  chatNameSet("");
  petPaint(); await sleep(100);
  check("while the chat is open the pet is in it, not in its corner", $("pet") && $("pet").classList.contains("inchat"));
  closeChat(); await sleep(150);
  check("...and comes back out when the chat closes", !$("pet").classList.contains("inchat"));
  const pb = $("petBtn").getBoundingClientRect();
  pev($("petBtn"), "pointerdown", pb.left + 20, pb.top + 20); pev($("petBtn"), "pointerup", pb.left + 20, pb.top + 20);
  await sleep(150);
  check("clicking the pet is talking to it: the chat opens", chatBox.classList.contains("on") && $("pet").classList.contains("inchat"));
  closeChat(); await sleep(100);
  PET.until = 0; chatBox.classList.add("busy"); petSync();
  check("an answer on its way with the chat closed: the pet thinks, with the panel's own sprite",
        ($("petBtn").querySelector("img.pxl") || {}).getAttribute("data-pix") === pixKey("think"), ($("petBtn").querySelector("img.pxl") || {}).getAttribute("data-pix"));
  chatBox.classList.remove("busy"); petSync();
  chatBot({ say:"The **restart** finished at 22:14 and the queue is empty.", via:"flow" });
  check("an answer that arrives while the chat is closed: the pet says so", $("pet").classList.contains("news") &&
        /Your answer is ready/.test($("petSay").textContent) && /restart finished at 22:14/.test($("petSay").textContent) && !/\*\*/.test($("petSay").textContent),
        $("petSay").textContent);
  $("petSay").click(); await sleep(150);
  check("...a click on what it said opens the chat, and the news is read", chatBox.classList.contains("on") && !$("pet").classList.contains("news") && !PET.act);
  closeChat(); await sleep(100);
  const alertT = S.tasks.find(t => LIVE.indexOf(t.status) >= 0);
  if (alertT){
    alertFire(alertT, Date.now());
    check("a bell alert is said by the pet too, and a click opens the record", $("petSay").textContent.includes(alertT.code) && typeof PET.act === "function");
    petHush();
  }

  openChat(); await sleep(600);      /* past its slide in */
  check("the panel opens docked, as wide as ever", chatBox.dataset.place === "dock" && Math.round(chatBox.getBoundingClientRect().width) === 452 &&
        document.body.classList.contains("chatting"), chatBox.getBoundingClientRect().width);
  const grip = chatBox.querySelector('.chgrip[data-g="w"]'), r0 = chatBox.getBoundingClientRect();
  pev(grip, "pointerdown", r0.left + 3, 300); pev(document, "pointermove", r0.left - 120, 300); pev(document, "pointermove", r0.left - 248, 300); pev(document, "pointerup", r0.left - 248, 300);
  await sleep(350);
  const wide = Math.round(chatBox.getBoundingClientRect().width);
  check("dragging its left edge makes it wider, and the work makes room", Math.abs(wide - 700) <= 2 && chatUI().dockW === wide &&
        Math.round(parseFloat(getComputedStyle(appEl).paddingRight)) === wide, wide + " " + chatUI().dockW + " " + getComputedStyle(appEl).paddingRight);
  grip.dispatchEvent(new KeyboardEvent("keydown", { key:"ArrowLeft", bubbles:true }));
  check("...and so does the keyboard on that edge", chatUI().dockW === wide + 32, chatUI().dockW);
  $("chatPlace").click(); await sleep(100);
  check("the frame button offers three places, the current one ticked", !$("chatPlaceMenu").hidden &&
        $("chatPlaceMenu").querySelectorAll("[data-place]").length === 3 &&
        $("chatPlaceMenu").querySelector('[aria-checked="true"]').dataset.place === "dock");
  $("chatPlaceMenu").querySelector('[data-place="float"]').click(); await sleep(350);
  let fr = chatBox.getBoundingClientRect();
  check("floating: a window over the work, which is not squeezed", chatBox.dataset.place === "float" && $("chatPlaceMenu").hidden &&
        !document.body.classList.contains("chatting") && Math.round(fr.width) === 480 && parseFloat(getComputedStyle(appEl).paddingRight) === 0, JSON.stringify(fr));
  const hb = chatBox.querySelector(".chh .chid").getBoundingClientRect();
  pev(chatBox.querySelector(".chh .chid"), "pointerdown", hb.left + 4, hb.top + 4); pev(document, "pointermove", hb.left - 200, hb.top + 24); pev(document, "pointerup", hb.left - 200, hb.top + 24);
  const se = chatBox.querySelector('.chgrip[data-g="se"]').getBoundingClientRect();
  pev(chatBox.querySelector('.chgrip[data-g="se"]'), "pointerdown", se.left + 4, se.top + 4); pev(document, "pointermove", se.left + 84, se.top - 36); pev(document, "pointerup", se.left + 84, se.top - 36);
  await sleep(300);
  const fb = chatUI().floatBox, f2 = chatBox.getBoundingClientRect();
  check("...moved by its top bar and resized from a corner, both kept", fb && fb.x === Math.round(fr.left - 204) && fb.w === 560 &&
        Math.abs(f2.left - fb.x) < 1 && Math.abs(f2.width - 560) < 1 && Math.abs(f2.height - fb.h) < 1, JSON.stringify(fb) + " " + JSON.stringify(f2));
  chatPlaceSet("full"); await sleep(350);
  fr = chatBox.getBoundingClientRect();
  check("full screen: the whole window, the conversations in a column of their own", chatBox.dataset.place === "full" &&
        fr.width === innerWidth && fr.height === innerHeight && chatBox.classList.contains("convos") &&
        getComputedStyle(chatBox.querySelector(".chside")).position === "relative", JSON.stringify(fr));
  const colL = $("chatLog").getBoundingClientRect(), colPad = parseFloat(getComputedStyle($("chatLog")).paddingLeft);
  check("...and the thread in a readable column down the middle", colL.width - 2 * colPad <= 862, colL.width + " " + colPad);
  chatBox.querySelector(".chh .chid").dispatchEvent(new MouseEvent("dblclick", { bubbles:true })); await sleep(250);
  check("a double-click on the top bar goes back to where it was", chatPlace() === "float" && !chatBox.classList.contains("convos"));
  chatPlaceSet("full"); await sleep(100);
  if (typeof saveNow === "function") await saveNow(true);
  const keptUI = JSON.parse(await (await (await ws.getFileHandle("dossier.json")).getFile()).text()).settings.chatUI;
  check("the place, the docked width and the window are saved with the workspace", keptUI.place === "full" && keptUI.dockW === wide + 32 &&
        keptUI.floatBox && keptUI.floatBox.w === 560 && keptUI.placeBack === "float", JSON.stringify({ place:keptUI.place, dockW:keptUI.dockW, floatBox:keptUI.floatBox }));
  /* as it would be on the next start: the panel put where it was */
  closeChat(); delete chatBox.dataset.place; chatBox.classList.remove("convos");
  openChat(); await sleep(300);
  check("...and the panel opens there next time", chatBox.dataset.place === "full" && chatBox.classList.contains("convos"));
  const recT = S.tasks[0];
  if (recT){
    openDrawer(recT.id); await sleep(300);
    check("a record opened over the full-screen chat comes up on top of it",
          +getComputedStyle($("drawer")).zIndex > +getComputedStyle(chatBox).zIndex, getComputedStyle($("drawer")).zIndex);
    document.dispatchEvent(new KeyboardEvent("keydown", { key:"Escape", bubbles:true })); await sleep(250);
    check("...and Esc puts the record away first, leaving the chat open", !$("drawer").classList.contains("on") && chatBox.classList.contains("on"));
  }
  chatPlaceMenu(true); $("chatPlaceMenu").querySelector("[data-placereset]").click();
  chatPlaceSet("dock"); await sleep(300);
  check("'Reset the size and position' puts the usual width back", !("dockW" in chatUI()) && !("floatBox" in chatUI()) &&
        Math.round(chatBox.getBoundingClientRect().width) === 452 && document.body.classList.contains("chatting"),
        JSON.stringify({ dockW:chatUI().dockW, floatBox:chatUI().floatBox, w:chatBox.getBoundingClientRect().width, chatting:document.body.classList.contains("chatting") }));
  return { checks };
})()
