// node flow/check-prompt.js
//
// Every example reply in the prompt, in POWER-AUTOMATE.md, run through the
// same validator Dossier applies to a real reply. A model copies the shape of
// its examples; an example Dossier would refuse teaches it to be refused.
// Also: no example may use an action that does not exist, and the prompt
// must still carry each of the nine inputs.
const fs = require("fs"), path = require("path");
const here = __dirname;
global.window = { addEventListener(){}, location:{ origin:"http://127.0.0.1" } };
global.document = { createElement(){ return { style:{}, setAttribute(){}, addEventListener(){} }; },
                    body:{ appendChild(){} } };
eval(fs.readFileSync(path.join(here, "..", "flow.js"), "utf8"));
const F = window.DossierFlow;

const md = fs.readFileSync(path.join(here, "POWER-AUTOMATE.md"), "utf8").split("\n");
const start = md.indexOf("### The prompt");
const open = md.indexOf("```", start);
const close = md.indexOf("```", open + 1);
const lines = md.slice(open + 1, close);
const text = lines.join("\n");

let bad = 0, n = 0;
const say = m => { bad++; console.log("  ! " + m); };
lines.forEach((l, i) => {
  if (!l.startsWith("{") || /^\{\w+\}$/.test(l.trim()) || /^\{"say":"\.\.\."/.test(l)) return;
  n++;
  let obj;
  try { obj = JSON.parse(l); } catch (e) { return say("prompt line " + (i + 1) + " is not JSON: " + e.message); }
  const v = F.validate(obj);
  if ((v.refused || []).length) say("prompt line " + (i + 1) + " would be refused: " + v.refused.join(" | "));
});
new Set((text.match(/"do":"(\w+)"/g) || []).map(x => x.slice(6, -1)))
  .forEach(d => { if (!F.ACTIONS[d]) say("an example uses \"" + d + "\", which is not an action"); });
["message","today","weekday","calendar","workspace","actions","history","memory","attached"]
  .forEach(k => { if (text.indexOf("{" + k + "}") < 0) say("the prompt no longer has the {" + k + "} input"); });

console.log("prompt: " + Buffer.byteLength(text) + " bytes, " + n + " example replies checked, " +
            (bad ? bad + " problem(s)" : "all valid"));
process.exit(bad ? 1 : 0);
