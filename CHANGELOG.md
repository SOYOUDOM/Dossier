# Changelog

The version shown at the right-hand end of the status bar. Click it to copy
the full build line — version, build date, flow protocol and what your copy
holds — which is what to paste into a bug report.

---

## 4.0.2 - 2026-09-18

**Check the bridge.**

Menu -> Workspace has a button that walks the whole chain and names the step
that failed, because "no error and no data" is the worst thing a program can
say to somebody, and diagnosing it from a photograph of a terminal is no way
to work.

```
Dossier v4.0.2
Folder: Dossier V3.10.0
x No .bridge.json in this folder.
  The bridge has never run on THIS folder. Start it with the folder as
  its argument: dossier-bridge.bat "<this folder>"
```

It reports, in order: which build of Dossier this is, which folder is open,
whether the handshake is there and what it says, whether anything answers on
that port, which database and schema version the bridge is on, how many
records it holds, and whether this workspace is actually using it. Each
failure carries the one thing to do about it.

The three shapes it tells apart, all tested in headless Chromium against a
stub bridge:

- **no handshake** - the bridge has never run on this folder, which is what
  happens when it is started in the clone
- **handshake but nothing answering** - it ran here and then stopped, or it
  is running on a different folder now
- **bridge up, workspace not using it** - the folder was opened before the
  bridge started; reopening it is all that is needed

---

## 4.0.1 - 2026-09-18

**"No error, and nothing in the tables" was the bug.**

A workspace whose folder has no `.bridge.json` in it opens in file mode -
correctly, and until now completely silently. So a bridge started on the
wrong folder looked exactly like a bridge working: records saved, no error,
and an empty database. The fix is to stop it being invisible.

- **The footer says which store this workspace uses**, at all times:
  **SQL Server** or **dossier.json**. Hover it for the database and server,
  or for what to do about it
- The line after opening a workspace says it too, and Menu -> Workspace
  spells it out with the reason
- **The bridge refuses to start in the repository clone.** A folder with
  `dossier.html` or `.git` in it and no `dossier.json` is not a workspace,
  and starting there writes a handshake nothing will ever read. It says so
  and exits instead of appearing to work
- The bridge prints the folder it is serving above everything else, and says
  in as many words that if Dossier's footer still reads `dossier.json`, that
  folder is not the one you picked
- `Access-Control-Allow-Private-Network: true` on every response, which
  Chrome asks for by name when a page reaches a loopback address. Without it
  the preflight fails and the page sees a network error with nothing behind it

### Tested

Both modes driven in headless Chromium against the stub bridge: a folder
without the handshake reports **dossier.json** and `DB.on` false; the same
folder with it reports **SQL Server**, and a record created afterwards is
read back out of the database. The bridge still compiles under
`mcs -langversion:5`.

---

## 4.0.0 - 2026-09-18

**The database is the store. The file is the export.**

Everything before this put your work in `dossier.json` and copied it into SQL
Server afterwards. That is backwards from what was asked for, and it took me
too long to hear it. With the bridge running, `dossier.json` is no longer
read by anything: every record you create, change or delete is a transaction
in SQL Server LocalDB on your PC, and the JSON is written alongside as an
export.

### The bridge

A browser has no SQL client. No page can open a connection to SQL Server,
and `dossier.html` runs from `file://` - so one small process has to sit in
between. `scripts\dossier-bridge.bat` starts it and leaves a window open.

- **Nothing to install.** It compiles itself on first run with the C#
  compiler that ships with Windows, in
  `C:\Windows\Microsoft.NET\Framework64\v4.0.30319`. Written in C# 5 for
  that compiler specifically
- **A plain socket on 127.0.0.1**, not `HttpListener`, which would want a URL
  reservation and therefore an administrator
- **A token generated fresh each run**, written with the port into `.bridge.json` in
  your workspace folder. Dossier already holds a handle on that folder, so
  that is the whole of the configuration - and nothing else on the machine
  can drive the bridge without first being able to read your records
- Six routes: health, get and put the workspace, and post, get and delete an
  attachment

### What changed in the app

- **Reads come from SQL.** Open a database-backed workspace and the file is
  not consulted
- **Writes are one transaction** - `dbo.LoadWorkspace` writes the canonical
  workspace row and every table derived from it, or none of them
- **Attachments are rows.** `dbo.Attachment` holds the bytes, so a backup of
  the database is a backup of the whole workspace. Documents filed before
  this build stay as files in `tasks\` and still open
- **The export is still written on every save** - the same indented JSON,
  openable in Notepad on a machine with no SQL Server. That is rule 3 and it
  survives
- **With the bridge down, nothing is written at all.** Not the database,
  because it is not there; and not the export either, because a file ahead of
  the database is two versions of the truth and the beginning of the next bad
  afternoon. Dossier says so and offers to try again
- A folder becomes database-backed once the bridge has run in it. One that
  never has keeps working exactly as before

### Rule 1 has changed, and that is worth saying out loud

`connect-src 'none'` is now `connect-src http://127.0.0.1:*`. It is the first
loosening of that policy in the file's history. It is a loopback address, the
only thing on the far side of it is a process you started yourself, and
nothing there leaves the machine - but it is a change to a stated invariant
and it belongs at the top of a changelog rather than buried.

### Tested

The bridge **compiles** - `mcs -langversion:5`, the same language level as
the Windows compiler that will build it on your machine. That is the first
time this session a compiler has checked my work before you did.

The app was driven against a stub bridge speaking the same six routes, in
headless Chromium, and the test caught two real bugs before this shipped:
attachments were failing because the folder was touched before the database
branch was reached, and a save with the bridge down still wrote the export.
What passes now: a record created and saved lands in the database; reopening
reads it back **from the database while the file on disk says zero records**;
an attachment becomes a row and comes back out as a blob; and with the bridge
stopped, `saveNow` returns false and the file is byte-for-byte unchanged.

What is still untested here is the half that needs SQL Server: the bridge
actually talking to LocalDB. `dossier-bridge.bat` printing `listening
127.0.0.1:<port>` is the proof, and it checks the database before it binds.

---

## 3.14.2 - 2026-09-18

**`AS JSON` needs `nvarchar(max)`, and a push that loads nothing.**

The note loader declared `tags nvarchar(400) '$.tags' AS JSON`. `AS JSON` is
only allowed on `nvarchar(max)` - Msg 13618 - and it is a compile error, so
it took the entire load batch down with it. Nothing was inserted, including
the snapshot, which is why every count came back 0 while the schema itself
reported a healthy version 4 with 20 tables.

- the column is `nvarchar(max)`
- `sql/check-reserved-words.py` knows the rule now: it flags any `AS JSON` on
  a column that is not `nvarchar(max)`, and was proved against a deliberately
  broken copy before this shipped

**`find` no longer looks hung.** It was wrapped in `for /f`, which buffers a
command's entire output before printing any of it - so a scan of a synced
OneDrive showed nothing at all for minutes. It prints as it goes now, and
says a slow search is normal.

---

## 3.14.1 - 2026-09-18

**Empty tables now say why they are empty.**

`init` builds the tables. `push` puts data in them. Nothing said so, which
left the obvious conclusion - that a database full of empty tables is a
broken one - standing unchallenged.

- `init` ends by saying it in words when there is nothing loaded yet, and
  names the command that loads it
- `push` prints what it read out of the **file** before it writes anything:
  records, runbooks, incidents. A zero is now visibly the file's, not the
  loader's - from SSMS the two look identical
- `push` ends with the next command rather than silence
- **`dossier-sql.bat find`** lists every `dossier.json` under your user
  profile with its size, because "which file do I push" is the question
  everybody has and the answer is never the clone - the clone has no
  `dossier.json` in it, on purpose, since 3.12.2

The checker earned its place this round: the first cut of the "what the file
holds" line had subqueries inside a `PRINT` - the identical mistake to the
one in 3.13.2 - and `sql/check-reserved-words.py` caught it before it left
the machine.

