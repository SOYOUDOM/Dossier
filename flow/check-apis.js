// node flow/check-apis.js
//
// API actions and script runs, as far as they can be checked without a bridge
// or a browser. What can go wrong without anybody noticing:
//   - the recipe checker passes a recipe the bridge would refuse, or would let
//     a secret go somewhere it should not: a host filled in from an input, a
//     secret over plain http, a file named after a token;
//   - what the assistant is told about an action carries an address, a
//     header, or the name of a secret;
//   - what it is told about a result carries a value it was not meant to read,
//     a file's bytes, or a credential echoed in a failed answer or printed by
//     a script;
//   - the local assistant proposes a call for a question ABOUT the action, or
//     takes "policy" for a policy number, or changes its reading of questions
//     that have nothing to do with any action.
// The bridge itself (DossierBridge.cs) is checked by driving it, which needs
// Mono or Windows; the browser loop by Playwright. See README §16.
const fs = require("fs"), path = require("path"), vm = require("vm");
const root = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(root, f), "utf8");

global.window = { addEventListener(){}, location:{ origin:"http://127.0.0.1" } };
global.document = { createElement(){ return { style:{}, setAttribute(){}, addEventListener(){} }; },
                    body:{ appendChild(){} } };
eval(read("flow.js"));
const F = window.DossierFlow;

let bad = 0, n = 0;
const check = (ok, m) => { n++; if (!ok){ bad++; console.log("  ! " + m); } };

/* the COI example: sign in, keep the token, regenerate */
const COI = { name:"Regenerate COI", about:"Asks the insurer for a new COI",
  say:["regenerate coi", "reissue the certificate of insurance"], write:true,
  inputs:{ policy:{ label:"Policy number", pattern:"^[A-Z0-9]{6,15}$", example:"A01834A10" } },
  steps:[{ name:"Sign in", method:"POST", url:"https://auth.insurer.example/oauth/token",
           headers:{ "Content-Type":"application/x-www-form-urlencoded" },
           body:"grant_type=client_credentials&client_id={{secret:coi_id}}&client_secret={{secret:coi_secret}}",
           keep:{ token:{ from:"access_token", secret:true } } },
         { name:"Regenerate", method:"POST", url:"https://api.insurer.example/policies/{{policy}}/coi",
           headers:{ Authorization:"Bearer {{token}}", "Content-Type":"application/json" },
           body:{ reason:"requested from Resolv" }, keep:{ status:"status", document:"document.url" } }],
  share:["status", "document"] };
const copy = f => { const r = JSON.parse(JSON.stringify(COI)); f(r); return F.checkApi(r); };
const refused = (res, re, m) => check(!res.ok && res.bad.some(b => re.test(b)), m + " - got: " + JSON.stringify(res.bad));

/* ── the recipe checker ──────────────────────────────────────────────── */
const c = F.checkApi(COI, [COI]);
check(c.ok && !c.warn.length, "the COI example should pass cleanly: " + c.bad.concat(c.warn).join(" | "));
check(c.secrets.join() === "coi_id,coi_secret" && c.hosts.join() === "auth.insurer.example,api.insurer.example",
      "secrets and hosts read wrong: " + c.secrets + " / " + c.hosts);
check(JSON.stringify(c.secretHosts) === '{"coi_id":["auth.insurer.example"],"coi_secret":["auth.insurer.example"]}',
      "where each secret goes read wrong: " + JSON.stringify(c.secretHosts));
