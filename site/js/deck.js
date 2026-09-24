/* RPS Mafia — the deck: roles, a table's make-up, and a fair shuffle.
 *
 * The role generator replaces a deck of paper cards and nothing more. A person runs the game, so
 * nothing here knows what a role does — only what its card says, which side it is on, and whether
 * it is shown its teammates. That is also why a table may hold roles the game has never heard of,
 * written in any language: the deck only has to deal them.
 *
 * No DOM in this file, so it can be tested in node. Nothing talks to a server; a deal is made from
 * crypto randomness in the browser and never leaves it.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.RPSDeck = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var SIDES = ["town", "mafia", "independent"];
  var SIDE_NAMES = { town: "Town", mafia: "Mafia", independent: "Independent" };

  // The colours a role can take. The first of each side is its default.
  var COLORS = [
    "#1E88E5", "#43A047", "#00897B", "#78909C", "#5E35B1", "#FFB300",
    "#C62828", "#E53935", "#EF5350", "#F57C00", "#8E24AA", "#6D4C41",
  ];
  var SIDE_COLOR = { town: "#1E88E5", mafia: "#C62828", independent: "#F57C00" };

  // RPS Mafia's own roles. They are a starting point, not a rulebook: each one can be renamed,
  // re-described or moved, and reset back to this.
  var BUILTIN = {
    godfather: { name: "Godfather", side: "mafia", color: "#C62828", icon: "👑",
      blurb: "Lead the mafia. You choose who dies at night. The Detective reads you as town, and the Sniper's bullet does nothing to you." },
    mafia: { name: "Mafia", side: "mafia", color: "#E53935", icon: "🗡",
      blurb: "Kill one player each night — when the trigger is yours. Blend in during the day. No immunities." },
    dr_lecter: { name: "Dr. Lecter", side: "mafia", color: "#D32F2F", icon: "🩹",
      blurb: "Mafia medic. Each night shield one of your team from the Sniper. You may shield yourself only once in the whole game." },
    negotiator: { name: "Negotiator", side: "mafia", color: "#EF5350", icon: "🤝",
      blurb: "Once, after a mafioso has died, convert one Citizen to your side. They become plain Mafia." },
    doctor: { name: "Doctor", side: "town", color: "#43A047", icon: "🩺",
      blurb: "Each night protect one player from the mafia's kill — two while ten or more are alive. You may not protect yourself two nights running." },
    detective: { name: "Detective", side: "town", color: "#1E88E5", icon: "🔍",
      blurb: "Each night learn one player's side. The answer is never a lie, but the Godfather reads as town." },
    sniper: { name: "Sniper", side: "town", color: "#8E24AA", icon: "🎯",
      blurb: "Shoot one player at night. A mafioso dies. A townsperson lives — and you die instead. The Godfather is bulletproof." },
    die_hard: { name: "Die-hard", side: "town", color: "#00897B", icon: "🛡",
      blurb: "You survive your first elimination — a night kill or a lynch — once. After that you are an ordinary player." },
    mayor: { name: "Mayor", side: "town", color: "#FFB300", icon: "🏛",
      blurb: "Once in the game, cancel a lynch or break a voting tie. Even if you are muted." },
    psychiatrist: { name: "Psychiatrist", side: "town", color: "#5E35B1", icon: "🧠",
      blurb: "Each night mute one player for the following day. They may still vote. Never the same player twice running." },
    citizen: { name: "Citizen", side: "town", color: "#78909C", icon: "👤",
      blurb: "No powers, no private information. Only what people said and how they said it — which is the game." },
  };
  var BUILTIN_ORDER = [
    "godfather", "mafia", "dr_lecter", "negotiator",
    "doctor", "detective", "sniper", "die_hard", "mayor", "psychiatrist", "citizen",
  ];

  // The game's own distribution at every size it runs. Outside five to twelve there is no
  // standard, only a suggestion (see suggested()).
  var STANDARD = {
    5: { godfather: 1, doctor: 1, citizen: 3 },
    6: { godfather: 1, mafia: 1, doctor: 1, detective: 1, die_hard: 1, citizen: 1 },
    7: { godfather: 1, mafia: 1, doctor: 1, detective: 1, sniper: 1, citizen: 2 },
    8: { godfather: 1, mafia: 2, doctor: 1, detective: 1, sniper: 1, citizen: 2 },
    9: { godfather: 1, mafia: 2, doctor: 1, detective: 1, sniper: 1, die_hard: 1, citizen: 2 },
    10: { godfather: 1, mafia: 2, doctor: 1, detective: 1, sniper: 1, die_hard: 1, citizen: 3 },
    11: { godfather: 1, mafia: 2, doctor: 1, detective: 1, sniper: 1, die_hard: 1, citizen: 4 },
    12: { godfather: 1, mafia: 2, dr_lecter: 1, doctor: 1, detective: 1, sniper: 1, die_hard: 1, citizen: 4 },
  };

  var MIN = 3, MAX = 30;
  var NAME_MAX = 32, BLURB_MAX = 240, ICON_MAX = 4;

  // ── roles ────────────────────────────────────────────────────────────────────────────────

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function str(v, max) { return String(v == null ? "" : v).slice(0, max); }

  /** A role as it can be stored, cleaned of anything malformed. `id` is kept as given. */
  function normalize(id, r) {
    r = r || {};
    var side = SIDES.indexOf(r.side) !== -1 ? r.side : "town";
    var name = str(r.name, NAME_MAX).trim();
    return {
      id: id,
      name: name || "Unnamed role",
      side: side,
      color: /^#[0-9a-fA-F]{6}$/.test(r.color || "") ? r.color : SIDE_COLOR[side],
      icon: str(r.icon, ICON_MAX).trim() || Array.from(name || "?")[0].toUpperCase(),
      blurb: str(r.blurb, BLURB_MAX).trim(),
      // Mafia are shown each other by default, as in the game; everyone else is not.
      knowsTeam: typeof r.knowsTeam === "boolean" ? r.knowsTeam : side === "mafia",
    };
  }

  /**
   * Every role on offer: the built-ins (with any edits the group made to them) and the group's own.
   * `custom` is {overrides: {builtinId: fields}, roles: [{id, ...fields}]}. Returns an ordered
   * list; each entry says whether it is built in and whether it has been changed from the original.
   */
  function catalog(custom) {
    custom = custom || {};
    var over = custom.overrides || {};
    var out = BUILTIN_ORDER.map(function (id) {
      var edited = !!over[id];
      var r = normalize(id, edited ? over[id] : BUILTIN[id]);
      r.builtin = true;
      r.edited = edited;
      return r;
    });
    (custom.roles || []).forEach(function (c) {
      if (!c || typeof c.id !== "string" || !/^c[0-9a-z]{1,16}$/.test(c.id)) return;
      var r = normalize(c.id, c);
      r.builtin = false;
      r.edited = false;
      out.push(r);
    });
    return out;
  }

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  /** A fresh id for a group-made role, unlike any id already in use. */
  function newId(list, rng) {
    rng = rng || cryptoRandom;
    for (;;) {
      var id = "c" + Math.floor(rng() * 2176782336).toString(36);
      if (!byId(list || [], id)) return id;
    }
  }

  // ── a table's make-up ────────────────────────────────────────────────────────────────────

  function standard(n) {
    var s = STANDARD[n];
    if (!s) return null;
    var out = {};
    Object.keys(s).forEach(function (k) { out[k] = s[k]; });
    return out;
  }

  /** The game's own deal where it has one; otherwise about a quarter mafia, a Doctor and a
   *  Detective once there is room for them, and Citizens for the rest. */
  function suggested(n) {
    n = clamp(n | 0, MIN, MAX);
    var s = standard(n);
    if (s) return s;
    if (n < 5) return { mafia: 1, citizen: n - 1 };
    var killers = Math.max(2, Math.round(n / 4));
    return { godfather: 1, mafia: killers - 1, doctor: 1, detective: 1, citizen: n - killers - 2 };
  }

  function total(comp) {
    return Object.keys(comp || {}).reduce(function (a, k) { return a + (comp[k] | 0); }, 0);
  }

  function isStandard(comp, n) {
    var c = STANDARD[n];
    if (!c) return false;
    var keys = {};
    Object.keys(c).forEach(function (k) { keys[k] = 1; });
    Object.keys(comp || {}).forEach(function (k) { if (comp[k] | 0) keys[k] = 1; });
    return Object.keys(keys).every(function (k) { return (c[k] | 0) === (comp[k] | 0); });
  }

  /** A custom table resized to `n`: Citizens are added or taken away to match, and nothing else
   *  is touched. If there are not enough Citizens to remove, the count is left short of matching
   *  and problems() says so. */
  function fitWithCitizens(comp, n) {
    var out = {};
    Object.keys(comp || {}).forEach(function (k) { if (comp[k] | 0) out[k] = comp[k] | 0; });
    var diff = n - total(out);
    var citizens = (out.citizen | 0) + Math.max(diff, -(out.citizen | 0));
    if (citizens > 0) out.citizen = citizens; else delete out.citizen;
    return out;
  }

  /** Drop counts for roles that no longer exist (a deleted custom role). */
  function prune(comp, list) {
    var out = {};
    Object.keys(comp || {}).forEach(function (k) { if ((comp[k] | 0) > 0 && byId(list, k)) out[k] = comp[k] | 0; });
    return out;
  }

  /** How many seats each side holds. */
  function sides(comp, list) {
    var out = { town: 0, mafia: 0, independent: 0 };
    Object.keys(comp || {}).forEach(function (k) {
      var r = byId(list, k);
      if (r) out[r.side] += comp[k] | 0;
    });
    return out;
  }

  /** The only thing that can stop a deal is a count that does not match the table. Anything else
   *  is the group's business — the person running the game decides what is fair. */
  function problems(comp, n) {
    var t = total(comp);
    if (t === n) return [];
    return [t < n
      ? (n - t) + (n - t === 1 ? " more role" : " more roles") + " needed for " + n + " players."
      : (t - n) + (t - n === 1 ? " role" : " roles") + " too many for " + n + " players."];
  }

  // ── the deal ─────────────────────────────────────────────────────────────────────────────

  function cryptoRandom() {
    var g = typeof globalThis !== "undefined" ? globalThis : this;
    if (g.crypto && g.crypto.getRandomValues) {
      return g.crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
    }
    return Math.random();
  }

  function shuffle(a, rng) {
    rng = rng || cryptoRandom;
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /**
   * Deal `comp` to `names`. Seat order is the order the names were given; only the cards are
   * shuffled. Each player carries a copy of their card, so editing a role mid-deal cannot change
   * a card somebody has already seen.
   */
  function deal(names, comp, list, rng) {
    var cards = [];
    list.forEach(function (r) {
      for (var i = 0; i < (comp[r.id] | 0); i++) cards.push(r);
    });
    if (cards.length !== names.length) throw new Error("the roles do not match the number of players");
    shuffle(cards, rng);
    return names.map(function (name, i) {
      var r = cards[i];
      return {
        id: i, name: name,
        card: { id: r.id, name: r.name, side: r.side, color: r.color, icon: r.icon, blurb: r.blurb, knowsTeam: r.knowsTeam },
      };
    });
  }

  /** Who this player is shown as their team: everyone else on the same side whose card also knows
   *  its team. A Mafia sees the other Mafia; two custom Lovers on the Independent side see each
   *  other; a lone Serial Killer, whose card does not know its team, sees nobody and is seen by
   *  nobody. */
  function teammates(players, p) {
    if (!p.card.knowsTeam) return [];
    return players.filter(function (q) {
      return q.id !== p.id && q.card.side === p.card.side && q.card.knowsTeam;
    });
  }

  return {
    SIDES: SIDES, SIDE_NAMES: SIDE_NAMES, COLORS: COLORS, SIDE_COLOR: SIDE_COLOR,
    BUILTIN: BUILTIN, BUILTIN_ORDER: BUILTIN_ORDER, STANDARD: STANDARD,
    MIN: MIN, MAX: MAX, NAME_MAX: NAME_MAX, BLURB_MAX: BLURB_MAX, ICON_MAX: ICON_MAX,
    normalize: normalize, catalog: catalog, byId: byId, newId: newId,
    standard: standard, suggested: suggested, total: total, isStandard: isStandard,
    prune: prune, fitWithCitizens: fitWithCitizens, sides: sides, problems: problems,
    shuffle: shuffle, deal: deal, teammates: teammates,
  };
});
