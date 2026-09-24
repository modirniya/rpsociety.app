// node --test site/test_deck.js
// The deck behind the role generator: roles (the game's own, edited, or the group's), a table's
// make-up, and a deal that is fair and tells each player only who their team is.
const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("./js/deck.js");

function seq(values) { let i = 0; return () => values[i++ % values.length]; }

test("the game's own deal is the standard at every size it runs", () => {
  for (let n = 5; n <= 12; n++) {
    assert.equal(D.total(D.standard(n)), n, `size ${n}`);
    assert.ok(D.isStandard(D.suggested(n), n), `size ${n} suggests the standard`);
  }
  assert.equal(D.standard(12).dr_lecter, 1, "Lecter only at twelve");
  assert.equal(D.standard(4), null, "no standard below five");
});

test("every size from 3 to 30 has a suggested deal that fills the table", () => {
  for (let n = D.MIN; n <= D.MAX; n++) {
    const c = D.suggested(n);
    assert.equal(D.total(c), n, `size ${n}`);
    assert.ok(Object.values(c).every((v) => v >= 0), `size ${n} has no negative counts`);
    assert.ok(D.sides(c, D.catalog()).mafia >= 1, `size ${n} has mafia`);
  }
  assert.equal(D.MIN, 3);
  assert.equal(D.MAX, 30);
});

test("the only thing that blocks a deal is a count that does not match", () => {
  assert.deepEqual(D.problems({ citizen: 5 }, 5), [], "an all-town table is the group's business");
  assert.match(D.problems({ citizen: 4 }, 5)[0], /1 more role needed for 5/);
  assert.match(D.problems({ citizen: 7 }, 5)[0], /2 roles too many for 5/);
});

test("built-in roles can be edited, in any language, and reset", () => {
  const edited = D.catalog({ overrides: { citizen: { name: "شهروند", side: "town", blurb: "بدون قدرت" } } });
  const c = D.byId(edited, "citizen");
  assert.equal(c.name, "شهروند");
  assert.equal(c.blurb, "بدون قدرت");
  assert.ok(c.builtin && c.edited);
  assert.equal(D.byId(D.catalog(), "citizen").name, "Citizen", "no override, the original");
});

test("a group's own role is on a side, with a default colour, symbol and teammate setting", () => {
  const list = D.catalog({ roles: [{ id: "cjester", name: "jester", side: "independent" }] });
  const j = D.byId(list, "cjester");
  assert.equal(j.side, "independent");
  assert.equal(j.color, D.SIDE_COLOR.independent);
  assert.equal(j.icon, "J", "first letter when no symbol is given");
  assert.equal(j.knowsTeam, false, "only mafia are shown their team by default");
  assert.equal(D.byId(D.catalog({ roles: [{ id: "cx", name: "Spy", side: "mafia" }] }), "cx").knowsTeam, true);
});

test("malformed stored roles are cleaned rather than trusted", () => {
  const list = D.catalog({ roles: [
    { id: "cok", name: "x".repeat(200), side: "wizards", color: "red; background:url(x)", blurb: "b".repeat(999) },
    { id: "../../evil", name: "Bad id" },
    null,
  ] });
  const r = D.byId(list, "cok");
  assert.equal(r.name.length, D.NAME_MAX);
  assert.equal(r.side, "town", "unknown side falls back to town");
  assert.equal(r.color, D.SIDE_COLOR.town, "a colour that is not a plain hex is replaced");
  assert.equal(r.blurb.length, D.BLURB_MAX);
  assert.equal(D.byId(list, "../../evil"), null, "an id that is not ours is dropped");
});

test("a deleted role's count is dropped from the table", () => {
  const list = D.catalog();
  assert.deepEqual(D.prune({ citizen: 3, cgone: 2 }, list), { citizen: 3 });
});

test("sides are counted per seat, including independents", () => {
  const list = D.catalog({ roles: [{ id: "cj", name: "Jester", side: "independent" }] });
  assert.deepEqual(D.sides({ mafia: 2, citizen: 3, cj: 1 }, list), { town: 3, mafia: 2, independent: 1 });
});

test("a deal keeps seat order and names, and shuffles only the cards", () => {
  const names = ["Ava", "Ben", "Chen", "Dee", "Eli"];
  const list = D.catalog();
  const ps = D.deal(names, D.standard(5), list, seq([0.9, 0.1, 0.5, 0.3, 0.7]));
  assert.deepEqual(ps.map((p) => p.name), names);
  assert.deepEqual(ps.map((p) => p.card.id).sort(), ["citizen", "citizen", "citizen", "doctor", "godfather"]);
  assert.throws(() => D.deal(names, { citizen: 4 }, list), /do not match/);
});

test("each card is a copy, so editing a role later cannot change a card already dealt", () => {
  const custom = { roles: [{ id: "cj", name: "Jester", side: "independent" }] };
  const ps = D.deal(["A", "B", "C"], { cj: 1, citizen: 2 }, D.catalog(custom), seq([0]));
  custom.roles[0].name = "Changed";
  assert.ok(ps.some((p) => p.card.name === "Jester"));
});

test("teammates: the mafia see each other, lovers see each other, a loner sees nobody", () => {
  const custom = { roles: [
    { id: "clover", name: "Lover", side: "independent", knowsTeam: true },
    { id: "ckiller", name: "Serial killer", side: "independent", knowsTeam: false },
  ] };
  const ps = D.deal(["Ava", "Ben", "Chen", "Dee", "Eli", "Fay", "Gus"],
    { godfather: 1, mafia: 1, clover: 2, ckiller: 1, citizen: 2 }, D.catalog(custom), seq([0.5]));
  const find = (id) => ps.filter((p) => p.card.id === id);
  const names = (list) => list.map((p) => p.name).sort();

  const gf = find("godfather")[0];
  assert.deepEqual(names(D.teammates(ps, gf)), names(find("mafia")));

  const [l1, l2] = find("clover");
  assert.deepEqual(names(D.teammates(ps, l1)), [l2.name], "lovers see only each other, not the killer");

  const killer = find("ckiller")[0];
  assert.deepEqual(D.teammates(ps, killer), [], "a role that does not know its team sees nobody");
  assert.deepEqual(D.teammates(ps, find("citizen")[0]), [], "town are not shown each other");
});

test("new ids never collide with a role already in use", () => {
  const list = D.catalog({ roles: [{ id: "c1", name: "A" }] });
  const id = D.newId(list, seq([1 / 2176782336, 0.5]));
  assert.notEqual(id, "c1");
  assert.match(id, /^c[0-9a-z]+$/);
});

test("resizing a custom table adds or removes Citizens and nothing else", () => {
  const comp = { mafia: 2, cj: 1, citizen: 2 };
  assert.deepEqual(D.fitWithCitizens(comp, 30), { mafia: 2, cj: 1, citizen: 27 });
  assert.deepEqual(D.fitWithCitizens(comp, 3), { mafia: 2, cj: 1 }, "Citizens go first");
  assert.equal(D.total(D.fitWithCitizens(comp, 2)), 3, "never removes a role the group chose");
  assert.deepEqual(comp, { mafia: 2, cj: 1, citizen: 2 }, "the original is not changed");
});