refused(copy(r => { r.steps[1].url = "https://{{policy}}.insurer.example/coi"; }), /host in the address/, "a host filled in from an input");
refused(copy(r => { r.steps[1].url = "https://x{{policy}}@api.insurer.example/coi"; }), /host in the address/, "an address with a filled-in user part");
refused(copy(r => { r.steps[1].url = "http://api.insurer.example/p/{{policy}}"; }), /plain http/, "a token over plain http");
check(copy(r => { r.steps[1].url = "http://127.0.0.1:9901/p/{{policy}}"; }).ok, "plain http to this machine may carry one");
refused(copy(r => { r.steps[1].headers.Authorization = "Bearer {{tokn}}"; }), /\{\{tokn\}\} is not an input/, "an unknown placeholder");
refused(copy(r => { r.steps[0].body += "&x={{token}}"; }), /\{\{token\}\} is not an input/, "a value used before the step that keeps it");
refused(copy(r => { r.inputs.policy.pattern = "([A-Z"; }), /not a regular expression/, "a pattern that does not compile");
refused(copy(r => { r.inputs.policy.example = "a1"; }), /does not match its own pattern/, "an example its own pattern refuses");
refused(copy(r => { r.steps[0].method = "TRACE"; }), /not GET, POST/, "a method outside the five");
refused(copy(r => { r.steps[0].headers.Host = "evil.example"; }), /belongs to the connection/, "a Host header");
refused(copy(r => { r.steps[1].save = "{{token}}.pdf"; }), /cannot be made from a secret/, "a file named after a secret");
refused(copy(r => { r.steps[0].keep.token = { from:"a", header:"b" }; }), /takes one of/, "a kept value taken two ways at once");
refused(copy(r => { r.steps = []; }), /at least one step/, "no steps");
refused(F.checkApi(COI, [COI, { name:"regenerate coi" }]), /already an API action/, "two actions of one name");
check(copy(r => { r.share = ["nope"]; }).warn.some(w => /no step keeps/.test(w)), "share naming nothing should warn");
check(copy(r => { delete r.inputs.policy.pattern; }).warn.some(w => /no pattern/.test(w)), "an input with no pattern should warn");

/* ── what the assistant is told about an action ──────────────────────── */
const s = F.apiSummary(COI);
check(s.name === "Regenerate COI" && s.write === true && s.inputs[0].name === "policy" && s.inputs[0].pattern &&
      s.gives.join() === "status,document" && s.handles.join() === "token", "the summary reads wrong: " + JSON.stringify(s));
check(!/insurer\.example|oauth|coi_id|coi_secret|Bearer|Content-Type/.test(JSON.stringify(s)),
      "the summary carries an address, a header or a secret's name: " + JSON.stringify(s));
const noShare = JSON.parse(JSON.stringify(COI)); delete noShare.share;
check(F.apiSummary(noShare).gives.join() === "status,document", "without share, every value that is not secret is given");
const req = F.buildRequest("regenerate the coi", { settings:{}, tasks:[], apis:[COI], results:[] }, { scope:"names" });
/* the prompt's own examples name docs.insurer.example; nothing else may */
check(req.workspace.apis.length === 1 && !/insurer\.example/.test(JSON.stringify(req.workspace)) &&
      !/oauth|coi_id|coi_secret|auth\.insurer|api\.insurer/.test(JSON.stringify(req)),
      "the request carries more of the action than its summary");
