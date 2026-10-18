# KalKech's assistant as an API — a plan for ABP (.NET 10 + Angular)

*A plan, not code yet. The owner asked (October 2026) to see how KalKech's
assistant works when it is built as an ordinary back end and front end: an
ABP solution with an Angular app, on .NET 9 or 10. This file says how the
chat works today, how each part becomes C#, and the order to build it in.
Nothing here changes KalKech itself.*

Read it beside [HOW-THE-AI-WORKS.md](HOW-THE-AI-WORKS.md) (the whole pipeline
in plain English) and [../flow/CONTRACT.md](../flow/CONTRACT.md) (exactly what
is sent and what may come back).

---

## 1. The goal

- **A Web API** (C#, ABP) that does everything `dossier.html` does around
  the AI model: answer easy questions itself, choose the right data, fill in
  the prompt, pick the model, call it, check the reply, keep what it learns.
- **An Angular chat page** that draws answers the same way KalKech does: code
  cards, email cards, diagrams, the sources box under an answer, and a
  Yes / No card before any change.
- **A Trace view**: every step of one question, with what was chosen and how
  long it took. This is the point of the exercise — to *see* how it works.
- **The same rules** as KalKech (section 12): no new outside service, every
  change waits for a yes, answers about documents are checked against the
  documents.

---

## 2. Which template

Two products called "ABP" can be downloaded with an Angular front end:

| | ASP.NET Boilerplate | ABP Framework |
|---|---|---|
| Get it | aspnetboilerplate.com/Templates (a zip); source on GitHub, `aspnetboilerplate/module-zero-core-template` | `abp new` (the ABP CLI, a dotnet tool) or ABP Studio, from abp.io |
| Latest seen (Oct 2026) | v10.5.1 | 10.7.0 |
| .NET | .NET 9 (v10.0 was "Upgrade to .NET 9"; later notes still name 9.0.x packages — check `TargetFramework` after download) | .NET 10 |
| State | the older one, kept up to date | the newer one, from the same company |
| AI | nothing built in | documents an `IChatClient` integration (Microsoft.Extensions.AI) and the Microsoft Agent Framework |

**.NET 9 is supported only until 10 November 2026** (Microsoft lengthened
short-term support to 24 months, so it ends the same day as .NET 8). .NET 10
is long-term support, until November 2028.

**Recommendation: ABP Framework 10.x — layered solution, Angular UI, Entity
Framework Core, SQL Server.** ASP.NET Boilerplate works too, because of the
next point.

**The assistant goes in its own class library with no ABP in it**
(`KalKech.Assistant`). ABP gives the login, users, database, API and the
Angular shell; the library is the brain. So:

- the template can be swapped (Boilerplate today, ABP Framework tomorrow) by
  moving one project;
- the brain is tested with plain unit tests, no web server, no database;
- the same library could later serve another front end (a Teams bot, a
  console) unchanged.

Practical notes:

- The PC that runs it needs the **.NET 10 SDK** and **Node.js** (for
  Angular). On the work PC that may need admin rights — try at home first.
- In a cloud session `abp.io` could not be reached (the session's network
  blocks it). The ABP Framework app template is also on GitHub
  (`abpframework/abp`, `templates/app`), and its packages are on nuget.org;
  or the owner runs `abp new` on their own PC and pushes the result.

---

## 3. How the chat works today

It is **not trained**. The AI model never changes and remembers nothing
between questions. What makes it good is what KalKech does *around* the
model, for every question:

| # | Step | What happens | Where in KalKech |
|---|---|---|---|
| 1 | Front door | Answer on the PC when no AI is needed: "hi", "what's overdue?", "what's new?", "which source supports this?", "I named you Elle" | `chatSmallTalk`, `chatLocalFirst`, `chatNameLocal`, `chat.js` |
| 2 | What it is about | The typed words, plus the *telling words* of any attachment, plus — for a vague follow-up ("what do you mean by step two?") — the last question's words, the title, the summary and the last answer | `flowMatchText`, `flowVague`, `DossierSources.keyTerms` |
| 3 | Choose the model | Fast, strong or reason, by rules (4.4) | `DossierFlow.tierOf`, `chatModelPick`, `flowTier` |
| 4 | Gather | Only what this question needs, with a limit on everything (4.2, 4.6) | `flowContext`, `pickRecords`, `srcForFlow` → `DossierSources.search` / `gather` |
| 5 | Pack | Fill the blanks of one text file, the prompt | `flow/prompt.txt`, `fillPrompt`, `buildRequest` |
| 6 | Send | One door out: the relay page → the owner's Power Automate flow, which reads `prompt` and `tier` | `flow/relay.html`, `DossierFlow.ask` |
| 7 | Check | Shape, allowed actions, one more round if asked, mend lost fences, quotes and figures against the passages, where each code block came from, unknown names | `DossierFlow.validate`, `flowNeedsSources`, `chatMend`, `DossierSources.ground`, `codeOrigin`, `unknownNames` |
| 8 | Show and ask | Cards for code / email / diagram; sources box; every change waits for a yes | `chatRenderBot`, `chatSay`, `chatTextCard`, `chatDiagramCard`, the confirm queue |
| 9 | Learn | Lessons, notes, 👎 corrections (kept as checks), "how was it fixed?", the daily look back | the `LEARNING` sections of `dossier.html` |

The time is almost all in step 6 (5–10 seconds). Steps 1–5 and 7–8 take
milliseconds. That is why KalKech's speed work has always been *send less,
and do not call the AI when you do not need to*.

---

## 4. Each part, and how it becomes C#

### 4.1 "Training" on documents — it is search, not training

**Today** (`sources.js`):

1. **Read once**, when a document is added: PDF pages, Word, Markdown, text.
2. **Cut into passages** ("index cards") of about 1,100 characters
   (`CHUNK_TARGET`, at most 1,800), never across a page. Each knows its
   page, lines and section heading. Page headers and footers that repeat on
   most pages are left out (`furnitureOf`).
3. **Index** the words of every passage (an inverted index: word → passages).
4. **Every question**: search the index (4.6), send the best passages,
   labelled S1, S2… with document, version, page, lines and section.
5. **Learn from a document** (`[study]`) writes *draft* runbooks from it;
   each draft is checked against the document ("⚠ Not in the document:
   4 hours") and waits for approval.

**In .NET**: `DocumentReader` (PDF with UglyToad.PdfPig, which gives text
with page numbers and positions; Word with DocumentFormat.OpenXml; Markdown
and text line by line), `Chunker`, `PassageIndex` (in memory, rebuilt from the
database at start and updated when a document changes — 150 documents index in
well under a second), `SourceStore` (originals in ABP blob storage, passages in
`SourcePassage` rows).

### 4.2 About your work

**Today**, each question carries (limits in brackets; bigger for Reason):

- **The brief** (`workspace.brief`, "About my work"): team, systems, servers,
  people, the words they use. Written by `[brief]` from what the app knows,
  edited by the owner. When a new fact shows up, the model proposes
  `addToBrief` — it waits for a yes.
- **Lessons** (30 newest, plus corrections that match): style, preferences,
  habits, systems, gaps.
- **Notes** (10 that match, in full; the rest by title).
- **Records** (60 that match best, **plus totals of all**, so "how many?" is
  still right), the open record and the selection in full.
- **Runbooks** (2–3 matching, in full), **scripts** (3 matching, with their
  text), **past fixes** (3 closed records most like this one), **incidents**
  (30 days), **special days**, today, tomorrow, the next working day.
- **Words**: "when I say the portal I mean CX Portal".

**In .NET**: `ContextBuilder` builds the same `workspace` JSON as
`flow.js buildRequest`, from EF Core entities (section 7). Ranking is plain
word scoring (`RecordRanker`, after `pickRecords`), not another AI call.

### 4.3 Prompting

**Today**: `flow/prompt.txt` is a form with blanks — `{message} {today}
{weekday} {calendar} {workspace} {actions} {history} {memory} {attached}
{sources}` — and sections of rules: who you are talking to, the allowed
actions, their documents, *what to trust, in this order*, the reply's JSON
shape, how to talk, support work, how-to guidelines, learning, modes, files,
then worked examples. Three things make it work:

- **Rules in plain words**, written as facts, not shouted orders (orders
  inside data trip the content filter).
- **Worked examples of perfect replies** — the model copies examples more
  than it follows rules, so `flow/check-prompt.js` checks every example
  passes KalKech's own checks.
- **Read fresh before every question**; the owner's own copy
  (`dossier-prompt.txt`) wins over the shipped one.

**In .NET**: `PromptTemplate` loads the file (the owner's copy, else the
shipped one) on each question, fills the slots and reports any slot missing.
**Keep the same request JSON**, so the same prompt and the same Power
Automate flow work unchanged — and a parity test can compare the C# request
with the JavaScript one for the same question.

### 4.4 Automatic model choice

**Today** there are three models ("tiers"):

| Tier | Used for | What it is sent | Waits up to |
|---|---|---|---|
| **fast** | everyday chat | the normal limits | 30 s |
| **deep** (strong) | the jobs ticked in Setup: look back, study, teach, Diagnose; **Think harder** under an answer | the normal limits, with notes and logs of records | up to 115 s |
| **reason** | only when chosen: the pill beside Send, or **◆ Reason** under an answer (or the ticked jobs, when Setup says so) | the **big** limits: 240 records, 40 messages, 30 notes, 80 lessons, 6 runbooks, 6 scripts, 16 passages / 48,000 characters, 90 days of incidents | 115 s |

**Auto** = rules, not an AI: the kind of question (`[study]`, `[reflect]`,
`[teach]`… or plain chat) and Setup decide. A picked model wins for typed
questions; asking for reason when the flow has no reason model falls back to
the strong one. Rules are instant and predictable — the same question always
goes to the same model.

**In .NET**: `ModelRouter.Pick(mode, pick, settings)` → `Tier`, and
`Budget.For(tier)` → the limits `ContextBuilder` uses. The tier is chosen
**before** gathering, because it decides how much is gathered. (A later idea,
off by default: upgrade automatically on signals such as a very long
attachment.)

### 4.5 Answer sections: code, email, text, diagram

**Today**: the model writes `say` as Markdown with fenced blocks tagged by
kind — `~~~sql`, `~~~email`, `~~~teams`, `~~~mermaid` (tildes, because the
flow's old *Clean* step strips backtick fences). Then:

1. `chatMend` puts back fences that were lost or bent on the way.
2. `chatSay` splits the text:
   - **code** (sql, powershell, csharp, json…) → code card: language, Copy,
     and a label saying where it came from — *From your script: …*, *From
     your document: …*, or **⚠ written by the assistant, check it before you
     run it** (`codeOrigin`: 4-word shingles, values ignored, ≥ 60% match);
   - **text kinds** (email, message/teams, note, reply, draft, letter,
     update, summary) → text card with Copy; an email's `Subject:` line is
     shown on its own line with its own Copy, and left out of the body;
   - **mermaid** (flowchart, sequence, state) → drawn on the PC as a picture
     (`diagram.js`): Copy picture, Save, Larger, Code;
   - **prose** → headings, bold, lists, tables, links — the text is
     **escaped first**, so nothing from the model can become HTML.
3. Around it: `ask` + `choices` as buttons, the sources box (folded to one
   line), the suggestion (marked as not from their documents), Yes / No
   cards for changes, and the tools row (time, model, 👍 / 👎, Retry, Think
   harder, Reason).

**In .NET**: the server does steps 1–2 (`ReplyMender`, `BlockSplitter`,
`CodeOriginCheck`) and returns `blocks[]` already split and labelled. Angular
has one small component per kind. `diagram.js` is pure JavaScript with
`module.exports`, so Angular can use it as it is (same drawings, no new
dependency, works offline).

### 4.6 Choosing the documents that fit the question

**Today** (`DossierSources.eligible`, `search`, `gather`):

1. **Which documents may be searched**: active ones the person is cleared for
   and that "may go to the assistant"; a chat's own attachment only in that
   chat; a document or version named in the question ("version 1.2 of the
   access standard"); a system, environment or category named — documents
   about a different one drop out, documents about none stay; of several
   active versions, the current one when the dates prove it, else all of
   them, flagged.
2. **Score each passage** with **BM25** (`K1 = 1.2`, `B = 0.75`): rare words
   count more than common ones; a word repeated many times stops counting
   more; words in the passage's heading count double, the document's name a
   little; two words side by side in one sentence ("internet facing") count
   as a pair too.
3. **Help the words find each other**: a short list of synonyms (fix /
   remediate / resolve…, timeframe / deadline / within / SLA…), but none for
   a word already in most passages (it is found plenty without them); a
   mistyped word is read as the nearest word the documents use ("stardard" →
   "standard"); passages that *set a rule* ("must", "minimum", "within 30
   days") are lifted a little (`RULE_CUES`).
4. **Keep the good ones**: at least 30% of the best score, and covering
   enough of the question's words; at most 4 from one document before the
   others get a turn (the spread); 6 passages (16 for Reason).
5. **Add the neighbours** of the best three (the passage before and after,
   in the same section) so a table keeps its heading and a rule keeps its
   "unless".
6. **Fit the budget**: 14,000 characters (48,000 for Reason); a document
   attached in this chat goes first, whole when it fits.
7. **Label** S1… in reading order, documents ordered by their best passage.
8. If the model still sees nothing about the request, it may answer
   `needSources` with better words — **one** more search, then it must
   answer.

Why not an AI to choose? It would have to read everything first: two slow
calls instead of one. Why not embeddings? They need an embedding service — a
new thing leaving the PC. Plain word search takes about 2 ms and gives the
same passages for the same question every time.

**In .NET**: `SourceFilter`, `PassageSearch` (BM25 + synonyms + typo +
rule cues + spread), `PassageGatherer` (neighbours, budget, labels),
`PassagePacker` (the `{sources}` text, as `packText`). Port the cases in
`tests/sources.test.js` and the made-up documents in `tests/fixtures/`.
Optional later: add a *local* embedding model (run in the process with ONNX
Runtime, no network) and mix its scores with BM25.

### 4.7 One answer from several documents

The model writes the combined answer; KalKech decides **what it may
combine** and **checks the result**:

- All passages travel in **one** SOURCES block, each with its document,
  version, page and section, so the model can tell them apart.
- The prompt says: answer only from the passages; cite every passage a figure
  comes from; confidence **high** when one passage says it, **medium** when it
  follows from several together (and say how), **not_found** when they do
  not say; when passages **disagree**, give both, each cited — never pick one
  silently; when rules differ by case, lead with the everyday case and give
  the others briefly; your own advice only in `suggest`.
- **Order of trust**: a document attached in this chat → their documents →
  their runbooks → their scripts → past fixes, incidents, notes, lessons
  (supporting only) → general knowledge (only in `suggest`). Earlier answers
  are never evidence.
- The check (4.8) then verifies every quote and figure against the passages
  the answer cites.

**In .NET**: the same prompt sections and the same `Grounding` check — no new
code for "combining" itself; it is the prompt plus the check.

### 4.8 Checks before the answer is shown

**Today**, nothing the model sends is trusted:

1. **Shape**: JSON with `say`, `ask`, `choices`, `actions`, `cite`,
   `confidence`, `suggest`, `thread`, `title`; plain text accepted as `say`.
2. **Actions**: only the 65 in `flow.js ACTIONS`, each field checked (a
   date is a date, a record exists); others refused by name.
3. **Safety net**: if the flow's fallback answered, ask once more with the
   essentials.
4. **One more round** at most: `needRecords` or `needSources`.
5. **Blank-picture answers** taken out (a Power Automate quirk).
6. **Lost fences** mended.
7. **Where each code block came from** (4.5).
8. **Names**: every script, table or procedure name in the answer is looked
   for in what was sent; names found nowhere are listed as a warning.
9. **Grounding** (`ground`): each quote must be in the passage it cites;
   each figure (days, hours, %, P1, severity…) must be in a cited passage —
   a line that breaks this is **taken out** (Medium, "part of the answer was
   taken out"); only when nothing is left is the reply **held back**, and then
   the app says what the passages *do* say. A figure from the owner's own
   runbook or own message is theirs ("From your runbook").

**In .NET**: `ReplyValidator` + `ActionCatalog` (the 65 actions with field
types and a *write* flag), `SecondRound`, `ReplyMender`, `CodeOriginCheck`,
`NameCheck`, `Grounding` (with `TrimSay`, `Figures`, `StatedIn`). These are
the most valuable parts to port exactly; each has unit tests to copy.

### 4.9 Actions and the "yes"

**Today**: reading actions (find, open, show) run at once. The 43 *writing*
actions (create, close, set a due date, remember, add to brief…) are shown one
at a time and wait for a yes.

**In .NET**: a writing action becomes a `PendingAction` row returned with
the answer; Angular shows a Yes / No card; `POST …/pending/{id}/confirm`
runs it through ABP's normal application services (with their permissions
and audit log). The model can never change data by itself.

### 4.10 Learning

**Today** the model never changes; the *notebook* does:

- 👎 with the right line → a **correction** lesson **and** a **check**
  (Setup → Checks → Run checks asks it again, a judge says PASS / FAIL);
- `learn` (lessons), `remember` (notes), "How was it fixed?" (past fixes),
  the daily **look back** (`[reflect]`: lessons, notes, draft runbooks),
  **Interview me** (`[teach]`), **Learn from a document** (`[study]`).
- Everything learned is listed and can be deleted; drafts wait for approval.

**In .NET**: `Lesson`, `Note`, `Check` entities; `CheckRunner`; the look back
as an ABP background worker at the time chosen in settings.

---

## 5. The solution

```
KalKech.Assist/                         (ABP Framework layered template, Angular UI)
├─ src/
│  ├─ KalKech.Assistant/               ← NEW: the brain. Plain .NET 10, no ABP.
│  │   FrontDoor/  Focus/  Routing/  Context/  Prompt/  Gateway/
│  │   Sources/ (reader, chunker, index, search, gather, pack, grounding)
│  │   Checks/ (validator, actions, mender, code origin, names)
│  │   Answer/ (block splitter, answer model)   Trace/
│  │   prompt/prompt.txt  (copied from flow/prompt.txt)
│  ├─ KalKech.Domain.Shared/           enums, constants, localisation (en, km)
│  ├─ KalKech.Domain/                  entities (section 7), repositories
│  ├─ KalKech.Application.Contracts/   DTOs, app service interfaces, permissions
│  ├─ KalKech.Application/             ChatAppService, SourcesAppService, … (call the brain)
│  ├─ KalKech.EntityFrameworkCore/     DbContext, migrations (SQL Server)
│  ├─ KalKech.HttpApi / .HttpApi.Host/ the API (ABP auto API controllers), Swagger
│  └─ KalKech.DbMigrator/
├─ test/
│  ├─ KalKech.Assistant.Tests/         ← NEW: xUnit, no web server, made-up fixtures
│  └─ (the template's own test projects)
└─ angular/
   └─ src/app/ chat/  sources/  trace/  setup/   (proxies from `abp generate-proxy -t ng`)
```

---

## 6. The brain — main types (a sketch)

```csharp
// One question, from the front door to the answer the page draws.
public sealed class AssistantPipeline
{
    public async Task<Answer> AskAsync(Question q, CancellationToken ct)
    {
        var trace = Trace.Start(q);

        if (_frontDoor.TryAnswer(q, trace) is { } quick)           // 1  no AI
            return quick;

        var focus  = _focus.Of(q, trace);                           // 2  what it is about
        var tier   = _router.Pick(q.Mode, q.ModelPick, trace);      // 3  fast / deep / reason
        var ctx    = await _context.BuildAsync(q, focus,
                         Budget.For(tier), trace, ct);              // 4  records, passages, brief…
        var prompt = _prompt.Fill(ctx, trace);                      // 5  the one text file

        var raw    = await _gateway.SendAsync(
                         new ModelRequest(prompt, tier, ctx), ct);  // 6  the one door out
        var reply  = _validator.Check(raw, trace);                  // 7  shape, actions

        if (reply.WantsMore is { } more && !q.IsSecondRound)        //    one more round, once
            return await AskAsync(q.SecondRound(more), ct);

        reply      = _mender.Mend(reply);
        var ground = _grounding.Check(reply, ctx.Passages,
                         q.Text, ctx.OwnTexts, trace);              //    quotes and figures
        var blocks = _blocks.Split(ground.Say, ctx, trace);         //    code / email / diagram / prose

        return Answer.From(ground, blocks, tier, trace);            // 8  writes come back as pending
    }
}

// The one door out. Only one is switched on at a time.
public interface IModelGateway
{
    Task<string> SendAsync(ModelRequest request, CancellationToken ct);
}
// FlowGateway        POSTs the same JSON as flow.js buildRequest to the owner's
//                    Power Automate URL — the flow they already have, unchanged.
// ChatClientGateway  Microsoft.Extensions.AI IChatClient (a home lab: a local
//                    model, or a cloud one). Off unless set up.
// FakeGateway        scripted replies, for tests.

public sealed record ModelReply(
    string? Say, string? Ask, IReadOnlyList<string>? Choices,
    IReadOnlyList<ActionRequest>? Actions, IReadOnlyList<Cite>? Cite,
    string? Confidence, string? Suggest, string? Thread, string? Title,
    NeedRecords? NeedRecords, NeedSources? NeedSources);

public sealed record Cite(string S, string Quote);
```

What the API returns to Angular for one answer:

```json
{
  "messageId": "…",
  "tier": "fast",
  "ms": 6400,
  "blocks": [
    { "kind": "prose",   "markdown": "For an ordinary user account the standard asks for…" },
    { "kind": "code",    "lang": "sql", "body": "SELECT …",
      "origin": { "from": "script", "name": "monthly_report.sql" } },
    { "kind": "text",    "type": "email", "subject": "…", "body": "…" },
    { "kind": "diagram", "source": "flowchart TD\n  A[Ticket] --> B[Check logs]" }
  ],
  "sources": {
    "status": "ok", "confidence": "high",
    "cites": [ { "label": "S4", "doc": "Access password standard", "version": "2.1",
                 "page": 8, "lines": "12-18", "section": "CSP-PWD-02", "quote": "…" } ],
    "removed": []
  },
  "suggest": null,
  "ask": null, "choices": [],
  "pending": [ { "id": "…", "do": "closeRecord", "summary": "Close D-0153 with …" } ],
  "warnings": [ { "kind": "names", "items": ["usp_unknown_proc"] } ],
  "trace": { "steps": [ { "name": "search", "ms": 2, "detail": { "docs": 14, "passages": 9 } } ] }
}
```

---

## 7. Database (EF Core, SQL Server)

Every entity belongs to its user (ABP's audit fields; multi-tenancy off).

| Entity | Main fields |
|---|---|
| `ChatThread` | Title, Summary, LastMatch, Model pick |
| `ChatMessage` | ThreadId, Who, Text, ReplyJson, Tier, Ms, Rating, ParentId (branches: Retry / Think harder) |
| `SourceDocument` | Name, Family, Version, Effective, Systems, Environment, Category, Access, MayGoToAssistant, Status (active / superseded / off), Scope (library / chat) + ThreadId, Sha256, Kind, BlobName, Algo |
| `SourcePassage` | DocumentId, N, Page, LineStart, LineEnd, Section, Text, Quality, RuleCues |
| `SourceLog` | what was searched, counts, labels cited — **never the documents' text** |
| `WorkRecord` | Code, Title, Status, Priority, Due, System, People, Notes, Log, Resolution |
| `Runbook`, `Script`, `Note`, `Lesson`, `Check`, `WordAlias` | as in `dossier.json` |
| `WorkBrief` | the "About my work" text |
| `PendingAction` | MessageId, Do, ArgsJson, State (waiting / done / declined) |

An **import** of a KalKech workspace (`dossier.json`) fills these, so the lab
starts with real-looking data: `demo/dossier.json` (made up) in tests, the
owner's own file only on their own PC.

---

## 8. The API

ABP turns application services into endpoints (`/api/app/…`) and Swagger.

| Endpoint | What it does |
|---|---|
| `POST /api/app/chat/ask` | a question (thread, text, files, model pick) → the answer above |
| `POST /api/app/chat/{messageId}/again` | Retry, Think harder, Reason (a tier) → a branch |
| `POST /api/app/chat/{messageId}/rate` | 👍 / 👎 with the right line → lesson + check |
| `POST /api/app/chat/pending/{id}/confirm` · `/decline` | the "yes" |
| `POST /api/app/chat/preview` | the exact filled prompt and its size, **no model call** |
| `GET  /api/app/chat/threads` · `/threads/{id}` | conversations |
| `POST /api/app/sources` (multipart) | add a document, with its details; a new version asks what to do |
| `GET  /api/app/sources` · `PUT /{id}` · `POST /{id}/reindex` · `DELETE /{id}` | the library |
| `POST /api/app/sources/search` | the passages a question finds, with scores — **no model call** |
| `GET  /api/app/sources/{id}/text` | the viewer: page and lines marked |
| `GET/PUT /api/app/brief`, `/lessons`, `/notes`, `/runbooks`, `/scripts`, `/records` | the notebook and the work |
| `POST /api/app/checks/run` | ask every corrected question again → PASS / FAIL |
| `POST /api/app/workspace/import` | read a `dossier.json` |

Model settings (flow URL, tiers, timeouts) live in ABP Setting Management;
the flow URL is stored encrypted.

---

## 9. The Angular app

- **Chat**: conversations on the side; the composer (text, files, the model
  pill Auto · Fast · Strong · Reason); each answer drawn from `blocks[]` —
  `ProseBlock`, `CodeBlock` (Copy, where it came from), `TextBlock`
  (email / Teams / note, Subject with its own Copy), `DiagramBlock`
  (`diagram.js`: Copy picture, Save, Larger); `SourcesBox` (one folded line:
  document · page · confidence; open for Source, Evidence, Searched);
  `Suggestion`; `AskChoices`; `PendingActionCard` (Yes / No); the tools row.
- **Sources**: the table, the add dialog with details, the version question,
  the viewer, and a **search tester** (type a question, see the passages and
  their scores).
- **Trace** (a drawer on any answer): each step, what it decided and how
  long it took — front door, focus words, tier and why, what was gathered and
  how big, the prompt size, the model's time, actions accepted or refused,
  lines taken out.
- **Setup**: models and timeouts, the brief, lessons, notes, checks.

---

## 10. Build order

Each phase ends with something that can be seen working.

| Phase | Build | Done when |
|---|---|---|
| **0. Set up** | Create the ABP solution (Angular, EF Core, SQL Server); add `KalKech.Assistant` and its test project | you can log in, an empty Chat page shows, `dotnet test` runs |
| **1. A first answer** | `ChatThread`/`ChatMessage`; `POST chat/ask`; the reply contract and `ReplyValidator`; `PromptTemplate`; `FakeGateway` and `FlowGateway` | a scripted answer shows; with the flow URL set, a real answer comes from the **same** Power Automate flow |
| **2. Answer sections** | `ReplyMender`, `BlockSplitter`; the Angular block components; `diagram.js` | one scripted reply with prose, a table, SQL, an email and a diagram (with `~~~` fences, and with lost ones) draws as cards |
| **3. Sources** | reader, chunker, index, filters, search, gather, pack; the Sources page; `sources/search` | the made-up fixtures index; "what is the stardard password should be?" finds the same passages as `sources.js` (a parity test runs both) |
| **4. Checks under the answer** | `Grounding`, `CodeOriginCheck`, `NameCheck`; the sources box and viewer | the "30 days / 90 days" example in HOW-THE-AI-WORKS (Part 2, Step 6) gives the same result: two lines out, Medium |
| **5. Your work** | records, brief, runbooks, scripts, notes, lessons; `RecordRanker`; `ActionCatalog`, `PendingAction`; `needRecords` / `needSources`; import | "close D-0153 with these steps" shows a Yes / No card and changes nothing until Yes |
| **6. Model choice** | `ModelRouter`, `Budget`, timeouts, Think harder / Reason branches, fall back to a local answer when the model fails | Auto sends chat to fast and the look back to strong; Reason is sent the big folder |
| **7. Learning** | 👎 → lesson + check, `CheckRunner`, past fixes, the look back as a background worker, `[study]` drafts | a correction becomes a check that runs PASS / FAIL |
| **8. Trace and speed** | the Trace drawer, Preview, timings, the search log; live steps over SignalR (optional) | every answer has a trace with times |

Phases 0–4 are enough to see the heart of it: documents → search → prompt →
model → checks → cards.

---

## 11. Tests

- **xUnit** on `KalKech.Assistant`, with no web server: port the ideas of
  `tests/sources.test.js` (passages, search, grounding, names, code origin)
  and `tests/diagram.test.js` stays JavaScript (Angular uses `diagram.js` as
  it is).
- **Made-up documents only**: `tests/fixtures/` (the PDFs come from
  `make-pdf.js`).
- **A stand-in model** (`FakeGateway`) returns scripted replies, so every
  test is repeatable and no real data is ever in a test.
- **Parity tests**: for the same question and the same workspace, the C#
  request JSON and the chosen passages are compared with what `flow.js` and
  `sources.js` produce under Node. Differences are either fixed or written
  down.
- The prompt's examples are run through the C# checks too (as
  `flow/check-prompt.js` does).

---

## 12. Rules carried over from KalKech

- **Nothing new reaches the internet.** At work the only door to a model is
  the owner's own Power Automate flow (`FlowGateway`). `ChatClientGateway` is
  off by default and meant for a home lab. The API listens on `localhost`
  unless the owner changes it.
- **No company data in the repository**: no document text, names, emails or
  screenshots; fixtures are made up; the database stays on the owner's PC.
- **Every change waits for a yes.**
- **Answers about documents are checked against the documents**; a bad line
  is taken out, the good answer is still shown.
- **The prompt is one file, read fresh**; its examples pass the checks.
- **Everything that grows has a limit**; at most one extra round trip; a time
  limit on every call and a fallback answer.
- No model names in code, docs or commits.

---

## 13. Decisions for the owner

1. **Template**: ABP Framework on .NET 10 (recommended), or ASP.NET
   Boilerplate on .NET 9 (support ends 10 November 2026)?
2. **Where the code lives**: a new repository (recommended — the template is
   a few thousand files and KalKech stays one page), or an `abp/` folder here?
3. **The model for the lab**: the same Power Automate flow as today, or the
   stand-in only at first?
4. **Database**: SQL Server LocalDB (the template's default) — the same one
   KalKech's bridge already uses — or the named SQL Server from Setup?
