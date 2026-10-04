# CLAUDE.md — working on KalKech (កាលកិច្ច)

Read this first. It is the hand-over from earlier Claude Code sessions: what
this project is, how it is built, the rules the owner has set, how to test,
and what has been done recently. `README.md` is the full manual,
`CHANGELOG.md` the release history.

## What KalKech is

A records desk for one application-support engineer: tickets/tasks
("records"), routines, scripts, runbooks, notes, an incident history, and an
assistant. It runs **in the browser from a local folder** — no server, no
account, no cloud. (The app was called *Dossier* until 4.8 and *Resolv* from
4.8 to 5.12; many identifiers still say `dossier`/`Dossier`, and code
comments still say Resolv. The visible name is **KalKech**, in Khmer
**កាលកិច្ច**. The Khmer name was shown beside the wordmark in 5.13 and taken
out of the header in 5.14 at the owner's request.)

The owner uses it at work, on Windows, in Edge/Chrome, started with
`KalKech.bat` (`Resolv.bat` and `Dossier.bat` pass through to it). Their company network blocks unknown outside services and they
are careful not to attract attention from their security team.

## The pieces

| File | What it is |
|---|---|
| `dossier.html` | **The app**: one file, ~27,700 lines of vanilla JS + CSS, no build, no framework. CSP allows only `connect-src http://127.0.0.1:*`. |
| `chat.js` | The local assistant: plain-English questions answered on the PC (`window.DossierChat`). |
| `assist.js` | Assist tab arithmetic. |
| `flow.js` | Client for the optional Power Automate flow (the AI): `ACTIONS` table (every action the model may request), `validate()` of replies, `buildRequest()`, `fillPrompt()`, and `PROMPT_BUILTIN` (an embedded copy of `flow/prompt.txt`). `window.DossierFlow`. |
| `diagram.js` | **New in 5.11** — draws ```` ```mermaid ```` blocks (flowchart / graph TD·LR·BT·RL, sequenceDiagram, stateDiagram-v2) as SVG: `parse()`, layered layout (ranks doubled so arrow labels get their own place), `render(model, {measure, theme})`, `draw()` → `{ok, svg, boxes, kind}` or `{ok:false, error}`. Pure; `window.DossierDiagram` and `module.exports`. |
| `sources.js` | **New in 5.9** — answering from runbooks/standards: passages, BM25 search, citations, and `ground()`, the check that holds back invented figures. Pure; `window.DossierSources` and `module.exports`. |
| `ocr.js` | Optional text recogniser for pictures and scanned PDFs. |
| `flow/relay.html` | The **only** page that touches the network: a sandboxed iframe that posts to the flow URL. |
| `flow/prompt.txt` | The model's instructions, with `{message} {today} {weekday} {calendar} {workspace} {actions} {history} {memory} {attached} {sources}` filled in per question. A user's own copy can live in the workspace as `dossier-prompt.txt`. |
| `flow/*.md` | Guides: `CONTRACT.md` (request/reply/actions), `POWER-AUTOMATE.md`, `BAU-RUNBOOKS.md`, `SOURCES.md` (setup + troubleshooting for Sources), `SPEED.md`, `SERVICENOW.md`. |
| `scripts/bridge/DossierBridge.cs` | The tray program (C# 5, WinForms): serves the page on 127.0.0.1, keeps the workspace in SQL LocalDB when available, runs scripts. `KalKech.bat` compiles it with the Windows `csc.exe` whenever the `.cs` is newer than the `.exe`. |
| `lang/en.xml`, `lang/km.xml` | Language packs (English, Khmer). Missing keys fall back to the English `STRINGS` table in `dossier.html`. |
| `docs/` | `HOW-THE-AI-WORKS.md` (the whole AI pipeline for beginners, plus a reusable blueprint) and `how-the-ai-works.html` (the same as a self-contained picture page). Keep both in step with the code when the pipeline changes (numbers: 60 records, 10 notes, 30 lessons, 14,000 characters, 64 actions / 43 writes). |
| `tests/` | `sources.test.js` and `diagram.test.js` (node:test), `e2e/run.js` + `e2e/sources.scenario.js` (real browser), `fixtures/` (made-up documents; `make-pdf.js` regenerates the PDFs). |

A *workspace* is a folder the user picks (File System Access API):
`dossier.json` (everything), `backups/`, `tasks/<record>/` attachments,
`scripts/`, and since 5.9 `sources/` (see below).

## How the code in dossier.html is organised

- Sections are marked with banner comments: `/* ═══ NAME ═══ ... */` (e.g.
  `ALERTS`, `SOURCES`, `ASKING THROUGH A FLOW`, `THE RUN QUEUE`, `VIEW: LIBRARY`).
  Search for the banner to find a subsystem.
- **Strings**: `L("Key", {vars})` / `LE()` (escaped) read `STRINGS` (the
  English table starting around line 4440) or the active language pack. Every
  new user-visible text gets a key there. Check for missing keys with a quick
  script (collect `L("…")`/`LE("…")` keys, compare with `STRINGS`) — about 15
  "missing" keys are built dynamically and are expected.
- **State**: `S` (tasks, routines, settings, chats…), saved with `touch()`.
  `hydrate(d)` loads a document; `openWorkspace(handle, quiet)` opens a folder.
- **Chat**: `chatAsk(q, opts)` → local answers first (small talk, alerts,
  Sources intents, "about KalKech", local counting) → `flowAsk()` when a flow is
  on. `flowContext(q)` builds what goes with a question (taken synchronously
  before any await). Replies render in `chatRenderBot()`; write actions are
  confirmed one at a time (`chatQueue` / `ASK`).
- **About KalKech**: the assistant reads `README.md` and `CHANGELOG.md`
  (`aboutLoad`, `aboutForFlow`, `aboutLocal`). So **the README is also the
  assistant's manual**: every new feature needs README sections phrased the
  way people ask ("How do I …?") and a CHANGELOG entry, or the assistant cannot
  explain it.
- Comment style: long, plain-English comments explaining *why*, British
  spelling. Match it.

## Rules the owner has set (keep to them)

- **Talk to the owner in plain, simple English** (not their first language).
  Short steps, no jargon without explanation.
- **New designs are added as selectable presets; existing ones are never
  removed** (looks: Studio, Quiet, Classic, Nova; chat skins: Nebula, Lumen,
  Crimson). The one exception so far was the owner's own request in 5.14:
  the chat skins Aurora, Carbon, Ember and Paper were removed (`chatUI()`
  moves a workspace that used one to Nebula). Do not remove anything else
  unless the owner asks.
- **Nothing new may reach the internet.** Only the user's own Power Automate
  flow, through `flow/relay.html`. Telegram was tried (5.6–5.7) and **removed
  completely in 5.8** because the company blocks it and it could look
  suspicious to their security team — do not bring back outside services,
  idle/lock monitoring, or keep-awake code.
- **The repository may be public: never commit anything from the owner's
  company** — no document text, names, emails, screenshots. Test fixtures are
  made up.
- Every release: bump `APP_VERSION` in `dossier.html`, add a `CHANGELOG.md`
  entry at the top, update the README.
- Commit messages: clear summary + body; no model names in commits, code or
  docs. Do not open a pull request unless the owner asks.
- Work so far is on branch `claude/chat-panel-pixel-art-gifs-d822hq`
  (latest: 5.14.0). Follow the branch instructions of your own session.

## Testing

```
node --test                                   # 47 unit tests (Sources, grounding, flow reply fields, diagrams)
node tests/e2e/run.js                         # the app in headless Chrome/Edge: 146 checks (CHROME=<path> to choose)
node flow/check-prompt.js                     # after editing flow/prompt.txt ...
python3 flow/embed-prompt.py                  # ... then copy it into flow.js (PROMPT_BUILTIN)
node tests/fixtures/make-pdf.js               # regenerate the PDF fixtures
```

Also useful:

- **Syntax-check the big inline script** in `dossier.html` (extract the
  `<script>` without `src` and `new Function()` it in Node) after edits.
- **Bridge**: C# 5 only (no `$""`, no `?.`). Check with
  `mcs -nologo -target:winexe -langversion:5 -r:System.Windows.Forms.dll -r:System.Drawing.dll -r:System.Data.dll scripts/bridge/DossierBridge.cs`.
- **Headless browser** (in cloud sessions Chromium is under
  `/opt/pw-browsers`): serve the repo over `http://127.0.0.1`, open
  `dossier.html`, drive it over the DevTools protocol. Make a workspace in the
  browser's private storage: `navigator.storage.getDirectory()` → write a
  `dossier.json` → `openWorkspace(dirHandle, true)`. Stand in for the AI by
  replacing `DossierFlow.ask` with a function that builds the real request
  (`DossierFlow.buildRequest`) and returns a scripted reply through
  `DossierFlow.validate`. `tests/e2e/run.js` is a working example of all of it.

## Recent history (newest first)

- **5.14.0** — Eight requests from the owner in one go:
  - *Magnet dock*: `chatMoveDown` drags from any place (header, not its
    buttons). After 6 px the panel comes loose as a float under the pointer.
    `chatSnapZone(x,y)` (`CHAT_SNAP` edge 28 / top 12) gives
    `dock-left` / `dock-right` / `full` or "", previewed by `#chatSnap`
    (`.chsnap`). `chatDragUp` → `chatPlaceSet(zone)` or float; a press with
    no movement does nothing. New left dock: `chatUI.side`,
    `chatDockSide()`, `.chat[data-side="left"]`, body `chatleft` (padding on
    the left of `.app`), the `e` grip. Place keys `CHAT_PLACE_KEYS`
    (dock-right, dock-left, float, full), `chatPlaceKey()`,
    `CHAT_PLACE_STR` for the string names.
  - *Wordmark*: the Khmer `.wmk` span and its CSS removed.
  - *Icons*: every chat icon button is a flex box with a 16 px mask
    (`--ic`); the `--lmi-*` masks are on `.chat` for every skin now, not
    only Lumen. Nebula's header/clip/send glyphs became masks
    (`font-size:0`, `::before` / `::after`). `#chatPlace` uses
    `--lmi-place` everywhere. Lumen answer tools: `align-self:start`;
    `TierReasonAgain` is "Reason" so the row fits on one line. Checked by
    measuring pixels in screenshots (icon centre vs button centre, ≤1 px).
  - *Skins*: only nebula/lumen/crimson in `CHAT_SKINS` and the CSS.
  - *Code as text*: `chatFenceOpener(prev)` - a bare language word,
    `text` or `json` line is a lost fence only after an empty line, a line
    ending ":", a heading or a bold line; `chatFenceBare` also needs 2+
    code lines without one. The prompt fences code with `~~~` (no ```
    anywhere in `flow/prompt.txt`; the e2e test checks).
  - *Special days* (`SPECIAL DAYS` banner): `settings.specialDays`
    `[{id,d,n,note,c,icon,yearly,off}]`, `specialOn(key)` (yearly by
    month-day), `isOffDay` counts `off`. Week/month cells: `.wc.special`
    band `--spc`, `specialMark`, `✦` `specialAddBtn` → `spdOpen` popover
    (`#spdPop`). Setup → Special days. `dayHints` today/tomorrow.
    `spdForFlow()` → `workspace.specialDays` (−7 … +183 days, ≤60).
    flow.js `markDay` / `unmarkDay` (64 actions, 43 writes).
  - Docs: both AI guides updated (reason tier, special days, repairs).
  - The owner pushed KalKech's logo (`logo.png`, `favicon.ico`) and removed
    `assets/assistant-logo.png` (optional; the panel falls back to its
    built-in mark). There is no SVG source for the new logo in `art/`.

- **5.13.0** — Renamed to KalKech (កាលកិច្ច) and a third model. Rename: every
  *visible* "Resolv" (strings only - code comments were left alone; the
  STRINGS table, chat.js answers, flow.js messages and ACTIONS text,
  relay, prompt, bridge strings, lang packs, docs); done with a string-only
  scanner so comments/regexes/identifiers were untouched; `"Resolv Inter"`
  (font-family) kept. Packs: `.replace(/\b(?:Dossier|Resolv)\b/g,
  "KalKech")` for old pack texts. Name recognised in questions:
  `CHAT_NAME_RESET`, `ABOUT_OWN`, `ABOUT_STOP`, chat.js `about` probe (also
  the Khmer spelling, outside `\b`). `KalKech.bat` is the real starter (CRLF;
  `scripts/check-bat.py` passes); `Resolv.bat`/`Dossier.bat` pass through.
  Logo files unchanged (the owner will supply one). KalKech reason:
  `tier:"reason"` (flow.js `TIERS`, `tierOf` falls back to deep/fast unless
  `tiers.on && tiers.reason`; `BIG` records 240 with notes, conversation
  40; `workspace.tier`; timeout `tiers.reasonTimeout` ≤ 115). App:
  `flowCfg().tiers` now filled IN PLACE (`reason`, `reasonTimeout`, `hard`,
  `pick`) - it used to be replaced by a new object on every call;
  `flowModeOf(q)`; `flowAsk` picks the tier first (`opts.tier` ||
  `chatModelPick()` for chat) and builds `flowContext(q, {big})`;
  `FLOW_BIG` (msgs 40×6000, notes 30×6000, lessons 80, fixes 12, runbooks
  6, pastFixes 6, incidents 90 days, Sources k 16 / 48,000 chars via
  `srcSearch(opts.big)`); `flowTier(kind)` → reason when `hard:"reason"`;
  `chatThinking(log, tier)` text; answer footer and branches (`kind:"reason"`,
  ◆, `BranchReason`); `[data-deeper="reason"]` button (Lumen icon `bulb`).
  Composer pill `#chatModel` + `#chatModelMenu` (`.chplm.chmm`), Lumen grid
  cell row 2 / col 2; `chatModelsOn/Pick/Paint/Menu/Set`. Setup: One/Two/
  Three, `flReasonTmo`, `flHard`. Prompt line for `workspace.tier "reason"`.
  POWER-AUTOMATE.md §4g (Condition `Reason?` around the existing `Deep?`).
  mcs was not available in that session; the bridge diff is string-only.
- **5.12.0** — The owner asked for the pet and the assistant to be "the same
  person", and for a chat panel that can be wider, floating or full screen,
  remembered. Pet (`THE DESK PET`): one name - `petName()` reads
  `chatUI.name`; `petCfg()` moves an old `pet.name` into it (only when the
  assistant has none) and deletes it; the Appearance field calls
  `chatNameSet`. Click → `petTalk()` opens the chat (or runs `PET.act`, the
  news on its bubble); hover 450 ms / keyboard focus → `petSpeak()` (the day
  line, was the click). `petTell(html, act, ms)` / `petHush()` for the
  bubble (`.pet.news` dot); `petNews(r)` from `chatBot` when the panel is
  shut; `alertFire` and the look-back say it too; `petRest()` returns
  `think` (the panel's 16-px sprite, `PET_ART.think`) while `.chat.busy`,
  `petSync()` from `chatThinking`/`chatThought`. `.pet.inchat` (hidden)
  while the panel is open (`petInChat()`), replacing the old step-aside
  transform. Panel (`WHERE THE ASSISTANT SITS`, CSS block at the end of
  the stylesheet + JS after `closeChat`): `chatUI.place` dock|float|full,
  `dockW`, `floatBox {x,y,w,h}`, `placeBack`, `fullSide`;
  `chatPlaceApply()` (from `applyChatUI` and on resize) sets
  `.chat[data-place]`, `--chat-w` on :root (every old `min(452px,96vw)`
  now uses it), `--cf-*`, body `chatting` (dock only) / `chatover`
  (float/full: drawer/modal/cmd… raised above z 62; Esc closes them
  first). `.chgrip[data-g]` edges (dock: w only; keyboard ←/→; dblclick
  resets), header drag in float, header dblclick toggles full. Menu
  `#chatPlaceMenu` from `#chatPlace` (frame icon; Lumen mask
  `--lmi-place`; non-Lumen an inline SVG with a `::before` zero-width
  space so the baseline-aligned header row does not move). The panel itself
  carries `data-place`, so look up menu items with `button[data-place]`.
  Look and behaviour has "Where it sits" (`data-placepick`).
- **5.11.1** — Two reports from the owner. (1) A diagram came back as text
  ("mermaid\nflowchart TD\nA[…] --> …"): their flow's old *Clean* step
  `replace(…, '```', '')` strips every backtick fence. `chatMend` now runs
  `chatFenceDiagram` on the parts outside fences (a "mermaid" line followed
  by a `DIAG_HEAD`, or a `DIAG_HEAD` at a paragraph start; body = `DIAG_LINE`
  lines) and mends "``` lang"; the prompt fences diagrams with `~~~mermaid`
  (the unit test asserts the example has no ```). (2) "I named you elle
  okay?" was answered about the blank 1×1 placeholder picture, twice, and
  the chat was titled "Blank image placeholder". Naming is now local
  (`CHAT_NAME_SET/NOT/RESET/ASK`, `chatNameLocal` in `chatAsk` after small
  talk, `chatNameSet`, `chatName()`, `chatNameShow()` also from `applyI18n`,
  `chatUI().name`, the pet takes it, `workspace.yourName` in `buildRequest`
  and a prompt line). Placeholder retry: keep the scrubbed reply at ≥24
  chars; retry sends `q + " " + PH_NOTE` ("(no picture attached)" - a fact,
  not an order: an order is what the content filter refused in 4.6.1); a
  title about the picture is never used; `PlaceholderLost` points to
  POWER-AUTOMATE.md §4f (new: a text-only prompt in a `Picture?` Condition
  when `pictureName` is empty - the lasting fix).
- **5.11.0** — Diagrams: `chatSay` sends a fence tagged mermaid/diagram/
  flowchart/… (or an untagged one starting `flowchart|graph|sequenceDiagram|
  stateDiagram`, `diagLooks`) to `chatDiagramCard` → `.chdiag` card (Copy
  picture via `ClipboardItem` PNG, Save via a blob download, Larger =
  `#dgView` overlay with zoom, Code toggle); failure falls back to the code
  block with `.dgfail`. Colours: `--dg-*` on `.chat` mixed from `--ch-*`
  (Lumen family uses `--lm-card`); a copy/save resolves them with a probe
  (`diagTheme`) and `render({theme})` writes a `<style>` into the SVG. Text
  is measured with a canvas (`diagMeasure`) in `DossierDiagram.FONT`. Prompt:
  when to draw, three kinds only, small. Also: `.chseed` wraps (was nowrap +
  hidden scroll bar); the suggestion is folded (`.sugsum`, `r.sugOpen`,
  `sugToggle`); `.chat .chf textarea:focus-visible{outline:none}` against
  Nova's global focus ring inside the composer.
- **5.10.0** — Crimson chat skin: red `#d31145` and white, with a heart
  character. It is named and drawn as Resolv's own — no company name, logo
  or slogan anywhere in the repository; keep it that way. Lumen's layout rules
  are scoped `.chat[data-lm]` (set by `applyChatUI` for skins with `lm:true`
  in `CHAT_SKINS`, checked with `chatLm()`); Lumen keeps its colour tokens on
  that rule, Crimson overrides them in the `CRIMSON` block after `/LUMEN`
  (marks `--lm-mark*`, heartbeat `--cr-ecg*`, red send/primary). A skin's
  pixel set: `art:"crimson/"` → `chatArtSet()` → `pixKey(name)` used by
  `pixArt`, `chatOrbPix`, the slow swap; `petRedress()` and `chatPaint()` on
  a skin change. Marks: `CHAT_MARKS` + `chatMarkApply()` (Crimson ignores the
  shipped `assets/assistant-logo.png`; `assets/crimson-mark.png` overrides).
  `art/make-pixel-art.py`: `gif(…, pal)`, `PAL_CRIMSON`, hand-drawn `HEART`
  /`HHEAD` (do not reuse the robot's `HEAD` name), `write_set`; robot GIFs
  must stay byte-identical. The CSS source was generated with marks as SVG
  data URIs; edit the block in place.
- **5.9.5** — Reported (made-up wording here): "here is the fix for D-0153 ·
  Steps: … exactly 5 years after the start date … please close it with these
  steps" was
  *held back* (the record was closed anyway, confirm off). Causes: "policy
  number" (insurance) made `isDocQuestion` true, and the reply repeated the
  user's own figure. Now `NOT_DOC` strips insurance-policy phrases before
  `DOC_Q`; `ground(reply, pack, q, own)` accepts a figure in the user's own
  message (`statedIn`: statements only, never question sentences; only when
  the reply cites no passage) or in a matched runbook (`own` from
  `srcOwnTexts(ctx.runbooksMatched)`), new status `own` ("From your
  runbook: X" · *Yours*, `srcrunbook` action opens it); a reply with record
  actions (`SRC_JOB_ACTIONS`) and no cite gets no box. `setStatus` /
  `updateRecord` take `resolution` → `fixSet()` (also used by `fixSave`), set
  before the status so `fixAsk` does not pop up. The held-back text never
  shows the doubted figure (a regression test checks it). Prompt: runbooks
  are their procedures (follow, say so); a job with their content cites
  nothing; closing example (made up, "Member Portal", 5 years). The owner's
  portal URL and wording were never committed.
- **5.9.4** — Sources for ~100 documents. The panel (`srcPanelHtml`) is a
  table: `srcRowHtml` rows (tick `[data-ss]`, name button `data-sa="view"`,
  meta line, kind, passages, status, `⋯` `[data-sm]`), a sticky header, the
  list scrolling inside the panel (`container-type:inline-size`, `@container`
  640/420). Search box `#srcFind`, chips `[data-sf]`, sort `#srcSort`
  (`cfg.sort`; category/kind grouped under `.srcgrp`), fold `#srcFold`
  (`cfg.panelOpen`). Filtering toggles `hidden` (`srcFilter`) - no redraw, so
  the box keeps its focus. View state in `srcUi()` (`q`, `st`, `sel`). One
  `#srcMenu` on `<body>` (`srcMenuOpen`, fixed position: a fixed element
  inside a `container-type` parent is positioned against that parent). Bulk
  bar `#srcBulk` → `srcBulk(what)`; bulk on/off touch only inactive/active
  documents, never superseded ones. Several files → `srcAddMany` →
  `srcDetailsMany` (one dialog, `sm*` ids) → `srcStore(…, batch)` then one
  save and one rebuild. Names: `plainTitle`, `detectMeta().titleFrom`
  (front/heading/line; an all-bold first line is a heading), `nameFor(…,
  from)`, `betterName` mends old names on `srcLoad` (not `d.named`). The
  worked example in the prompt is change management (it was passwords: the
  owner asked whether the work was password-only - it never was; tests now
  include a mixed library).
- **5.9.3** — A slimmer chat. The sources box under an answer
  (`srcAnswerHtml`) starts folded to one line (`.srcsum`: document · page,
  confidence, chevron); `srcToggle` opens it and stores `r.srcOpen` with the
  answer; warnings stay on the line; `blocked` opens by default; the
  suggestion stays outside. The "you" bubble shows each sent file as a card
  (`chatFilesPaint`): kept docs open in `srcView` (`all:true` for whole text
  docs), session files open in `chatFileView` from `CHAT.msgFiles[msg.at]`,
  pictures keep a 200 px JPEG `thumb` on the message; **Hide** sets
  `m.filesMin`. `srcKeepFromChat` now runs before `chatPush`, so the message
  records `srcId`; older messages find their doc by file name
  (`chatSrcByName`). Card classes are `cfcard/cfic/cftx/cfnm/cfmt` — `.mt`
  and `.tx` are taken elsewhere in the stylesheet.
- **5.9.2** — A right answer was hidden because of one line: asked about a
  (public, downloaded) password standard, the reply quoted the rule correctly
  but one line gave a figure no cited passage had, so the whole reply was
  replaced by "The documents searched do not specify this". Now
  `DossierSources.ground()` takes out only the sentences/list items/rows with
  such a figure (`trimSay`), status `partial` (Medium) when a grounded answer
  is left, `blocked` only when nothing is; the blocked message no longer claims
  the documents are silent and shows "What they do say"; "Figure seen in"
  links to where the figure is written in an uncited passage (`uncited[].at`).
  PDF running headers/footers (same words, same place, on 60% of pages; only
  the page number ignored) are left out of passages and are never headings;
  `META_LINE`, control-reference runs, web addresses, cut-off lines and
  tab-split rows are not headings (ALGO 2 → documents re-cut on open).
  Typo-tolerant search (`nearTerm`, `editWithin`) and `isDocQuestion`;
  rule-bearing passages lifted (`RULE_CUES`); no synonyms for a word already
  in most passages; word pairs stop at sentence ends and at a new line that
  starts with a capital. Prompt: cite every passage a figure comes from; lead
  with the everyday case when rules differ by case. Fixture
  `access-password-standard.pdf` (made up, from `make-pdf.js`, which now also
  exports its pages for the unit tests). The owner's real PDF was tested
  locally only, never committed.
- **5.9.1** — `[study]`/`[teach]`/`[intake]`/look-back replies are never
  held back; instead draft runbooks/notes/profiles are checked against the
  document they came from and a figure it does not state is shown on the
  draft's "Save it?" ("⚠ Not in the document: 4 hours"). PDFs kept from chat
  are named after their file unless the first line is a real title (a logo
  like a company acronym is not). A figure whose number and unit are in the
  cited passage but not adjacent (PDF table read by column) is accepted at
  Medium confidence.
- **5.9.0 — Sources: answers from the documents, with citations.** Root cause
  fixed: an attached guideline used to travel with one question only, `[study]`
  rewrote it in the model's words, and the model answered a missing
  remediation timeframe with "4 hours" (Resolv's own P1 target in
  `workspace.policy`). Now:
  - **Library → Sources** keeps documents (PDF/MD/DOCX/TXT) in
    `sources/`: `catalog.json`, `<id>/<original>`, `<id>/text.txt`,
    `<id>/chunks.json`. Add dialog (name, version, effective date, systems,
    environment, category, access label, "may go to the assistant"), new
    version detection (replace → old becomes *superseded* / keep both / separate
    — never "newest upload wins"), Re-index (diff by passage), Switch off,
    Remove, diagnostics log ("Recent searches and changes", no document text).
    Documents attached in chat are kept too (⊕ Sources chip).
  - Every question searches active, cleared documents (`srcForFlow`) and sends
    labelled passages S1… in `{sources}`; follow-ups search again with the
    previous question; a named system/environment/document/version filters.
  - Prompt section *THEIR DOCUMENTS (SOURCES)*: answer only from passages, no
    figure not stated, no carrying a P1 target to a vulnerability, show
    conflicts, `cite` / `confidence` / `suggest` in the reply.
  - `srcApply` → `DossierSources.ground()`: quotes must be in the cited
    passage; figures in `say` must be in a cited passage, else the answer is
    **held back**. UI: Answer / Source (clickable → viewer with lines marked) /
    Evidence / Confidence / Suggestion / Searched. Local answers to "which
    source supports this answer?" and "why was it not found?". No flow → the
    passages themselves.
  - Search is lexical (BM25 + synonyms), deliberately: no embedding service
    (nothing new leaves the PC). 150 docs index in ~0.3 s, search ~2 ms.
- **5.8.0** — Telegram removed completely (relay page, setup, token wiped from
  workspaces on open, bridge restored to its 5.5.0 content). Bell alerts stay,
  on screen only.
- **5.7.0** — Per-record alerts: bell on each row and on the record sheet (at
  due time, 15 min/1 h before, or a custom time); the assistant can
  `setAlert` / `clearAlert`.
- **5.6.0** — The assistant knows Resolv itself (README/CHANGELOG as
  `workspace.app`, local "what's new?"). (Its Telegram half was removed in 5.8.)
- **5.5.0 / 5.4.0** — Lumen chat skin and its animated icons.
- Before that (see CHANGELOG): saving hardened (SQL sections, never emptied),
  chat branches (Think harder/Retry), copy-ready text cards, AI chat titles,
  Word document reader and pictures inside PDFs/Word, Nova look, the assistant
  seeing the open record/selection, rename to Resolv, learning from ratings and
  fixes, two-model flow, the prompt as a file.

## Known gaps and ideas not done

- The grounding rules are tested with a stand-in flow; the owner confirmed
  they work with their real flow, but keep testing answers that come from
  tables in real PDFs (layout varies).
- The owner mentioned editing the prompt locally. If they edited
  `flow/prompt.txt` in their Resolv folder, an update will conflict — offer to
  merge their change into `flow/prompt.txt`, or keep it as `dossier-prompt.txt`
  (which must keep the SOURCES section and `{sources}`).
- New strings (Sources, alerts) exist only in English; `lang/km.xml` falls
  back to English for them.
- Possible next steps: a `needSources` action (the model asks for a second
  search, like `needRecords`), per-document "check the answer" workflow,
  Khmer strings for the new features.
