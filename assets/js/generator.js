/* RPS Mafia — role generator. A deck of cards on one phone.
 *
 * Two stages: set up the table, then deal in secret (pass the phone). A person runs the game from
 * there; this page only replaces the cards. Roles can be the game's own, edited, or the group's
 * own in any language, on the town, the mafia or an independent side.
 *
 * All state lives in this browser (localStorage) and nothing is ever sent anywhere. The deck
 * itself is in deck.js, which is tested in node; this file only draws.
 */
(function () {
  "use strict";
  var D = window.RPSDeck;
  var root = document.getElementById("tool");
  if (!D || !root) return;

  var LS_GROUP = "rps.tool.group.v2";
  var LS_DEAL = "rps.tool.deal.v2";
  var LS_OLD = ["rps.tool.group.v1", "rps.tool.game.v1"];
  var HIDE_AFTER = 8; // seconds a revealed card stays up

  // ── state ────────────────────────────────────────────────────────────────────────────────

  var S = {
    stage: "setup",            // setup | deal
    n: 8, names: [], comp: null,
    custom: { overrides: {}, roles: [] },
    rolesOpen: false,
    editing: null,             // a role id, "new", or null
    draft: null,               // the role being edited
    players: null, dealIndex: 0, revealed: false, allShown: false,
  };
  var hideTimer = null, hideLeft = 0, pressTimer = null;

  function roles() { return D.catalog(S.custom); }
  function nameAt(i) { return (S.names[i] || "").trim() || "Player " + (i + 1); }
  function sizeNames(n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(S.names[i] || "");
    return out;
  }

  function load() {
    var g = null;
    try { g = JSON.parse(localStorage.getItem(LS_GROUP) || "null"); } catch (e) { /* none */ }
    if (!g) {
      // A group remembered by the previous version of the tool: keep its size, names and deal.
      try { g = JSON.parse(localStorage.getItem(LS_OLD[0]) || "null"); } catch (e) { /* none */ }
    }
    if (g && g.n >= D.MIN && g.n <= D.MAX) {
      S.n = g.n; S.names = Array.isArray(g.names) ? g.names : [];
      S.comp = g.comp || null;
      if (g.custom && typeof g.custom === "object") {
        S.custom = { overrides: g.custom.overrides || {}, roles: Array.isArray(g.custom.roles) ? g.custom.roles : [] };
      }
    }
    try {
      var d = JSON.parse(localStorage.getItem(LS_DEAL) || "null");
      if (d && Array.isArray(d.players) && d.players.length && d.players.every(function (p) { return p && p.card; })) {
        S.stage = "deal"; S.players = d.players; S.dealIndex = d.dealIndex | 0;
      }
    } catch (e) { /* no deal in progress */ }
    try { LS_OLD.forEach(function (k) { localStorage.removeItem(k); }); } catch (e) { /* fine */ }

    if (S.comp) S.comp = D.prune(S.comp, roles());
    if (!S.comp || !D.total(S.comp)) S.comp = D.suggested(S.n);
    S.names = sizeNames(S.n);
  }

  function save() {
    try {
      localStorage.setItem(LS_GROUP, JSON.stringify({ n: S.n, names: S.names, comp: S.comp, custom: S.custom }));
      if (S.stage === "setup") localStorage.removeItem(LS_DEAL);
      else localStorage.setItem(LS_DEAL, JSON.stringify({ players: S.players, dealIndex: S.dealIndex }));
    } catch (e) { /* private mode — the tool still works for this visit */ }
  }

  // ── helpers ──────────────────────────────────────────────────────────────────────────────

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // Group-written text can be in any script, so it sets its own direction.
  function txt(s) { return '<bdi dir="auto">' + esc(s) + "</bdi>"; }
  function pill(r, count) {
    return '<span class="rt-pill" style="background:' + r.color + '">' + txt(r.name) + (count > 1 ? " ×" + count : "") + "</span>";
  }
  function sideTag(side) { return '<span class="rt-side rt-side-' + side + '">' + D.SIDE_NAMES[side] + "</span>"; }

  // ── stage 1: set up ──────────────────────────────────────────────────────────────────────

  function setCount(n) {
    n = Math.max(D.MIN, Math.min(D.MAX, n));
    var wasStandard = D.isStandard(S.comp, S.n) || isSuggested();
    S.n = n;
    S.names = sizeNames(n);
    // Follow the size while the deal is still the default one. Once the group has made it their
    // own, keep their roles and let Citizens take up the difference — added as the table grows,
    // removed first as it shrinks — so thirty players is not thirty taps.
    if (wasStandard) S.comp = D.suggested(n);
    else S.comp = D.fitWithCitizens(S.comp, n);
    render();
  }

  function isSuggested() {
    var s = D.suggested(S.n), c = S.comp || {};
    var keys = {};
    Object.keys(s).concat(Object.keys(c)).forEach(function (k) { keys[k] = 1; });
    return Object.keys(keys).every(function (k) { return (s[k] | 0) === (c[k] | 0); });
  }

  function bump(k, d) {
    var v = (S.comp[k] | 0) + d;
    if (v < 0) return;
    if (v === 0) delete S.comp[k]; else S.comp[k] = v;
    render();
  }

  function startEdit(id) {
    if (id === "new") {
      S.draft = { name: "", side: "independent", color: D.SIDE_COLOR.independent, icon: "", blurb: "", knowsTeam: false };
    } else {
      var r = D.byId(roles(), id);
      if (!r) return;
      S.draft = { name: r.name, side: r.side, color: r.color, icon: r.icon, blurb: r.blurb, knowsTeam: r.knowsTeam };
    }
    S.editing = id;
    render();
    var f = root.querySelector("#rt-e-name");
    if (f) f.focus();
  }

  function saveEdit() {
    var d = S.draft;
    if (!d || !d.name.trim()) {
      var f = root.querySelector("#rt-e-name");
      if (f) { f.focus(); f.setAttribute("aria-invalid", "true"); }
      return;
    }
    var fields = D.normalize("x", d);
    delete fields.id;
    if (S.editing === "new") {
      var id = D.newId(roles());
      S.custom.roles.push(Object.assign({ id: id }, fields));
      // A new role takes a Citizen's seat when there is one, so the count still adds up.
      S.comp[id] = 1;
      if ((S.comp.citizen | 0) > 0) { S.comp.citizen -= 1; if (!S.comp.citizen) delete S.comp.citizen; }
    } else if (D.BUILTIN[S.editing]) {
      S.custom.overrides[S.editing] = fields;
    } else {
      S.custom.roles = S.custom.roles.map(function (c) { return c.id === S.editing ? Object.assign({ id: c.id }, fields) : c; });
    }
    S.editing = null; S.draft = null;
    render();
  }

  function removeRole(id) {
    if (D.BUILTIN[id]) delete S.custom.overrides[id];
    else {
      S.custom.roles = S.custom.roles.filter(function (c) { return c.id !== id; });
      S.comp = D.prune(S.comp, roles());
    }
    S.editing = null; S.draft = null;
    render();
  }

  function viewEditor(r) {
    var d = S.draft, isNew = S.editing === "new";
    var sides = D.SIDES.map(function (s) {
      return '<button type="button" class="rt-seg' + (d.side === s ? " on" : "") + '" data-side="' + s + '" aria-pressed="' + (d.side === s) + '">' + D.SIDE_NAMES[s] + "</button>";
    }).join("");
    var colors = D.COLORS.map(function (c) {
      return '<button type="button" class="rt-dot' + (d.color === c ? " on" : "") + '" data-color="' + c + '" style="background:' + c + '" aria-label="Colour ' + c + '" aria-pressed="' + (d.color === c) + '"></button>';
    }).join("");
    var extra = "";
    if (!isNew && r && r.builtin && r.edited) extra = '<button type="button" class="btn btn-ghost" data-remove="' + r.id + '">Reset to the original</button>';
    if (!isNew && r && !r.builtin) extra = '<button type="button" class="btn btn-ghost rt-danger" data-remove="' + r.id + '">Delete this role</button>';

    return '<div class="rt-edit">' +
      '<label class="rt-f"><span>Name</span><input id="rt-e-name" data-draft="name" dir="auto" maxlength="' + D.NAME_MAX + '" value="' + esc(d.name) + '" placeholder="In any language" autocomplete="off"></label>' +
      '<div class="rt-f-row"><label class="rt-f rt-f-icon"><span>Symbol</span><input data-draft="icon" dir="auto" maxlength="' + D.ICON_MAX + '" value="' + esc(d.icon) + '" placeholder="' + esc(Array.from(d.name || "?")[0].toUpperCase()) + '" autocomplete="off"></label>' +
      '<div class="rt-f"><span>Colour</span><div class="rt-dots-pick">' + colors + "</div></div></div>" +
      '<label class="rt-f"><span>What the card says</span><textarea data-draft="blurb" dir="auto" rows="3" maxlength="' + D.BLURB_MAX + '" placeholder="Optional. Players read this when they see their role.">' + esc(d.blurb) + "</textarea></label>" +
      '<div class="rt-f"><span>Side</span><div class="rt-segs" role="group" aria-label="Side">' + sides + "</div></div>" +
      '<label class="rt-check"><input type="checkbox" id="rt-e-team"' + (d.knowsTeam ? " checked" : "") + "> Shown their teammates</label>" +
      '<p class="rt-hint">A player with this role sees everyone else on the same side who is also shown theirs — how the mafia find each other, or two lovers do.</p>' +
      '<div class="actions"><button type="button" class="btn btn-primary" id="rt-e-save">' + (isNew ? "Add this role" : "Save") + "</button>" +
      '<button type="button" class="btn btn-ghost" id="rt-e-cancel">Cancel</button>' + extra + "</div></div>";
  }

  function viewRoles(list) {
    var rows = list.map(function (r) {
      if (S.editing === r.id) return '<div class="rt-role rt-role-open">' + viewEditor(r) + "</div>";
      var tag = r.builtin ? (r.edited ? " <em>edited</em>" : "") : " <em>yours</em>";
      return '<div class="rt-role"><span class="rt-swatch" style="background:' + r.color + '">' + txt(r.icon) + "</span>" +
        '<div class="rt-role-t"><b>' + txt(r.name) + tag + "</b>" + sideTag(r.side) +
        (r.blurb ? "<small>" + txt(r.blurb) + "</small>" : "") + "</div>" +
        '<div class="rt-role-c"><div class="rt-count"><button type="button" data-bump="' + r.id + ':-1" aria-label="fewer ' + esc(r.name) + '">−</button>' +
        "<b>" + (S.comp[r.id] | 0) + '</b><button type="button" data-bump="' + r.id + ':1" aria-label="more ' + esc(r.name) + '">+</button></div>' +
        '<button type="button" class="rt-link rt-editlink" data-edit="' + r.id + '">Edit</button></div></div>';
    }).join("");
    var add = S.editing === "new"
      ? '<div class="rt-role rt-role-open">' + viewEditor(null) + "</div>"
      : '<button type="button" class="btn btn-ghost rt-add" id="rt-add">+ Add your own role</button>';
    return '<div class="rt-roles">' + rows + add + "</div>" +
      '<div class="rt-presets"><button type="button" class="btn btn-ghost" id="rt-standard">' +
      (D.standard(S.n) ? "Back to the game's deal for " + S.n : "Back to the suggested deal") + "</button></div>";
  }

  function viewSetup() {
    var list = roles();
    var errs = D.problems(S.comp, S.n);
    var sd = D.sides(S.comp, list);
    var kind = D.isStandard(S.comp, S.n) ? "Standard" : isSuggested() ? "Suggested" : "Custom";
    var pills = list.filter(function (r) { return S.comp[r.id] | 0; }).map(function (r) { return pill(r, S.comp[r.id]); }).join("");

    var chips = "";
    for (var i = 0; i < S.n; i++) {
      chips += '<span class="rt-chip"><input data-name="' + i + '" dir="auto" value="' + esc(S.names[i] || "") +
        '" placeholder="Player ' + (i + 1) + '" maxlength="24" autocomplete="off" spellcheck="false" aria-label="Player ' + (i + 1) + ' name"></span>';
    }

    var summary = errs.length
      ? '<li class="error">' + esc(errs[0]) + "</li>"
      : '<li class="ok">' + D.SIDES.filter(function (s) { return sd[s]; }).map(function (s) {
          return sd[s] + " " + D.SIDE_NAMES[s].toLowerCase();
        }).join(" · ") + "</li>";

    return '<div class="rt-stage"><span class="rt-step">1 · Set up the table</span></div>' +
      '<div class="rt-stepper"><button type="button" id="rt-minus" aria-label="fewer players">−</button>' +
      '<div><small>Players</small><b>' + S.n + "</b></div>" +
      '<button type="button" id="rt-plus" aria-label="more players">+</button><span class="rt-range">' + D.MIN + "–" + D.MAX + "</span></div>" +
      '<p class="rt-label">Names — optional</p><div class="rt-chips">' + chips + "</div>" +
      '<p class="rt-label">The deal for ' + S.n + " · " + kind + '</p><div class="rt-comp">' + pills + "</div>" +
      '<ul class="rt-warn">' + summary + "</ul>" +
      '<button type="button" class="btn btn-ghost rt-toggle" id="rt-roles" aria-expanded="' + S.rolesOpen + '">' +
      (S.rolesOpen ? "Hide roles ▴" : "Change the roles, or make your own ▾") + "</button>" +
      (S.rolesOpen ? viewRoles(list) : "") +
      '<div class="actions rt-main"><button type="button" class="btn btn-primary rt-big" id="rt-deal"' + (errs.length ? " disabled" : "") + ">Deal in secret</button></div>";
  }

  // ── stage 2: deal in secret ──────────────────────────────────────────────────────────────

  function startDeal() {
    var names = [];
    for (var i = 0; i < S.n; i++) names.push(nameAt(i));
    S.players = D.deal(names, S.comp, roles());
    S.dealIndex = 0; S.revealed = false; S.allShown = false;
    S.stage = "deal";
    render();
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
    if (S.allShown) return viewAllRoles();

    var dots = '<div class="rt-dots">' + S.players.map(function (_, k) {
      return '<i class="' + (k < i ? "done" : k === i ? "on" : "") + '"></i>';
    }).join("") + "</div>";

    if (i >= n) {
      return '<div class="rt-stage"><span class="rt-step">2 · Dealt</span></div>' + dots +
        '<div class="rt-cover"><div class="rt-who">Everyone has their role</div>' +
        '<p class="rt-hint">Hand the phone to whoever is running the game. They can see the whole deal below.</p></div>' +
        '<div class="actions rt-main"><button type="button" class="btn btn-primary rt-big" id="rt-redeal">Deal again</button></div>' +
        '<div class="actions"><button type="button" class="btn btn-ghost" id="rt-setup">Back to setup</button></div>' + narratorOnly();
    }

    var p = S.players[i];
    var next = i + 1 < n ? S.players[i + 1].name : null;
    var head = '<div class="rt-stage"><span class="rt-step">2 · Deal · ' + (i + 1) + " of " + n + "</span>" +
      (S.revealed ? '<span class="rt-step" id="rt-countdown">hides in ' + hideLeft + "s</span>" : "") + "</div>" + dots;

    if (!S.revealed) {
      return head +
        '<div class="rt-cover"><p class="rt-hint">Hand the phone to</p><div class="rt-who">' + txt(p.name) + "</div>" +
        '<p class="rt-hint">Nobody else should be able to see the screen.</p>' +
        '<button type="button" class="btn btn-primary rt-big" id="rt-reveal">I’m ' + txt(p.name) + " — show me</button></div>" +
        (i > 0 ? '<p class="rt-alt"><button type="button" class="rt-link" id="rt-back">Not ' + txt(p.name) + "? Go back one</button></p>" : "") +
        narratorOnly();
    }

    var c = p.card;
    var mates = D.teammates(S.players, p);
    return head +
      '<div class="rt-card" style="border-color:' + c.color + '55;background:' + c.color + '1a">' +
      '<div class="rt-card-ic" style="background:' + c.color + '">' + txt(c.icon) + "</div>" +
      '<div class="rt-card-nm">' + txt(c.name) + "</div>" +
      (c.blurb ? '<div class="rt-card-ds" dir="auto">' + esc(c.blurb) + "</div>" : "") +
      '<div class="rt-card-team rt-side-' + c.side + '">' + D.SIDE_NAMES[c.side] + "</div>" +
      (mates.length ? '<div class="rt-mates">Your team: <b>' + mates.map(function (q) { return txt(q.name); }).join("</b>, <b>") + "</b></div>" : "") +
      "</div>" +
      '<div class="actions rt-main"><button type="button" class="btn btn-primary rt-big" id="rt-hide">' +
      (next ? "Hide, and pass to " + txt(next) : "Hide — everyone has seen theirs") + "</button></div>";
  }

  function narratorOnly() {
    return '<p class="rt-alt"><button type="button" class="rt-link rt-hold" id="rt-showall">Narrator only: press and hold to see the whole deal</button></p>';
  }

  function viewAllRoles() {
    var rows = S.players.map(function (p) {
      return "<li><span>" + txt(p.name) + "</span>" + pill(p.card, 1) + "</li>";
    }).join("");
    return '<div class="rt-stage"><span class="rt-step">Narrator only</span></div>' +
      '<p class="rt-hint">The whole deal. Do not show this to the table.</p><ul class="rt-list">' + rows + "</ul>" +
      '<div class="actions rt-main"><button type="button" class="btn btn-primary" id="rt-hideall">Hide it</button></div>';
  }

  // ── render + events ──────────────────────────────────────────────────────────────────────

  function render() {
    root.innerHTML = S.stage === "setup" ? viewSetup() : viewDeal();
    root.setAttribute("data-stage", S.stage);
    save();
    // Bring the tool to the top of the viewport on every deal step, clear of the sticky nav.
    if (S.stage !== "setup") root.scrollIntoView({ block: "start" });
  }

  root.addEventListener("click", function (ev) {
    var t = ev.target.closest("button");
    if (!t) return;
    var id = t.id, d = t.dataset;

    // setup
    if (id === "rt-minus") return setCount(S.n - 1);
    if (id === "rt-plus") return setCount(S.n + 1);
    if (id === "rt-roles") { S.rolesOpen = !S.rolesOpen; S.editing = null; S.draft = null; return render(); }
    if (d.bump) { var b = d.bump.split(":"); return bump(b[0], Number(b[1])); }
    if (id === "rt-standard") { S.comp = D.suggested(S.n); return render(); }
    if (d.edit) return startEdit(d.edit);
    if (id === "rt-add") return startEdit("new");
    if (d.side && S.draft) {
      // Moving a role's side moves its default colour and teammate setting with it, until the
      // group picks their own.
      var was = S.draft.side;
      if (S.draft.color === D.SIDE_COLOR[was]) S.draft.color = D.SIDE_COLOR[d.side];
      if (S.draft.knowsTeam === (was === "mafia")) S.draft.knowsTeam = d.side === "mafia";
      S.draft.side = d.side;
      return render();
    }
    if (d.color && S.draft) { S.draft.color = d.color; return render(); }
    if (id === "rt-e-save") return saveEdit();
    if (id === "rt-e-cancel") { S.editing = null; S.draft = null; return render(); }
    if (d.remove) return removeRole(d.remove);
    if (id === "rt-deal") return startDeal();

    // deal
    if (id === "rt-reveal") return reveal();
    if (id === "rt-hide") return hideAndPass();
    if (id === "rt-back") { S.dealIndex = Math.max(0, S.dealIndex - 1); return render(); }
    if (id === "rt-hideall") { S.allShown = false; return render(); }
    if (id === "rt-redeal") return startDeal();
    if (id === "rt-setup") { clearHide(); S.stage = "setup"; S.players = null; return render(); }
  });

  root.addEventListener("change", function (ev) {
    if (ev.target.id === "rt-e-team" && S.draft) S.draft.knowsTeam = ev.target.checked;
  });

  // Typing never re-renders, so the field keeps its focus and the caret stays put.
  root.addEventListener("input", function (ev) {
    var t = ev.target;
    if (t.dataset.name != null) { S.names[Number(t.dataset.name)] = t.value; save(); }
    if (t.dataset.draft && S.draft) { S.draft[t.dataset.draft] = t.value; t.removeAttribute("aria-invalid"); }
  });

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
