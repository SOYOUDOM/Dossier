// node --test tests/
//
// Diagrams the assistant writes (diagram.js): the Mermaid it is asked to use
// is read, laid out without boxes or labels landing on one another, and
// drawn as a picture whose words are text, never markup. A kind it does not
// draw is refused, so the app can show the code instead.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const D = require("../diagram.js");

const overlap = (a, b, pad) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;
function noOverlaps(r, name){
  const bx = r.boxes || [];
  for (let i = 0; i < bx.length; i++)
    for (let j = i + 1; j < bx.length; j++)
      assert.ok(!overlap(bx[i], bx[j], -1), name + ": " + (bx[i].id || bx[i].text) + " overlaps " + (bx[j].id || bx[j].text));
}

const FLOW = `flowchart TD
  A[Request received] --> B{Policy found?}
  B -->|Yes| C[Add credit in Member Portal]
  B -->|No| D[Ask requester for the policy number]
  D --> A
  C --> E[Check the balance]
  E --> F([Close the record])`;

test("a flowchart: boxes, shapes, labelled arrows, and a loop back", () => {
  const r = D.draw(FLOW);
  assert.equal(r.ok, true);
  assert.equal(r.kind, "flowchart");
  const m = r.model;
  assert.deepEqual(m.nodes.map(n => n.id), ["A", "B", "C", "D", "E", "F"]);
  assert.equal(m.nodes.find(n => n.id === "B").shape, "diamond");
  assert.equal(m.nodes.find(n => n.id === "F").shape, "stadium");
  assert.deepEqual(m.edges.map(e => e.from + ">" + e.to + (e.label ? ":" + e.label : "")),
    ["A>B", "B>C:Yes", "B>D:No", "D>A", "C>E", "E>F"]);
  assert.match(r.svg, /^<svg [^>]*class="dg-root"/);
  assert.ok(r.width > 100 && r.height > 200);
  noOverlaps(r, "flow");
});

test("every way an arrow is written in Mermaid", () => {
  const m = D.parse(`graph LR
    A -- yes --> B
    B -.-> C
    C ==> D
    D <--> E
    E --- F
    F -. maybe .-> G
    G == sure ==> H
    H -->|"quoted label"| I
    J & K --> L --> M`).model;
  const e = k => m.edges.find(x => x.from + x.to === k);
  assert.equal(m.dir, "LR");
  assert.deepEqual([e("AB").label, e("AB").head], ["yes", true]);
  assert.equal(e("BC").style, "dot");
  assert.equal(e("CD").style, "thick");
  assert.deepEqual([e("DE").head, e("DE").tail], [true, true]);
  assert.equal(e("EF").head, false);
  assert.deepEqual([e("FG").label, e("FG").style], ["maybe", "dot"]);
  assert.deepEqual([e("GH").label, e("GH").style], ["sure", "thick"]);
  assert.equal(e("HI").label, "quoted label");
  assert.ok(e("JL") && e("KL") && e("LM"), "& and chains");
});

test("shapes, quoted labels with brackets, line breaks and subgraphs", () => {
  const m = D.parse(`flowchart TD
    subgraph App [Member Portal]
      a(Log in) --> b[["Rewards (tab)"]]
    end
    c((Start)) --> d[(POLICY_MASTER)] --> e{{"Line one<br/>line two"}}
    b --> d`).model;
  const n = id => m.nodes.find(x => x.id === id);
  assert.equal(n("a").shape, "round");
  assert.deepEqual([n("b").shape, n("b").label], ["sub", "Rewards (tab)"]);
  assert.equal(n("c").shape, "circle");
  assert.equal(n("d").shape, "db");
  assert.deepEqual([n("e").shape, n("e").label], ["hex", "Line one\nline two"]);
  assert.deepEqual(m.groups.map(g => [g.title, g.members.join()]), [["Member Portal", "a,b"]]);
  noOverlaps(D.draw(`flowchart TD
    subgraph App [Member Portal]
      a(Log in) --> b[["Rewards (tab)"]]
    end
    c((Start)) --> d[(POLICY_MASTER)] --> e{{"Line one<br/>line two"}}
    b --> d`), "shapes");
});

test("labels never land on boxes or on each other, top-down or left-right", () => {
  const states = `stateDiagram-v2
    [*] --> Open
    Open --> Processing : start
    Processing --> Blocked : waiting on someone
    Blocked --> Processing : unblocked
    Processing --> Done : fixed
    Done --> [*]
    Open --> Cancelled
    Cancelled --> [*]`;
  const r = D.draw(states);
  assert.equal(r.ok, true);
  assert.equal(r.kind, "state");
  assert.equal(r.boxes.filter(b => b.kind === "label").length, 4);
  noOverlaps(r, "states");
  noOverlaps(D.draw(FLOW.replace("flowchart TD", "flowchart LR")), "flow LR");
  noOverlaps(D.draw(FLOW.replace("flowchart TD", "flowchart BT")), "flow BT");
  /* a wide fan-out with labels on every arrow */
  const fan = ["flowchart TD", "  S[Start] --> T{Which team?}"].concat(
    ["Payments", "Imaging", "Portal", "Claims", "Policy admin"].map((t, i) => "  T -->|" + t + " issue| N" + i + "[" + t + " runbook]")).join("\n");
  noOverlaps(D.draw(fan), "fan-out");
});

