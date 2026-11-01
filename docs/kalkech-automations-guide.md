# KalKech Automations - the complete guide

Version: 5.27.2
Effective date: 1 November 2026

Everything about Automations in KalKech: what each step does, every box and
switch, the limits, and what to do when something goes wrong. It is written
for people and for the assistant. **If a button, a mode, a box or a kind of
step is not described in this guide, KalKech does not have it** - say so
rather than guess.

Add it to **Library → Sources** so the assistant answers automation questions
from it. When KalKech is updated, add the new copy and choose **Replace**.

## Can I write JavaScript or code in an automation?

**No.** KalKech automations run no code at all, on purpose: a design - your
own, an imported file, or one the assistant suggests - can never run a
program. There is **no JavaScript, no "Mode: JavaScript", no "Code" box, no
"Function" step and no "Run code" step**. Nothing like
`steps.Users.users.map(...)` or `return { ... }` works anywhere. Code typed
into a box (the Value of **Set a value**, say) is kept as plain text - the
value becomes that text.

Values are written only as `{{ }}` placeholders and KalKech's own 40
functions. What to use instead of code:

| You want to | Use |
|---|---|
| keep only some fields of each item of a list | **Keep only** on the save row: `id, name, email` |
| remove fields (a password, a token) | **Leave out** on the save row: `password, bank` |
| rename or change fields | a **Shape a list** step: `name` ← `{{item.firstName}}` |
| keep only some items | a **Filter a list** step: `{{item.price}} < 20` |
| work something out | a function: `{{count(users)}}`, `{{upper(item.name)}}` |
| a loop | a **For each** step |
| if / else | a **Condition** step (Yes and No) |
| a variable or a counter | a **Set a value** step |

A saved value is written `{{users}}` - never `steps.Users.users`.

## What can automations not do?

These do not exist in KalKech - an answer that uses one is wrong:

- **No automatic start.** No schedule, no timer ("every 5 minutes"), no email
  trigger, no webhook, no "when a record changes". An automation runs only
  when you start it, or when you agree to the assistant running it - and
  only while KalKech is open. (A daily report on a timer belongs in a
  scheduled Power Automate flow, outside KalKech.)
- **No other kinds of step** than the ten in *Which kinds of step are
  there?* - no "send an email", "write a file", "create a record" or
  "parallel branch" step. Steps run one after another.
- **No PowerShell, .exe or .ps1.** A Script step runs only `.bat` or `.cmd`
  files from your workspace's `scripts` folder.
- **No browser sign-in or cookies.** A connection cannot use your browser's
  login (SSO, Okta). Its sign-in is one of: none (or a sign-in step), your
  Windows account, user name and password, an API key in a header, a fixed
  token.
- **No address outside the connection**, and redirects are not followed.
- **No other placeholder syntax**: not `${name}`, `$name` or Power Automate's
  `@{...}` - only `{{name}}`.
- **No functions on hidden values or secrets**, and **no secret in a
  condition**.

## Where are automations in KalKech?

On their own page: **Automations** in the list of views on the left, or
press **8**. The page has three tabs:

- **Automations** - your list: name, what it does, the kinds of step it has,
  who may start it, when it last ran (green dot: worked; red: failed),
  **Run**, and **⋯** (Edit, Duplicate, Export to a file, Remove). Click a
  line to open its design. **Find an automation** filters the list. The
  toolbar has **Import**, **Export** (all of them) and **New automation**.
- **Connections** - the APIs your steps call, and their secrets.
- **Run history** - every run, newest first. **Failed** and **Started by
  the assistant** narrow it down.

At the top right: whether the KalKech program by the clock is ready, and
**The assistant may run them** - one switch for all automations.

## What do I need on my PC for automations?

The **KalKech icon by the clock** - the tray program that `KalKech.bat`
starts. A browser page cannot call your company's APIs or start a script, so
the steps are carried out by that program, and the secrets are kept there.

The top right of the Automations page says *Tray program ready*, *not
running* or *too old*. After an update to KalKech, quit the program once
(right-click the icon → **Quit**) and run `KalKech.bat` again: it rebuilds
itself.

## How do I make a new automation?

1. On the **Automations** page press **New automation** and pick a starter:
   **Blank** (one empty API call), **Sign in, then call**, **Check, then
   decide**, **API key in a header**, **Windows sign-in**, **Submit, then
   wait**, **Run a script**, or **A list, written out**.
2. The designer opens: the name at the top, then a column of cards - **When
   you run it**, the steps, **When it ends**. Type the name in the box at the
   top.
3. Click **When you run it** for the values it asks for each time (Inputs)
   and its Settings.
4. Click each step and fill it in, in the side panel. The **+** on a line
   adds a step there.
5. Click **When it ends** for the message when it finishes, and when it
   fails.
6. **Save** (or `Ctrl`+`S`). The checker at the top says **Ready**, or how
   many things there are to fix - click it for the list.

