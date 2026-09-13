# ServiceNow and Dossier

For an incident manager: getting your incident history in, what the app works
out from it, and how to connect the API when you have access.

Follow this in order. **Steps 1–3 need no API access and no approvals** — do
those first, because they answer most of what you asked for and they prove the
idea before you spend political capital on a service account.

---

## The one rule

**Dossier never calls ServiceNow.** Its content-security policy is
`connect-src 'none'` — it cannot open a network connection, by design, and that
is not being changed. Everything from ServiceNow arrives one of two ways:

1. a file you export and import (steps 1–3)
2. your Power Automate flow calling ServiceNow and passing the result through
   (step 6)

The second is "direct integration" in every sense that matters. It is just not
the browser doing it.

---

## Step 1 — Export your incidents

In ServiceNow, open the incident list. Filter to what you want — the usual
first pass is **opened in the last 90 days**, all assignment groups you own.

Then: **right-click the column header → Export → CSV**.

Add these columns to the view before exporting, because the analysis is only
as good as what is in the file:

| Column | What it powers |
|---|---|
| Number | everything — without it the file is refused |
| Opened, Resolved | time to resolve, volume over time |
| Short description | grouping "the same thing again" |
| Configuration item *or* Business service | volume by system |
| Category, Subcategory | volume by kind |
| Assignment group, Assigned to | who fixed what |
| Priority | the mix |
| State | what is still open |
| **Close code** | workaround vs permanent — the most valuable column here |
| **Close notes** | whether the record can answer what happened |
| Root cause *(if your instance has it)* | the quality findings |
| Reopen count | what came back |

> **Close code and close notes are the two that matter most.** Without them
> the app can count volume but cannot tell you whether anything was actually
> resolved — which is the question you came with. The import warns you when
> they are missing.

If your export limit blocks a large range, export month by month. Re-importing
overlapping ranges is safe: rows are matched on the incident number and
updated rather than duplicated.

---

## Step 2 — Import it

**Menu → Setup → Incident history → Import a ServiceNow CSV.**

Column headers are matched loosely, so both the field names (`close_notes`)
and the display labels (`Close notes`) work, in any order, and unrecognised
columns are ignored rather than refused. Quoted fields with commas and
newlines inside them — which every close note eventually has — are parsed
properly.

Nothing leaves the machine. The file is read in the browser and counted there.

---

## Step 3 — Ask it things

The counting is local and deterministic. Volume by system, what repeats,
median time to resolve, and where the records are too thin to say what
happened are all **computed in code, not by the model**. That matters: a
number in your report has to be defensible, and a model that counts is a model
that quietly gets it wrong with nobody able to tell.

The assistant then reads those numbers and says what they mean.

Things worth asking:

- *how did we do this month*
- *which system is giving us the most trouble*
- *what keeps coming back*
- *show me the ones with bad closure notes*
- *who should I assign an imaging COI issue to*

### What it finds

**Volume** — by system, assignment group, category, priority.

**Repeats.** Titles are reduced to a signature with the policy numbers and
identifiers stripped out, then stemmed, so *"COI letter not generated"* and
*"COI letters not generating"* count as the same fault. Six of them is one
problem, not six incidents.

**Records that cannot answer what happened:**

| Finding | What it means |
|---|---|
| Closed with no resolution note | nothing to go on next time |
| Note that is a non-answer | "done", "fixed", "as per user" |
| No root cause recorded | it was made to go away, not understood |
| Reopened | it was not fixed |
| **Closed as a workaround repeatedly** | nobody has fixed it — raise a problem |
| Same fault 3+ times | worth a problem record |

The repeated-workaround finding is the one to look at first. Five incidents
closed as *Solved (Work Around)* on the same fault means somebody regenerated
that letter by hand five times and the cause is still there.

**Who has fixed this before.** A count over history — who resolved this kind
of incident, how many of them, how fast, and how often it came back. It is
evidence, not a prediction: you get the numbers alongside the name, so you can
argue with it. Nothing is trained and nothing is guessed; when there is no
history the answer is "there is no history", not a suggestion.

### What is deliberately not here

