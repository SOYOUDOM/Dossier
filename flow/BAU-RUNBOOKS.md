# The BAU library

How Dossier holds your support guidelines, how the assistant uses them, and
how a team shares them when there is no shared drive.

This is the companion to [`POWER-AUTOMATE.md`](POWER-AUTOMATE.md) (the flow
recipe) and [`CONTRACT.md`](CONTRACT.md) (the specification).

---

## 1. Why not just put the guidelines in memory

Because memory is **broadcast** and guidelines need **retrieval**.

Every note in `settings.memory` travels with every question you ask —
including "what is overdue". That is right for a handful of notes and wrong
for a support library. Twenty real procedures at 2,000 characters each is
10,000 tokens attached to every sentence you type, on top of your records and
any attachment, and it ends at `TooManyInputTokens`.

So the library is a separate thing, shaped so it can grow:

| | travels | why |
|---|---|---|
| **Runbook index** | title, system, triggers, severity, freshness | ~15 tokens each. A hundred cost less than one long note. |
| **Runbook body** | only when asked for by name | steps, checks and escalation are the long part |
| **System profile** | in full, every time | few, short, and the only thing that helps with an unknown symptom |
| **Memory** | in full, every time | unchanged — it is your personal notebook |

A hundred runbooks in the index is about 1.5 KB. The same hundred sent whole
would be half a megabyte.

---

## 2. The three layers

### Runbooks — one symptom, one procedure

**One per symptom, not one per document.** This is the part people get wrong.
A Word file called *COI Generation Guide* usually contains six or eight
distinct problems. As one blob it retrieves badly: you get twelve pages and
have to hunt. Split into six runbooks with their own trigger phrases, each one
retrieves exactly.

| field | what goes in it |
|---|---|
| `title` | the symptom, as a person would say it |
| `system` | which application — the cheapest, most reliable filter |
| `triggers` | **the load-bearing field.** What somebody actually types when they hit this, including error text |
| `severity` | P1–P4; becomes the record's priority when the runbook is started |
| `steps` | the procedure, one instruction per line — these become a checklist |
| `checks` | the queries and lookups that prove what is wrong. Put SQL in a ``` fence |
| `escalation` | who, after how long, in which hours |
| `owner` | a named person |
| `verified` | when a human last confirmed it works |
| `status` | draft until somebody with authority approves it |

**Write triggers badly and nothing else matters.** A runbook the assistant
cannot find is a runbook you do not have. Write several, write them specific,
and write them in the words people use rather than the words you would use in
a title:

```
coi not generated
confirmation of insurance not generated
regencoi went through but no letter
clicked generate and nothing happened
```

### System profiles — what is durably true

Short, and mostly about what a system **lies about**.

> `regenCOI` returns 200 whether or not a letter was actually produced.

That one line answers a whole family of tickets that no runbook covers. It is
why the assistant can help with a problem nobody wrote down: it does not need
a matching procedure, it needs to know that the success message means nothing.

Keep each profile to about a page — these travel with every question.

### Memory — your own notes

Unchanged. Personal, per-machine, not part of the shared library.

---

## 3. Turning your existing documents into this

The format is the easy half; the decomposition is the real work.

1. **Take one `.docx` at a time.** Read it and count the distinct symptoms.
   That number is how many runbooks come out of it.
2. **Let an AI do the first pass.** Paste the document into whatever assistant
   you already have approved and ask for one JSON object per symptom in the
   shape above. This turns a month of typing into a few days of reviewing.
3. **Review every one.** The AI will guess at trigger phrases and it will get
   some wrong. Correcting those is the highest-value hour you will spend.
4. **Everything lands as a draft.** Approve only what somebody who knows the
   system has actually read.
5. **Write the profile while you are in there.** You will have just re-read the
   whole document; the quirks are fresh.

Start with the five things you are asked most often. If those work, the rest is
volume.

### The library builds itself from here

Nobody writes runbooks in advance. They write them straight after solving
something, if it is one button away.

- Solve a ticket → **Make a runbook from this** in the record → it arrives as
  a draft with the steps you actually ticked
- Tell the assistant how you fixed something → it returns `saveRunbook`
- Correct a procedure in conversation → same

---

## 4. Sharing it without a shared drive

The whole library is one file.

**Export** — Menu → Setup → Runbooks → *Export library*. You get
`runbooks-YYYY-MM-DD.json` holding every runbook and profile.

**Import** — *Import library*, pick the file.

Mail it, put it on a stick, drop it in a chat. Anywhere a file can go, the
library can go.

**Merging is safe.** Import matches by title and keeps whichever side was
edited more recently, so two people can both add runbooks and neither loses
theirs. Importing a copy older than yours changes nothing — your morning's fix
is not silently undone by a colleague's stale export.

That said, this is copy-and-merge, not sync. There is no authority deciding
who is right. In practice one person should own the master file and re-issue
it; everyone else imports.

**Onboarding a new supporter** is then: here is `dossier.html`, here is the
library file, here is the flow URL if we have one. No install, no server, no
account.

---

## 5. Working without Power Automate at all

Everything in this document works with the flow switched off.

The matcher (`rbMatch`) is local. It scores trigger phrases against what you
typed and needs no network. Setup, import, export, starting a record from a
runbook, freshness — all local, all on `file://`.

What the flow adds is **language**: understanding "the letter didn't come out"
as the COI symptom when no trigger phrase says that, and writing new runbooks
from a conversation. Useful, not required. Build the library first; it is
worth having on its own, and it is what makes the flow worth pointing at.

---

## 6. Freshness and approval

Two fields exist because a support library rots quietly.

**`verified`** — when a human last confirmed the procedure works. Over a year
old, or never set, and it shows as unchecked wherever it appears: in Setup, in
the picker, and as a warning on the card itself. Hand a stale runbook over
anyway — it is still the best thing available — but say so.

**`status`** — `draft` until approved. Everything arrives as a draft: what you
import, what the assistant writes, what you capture from a record. Approving is
a human act. The assistant is instructed never to approve on its own, and it
cannot reach `status` through the settings whitelist either.

If somebody asks how you know your procedures are current, these two fields are
the answer.

---

## 7. What not to put in a runbook

**No customer data.** The runbook says *"check the table for the policy number
in the request"* — never *"policy 700123 failed"*. This applies to the trigger
phrases too, which is where it is easiest to slip: a real policy number pasted
in as a trigger is a real policy number in every export of the library.

**No credentials, connection strings or internal URLs.** A runbook is written
to be shared by file; assume it will be.

**No placeholder that looks real.** The starter library uses `<COI_REQUEST>`
and `<team>` on purpose. A plausible-looking wrong table name gets run.

---

## 8. Starter library

[`runbooks-starter.json`](runbooks-starter.json) has three runbooks and two
system profiles, built from real support situations, with every table and team
name left as an angle-bracketed placeholder.

It is a **shape to copy, not content to trust.** Replace the placeholders with
what your systems actually call things before anybody follows a word of it.
Every entry is a draft, and should stay one until somebody who knows the
system has read it.

Import it, work through one runbook end to end, and see whether the shape fits
how your team actually works before converting anything else.
