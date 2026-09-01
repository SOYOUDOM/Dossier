/* ═══════════════════════════════════════════════════════════════════════════
   DOSSIER ASSIST — the part that decides what to tell you

   There is no model here and nothing is downloaded. Every number below is
   counted from the records already in your own workspace, so it knows only
   what you have logged, it gets sharper as you log more, and on a fresh
   folder it says nothing rather than guessing.

   Two things come out of this file:

     queue(ctx)  the live records in the order worth doing, each carrying the
                 reasons it landed where it did
     brief(ctx)  things worth knowing that no single record would tell you —
                 a system that has started failing, a wait that has gone quiet,
                 work that has silently stopped moving

   It does not touch the DOM and it does not know any language. Every piece of
   text it produces is a phrase key and its variables, {k, v}; the app renders
   them through L(). That keeps Khmer working for free and keeps this file
   testable on its own.

   The app hands in the statistics it already has (tok, idf, similar, …) via
   ctx.h, rather than this file growing a second copy of them that could drift.
   ═══════════════════════════════════════════════════════════════════════════ */

(function(){
"use strict";

const DAY = 86400000;

/* ═══ ARITHMETIC ═════════════════════════════════════════════════════════ */

function median(v){
  if (!v.length) return 0;
  const s = v.slice().sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function quantile(v, q){
  if (!v.length) return 0;
  const s = v.slice().sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * q)));
  return s[i];
}
function mean(v){ return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; }
function round1(n){ return Math.round(n * 10) / 10; }

/* whole days from one YYYY-MM-DD to another; parsed as UTC so that a machine
   in Phnom Penh and one in London agree on what "tomorrow" means */
function keyDays(a, b){
  const pa = Date.parse(a + "T00:00:00Z"), pb = Date.parse(b + "T00:00:00Z");
  if (isNaN(pa) || isNaN(pb)) return null;
  return Math.round((pb - pa) / DAY);
}
function daysSince(iso, now){
  if (!iso) return null;
  const t = Date.parse(iso);
  return isNaN(t) ? null : (now - t) / DAY;
}

/* ═══ THE QUEUE ══════════════════════════════════════════════════════════
   One number per live record, and — the part that matters — the reasons that
   made it. A ranking you cannot argue with is a ranking you stop trusting, so
   every record can say why it sits where it does. */

function score(t, ctx){
  const h = ctx.h, now = ctx.now, tk = h.today();
  const why = [];
  let n = 0;

  /* Something with a date is a promise to someone. Overdue outranks the rest,
     and keeps climbing, but not without limit — a record three weeks late is
     not thirty times more urgent than one a day late, it is just stuck, and
     the stalled detector will say so separately. */
  const d = t.due ? keyDays(tk, t.due) : null;
  if (d != null){
    if (d < 0){
      n += 40 + Math.min(15, -d * 3);
      why.push({ k:"AiWhyOverdue", v:{ days: -d }, w: 40 + Math.min(15, -d * 3) });
    } else if (d === 0){
      n += 32; why.push({ k:"AiWhyDueToday", v:{}, w:32 });
    } else if (d === 1){
      n += 18; why.push({ k:"AiWhyDueTomorrow", v:{}, w:18 });
    } else if (d <= 3){
      n += 10; why.push({ k:"AiWhyDueSoon", v:{ days:d }, w:10 });
    }
  }

  const pw = { P1:30, P2:18, P3:8, P4:2 }[t.priority] || 0;
  if (pw){ n += pw; why.push({ k:"AiWhyPriority", v:{ pri:t.priority }, w:pw }); }

  /* Half-finished work is the most expensive kind: the context is still in
     your head, and it evaporates overnight. */
  if (t.status === "processing"){
    n += 12; why.push({ k:"AiWhyStarted", v:{}, w:12 });
  }

  /* Not yours to move right now. Kept in the list at the bottom rather than
     hidden, because a wait that has gone stale is still your problem — that is
     what the chase card is for. */
  if (t.waitOn){
    n -= 45; why.push({ k:"AiWhyWaiting", v:{ who:t.waitOn }, w:-45 });
  }
  if (t.status === "blocked"){
    const held = (t.blockedBy || []).length;
    n -= 55; why.push({ k:"AiWhyBlocked", v:{ n:held }, w:-55 });
  }

  const age = daysSince(t.created, now);
  if (age != null && age > 2){
    const w = Math.min(10, age / 3);
    n += w; why.push({ k:"AiWhyOld", v:{ days:Math.round(age) }, w });
  }

  /* A ten-minute job due today is worth doing before an hour-long one: it
     clears the board and it cannot be the thing that overruns. */
  const est = +t.estimate || 0;
  if (est && est <= 15 && d != null && d <= 1){
    n += 6; why.push({ k:"AiWhyQuick", v:{ mins:est }, w:6 });
  }

  why.sort((a, b) => Math.abs(b.w) - Math.abs(a.w));
  return { score: Math.round(n), why: why.slice(0, 3) };
}

