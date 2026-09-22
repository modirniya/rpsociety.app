/* RPS Mafia — role generator, secret dealer and narrator. One phone at a table.
 *
 * Three stages on one page: set up the table, deal in secret (pass the phone), narrate the night.
 * All state lives in this browser (localStorage) and nothing is ever sent anywhere. The rules
 * themselves are in rules.js, which is tested against the engine's rulings; this file only draws.
 */
(function () {
  "use strict";
  var R = window.RPSRules;
  var root = document.getElementById("tool");
  if (!R || !root) return;

  var START = root.getAttribute("data-start") || "setup";
  var LS_GROUP = "rps.tool.group.v1";
  var LS_GAME = "rps.tool.game.v1";
  var HIDE_AFTER = 8; // seconds a revealed card stays up

  // ── state ────────────────────────────────────────────────────────────────────────────────

  var S = {
    stage: "setup",           // setup | deal | narrate
    n: 8, names: [], comp: null, customOpen: false, assignOpen: false,
    players: null, dealIndex: 0, revealed: false, allShown: false,
    game: null, history: [],
    stepIndex: 0, actions: {}, pick: [], tally: {}, mayor: null, result: null, notesOpen: false,
    logOpen: false, mafiaShown: false,
  };
  var hideTimer = null, hideLeft = 0, pressTimer = null;

  function defaultNames(n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(S.names[i] || "");
    return out;
  }
  function nameAt(i) { return (S.names[i] || "").trim() || "Player " + (i + 1); }

  function load() {
    try {
      var g = JSON.parse(localStorage.getItem(LS_GROUP) || "null");
      if (g && g.n >= R.MIN && g.n <= R.MAX) { S.n = g.n; S.names = g.names || []; S.comp = g.comp || null; }
    } catch (e) { /* no group remembered */ }
    try {
      var s = JSON.parse(localStorage.getItem(LS_GAME) || "null");
      if (s && (s.stage === "narrate" || s.stage === "deal") && s.players) {
        ["stage", "players", "dealIndex", "game", "history", "stepIndex", "actions", "tally", "mayor", "result"].forEach(function (k) { if (k in s) S[k] = s[k]; });
        S.revealed = false;
      }
    } catch (e) { /* nothing in progress */ }
    if (!S.comp || R.total(S.comp) !== S.n) S.comp = R.canonical(S.n);
    S.names = defaultNames(S.n);
  }

  function save() {
    try {
      localStorage.setItem(LS_GROUP, JSON.stringify({ n: S.n, names: S.names, comp: S.comp }));
      if (S.stage === "setup") localStorage.removeItem(LS_GAME);
      else localStorage.setItem(LS_GAME, JSON.stringify({
        stage: S.stage, players: S.players, dealIndex: S.dealIndex, game: S.game, history: S.history,
        stepIndex: S.stepIndex, actions: S.actions, tally: S.tally, mayor: S.mayor, result: S.result,
      }));
    } catch (e) { /* private mode — the tool still works for this visit */ }
  }

  // ── helpers ──────────────────────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function role(k) { return R.ROLES[k]; }
  function pill(k, count) {
    var r = role(k);
    return '<span class="rt-pill" style="background:' + r.color + '">' + esc(r.name) + (count > 1 ? " ×" + count : "") + "</span>";
  }
  function player(id) { return R.byId(S.game, id); }
  function h(strings) { return strings; }

  // ── stage 1: set up ──────────────────────────────────────────────────────────────────────

  function setCount(n) {
    n = Math.max(R.MIN, Math.min(R.MAX, n));
    var wasCanonical = R.isCanonical(S.comp, S.n);
    S.n = n;
    S.names = defaultNames(n);
    if (wasCanonical || R.total(S.comp) !== n) S.comp = R.canonical(n);
    render();
  }

  function applyPreset(which) {
    var c = R.canonical(S.n);
    if (which === "gentle") {
      if (c.sniper) { delete c.sniper; c.citizen = (c.citizen | 0) + 1; }
      if (!c.die_hard && (c.citizen | 0) > 0) { c.die_hard = 1; c.citizen -= 1; }
    } else if (which === "everything") {
      ["mayor", "psychiatrist", "negotiator"].forEach(function (k) {
        if ((c.citizen | 0) > 0) { c[k] = 1; c.citizen -= 1; }
      });
    }
    S.comp = c;
    render();
  }

  function bump(k, d) {
    var v = (S.comp[k] | 0) + d;
    if (v < 0) return;
    if (v === 0) delete S.comp[k]; else S.comp[k] = v;
    render();
  }

  function viewSetup() {
    var w = R.warnings(S.comp, S.n);
    var errors = w.filter(function (x) { return x.level === "error"; }).length;
    var canon = R.isCanonical(S.comp, S.n);
    var pills = R.ORDER.filter(function (k) { return S.comp[k] | 0; }).map(function (k) { return pill(k, S.comp[k]); }).join("");

    var chips = "";
    for (var i = 0; i < S.n; i++) {
      chips += '<span class="rt-chip"><input data-name="' + i + '" value="' + esc(S.names[i] || "") +
        '" placeholder="Player ' + (i + 1) + '" maxlength="24" autocomplete="off" spellcheck="false" aria-label="Player ' + (i + 1) + ' name"></span>';
    }

    var rows = "";
    if (S.customOpen) {
      rows = '<div class="rt-roles">' + R.ORDER.map(function (k) {
        var r = role(k);
        return '<div class="rt-role"><span class="rt-swatch" style="background:' + r.color + '">' + r.icon + "</span>" +
          '<div class="rt-role-t"><b>' + esc(r.name) + (r.custom ? ' <em>custom</em>' : "") + "</b><small>" + esc(r.blurb) + "</small></div>" +
          '<div class="rt-count"><button type="button" data-bump="' + k + ':-1" aria-label="fewer ' + esc(r.name) + '">−</button>' +
          "<b>" + (S.comp[k] | 0) + '</b><button type="button" data-bump="' + k + ':1" aria-label="more ' + esc(r.name) + '">+</button></div></div>';
      }).join("") + "</div>" +
        '<div class="rt-presets"><span>Presets</span>' +
        '<button type="button" class="btn btn-ghost" data-preset="standard">Standard</button>' +
        '<button type="button" class="btn btn-ghost" data-preset="gentle">Gentle</button>' +
        '<button type="button" class="btn btn-ghost" data-preset="everything">Everything</button></div>';
    }

    var assign = "";
    if (S.assignOpen) {
      var opts = R.ORDER.map(function (k) { return '<option value="' + k + '">' + esc(role(k).name) + "</option>"; }).join("");
      var rowsA = "";
      for (var j = 0; j < S.n; j++) {
        rowsA += '<label class="rt-assign-row"><span>' + esc(nameAt(j)) + '</span><select data-assign="' + j + '">' + opts + "</select></label>";
      }
      assign = '<div class="rt-assign"><p class="rt-hint">You dealt by hand and only want the narrator. Pick each player’s role — the totals still have to add up.</p>' +
        rowsA + '<div class="actions"><button type="button" class="btn btn-primary" id="rt-assign-go">Start narrating</button>' +
        '<button type="button" class="btn btn-ghost" id="rt-assign-close">Cancel</button></div></div>';
    }

    return '<div class="rt-stage"><span class="rt-step">1 · Set up the table</span></div>' +
      '<div class="rt-stepper"><button type="button" id="rt-minus" aria-label="fewer players">−</button>' +
      '<div><small>Players</small><b>' + S.n + "</b></div>" +
      '<button type="button" id="rt-plus" aria-label="more players">+</button><span class="rt-range">' + R.MIN + "–" + R.MAX + "</span></div>" +
      '<p class="rt-label">Names — optional</p><div class="rt-chips">' + chips + "</div>" +
      '<p class="rt-label">The deal for ' + S.n + " · " + (canon ? "Standard" : "Custom") + '</p><div class="rt-comp">' + pills + "</div>" +
      '<ul class="rt-warn">' + w.map(function (x) { return '<li class="' + x.level + '">' + esc(x.text) + "</li>"; }).join("") + "</ul>" +
      '<button type="button" class="btn btn-ghost rt-toggle" id="rt-custom">' + (S.customOpen ? "Hide roles ▴" : "Customise roles ▾") + "</button>" +
      rows +
      '<div class="actions rt-main"><button type="button" class="btn btn-primary rt-big" id="rt-deal"' + (errors ? " disabled" : "") + ">Deal in secret</button></div>" +
      '<p class="rt-alt"><button type="button" class="rt-link" id="rt-assign">Already dealt by hand? Assign roles and just narrate</button></p>' +
      assign;
  }

  // ── stage 2: deal in secret ──────────────────────────────────────────────────────────────

  function startDeal(players) {
    S.players = players;
    S.dealIndex = 0; S.revealed = false; S.allShown = false;
    S.game = null; S.history = []; S.result = null;
    S.stage = "deal";
    render();
  }

  function mates(p) {
    if (R.ROLES[p.role].team !== "mafia") return [];
    return S.players.filter(function (q) { return q.id !== p.id && R.ROLES[q.role].team === "mafia"; });
  }

  function clearHide() { if (hideTimer) { clearInterval(hideTimer); hideTimer = null; } }

  function reveal() {
    S.revealed = true; hideLeft = HIDE_AFTER;
    clearHide();
    hideTimer = setInterval(function () {
      hideLeft -= 1;
      var el = document.getElementById("rt-countdown");
      if (el) el.textContent = "hides in " + hideLeft + "s";
      if (hideLeft <= 0) hideAndPass();
    }, 1000);
    render();
  }

  function hideAndPass() {
    clearHide();
    S.revealed = false;
    S.dealIndex += 1;
    render();
  }

  function viewDeal() {
    var i = S.dealIndex, n = S.players.length;
    var dots = '<div class="rt-dots">' + S.players.map(function (_, k) {
      return '<i class="' + (k < i ? "done" : k === i ? "on" : "") + '"></i>';
    }).join("") + "</div>";

    if (S.allShown) return viewAllRoles();

    if (i >= n) {
      return '<div class="rt-stage"><span class="rt-step">2 · Dealt</span></div>' + dots +
        '<div class="rt-cover"><div class="rt-who">Everyone has seen their role</div>' +
        '<p class="rt-hint">Hand the phone to whoever is narrating. From here the tool reads the night, keeps the roster and calls the winner.</p></div>' +
        '<div class="actions rt-main"><button type="button" class="btn btn-primary rt-big" id="rt-narrate">Start narrating</button></div>' +
        '<div class="actions"><button type="button" class="btn btn-ghost" id="rt-redeal">Deal again</button>' +
        '<button type="button" class="btn btn-ghost" id="rt-setup">Back to setup</button></div>' + narratorOnly();
    }

    var p = S.players[i];
    var next = i + 1 < n ? S.players[i + 1].name : null;
    var head = '<div class="rt-stage"><span class="rt-step">2 · Deal · ' + (i + 1) + " of " + n + "</span>" +
      (S.revealed ? '<span class="rt-step" id="rt-countdown">hides in ' + hideLeft + "s</span>" : "") + "</div>" + dots;

    if (!S.revealed) {
      return head +
        '<div class="rt-cover"><p class="rt-hint">Hand the phone to</p><div class="rt-who">' + esc(p.name) + "</div>" +
        '<p class="rt-hint">Nobody else should be able to see the screen.</p>' +
        '<button type="button" class="btn btn-primary rt-big" id="rt-reveal">I’m ' + esc(p.name) + " — show me</button></div>" +
        (i > 0 ? '<p class="rt-alt"><button type="button" class="rt-link" id="rt-back">Not ' + esc(p.name) + "? Go back one</button></p>" : "") +
        narratorOnly();
    }

    var r = role(p.role);
    var team = r.team === "mafia" ? "Mafia" : "Town";
    var m = mates(p);
    return head +
      '<div class="rt-card" style="border-color:' + r.color + '55;background:' + r.color + '1a">' +
      '<div class="rt-card-ic" style="background:' + r.color + '">' + r.icon + "</div>" +
      '<div class="rt-card-nm">' + esc(r.name) + "</div>" +
      '<div class="rt-card-ds">' + esc(r.blurb) + "</div>" +
      '<div class="rt-card-team" style="color:' + r.color + '">' + team + "</div>" +
      (m.length ? '<div class="rt-mates">Your team: <b>' + m.map(function (q) { return esc(q.name); }).join("</b>, <b>") + "</b></div>" : "") +
      "</div>" +
      '<div class="actions rt-main"><button type="button" class="btn btn-primary rt-big" id="rt-hide">' +
      (next ? "Hide, and pass to " + esc(next) : "Hide — everyone has seen theirs") + "</button></div>";
  }

  function narratorOnly() {
    return '<p class="rt-alt"><button type="button" class="rt-link rt-hold" id="rt-showall">Narrator only: press and hold to see the whole deal</button></p>';
  }

  function viewAllRoles() {
    var rows = S.players.map(function (p) {
      var r = role(p.role);
      return '<li><span>' + esc(p.name) + '</span><span class="rt-pill" style="background:' + r.color + '">' + esc(r.name) + "</span></li>";
    }).join("");
    return '<div class="rt-stage"><span class="rt-step">Narrator only</span></div>' +
      '<p class="rt-hint">The whole deal. Do not show this to the table.</p><ul class="rt-list">' + rows + "</ul>" +
      '<div class="actions rt-main"><button type="button" class="btn btn-primary" id="rt-hideall">Hide it</button></div>';
  }

  // ── stage 3: narrate ─────────────────────────────────────────────────────────────────────

  function startNarrate() {
    S.game = R.newGame(S.players);
    S.history = []; S.stepIndex = 0; S.actions = {}; S.pick = []; S.tally = {}; S.mayor = null; S.result = null;
    S.stage = "narrate";
    render();
  }

  function snapshot() {
    S.history.push(JSON.stringify({ game: S.game, stepIndex: S.stepIndex, actions: S.actions, tally: S.tally, mayor: S.mayor, result: S.result }));
    if (S.history.length > 40) S.history.shift();
  }

  function undo() {
    var last = S.history.pop();
    if (!last) return;
    var o = JSON.parse(last);
    S.game = o.game; S.stepIndex = o.stepIndex; S.actions = o.actions; S.tally = o.tally; S.mayor = o.mayor; S.result = o.result;
    S.pick = [];
    render();
  }

  function roster() {
    return '<div class="rt-roster">' + S.game.players.map(function (p) {
      var cls = p.alive ? "" : "x";
      if (S.game.mutedForDay === p.id && S.game.phase === "day") cls += " muted";
      return '<i class="' + cls + '" title="' + esc(p.alive ? "alive" : "dead") + '">' + esc(p.name) + "</i>";
    }).join("") + "</div>";
  }

  function scoreline() {
    var c = R.counts(S.game);
    var need = c.town - c.mafia; // eliminations the mafia need
    return '<p class="rt-score">' + c.mafia + " mafia · " + c.town + " town" +
      (c.mafia ? " — mafia win at parity, " + need + " away" : "") + "</p>";
  }

  function commitStep(step) {
    if (step.key === "meet") return;
    if (step.max === 2) S.actions[step.key] = S.pick.slice();
    else S.actions[step.key] = S.pick.length ? S.pick[0] : null;
  }

  function viewNight() {
    var g = S.game;
    var steps = R.nightSteps(g);
    var i = S.stepIndex;

    if (i >= steps.length) {
      return '<div class="rt-stage"><span class="rt-step">Night ' + g.night + "</span>" + undoBtn() + "</div>" +
        '<div class="rt-script"><div class="rt-k">Read aloud</div><div class="rt-say">“' + esc(R.LINES.wake) + "”</div></div>" +
        '<div class="actions rt-main"><button type="button" class="btn btn-primary rt-big" id="rt-resolve">Resolve the night</button></div>' + roster();
    }

    var step = steps[i];
    var picker = "";
    if (step.key === "meet") {
      picker = '<p class="rt-hint">' + (S.mafiaShown
        ? "The mafia: <b>" + step.actors.map(function (id) { return esc(player(id).name); }).join("</b>, <b>") + "</b>."
        : '<button type="button" class="rt-link" id="rt-mafia">Narrator: show me who the mafia are</button>') + "</p>";
    } else {
      var actor = player(step.actor);
      picker = '<p class="rt-hint">Narrator: <b>' + esc(actor.name) + "</b> is the " + esc(role(step.role).name) +
        (step.max === 2 ? ". Two saves tonight." : "") + "</p>" +
        '<div class="rt-picks">' + step.targets.map(function (id) {
          var q = player(id);
          var sel = S.pick.indexOf(id) !== -1;
          return '<button type="button" class="rt-pick' + (sel ? " sel" : "") + '" data-pick="' + id + '">' + esc(q.name) +
            (sel ? '<span class="rt-tick">✓</span>' : "") + "</button>";
        }).join("") + "</div>" +
        (step.optional ? '<p class="rt-alt"><button type="button" class="rt-link" id="rt-pass">' +
          (S.pick.length ? "Clear the choice" : "They chose nobody") + "</button></p>" : "");
    }

    var isLast = i === steps.length - 1;
    return '<div class="rt-stage"><span class="rt-step">Night ' + g.night + " · step " + (i + 1) + " of " + steps.length + "</span>" + undoBtn() + "</div>" +
      (i === 0 ? '<div class="rt-script rt-dim"><div class="rt-k">First</div><div class="rt-say">“' + esc(R.LINES.close) + "”</div></div>" : "") +
      '<div class="rt-script"><div class="rt-k">Read aloud</div><div class="rt-say">“' + esc(step.line) + "”</div>" + picker + "</div>" +
      '<div class="actions rt-main"><button type="button" class="btn btn-primary rt-big" id="rt-next">' +
      (isLast ? "Everyone open your eyes" : "Next") + "</button></div>" + roster();
  }

  function viewResult(nextLabel, nextId) {
    var r = S.result;
    return '<div class="rt-script"><div class="rt-k">Read aloud</div><div class="rt-say">“' + esc(r.announce) + "”</div></div>" +
      '<details class="rt-notes"' + (S.notesOpen ? " open" : "") + '><summary>Narrator only</summary><ul>' +
      r.notes.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></details>" +
      '<div class="actions rt-main"><button type="button" class="btn btn-primary rt-big" id="' + nextId + '">' + nextLabel + "</button></div>";
  }

  function viewDay() {
    var g = S.game;
    if (S.result && S.result.phase === "night") {
      return '<div class="rt-stage"><span class="rt-step">Morning ' + g.day + "</span>" + undoBtn() + "</div>" +
        viewResult("Day " + g.day + " — the vote", "rt-day") + roster() + scoreline();
    }
    var living = R.living(g);
    var mayor = R.livingTown(g).filter(function (p) { return p.role === "mayor"; })[0];
    var rows = living.map(function (p) {
      var v = S.tally[p.id] | 0;
      var muted = g.mutedForDay === p.id;
      return '<div class="rt-vote' + (muted ? " muted" : "") + '"><span>' + esc(p.name) + (muted ? ' <em>muted</em>' : "") + "</span>" +
        '<div class="rt-count"><button type="button" data-vote="' + p.id + ':-1" aria-label="fewer votes">−</button><b>' + v +
        '</b><button type="button" data-vote="' + p.id + ':1" aria-label="more votes">+</button></div></div>';
    }).join("");

    var mayorUi = "";
    if (mayor && !g.mayorUsed) {
      var top = 0, leaders = [];
      Object.keys(S.tally).forEach(function (k) { var v = S.tally[k] | 0; if (v > top) top = v; });
      Object.keys(S.tally).forEach(function (k) { if ((S.tally[k] | 0) === top && top > 0) leaders.push(Number(k)); });
      mayorUi = '<div class="rt-mayor"><p class="rt-hint">The Mayor (' + esc(mayor.name) + ') has one power left.</p>' +
        '<label><input type="checkbox" id="rt-cancel"' + (S.mayor && S.mayor.cancel ? " checked" : "") + "> Mayor cancels the lynch</label>" +
        (leaders.length > 1 ? '<div class="rt-picks">' + leaders.map(function (id) {
          var on = S.mayor && S.mayor.breakTie === id;
          return '<button type="button" class="rt-pick' + (on ? " sel" : "") + '" data-break="' + id + '">Break the tie: ' + esc(player(id).name) + "</button>";
        }).join("") + "</div>" : "") + "</div>";
    }

    return '<div class="rt-stage"><span class="rt-step">Day ' + g.day + " · the vote</span>" + undoBtn() + "</div>" +
      '<div class="rt-script"><div class="rt-k">Read aloud</div><div class="rt-say">“Everyone speaks in turn. Then we vote. A majority eliminates; a tie eliminates nobody.”</div></div>' +
      '<p class="rt-label">Votes</p>' + rows + mayorUi +
      '<div class="actions rt-main"><button type="button" class="btn btn-primary rt-big" id="rt-eliminate">End the day</button></div>' +
      roster() + scoreline();
  }

  function viewDayResult() {
    var g = S.game;
    return '<div class="rt-stage"><span class="rt-step">Day ' + g.day + "</span>" + undoBtn() + "</div>" +
      viewResult("Night " + g.night + " falls", "rt-night") + roster() + scoreline();
  }

  function viewOver() {
    var g = S.game;
    var w = g.winner === "town" ? "The town wins" : "The mafia win";
    var rows = g.players.map(function (p) {
      var r = role(p.role);
      return '<li class="' + (p.alive ? "" : "x") + '"><span>' + esc(p.name) + '</span><span class="rt-pill" style="background:' + r.color + '">' + esc(r.name) + "</span></li>";
    }).join("");
    return '<div class="rt-stage"><span class="rt-step">Game over</span>' + undoBtn() + "</div>" +
      '<div class="rt-cover rt-over"><div class="rt-who">' + w + "</div><p class=\"rt-hint\">" +
      (g.winner === "town" ? "The last mafioso is gone." : "The mafia reached parity with the town.") + "</p></div>" +
      '<p class="rt-label">Everybody, revealed</p><ul class="rt-list">' + rows + "</ul>" + viewLog() +
      '<div class="actions rt-main"><button type="button" class="btn btn-primary rt-big" id="rt-again">Play again with this table</button></div>' +
      '<div class="actions"><button type="button" class="btn btn-ghost" id="rt-setup">New table</button></div>';
  }

  function viewLog() {
    var g = S.game;
    if (!g.log.length) return "";
    return '<details class="rt-notes"' + (S.logOpen ? " open" : "") + '><summary>The whole game, for the narrator</summary><ol>' +
      g.log.map(function (e) {
        return "<li><b>" + (e.phase === "night" ? "Night " : "Day ") + e.n + ":</b> " + esc(e.announce) +
          (e.notes.length ? "<ul>" + e.notes.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul>" : "") + "</li>";
      }).join("") + "</ol></details>";
  }

  function undoBtn() {
    return S.history.length ? '<button type="button" class="rt-link" id="rt-undo">Undo</button>' : "";
  }

  function viewNarrate() {
    var g = S.game;
    if (g.phase === "over") return viewOver();
    // A just-resolved day is shown BEFORE the next night's steps, or the narrator never gets to
    // read "X has been eliminated" aloud — the game had already moved on to "close your eyes".
    if (S.result && S.result.phase === "day") return viewDayResult();
    if (g.phase === "night") return viewNight();
    return viewDay();
  }

  // ── render + events ──────────────────────────────────────────────────────────────────────

  function render() {
    var html;
    if (S.stage === "setup") {
      html = viewSetup();
      if (START === "narrate" && !S.players) {
        html = '<p class="rt-banner">Set up the table first — the narrator starts the moment the deal is done. Dealt by hand already? Use “assign roles” below.</p>' + html;
      }
    } else if (S.stage === "deal") html = viewDeal();
    else html = viewNarrate();
    root.innerHTML = html;
    root.setAttribute("data-stage", S.stage);
    save();
    // Bring the tool's header to the top of the viewport on every stage change, clear of the
    // site's sticky nav (scroll-margin-top on .rt handles the offset).
    if (S.stage !== "setup") root.scrollIntoView({ block: "start" });
  }

  root.addEventListener("click", function (ev) {
    var t = ev.target.closest("button, summary");
    if (!t) return;
    var id = t.id;
    var d = t.dataset;

    // setup
    if (id === "rt-minus") return setCount(S.n - 1);
    if (id === "rt-plus") return setCount(S.n + 1);
    if (id === "rt-custom") { S.customOpen = !S.customOpen; return render(); }
    if (d.bump) { var b = d.bump.split(":"); return bump(b[0], Number(b[1])); }
    if (d.preset) return applyPreset(d.preset);
    if (id === "rt-assign") { S.assignOpen = !S.assignOpen; return render(); }
    if (id === "rt-assign-close") { S.assignOpen = false; return render(); }
    if (id === "rt-assign-go") {
      var sel = root.querySelectorAll("select[data-assign]");
      var ps = [];
      sel.forEach(function (el, i) { ps.push({ id: i, name: nameAt(i), role: el.value }); });
      S.assignOpen = false;
      S.players = ps; S.game = null; S.history = [];
      return startNarrate();
    }
    if (id === "rt-deal") {
      var names = []; for (var i = 0; i < S.n; i++) names.push(nameAt(i));
      return startDeal(R.deal(names, S.comp));
    }

    // deal
    if (id === "rt-reveal") return reveal();
    if (id === "rt-hide") return hideAndPass();
    if (id === "rt-back") { S.dealIndex = Math.max(0, S.dealIndex - 1); return render(); }
    if (id === "rt-hideall") { S.allShown = false; return render(); }
    if (id === "rt-redeal") {
      var nm = S.players.map(function (p) { return p.name; });
      return startDeal(R.deal(nm, S.comp));
    }
    if (id === "rt-setup") { clearHide(); S.stage = "setup"; S.players = null; S.game = null; S.history = []; S.result = null; return render(); }
    if (id === "rt-narrate") return startNarrate();

    // narrate
    if (id === "rt-undo") return undo();
    if (id === "rt-mafia") { S.mafiaShown = true; return render(); }
    if (d.pick) {
      var pid = Number(d.pick);
      var steps = R.nightSteps(S.game), step = steps[S.stepIndex];
      var at = S.pick.indexOf(pid);
      if (at !== -1) S.pick.splice(at, 1);
      else { if (S.pick.length >= step.max) S.pick.shift(); S.pick.push(pid); }
      return render();
    }
    if (id === "rt-pass") { S.pick = []; return render(); }
    if (id === "rt-next") {
      var st = R.nightSteps(S.game)[S.stepIndex];
      commitStep(st);
      S.pick = []; S.stepIndex += 1; S.mafiaShown = false;
      return render();
    }
    if (id === "rt-resolve") {
      snapshot();
      var rn = R.resolveNight(S.game, S.actions);
      S.game = rn.state; S.result = { phase: "night", announce: rn.announce, notes: rn.notes };
      S.actions = {}; S.stepIndex = 0; S.tally = {}; S.mayor = null;
      return render();
    }
    if (id === "rt-day") { S.result = null; return render(); }
    if (d.vote) { var v = d.vote.split(":"); var k = v[0]; S.tally[k] = Math.max(0, (S.tally[k] | 0) + Number(v[1])); return render(); }
    if (d.break) { var bid = Number(d.break); S.mayor = (S.mayor && S.mayor.breakTie === bid) ? null : { breakTie: bid }; return render(); }
    if (id === "rt-eliminate") {
      snapshot();
      var rd = R.resolveDay(S.game, S.tally, S.mayor);
      S.game = rd.state; S.result = { phase: "day", announce: rd.announce, notes: rd.notes };
      S.tally = {}; S.mayor = null;
      return render();
    }
    if (id === "rt-night") { S.result = null; S.stepIndex = 0; S.actions = {}; S.pick = []; return render(); }
    if (id === "rt-again") {
      var again = S.game.players.map(function (p) { return p.name; });
      S.n = again.length; S.names = again;
      if (R.total(S.comp) !== S.n) S.comp = R.canonical(S.n);
      S.stage = "setup"; S.players = null; S.game = null; S.history = []; S.result = null;
      return render();
    }
  });

  root.addEventListener("change", function (ev) {
    var t = ev.target;
    if (t.id === "rt-cancel") { S.mayor = t.checked ? { cancel: true } : null; return render(); }
  });

  root.addEventListener("input", function (ev) {
    var t = ev.target;
    if (t.dataset && t.dataset.name != null) { S.names[Number(t.dataset.name)] = t.value; save(); }
  });

  root.addEventListener("toggle", function (ev) {
    var t = ev.target;
    if (t.classList && t.classList.contains("rt-notes")) {
      if (/whole game/.test(t.textContent)) S.logOpen = t.open; else S.notesOpen = t.open;
    }
  }, true);

  // The whole-deal view is for the narrator only, so it takes a deliberate press-and-hold rather
  // than a tap that a passing thumb could land on.
  function holdStart(ev) {
    var t = ev.target.closest("#rt-showall");
    if (!t) return;
    ev.preventDefault();
    t.classList.add("holding");
    pressTimer = setTimeout(function () { S.allShown = true; render(); }, 900);
  }
  function holdEnd() {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    var t = document.getElementById("rt-showall");
    if (t) t.classList.remove("holding");
  }
  root.addEventListener("pointerdown", holdStart);
  root.addEventListener("pointerup", holdEnd);
  root.addEventListener("pointercancel", holdEnd);
  root.addEventListener("pointerleave", holdEnd, true);

  load();
  render();
})();
