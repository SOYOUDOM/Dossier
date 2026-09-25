# The contract between Resolv and your flow

This is what Resolv sends, what it expects back, and what it will refuse.
It is generated from `flow.js`, which is the code that actually enforces it,
so the two cannot drift apart.

You do not need to read this to *use* the feature — paste your endpoint URL
into **Menu → Setup → Ask through Power Automate** and press **Test the
connection**, and it will tell you which rung is broken. You need it to
*build the flow*.

---

## 1. The shape of it

```
Resolv                    flow/relay.html              your flow
   │  message + workspace        │                           │
   ├────────────────────────────>│  POST text/plain          │
   │                             ├──────────────────────────>│
   │                             │                           │  (do whatever
   │                             │        JSON               │   you like)
   │                             │<──────────────────────────┤
   │  validated actions          │                           │
   │<────────────────────────────┤                           │
   │                                                          
   ├─ reads run immediately
   └─ writes are shown to the person and wait for a yes
```

`dossier.html` never makes the request itself. It carries `connect-src 'none'`
and that does not change. The relay frame holds no records, is pinned to your
endpoint's origin and no other, and refuses redirects.

---

## 2. Two things your flow must do, or nothing works

### 2.1 Return a **Response** action

A flow with no Response action never answers. Resolv waits, times out, and
says so. Add **Response** as the last step.

### 2.2 Put `Access-Control-Allow-Origin: *` on that Response

This is the one that catches everybody. Without it your flow **runs
perfectly** — you will see it succeed in the run history — and the browser
still refuses to let Resolv read the reply. It looks like a network failure
and it is not.

In the Response action's **Headers**:

| Key | Value |
|---|---|
| `Content-Type` | `application/json` |
| `Access-Control-Allow-Origin` | `*` |

Resolv's connection test names this case specifically rather than reporting
"failed to fetch", because the difference is not guessable from the outside.

### 2.3 A note on the request's content type

Resolv posts with `Content-Type: text/plain`, deliberately. A POST of
`application/json` is not a "simple" cross-origin request, so the browser
sends an `OPTIONS` preflight first, and the Power Automate request trigger
does not answer `OPTIONS` — the call dies before your flow ever runs, with
nothing in the run history to look at.

The body is still JSON. In the trigger, either leave the schema empty and use
`json(triggerBody())`, or paste the sample below into **Use sample payload to
generate schema**.

---

## 3. What Resolv sends

One JSON object, POSTed as the body.

### `prompt` — the one field a flow needs

Since protocol 1.2 the request carries **`prompt`**: the whole prompt,
instructions and all, already filled in with everything below — ready to hand
to the model as it is. It is built from `flow/prompt.txt` (or your own
`dossier-prompt.txt`, see POWER-AUTOMATE.md §4), so the prompt action in the
flow needs exactly one input:

```
body('Parse_JSON')?['prompt']
```

`promptFrom` says which file it came from. Every other field still travels,
so a flow that wires its own inputs to them keeps working.

Since protocol 1.3 it also carries **`mode`** and **`tier`** at the top (see
*The mode*, below): what kind of question it is, and whether it wants the
fast model or the strong one.

```jsonc
{
  "dossier": 1,
  "protocol": "1.3",
  "mode": "chat",
  "tier": "fast",
  "prompt": "You are the assistant inside Resolv … (the whole prompt, filled in)",
  "promptFrom": "flow/prompt.txt",
  "askedAt": "2026-09-03T04:12:00.000Z",
  "today": "2026-09-03",
  "weekday": "Thursday",
  "timezone": "Asia/Phnom_Penh",
  "calendar": { "tomorrow": "2026-09-04", "nextWorkingDay": "2026-09-04",
                "todayIsOffDay": false, "thisMonday": "2026-08-31",
                "weekendDays": ["Saturday", "Sunday"] },
  "message": "create a task to restart the imaging pool tomorrow, P1",
  "conversation": [ { "who": "person", "text": "…" },
                    { "who": "dossier", "text": "…" } ],
  "attachmentsText": "=== error.png (image, 82 KB) ===\n[an image: its pixels are in attachments[].data for the recogniser, not here]",
  "attachments": [ { "name": "error.png", "type": "image/png", "kind": "image",
                     "size": 84213, "data": "iVBORw0KGgoAAA…",
                     "text": "", "pages": 0, "note": "" } ],
  "owner": "",

  "workspace": {
    "scope": "live",
    "systems":    ["Imaging", "CX Portal", "E-Payment", …],
    "types":      ["Incident", "Service request", "Change", …],
    "parties":    ["Data team", "DBA", "Infra", …],
    "statuses":   ["open", "processing", "blocked", "done", "cancelled"],
    "priorities": ["P1", "P2", "P3", "P4"],
    "people":     ["Operations", "Sokha", …],
    "tags":       […],
    "scripts":    [ { "id":"Srestartpool", "name":"restart-app-pool",
                      "file":"restart-app-pool.bat",
                      "params":["server","pool"], "desc":"…" } ],
    "routines":   [ { "id":"Rmorningtour", "title":"Morning tour",
                      "freq":"daily", "days":[1,2,3,4,5], "dom":1, "cron":"",
                      "time":"08:30", "paused":false,
                      "system":"Infra / IIS", "type":"Admin", "priority":"P3",
                      "checklist":["App pools running", "Disk above 15%", …],
                      "notes":"…", "message":"",
                      "scripts":["open-morning-tabs"], "autoRun":true,
                      "raisesRecord":true,
                      "nextDue":"2026-09-03", "lastRaised":"2026-08-30" } ],
    "holidays":   [ { "d":"2026-09-24", "n":"Constitution Day", "k":"public" },
                    { "d":"2026-10-10", "n":"Pchum Ben", "k":"public" }, … ],
    "holidaysTotal": 22,
    "policy":     { "targetDates": { "on":true,
                      "hoursFromRaising": { "P1":4, "P2":24, "P3":48, "P4":120 } },
                    "chaseAfterDays": 3,
                    "blockingSetsStatus": true },
    "counts":     { "records":7, "live":5, "overdue":1,
                    "dueToday":2, "waiting":1, "blocked":1 },
    "memory":     [ { "title":"Imaging pool restart",
                      "body":"When the nightly sync times out on GetPendingAsync:\n\n1. Recycle the pool\n2. Re-run the job\n\n```cmd\nrestart-app-pool.bat APP02 ImagingPool\n```",
                      "tags":["imaging","runbook"], "system":"Imaging",
                      "updated":"2026-03-14" } ],
    "memoryTotal": 1,
    "recordsSent": 5,
    "recordsTotal": 7,
    "records": [ { "code":"D-0004", "title":"…", "status":"processing",
                   "priority":"P1", "system":"Imaging", "type":"Incident",
                   "ticket":"INC0012390", "requester":"Operations",
                   "due":"2026-08-30", "dueTime":"11:00",
                   "created":"2026-08-30", "steps":0, "stepsLeft":0,
                   "scripts":["Srestartpool"], "logLines":2 } ]
  },

  "can": [ { "do":"createRecord", "write":true,
             "what":"Raise a new record. title is required; …",
             "needs":["title"],
             "args":{ "title":"string", "priority":"P1 | P2 | P3 | P4", … } } ],

  "reply": { "say":"…", "ask":"…", "actions":"…" }
}
```