---

## 3.14.0 - 2026-09-18

**The whole workspace is in the database now, not just the records.**

There was no Runbook table. The library, the system profiles and the notes
the assistant has been taught were going into `dbo.Setting` as one lump of
JSON under one key, and the incident history and the conversations were not
shredded at all - they travelled inside the snapshot and nowhere else. A
database you cannot query is a file with extra steps.

Migration 3 adds:

| | |
|---|---|
| `Runbook` + `RunbookTrigger`, `RunbookStep` | one row per trigger phrase and per step, so you can ask which phrases you actually have |
| `SystemProfile` | what each system is like, and what it lies about |
| `Note` | what the assistant has been taught |
| `Incident` | the imported history, indexed by system and date |
| `Chat` + `ChatMessage` | the conversations, one row per message |
| `Holiday` | the working calendar |

Migration 4 adds `vRunbooks` (with its trigger and step counts) and
`vIncidentsBySystem`. `dbo.Setting` now holds only what has no table of its
own, rather than a second copy of all of the above.

`dossier-sql.bat check` counts them: records, documents, runbooks, profiles,
notes, incidents, conversations.

### Where the data lives, said plainly

The **database holds everything** - every field of every record, the whole
library, the history, the conversations - and `dbo.Snapshot` also keeps each
pushed file whole, so a `pull` reconstructs nothing.

The **file is still what the app reads and writes**, because Dossier is a
page in a browser and cannot open a connection to SQL Server. That has not
changed and cannot. What has changed is that the file is no longer the only
complete copy: push nightly and the database is a full one, queryable in
SSMS, sitting on your own PC.

### Tested

Two checkers, both kept in the repo and both run against this change:

- `sql/check-reserved-words.py` - every identifier position against the T-SQL
  reserved word list
- `sql/check-json-paths.py` - **116 JSON paths** walked against a workspace
  holding one of everything: records, a runbook library, profiles, notes,
  incidents, a conversation and the holiday list. A path that does not
  resolve loads nothing quietly, which is the failure mode worth catching in
  advance

Plus the structural check (BEGIN/END, TRY/CATCH, TRAN/COMMIT balance per
batch) and a cross-check that every table the loader writes is one the schema
creates, and every table the schema creates is one the loader fills.

Still no engine here to run it against - that has not changed either.

---

## 3.13.2 - 2026-09-18

**The LocalDB schema, for the third time - and the reason it took three.**

`init` failed again, on three more reserved words and a `PRINT`:

- `x.file` and an `OPENJSON` column called `file` - I renamed the *table*
  column last time and left the two references to it. `FILE` is reserved
  wherever it appears
- an output column called `Open`, which `OPEN` reserves
- `PRINT 'x' + CAST((SELECT COUNT(*) ...))` - a subquery is not an expression,
  and `PRINT` takes an expression (Msg 1046)

All four are fixed. But the interesting part is why `init` was failing on
code it never runs: **T-SQL parses an entire batch before executing a line of
it**, so a syntax error in the load section killed the schema section sitting
above it, in a file `init` only opened for the first half.

So the file is two files now:

| | |
|---|---|
| `sql/schema.sql` | the database and the tables. All `init` runs |
| `sql/push.sql` | the load. Only `push` runs it, after the schema |

A mistake in one can no longer stop the other. `dossier-sql.bat push` runs
both, in order.

Also hardened while I was in there: `SUBSTRING` rather than `LEFT` to spot a
UTF-8 BOM in a varbinary, and `RAISERROR` no longer puts a Windows path in
its format string, where a `%` in the path would have been read as a
placeholder.

### Tested

Still not against a real engine - installing SQL Server here is blocked by
the network policy, which is the honest reason these got through. What the
checks do cover: every identifier position in all three files against the
T-SQL reserved-word list (the check that now reproduces all four of the
errors above from a clean checkout), `PRINT` statements containing
subqueries, and BEGIN/END, TRY/CATCH, TRAN/COMMIT and GOTO/label balance per
batch.

---

## 3.13.1 - 2026-09-18

**The LocalDB schema would not build.**

`FILE` is a reserved word in T-SQL and `dbo.Script` had a column called
`File`, so `dossier-sql.bat init` stopped at *Incorrect syntax near the
keyword 'File'* - after creating eight of the ten tables, with the version
number still at 0, which meant the next run collided with its own leftovers.

- The column is `FileName` now, and the schema is checked against the
  reserved-word list rather than against my memory of it
- **Each migration is all-or-nothing**: wrapped in a transaction with a
  rollback, so a step that fails leaves the database exactly as it was
- **Each object is created only if it is missing**, so a database left
  half-built by the broken version comes forward on the next run without
  being dropped first
- The compatibility level is lifted to 130 if it is lower, because `OPENJSON`
  - which the whole load is built on - is refused below it

Nothing else changed: if `init` worked for you, this does nothing.

---

## 3.13.0 — 2026-09-18

**Three copies of your work, and a database if you want one.**

The folder is still the record and always will be. What changed is that it is
no longer the only thing that knows what you had.

### What this PC remembers

Every save now also writes the whole workspace into this browser's own
database, on this machine. On the way in, the two are compared.

- **If the folder comes back with fewer records than this PC remembers,
  nothing is written.** Not the empty workspace Dossier would otherwise have
  saved over it, not anything. The difference is put to you — 3 records here,
  47 remembered, saved at 18:04 — with three ways out: restore what the PC
  remembers, keep the folder as it is, or download the remembered copy and
  decide later
- The same check catches an unreadable or missing `dossier.json`, which used
  to mean "new workspace" and an immediate save of nothing over it
- *Menu → Workspace → What this PC remembers* shows it at any time, with the
  date and the count, and both buttons

It is a second copy, not a second home: clearing the browser's site data
removes it, another browser cannot see it, another PC certainly cannot. It
exists to notice, to stop, and to ask.

### Backups you can actually restore

`backups/` has held one snapshot a day since the beginning and there was no
way to open one from inside the app. *Menu → Workspace → Backups on disk*
lists the last thirty with their size and date; restoring takes two clicks
and writes what is on the sheet now out to a file first, so it is never a
one-way door.

### Export JSON

There was an Import and no Export. *Menu → Workspace → Export JSON* writes
the same shape `dossier.json` has — records, routines, scripts, settings and
the assistant's conversations — so moving to another PC is Export here,
Import there.

### A real database, if you want one

`scripts\dossier-sql.bat` loads a workspace into **SQL Server LocalDB**:
`(localdb)\MSSQLLocalDB`, database `Dossier`, nothing to install beyond the
`sqlcmd` that comes with SSMS and nothing left running.

```
dossier-sql.bat init      create the database and the tables
dossier-sql.bat push      load dossier.json into it
dossier-sql.bat check     what is in there
dossier-sql.bat history   every push, newest first
dossier-sql.bat pull      the newest snapshot back out as JSON
```

With no argument it does `init` then `push`, which is the form to hang on a
routine so the day lands in a database every evening by itself.

- **`dbo.Snapshot`** keeps the file whole, one row per push, forever — so
  `pull` is a copy of what went in rather than a reconstruction, and cannot
  drop a field nobody thought to shred
- **`Record`, `RecordLog`, `RecordFile`, `RecordStep`, `RecordTag`,
  `RecordBlocker`, `Routine`, `Script`, `Setting`** are that JSON in columns,
  replaced on each push, for asking SQL questions of your own work. Two views
  to start from: `vOpenWork`, `vClosedByWeek`
- **`dbo.SchemaVersion`** is one number, and every step in `sql/schema.sql`
  is wrapped in a test of it. Running the file creates the database if it is
  missing, migrates it if it is old, and does nothing if it is current
- `pull` writes `dossier-from-sql.json` and stops. `pull --replace` puts it
  back, keeping the current file as `dossier-before-pull.json` first
- UTF-8 both ways, so a workspace with Khmer in it survives the round trip