function queue(ctx){
  const h = ctx.h;
  const out = [];
  ctx.tasks.forEach(t => {
    if (h.LIVE.indexOf(t.status) < 0) return;
    const s = score(t, ctx);
    out.push({ id:t.id, task:t, score:s.score, why:s.why });
  });
  return out.sort((a, b) =>
    b.score - a.score || String(a.task.created).localeCompare(String(b.task.created)));
}

/* ═══ DETECTORS ══════════════════════════════════════════════════════════
   Each one answers a question you would otherwise have to notice yourself,
   and each refuses to speak until it has enough records to mean it. A card
   that fires on two data points is noise, and noise is how a panel like this
   gets ignored. */

const DETECTORS = [];
function detector(name, min, fn){ DETECTORS.push({ name, min, fn }); }

/* ── A system that has started misbehaving ──────────────────────────────
   Six records against Imaging this week when it usually produces one and a
   half is not six tickets, it is one fault with six symptoms. Worth seeing
   as a whole, because the fix is a single piece of work. */
detector("surge", 12, function(ctx){
  const h = ctx.h, now = ctx.now, out = [];
  const bySys = {};
  ctx.tasks.forEach(t => {
    if (!t.system || !t.created) return;
    const age = daysSince(t.created, now);
    if (age == null || age < 0 || age > 35) return;
    const e = bySys[t.system] || (bySys[t.system] = { recent:[], prior:[0,0,0,0] });
    if (age <= 7) e.recent.push(t);
    else {
      const wk = Math.min(3, Math.floor((age - 7) / 7));
      e.prior[wk]++;
    }
  });
  for (const sys in bySys){
    const e = bySys[sys], n = e.recent.length;
    const base = mean(e.prior);
    /* three is the floor: below that, any quiet system looks like a spike */
    if (n < 3) continue;
    if (n < Math.max(3, base * 2.5)) continue;
    out.push({
      id: "surge:" + sys, kind: "surge", tone: "warn",
      score: 70 + Math.min(25, n * 2),
      title: { k:"AiSurgeTitle", v:{ system:sys } },
      body:  { k:"AiSurgeBody",  v:{ n, usual: round1(base) } },
      why:   [{ k:"AiSurgeWhy", v:{ n, usual: round1(base) } }],
      ids:   e.recent.map(t => t.id)
    });
  }
  return out;
});

/* ── A wait that has gone quiet ─────────────────────────────────────────
   How long a party normally takes is not a guess: it is in the wait log of
   every record they have already held. Past that, by a margin, is the moment
   to chase — not a fixed three days for everyone. */