**`can` is the important one.** It is the full list of what your flow may ask
for, generated from the running code, with every argument and its shape. Feed
it to your model rather than hard-coding a list — when Resolv gains an action
your flow gets it for free, and it can never ask for one that does not exist.

### Memory — what the person taught it

`workspace.memory` is the runbook this workspace has written for itself: notes
kept by the `remember` action, each with a title, a body that may run to
several paragraphs with fenced code in it, tags, and when it was last changed.

It travels with **every** question rather than being fetched on demand,
because a note nobody looks up is a note nobody writes — and the whole point
of keeping one is that next time, you have forgotten you ever did.

So: **answer from `memory` first.** If a note covers what was asked, give it
back in your own `say` (or return `recall` to show it verbatim) rather than
inventing a method. And when someone explains how something is done, return
`remember` — that is the action that makes the app worth teaching.

### Lessons — what it has learned about the person

`workspace.lessons` is a list of short lines, newest first, thirty at most:

```jsonc
"lessons": [
  "[style] Wants the query first and the explanation after",
  "[people] Sokha from Branch Ops raises most portal password resets",
  "[gap] Does not know who owns POLICY_MASTER yet - ask when it comes up"
]
```

They are about **the person**, not about a system or a procedure — how they
like to be answered, how they work, who asks them for what, what the
assistant should ask about. Read them before answering; write them with
`learn`. A method still belongs in `remember`, a procedure in `saveRunbook`.

A `[correction]` line is an answer the person rated 👎 with what it should
have said:

```jsonc
"[correction] When asked “why is the portal login failing for branch D?”, the right answer is: Clear the SSO session cache on WEB01 first - IIS restarts don't fix it"
```

It is the truth and beats everything else. Corrections do not all travel
with every question: the ones that share words with this question do (up
to six), plus the three newest.

### What they are doing, their world, and this conversation

Three blocks that make the model understand the situation rather than only
the sentence:

**`workspace.focus`** — what is in front of them. Absent when there is
nothing to say.

```jsonc
"focus": {
  "view": "day",
  "record": { "code": "D-0217", "title": "Imaging sync job failed", "status": "processing",
              "onScreen": "open",            // or "closed a moment ago" (within 20 minutes)
              "notes": "…", "steps": ["[x] Recycle APP02 pool", "[ ] Re-run sync"],
              "log": ["09-25 14:02 Recycled the pool on APP02 - no change"], "fixed": "…" },
  "selected": ["D-0006 Portal login failing on WEB01"],
  "timer": "D-0006 Portal login failing on WEB01 - 12 min so far",
  "today": ["14:02 D-0217 Recycled the pool on APP02 - no change", "09:12 D-0217 raised: …"]
}
```

"This", "it", "the ticket" with nothing else to go on mean `focus.record`.

**`workspace.brief`** — their own "About my work" page (Setup → About my
work): team, systems, servers and environments, people, the words they use.
Markdown, at most 4,000 characters, sent with every question. The model can
add to it with `addToBrief` (one line, a section of Team, Systems, Servers,
People or Words — asks first), and drafts it in `[brief]` mode.

**`workspace.thread`** — this conversation, remembered. `summary` is what the
model wrote about it on the turns before; `earlier` is how many older
messages are no longer in `conversation` (it carries the last eight);
`wanted` is true from the second exchange on, and then the reply should carry
**`thread`** — two to six lines: what they are working on, what was checked
and what it showed, what was decided, what is still open. It is kept with
the conversation and never shown as the answer.

```jsonc
{ "say": "…", "ask": "…", "thread": "Working on D-0217, Imaging sync 30s timeout since Monday.\nPool recycle did not help.\nNext: time the POLICY_MASTER query." }
```

### Past fixes — "last time this happened, you did X"

`workspace.pastFixes` holds up to three closed records most like the
question, best first, only when the words genuinely overlap (words that mean
the same in support work — *log in*, *sign-in*, *authentication*; *503*,
*down* — count as one):