**Dossier never talks to SQL Server, and cannot.** It is a page in a browser
with no SQL client, and rule 1 forbids it from opening a connection to
anything at all. The file is the interface: Dossier writes `dossier.json`,
the batch reads it. That is the whole coupling.

### Tested

The comparison driven in a real browser: a folder holding 3 against a
remembered 47 raises the question, **nothing is written while it is open**
(a save called mid-question returns without touching the folder), restoring
brings 47 back and saves them. The backup list reads a folder and offers each
file; the panel renders with both sections and the export button.

**The SQL half is not tested here** — there is no SQL Server on the machine
this was written on. The T-SQL is idempotent and transactional by
construction, and `dossier-sql.bat check` is there to prove it on yours.

---

## 3.12.2 — 2026-09-18

**Git can no longer touch your records.**

This one cost somebody their week, so it is worth saying plainly what
happened. The quick start told you to clone the repository and then pick the
clone as your workspace. The repository tracked `dossier.json` and a file
under `backups/`. Those two facts together mean that a `git pull`, a
`git checkout` or a re-clone in that folder replaces your records and your
backup with whatever the repository last said they were — no warning, no
prompt, and nothing in the app's own history to undo, because the app never
did it.

- **Nothing in this repository tracks a workspace file any more.**
  `dossier.json`, `backups/`, `tasks/` and the runner's queue are in a new
  `.gitignore`, and the demo workspace has moved to `demo/dossier.json`
  where nothing the app writes can collide with it
- **The quick start no longer tells you to work inside the clone.** Make a
  folder for your records, copy `demo\dossier.json` into it if you want the
  demo, and point Dossier at that
- **Dossier notices for itself.** Open a workspace with a `.git` in it and a
  banner says so — once per folder — with a button that writes the
  `.gitignore` for you, covering every path the app owns. It cannot untrack
  what git is already tracking, so it tells you the one command that does

### If your records are in a clone made before this build

In that folder, once:

```
git rm --cached dossier.json
git rm -r --cached backups
```

That stops git tracking them without deleting anything. The pull that brings
you this build removes the repository's own `dossier.json` — if yours is
still tracked and has your records in it, git will stop with a
modify/delete conflict rather than throwing it away, and the two commands
above settle it.

### Tested

The banner raised against a folder that reports a `.git`, silent against one
that does not, silent the second time in the same folder, and the
`.gitignore` it writes carrying all seven paths — appended to an existing
file rather than replacing it.

---

## 3.12.1 — 2026-09-17

**Three ways a dropped file went to the wrong place.**

- **Dragging the desk pet looked like dragging in a screenshot.** A browser
  lets you drag any `<img>` out of a page and puts the picture on the drag as
  a *file*, so moving the pet across the sheet raised the **Drop to attach**
  veil, and letting go filed the pet itself as a document. It also took the
  pointer with it: once a native drag starts, `pointermove` stops arriving,
  which is why the pet would not go where it was put. Every sprite in the app
  is now `draggable="false"`, with `-webkit-user-drag:none` behind it and the
  pet refusing `dragstart` outright
- **A file dropped on the assistant also opened a record.** The panel took
  the attachment and then let the same drop carry on up to the document,
  where the global handler filed it a second time — one screenshot dragged
  onto a question, one new record named after it. The panel stops the event
  where it lands now. While a file is held over the panel it outlines itself
  rather than raising the full-page veil, because the veil means something
  else
- **Nothing invents a record any more.** A dropped file is filed against the
  record you have open or the one you dropped it onto. Anywhere else, nothing
  is created: the toast says *"report.pdf was not filed — open a record
  first, or drop it straight onto one"* and offers **Make a record for it**,
  which is a button you press rather than something that happens to you

The veil says which of those you are about to get: **Drop to attach** with a
record open, **Drop it on a record** without one.

### Tested

Real `DataTransfer` drops dispatched at the panel, at the sheet with nothing
open, at the sheet with a record open, and straight onto a row: one filing
each and no record created in any of them, the offer button creating one when
pressed, and the four drag-over states (veil wording with and without a
record, the panel outlined, everything cleared on leave). The pet drag was
re-run with real mouse events and still lands in the corner it was carried
to.

---

## 3.12.0 — 2026-09-17

**The assistant comes out of its panel.**

The character that greets an empty thread now has the run of the application:
a desk pet, parked in a corner of the window, that answers to the workspace
rather than to the conversation.

The restraint is the point. A record sheet does not move while it is being
read, so for the whole of an ordinary afternoon it is a drawing in a corner
that blinks. Every other mood is an answer to something that just happened,
and when that thing is over it goes back to standing still.

| It does this | when |
|---|---|
| cheers | you mark a record **done** |
| looks put out | something is overdue, for as long as it is |
| holds a record and stamps it | the workspace is being saved, or a script has gone out to the runner |
| falls asleep | nothing has been touched for four minutes — and waves when you come back |
| stretches | once, at the end of the working day, if you are still here |
| is carried | while you are dragging it somewhere else |

- **Drag it to any of the four corners.** It snaps to the nearest one rather
  than staying where it was dropped — a pet halfway down the left edge is a
  pet in the way of a record. The corner is remembered in `dossier.json`.
  Arrow keys do the same thing when it has focus
- **Click it for one line about your day**, and click again for the next:
  what is overdue, what is due, what it would pick up next, what you have
  closed today. It opens nothing and it says one true thing at a time
- **Give it a name** in Menu → Appearance and the line comes back with the
  name on it. It has an opinion about being nameless, once
- **It gets out of the way.** It fades out entirely while a drawer, a
  dialogue or the menu is open over the work, and it steps aside rather
  than being sat on when the assistant docks over its corner. Only the
  48-pixel square it occupies takes a click; everything around it does not
- **It reads your records and writes nothing but its own corner and name.**
  The same three counts the footer already shows, plus the one record it
  would point at

Seven new sprites — idle, cheering, worried, asleep, working, stretching and
being carried — drawn as the same body with different arms, different eyes
and something over its head, because drawing each pose from scratch is how a
character stops being the same character by the third one. Thirteen
kilobytes of base64 for all sixteen sprites now inside `dossier.html`.

**Menu → Appearance → Desk pet** has the switch, the name and the corner. A
machine that has asked for reduced motion, or an interface already set to
*Motion: none*, starts with the pet switched off; turning it on there
overrides that, because it is your corner.

The pet and the assistant panel's sprites are two switches over one set of
drawings: turning the panel's sprites off does not take the pet away, and
turning the pet off does not change the panel.

### Upgrading from the previous build

Replace the files. Nothing in your workspace needs migrating: `settings.pet`
is written the first time the pet is drawn, and a workspace that has never
seen this build gets the default — on, in the bottom-right corner, unnamed.

### Tested

Driven in headless Chromium over the DevTools protocol against the real
`dossier.html`: every mood reached through the thing that causes it (a record
marked done, a save, four minutes of nothing, a panel opening over the work),
a drag with real mouse events landing in the top-left corner and persisting
there, a plain click speaking rather than moving it, and the step-aside when
the assistant opens over the corner it was in.

---

## 3.11.0 — 2026-09-17

**The assistant gets a face.**

The panel already said what it was doing in words — *thinking…*, *still
thinking — the endpoint is slow, not stuck*, a `✓` on a line for something
carried out. Nine small pixel animations now say the same things in pictures,
in the places those words already appear, and nowhere else.

| | Where it is | What it means |
|---|---|---|
| **think** | the waiting row, where the answer will start | a question is out with your flow |
| **slow** | the same row, past eight seconds | the endpoint is slow, not stuck |
| **orb** | the mark in the header | the panel, idle — it changes to **think** while an answer is on its way |
| **hero** | the middle of an empty thread | the assistant itself, waving |
| **done** | the line left behind by something carried out | it happened, and **Undo** is beside it |
| **no** | the line left behind by something declined | nothing happened |
| **oops** | above a failed answer | the flow could not be reached, or the assistant threw |
| **ask** | the confirmation dialogue | you are being asked before anything is changed |
| **new** | the pill above the composer | an answer arrived while you were reading further up |

