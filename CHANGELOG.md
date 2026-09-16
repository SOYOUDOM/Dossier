# Changelog

The version shown at the right-hand end of the status bar. Click it to copy
the full build line — version, build date, flow protocol and what your copy
holds — which is what to paste into a bug report.

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
