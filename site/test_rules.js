// node --test site/test_rules.js
// The rulings in mvp/.ai/night-interaction-matrix.md, one assertion each, so the narrator tool can
// never quietly drift from the engine it claims to follow.
const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("./js/rules.js");

// A fixed table so every test can name people. Seat order = id order.
function table(roles) {
  const names = ["Ava", "Ben", "Chen", "Dee", "Eli", "Fay", "Gus", "Hal", "Ivy", "Jo", "Kai", "Lu"];
  return R.newGame(roles.map((role, i) => ({ id: i, name: names[i], role })));
}
function id(s, name) { return s.players.find((p) => p.name === name).id; }
function alive(s, name) { return s.players.find((p) => p.name === name).alive; }
function night1(s) { const r = R.resolveNight(s, {}); return r.state; } // burn the meeting

test("canonical setups sum to their size and match the site's table", () => {
  for (let n = 5; n <= 12; n++) assert.equal(R.total(R.canonical(n)), n, `size ${n}`);
  assert.equal(R.canonical(5).detective, undefined, "no Detective at five");
  assert.equal(R.canonical(12).dr_lecter, 1, "Lecter only at twelve");
  assert.equal(R.canonical(11).dr_lecter, undefined);
  assert.ok(R.isCanonical(R.canonical(8), 8));
  assert.ok(!R.isCanonical({ ...R.canonical(8), mayor: 1, citizen: 1 }, 8));
});

test("a deal keeps seat order and names, and shuffles only the roles", () => {
  const names = ["Ava", "Ben", "Chen", "Dee", "Eli"];
  const seq = [0.9, 0.1, 0.5, 0.3, 0.7];
  let i = 0;
  const ps = R.deal(names, R.canonical(5), () => seq[i++ % seq.length]);
  assert.deepEqual(ps.map((p) => p.name), names);
  assert.deepEqual(ps.map((p) => p.role).sort(), R.expand(R.canonical(5)).sort());
});

test("warnings are advisory and name the engine's rules", () => {
  const w = R.warnings({ godfather: 1, doctor: 1, citizen: 3 }, 5);
  assert.ok(w.some((x) => x.level === "ok"));
  const bad = R.warnings({ godfather: 1, detective: 1, citizen: 3 }, 5);
  assert.ok(bad.some((x) => /never get a hit/.test(x.text)), "lone Godfather + Detective");
  const parity = R.warnings({ godfather: 2, mafia: 1, citizen: 3 }, 6);
  assert.ok(parity.some((x) => /parity/.test(x.text)));
  const custom = R.warnings({ ...R.canonical(8), mayor: 1, citizen: 1 }, 8);
  assert.ok(custom.some((x) => /custom table/.test(x.text)));
  const off = R.warnings(R.canonical(8), 9);
  assert.ok(off.some((x) => x.level === "error" && /9 players/.test(x.text)));
});

test("night zero is the meeting: no kill, no other action, day one follows", () => {
  const s = table(["godfather", "mafia", "doctor", "detective", "die_hard", "citizen"]);
  const steps = R.nightSteps(s);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].key, "meet");
  const r = R.resolveNight(s, { kill: id(s, "Chen") }); // a kill given on night 0 is ignored
  assert.ok(alive(r.state, "Chen"));
  assert.equal(r.state.phase, "day");
  assert.equal(r.state.day, 1);
  assert.ok(r.notes[0].includes("Ava") && r.notes[0].includes("Ben"));
});

test("the trigger: Godfather, then first living plain Mafia in seat order, then any mafioso (H2)", () => {
  const s = table(["mafia", "godfather", "mafia", "dr_lecter", "doctor", "citizen", "citizen", "citizen"]);
  assert.equal(R.killAuthority(s).name, "Ben");
  s.players[1].alive = false;
  assert.equal(R.killAuthority(s).name, "Ava", "seat order, not role order");
  s.players[0].alive = false; s.players[2].alive = false;
  assert.equal(R.killAuthority(s).name, "Dee", "Lecter inherits when no killer lives");
});