- **Sixteen colours and one palette for all nine**, picked so that the same
  file reads on Paper and on Nebula: no pure black, no pure white, mid-tone
  fills, and an outline that is dark blue rather than black so it does not
  punch a hole in a night sky. `art/contact-sheet.png` is every frame of
  every sprite on a dark band and a light one, which is where a colour that
  disappears on one skin is caught
- **Shown at 16, 32 or 144 pixels and never in between** — one, two and six
  times the size they were drawn at. A sixteen-pixel drawing shown at
  twenty-four is resampled onto half-pixels and arrives as a smudge, so the
  slots are sized to the art rather than the art squeezed into the slots
- **A tick that has been stamped stops.** **done** and **no** carry no loop
  block at all, so they play once and hold on their last frame. A receipt
  that keeps ticking all afternoon is a receipt nobody reads
- **Six kilobytes for all nine, inside `dossier.html`.** Same bargain as the
  waiting animation before them: a copy of the file on a memory stick is the
  whole application, art included. `assets/pixel/<name>.gif` overrides any
  one of them, and a folder copy that stops loading falls back to the
  built-in rather than leaving a broken-image mark in the thread
- **A picture of your own still wins.** `assets/assistant-logo.png` replaces
  the header mark and the one on an empty thread whether the set is on or
  off — and that is settled in CSS rather than in script, because a logo is
  a megabyte and lands after the thread it belongs to has been drawn
- **One switch, in Look and behaviour, under *Pixel art*.** Off puts the
  panel back exactly as it was: the drawn orb, `assets/thinking.gif`, a `✓`
  on a receipt. A machine that has asked for reduced motion gets the set off
  the first time the panel is opened, like every other switch there; a panel
  set up before this build had no answer for it and gets the same one a new
  one would, rather than a silent no

### Where the art lives

`art/make-pixel-art.py` draws it: every frame is a picture written out in
characters, one per pixel, so changing a sprite means editing a picture in a
text file rather than decoding a blob and hoping. It writes the GIFs itself —
LZW, sub-blocks, the Netscape loop block and all — on the standard library
alone. `art/embed-pixel-art.py` then carries the same files into
`dossier.html` as base64, between two marker comments.

There is still **no build step**: the GIFs and the base64 are committed, the
app generates neither, and nothing in Dossier needs Python to run.

### Upgrading from the previous build

Replace the files. Nothing in your workspace needs migrating, and no flow
change is needed — this build does not touch what a question carries. If you
keep an `assets/` folder beside `dossier.html`, copy `assets/pixel/` in with
it; if you do not, the nine sprites are already inside the file.

### Tested

Driven in headless Chromium over the DevTools protocol, against the real
`dossier.html`: every sprite in place on Nebula and on Paper, the header mark
following the panel from idle to thinking and back, the confirmation
dialogue, the new-reply pill, the switch turned off restoring the drawn orb,
the old waiting animation, the `✓` and the plain `↓` — and a copy of
`dossier.html` alone in a folder showing all nine without asking for a file
that is not there.

---

## 3.10.0 — 2026-09-16

**A question stops growing with the workspace.**

The complaint was that the assistant got slower the more the app was used, and
it was right. Every question carried the newest 400 records whatever was
asked, every note ever taught, the whole runbook index and every system
profile. On a thousand records that is 164 KB — about 45,000 tokens the model
reads before it begins to answer, most of them about something nobody asked.
Four of those five grow as you use the app, so using the app made it slower.
Measured, with a library and notes in proportion:

| workspace | before | now |
|---|---|---|
| 100 records | 50 KB | **41 KB** |
| 1,000 records | 164 KB | **52 KB** |
| 5,000 records | 185 KB | **61 KB** |

- **Records are ranked against the question, on the PC, before anything is
  sent.** A code or a ticket number in the sentence outranks everything; then
  words in the title, stemmed, so *settling* finds *settlement*; then the
  filing — system, type, who raised it, who it is with — which is worth less,
  because in a workspace with two hundred Imaging records *"something wrong
  with Imaging"* matches every one of them on the system and only one of them
  on what it says; then what the question is about: overdue, due today, this
  week, waiting, blocked, a priority. The best sixty travel
- **With nothing to go on it behaves exactly as it always did.** *"Hello"*, a
  question about a holiday: every score is zero and what is left is unfinished
  first, then newest — the old order. A small workspace notices nothing
- **What did not travel is counted, not lost.** `recordsDigest` totals every
  record in scope — by status, by system, by priority, plus overdue, due
  today, due this week, undated, waiting, blocked, and what has been waiting
  longest. *"How many are overdue"* is still answered from the whole workspace
- **Notes, the library and the profiles are ranked the same way.** Ten notes
  travel in full and the rest as their titles; the library is ordered by
  nearness to the question, with trigger phrases on the top twenty and the far
  end reduced to title and system; the profile for the system in play travels
  whole and the others as a line
- **The endpoint can ask for records it was not sent.** `needRecords`,
  returned alone, is a filter rather than an answer: Dossier runs it here, over
  every record it has, and asks the same question again with what it found.
  Once — a conversation that fetches its way through a workspace one page at a
  time is the slow thing this removes
- **Most records to send** is 60 rather than 400, and means the sixty the
  question is about rather than the sixty most recent. A number set by hand is
  left alone
- **No second model, and no second call on the ordinary question.** Choosing
  which records a sentence is about is word, date and identifier matching:
  5,000 records ranked and packed in about 6ms, here, per question. A model
  asked to choose would have to be sent the records first — the thing being
  avoided — and paid for a round trip to find out

**In Power Automate: the flow does not change.** Same six actions, same nine
inputs, same expressions; Parse JSON passes the new fields through untouched.
There is one prompt edit, and it is a paste — `flow/SPEED.md` is the whole of
it, with the before-and-after numbers and how to check them.

## 3.9.1 — 2026-09-15

**The waiting animation travels inside the file.**

- 3.9.0 read it from `assets/thinking.gif` and showed nothing if the file
  was not there. Which is what happened: the animation was added to the
  repository, not to the folder the app is actually opened from, so the
  waiting row stayed a line of text
- **The animation is now carried inside `dossier.html`** — the same GIF,
  byte for byte, as two kilobytes of base64. A copy of the file on its own,
  in any folder, on any machine, has it. There is nothing to install
- `assets/thinking.gif` still overrides it, so swapping the animation is
  still a matter of dropping a file in. It is only looked for once the
  assistant's mark or its background has loaded — a folder that is not there
  is never asked for, so a lone copy of the file adds nothing to the console
- If a folder copy ever fails to load, the row falls back to the built-in
  one rather than showing a broken picture
- **24px rather than 20.** The animation is a sparse one and at 20px there
  was almost nothing to see

## 3.9.0 — 2026-09-15

**The composer, and what it does while it waits.**

- **The send control is part of the composer now, not a badge stuck on the
  end of it.** 36 by 36 — the height of the box beside it — a rounded square
  rather than an oversized circle, one small arrow centred in it, and a blue
  that is restrained rather than lit up. A hairline border and a single
  inside highlight give it an edge; the glow it used to carry is gone
- **Four states, and you can tell them apart.** Quiet with nothing to send,
  awake with something, brighter under the pointer, compressed when pressed,
  and dark, desaturated and inert while an answer is on its way
- **No spinner inside the button.** There is already something on screen
  saying an answer is coming; two of them was one too many
- **One question at a time.** Pressing Enter twice, or clicking send while a
  request is already out, used to put a second question on an endpoint still
  working on the first. It does not any more. Nothing here cancels a request
  — there is no way to — so the second one is simply not made, and what you
  typed meanwhile stays in the box
