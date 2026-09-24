# Building the flow

Everything you need on the Power Automate side: the trigger schema, the
prompt, how to give it the knowledge, and how to prove it works.

`CONTRACT.md` beside this file is the specification. This is the recipe.

---

## 0. The question first

> *I just turn the flow on in the app, and when I ask the assistant it calls
> the flow instead of chat.js — right?*

Yes. Two things have to be true, and they are separate on purpose:

1. **Endpoint URL** is filled in, and
2. **Use a flow** is set to **On**.

A URL on its own does nothing. Both together and every question you type into
the Ask box goes to your flow — `chat.js` is not consulted at all, and neither
is the local model.

Three details worth knowing before you rely on it:

- **If the flow fails, `chat.js` answers instead** and the reply says so
  ("…so this was worked out here instead"). That is the *If the flow fails,
  answer locally instead* setting, on by default. Turn it off and a failure is
  just a failure.
- **Writes still wait for you.** The flow proposing `createRecord` puts a
  question on screen with a **Yes, do it** button. It does not raise the
  record on its own. Nothing you configure changes that.
- **Switching it off** puts `chat.js` back, immediately, with no reload.

---

## 1. The flow, at a glance

```
① When an HTTP request is received     POST, no schema needed
② Parse JSON                           Content: json(triggerBody())
③ Run a prompt  (or any AI action)     the prompt in §4
④ Compose — "Clean"                    strip code fences, parse to JSON
⑤ Response                             200 · the two headers in §6 · the JSON
⑥ Response — "Fallback"                configure run after: has failed
```

Six actions. ⑥ is the one everybody skips and then spends an evening on.

---

## 2. The trigger

**When an HTTP request is received** · Method: **POST**

Then copy the URL it gives you — *after saving the flow*, because the URL does
not exist until the first save — and paste the whole thing, `&sig=…` included,
into **Menu → Setup → Ask through Power Automate → Endpoint URL**.

### Leave the Request Body JSON Schema empty

This is the part that surprises people. Dossier posts with
`Content-Type: text/plain`, deliberately — `application/json` earns a CORS
preflight, the request trigger does not answer `OPTIONS`, and the call would
die before your flow ever ran, **with nothing in the run history to look at**.

The body is still JSON. It just arrives as *text*, so the trigger will not
parse it into dynamic content for you. That is what step ② is for.

If you want the schema anyway — for the Parse JSON action in ②, which does
need one — here it is. It covers the fields you will actually reference;
Parse JSON does not mind the ones left out.

```json
{
  "type": "object",
  "properties": {
    "dossier":   { "type": "integer" },
    "protocol":  { "type": "string" },
    "askedAt":   { "type": "string" },
    "today":     { "type": "string" },
    "weekday":   { "type": "string" },
    "timezone":  { "type": "string" },
    "message":   { "type": "string" },
    "attachmentsText": { "type": "string" },
    "attachments": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "type": { "type": "string" },
          "size": { "type": "integer" },
          "data": { "type": "string" },
          "kind": { "type": "string" },
          "text": { "type": "string" },
          "pages": { "type": "integer" },
          "note": { "type": "string" }
        }
      }
    },
    "calendar": {
      "type": "object",
      "properties": {
        "tomorrow":       { "type": "string" },
        "nextWorkingDay": { "type": "string" },
        "todayIsOffDay":  { "type": "boolean" },
        "thisMonday":     { "type": "string" },
        "weekendDays":    { "type": "array", "items": { "type": "string" } }
      }
    },
    "owner":     { "type": "string" },
    "conversation": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "who":  { "type": "string" },
          "text": { "type": "string" }
        }
      }
    },
    "workspace": {
      "type": "object",
      "properties": {
        "scope":      { "type": "string" },
        "systems":    { "type": "array", "items": { "type": "string" } },
        "types":      { "type": "array", "items": { "type": "string" } },
        "parties":    { "type": "array", "items": { "type": "string" } },
        "statuses":   { "type": "array", "items": { "type": "string" } },
        "priorities": { "type": "array", "items": { "type": "string" } },
        "people":     { "type": "array", "items": { "type": "string" } },
        "tags":       { "type": "array", "items": { "type": "string" } },
        "scripts": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id":     { "type": "string" },
              "name":   { "type": "string" },
              "file":   { "type": "string" },
              "desc":   { "type": "string" },
              "params": { "type": "array", "items": { "type": "string" } }
            }
          }
        },
        "routines": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "id":           { "type": "string" },
              "title":        { "type": "string" },
              "freq":         { "type": "string" },
              "days":         { "type": "array", "items": { "type": "integer" } },
              "dom":          { "type": "integer" },
              "cron":         { "type": "string" },
              "time":         { "type": "string" },
              "paused":       { "type": "boolean" },
              "system":       { "type": "string" },
              "type":         { "type": "string" },
              "priority":     { "type": "string" },
              "checklist":    { "type": "array", "items": { "type": "string" } },
              "notes":        { "type": "string" },
              "message":      { "type": "string" },
              "scripts":      { "type": "array", "items": { "type": "string" } },
              "autoRun":      { "type": "boolean" },
              "raisesRecord": { "type": "boolean" },
              "nextDue":      { "type": "string" },
              "lastRaised":   { "type": "string" }
            }
          }
        },
        "holidays": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "d": { "type": "string" },
              "n": { "type": "string" },
              "k": { "type": "string" }
            }
          }
        },
        "holidaysTotal": { "type": "integer" },
        "memory": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "title":   { "type": "string" },
              "body":    { "type": "string" },
              "tags":    { "type": "array", "items": { "type": "string" } },
              "system":  { "type": "string" },
              "updated": { "type": "string" }
            }
          }
        },
        "memoryTotal": { "type": "integer" },
        "runbooks": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "title":    { "type": "string" },
              "system":   { "type": "string" },
              "triggers": { "type": "array", "items": { "type": "string" } },
              "severity": { "type": "string" },
              "steps":    { "type": "integer" },
              "status":   { "type": "string" },
              "verified": { "type": "string" },
              "stale":    { "type": "boolean" }
            }
          }
        },
        "runbookTotal": { "type": "integer" },
        "runbooksMatched": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "title":      { "type": "string" },
              "system":     { "type": "string" },
              "severity":   { "type": "string" },
              "why":        { "type": "array", "items": { "type": "string" } },
              "confidence": { "type": "string" },
              "steps":      { "type": "array", "items": { "type": "string" } },
              "checks":     { "type": "string" },
              "escalation": { "type": "string" },
              "status":     { "type": "string" },
              "verified":   { "type": "string" },
              "stale":      { "type": "boolean" },
              "unset":      { "type": "array", "items": { "type": "string" } }
            }
          }
        },
        "mentioned": { "type": "array", "items": { "type": "string" } },
        "incidents": {
          "type": "object",
          "properties": {
            "total":      { "type": "integer" },
            "window":     { "type": "integer" },
            "inWindow":   { "type": "integer" },
            "stillOpen":  { "type": "integer" },
            "medianHoursToResolve": { "type": ["number","null"] },
            "topSystems":    { "type": "array", "items": { "type": "object",
              "properties": { "name": { "type": "string" }, "n": { "type": "integer" } } } },
            "topGroups":     { "type": "array", "items": { "type": "object",
              "properties": { "name": { "type": "string" }, "n": { "type": "integer" } } } },
            "topCategories": { "type": "array", "items": { "type": "object",
              "properties": { "name": { "type": "string" }, "n": { "type": "integer" } } } },
            "byPriority":    { "type": "array", "items": { "type": "object",
              "properties": { "name": { "type": "string" }, "n": { "type": "integer" } } } },
            "repeats":     { "type": "array", "items": { "type": "object" } },
            "gapCounts":   { "type": "object" },
            "gapExamples": { "type": "array", "items": { "type": "object" } }
          }
        },
        "profiles": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "system": { "type": "string" },
              "facts":  { "type": "string" },
              "quirks": { "type": "string" },
              "tables": { "type": "string" },
              "owner":  { "type": "string" }
            }
          }
        },
        "settings": {
          "type": "object",
          "properties": {
            "themes": { "type": "array", "items": { "type": "string" } },
            "canSet": { "type": "object" },
            "now":    { "type": "object" }
          }
        },
        "policy": {
          "type": "object",
          "properties": {
            "targetDates": {
              "type": "object",
              "properties": {
                "on": { "type": "boolean" },
                "hoursFromRaising": {
                  "type": "object",
                  "properties": {
                    "P1": { "type": "integer" }, "P2": { "type": "integer" },
                    "P3": { "type": "integer" }, "P4": { "type": "integer" }
                  }
                }
              }
            },
            "chaseAfterDays":     { "type": "integer" },
            "blockingSetsStatus": { "type": "boolean" }
          }
        },
        "counts": {
          "type": "object",
          "properties": {
            "records":  { "type": "integer" },
            "live":     { "type": "integer" },
            "overdue":  { "type": "integer" },
            "dueToday": { "type": "integer" },
            "waiting":  { "type": "integer" },
            "blocked":  { "type": "integer" }
          }
        },
        "recordsSent":  { "type": "integer" },
        "recordsTotal": { "type": "integer" },
        "records": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "code":      { "type": "string" },
              "title":     { "type": "string" },
              "status":    { "type": "string" },
              "priority":  { "type": "string" },
              "system":    { "type": "string" },
              "type":      { "type": "string" },
              "ticket":    { "type": "string" },
              "requester": { "type": "string" },
              "due":       { "type": "string" },
              "dueTime":   { "type": "string" },
              "created":   { "type": "string" },
              "completed": { "type": "string" },
              "waitOn":    { "type": "string" },
              "waitSince": { "type": "string" },
              "waitNote":  { "type": "string" },
              "estimate":  { "type": "integer" },
              "spent":     { "type": "integer" },
              "steps":     { "type": "integer" },
              "stepsLeft": { "type": "integer" },
              "logLines":  { "type": "integer" },
              "blockedBy": { "type": "integer" },
              "tags":      { "type": "array", "items": { "type": "string" } },
              "files":     { "type": "array", "items": { "type": "string" } },
              "scripts":   { "type": "array", "items": { "type": "string" } },
              "notes":     { "type": "string" }
            }
          }
        }
      }
    },
    "can": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "do":    { "type": "string" },
          "write": { "type": "boolean" },
          "what":  { "type": "string" },
          "needs": { "type": "array", "items": { "type": "string" } },
          "args":  { "type": "object" }
        }
      }
    },
    "reply": {
      "type": "object",
      "properties": {
        "say":     { "type": "string" },
        "ask":     { "type": "string" },
        "actions": { "type": "string" }
      }
    }
  }
}
```

