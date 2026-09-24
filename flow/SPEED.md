# Making it fast again

> **4.2:** the prompt itself is now 15 KB instead of 40 (about six thousand
> fewer tokens on every question), pictures go at the 768-pixel size the
> model actually reads, and a picture that was read on the PC travels once
> instead of twice. What to change in the flow for the rest - a fast model,
> `ocr.js` beside the app, the probe answered first - is in
> [POWER-AUTOMATE.md s4d](POWER-AUTOMATE.md#4d-making-it-fast). The rest of
> this page is the 3.x round, which is all still true.

*What was slow, why, what changed in the app, and the one thing to change in
Power Automate. Read §1 and §4; the rest is there when you want to check it.*

---

## 0. Short version

**Your instinct was right about the shape and wrong about who does the
choosing.** Sending only the relevant data is exactly the fix. Using a *first
AI call* to choose it would have made the app slower, not faster, for a reason
that is easy to miss: **the chooser has to see the data before it can choose.**
So call one carries the workspace anyway, and you pay a second round trip to
find out what call two should carry. Two AI calls where there was one, for a
question that was only ever slow because of how much it carried.

The choosing is now done **on your PC, in JavaScript, before anything is
sent** — matching words, dates, identifiers, systems and people against your
records. It takes about **6 milliseconds over five thousand records**. There
is no model in it and there should not be.

| | before | after |
|---|---|---|
| 100 records | 50 KB | **41 KB** |
| 1,000 records | 164 KB | **52 KB** |
| 5,000 records | 185 KB | **61 KB** |

The model reads every byte of a question before it starts answering, so that
is roughly **45,000 tokens of reading cut to 15,000** on a workspace of a
thousand records — and the part that used to grow every week you used the app
no longer grows at all.

**In Power Automate: the flow does not change.** Same six actions, same nine
inputs, same expressions, same Parse JSON. There is a prompt edit in §4 that
makes the answers better, and it is a paste into the action you already have.

---

## 1. What was actually slow

Not the app. `flowContext()` and `buildRequest()` — everything the browser
does to assemble a question — took **1 to 2 milliseconds** at three thousand
records. It was never the PC.

It was the size of what got sent. Every question carried:

| | what travelled | on a 1,000-record workspace |
|---|---|---|
| `workspace.records` | the newest 400, whatever you asked | **140 KB** |
| `workspace.memory` | every note you had ever taught it, in full | 13 KB and climbing |
| `workspace.runbooks` | the whole library index, every trigger phrase | 8 KB and climbing |
| `workspace.profiles` | every system profile, in full | up to 37 KB |
| `can` | the 57 actions it may return | 14 KB, fixed |

Four of those five grow as you use the app. That is the whole of the
complaint: **the app punished you for using it.** Teach it more and every
question got slower. Write more runbooks and every question got slower.

---

## 2. What the app does now

### Records are ranked against the question

Each record is scored on what the sentence actually contains:

- **a code or ticket number in the question** — `D-0042`, `INC0123456` —
  outranks everything. They are asking about *that one*.
- **words in the title**, stemmed, so *"settling"* finds *"settlement"*.
- **words in the filing** — system, type, requester, who it is waiting on —
  worth less than the title. In a workspace with two hundred Imaging records,
  *"something wrong with Imaging"* matches every one of them on the system and
  only one of them on what it says.
- **a system, a person or a team named** in the question.
- **what the question is about**: overdue, due today, this week, waiting,
  chasing, blocked, a priority.

The best sixty travel. With nothing to go on — *"hello"*, a question about a
holiday — every score is zero and what is left is the order it always used:
unfinished first, then newest. **A small workspace behaves exactly as before.**

### What does not travel is counted

`workspace.recordsDigest` is new, and it is totalled over **every record in
scope**, not the sixty that went:

```jsonc
"recordsDigest": {
  "inScope": 1204, "sent": 60, "notSent": 1144,
  "byStatus":   { "open": 402, "processing": 401, "blocked": 401 },
  "bySystem":   { "Imaging": 151, "E-Payment": 150, … },
  "byPriority": { "P1": 301, "P2": 301, "P3": 301, "P4": 301 },
  "overdue": 1, "dueToday": 1, "dueThisWeek": 0, "undated": 1198,
  "waiting": 1, "blocked": 401,
  "longestWaiting": [ { "code": "D-9003", "title": "Reconciliation extract for finance",
                        "waitOn": "Data team", "since": "2026-08-07" } ]
}
```

So *"how many are overdue"* is still answered from the whole workspace. **This
matters: without it, sending fewer records would make it count wrong.**

### Notes, runbooks and profiles are ranked the same way

- **Notes** — the ten the question reaches go in full (capped at 1,500
  characters each); the rest go as `memoryIndex`, titles and tags only.
  `recall` fetches one by name.
- **The library** — ordered by how near each runbook is to the question. The
  top twenty carry their trigger phrases, the next forty carry the index line,
  the rest are title and system. `runbooksMatched` is unchanged: the two or
  three that actually match still travel whole, and that is still what the
  answer is built from.
- **Profiles** — the system in play travels whole; up to three of them. The
  others go as a line, so the endpoint still knows they exist and can ask with
  `readProfile`.
- **Conversation** — still six turns; each turn capped at 1,200 characters,
  because what the last answer *said* matters and the whole of a
  two-thousand-word answer does not.

### `can` was left alone — deliberately

14.8 KB, and now about a quarter of the request. A compact encoding would save
perhaps 5 KB. It would also change the shape your prompt reads and every
example in CONTRACT.md. **Not worth breaking something that works for 8% of a
request.** It is fixed in size; it does not grow.

### The second look — your two-step idea, in the right place

The endpoint can now answer with **`needRecords`** and nothing else: a filter
instead of an answer. Dossier runs that filter **on your PC**, over every
record it has, and asks the same question again with what it found at the
front of `workspace.records`.

Once. A second `needRecords` is ignored — a conversation that fetches its way
through a workspace one page at a time is the slow thing this change removes.

This is your idea, kept, with the cost moved to where it belongs: **the
expensive path runs on the questions that need it, not on all of them.**

---

## 3. What to do in the app

Nothing. Replace `dossier.html` and `flow.js` and it is on.

One setting worth knowing, at **Menu → Setup → Ask through Power Automate**:

- **Most records to send** — was 400, now **60**. It means something different
  now: the best sixty, not the newest sixty. If you had never changed this
  number by hand it moves to 60 by itself; if you had chosen a number, yours
  is kept. Raising it makes every question slower and adds very little, because
  the ones after the first sixty are the ones the question did not reach.

**Menu → Setup → … → Preview** still shows the exact bytes before they go.
That is the honest check: open it before and after.

---

## 4. What to change in Power Automate

### The flow: nothing

Not one action, not one expression, not one input.

- The trigger is the same.
- **Parse JSON** does not need regenerating. It does not strip properties its
  schema leaves out, so `recordsDigest`, `memoryIndex`, `recordsMatched` and
  `followUp` arrive and pass through untouched. Regenerate from a current
  sample only if you want them as dynamic content of their own.
- The nine prompt inputs are the same nine. `workspace` is passed whole, so
  everything new rides inside it.
- The Compose, the Response and the fallback Response are unchanged.

### The prompt: one paste

Open **Run a prompt** and find the numbered rules. Rule 3 currently reads:

> 3. Never invent a record code. You may only reference a code that appears in
>    workspace.records. If they mean a record you cannot see — because the
>    records were capped, or the scope sends none — return a "find" action to
>    locate it, or "ask" which one they mean. Guessing D-0042 and being wrong
>    is worse than asking.

**Replace it with this:**

> 3. Never invent a record code. You may only reference a code that appears in
>    workspace.records.
>
>    workspace.records is **the part of the workspace this question matched**,
>    not all of it. The app ranked every record here against what was asked
>    and sent the best ones. workspace.recordsSent of workspace.recordsTotal
>    says how many; workspace.recordsMatched says how many the question
>    reached.
>
>    **Count from workspace.recordsDigest, never from workspace.records.**
>    The digest is totalled over every record in scope — by status, by system,
>    by priority, plus overdue, dueToday, dueThisWeek, undated, waiting,
>    blocked, and what has been waiting longest. Counting the rows you were
>    sent gives a number that is wrong and looks right.
>
>    If the digest shows the answer is in records you were not sent, return
>    **needRecords** — that action ALONE, with no "say" and no other action —
>    and the same question comes back with those records in it. You get one.
>    Make the filter wide enough to finish the job. If you can answer from
>    what you have, answer; a second round trip costs the person another wait.
>
>    workspace.memory holds the notes this question reached, in full;
>    workspace.memoryIndex lists the rest by title, and **recall** fetches one
>    by name. The runbook library is ordered the same way, and
>    workspace.runbooksMatched is still the block to answer from.

That is the whole edit. **Save, and you are done.**

### It works without the prompt edit

The app sends less either way. The edit is what stops the model saying *"you
have 60 records"* when the person has twelve hundred — and what lets it ask
for more when it needs to. Do it, but do it when you have ten minutes; nothing
is broken until you do.

---

## 5. Checking it worked

1. **Menu → Setup → Ask through Power Automate → Preview.** Read the size at
   the top. On a workspace of a thousand records it should be around 50 KB.
2. **Ask something specific** — *"what is happening with D-0042"* — and check
   in Preview that D-0042 is at the front of `workspace.records`.
3. **Ask something countable** — *"how many are overdue"* — and check the
   answer against the Register. If it counts only what it was sent, the prompt
   edit in §4 has not been saved.
4. **Power Automate → the flow → run history.** Open a run and look at the
   input size on the prompt action. That is the number that was costing you
   the wait.

---

## 6. What this does not fix

- **The model's own time.** A smaller question is read faster; it is not
  answered faster once reading is done. If your AI Builder capacity is the
  bottleneck, this helps less than the numbers above suggest.
- **Attachments.** A PDF you attach still travels as its text, up to 80,000
  characters. That is the point of attaching it.
- **The 14.8 KB of `can`.** Fixed cost, deliberately kept.
- **The first call of the day.** A cold flow has its own start-up.

---

## 7. If an answer gets worse

It should not — the suite checks that a record named by its code, its ticket,
its system, its person, its team, its due date or the words in its title all
come through, and that a question with nothing to go on gets exactly the order
it used to. But if something specific starts being missed:

1. Raise **Most records to send** to 120 and see whether it comes back. If it
   does, the ranking is the cause; tell me what was asked and what was missed.
2. If it does not, the record was out of **scope** — check *What to send*.
3. As a stopgap, 400 in that box restores the old volume. It will be slow
   again, and it will still be ranked, which is strictly better than before.