- Six pixels of padding inside the box and six of gap outside it: twelve
  clear either side, so a line of text never runs into the clip or the
  arrow. On one line the box and the button share a centre; past one line
  the button stays with the last of the text

**The waiting animation is a file, not a drawing.**

- The three shimmering lines and the three bouncing dots are gone. In their
  place: `assets/thinking.gif`, drawn at 20px with its transparency kept,
  beside the word and the clock, at the left edge where the answer itself
  will start. No bubble around it
- **It is asked for once, when the panel opens, the same way the assistant's
  mark and its background are.** If it answers, the row carries it. If it is
  not there, no `<img>` is written and nothing is drawn in its place — no
  spinner, no dots, no substitute loader. Drop the file into `assets/` and
  it appears; there is no code to change
- The afterimage of the row now fades in 140ms rather than 240, and the row
  itself goes the instant the answer is in, so the two are never on screen
  together and the answer does not land under a leftover animation

## 3.8.3 — 2026-09-15

**The composer stops flickering, and the send arrow is centred.**

- Typing past the end of a line made the box jump about. It was a loop of
  3.8.0's own making: the height was measured while the box was narrow —
  sitting between the clip and the send button — that height switched on a
  class which made the box full width, and at that width the same text
  fitted on one line, so the class switched itself off again. Width in,
  width out, once per keystroke
- The width no longer changes at all. The clip and the send button stay on
  the row, at the bottom beside the last line, where a chat composer puts
  them. The class now only rounds the corners less, and it has a dead band
  around the switch so a character either side of the boundary cannot set
  it oscillating
- **A long link wraps** instead of running off the side of the box
- **The send arrow is centred in its circle.** The label is hidden in this
  skin and the arrow is drawn after it, so it was sitting on a text
  baseline that is not there

## 3.8.2 — 2026-09-14

**JSON gets a code panel, in every shape it arrives in.**

- A payload on one line — `{"policy_no":"A1","status":"grace"}` or
  `[{"do":"find","overdue":true}]` — was not recognised as code, so it
  arrived as grey text
- **And a payload with nothing written over it now gets one too.** Nobody
  labels the object they have just copied out of a run history. If a run of
  lines parses as JSON then it is JSON, which is a surer test than guessing
  — so `{policy}` in a sentence stays a sentence, and an object that does
  not parse is left exactly as it was
- A fence with no language on it is labelled `json` when its body is JSON
- Fenced and labelled blocks, and multi-line objects under a bare `json`
  line, worked before and still do

## 3.8.1 — 2026-09-14

**A one-line script gets a code panel too.**

- A query that fits on one line — `SELECT request_id, status FROM t WHERE
  policy_no = 'A1';` — never became a panel when the fence was missing,
  because the repair required at least two lines before it would believe
  something was code. That is the script people most want to copy. One line
  now counts when it opens with a verb something is run with (SELECT, EXEC,
  Restart-WebAppPool, iisreset, git, docker…) or ends in a semicolon
- **And the panel no longer swallows the sentence after it.** The block used
  to end only at something that read like a full sentence, so a short one —
  *Done.* — was pulled inside the panel. A blank line now ends the block
  unless the script plainly carries on after it, which is what keeps a SQL
  batch or a C# body whole
- A language name above an ordinary sentence is still left as prose

## 3.8.0 — 2026-09-14

**An answer is laid out now**, and the composer stops swallowing the panel.

- Until now a reply was plain text with code fences, on the grounds that a
  renderer is a way for an endpoint to put markup on your page. That
  reasoning is kept — the text is **escaped first**, once, and every tag is
  one the app wrote itself — but the vocabulary is no longer empty:
  headings, **bold**, *italic*, bullet and numbered lists, quotes, tables,
  links that open in a new tab, a line across, and the code panels that
  were already there
- Deliberately left alone: `policy_no` and `insured_name`, because
  underscores are not italic here, and the asterisk in `SELECT *`. Anything
  an endpoint sends that looks like a tag is shown as the text it is, and a
  `javascript:` link is refused and left as written
- **The §4 prompt now shows what is rendered and what a good answer looks
  like**: the verdict in bold on the first line, short sections under
  headings, bullets for things side by side, numbers for steps in order, a
  table when a result decides what happens next, and the question last.
  Paste the §4 prompt again to get it
- **The composer no longer becomes a balloon.** Pasting thirty lines used to
  grow a pill until it covered half the conversation. It now stops at 200px
  or a quarter of the panel, scrolls inside itself, turns from a pill into a
  rounded box past two lines, and moves the clip and send buttons onto a row
  of their own so the text has the full width
- A new suite, `prose`, including the hostile cases

## 3.7.2 — 2026-09-13

**Every script lands in a code panel, not only the first one.**

- An answer carrying three queries usually arrives with the first one fenced
  properly and the rest as a bare `sql` line followed by loose text. The
  repair that exists for this gave up the moment it found one real fence, and
  only ever fixed one block. It now works the stretches between the fences,
  and every bare block in each, so all three become panels with a copy button
- It also accepts a block introduced by a sentence ending in a colon, with no
  blank line before the language name
- **Long lines wrap inside the panel.** A real query is wider than a 452px
  panel, and a line that does not wrap is a line half hidden behind a
  scrollbar nobody notices. Indentation is kept, and the copy button still
  hands over the original
- **The §4 prompt gained rule 13a**: every script in a fence, every fence
  closed, no shorthand after the first block — and rule 9d now says to take
  the policy number from anywhere in the conversation, not only the last
  message, so asking "can you give me the script?" three turns later still
  gets the real number rather than `<policy number>`. Paste the §4 prompt
  again to get both

## 3.7.1 — 2026-09-13

Two things the Nebula panel got wrong.

- **A mark of your own stopped fading.** The pulse ring was drawn on the
  same pseudo-element that carries `assets/assistant-logo.png`, so every
  2.6 seconds your logo was scaled up and faded out along with it. The ring
  has its own element now, and a mark of your own never animates
- **Answers hold against the picture behind them.** A photograph is light
  in places, and text written straight onto one disappears wherever it
  happens to be bright. The picture now sits under a veil that deepens
  towards the composer, the thread has a second soft scrim under it, every
  answer carries a shadow, and the ink is a shade nearer white. The picture
  is still clearly a picture

## 3.7.0 — 2026-09-13

**A picture with no words in it is looked at, not just named** — and still
nothing changes in the flow or the prompt inputs.

- Since 3.3 a screenshot with text in it went as its text. A screenshot
  *without* text — a dashboard, a panel, a photo — went as one line, so the
  assistant could only say it could not tell. The app now looks at the
  picture properly, on your PC, and writes down what it finds:
  - **Laid out as** — the big blocks of colour, where each sits and how much
    of the picture it takes
  - **Structure** — a bar across the top, a panel down the side, evenly
    spaced rows that look like a table or a list
  - **Worth noting** — a panel sitting over the page (usually a dialog or a
    card), an area in a colour screens keep for warnings and charts
  - **a map of the picture**: a grid of letters with its own key, one letter
    a square, capitals where the square looks like it holds text. A model
    reads the shape off it — a red-headed dialog over a white page, columns
    rising and falling where a chart is
- **A dark interface no longer collapses into one colour.** Navy ground,
  navy panels and a bright blue chart are three different letters, and the
  thresholds that find borders come from the picture's own range rather
  than a fixed number, so a dark theme has structure again
- **The §4 prompt now says what a described picture contains and how to
  answer from it** — say what it plainly is, then ask the one question that
  settles what cannot be seen. *"I cannot tell what this image is"* is
  named as a wrong answer. Paste the §4 prompt again to get it
- Faces are looked for on any picture with skin tones in it, not only ones
  already judged to be photographs

## 3.6.0 — 2026-09-13

**The assistant guides instead of quoting, and looks the part.**

- **One check per turn.** The §4 prompt now runs a case as a dialogue: what
  is likely happening here, the single next thing to look at with the
  person's real identifiers filled in, what each result will mean, and a
  question — never the procedure copied back. Paste the §4 prompt again to
  get it
