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

> **No PowerShell required.** The runner is `scripts\dossier-runner.bat`.
> Everything between Dossier and it is plain text, one value a line — a batch
> file reads that with `set /p` and writes it with `echo`, and never has to
> parse or escape JSON.
>
> Because a `.bat` cannot read your routines out of `dossier.json`, **Dossier
> queues its own scheduled runs** and the runner just runs what it is handed.
> The cost is honest: with the tab closed nothing is queued. For something
> that must fire regardless, point Windows Task Scheduler straight at your
> `.bat` — it needs nothing from Dossier.


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
assist.js                     the Assist tab — what it notices on its own
chat.js                       the assistant — what it understands and answers
brain.js                      optional: the local model, for the questions chat.js misreads
model/check.html              open this to see whether your PC can run one
model/run.html                the only page allowed to touch the network
model/models/                 optional: the model itself, for a PC with no internet
dossier.json                  every record, routine, script and setting
fonts/
  NotoSansKhmer-Khmer-*.woff2 the bundled Khmer face, also embedded in the HTML
  OFL.txt                     its licence
lang/
  en.xml                      the English master, generated from the code
  km.xml                      Khmer — all 1,308 phrases, ready to translate
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

## Talking to it

It reads records, but you do not have to type like a search box at it.

**An opener does not eat the question.** Nobody starts with the question —
they start with hello, or with right, or with sorry, and then they ask. "Hi,
what is overdue" used to say good morning and never mention the nine records;
now it says both. So does "right, show me imaging", "ok and Policy?" and
"sorry, I meant overdue". If what is left behind turns out to mean nothing on
its own, the opener was the message after all and it is answered as one.

**It will show its working.** Ask it something, then ask *are you sure*, *how
do you know that* or *what does that mean*, and it tells you which question it
took yours for, how sure it was of that reading, what the number is a count
of, which filters were on, and whether the reading came from a correction you
taught it. Ask twice and it still explains the original answer, not its own
last reply. Nothing there is a boast: everything it says is arithmetic over
records you wrote, and something that cannot say where a number came from
should not be trusted with the number.

**It has a view.** *What do you think*, *should I worry*, *any advice* and
*is that normal* get a judgement rather than a list. It reads the things a
person would read at the end of a day — how late the worst thing is, who has
gone quiet and never been chased, what has had nothing written on it in over
a week, what is open with no date at all, whether one system is over half the
pile — ranks them, and commits to one with the reason attached, so you can
disagree with it. Asked what to *do*, it leads with the move instead. Asked
whether to *worry*, it answers yes or no first.

And the rest of what people actually type: *hold on*, *let me think*, *give
me a second* (it waits), *no*, *nope*, *maybe*, *not really* (it takes the
refusal, and knows a hedge from a no), *ugh*, *this is a mess*, *I cannot
focus* (it acknowledges, then shows you the pile as a number rather than a
feeling). It still refuses to invent: the weather, the football, the capital
of anywhere are all outside what it can see, and it says so rather than
guessing.

---

## Teaching the assistant

The assistant reads your records and answers from them. It is not always
right, and the point of this section is what happens when it is not.

Under every answer there is **not what I meant**. Press it, pick the answer you
actually wanted, and it is learned — but learned as the *shape* of the
question rather than the sentence. Ask it

> what is the ticket of task D-0032

correct it once, and what it files away is

```
what is the ticket of task <code>   →   the answer you chose
```

so D-0045 and D-0117 and every record you open after that are already
understood. The same holds for the names in a question: correct it once about
Imaging and it has learned the question for Policy, CX Portal and everything
else. It will not carry a lesson across *kinds* — a question about a system is
not silently turned into a question about a person — because that is the sort
of generalising that produces a confident wrong answer.

Vocabulary is taught in a sentence, with no buttons at all:

> when I say the portal I mean CX Portal

The word joins the same list the system and colleague names live in, so it
works everywhere at once — in filters, in exclusions, in comparisons — and not
merely in the phrase you happened to be typing.

Everything it has learned is listed under the **✎** in the assistant's title
bar: every shape, every exact wording, every word you gave it, each one
deletable on its own, and a button to forget the lot. Ask it *what have I
taught you* and it will tell you. It is all kept in `dossier.json` with the
rest of the workspace, so it travels with the folder and never leaves it.

---

## A local model, if you want one

Everything above runs on arithmetic. The assistant reads a question by scoring
it against the shapes it knows, and gets it right about 97 times in 100. This
is about the other three, and it is **off by default**.