---

## 3. Parse JSON

Add **Data Operation → Parse JSON**.

| Field | Value |
|---|---|
| **Content** | `json(triggerBody())` — type it into the expression tab, not the dynamic-content tab |
| **Schema** | the schema from §2 |

Everything downstream now has proper dynamic content:
`body('Parse_JSON')?['message']`, `body('Parse_JSON')?['today']`, and so on.

> If you renamed the action, the expression name changes with it —
> `Parse JSON` becomes `Parse_JSON`, spaces to underscores.

---

## 4. The prompt

Add your AI action — **AI Builder → Run a prompt**, *Create text with GPT
using a prompt*, an Azure OpenAI action, whatever you have. They all take a
prompt and give back text.

Define **nine inputs** and wire them to the parsed body:

| Input name | Value (expression) |
|---|---|
| `message` | `body('Parse_JSON')?['message']` |
| `today` | `body('Parse_JSON')?['today']` |
| `weekday` | `body('Parse_JSON')?['weekday']` |
| `calendar` | `string(body('Parse_JSON')?['calendar'])` |
| `workspace` | `string(body('Parse_JSON')?['workspace'])` |
| `actions` | `string(body('Parse_JSON')?['can'])` |
| `history` | `string(body('Parse_JSON')?['conversation'])` |
| `memory` | `string(body('Parse_JSON')?['workspace']?['memory'])` |
| `attached` | `body('Parse_JSON')?['attachmentsText']` |

`string()` turns the object or array into JSON text, which is what a prompt
input wants.

> **The runbook library needs no new input.** `workspace` is passed whole, so
> `runbooks`, `runbooksMatched`, `mentioned` and `profiles` ride along inside
> it, and `can` already carries every action there is. Adding a library, or nine actions,
> changes nothing in the flow — only the prompt. Parse JSON does not strip
> properties its schema leaves out, so an older schema keeps working; update
> it (or regenerate from the current sample) only if you want the new fields
> as dynamic content of their own.

**No Select action, no `item()` expression.** An earlier version of this page
told you to build the file list yourself with a Data Operation → Select. That
was wrong — the app already knows the files, so it sends them ready to use.
`attachmentsText` is plain text a prompt input takes whole: each file's name
on a header line, then **what the app read out of it** on your PC before
sending — the pages of a PDF, the lines of a log:

```
=== CustomizedReport_Payment_Option.pdf (pdf, 407 KB, 6 pages) ===
[page 1]
Customized Report — Payment Option
Policy No	Insured	Option	Premium (USD)	Status
A018346A10	Sok Dara	Annual	1,250.00	Grace
…

=== error.png (image, 81 KB) ===
[an image: its pixels are in attachments[].data for the recogniser, not here]
```

