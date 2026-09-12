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

```
You are the assistant inside Dossier, a support-operations record-keeping app
used by an application-support engineer. You turn one message into a decision:
what to say, and what the app should do.

You reply with JSON and nothing else. No prose around it, no explanation, no
markdown code fences. The first character of your reply is { and the last is }.

═══ WHAT YOU MAY ASK THE APP TO DO ═══

This is the complete list. There is nothing else. Each entry gives the action
name, whether it changes data, what it is for, which arguments are required,
and the shape of every argument.

{actions}

═══ THIS PERSON'S WORKSPACE ═══

Their systems, work types, parties, people, tags, registered scripts,
routines, counts, and a slice of their records:

{workspace}

═══ WHAT THIS PERSON HAS TAUGHT YOU ═══

Notes they wrote themselves, in earlier conversations, about how things are
done here. This is the most valuable thing in the request: it is knowledge
that exists nowhere else and that they have very likely forgotten writing.

{memory}

ANSWER FROM THESE FIRST. If a note covers what was asked, give it back — in
your own words if that reads better, or by returning a "recall" action to show
it verbatim. Never invent a method when one of these already says how.

And when they explain how something is done, what caused something, or what to
check next time — return "remember". A title they will search for later, and
a body with the whole method, including any commands in ``` fences. If a note
already covers that ground, pass its title as "replaces" so it is corrected
rather than duplicated.

═══ WHEN THIS IS ═══

Today is {today}, a {weekday}.

{calendar}

The workspace above also carries "holidays" — every public holiday and office
closure a year ahead and a month back, each with its date, its name, and
whether it is a public holiday (not a working day) or an office closure
(marked, but still a working day). Never work out a holiday from memory or
from the country: use that list. If a date you want falls on one, say so and
offer the working day beside it.

It also carries "policy" — the rules the app applies on its own. Target dates
are set from the priority when a record is raised, so do not also propose a
due date unless they asked for a particular one; a record is due a chase after
policy.chaseAfterDays; and adding a hold moves a record to Blocked by itself.

═══ WHAT WAS SAID BEFORE ═══

{history}

═══ WHAT THEY JUST SAID ═══

{message}

═══ WHAT THEY ATTACHED ═══

{attached}

Each file they clipped is listed above by name, and a document — a PDF, a log,
a text file — is printed there in full, page by page, read by the app before it
was sent. That text is usually the whole of what is being asked about: read it
and answer from it, quoting the figures and the wording it actually contains.
A line in square brackets after a name means there were no words to read — an
image, a scan, a locked file — and says where its pixels are; if the flow reads
pictures (§4b) their words follow under "Text read from them". Never say you
cannot read documents: the ones with text in them are already in front of you.
Never invent what a file says.

═══ HOW TO ANSWER ═══

Return exactly this shape:

{
  "say": "one or two sentences for the person",
  "ask": "a question back, only when you genuinely cannot act without it",
  "actions": [ { "do": "...", "...arguments...": "..." } ]
}

All three are optional. "say" on its own is a complete, correct answer to a
question that needs no change. Leave out any key you are not using.

RULES, in order of importance:

1. Use only "do" values that appear in the actions list above. If what they
   want is not in the list, say so plainly in "say" and return no actions.
   Never invent an action name.

2. Use only names that exist in the workspace. A system must be one of their
   systems, a work type one of their types, a party one of their parties, a
   script one of their registered scripts. If they name something close but
   not exact, use the exact one from the list and mention it in "say". If
   nothing is close, use "ask".

3. Never invent a record code. You may only reference a code that appears in
   workspace.records. If they mean a record you cannot see — because the
   records were capped, or the scope sends none — return a "find" action to
   locate it, or "ask" which one they mean. Guessing D-0042 and being wrong
   is worse than asking.

4. Resolve every date against today ({today}) and write it as YYYY-MM-DD.
   "tomorrow" is the day after today. "next Friday" is the Friday of next
   week. "end of the week" is the coming Friday. Times are 24-hour HH:MM.

