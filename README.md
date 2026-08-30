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
lang/
  en.xml                      the English master, generated from the code
  km.xml                      Khmer — every phrase listed, ready to translate
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
   **Write a new language file**. It writes `lang/<code>.xml` with every phrase
   listed and every value blank. It will not overwrite a file that exists.
2. Open it and fill in each `value=""`.
3. Press **Reload the language files**, then pick it from the dropdown.

The dropdown shows progress per language — *ភាសាខ្មែរ — 41 of 93 phrases
translated* — and the panel lists exactly which names are still blank.

`{shown}`, `{n}` and the like are values Dossier drops in. Keep them exactly as
written, but move them wherever the sentence needs them — `"{shown} of {total}"`
becoming `"{shown} ក្នុងចំណោម {total}"` is the point of them.

**Khmer typography is handled in CSS, not in the translation.** Khmer stacks
subscript consonants below the baseline and vowel signs above, and it has no
spaces between words. Under `lang="km"` Dossier adds a Khmer font to each stack
rather than replacing it (so ticket numbers and system names keep their face),
raises line-height, drops the letter-spacing that mangles Khmer clusters, and
steps the small chrome up from 11px to 13px — measured in the browser, because
Khmer at Latin's small sizes turns to mud whoever writes the words.

**What is covered so far:** the 93 phrases in the persistent chrome — the view
tabs, the compose bar, every filter, the Day sheet's headings and figures, the
footer and the menu tabs. The record drawer, Insight, Reports and Help are
still English in the code; they follow the same pattern when their turn comes,
and any phrase added to `STRINGS` appears in every language file as a new blank
the next time one is written.

---

## Notes

- **Holidays** are seeded with Cambodia 2026 (Sub-Decree No. 167, 18 Sep 2025).
  Roughly half are lunar and move every year, and the list is reissued
  annually — check it, and edit it under Menu → Setup. Opening a year with
  nothing marked offers to fill in the dates that never move.
- **Quick add** takes tokens: `p1 @Imaging #INC0012345 ~Sokha 2h today`.
  Paste a Teams message or an email into the bar and it reads it instead.
- **Menu → Help** explains every feature.
