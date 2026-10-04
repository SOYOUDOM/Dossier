# Changelog

The version shown at the right-hand end of the status bar. Click it to copy
the full build line — version, build date, flow protocol and what your copy
holds — which is what to paste into a bug report.

---

## 5.10.0 - 2026-10-04

**Crimson: a red-and-white chat skin with a character of its own - a small
red heart in place of the robot.**

- **New skin, Crimson** (◎ → Skin → Crimson, marked *New*). Lumen's layout,
  in white with red (`#d31145`) for send, links, switches, the focus ring and
  the main button; a soft pink bubble for your messages; a thin red line
  along the top of the panel. In dark mode it turns charcoal with a brighter
  red (`#ff4d76`). Every other skin is exactly as it was - Lumen's chat panel
  was compared pixel by pixel before and after.
- **Its mark** is a white heart with a pulse line through it on a red tile,
  in the header and over each answer; it beats while an answer is on its way.
  The greeting has a heartbeat line under *Good morning*, moving while
  *Passing light* is on and still otherwise.
- **A new character: the heart.** All sixteen pixel sprites are drawn again
  for it in a palette of its own (a deep wine outline, the red body, a lit
  side, pink cheeks): thinking, dozing, the beating header mark, the wave on
  an empty conversation, and the seven desk-pet moods - cheering, worrying,
  napping, stamping a record, stretching, being carried. While Crimson is the
  skin, **the desk pet is the heart too**. Pick another skin and the robot is
  back, everywhere at once.
- **Your own mark for it**: a picture at `assets/crimson-mark.png` beside
  the app is Crimson's mark. The blue star that comes with Resolv is not used
  by Crimson, which keeps its own heart unless a picture is there for it by
  name.