The address in a starter is an example (`example.local`): open its
connection and put in your API's real address.

## How does the designer work?

- **Each card** shows one name and one line - *POST /token · Login service →
  token 🔒*. Click it and its settings open in the **side panel**, in tabs:
  an API call or a script has **Parameters**, **Values**, **Settings** and
  **Test**; the other steps have **Parameters** and **Settings**.
- **+ on a line** adds a step there, from three groups: *Call and run*,
  *Decide and repeat*, *Values and lists* - with a box to find one.
- **⋮ on a card**: Try up to here, move up or down, duplicate, remove.
- **Drag a card** onto another line to move it - into a Condition's Yes or
  No, or out of it.
- **The top bar**: *Automations › its name* on the left; on the right the
  checker (**Ready** or *2 to fix*), **Run**, **Save**, **⋮** (Undo, Redo,
  Fit, Back to 100%, Export this automation) and **Test**. *Not saved*
  beside the name means there are changes.
- **Zoom** at the bottom left: −, the size, +, Fit (30% to 200%); or `Ctrl`
  and the mouse wheel.
- **The side panel is wider** when you drag its left edge.
- **A ⚠ on a card** means the checker found a problem there.

## What keys work in the designer?

| Key | Does |
|---|---|
| `Enter` | Opens the settings of the card you are on |
| `↑` `↓` | The card above or below |
| `Alt`+`↑` / `Alt`+`↓` | Moves the card up or down |
| `Delete` | Removes the card (Undo brings it back) |
| `Ctrl`+`S` | Saves the design |
| `Ctrl`+`Z` / `Ctrl`+`Y` | Undo / redo a change to the design |
| `Ctrl` + mouse wheel, `Ctrl`+`+` / `-` / `0` | Zoom in, out, back to 100% |
| `/` on a card | Opens the list of steps, to add one after it |
| `/` or `Ctrl`+`Space` in a box | Opens the list of values, functions and blocks |
| `Esc` | Closes the side panel |

## Which kinds of step are there?

There are exactly ten:

| Step | What it does |
|---|---|
| **API call** | One request to a connection: method, path, query values, headers, a body. |
| **Script** | Runs one of your `.bat` or `.cmd` scripts with values. |
| **Wait** | Waits a number of seconds. |
| **Ask me** | Shows you a question; the run stops if you say no. |
| **Condition** | A test, and two lists of steps: **Yes** and **No** - an if / else. |
| **For each** | Runs the steps inside it once for every item of a list - a loop. |
| **Stop the run** | Ends the run there - as done, failed or stopped - with its own message. |
| **Set a value** | Keeps a value of your own (a variable), or adds to one: an item to a list, a number, more text. |
| **Shape a list** | Makes a new list with only the fields you name from each item. |
| **Filter a list** | Makes a new list with only the items a test is true for. |

Groups in the **+** menu: *Call and run* (API call, Script), *Decide and
repeat* (Condition, For each, Wait, Ask me, Stop the run), *Values and
lists* (Set a value, Shape a list, Filter a list).

## What settings does every step have?

In a step's **Settings** tab:

- **Only run when** - a condition; empty: it always runs. Otherwise the
  step is skipped when the test is false.
- **If it fails** - **Stop the run** (the default) or **Carry on with the
  next step**.
- **Repeat until** (API calls and scripts) - run it again **every** few
  seconds until a test is true, at most a number of **times** (up to 30
  times, at most every 300 seconds). Used to wait for a job to finish.
- **Success also needs** (API calls and scripts) - a test on the saved
  values, for an API that answers 200 even when it failed.

## How do I give an automation values each time it runs (inputs)?

Click **When you run it** → **Inputs**. Each input has:

- **Name** - letters, digits and `_`, not starting with a digit. Steps use it
  as `{{input.policy}}`.
- **Label** - what you see in the form, like *Policy number*.
- **Kind** - **Text**, **Number**, **Date** (YYYY-MM-DD), **Choice** (a list
  such as UAT, PROD) or **Typed by me (secret)** (asked each time in a
  password box, never saved, never shown to the assistant).
- **Check (pattern)** - a regular expression the value must match, like
  `[A-Z]\d{5}[A-Z]\d{2}`; nothing runs until it does.
- **Example** - shown in the box, like `P10234X56`.
- Whether it is required.

Up to 20 inputs. The **Settings** tab of the same card has **What it does**
(the assistant reads this line to know when to propose it), the system, and
the assistant switches.

## How do I call an API (the API call step)?

**Parameters** tab:

- **Connection** - which API (its address and sign-in).
- **Method** - GET, POST, PUT, PATCH, DELETE or HEAD.
- **Path** - starts with `/`, goes after the connection's address:
  `/policies/{{input.policy}}/coi`.
- **Query** and **Headers** - rows of name and value (up to 30 each).
- **Body** - **No body**, **JSON**, **Form fields**, **XML** or **Plain
  text** (up to 100,000 characters). A GET or HEAD has no body.