```json
{ "code": "D-0142", "title": "CX Portal SSO failure for branch users",
  "system": "CX Portal", "closed": "2026-09-10",
  "fixed": "Stale SSO session cache on WEB01 - cleared it and recycled the portal pool",
  "said": "their words", "match": 82 }
```

`fixed` is the person's own line from **How was it fixed?** (asked when a
record is closed) when `said` is `"their words"`, or the last thing in the
record's notes when it is `"last note, not confirmed"`. A record in
`workspace.records` carries the same line as `fixed`.

### The mode — what kind of question this is

`workspace.mode` is `"chat"` for a question typed in the panel, and one of
seven others, each also the first word of `message` in brackets. The same word
is at the top of the request as `mode`, beside `tier`, so a flow can branch
on either without reaching into the workspace:

| top-level field | values | |
|---|---|---|
| `mode` | `chat` `reflect` `teach` `study` `fix` `check` `intake` `brief` | as below |
| `tier` | `fast` `deep` | which model the question wants. `deep` for the jobs ticked in **Setup → Models in your flow** (by default the look back, study, teach and **Diagnose**) and for **✦ Think harder**; everything else is `fast`. Always `fast` while that setting is *One model*. POWER-AUTOMATE.md §4e builds the branch |

Both are in the short request (the picture setup) as well as the full one.

| mode | sent | `attached` holds |
|---|---|---|
| `reflect` | once a day, at the time set (noon by default), while the person is away | everything since the last look: records closed with how they were fixed, records raised with who raised them, the conversations, answers rated 👎 with what they should have said, answers rated 👍, answers marked *not what I meant* |
| `teach` | from a runbook's **Interview me** | whatever they attached, usually nothing — the runbook is in `runbooksMatched` |
| `study` | from **Learn from a BAU document…** | the guideline, read as text |
| `fix` | when a record is closed by hand and **How was it fixed?** comes up | the record: title, notes, log, steps done. The reply is one line in `say` — what fixed it — or exactly `unknown` |
| `check` | from **Setup → Checks → Run checks**, after the question itself has been asked again | nothing; `message` holds the QUESTION, THE RIGHT ANSWER in their words and THE NEW ANSWER. `say` starts with `PASS` or `FAIL`, then one sentence why |
| `brief` | **Setup → About my work → Draft it from my records** | what the app knows about their work: systems, teams, people, runbooks, note titles, recurring words, recent records, and the brief as it stands. The reply is the brief itself, in `say`, ending with three questions |
| `intake` | **Paste a message** (unless switched off in Setup) | nothing; the pasted message is in `message` after its first line. The reply is ONE `createRecord` — title, system, type, priority, requester, ticket, a deadline only if stated, `checklist` with two to four first steps — and one sentence in `say`. It is **not** run: the app fills the fields you have not touched, marks them, and offers the steps; nothing is saved until **Log it** |

A `reflect` reply is applied without a dialog, because nobody is there to
answer one: `learn` and `remember` are kept, `saveRunbook` is kept **as a
draft whatever status it asks for**, and anything else is offered to the
person later as a button. Nothing that touches a record is ever applied from
a `reflect` reply.

### The BAU library — runbooks and system profiles

Two blocks, shaped differently on purpose.

**`workspace.runbooks` is an index, not the runbooks.** Each entry carries the
title, the system, the trigger phrases, the severity, how many steps it has,
whether it is approved, and when it was last confirmed — but **never the
steps, the checks or the escalation**. Those stay in the app until you ask for
one by name with `readRunbook`.

```json
{ "title": "COI letter does not generate, but the API returned success",
  "system": "Imaging",
  "triggers": ["coi not generated", "regencoi went through but no letter"],
  "severity": "P3", "steps": 6, "status": "draft",
  "verified": "", "stale": true }
```

This is the whole reason the library can grow. A hundred indexed runbooks cost
less to send than one long note; a hundred *whole* runbooks would grow the
request until the model refused it. So:

> **Never quote steps for a runbook you have not read.** The index tells you
> one exists and what it is called. It does not tell you what it says, and
> inventing the steps is worse than saying you need to look.

`runbookTotal` is how many exist; the index is capped at 200.

**`workspace.runbooksMatched` is the block you answer from.** The app matched
the library against the person's own words *before* sending, so the two or
three that actually match arrive **whole** — steps, checks, escalation:

```json
{ "title": "COI letter does not generate, but the API returned success",
  "system": "Imaging", "severity": "P3",
  "why": ["coi not generated", "clicked generate and nothing happened"],
  "confidence": "high",
  "steps": ["Confirm which policy number(s)…", "…"],
  "checks": "```sql\nSELECT policy_no, status…\n```",
  "escalation": "Data missing in <POLICY_MASTER> → …",
  "stale": true, "unset": ["COI_REQUEST", "COI_LETTER"] }
```

This exists because the index alone made analysis impossible. Knowing that a
procedure exists, without its text, leaves only one move: announcing that you
will go and look it up. That is not support, and it was the shape of the first
version of this contract.

- `why` — which trigger phrases the sentence actually carried
- `confidence` — `high` · `fair` · `weak`. On `weak`, say you are not sure and
  ask the one question that would settle it
- `unset` — angle-bracketed names this team has never configured. Leave them
  as they are and say once that they need filling in; never invent a table
  name to make a query look finished

**`workspace.mentioned`** carries the identifiers from their sentence — a
policy number, a ticket reference. Put them into any check you quote. Handing
back SQL with `<policy>` still in it, when the policy number was in the
question, is the difference between help and a photocopy.

**`workspace.profiles` travels whole.** A system profile is what is durably
true about a system — what it does, what it *lies* about, which tables hold
the answer. There are few of them and each is meant to be about a page.

