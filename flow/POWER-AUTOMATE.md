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

**Optional, later: two models.** ③ can become a Condition with two prompt
actions — a fast model for everyday chat and a stronger one for the jobs
that need thinking (the daily look back, learning a BAU document,
**Diagnose** on a record). That is §4e, and it is worth doing once the flow
works with one.

---

## 2. The trigger

**When an HTTP request is received** · Method: **POST**

Then copy the URL it gives you — *after saving the flow*, because the URL does
not exist until the first save — and paste the whole thing, `&sig=…` included,
into **Menu → Setup → Ask through Power Automate → Endpoint URL**.

### Leave the Request Body JSON Schema empty

This is the part that surprises people. Resolv posts with
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

Add your AI action — **AI Builder → Run a prompt**, or whatever you have. Pick
a model that can see images (the GPT-4o / GPT-4.1 family can), and the
fastest one offered — usually the one with *mini* in its name.

**It has two inputs and no text of its own.** Resolv writes the whole prompt
— instructions, your workspace, the conversation, your notes, what you
attached — and sends it ready to run as `prompt`, with the picture beside it.

1. **Parse JSON → Schema**: replace it with this short one. Resolv sends
   only these fields in this setup, so a long schema would only slow the step
   down, and one generated from a sample would refuse the smaller request.

   ```json
   {
     "type": "object",
     "properties": {
       "probe":       { "type": "boolean" },
       "mode":        { "type": "string" },
       "tier":        { "type": "string" },
       "message":     { "type": "string" },
       "prompt":      { "type": "string" },
       "picture":     { "type": "string" },
       "pictureName": { "type": "string" }
     }
   }
   ```

   `mode` says what kind of question it is (`chat`, `reflect`, `fix`,
   `intake`, …) and `tier` which model it wants (`fast` or `deep`). Nothing
   needs them until §4e; they are in the schema so they show up in the
   dynamic-content picker when you get there.

2. Open the prompt action's editor and **delete all the text in it**.
3. Add an input, type **Text**, named `prompt`. Add a second input, type
   **Image**, named `picture`. Insert both into the empty prompt text — the
   `prompt` input first, then the `picture` input — and nothing else.
4. Back in the flow, set the two inputs (Expression tab):

   | input | value |
   |---|---|
   | `prompt` | `body('Parse_JSON')?['prompt']` |
   | `picture` | `base64ToBinary(body('Parse_JSON')?['picture'])` |

5. Save, then in Resolv: **Setup → Ask through Power Automate → Your flow →
   Reads the prompt and SEES the picture**.

**You will not need to open the prompt action again.**

What that last setting changes: a picture is looked at by the model instead
of being read into words on your PC first — which took several seconds per
picture and made every answer about a picture an answer about its text.
Several pictures go as one, side by side, each numbered with its name. When
nothing is attached, `picture` is a single white pixel — the input cannot be
left empty — and the prompt then ends with a short *NO PICTURE THIS TIME*
section saying so, right before the image, so a mini model does not start
describing a blank square instead of answering. The request also stops carrying everything a second
time beside the prompt, which roughly halves it.

> **Only the prompt, no picture input?** Leave **Your flow** on *Reads the
> prompt only*, keep the one `prompt` input, and keep your old schema.
> Pictures are then read into words on your PC and described to the model,
> as before. It works; it is slower and it can only talk about what the
> description says.

The seconds under each answer in Resolv are how long Power Automate took.
If that number is high for a plain question, the model is the thing to
change: a *mini* model, never a *reasoning* one, for chat.

### Changing the prompt from now on

The instructions live in a text file, **`flow/prompt.txt`**, beside
`dossier.html`. Open it in Notepad, change it, save it — the next question you
ask uses it. There is nothing to reload and nothing to change in Power
Automate.

Resolv looks for the prompt in this order and uses the first one it finds:

| | |
|---|---|
| `dossier-prompt.txt` **in your records folder** | Your own version. Updates to Resolv never touch that folder, so this is the place for changes you make yourself. **Setup → Ask through Power Automate → Copy the template** gives you the current text to start from. Delete the file to go back to the one that ships. |
| `flow/prompt.txt` beside `dossier.html` | The one that ships with Resolv, and the one updated when the prompt is improved. Read when Resolv.bat hands out the page. |
| the copy inside `flow.js` | Always there, for a page opened straight from the folder, which is not allowed to read a file beside it. `python flow/embed-prompt.py` refreshes it after `flow/prompt.txt` changes. |