- **Success when** - which answers count as success: `2xx` (any 200-299,
  the default), a list like `200,201` or `2xx,404`, or `any`.

**Values** tab: **Save a value** (what to keep from the reply) and **Keep
the whole reply**. **Settings** tab: **Success also needs**, **Only run
when**, **Repeat until**, **If it fails**.

A value in a JSON body stays inside its string. To put a list or an object
in as JSON, add `|raw`: `{"ids": {{json(field(docs, "id"))|raw}}}`.

## How do I keep a value from a reply (Save a value)?

In the step's **Values** tab press **Save a value** (up to 12 per step):

- **Name** - letters, digits and `_`. Later steps write `{{name}}`.
- **From** - **JSON path**, **Header**, **Status code**, **Pattern** (a
  regular expression; its first group is kept, e.g. `Reference: (\S+)`),
  **Whole reply**; for a script also **Output** and **Exit code**.
- **Path** (for a JSON path) - `access_token`, `data.token`,
  `items[0].id`, `$.items.0.id`, or `$` for the whole reply.
- **Shown to** - **🔒 Hidden**, **Me only**, or **Me and the assistant**.
- **When to keep it** - **On success** (the default), **On failure** (read
  from the error reply), or **Always**.
- **Keep only** / **Leave out** - for a list or object read from JSON.

The quickest way: open the **Test** tab, press **Try up to here**, and click
a part of the reply - it becomes a saved value.

## Who can see a value: Hidden, Me only, or Me and the assistant (the AI)?

To hide a token, a password or any value from the assistant (the AI), save
it as **🔒 Hidden** - or **Me only** when you want to see it yourself.

| Shown to | Meaning |
|---|---|
| 🔒 **Hidden** | Only the next steps can use it. It stays inside the KalKech program for this run and is forgotten when the run ends (or after 30 minutes). Right for a token. |
| **Me only** | Shown on the run card and kept in the run history - never sent to the assistant. |
| **Me and the assistant** | Also given to the assistant after the run. |

A value marked for you or the assistant that looks like a token or a
password, or that contains one of the run's secrets or hidden values, is
**kept hidden anyway**, and the card says so. Secrets are never shown to
anyone.

*Set a value*, *Shape a list* and *Filter a list* have only **Me only** and
**Me and the assistant**.

## How do I keep only some fields of a list, or leave fields out?

On the save row of the step that gets the list (its **Values** tab):

- **Keep only** - the fields to keep, with commas: `id, name, email`. A
  dotted name reaches inside: `address.city`.
- **Leave out** - the fields to remove: `password, bank, token`. A plain
  name is removed at any depth; a dotted name only at that place:
  `links.sig`.

Every item of the list is changed by the KalKech program - this is how you
remove properties from an array, without code. You and the assistant see
the list without those fields; a ✂ on the card says fields were left out.
The program keeps the whole list, hidden, for the rest of the run, so a
later step can still use a left-out field: `{{docs[0].downloadToken}}`, or
`{{item.downloadToken}}` in a For each.

Without **Leave out**, a list with a field named like a token or password is
kept hidden as a whole, and nobody sees it. **Keep only** and **Leave out**
work only on values read from JSON.

## How do I use a value from one step in the next one?

Write its name in double braces anywhere after the step that saves it: in
the path, a query value, a header, the body, a condition, the closing
message - `{{token}}`, `{{coiNumber}}`.

- **A part of a value**: `{{docs[0].name}}`, `{{result.items}}`,
  `{{first(docs).date}}`.
- **Inputs**: `{{input.policy}}`.
- **Status of the step before**: `{{status}}` (HTTP status, or a script's
  exit code).
- **Secrets**: `{{secret.password}}` - only in an API call or script on that
  secret's own connection.
- **Always there**: `{{today}}`, `{{now}}`, `{{time}}`, `{{uuid}}`, and the
  record it is run for: `{{record.code}}`, `{{record.ticket}}`,
  `{{record.title}}`, `{{record.system}}`.

