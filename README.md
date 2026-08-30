# Dossier

A support operations record. One HTML file, no install, no server, no network.
Everything you log lives in a folder you choose, as plain JSON and ordinary
files you can read without this app.

**This repository folder is itself a ready-to-use workspace.** Clone it, open
`dossier.html`, point it at this folder, and there is already work on the
sheet, a routine that runs a script by itself, and the scripts to go with it.

---

## Run it

```
git clone https://github.com/SOYOUDOM/Dossier
```

1. **Open `dossier.html`** in Microsoft Edge or Chrome — double-click it.
2. Click **Choose workspace folder…** in the banner and pick **this repository
   folder** (the one holding `dossier.html`). Allow "Edit files" when asked.

That is the whole setup. You should see:

- records on the **Day** tab, including today's **Morning tour**
- **Menu → Routines** — *Morning tour*, every day 08:30, `$open-morning-tabs`, **runs itself**
- **Menu → Scripts** — three files, already registered
- **Insight** — a recurring problem, with the case written for you

> Firefox and Safari cannot open a folder, so Dossier can only show demo data
> there. Use Edge or Chrome.

---

## Make the scripts actually run

A page in a browser cannot start a program. So Dossier writes a request to a
file, and a small PowerShell process of yours picks it up, runs the script, and
writes the output back — which lands in the record's work log.

**Double-click `scripts\dossier-runner.ps1`.** A window opens:

```
Dossier runner watching C:\...\Dossier\scripts\queue
and the routines in C:\...\Dossier\dossier.json
```

**Dossier tells you whether it is actually there.** The runner writes a
heartbeat every ten seconds, and the footer shows `runner on` or `runner off`
at all times. If a routine is set to run itself and nothing is listening, the
Day sheet says so outright instead of leaving you to wonder:

> ⚠ Nothing is running your scripts. A routine set to **run itself** will raise
> its record on time and then do nothing, because the runner is not started.

The heartbeat also carries the folder the runner is watching, so the worst case
— a runner alive but pointed at a *different copy* of the workspace, which no
amount of restarting fixes — is named directly rather than looking like a dead
runner. Put your workspace path in **Menu → Scripts → Folder path** to catch
that even when both copies have the same folder name.

Leave it open. If Windows blocks it, right-click → *Run with PowerShell*, or:

```
powershell -ExecutionPolicy Bypass -File .\scripts\dossier-runner.ps1
```

Now press the **`$`** button on any record carrying a script — **D-0004** has
`restart-app-pool` with its parameters already filled, **D-0007** has
`open-morning-tabs`. It runs, and the output appears in that record's work log.

The runner looks **once a second** — at the queue and at your routines both —
so `$` and **Run now** start the script straight away, and a routine fires on
its minute. There is no interval to wait out anywhere.

It can afford to look that often because a pass is only a handful of file
stats. Parsing `dossier.json` is the one thing here that gets slower as your
work piles up — at 20 records a day it is a few megabytes within a year — so
the runner compares its modified-time instead and parses only when you have
actually saved something.

Three things keep it out of trouble:

- **One runner per folder.** Starting a second by accident — a double-click on
  top of the logon task — is refused, so a script cannot run twice. A different
  workspace still gets its own runner.
- **A stuck script is stopped after five minutes** (`-TimeoutSeconds`) instead
  of freezing the queue and every routine behind it.
- **A request is taken before it is run**, so killing the runner mid-script
  cannot make it run again on restart.

`-PollSeconds` (300) is only a long-stop re-read for folders whose
modified-time cannot be trusted, such as OneDrive or a network share. On a
normal local disk it never does anything useful.

To start the runner at every logon: put this folder's full path into
**Menu → Scripts → Folder path**, then
**Menu → Setup → Running a script → Copy the schtasks line** and run it once.

---

## Schedules

**Menu → Routines** is a schedule editor, not a task form. A schedule is a
different thing from a record: it repeats, it can carry a message, and it does
not have a status or a due date of its own.

- **Click ✎ on any schedule to edit it.** It keeps its id, so the records it
  has already raised stay attached to it.