**Setup → Ask through Power Automate** shows which one is in use, and
**Preview the request** shows exactly what the model will read, filled in.

The text has nine places that Resolv fills in before sending. Keep them —
a prompt without `{message}` cannot answer anything, and Resolv will not use
one:

| In the text | Resolv puts there |
|---|---|
| `{message}` | what they just typed |
| `{today}`, `{weekday}` | the date, and the day's name |
| `{calendar}` | the working days worked out: next working day, this week, holidays near |
| `{workspace}` | the workspace: systems, people, lessons, runbooks, records, counts |
| `{actions}` | the complete list of actions Resolv accepts |
| `{history}` | the conversation so far |
| `{memory}` | the notes they taught it |
| `{attached}` | every attached file, read as text |

Each is filled once, in one pass: a message that happens to contain the
letters `{workspace}` is sent as those letters.

`node flow/check-prompt.js` checks the file: every example reply in it
against the validator Resolv applies to real replies, all nine places
present, the copy in `flow.js` the same as the file.

> **A flow built the older way keeps working.** The request still carries
> `message`, `workspace`, `can`, `conversation`, `attachmentsText` and the
> rest, so a prompt action with nine inputs of its own goes on answering.
> It just does not see changes to `flow/prompt.txt`.

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
  "why": "Reachability check from Resolv, not a question. Answer 200 and stop." }
```

That is Resolv working out **why** the first one failed. A blocked host, a
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
| a PDF with text in it; a `.txt`, `.log`, `.csv` | **the words**, read out of the file by the app on your PC | the pages, under the file's name, in the `{attached}` part of the prompt |
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

This is base64 **without** any `data:image/png;base64,` prefix — Resolv
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
| says nothing about either file | the prompt action is not the one-input version from §4 — its only input should be `body('Parse_JSON')?['prompt']` |
| reads the PDF and describes the screenshot's text and layout, but cannot say what is in a photo | **Level 1 with `ocr.js`** — working as designed; Level 2 above is the one expression that lets it see |
| reads the PDF, but says the screenshot cannot be read | **Level 1** without `ocr.js` — put the file beside the app, or build §4b |
| names the PDF but says it cannot read documents | the prompt action still has its own old text — clear it to the one `prompt` input (§4) |
| reads both | **Level 2**, or Level 1 with §4b built — working |
| the flow errors only when a file is attached | the null-image caveat above, or size — see §8 |

**On size, which is the thing that breaks this.** Base64 is a third larger
than the file it encodes, so a 4 MB screenshot arrives as 5.2 MB of JSON —
enough that a question with a screenshot on it fails while the same question
typed out succeeds, which is a maddening symptom to chase.

So Resolv shrinks images before they go: redrawn at 1600px on the longest
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

9. Change the prompt action's one input, `prompt`, to:
   ```
   concat(body('Parse_JSON')?['prompt'], '\n\nText the flow read off the attached pictures: ', variables('attachedText'))
   ```
   (With `ocr.js` beside the app this adds nothing, because every picture
   arrives already read and the loop above never runs.)

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

**Nothing to build.** It uses the flow you have, and the instructions for
it are in `flow/prompt.txt` like everything else.

At the time set in **Setup → What I have learned about you** (noon by
default — the lunch break), Resolv sends one question that starts with
`[reflect]`. `workspace.mode` is `"reflect"`, and the `{attached}` part of the prompt holds
everything since the last look: records **closed** with how they were
resolved, records **raised** with who raised them and against what, the
**conversations**, and answers marked *not what I meant*. The prompt in `flow/prompt.txt`
tells the model what to do with it: a few `learn` lessons, a `remember` note
for each resolution worth reusing, a draft `saveRunbook` when a problem keeps
coming back — and one question it would like you to answer.

If Resolv is closed at noon it happens the next time it is open after noon.
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
| `[fix]` | closing a record by hand (**How was it fixed?**), or **Write the fix note** on a record | reads the record and writes one line: what fixed it |
| `[check]` | **Setup → Checks → Run checks** | judges whether a new answer agrees with a correction you once gave: PASS or FAIL, and why |
| `[brief]` | **Setup → About my work → Draft it from my records** | writes a first "About my work" page from what the workspace knows, ending with the three questions that would fill the biggest gaps |
| `[intake]` | **Paste a message** | reads the pasted email or chat and fills in the new record — title, system, type, priority, who asked — with two to four first steps |

The kind of question also travels on its own, as `mode` at the top of the
request, beside `tier` (`fast` or `deep`) — §4e uses `tier` to send the hard
jobs to a stronger model.

---

## 4d. Making it fast

The app side is done for you: a picture is sent at the size the model reads
(768 pixels on the short side — GPT-4o-class models scale everything down to
that before looking), and a picture the app has already read travels once, as
`picture`, not twice. On the flow side, in order of how much they save:

1. **Use the one-input prompt action** (§4). The prompt Resolv sends is
   about six thousand tokens shorter than the old pasted one, and it no
   longer carries your notes twice.
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

## 4e. Two models: a fast one for chat, a strong one for hard jobs

**What it gets you.** Everyday questions stay quick on a *mini* model. The
jobs where a better model makes a real difference — the daily look back,
learning a BAU document, runbook interviews, **Diagnose** on a record, and
**✦ Think harder** under any answer — go to a stronger one. You pay the
stronger model's price and wait only where it earns it.

**What changes.** One new prompt (a copy of the one you have, with a
different model), one Condition, one variable. About fifteen minutes. Your
existing flow keeps working the whole time: until Resolv is switched to
*Two*, every request says `tier: "fast"`.

```
① When an HTTP request is received
② Parse JSON
   Initialize variable  answer                              ← new
   Condition  "Deep?"  tier is equal to deep                ← new
     If yes:  Run a prompt  (Resolv deep)   → Set variable answer   ← new
     If no:   Run a prompt  (your prompt)    → Set variable answer   ← moved in