```json
{ "system": "Imaging",
  "facts": "Generates policy documents including the COI letter…",
  "quirks": "regenCOI returns 200 whether or not a letter was produced…",
  "tables": "<COI_REQUEST>  one row per request…",
  "owner": "" }
```

Profiles are what let you help with a problem nobody has written down. When a
symptom matches no runbook, reason from the profile rather than apologising: an
endpoint that reports success on failure explains a great many confused
tickets, and saying so is more useful than "I could not find a guideline."

**Freshness.** `verified` is when a human last confirmed the procedure still
works, and `stale` is set once that is over a year old or never happened. Say
so when you hand over a stale one. A procedure nobody has checked is not the
same as a procedure that works, and in a regulated shop the difference matters.

**Draft and approved.** Anything you write with `saveRunbook` is a draft.
Approving is a human act — never return `saveRunbook` with `status: "approved"`
unless the person explicitly says they are approving it.

### Attachments

`attachments` carries what the person clipped to the question. Each one has
`name`, `type`, `size`, `kind` (`image`, `pdf` or `text`) and:

- `text` — what the app read out of the file on the person's PC before
  sending: the whole text of a PDF, page by page with `[page N]` marks, or of
  a text file, up to 60,000 characters. With the optional `ocr.js` beside the
  app: for a picture, a description — its kind, size and colours, whether it
  looks like a photo of a person, how it is laid out (bands, panels, rows, a
  dialog over the page), every piece of text with where it sits and on what,
  and a map of the picture in letters with its own key, capitals where a
  square looks like it holds text — and for a scanned PDF, the words read off each page. Empty
  for a fax-coded scan, a file that needs a password, or a picture the
  recogniser gave up on.
- `pages` — the PDF's page count.
- `note` — `""` when it read cleanly; `ocr` (words read off a picture or a
  scanned page, a stray character possible), `seen` (a picture described,
  with no words in it), `cut` (past the cap), `partial` (some characters
  could not be decoded), `scanned` (pictures of pages the app could not
  read), `encrypted` (needs a password), `ocrslow` (a picture the
  recogniser gave up on), `empty`, `unreadable`.
- `data` — the file as base64 **without** the `data:` prefix. A document that
  arrived as text carries no bytes; its words are the file. A picture always
  carries its pixels, read or not, so a flow that looks at pictures still
  can; a scan or a locked file carries them because there was nothing else
  to send.

`picture` is the picture of the question, for a prompt that has an image
input: the first picture attached, or the first page of a scanned PDF shrunk
to travel, as base64 without a `data:` prefix — and a blank white 1×1 PNG when
there is none, so the input is never handed `null`. `pictureName` names it,
or is `""`. One expression wires it: `base64ToBinary(body('Parse_JSON')?['picture'])`.

`attachmentsText` is all of that as one piece of plain text a prompt input can
take whole — a `=== name (kind, size, pages) ===` line, then the text — so the
prompt built in [`POWER-AUTOMATE.md`](POWER-AUTOMATE.md) §4 reads a document
without any change to the flow. An image or a scan gets a bracketed line
saying where its pixels are; §4b reads those with the recogniser. `None.` when
nothing was clipped. Capped at 80,000 characters, with the cut marked.

### The probe

A second, tiny request may follow a failed one, with `"probe": true` in its
body. It is Resolv telling a blocked host apart from a missing CORS header —
both of which reach the browser as the same error. It **only ever follows a
failure**, so the request before it is the real one. Answer it with a 200 and
stop; see `POWER-AUTOMATE.md` §4.

**How much goes** is set in the panel and reported in `workspace.scope`:

| scope | records sent |
|---|---|
| `names` | none at all — the vocabulary only. Enough to raise work and run scripts. |
| `live` | everything not finished. The default. |
| `all` | finished records too. |

Notes and work logs are **not** sent unless *Include notes and work logs* is
switched on.

### `records` is a selection, and `recordsDigest` is the total

Since 3.10 the records are **ranked against the question on the PC** before
anything is sent — code and ticket numbers first, then words in the title,
then the filing, then what the question is about (overdue, due today,
waiting, blocked, a system, a person). The best `cap` of them travel; sixty
by default.

- `recordsSent` / `recordsTotal` — how many went, of how many exist.
- `recordsMatched` — how many in scope the question actually reached. Larger
  than `recordsSent` means there were more matches than fitted.
- `recordsDigest` — **every record in scope, counted**: `inScope`, `sent`,
  `notSent`, `byStatus`, `bySystem`, `byPriority`, `overdue`, `dueToday`,
  `dueThisWeek`, `undated`, `waiting`, `blocked`, and `longestWaiting`.
  Absent when the scope is `names`.

**Answer "how many" from the digest, not by counting `records`.** Counting the
rows you were sent gives a number that is wrong and looks right.

The same ranking applies to what else travels: `memory` holds the ten notes
the question reached in full, `memoryIndex` lists the rest by title;
`runbooks` is ordered by nearness to the question, with trigger phrases on the
top twenty; `profiles` sends the system in play whole and the others as a
line. `runbooksMatched` is unchanged.

### Asking for records you were not sent

`needRecords` is a read action with the same filter vocabulary as `find`.
Return it **alone** — no `say`, no other action — and Resolv runs the filter
over every record it has, then asks the same question again with what it found
at the front of `records`. The second request carries `followUp`:

```jsonc
"followUp": { "of": "how is Medcare doing this month",
              "wanted": { "system": "Medcare", "status": "live", "limit": 25 },
              "gave": 25 }
```

**Once per question.** A second `needRecords` is ignored. Scope still applies:
a filter asking for finished records gets none while *What to send* is
*Unfinished records*.

---

## 4. What your flow returns