or the single word `None.` when nothing was clipped. A document with text in
it arrives as that text and carries no bytes at all; only what has no words
to read — a screenshot, a scanned PDF — travels as base64, and §4b is how the
flow reads those. If you already added a Select for this, delete it.

### The prompt

Paste this whole thing. The `{curly}` names are the inputs above — in AI
Builder you insert them from the input list rather than typing the braces, but
put them in exactly these places.

> **Replacing the old prompt? Nothing else in the flow changes.** Same nine
> inputs, same Parse JSON, same Response. This version is **15 KB instead of
> 40 KB** — about six thousand fewer tokens the model has to read before it
> can start on every single question — and it adds four things: it talks like
> a colleague rather than a manual; it reasons about *your* case instead of
> copying the runbook back; it asks you for what a guideline leaves out and
> saves the answer; and it learns how you work (`workspace.lessons`, the
> `learn` action, and the noon look back — see [§4c](#4c-learning-the-daily-look-back)).
> Every example in it is checked by `flow/check-prompt.js` against the same
> validator Dossier uses on real replies.

```
You are the assistant inside Dossier, where an application-support engineer keeps their work. Think of yourself as the senior engineer at the next desk: you know their systems, you remember what they taught you, and you talk to them like a colleague. Each turn you decide what to say and what the app should do.

Reply with ONE JSON object and nothing else - no code fences around it, no words outside it. The first character is { and the last is }.

=== WHO YOU ARE TALKING TO ===
workspace.lessons (inside the workspace below) is what you have learned about this person: how they like answers, how they work, who asks them for what, what you still need to ask. Follow it - especially the [style] lines.

What they have taught you, in their own notes - answer from these first, and never invent a method one of them already gives:
{memory}

=== WHAT YOU CAN ASK THE APP TO DO (the complete list) ===
{actions}

=== THEIR WORKSPACE ===
{workspace}

=== WHEN ===
Today is {today}, a {weekday}.
{calendar}
Holidays come from workspace.holidays, never from your own knowledge. workspace.policy: target dates are set from the priority automatically (do not propose a due date unless they asked for one); a record is due a chase after policy.chaseAfterDays; putting a record on hold makes it Blocked by itself.

=== THE CONVERSATION SO FAR ===
{history}

=== WHAT THEY JUST SAID ===
{message}

=== WHAT THEY ATTACHED ===
{attached}

=== THE SHAPE OF YOUR REPLY ===
{"say":"...", "ask":"...", "choices":["...","..."], "actions":[{"do":"...", ...}]}
Every key is optional; leave out what you do not use. "say" alone is a complete answer. "ask" only when you truly cannot act without it. "choices" (up to six, short) go with "ask" so they can answer with one press.

=== HOW TO TALK ===
- Like a person. Plain words, their language and register (Khmer to Khmer, English to English). No "Certainly!", no "As an AI", no repeating their question back, no filler, no sign-off.
- Answer first. One to three sentences for simple things. When the work needs more: a one-line verdict in **bold**, then short sections under ## headings, lists for steps, a table when a result decides what happens next, and your question last. Two sentences to a paragraph.
- Formatting that renders: **bold**, *italic*, ## and ### headings, - bullets, 1. numbered steps, > quotes, | tables |, [links](https://...), `inline code`, and fenced code: three backticks + language on their own line, the code, three backticks on their own line. Every script in its own closed fence - the second and third ones too. Prose outside fences. Underscores are not italic, so policy_no stays as it is.
- When they ask for a thing - code, a query, an email, a summary - give the thing itself, whole. Never describe it instead.

=== RULES THAT KEEP THE APP CORRECT ===
1. Use only "do" values from the list above. If what they want is not there, say so and return no actions.
2. Use only names that exist in the workspace: systems, types, parties, scripts, routines. A near miss: use the exact name and mention it. Nothing close: ask, or offer addName for a system, type or party.
3. workspace.records is only the part of the workspace this question matched (recordsSent of recordsTotal). Never invent a record code. COUNT FROM workspace.recordsDigest, never by counting records. If the answer is in records you were not sent, return needRecords ALONE - no say, nothing else - with a filter wide enough to finish the job; you get one. If you cannot see the record they mean, use find or ask which one.
4. Dates as YYYY-MM-DD resolved against today; times as 24-hour HH:MM; durations in minutes (logTime minutes:90).
5. The fewest actions that do the job; no extra view or open. Default priority P3; type Incident for something broken, Service request for something asked for; never guess a system.
6. Every change is shown to them for a yes, so describe it accurately in "say".
7. Conversation, or a request to WRITE or EXPLAIN something (code, an email, a summary, how something works): "say" only, NO actions. Raising a record because somebody asked for a snippet is the worst mistake you can make.
8. An email is draftEmail with the whole message, signed with workspace owner. App settings: setTheme, or setSetting for keys in workspace.settings.canSet - say what it is now. Routines: updateRoutine with only the fields that change, never delete and recreate; "run it now" is runRoutine; days count 0 = Sunday; a cron routine's time is in the expression.
9. Everything you write to the library is a draft. Never send status "approved" unless they say in so many words that they approve it.

=== SUPPORT WORK: BE THE ENGINEER, NOT THE DOCUMENT ===
workspace.runbooksMatched carries the runbooks that match what they said, in full, and the app shows that procedure under your answer by itself. The procedure is your knowledge, not your script - copying it back is useless, they could have opened it.
- Understand first: the symptom, the system, what they already tried, and their identifiers (workspace.mentioned, and anything said earlier in the conversation). Put their real values into every check.
- Then explain, in your own words, what is most likely going on in THEIR case and why - and give ONE next check: exactly where (screen, table, query with their values filled in) and what each result would mean. Say what NOT to do when it matters (re-running against missing data, restarting a service for a data problem). End with "ask" and "choices" for what they find.
- Their answers are the truth. If what they found contradicts the runbook, say so and reason from the data. Never ask what they already answered, never restart from step one.
- A weak match (low confidence): say you are not sure this is the right procedure, and ask the one question that settles it. Stale: say so in a clause, and offer verifyRunbook once they confirm it still works.
- Placeholders: fill value placeholders like <policy> from what they said; leave configuration placeholders like <COI_LETTER> and say once that they still need filling in. Never invent a table name.
- Nothing matches: reason from workspace.profiles (what each system does and what it lies about) and workspace.incidents (what happened lately and what fixed it). Never just apologise.
- WHEN THE GUIDELINE IS THIN, ASK TO LEARN. If the runbook or profile does not tell you something you need - the real table or screen, which team owns it, what normal looks like, who to escalate to - ask them that ONE thing. When they answer, keep it: saveRunbook (same title, draft, the improved version) or saveProfile, and say in a clause what you changed.
- When it is resolved: the cause in one line, and keep it without being told - remember (symptom, cause, fix, system, the record code, their words), plus saveRunbook if the runbook was wrong or missing the check that decided it.
- One question at a time, never a questionnaire. Offer startRunbook once they agree it is the right procedure.

=== LEARNING ABOUT THEM ===
When what they say or do shows something durable about them, keep it with learn - one short sentence, kind style, preference, habit, people, system or gap:
  style: "wants the query first and the explanation after"
  people: "Sokha from Branch Ops raises most portal password resets"
  gap: "does not know who owns POLICY_MASTER yet - ask when it comes up"
Only what the conversation actually shows. Correct an old lesson with replaces instead of adding a second. Do not announce lessons; a clause at most.

=== MODES (workspace.mode - the message starts with the same word in brackets) ===
[reflect] The daily look back, sent while they are away from the desk. ATTACHED holds everything since the last look: records CLOSED (with how they were resolved), records RAISED (who raised them, against what), the CONVERSATIONS, and answers they marked "not what I meant". Study it and return:
  - learn: one to five lessons this material actually shows and workspace.lessons does not already have;
  - remember: for each closed record whose resolution is worth reusing - symptom, cause, fix, system, record code, in their words;
  - saveRunbook (draft): when the same kind of problem came up more than once, or a case shows a runbook is missing a check;
  - saveProfile: only for a durable truth about a system;
  - say: two to four warm sentences - what you noticed and what you will do differently - then "ask" ONE thing you would like them to teach you, with choices when it is a pick.
  Never create, close or change records in this mode. If nothing is worth keeping, say so in one sentence.
[teach] They asked you to interview them about a runbook. Read it (runbooksMatched, or readRunbook), find what is missing or vague, ask ONE question per turn, say what you will change after each answer, and save the improved draft with saveRunbook when you have enough or they say stop.
[study] ATTACHED holds a BAU guideline. Turn each procedure in it into a runbook with saveRunbook (draft): triggers = what people would actually type (symptoms, the error text), steps = the fix as short instructions in your own words - not the document's paragraphs, checks = the queries and lookups in fences, escalation = who and when. Then ask about the most important thing the document does not say.

=== FILES AND PICTURES ===
Each attached file is listed under its name. A document's full text is there, read by the app: answer from it, and quote the actual figures and wording. A picture arrives described by the app - its kind and layout, any panel over the page, every piece of text read off it and where it sits, and a letter map of the layout - and if a picture input is wired you also see it. Read it like an engineer over their shoulder: say what it is, what usually goes wrong when somebody sends this, and ask the one thing that settles it. Never say you cannot see it, never invent text that was not read, never recite the map.

=== INCIDENT HISTORY ===
workspace.incidents is already counted. Read the numbers and say what they mean - what recurs, what it cost, what should become a problem record. Never recompute them or quote a figure that is not there. whoFixedThis is evidence: give the numbers with the name, never a bare recommendation. Findings are about records, never about people.

=== EXAMPLES ===
Message: "create a p1 to restart the imaging pool on APP02 tomorrow"
{"say":"Raising a P1 against Imaging for tomorrow.","actions":[{"do":"createRecord","title":"Restart imaging pool on APP02","system":"Imaging","type":"Incident","priority":"P1","due":"2026-09-04"}]}

Message: "how many are overdue?"
{"say":"**3 overdue** - two on Imaging, one on E-Payment.","actions":[{"do":"find","overdue":true}]}

Message: "write me a query that lists yesterday's failed payments"
{"say":"Here you go - swap the table name if yours differs.\n\n```sql\nSELECT txn_ref, amount, status, created_at\nFROM   <PAYMENT_TXN>\nWHERE  status = 'FAILED'\n  AND  created_at >= DATEADD(day, -1, CAST(GETDATE() AS date))\n  AND  created_at <  CAST(GETDATE() AS date);\n```"}

Message: "COI not generating for A018346A10, I clicked generate and it went through"   (runbooksMatched: the COI runbook)
{"say":"That success doesn't prove much - regenCOI answers 200 whether or not it rendered anything, so the real question is whether a letter exists. Check for today's row:\n\n```sql\nSELECT letter_id, generated_on, file_path FROM <COI_LETTER> WHERE policy_no = 'A018346A10' ORDER BY generated_on DESC;\n```\n\nA row with a file_path means the letter is there and it's a delivery problem. No row means nothing rendered - that's data, so don't re-run it yet.","ask":"What do you see?","choices":["A row with a file_path","A row, no file_path","No row","Can't run it"]}

Message: "No row"   (the turn above is in the conversation)
{"say":"Then the request was accepted and nothing rendered, which is nearly always one of four fields being empty on the policy:\n\n```sql\nSELECT insured_name, sum_insured, effective_date, expiry_date FROM <POLICY_MASTER> WHERE policy_no = 'A018346A10';\n```","ask":"Which one is empty?","choices":["insured_name","sum_insured","effective_date","expiry_date","None of them"]}

Message: "effective_date was null, policy admin fixed it and the letter came out"
{"say":"Nice - so the cause was a null effective_date on A018346A10, while regenCOI still said 200. I'll keep that, so next time it's one question, and add the field check to the runbook as a draft.","actions":[{"do":"remember","title":"COI letter missing after regenCOI 200","body":"Symptom: regenCOI returns 200, no row in <COI_LETTER>.\nCause: null effective_date in <POLICY_MASTER> (any of insured_name, sum_insured, effective_date, expiry_date stops the render).\nFix: policy admin fills it, then regenerate once.\nCase: A018346A10.","system":"Imaging","tags":["coi","imaging"]},{"do":"saveRunbook","title":"COI letter does not generate, but the API returned success","system":"Imaging","triggers":["COI not generating","regenCOI returned 200 but no letter","COI letter missing"],"steps":["Look for today's row in <COI_LETTER>; a row with a file_path means it is a delivery problem.","No row: check the four fields in <POLICY_MASTER>; a null in any stops the render.","Have policy admin fill the field, then regenerate once - never re-run against missing data.","All four present and still nothing: note the request id and time, escalate to Imaging."],"status":"draft"}]}

Message: "the imaging sync failed again"   (runbooksMatched: a sync runbook with no escalation contact)
{"say":"Same as last week, then - recycle the pool on APP02 and re-run the nightly job; if it fails a second time it's usually the DBA index job, not us.","ask":"The runbook doesn't say who to hand it to when it fails twice - who do you normally go to?","choices":["DBA team","Infra on-call","Vendor"]}

Message: "[reflect] It is my break. Look back over my work since ..."   (ATTACHED: two COI cases closed by fixing data; three password resets raised by Sokha; they marked an answer that explained before giving the query as "not what I meant")
{"say":"Two COI letters today, and both times the fix was the policy data, not the generator - I've kept that. I also noticed you want the query first, so I'll lead with it from now on.","ask":"Who owns POLICY_MASTER when a field needs fixing?","choices":["Policy admin","Data team","It depends on the field"],"actions":[{"do":"learn","lesson":"Wants the query or command first, the explanation after","kind":"style"},{"do":"learn","lesson":"Sokha raises most portal password resets","kind":"people"},{"do":"remember","title":"COI letter missing: check the policy data first","body":"Twice on 2026-09-24 (D-0101, D-0104) the COI letter did not render because a required field on the policy was null. Fix the data, regenerate once.","system":"Imaging","tags":["coi"]}]}

Message: "thanks, that helped"
{"say":"Any time."}

Now answer the message above. JSON only.
```

### Why this prompt is shaped this way

Your earlier attempt failed — *"it couldn't find this information"* — because
the model had no idea what your app is, what a record looks like, or that
`createRecord` exists. It was being asked to invent an API it had never seen.
Everything above §"HOW TO ANSWER" is there to fix exactly that.

### The second run, and how to answer it for nothing

Sometimes you will see **two runs** for one question: your real request, and
a second, tiny one whose body is

```json
{ "dossier": 1, "probe": true,
  "why": "Reachability check from Dossier, not a question. Answer 200 and stop." }
```

That is Dossier working out **why** the first one failed. A blocked host, a
dead host and a host that answered without the CORS header all arrive in the
browser as the identical `Failed to fetch`; the only way to tell them apart is
to ask again in a way that does not need to read the reply. So:

- **A probe only ever follows a request that has already failed.** If you see
  one, the run *before* it is the one to open — that is your real question,
  and that is where the error is.
- A healthy endpoint is asked **once**, by the chat and by *Test the
  connection* alike.

Answer it in one condition at the top of the flow, before anything expensive:

| | |
|---|---|
| **Condition** | `body('Parse_JSON')?['probe']` **is equal to** `true` |
| **If yes** | a **Response**, status 200, the headers from §6, body `{"say":"ok"}` — then nothing else |
| **If no** | the rest of your flow |

Two lines of setup, and probes stop costing you an AI Builder call.

### Attachments: what actually happens

Two kinds of file, two paths — and only one of them needs anything built.

| You attach | What travels | What the model gets |
|---|---|---|
| a PDF with text in it; a `.txt`, `.log`, `.csv` | **the words**, read out of the file by the app on your PC | the pages, under the file's name, in the `attached` input it already has |
| any picture, with `ocr.js` beside `dossier.html` | **a description and the words**: what kind of picture it is, its size and colours, whether it looks like a photo of a person, and every piece of text with where it sits and what it sits on — plus the pixels, for a flow that looks at them | all of that under the file's name, in `attached`; a line after it says it was read off a picture |
| a scanned PDF (pictures of pages), with `ocr.js` | **the words**, read off each page on your PC; the first page shrunk, as `picture` | the pages, under the file's name, in `attached` |
| a picture without `ocr.js`; a fax-coded (CCITT) scan; a PDF that needs a password | **the bytes**, base64 in `attachments[].data` | the file's name and a line saying it is a picture — until §4b is built, which reads the words out of the picture |

And, for a prompt that has an **image input**: `picture` — the first picture
attached, or the first page of a scan, or a blank white pixel when there is
none — so wiring it is one expression with no filter and no condition. That is
the only way a model *sees* a face or a chart; everything above is words.

`ocr.js` is optional and does nothing to the flow: it is a recogniser (Tesseract,
compiled to WebAssembly) and its English model in one file, which the app uses
when the file is there and ignores when it is not. Put it in the folder next
to `dossier.html`, like `flow.js`, and a screenshot is read the way a PDF is —
in about two seconds for a full screen, in a worker, so the page stays live.

The tray under the Ask box says which path each file took, in the moment it
is read: *2 pages read — the text goes with the question*, or *a scan, no
text in it — the pages go for OCR*.

---

#### Level 1 — every file is named, every document is read

This is one prompt input. Nothing else. No Select, no loop, no condition.

In your AI action's input list, add an input:

| | |
|---|---|
| **Name** | `attached` |
| **Type** | Text |
| **Value** | `body('Parse_JSON')?['attachmentsText']` |

That's it. The prompt in §4 has a `WHAT THEY ATTACHED` section that reads
`{attached}`, so the model now sees the report:

```
=== CustomizedReport_Payment_Option.pdf (pdf, 407 KB, 6 pages) ===
[page 1]
Customized Report — Payment Option
Policy No	Insured	Option	Premium (USD)	Status
…
```

**What you get:** the model reads the document and answers from it — the
figure on page 2, the policy that is in grace, the error in the log. The
PDF's bytes never left the PC; only its words did.

**What you do not get:** a look at the picture itself. With `ocr.js` beside
the app, a picture arrives described — *a screenshot, 1920×1080 landscape;
mostly white and dark grey; text in 5 places*, then each piece of text with
where it sits — and a scanned PDF arrives as its pages, which for a system
screen or a form is most of what there is to know. But nothing here can say
whose face is in a photo or what a chart's curve does; that needs the model
to see the pixels, which is Level 2, and now one expression away. Without
`ocr.js` a picture arrives as `=== error.png (image, 81 KB) ===` and a line
saying its pixels are in `attachments[].data`.

> If you built the flow before 3.2, **paste the §4 prompt again.** The old one
> told the model it could not read documents, and it believed that even with
> the pages in front of it. Nothing else in the flow changes.

---

#### Level 2 — the model can see the picture

This is the one that reads a face, a chart, a diagram, a screen laid out in
panels: the model looks at the pixels. It needs one input of type **Image**
on your prompt, and the app now makes wiring it a single expression.

**The five-minute version:**

1. Open the prompt in the AI Builder prompt builder. Add an input, type
   **Image**, named `picture`. Leave the prompt text alone. Save.
2. In the flow, the prompt action now shows a `picture` field. Set it to:
   ```
   base64ToBinary(body('Parse_JSON')?['picture'])
   ```
3. Save the flow. Attach a photo and ask *"what is in this picture"*.

That is all. `picture` is always there: the first picture attached, or the
first page of a scanned PDF (shrunk to travel), or — when nothing was
attached — a **blank white pixel**, so the input is never handed `null` and
the action never fails on a question with no file. The model sees a blank
square and says nothing about it; if you would rather it knew, add one line to
the prompt: *"A blank white picture means nothing was attached."*

A PDF that was read as text is not a picture and is not in `picture`; its
words are in `attached`. If two pictures are attached, the second is described
in `attached` and its pixels are in `attachments[1].data`; an image input
takes one.

If your action's Type dropdown has no **Image** — only **Text** — the prompt's
model cannot see, and Level 1 with `ocr.js` is the ceiling. **Check the
dropdown before anything else:**

> In your AI action, add another input and open the **Type** dropdown.
> - If the only option is **Text** → your action cannot see pictures. Stop at
>   Level 1, and read §4b, which turns a picture into text for it.
> - If you see **Image**, **File** or **Document** → carry on.

I can't tell you which it will be, because it depends on the action and the
model you picked when you created the prompt. Look at the dropdown; that is
the authoritative answer.

**Do not put the base64 into a Text input to get around this.** It does not
work, and it fails in two specific ways worth recognising:

- with **no** file attached, `attachments?[0]?['data']` is `null` and the
  action refuses it — *Invalid input: Input parameters are invalid for your
  model*;
- with a file attached, the base64 is counted as prompt text — a 400 KB file
  is about 136,000 tokens, against a 128,000 limit — *This model's maximum
  context length is 128000 tokens*.

For scale: the whole legitimate payload — workspace, all the actions, memory,
calendar, the lot — is about **3,800 tokens**, 3% of the limit. A six-page
report read as text is another two or three thousand. Everything else in
those errors is the file.

If you do have an image input, wire it to the first attachment's data:

```
body('Parse_JSON')?['attachments']?[0]?['data']
```

This is base64 **without** any `data:image/png;base64,` prefix — Dossier
strips it, because that is the form these inputs normally want. If yours
rejects it and asks for a data URI, build one instead:

```
concat('data:', body('Parse_JSON')?['attachments']?[0]?['type'], ';base64,',
       body('Parse_JSON')?['attachments']?[0]?['data'])
```

**Two caveats that will bite you if you wire `attachments[0]` instead of
`picture`.** `attachments?[0]` is null when nothing was attached, and some
actions fail on a null image input rather than ignoring it. And a PDF that
was read as text has an **empty** `data` — it is not a picture any more — so
an image input wired to it gets nothing. `picture` sidesteps both. If you
built it the old way and a normal question breaks, wrap the AI action in a
**Condition**:

| | |
|---|---|
| **Condition** | `length(body('Filter_array'))` **is greater than** `0` |
| **If yes** | the AI action *with* the image input wired |
| **If no** | the AI action *without* it |

Two copies of the action is clumsy, and it is the honest way to do it in the
designer. If your action ignores a null image, skip the condition.

---

#### Which level am I on?

Attach a PDF report and ask *"what is on page 1"*; then attach a screenshot
and ask *"what does this say"*.

| The reply | You are on |
|---|---|
| says nothing about either file | Level 0 — the `attached` input is not wired, or you have not repasted the §4 prompt |
| reads the PDF and describes the screenshot's text and layout, but cannot say what is in a photo | **Level 1 with `ocr.js`** — working as designed; Level 2 above is the one expression that lets it see |
| reads the PDF, but says the screenshot cannot be read | **Level 1** without `ocr.js` — put the file beside the app, or build §4b |
| names the PDF but says it cannot read documents | the §4 prompt is the old one — paste it again |
| reads both | **Level 2**, or Level 1 with §4b built — working |
| the flow errors only when a file is attached | the null-image caveat above, or size — see §8 |

**On size, which is the thing that breaks this.** Base64 is a third larger
than the file it encodes, so a 4 MB screenshot arrives as 5.2 MB of JSON —
enough that a question with a screenshot on it fails while the same question
typed out succeeds, which is a maddening symptom to chase.

So Dossier shrinks images before they go: redrawn at 1600px on the longest
edge and re-encoded, dropping through 1280, 1000 and 800px if it is still
large. A screenshot of an error dialog ends up around 80 KB. An 11 MB image
in testing came out at 163 KB — 69× smaller — and the whole request at
230 KB rather than 14.7 MB.

A PDF is not shrunk; it is **read**. Its words go and its bytes stay, so a
9 MB report costs the request a few thousand characters. The limits: five
files a question; up to 25 MB each to open; for what still travels as bytes —
screenshots, scans, locked files — 2 MB each and 3.5 MB for one question;
and 60,000 characters of text a file, with the cut marked so the model knows
it is not seeing the end. The composer shows the running total, so you can
see what a question weighs before you send it.

---

## 4b. Reading pictures: OCR for screenshots and scans

A document with text in it needs nothing here — its words are already in
`attachmentsText` (Level 1 above), and so are a picture's description and a
scanned PDF's pages when `ocr.js` is beside the app. This section is for what
is still only pixels when it arrives: a picture from a copy of the app without
`ocr.js`, a fax-coded (CCITT) scan, a picture the recogniser gave up on
(`note` says `ocrslow`). In `attachments[]` those are the ones whose `text` is
**empty**; their bytes are in `data`, base64 with no `data:` prefix, and
`note` says `scanned` for a PDF that is still pictures of pages. A picture
that was described still carries its pixels, so recipe B below can look at
it — and recipe B is now simpler than what follows: it is the `picture`
field, wired as in Level 2.

Two ways to read them. Do the first; add the second if your prompt's model
takes pictures.

### A. Read the text out of the picture (works everywhere)

AI Builder's **Recognize text in an image or a PDF document** returns the
text in a screenshot or a scan as lines. The model then gets the actual error
message, which is the thing they attached the picture for.

Above your prompt action, add these, in this order:

1. **Initialize variable** — name `attachedText`, type String, value empty.

2. **Apply to each** — *Select an output*: expression
   ```
   body('Parse_JSON')?['attachments']
   ```

3. Inside it, **Condition** — expression, is equal to, `true`:
   ```
   empty(items('Apply_to_each')?['text'])
   ```
   A file the app already read has its text and is skipped; a picture, a
   scan, or a locked file has none and goes to the recogniser.

4. In the **Yes** branch, **AI Builder → Recognize text in an image or a PDF
   document** — *Image*: expression
   ```
   base64ToBinary(items('Apply_to_each')?['data'])
   ```
   The data is base64 and the action wants the file, so it is decoded here.

5. Still in Yes, **Apply to each** — *Select an output*:
   ```
   outputs('Recognize_text_in_an_image_or_a_PDF_document')?['body/responsev2/predictionOutput/results']
   ```
   That is one item per page.

6. Inside it, another **Apply to each** — *Select an output*:
   ```
   items('Apply_to_each_2')?['lines']
   ```
   One item per line of text on the page.

7. Inside *that*, **Append to string variable** — `attachedText`, value:
   ```
   concat(items('Apply_to_each_3')?['text'], ' ')
   ```

8. Leave the **No** branch empty.

9. Change the prompt input `attached` to:
   ```
   concat(body('Parse_JSON')?['attachmentsText'], '. Text read from them: ', variables('attachedText'))
   ```

The action names in the expressions are the defaults; if you renamed one, the
expression name changes with it — spaces become underscores, and the second
*Apply to each* becomes `Apply_to_each_2` on its own.

> Only the recognised **text** reaches the model — never the base64. That is
> what keeps this out of `TooManyInputTokens`: a screenshot is a few hundred
> characters of words, not a hundred thousand of encoding. The app has already
> shrunk images before sending, so the recogniser sees files of a size it
> handles quickly — and it is never handed a PDF that was already read.

### B. Let the model see the picture (if your prompt supports it)

Custom prompts take **Image** as an input type alongside Text. If yours does,
the model can look at the screenshot itself, which is better than OCR for a
dialog box with an icon, a chart, or a layout problem.

1. In the prompt builder, add an input, type **Image**, named `picture`.
2. In the flow, **Filter array** — *From*:
   `body('Parse_JSON')?['attachments']`, condition `item()?['kind']` is equal
   to `image`.
3. On the prompt action, set `picture` to:
   ```
   base64ToBinary(first(body('Filter_array'))?['data'])
   ```
   One image per input; this takes the first. If there may be none, wrap the
   prompt action in a Condition on `length(body('Filter_array'))` being
   greater than 0, and give the branch without a picture a copy of the action
   with the input left empty.

Keep recipe A even with B in place: a scanned PDF is not an image, and the
text of a long error is better read than looked at.

### What to check

- Attach a PDF report and ask *"what is on the first page"*. The answer should
  quote it. Nothing in this section is needed for that; if it says it cannot
  read documents, the §4 prompt is the old one — paste it again.
- Attach a screenshot of an error and ask *"what does this say"*. With
  `ocr.js` beside the app, or with recipe A built, the answer quotes the error
  text. If it says a picture came and it cannot see inside, neither is in
  place: `attached` is the plain expression from Level 1 and there is no
  `ocr.js` in the folder.
- Attach a `.txt` log. It arrives read, in `attachmentsText`, with no
  recogniser involved — the Yes branch should not run for it.
- Run history → the recogniser's output: `results` should have one entry per
  page with `lines` inside. Empty `lines` on a real screenshot usually means
  the image arrived as text rather than binary — check step 4's expression.

## 4c. Learning: the daily look back

**Nothing to build.** It uses the flow you have.

At the time set in **Setup → What I have learned about you** (noon by
default — the lunch break), Dossier sends one question that starts with
`[reflect]`. `workspace.mode` is `"reflect"`, and the `attached` input holds
everything since the last look: records **closed** with how they were
resolved, records **raised** with who raised them and against what, the
**conversations**, and answers marked *not what I meant*. The prompt above
tells the model what to do with it: a few `learn` lessons, a `remember` note
for each resolution worth reusing, a draft `saveRunbook` when a problem keeps
coming back — and one question it would like you to answer.

If Dossier is closed at noon it happens the next time it is open after noon.
A morning with nothing in it costs no call at all.

What comes back is kept without a dialog, because nobody is at the desk to
answer one — and it is safe to: a lesson is about the assistant itself, a note
is in its own notebook, and a runbook is forced to *draft*, which nothing
relies on until a person approves it. Anything else it proposes — a change to
a system profile, anything touching a record — waits as a button in the
report, a conversation called **What I learned**. Every lesson is listed in
Setup, where any of them can be forgotten.

Two more modes use the same flow:

| starts with | from | what the model does |
|---|---|---|
| `[teach]` | a runbook's **Interview me** button | reads the runbook, asks you one question at a time about what it leaves out, and saves the improved draft |
| `[study]` | **Learn from a BAU document…** in the runbook library | turns each procedure in the attached guideline into a draft runbook — triggers, steps in plain words, checks, escalation — then asks about what the document does not say |

---

## 4d. Making it fast

The app side is done for you: a picture is sent at the size the model reads
(768 pixels on the short side — GPT-4o-class models scale everything down to
that before looking), and a picture the app has already read travels once, as
`picture`, not twice. On the flow side, in order of how much they save:

1. **Paste the new prompt** (above). Six thousand fewer tokens on every
   question.
2. **Pick a fast model for the prompt.** Chat wants the quickest general model
   your action offers — usually the one with *mini* in its name. A *reasoning*
   model thinks before it answers and takes tens of seconds; keep those out of
   a chat flow. Temperature 0 to 0.3.
3. **Keep `ocr.js` beside `dossier.html`** (it is in the repository). Then a
   picture arrives already read, the Condition in §4b skips it, and none of
   §4b's loops run. Those loops are the slow part of an attachment flow: each
   turn of an *Apply to each* is an action with its own overhead, and reading
   a screenshot line by line can be sixty of them.
4. **Answer the probe first** (the condition in "The second run", below), so a
   failed question is not followed by a second full AI call.
5. **Nothing between Parse JSON and the prompt** that is not needed. Every
   action in the chain adds its own start-up time, even a Compose.

---

## 5. How to give it the knowledge

There are two kinds of knowledge here and they go in different places. Getting
this the wrong way round is the second most common reason these flows fail.

### Knowledge that changes every request → **an input variable**

Your systems, your people, your scripts, your records, today's date, and the
list of actions the app accepts. **All of this arrives in the request body**,
already assembled by Dossier, already current. It goes into the prompt as the
`{workspace}` and `{actions}` inputs.

Do **not** put any of it in a knowledge base, a SharePoint file, or a
Dataverse table. It would be stale within a day, and you would be maintaining
by hand a list the app already generates from its own running code.

The `can` array is the important one. It is generated from `flow.js` itself,
so when Dossier gains an action your flow can use it immediately, with the
correct argument names, without you editing anything.

There is now a third place, and over time it is the one that matters most:
**`workspace.memory`** — notes the person wrote themselves through the
`remember` action. That is knowledge about *their* work that no knowledge base
you could build would contain, because it did not exist until they typed it.
It arrives in the request like everything else, and §4's prompt reads it
first.

### Knowledge that never changes → **the prompt, or a knowledge source**

House rules. Things about *your* work that the app cannot know:

> - Anything on E-Payment during a settlement window is P1, no exceptions.
> - "The pool" always means ImagingPool on APP02.
> - Sokha's requests are always logged against CX Portal even when she
>   describes the symptom in Medcare terms.
> - Vendor tickets get a `vendor` tag so they show in the monthly report.
> - Never raise a Change without a ticket reference.

Paste those under the RULES section as **rule 11 onwards**, or — if your AI
action supports a knowledge source — put them in a document and attach it.
Either works. The prompt is simpler and there is no indexing delay.

### If you attach a knowledge source anyway

Attach only the standing rules, never the workspace data. And keep §4's
rule 1 and rule 2 intact: a knowledge source that tells the model about an
action Dossier does not have will produce actions the app refuses by name, and
you will spend an afternoon wondering why.

---

## 6. Cleaning the answer, and returning it

### Compose — "Clean"

Models add code fences even when told not to. Strip them rather than trusting.

Add **Data Operation → Compose**, named `Clean`:

```
json(replace(replace(trim(<THE AI ACTION'S TEXT OUTPUT>), '```json', ''), '```', ''))
```

Replace `<THE AI ACTION'S TEXT OUTPUT>` with the dynamic-content token your AI
action provides — *Text* for **Create text with GPT**, *Predicted Text* or
`body('Run_a_prompt')?['predictionOutput']?['text']` for **Run a prompt**. Use
the token from the picker rather than typing a path; the path differs between
action versions.

### Response

Add **Request → Response**. This is the action that makes any of it visible to
Dossier.

| Field | Value |
|---|---|
| **Status Code** | `200` |
| **Headers** | `Content-Type` : `application/json` |
| | `Access-Control-Allow-Origin` : `*` |
| **Body** | `outputs('Clean')` |

**The `Access-Control-Allow-Origin` header is not optional.** Without it your
flow runs perfectly, its run history says *Succeeded*, and the browser refuses
to let Dossier read a single byte of the reply. Dossier detects this case
specifically and tells you so by name — but it costs you a round trip to find
out, and without the header nothing will ever work.

`*` is right here. Dossier may be running from `file://`, whose origin is the
string `null`, or from `http://127.0.0.1:5500` if you serve it — so there is
no single origin to name.

### The second Response — the safety net

Add another **Response** at the end, named `Fallback`. Then on it:
**⋯ → Configure run after → has failed**, **has skipped**, **has timed out**.

| Field | Value |
|---|---|
| **Status Code** | `200` |
| **Headers** | `Content-Type` : `text/plain` |
| | `Access-Control-Allow-Origin` : `*` |
| **Body** | `I could not work that one out.` |

Dossier accepts plain text as the answer, so this turns "the model returned
something unparseable" from a 30-second timeout into an immediate, readable
sentence. Ten seconds of setup that pays for itself the first week.

---

## 7. Proving it, in the order that finds problems fastest

Do not start with the AI action. Start with plumbing.

**Round 1 — nothing but a Response.** Delete or disable everything except the
trigger and one Response returning:

```json
{ "say": "I can hear you." }
```

Save. Paste the URL into Dossier. Press **Test the connection**. Get all six
rungs green. If you cannot, the answer is on the rung that failed and no
amount of prompt work will help.

**Round 2 — one action, no AI.** Change the Response body to:

```json
{ "say": "Switching to Day.", "actions": [ { "do": "view", "view": "day" } ] }
```

Ask the assistant anything. Dossier should switch tabs. The contract is now
proved end to end.

**Round 3 — add the AI action.** Now the only thing that can be wrong is the
prompt, and you can read the model's raw output in the run history.

**Round 4 — press *Show me exactly what would be sent*** in the Setup panel
and read it. Everything the model will see is in there. If it is missing
something it needs, change **What to send** rather than editing the prompt.

---

## 8. When it goes wrong

| What you see | What it is |
|---|---|
| *Nothing came back* on rung 3 | flow off, wrong URL, expired signature, or your network blocks `logic.azure.com`. Open the URL's host in a browser tab on that machine. |
| *not allowed to read the reply* | the missing `Access-Control-Allow-Origin` header. §6. |
| *needs a Response action* | the flow has no Response, or the branch that ran did not reach it. Add the Fallback in §6. |
| *did not answer within N seconds* | the flow is slower than the timeout. Raise **Give up after** in Setup, or move slow work after the Response. |
| *"x" is not something Dossier can do* | the model invented an action. Tighten rule 1; check `{actions}` is actually reaching the prompt. |
| *must be one of …* | the model used a value outside the enum. The exact allowed values are in the `args` of that action in `{actions}`. |
| *there is no record "D-9999" here* | the model invented a code. Rule 3. Also check **What to send** is not set to *Names only*. |
| *there is no script called "…"* | the name is not one of `workspace.scripts`. The message lists the ones that are. |
| a run that succeeds but Dossier says nothing | the model returned prose, not JSON. Check the `Clean` step, and that the prompt ends with *JSON only*. |
| nothing at all in the run history | the request never arrived. Almost always the URL. |
| **two runs, the second tiny with `"probe": true`** | the first one failed. Open that one — the probe is Dossier asking *why*, not the question. See above. |
| `Invalid input: Input parameters are invalid for your model` **with no attachment** | a required text input got **null**. Almost always `attached` wired to `attachments?[0]?['data']`, which is null when nothing is clipped. Wire it to `attachmentsText`, which is never null — it says `None.` |
| `This model's maximum context length is 128000 tokens` **with an attachment** | the base64 went into a **text** input. A 400 KB file is ~136,000 tokens on its own. Text inputs get `attachmentsText` (~1 token); the base64 only ever goes into an **Image/File** input. |
| **a question works until you attach something** | size. Check the request body's length in the failed run; Dossier now shrinks images, so if it is still large it will be a PDF. The reply in the chat tells you how much the question weighed. |

---

## 9. What it costs, and what to watch

One AI call per question. What it costs is how much that question carries,
because the model reads all of it before it starts answering.

Measured, with a library and notes in proportion:

| workspace | before 3.10 | now |
|---|---|---|
| 100 records | 50 KB | **41 KB** |
| 1,000 records | 164 KB | **52 KB** |
| 5,000 records | 185 KB | **61 KB** |

It used to grow with everything you did — more records, more notes, more
runbooks, all of it travelling on every question. It is ranked against the
question on the PC now and only the part that matched travels. **flow/SPEED.md
is the whole of that change**, including the one prompt edit it asks for.

Three dials, all in the Setup panel:

- **What to send** — *Names only* sends no records at all. It is enough to
  raise work, run scripts and create routines, and it is dramatically cheaper.
  Use it if most of what you ask is "create…" rather than "what is…".
- **Most records to send** — 60 by default, and it now means *the sixty the
  question is about*, not the sixty most recent. The payload says `recordsSent`
  of `recordsTotal`, and `recordsDigest` counts everything in scope, so the
  model can say *"1 of your 1,204 is overdue"* without having been sent 1,204
  of anything. Raising it makes every question slower and adds little: what
  comes after the first sixty is what the question did not reach.
- **Include notes and work logs** — off by default. It is the most useful
  context and the most sensitive; turn it on deliberately.

---

## 10. One thing to keep in mind

The URL in the Setup panel is a **credential**. Anyone holding it, signature
and all, can run your flow. It is stored in `settings.flow.url` inside
`dossier.json` in your workspace folder — so do not commit that file to a
public repository, and if it gets out, regenerate the trigger's signature.

Dossier masks the signature in the relay transcript for exactly this reason:
the transcript is the thing you paste into a chat window when asking someone
for help.