- **Message** is shown in the reminder and copied onto the record it raises.
  Leave it empty and the reminder just says the name.
- The form shows only the fields the chosen kind uses — a weekday picker
  appears for *Certain weekdays* and not otherwise — and says in plain words
  what it will do: *Mon–Fri at 07:45 · reminds you*.
- **What it does** and **Details** are folded away until you want them.

---

## Cron, when the dropdowns are not enough

A routine can repeat every day, on weekdays, on chosen weekdays or on a day of
the month. Anything else — the 1st and the 15th, every two hours, twice a
morning — set **Repeats** to *On a cron schedule* and write it out:

```
0 8 * * 1-5        08:00 on weekdays
*/30 9-17 * * *    every half hour through the working day
0 9 1,15 * *       09:00 on the 1st and the 15th
@hourly            on the hour, all day
```

Five fields — minute, hour, day of month, month, day of week — with `*`,
ranges, lists and `/step`, plus the `@hourly` `@daily` `@weekly` `@monthly`
shorthands. Weekday names work (`mon-fri`). Cron's own rule is kept: when both
day-of-month and day-of-week are set, a day matches if **either** does.

The editor shows the **next three runs as you type**, so you find out what the
expression means before you rely on it, and a mistake is explained (*field 1
must be between 0 and 59*) rather than silently never firing.

**Dossier still raises one record per day**, timed at the day's first firing —
the sheet would be unreadable otherwise. The runner fires the **script** at
every occurrence, and each run is its own line in that record's work log. The
Time box is ignored for a cron routine; the expression carries the time.

### Using one as a reminder

Set **Remind me** to *Yes — a notification at every firing* and the routine
nudges you on its own schedule, with no script involved:

```
Title     Drink water
Repeats   On a cron schedule
Cron      0 9-17 * * 1-5        on the hour through the working day
Remind me Yes
```

While Dossier's tab is open it raises a Windows notification at each firing.
With the runner started it does the same when the tab is closed. Either way
you get one nudge per firing and no more, and a firing more than five minutes
past is skipped — opening Dossier in the afternoon should not announce the
quarter past nine.

Reminders have to be switched on in **Setup → Reminders** first, and Windows
has to have allowed notifications for the page.

Both halves were checked against each other: the browser's cron and the
runner's PowerShell cron agree on all 770 day-and-time decisions across eleven
expressions and seventy days.

---

## Watch a routine fire itself

*Morning tour* is already set to run `open-morning-tabs.bat` on its own, every
day at 08:30. With the runner started, nothing else is needed — it reads the
routines out of `dossier.json` and fires them **whether Dossier is open or
not**, once a day, catching up later if the machine was off at the hour.

**To see it now rather than tomorrow:** Menu → Routines → delete *Morning
tour*, then add it again with the time set two minutes from now, Script =
`open-morning-tabs`, and **On its own** = *Yes*. Watch the runner window:

```
[08:32:04] running open-morning-tabs.bat for routine 'Morning tour'
```

The result is filed into that day's record as **Ran on schedule**, with the
exit code if it failed. D-0004 already has one so you can see the shape of it.

Once a day is guaranteed by the runner's own marker,
`scripts\queue\.auto-<routine>-<date>.txt` — delete today's to let it fire
again. The `.bat` deliberately has no second guard of its own: two guards meant
that testing it by double-click would quietly cancel the scheduled run.

**To run it this second instead:** Menu → Routines → **`▶`** on *Morning tour*.
That raises today's record and starts the script immediately, clearing the
marker first so the scheduled run still happens.

---

## What is in the folder

```
dossier.html                  the whole application
dossier.json                  every record, routine, script and setting
fonts/
  NotoSansKhmer-Khmer-*.woff2 the bundled Khmer face, also embedded in the HTML
  OFL.txt                     its licence
lang/
  en.xml                      the English master, generated from the code
  km.xml                      Khmer — all 1,107 phrases, ready to translate
logo.png, favicon.ico         yours — the app picks them up automatically
scripts/
  dossier-runner.ps1          runs queued scripts, fires routines on time
  open-morning-tabs.bat       sample: opens your morning tabs
  restart-app-pool.bat        sample: parameters, and a filled copy per record
  queue/                      run requests and their results (transient)
backups/                      one snapshot per day, 30 kept
tasks/                        one folder per record, for its attachments
```