test("A1: Doctor covers the Die-hard the mafia attack — saved, armour kept", () => {
  let s = night1(table(["godfather", "mafia", "doctor", "detective", "die_hard", "citizen"]));
  const r = R.resolveNight(s, { kill: id(s, "Eli"), save: [id(s, "Eli")] });
  assert.ok(alive(r.state, "Eli"));
  assert.equal(r.state.players[4].armorUsed, false);
});

test("A2 / A5: armour absorbs the first hit and is spent; the next elimination lands", () => {
  let s = night1(table(["godfather", "mafia", "doctor", "detective", "die_hard", "citizen"]));
  let r = R.resolveNight(s, { kill: id(s, "Eli") });
  assert.ok(alive(r.state, "Eli"));
  assert.equal(r.state.players[4].armorUsed, true);
  assert.equal(r.announce, "Nobody died last night.");
  // day: lynched next — the single charge is gone
  const d = R.resolveDay(r.state, { [id(s, "Eli")]: 4 });
  assert.ok(!alive(d.state, "Eli"));
});

test("A3: the Sniper shooting the Die-hard dies; the Die-hard is untouched, armour intact", () => {
  let s = night1(table(["godfather", "mafia", "doctor", "sniper", "die_hard", "citizen", "citizen"]));
  const r = R.resolveNight(s, { shoot: id(s, "Eli") });
  assert.ok(!alive(r.state, "Dee"), "Sniper dead");
  assert.ok(alive(r.state, "Eli"));
  assert.equal(r.state.players[4].armorUsed, false);
});

test("B2: a save on the wrong player is spent for nothing", () => {
  let s = night1(table(["godfather", "mafia", "doctor", "detective", "die_hard", "citizen"]));
  const r = R.resolveNight(s, { kill: id(s, "Fay"), save: [id(s, "Dee")] });
  assert.ok(!alive(r.state, "Fay"));
  assert.equal(r.announce, "Fay was killed in the night.");
});

test("B3: the Doctor does not shield a mafioso from the Sniper", () => {
  let s = night1(table(["godfather", "mafia", "doctor", "sniper", "citizen", "citizen", "citizen"]));
  const r = R.resolveNight(s, { shoot: id(s, "Ben"), save: [id(s, "Ben")] });
  assert.ok(!alive(r.state, "Ben"));
  assert.ok(alive(r.state, "Dee"), "correct shot, Sniper lives");
});

test("B4: the Doctor cannot rescue the Sniper from the penalty (P3)", () => {
  let s = night1(table(["godfather", "mafia", "doctor", "sniper", "citizen", "citizen", "citizen"]));
  const r = R.resolveNight(s, { shoot: id(s, "Eli"), save: [id(s, "Dee")] });
  assert.ok(!alive(r.state, "Dee"));
  assert.ok(alive(r.state, "Eli"));
});

test("C1: shooting the Godfather does nothing, and costs nothing", () => {
  let s = night1(table(["godfather", "mafia", "doctor", "sniper", "citizen", "citizen", "citizen"]));
  const r = R.resolveNight(s, { shoot: id(s, "Ava") });
  assert.ok(alive(r.state, "Ava"));
  assert.ok(alive(r.state, "Dee"));
  assert.ok(r.notes.some((n) => /bulletproof/.test(n)));
});

test("C3 / D1: Lecter's shield stops the shot; D2: shielding the Godfather is a harmless no-op", () => {
  let s = night1(table(["godfather", "mafia", "mafia", "dr_lecter", "doctor", "detective", "sniper", "die_hard", "citizen", "citizen", "citizen", "citizen"]));
  let r = R.resolveNight(s, { shoot: id(s, "Ben"), shield: id(s, "Ben") });
  assert.ok(alive(r.state, "Ben"));
  r = R.resolveNight(s, { shoot: id(s, "Ava"), shield: id(s, "Ava") });
  assert.ok(alive(r.state, "Ava"));
  assert.equal(r.state.lecterSelfHealed, false);
});

test("D4: Lecter may shield himself once; afterwards he is not offered as a target", () => {
  let s = night1(table(["godfather", "mafia", "mafia", "dr_lecter", "doctor", "detective", "sniper", "die_hard", "citizen", "citizen", "citizen", "citizen"]));
  const r = R.resolveNight(s, { shoot: id(s, "Dee"), shield: id(s, "Dee") });
  assert.ok(alive(r.state, "Dee"));
  assert.equal(r.state.lecterSelfHealed, true);
  const step = R.nightSteps(r.state).find((x) => x.key === "shield");
  assert.ok(!step.targets.includes(id(s, "Dee")));
});