- **Answers as chips.** A question can carry `choices`; the app shows them
  under the answer and one press sends the reply. The conversation travels
  twelve turns deep now, not six, so a guided check keeps its thread
- **It keeps what it learned.** When a case closes the model returns
  `remember` with the symptom, cause and fix, and a corrected `saveRunbook`
  draft when the procedure was wrong or thin — confirmed like any other write
- **The runbook waits folded** under the answer: title, system, status, and
  *Show the 6 steps and the checks* one press away, with the identifiers
  filled in when it opens
- **Nebula, the new look**: a night sky with a planet's rim over a ridge,
  drawn in SVG so nothing is fetched; glass over it for everything that
  holds text; the assistant's mark — a sphere with a lit rim and a
  four-point star — in the header and, on an empty thread, at the centre
  above *Dossier Assistant · Your workspace copilot* and *Turn tasks into
  progress*. A picture of your own beside the app
  (`assets/assistant-bg.jpg`, `assets/assistant-logo.png`) replaces the
  drawing. The other skins are still there under the look panel
- **The footer is back on the bottom edge** in Studio: with the banner
  hidden, auto-placement had moved every row up one and left the window's
  bottom empty. Each row is now placed by name
- A new suite, `guide`: the hero, the chips, the folded runbook, the footer

## 3.5.0 — 2026-09-13

**Any browser.** Firefox, Safari and the rest can now keep records, not just
show the demo.

- **A folder inside the browser.** Where a page cannot open a folder on disk,
  Dossier keeps the same files — `dossier.json`, the daily backups, every
  attachment — in the browser's own store, behind a directory handle that
  speaks exactly the interface the real one does. Nothing above it changed:
  saving, backups, attachments, scripts and language files work as they
  did, and the workspace reopens by itself next time
- The first-run banner offers *Keep records in this browser*; Setup says
  plainly that they live in the browser and to export a copy now and then.
  Edge and Chrome still get a real folder, and are asked for one as before
- A new suite, `anybrowser`: Chromium with the folder API removed, standing
  in for Firefox — a record, an attachment and a backup written, reloaded,
  and read back

## 3.4.0 — 2026-09-13

**Any picture, in words — and one expression away from being seen.**

- **A picture is described, not just read.** With `ocr.js` beside the app, a
  picture goes as what it is — *a screenshot, 1920×1080 landscape; mostly
  white and dark grey; text in 5 places* — then every piece of text with
  where it sits and what it sits on: *middle, centre, on white: Generate COI
  — Error …*. A photo says so, names its colours, and says when it looks like
  it has a person in it (the browser's face detector where there is one, skin
  tones otherwise). For a system screen that is most of what a person sees.
  Nothing in the flow or the prompt changes
- **A scanned PDF is read page by page.** The pictures of pages inside it —
  JPEG as the scanner wrote them, or raw samples — go through the recogniser
  on your PC, and the words go with the question with `[page N]` marks; the
  PDF's bytes stay. Fax-coded (CCITT) scans are left for the flow as before.
  Two pages read in under four seconds
- **`picture`: the one expression for a prompt with an image input.** The
  request now carries the first picture attached, or the first page of a
  scan, or a blank white pixel when there is none, so an Image input is
  wired with `base64ToBinary(body('Parse_JSON')?['picture'])` and nothing
  else — no filter, no condition, no null. That is what lets the model see
  a face or a chart, and the guide's Level 2 is now five minutes
- The tray says *described — no words in it*, *2 scanned pages read*, and
  shows *page 2/5* while a scan reads
- Notes `seen` (a picture described, no words) and `ocr` on a PDF (scanned
  pages read) join the contract; `nowords` is gone, a picture is always
  described

## 3.3.0 — 2026-09-13

**A screenshot is read too** — on your PC, with nothing changed in the flow
or the prompt.

- **`ocr.js`, an optional file beside `dossier.html`.** It carries a text
  recogniser (Tesseract, compiled to WebAssembly) and its English model,
  packed so that nothing is fetched; the app uses it when it is there and
  ignores it when it is not. With it, a screenshot attached to a question is
  redrawn at twice its size, read in a worker so the page never freezes, and
  its words go with the question under the file's name, the way a PDF's do.
  A full screen reads in about two seconds; the tray shows the progress
- **The pixels still go.** A picture keeps its base64 in
  `attachments[].data`, so a flow that shows pictures to its model, or runs
  the §4b recogniser, still can. `note` says `ocr` for words read off a
  picture — the request tells the model so, because a recogniser can read an
  `l` as an `I` — and `nowords` for a picture it could make nothing of
- **A picture that is all texture does not hold the app up.** A read is
  given 25 seconds — a full screen of log lines takes about ten — and then
  the worker is stopped and a fresh one boots for the next picture; a page of
  noise read at very low confidence is not offered as words. Either way the
  pixels still go and the tray says why
- Without `ocr.js` a picture goes exactly as in 3.2, as pixels for the flow's
  recogniser
- A new suite, `ocrattach`: a screenshot of an error dialog attached in the
  real page, read, carried, and the tray; and the app without the file

## 3.2.0 — 2026-09-12

**A PDF that comes with a question is read, here, before it goes** — and
the assistant answers from its pages instead of saying it cannot read
documents.

- **Attach a report and ask about it.** The text is read out of the PDF on
  your PC — objects, compressed streams, fonts and their encodings, the
  operators that place the glyphs — by a reader written into `dossier.html`
  for the purpose. Nothing is downloaded to do it and nothing leaves the
  machine but the words. A two-page report reads in about 30 ms; ten pages in
  under 50
- **The words go, the bytes stay.** `attachments[].text` carries the pages
  (`[page N]` marks), `pages` the count, `note` what got in the way; a file
  that arrived as text has no `data` at all. `attachmentsText` — the input the
  §4 prompt already reads — is now every file's name and then its text, so
  **the flow needs no change**. Paste the §4 prompt once more: the old one
  told the model it could not read documents, and it believed that with the
  pages in front of it
- **Text files too**: a `.log`, `.csv` or `.txt` arrives as its lines, not as
  base64 for the flow to decode
- **What has no words still goes as pixels** for the recogniser in §4b — a
  screenshot, a scanned PDF (`note: scanned`), a file that needs a password
  (`encrypted`) — and the tray says which, under the file's name, the moment
  it is read: *2 pages read*, *a scan, no text in it — the pages go for OCR*
- **"Protected" corporate PDFs open** when their user password is empty —
  RC4, AES-128 and AES-256 — which is what most of them are; a real password
  still says so
- **A question sent while a file is still being read waits for it**
- A PDF up to 25 MB can be opened, because only its words travel; the caps on
  what travels as bytes are unchanged (2 MB a file, 3.5 MB a question), and
  text is cut at 60,000 characters a file with the cut marked for the model
- Two new suites: `pdftext` — the reader against pdf.js on real files, and
  against files built to hit one thing each: three encodings, `/Differences`,
  object streams, an incremental update, wrong offsets and lengths, LZW and
  ASCII85, form fields, a Type3 font, four kinds of encryption — and
  `pdfattach`: the tray, the request, the wait

## 3.1.0 — 2026-09-12

**The assistant panel, rebuilt around how it is used** — and three things
that were wrong.

### The panel

- **An answer arrives where a skeleton said it would.** While the endpoint
  is deciding, the panel shows the shape of the answer to come — three
  shimmering lines — with the status line live in the header. After two
  seconds it starts counting; after eight it says the endpoint is slow, not
  stuck. When the answer lands the skeleton is gone that instant and only
  its afterimage fades, so nothing that counts messages ever sees both
- **Tools appear on the answer you are looking at.** Hover any answer for
  *copy* and *not what I meant*. The reading ("What to do next · 88%") is
  there when you look for it, not printed under every answer like a receipt