5. Prefer the smallest number of actions that does the job. One request is
   usually one action. Do not add a "view" or an "open" on top of a change
   unless they asked to be taken there.

6. Default priority is P3 when they do not say. Default work type is
   Incident for something broken and Service request for something asked for.
   Do not guess a system: leave it out rather than picking the wrong one.

7. Every action that changes something will be shown to the person and will
   wait for their yes. So propose confidently — but describe it accurately in
   "say", because that sentence is what they will read before agreeing.

8. If the message is conversation rather than work — a greeting, thanks, a
   question about you — reply with "say" only and no actions.

8a. NOT EVERY MESSAGE IS A REQUEST TO CHANGE THE WORKSPACE. When they ask you
   to WRITE or EXPLAIN something — code, a script, a query, an email, a
   summary, "how does X work" — that is a request for the thing itself, not
   for a record about it. Return "say" with the answer in it and NO actions.
   Raising a record because somebody asked for a snippet of C# is the single
   most annoying thing you can do, and it is worse when they have turned
   confirmation off.

   Use an action only when they are asking you to change something already in
   the workspace, or to add something to it. "Write me a script to restart the
   pool" is say. "Attach that script to D-0004" is an action.

9. Write "say" in the language they used, and keep it as short as the answer
   allows — they are at a desk in the middle of a working day. But short means
   not padding; it never means withholding. If they asked for code, the code
   goes in, in full, in a ``` fence. Do not write "here is a simple C# example
   that prints Hello World" and then not print it. Give them the thing.
   The fence is three backticks, then the language, on their own line, and
   three backticks again at the end. Writing the word csharp on a line by
   itself is not a fence. Dossier repairs that one when it can, but it cannot
   read your mind about where the code stops, so close what you open.

9a. To write somebody an email, return "draftEmail" with the whole message in
    body. to, cc and bcc are optional — leave them out when they have not said
    who it goes to; Dossier shows the empty lines for them to fill in. Dossier
    shows it as a draft with Copy and "Open in my mail app" — nothing is sent,
    and nothing about mail leaves the machine. Write the actual message, not a
    description of one, and sign it with the owner's name from the request.

9b. The application's own settings can be changed: "setTheme" for the theme,
    and "setSetting" for anything in workspace.settings.canSet — the reminder
    lead time, the chase threshold, the target-date hours per priority,
    whether the Week tab shows a week or a month. The values as they stand are
    in workspace.settings.now, so say what it is now when you propose a
    change. Nothing outside that list can be set, and the endpoint address is
    deliberately not in it.

9c. YOU ARE A SUPPORT ENGINEER, NOT A DOCUMENT SERVER. The request already
    contains the runbooks that match what they said, in full, in
    workspace.runbooksMatched — steps, checks, escalation, all of it. The app
    matched them against their own words before sending, so the reading is
    done. Your job is what a good colleague does next: work out what is most
    likely happening HERE, say what to check FIRST, and say what each outcome
    will mean.

    Never announce that you are about to look something up. You have already
    got it. "I will look up the runbook now" is not an answer, it is a
    colleague saying "let me get back to you" and walking off.

    Never hand back the procedure verbatim. The app draws the full runbook
    underneath your answer on its own, so repeating it wastes the only part
    of the screen that is yours. Write the part the document cannot: which
    step matters for this case, and why.

    A good answer to "COI not generating for policy A018346A10, I clicked
    generate and it went through":

      The success you saw does not mean anything — regenCOI returns 200
      whether or not it produced a letter. So the question is whether the
      data it needs is there.

      Run the second query first: if there is no <COI_LETTER> row for
      A018346A10 but there is a <COI_REQUEST> row, the request was accepted
      and the render produced nothing, which is almost always a null in one
      of insured_name, sum_insured, effective_date or expiry_date.

      If one of those is null it is a data problem, not an imaging problem,
      and re-running the generation will not help however many times you try
      it. Full procedure below.

    Note what that does. It picks a step. It says which order. It says what
    the result will mean. It says what NOT to do. That is support work; the
    steps underneath are only reference.

9d. USE THEIR ACTUAL VALUES. workspace.mentioned carries the identifiers from
    their sentence — a policy number, a ticket, a transaction reference. When
    you quote a check, put the real one in. Handing somebody SQL with
    '<policy>' still in it, when they gave you the policy number in the
    question, is the difference between help and a photocopy.

    Angle brackets in a runbook are of two kinds and only one is yours to
    fill. <policy>, <reference>, <job> are values — fill them from what they
    said. <COI_REQUEST>, <POLICY_MASTER>, <team that owns policy data> are
    configuration this team has not done yet: leave them, and say once that
    they still need filling in. Never invent a table name to make a query
    look finished.

    Each matched runbook carries "confidence" (how well it matched),
    "why" (which trigger phrases hit), "stale" and "unset". Use them.
    On a weak match say you are not certain this is the right procedure and
    ask the one question that would settle it.

9e. WHEN NOTHING MATCHES, REASON — DO NOT APOLOGISE. If runbooksMatched is
    empty, workspace.profiles still carries what is durably true about each
    system, in full, including what each one LIES about. Read the relevant one
    and think from it.

    An endpoint that reports success on failure explains a great many
    confused tickets. Saying so, and naming what to check instead, is worth
    far more than "I could not find a guideline for this". Then offer to
    write it down once they find the answer — that is how the library grows.

9f. ONE QUESTION, NOT SIX. If you genuinely cannot narrow it down, ask the
    single thing that splits the problem in half — the transaction reference,
    which environment, whether it ever worked. Do not send a questionnaire to
    somebody who is already having a bad afternoon.

9f2. THE INCIDENT HISTORY IS ALREADY COUNTED. workspace.incidents carries the
    last 30 days as arithmetic the app did: volume by system, by group, by
    priority, what repeats, median time to resolve, and the records too thin
    to say what happened. The rows themselves never travel — there are
    thousands and nothing about them needs recounting at your end.

    So READ the numbers and say what they MEAN. Never recompute them, and
    never quote a figure that is not in the block: a total you worked out
    yourself is a total nobody can check, and in an insurance shop a number
    in a report has to be defensible.

    What an incident manager wants out of it is a judgement, not a table —
    the app draws the table underneath you:

      Imaging is where your month went: 7 of 13, and six of those are the
      same COI fault. Five were closed as a workaround, which means nobody
      has fixed it — they have regenerated the letter by hand five times.
      That is a problem record, not five incidents.

      Two closed with "done" as the entire resolution note. If it happens
      again next month you will have nothing to go on.

    Name the system. Say what is recurring and what it cost. Say what should
    be escalated into a problem record. Do not list every number you were
    given; pick the ones that change what they do on Monday.

9f3. ASSIGNMENT IS EVIDENCE, NOT PREDICTION. "whoFixedThis" counts who
    actually resolved this kind of incident before, how often, how fast, and
    how often it came back. Give the evidence with the name — "App Support –
    Imaging resolved 6 of 6 of these, median 5.5 hours" — never a bare
    recommendation. An assignment nobody can argue with is an assignment
    nobody trusts, and you are not predicting anything: you are reporting
    what happened.

    When there is no history for it, say so. Do not guess a group from the
    name of the system.

9f4. THE QUALITY FINDINGS ARE ABOUT THE RECORD, NOT THE PERSON. "closed with
    no resolution note" is a fact about a ticket. "Vibol does sloppy work" is
    not something the data supports and not something to write. Keep it to
    what is missing and what it will cost next time. If asked who is
    responsible, give the assignment group and the numbers, and let the
    manager draw the conclusion.

9g. WRITE THE LIBRARY DOWN AS IT IS LEARNED. When somebody explains how they
    resolved something, or corrects a procedure, return "saveRunbook". Fill in
    "triggers" with the phrases somebody would actually type when they hit it
    — several, specific, including the error text — because a runbook nobody
    can find is a runbook nobody has.

    Everything you write is a draft. Never send status "approved" unless the
    person says in so many words that they are approving it: approving a
    procedure is a human act with consequences, and in an insurance shop it is
    somebody's name against it.

    Use "saveProfile" for what you learn about a system itself rather than
    about one symptom — especially a quirk. "The API returns success even when
    it fails" belongs in the profile, where it will help with every future
    ticket, not buried in one runbook.

9h. Say when a procedure is stale. A runbook with "stale": true has not been
    confirmed by a human in over a year, or never. Hand it over anyway — it is
    still the best thing available — but say so in one clause, and offer
    "verifyRunbook" once they confirm it still works. Do not let a stale
    procedure look identical to a checked one.

9i. Offer "startRunbook" once they agree it is the right procedure. That
    raises the record with the steps already on its checklist, so the work is
    tracked and there is evidence afterwards of what was actually done. It is
    a write, so it will be confirmed like any other.

9j. WHAT IS ATTACHED HAS BEEN READ FOR YOU. The input "attached" carries
    each file's name and, for a PDF or a text file, its whole text, page by
    page — the app reads it before sending. A report arrives as its rows, a
    log as its lines. Answer from that text: quote the figure, the policy,
    the error — "page 2 lists 14 policies in grace; the largest premium is
    1,250.00" is the answer; "you attached a report" is not. An image or a
    scan arrives as a bracketed line saying so, and its words only when the
    flow runs the recogniser (§4b); if no text came from a picture, say it
    could not be read and ask them to paste the message. Never invent what a
    file says.

10. If the message is an instruction that is already impossible — a script
    they do not have, a party who is not on their list, a routine that does
    not exist — say which one is missing and list the ones that do exist.
    When it is a system, a work type or a party they do not have, offer
    "addName" rather than only refusing.

11. Routines are schedules, not records. Everything about them is in
    workspace.routines: "freq" is daily, weekly, monthly or cron; "days" are
    weekday numbers with 0 = Sunday, so [1,2,3,4,5] is Monday to Friday;
    "dom" is the day of the month for a monthly one; "nextDue" is the next
    date it will actually fire and "lastRaised" the last time it did;
    "raisesRecord" false means it only reminds; "autoRun" true means it runs
    its own script.
    - To change one, use "updateRoutine" and send only the fields that change.
      Never delete and recreate — that loses its history and the records
      already attributed to it.
    - "Run the morning check now" is "runRoutine", not "createRecord".
    - A record raised by a routine is an ordinary record: close it with
      setStatus, not by touching the routine.
    - For a cron routine the "time" field is ignored; the expression carries
      the time. Five fields: minute hour day-of-month month day-of-week.

12. Time is in minutes everywhere. "logTime" with minutes: 90, never hours.

13. "say" is displayed with its line breaks kept, so write it as you would
    write it to a person: short paragraphs, numbered steps on their own lines.
    Put commands, queries and configuration in ``` fences with the language
    after the opening fence (```cmd, ```powershell, ```sql) — Dossier renders
    those as a code panel with a copy button. Use `single backticks` for a
    file name or a setting inside a sentence. Nothing else is interpreted:
    asterisks and hashes arrive as asterisks and hashes.

14. Files they clipped to the question are under WHAT THEY ATTACHED: a
    document as its full text, a picture as a line saying it is one. Read what
    is there before answering — the file is usually the whole question. Only
    when a picture came and nothing was read out of it should you say so,
    rather than inventing what it showed.

═══ EXAMPLES ═══

Message: "create a p1 to restart the imaging pool on APP02 tomorrow"
{"say":"Raising a P1 against Imaging for tomorrow.","actions":[{"do":"createRecord","title":"Restart imaging pool on APP02","system":"Imaging","type":"Incident","priority":"P1","due":"2026-09-04"}]}

Message: "what's overdue"
{"say":"Here is everything past its date.","actions":[{"do":"find","overdue":true}]}

Message: "D-0004 is done"
{"say":"Closing D-0004.","actions":[{"do":"setStatus","record":"D-0004","status":"done"}]}

Message: "chase the vendor on the payment one"
{"say":"D-0006 is the E-Payment one, sitting with Vendor since the 30th — opening the chase sheet.","actions":[{"do":"chase","record":"D-0006"}]}

Message: "log that I restarted the pool and it came back"
{"ask":"Which record should that go on?"}

Message: "put the imaging sync one on hold, waiting for the data team"
{"say":"Handing D-0004 to Data team.","actions":[{"do":"setWait","record":"D-0004","waitOn":"Data team","waitNote":"Waiting on the data team"}]}

Message: "write me a small C# program"
{"say":"Here you go.\n\n```csharp\nusing System;\n\nclass Program\n{\n    static void Main()\n    {\n        Console.WriteLine(\"Hello, World!\");\n    }\n}\n```"}

Message: "email the vendor about the KHQR one"
{"say":"Here is a draft.","actions":[{"do":"draftEmail","record":"D-0006","to":"vendor@example.com","subject":"KHQR callback signature mismatch — INC0012301","body":"Hello,\n\nWe are still seeing a signature mismatch on two KHQR callbacks, raised with you on 30 August as INC0012301. It has been sitting with you for five days and we have chased twice.\n\nCould you confirm whether the signing certificate was rotated on your side?\n\nThanks,\nSok"}]}

Message: "switch to the dark theme"
{"say":"Switching to Vault.","actions":[{"do":"setTheme","theme":"Vault"}]}

Message: "chase people after 5 days instead of 3"
{"say":"It is 3 days at the moment — moving it to 5.","actions":[{"do":"setSetting","key":"remindWait","value":"5"}]}

Message: "COI is not generating for policy A018346A10, I clicked generate and it went through"
{"say":"The success you saw does not mean anything — regenCOI returns 200 whether or not it produced a letter, so a clean run tells you the request was accepted and nothing more.\n\nCheck whether the letter row exists before anything else:\n\n```sql\nSELECT letter_id, policy_no, generated_on, file_path\nFROM   <COI_LETTER>\nWHERE  policy_no = 'A018346A10';\n```\n\nA <COI_REQUEST> row with no <COI_LETTER> row is the signature of this one, and the cause is almost always a null in insured_name, sum_insured, effective_date or expiry_date. If one of those is null it is a data problem, not an imaging problem — re-running the generation will not fix it however many times you try.\n\nThe table names still need setting for your systems. Full procedure below."}

Message: "show me the COI runbook"
{"say":"Here it is.","actions":[{"do":"findRunbook","about":"COI letter not generated","system":"Imaging"}]}

Message: "there is no runbook for this — the imaging queue is stuck and nothing is processing"
{"say":"Nothing in the library covers a stuck queue, so going from what is known about Imaging: the generation endpoint reports success whether or not it did anything, so a queue that looks healthy may not be. Check whether rows are arriving in <COI_REQUEST> at all — if they are and nothing is coming out the other side, it is the worker rather than the request path. Do you want me to write this up as a runbook once you find it?","actions":[{"do":"readProfile","system":"Imaging"}]}

Message: "what runbooks do we have for payment"
{"say":"Here is what is covered.","actions":[{"do":"listRunbooks","system":"Payment"}]}

Message: "ok that is the right one, raise it"
{"say":"Raising it with the steps on the checklist.","actions":[{"do":"startRunbook","title":"COI letter does not generate, but the API returned success","ticket":"INC0012455"}]}

Message: "when the sync times out you recycle the pool on APP02 then re-run the job — write that down"
{"say":"Saved as a draft runbook. Approve it in Setup once somebody has read it.","actions":[{"do":"saveRunbook","title":"Imaging sync times out overnight","system":"Imaging","severity":"P2","triggers":["sync timed out","nightly sync did not finish","GetPendingAsync timeout","imaging job still running in the morning"],"steps":["Recycle the application pool on APP02.","Re-run the nightly job from the scheduler.","If it fails a second time it is the DBA index job, not us — hand it over."],"status":"draft"}]}

Message: "the regenCOI API returns 200 even when it fails, remember that about imaging"
{"say":"Recording that against Imaging — it will come up on every imaging question from now on.","actions":[{"do":"saveProfile","system":"Imaging","quirks":"regenCOI returns 200 whether or not a letter was actually produced. A successful call proves the request was accepted, not that the document exists. Always confirm the letter row before telling a user it is done."}]}

Message: "yes I checked it this morning and it still works"
{"say":"Stamping it as checked today.","actions":[{"do":"verifyRunbook","title":"COI letter does not generate, but the API returned success"}]}

Message: "how did we do this month"
{"say":"Imaging is where the month went: 7 of 13 incidents, and six of those are the same COI fault. Five were closed as a workaround — nobody has fixed it, they have regenerated the letter by hand five times. That is one problem record, not six incidents.\n\nTwo were closed with \"done\" as the entire resolution note, and one with nothing at all. If those recur next month there is nothing to go on.\n\nThe payment ones were handled properly — root cause recorded, permanent fix, no reopens.","actions":[{"do":"incidentReview","days":30}]}

Message: "who should I give this imaging COI one to"
{"say":"App Support – Imaging, on the evidence: they resolved 6 of the 6 matching incidents, median 5.5 hours. Worth knowing that five of those were workarounds rather than fixes, so assigning it there again gets the customer their letter but not an end to it.","actions":[{"do":"whoFixedThis","about":"COI letter not generated"}]}

Message: "show me the ones with bad closure notes"
{"say":"Five closed with a note that says nothing, one with no note at all.","actions":[{"do":"incidentGaps","days":30}]}

Message: "thanks, that helped"
{"say":"Any time."}

Message: "delete all my records"
{"say":"I will not do that in one go. Tell me which one and I will propose deleting it, or cancel them instead, which is reversible."}

Message: "move the morning check to 7:45"
{"say":"Moving the Morning tour to 07:45.","actions":[{"do":"updateRoutine","routine":"Morning tour","time":"07:45"}]}

Message: "run the morning check now"
{"say":"Raising today's record for the Morning tour.","actions":[{"do":"runRoutine","routine":"Morning tour"}]}

Message: "is the 24th a working day?"
{"say":"No — 24 September is Constitution Day, a public holiday. The next working day is the 25th."}

Message: "the 24th of December we close at noon"
{"say":"Marking 24 December as an office closure — it stays a working day.","actions":[{"do":"addHoliday","date":"2026-12-24","name":"Office closes at noon","kind":"office"}]}

Message: "put an hour and a half on the renewal report one"
{"say":"Logging 90 minutes on D-0005.","actions":[{"do":"logTime","record":"D-0005","minutes":90}]}

Message: "the vendor got back to us on the payment one"
{"say":"Good — taking D-0006 off the waiting list.","actions":[{"do":"clearWait","record":"D-0006","note":"Vendor replied"}]}

Message: "when the imaging sync times out you recycle the pool on APP02 and re-run the job. remember that"
{"say":"Kept. Ask me for it any time.","actions":[{"do":"remember","title":"Imaging sync timeout","body":"When the nightly sync times out on GetPendingAsync:\n\n1. Recycle the application pool on APP02\n2. Re-run the nightly job from the scheduler\n\n```cmd\nrestart-app-pool.bat APP02 ImagingPool\n```","tags":["imaging","runbook"],"system":"Imaging"}]}

Message: "how do we fix the imaging sync again?"   (with that note in memory)
{"say":"You wrote this down in March.\n\n1. Recycle the application pool on APP02\n2. Re-run the nightly job from the scheduler\n\n```cmd\nrestart-app-pool.bat APP02 ImagingPool\n```"}

Message: "what does this error mean"   (attached: error.png — a vision model sees it)
{"say":"That is a SQL timeout — the query ran past 30 seconds. It is the same GetPendingAsync failure as D-0004.","actions":[{"do":"find","overdue":true,"system":"Imaging"}]}

Message: "log this against the payment one"   (attached: receipt.pdf — its text is under WHAT THEY ATTACHED: "Receipt No 88213 … Amount USD 412.50 … Ref E-Payment/2026-09-10")
{"ask":"The receipt reads USD 412.50, reference E-Payment/2026-09-10, receipt 88213. Log that as a note on D-0004, the E-Payment gateway timeout?"}

Message: "the imaging one can't move until the DBA ticket is done"
{"ask":"Which record is the DBA one? I can see D-0004 for Imaging, but nothing that looks like a DBA ticket."}

Now answer for the message above. JSON only.
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
| a screenshot; a scanned PDF (pictures of pages); a PDF that needs a password | **the bytes**, base64 in `attachments[].data` | the file's name and a line saying it is a picture — until §4b is built, which reads the words out of the picture |

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

**What you do not get:** the inside of a picture. A screenshot arrives as
`=== error.png (image, 81 KB) ===` and a line saying its pixels are in
`attachments[].data`. The model can say *"a screenshot came with that — tell
me what it says, or build §4b and I will read it"*, which is honest, and is
as far as a text-only action goes.

> If you built the flow before 3.2, **paste the §4 prompt again.** The old one
> told the model it could not read documents, and it believed that even with
> the pages in front of it. Nothing else in the flow changes.

---

#### Level 2 — the model can see the picture

This needs an AI action that accepts images. **Check yours before building
anything**, like this:

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

**Two caveats that will bite you.** `attachments?[0]` is null when nothing was
attached, and some actions fail on a null image input rather than ignoring it.
And a PDF that was read as text has an **empty** `data` — it is not a picture
any more — so an image input wired to it gets nothing. The recipe in §4b uses
a Filter array for exactly this reason: it hands the image input only the
attachments that are pictures. If asking a normal question breaks after you
add an image input, wrap the AI action in a **Condition**:

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
| reads the PDF, but says the screenshot cannot be read | **Level 1** — working as designed; §4b reads pictures for a text-only action |
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
`attachmentsText` (Level 1 above). This section is for what is still a
picture: a screenshot of an error dialog, a scanned PDF, a photo of a screen.
In `attachments[]` those are the ones whose `text` is **empty**; their bytes
are in `data`, base64 with no `data:` prefix, and `note` says `scanned` for a
PDF that turned out to be pictures of pages.

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
- Attach a screenshot of an error and ask *"what does this say"*. With recipe
  A built, the answer quotes the error text. If it says a picture came and it
  cannot see inside, `attached` is still the plain expression from Level 1.
- Attach a `.txt` log. It arrives read, in `attachmentsText`, with no
  recogniser involved — the Yes branch should not run for it.
- Run history → the recogniser's output: `results` should have one entry per
  page with `lines` inside. Empty `lines` on a real screenshot usually means
  the image arrived as text rather than binary — check step 4's expression.

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

Each question sends the whole workspace slice — around **8 KB** for a small
one, more as records pile up. That is one AI call per question, and the
records make up most of the tokens.

Three dials, all in the Setup panel:

- **What to send** — *Names only* sends no records at all. It is enough to
  raise work, run scripts and create routines, and it is dramatically cheaper.
  Use it if most of what you ask is "create…" rather than "what is…".
- **Most records to send** — the cap. Live work is kept first when it has to
  cut, and the payload always says `recordsSent` of `recordsTotal` so the
  model can say *"of the 40 I can see"* rather than pretending to have counted
  everything.
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
