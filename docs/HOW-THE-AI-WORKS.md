# How KalKech's assistant works — and how to build one like it

*A guide for everyone: the person who uses KalKech, a colleague who wants to
understand it, and anyone who wants to build a new AI assistant the same
way. You do not need to know how to program to read Parts 1 to 3.*

| Part | What it explains | Who it is for |
|---|---|---|
| [1. The big picture](#part-1--the-big-picture) | The whole idea on one page | Everyone — start here |
| [2. Follow one question](#part-2--follow-one-question-step-by-step) | The eight steps, one by one, with a real example | Everyone |
| [3. How it learns](#part-3--how-it-learns) | Where "learning" really happens | Everyone |
| [4. Fast and steady](#part-4--keeping-it-fast-and-steady) | Why it stays quick and does not break | Everyone, and builders |
| [5. Build your own](#part-5--a-blueprint-for-your-own-ai-assistant) | A reusable plan and checklist for a new AI bot | Builders |
| [6. Words](#part-6--words-used-in-this-guide) | Every technical word, in plain English | Anyone who meets a new word |
| [7. Where the code is](#part-7--where-each-part-lives) | Which file does what | Builders |

There is a picture version of this guide, [how-the-ai-works.html](how-the-ai-works.html).
Open it in any browser; it needs no internet connection.

---

## Part 1 — The big picture

### The AI model is a brilliant new colleague — on their first day, every day

The AI model (the "large language model" behind the assistant) is like a very
clever colleague who has read a huge amount about the world, but:

1. **knows nothing about *your* work** — not your records, your systems, your
   runbooks or your company's standards;
2. **forgets everything after each question** — every question is their first
   day again;
3. **sometimes says wrong things with confidence** — when they do not know, they
   may fill the gap with something that *sounds* right.

You cannot fix these three things inside the model. So KalKech does not try to.
Instead, KalKech acts like a **good team lead** working with that colleague:

- before each question, it **prepares a small folder** with exactly the papers
  the question needs — no more, no less;
- when the answer comes back, it **checks the work** before you see it;
- it **keeps a notebook** of what it learns about you and your work, and puts
  the right pages into the next folder.

That is the whole design. Everything else in this guide is detail.

### The journey of a question, in eight steps

```
   YOU ask a question
          │
          ▼
 ┌──────────────────────────┐  yes  ┌───────────────────────────────────┐
 │ 1. ANSWER HERE?          │──────►│ answered at once, on your PC      │
 │   can KalKech answer it   │       │ ("hi", "what's overdue?",         │
 │   by itself?             │       │  "what's new?") — no AI, no wait  │
 └────────────┬─────────────┘       └───────────────────────────────────┘
              │ no
              ▼
 ┌──────────────────────────┐   only what this question needs: the best
 │ 2. GATHER                │   records, notes, runbooks, past fixes, and
 │   the right information  │   the passages of your documents that match
 └────────────┬─────────────┘
              ▼
 ┌──────────────────────────┐   fill in the blanks of one text file, the
 │ 3. PACK                  │   prompt: the rules, examples, your question
 │   one message (prompt)   │   and what was gathered
 └────────────┬─────────────┘
              ▼
 ┌──────────────────────────┐   through the one door that may use the
 │ 4. SEND                  │   network, to your own Power Automate flow
 │   through one door       │
 └────────────┬─────────────┘
              ▼
 ┌──────────────────────────┐   the AI model reads it all and writes a
 │ 5. THINK                 │   reply in a fixed shape (JSON): an answer,
 │   the AI model           │   its sources, actions it would like to take
 └────────────┬─────────────┘
              ▼
 ┌──────────────────────────┐   right shape? only allowed actions? is every
 │ 6. CHECK                 │   quote really in the document, and every
 │   before you see it      │   figure in a passage it cites?
 └────────────┬─────────────┘
              ▼
 ┌──────────────────────────┐   the answer, with Source, Evidence and
 │ 7. SHOW, AND ASK         │   Confidence under it; any change to your
 │   before any change      │   records waits for your "yes"
 └────────────┬─────────────┘
              ▼
 ┌──────────────────────────┐   thumbs up/down, lessons, notes, "how was it
 │ 8. LEARN                 │   fixed?", the daily look back — kept in your
 │   for next time          │   workspace, sent with the next question
 └────────────┬─────────────┘
              │
              └────────► the next question starts at step 1 again,
                         with a better notebook
```

### Five promises the design keeps

These are the rules every part of KalKech's assistant is built around. If you
build your own assistant, keep them too (Part 5).

| Promise | What it means | How KalKech keeps it |
|---|---|---|
| **Your data stays yours** | Nothing leaves the PC except what a question (or the daily look back) needs, and only to *your own* flow | The app page cannot reach the internet at all; one small page, the *relay*, can talk to exactly one address — yours |
| **It never changes anything without you** | The AI can only *suggest* a change | Every change is shown to you and waits for your yes, one at a time |
| **It never invents your policy** | An answer about a document must come from the document | Quotes and figures are checked against the passages; a line with a figure the passages do not state is taken out |
| **It stays fast** | Small questions, quick answers | Easy questions are answered on the PC; only the relevant data travels; a fast model for chat |
| **It shows its work** | You can see what it used and why | Source, Evidence and Confidence under answers; a log of every search; a preview of the exact bytes sent |

---

## Part 2 — Follow one question, step by step

We will follow one real question from start to finish. It was typed with a
spelling mistake, exactly like this:

> **"what is the stardard password should be?"**

The workspace has a 17-page password standard (a PDF) in **Library → Sources**,
among the other documents kept there.

Nothing in the steps below is about passwords. A question about how long logs
are kept, how fast a patch must go in or what a P2 target is goes through the
very same steps, and every question searches **all** the active documents in
Sources, not one of them.

### Step 1 — Can KalKech answer it by itself?

Many questions do not need an AI at all. KalKech checks those first, on your PC,
in a few milliseconds:

| Question | Answered by | Why it stays on the PC |
|---|---|---|
| "hi", "thanks", "ok" | a greeting | Sending "hi" through the AI used to cost seven seconds |
| "what's overdue?", "what should I do next?", "how many did I close today?" | counting your own records | The PC can count exactly and instantly; an AI can only count what it was sent |
| "alert me about D-0101 at 3pm" | the alert reader | Plain enough to read without an AI; still asks you before it sets it |
| "what's new?", "which version is this?" | KalKech's own README and CHANGELOG | KalKech knows its own manual |
| "which source supports this answer?", "why was it taken out?" | what the last answer carried | The facts are already on the PC |
| "I named you Elle", "use your own name" | the name reader | A short aside like that is just what a small model gets wrong (it looked at the blank picture instead) |

The counting answers and the "what's new" answers carry a button, **Ask the
assistant instead**, in case you wanted the AI after all. With no flow set up
at all, the *local assistant*
(`chat.js`) answers about forty kinds of questions about your records, and
questions about your documents are answered with the passages themselves.

**Our example:** the question is about a standard, so it goes on to step 2.

### Step 2 — Gather the right information

The AI knows nothing about your work, so something must go with the question.
But **the model reads every word it is sent before it starts to answer**. Send
too much and every answer is slow; send the wrong things and the answer is
wrong. So KalKech *chooses*, on your PC, what this question needs.

| What | Where it comes from | How much goes with one question |
|---|---|---|
| Your question and today's date | you, and the calendar | all of it, plus tomorrow, the next working day and holidays — dates are where AI most often goes wrong |
| Records | `dossier.json` | the **60** that best match the question — plus **totals of all of them**, so "how many?" is still counted over everything |
| Notes you taught it | the `remember` action | the **10** that match best, in full; the rest by title only |
| Lessons about you | thumbs down, the daily look back | the **30** newest, plus the corrections that match this question |
| Runbooks | the BAU library | the **2 or 3** that match, in full; the rest as a short index |
| Scripts | **Menu → Scripts** (the `scripts` folder) | the names of all of them, and the **3** that match the question **with what is in them** (up to 4,000 characters each), where they are and what to fill in |
| System profiles | the BAU library | up to **3**, for the systems in play |
| Past fixes | closed records | the **3** most like this question, with how each was fixed |
| Recent incidents | the incident history | a summary of the last **30 days** |
| Document passages | **Library → Sources** | the best passages and their neighbours, up to **14,000 characters** |
| A file attached in this conversation | the chat tray | read for **every question in that conversation** — whole when it fits (24,000 characters on a follow-up), its best passages when it does not — and in no other conversation |
| The conversation | this chat | the last **8** messages (each cut to 1,200 characters) and a short running summary |
| What you are doing | the screen | the open record, anything selected, what you did today |
| Attachments | the chat tray | each file's text (up to 80,000 characters); a picture at the size the model reads |
| Special days | **Week** / **Month** (the ✦ on a day) | the days you marked yourself — a release freeze, month-end, a team day — for the next half year, with their notes |
| Which model, and your name for it | the pill beside Send; "I named you…" | `workspace.tier` (fast, deep or reason) and `workspace.yourName` |
| The allowed actions | `flow.js` | the list of the **65** things it may ask KalKech to do |

**What the question is about, not only what was typed (5.16).** Everything
above that is *matched* — document passages, runbooks, scripts, notes, past
fixes, system profiles — is matched against what the question is about:

- the words you typed;
- the telling words of what you attached: a document's, and a picture's
  (read on your PC even when your flow can see the picture) — so *"help me to
  support this"* with a screenshot of an email finds the guideline for the
  report the email asks for;
- for a vague question or a follow-up (*"what do you mean by step two?"*): what
  the last question was about, the conversation's title and summary, and the
  telling words of the last answer — so the same guideline goes again.

"Telling words" are the rarest words of that text that occur in your
documents, so a long email adds a few precise words, not its greeting and
signature. If the AI still sees nothing about the request, it can ask for one
more search with the words it read (`needSources`, Step 6).

**KalKech reason gets a bigger folder.** When you choose the reasoning model
(the pill beside Send, or **◆ KalKech reason** under an answer), the limits
above are raised, because it reads everything and it is only asked when you
want it: **240** records with their notes and log, **30** notes, **80**
lessons, **6** runbooks and **6** past fixes, **6** scripts with up to 8,000
characters each, **16** passages and about
**48,000** characters of documents, the last **40** messages (6,000 characters
each) and **90** days of incidents. The prompt tells it it was chosen, so it
checks every step and figure and writes as much as the question needs.

#### How the right passages of a document are found

This is the part that answered our password question, so here it is in more
detail. Think of a **library with index cards**.

```
 YOUR DOCUMENT  (PDF, Word, Markdown or text)
        │  read ONCE, when you add it to Sources
        ▼
 ┌─────────────────────────┐  about 1,100 characters each, never across a
 │ cut into passages       │  page. Each card knows its page, its lines and
 │ ("index cards")         │  its section. Page headers and footers that
 └────────────┬────────────┘  repeat on every page are left out.
              ▼
 ┌─────────────────────────┐  which words are on which card, like the
 │ an index                │  index at the back of a book
 └────────────┬────────────┘
              │  EVERY question, on your PC, in about 2 milliseconds
              ▼
 ┌─────────────────────────┐  • rare words count more than common ones
 │ search                  │  • words in a heading count more
 │                         │  • a mistyped word is read as the word the
 │                         │    documents use ("stardard" → "standard")
 │                         │  • cards that SET a rule ("minimum", "must",
 │                         │    "17 characters") come before cards that
 │                         │    only talk about the subject
 └────────────┬────────────┘
              ▼
 the best cards — and, for the best few, the card before and after — labelled
 S1, S2, S3…, each with its document, version, page, lines and section
```

Why not send the whole document? Because the model would read all of it for
every question, and a folder of fifty standards would not fit at all. Why not
use an AI to choose the cards? Because the chooser would have to read
everything first — two slow AI calls instead of one (Part 4).

**Our example:** 1 document searched, "stardard" read as "standard", and 9
passages sent — among them the user-account rule (section CSP-PWD-02, pages 8
and 9) and the local-administrator rule (CSP-PWD-04, page 10).

### Step 3 — Pack everything into one message: the prompt

The *prompt* is one text file, `flow/prompt.txt`. It is a **form with blanks**.
Each `{blank}` is filled in with what step 2 gathered; everything else is the
same for every question. In the order the file has them:

```
 === WHO YOU ARE TALKING TO ===             {memory}     ← notes you taught it
 === WHAT YOU CAN ASK THE APP TO DO ===     {actions}    ← the 65 allowed actions
 === THEIR WORKSPACE ===                    {workspace}  ← records, totals, runbooks,
                                                           lessons, what is on screen…
 === WHEN ===                               {today} {weekday} {calendar}
 === THE CONVERSATION SO FAR ===            {history}
 === WHAT THEY JUST SAID ===                {message}    ← the question itself
 === WHAT THEY ATTACHED ===                 {attached}
 === THEIR DOCUMENTS (SOURCES) ===          {sources}    ← the labelled passages,
                                                           then the rules for them
 === WHAT TO TRUST, IN THIS ORDER ===       ← their documents, runbooks, scripts
                                              first; past fixes after
 === THE SHAPE OF YOUR REPLY ===            (the JSON it must send back)
 === HOW TO TALK ===  === RULES ===  === SUPPORT WORK ===
 === HOW-TO: A GUIDELINE SOMEONE NEW CAN FOLLOW ===  === LEARNING ===
 === MODES ===  === FILES AND PICTURES ===  === RESOLV ITSELF ===
 === EXAMPLES ===                           ← worked examples: a question, and
                                              the perfect reply
```

Three things make it work well:

- **Rules in plain words.** For example: *answer only from the passages; never
  state a figure a passage does not state; cite every passage a figure comes
  from.* Since 5.15 two more: an **order of trust** (their documents, runbooks
  and scripts before what was done last time), and the **shape of a how-to
  answer** — before you start, steps that each say where, what (the script
  by name and place) and what you should see, how to check it worked, who to
  contact, and *Not in your documents* for anything missing, listed instead
  of guessed or asked about.
- **Worked examples.** The model copies its examples more than it follows its
  rules. So every example must be a perfect answer, and a checker
  (`flow/check-prompt.js`) makes sure each one would pass KalKech's own checks.
- **It is a file, read fresh before every question.** Change the file, ask the
  next question, and the new behaviour is already there. Your own version can
  live in your workspace folder as `dossier-prompt.txt`; KalKech uses the first
  it finds: yours, then `flow/prompt.txt`, then the copy built into `flow.js`.

### Step 4 — Send it through one door

```
 ┌───────────────────────┐        ┌──────────────────────┐        ┌────────────────┐
 │ KalKech (dossier.html) │question│ the relay            │question│ YOUR Power     │
 │ holds your records;   │───────►│ (flow/relay.html)    │───────►│ Automate flow  │
 │ CANNOT reach the      │        │ holds no records;    │        │ (in your       │
 │ internet - the        │ reply  │ can reach ONE        │ reply  │ company's      │
 │ browser enforces it   │◄───────│ address: yours       │◄───────│ Microsoft 365) │
 └───────────────────────┘        └──────────────────────┘        └────────────────┘
```

- The app page is **not allowed** to use the network (apart from the optional
  helper program on the same PC). The browser itself enforces this, so it is
  a fact you can check, not a promise.
- The relay is a small page in a locked-down frame. It can send text to **one**
  address — the flow address you typed in Setup — and refuses anything else,
  even a redirect.
- KalKech waits up to **30 seconds** for an everyday question, and up to about
  **2 minutes** for a hard job (Power Automate itself gives up at 2 minutes).

### Step 5 — The AI thinks (inside your flow)

The flow in Power Automate is six simple steps:

```
 ① When an HTTP request is received    the question arrives
 ② Parse JSON                          read it
 ③ Run a prompt                        the AI model reads the prompt, writes a reply
 ④ Compose "Clean"                     tidy the reply into JSON
 ⑤ Response                            send it back
 ⑥ Response "Fallback"                 if anything failed, say so instead of going silent
```

Optionally, step ③ becomes **two or three models**:

- a **fast** model (usually one with *mini* in its name) for everyday chat;
- a **strong**, slower model for the jobs that need thinking: the daily look
  back, learning a guideline, interviewing you about a runbook, *Diagnose* on a
  record, and **Think harder** under any answer;
- **KalKech reason**, a *reasoning* model (GPT-5 reasoning), only when you
  choose it: the pill beside Send, or **◆ KalKech reason** under an answer.
  It is sent far more of the workspace than the other two — 40 messages of
  the conversation, 240 records with their notes, 30 notes, 80 lessons, 16
  document passages (about 48,000 characters) — and KalKech waits up to 115
  seconds for it.

The model must reply in a fixed shape (JSON), for example:

```json
{"say":"For an ordinary user account the standard asks for a passphrase…",
 "cite":[{"s":"S4","quote":"Minimum Length: 17 characters"}],
 "confidence":"high",
 "actions":[]}
```

`say` is the answer, `cite` the passages it rests on (with the exact words),
`confidence` how sure it is, and `actions` anything it would like KalKech to do.

### Step 6 — Check the reply before you see it

**Nothing the AI sends is trusted.** It is treated as a *suggestion to be
checked*, never as an order. KalKech checks, in this order:

1. **Is it the right shape?** A short reply in plain text (not JSON) is shown
   as a plain answer; anything else unusable is dropped, with a reason.
2. **Is every action allowed?** Only the 65 actions in KalKech's own list are
   accepted, each with the right kind of details (a date must be a date, a
   record must exist). Anything else is refused *by name*, so you can see what
   was refused and why.
3. **Did the flow fail?** If the flow's safety net answered instead of the AI
   (often because Microsoft's content filter blocked something), KalKech asks
   **once** more with only the essentials.
4. **Did it ask for more records, or another search?** The AI may answer "I
   need the records about X" (`needRecords`), or "search your documents for X"
   (`needSources`) — for example when you send a screenshot of an email and
   nothing that was found is about the report it asks for. KalKech searches on
   the PC and asks **once** more. One extra round in all.
5. **Did it answer the blank picture?** Your flow's prompt has a picture
   input that cannot be empty, so with nothing attached it is handed one white
   pixel — and a small model now and then answers *that* ("the image is a
   blank white square"). KalKech spots such sentences, takes them out, and if
   nothing useful is left asks **once** more with *(no picture attached)*
   after the question — a plain fact, not an order (orders are what
   Microsoft's content filter refuses). A conversation is never named after
   the picture. The lasting fix is in the flow (POWER-AUTOMATE.md §4f).
6. **Were its marks stripped?** A flow built from an older guide removes
   every ```` ``` ```` from the reply, so code, diagrams and emails arrived as
   plain text. The prompt now asks for `~~~` marks (which survive), and
   KalKech recognises a block whose marks are gone — a line such as *csharp*,
   *sql* or *mermaid* over code, after a blank line, a colon or a heading —
   and puts the marks back.
7. **Where did each query come from?** Every block of code in the answer is
   compared with what the AI was given — the passages of your documents, all
   your scripts, the runbooks, your own words — ignoring the values it filled
   in (a month, a date, a name). Each block is labelled: *From your document:
   …*, *From your script: …*, *From your runbook: …*, or **⚠ Not from your
   documents or scripts — written by the assistant. Check it before you run
   it.** An answer that says "run the SQL" but gives none, and names none of
   your scripts, gets a warning under it.
8. **Are the names real?** Every specific name in the answer — a script, a
   stored procedure, a table, a column written in code — is looked for in
   everything the AI was given for this question (your documents, scripts,
   runbooks, records, your own words). A name found nowhere is listed under
   the answer: *⚠ Not found in your documents, scripts or workspace: … the
   assistant may have made these up.* Nothing is taken out — the name may be
   right and simply new to KalKech — but you know to check it before you run
   anything.
9. **Is an answer about your documents really in your documents?**

   - Every **quote** must be found, word for word, in the passage it names.
   - Every **figure** — a time (days, hours), a percentage, a priority or
     severity, a score — must be written in a passage the answer cites.
   - A line that breaks this rule is **taken out**. The rest of the answer is
     shown, marked *Part of the answer was taken out*.
   - Only if nothing useful is left is the whole reply **held back** — and then
     KalKech says so honestly and shows what the passages *do* say.
   - **Your own words are never "invented".** A figure that is in one of *your*
     runbooks that matched the question, or that you wrote yourself in your
     message (*"valid until exactly 5 years after the start date — close it
     with these steps"*), is accepted. The answer is marked **From your
     runbook** or **From what you wrote**, never as if a document said it. A
     figure in a *question* you asked (*"is it 4 hours?"*) is still checked.
   - **A job is not a question.** When you give the content and ask KalKech to
     do something with it — close a record, log it — and the reply does that
     and cites nothing, there is no sources box under it at all.
   - The word **policy** in *"policy number"* or *"policy A018346A10"* means a
     customer's insurance policy, so it does not make a message a question
     about policy documents.

```
 Suppose the AI replied like this (the kind of reply that caused the trouble):
   "For a user account: a passphrase of at least 17 characters…   [cites S4]
    If a passphrase is not possible: at least 10 characters…        [cites S5]
    For local administrators the password is changed every 30 days.
    Passwords should also be changed every 90 days."

 KalKech checks every figure:
   "30 days"  in a passage it cited?  no  → line taken out
              (it IS on page 10, a passage it did not cite → "Figure seen in")
   "90 days"  in any passage?         no  → line taken out (probably invented)

 You see:
   the user-account answer, Source and Evidence under it,
   Confidence: Medium — and "KalKech took out 2 lines of this answer"
```

This is the step that went wrong before version 5.9.2: one unsupported line
made KalKech hide the *whole* answer and say *"the documents do not specify
this"* — when they did. Now only the line goes.

### Step 7 — Show the answer, and ask before any change

- **Reading actions** (show a list, open a record) happen at once — they change
  nothing.
- **Changing actions** (43 of the 65: raise a record, close one, set a due
  date…) are **shown to you one at a time and wait for your yes**. However
  confident the AI is, it cannot change your records by itself.
- Under an answer about your documents: **one short line** — the source, its
  page and the confidence. Click it to open **Source** (click that to open the
  document at those lines), **Evidence** (the exact words), **Confidence**
  (High, Medium, Not found, or None when held back) and what was searched. A
  warning (a line taken out, an answer held back) is always on the short line.
  A **Suggestion** is kept separate when the AI adds advice of its own,
  folded to one line until you open it.
- A **diagram** the AI wrote as text (a `~~~mermaid` block) is drawn here, on
  the PC, as a picture you can copy, save or enlarge (`diagram.js`). The AI
  only writes the text; the drawing never leaves the PC. A diagram whose
  fences were lost on the way (an old *Clean* step strips ```` ``` ````) is
  recognised and drawn anyway.
- Your own question shows each file you sent as a **card**: click it to see
  what was sent, or **Hide** the cards to keep the conversation short.
- Under every AI answer: the time it took (and which model, when it was not
  the fast one), 👍 / 👎, **Retry**, **Think harder** (asks the strong model)
  and, with three models, **◆ Reason** (asks KalKech reason).
- The panel itself sits where you put it: docked right or left (the work
  makes room), floating, or full screen — drag it by its top bar and it snaps
  to an edge like a magnet. The desk pet is the assistant out of its panel:
  it thinks while an answer is on its way and tells you when one arrives.

### Step 8 — Learn for next time

See Part 3.

### How long each step takes

| Step | Where it runs | Time |
|---|---|---|
| 1. Answer here? | your PC | a few milliseconds |
| 2. Gather (records ranked, documents searched) | your PC | about 2–6 milliseconds |
| 3. Pack | your PC | 1–2 milliseconds |
| 4–5. Send, think, reply | the flow and the AI model | usually **5–10 seconds** — nearly all of the wait |
| 6. Check | your PC | milliseconds |
| 7. Show | your PC | at once |

So almost all of the waiting is the AI reading and writing. **That is why the
biggest speed wins come from sending less, and from not calling the AI at all
when it is not needed.**

---

## Part 3 — How it learns

### The most important fact: the model itself never changes

People often imagine an AI "learning" by changing its brain. **That does not
happen here, and it does not need to.** The model is the same every day.
What changes is **the notebook** — what KalKech keeps in your workspace and
puts into the folder for the next question.

```
 ┌──────────┐   ┌────────────────┐   ┌──────────────┐   ┌───────────────┐
 │ you ask  │──►│ KalKech gathers │──►│ the model    │──►│ you see the   │
 │ a        │   │ the notebook   │   │ answers      │   │ answer, and   │
 │ question │   │ pages it needs │   │ (the model   │   │ react         │
 └──────────┘   └───────▲────────┘   │ never        │   └───────┬───────┘
                        │            │ changes)     │           │
                        │            └──────────────┘           ▼
                ┌───────┴──────────────────────────────────────────────────┐
                │ KalKech writes in its NOTEBOOK (kept in your workspace):  │
                │ lessons · notes · how things were fixed · draft runbooks │
                │ · corrections, and the checks that test them             │
                └──────────────────────────────────────────────────────────┘
                  fed by: thumbs down + the right line · "How was it fixed?"
                          · the daily look back · Interview me · Learn from
                          a document
```

This has big advantages:

- **You can read everything it has learned** — every lesson and note is listed
  in Setup, in plain words.
- **You can undo any of it** — delete a lesson, and it is gone from the next
  question.
- **It works with any model** — change the model tomorrow and nothing learned
  is lost, because it was never inside the model.

### The ways it learns

| How | When | What is kept | How it is used next time |
|---|---|---|---|
| **👎 with the right answer** | you press thumbs down under an answer and write one line | a *correction* lesson, and a *check* | the correction travels with matching questions; **Setup → Checks → Run checks** asks each corrected question again and has the AI judge PASS or FAIL |
| **Lessons** (`learn`) | during a conversation, when something lasting about you shows | one line: a style, a preference, a habit, a person, a system, a gap | the 30 newest travel with every question |
| **Notes** (`remember`) | you say "remember how we fixed…" | the method, in your words | the 10 that match a question travel in full |
| **"How was it fixed?"** | you close a record by hand | one line: the cause and the fix | the 3 closed records most like a new question travel with it: *"This looks like D-0142 — that was the SSO cache"* |
| **The daily look back** (`[reflect]`) | at noon (you choose the time), or the next time KalKech is open | new lessons, notes worth keeping, draft runbooks for problems that repeat | as above; it also asks you one question it would like answered |
| **Interview me** (`[teach]`) | you press it on a runbook | a better draft runbook | the runbook travels when a question matches it |
| **Learn from a document** (`[study]`) | you hand it a guideline | draft runbooks, checked against the document; the document itself kept in Sources | runbooks and passages travel when a question matches |
| **"Not what I meant"** | under an answer from the local assistant | the *shape* of your question | the local assistant reads that kind of question right from then on |
| **Words** | "when I say the portal I mean CX Portal" | a name that means another | works in every question |

### Safety rules for learning

- **Drafts, not decisions.** A runbook written by the AI is always a *draft*
  until a person approves it.
- **Checked against the source.** A draft written from a document names any
  figure the document does not state: *"⚠ Not in the document: 4 hours"*.
- **Nothing hidden.** Everything learned is listed in Setup and can be deleted.
- **Facts, not orders.** Notes and lessons are written as facts about the work,
  not as commands to the AI — commands in the data can trip Microsoft's
  content filter, and they confuse the model.
- **Tested.** Every correction becomes a check, so a later change that breaks
  it shows up in **Run checks**, not in front of a colleague.

---

## Part 4 — Keeping it fast and steady

### Where the time goes

The model **reads every word it is sent before it starts to answer**. A folder
twice as thick is read twice as long. This is why KalKech's speed work has
always been about *what not to send*.

In one release (3.x), a workspace of 1,000 records used to send about
**164 KB** with every question; after ranking, about **52 KB** — and it no
longer grows as you use the app.

### Ten rules that keep it fast and steady

| # | Rule | Why | In KalKech |
|---|---|---|---|
| 1 | **Answer on the PC when you can** | no network, no AI, no wait | greetings, counts, "what's new", "which source" |
| 2 | **Choose the data on the PC, not with a second AI call** | a "chooser AI" must read everything first: two slow calls instead of one | ranking 5,000 records takes about 6 ms; searching 150 documents about 2 ms |
| 3 | **Send the best, count the rest** | the model needs the relevant rows; totals keep counts right | 60 records plus totals of all |
| 4 | **Put a limit on everything that grows** | notes, lessons and history grow every day; without limits every question gets slower | 10 notes, 30 lessons, 8 messages, 14,000 characters of passages — more for KalKech reason, only when chosen |
| 5 | **Fast for chat, strong for hard jobs, reasoning when you choose** | stronger models are slower and cost more; use each where it earns it, and let the person choose | up to three models; the pill beside Send (Auto · Fast · Strong · Reason); **Think harder** and **◆ Reason** under answers |
| 6 | **At most one extra round trip** | every extra call is another full wait | `needRecords` or `needSources` once; the safety-net retry once |
| 7 | **Always set a time limit, and fall back** | a silent app is worse than a simple answer | 30 s for chat, up to 115 s for the strong and reasoning models; if the flow fails, the local assistant answers and says why |
| 8 | **Never trust the reply; check it** | a model can return the wrong shape or an action that does not exist | the validator; only the 65 known actions |
| 9 | **Never let it change anything by itself** | a confident mistake must not become a real change | every change waits for your yes |
| 10 | **Measure, and show what you measured** | "it feels slow" cannot be fixed; a number can | the time under each answer; **Preview** of the exact bytes; the Sources log |

### Stable means: the same question gives the same kind of answer

- **The rules live in one file** (the prompt), under version control, with
  examples checked by a script.
- **The reply has a fixed shape** (JSON), checked every time.
- **Search is plain arithmetic on words**, not another AI — so it gives the
  same passages for the same question, today and next month, and a new
  conversation finds the same passages as the old one.
- **Tests run the real app** in a browser with a *stand-in* AI that returns
  scripted replies, so every check is repeatable: `node --test` (47 tests) and
  `node tests/e2e/run.js` (171 checks).

---

## Part 5 — A blueprint for your own AI assistant

Everything above can be reused for a different assistant — a helpdesk bot, an
HR policy bot, a sales assistant. Here is the method without the KalKech
details.

### The nine parts

```
                          ┌──────────────────────┐
   question ─────────────►│ 1 FRONT DOOR         │── easy? ──► answer at once
                          │ answer locally first │
                          └──────────┬───────────┘
                                     ▼
 ┌─────────────────────┐  ┌──────────────────────┐
 │ 9 NOTEBOOK          │─►│ 2 RETRIEVER          │  picks the few pieces this
 │ lessons, notes,     │  │ your data → a small  │  question needs, on your
 │ corrections, tests  │  │ relevant folder      │  own machine
 └─────────▲───────────┘  └──────────┬───────────┘
           │                         ▼
           │              ┌──────────────────────┐
           │              │ 3 PROMPT TEMPLATE    │  rules + examples + blanks,
           │              │ one text file        │  kept in version control
           │              └──────────┬───────────┘
           │                         ▼
           │              ┌──────────────────────┐
           │              │ 4 GATEWAY            │  the only way out; one
           │              │ one door out         │  address; time limits
           │              └──────────┬───────────┘
           │                         ▼
           │              ┌──────────────────────┐
           │              │ 5 MODEL              │  fast for chat, strong for
           │              │ (any provider)       │  hard jobs; replies in JSON
           │              └──────────┬───────────┘
           │                         ▼
           │              ┌──────────────────────┐
           │              │ 6 CHECKER            │  shape, allowed actions,
           │              │ trust nothing        │  facts against sources
           │              └──────────┬───────────┘
           │                         ▼
           │              ┌──────────────────────┐
           │              │ 7 HUMAN IN THE LOOP  │  reads run; writes wait
           │              │ show, then ask       │  for a yes
           │              └──────────┬───────────┘
           │                         ▼
           │              ┌──────────────────────┐
           └──────────────│ 8 FEEDBACK + LOG     │  ratings, corrections, and a
                          │ learn and measure    │  log with no private text
                          └──────────────────────┘
```

| Part | Its one job | KalKech's version |
|---|---|---|
| 1 Front door | answer what needs no AI | `chatSmallTalk`, `chatLocalFirst`, `chat.js` |
| 2 Retriever | choose the small folder for this question | record ranking in `flow.js`; `sources.js` for documents |
| 3 Prompt template | tell the model how to behave, with examples | `flow/prompt.txt` |
| 4 Gateway | the single, locked way out | `flow/relay.html` |
| 5 Model | read the folder, write the reply | the Power Automate flow and its AI model |
| 6 Checker | refuse bad shapes, unknown actions, invented facts | `DossierFlow.validate`, `DossierSources.ground` |
| 7 Human in the loop | nothing changes without a yes | the one-at-a-time confirmation in `dossier.html` |
| 8 Feedback and log | learn from reactions; measure everything | 👍/👎, checks, the Sources log, timings |
| 9 Notebook | what was learned, readable and deletable | lessons, notes, runbooks in `dossier.json` |

### Build it in this order

1. **Write down the questions** people will ask, and the **actions** the bot
   may take. Mark which actions *change* something — those always ask first.
2. **Fix the reply shape** (a JSON contract): the answer, citations, confidence,
   actions. Write it down before anything else; everything checks against it.
3. **Build the checker** before the prompt. It is small and it protects you
   from every later mistake.
4. **Build the front door**: the questions you can answer with plain code.
5. **Build the retriever**: rank your data against the question on your own
   machine. Start simple — matching words — and measure before adding anything
   cleverer.
6. **Write the prompt**: short rules, then worked examples of perfect replies.
   Check the examples with the same checker.
7. **Add the gateway and time limits**, and a fallback for when the model does
   not answer.
8. **Add the notebook and feedback**: thumbs down with the right line, kept as
   a lesson *and* as a test.
9. **Test with made-up data** and a stand-in model that returns scripted
   replies, so tests are repeatable and no real data is ever in the tests.
10. **Measure** the size of each request and the time of each answer, and show
    both.

### Checklist — copy this for a new bot

```
PRIVACY
[ ] Only one component can reach the network, and only one address
[ ] I can show a user the exact bytes that will be sent (a Preview)
[ ] Private documents can be marked "stays on this PC" and are never sent
[ ] Logs record what was searched and cited — never the documents' text

SAFETY
[ ] The reply has a fixed shape, and every reply is checked against it
[ ] Only actions on my list are accepted; unknown ones are refused by name
[ ] Every action that changes data waits for a person's yes
[ ] Answers about documents are checked: quotes and figures against sources
[ ] A bad line is removed; the good answer is still shown
[ ] Anything the model writes for later (a runbook, a note) is a DRAFT

SPEED
[ ] Easy questions are answered without the model
[ ] Data is chosen by code on my machine, not by a second model call
[ ] Everything that grows has a limit (history, notes, rows, passages)
[ ] A fast model for chat; a strong one only where it earns it
[ ] At most one extra round trip per question
[ ] A time limit on every call, and a fallback answer

LEARNING
[ ] The model is never retrained; learning is notes I can read and delete
[ ] A thumbs down asks for the right answer, and keeps it as a test
[ ] Corrections can be re-run later (PASS / FAIL)
[ ] A regular "look back" turns the day's work into lessons and drafts

QUALITY
[ ] The prompt is one file in version control, read fresh each time
[ ] Every example in the prompt passes my own checker
[ ] Tests use made-up data and a stand-in model
[ ] I measure request size and answer time, and show them
```

### Lessons from KalKech's history

Most of these are mistakes KalKech really made and then fixed; the rest are
traps its design was built to avoid.

| Mistake | What happens | What to do instead |
|---|---|---|
| Sending everything with every question | Questions grew every week; answers got slower the more the app was used | Rank on the PC; send the best, count the rest |
| Using an AI to choose what to send | The chooser had to read everything first — two slow calls | Choose with plain code; it takes milliseconds |
| A document sent with one question only | The next question had only a summary, and the model filled the gap with "4 hours" (a figure from somewhere else) | Keep documents in a searchable store; search them for every question |
| Every attachment put in the library | A file sent "just for this chat" was cited in other chats | Keep a chat's file for that chat; put it in the library only when asked ("save this file") |
| Past fixes before the guideline | The answer followed what was done last time, not what the procedure says | Give an order of trust: their documents, runbooks and scripts first; past fixes after, as supporting facts |
| "Run the script to generate the data" | Someone new cannot follow it: which script, where, with what? | Send the matching scripts with what is in them; ask for a guideline that names each script and place, and lists what is missing |
| Trusting names in an answer | A procedure or table that sounds right but does not exist | Check every name against what was sent, and mark the ones found nowhere |
| Matching only the words typed | "Help me to support this" with a screenshot found no guideline; the model wrote "run the SQL", then its own SQL | Match on what the question is about: the picture's words, the conversation for a follow-up; let the model ask for one more search |
| Inviting the model to write the query | A query that looked right and was in no document | Copy queries only from their documents and scripts; label every code block with where it came from |
| Hiding the whole answer for one bad line | A correct answer was replaced by "not specified" — when it was specified | Take out only the bad line, and say you did |
| Reading page headers as headings | Citations said section "CLASSIFICATION : OFFICIAL" | Detect lines repeated on most pages and leave them out |
| Letting the AI change records directly | One confident mistake changes real data (KalKech never allowed it) | Every change waits for a yes |
| A flow that strips ```` ``` ```` from replies | Code, diagrams and emails arrived as plain text; a block straight after a heading was missed | Ask for `~~~` marks, which survive; repair a block whose marks are gone |
| Handing a small model a blank picture | It answered the picture ("a white square") instead of the question | Answer simple things on the PC; ask again with a plain fact; give the flow a text-only prompt |
| One size of folder for every model | A reasoning model was given as little as the quick one | Give the big folder only to the model chosen for big questions |
| Rules written as orders inside the data | Microsoft's content filter blocked the whole question | Keep data as facts; keep orders in the prompt |
| Changing data kept in a "knowledge base" | It went stale within a day | Send changing data with each request; keep only standing rules in the prompt |

---

## Part 6 — Words used in this guide

| Word | Plain meaning |
|---|---|
| **AI model** / **LLM** | The program that reads text and writes text — the "brain" in the flow. It does not remember anything between questions. |
| **Prompt** | Everything the model is given for one question: the rules, the examples, the folder of information and the question. In KalKech it is built from the file `flow/prompt.txt`. |
| **Flow** | Your Power Automate flow: it receives the prompt, runs the AI model, and sends the reply back. |
| **Relay** | The small page (`flow/relay.html`) that is the only door to the network. |
| **Token** | A piece of a word; models measure how much they read in tokens. More tokens = longer wait and higher cost. |
| **JSON** | A simple, strict text format for data, like `{"say":"hello"}`. The reply must be JSON so it can be checked. |
| **Action** | Something the AI may ask KalKech to do, like `find` or `createRecord`. Only 65 exist; the 43 that change data always ask first. |
| **Retrieval** | Finding the pieces of your data that a question needs. |
| **Reasoning model** | A model that thinks a problem through before it answers. Slower and dearer; KalKech asks one (KalKech reason) only when you choose it. |
| **Special day** | A day you marked yourself, with a note, that is not a holiday — a release freeze, month-end, a team day. The assistant is told the next half year of them. |
| **Conversation file** | A file attached in the chat. It belongs to that conversation: every question in it can read the file, no other conversation can, until you say "save this file". |
| **Knowledge source** | A document in **Library → Sources**, searched and cited by every conversation. |
| **Order of trust** | Which information wins: your documents, then runbooks, then scripts, then what was done before, then general knowledge (only as a suggestion). |
| **Names check** | KalKech looking for every script, table or procedure name in an answer in what the AI was given, and marking the ones found nowhere. |
| **Telling words** | The rarest words of a text (an email, an answer) that occur in your documents — what KalKech searches with when the question itself says little. |
| **Code label** | The line on every code block in an answer that says where it came from — your document, script or runbook — or that the assistant wrote it. |
| **Passage** | A small piece of a document (about 1,100 characters), with its page, lines and section — an "index card". |
| **Index** | A list of which words are on which passage, so search is instant. |
| **BM25** | The well-known formula KalKech uses to score passages: rare words count more, and a word repeated many times stops counting more after a while. |
| **Citation** | Where an answer came from: `[Source: document, version, page, lines, section]`. |
| **Grounding** | Checking that an answer really comes from the sources it cites. |
| **Figure** | A number that makes a rule: a time (days, hours), a percentage, a priority or severity, a score. |
| **Held back** | KalKech did not show a reply because it rested on a figure its sources do not state. |
| **Taken out** | KalKech removed one line of a reply for that reason and showed the rest. |
| **Local answer** | An answer worked out on your PC, without the AI. |
| **Tier** | Which model a question goes to: *fast* for everyday chat, *deep* for hard jobs, *reason* for KalKech reason when you choose it. |
| **Lesson** | One line KalKech keeps about you or your work, sent with later questions. |
| **Check** | A saved correction that can be asked again later, judged PASS or FAIL. |
| **Stand-in model** | A fake AI used in tests that returns scripted replies, so the tests are repeatable. |

---

## Part 7 — Where each part lives

| File | What it does in this story |
|---|---|
| `dossier.html` | The app: the front door (step 1), gathering (step 2), showing and asking (step 7), and the notebook (step 8). Search for `ASKING THROUGH A FLOW`, `LEARNING`, `SOURCES`. |
| `chat.js` | The local assistant: answers about forty kinds of question with no AI. |
| `flow.js` | Packing (step 3), sending (step 4), and checking the shape and actions (step 6). Holds the list of 65 actions. |
| `sources.js` | Documents: cutting into passages, the index, the search, citations, and the figure check. |
| `flow/prompt.txt` | The prompt template: the rules and the examples. |
| `flow/relay.html` | The one door to the network. |
| `flow/POWER-AUTOMATE.md` | How to build the flow, including the two-model setup. |
| `flow/CONTRACT.md` | Exactly what is sent and what may come back. |
| `flow/SOURCES.md` | Setting up and troubleshooting documents. |
| `flow/SPEED.md` | The story of making it fast, with the numbers. |
| `tests/` | Unit tests and the browser test with a stand-in AI and made-up documents. |
| `README.md` | The full manual — also what the assistant reads to explain KalKech. |