- With *Pixel art* off, the waiting animation is turned to Crimson's red.
- Under the bonnet: Lumen's layout rules now apply to any skin built on it
  (`data-lm`), so a skin can share the layout and bring its own colours; a
  skin can bring its own pixel set (`assets/pixel/<set>/`), picked by
  `pixKey()`. `art/make-pixel-art.py` draws both characters, each with its
  own palette (the robot's GIFs are byte for byte the same), and writes
  `art/contact-sheet-crimson.png`.
- README: *Crimson* - *How do I make the assistant red, with the heart?*,
  *Can I use my own picture as Crimson's mark?*
- Tests: 81 browser checks (picking Crimson, the heart in every sprite, the
  greeting, the header and the desk pet, its own mark, Lumen and the others
  unchanged).

---

## 5.9.5 - 2026-10-01

**Closing a record with your own steps is not "held back" any more, and your
own runbooks count.**

Reported (shown here with made-up wording): *"here is the fix for D-0153 ·
Steps: … valid until exactly 5 years after the start date … please close it
with these steps"* came back as *Answer held back — it gave a figure its
sources do not state*, while the record was closed and logged anyway. Two
causes, both general:

- **"policy number" is not a policy document.** The word *policy* made the
  message look like a question about policy documents, so the reply was
  checked against Sources. *"policy number"*, *"policy no."*,
  *"policyholder"*, *"customer/insurance/life policy"* and *"policy
  A018346A10"* no longer count; *"what does the password policy say?"* still
  does.
- **A figure you wrote is yours.** The reply repeated *your* "5 years", which
  is in no document. Now a figure written in your own message, as a
  statement, is never taken out or held back. A figure in a question you ask
  (*"is it 5 years?"*) is still checked, and so is one typed into a question
  about a standard (*"our target is 14 days - what does the standard say?"*):
  that is not evidence of what the standard says.
- **Your own runbooks count.** The assistant was told that only Sources
  documents are evidence of what a procedure says, and the check agreed, so a
  figure from a runbook you wrote (or made with *Learn from a BAU document*)
  was treated as invented. Now the runbooks that match a question are
  followed, a figure in one is accepted, and the answer says **From your
  runbook: …** with **Yours** - press it to open the runbook. Documents in
  Sources are checked exactly as before.
- **A job is not a question.** A reply that closes, logs or changes a record
  and cites no document has no sources box under it.
- **Closing with how it was fixed.** `setStatus` and `updateRecord` take a
  `resolution`: *"close it with these steps"* now moves the record to Done,
  keeps the fix in one or two lines as **How it was fixed** (the box that asks
  for it has nothing left to ask), puts the steps in full in the work log, and
  offers to keep them as a runbook when none covers it. The confirmation
  shows the line; the receipt says *How it was fixed is kept on it*.
- The held-back message no longer says "the passages it cited" when it cited
  none; it says the figure is not in your documents, your matching runbooks
  or your own message. (The figure itself is still never shown.)
- Prompt: their runbooks are their procedures - follow them and say so; a job
  carrying their own content is done with their words and cites nothing; an
  insurance policy number is a record, not a policy document; a worked
  example of closing a record with pasted steps (made up).
- README: *I asked it to close a record with my own steps, and it said
  "Answer held back" — why?*, *How do I close a record with the steps I used,
  in one message?*, *I wrote the procedure in my runbook — why did the
  assistant not follow it?* `flow/CONTRACT.md`, `flow/SOURCES.md` and the
  guide in `docs/` updated.
- Tests: 37 unit tests, 73 browser checks (the close with pasted steps, the
  answer from a runbook, the same reply held back without the runbook).

---

## 5.9.4 - 2026-10-01

**Sources for a hundred documents: a list you can search, filter, sort and
fold, actions for many at once, many files added in one go, and clean
names.**

- **The Sources panel is a table now**, built for many documents: one row
  each - the name (click it to open the document), a short line under it
  (file, version, effective date, pages, systems, category, access), its
  type, its number of passages and its status - with the header kept in
  view while the list scrolls inside the panel. With 100 documents the panel
  is about 650 pixels high instead of a page several screens long.
- **Find**: a search box narrows the list as you type (name, file, version,
  system, environment, category, type); chips show **All**, **Active**,
  **Superseded**, **Switched off** and **Need a look**, each with its count;
  **Sort** by name, newest first, category or type - the last two grouped
  under headings. Resolv remembers the sort.
- **Fold**: the arrow beside *Sources* folds the panel to its title line;
  Resolv remembers it.
- **⋯ on each row** holds View, Details, Re-index, Switch off / Switch on and
  Remove, instead of five buttons on every row.
- **Several at once**: tick rows (the header box ticks every row shown) and
  a bar offers **Switch on**, **Switch off**, **Re-index**, **Set
  category…**, **Remove** and **Clear**. *Switch on* for several never
  brings back a superseded version - that would put old rules back into
  answers; an old version is switched on from its own ⋯ menu.
- **Many files in one go**: choose them all in the file window; Resolv reads
  them and shows **one** window listing them all with the details they
  share (systems, environment, category, access, may go to the assistant).
  Files already in Sources are left out and counted. They are saved and
  indexed together: 100 Markdown files in about two seconds.
- **Clean names**: a document is named from its own title - its `# heading`,
  a `title:` at the top, a one-word heading, or a first line all in bold -
  and from its file name when the first line is a bullet or a sentence.
  Markdown marks (`**`, `#`, `` ` ``, links) never end up in a name. Names
  broken that way before are mended when the workspace opens; a name typed
  in **Details** is kept.
- **The same rules for every document**: the worked example in the prompt
  that showed how to answer when rules differ by case is now about change
  management rather than passwords, and the guide says plainly that every
  question searches every active document. New tests ask a mixed library
  (retention, patching, incidents, a security playbook, passwords) and check
  each question finds its own document, typos included, and that a line
  with an unsupported figure is taken out of an answer about patching just
  as it is about passwords.
- README: *Does the assistant only answer from one document?*, *How do I
  add many documents at once?*, *How do I find a document when there are
  many?*, *How do I open, rename, re-index, switch off or remove a
  document?*, *How do I switch off, re-index, re-categorise or remove
  several documents at once?*, *Why did some document names change?*
- Tests: 32 unit tests, 68 browser checks (search, chips, ticks, several
  at once, adding several, folding).

---

## 5.9.3 - 2026-09-30

**A slimmer conversation: sources fold to one line, and the files you send
show as cards you can open or hide.**

- **Sources under an answer start folded to one line**: the document it came
  from and its page, the confidence, and a **›** - *Source: Application
  Security Standard · p. 12 · High*. A click opens the Source, the Evidence,
  the notes and what was searched; another folds them. Each answer remembers
  how you left it. A warning is never folded away: *Part of the answer was
  taken out*, *Answer held back* and *No supporting source found* are on the
  line itself, and a held-back answer opens by itself. A suggestion stays in
  view - it is advice, not a reference. The line is about a tenth of the
  height of the old box.
- **Files you send show as cards under your question**, like in any chat: a
  small picture for a picture; kind, pages and size for a document, and *in
  Sources* when it is kept there. **Click a card to see what you sent**: a
  document kept in Sources opens in the Sources viewer (page by page, with the
  original a button away), any time; other files show, while Resolv is open,
  the words read out of them or the picture as it went. A picture keeps a
  small copy (200 pixels, a few kilobytes) with the conversation, for after a
  restart. **Hide** folds the cards to one line (*📎 2 attached: ...*), and
  each question remembers it. A question sent before this version finds its
  document in Sources by its file name.
- The note under an answer that kept a document is one line now.
- README: *How do I see a file I sent with a question? Can I hide it?*, *How
  do I make the sources under an answer smaller, or see them in full?*
- Tests: 56 browser checks (folding, remembering, the cards, the picture's
  small copy, older questions).

---

## 5.9.2 - 2026-09-30

**A right answer is no longer hidden because of one line.** Asked *"what is
the standard password should be?"* about a password standard, the reply had
the answer - the passphrase length for user accounts, and the shorter
password allowed where a passphrase cannot be used - quoted and cited
correctly. But one line gave a
figure the passages it cited do not state, so the whole reply was held back
and replaced by *"The documents searched do not specify this"*, which was
not true. Now:

- **Only the line is taken out.** A sentence, list item or table row that
  gives a figure no cited passage contains is removed (with a heading or an
  introduction left with nothing under it); the rest is checked as usual and
  shown, marked **Part of the answer was taken out**, at Medium confidence.
  The figure is still never shown. When that figure is written in your
  documents but in a passage the reply did not cite, **Figure seen in** links
  to the line and section where it is, to judge - never counted as support.
  A not-found answer with a guess added keeps its not-found and loses the
  guess.
- **Held back honestly.** When the whole reply rested on such a figure it is
  still held back, but the message no longer claims the documents are silent:
  it says the reply was held back and shows what the cited passages do say
  (**What they do say**, confidence **None**). Choice buttons from a
  held-back reply are no longer shown.
- **Page headers are not sections.** A line printed at the same place on
  most pages of a PDF - *VERSION*, *DATE*, *REFERENCE*, *CLASSIFICATION*, the
  page number, a footer - is left out of the passages and is never a heading.
  A rule that ran on to the next page used to be cited as section
  *"CLASSIFICATION : OFFICIAL"*; it now keeps its own section (the rule's
  reference, like *ACS-PWD-01*).
  Fields like *VERSION: 1.0*, runs of control references (*AC-1, AC-2*), web
  addresses, lines cut off mid-phrase and table rows split by tabs are not
  headings either. Documents already in Sources are cut again, from the text
  already kept, the next time the workspace opens.
- **Typos.** A question word no document uses, one letter from one they do,
  is searched as that word (*stardard* as *standard*); a question about a
  mistyped *standard* or *policy* is still a question about documents.
- **Broad questions find the rules.** When a question's words are on every
  page (every page of a password standard says "password"), passages that set
  a rule - minimum, maximum, must, must not, a number of characters or days -
  come first, synonyms of those everywhere-words are not added, and word
  pairs no longer run across the end of a sentence or a title's lines.
- **Prompt**: cite every passage a figure comes from (the app takes out a
  line whose figure is in no cited passage); when the rules differ by case -
  account type, severity, environment - lead with the everyday one and list
  the others, each cited. A worked example. A workspace's own
  `dossier-prompt.txt` works as before without these lines.
- **Recent searches** show lines taken out and mistyped words read.
- README: *Why was part of the answer taken out?*, *The answer is in my
  document, but Resolv said it was not found or held it back*, *Does it
  understand a question with a typo?*, *Which passages does a broad question
  get?*, *My PDF prints the same header on every page*.
- Tests: 28 unit tests and 45 browser checks, with a made-up password
  standard laid out like a real one.
- **How the assistant works, for anyone**: `docs/HOW-THE-AI-WORKS.md` - the
  journey of a question in eight steps (with the password question as the
  example), what goes with a question and why, how it learns without being
  retrained, the ten rules that keep it fast and steady, and a reusable
  blueprint and checklist for building a new AI assistant the same way.
  `docs/how-the-ai-works.html` is the same as pictures, and works offline.
  README: *How does the assistant work, from my question to its answer?*,
  *Does the AI learn? Is it retrained?*, *Why is it fast?*, *Can we build
  another assistant the same way?*

---

## 5.9.1 - 2026-09-30

**Studying a guideline is not held back; its drafts are checked instead.**
In 5.9.0 a `[study]` reply that summed up the runbooks it wrote could be
"held back" like an answer to a question. A study, an interview about a
runbook, logging an email and the daily look back are jobs, so their reply
is now shown as it is - and every draft runbook, note or system profile they
propose is checked against the document it came from: a figure the document
does not state is named on the draft's **Save it?** (*⚠ Not in the document:
4 hours*). The reply also says the document is **kept in Sources**.

- **Names**: a PDF kept from a conversation is named after its file
  (*ITSR.039 Vulnerability Management Standard*) unless its first line is a
  real title - it was often a logo (*AIA*). Documents already named that way
  are renamed from their file the next time the workspace opens (unless
  renamed by hand).
- **Tables read a column at a time**: a figure whose number and unit are
  both in the cited passage, but not side by side - how a PDF reader can
  return a table - now counts as supported, at Medium confidence, instead of
  holding the answer back.
- **Recent searches** show the figure that held an answer back.
- README: *Studying a guideline, and checking it was learned*.

---

## 5.9.0 - 2026-09-30

**Answers from your runbooks and standards come from the documents - with
the page, the lines and the section - or say they are not there.** A
standard with no remediation timeframe in it was answered "4 hours": the
guideline had gone with the one question it was attached to, the next
question carried only a summary, and the one 4 hours in the request was
Resolv's own P1 target date. Now:

- **Library → Sources** keeps your runbooks, standards and guidelines -
  PDF, Markdown, Word, text - whole, in the workspace folder (`sources/`):
  the original, its text, and its passages, each with page, lines, section
  and an id that stays while its words do. A PDF is read to the end, scanned
  pages through `ocr.js`, and a page read badly is flagged. A document
  attached in a conversation is kept there too (the **⊕ Sources** chip).
- **Every question searches them** - every active document the workspace is
  cleared for - and carries the passages that match, labelled S1, S2..., in
  a new `{sources}` place in the prompt, with the ones around the best, so a
  table keeps its heading. A system, environment, document or version named
  in the question narrows the search; look-alike runbooks for other systems
  drop out. Follow-ups ("how about low severity?", "the previous section")
  are searched again with the question before them; a new conversation finds
  the same passages. More than 100 documents: tested with 150.
- **The prompt answers only from them** for anything a policy, standard,
  runbook, SLA or procedure says: no figure a passage does not state, no P1
  target carried over to a vulnerability, both sides of a conflict, advice of
  its own only in a separate suggestion, and "The provided policy and
  standard do not specify ..." when they do not.
- **The answer is checked before it is shown.** Every quote must be in the
  passage it cites, and every figure - a timeframe, a percentage, a severity
  - must be in a passage it cites. One that states a figure no cited passage
  contains is **held back**, not shown.
- **Under the answer: Answer, Source, Evidence, Confidence** (High / Medium /
  Not found), a suggestion marked as not from your documents, and which
  documents were searched. A citation opens the document at that page with
  the lines marked; "which source supports this answer?" and "why was it not
  found?" are answered on the spot. With no flow, a question about your
  documents gets their own words, cited.
- **Versions**: a new version can replace the old one (kept, no longer
  searched); two active versions are told apart only by their version or
  effective date - never by which came last - and are both shown when
  nothing tells them apart. **Switch off**, **Re-index** (says what changed,
  by passage), **Re-index all**, **Remove**.
- **Access labels**: a labelled document is searched only in a workspace
  cleared for its label - otherwise not searched, counted, named or sent. A
  document can be kept to this PC: searched, never sent.
- **Diagnostics**: Library → Sources → Recent searches and changes (and the
  console, `[sources]`) - documents searched, filters, passages, scores,
  versions, citations, answers held back. Never a document's words.
- **Tests in the repository**: `node --test` (19, every scenario above and
  the "4 hours" regression) and `node tests/e2e/run.js` (the app in Chrome
  or Edge, 34 checks). Setup and troubleshooting: `flow/SOURCES.md`.

New `sources.js` beside `dossier.html`. No packages, database, vector store,
embedding service or setting in Power Automate: the search runs in the page.

---

## 5.8.0 - 2026-09-29

**Telegram is gone; alerts stay, on the screen.** Sending alerts to a phone
through Telegram (5.6.0, 5.7.0) is removed completely - it cannot work on a
network that blocks `api.telegram.org`, and Resolv should not be knocking on
a door the network has closed. What went:

- `flow/telegram.html`, the page the messages went out through, and every
  call to it. Nothing in Resolv reaches Telegram, or anywhere new, now.
- Setup → Telegram, and what it kept: the bot's token and chat ID are
  deleted from the workspace the first time 5.8.0 opens it, and the note
  this browser kept of what it had sent is cleared.
- In `Resolv.bat`'s program, the two routes that only Telegram used:
  `/presence` (how long since the last key or mouse movement, and whether
  the screen was locked) and `/awake` (keeping the PC from sleeping). It is
  back to exactly what it was in 5.5.0, and rebuilds itself the next time
  `Resolv.bat` runs after Resolv has been quit from its icon.

What stays: **the bell on every record** - at its due time, 15 min or 1 h
before, or a date and time of your own - now going off as a Windows
notification and a note in Resolv; the assistant setting and clearing alerts
(`setAlert`, `clearAlert`); and the assistant knowing Resolv's own README and
CHANGELOG. The everyday reminders are unchanged.

---

## 5.7.0 - 2026-09-29

*(The Telegram part of this release was removed in 5.8.0; the bell stays.)*

**Alerts: only the records you choose.** In 5.6.0 every reminder Resolv
raised could go to your phone. Now nothing alerts you unless you asked it to,
on that one record:

- **A bell on every record** - in its row, next to the timer, and at the top
  of its sheet. Press it and choose when: **at its due time**, **15 min** or
  **1 h before it is due**, or **a date and time of your own** (the only
  choice for a record with no due date). A record with an alert shows the
  bell lit and a 🔔 chip with the time; press it again to change or remove
  it. A due-time alert follows the date if it moves. Set, changed and removed
  are logged on the record, and Undo takes them back.
- **The assistant can do it too.** *"Alert me about D-0101 at 3pm"*, *"ping
  me about D-0102 30 minutes before it's due"* - read at once when the record
  and time are plain, and put to you before it is set. A flow has two new
  actions, `setAlert` and `clearAlert`, and each record in the request
  carries its `alert` (flow/CONTRACT.md).
- **Where it tells you**: on the screen if you are at the PC; on your phone
  through Telegram if you are away (or both, if you choose *to my phone and
  the screen*). One that went off at the PC and was not opened follows you
  to the phone if you walk off within half an hour. Resolv closed at the
  time: up to half a day late it still goes off, saying when it was for;
  older, it is only noted in the log.
- **Telegram buttons now move the alert**: ⏰ 15 min / 1 h sets it again for
  then; 📅 next working day moves the record and its alert together. New
  **/alerts** command lists what is still to come.
- **Everything else is as it was before 5.6.0**: time-due, routine, late-work
  and chase reminders are Windows notifications only, and never go to the
  phone. The Telegram settings that were only about them - quiet hours,
  weekends, what to send, P1s, the hourly limit, the chase button - are gone;
  Setup → Telegram is now the bot, where alerts go, when you count as away,
  and keeping the PC awake (now: while one of your alerts is due within two
  hours).

---

## 5.6.0 - 2026-09-29

*(Telegram was removed again in 5.8.0.)*

**Reminders on your phone, through Telegram - only when you are away.** The
reminders Resolv already raises (a time due today, routines that remind you,
late work, chases, and now scheduled scripts that fail) can go to your phone
through a Telegram bot of your own, with buttons to deal with them from
there. Set it up under **Menu → Setup → Telegram**: paste the token from
@BotFather, press Start in your bot, press **Find it for me** (it fills in
your chat ID), **Send a test message**.

Built not to be one more thing buzzing:

- **Only when you are away** - no keyboard or mouse anywhere on the PC for
  five minutes (you choose), or the screen locked. At the PC the Windows
  notification is enough, so nothing arrives twice. `Resolv.bat` now tells
  the page both (`/presence`); opened without it, Resolv waits three times as
  long, or the browser's idle detection can be allowed.
- **Left without dealing with it** - a reminder for a time today that came
  up while you were at the PC still goes to your phone if you walk away
  before that time. A daily nag you already saw is not repeated.
- **Quiet hours** (19:00-07:30 by default), **weekends and holidays** off,
  several at once as **one message**, at most **6 an hour**, never sent twice
  (not after a reload, not from a second window).
- **Buttons**: ✅ Done (closes the record, logged *Closed from Telegram*),
  ⏰ 15 min / 1 h (reminds you again - on the phone if still away, on the
  screen if back), 📅 move to the next working day, 📨 log a chase. The
  message then says what was done.
- **Commands**: /today, /late, /next, /mute 1h (and /mute off), /help, or a
  few words to search what is open. Only your own chat is answered.
- **Back at the PC**: a line says how many reminders went to your phone.
- **Keep the PC awake** while something is due within two hours, plugged in
  only (`/awake` in `Resolv.bat` resets Windows' idle timer; the screen still
  turns off and closing the lid still sleeps).
- **P1 records** can go to the phone even when you are at the PC, if you
  switch that on.

Nothing reaches the internet from `dossier.html`: every Telegram call goes
through the new `flow/telegram.html`, a page with no records whose content
security policy allows `https://api.telegram.org` and nothing else. Only the
lines of a reminder leave the PC; the token is never sent to the assistant.

**The assistant knows Resolv itself.** It reads Resolv's own README.md and
CHANGELOG.md (beside the app): every question carries the version, the
latest release headlines and the manual's chapters, and a question about
Resolv - *how do I...*, *where is...*, *what does ... do* - carries the
sections that answer it, with a prompt rule to answer those from the manual
only and never invent a setting. *What's new?* and *which version is this?*
are answered at once from the CHANGELOG, flow or no flow. New
`workspace.app` in the request (flow/CONTRACT.md).

---

## 5.5.0 - 2026-09-29

**Lumen: lively icons.** Every icon in the Lumen chat skin now moves, and
moves in a way that says what it does - after the way the animated icon sets
(Lordicon, lucide-animated) handle it: when you point at it or press it, not
all the time.

- **Send** flies up and comes back; it sits up once when there is something
  to send. **Copy** slides its two sheets apart and, pressed, turns into a
  tick that draws itself (answers, code blocks and text cards alike).
  **👍 👎** nod, and pop when pressed. **Retry** turns a full circle
  backwards. **Think harder** fills its star and twinkles. The **clip**
  wiggles.
- The header: the history icon's line slides (and its arrow flips while the
  history is open), the slider knobs cross, the notes rewrite themselves, the
  pen writes, the **✕** turns. In the history, the bin's lid lifts and the
  search glass looks around.
- The four starter cards: the target pulses, the clock's hand goes round, the
  bulb lights up, the ? wiggles.
- Three things move on their own, because they have news: the *New reply*
  arrow, a small twinkle on *Think harder* under the newest answer, and the
  mark over an answer while it is on its way (slowly, on an empty
  conversation).
- A **Lively icons** switch under Motion (shown while Lumen is the skin, on
  by default) stops the movement and keeps the icons; *reduced motion* on the
  PC stops it everywhere, the moving marks included.

They are drawn as lines rather than shipped as GIFs: a GIF's edges are
either fully there or not at all, so they fray on a dark panel; its colour
is fixed, so it cannot follow light, dark or a hover; and it loops whether
anyone is looking or not.

Also: a long conversation redraws about twice as fast in Lumen - the rule
that shows the tools under the newest answer was being checked against
every part of every answer.

The other five skins are unchanged: the icons are only ever put into the
panel while Lumen is the skin, and taken out again when it is not.

---

## 5.4.0 - 2026-09-29

**Lumen: a new look for the assistant, as a preset.** A sixth chat skin,
picked under **◎ → Skin → Lumen** (marked *New* until it has been tried).
Nebula, Aurora, Carbon, Ember and Paper are unchanged - checked by drawing
the same conversation in each with 5.3.0 and 5.4.0 and comparing the
pictures - and stay one click away.

Lumen changes the layout, not just the colours, after the way the chat tools
people use every day have settled:

- **An answer is the page, not a bubble:** full width under a small mark and
  the assistant's name, in Inter at 14px with room between the lines;
  headings, lists, tables and quotes spaced for reading. Your questions are
  soft bubbles on the right.
- **One row of tools under each answer** - copy, thumbs, Retry, Think harder,
  as icons - on the newest answer and the one under the pointer.
- **The composer is one card:** text on top, the clip and a round send button
  under it, attached files inside it. It lights up while you type in it.
- **An empty conversation greets you** by the time of day, with four cards
  to start from.
- **The history drawer** has *New conversation*, a search over titles and
  what was said, and the conversations grouped under Today, Yesterday,
  Previous 7 days and Older. It dims the thread; a click there or `Esc`
  closes it, and picking a conversation closes it too.
- **The header shows the conversation's name** (the one the assistant gave
  it) with the live status under it.
