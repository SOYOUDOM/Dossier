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
          "data": { "type": "string" }
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

**No Select action, no `item()` expression.** An earlier version of this page
told you to build the file list yourself with a Data Operation → Select. That
was wrong — the app already knows the file names, so it now sends them ready
to use. `attachmentsText` is one line of plain text, like

```
error.png (image/png, 81 KB); spec.pdf (application/pdf, 400 KB)
```

or the single word `None.` when nothing was clipped. If you already added a
Select for this, delete it.

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

If files are listed above, the images and documents themselves are given to
you as inputs alongside this prompt — look at them, they are usually the whole
of what is being asked about. Answer from what you actually see in them. If you
cannot see an attached image or document — because this model reads only text —
say that plainly instead of guessing what it contains.

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

9. Write "say" in the language they used. Keep it short. They are at a desk
   in the middle of a working day, not reading a report.

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

14. Files they clipped to the question are listed under WHAT THEY ATTACHED,
    and the images and documents themselves are wired into this action's own
    image/document input (§6). When something is attached, read it before
    answering — a screenshot of an error is usually the whole question. Only a
    vision- or document-capable action can see them; if yours cannot, say so
    rather than inventing what the picture showed.

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

Message: "log this against the payment one"   (attached: receipt.pdf, but a text-only model)
{"ask":"I can see a file called receipt.pdf came with that, but this model cannot read documents. Tell me the amount and reference and I will log it."}

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

### Attachments: what to actually click

There are **two separate levels**, and they are worth doing in this order
because the first one takes a minute and always works.

---

#### Level 1 — the model is told a file arrived

This is one prompt input. Nothing else. No Select, no loop, no condition.

In your AI action's input list, add an input:

| | |
|---|---|
| **Name** | `attached` |
| **Type** | Text |
| **Value** | `body('Parse_JSON')?['attachmentsText']` |

That's it. The prompt in §4 already has a `WHAT THEY ATTACHED` section that
reads `{attached}`, so the model now sees:

```
error.png (image/png, 81 KB)
```

**What you get:** the model knows a file came, and what it is. It can answer
*"I can see you attached error.png, but tell me what the error says and I'll
log it"* instead of ignoring the file entirely. On a text-only action this is
as far as you can go, and it is still a real improvement over silence.

**What you do not get:** the model cannot see what is *in* the picture.

---

#### Level 2 — the model can see inside the file

This needs an AI action that accepts images or documents. **Check yours before
building anything**, like this:

> In your AI action, add another input and open the **Type** dropdown.
> - If the only option is **Text** → your action cannot see pictures. Stop at
>   Level 1.
> - If you see **Image**, **File** or **Document** → carry on.

I can't tell you which it will be, because it depends on the action and the
model you picked when you created the prompt. Look at the dropdown; that is
the authoritative answer.

**Do not put the base64 into a Text input to get around this.** It does not
work. The model receives 100,000 characters of `iVBORw0KGgo…`, cannot decode
them, and the question itself gets crowded out. It fails in a way that looks
like the model being stupid rather than the wiring being wrong.

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

**One caveat that will bite you.** `attachments?[0]` is null when nothing was
attached, and some actions fail on a null image input rather than ignoring it.
If asking a normal question breaks after you add this, that is why. Wrap the
AI action in a **Condition**:

| | |
|---|---|
| **Condition** | `length(body('Parse_JSON')?['attachments'])` **is greater than** `0` |
| **If yes** | the AI action *with* the image input wired |
| **If no** | the AI action *without* it |

Two copies of the action is clumsy, and it is the honest way to do it in the
designer. If your action ignores a null image, skip the condition.

---

#### Which level am I on?

Ask the assistant something with a screenshot attached and read the reply.

| The reply says | You are on |
|---|---|
| nothing about the file at all | Level 0 — the `attached` input is not wired, or you have not repasted the §4 prompt |
| it names the file but says it cannot read it | **Level 1** — working as designed |
| it describes what is in the picture | **Level 2** — working |
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

The limits, after shrinking: **five files, 2 MB each, 3.5 MB for one
question**, images / PDF / text only. A PDF cannot be shrunk in a browser, so
one over 2 MB is refused before it is read. The composer shows the running
total, so you can see what a question weighs before you send it.

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