detector("chase", 6, function(ctx){
  const h = ctx.h, now = ctx.now, out = [];

  /* what each party has historically taken, from closed waits */
  const past = {};
  ctx.tasks.forEach(t => {
    (t.waitLog || []).forEach(w => {
      if (!w || !w.party || !w.from || !w.to) return;
      const days = (Date.parse(w.to) - Date.parse(w.from)) / DAY;
      if (isNaN(days) || days < 0 || days > 90) return;
      (past[w.party] = past[w.party] || []).push(days);
    });
  });

  ctx.tasks.forEach(t => {
    if (h.LIVE.indexOf(t.status) < 0 || !t.waitOn || !t.waitSince) return;
    const waiting = daysSince(t.waitSince, now);
    if (waiting == null) return;
    const seen = past[t.waitOn] || [];
    const usual = seen.length >= 3 ? median(seen) : null;
    const limit = usual != null ? Math.max(1, usual * 1.6)
                                : Math.max(1, +ctx.settings.remindWait || 3);
    if (waiting < limit) return;

    /* already chased today — saying it again helps nobody */
    const last = (t.chases || []).slice(-1)[0];
    const sinceChase = last ? daysSince(last, now) : null;
    if (sinceChase != null && sinceChase < 1) return;

    out.push({
      id: "chase:" + t.id, kind: "chase", tone: "warn",
      score: 55 + Math.min(30, (waiting - limit) * 6),
      title: { k:"AiChaseTitle", v:{ who:t.waitOn } },
      body:  { k:"AiChaseBody",  v:{ title:t.title, days:Math.floor(waiting) } },
      why: [ usual != null
             ? { k:"AiChaseWhyUsual", v:{ who:t.waitOn, days:round1(usual), n:seen.length } }
             : { k:"AiChaseWhyDefault", v:{ days:limit } },
             (t.chases || []).length
               ? { k:"AiChaseWhyChased",
                   v:{ n:(t.chases || []).length, days:Math.floor(sinceChase || 0) } }
               : { k:"AiChaseNever", v:{} } ],
      ids: [t.id], act: { kind:"chase", id:t.id }
    });
  });
  return out;
});

/* ── Work that has quietly stopped moving ───────────────────────────────
   Measured against your own record, not a round number: if this kind of work
   normally closes in two days, one sitting open for nine has stopped being
   slow and started being forgotten. */
detector("stalled", 10, function(ctx){
  const h = ctx.h, now = ctx.now, out = [];

  const durations = {}, all = [];
  ctx.tasks.forEach(t => {
    if (t.status !== "done" || !t.created || !t.completed) return;
    const d = (Date.parse(t.completed) - Date.parse(t.created)) / DAY;
    if (isNaN(d) || d < 0 || d > 180) return;
    all.push(d);
    const key = t.type || t.system;
    if (key) (durations[key] = durations[key] || []).push(d);
  });
  if (all.length < 8) return out;
  const overall = quantile(all, 0.85);

  ctx.tasks.forEach(t => {
    if (h.LIVE.indexOf(t.status) < 0) return;
    if (t.waitOn || t.status === "blocked") return;   // held, not forgotten
    const age = daysSince(t.created, now);
    if (age == null) return;
    const key = t.type || t.system;
    const cohort = key && (durations[key] || []).length >= 4 ? durations[key] : null;
    const limit = Math.max(1.5, cohort ? quantile(cohort, 0.85) : overall);
    if (age < limit * 1.25) return;

    /* has anything happened on it lately? a long job being actively worked is
       not stalled — the log is the evidence */
    const lastLog = (t.log || []).slice(-1)[0];
    const quiet = lastLog ? daysSince(lastLog.at, now) : age;
    if (quiet != null && quiet < 3) return;

    out.push({
      id: "stalled:" + t.id, kind: "stalled", tone: "warn",
      score: 45 + Math.min(25, (age - limit) * 2),
      title: { k:"AiStalledTitle", v:{ days:Math.floor(age) } },
      body:  { k:"AiStalledBody",  v:{ title:t.title, quiet:Math.floor(quiet == null ? age : quiet) } },
      why: [ cohort
             ? { k:"AiStalledWhyCohort", v:{ kind:key, days:round1(limit), n:cohort.length } }
             : { k:"AiStalledWhyAll", v:{ days:round1(limit), n:all.length } } ],
      ids: [t.id], act: { kind:"open", id:t.id }
    });
  });
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
});