- **Code blocks are dark in both modes;** copy-ready text is a card with its
  kind as a tag; the branch switch is a segmented control; the confirmation,
  the look sheet and the teach sheet are redrawn to match.
- **Light and dark follow the app's mode.**

The animations are the same ones, behind the same switches, and the pixel
set and your own `assets/assistant-logo.png` dress Lumen as they dress the
other skins.

The typeface is Inter 4 (SIL Open Font License), Latin subset, 48 KB,
embedded in `dossier.html` like the Khmer one - no network - and used by
Lumen only. `fonts/Inter-latin.woff2`, `fonts/Inter-OFL.txt`.

---

## 5.3.0 - 2026-09-28

**Saving: faster, and never stuck.** A change could sit on *unsaved* for
forty minutes. Every way that could happen is closed, and a save is a
fraction of what it was.

Why it could stick, and what changed:

- **Every save rewrote every table in the database** - the records and their
  logs, routines, runbooks, every imported incident and every chat message -
  in one transaction, for a change to one record. As the incident history and
  the conversations grew, so did every save. `dbo.LoadWorkspace` now hashes
  each part of the workspace (schema migration 7, `dbo.ShredState`) and
  writes a part again only when it has changed: a status change rewrites the
  record tables and nothing else. The canonical row is still written whole.