`tasks/` is created the first time you attach something.

---

## Safety

The runner will only execute a file **already sitting in `scripts/`**. The
request names a file, never a command line, and any name containing a path
separator or `..` is refused. Parameter values are handed to `cmd.exe`, which
re-reads its own metacharacters, so a value containing one (`& | < > ^ " \``
or a newline) is refused rather than quoted. It runs as you, with no elevation,
and makes no network calls — nor does `dossier.html`.

Nothing in `scripts/queue/` grows without bound: a script's output is kept to
8 KB, results Dossier never collected are deleted after a day, and the
double-click transcripts start over once they pass 256 KB.

Attachments and screenshots are copied into `tasks/<record>/` as ordinary
unencrypted files. Worth a thought before that folder lives on shared storage.

---

## Another language

Phrases live in `lang/`, one XML file per language, in the ABP shape:

```xml
<localizationDictionary culture="km" name="ភាសាខ្មែរ">
  <texts>
    <text name="Day" source="Day" value="ថ្ងៃ" />
    <text name="Reset" source="Reset" value="" />
  </texts>
</localizationDictionary>
```

The code calls `L("Day")` and never contains a translation, so nobody has to
edit `dossier.html` to add a language, and nobody has to read code to write
one. `source` carries the English next to the blank, which means a file can be
translated on its own — handed to a person, or to a translation tool — with
nothing else open.

**An empty `value` is not an error.** That phrase stays English until someone
fills it in, so translating in passes works and a half-finished file is
perfectly usable.

To add one:

1. **Menu → Appearance → Language**, type a code (`km`, `th`, `pt-br`) and press
   **Write or top up a language file**. A new file lists every phrase with a
   blank value.
2. Open it and fill in each `value=""`.
3. Press **Reload the language files**, then pick it from the dropdown.

The dropdown shows progress per language — *ភាសាខ្មែរ — 412 of 1107 phrases
translated* — and the panel lists exactly which names are still blank.

`lang/km.xml` already carries all 1,107 phrases with blank values, so Khmer
needs no setup — open it and start filling in.

**Pressing it again on a file that already exists tops it up rather than
replacing it.** Every value you have filled in is read back out and written
again unchanged, and only phrases Dossier has gained since are added as new
blanks. So when the app grows, you top up and translate the difference — you
never redo work.

`{shown}`, `{n}` and the like are values Dossier drops in. Keep them exactly as
written, but move them wherever the sentence needs them — `"{shown} of {total}"`
becoming `"{shown} ក្នុងចំណោម {total}"` is the point of them.

**A Khmer typeface ships with the app.** Everywhere else Dossier refuses to
bundle a font, because a web font means fetching from someone else's server.
Khmer is the exception: Windows ships only Khmer UI and DaunPenh, neither
designed for dense interface text, and a machine without them draws Khmer as
empty boxes. So **Noto Sans Khmer** (SIL OFL 1.1 — `fonts/OFL.txt`) is carried
inside `dossier.html` as data. It is still not a download; nothing is fetched,
and that is checked in the tests by asserting the page makes zero network
requests.

Both weights are subset to the Khmer and Khmer Symbols blocks — 32 KB for the
pair, +8% on the file — and render pixel-identically to the full faces on coeng
stacking and every pre-, post-, above- and below-base form. Latin is untouched:
the browser only reaches for it on Khmer codepoints, so your chosen Latin face
still sets everything else.

It applies whatever the interface language, so a record you typed in Khmer
reads properly with Dossier in English. **Menu → Appearance → Khmer text**
picks a different face if you have one installed you prefer.

