// node flow/check-prompt.js
//
// flow/prompt.txt is what the model reads. This checks it the ways it can
// go wrong without anybody noticing:
//   - every example reply in it passes the validator Dossier applies to real
//     replies (a model copies its examples; one Dossier would refuse teaches
//     it to be refused), and uses only actions that exist;
//   - it still has each of the nine places Dossier fills in;
//   - the copy inside flow.js is the same text (python flow/embed-prompt.py
//     puts it there), because a page opened from the folder uses that copy;
//   - filled in with a real request, nothing is left unfilled and the notes
//     are not sent twice.
const fs = require("fs"), path = require("path");
const here = __dirname;
global.window = { addEventListener(){}, location:{ origin:"http://127.0.0.1" } };
global.document = { createElement(){ return { style:{}, setAttribute(){}, addEventListener(){} }; },
                    body:{ appendChild(){} } };
eval(fs.readFileSync(path.join(here, "..", "flow.js"), "utf8"));
const F = window.DossierFlow;

const text = fs.readFileSync(path.join(here, "prompt.txt"), "utf8").replace(/\r\n/g, "\n");
const lines = text.split("\n");
let bad = 0, n = 0;
const say = m => { bad++; console.log("  ! " + m); };

lines.forEach((l, i) => {
  if (!l.startsWith("{") || /^\{\w+\}$/.test(l.trim()) || /^\{"say":"\.\.\."/.test(l)) return;
  n++;
  let obj;
  try { obj = JSON.parse(l); } catch (e) { return say("line " + (i + 1) + " is not JSON: " + e.message); }
  const v = F.validate(obj);
  if ((v.refused || []).length) say("line " + (i + 1) + " would be refused: " + v.refused.join(" | "));
});
new Set((text.match(/"do":"(\w+)"/g) || []).map(x => x.slice(6, -1)))
  .forEach(d => { if (!F.ACTIONS[d]) say("an example uses \"" + d + "\", which is not an action"); });
F.promptGaps(text).forEach(k => say("prompt.txt no longer has {" + k + "}"));
if (F.PROMPT !== text) say("the copy inside flow.js differs from prompt.txt - run: python flow/embed-prompt.py");

const sample = JSON.parse(fs.readFileSync(path.join(here, "sample-request.json"), "utf8"));
const filled = F.fillPrompt(text, sample);
const left = filled.match(/\{(message|today|weekday|calendar|workspace|actions|history|memory|attached)\}/g);
if (left) say("left unfilled: " + left.join(" "));
const ws = JSON.parse(F.fillPrompt("{workspace}", sample));
if ("memory" in ws) say("the notes go twice: once in {memory} and again inside {workspace}");
if ((sample.workspace.memory || []).length && F.fillPrompt("{memory}", sample) === "[]") say("{memory} came out empty");

console.log("prompt.txt: " + Buffer.byteLength(text) + " bytes, " + n + " example replies checked; " +
            "filled with the sample request: " + Buffer.byteLength(filled) + " bytes - " +
            (bad ? bad + " problem(s)" : "all good"));
process.exit(bad ? 1 : 0);
