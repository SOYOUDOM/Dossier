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
              "id":     { "type": "string" },
              "title":  { "type": "string" },
              "freq":   { "type": "string" },
              "time":   { "type": "string" },
              "paused": { "type": "boolean" }
            }
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

Define **five inputs** and wire them to the parsed body:

| Input name | Value (expression) |
|---|---|
| `message` | `body('Parse_JSON')?['message']` |
| `today` | `body('Parse_JSON')?['today']` |
| `weekday` | `body('Parse_JSON')?['weekday']` |
| `workspace` | `string(body('Parse_JSON')?['workspace'])` |
| `actions` | `string(body('Parse_JSON')?['can'])` |
| `history` | `string(body('Parse_JSON')?['conversation'])` |

`string()` turns the object or array into JSON text, which is what a prompt
input wants.

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

═══ WHEN THIS IS ═══

Today is {today}, a {weekday}.

═══ WHAT WAS SAID BEFORE ═══

{history}

═══ WHAT THEY JUST SAID ═══

{message}

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
{"say":"I cannot delete anything — nothing in Dossier does. The closest is cancelling a record, which is reversible. Tell me which one and I will propose that."}

Now answer for the message above. JSON only.
```

### Why this prompt is shaped this way

Your earlier attempt failed — *"it couldn't find this information"* — because
the model had no idea what your app is, what a record looks like, or that
`createRecord` exists. It was being asked to invent an API it had never seen.
Everything above §"HOW TO ANSWER" is there to fix exactly that.

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
