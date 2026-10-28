/* diagram.js - Resolv draws the diagrams the assistant writes.

   The assistant can think in pictures - the steps of a fix, who hands what
   to whom, the states a record goes through - and it writes them the way
   every language model already knows how to: a ```mermaid block. This file
   turns that text into a picture, here, on the PC. There is no library and
   no fetch: Mermaid itself is three megabytes of somebody else's code that
   would have to come from the internet or be carried in this folder, and
   the assistant only ever needs a small part of what it does. So this is
   that part, written for Resolv:

     flowchart TD / LR / BT / RL  (and "graph", the older name for it)
       boxes A[..], rounded A(..), stadium A([..]), decisions A{..},
       circles A((..)), databases A[(..)], hexagons A{{..}}; arrows -->,
       ---, -.->, ==>, <-->, labels -->|yes| or -- yes -->, chains
       A --> B --> C, A & B --> C, and subgraph ... end
     sequenceDiagram
       participant / actor (with "as"), ->> -->> -> --> -x -) messages,
       notes (left of, right of, over), loop / alt / else / opt / par /
       and / critical / break / rect ... end, autonumber, title
     stateDiagram / stateDiagram-v2
       [*] --> A, A --> B : label, state "Long name" as A, A : name,
       state A { ... } around a group

   What it does not understand it leaves out quietly (classDef, style,
   click, links), and a diagram of another kind - a pie, a Gantt chart - is
   not drawn at all: the app shows the code, as it always did.

   The layout is the usual one for this kind of picture, in four steps:
   every box gets a rank (a row, or a column when the diagram goes left to
   right) so arrows mostly point one way; an arrow that skips ranks is given
   a hidden waypoint on each one it passes; the boxes on each rank are put in
   the order that crosses the fewest arrows; and each box is slid towards the
   boxes it is joined to, without overlapping its neighbours. The arrows are
   curves through their waypoints.

   Pure: no DOM. draw(text, opts) returns { ok, svg, width, height, kind,
   model } or { ok:false, error }. The app passes opts.measure, so text is
   measured in the font it is drawn in; without it, a width is estimated from
   the characters. opts.theme puts the colours inside the picture (for a copy
   or a saved file); without it the picture carries class names only, and
   the page's stylesheet colours it, so it follows the chat's skin and its
   light and dark modes as they change. window.DossierDiagram and
   module.exports. */