```jsonc
{
  "say": "Raised D-0042 for tomorrow.",
  "ask": "Which server — APP01 or APP02?",
  "choices": ["APP01", "APP02", "Not sure"],
  "actions": [
    { "do": "createRecord", "title": "Restart imaging pool",
      "system": "Imaging", "type": "Incident", "priority": "P1",
      "due": "2026-09-04" }
  ]
}
```

Everything is optional. `say` alone is a perfectly good reply. Arguments may
sit at the top level of the action or inside an `args` object — both are read.
`choices` goes with `ask`: up to six short strings (40 characters each) the
person can answer with one press. The app shows them as chips under the
answer, and pressing one sends that text as the next message — so a guided
check (*is there a row? — A row with a file_path / No row / Cannot run it*)
moves at the speed of a click.

Resolv is forgiving about the wrapper, because Power Automate's Response
action produces several shapes depending on how it was built. All of these
work:

- `{ "say": …, "actions": [ … ] }` — the intended shape
- `{ "body": { "say": …, "actions": [ … ] } }` — a nested body
- `[ { "do": "view", "view": "day" } ]` — a bare array of actions
- `{ "message": "…" }` — `message` and `text` are accepted as `say`
- plain text, not JSON at all — taken as the answer, so a flow you have not
  finished still says something useful

---

## 5. What Resolv will refuse

Nothing coming back is trusted. This matters more than it sounds: the moment
your flow's prompt reads a mail, a ticket, or an attachment, the text driving
it is written by somebody else.

| Refused | What happens |
|---|---|
| an action not in `can` | dropped, named on screen: *"dropDatabase" is not something Resolv can do* |
| a missing required argument | dropped: *setStatus needs status, and it was not there* |
| an argument of the wrong shape | dropped: *status must be one of open, processing, … — got "finished"* |
| a record reference that resolves to nothing | refused at the moment of running: *there is no record "D-9999" here* |
| a script or party you do not have | refused, and it lists the ones you do |
| more than 25 actions | the first 25 are read, the rest are reported |
| a `say` over 4,000 characters | trimmed |

Some things are accepted rather than refused, where being strict would cost
something and gain nothing: an ISO instant where a date was wanted becomes its
day, `"urgent, imaging"` becomes a two-item list, `"yes"` becomes `true`, and
`"DONE"` matches `done`.

### The application's own settings

`workspace.settings` carries `themes` (what `setTheme` accepts), `canSet`
(every key `setSetting` accepts, and what each one takes) and `now` (what they
are at the moment). The list is built in the app, so it cannot drift from what
the app will actually take.

**`settings.flow` is deliberately not in it.** A flow that could rewrite the
endpoint URL could point Resolv at a different address, and nothing
downstream would notice. `memory`, `chatLearn`, `hushed`, `chatUI` and
`palettes` are excluded too — the first two have their own actions with their
own confirmations, and a generic setter would walk straight past them.

### Email

`draftEmail` writes a message and shows it as a draft with **Copy** and **Open
in my mail app**. Nothing is sent: Resolv has no way to send mail and should
not grow one, since that would be a second thing in the application allowed to
reach the outside, for a job a mail client already does. It counts as a read —
it changes nothing, so it is not confirmed.

**Two actions delete something** — `deleteRecord` and `deleteRoutine` — and
both are confirmed like every other write, both are undone by `Ctrl`+`Z`, and
`deleteRecord` leaves the record's folder and documents on disk. Everything
else is reversible in place. `setStatus` to `cancelled` is usually the better
answer than deleting, and keeps the history.

---

## 6. The action reference

Generated from `flow.js`. `ref` means a record code (`D-0004`), a ticket
number, or an id. **57 actions — 20 that read, 37 that write.**

### Actions that only read

These run the moment the reply arrives, because they change nothing.

#### `say`

Say something back. Use for an answer that needs no change.

| argument | shape | required |
|---|---|---|
| `text` | text | **yes** |

#### `find`

Show a filtered list of records.

| argument | shape | required |
|---|---|---|
| `text` | string | no |
| `status` | open | processing | blocked | done | cancelled | live | any | no |
| `system` | string | no |
| `person` | string | no |
| `party` | string | no |
| `type` | string | no |
| `tag` | string | no |
| `priority` | P1 | P2 | P3 | P4 | no |
| `dueBefore` | YYYY-MM-DD | no |
| `dueAfter` | YYYY-MM-DD | no |
| `createdAfter` | YYYY-MM-DD | no |
| `overdue` | bool | no |
| `undated` | bool | no |
| `waiting` | bool | no |
| `limit` | int | no |
| `label` | string | no |

#### `open`

Open one record in the drawer.

| argument | shape | required |
|---|---|---|
| `record` | ref | **yes** |

#### `openFile`

Open one document attached to a record.

| argument | shape | required |
|---|---|---|
| `record` | ref | **yes** |
| `name` | string | **yes** |

#### `view`

Switch the main view.

| argument | shape | required |
|---|---|---|
| `view` | day | board | register | week | library | insight | assist | **yes** |

#### `panel`

Open one of the menu panels.

| argument | shape | required |
|---|---|---|
| `panel` | ws | report | routine | scripts | look | setup | help | **yes** |

#### `report`

Open the Reports panel at a period and format.

| argument | shape | required |
|---|---|---|
| `period` | week | lastWeek | month | no |
| `format` | summary | standup | handover | no |

#### `getRecord`

Read one record in full — its notes, every checklist step, its work log and its documents. Use this when the summary you were sent is not enough.

| argument | shape | required |
|---|---|---|
| `record` | ref | **yes** |

#### `needRecords`