check(/callApi\(/.test(req.prompt) && /THEIR APIS AND SCRIPTS/.test(req.prompt), "the prompt does not describe callApi");
const v = F.validate({ say:"x", actions:[{ do:"callApi", api:"Regenerate COI", params:{ policy:"A01834A10" } },
                                         { do:"runScript", script:"restart-app-pool", args:{ server:"APP02" } }] });
check(v.actions.length === 2 && !v.refused.length && v.actions.every(a => a.write), "callApi and runScript should validate as writes");

/* ── what it is told about a result ──────────────────────────────────── */
const TOKEN = "tok-not-a-real-token", ISSUED = "fake.jwt.not-a-real-signature";
const res = { name:"Regenerate COI", ok:true, revealed:[], error:"", failedStep:"",
  steps:[{ name:"Sign in", status:200, ok:true, host:"auth.insurer.example", url:"https://auth.insurer.example/oauth/token" },
         { name:"Regenerate", status:200, ok:true, host:"api.insurer.example", url:"https://api.insurer.example/policies/A01834A10/coi" }],
  values:{ status:"queued", document:"https://docs.example/coi/A01834A10.pdf", internal:"not for the model" },
  kept:{ token:{ handle:"@kept:abcdefghijklmnopqrst", expires:"2026-10-28T10:30:00Z", hosts:["auth.insurer.example"] } },
  files:[{ name:"COI A01834A10.pdf", type:"application/pdf", size:9, data:"JVBERi0x" }] };
const m = F.apiResult(COI, res, { params:{ policy:"A01834A10" }, fresh:true });
check(m.new && m.ok && m.values.status === "queued" && !("internal" in m.values), "values not in share reached it: " + JSON.stringify(m.values));
check(m.handles.token === "@kept:abcdefghijklmnopqrst" && m.handlesExpire, "the handle did not reach it");
check(!("data" in m.files[0]) && !/insurer\.example/.test(JSON.stringify(m)), "a file's bytes, a host or an address reached it");
const failed = F.apiResult(COI, { name:"Regenerate COI", ok:false, failedStep:"Regenerate", error:"Regenerate answered 404 Not Found.",
  steps:[{ name:"Sign in", status:200, ok:true }, { name:"Regenerate", status:404, ok:false,
          excerpt:'{"error":"no such policy","access_token":"' + TOKEN + '","auth":"Bearer ' + ISSUED + '"}' }], values:{}, kept:{} }, {});
check(/no such policy/.test(failed.steps[1].answered) && failed.steps[1].answered.indexOf(TOKEN) < 0 &&
      failed.steps[1].answered.indexOf(ISSUED) < 0, "a credential echoed in a failed answer reached it: " + failed.steps[1].answered);
const sr = F.scriptResult({ name:"restart-app-pool", file:"restart-app-pool.bat" },
  { exit:0, output:"Recycling\r\nAuthorization: Basic dXNlcjpwYXNzd29yZA==\nset password=not-a-real-password\nStarted" }, { fresh:true });
check(sr.ok && sr.new && /Started/.test(sr.output) && !/dXNlcjpwYXNzd29yZA|not-a-real-password/.test(sr.output),
      "a credential printed by a script reached it: " + sr.output);
const long = F.scriptResult({ name:"x" }, { exit:3, output:"A".repeat(5000) + "THE END" });
check(!long.ok && long.cut && long.output.length <= 3001 && /THE END$/.test(long.output), "a long output should keep its end");
check(F.scrub("the token expired\npassword:\nnext line") === "the token expired\npassword:\nnext line",
      "the scrub ate ordinary prose: " + JSON.stringify(F.scrub("the token expired\npassword:\nnext line")));

/* ── the local assistant ─────────────────────────────────────────────── */
const ctx = vm.createContext({ window:{ addEventListener(){} }, console, Date, Math, JSON, Object, Array, String,
  Number, RegExp, Set, Map, WeakMap, isNaN, parseInt, parseFloat, Intl });
vm.runInContext(read("chat.js"), ctx, { filename:"chat.js" });
const ask = (q, a) => { ctx.__q = q; ctx.__a = a; return vm.runInContext("window.DossierChat.ask(__q, __a)", ctx, { timeout:3000 }); };
const pad2 = x => String(x).padStart(2, "0");
const dkey = d => { const x = d instanceof Date ? d : new Date(d); return x.getFullYear() + "-" + pad2(x.getMonth() + 1) + "-" + pad2(x.getDate()); };
const day = k => new Date(String(k).slice(0, 10) + "T00:00:00");
const ws = JSON.parse(read("demo/dossier.json"));
const h = new Proxy({
  tok: x => String(x || "").toLowerCase().split(/\W+/).filter(Boolean), idf: () => 1, similar: () => [],
  today: () => dkey(new Date()), dkey, dayOf: x => String(x || "").slice(0, 10),
  addDays: (k, d) => dkey(new Date(day(k).getTime() + d * 864e5)), dow: k => day(k).getDay(),
  mondayOf: k => { const d = day(k); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dkey(d); },
  niceDate: k => String(k), mins: x => x + "m", live: () => 0, peopleOf: t => t.people || [],
  canonPerson: x => x, splitPeople: x => [x], knownValues: () => [], repeatCandidates: () => [],
  findByRef: r => (ws.tasks || []).find(t => t.code === String(r).toUpperCase()) || null,
  stMeta: x => ({ label:x }), waitDays: () => 1, chaseDays: () => 1,
  LIVE:["open", "processing", "blocked"], PRIS:["P1", "P2", "P3", "P4"]
}, { get: (o, k) => k in o ? o[k] : (() => null) });
const DL = { name:"Download COI", say:["download the coi"],
  inputs:{ policy:{ label:"Policy number", pattern:"^[A-Z0-9]{6,15}$" }, token:{ label:"the insurer token", kept:true } },
  steps:[{ name:"Get", method:"GET", url:"https://docs.insurer.example/coi/{{policy}}.pdf",
           headers:{ Authorization:"Bearer {{token}}" }, save:"COI {{policy}}.pdf" }] };
const api = extra => Object.assign({ tasks:ws.tasks || [], routines:ws.routines || [], scripts:ws.scripts || [],
  settings:ws.settings || {}, now:Date.now(), cacheKey:"apis" + Math.random(), memory:{}, aliases:[], convo:{},
  phrase: p => (p && p.k) || "", ai:null, ctx: () => ({}), h, docs:null, docsState:"none", version:"", built:"",
  apis:[COI, DL], apiKept:{} }, extra || {});

let r = ask("help me to regenerate COI of this policy A01834A10", api());
check(r.intent === "callApi" && r.act && r.act.api === "Regenerate COI" && r.act.params.policy === "A01834A10" && r.act.must === true,
      "the COI request should propose Regenerate COI for A01834A10, asked first: " + JSON.stringify(r.act));
check(/auth\.insurer\.example/.test(r.note) && /never see/.test(r.note), "the question should say where it goes: " + r.note);
r = ask("regenerate coi for a01834a10 please", api());
check(r.act && r.act.params.policy === "A01834A10", "a lower-case number should be read in the case its pattern wants");
r = ask("regenerate the coi for this policy", api());
check(!r.act && /Which Policy number/.test(r.say) && r.context.apiPending, "\"policy\" was taken for a policy number: " + JSON.stringify(r.act || r.say));
const next = ask("A01834A10", api({ convo:r.context }));
check(next.act && next.act.params.policy === "A01834A10", "the number on its own should answer \"which policy number?\"");
check(ask("what is overdue", api({ convo:r.context })).intent === "overdue", "a new question after it should be read as itself");
["why does regenerate coi keep failing for A01834A10", "how do I regenerate the coi",
 "COI not generating for A018346A10, I clicked generate and it went through"].forEach(q =>
  check(ask(q, api()).intent !== "callApi", "a question about the action was taken for a call: " + q));
r = ask("download the coi for A01834A10", api());
check(!r.act && /which an earlier call keeps/.test(r.say), "an action needing a kept value should say so: " + r.say);
r = ask("download the coi for A01834A10", api({ apiKept:{ token:{ handle:"@kept:abcdefghijklmnopqrst" } } }));
check(r.act && r.act.api === "Download COI" && !("token" in r.act.params), "the kept input should be left to the page: " + JSON.stringify(r.act));
r = ask("regenerate coi for A01834A10 on D-0001", api());
check(r.act && r.act.record === "D-0001" && r.act.params.policy === "A01834A10", "a record named should go with the call, not be taken for the policy");
["what is overdue", "what should I do next", "who am I waiting on", "close D-0001", "run restart-app-pool on D-0001",
 "create a p1 to restart the imaging pool on APP02 tomorrow", "remind me every day at 9 to check the queue",
 "regenerate the index", "generate a report for this week", "call sokha about the coi", "policy A01834A10", "hello"
].forEach(q => {
  const a = ask(q, api({ apis:undefined, apiKept:undefined })), b = ask(q, api());
  check(a.intent === b.intent, "\"" + q + "\" reads as " + a.intent + " without API actions and " + b.intent + " with them");
});

console.log("api actions: " + n + " checks - " + (bad ? bad + " problem(s)" : "all good"));
process.exit(bad ? 1 : 0);