- **The thread never yanks you down while you read.** Sending always lands
  at the bottom; a reply that arrives while you are scrolled up shows a
  *New reply* pill instead, and takes you there when you press it
- **Result rows are one sheet**, each arriving a beat after the last, with an
  arrow that leans toward its record on hover
- **The composer is one calm rounded shape.** The send button is dim until
  there is something to send, carries an arrow, and turns into a spinner
  while the endpoint works. A keyboard hint appears under it only while it
  has focus: Enter sends · Shift+Enter new line · ↑ last question
- Your messages are a tint of the accent with a border, not a saturated
  gradient shouting in the thread; consecutive ones tuck together. A small
  time mark separates messages more than half an hour apart
- Suggestions scroll sideways instead of stacking into a wall
- Everything goes still under *Motion: none* and under the system's
  reduced-motion preference, skeleton included

### The assistant writes the chase

*Chase → Write it with the assistant* sends the facts — who, which records,
how long, how many times chased, the tone you picked — to your flow and
puts the returned draft in the box, where you can still edit it before
copying. The button only shows when the flow is on. Every notice in the day
view has an *ask the assistant about this* button beside its dismiss.

### Fixed

- **The footer floated above empty space** on machines with the text size
  changed. The shell was sized as `100dvh` divided by the zoom, which is
  right for one reading of how zoom and viewport units combine and wrong for
  the other — and browsers have changed their minds. The shell is a fixed
  box with `inset:0` now, which fills the viewport under either reading, and
  the document itself can no longer scroll. Verified at 80, 100 and 120%
  across three views, two window sizes, with and without the dock
- **The register and the week forced a sideways scroll** in a narrow column.
  The four optional columns fold at 980px of *column* width — early, because
  below that the title was being squeezed into a sliver six lines tall,
  which is worse than the scroll it replaced — then at 780px the fixed
  column widths and single-line titles give way; the week drops to four
  days, then two. Found on the way: the first version of these rules sat
  earlier in the stylesheet than the week grid they override, so the week
  rule won and nothing folded — a container query is still just a rule
- Attachments now carry `kind` — `image`, `pdf` or `text` — so a flow can
  branch on one word

### Reading attachments in Power Automate

`POWER-AUTOMATE.md` §4b is new. The request has always carried the files;
the prompt input `attached` was only ever getting their *names*. The recipe
runs each image and PDF through AI Builder's *Recognize text in an image or
a PDF document* and hands the prompt the words — nine steps, every
expression written out, the action names as the defaults so they can be
pasted. A second recipe passes the picture itself to a prompt with an Image
input, for prompts that take one. Prompt rule 9j tells the model to quote
the error in the screenshot rather than describe the picture.

837 assertions across twenty-two suites, no failures.

## 3.0.0 — 2026-09-12

**A new shell.** 2.3.0 changed the ink; this changes the room.

- **Navigation is a sidebar.** The seven views run down the left with a
  glyph each, the active one marked with an accent bar. The top of the
  content column is freed for the thing you type into, which is now a
  proper command bar with room to breathe
- **The day is objects on a canvas.** The numbers are rounded cards; each
  group — overdue, due today, coming up — is one sheet of rows. The page
  reads as a small set of things rather than one long list
- **Studio, a new default palette**: cool graphite ink on an off-white
  canvas with a single indigo accent, and a dark twin. Archive and Vault are
  exactly as they were and still available
- **With the assistant docked** the sidebar keeps its labels at desktop
  widths and folds to a 68px rail of glyphs below ~1240px — every tab still
  there, none of them stripped. Below 900px the original top bar returns on
  its own
- Group counts are figures, not pills; radii, gaps and padding move to a
  wider scale to match the larger surfaces

Everything Quiet does about colour still holds underneath: one line per
record, status as a dot, colour only where it must be noticed.

**Three looks, in Setup → Look.** Studio (new, default), Quiet (the top bar
with the same restraint), Classic (the original, unchanged). An existing
workspace moves to Studio once on first open; if you were still on the
Archive theme you move to the Studio palette too. Anything you had *chosen* —
a look, a theme, a custom palette — is left alone, and choosing again
afterwards always sticks.

Found on the way: switching the look through the assistant did not count as
a choice, so the one-time move could have undone it on the next open.
Choosing a look now counts wherever it comes from.

679 assertions across twenty suites, no failures.

## 2.3.0 — 2026-09-11

**A quieter interface.** Researched against current minimalist practice, then
applied as subtraction rather than decoration.

The problem was colour. It was being spent on everything — a filled pill for
the status, another for the priority, another for the system, a coloured date,
a coloured tag. Seven hues in one row buys nothing, because when everything is
emphasised nothing is.

- **Colour is a budget now.** The accent belongs to the active tab and the
  primary action. Status becomes a small dot and a word. Only an overdue date
  and a P1 keep a colour of their own, because those two must be noticed
- **Hierarchy by weight and space, not decoration.** The title gets size and
  weight; the rest of the row drops to one quiet line with middots between.
  Same information, roughly a third of the ink
- **Hairlines, not boxes.** Every record was a bordered, rounded, shadowed
  card inside a bordered section. A list is a list: rows divided by a single
  rule
- **The numbers band** is five cells divided by a rule rather than five
  separate boxes, with tabular figures so columns line up
- **Four-pixel rhythm** — padding and gaps land on multiples of four
- Applies to the register table too, which had the same pills

**One switch away from undone.** *Setup → Look → Look: Quiet or Classic.* A
big visual change to something you use every day should be reversible, not an
argument. Classic is exactly what it looked like before. The assistant can
switch it too.

Two bugs found and fixed while building it, both the same shape — a rule that
looked right but was measuring the wrong thing:

- The middot separator claimed `::before`, which the system chip was already
  using for its colour dot. The one piece of colour on the row that was
  earning its place silently disappeared. The separator is an `::after` now
- A test read `borderBottomColor` off a zero-width border, which reports the
  *text* colour — so "the rule is visible on dark" passed with a value of 233
  on a page of 19. It now asserts the width first, and that the rule sits
  clear of the page without glaring

636 assertions across nineteen suites, no failures.

## 2.2.0 — 2026-09-11

**Incident analysis, for an incident manager.**

Export your incidents from ServiceNow as CSV, import them in Setup, and the
app answers the questions ServiceNow answers badly: which system keeps
breaking, what is recurring, how long things take, and whether what is being
closed was actually resolved.

- **Counting happens in code, never in the model.** Volume, medians, repeat
  groupings and quality findings are computed locally and deterministically;
  the assistant reads them and says what they mean. A model that counts is a
  model that quietly gets it wrong with nobody able to tell
- **Repeats are found by signature** — identifiers stripped, words stemmed —
  so "COI letter not generated" and "COI letters not generating" are one fault
- **Records that cannot answer what happened**: no resolution note, a note
  that is a non-answer, no root cause, reopened, and the same fault closed as
  a workaround again and again — which means nobody fixed it
- **Assignment from evidence**, not prediction: who resolved this kind of
  incident before, how many, how fast, how often it came back, with the
  numbers beside the name
- **Only conclusions travel to the flow** — 13 incidents summarise to 2.4 KB,
  and 3,000 would summarise to about the same
- Import is tolerant: field names or display labels, any order, quoted fields
  with commas and newlines, and re-importing an overlapping range updates on
  the incident number rather than duplicating. It warns which useful columns
  the export lacked
- Three actions: `incidentReview`, `incidentGaps`, `whoFixedThis` (57 total)

Findings are about the **record**, never the person. Whether somebody is
careless is not something ticket data supports, and the prompt says so.

`flow/SERVICENOW.md` is new — the step-by-step guide, including which columns
to add before exporting and how to connect the Table API through Power
Automate once you have a service account. Dossier still never calls
ServiceNow itself; `connect-src 'none'` is unchanged.

**Repaste §4 of `POWER-AUTOMATE.md`** for rules 9f2-9f4.

602 assertions across eighteen suites, no failures.

## 2.1.0 — 2026-09-07