/* ── You have fixed this before, and you wrote down how ─────────────────
   The most useful thing this file does. A live record that closely matches
   one already closed, where the closed one carries a script or notes, is a
   job you have already solved once. */
detector("runbook", 6, function(ctx){
  const h = ctx.h, out = [];
  if (typeof h.similar !== "function") return out;

  ctx.tasks.forEach(t => {
    if (h.LIVE.indexOf(t.status) < 0) return;
    let near;
    try { near = h.similar(t.title, t.id, 6, 0.45) || []; } catch(e){ return; }
    const solved = near
      .map(x => x.task ? x : { task:x, score:0 })
      .filter(x => x.task && x.task.status === "done")
      .filter(x => (x.task.scripts || []).length ||
                   String(x.task.notes || "").trim().length > 40 ||
                   (x.task.checklist || []).length);
    if (!solved.length) return;
    const best = solved[0], p = best.task;
    const sc = (p.scripts || [])[0] || "";
    const scName = sc && (ctx.scripts || []).length
      ? ((ctx.scripts.find(x => x.id === sc || x.file === sc) || {}).file || sc) : sc;

    out.push({
      id: "runbook:" + t.id, kind: "runbook", tone: "good",
      score: 40 + Math.round(best.score * 30) + (sc ? 12 : 0),
      title: { k:"AiRunbookTitle", v:{ title:t.title } },
      body:  scName ? { k:"AiRunbookBodyScript", v:{ code:p.code, script:scName } }
                    : { k:"AiRunbookBodyNotes",  v:{ code:p.code } },
      why:   [{ k:"AiRunbookWhy",
                v:{ pct:Math.round(best.score * 100), n:solved.length } }],
      ids: [t.id, p.id], act: { kind:"open", id:p.id }
    });
  });
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
});

/* ── The same job, raised twice ─────────────────────────────────────────
   The tokeniser drops bare numbers, which is right for matching but wrong
   here: "pool crash on node 3" and "node 5" reduce to the same words and
   would be called duplicates. When the digits differ, they are two jobs. */
function sameNumbers(a, b){
  const na = (String(a).match(/\d+/g) || []).join(","),
        nb = (String(b).match(/\d+/g) || []).join(",");
  return !na || !nb || na === nb;
}
detector("duplicate", 4, function(ctx){
  const h = ctx.h, out = [], seen = {};
  if (typeof h.similar !== "function") return out;
  const liveOnes = ctx.tasks.filter(t => h.LIVE.indexOf(t.status) >= 0);

  liveOnes.forEach(t => {
    let near;
    try { near = h.similar(t.title, t.id, 3, 0.66) || []; } catch(e){ return; }
    const twin = near.map(x => x.task || x)
                     .filter(x => x && h.LIVE.indexOf(x.status) >= 0)
                     .filter(x => sameNumbers(t.title, x.title))[0];
    if (!twin) return;
    const pair = [t.id, twin.id].sort().join("|");
    if (seen[pair]) return;
    seen[pair] = 1;
    out.push({
      id: "dup:" + pair, kind: "duplicate", tone: "info", score: 38,
      title: { k:"AiDupTitle", v:{} },
      body:  { k:"AiDupBody", v:{ a:t.code, b:twin.code, title:t.title } },
      why:   [{ k:"AiDupWhy", v:{} }],
      ids: [t.id, twin.id], act: { kind:"open", id:t.id }
    });
  });
  return out.slice(0, 2);
});

/* ── More promised today than there is day left ─────────────────────────
   Better known at 09:00, while it can still be moved, than at 17:00. */