- **The page gave up on the database after one minute; SQL keeps going for
  two.** The page then sent the next save while the last was still writing,
  and the two fought over the same tables. The page now waits two and a half
  minutes; the bridge takes saves one at a time; and a save that a newer one
  from the same window has overtaken while it waited is skipped (it has
  nothing the newer one lacks). The bridge logs any save over three seconds.
- **A folder write that never answered held every save behind it** (a sync
  client or a scanner holding `dossier.json`). Folder writes now have thirty
  seconds; past that the write is abandoned - its half-written copy
  discarded, never committed late over a newer one - and tried again.
- **Nothing noticed a save that never came back.** A watchdog now does:
  every few seconds, unsaved work with nothing on its way to save it is
  saved, and a save "on its way" for over three and a half minutes is let go
  of and tried again. A late answer from the abandoned one is ignored.
- **The export, the day's backup and this PC's copy were written inside
  every save** - two indented files and a walk through `backups/`. In
  database mode they now follow the save instead: `dossier.json` within
  eight seconds (the newest state each time; right away when the window is
  hidden), the day's backup at most every five minutes, `backups/` tidied
  once a day, the browser's copy at most every thirty seconds (at once when
  the record count changes). Without a database, `dossier.json` is still the
  save itself and is written first.
- **A question could hold saving with nothing saying so** ("this PC
  remembers more records"). The status line now says *not saved · answer the
  question at the top*, and clicking it shows the question again.
- Changes are saved 0.45 s after the last one (was 0.7 s). A slow save counts
  its seconds (*saving… 6 s*); hovering the status line says how long the
  last save took and how big it was.

To get all of it: update the files, **quit Resolv from the icon by the
clock** (right-click → Quit), and run `Resolv.bat` - it rebuilds the bridge
and brings the database to schema 7 by itself. The first save afterwards
writes everything once; every save after that writes only what changed.

## 5.2.2 - 2026-09-28

- **A window left open says when a newer Resolv is in the folder.** The page
  is read once, when the window opens, but the prompt is read again before
  every question - so after updating the files, an open window answered with
  the new prompt and drew the answers with the old page. That is why emails
  still came through as plain text after 5.2.1: the model wrote the new
  `~~~email` block, and the 5.2.0 page still running did not know it. Now the
  page notes its own size when it starts and, on coming back to the window,
  opening the assistant or asking (at most every two minutes), asks the
  folder again; when the file has changed and carries a different version, a
  toast says so with **Reload now**, which saves first. Only when the app is
  served by Resolv.bat.

## 5.2.1 - 2026-09-28

- **Text cards now appear with the flow as it is built.** The email in the
  chat came through as plain text, starting "email Portal is fixed". The
  model had written the block properly; the flow's *Clean* step, as the
  guide gave it - `replace(replace(trim(...), '```json', ''), '```', '')` -
  takes every ``` out of the answer, not only a fence round the JSON. Code
  blocks survived that only because the app already put a bare `sql` line's
  fence back. Three fixes:
  - the prompt asks for text to copy in a `~~~` block, which Clean leaves
    alone (`~~~email Portal is fixed` … `~~~`);
  - the app recognises a text block whose fence was stripped anyway - a
    lower-case label line such as `email Portal is fixed` after a blank line,
    ending where the fence was (two blank lines), or after an email's sign-off
    - and draws it as a card; conversations already saved are drawn the same
    way;
  - POWER-AUTOMATE.md gives a new Clean expression that takes the JSON from
    its first `{` to its last `}`, so fences inside the answer survive. Worth
    changing (§5 step 5 or §6), not required.

## 5.2.0 - 2026-09-28

**Branches, Retry, text ready to paste, and conversations the assistant names.**

- **✦ Think harder makes a branch, not a copy.** The strong model's answer
  takes the first answer's place in the same conversation, and a row above
  it - *Answers: Normal · ✦ Harder* - switches between the two. Each branch
  keeps its own follow-ups: go back to *Normal* and what you asked after it
  comes back; ask something now and it belongs to the branch on screen. The
  model is asked with the conversation as it stood at that question, never
  with the answer being replaced. Up to six branches an answer.
- **↻ Retry** under every answer from the flow asks the same question again
  with the same model, as another branch (*Retry*, *Retry 2*…). Under an
  answer that failed it is there too, and a successful retry simply replaces
  the failure. A retry that fails puts back the answer you had, and says so.
  The files that went with the question are sent again (kept until the app
  is closed; after that the answer says they were not).
- **Text ready to paste**: an email, a Teams message, a reply to a user, a
  resolution note, a status update comes as a card of ordinary text -
  labelled *Email*, *Message*, *Note*, with a title - and one **Copy** that
  takes exactly that text. An email's subject line sits on its own with its
  own **Subject** copy and is left out of the body. A fence with no language
  whose contents are sentences becomes one of these too; code stays in a
  code panel. The prompt asks for it (```email, ```message, ```note,
  ```text, with an optional title), with one new example.
- **Conversation titles written by the assistant**: its first answer in a
  new conversation carries a short `title` (`workspace.thread.titleWanted`),
  which replaces the question in the list. Until then - and with no flow -
  the list shows the first question tidied (*"can you please tell me what is
  overdue?"* → *What is overdue*). Titles the app sets itself (a record's
  *Diagnose*, the look back) are left alone.
- Flow: new reply key `title`; `workspace.thread.titleWanted`. Nothing
  changes in Power Automate. Prompt 28.9 KB.

## 5.1.1 - 2026-09-28

- Word documents: bullets and numbered steps made with Word's list styles
  (*List Bullet*, *List Number* - what the Styles gallery applies) now come
  through as `-` and `1.`, like lists made with the toolbar buttons. Found by
  uploading a document built on Word's own template through the paperclip.

## 5.1.0 - 2026-09-27

**The assistant reads Word documents, and the pictures inside PDFs and Word
documents.**

- **Word (.docx, .docm, .dotx)** can be attached to a question like a PDF, and
  is read on the PC - nothing is uploaded but the words. It comes through with
  its headings (`#`), bulleted and numbered lists (numbering kept), tables
  (`| cell | cell |`), a link's address after its words, text boxes, charts as
  their title and numbers, SmartArt as its words, then the page header and
  footer, footnotes and margin comments, each labelled. Tracked deletions are
  left out. The page count is the one Word saved.
- **Pictures inside a PDF or a Word document** are taken out - up to twelve a
  document, in order - and handled like a picture attached on its own: with
  `ocr.js` (shipped beside the app) each is described and its words read;
  with a flow whose model sees pictures, up to six go into the image the
  question carries, and any after that are read on the PC instead. The text
  keeps a mark where each sat, so the model reads the step, then what its
  screenshot shows, then the next step. A picture in a table row is described
  just after the table, so the table stays a table.
- Skipped on purpose: icons and bullets (under about 1.1-1.4 cm a side), and a
  logo or watermark that is on most pages of a PDF. Named rather than guessed
  at: Windows metafiles (EMF/WMF), JPEG 2000, fax-coded and JBIG2 pictures.
- The PDF reader now also takes palette-colour pictures (how many
  screenshots are stored inside a PDF), 16-bit pictures and transparency
  (drawn over white, as the page shows it).
- A Word 97-2003 `.doc` is refused with the fix (File → Save As → .docx); a
  `.docx` behind a password says it could not be opened.
- The tray says what became of the pictures ("2 of 3 pictures read",
  "3 pictures go to the model") and shows progress picture by picture.
- Requests: `attachments[].kind` can be `docx`; new `attachments[].pictures`;
  notes `pictures` and `legacy`; `attachmentsText` names a Word document as
  one and says how its pictures are marked. Nothing changes in Power
  Automate.
- *Learn from a BAU document* (Setup → Runbooks) takes a Word document directly, screenshots included.

## 5.0.0 - 2026-09-27

**Nova: a new design, as a fourth look. Studio, Quiet and Classic are
untouched and one switch away.**

Turn it on in *Menu → Appearance → Look → Nova*, from the one-time
invitation that appears a few seconds after opening a linked folder, or by
asking the assistant ("switch to nova"). Choosing it also puts on its own
palette - **Nova** (light) or **Nova Night**, whichever matches the one you
had - and going back to another look puts your old palette back.

- **A page header on every view**: the date, a greeting and a live count of
  the day (open, due today, overdue, in progress) on Day; a line about what
  the view is for everywhere else. On the right, the four things reached for
  most: *Search or jump to* (Ctrl K), light/dark, *Ask AI* and
  *New record*.
- **Navigation that reads**: the sidebar is grouped (Work, Knowledge,
  Assistant), drawn with line icons instead of Unicode glyphs, and each view
  carries a live count - due and overdue on Day (red when anything is late),
  in progress on Board, live records on Register, due this week on Week,
  documents on Library. On a small screen the top bar shows the same icons
  instead of the numbers 1-7.
- **Quick actions on every row**: hover a record (or move to it with the
  keyboard) and ✓ *Mark done* and ✦ *Ask the assistant about this record*
  appear beside the timer. Ask runs **Diagnose** when a flow is set up, and
  asks the built-in assistant otherwise.
- **Cards, not boxes**: white surfaces on a cool canvas with soft layered
  shadows; the day's KPIs with an icon each and today's progress as the one
  card in colour; each group of records as one sheet; board columns, week
  days and library documents as lifted cards; the register as one rounded
  table with a sticky header.
- **Status and priority as soft pills** (a dot and a tint, not a border);
  overdue dates and P1 still stand out.
- **Calmer compose box**: the syntax line (`p1 @System #INC ...`) only shows
  while you are typing in it; its space is kept so nothing jumps.
- **Floating sheets**: the record drawer, dialogs and the command palette
  are rounded and float over a blurred page; the palette has a search icon
  and a footer with its keys. Toasts are dark pills with their action
  button inside.
- **Built for the assistant dock**: with the assistant open the sidebar
  folds to icons below 1240px, the header drops to icon buttons, and the
  status line stays on one line.
- **Every palette works with it**: its hairlines, tints and the one gradient
  are all derived from the palette's own ink and accent.
- When the fonts are left on *automatic*, Nova asks for Segoe UI Variable
  (Windows 11) or Inter, and falls back to the usual choice.

Checked: every view of Studio, Quiet and Classic, light and dark, lays out
and renders exactly as in 4.9.0 (position, size and style of every
element compared). The assistant's `ui` setting accepts `nova`, and now
applies a look straight away.

## 4.9.0 - 2026-09-25

**The assistant understands what you are doing, your world, and the whole
conversation.**

- **What is on your screen goes with every question** (`workspace.focus`):
  the open record - or the one closed in the last twenty minutes - in full,
  with notes, steps and work log; what is selected; a timer running; the
  view; and today's activity, newest first. "This", "it", "the ticket" mean
  the open record.
- **About my work** (Setup): one page of plain facts about your team,
  systems, servers, people and words, sent with every question
  (`workspace.brief`, up to 4,000 characters). **Draft it from my records**
  writes the first version (`[brief]` mode, strong model when two are set
  up) from your systems, requesters, runbooks, note titles, recurring
  acronyms and recent records, marking guesses and ending with three
  questions. New action `addToBrief` adds one line under its heading after
  you say yes; the daily look back can suggest them.
- **Conversation memory**: eight messages travel instead of six, and from
  the second exchange on the model writes a short running summary with each
  reply (`thread`), kept with the conversation and handed back as
  `workspace.thread.summary` - never shown as the answer.
- **Follow-ups stay with the assistant**: in the middle of a conversation
  with it, "ok what next", "more detail", "and that one?" are no longer
  answered by the instant local answers as though they were about your
  workload.
- Prompt: the three blocks, the reply's `thread` key, `[brief]` mode,
  `addToBrief` in the look back, one example (27.6 KB). CONTRACT.md
  documents them. Nothing changes in Power Automate.

## 4.8.0 - 2026-09-25

**Dossier is now Resolv.**

- **Everything you see says Resolv**: the title and the header, the assistant
  ("Resolv Assistant", "Ask Resolv..."), every message and hint, the build
  line, Windows notifications, the tray icon's menu, tooltip and messages
  ("Open Resolv", "Quit Resolv"), the log window, the prompt ("the assistant
  inside Resolv"), the flow relay, and the docs.
- **A new mark**: an R in the same glossy blue as the D, its stem built from
  the D's squares - `logo.png`, and a `favicon.ico` with 16, 24, 32, 48 and
  256 px sizes, so the browser tab and the tray icon are sharp. Drawn as SVG
  (`art/resolv-logo.svg`, `art/resolv-icon.svg`); the D is kept in `art/`.
- **Resolv.bat starts it.** `Dossier.bat` is still there and passes straight
  through, so shortcuts keep working. The first start after updating rebuilds
  the tray program (it says so); quit the running one from its icon first.
- **Nothing that holds your work was renamed**: `dossier.html`, `dossier.json`,
  `.dossier-store.json`, `dossier-prompt.txt`, the SQL Server database
  `Dossier`, the Windows start-up entry and the runner's scheduled task keep
  their names, so no data moves and nothing is registered twice. The Power
  Automate flow is untouched.
- A language file written before the rename still says "Dossier" in places;
  the app shows "Resolv" there anyway. "what is Resolv" is understood by the
  built-in assistant (and "what was resolved today" still means your closed
  records).

## 4.7.0 - 2026-09-25

**Answers that explain, not just state.**

The prompt asked for "one to three sentences", "a one-line verdict", "two
sentences to a paragraph" - and the answers read like status lines. It now
asks for what a good senior colleague does:

- **Depth matched to the question.** A count, a greeting or a done action is
  still one or two friendly sentences (with the one detail that helps). A
  why, a how, a problem, a request for advice gets a real answer: the answer
  or read of the situation first, then WHY - what is happening underneath and
  what usually causes it - then numbered steps with what each achieves, then
  what to watch out for, then the one question that moves things on.
- **Explained like a teacher**: plain words before the technical term, a
  concrete example when an idea is abstract, their own systems, records and
  values throughout; honest about what is uncertain and what would confirm it.
- **Readable**: short paragraphs, headings only for answers with separate
  parts, bullets for causes, a table for "what each result means", bold for
  the one thing not to miss; natural, warm phrasing.
- Troubleshooting explains the mechanism, not just the name of the cause.
- The examples show it: a full explanation (month-end deadlocks), the portal
  login case with why the cache breaks logins and a result table, and the
  quick answers with their one useful detail. Prompt 20.0 -> 23.9 KB.

Nothing is appended after the content and nothing tells the model to
disregard anything, so it stays clear of the content filter that 4.6.1 ran
into. `flow/prompt.txt` is still the one place to change it.

## 4.6.4 - 2026-09-25

**The fast model answering the blank picture is caught before you see it.**

Describing the placeholder in the prompt (4.6.3) was not enough for the mini
model, and ordering it not to (4.6.1) is what the content filter blocked. So
the prompt is left exactly as it is - it passes the filter - and the answer
is checked instead, before it is shown, whenever nothing was attached and
the question is not itself about pictures:

- an answer about a blank / white / empty image, or asking you to attach
  it again, around a real answer: those sentences are taken out;
- an answer that is only about the picture: the question is asked once
  more, of the strong model when *Two models* is on (it reads past the
  placeholder), and that answer is shown instead;
- a question back ("could you attach it again?") and choice buttons about
  the picture are dropped.

Checked against both answers from the screenshots, a mixed answer, one
model only, questions that are about pictures, a real attached picture, and
answers that only look alike ("send the reminder again", "the white page is
the error page"), which are left alone. The same clean-up applies to the
daily look back, "How was it fixed?", pasted messages and checks.

## 4.6.3 - 2026-09-25

**Every question failed with "Prompt was filtered" - fixed.**

4.6.1 appended a block to the end of every question without a picture: "===
NO PICTURE THIS TIME === ... Do not look at it, describe it, mention it ...
answer only what they said". Orders tacked on after the content, telling the
model to disregard one of its inputs, are the shape of a prompt-injection
attack, and Microsoft's content filter refused every such prompt before the
model read it: `InputContentFiltered`, "Prompt was filtered. [105]". The
flow's Condition then failed and its Fallback answered.

- Nothing is appended any more. When nothing is attached, **WHAT THEY
  ATTACHED** says so in plain words - no file, no picture, the image input
  holds only a blank placeholder - which is where the model looks for
  attachments, and which keeps the mini model from describing the blank
  square.
- **When the flow's safety net answers, Dossier asks once more, lean** - the
  instructions and the question, without notes, lessons, runbooks, profiles,
  past fixes or records. If that gets through, the answer is shown with a
  line saying what it was answered without, and why (a note or lesson that
  reads like orders to the AI is the usual trigger). If it fails too, the
  answer says it is the flow or the question, and what to look at.
- `flow/POWER-AUTOMATE.md` 4e: the `InputContentFiltered` row, and an
  optional Fallback body that passes the failing action's error to Dossier.

## 4.6.2 - 2026-09-25

- When the flow's **Fallback** answers (*I could not work that one out.*),
  Dossier now says what that means - an action in the flow failed, so the
  model's answer never came back - and where to read the error, instead of
  showing it as though the model had said it.
- `flow/POWER-AUTOMATE.md` 4e: how to find the failing action behind
  "Deep? - ActionFailed. An action failed. No dependent actions succeeded",
  and the fix for each usual cause - above all a **Set variable copied from
  the True branch into the False one**, which keeps reading the deep prompt
  that never runs on an ordinary question.

## 4.6.1 - 2026-09-25

**The fast model stops talking about a blank picture, and Setup shows how
fast each model really is on your flow.**

- With nothing attached, the flow's picture input is handed one white pixel,
  because it cannot be left empty. The prompt said to ignore it, in the
  middle of twenty kilobytes of instructions; a strong model did, a mini
  model answered the image instead - "that is a blank white square, try
  attaching it again" to *what is love?*. The prompt now ENDS, right before
  the image, with a short *NO PICTURE THIS TIME* section when there is no
  picture, and never when there is one.
- **Setup -> Models in your flow** shows the typical time of each model over
  its last twenty plain chat answers. For short answers the two are usually
  close: most of the three or four seconds is Power Automate itself (the run,
  the actions, the AI Builder call) and reading the prompt, not the model
  writing. When they are close it says so - the strong model then costs
  credits rather than time, and *every chat question* can go to it.

## 4.6.0 - 2026-09-25

**Faster to use: instant answers, one-press record actions, pasted messages
filled in, and a strong model for the hard jobs.**

Reload the page. Everything except the two-model split works with the flow
you already have; the split needs a Condition and a second prompt in Power
Automate, set out step by step in `flow/POWER-AUTOMATE.md` 4e.

- **Simple questions answered on this PC.** *What's overdue*, *what next*,
  *closed today*, *who is holding what*, counts - the local assistant has
  always known these; with a flow set up they now come from it again, in
  milliseconds, with **Ask the assistant instead** under each. Problems,
  requests to write or explain, longer questions and replies to the
  assistant's own question still go to the flow. Setup -> *Simple questions*.
- **Ask the assistant, on every record**: **Diagnose**, **Reply to <name>**,
  **Write the fix note**, **Make a runbook**. The record goes whole - notes
  and log included whatever *Include notes* is set to, because it is the
  question - and each answer gets a conversation of its own.
- **Paste a message: the assistant fills it in too** (`[intake]` mode): a real
  title, system, type, priority and requester, marked in violet, never over
  anything you changed; and two to four **First steps** that become the
  record's checklist. Setup -> *Pasted messages*.
- **Two models.** Every request now carries `mode` and `tier` ("fast" /
  "deep") at the top, the short picture-setup request included. Setup ->
  *Models in your flow* -> *Two* sends the daily look back, BAU study,
  runbook interviews and Diagnose (each switchable, plus pasted messages and
  all chat) as `deep`, and adds **Think harder** under every answer. The
  strong model is waited for up to 110 s (Power Automate stops at 120), and
  the time under an answer says *strong model*.
- `flow/POWER-AUTOMATE.md` 4e: making the second prompt, the Condition, the
  variable, the one edit to Clean, the Fallback's run-after, switching
  Dossier over, checking it, what goes wrong, what it costs. The short
  Parse JSON schema gains `mode` and `tier`.
- Prompt: the `[intake]` mode (20.0 KB).

## 4.5.0 - 2026-09-25

**The assistant learns from your corrections, from how you fix things, and
brings your past fixes back when the same problem returns.**

Nothing changes in Power Automate - the prompt is `flow/prompt.txt` on this
PC. Reload the page.

- **👍 / 👎 under every answer from the assistant.** A thumb down asks for one
  line: what it should have said. That line is kept as a `[correction]`
  lesson - the next question about the same thing carries it, and the prompt
  treats it as the truth - and as a **check**. Press either thumb again to
  take the rating back, with what it left behind.
- **Checks** (Setup -> What I have learned about you -> Checks): every
  corrected question, asked again with **Run checks**, and judged by the
  assistant against your line - PASS or FAIL and why. A correction that has
  stopped working, or a prompt edit that broke one, shows up here.
- **"How was it fixed?"** comes up when you close a record by hand: one line,
  already drafted from your notes and then by the assistant, which reads the
  record (it never overwrites what you have started typing). Enter keeps it,
  Esc skips, two minutes untouched and it goes; closing several at once asks
  nothing. The line is on the record sheet as **How it was fixed**, counts as
  a note for *closed with no note*, and can be switched off - or kept without
  the assistant's suggestion - in Setup.
- **Past fixes with every question.** The three closed records most like it,
  and how each was fixed, go with the question as `workspace.pastFixes`; the
  assistant leads with one when it is plainly the same problem - "This looks
  like D-0142 on 10 Sep, that was the SSO cache" - and gives the check that
  confirms it. The matching folds support synonyms together (log in / sign-in
  / authentication / SSO; 503 / down / outage; timeout / hang / slow) and
  needs the record's title to share something with the question, so a word
  that only appears in somebody's notes is not taken for a precedent.
- **The daily look back** now reads the thumbs (every thumb down with its
  correction, the questions under the thumbs up) and each closed record's
  own "how it was fixed" line, and is told to turn several corrections with
  one cause into one lesson.
- The prompt gains two modes, `[fix]` and `[check]`, a `[correction]` rule, a
  "last time" rule and one example: 17.0 KB -> 19.2 KB. `flow/CONTRACT.md`
  documents `pastFixes`, `records[].fixed` and the new modes.

## 4.4.2 - 2026-09-25

**The Ask panel stays where it is when you open the conversation list.**

Pressing the list button in the panel's top-left pushed everything in the
panel to the right - the header, the answers, the box you type in - and
the close button went off the edge of the screen. The panel was borrowing
the look of the filter bar under the capture box, because both used the
class name `rail`. The panel's now has a name of its own, and the list
slides in over the thread as it was meant to.

## 4.4.1 - 2026-09-25

**Saving is real time again: no button to press, and no change left behind.**

Closing tasks could leave the dot by the folder name yellow until something
else happened - opening the Workspace panel to press *Check the bridge*, for
instance, which is why that looked like the cure. It was not doing anything;
the next save was. Two things were wrong underneath:

- **A change made while a save was on its way was dropped.** Saves with SQL
  Server take a second or two (the database write, then the `dossier.json`
  export, which Windows scans). Close a second task inside that window and
  its save was skipped - and when the first save landed the dot went
  **green over a change that had never been written**. Now a change made
  during a save is written by another save that starts the moment the first
  lands, and the dot stays yellow until the last one is in.
- **A save that failed was never tried again.** A busy or restarting bridge,
  a deadlock, the database waking - the dot went yellow and stayed there
  until you changed something else. Now it tries again by itself after 2 s,
  4 s, 8 s ... up to a minute, and on the first try after you come back to
  the window. The status bar says *not saved yet · trying again in 4s*;
  clicking it tries now. You get one message when it starts failing and one
  when everything is written, not one per try.
- **A restarted bridge is found again.** Quitting the bridge and starting it
  again gives it a new key, and every save from an open page was refused
  until you reloaded. The page now asks the bridge again and carries on.
- **A save that hangs gives up after a minute** and is tried again, instead
  of sitting on *saving...* for ever.
- **Green when SQL Server has it.** The dot turns green as soon as the
  database confirms the write; the `dossier.json` export follows a moment
  later. If only the export fails, your records are already safe in SQL
  Server and the next save writes it.
- The dot pulses while a save is on its way, so *saving* and *not saved*
  no longer look the same.

## 4.4.0 - 2026-09-25

**The model looks at pictures now, instead of reading a description of them.**

Until now a picture never reached the model as a picture. It was redrawn at
up to 4000 pixels on this PC, run through the text recogniser, and turned
into a written description - layout, colours, every word and where it sat, a
map in letters - and that is what the model got. It took several seconds per
picture before the question was even sent, and it is why every answer about
a picture was an answer about its text.

- **Setup -> Ask through Power Automate -> Your flow -> "Reads the prompt and
  SEES the picture".** With the flow set up as POWER-AUTOMATE.md s4 now says
  (a `picture` input beside `prompt`, and a five-line schema), a picture is
  not read on the PC at all - attaching one takes a fraction of a second -
  and the model looks at it.
- **Several pictures go as one**, side by side, each under its number and
  file name, so the model sees all of them and can talk about "picture 2".
  Before, only the first one was ever visible.
- **The prompt talks about pictures like a person**: what it is and what
  stands out first, then the answer to the question; text quoted only where
  it matters (an error message, a reference); a problem gets its usual cause
  and one next check. With only a description to go on, it still speaks in
  plain words and never recites positions, colours or the letter map.
- **The request is about half the size** in that setup: only the prompt and
  the picture, not everything a second time beside them.
- **How long Power Automate took is shown under every answer**, so "slow"
  can be pinned on the flow and model rather than guessed at.
- Without the picture input, nothing changes: pictures are described on the
  PC as before.

---

## 4.3.1 - 2026-09-24

**Attachments reached the model as "None." - fixed.** 4.3.0 read the prompt
file at the start of every question, and that read waits a moment. The chat
empties the attachment tray the moment the question starts waiting, so the
request was built after the files were gone: every PDF and picture arrived
as nothing, and the answer was "I can't see any file". The request is now
built before anything is awaited, and the files go with the second look
(needRecords) too - they had been missing from that one for longer.

- **"hi", "hello", "thanks", "ok", សួស្តី, អរគុណ are answered at once, by
  Dossier**, with no call to Power Automate - they were taking seven seconds.
  A greeting says how many records are overdue. Anything more than the
  greeting alone ("hi, what's overdue?") still goes to the assistant.
- **The list of actions in the prompt is a third shorter**: one line per
  action instead of the JSON, with the full description kept for the
  actions whose details decide whether a reply is right. The filled-in
  prompt for the sample request went from 41.5 KB to 36 KB; the prompt
  explains the notation in one line.

---

## 4.3.0 - 2026-09-24

**The prompt is a file. Power Automate no longer holds it.**

Changing how the assistant behaved meant opening the flow, editing the
prompt action, and saving - every time. Now the instructions are
`flow/prompt.txt`. Before every question Dossier reads it, fills in its nine
places (`{message}`, `{today}`, `{weekday}`, `{calendar}`, `{workspace}`,
`{actions}`, `{history}`, `{memory}`, `{attached}`) and sends the finished
text as one field, `prompt`.

**In Power Automate, one last change:** clear the prompt action's text, give
it one input, `prompt`, set to `body('Parse_JSON')?['prompt']`, and save.
After that it is never opened again for a prompt change.

- Where the text comes from, first found wins: `dossier-prompt.txt` in your
  records folder (your own version; updates never touch it), then
  `flow/prompt.txt`, then a copy inside `flow.js` for a page opened straight
  from the folder.
- Read fresh for every question: save the file, ask, and that answer already
  uses it.
- A file without `{message}` is passed over, and Setup says why. Setup shows
  which file is in use, with **Read it again** and **Copy the template**;
  **Preview the request** shows the filled-in prompt the model reads.
- Filled in one pass, so a message containing the letters `{workspace}`
  stays as those letters.
- Your notes go once, in `{memory}` - no longer again inside the workspace.
- Every older field still travels: a flow with nine inputs keeps working.
- `flow/check-prompt.js` now checks `flow/prompt.txt`, and that the copy in
  `flow.js` matches it (`python flow/embed-prompt.py` refreshes it).
- The prompt now tells the model about `workspace.memoryIndex` and `recall`
  for notes a question did not reach.
- Protocol 1.2.

---

## 4.2.0 - 2026-09-24

### Your work can no longer be emptied by opening a database

This is what lost work. Opening a workspace against an **empty** database -
a fresh `init`, a LocalDB instance that had been recreated - started an
empty workspace and saved it: into the database, **and out over
`dossier.json`**, in the same save. The day's backup was rewritten on every
save, so it went too. And the **Restore** buttons on backups compared the
dialog's answer - `{ choice: 0 }` - with the number 0, so they asked their
question and then did nothing, every time since they were added.

- An empty database is filled **from** `dossier.json`, never the other way
  round; if that file is empty too, from the newest backup with records in
  it, after asking.
- Whichever copy is newer wins on open. Edits made while the database was off
  are brought in, not overwritten.
- A save that would leave no records where there were some is refused, with
  a button for "I really did delete them". One that would more than halve ten
  or more asks first, with both numbers - in the page, and again in the
  bridge, which answers 409.
- **Database history**: the bridge keeps the workspace it replaces,
  compressed, in `dbo.WorkspaceHistory` (migration 6) - before every restore,
  import and shrinking save, and every ten minutes. Menu -> Workspace ->
  Database history lists those and every push ever made, and restores or
  downloads any of them. **If your records went missing before this update,
  look there first**: every file you ever pushed is in that list.
- A day's backup is never replaced by a smaller one. A shrinking save and an
  unreadable `dossier.json` are copied into `backups/` first.
- Both Restore buttons work.
- One database, one folder: `.dossier-store.json` binds a folder to the
  database with the workspace's id, so a second folder cannot open or
  overwrite the first one's records.
- Import merges newest-wins, and brings runbooks, notes, profiles,
  conversations and incidents along.
- `dossier-sql.bat push` refuses a database with records in it unless
  `--replace`, and keeps what was there first. With no argument it only
  checks.

### One double-click, no windows

**`Dossier.bat`**, at the top of the clone. It builds Dossier as a Windows
program with no console, starts it, and closes. Dossier is then an **icon by
the clock**: Open Dossier, Show log, Start with Windows, Workspace folder...,
Quit.

- It **creates and migrates the database itself** at every start - no `init`.
  The page opens immediately and waits through "Starting the database..."
  rather than deciding there is none.
- It **starts the script runner hidden** and stops it on Quit.
- **Start with Windows** is the per-user Run key: no console window at login.
  The 4.1 Startup-folder `.bat` is removed and replaced automatically.
- Only ever one copy; a second double-click opens the page.
- No LocalDB? It still serves the page, and the icon says why there is no
  database.
- `dossier-bridge.bat` and `dossier-serve.bat` pass through to it.

### Notes, Telegram-style

The long boxes - notes, the intake message, what you teach the assistant,
system facts and quirks, runbook steps and escalation - are formatted
editors. Select text for a bar: bold, italic, underline, strike, code, code
block, quote, spoiler, link, lists. Ctrl+B/I/U, Ctrl+Shift+X/M/P, Ctrl+K on a
selection; or type the marks - `**`, `_`, `__`, `~~`, `||`, backticks,
```` ``` ````, `> `, `- `, `1. `. Stored as Markdown in the same field, so
Notepad, the assistant and an older Dossier all still read it.

### A faster flow

- **The prompt is 15 KB, not 40.** About six thousand fewer tokens read
  before every answer. Same nine inputs, same Parse JSON - paste it and
  nothing else changes. `flow/check-prompt.js` runs every example in it
  through Dossier's own validator.
- **Pictures go at the size the model reads.** GPT-4o-class models scale
  every image to 768 pixels on the short side before looking; anything
  bigger was carried through the flow for nothing. A 1920x1080 screenshot now
  goes as 1365x768. The words are still read on the PC from the original.
- **A picture the app has read travels once**, as `picture`, not also in
  `attachments[].data`.
- POWER-AUTOMATE.md s4d: what to change in the flow for the rest - a fast
  model, `ocr.js` beside the app so the per-line loops never run, the probe
  answered first.

### It learns

- **Lessons** about you - how you like answers, how you work, who asks for
  what - travel with every question (`workspace.lessons`) and are written by
  the new `learn` action. Setup -> What I have learned about you.
- **The daily look back** at noon: the morning's closed records and how they
  were resolved, raised records and by whom, the conversations, and answers
  marked "not what I meant" go to the flow; lessons, notes and draft runbooks
  come back and are kept, reported in a conversation called "What I learned".
  Anything touching a profile or a record waits as a button.
- **Runbooks that teach back**: "Interview me" on a runbook, and "Learn from
  a BAU document..." in the library.
- **It reasons instead of reciting**: the prompt has it explain your case and
  give the one next check with your values, ask you for what a guideline
  leaves out, and keep the answer.
- The confirmation for a runbook or profile change says what it is, instead
  of "saveProfile".

---

## 4.1.1 - 2026-09-18

**`startup` kept a quarter of the folder you gave it.**

```
dossier-bridge.bat startup C:\Users\me\OneDrive - AIA Group Ltd\Helpers\Dossier
```

installed `C:\Users\me\OneDrive`. `%2` in a `.bat` stops at the first space,
and on a work PC the folder is *always* something like `OneDrive - Contoso
Ltd`. The truncated path exists, so nothing complained - it said "Dossier will
start at every login" and printed the wrong folder in the line above, small
enough to read past.

- **`%*` instead of `%2`**, so the whole path arrives whether it was quoted or
  not, and `startup` prints the folder it resolved to
- **`dossier-sql.bat push` and `pull` had the same bug** in their file
  argument. Same fix
- `scripts/check-bat.py` is in the repository now, for the five things that
  have actually gone wrong in a `.bat`: an argument used as a path, a redirect
  on an `if` line - cmd performs it whether the condition holds or not - LF
  line endings, a byte over 7 bits, a call to PowerShell. It catches this bug
  on the version that shipped, and it caught one of its own while being
  written

**`startup` now also starts it.** It scheduled the bridge for a login that was
hours away and left nothing listening, so the address it told you to bookmark
answered *ERR_CONNECTION_REFUSED* the moment you tried it. It starts one now
as well, unless something is already on 5500.

**It remembers the folder.** Tell it once - `dossier-bridge.bat "D:\Work\
Dossier"` - and it keeps that beside the `.exe`, so from the second run on it
is a file you double-click. Pass a folder any time to change it. It will not
remember the clone, which is the fallback rather than a choice anybody made.

**A window that fails no longer disappears with the reason in it.** Double-
clicked, `dossier-bridge.bat` closed instantly on any error - the database not
being ready, the folder being the clone - taking the explanation with it. It
waits now, except when started at login, where a window waiting for a keypress
nobody is there to press is worse.

---

## 4.1.0 - 2026-09-18

**One window.**

You were starting two: `dossier-serve.bat`, because Chrome and Edge refuse
notifications to a page opened from `file://`, and `dossier-bridge.bat`,
because a browser has no SQL client. The bridge was already an HTTP server on
`127.0.0.1`. It hands out the page now, and the other window is gone.

```
scripts\dossier-bridge.bat          then open http://127.0.0.1:5500/dossier.html
```

It opens that address for you the first time it runs. Bookmark it.

- **The address stays the same between runs.** The bridge used to take
  whatever port was free, which was fine for an API the page discovers
  through `.bridge.json` and no good at all for the page itself: a browser
  keeps your workspace folder handle per origin, and the port is part of the
  origin, so a port that wanders means picking your folder again every
  morning. It asks for `5500` now - the port `dossier-serve.bat` used, so
  anyone coming from that keeps their handle and notices nothing - then the
  next nine, then whatever is free, saying which and why
- **The page and the API are on one origin**, which retires the CORS
  preflight and the private-network check with it. Both are still answered,
  because opening `dossier.html` from the folder still works
- **Start it at login:** `dossier-bridge.bat startup "D:\Work\Dossier"`, and
  `startup off` to undo. One `.bat` in the Startup folder - no service, no
  scheduled task, no administrator, no PowerShell. It runs minimised and
  opens no browser; your bookmark does that

### What serving the page does not open

The token still guards every route that touches the database. What is open is
`GET` and `HEAD` of the folder `dossier.html` sits in - your clone - and only
the file types an application is made of: `.html`, `.js`, `.css`, fonts,
images. **`.json` is not on that list**, so a `dossier.json`, a `.bridge.json`
or a backup cannot be served even to somebody who kept their workspace inside
the clone. Nor can anything whose name begins with a dot, nor `..`, nor
`backups\` or `tasks\`.

`dossier-serve.bat` is still there for the page without a database, and says
at the top that you want one window or the other rather than both. It also
looks one folder up for `dossier.html` now, which is where it is in a clone.

---

## 4.0.3 - 2026-09-18

**`Could not find stored procedure 'dbo.LoadWorkspace'`.**

In 4.0.0 the loader moved out of `push.sql` and into `sql/load-proc.sql`, so
that the bridge and the file loader would run the same code. `CREATE
PROCEDURE` has to be the first statement in its batch, which is a good reason
to keep it in its own file - and not a reason to forget the line that runs
it. I forgot the line that runs it.

So the database had every table and no loader, and the bridge answered every
save with that error. Nine of them, in the screenshot that found it.

- `dossier-sql.bat init` and `push` both run `load-proc.sql` now
- **The bridge checks the loader is there before it binds a port.** Finding
  out at the first save costs a person their afternoon; finding out at
  startup costs one line
- `sql/check-wiring.py` is in the repository: every `.sql` file must be run
  by the batch, and every file the batch runs must exist. A file nothing
  executes looks exactly like a file that works

### If your ChatMessage rows look like `áž"áž¶áž"`

That is a file push from before the bridge: UTF-8 bytes read back as
Windows-1252. The bridge does not have that problem - it passes text to SQL
Server as `nvarchar` with no encoding round trip at all - and because a save
replaces every table, **the first successful save through the bridge will
correct all of it**.

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