**Judgements about people.** "Closed with no resolution note" is a fact about
a ticket. Whether somebody is careless is not something ticket data supports,
and the assistant is instructed not to write it. You get the group and the
numbers; the conclusion is yours.

**Whether the fix was correct.** Usually unknowable from the ticket. What *is*
knowable is whether the record is good enough for anyone to tell — and that is
what gets flagged.

---

## Step 4 — A daily or weekly report

Dossier cannot run itself. It is a file on your machine with no scheduler, and
it only speaks when you ask it something.

**Power Automate is where "every morning" lives.** A scheduled flow that mails
you the review needs no Dossier involvement at all:

1. **Recurrence** — daily at 08:00, or Monday at 08:00
2. **ServiceNow → List Records** (or the HTTP call in step 6), incidents
   opened in the period
3. Your AI prompt action, with the incident rows and the same instruction you
   use in Dossier
4. **Send an email**

For the review to be worth reading, give that prompt the same rules as §9f2 of
[`POWER-AUTOMATE.md`](POWER-AUTOMATE.md): name the system, say what is
recurring and what it cost, say what should become a problem record, and do
not list every number.

---

## Step 5 — Getting API access

This is the part that takes longest, and it is worth starting now even though
steps 1–3 work without it.

You need a ServiceNow account that can read the `incident` table over REST. In
most shops that means asking your ServiceNow administrator for:

- a **service account** (not your own login — personal credentials in a flow
  break the day you change your password, and they attribute every API call to
  you)
- the **`itil`** role, or a custom read-only role scoped to `incident`
- **read** on the fields in step 1 — ACLs can hide `close_notes` even when the
  role allows the table
- if your instance requires it, the account added to the **REST API access**
  list

Ask for read-only first. A request to read incidents is a much shorter
conversation than one that can also write them, and everything in this document
works read-only.

---

## Step 6 — The flow calls ServiceNow

Two ways, both in Power Automate.

**The ServiceNow connector** is the easy one — *List Records*, table
`incident`, with a query. No credentials handled by hand.

**The Table API** if you would rather call it directly:

```
GET  https://<instance>.service-now.com/api/now/table/incident
     ?sysparm_query=opened_at>=javascript:gs.daysAgoStart(30)^ORDERBYDESCopened_at
     &sysparm_fields=number,opened_at,resolved_at,short_description,cmdb_ci,category,assignment_group,assigned_to,priority,state,close_code,close_notes,reopen_count
     &sysparm_display_value=true
     &sysparm_limit=1000
```

Three things that catch people out:

- **`sysparm_display_value=true`** — without it you get sys_ids where you
  expected "App Support – Imaging"
- **`sysparm_fields`** — without it every record comes back with 90 fields and
  the response is enormous
- **`sysparm_limit` and paging** — the default is 10,000 but the practical
  limit is your gateway timeout. Page with `sysparm_offset` for large ranges

Put the credentials in a **Power Automate connection**, not in the URL, and
never in Dossier: the app has no business holding a ServiceNow password, and
its settings file is exactly the kind of thing that gets mailed around.

### Where the result goes

For **one ticket in a conversation** — *"what is going on with INC0012301"* —
have the flow fetch that incident and put it in the prompt alongside the
matched runbook. The identifiers in the question already arrive as
`workspace.mentioned`, so the flow can pick the number straight out of it.
That is the highest-value use of the API, and it needs one record, not a
thousand.

For **the history**, keep using the import. A flow that hands Dossier a
thousand incidents to store has to get them through the same message channel
as everything else, and there is no gain over a file you export once a month.

---

## What is worth building next

In rough order of value for the effort:

1. **Fetch one incident by number during a conversation** (step 6). Small,
   and it is what turns "here is the procedure" into "INC0012301 says they
   tried three group policies — that is the group-policy variant".
2. **Write a work note back to ServiceNow** when you close a record in
   Dossier. Needs write access, which is a longer conversation.
3. **Mine `kb_knowledge` into runbooks.** Your KB articles are already
   one-topic-per-article, which is the shape a runbook wants — a better
   decomposition source than Word files. See
   [`BAU-RUNBOOKS.md`](BAU-RUNBOOKS.md).