test("C5: Sniper and mafia on the same townsperson — two deaths, or one if the Doctor covers", () => {
  const base = night1(table(["godfather", "mafia", "doctor", "sniper", "citizen", "citizen", "citizen"]));
  let r = R.resolveNight(base, { kill: id(base, "Eli"), shoot: id(base, "Eli") });
  assert.ok(!alive(r.state, "Eli") && !alive(r.state, "Dee"));
  r = R.resolveNight(base, { kill: id(base, "Eli"), shoot: id(base, "Eli"), save: [id(base, "Eli")] });
  assert.ok(alive(r.state, "Eli") && !alive(r.state, "Dee"));
});

test("C6: a killed Sniper who also shot town dies once — dead is dead", () => {
  let s = night1(table(["godfather", "mafia", "doctor", "sniper", "citizen", "citizen", "citizen"]));
  const r = R.resolveNight(s, { kill: id(s, "Dee"), shoot: id(s, "Eli") });
  assert.equal(r.deaths.length, 1);
  assert.ok(alive(r.state, "Eli"));
});

test("the Detective: never a lie, and the Godfather reads as town", () => {
  let s = night1(table(["godfather", "mafia", "doctor", "detective", "die_hard", "citizen"]));
  let r = R.resolveNight(s, { investigate: id(s, "Ava") });
  assert.ok(r.notes.some((n) => /Ava.*TOWN/.test(n)));
  r = R.resolveNight(s, { investigate: id(s, "Ben") });
  assert.ok(r.notes.some((n) => /Ben.*MAFIA/.test(n)));
});

test("the Doctor cannot protect himself two nights running, and gets two saves at ten", () => {
  let s = night1(table(["godfather", "mafia", "mafia", "doctor", "detective", "sniper", "die_hard", "citizen", "citizen", "citizen"]));
  let step = R.nightSteps(s).find((x) => x.key === "save");
  assert.equal(step.max, 2, "ten alive");
  assert.ok(step.targets.includes(id(s, "Dee")));
  let r = R.resolveNight(s, { save: [id(s, "Dee")] });
  step = R.nightSteps(r.state).find((x) => x.key === "save");
  assert.ok(!step.targets.includes(id(s, "Dee")), "self excluded the night after a self-save");
  assert.equal(step.max, 2);
});

test("E1 / E4 / E5: the Negotiator turns a living Citizen into plain Mafia, once, after a mafia death", () => {
  let s = night1(table(["godfather", "mafia", "negotiator", "doctor", "sniper", "citizen", "citizen", "citizen"]));
  assert.ok(!R.nightSteps(s).some((x) => x.key === "convert"), "no mafia death yet");
  // the Sniper kills Ben tonight; the Negotiator may act from the NEXT night (E3)
  let r = R.resolveNight(s, { shoot: id(s, "Ben") });
  assert.equal(r.state.mafiaDeaths, 1);
  let d = R.resolveDay(r.state, {});
  assert.ok(R.nightSteps(d.state).some((x) => x.key === "convert"));
  // a convert on somebody who dies tonight does nothing and keeps the power (E1)
  r = R.resolveNight(d.state, { kill: id(s, "Fay"), convert: id(s, "Fay") });
  assert.equal(r.state.negotiatorUsed, false);
  assert.ok(!alive(r.state, "Fay"));
  d = R.resolveDay(r.state, {});
  r = R.resolveNight(d.state, { convert: id(s, "Gus") });
  assert.equal(r.state.players[6].role, "mafia");
  assert.equal(r.state.negotiatorUsed, true);
});

test("E2: a conversion that reaches parity wins the night for the mafia", () => {
  // 2 mafia (godfather + negotiator) vs 3 town, mafia death already on record
  let s = table(["godfather", "negotiator", "doctor", "citizen", "citizen"]);
  s = night1(s);
  s.mafiaDeaths = 1;
  const r = R.resolveNight(s, { kill: id(s, "Chen"), convert: id(s, "Dee") });
  // Chen dead → 2 mafia + Dee converted = 3 mafia vs 1 town
  assert.equal(r.winner, "mafia");
  assert.equal(r.state.phase, "over");
});