**The assistant analyses instead of photocopying.**

2.0.0 had an architectural flaw. Runbooks travelled to the endpoint as an
index — titles and trigger phrases, never the bodies — and `readRunbook`
rendered the card *in the app*. So the procedure never reached the model. It
could not reason about a step it had not read, and the only move left to it
was announcing that it would go and look something up. The answer on screen
was the stored runbook, verbatim, with `<policy>` still in the SQL.

Fixed by matching **before** sending. Matching is local and costs nothing, so
the two or three runbooks that match the person's own words now travel whole,
in `workspace.runbooksMatched` — steps, checks, escalation. The endpoint reads
the real procedure and answers with what the document cannot give you: which
step matters here, what to check first, what each outcome means, and what not
to waste time on. The full runbook is still drawn underneath, as reference.

- **The answer is rendered above the card**, not below it. Cards used to be
  appended the moment the action ran, which put the procedure above the
  sentence explaining it
- **Identifiers are pulled out of the question** and substituted into the
  checks, so the SQL on screen carries the real policy number instead of
  `<policy>` for somebody to fill in by hand at eleven at night
- **Configuration placeholders are called out.** `<policy>` is a value and
  gets filled; `<COI_REQUEST>` is a table nobody has named yet, is left alone,
  and the card says which ones still need setting. A plausible invented table
  name gets run, so it must never be invented
- **Matching handles inflection.** "COI not generating" now matches the
  trigger "coi not generated" — people type the tense they are in, not the
  phrase in the runbook. On the reported case this took the score from 20 to
  48
- **Naming a system is no longer enough to surface a runbook.** "The imaging
  queue is stuck" used to drag up the COI procedure on the strength of the
  word *imaging* alone; a runbook now needs its own words to have been said
- Each matched runbook carries `confidence` and `why` — which phrases hit —
  so a weak match can be offered as a guess rather than an answer

Prompt rules 9c–9f rewritten. **Repaste §4 of `POWER-AUTOMATE.md`** — without
it the assistant will keep photocopying, because the old rules told it to.

560 assertions across seventeen suites, no failures.

## 2.0.0 — 2026-09-07

The release that turns Dossier from a personal tracker into something a
support team can share.

### The BAU library

A support library that can actually grow, in three layers.

- **Runbooks** — one symptom and what to do about it, *not* one document. A
  guideline file usually holds six or eight distinct problems; split apart
  they can be found, left whole they cannot. Each carries trigger phrases
  (what somebody actually types, error text included), ordered steps, the
  queries that prove what is wrong, escalation, owner, and when a human last
  confirmed it.
- **System profiles** — what is durably true about a system, especially what
  it *lies* about. *regenCOI returns 200 whether or not it produced a letter.*
  One line that answers a family of tickets no runbook covers.
- **Memory** — unchanged. Still the personal notebook it always was.

**Runbooks travel to the flow as an index, never as bodies** — title, system,
triggers, severity, freshness, about 15 tokens each. Measured on the starter
library: 1,012 bytes for the index against 5,513 for the bodies. At a hundred
runbooks that is the difference between 1.5 KB and half a megabyte on every
question. The steps and the SQL stay local until `readRunbook` asks for one by
name. Profiles are the exception and travel whole, because there are few of
them and they are what reasons about an unknown symptom.

Nine new actions — `findRunbook`, `readRunbook`, `listRunbooks`,
`readProfile`, `startRunbook`, `saveRunbook`, `verifyRunbook`,
`deleteRunbook`, `saveProfile`.

**All of it works with the flow switched off.** The matcher is local and needs
no network. The endpoint adds language, not capability.

- Starting a runbook raises a record with its steps already on the checklist,
  so the work is tracked and there is evidence of what was done
- **Make a runbook from this** on any record — the library builds itself out
  of work you already did, which is the only way libraries ever get built
- Everything arrives as a **draft**: imports, what the assistant writes, what
  you capture. Approving is a human act, and there is no path to it from the
  endpoint
- Anything unconfirmed for a year shows as unchecked wherever it appears
- **Export and import the whole library as one file** — merged by title with
  the newer edit winning, so two people can both add runbooks and neither
  loses theirs. No shared drive needed

### The assistant

- `draftEmail` writes an email and shows it as a draft with Copy and *Open in
  my mail app*. Nothing is sent — Dossier has no mail credentials and its CSP
  has no outbound permission, so the draft is text until you send it
- `setTheme` and `setSetting` change the application's own settings from a
  whitelist of 15 keys. `settings.flow` — the endpoint URL — is deliberately
  not on it, and the refusal lives in the executor rather than the
  confirmation dialogue, so it holds even with confirmation turned off
- Chat redesigned: skins, toggleable motion, a confirm-or-don't switch, and
  confirmations moved out of the thread into a card that resolves to a
  one-line receipt

### Fixed

- **The email body rendered invisible.** `chatDraft` gave it `class="mb"`,
  which is already the row menu button — 25×25, `opacity:0` until its row is
  hovered. `.chmail .mb` overrode padding and colour but never width, height
  or opacity, so the text was in the DOM, correct, and rendered into a
  transparent 25-pixel square. Copy worked the whole time because it read the
  data directly. Renamed to `.mbody`
- **Code arrived without its fence.** A model that writes `csharp` on a line
  and forgets the backticks now still gets a code panel: `chatMend` repairs an
  unclosed fence, and a bare language name standing over something that reads
  like code. Both repairs are conservative — a language word over prose is
  left alone, and a sentence after the block stays out of the panel
- **Undo never covered the library.** `pushUndo` only ever snapshotted
  `S.tasks`, so the Undo offered after forgetting a memory note restored the
  records and left the note deleted. It now takes a snapshot covering memory,
  runbooks and profiles
- **New runbooks looked freshly checked.** `rbNormalise` stamped `verified`
  with today when the field was empty, which would have made every import and
  every written procedure look confirmed — the exact lie the field exists to
  catch
- An explicitly named system now outranks a system name that merely appears in
  the sentence, so asking about Imaging cannot surface the payment runbook
  because the word "payment" was in the question
- Attachments no longer blow the token budget: images are shrunk through a
  ladder before sending, and the reachability probe identifies itself instead
  of posting an empty body

### Interface

- **The version now sits at the right-hand end of the status bar.** Clicking
  it copies the build line. This matters more than it looks: the app is shared
  by sending the file, so five people can be running five different copies,
  and *"it does not do that on mine"* is a real conversation
- Address lines on an email draft are shown even when empty, and `bcc` was
  added throughout — schema, card, Copy and the mailto link

### Documents

- `flow/BAU-RUNBOOKS.md` — new. How a runbook is shaped, how to decompose
  existing `.docx` guidelines into them, and how a team shares the library
  with no shared drive
- `flow/runbooks-starter.json` — new. Three runbooks and two profiles built
  from real support situations, with every table and team name left as an
  angle-bracketed placeholder. A shape to copy, not content to trust
- `flow/CONTRACT.md` — the action reference is now generated from the sample
  payload, so the document, the code and the wire format cannot drift apart
- `flow/POWER-AUTOMATE.md` — prompt rules 9c–9g for the library, seven new
  worked examples, and the note that **the library needs no flow change**:
  `workspace` is passed whole, so the new blocks ride along inside it

### Upgrading from the previous build

Replace the files. Then:

1. **Repaste §4 of `POWER-AUTOMATE.md`** into your AI Builder prompt. This is
   the only required step, and without it the assistant will not reach for the
   library
2. Import `flow/runbooks-starter.json` from Menu → Setup → Runbooks, and
   replace its placeholders with your real table and team names
3. The Parse JSON schema does **not** need changing — Parse JSON does not
   strip properties its schema omits. Update it only if you want the new
   fields as dynamic content of their own

Nothing in your workspace needs migrating. `settings.runbooks` and
`settings.profiles` are created empty on first use.

### Tested

535 assertions across sixteen browser and Node suites, no failures.