Ask for records you were not sent. `workspace.records` holds the ones this
question matched; `workspace.recordsDigest` counts the rest. Return this
**alone** — no `say`, no other action — and the same question comes back with
what the filter found. **Once per question**, and the scope you were given
still applies.

| argument | shape | required |
|---|---|---|
| `text` | string | no |
| `status` | open \| processing \| blocked \| done \| cancelled \| live \| any | no |
| `system` | string | no |
| `person` | string | no |
| `party` | string | no |
| `type` | string | no |
| `tag` | string | no |
| `priority` | P1 \| P2 \| P3 \| P4 | no |
| `dueBefore` | YYYY-MM-DD | no |
| `dueAfter` | YYYY-MM-DD | no |
| `createdAfter` | YYYY-MM-DD | no |
| `overdue` | bool | no |
| `undated` | bool | no |
| `waiting` | bool | no |
| `limit` | int | no |

#### `listRoutines`

List the schedules with what each one does and when it next fires.

| argument | shape | required |
|---|---|---|
| `includePaused` | bool | no |

#### `listHolidays`

List the holidays and office closures in a date range.

| argument | shape | required |
|---|---|---|
| `from` | YYYY-MM-DD | no |
| `to` | YYYY-MM-DD | no |

#### `chaseSheet`

Open the chase sheet for everything that is due a chase.

| argument | shape | required |
|---|---|---|
| *(none)* | | |

#### `incidentReview`

Look at the incident history over a window and show the counted picture: volume by system, what repeats, how long things take, and where the records are too thin to tell what happened. The numbers are computed by the app, not by you. Read them and say what they mean — which system is the real problem, what is recurring, what should become a problem record. Default window is 30 days.

| argument | shape | required |
|---|---|---|
| `days` | int | no |
| `system` | string | no |
| `group` | string | no |

#### `incidentGaps`

List the incidents whose records cannot answer what happened: closed with no resolution note, a note too short to mean anything, no root cause, reopened, or the same fault closed as a workaround again and again. kind narrows it — noNotes, thinNotes, noCause, reopened, repeatWorkaround, recurring.

| argument | shape | required |
|---|---|---|
| `days` | int | no |
| `kind` | string | no |

#### `whoFixedThis`

Who has resolved this kind of incident before, how often, how fast, and how often it came back. This is a count over what actually happened, not a guess. Use it when somebody asks who to assign something to — and give them the evidence, not just a name, because an assignment nobody can argue with is one nobody trusts.

| argument | shape | required |
|---|---|---|
| `about` | string | **yes** |

#### `findRunbook`

Find the runbooks that match a symptom. Give about the user's own words — the error, what they clicked, what did not happen. This searches trigger phrases, so it finds things a title search would miss. Use it before answering any "how do I fix" question.

| argument | shape | required |
|---|---|---|
| `about` | string | no |
| `system` | string | no |

#### `readRunbook`

Read one runbook in full — its steps, its checks and its escalation. The request carries only the index (titles, systems, trigger phrases), never the bodies, so you must read one before you can quote its steps. Never invent steps for a runbook you have not read.

| argument | shape | required |
|---|---|---|
| `title` | string | **yes** |

#### `listRunbooks`

List the runbook library, or just one system's. Use it when somebody asks what is covered, or when you are about to write a new runbook and need to know whether one already exists.

| argument | shape | required |
|---|---|---|
| `system` | string | no |

#### `readProfile`

Read what is known about a system: what its API does and does not tell you, the tables that hold the truth, who owns it. When a symptom matches no runbook, this is what you reason from — an endpoint that returns success on failure explains a great many confused tickets.

| argument | shape | required |
|---|---|---|
| `system` | string | **yes** |

#### `startRunbook`

Raise a record from a runbook, with its steps already on the checklist. Use it once the person agrees this is the right runbook, so the work is tracked and there is a record of what was done.

| argument | shape | required |
|---|---|---|
| `title` | string | **yes** |
| `requester` | string | no |
| `ticket` | string | no |
| `priority` | P1 | P2 | P3 | P4 | no |

#### `saveRunbook`

