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

Leave it open. If Windows blocks it, right-click → *Run with PowerShell*, or:

```
powershell -ExecutionPolicy Bypass -File .\scripts\dossier-runner.ps1
```

Now press the **`$`** button on any record carrying a script — **D-0004** has
`restart-app-pool` with its parameters already filled, **D-0007** has
`open-morning-tabs`. It runs, and the output appears in that record's work log.

The runner reads the queue several times a second, so `$` and **Run now** start
the script straight away — there is no interval to wait out. It re-reads the
routines in `dossier.json` on a slower timer (`-PollSeconds`, 20 by default),
which only affects how precisely a routine hits its own time; pass a smaller
number if you want it tighter.

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
separator or `..` is refused. It runs as you, with no elevation, and makes no
network calls — nor does `dossier.html`.

Attachments and screenshots are copied into `tasks/<record>/` as ordinary
unencrypted files. Worth a thought before that folder lives on shared storage.

---

## Notes

- **Holidays** are seeded with Cambodia 2026 (Sub-Decree No. 167, 18 Sep 2025).
  Roughly half are lunar and move every year, and the list is reissued
  annually — check it, and edit it under Menu → Setup. Opening a year with
  nothing marked offers to fill in the dates that never move.
- **Quick add** takes tokens: `p1 @Imaging #INC0012345 ~Sokha 2h today`.
  Paste a Teams message or an email into the bar and it reads it instead.
- **Menu → Help** explains every feature.