test("G1 / G3: a mute on the dead is moot; the same player is not offered twice running", () => {
  let s = night1(table(["godfather", "mafia", "psychiatrist", "doctor", "citizen", "citizen", "citizen"]));
  let r = R.resolveNight(s, { kill: id(s, "Eli"), mute: id(s, "Eli") });
  assert.equal(r.state.mutedForDay, null);
  r = R.resolveNight(s, { mute: id(s, "Fay") });
  assert.equal(r.state.mutedForDay, id(s, "Fay"));
  const d = R.resolveDay(r.state, {});
  const step = R.nightSteps(d.state).find((x) => x.key === "mute");
  assert.ok(!step.targets.includes(id(s, "Fay")));
});

test("H4: two deaths in one night resolve, and the win check runs once at the end", () => {
  let s = night1(table(["godfather", "mafia", "doctor", "sniper", "citizen", "citizen", "citizen"]));
  const r = R.resolveNight(s, { kill: id(s, "Eli"), shoot: id(s, "Ben") });
  assert.equal(r.deaths.length, 2);
  assert.equal(r.winner, null);
  assert.match(r.announce, /and .* died in the night/);
});

test("day: a unique top eliminates, a tie eliminates nobody, and no side is announced", () => {
  let s = night1(table(["godfather", "mafia", "doctor", "detective", "die_hard", "citizen"]));
  let d = R.resolveDay(s, { [id(s, "Ava")]: 3, [id(s, "Fay")]: 3 });
  assert.equal(d.deaths.length, 0);
  assert.match(d.announce, /tied/);
  d = R.resolveDay(s, { [id(s, "Ava")]: 4, [id(s, "Fay")]: 2 });
  assert.ok(!alive(d.state, "Ava"));
  assert.equal(d.announce, "Ava has been eliminated.");
  assert.ok(!/mafia|town/i.test(d.announce), "no side revealed to the table");
});

test("the Mayor may cancel a lynch or break a tie, once, even if muted (P5)", () => {
  let s = night1(table(["godfather", "mafia", "mayor", "doctor", "citizen", "citizen", "citizen"]));
  s.mutedForDay = id(s, "Chen");
  let d = R.resolveDay(s, { [id(s, "Dee")]: 5 }, { cancel: true });
  assert.ok(alive(d.state, "Dee"));
  assert.equal(d.state.mayorUsed, true);
  // spent — a second cancel is ignored
  d = R.resolveDay(d.state.phase === "night" ? R.resolveNight(d.state, {}).state : d.state, { [id(s, "Dee")]: 5 }, { cancel: true });
  assert.ok(!alive(d.state, "Dee"));
  // tie-break
  s = night1(table(["godfather", "mafia", "mayor", "doctor", "citizen", "citizen", "citizen"]));
  d = R.resolveDay(s, { [id(s, "Ava")]: 3, [id(s, "Eli")]: 3 }, { breakTie: id(s, "Ava") });
  assert.ok(!alive(d.state, "Ava"));
});

test("win: town at zero mafia, mafia at parity", () => {
  let s = night1(table(["godfather", "doctor", "citizen", "citizen", "citizen"]));
  let d = R.resolveDay(s, { [id(s, "Ava")]: 4 });
  assert.equal(d.winner, "town");
  s = night1(table(["godfather", "mafia", "doctor", "citizen", "citizen", "citizen"]));
  let r = R.resolveNight(s, { kill: id(s, "Chen") }); // 2 v 3
  assert.equal(r.winner, null);
  d = R.resolveDay(r.state, { [id(s, "Dee")]: 3 }); // 2 v 2 → parity
  assert.equal(d.winner, "mafia");
});

test("resolution never mutates the state it was given", () => {
  const s = night1(table(["godfather", "mafia", "doctor", "detective", "die_hard", "citizen"]));
  const before = JSON.stringify(s);
  R.resolveNight(s, { kill: id(s, "Fay") });
  R.resolveDay(s, { [id(s, "Fay")]: 4 });
  assert.equal(JSON.stringify(s), before);
});