(function(root){
"use strict";

const VERSION = 1;
const LIMITS = { nodes:90, edges:180, items:160, label:240 };
const FONT = { family:'"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, "Dossier Khmer", sans-serif', size:13 };
const LH = 17;                     /* one line of text in a box */
const MARGIN = 14;

/* ═══ text ═══════════════════════════════════════════════════════════════ */
function xml(s){
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
/* A label as it was written - quotes, <br>, the entity names Mermaid uses
   for characters its own syntax would trip over - as plain text with its
   line breaks. Markdown inside a label (`**`, backticks) is taken out: it is
   a box, not a paragraph. */
function plain(s){
  let t = String(s == null ? "" : s).trim();
  if (/^".*"$/.test(t)) t = t.slice(1, -1);
  if (/^`.*`$/.test(t)) t = t.slice(1, -1);
  t = t.replace(/<br\s*\/?>/gi, "\n").replace(/\\n/g, "\n")
       .replace(/#quot;/g, "\"").replace(/#amp;/g, "&").replace(/#lt;/g, "<").replace(/#gt;/g, ">").replace(/#35;/g, "#")
       .replace(/#(\d{2,5});/g, (m, n) => String.fromCharCode(+n))
       .replace(/\*\*|__|`/g, "").replace(/<\/?[a-z][^>]*>/gi, "");
  return t.split("\n").map(x => x.trim()).join("\n").trim().slice(0, LIMITS.label);
}
/* how wide a run of text is, without a canvas: by the shape of each
   character, at the size given. Close enough for boxes to fit their words;
   the app measures properly when it can. */
function estimate(text, size){
  let w = 0;
  for (const ch of String(text)){
    const c = ch.codePointAt(0);
    if (c >= 0x1100 && (c <= 0x11ff || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xff00 && c <= 0xffef))) w += 1.0;
    else if (c >= 0x1780 && c <= 0x17ff) w += 0.75;           /* Khmer */
    else if (/[il.,:;'|!\[\]()\/]/.test(ch)) w += 0.3;
    else if (/[ fjrt]/.test(ch)) w += 0.36;
    else if (/[mwMW@%]/.test(ch)) w += 0.88;
    else if (/[A-Z]/.test(ch)) w += 0.66;
    else if (/[0-9]/.test(ch)) w += 0.56;
    else w += 0.54;
  }
  return w * (size || FONT.size);
}
/* words into lines no wider than max; a word longer than a line is broken */
function wrap(text, max, measure){
  const out = [];
  String(text).split("\n").forEach(par => {
    const words = par.split(/\s+/).filter(Boolean);
    if (!words.length){ out.push(""); return; }
    let line = "";
    words.forEach(w => {
      const next = line ? line + " " + w : w;
      if (!line || measure(next) <= max){ line = next; return; }
      out.push(line);
      line = w;
    });
    while (measure(line) > max * 1.25 && line.length > 8){
      let cut = line.length - 1;
      while (cut > 4 && measure(line.slice(0, cut)) > max) cut--;
      out.push(line.slice(0, cut) + "-");
      line = line.slice(cut);
    }
    out.push(line);
  });
  return out.length ? out : [""];
}

/* ═══ reading the text ═══════════════════════════════════════════════════ */
/* Statements: one a line, or several on a line split by ";" - except inside
   brackets and quotes, where a semicolon is part of a label. */
function statements(src){
  const out = [];
  String(src).replace(/\r\n?/g, "\n").split("\n").forEach(raw => {
    const line = raw.replace(/%%.*$/, "").trim();
    if (!line) return;
    let depth = 0, q = false, cur = "";
    for (const ch of line){
      if (ch === "\"") q = !q;
      if (!q && "[({".indexOf(ch) >= 0) depth++;
      if (!q && "])}".indexOf(ch) >= 0) depth = Math.max(0, depth - 1);
      if (ch === ";" && !q && !depth){ if (cur.trim()) out.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
  });
  return out;
}
/* a title, from Mermaid's front matter (---\ntitle: X\n---) */
function frontMatter(src){
  const m = /^\s*---\s*\n([\s\S]*?)\n\s*---\s*\n?/.exec(String(src));
  if (!m) return { title:"", rest:String(src) };
  const t = /^\s*title\s*:\s*(.+)$/mi.exec(m[1]);
  return { title:t ? plain(t[1]) : "", rest:String(src).slice(m[0].length) };
}
function parse(src){
  const fm = frontMatter(src);
  const lines = statements(fm.rest);
  if (!lines.length) return { ok:false, error:"empty" };
  const head = lines[0];
  let m;
  if ((m = /^(?:flowchart|graph)\b\s*(TD|TB|BT|LR|RL)?\s*$/i.exec(head))) return parseFlow(lines.slice(1), (m[1] || "TD").toUpperCase(), fm.title);
  if (/^sequenceDiagram\b/i.test(head)) return parseSequence(lines.slice(1), fm.title);
  if (/^stateDiagram(?:-v2)?\b/i.test(head)) return parseState(lines.slice(1), fm.title);
  /* no header, but plainly a flowchart: A --> B */
  if (/^[\w\u0080-￿]+.*(-->|---|==>|-\.->)/.test(head)) return parseFlow(lines, "TD", fm.title);
  return { ok:false, error:"unsupported", kind:(/^\s*([A-Za-z-]+)/.exec(head) || [0, "unknown"])[1] };
}

/* ── flowchart ────────────────────────────────────────────────────────── */
const SHAPES = [
  ["([", "])", "stadium"], ["[(", ")]", "db"], ["((", "))", "circle"], ["{{", "}}", "hex"],
  ["[/", "/]", "rect"], ["[\\", "\\]", "rect"], ["[/", "\\]", "rect"], ["[\\", "/]", "rect"],
  ["[[", "]]", "sub"], ["[", "]", "rect"], ["(", ")", "round"], ["{", "}", "diamond"], [">", "]", "rect"]
];
const ID = /^[A-Za-z0-9_À-￿][A-Za-z0-9_À-￿]*/;
/* an arrow: what is between two boxes. Its label can be written two ways,
   -->|yes| and -- yes -->, and its line three: solid, dotted, thick. */
const EDGE_MID = /^(<)?(--|==|-\.)\s+([^|>]*?[^\s-=.])\s+(-{2,}|={2,}|\.+-)(>|o|x)?/;
const EDGE = /^(<|o|x)?(-{2,}|={2,}|-\.+-|-+\.+-+)(>|o|x)?(?:\s*\|([^|]*)\|)?/;
function edgeStyle(line){ return /=/.test(line) ? "thick" : /\./.test(line) ? "dot" : "solid"; }

function parseFlow(lines, dir, title){
  const nodes = [], byId = new Map(), edges = [], groups = [], stack = [];
  const node = (id, label, shape) => {
    let n = byId.get(id);
    if (!n){
      n = { id:id, label:id, shape:"rect" };
      byId.set(id, n); nodes.push(n);
      stack.forEach(g => g.members.push(id));
    }
    if (label != null){ n.label = label; n.shape = shape; }
    return n;
  };
  for (const st of lines){
    let m;
    if ((m = /^subgraph\s+(.*)$/i.exec(st))){
      const rest = m[1].trim();
      let id = rest, label = rest;
      const b = /^([\wÀ-￿-]+)\s*\[(.*)\]\s*$/.exec(rest);
      if (b){ id = b[1]; label = plain(b[2]); }
      else label = plain(rest);
      const g = { id:id, title:label, members:[], parent:stack.length ? stack[stack.length - 1].id : null };
      groups.push(g); stack.push(g);
      continue;
    }
    if (/^end$/i.test(st)){ stack.pop(); continue; }
    if (/^(direction|classDef|class|style|linkStyle|click|accTitle|accDescr|%%)\b/i.test(st)) continue;
    /* a chain: refs (arrow refs)* where a ref is one box or several joined by & */
    let s = st, prev = null, guard = 0;
    while (s.length && guard++ < 200){
      const refs = [];
      for (;;){
        const r = readRef(s);
        if (!r) break;
        refs.push(node(r.id, r.label, r.shape));
        s = r.rest.replace(/^\s+/, "");
        if (s.charAt(0) === "&"){ s = s.slice(1).replace(/^\s+/, ""); continue; }
        break;
      }
      if (!refs.length) break;
      if (prev && prev.edge) prev.from.forEach(a => refs.forEach(b => edges.push(Object.assign({ from:a.id, to:b.id }, prev.edge))));
      let e = null, em;
      if ((em = EDGE_MID.exec(s))){
        e = { label:plain(em[3]), style:edgeStyle(em[2] + em[4]), head:/[>ox]$/.test(em[0]), tail:!!em[1] };
        s = s.slice(em[0].length).replace(/^\s+/, "");
      } else if ((em = EDGE.exec(s))){
        e = { label:plain(em[4] || ""), style:edgeStyle(em[2]), head:!!em[3], tail:em[1] === "<" };
        s = s.slice(em[0].length).replace(/^\s+/, "");
      }
      if (!e) break;
      prev = { from:refs, edge:e };
    }
  }
  if (!nodes.length) return { ok:false, error:"no boxes" };
  if (nodes.length > LIMITS.nodes || edges.length > LIMITS.edges) return { ok:false, error:"too big" };
  return { ok:true, model:{ type:"flow", dir:dir, nodes:nodes, edges:edges, groups:groups, title:title || "" } };
}
function readRef(s){
  const m = ID.exec(s);
  if (!m) return null;
  let rest = s.slice(m[0].length), label = null, shape = "rect";
  for (const [open, close, sh] of SHAPES){
    if (rest.indexOf(open) !== 0) continue;
    const at = findClose(rest, open.length, close);
    if (at < 0) continue;
    label = plain(rest.slice(open.length, at));
    shape = sh;
    rest = rest.slice(at + close.length);
    break;
  }
  rest = rest.replace(/^:::[\w-]+/, "");
  return { id:m[0], label:label, shape:shape, rest:rest };
}
/* where a shape's closing bracket is, skipping a quoted label */
function findClose(s, from, close){
  let q = false;
  for (let i = from; i < s.length; i++){
    if (s.charAt(i) === "\"") q = !q;
    if (!q && s.substr(i, close.length) === close){
      /* "])" and "))" can be the end of a longer run: take the last */
      return i;
    }
  }
  return -1;
}

/* ── state diagram, as a flowchart ────────────────────────────────────── */
function parseState(lines, title){
  const nodes = [], byId = new Map(), edges = [], groups = [], stack = [];
  let dir = "TD", starts = 0, ends = 0;
  const node = (id, label, shape) => {
    let n = byId.get(id);
    if (!n){ n = { id:id, label:id, shape:shape || "round" }; byId.set(id, n); nodes.push(n); stack.forEach(g => g.members.push(id)); }
    if (label != null) n.label = label;
    return n;
  };
  const ref = (tok, side) => {
    tok = tok.trim();
    if (tok === "[*]"){
      const id = side === "from" ? "__start" + (stack.length ? "_" + stack[stack.length - 1].id : "")
                                 : "__end" + (stack.length ? "_" + stack[stack.length - 1].id : "");
      side === "from" ? starts++ : ends++;
      return node(id, "", side === "from" ? "start" : "end");
    }
    return node(tok.replace(/^"|"$/g, ""));
  };
  for (const st of lines){
    let m;
    if ((m = /^direction\s+(TD|TB|BT|LR|RL)/i.exec(st))){ if (!stack.length) dir = m[1].toUpperCase(); continue; }
    if ((m = /^state\s+"([^"]+)"\s+as\s+([\wÀ-￿]+)/i.exec(st))){ node(m[2], plain(m[1])); continue; }
    if ((m = /^state\s+([\wÀ-￿]+)\s*\{$/i.exec(st)) || (m = /^state\s+"([^"]+)"\s*\{$/i.exec(st))){
      const g = { id:m[1], title:plain(m[1]), members:[], parent:stack.length ? stack[stack.length - 1].id : null };
      groups.push(g); stack.push(g); continue;
    }
    if (st === "}"){ stack.pop(); continue; }
    if (/^(note|end note|classDef|class|style|--|hide|scale)\b/i.test(st)) continue;
    if ((m = /^state\s+([\wÀ-￿]+)\s*(?:<<\w+>>)?$/i.exec(st))){ node(m[1]); continue; }
    if ((m = /^(.+?)\s*-->\s*(.+?)(?:\s*:\s*(.*))?$/.exec(st))){
      const a = ref(m[1], "from"), b = ref(m[2], "to");
      edges.push({ from:a.id, to:b.id, label:plain(m[3] || ""), style:"solid", head:true, tail:false });
      continue;
    }
    if ((m = /^([\wÀ-￿]+)\s*:\s*(.+)$/.exec(st))){ node(m[1], plain(m[2])); continue; }
  }
  if (!nodes.length) return { ok:false, error:"no states" };
  if (nodes.length > LIMITS.nodes || edges.length > LIMITS.edges) return { ok:false, error:"too big" };
  return { ok:true, model:{ type:"flow", dir:dir, nodes:nodes, edges:edges, groups:groups, title:title || "", state:true } };
}

/* ── sequence diagram ─────────────────────────────────────────────────── */
const MSG = /^(.+?)\s*(<<)?(--?)(>>|>|x|\))\s*([+-]?)\s*(.+?)\s*(?::\s*(.*))?$/;
function parseSequence(lines, title){
  const actors = [], byId = new Map(), items = [];
  let auto = false, depth = 0, boxes = 0;
  const actor = (id, label, kind) => {
    id = id.trim();
    let a = byId.get(id);
    if (!a){ a = { id:id, label:id, kind:kind || "participant" }; byId.set(id, a); actors.push(a); }
    if (label) a.label = label;
    if (kind) a.kind = kind;
    return a;
  };
  for (const st of lines){
    let m;
    if ((m = /^(?:create\s+)?(participant|actor)\s+(.+?)(?:\s+as\s+(.+))?$/i.exec(st))){ actor(m[2], m[3] ? plain(m[3]) : plain(m[2]), m[1].toLowerCase()); continue; }
    if ((m = /^title\s*:?\s*(.+)$/i.exec(st))){ title = plain(m[1]); continue; }
    if (/^autonumber\b/i.test(st)){ auto = true; continue; }
    if (/^(activate|deactivate|destroy|link|links|properties|details)\b/i.test(st)) continue;
    if (/^box\b/i.test(st)){ boxes++; continue; }
    if ((m = /^note\s+(left of|right of|over)\s+([^:]+):\s*(.*)$/i.exec(st))){
      const who = m[2].split(",").map(x => actor(x).id);
      items.push({ kind:"note", pos:m[1].toLowerCase().replace(/ of$/, ""), over:who, text:plain(m[3]) });
      continue;
    }
    if ((m = /^(loop|alt|opt|par|critical|break|rect)\b\s*(.*)$/i.exec(st))){
      items.push({ kind:"open", type:m[1].toLowerCase(), text:m[1].toLowerCase() === "rect" ? "" : plain(m[2]), depth:depth++ });
      continue;
    }
    if ((m = /^(else|and|option)\b\s*(.*)$/i.exec(st))){ items.push({ kind:"split", text:plain(m[2]), word:m[1].toLowerCase() }); continue; }
    if (/^end$/i.test(st)){
      if (depth > 0){ items.push({ kind:"close" }); depth--; }
      else if (boxes > 0) boxes--;
      continue;
    }
    if ((m = MSG.exec(st))){
      const a = actor(m[1]), b = actor(m[6]);
      items.push({ kind:"msg", from:a.id, to:b.id, text:plain(m[7] || ""), dashed:m[3] === "--",
                   head:m[4] === "x" ? "cross" : m[4] === ">" ? "open" : "arrow", both:!!m[2] });
      continue;
    }
  }
  while (depth-- > 0) items.push({ kind:"close" });
  if (!actors.length) return { ok:false, error:"no participants" };
  if (actors.length > 24 || items.length > LIMITS.items) return { ok:false, error:"too big" };
  return { ok:true, model:{ type:"sequence", actors:actors, items:items, auto:auto, title:title || "" } };
}

/* ═══ laying out a flowchart ═════════════════════════════════════════════ */
function sizeNode(n, measure){
  const max = n.shape === "diamond" ? 150 : 176;
  n.lines = n.label ? wrap(n.label, max, measure) : [];
  const tw = Math.max(0, ...n.lines.map(l => measure(l)));
  const th = n.lines.length * LH;
  if (n.shape === "start" || n.shape === "end"){ n.w = n.h = n.shape === "start" ? 16 : 20; return; }
  if (n.shape === "diamond"){ n.w = Math.max(80, tw * 1.42 + 34); n.h = Math.max(56, th * 1.5 + 30); return; }
  if (n.shape === "circle"){ n.w = n.h = Math.max(56, Math.max(tw, th) + 30); return; }
  n.w = Math.max(66, tw + (n.shape === "hex" ? 46 : n.shape === "stadium" ? 34 : 28));
  n.h = Math.max(38, th + (n.shape === "db" ? 30 : 18));
}

function layoutFlow(model, measure){
  const nodes = model.nodes, N = nodes.length;
  const idx = new Map(nodes.map((n, i) => [n.id, i]));
  const horiz = model.dir === "LR" || model.dir === "RL";
  nodes.forEach(n => {
    sizeNode(n, measure);
    /* laid out top to bottom; a left-to-right diagram is the same picture
       turned, so its boxes go in turned too */
    n.lw = horiz ? n.h : n.w; n.lh = horiz ? n.w : n.h;
  });
  /* the arrows that decide the ranks: no self loops, no repeats */
  const E = [];
  const seen = new Set();
  model.edges.forEach((e, k) => {
    const a = idx.get(e.from), b = idx.get(e.to);
    if (a === b) return;
    const key = a + ">" + b;
    if (seen.has(key)) return;
    seen.add(key);
    E.push({ a:a, b:b, k:k, rev:false });
  });
  /* 1. cycles: an arrow back to a box still being walked is turned round
     for the ranking, and drawn the way it was written */
  const out = nodes.map(() => []);
  E.forEach(e => out[e.a].push(e));
  const state = new Array(N).fill(0);
  const visit = v => {
    state[v] = 1;
    out[v].forEach(e => {
      if (state[e.b] === 1) e.rev = true;
      else if (state[e.b] === 0) visit(e.b);
    });
    state[v] = 2;
  };
  for (let v = 0; v < N; v++) if (!state[v]) visit(v);
  const D = E.map(e => e.rev ? { a:e.b, b:e.a, e:e } : { a:e.a, b:e.b, e:e });
  /* 2. ranks: the longest way in from a box nothing points at */
  const indeg = new Array(N).fill(0), succ = nodes.map(() => []), pred = nodes.map(() => []);
  D.forEach(d => { indeg[d.b]++; succ[d.a].push(d.b); pred[d.b].push(d.a); });
  const rank = new Array(N).fill(0), order = [];
  const queue = [];
  for (let v = 0; v < N; v++) if (!indeg[v]) queue.push(v);
  while (queue.length){
    const v = queue.shift(); order.push(v);
    succ[v].forEach(w => { rank[w] = Math.max(rank[w], rank[v] + 1); if (--indeg[w] === 0) queue.push(w); });
  }
  /* a box nothing points at is drawn just above the first box it points
     to, not at the very top with a long arrow down */
  for (let i = order.length - 1; i >= 0; i--){
    const v = order[i];
    if (!pred[v].length && succ[v].length) rank[v] = Math.min(...succ[v].map(w => rank[w])) - 1;
  }
  const minR = Math.min(...rank);
  for (let v = 0; v < N; v++) rank[v] -= minR;
  /* An arrow's label is given a place of its own, as if it were a small
     box on the arrow: every rank is doubled, and the label sits on the
     rank between, where the ordering and the spacing keep it clear of the
     boxes and of every other label. Without labels there is nothing to make
     room for, and the ranks stay as they are. */
  const labelled = D.some(d => model.edges[d.e.k].label);
  if (labelled) for (let v = 0; v < N; v++) rank[v] *= 2;
  const R = Math.max(...rank) + 1;
  /* 3. waypoints on the ranks an arrow passes */
  const V = nodes.map((n, i) => ({ i:i, rank:rank[i], w:n.lw, h:n.lh, dummy:false }));
  const links = [];                  /* between adjacent ranks only */
  D.forEach(d => {
    const chain = [d.a];
    const lab = model.edges[d.e.k].label;
    const mid = Math.floor((rank[d.a] + rank[d.b]) / 2);
    for (let r = rank[d.a] + 1; r < rank[d.b]; r++){
      const v = { i:V.length, rank:r, w:10, h:10, dummy:true };
      if (lab && r === mid){
        /* the label's own place, as big as the label */
        v.lines = wrap(lab, 120, t => measure(t, 12));
        const sw = Math.max(...v.lines.map(l => measure(l, 12))) + 14, sh = v.lines.length * 15 + 8;
        v.w = horiz ? sh : sw; v.h = horiz ? sw : sh; v.label = true;
        d.labelAt = v.i;
      }
      V.push(v);
      chain.push(V.length - 1);
    }
    chain.push(d.b);
    for (let j = 0; j + 1 < chain.length; j++) links.push({ a:chain[j], b:chain[j + 1] });
    d.chain = chain;
  });
  const up = V.map(() => []), down = V.map(() => []);
  links.forEach(l => { down[l.a].push(l.b); up[l.b].push(l.a); });
  /* 4. order on each rank: start in the order the boxes were written,
     then sweep down and up, putting each box at the average position of
     the boxes it is joined to, and keep the order that crosses least */
  let layers = Array.from({ length:R }, () => []);
  const firstSeen = [];
  const walk = (v, mark) => { if (mark[v]) return; mark[v] = 1; firstSeen.push(v); down[v].forEach(w => walk(w, mark)); };
  const mark = {};
  V.filter(v => !up[v.i].length).sort((p, q) => p.i - q.i).forEach(v => walk(v.i, mark));
  V.forEach(v => walk(v.i, mark));
  firstSeen.forEach(v => layers[V[v].rank].push(v));
  const pos = new Array(V.length);
  const setPos = () => layers.forEach(L => L.forEach((v, k) => { pos[v] = k; }));
  setPos();
  const crossings = () => {
    let c = 0;
    for (let r = 0; r + 1 < R; r++){
      const es = [];
      layers[r].forEach(a => down[a].forEach(b => es.push([pos[a], pos[b]])));
      for (let x = 0; x < es.length; x++) for (let y = x + 1; y < es.length; y++)
        if ((es[x][0] - es[y][0]) * (es[x][1] - es[y][1]) < 0) c++;
    }
    return c;
  };
  let best = layers.map(L => L.slice()), bestC = crossings();
  for (let it = 0; it < 16 && bestC > 0; it++){
    const goingDown = it % 2 === 0;
    const range = goingDown ? [...Array(R).keys()].slice(1) : [...Array(R).keys()].slice(0, -1).reverse();
    range.forEach(r => {
      const bary = new Map();
      layers[r].forEach(v => {
        const nb = goingDown ? up[v] : down[v];
        bary.set(v, nb.length ? nb.reduce((s, w) => s + pos[w], 0) / nb.length : pos[v]);
      });
      layers[r].sort((p, q) => bary.get(p) - bary.get(q) || pos[p] - pos[q]);
      layers[r].forEach((v, k) => { pos[v] = k; });
    });
    const c = crossings();
    if (c < bestC){ bestC = c; best = layers.map(L => L.slice()); }
  }
  layers = best; setPos();
  /* 5. across: packed, then each box slid towards what it is joined to */
  const GAP = 34;
  const x = new Array(V.length).fill(0);
  layers.forEach(L => {
    let at = 0;
    L.forEach(v => { x[v] = at + V[v].w / 2; at += V[v].w + GAP; });
    const mid = (at - GAP) / 2;
    L.forEach(v => { x[v] -= mid; });
  });
  const pack = (L, want) => {
    /* the wanted places, then the least movement that keeps the order and
       the gaps: pushed right from the left, left from the right, averaged */
    const n = L.length, lo = new Array(n), hi = new Array(n);
    for (let k = 0; k < n; k++){
      lo[k] = want[k];
      if (k) lo[k] = Math.max(lo[k], lo[k - 1] + (V[L[k - 1]].w + V[L[k]].w) / 2 + GAP);
    }
    for (let k = n - 1; k >= 0; k--){
      hi[k] = want[k];
      if (k < n - 1) hi[k] = Math.min(hi[k], hi[k + 1] - (V[L[k + 1]].w + V[L[k]].w) / 2 - GAP);
    }
    const res = lo.map((l, k) => (l + hi[k]) / 2);
    for (let k = 1; k < n; k++) res[k] = Math.max(res[k], res[k - 1] + (V[L[k - 1]].w + V[L[k]].w) / 2 + GAP);
    return res;
  };
  for (let it = 0; it < 24; it++){
    const goingDown = it % 2 === 0;
    const range = goingDown ? [...Array(R).keys()] : [...Array(R).keys()].reverse();
    range.forEach(r => {
      const L = layers[r];
      const want = L.map(v => {
        const nb = (goingDown ? up[v] : down[v]).concat(it > 12 ? (goingDown ? down[v] : up[v]) : []);
        return nb.length ? nb.reduce((s, w) => s + x[w], 0) / nb.length : x[v];
      });
      pack(L, want).forEach((val, k) => { x[L[k]] = val; });
    });
  }
  /* 6. down: each rank as tall as its tallest box, and the gap under it
     taller when an arrow with a label crosses it */
  const rowH = layers.map(L => L.length ? Math.max(10, ...L.map(v => V[v].h)) : 10);
  const gapUnder = new Array(R).fill(labelled ? (horiz ? 20 : 16) : (horiz ? 46 : 50));
  const y = new Array(V.length).fill(0), rowTop = [];
  let at = 0;
  for (let r = 0; r < R; r++){ rowTop[r] = at; layers[r].forEach(v => { y[v] = at + rowH[r] / 2; }); at += rowH[r] + gapUnder[r]; }
  /* the arrows: from the bottom of one box, through its waypoints, to the
     top of the next; several leaving one box leave from points spread along
     its edge, in the order of where they go */
  const ports = new Map();
  const spread = (v, list, side) => {
    list.sort((p, q) => p.x - q.x);
    const n = list.length, w = V[v].w, node = nodes[v];
    const room = node && (node.shape === "diamond" || node.shape === "circle" || node.shape === "start" || node.shape === "end") ? 0 : Math.min(w * 0.6, n * 16);
    list.forEach((p, k) => { ports.set(p.key + side, n > 1 ? (k - (n - 1) / 2) * (room / Math.max(1, n - 1)) : 0); });
  };
  const outs = V.map(() => []), ins = V.map(() => []);
  D.forEach((d, j) => {
    const c = d.chain;
    outs[c[0]].push({ key:j, x:x[c[1]] });
    ins[c[c.length - 1]].push({ key:j, x:x[c[c.length - 2]] });
  });
  outs.forEach((l, v) => spread(v, l, "o"));
  ins.forEach((l, v) => spread(v, l, "i"));
  const paths = [];
  D.forEach((d, j) => {
    const c = d.chain;
    const pts = c.map(v => ({ x:x[v], y:y[v] }));
    pts[0] = { x:x[c[0]] + ports.get(j + "o"), y:y[c[0]] + V[c[0]].h / 2 };
    const last = c[c.length - 1];
    pts[pts.length - 1] = { x:x[last] + ports.get(j + "i"), y:y[last] - V[last].h / 2 };
    const e = model.edges[d.e.k];
    const back = d.e.rev;
    paths.push({ e:e, pts:back ? pts.reverse() : pts, back:back, span:c.length - 1, mid:c.length > 2 ? c[Math.floor(c.length / 2)] : -1,
                 from:d.e.a, to:d.e.b, labelAt:d.labelAt == null ? -1 : d.labelAt });
  });
  /* the repeats and self loops, drawn alongside */
  const drawn = new Set(E.map(e => e.k));
  model.edges.forEach((e, k) => {
    if (drawn.has(k)) return;
    const a = idx.get(e.from), b = idx.get(e.to);
    if (a === b){ paths.push({ e:e, self:a }); return; }
    const twin = paths.find(p => p.e.from === e.from && p.e.to === e.to && p.pts);
    if (twin) paths.push({ e:e, pts:twin.pts.map((p, i) => i === 0 || i === twin.pts.length - 1 ? { x:p.x + 8, y:p.y } : { x:p.x + 12, y:p.y }), back:twin.back });
  });
  return { V:V, x:x, y:y, rowTop:rowTop, rowH:rowH, paths:paths, horiz:horiz, R:R, layers:layers };
}

/* ═══ drawing ════════════════════════════════════════════════════════════ */
function f(n){ return Math.round(n * 10) / 10; }
function textBlock(lines, cx, cy, cls){
  if (!lines.length) return "";
  const top = cy - (lines.length - 1) * LH / 2;
  return '<text class="' + (cls || "dg-t") + '" text-anchor="middle" x="' + f(cx) + '" y="' + f(top) + '" dy=".35em">' +
    lines.map((l, k) => '<tspan x="' + f(cx) + '"' + (k ? ' dy="' + LH + '"' : "") + ">" + xml(l || " ") + "</tspan>").join("") + "</text>";
}
function shape(n, cx, cy){
  const w = n.w, h = n.h, x0 = cx - w / 2, y0 = cy - h / 2;
  switch (n.shape){
    case "diamond":
      return '<path class="dg-node dec" d="M' + f(cx) + " " + f(y0) + "L" + f(x0 + w) + " " + f(cy) + "L" + f(cx) + " " + f(y0 + h) + "L" + f(x0) + " " + f(cy) + 'Z"/>';
    case "circle":
      return '<circle class="dg-node" cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(w / 2) + '"/>';
    case "start":
      return '<circle class="dg-start" cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(w / 2) + '"/>';
    case "end":
      return '<circle class="dg-endring" cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(w / 2) + '"/><circle class="dg-start" cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(w / 2 - 4) + '"/>';
    case "stadium":
      return '<rect class="dg-node" x="' + f(x0) + '" y="' + f(y0) + '" width="' + f(w) + '" height="' + f(h) + '" rx="' + f(h / 2) + '"/>';
    case "round":
      return '<rect class="dg-node" x="' + f(x0) + '" y="' + f(y0) + '" width="' + f(w) + '" height="' + f(h) + '" rx="12"/>';
    case "hex": {
      const k = 14;
      return '<path class="dg-node" d="M' + f(x0 + k) + " " + f(y0) + "H" + f(x0 + w - k) + "L" + f(x0 + w) + " " + f(cy) + "L" + f(x0 + w - k) + " " + f(y0 + h) +
             "H" + f(x0 + k) + "L" + f(x0) + " " + f(cy) + 'Z"/>';
    }
    case "db": {
      const e = 7;
      return '<path class="dg-node" d="M' + f(x0) + " " + f(y0 + e) + "A" + f(w / 2) + " " + e + " 0 0 1 " + f(x0 + w) + " " + f(y0 + e) + "V" + f(y0 + h - e) +
             "A" + f(w / 2) + " " + e + " 0 0 1 " + f(x0) + " " + f(y0 + h - e) + 'Z"/>' +
             '<path class="dg-node dg-lid" d="M' + f(x0) + " " + f(y0 + e) + "A" + f(w / 2) + " " + e + " 0 0 0 " + f(x0 + w) + " " + f(y0 + e) + '"/>';
    }
    case "sub":
      return '<rect class="dg-node" x="' + f(x0) + '" y="' + f(y0) + '" width="' + f(w) + '" height="' + f(h) + '" rx="6"/>' +
             '<path class="dg-node dg-lid" d="M' + f(x0 + 7) + " " + f(y0) + "V" + f(y0 + h) + "M" + f(x0 + w - 7) + " " + f(y0) + "V" + f(y0 + h) + '"/>';
    default:
      return '<rect class="dg-node" x="' + f(x0) + '" y="' + f(y0) + '" width="' + f(w) + '" height="' + f(h) + '" rx="6"/>';
  }
}
/* d3's curveBasis, written out: a uniform cubic B-spline through the points,
   starting and ending exactly on the first and last */
function basis(P){
  let x0 = 0, y0 = 0, x1 = 0, y1 = 0, st = 0, d = "";
  const pt = (x, y) => {
    d += "C" + f((2 * x0 + x1) / 3) + " " + f((2 * y0 + y1) / 3) + " " + f((x0 + 2 * x1) / 3) + " " + f((y0 + 2 * y1) / 3) +
         " " + f((x0 + 4 * x1 + x) / 6) + " " + f((y0 + 4 * y1 + y) / 6);
  };
  P.forEach(p => {
    const x = p.x, y = p.y;
    if (st === 0){ st = 1; d = "M" + f(x) + " " + f(y); }
    else if (st === 1) st = 2;
    else {
      if (st === 2){ st = 3; d += "L" + f((5 * x0 + x1) / 6) + " " + f((5 * y0 + y1) / 6); }
      pt(x, y);
    }
    x0 = x1; x1 = x; y0 = y1; y1 = y;
  });
  if (st === 3) pt(x1, y1);
  if (st >= 2) d += "L" + f(x1) + " " + f(y1);
  return d;
}
/* an arrow head: a small filled triangle at the end, pointing the way the
   line arrives - drawn rather than a <marker>, so it takes the line's colour
   from the same stylesheet rule in every browser */
function head(tip, from, cls){
  const dx = tip.x - from.x, dy = tip.y - from.y, L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L, len = 9, wid = 4.6;
  const bx = tip.x - ux * len, by = tip.y - uy * len;
  return '<path class="' + (cls || "dg-head") + '" d="M' + f(tip.x) + " " + f(tip.y) + "L" + f(bx - uy * wid) + " " + f(by + ux * wid) +
         "L" + f(bx + uy * wid) + " " + f(by - ux * wid) + 'Z"/>';
}
function labelBox(lines, cx, cy, measure, boxes){
  const tw = Math.max(...lines.map(l => measure(l, 12)));
  const w = tw + 12, h = lines.length * 15 + 6;
  if (boxes) boxes.push({ kind:"label", text:lines.join(" "), x:cx - w / 2, y:cy - h / 2, w:w, h:h });
  return '<rect class="dg-lbl" x="' + f(cx - w / 2) + '" y="' + f(cy - h / 2) + '" width="' + f(w) + '" height="' + f(h) + '" rx="5"/>' +
    '<text class="dg-lt" text-anchor="middle" x="' + f(cx) + '" y="' + f(cy - (lines.length - 1) * 7.5) + '" dy=".35em">' +
    lines.map((l, k) => '<tspan x="' + f(cx) + '"' + (k ? ' dy="15"' : "") + ">" + xml(l) + "</tspan>").join("") + "</text>";
}

function renderFlow(model, measure){
  const L = layoutFlow(model, measure);
  const { V, x, y, horiz } = L;
  const nodes = model.nodes;
  /* the picture is laid out top to bottom; turned and flipped here */
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  V.forEach((v, k) => {
    minX = Math.min(minX, x[k] - v.w / 2); maxX = Math.max(maxX, x[k] + v.w / 2);
    minY = Math.min(minY, y[k] - v.h / 2); maxY = Math.max(maxY, y[k] + v.h / 2);
  });
  L.paths.forEach(p => (p.pts || []).forEach(q => { minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); }));
  const W0 = maxX - minX, H0 = maxY - minY;
  const flipY = model.dir === "BT" || model.dir === "RL";
  const T = (px, py) => {
    let u = px - minX, v = py - minY;
    if (flipY) v = H0 - v;
    return horiz ? { x:v, y:u } : { x:u, y:v };
  };
  const W = horiz ? H0 : W0, H = horiz ? W0 : H0;
  const title = model.title ? 26 : 0;
  const ox = MARGIN, oy = MARGIN + title;
  const P = (px, py) => { const t = T(px, py); return { x:t.x + ox, y:t.y + oy }; };
  let groupsSvg = "", edgesSvg = "", nodesSvg = "", labelsSvg = "";
  const boxes = [];                  /* where everything landed, for the tests */
  /* the groups: a box round their members, inner ones inside outer ones */
  const box = new Map();
  const groupBox = g => {
    if (box.has(g.id)) return box.get(g.id);
    let b = null;
    const add = (x0, y0, x1, y1) => { b = b ? { x0:Math.min(b.x0, x0), y0:Math.min(b.y0, y0), x1:Math.max(b.x1, x1), y1:Math.max(b.y1, y1) } : { x0, y0, x1, y1 }; };
    g.members.forEach(id => {
      const k = nodes.findIndex(n => n.id === id); if (k < 0) return;
      const c = P(x[k], y[k]), n = nodes[k];
      add(c.x - n.w / 2, c.y - n.h / 2, c.x + n.w / 2, c.y + n.h / 2);
    });
    (model.groups || []).filter(h => h.parent === g.id).forEach(h => { const hb = groupBox(h); if (hb) add(hb.x0, hb.y0, hb.x1, hb.y1); });
    if (b){ b = { x0:b.x0 - 14, y0:b.y0 - 30, x1:b.x1 + 14, y1:b.y1 + 12 }; }
    box.set(g.id, b);
    return b;
  };
  (model.groups || []).forEach(g => groupBox(g));
  let gx0 = 0, gy0 = 0, gx1 = W + 2 * MARGIN, gy1 = H + 2 * MARGIN + title;
  (model.groups || []).slice().sort((a, b) => (a.parent ? 1 : 0) - (b.parent ? 1 : 0)).forEach(g => {
    const b = box.get(g.id); if (!b) return;
    gx0 = Math.min(gx0, b.x0 - 4); gy0 = Math.min(gy0, b.y0 - 4); gx1 = Math.max(gx1, b.x1 + 4); gy1 = Math.max(gy1, b.y1 + 4);
    groupsSvg += '<rect class="dg-grp" x="' + f(b.x0) + '" y="' + f(b.y0) + '" width="' + f(b.x1 - b.x0) + '" height="' + f(b.y1 - b.y0) + '" rx="10"/>' +
      '<text class="dg-gt" x="' + f(b.x0 + 10) + '" y="' + f(b.y0 + 15) + '" dy=".35em">' + xml(g.title) + "</text>";
  });
  /* the arrows */
  L.paths.forEach(p => {
    const e = p.e, cls = "dg-edge" + (e.style === "dot" ? " dot" : e.style === "thick" ? " thick" : "");
    if (p.self != null){
      const n = nodes[p.self], c = P(x[p.self], y[p.self]);
      const sx = c.x + n.w / 2, s1 = { x:sx, y:c.y - 6 }, s2 = { x:sx, y:c.y + 6 };
      edgesSvg += '<path class="' + cls + '" d="M' + f(s1.x) + " " + f(s1.y) + "C" + f(sx + 34) + " " + f(c.y - 26) + " " + f(sx + 34) + " " + f(c.y + 26) + " " + f(s2.x) + " " + f(s2.y) + '"/>';
      if (e.head) edgesSvg += head(s2, { x:sx + 12, y:c.y + 14 });
      if (e.label) labelsSvg += labelBox(wrap(e.label, 110, t => measure(t, 12)), sx + 34, c.y, measure, boxes);
      return;
    }
    /* an arrow back up to the rank just before, beside the one going down:
       it leaves the side of its box and bows out to arrive at the side of
       the other, so the two are never drawn on top of each other */
    if (p.back && p.span === 1 && p.from != null){
      const a = nodes[p.from], b = nodes[p.to];
      const sa = P(x[p.from] + a.lw / 2, y[p.from]), sb = P(x[p.to] + b.lw / 2, y[p.to]);
      const bow = 44;
      const c1 = horiz ? { x:sa.x, y:sa.y + bow } : { x:sa.x + bow, y:sa.y };
      const c2 = horiz ? { x:sb.x, y:sb.y + bow } : { x:sb.x + bow, y:sb.y };
      edgesSvg += '<path class="' + cls + '" d="M' + f(sa.x) + " " + f(sa.y) + "C" + f(c1.x) + " " + f(c1.y) + " " + f(c2.x) + " " + f(c2.y) + " " + f(sb.x) + " " + f(sb.y) + '"/>';
      if (e.head) edgesSvg += head(sb, c2);
      if (e.tail) edgesSvg += head(sa, c1);
      if (e.label) labelsSvg += labelBox(wrap(e.label, 110, t => measure(t, 12)), (sa.x + sb.x) / 2 + (horiz ? 0 : bow * 0.75), (sa.y + sb.y) / 2 + (horiz ? bow * 0.75 : 0), measure, boxes);
      return;
    }
    const pts = p.pts.map(q => P(q.x, q.y));
    /* A short straight stub out of the first box and into the last, then a
       smooth curve that bends through the waypoints between (a B-spline,
       the curve most diagram tools draw): an arrow leaves and arrives
       square to its box, and never kinks at a waypoint. */
    const stub = 12, first = pts[0], lastP = pts[pts.length - 1];
    const sgn = (a, b) => (b > a ? 1 : -1);
    const out1 = horiz ? { x:first.x + sgn(first.x, pts[1].x) * stub, y:first.y } : { x:first.x, y:first.y + sgn(first.y, pts[1].y) * stub };
    const prevP = pts[pts.length - 2];
    const in1 = horiz ? { x:lastP.x - sgn(prevP.x, lastP.x) * stub, y:lastP.y } : { x:lastP.x, y:lastP.y - sgn(prevP.y, lastP.y) * stub };
    /* the line stops under the head rather than at its tip, where a round
       line end would poke through the point */
    const toward = (a, b, k) => { const L = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x:b.x - (b.x - a.x) / L * k, y:b.y - (b.y - a.y) / L * k }; };
    const tipEnd = p.e.head ? toward(in1, lastP, 6) : lastP, tipStart = p.e.tail ? toward(out1, first, 6) : first;
    const d = basis([tipStart, out1].concat(pts.slice(1, -1), [in1, tipEnd]));
    const lastCtl = in1;
    edgesSvg += '<path class="' + cls + '" d="' + d + '"/>';
    const end = pts[pts.length - 1], start = pts[0];
    if (e.head) edgesSvg += head(end, lastCtl);
    if (e.tail) edgesSvg += head(start, out1);
    if (e.label){
      let lx, ly;
      const at = p.labelAt >= 0 ? p.labelAt : p.mid;
      if (at >= 0){ const c = P(x[at], y[at]); lx = c.x; ly = c.y; }
      else { lx = (start.x + end.x) / 2; ly = (start.y + end.y) / 2; }
      labelsSvg += labelBox(wrap(e.label, 120, t => measure(t, 12)), lx, ly, measure, boxes);
    }
  });
  /* the boxes, over the arrows */
  nodes.forEach((n, k) => {
    const c = P(x[k], y[k]);
    nodesSvg += '<g class="dg-n">' + shape(n, c.x, c.y) + textBlock(n.lines, c.x, n.shape === "db" ? c.y + 4 : c.y) + "</g>";
    boxes.push({ kind:"node", id:n.id, x:c.x - n.w / 2, y:c.y - n.h / 2, w:n.w, h:n.h });
  });
  const titleSvg = model.title ? '<text class="dg-title" x="' + MARGIN + '" y="' + (MARGIN + 8) + '" dy=".35em">' + xml(model.title) + "</text>" : "";
  return { width:Math.ceil(gx1 - gx0), height:Math.ceil(gy1 - gy0), ox:gx0, oy:gy0, boxes:boxes,
           body:titleSvg + '<g class="dg-groups">' + groupsSvg + '</g><g class="dg-edges">' + edgesSvg + '</g><g class="dg-nodes">' + nodesSvg + '</g><g class="dg-labels">' + labelsSvg + "</g>" };
}

/* ═══ drawing a sequence diagram ═════════════════════════════════════════ */
function renderSequence(model, measure){
  const A = model.actors, n = A.length;
  const at = new Map(A.map((a, i) => [a.id, i]));
  A.forEach(a => {
    a.lines = wrap(a.label, 150, measure);
    a.w = Math.max(84, Math.max(...a.lines.map(l => measure(l))) + 26);
    /* a person is drawn over its name, so its head is taller */
    a.h = a.kind === "actor" ? 40 + a.lines.length * LH : Math.max(36, a.lines.length * LH + 16);
  });
  const headH = Math.max(...A.map(a => a.h));
  /* the gaps between the lifelines: wide enough for every message that
     crosses them, every note beside them, every message to itself */
  const gap = new Array(n).fill(0);
  for (let i = 1; i < n; i++) gap[i] = (A[i - 1].w + A[i].w) / 2 + 28;
  const widen = (i, j, need) => {
    if (i > j) [i, j] = [j, i];
    let have = 0; for (let k = i + 1; k <= j; k++) have += gap[k];
    if (have >= need || j === i) return;
    const add = (need - have) / (j - i);
    for (let k = i + 1; k <= j; k++) gap[k] += add;
  };
  let rightPad = 0, leftPad = 0;
  model.items.forEach(it => {
    if (it.kind === "msg"){
      const i = at.get(it.from), j = at.get(it.to);
      it.lines = wrap(it.text, Math.max(180, 220), measure);
      const tw = Math.max(0, ...it.lines.map(l => measure(l))) + (model.auto ? 26 : 0);
      if (i === j){ if (i + 1 < n) widen(i, i + 1, tw + 60); else rightPad = Math.max(rightPad, tw + 50); }
      else widen(i, j, tw + 34);
    } else if (it.kind === "note"){
      it.lines = wrap(it.text, 170, measure);
      it.w = Math.max(...it.lines.map(l => measure(l))) + 22;
      const i = at.get(it.over[0]), j = at.get(it.over[it.over.length - 1]);
      if (it.pos === "right"){ if (i + 1 < n) widen(i, i + 1, it.w + 24); else rightPad = Math.max(rightPad, it.w + 16); }
      else if (it.pos === "left"){ if (i > 0) widen(i - 1, i, it.w + 24); else leftPad = Math.max(leftPad, it.w + 16); }
      else if (i !== j) widen(i, j, it.w - 20);
    }
  });
  const cx = new Array(n);
  cx[0] = MARGIN + leftPad + A[0].w / 2;
  for (let i = 1; i < n; i++) cx[i] = cx[i - 1] + gap[i];
  const title = model.title ? 28 : 0;
  const top = MARGIN + title;
  let yy = top + headH + 22;
  let body = "", frames = "", num = 0;
  const open = [];
  /* a frame reaches just past the boxes of the first and last participant
     inside it, a little less for each frame it sits in */
  const span = (lo, hi, depth) => ({ x0:cx[lo] - A[lo].w / 2 - 10 + depth * 6, x1:cx[hi] + A[hi].w / 2 + 10 - depth * 6 });
  let frameRight = 0;
  model.items.forEach((it, k) => {
    if (it.kind === "open"){ open.push({ it:it, y0:yy, lo:Infinity, hi:-Infinity, splits:[] }); yy += 30; return; }
    if (it.kind === "split"){ const fr = open[open.length - 1]; if (fr){ fr.splits.push({ y:yy, text:it.text, word:it.word }); yy += 26; } return; }
    if (it.kind === "close"){
      const fr = open.pop(); if (!fr) return;
      if (fr.lo === Infinity){ fr.lo = 0; fr.hi = n - 1; }
      open.forEach(o => { o.lo = Math.min(o.lo, fr.lo); o.hi = Math.max(o.hi, fr.hi); });
      const s = span(fr.lo, fr.hi, open.length);
      const y1 = yy + 4;
      const word = fr.it.type;
      frames += '<rect class="dg-frame' + (word === "rect" ? " tint" : "") + '" x="' + f(s.x0) + '" y="' + f(fr.y0) + '" width="' + f(s.x1 - s.x0) + '" height="' + f(y1 - fr.y0) + '" rx="6"/>';
      if (word !== "rect"){
        const tw = measure(word, 11) + 14;
        frames += '<path class="dg-ftab" d="M' + f(s.x0) + " " + f(fr.y0 + 6) + "Q" + f(s.x0) + " " + f(fr.y0) + " " + f(s.x0 + 6) + " " + f(fr.y0) + "H" + f(s.x0 + tw) + "V" + f(fr.y0 + 13) +
                  "L" + f(s.x0 + tw - 6) + " " + f(fr.y0 + 20) + "H" + f(s.x0) + 'Z"/>' +
                  '<text class="dg-fw" x="' + f(s.x0 + 7) + '" y="' + f(fr.y0 + 10) + '" dy=".35em">' + xml(word) + "</text>";
        if (fr.it.text){
          frames += '<text class="dg-fc" x="' + f(s.x0 + tw + 8) + '" y="' + f(fr.y0 + 10) + '" dy=".35em">[' + xml(fr.it.text) + "]</text>";
          frameRight = Math.max(frameRight, s.x0 + tw + 8 + measure("[" + fr.it.text + "]", 12) + 6);
        }
      }
      fr.splits.forEach(sp => {
        frames += '<path class="dg-fsplit" d="M' + f(s.x0) + " " + f(sp.y) + "H" + f(s.x1) + '"/>';
        if (sp.text){
          frames += '<text class="dg-fc" x="' + f(s.x0 + 8) + '" y="' + f(sp.y + 12) + '" dy=".35em">[' + xml(sp.text) + "]</text>";
          frameRight = Math.max(frameRight, s.x0 + 8 + measure("[" + sp.text + "]", 12) + 6);
        }
      });
      yy = y1 + 14;
      return;
    }
    const touch = (i, j) => open.forEach(o => { o.lo = Math.min(o.lo, i, j); o.hi = Math.max(o.hi, i, j); });
    if (it.kind === "note"){
      const i = at.get(it.over[0]), j = at.get(it.over[it.over.length - 1]);
      touch(i, j);
      const h = it.lines.length * LH + 12;
      let x0, w = it.w;
      if (it.pos === "right") x0 = cx[i] + 10;
      else if (it.pos === "left") x0 = cx[i] - 10 - w;
      else { const lo = Math.min(cx[i], cx[j]), hi = Math.max(cx[i], cx[j]); w = Math.max(w, hi - lo + 40); x0 = (lo + hi) / 2 - w / 2; }
      body += '<path class="dg-note" d="M' + f(x0) + " " + f(yy) + "H" + f(x0 + w - 8) + "L" + f(x0 + w) + " " + f(yy + 8) + "V" + f(yy + h) + "H" + f(x0) + 'Z"/>' +
              textBlock(it.lines, x0 + w / 2, yy + h / 2, "dg-t dg-nt");
      yy += h + 14;
      return;
    }
    /* a message: its words above the line, the line, the head */
    const i = at.get(it.from), j = at.get(it.to);
    touch(i, j);
    const lines = it.lines, th = lines.length * 16;
    const cls = "dg-edge" + (it.dashed ? " dot" : "");
    num++;
    const tag = model.auto ? '<circle class="dg-num" cx="' + f(cx[i]) + '" cy="' + f(yy + th + 2) + '" r="9"/><text class="dg-numt" text-anchor="middle" x="' + f(cx[i]) + '" y="' + f(yy + th + 2) + '" dy=".35em">' + num + "</text>" : "";
    if (i === j){
      const x0 = cx[i], y0 = yy + th + 2, w = 34, h = 22;
      body += '<text class="dg-mt" x="' + f(x0 + w + 8) + '" y="' + f(y0 + 2) + '" dy=".35em">' + lines.map((l, q) => '<tspan x="' + f(x0 + w + 8) + '"' + (q ? ' dy="16"' : "") + ">" + xml(l) + "</tspan>").join("") + "</text>";
      body += '<path class="' + cls + '" d="M' + f(x0) + " " + f(y0) + "H" + f(x0 + w) + "V" + f(y0 + h) + "H" + f(x0 + 2) + '"/>';
      if (it.head === "arrow" || it.head === "open") body += head({ x:x0 + 1, y:y0 + h }, { x:x0 + 12, y:y0 + h });
      body += tag;
      yy += th + h + 22;
      return;
    }
    const y0 = yy + th + 4;
    const dir = j > i ? 1 : -1;
    const x0 = cx[i] + (tag ? dir * 10 : 0), x1 = cx[j] - dir * 1;
    body += '<text class="dg-mt" text-anchor="middle" x="' + f((cx[i] + cx[j]) / 2) + '" y="' + f(yy + 6) + '" dy=".35em">' +
            lines.map((l, q) => '<tspan x="' + f((cx[i] + cx[j]) / 2) + '"' + (q ? ' dy="16"' : "") + ">" + xml(l) + "</tspan>").join("") + "</text>";
    body += '<path class="' + cls + '" d="M' + f(x0) + " " + f(y0) + "H" + f(x1) + '"/>';
    if (it.head === "cross"){
      const c = x1 - dir * 6;
      body += '<path class="dg-cross" d="M' + f(c - 5) + " " + f(y0 - 5) + "L" + f(c + 5) + " " + f(y0 + 5) + "M" + f(c - 5) + " " + f(y0 + 5) + "L" + f(c + 5) + " " + f(y0 - 5) + '"/>';
    } else if (it.head !== "open") body += head({ x:x1, y:y0 }, { x:x1 - dir * 10, y:y0 });
    if (it.both) body += head({ x:x0, y:y0 }, { x:x0 + dir * 10, y:y0 });
    body += tag;
    yy = y0 + 22;
  });
  while (open.length) open.pop();
  const bottom = yy + 4;
  const bottomHeads = model.items.length >= 6;
  let heads = "", lives = "";
  A.forEach((a, i) => {
    const drawHead = y0 => a.kind === "actor"
      ? '<g class="dg-actor">' + person(cx[i], y0 + headH - a.h + 2) + textBlock(a.lines, cx[i], y0 + headH - (a.lines.length * LH) / 2 - 2) + "</g>"
      : '<rect class="dg-node" x="' + f(cx[i] - a.w / 2) + '" y="' + f(y0) + '" width="' + f(a.w) + '" height="' + f(headH) + '" rx="8"/>' + textBlock(a.lines, cx[i], y0 + headH / 2);
    heads += drawHead(top);
    lives += '<path class="dg-life" d="M' + f(cx[i]) + " " + f(top + headH) + "V" + f(bottom + (bottomHeads ? 0 : 8)) + '"/>';
    if (bottomHeads) heads += drawHead(bottom);
  });
  const width = Math.ceil(Math.max(cx[n - 1] + A[n - 1].w / 2 + MARGIN + rightPad, MARGIN * 2 + 120, frameRight + MARGIN));
  const height = Math.ceil(bottom + (bottomHeads ? headH : 8) + MARGIN);
  const titleSvg = model.title ? '<text class="dg-title" x="' + MARGIN + '" y="' + (MARGIN + 8) + '" dy=".35em">' + xml(model.title) + "</text>" : "";
  return { width:width, height:height, ox:0, oy:0, body:titleSvg + frames + lives + heads + body };
}
function person(cx, y0){
  return '<circle class="dg-node" cx="' + f(cx) + '" cy="' + f(y0 + 6) + '" r="6"/>' +
    '<path class="dg-edge" d="M' + f(cx) + " " + f(y0 + 12) + "V" + f(y0 + 24) + "M" + f(cx - 9) + " " + f(y0 + 16) + "H" + f(cx + 9) +
    "M" + f(cx) + " " + f(y0 + 24) + "L" + f(cx - 7) + " " + f(y0 + 33) + "M" + f(cx) + " " + f(y0 + 24) + "L" + f(cx + 7) + " " + f(y0 + 33) + '"/>';
}

/* ═══ the picture ════════════════════════════════════════════════════════ */
/* the colours, written into the picture when it is to leave the page */
function styleBlock(t){
  return "<style>" +
    ".dg-root{font-family:" + FONT.family + ";font-size:" + FONT.size + "px}" +
    ".dg-node{fill:" + t.node + ";stroke:" + t.stroke + ";stroke-width:1.4}" +
    ".dg-node.dec{fill:" + t.dec + "}" +
    ".dg-lid{fill:none}" +
    ".dg-t,.dg-mt{fill:" + t.text + "}.dg-nt{fill:" + t.text + "}" +
    ".dg-edge{fill:none;stroke:" + t.edge + ";stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}" +
    ".dg-edge.dot{stroke-dasharray:5 4}.dg-edge.thick{stroke-width:3}" +
    ".dg-head{fill:" + t.edge + "}.dg-cross{fill:none;stroke:" + t.edge + ";stroke-width:1.8}" +
    ".dg-lbl{fill:" + t.bg + ";stroke:" + t.soft + "}.dg-lt{fill:" + t.dim + ";font-size:12px}" +
    ".dg-grp{fill:" + t.group + ";stroke:" + t.soft + ";stroke-dasharray:4 3}.dg-gt{fill:" + t.dim + ";font-size:12px;font-weight:600}" +
    ".dg-start{fill:" + t.accent + "}.dg-endring{fill:none;stroke:" + t.accent + ";stroke-width:2}" +
    ".dg-life{stroke:" + t.soft + ";stroke-width:1.4;stroke-dasharray:4 4}" +
    ".dg-note{fill:" + t.note + ";stroke:" + t.noteLine + "}" +
    ".dg-frame{fill:none;stroke:" + t.soft + ";stroke-width:1.3}.dg-frame.tint{fill:" + t.group + "}" +
    ".dg-ftab{fill:" + t.group + ";stroke:" + t.soft + "}.dg-fw{fill:" + t.text + ";font-size:11px;font-weight:700}" +
    ".dg-fc{fill:" + t.dim + ";font-size:12px}.dg-fsplit{stroke:" + t.soft + ";stroke-dasharray:4 3}" +
    ".dg-num{fill:" + t.accent + "}.dg-numt{fill:" + t.onAccent + ";font-size:10.5px;font-weight:700}" +
    ".dg-title{fill:" + t.text + ";font-size:14px;font-weight:650}" +
    "</style>";
}
const KINDS = { flow:"flowchart", sequence:"sequence", state:"state" };
function render(model, opts){
  opts = opts || {};
  const size = FONT.size;
  const measure = (t, s) => (opts.measure ? opts.measure(String(t), s || size) : estimate(t, s || size));
  const r = model.type === "sequence" ? renderSequence(model, measure) : renderFlow(model, measure);
  const w = Math.max(40, r.width), h = Math.max(30, r.height);
  const t = opts.theme;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" class="dg-root" viewBox="' + f(r.ox) + " " + f(r.oy) + " " + w + " " + h + '" width="' + w + '" height="' + h + '"' +
    ' role="img" aria-label="' + xml((model.title || "") + " " + (model.state ? "state diagram" : KINDS[model.type] || "diagram")) + '">' +
    (t ? styleBlock(t) + '<rect x="' + f(r.ox) + '" y="' + f(r.oy) + '" width="' + w + '" height="' + h + '" fill="' + t.bg + '"/>' : "") +
    r.body + "</svg>";
  return { svg:svg, width:w, height:h, boxes:r.boxes || [] };
}
function draw(src, opts){
  let p;
  try { p = parse(src); } catch (e){ return { ok:false, error:"could not read it" }; }
  if (!p.ok) return p;
  try {
    const r = render(p.model, opts);
    return { ok:true, svg:r.svg, width:r.width, height:r.height, model:p.model, boxes:r.boxes,
             kind:p.model.state ? "state" : p.model.type === "sequence" ? "sequence" : "flowchart" };
  } catch (e){ return { ok:false, error:"could not lay it out" }; }
}

const API = { VERSION:VERSION, FONT:FONT, LIMITS:LIMITS, parse:parse, render:render, draw:draw, wrap:wrap, estimate:estimate, plain:plain };
if (typeof module === "object" && module.exports) module.exports = API;
if (root) root.DossierDiagram = API;
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this);