detector("load", 3, function(ctx){
  const h = ctx.h, now = ctx.now, tk = h.today();
  const due = ctx.tasks.filter(t =>
    h.LIVE.indexOf(t.status) >= 0 && t.due && keyDays(tk, t.due) <= 0 && !t.waitOn);
  if (due.length < 3) return [];

  /* an estimate when there is one, otherwise what this kind of work has
     actually taken you in the past */
  let known = 0;
  const need = due.reduce((s, t) => {
    if (+t.estimate) { known++; return s + (+t.estimate - (h.live ? h.live(t) : 0)); }
    let g = null;
    if (typeof h.estimateFor === "function"){
      try { g = h.estimateFor(t.title); } catch(e){ g = null; }
    }
    return s + (g ? g.minutes : 30);
  }, 0);
  if (need <= 0) return [];

  const d = new Date(now);
  const endMin = 17 * 60 + 30;
  const left = Math.max(0, endMin - (d.getHours() * 60 + d.getMinutes()));
  if (!left) return [];
  if (need <= left * 1.1) return [];

  return [{
    id: "load:" + tk, kind: "load", tone: "warn",
    score: 60 + Math.min(20, Math.round((need - left) / 30)),
    title: { k:"AiLoadTitle", v:{ n:due.length } },
    body:  { k:"AiLoadBody", v:{ need:Math.round(need), left } },
    why:   [ known === due.length
             ? { k:"AiLoadWhyAll",   v:{ total:due.length } }
             : { k:"AiLoadWhyMixed", v:{ known, total:due.length } } ],
    ids: due.map(t => t.id)
  }];
});

/* ── Something you keep doing by hand ───────────────────────────────────── */
detector("routineable", 8, function(ctx){
  const h = ctx.h;
  if (typeof h.repeatCandidates !== "function") return [];
  let cands;
  try { cands = h.repeatCandidates() || []; } catch(e){ return []; }
  return cands.slice(0, 2).map(c => ({
    id: "routine:" + c.title, kind: "routineable", tone: "info",
    score: 30 + c.count,
    title: { k:"AiRoutineTitle", v:{ title:c.title } },
    body:  { k:"AiRoutineBody", v:{ title:c.title, n:c.count, days:c.everyDays } },
    why:   [{ k:"AiRoutineWhy", v:{ n:c.count } }],
    ids: c.sample ? [c.sample.id] : [],
    act: { kind:"routine", title:c.title, everyDays:c.everyDays }
  }));
});

/* ═══ THE BRIEF ══════════════════════════════════════════════════════════ */

function brief(ctx){
  const cards = [], skipped = [];
  const n = (ctx.tasks || []).length;
  DETECTORS.forEach(d => {
    if (n < d.min){ skipped.push({ name:d.name, need:d.min }); return; }
    let got;
    /* one detector throwing must not take the panel down with it */
    try { got = d.fn(ctx) || []; }
    catch(e){ got = []; }
    got.forEach(c => { c.from = d.name; cards.push(c); });
  });
  cards.sort((a, b) => b.score - a.score);

  /* Six records against one failing system are one problem, and the surge
     card already says so. Left alone, the same six also read as stalled, as
     duplicates of each other, and as work regular enough to schedule — three
     more cards that add nothing and bury the ones that do. Anything a surge
     already covers is dropped, except the cards that genuinely say something
     new about it: how you fixed it last time, and who has gone quiet. */
  const ABSORBS = { surge: ["stalled", "routineable", "duplicate"] };
  const kept = [];
  cards.forEach(c => {
    const swallowed = kept.some(k =>
      (ABSORBS[k.kind] || []).indexOf(c.kind) >= 0 &&
      (c.ids || []).length && (c.ids || []).every(id => (k.ids || []).indexOf(id) >= 0));
    if (!swallowed) kept.push(c);
  });

  return {
    cards: kept,
    skipped,
    records: n,
    /* how much it has to go on — the panel says this out loud rather than
       letting a confident-looking card rest on four records */
    evidence: n < 10 ? "thin" : n < 40 ? "fair" : "good"
  };
}

window.DossierAI = {
  version: "1.0",
  detectors: DETECTORS.map(d => d.name),
  queue: queue,
  brief: brief,
  score: score,
  /* exposed for the tests, and for anyone wanting to check the arithmetic */
  _util: { median, quantile, mean, keyDays, daysSince }
};

})();