test("a sequence diagram: participants, messages, notes, frames, numbers", () => {
  const r = D.draw(`sequenceDiagram
    autonumber
    actor U as You
    participant R as Resolv
    participant F as Power Automate flow
    U->>R: Ask a question
    R->>R: Search Sources
    R->>F: Question + passages
    F-->>R: Reply
    alt figure not in passages
      R-->>U: Line taken out
    else all good
      R-->>U: Answer with source
    end
    Note over R,F: Only the flow address leaves the PC
    R-xF: cancelled`);
  assert.equal(r.ok, true);
  assert.equal(r.kind, "sequence");
  const m = r.model;
  assert.deepEqual(m.actors.map(a => [a.id, a.label, a.kind]),
    [["U", "You", "actor"], ["R", "Resolv", "participant"], ["F", "Power Automate flow", "participant"]]);
  const msgs = m.items.filter(i => i.kind === "msg");
  assert.equal(msgs.length, 7);
  assert.deepEqual([msgs[3].dashed, msgs[3].head], [true, "arrow"]);
  assert.equal(msgs[6].head, "cross");
  assert.deepEqual(m.items.filter(i => i.kind !== "msg").map(i => i.kind), ["open", "split", "close", "note"]);
  assert.equal(m.auto, true);
  assert.equal((r.svg.match(/class="dg-num"/g) || []).length, 7);
  assert.match(r.svg, /\[figure not in passages\]/);
  /* the frame starts inside the picture */
  const fx = /class="dg-frame[^"]*" x="([-\d.]+)"/.exec(r.svg);
  assert.ok(fx && +fx[1] >= 0, "frame x " + (fx && fx[1]));
});

test("words are text, never markup", () => {
  const r = D.draw(`flowchart TD
    A["<script>alert(1)</script>"] -->|"<img src=x onerror=alert(1)>"| B["a & b"]`);
  assert.equal(r.ok, true);
  /* tags are taken out of a label (a line break is kept as a line), and
     what is left is escaped: no element reaches the page */
  assert.ok(!/<script|<img|onerror/i.test(r.svg));
  assert.match(r.svg, /<tspan x="[\d.]+">alert\(1\)<\/tspan>/);
  assert.match(r.svg, /a &amp; b/);
  assert.match(D.draw('flowchart TD\n  A["1 < 2 and 3 > 2"] --> B').svg, /1 &lt; 2 and 3 &gt; 2/);
});

test("a kind it does not draw, or nothing to draw, is refused - the app shows the code", () => {
  assert.deepEqual(D.draw("pie title Pets\n  \"Dogs\" : 386"), { ok:false, error:"unsupported", kind:"pie" });
  assert.equal(D.draw("gantt\n  title A plan").ok, false);
  assert.equal(D.draw("").ok, false);
  assert.equal(D.draw("flowchart TD").ok, false);
  const big = ["flowchart TD"].concat(Array.from({ length:120 }, (_, i) => "  N" + i + " --> N" + (i + 1))).join("\n");
  assert.deepEqual(D.draw(big), { ok:false, error:"too big" });
});

test("styling lines are left out quietly, and a title is read from the front matter", () => {
  const r = D.draw(`---
title: Rewards credit
---
flowchart LR
  classDef hot fill:#f00
  A[One]:::hot --> B[Two]
  style A fill:#0f0
  click A "https://example.com"
  linkStyle 0 stroke:#f00`);
  assert.equal(r.ok, true);
  assert.equal(r.model.title, "Rewards credit");
  assert.deepEqual(r.model.nodes.map(n => n.id), ["A", "B"]);
  assert.match(r.svg, /class="dg-title"[^>]*>Rewards credit</);
});

test("the colours go inside the picture only when asked - for a copy or a saved file", () => {
  assert.ok(!/<style>/.test(D.draw(FLOW).svg));
  const t = { bg:"#ffffff", node:"#fff", stroke:"#d31145", dec:"#fde", text:"#111", dim:"#666", edge:"#777", soft:"#ddd",
              group:"#fafafa", note:"#ffe", noteLine:"#dd9", accent:"#d31145", onAccent:"#fff" };
  const r = D.draw(FLOW, { theme:t });
  assert.match(r.svg, /<style>.*\.dg-node\{fill:#fff;stroke:#d31145/);
  assert.match(r.svg, /<rect [^>]*fill="#ffffff"/);
});

test("the prompt's own example draws", () => {
  const prompt = fs.readFileSync(path.join(__dirname, "..", "flow", "prompt.txt"), "utf8");
  const ex = /Message: "draw how a password reset request is handled"\n(\{.*\})/.exec(prompt);
  assert.ok(ex, "the example is in the prompt");
  const say = JSON.parse(ex[1]).say;
  /* tildes, not backticks: a flow's Clean step that strips ``` from the
     model's reply would leave the diagram as bare text */
  assert.ok(!/```/.test(say), "the example fences the diagram with ~~~");
  const block = /~~~mermaid\n([\s\S]*?)~~~/.exec(say)[1];
  const r = D.draw(block);
  assert.equal(r.ok, true);
  assert.equal(r.model.nodes.length, 5);
  noOverlaps(r, "prompt example");
});