Type **/** in a box (or press the **{x}** button in its corner) for the list
of everything that box can use.

Values are filled in once and made safe for where they go: in the path a
value stays one piece (`/` becomes `%2F`), in a JSON body it stays in its
string, in XML it is escaped. Filters after a bar: `|upper`, `|lower`,
`|trim`, `|base64`, and `|raw` (put it in exactly as it is).

## How do I write a value or a function ({{ }} expressions)?

Inside `{{ }}` you can write a value, a part of one, or a function:

- a function has its values in brackets, separated by commas:
  `{{join(field(docs, "name"), ", ")}}`;
- text goes in quotes, numbers as they are: `{{take(docs, 5)}}`;
- functions can be inside functions: `{{count(where(docs, "type", "PDF"))}}`;
- a part after a function: `{{first(sort(users, "age")).firstName}}`.

One `{{…}}` alone keeps what it is - a list stays a list. Anything else
around it makes text with the values written in.

Functions are worked out on the page, then handed to the tray program for
that one step - so **a function cannot read a hidden value or a secret**.
Use the hidden value on its own, or a part of it: `{{token}}`,
`{{docs[0].downloadToken}}`.

## What functions can I use? (lists and numbers)

| Function | Gives |
|---|---|
| `count(list)` | how many items |
| `first(list)` / `last(list)` | the first / last item |
| `join(list, ", ")` | the items as one text |
| `field(list, "name")` | that field of every item, as a list |
| `where(list, "field", "value")` | the items whose field is that value (capitals ignored) |
| `sort(list, "field")` | sorted A to Z, small to big; add `"desc"` for the other way |
| `unique(list)` | without repeats |
| `take(list, n)` | the first n items |
| `keys(object)` | the names of its fields |
| `sum(list, "field")` | the total of that field |
| `number(text)` | a number from text |
| `add(a, b)` `sub(a, b)` `mul(a, b)` `div(a, b)` | plus, minus, times, divided by |
| `round(number, places)` | rounded: `round(div(10, 3), 2)` is 3.33 |

## What functions can I use? (text, tests and writing lists out)

| Function | Gives |
|---|---|
| `upper(text)` `lower(text)` `trim(text)` | capitals, small letters, no spaces at the ends |
| `replace(text, "find", "with")` | every "find" replaced |
| `left(text, n)` / `right(text, n)` | the first / last n characters |
| `concat(a, b, …)` | joined together |
| `split(text, ",")` | a list, cut at each comma |
| `length(text or list)` | how many characters, or items |
| `default(value, "if empty")` | the value, or the text when it is empty |
| `date(value, "dd MMM yyyy")` | a date written your way: `01 Nov 2026` |
| `addDays(date, n)` | a date n days later (`-n` earlier) |
| `base64(text)` / `json(value)` | as Base64 / as JSON text |
| `if(test, "yes", "no")` | one or the other |
| `equals(a, b)` `contains(list or text, value)` `empty(value)` `not(test)` | true or false |
| `table(list, "field", …)` | a Markdown table (no fields: every field) |
| `bullets(list, "field")` / `numbered(list, "field")` | a list, one line per item |
| `code(value)` | a JSON code block |

That is all 40. There are no others.

## How do I write a condition (a test)?

Short tests, the way you would say them:

```
{{status}} == 200          {{state}} == "DONE"        {{count}} > 0
{{coiUrl}}                 (true when it has a value)  not {{error}}
{{message}} contains "ready"    {{id}} is empty     {{id}} is not empty
{{ref}} starts with "TMP"       {{file}} ends with ".pdf"
{{a}} == 1 and ({{b}} != "x" or {{c}} > 5)
```

Compare with `==`, `!=`, `>`, `>=`, `<`, `<=`, `contains`, `not contains`,
`starts with`, `ends with`, `is empty`, `is not empty`; join tests with
`and`, `or`, `not` and brackets. `==` and `!=` ignore capitals and spaces at
the ends; two numbers are compared as numbers. A value never set is empty.
A condition cannot read a secret. Under each condition box a ✓ says it
reads well, or a ✕ says what is wrong.

## How do I make an automation go one way or another (a Condition, if / else)?

Press **+** on a line → **Condition**. The line splits: **Yes** on the
left, **No** on the right, joining again below. Put steps in each with
their own **+**, or drag cards in. Only the steps under the answer run; then
the run goes on after the Condition.

The test is built in rows - *[a value] [is equal to] [a value]* - with
**Add a test** for more, and *Go to Yes when* **all of these are true** or
**any of these is true**. The ways to compare: is equal to, is not equal to,
is greater than, is at least, is less than, is at most, contains, does not
contain, starts with, ends with, is empty, is not empty, is true, is false.
**Write it as text** for brackets or a *not*.

Good to know:

- A value saved only under **Yes** is empty when **No** ran; the checker
  warns ("only on one path").
- A Condition (or a For each) can sit inside one more, and no deeper.
- If the test cannot be read, neither branch runs, and **If the test cannot
  be read** says whether the run stops (the default) or goes on.

## How do I repeat steps for each item of a list (For each)?

Add **For each** (the **+** → *Decide and repeat*). Its **Parameters**:

- **The list** - one value that is a list: `{{docs}}`, or a function that
  gives one: `{{where(docs, "type", "PDF")}}`. Nothing else around it.
- **Call each item** - the item's name, `item` unless you change it.
- **At most** - how many items it goes through: 50 unless you change it,
  up to 200.

Put steps in the lane under it (its **+**). They run once per item, with
`{{item}}` the item (`{{item.name}}`, `{{item.id}}`), `{{loop.n}}` its
number (1, 2, 3 …) and `{{loop.count}}` how many there are.

- To collect something from each item, add **Set a value** inside it with
  **Add an item to the list**. After the loop that value is the list.
- A Condition inside it decides for each item.
- A step inside that fails stops the run, unless its own **If it fails**
  says to carry on. On the run the card says *3 of 3 items*.

## How do I keep my own value, a variable or a counter (Set a value)?

**Set a value** (+ → *Values and lists*). Its **Parameters**:

- **Name of the value** - `total`, `lines`, `files` (letters, digits, `_`).
- **How** - **Set it to**, **Add an item to the list**, **Add a number to
  it** (starts at 0), or **Add text to the end**.
- **Value** - text with `{{ }}` values and functions. One `{{…}}` alone
  keeps what it is (a list stays a list): `{{where(docs, "type", "PDF")}}`.
- **Shown to** - **Me only** or **Me and the assistant**.

Examples: count the items of a For each - *Add a number to it*, value `1`;
collect lines - *Add an item to the list*, value `{{item.title}} - {{count(comments)}} comments`.

It is worked out on the page, so it cannot read a hidden value. The Value
box does not run code: JavaScript typed there stays text.

## How do I make a new list with some fields (Shape a list)?

**Shape a list** (+ → *Values and lists*):

- **The list** - `{{users}}`.
- **Name of the value** - the new list's name, `short`.
- **The fields of each new item** - name on the left, what it holds on the
  right: `name` ← `{{item.firstName}}`, `email` ← `{{item.email}}`, `ref` ←
  `{{upper(item.ref)}}`.
- **Shown to** - **Me only** or **Me and the assistant**.

One row with no name makes a list of plain values (`{{item.name}}` alone:
just the names). Then show it at the end with `{{table(short)}}`. To only
drop fields, **Keep only** on the save row is simpler (no extra step).

## How do I keep only some items of a list (Filter a list)?

**Filter a list** (+ → *Values and lists*):

- **The list** - `{{products}}`.
- **Name of the value** - `cheap`.
- **Keep the items where** - a test on `{{item}}`: `{{item.price}} < 20`,
  `{{item.type}} == "PDF"`.
- **Shown to** - **Me only** or **Me and the assistant**.

The run card shows *2 of 3*. For a quick list in a message, the function
`{{where(docs, "type", "PDF")}}` does the same for an exact match.

## How do I end a run early (Stop the run)?

Add **Stop the run** where it should end - in a Condition's branch, or with
**Only run when** (Settings): `{{count(docs)}} == 0`.

- **End the run as** - **Done (it worked)**, **Failed** or **Stopped**.
- **Its message** - shown instead of the closing message: `No document
  found for {{input.policy}}.` (Markdown; `/` works.)

Nothing after it runs.

## How do I wait, ask before going on, or wait for a job to finish?

- **Wait** (+ → *Decide and repeat*) - a number of seconds (10 unless you change it, up to 600).
  Stop still works while it waits.
- **Ask me** (+ → *Decide and repeat*) - shows you a question, like *About to regenerate the COI for
  P10234X56. Go on?*; the run stops if you say no.
- **Wait for a job**: on the step that checks the job (a GET to
  `/jobs/{{jobId}}` that saves `state`), set **Repeat until**
  `{{state}} == "DONE"`, **every** 10 seconds, at most 20 **times**. If it
  is still not done after the last try, the step fails and says so. The
  **Submit, then wait** starter is built this way.

## How do I run one of my scripts (the Script step)?

Add **Script** and pick the script in **Parameters** - a `.bat` or `.cmd`
from **Menu → Scripts**. Its blanks (`{{marks}}` in it) become rows of
values. Each value reaches the script as `%1`, `%2` … and as a variable
`KK_` + its name in capitals: `%KK_POLICY%`.

- **Secrets from** - a connection, when the script needs one of its
  secrets: `{{secret.password}}` as a value. **(none)** otherwise.
- Save from its **Output** (what it printed), **JSON** (if it prints
  JSON), a **Pattern**, or its **Exit code**.
- **Success when** exit code is `0` (the default), or a list like `0,1`, or
  `any`.
- It runs from your workspace's `scripts` folder, as you, hidden, with a
  time limit: 120 seconds unless you change it, up to 600.
- A value with `& | < > ^ % ! " ( )` or a line break in it is **refused**:
  those characters could start a command of their own.

Nothing outside the `scripts` folder can run, and there is no PowerShell.

## How do I add a connection (an API address)?

Automations page → **Connections** tab → **New connection** (or **New…**
beside a step's connection):

- **Address** - the start of every address its steps call:
  `https://api.example.local/v1`. A step is never sent anywhere else.
- **Sign-in** - **None (or a sign-in step)**; **My Windows account** (signs
  in as you, like the browser on the intranet - nothing to save); **User
  name and password** (secrets `username` and `password`); **API key in a
  header** (secret `apiKey` in the header you name, like `X-API-Key`); **A
  fixed token (Bearer)** (secret `token`).
- **Other secrets** - more names, like `clientSecret`, used as
  `{{secret.clientSecret}}`.
- **Time limit** - seconds, at most 120. **Proxy** - **Windows proxy
  settings** or **No proxy**.

**Test the connection** sends one GET to the address and says what came
back. Up to 60 connections.

## How do I save a password, API key or token (secrets)?

Open the connection, and under **Secrets** press **Set…** beside the name;
type it and **Save the secret**. It goes straight to the KalKech program,
which keeps it in `%LOCALAPPDATA%\KalKech\secrets.dat`, **encrypted for your
Windows account on this PC**. A secret is:

- never saved in the workspace, an export, a file or the database;
- never shown again - the page only says *set on this PC* (✓) or *not set*
  (○);
- only sent to that connection's address - if the address changes, set it
  again;
- not readable on another PC or by another Windows user.

Steps write `{{secret.password}}`; the program puts the secret in at the
last moment. A function or a condition cannot read a secret.

Tip: make only real passwords and keys secrets. A user name that the API
also sends back in a reply would make that reply hidden (it contains a
secret).

## How do I sign in to an API and use the token in the next call?

The **Sign in, then call** starter does this:

1. Step 1 posts to the login API with the JSON body
   `{"username": "{{secret.username}}", "password": "{{secret.password}}"}`
   and saves `access_token` as `token`, **🔒 Hidden**.
2. Step 2 calls the other API with the header
   `Authorization: Bearer {{token}}`.

The page and the assistant never have the token: it lives in the KalKech
program for the run and is forgotten when it ends. An API that takes the
user name and password on every call needs no sign-in step: set the
connection's **Sign-in** instead.

## What if the API answers differently when it fails?

1. Save values from the error reply **On failure**: `errorMessage` from
   `error.message`.
2. For an API that answers 200 even when it failed
   (`{"success": false}`), set **Success also needs**: `{{success}} ==
   true`, or `{{errorCode}} is empty`. Save the value it reads **Always**.
3. Click **When it ends** and write **When it fails, say**:
   `Not regenerated for {{input.policy}}: {{errorMessage}}`.

With **If it fails** set to **Carry on with the next step**, the next steps
run and can use the failure values.

## How do I get the whole reply of an API (Keep the whole reply)?

In the step's **Values** tab, **Keep the whole reply**:

- **No** (the default);
- **Yes - for me** - the reply as it was sent, on the run (when it works and
  when it fails);
- **Yes - for me and the assistant** - the assistant reads it too (up to
  about 9,000 characters), to explain an error in the API's own words.

Passwords, keys and tokens are masked in it first. The run history keeps a
short copy (2,000 characters).

## How do I format the message at the end (When it ends)?

Click **When it ends**: **When it finishes, say** and **When it fails,
say** are Markdown - headings, **bold**, lists, tables, code blocks. Write:

- values and functions: `{{docs}}`, `{{docs[0].name}}`, `{{count(docs)}}`;
- a list as a table or lines: `{{table(docs, "name", "date")}}`,
  `{{bullets(docs, "name")}}`, `{{numbered(docs, "name")}}`, as JSON:
  `{{code(docs)}}`;
- a line for each item - the block tags on lines of their own:

  ```
  {{#each docs}}
  - {{name}} ({{date}})
  {{/each}}
  ```

  inside, the item's fields are names, `{{this}}` is the item, `{{loop.n}}`
  its number; `{{#each docs as d}}` names it; `{{else}}` before `{{/each}}`
  is said when the list is empty;
- only sometimes: `{{#if count(docs) > 0}}…{{else}}…{{/if}}`.

**Preview** draws it with the values of your last test or run. A run that
was stopped says neither message. Blocks (`#each`, `#if`) work in messages
and values, not in what is sent to an API.

## How do I test a step or the whole automation?

- **One step**: click it → **Test** tab → fill in the test values → **Try
  up to here**. The steps from the first to that one run for real; the tab
  shows the status, the values saved and the reply (passwords masked).
  Click a part of a JSON reply to keep it as a value.
- **The whole design**: **Test** at the top. It asks for test values, draws
  the run on the canvas and keeps nothing in the run history. **Test
  again** repeats it; **Back to the design** returns to editing.

A test is a real run: an API that changes something does change it.

## How do I run an automation, and see how it went?

- **Run** on its line, or at the top of the designer (it saves first).
  KalKech asks for the values it needs, checks them, and asks which record
  it is for, if any.
- `Ctrl`+`K` → *Run: its name*.
- In the chat: *"run regenerate COI for P10234X56"* opens the form, filled
  in. Nothing runs until you press **Run**.
- Ask the assistant for the job in your own words.

The run is drawn on the canvas as it goes: ✓ with status and time, ✕
failed, a spinner while running. Click a card for what it kept and its
reply. **Stop** stops it between steps or during a wait.

**Run history** keeps the last 40 runs, with no hidden value or secret.
Run for a record, the record's work log gets one line with the values the
assistant may see.

## How do I let the assistant (the AI) run an automation?

With the Power Automate flow on, ask for the job in your own words. The
assistant proposes the right automation with the values from what you
said; KalKech shows *Run the automation …* with its steps, and runs it only
when you press **Yes**. At most one automation runs per answer.

Three switches:

- **The assistant may run them** (top right of the Automations page) - off:
  the assistant is told about none of them.
- **The assistant may run it** (click **When you run it** → **Settings**) -
  off: that one is yours only. On for a new automation.
- **Ask me before the assistant runs it** (same place) - on for a new
  automation, and always on after an import. Switch it off only for a job
  you trust completely.

If a value is missing, or is *Typed by me (secret)*, KalKech asks you - it
never guesses.

## What does the assistant (the AI) see of my automations?

**Before a run**: each automation's name, what it does, its system, the
values it needs (name, label, kind, example), whether you are asked first,
its step names, and the names of the values it will be shown. **Never** a
connection, an address, a header, a script or a secret.

**After a run**: which automation, how it went (and why a step failed), the
values it was run with (not a secret one), the values marked **Me and the
assistant**, the closing message, and any reply set to *for me and the
assistant*. Lists come without the fields you left out.

It reads about 10,000 characters of one run - roughly 50 short list items.
For more, give it fewer fields (**Keep only**) or fewer items.

## How do I export or import automations (files)?

- **Export**: **Export** on the list toolbar (all of them), **⋯ → Export to
  a file** on a line (one), or **⋮ → Export this automation** in the
  designer (as it is, unsaved changes included). The file is JSON:
  `kalkech-automations-<date>.json`, or `<name>.kalkech-automation.json`.
- **Import**: **Import** on the list toolbar - choose a file, drop it on
  the window or the Automations page, or paste the JSON. **Menu → Import**
  of such a file opens the same window; a JSON automation file in a chat
  answer has an **Import into Automations** button.

The window shows each automation (steps, inputs, ready or what to fix) with
**Add**, **Replace yours** (same id) or **Skip** (the same name is added as
*"name (2)"*), each connection (**your connection** when you have one with
the same address and sign-in, so your secrets keep working; else **new
connection**), and any script file that is missing. **Undo** takes an import
back.

A file never contains a secret, the run history, or records. After an
import, the assistant always asks before running it; set the secrets of a
new connection on the **Connections** tab.

## What does an automation file look like?

```json
{
  "kind": "kalkech.automations",
  "version": 1,
  "automations": [
    {
      "id": "Ausers",
      "name": "Users without private fields",
      "about": "Lists users with only their name and email.",
      "inputs": [ { "key": "howMany", "label": "How many", "kind": "number", "example": "5" } ],
      "steps": [
        { "kind": "http", "name": "List users", "conn": "Cusers", "method": "GET",
          "path": "/users", "query": [ ["limit", "{{input.howMany}}"] ],
          "save": [ { "name": "users", "from": "json", "path": "users", "show": "ai",
                      "keep": "id, firstName, lastName, email" } ] }
      ],
      "result": "## {{count(users)}} users\n\n{{table(users)}}"
    }
  ],
  "connections": [
    { "id": "Cusers", "name": "Users API", "base": "https://api.example.com", "auth": "none" }
  ]
}
```

Step `kind` values: `http` (API call), `script`, `wait`, `confirm` (Ask
me), `if` (Condition), `each` (For each), `set` (Set a value), `select`
(Shape a list), `filter` (Filter a list), `stop` (Stop the run). Save-row
`show`: `hidden`, `me`, `ai`. Connection `auth`: `none`, `windows`,
`basic`, `header`, `bearer`. KalKech fills in anything not written.

## What are the limits?

| What | Limit |
|---|---|
| Steps in one automation | 40 (inside Conditions and For each too) |
| Levels | a Condition or For each inside one more, no deeper |
| Inputs | 20 |
| Saved values per step | 12 |
| Query rows, header rows | 30 each |
| Items a For each goes through | 50 unless changed, up to 200 |
| Repeat until | up to 30 times, every up to 300 seconds |
| Wait | up to 600 seconds |
| API call time limit (connection) | up to 120 seconds |
| Script time limit | 120 seconds unless changed, up to 600 |
| A request body | 100,000 characters |
| A saved text value | 4,000 characters |
| Automations / connections | 200 / 60 |
| Run history | the last 40 runs |
| What the assistant reads of one run | about 10,000 characters |

## What does the checker mean? (problems before a run)

| It says | What to do |
|---|---|
| *{{x}} is used before the step that saves it* | Move the step, or save the value earlier. |
| *{{x}} has no value - no input or earlier step gives it one* | Check the spelling, or add the input. |
| *"x" is not a name KalKech knows* / *not a function KalKech knows* | Type `/` to pick from the list. |
| *x() is given the wrong number of values* | See the function's values in the `/` list. |
| *{{x}} is saved hidden … this step cannot use it* | Show it to you, or leave its secret field out (**Leave out**). |
| *{{x}} is saved hidden, and a function is worked out on this page* | Use it alone, or a part: `{{x[0].field}}`. |
| *{{secret.x}} cannot go in a function* | Use the secret alone. |
| *A condition cannot read a secret* | Test something else. |
| *Choose a connection for this API call* | Pick one in **Parameters**. |
| *The path should start with /* | Write `/users`, not `users`. |
| *A GET or HEAD request cannot have a body* | Use POST, or remove the body. |
| *The list must be one value alone, like {{docs}}* | Nothing around the `{{…}}` in **The list**. |
| *The For each has no steps inside it yet* | Add steps in its lane. |
| *The Condition has no test yet* | Fill in its test. |
| *x looks like a token or password, and it is set to be shown to the assistant* | Choose **🔒 Hidden**. |

## Why did my run fail? (problems during a run)

| It says | What to do |
|---|---|
| *Automations need the KalKech icon by the clock* | Start `KalKech.bat`. |
| *older copy that does not know automations* | Quit KalKech from its icon and run `KalKech.bat` again. |
| *the secret "password" … has not been saved on this PC (Automations page, Connections tab …)* | Open the connection, **Set…** the secret. |
| *the address … has changed since its secret … was saved* | If the new address is right, set the secret again. |
| *the answer was 401* | The sign-in was refused: check the secret or the token step. |
| *{{token}} has no value* / *not in the reply: token* | The JSON path does not match: use **Try up to here** and click the right part. |
| *the reply says it did not work* | **Success also needs** was not true; save the error message **On failure** to see why. |
| *the address answered with a redirect … which is not followed* | Use the address it redirects to, if it is right. |
| *outside … A step only ever goes to its own connection's address* | Fix the path, or use a connection with that address. |
| *the server's certificate is not trusted on this PC* | Ask the API's owners. |
| *the value for … has & in it* | That value cannot be passed to a script. |
| *It was still not done after 20 tries* | Raise **times** or **every**. |

The KalKech program also writes one line per step to its log (icon → **Show
log**): method, address, status and time - never a value.

## Are automations safe?

- KalKech reaches no new place on the internet: the tray program calls only
  the addresses in your own connections, only when you (or the assistant,
  with your yes) run an automation.
- Secrets are write-only, encrypted for your Windows account, bound to
  their connection's address, and masked out of everything that comes back.
- Hidden values stay in the KalKech program and are forgotten when the run
  ends.
- A value cannot rewrite a request: it is filled in once and escaped for
  where it lands; a header cannot hold a line break; redirects are not
  followed.
- Scripts: only `.bat`/`.cmd` files in the workspace `scripts` folder,
  values checked, a time limit, no PowerShell.
- No code runs from a design: no JavaScript, no eval.
- The assistant proposes; you agree. It never sees a secret, a token, or a
  value you did not mark for it.

## Example: a list of users without their private fields

1. **New automation** → **Blank**. Name it *Users*.
2. **When you run it** → **Inputs**: Name `howMany`, Label *How many*, Kind
   **Number**, Example `5`.
3. The API call: Connection *Users API*, Method **GET**, Path `/users`,
   Query `limit` = `{{input.howMany}}`.
4. **Values** → **Save a value**: Name `users`, From **JSON path**, Path
   `users`, Shown to **Me and the assistant**, **Keep only**
   `id, firstName, lastName, email`.
5. **When it ends** → **When it finishes, say**:
   `## {{count(users)}} users` and on the next line `{{table(users)}}`.
6. **Save**, then **Run**.

No code and no extra step: **Keep only** removes the other fields.

## Example: do something for each item, and count

1. API call *Their posts*: GET `/posts`, save `posts` (JSON path `$`),
   **Keep only** `id, title`.
2. **For each**: The list `{{posts}}`, Call each item `post`, At most `5`.
3. Inside it: API call *Its comments*: GET `/comments`, Query `postId` =
   `{{post.id}}`, save `comments` (JSON path `$`, **Me only**).
4. Inside it: **Set a value** `lines`, **Add an item to the list**,
   `{{post.title}} - {{count(comments)}} comments`.
5. Inside it: **Set a value** `total`, **Add a number to it**,
   `{{count(comments)}}`.
6. **When it finishes, say**: `{{numbered(lines)}}` and
   `**{{total}} comments** in all.`

## Example: check, then decide

1. API call *Look it up*: GET `/products/{{input.id}}`, save `title` and
   `stock` (**On success**) and `errorMessage` from `message` (**On
   failure**).
2. **Condition** *Plenty in stock?*: `{{stock}} > 50`.
   - **Yes**: **Set a value** `verdict` = `plenty in stock`.
   - **No**: **Stop the run**, End the run as **Done (it worked)**, Its
     message `Only {{stock}} left of {{title}} - order more.`
3. **When it finishes, say**: `{{title}}: {{stock}} in stock - {{verdict}}.`
   **When it fails, say**: `Not found: {{errorMessage}}`.