Write a runbook, or replace one of the same title. triggers are the phrases somebody would actually use when they hit this — the error text, the symptom in their words — and they are what findRunbook matches on, so give several and make them specific. steps is the procedure, one instruction per entry. checks is for the queries and table lookups that prove what is wrong; put them in a ``` fence. New runbooks are drafts until somebody with authority approves them.

| argument | shape | required |
|---|---|---|
| `title` | string | **yes** |
| `system` | string | **yes** |
| `triggers` | list of text | no |
| `severity` | P1 | P2 | P3 | P4 | no |
| `steps` | list of text | no |
| `checks` | text | no |
| `escalation` | text | no |
| `owner` | string | no |
| `status` | draft | approved | no |

#### `verifyRunbook`

Stamp a runbook as checked today. A procedure nobody has confirmed in a year is a liability, so say so when one is stale.

| argument | shape | required |
|---|---|---|
| `title` | string | **yes** |

#### `deleteRunbook`

Remove a runbook from the library.

| argument | shape | required |
|---|---|---|
| `title` | string | **yes** |

#### `saveProfile`

Write what is known about a system. facts is what it does; quirks is what it does that surprises people — an endpoint that returns 200 whether or not it worked belongs here; tables is where the truth actually lives. Keep it to about a page: this travels with every question, unlike runbook bodies.

| argument | shape | required |
|---|---|---|
| `system` | string | **yes** |
| `facts` | text | no |
| `quirks` | text | no |
| `tables` | text | no |
| `owner` | string | no |

#### `draftEmail`

Write an email and show it as a draft they can copy or open in their mail app. Nothing is sent — Resolv cannot send mail and does not try. Put the whole message in body, with real line breaks. Use this for a chase, a hand-over, an incident summary, anything they ask you to write to somebody.

| argument | shape | required |
|---|---|---|
| `to` | string | no |
| `cc` | string | no |
| `bcc` | string | no |
| `subject` | string | **yes** |
| `body` | text | **yes** |
| `record` | ref | no |

#### `recall`

Read back what you were taught. Every note is already in workspace.memory, so use this to SHOW one to the person, not to find out what it says.

| argument | shape | required |
|---|---|---|
| `about` | string | no |
| `tag` | string | no |
| `system` | string | no |

#### `createRecord`

Raise a new record. title is required; everything else is optional.

| argument | shape | required |
|---|---|---|
| `title` | string | **yes** |
| `system` | string | no |
| `type` | string | no |
| `priority` | P1 | P2 | P3 | P4 | no |
| `due` | YYYY-MM-DD | no |
| `dueTime` | HH:MM | no |
| `requester` | string | no |
| `ticket` | string | no |
| `tags` | list of text | no |
| `notes` | text | no |
| `estimate` | int | no |
| `checklist` | list of text | no |
| `scripts` | list of text | no |
| `waitOn` | string | no |
| `waitNote` | string | no |

#### `updateRecord`

Change fields on an existing record. Only the fields you send change.

| argument | shape | required |
|---|---|---|
| `record` | ref | **yes** |
| `title` | string | no |
| `system` | string | no |
| `type` | string | no |
| `priority` | P1 | P2 | P3 | P4 | no |
| `due` | YYYY-MM-DD | no |
| `dueTime` | HH:MM | no |
| `requester` | string | no |
| `ticket` | string | no |
| `tags` | list of text | no |
| `notes` | text | no |
| `estimate` | int | no |

#### `setStatus`

Move a record to another status.

| argument | shape | required |
|---|---|---|
| `record` | ref | **yes** |
| `status` | open | processing | blocked | done | cancelled | **yes** |

#### `setDue`

Set or clear a target date. Send due as "" to clear it.

| argument | shape | required |
|---|---|---|
| `record` | ref | **yes** |
| `due` | YYYY-MM-DD | no |
| `dueTime` | HH:MM | no |

#### `addLog`

Add a line to a record's work log.

| argument | shape | required |
|---|---|---|
| `record` | ref | **yes** |
| `text` | text | **yes** |

#### `addSteps`

Add checklist steps to a record. Steps it already has are skipped.

| argument | shape | required |
|---|---|---|
| `record` | ref | **yes** |
| `steps` | list of text | **yes** |

#### `tickStep`

Tick or untick one checklist step, matched by its text.

| argument | shape | required |
|---|---|---|
| `record` | ref | **yes** |
| `step` | string | **yes** |
| `done` | bool | no |

#### `setWait`

Hand a record to someone else and start the waiting clock.

| argument | shape | required |
|---|---|---|
| `record` | ref | **yes** |
| `waitOn` | string | **yes** |
| `waitNote` | string | no |
| `waitUntil` | YYYY-MM-DD | no |

#### `chase`

Open the chase sheet for a record that is sitting with someone.

| argument | shape | required |
|---|---|---|
| `record` | ref | **yes** |

#### `attachScript`

Attach a registered script to a record, with its parameters filled in.

| argument | shape | required |
|---|---|---|
| `record` | ref | **yes** |
| `script` | string | **yes** |
| `args` | object of name/value | no |

#### `runScript`

Run a script against a record. Needs the runner to be listening.

| argument | shape | required |
|---|---|---|
| `record` | ref | **yes** |
| `script` | string | **yes** |
| `args` | object of name/value | no |

#### `createRoutine`

Create a schedule that raises a record, or nudges you, on a cadence.

| argument | shape | required |
|---|---|---|
| `title` | string | **yes** |
| `freq` | daily | weekly | monthly | cron | **yes** |
| `cron` | string | no |
| `days` | list of text | no |
| `dom` | int | no |
| `time` | HH:MM | no |
| `system` | string | no |
| `type` | string | no |
| `priority` | P1 | P2 | P3 | P4 | no |
| `checklist` | list of text | no |
| `scripts` | list of text | no |
| `message` | string | no |
| `autoRun` | bool | no |

#### `pauseRoutine`

Pause or resume a routine, by its title or id.

| argument | shape | required |
|---|---|---|
| `routine` | string | **yes** |
| `paused` | bool | no |

#### `clearWait`

They came back. Stops the waiting clock and files how long it took.

| argument | shape | required |
|---|---|---|
| `record` | ref | **yes** |
| `note` | string | no |

#### `logTime`

Add minutes of work to a record. Use minutes, not hours.

| argument | shape | required |
|---|---|---|
| `record` | ref | **yes** |
| `minutes` | int | **yes** |
| `note` | string | no |

#### `timer`

Start or stop the clock on a record. Starting one stops any other.

| argument | shape | required |
|---|---|---|
| `record` | ref | **yes** |
| `on` | bool | no |

#### `block`

Say this record cannot finish until other records do. Give their codes.

| argument | shape | required |
|---|---|---|
| `record` | ref | **yes** |
| `blockedBy` | list of text | **yes** |

#### `unblock`

Remove what was holding a record up. Give codes to remove some, or nothing to clear them all.

| argument | shape | required |
|---|---|---|
| `record` | ref | **yes** |
| `blockedBy` | list of text | no |

#### `tags`

Add or remove tags on a record.

| argument | shape | required |
|---|---|---|
| `record` | ref | **yes** |
| `add` | list of text | no |
| `remove` | list of text | no |

#### `updateRoutine`

Change a schedule. Name it by title or id. Only the fields you send change.

| argument | shape | required |
|---|---|---|
| `routine` | string | **yes** |
| `title` | string | no |
| `freq` | daily | weekly | monthly | cron | no |
| `cron` | string | no |
| `days` | list of text | no |
| `dom` | int | no |
| `time` | HH:MM | no |
| `system` | string | no |
| `type` | string | no |
| `priority` | P1 | P2 | P3 | P4 | no |
| `checklist` | list of text | no |
| `scripts` | list of text | no |
| `message` | string | no |
| `autoRun` | bool | no |

#### `deleteRoutine`

Delete a schedule. The records it already raised are left alone.

| argument | shape | required |
|---|---|---|
| `routine` | string | **yes** |

#### `runRoutine`

Raise this routine's record now, without waiting for its time.

| argument | shape | required |
|---|---|---|
| `routine` | string | **yes** |

#### `addHoliday`

Mark a day as a holiday or an office closure. A public holiday is not a working day; an office closure is marked but still counts.

| argument | shape | required |
|---|---|---|
| `date` | YYYY-MM-DD | **yes** |
| `name` | string | **yes** |
| `kind` | public | office | no |

#### `removeHoliday`

Unmark a day that is not a holiday after all.

| argument | shape | required |
|---|---|---|
| `date` | YYYY-MM-DD | **yes** |

#### `addName`

Add a system, a work type, or a party you wait on, so it can be used from now on. Offer this when they name one you do not have.

| argument | shape | required |
|---|---|---|
| `kind` | system | type | party | **yes** |
| `name` | string | **yes** |
| `colour` | string | no |

#### `deleteRecord`

Delete a record. Its folder and documents stay on disk. Prefer setStatus to cancelled, which keeps the history.

| argument | shape | required |
|---|---|---|
| `record` | ref | **yes** |

#### `learn`

Keep one short thing learned about THIS PERSON - how they like to be answered, how they work, who usually asks them for what, a gap in what you know that you should ask them about. One sentence. The kept ones are in workspace.lessons; pass replaces with one of those exactly to correct it rather than add another. Not for procedures - a method is remember, a procedure is saveRunbook.

| argument | shape | required |
|---|---|---|
| `lesson` | text | **yes** |
| `kind` | string — style, preference, habit, people, system or gap | no |
| `replaces` | string | no |

#### `remember`

Keep what you were just told, so it can be recalled in any later conversation. Use it whenever someone explains how something is done, what caused something, or what to check next time. title is how they will ask for it again; body is the method in full, and may be several paragraphs with code blocks in ``` fences. Pass replaces with an existing note's title to correct that note instead of adding a second one about the same thing.

