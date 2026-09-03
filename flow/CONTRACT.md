# The contract between Dossier and your flow

This is what Dossier sends, what it expects back, and what it will refuse.
It is generated from `flow.js`, which is the code that actually enforces it,
so the two cannot drift apart.

You do not need to read this to *use* the feature — paste your endpoint URL
into **Menu → Setup → Ask through Power Automate** and press **Test the
connection**, and it will tell you which rung is broken. You need it to
*build the flow*.

---

## 1. The shape of it

```
Dossier                    flow/relay.html              your flow
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

A flow with no Response action never answers. Dossier waits, times out, and
says so. Add **Response** as the last step.

### 2.2 Put `Access-Control-Allow-Origin: *` on that Response

This is the one that catches everybody. Without it your flow **runs
perfectly** — you will see it succeed in the run history — and the browser
still refuses to let Dossier read the reply. It looks like a network failure
and it is not.

In the Response action's **Headers**:

| Key | Value |
|---|---|
| `Content-Type` | `application/json` |
| `Access-Control-Allow-Origin` | `*` |

Dossier's connection test names this case specifically rather than reporting
"failed to fetch", because the difference is not guessable from the outside.

### 2.3 A note on the request's content type

Dossier posts with `Content-Type: text/plain`, deliberately. A POST of
`application/json` is not a "simple" cross-origin request, so the browser
sends an `OPTIONS` preflight first, and the Power Automate request trigger
does not answer `OPTIONS` — the call dies before your flow ever runs, with
nothing in the run history to look at.

The body is still JSON. In the trigger, either leave the schema empty and use
`json(triggerBody())`, or paste the sample below into **Use sample payload to
generate schema**.

---

## 3. What Dossier sends

One JSON object, POSTed as the body.

```jsonc
{
  "dossier": 1,
  "protocol": "1.0",
  "askedAt": "2026-09-03T04:12:00.000Z",
  "today": "2026-09-03",
  "weekday": "Thursday",
  "timezone": "Asia/Phnom_Penh",
  "message": "create a task to restart the imaging pool tomorrow, P1",
  "conversation": [ { "who": "person", "text": "…" },
                    { "who": "dossier", "text": "…" } ],
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
                      "freq":"daily", "time":"08:30", "paused":false } ],
    "counts":     { "records":7, "live":5, "overdue":1,
                    "dueToday":2, "waiting":1, "blocked":1 },
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
it to your model rather than hard-coding a list — when Dossier gains an action
your flow gets it for free, and it can never ask for one that does not exist.

**How much goes** is set in the panel and reported in `workspace.scope`:

| scope | records sent |
|---|---|
| `names` | none at all — the vocabulary only. Enough to raise work and run scripts. |
| `live` | everything not finished. The default. |
| `all` | finished records too. |

Notes and work logs are **not** sent unless *Include notes and work logs* is
switched on. `recordsSent` vs `recordsTotal` tells you when the list was
capped, so you can say "of the 400 I can see" rather than pretending to have
counted everything.

---

## 4. What your flow returns

```jsonc
{
  "say": "Raised D-0042 for tomorrow.",
  "ask": "Which server — APP01 or APP02?",
  "actions": [
    { "do": "createRecord", "title": "Restart imaging pool",
      "system": "Imaging", "type": "Incident", "priority": "P1",
      "due": "2026-09-04" }
  ]
}
```

Everything is optional. `say` alone is a perfectly good reply. Arguments may
sit at the top level of the action or inside an `args` object — both are read.

Dossier is forgiving about the wrapper, because Power Automate's Response
action produces several shapes depending on how it was built. All of these
work:

- `{ "say": …, "actions": [ … ] }` — the intended shape
- `{ "body": { "say": …, "actions": [ … ] } }` — a nested body
- `[ { "do": "view", "view": "day" } ]` — a bare array of actions
- `{ "message": "…" }` — `message` and `text` are accepted as `say`
- plain text, not JSON at all — taken as the answer, so a flow you have not
  finished still says something useful

---

## 5. What Dossier will refuse

Nothing coming back is trusted. This matters more than it sounds: the moment
your flow's prompt reads a mail, a ticket, or an attachment, the text driving
it is written by somebody else.

| Refused | What happens |
|---|---|
| an action not in `can` | dropped, named on screen: *"dropDatabase" is not something Dossier can do* |
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

**No action deletes anything.** The strongest thing in the list is
`setStatus` to `cancelled`, which is reversible and leaves a log line.

---

## 6. The action reference

Generated from `flow.js`. `ref` means a record code (`D-0004`), a ticket
number, or an id.

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


### Actions that change the workspace

Every one of these is shown to the person and waits for a yes. Returning ten of them does not make ten changes; it makes ten questions.

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
  Dossier switch tabs. Now the contract is proved too.

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
| The reply is the shape Dossier expects | it answered, but with nothing usable |

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
