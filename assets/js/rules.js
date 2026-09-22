/* RPS Mafia — the rules, as a library.
 *
 * Everything the role generator and the narrator need to deal a table and run a night, with no
 * DOM in it so it can be tested in node and reused by any page. It implements the engine's own
 * rulings (mvp/.ai/night-interaction-matrix.md, all six forks confirmed) rather than a generic
 * approximation, in the engine's own resolution order:
 *
 *   investigate → sniper shot → mafia kill → sniper penalty → negotiation → mute → win check
 *
 * Nothing here talks to a server. A deal is made from crypto randomness in the browser and never
 * leaves it.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.RPSRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // ── roles ────────────────────────────────────────────────────────────────────────────────

  var ROLES = {
    godfather: {
      name: "Godfather", team: "mafia", color: "#C62828", icon: "👑", killer: true,
      blurb: "Lead the mafia. You choose who dies at night. The Detective reads you as town, and the Sniper's bullet does nothing to you.",
    },
    mafia: {
      name: "Mafia", team: "mafia", color: "#E53935", icon: "🗡", killer: true,
      blurb: "Kill one player each night — when the trigger is yours. Blend in during the day. No immunities.",
    },
    dr_lecter: {
      name: "Dr. Lecter", team: "mafia", color: "#D32F2F", icon: "🩹", killer: false,
      blurb: "Mafia medic. Each night shield one of your team from the Sniper. You may shield yourself only once in the whole game.",
    },
    negotiator: {
      name: "Negotiator", team: "mafia", color: "#EF5350", icon: "🤝", killer: false, custom: true,
      blurb: "Once, after a mafioso has died, convert one Citizen to your side. They become plain Mafia.",
    },
    doctor: {
      name: "Doctor", team: "town", color: "#43A047", icon: "🩺",
      blurb: "Each night protect one player from the mafia's kill — two while ten or more are alive. You may not protect yourself two nights running.",
    },
    detective: {
      name: "Detective", team: "town", color: "#1E88E5", icon: "🔍",
      blurb: "Each night learn one player's side. The answer is never a lie, but the Godfather reads as town.",
    },
    sniper: {
      name: "Sniper", team: "town", color: "#8E24AA", icon: "🎯",
      blurb: "Shoot one player at night. A mafioso dies. A townsperson lives — and you die instead. The Godfather is bulletproof.",
    },
    die_hard: {
      name: "Die-hard", team: "town", color: "#00897B", icon: "🛡",
      blurb: "You survive your first elimination — a night kill or a lynch — once. After that you are an ordinary player.",
    },
    mayor: {
      name: "Mayor", team: "town", color: "#FFB300", icon: "🏛", custom: true,
      blurb: "Once in the game, cancel a lynch or break a voting tie. Even if you are muted.",
    },
    psychiatrist: {
      name: "Psychiatrist", team: "town", color: "#5E35B1", icon: "🧠", custom: true,
      blurb: "Each night mute one player for the following day. They may still vote. Never the same player twice running.",
    },
    citizen: {
      name: "Citizen", team: "town", color: "#78909C", icon: "👤",
      blurb: "No powers, no private information. Only what people said and how they said it — which is the game.",
    },
  };

  // Deal order: who acts at night, in the order the narrator reads them.
  var ORDER = [
    "godfather", "mafia", "dr_lecter", "negotiator",
    "doctor", "detective", "sniper", "die_hard", "mayor", "psychiatrist", "citizen",
  ];

  // The game's own distribution at every size it will run.
  var SETUPS = {
    5: { godfather: 1, doctor: 1, citizen: 3 },
    6: { godfather: 1, mafia: 1, doctor: 1, detective: 1, die_hard: 1, citizen: 1 },
    7: { godfather: 1, mafia: 1, doctor: 1, detective: 1, sniper: 1, citizen: 2 },
    8: { godfather: 1, mafia: 2, doctor: 1, detective: 1, sniper: 1, citizen: 2 },
    9: { godfather: 1, mafia: 2, doctor: 1, detective: 1, sniper: 1, die_hard: 1, citizen: 2 },
    10: { godfather: 1, mafia: 2, doctor: 1, detective: 1, sniper: 1, die_hard: 1, citizen: 3 },
    11: { godfather: 1, mafia: 2, doctor: 1, detective: 1, sniper: 1, die_hard: 1, citizen: 4 },
    12: { godfather: 1, mafia: 2, dr_lecter: 1, doctor: 1, detective: 1, sniper: 1, die_hard: 1, citizen: 4 },
  };

  var MIN = 5, MAX = 12;

  function canonical(n) {
    var s = SETUPS[n];
    if (!s) return null;
    var out = {};
    Object.keys(s).forEach(function (k) { out[k] = s[k]; });
    return out;
  }

  function total(comp) {
    return Object.keys(comp).reduce(function (a, k) { return a + (comp[k] | 0); }, 0);
  }

  function count(comp, pred) {
    return Object.keys(comp).reduce(function (a, k) {
      return a + (pred(ROLES[k], k) ? (comp[k] | 0) : 0);
    }, 0);
  }

  function expand(comp) {
    var out = [];
    ORDER.forEach(function (k) {
      for (var i = 0; i < (comp[k] | 0); i++) out.push(k);
    });
    return out;
  }

  /** Advisory only — the tool warns and never blocks. Every line is one of the engine's rules. */
  function warnings(comp, n) {
    var w = [];
    var t = total(comp);
    var mafia = count(comp, function (r) { return r.team === "mafia"; });
    var town = t - mafia;
    var killers = count(comp, function (r) { return r.killer; });
    var gf = comp.godfather | 0;

    if (t !== n) w.push({ level: "error", text: t + " roles for " + n + " players — add or remove " + Math.abs(n - t) + "." });
    if (mafia === 0) w.push({ level: "error", text: "No mafia at all. Nobody can lose." });
    if (killers === 0 && mafia > 0) w.push({ level: "error", text: "Mafia with no killer. They can never win a night." });
    if (mafia > 0 && mafia >= town) w.push({ level: "error", text: "Mafia already at parity — they have won before the first night." });
    if (gf > 1) w.push({ level: "warn", text: "Two Godfathers. Only one holds the trigger; the other is a bulletproof plain Mafia." });
    if (gf === 0 && mafia > 0) w.push({ level: "warn", text: "No Godfather. Every mafioso can be caught by the Detective and shot by the Sniper." });
    if (n >= 7 && killers < 2) w.push({ level: "warn", text: "Fewer than two killers from seven players — the town can afford to lose a night." });
    if ((comp.detective | 0) > 0 && mafia === gf && gf === 1) w.push({ level: "warn", text: "The only mafioso is the Godfather, who reads as town. The Detective can never get a hit." });
    if ((comp.dr_lecter | 0) > 0 && n < 12) w.push({ level: "info", text: "Dr. Lecter below twelve players is a mafia slot spent on defence. The game itself only deals him at twelve." });
    if ((comp.dr_lecter | 0) > 0 && (comp.sniper | 0) === 0) w.push({ level: "warn", text: "Dr. Lecter with no Sniper has nothing to shield anyone from." });
    if ((comp.negotiator | 0) > 0 && (comp.citizen | 0) === 0) w.push({ level: "warn", text: "A Negotiator with no Citizens has nobody to convert." });
    if ((comp.sniper | 0) > 1) w.push({ level: "warn", text: "Two Snipers is a lot of town gun. Expect a bloody night one." });
    if ((comp.doctor | 0) === 0 && killers > 0) w.push({ level: "warn", text: "No Doctor. Every mafia kill lands." });
    ["mayor", "psychiatrist", "negotiator"].forEach(function (k) {
      if ((comp[k] | 0) > 0) w.push({ level: "info", text: ROLES[k].name + " is never dealt in a standard game — you are running a custom table." });
    });
    if (mafia > 0 && town > 0 && w.every(function (x) { return x.level === "info"; })) {
      w.unshift({ level: "ok", text: mafia + " mafia (" + killers + (killers === 1 ? " killer" : " killers") + ") against " + town + " town." });
    }
    return w;
  }

  function isCanonical(comp, n) {
    var c = SETUPS[n];
    if (!c) return false;
    var keys = {};
    Object.keys(c).forEach(function (k) { keys[k] = 1; });
    Object.keys(comp).forEach(function (k) { if (comp[k] | 0) keys[k] = 1; });
    return Object.keys(keys).every(function (k) { return (c[k] | 0) === (comp[k] | 0); });
  }

  // ── randomness ───────────────────────────────────────────────────────────────────────────

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

  /** Seat order is the order the names were given; only the roles are shuffled. */
  function deal(names, comp, rng) {
    var roles = shuffle(expand(comp), rng);
    if (roles.length !== names.length) throw new Error("composition does not match player count");
    return names.map(function (name, i) {
      return { id: i, name: name, role: roles[i], alive: true, armorUsed: false };
    });
  }

  // ── game state ───────────────────────────────────────────────────────────────────────────

  function newGame(players) {
    return {
      players: players.map(function (p) {
        return { id: p.id, name: p.name, role: p.role, alive: true, armorUsed: false };
      }),
      night: 0, day: 0, phase: "night", winner: null,
      doctorSelfHealedLastNight: false, lecterSelfHealed: false,
      mayorUsed: false, negotiatorUsed: false,
      mafiaDeaths: 0, mutedForDay: null, lastMuted: null,
      log: [],
    };
  }

  function clone(s) { return JSON.parse(JSON.stringify(s)); }
  function byId(s, id) { for (var i = 0; i < s.players.length; i++) if (s.players[i].id === id) return s.players[i]; return null; }
  function team(p) { return ROLES[p.role].team; }
  function living(s) { return s.players.filter(function (p) { return p.alive; }); }
  function livingOf(s, role) { return living(s).filter(function (p) { return p.role === role; }); }
  function livingMafia(s) { return living(s).filter(function (p) { return team(p) === "mafia"; }); }
  function livingTown(s) { return living(s).filter(function (p) { return team(p) === "town"; }); }

  function counts(s) {
    var m = livingMafia(s).length, t = livingTown(s).length;
    return { mafia: m, town: t, alive: m + t };
  }

  /** Town wins at zero mafia; mafia win at parity. */
  function winner(s) {
    var c = counts(s);
    if (c.mafia === 0) return "town";
    if (c.mafia >= c.town) return "mafia";
    return null;
  }

  /** Who holds the trigger: the Godfather while he lives, then the first living plain Mafia in
   *  seat order, then any living mafioso — the "do both" inheritor. */
  function killAuthority(s) {
    var gf = livingOf(s, "godfather")[0];
    if (gf) return gf;
    var m = livingOf(s, "mafia")[0];
    if (m) return m;
    return livingMafia(s)[0] || null;
  }

  function saveCapacity(s) { return counts(s).alive >= 10 ? 2 : 1; }

  // ── the night script ─────────────────────────────────────────────────────────────────────

  var LINES = {
    close: "Everyone, close your eyes.",
    meet: "Mafia, open your eyes and find each other. Take a good look — you will not see each other again. Mafia, close your eyes.",
    kill: "Mafia, open your eyes. {actor}, choose who dies tonight. Mafia, close your eyes.",
    shield: "Dr. Lecter, open your eyes. Choose who to shield from the Sniper tonight. Close your eyes.",
    save: "Doctor, open your eyes. Choose who to protect tonight. Close your eyes.",
    save2: "Doctor, open your eyes. Choose two people to protect tonight. Close your eyes.",
    investigate: "Detective, open your eyes. Point at the player you want to investigate. Close your eyes.",
    shoot: "Sniper, open your eyes. Choose whether to shoot, and whom. Close your eyes.",
    mute: "Psychiatrist, open your eyes. Choose who is silenced tomorrow. Close your eyes.",
    convert: "Negotiator, open your eyes. Choose the Citizen who joins you. Close your eyes.",
    wake: "Everyone, open your eyes.",
  };

  function fill(line, actor) { return line.replace("{actor}", actor); }

  /** The steps for the coming night, in reading order, with only the roles actually in play and
   *  alive. Night 0 is the meeting: no kill and no other action. */
  function nightSteps(s) {
    var steps = [];
    var others = function (p) { return living(s).filter(function (q) { return q.id !== p.id; }); };

    if (s.night === 0) {
      var maf = livingMafia(s);
      if (maf.length) {
        steps.push({ key: "meet", line: LINES.meet, actors: maf.map(function (p) { return p.id; }), targets: [], max: 0 });
      }
      return steps;
    }

    var authority = killAuthority(s);
    if (authority) {
      steps.push({
        key: "kill", role: authority.role, actor: authority.id,
        line: fill(LINES.kill, authority.name),
        targets: livingTown(s).map(function (p) { return p.id; }).concat(
          // A mafioso may target a mafioso; it is legal, if strange. Offer everyone but the actor.
          livingMafia(s).filter(function (p) { return p.id !== authority.id; }).map(function (p) { return p.id; })
        ),
        max: 1, optional: true,
      });
    }

    var lecter = livingOf(s, "dr_lecter")[0];
    if (lecter) {
      steps.push({
        key: "shield", role: "dr_lecter", actor: lecter.id, line: LINES.shield,
        targets: livingMafia(s).filter(function (p) { return p.id !== lecter.id || !s.lecterSelfHealed; }).map(function (p) { return p.id; }),
        max: 1, optional: true,
      });
    }

    var doc = livingOf(s, "doctor")[0];
    if (doc) {
      var cap = saveCapacity(s);
      steps.push({
        key: "save", role: "doctor", actor: doc.id, line: cap === 2 ? LINES.save2 : LINES.save,
        targets: living(s).filter(function (p) { return p.id !== doc.id || !s.doctorSelfHealedLastNight; }).map(function (p) { return p.id; }),
        max: cap, optional: true,
      });
    }

    var det = livingOf(s, "detective")[0];
    if (det) {
      steps.push({
        key: "investigate", role: "detective", actor: det.id, line: LINES.investigate,
        targets: others(det).map(function (p) { return p.id; }), max: 1, optional: true,
      });
    }

    var sn = livingOf(s, "sniper")[0];
    if (sn) {
      steps.push({
        key: "shoot", role: "sniper", actor: sn.id, line: LINES.shoot,
        targets: others(sn).map(function (p) { return p.id; }), max: 1, optional: true,
      });
    }

    var psy = livingOf(s, "psychiatrist")[0];
    if (psy) {
      steps.push({
        key: "mute", role: "psychiatrist", actor: psy.id, line: LINES.mute,
        targets: others(psy).filter(function (p) { return p.id !== s.lastMuted; }).map(function (p) { return p.id; }),
        max: 1, optional: true,
      });
    }

    var neg = livingOf(s, "negotiator")[0];
    // Precondition: a mafioso has died in some earlier, completed phase (E3), the power is unspent,
    // and there is a Citizen to turn (E4).
    if (neg && !s.negotiatorUsed && s.mafiaDeaths > 0 && livingOf(s, "citizen").length) {
      steps.push({
        key: "convert", role: "negotiator", actor: neg.id, line: LINES.convert,
        targets: livingOf(s, "citizen").map(function (p) { return p.id; }), max: 1, optional: true,
      });
    }

    return steps;
  }

  // ── resolution ───────────────────────────────────────────────────────────────────────────

  function kill(s, p, notes, deaths, why) {
    if (!p.alive) return; // dead is dead (C6)
    p.alive = false;
    deaths.push(p.id);
    if (team(p) === "mafia") s.mafiaDeaths += 1;
    notes.push(p.name + " died — " + why + ".");
  }

  /**
   * Resolve a night. `actions` is {kill, shield, save:[…], investigate, shoot, mute, convert} of
   * player ids (or null / [] for a pass). Returns {state, announce, notes, deaths, winner}.
   * `announce` is what the table hears; `notes` are for the narrator only.
   */
  function resolveNight(state, actions) {
    var s = clone(state);
    actions = actions || {};
    var notes = [], deaths = [];
    var n = s.night;

    if (n === 0) {
      var maf = livingMafia(s);
      notes.push("The mafia met: " + maf.map(function (p) { return p.name; }).join(", ") + ".");
      s.log.push({ phase: "night", n: 0, announce: "Nobody died. It was only the first night.", notes: notes, deaths: [] });
      s.night = 1; s.day = 1; s.phase = "day"; s.mutedForDay = null;
      return { state: s, announce: "Nobody died. It was only the first night.", notes: notes, deaths: [], winner: null };
    }

    var target = actions.kill != null ? byId(s, actions.kill) : null;
    var saves = (actions.save || []).map(function (id) { return byId(s, id); }).filter(Boolean);
    var shot = actions.shoot != null ? byId(s, actions.shoot) : null;
    var shield = actions.shield != null ? byId(s, actions.shield) : null;
    var probe = actions.investigate != null ? byId(s, actions.investigate) : null;
    var mute = actions.mute != null ? byId(s, actions.mute) : null;
    var convert = actions.convert != null ? byId(s, actions.convert) : null;

    var doc = livingOf(s, "doctor")[0];
    var sniper = livingOf(s, "sniper")[0];
    var lecter = livingOf(s, "dr_lecter")[0];

    // 10 — investigate. Alignment read at the start of the night (P4); the Godfather reads as town.
    if (probe) {
      var reads = probe.role === "godfather" ? "town" : team(probe);
      notes.push("The Detective asked about " + probe.name + " — tell them: " + reads.toUpperCase() + ".");
    }

    // 20 — sniper shot.
    var penalty = false;
    if (sniper && shot) {
      if (shot.role === "godfather") {
        notes.push("The Sniper shot " + shot.name + ", the Godfather. Nothing happened — he is bulletproof, and no penalty (C1).");
      } else if (team(shot) === "mafia") {
        if (shield && shield.id === shot.id) {
          notes.push("The Sniper shot " + shot.name + ". Dr. Lecter had shielded them — no kill (C3).");
        } else {
          kill(s, shot, notes, deaths, "shot by the Sniper");
        }
      } else {
        penalty = true; // resolved after the mafia kill, as the engine does
        notes.push("The Sniper shot " + shot.name + ", who is town. " + shot.name + " is untouched; the Sniper pays for it (C4).");
      }
    }

    // 30 — the mafia kill.
    if (target) {
      if (!target.alive) {
        notes.push("The mafia chose " + target.name + ", who was already dead tonight.");
      } else if (saves.some(function (p) { return p.id === target.id; })) {
        notes.push("The mafia chose " + target.name + ". The Doctor had protected them — saved" +
          (target.role === "die_hard" ? ", and the Die-hard's armour is kept (A1)" : "") + ".");
      } else if (target.role === "die_hard" && !target.armorUsed) {
        target.armorUsed = true;
        notes.push("The mafia chose " + target.name + ". The Die-hard's armour absorbed it — alive, armour spent (A2).");
      } else {
        kill(s, target, notes, deaths, "killed by the mafia");
      }
    } else if (killAuthority(s)) {
      notes.push("The mafia chose nobody.");
    }
    if (saves.length && (!target || !saves.some(function (p) { return p.id === target.id; }))) {
      notes.push("The Doctor protected " + saves.map(function (p) { return p.name; }).join(" and ") + " — nobody attacked them.");
    }

    // 40 — sniper penalty. Self-inflicted; no save or shield undoes it (P3, B4).
    if (penalty && sniper) kill(s, sniper, notes, deaths, "the Sniper's penalty for shooting a townsperson");

    // 50 — negotiation. Only a living Citizen; they become plain Mafia (E1, E5).
    if (convert && convert.alive && convert.role === "citizen" && !s.negotiatorUsed) {
      convert.role = "mafia";
      s.negotiatorUsed = true;
      notes.push("The Negotiator turned " + convert.name + ". From tomorrow they are Mafia — tell them privately.");
    } else if (convert && !convert.alive) {
      notes.push("The Negotiator chose " + convert.name + ", who died tonight. Nothing happens; the power is kept.");
    }

    // 60 — mute. Moot on the dead (G1).
    s.mutedForDay = null;
    if (mute && mute.alive) {
      s.mutedForDay = mute.id; s.lastMuted = mute.id;
      notes.push(mute.name + " is muted tomorrow. They may still vote.");
    } else {
      s.lastMuted = null;
    }

    // bookkeeping
    s.doctorSelfHealedLastNight = !!(doc && saves.some(function (p) { return p.id === doc.id; }));
    if (lecter && shield && shield.id === lecter.id) s.lecterSelfHealed = true;

    // 70 — win check, once, on the final roster (H4, E2).
    var w = winner(s);
    var names = deaths.map(function (id) { return byId(s, id).name; });
    var announce = names.length === 0 ? "Nobody died last night."
      : names.length === 1 ? names[0] + " was killed in the night."
      : names.slice(0, -1).join(", ") + " and " + names[names.length - 1] + " died in the night.";

    s.log.push({ phase: "night", n: n, announce: announce, notes: notes, deaths: deaths });
    if (w) { s.winner = w; s.phase = "over"; }
    else { s.day = n; s.phase = "day"; }
    return { state: s, announce: announce, notes: notes, deaths: deaths, winner: w };
  }

  /**
   * Resolve a day. `tally` is {playerId: votes}. `mayor` is null, {cancel:true}, or {breakTie:id}.
   * A unique top eliminates; a tie eliminates nobody unless the Mayor breaks it. Eliminations never
   * reveal a side to the table.
   */
  function resolveDay(state, tally, mayor) {
    var s = clone(state);
    var notes = [], deaths = [];
    tally = tally || {};
    var ids = Object.keys(tally).map(Number).filter(function (id) { var p = byId(s, id); return p && p.alive && tally[id] > 0; });
    var top = 0;
    ids.forEach(function (id) { if (tally[id] > top) top = tally[id]; });
    var leaders = ids.filter(function (id) { return tally[id] === top; });
    var victim = null, announce;

    var mayorAlive = livingOf(s, "mayor")[0];
    if (mayor && mayorAlive && !s.mayorUsed && mayor.cancel) {
      s.mayorUsed = true;
      notes.push("The Mayor cancelled the lynch.");
      announce = "The Mayor has spoken. Nobody is eliminated today.";
    } else if (leaders.length === 1) {
      victim = byId(s, leaders[0]);
    } else if (leaders.length > 1 && mayor && mayorAlive && !s.mayorUsed && mayor.breakTie != null && leaders.indexOf(mayor.breakTie) !== -1) {
      s.mayorUsed = true;
      victim = byId(s, mayor.breakTie);
      notes.push("The Mayor broke the tie against " + victim.name + ".");
    } else if (leaders.length > 1) {
      announce = "The vote is tied. Nobody is eliminated today.";
    } else {
      announce = "No votes were cast. Nobody is eliminated today.";
    }

    if (victim) {
      if (victim.role === "die_hard" && !victim.armorUsed) {
        victim.armorUsed = true;
        notes.push(victim.name + " was voted out — the Die-hard's armour absorbed it. Alive, armour spent (A5/A6).");
        announce = "The table voted out " + victim.name + " — and " + victim.name + " is still standing. Something protected them.";
      } else {
        kill(s, victim, notes, deaths, "voted out by the table");
        announce = victim.name + " has been eliminated.";
      }
    }

    s.mutedForDay = null;
    var w = winner(s);
    s.log.push({ phase: "day", n: s.day, announce: announce, notes: notes, deaths: deaths });
    if (w) { s.winner = w; s.phase = "over"; }
    else { s.night = s.day + 1; s.phase = "night"; }
    return { state: s, announce: announce, notes: notes, deaths: deaths, winner: w };
  }

  return {
    ROLES: ROLES, ORDER: ORDER, SETUPS: SETUPS, MIN: MIN, MAX: MAX, LINES: LINES,
    canonical: canonical, isCanonical: isCanonical, expand: expand, total: total, warnings: warnings,
    shuffle: shuffle, deal: deal, newGame: newGame, clone: clone,
    living: living, livingMafia: livingMafia, livingTown: livingTown, counts: counts, winner: winner,
    killAuthority: killAuthority, saveCapacity: saveCapacity,
    nightSteps: nightSteps, resolveNight: resolveNight, resolveDay: resolveDay, byId: byId, team: team,
  };
});