④ Compose — "Clean"        now reads variables('answer')    ← one edit
⑤ Response                 unchanged
⑥ Response — "Fallback"    run after Clean                  ← check it
```

### Step 1 — Make the strong prompt

The model is a setting **of the prompt**, not of the flow action, so the
strong model needs its own prompt.

1. Open where your prompts live. In Power Automate: **AI hub → Prompts**
   (in some tenants it is under **More → AI hub**, or **AI models**; in
   Copilot Studio it is **Tools → Prompts**). You can also get there from
   the flow: open your **Run a prompt** action and use the prompt picker's
   **+ New custom prompt**.
2. **+ New prompt** (or **Build your own prompt**). Name it `Dossier deep`.
3. Delete any text it starts with. Add the **same two inputs** as your
   existing prompt, with **exactly the same names**:
   - **Text** input named `prompt`
   - **Image** input named `picture` (only if your flow uses the picture
     setup from §4 — if your existing prompt has only `prompt`, do the same
     here)

   Insert both into the empty instruction box — `prompt` first, then
   `picture` — and nothing else. It should look exactly like your first one.
4. **Pick the model.** In the prompt editor it is the model name at the top
   right, or under **⚙ Settings → Model**. The list differs by tenant and
   changes over time; choose by these rules rather than by a name:

   | | pick | avoid |
   |---|---|---|
   | your existing (fast) prompt | the default *mini* model — e.g. *GPT-4.1 mini* | anything called *reasoning*, *o1*, *o3* |
   | `Dossier deep` | the standard full-size model — e.g. *GPT-4.1*, or a *GPT-5 chat* model if offered | a reasoning model, unless you have tested it answers in well under 100 seconds |

   If you use the picture setup, the model you pick **must accept images**
   (the GPT-4o / GPT-4.1 / GPT-5 families do). If a model has no image
   support the editor will not let you add the Image input, which tells you.
5. **Temperature** (if the editor shows it): 0 to 0.3. **Output**: *Text* —
   the same as your first prompt, not JSON; the Clean step handles the JSON.
6. **Test it** in the editor: type `Reply with exactly {"say":"deep ok"}` into
   the `prompt` test box and run it. You should get that line back.
7. **Save.**

> **Answering the probe already?** If your flow has the `probe` Condition
> from *The second run* (§4), everything below goes inside its **If no**
> branch, except **Initialize variable**, which must stay at the top level —
> put it directly under Parse JSON, above the probe Condition.

### Step 2 — The variable that will hold the answer

Both branches write their answer into one place, so everything after the
Condition reads one thing whichever model ran. (Variables have to be
declared at the top level of a flow, which is why this is not inside the
Condition.)

1. Directly under **Parse JSON**: **+ New step → Variables → Initialize
   variable**.
2. **Name** `answer` · **Type** *String* · **Value** leave empty.

### Step 3 — The Condition

1. Under **Initialize variable**: **+ New step → Control → Condition**.
   Rename it `Deep?` (⋯ → Rename).
2. Left box: switch to the **Expression** tab and enter

   ```
   body('Parse_JSON')?['tier']
   ```

   (or pick **tier** from Parse JSON's dynamic content — it is there if you
   added it to the schema in §4).
3. Operator: **is equal to**. Right box: `deep` — lower case, no quotes.

### Step 4 — Put a prompt in each branch

**If no** (the fast one — what you have today):

1. Drag your existing **Run a prompt** action into **If no**. (New designer:
   drag it by its title onto the *+* inside the branch. If dragging does not
   work in your designer, add a fresh **Run a prompt** there instead, pick
   your existing prompt, set its two inputs as in §4 step 4, and delete the
   old one afterwards.)
2. Under it, inside **If no**: **+ → Variables → Set variable**. **Name**
   `answer`, **Value**: from the dynamic content of *that* Run a prompt
   action, the token called **Text** (sometimes *Predicted text* or
   *Response text*). Pick it from the list rather than typing a path — the
   path differs between versions of the action.

**If yes** (the strong one):

1. **+ → AI Builder → Run a prompt**. Rename it `Run a prompt deep`.
2. **Prompt**: `Dossier deep`.
3. Its inputs, on the **Expression** tab, exactly as the fast one:

   | input | value |
   |---|---|
   | `prompt` | `body('Parse_JSON')?['prompt']` |
   | `picture` | `base64ToBinary(body('Parse_JSON')?['picture'])` |

4. Under it: **Set variable** · `answer` · the **Text** token of *Run a
   prompt deep*.

> **Do not copy a Set variable from one branch to the other.** A copy keeps
> reading the action it was made for — the deep prompt — and on every
> ordinary question that action is skipped, so the copy fails, the Condition
> fails, and every answer becomes the Fallback's. Add each Set variable
> fresh and pick the **Text** token of the Run a prompt *in its own branch*.

### Step 5 — Clean reads the variable

Open **Compose — "Clean"** and replace its expression with

```
json(replace(replace(trim(variables('answer')), '```json', ''), '```', ''))
```

That is the only edit to the rest of the flow. **Response** is unchanged
(`outputs('Clean')`).

> Would rather not have a variable? Clean can pick whichever ran directly:
> `coalesce(<Text token of Run a prompt deep>, <Text token of Run a prompt>)`
> in place of `variables('answer')`, inserting both tokens from the picker.
> The variable is easier to read back in the run history, which is why it is
> the recommended way.

### Step 6 — Make sure the safety net still catches everything

Open **Response — "Fallback"** → **⋯ → Configure run after**. It must run
after **Clean** with **has failed**, **is skipped** and **has timed out**
ticked. (If it used to run after *Run a prompt*, that action is inside the
Condition now and cannot be pointed at from outside — point it at **Clean**.
A failure inside either branch makes Clean *skipped*, so *is skipped* is the
tick that catches it.)

**Save** the flow.

### Step 7 — Switch Resolv to two models

**Menu → Setup → Ask through Power Automate**:

1. **Models in your flow** → *Two: a fast one for chat, a stronger one for
   hard jobs*.
2. **Strong model for** — tick what should go to it. The defaults: the daily
   look back, learning a BAU document (and **Make a runbook**), runbook
   interviews, and **Diagnose**. *Reading a pasted message* is off by
   default (the fast model does it well and you are waiting on it); *every
   chat question* is there if you want it, and costs what you would expect.
3. **Wait for the strong model** — 110 seconds by default. **Power Automate
   itself gives up on an HTTP request after two minutes** — the flow keeps
   running, but the answer can no longer be returned — so do not go above
   115, and pick a model that answers well inside that.

### Step 8 — Check it works

1. In the assistant, ask anything ordinary. Under the answer: a time like
   `1.9 s` — the fast one.
2. Under that answer press **✦ Think harder**. The same question goes again;
   under the new answer: `8.4 s · strong model`.
3. In Power Automate, open **Run history** → the latest run → **Deep?**. The
   **If yes** branch has the green ticks; the run before it went through
   **If no**.
4. **Setup → What I have learned about you → Look back now** — that run goes
   through **If yes** too.

### When it goes wrong

**Every question comes back as *I could not work that one out*, and the run
shows `Deep?` with a red ! — "ActionFailed. An action failed. No dependent
actions succeeded".** That message is the Condition saying *something inside
me failed*; it never says what. To see what:

1. Open the run. On the Condition, the branch that ran is the one **not**
   greyed out — **False** for an ordinary question.
2. Click that branch's box (it may be collapsed to "2 Actions") so its
   actions show.
3. Click the action with the red **!** and read **Error** on the left (or the
   red text under *Outputs*). Then:

| the action with the red ! | its error says | fix |
|---|---|---|
| **Set variable** in the **False** branch | `… 'Run_a_prompt_deep' … skipped` / `… not executed` / `InvalidTemplate` | It was copied from the True branch and still reads the **deep** prompt's answer — which never runs on a False question. Open it, delete the value, and insert the **Text** token of the **Run a prompt in the same (False) branch**. Check in **Code view**: the value must name that action (e.g. `Run_a_prompt`), not `Run_a_prompt_deep` |
| **Set variable** in either branch | `… of type 'String' cannot be … with value of type 'Object'` (or `'Null'`) | The wrong token was picked (*Response*, *body*…). Delete it and pick **Text** from that branch's Run a prompt |
| **Run a prompt** in the False branch | `… required …` / `… input …` / `BadRequest` | Moving it cleared its inputs, or it points at the wrong prompt. Open it: **Prompt** = your original prompt; `prompt` = `body('Parse_JSON')?['prompt']`; `picture` = `base64ToBinary(body('Parse_JSON')?['picture'])` |
| **Run a prompt deep** in the True branch | any | The same three checks on the deep side: prompt `Dossier deep`, the two inputs as above, and a model that takes images |
| **Run a prompt** (either) | `InputContentFiltered` · *Prompt was filtered. [105]* · `DependencyHttpStatusCode 400` | Nothing is wrong with the flow: Microsoft's content filter refused the prompt before the model read it. It blocks text that looks like an attempt to give the model orders — rules appended after the content, "ignore…", "do not look at…", "you must…". Resolv 4.6.1 appended exactly such a block to every question without a picture; **4.6.3 removed it** — reload Resolv. Resolv also asks a blocked question once more without your notes, lessons, runbooks and records, and says so under the answer if that one got through: then a note or lesson written as rules for the AI is the trigger — reword it as plain facts |

Fix, **Save**, and ask Resolv something again — no need to reload it.

**Let Resolv show the error itself.** Give the Fallback response's **Body**
this expression instead of the plain sentence, and Resolv puts the failing
prompt action's error under the answer (and recognises a content-filter
block by name):

```
concat('I could not work that one out. ', coalesce(actions('Run_a_prompt')?['outputs']?['body']?['error']?['message'], actions('Run_a_prompt_deep')?['outputs']?['body']?['error']?['message'], ''))
```

With only one prompt action, leave out the `Run_a_prompt_deep` part:
`concat('I could not work that one out. ', coalesce(actions('Run_a_prompt')?['outputs']?['body']?['error']?['message'], ''))`.
Use your actions' own names, spaces as `_`. If it will not save, keep the
plain sentence — Resolv still recognises it.

| what you see | what it is | fix |
|---|---|---|
| Everything still says `1.x s`, never *strong model* | Resolv is still on *One model*, or the Condition never matches | Setup → Models in your flow → *Two*. In the Condition the right box must be `deep` exactly — no quotes, lower case |
| `InvalidTemplate` mentioning `variables('answer')` | the variable is not initialized, or initialized inside the Condition | Initialize variable must be at the top level, **before** the Condition |
| A strong-model question ends in "went quiet" / timeout | the strong model took longer than the wait, or than Power Automate's two minutes | Pick a non-reasoning model for `Dossier deep`; open the run and look at how long *Run a prompt deep* took |
| The strong model's answer ignores the picture | `Dossier deep` has no Image input, or its model cannot see images | Add the `picture` input (step 1.3) and a model that takes images |
| `The template language expression … Run_a_prompt_deep` | an expression refers to an action by an old name | Use the **Text** token from the picker instead of typing the name; names use `_` for spaces |
| Fallback runs on every question | its run-after points at something that is skipped on one branch | Point it at **Clean** only (step 6) |

### What it costs

AI Builder charges per call by the model's rate: the *mini* models are the
cheapest, full-size ones cost several times more per call, reasoning ones
more again. With the defaults the strong model is used by one look back a
day, the BAU documents you hand it, and the **Diagnose** / **Think harder**
presses you make — a handful of calls a day. Everyday chat, "How was it
fixed?", checks and pasted messages stay on the fast one. Your admin centre
(Power Platform admin center → Capacity → AI Builder credits) shows what
is being used.

---

## 5. How to give it the knowledge

There are two kinds of knowledge here and they go in different places. Getting
this the wrong way round is the second most common reason these flows fail.

### Knowledge that changes every request → **an input variable**

Your systems, your people, your scripts, your records, today's date, and the
list of actions the app accepts. **All of this arrives in the request body**,
already assembled by Resolv, already current. It goes into the prompt as the
`{workspace}` and `{actions}` inputs.

Do **not** put any of it in a knowledge base, a SharePoint file, or a
Dataverse table. It would be stale within a day, and you would be maintaining
by hand a list the app already generates from its own running code.

The `can` array is the important one. It is generated from `flow.js` itself,
so when Resolv gains an action your flow can use it immediately, with the
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
action Resolv does not have will produce actions the app refuses by name, and
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
Resolv.

| Field | Value |
|---|---|
| **Status Code** | `200` |
| **Headers** | `Content-Type` : `application/json` |
| | `Access-Control-Allow-Origin` : `*` |
| **Body** | `outputs('Clean')` |

**The `Access-Control-Allow-Origin` header is not optional.** Without it your
flow runs perfectly, its run history says *Succeeded*, and the browser refuses
to let Resolv read a single byte of the reply. Resolv detects this case
specifically and tells you so by name — but it costs you a round trip to find
out, and without the header nothing will ever work.

`*` is right here. Resolv may be running from `file://`, whose origin is the
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