| argument | shape | required |
|---|---|---|
| `title` | string | **yes** |
| `body` | text | **yes** |
| `tags` | list of text | no |
| `system` | string | no |
| `replaces` | string | no |

#### `forget`

Delete a note from memory, by its title.

| argument | shape | required |
|---|---|---|
| `title` | string | **yes** |

#### `setTheme`

Change the application's theme. The names are in workspace.settings.themes.

| argument | shape | required |
|---|---|---|
| `theme` | string | **yes** |

#### `setSetting`

Change one setting. The keys you may use are listed in workspace.settings.canSet, with what each one takes. Anything else is refused — in particular nothing here can reach the endpoint URL.

| argument | shape | required |
|---|---|---|
| `key` | string | **yes** |
| `value` | string | **yes** |

#### `notify`

Turn Windows reminders on or off.

| argument | shape | required |
|---|---|---|
| `on` | bool | **yes** |

#### `undo`

Undo the last change to the workspace.

| argument | shape | required |
|---|---|---|
| *(none)* | | |

---

## 7. Building the flow

> **[`POWER-AUTOMATE.md`](POWER-AUTOMATE.md) is the step-by-step recipe** —
> the trigger schema, the prompt to paste in, where the knowledge goes, and
> the order to test things in. This section is the summary.

1. **When an HTTP request is received** — method `POST`. Leave the schema
   empty; the body arrives as text, so use `json(triggerBody())` wherever you
   need the object.
2. Whatever you like in the middle — an AI prompt action, a condition, a
   lookup in another system.
3. **Response** — status `200`, the headers from §2.2, and a JSON body
   matching §4.

Two things worth doing on day one:

- Have the flow return `{"say": "I can hear you."}` and nothing else, and get
  **Test the connection** to go green. Every other problem is easier to find
  once the plumbing is proved.
- Then add one action — `{"do":"view","view":"day"}` is harmless — and watch
  Resolv switch tabs. Now the contract is proved too.

---

## 8. When it does not work

**Menu → Setup → Ask through Power Automate → Test the connection** walks six
rungs and names the one that broke:

| Rung | If it fails |
|---|---|
| An endpoint is set | nothing typed in |
| It is a readable https address | must start with `https://` |
| It looks like a Power Automate trigger | a warning, not an error |
| The signature is present | you copied only part of the URL |
| The relay frame loaded | `flow/relay.html` is not next to `dossier.html` |
| Something answers at that address | blocked by this network, wrong URL, or the flow is off |
| The reply can be read | almost always the missing CORS header — §2.2 |
| The reply is the shape Resolv expects | it answered, but with nothing usable |

**Show the relay** puts the frame on screen with its transcript, timed to a
tenth of a second. The signature in the URL is masked there, so it is safe to
paste when asking for help.

---

## 9. Where the URL is stored, and what that means

The endpoint URL lives in `settings.flow.url` in `dossier.json`, in your
workspace folder.

**A Power Automate URL is a credential.** Anyone holding the whole URL,
signature and all, can run your flow. Treat `dossier.json` as you would a
password file: do not commit it to a public repository, and rotate the
trigger's signature if it gets out.