**The rest of Khmer typography is handled in CSS, not in the translation.** Khmer stacks
subscript consonants below the baseline and vowel signs above, and it has no
spaces between words. Under `lang="km"` Dossier adds a Khmer font to each stack
rather than replacing it (so ticket numbers and system names keep their face),
raises line-height, drops the letter-spacing that mangles Khmer clusters, and
steps the small chrome up from 11px to 13px — measured in the browser, because
Khmer at Latin's small sizes turns to mud whoever writes the words.

**What is covered:** 1,107 phrases — every view, every panel, the record
drawer, all six menu tabs, the filters, the reports and chase text, toasts and
error messages, weekday and month names, status names and column headings.

Coverage was measured rather than assumed: a pseudo-language replaces *every*
phrase with a marker, the app is driven through all six views, all seven menu
panels and the drawer, and anything still showing English is a phrase that
cannot be translated. What remains is 35 words, and they are correct as they
are — the `schtasks` command line, file extensions like `.msg` and `.png`, the
`tasks/` folder name, and the names languages call themselves.

Three things are deliberately **not** translated, because they are your data
rather than the interface: system names, record types and the teams you wait on
(`DEF_SYS`, `DEF_TYPE`, `DEF_PARTY`). These are stored on every record and
matched against, so translating them would rewrite your records and break every
filter. Edit them in **Setup** instead, in whatever language you like.

---

## Holidays, a year at a time

**Setup → Holidays and festivals → Add many at once.** Thirty dates one at a
time is not something anyone does twice, so there are two ways to do it in one
go.

**A date range** — from, to, a name, and *skip weekends*. Two weeks of annual
leave is one click and ten working days.

**Or paste a list.** Three fields — `date`, `name` and `kind`:

- **`kind: "public"`** — a day off. Tinted on the calendar, and target dates
  are kept clear of it.
- **`kind: "observance"`** — marked on the day, but still a working day.
- Leave `kind` off and it counts as a day off.

It takes that JSON, a plain `{"2027-01-01": "New Year"}` map, the short
`d`/`n`/`k` spelling the file itself stores, or one a line:

```
2027-01-01, International New Year, public
2027-04-14, Khmer New Year, public
14/04/2027  Khmer New Year          ← day-first dates work too
```

Leave the kind off and it counts as a day off. A date already marked is
**replaced rather than doubled**, so pasting a corrected list twice is safe.
Anything unreadable is listed back at you with the line that failed — thirty
dates with two typos gives you twenty-eight marked days and two lines to fix,
not an error.

**Copy what is marked now** puts the whole list on the clipboard as JSON, so
you can edit a year in a text editor and paste it back.

---

## Panels fold

Setup and Help were a single long column each. Every heading in them is now a
section you can fold, closed by default — Setup opens as a nine-line list of
what is in there, and Help went from 4,000 pixels of essay to a contents page.
What you open stays open.

---

## How it feels

**Menu → Appearance → Feel.** Three settings, saved with the workspace:

- **Motion** — Full, Subtle, or None. If your machine asks for reduced motion,
  Dossier follows it; picking **Full** here on purpose overrides that, which is
  the only way round that respects someone who set it deliberately.
- **Density** — Comfortable or Compact. Compact takes about a third off the
  padding, worth roughly four more records on a laptop screen.
- **Text size** — 80% to 140%, and it scales the layout, not just the letters.

**Press `?` for the keyboard shortcuts.** There were eighteen of them and no
way to discover any: `1`–`6` for views, `J`/`K` to move, `Space` to cycle a
status, `D` done, `T` to today, `S` for the clock, `Ctrl K` for the palette.

The keyboard now behaves properly everywhere: opening a panel puts focus in
it, Tab stays inside it, Escape closes it, and closing gives focus back to
where you were.

---

## Notes

- **Holidays** are seeded with Cambodia 2026 (Sub-Decree No. 167, 18 Sep 2025).
  Roughly half are lunar and move every year, and the list is reissued
  annually — check it, and edit it under Menu → Setup. Opening a year with
  nothing marked offers to fill in the dates that never move.
- **Quick add** takes tokens: `p1 @Imaging #INC0012345 ~Sokha 2h today`.
  Paste a Teams message or an email into the bar and it reads it instead.
- **Menu → Help** explains every feature.