Resolv accepts plain text as the answer, so this turns "the model returned
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

Save. Paste the URL into Resolv. Press **Test the connection**. Get all six
rungs green. If you cannot, the answer is on the rung that failed and no
amount of prompt work will help.

**Round 2 — one action, no AI.** Change the Response body to:

```json
{ "say": "Switching to Day.", "actions": [ { "do": "view", "view": "day" } ] }
```

Ask the assistant anything. Resolv should switch tabs. The contract is now
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
| *"x" is not something Resolv can do* | the model invented an action. Tighten rule 1; check `{actions}` is actually reaching the prompt. |
| *must be one of …* | the model used a value outside the enum. The exact allowed values are in the `args` of that action in `{actions}`. |
| *there is no record "D-9999" here* | the model invented a code. Rule 3. Also check **What to send** is not set to *Names only*. |
| *there is no script called "…"* | the name is not one of `workspace.scripts`. The message lists the ones that are. |
| a run that succeeds but Resolv says nothing | the model returned prose, not JSON. Check the `Clean` step, and that the prompt ends with *JSON only*. |
| nothing at all in the run history | the request never arrived. Almost always the URL. |
| **two runs, the second tiny with `"probe": true`** | the first one failed. Open that one — the probe is Resolv asking *why*, not the question. See above. |
| `Invalid input: Input parameters are invalid for your model` **with no attachment** | a required text input got **null**. Almost always `attached` wired to `attachments?[0]?['data']`, which is null when nothing is clipped. Wire it to `attachmentsText`, which is never null — it says `None.` |
| `This model's maximum context length is 128000 tokens` **with an attachment** | the base64 went into a **text** input. A 400 KB file is ~136,000 tokens on its own. Text inputs get `attachmentsText` (~1 token); the base64 only ever goes into an **Image/File** input. |
| **a question works until you attach something** | size. Check the request body's length in the failed run; Resolv now shrinks images, so if it is still large it will be a PDF. The reply in the chat tells you how much the question weighed. |

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

Resolv masks the signature in the relay transcript for exactly this reason:
the transcript is the thing you paste into a chat window when asking someone
for help.