Open `model/check.html` first — it says plainly whether this PC can run a
model at all, and it must be opened through `dossier-serve.bat` rather than
from the folder, because a model cannot start on a `file://` page. Then
Menu → Setup → **Understanding harder questions**.

What it does is narrow. When chat.js is unsure — or has no reading at all —
it hands the model every question it can answer, as a numbered list, and asks
for a number. That is the whole exchange. The model **never writes a word you
read**: it returns one number, that number becomes one of Dossier's own
questions, and the answer still comes from counting your records. Anything
else it says is thrown away, so there is no path by which it can tell you a
figure it made up.

It appears under the answer as *"I was not sure, so I asked the local model.
It thinks you meant…"* with one button. Pressing it answers the question **and
teaches the shape** — so the model is not needed for that question again. It
is a teacher for chat.js rather than a dependency of it, and it should be
consulted less every week, not more.

Three things it cannot do to you. It cannot slow the chat down: the ordinary
answer has already appeared before the model is woken, and it runs behind a
timeout — if it hangs, is loading, or the file is missing, you get exactly
what you got before. It cannot run without being asked: nothing downloads
until you switch it on. And it cannot see anything but the sentence you typed.

**On the download, and where it is allowed to happen.** `dossier.html` has
carried this since long before there was a model:

```html
<meta http-equiv="Content-Security-Policy"
      content="connect-src 'none'; form-action 'none'">
```

The application cannot open a connection to anywhere. Not a leak, not a
mistake, not a library that decided to phone home — the browser refuses before
the request is made. That line is what makes *nothing leaves this folder*
checkable rather than merely claimed, and it is why the first version of this
feature was blocked by Dossier itself, which was the correct outcome.

Deleting the line would have fixed it and weakened the guarantee for everyone,
including everyone who never turns the model on. So instead the model runs
**somewhere else**: `model/run.html`, in a hidden frame, with a policy of its
own that permits the library CDN and Hugging Face and nothing else. It holds no
records, has no access to `dossier.json` or your workspace folder, and is
handed one sentence and a list of labels. `dossier.html` is untouched and
still cannot make a network call — with the model off *and* with it on.

The frame appears when you switch the model on and is destroyed when you switch
it off. The download is once, about 380 MB for the recommended model, cached in
the browser; every run after that is offline. If that one download is not
acceptable on your machine, leave it off and nothing else changes.

**If the download is blocked.** Plenty of company networks refuse
`huggingface.co` outright, and no code here can argue with a firewall. Open
`model/check.html` — it tells you which of three completely different things is
actually wrong, because they look identical from the chat window:

| what it says | what it means |
|---|---|
| *the files are* | you copied some of them, or an old copy is still there |
| *the network is blocking it* | a proxy or filter between this PC and the model |
| a hardware verdict | the files and the network are fine |

A stale `dossier.html` or `brain.js` produces exactly the same errors as a
blocked network, which is why the page checks both.

**The easiest way round a blocked network.** Tether the laptop to your phone
for ten minutes, open Dossier at the *same* address as always — the port
matters, the cache is keyed to it — switch the model on and let it download.
It is cached in the browser against that address. Go back to the company
network and it never downloads again, and it works with the network unplugged.
Nothing is copied, nothing is installed, no firewall rule has to change.

**Another address for the same files.** A filter usually blocks a category
rather than a hostname, and the same public files sit behind several
addresses. `model/check.html` tries the alternatives — jsDelivr, unpkg,
esm.sh for the runtime; Hugging Face and its mirror for the weights — and
tells you which, if any, are open on your network. If one is, put it in
**Library URL** and **Model host** in the same Setup panel and press Download.
A mirror is somebody else's server: no record of yours goes to it, it only
serves the weights, but in a regulated industry that is still worth a
moment's thought.

**Carrying it across on a stick.** If it is the network, put the model in the
folder and Dossier never asks the internet for anything. Run `model/check.html`
on a machine that *can* reach the internet and it prints the exact addresses —
read out of the library itself rather than remembered — plus the `index.json`
to paste. The shape is:

```
model/
  web-llm.js                        the runtime
  models/
    index.json                      what is here, and where
    Qwen2.5-0.5B-Instruct-.../      the weights, git-lfs cloned
    lib/…-webgpu.wasm               the compiled model library
```

`models/index.json` is the switch: if it is there, the model comes from the
folder and nothing is fetched. If it is not, the CDN is used. Nothing else
changes either way, and the settings panel says which one it loaded.

**Which model.** The picker is filled from what the library actually offers,
and the default is the smallest instruction-following one. That is deliberate,
not a compromise: the job is "which of these questions is this", which needs
no knowledge of the world and about six tokens of output. A larger model is
slower at it and no better.

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
