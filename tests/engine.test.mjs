import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFamilies, parsePairs, assignExchange, makeTextExport } from '../src/engine.js';
const random = () => 0.37;
const people = parseFamilies('North: Alice, Ben, Cleo\nSouth: Dani, Evan, Fran').people;
const solve = opts => assignExchange({ people, random, ...opts });
const mapPairs = pairs => new Map(pairs);

test('parses named and unnamed groups', () => {
  const input = parseFamilies('Smith: Alice, Bob\nCarol, Dana');
  assert.equal(input.families.length, 2);
  assert.equal(input.people.length, 4);
  assert.notEqual(input.people[0].group, input.people[2].group);
});
test('rejects repeated names regardless of case', () => {
  assert.throws(() => parseFamilies('A: Alice\nB: alice'), /more than once/);
});
test('accepts arrows, CSV quotes, and headers', () => {
  assert.deepEqual(parsePairs('Giver,Recipient\nAlice -> Bob\n"Jane, Jr.", Alice\nBob → Carol'), [
    ['Alice', 'Bob'], ['Jane, Jr.', 'Alice'], ['Bob', 'Carol']]);
});
test('each person gives and receives once, with family and reciprocal restrictions', () => {
  const pairs = solve();
  assert.equal(pairs.length, 6);
  const map = mapPairs(pairs);
  assert.equal(new Set(pairs.map(x => x[1])).size, 6);
  for (const [from, to] of pairs) {
    assert.notEqual(from, to);
    assert.notEqual(people.find(x => x.name === from).group, people.find(x => x.name === to).group);
    assert.notEqual(map.get(to), from);
  }
});
test('honors pinned and avoid pairs', () => {
  const pairs = solve({fixedPairs:[['Alice','Dani']], avoidPairs:[['Ben','Dani'],['Cleo','Evan']]});
  const result = mapPairs(pairs);
  assert.equal(result.get('Alice'), 'Dani');
  assert.notEqual(result.get('Ben'), 'Dani');
  assert.notEqual(result.get('Cleo'), 'Evan');
});
test('rejects conflicting planned pair and duplicate recipients', () => {
  assert.throws(() => solve({fixedPairs:[['Alice','Dani'],['Ben','Dani']]}), /more than once/);
  assert.throws(() => solve({fixedPairs:[['Alice','Ben']]}), /conflicts/);
});
test('detects impossible families', () => {
  const lopsided = parseFamilies('Large: A, B, C\nSmall: D').people;
  assert.throws(() => assignExchange({people:lopsided, random}), /No valid exchange/);
});
test('two people require reciprocal setting', () => {
  const two = parseFamilies('One: A\nTwo: B').people;
  assert.throws(() => assignExchange({people:two, random}), /No valid exchange/);
  assert.equal(assignExchange({people:two,allowReciprocal:true,random}).length, 2);
});
test('rejects unrecognized names in imports', () => {
  assert.throws(() => solve({avoidPairs:[['Nobody','Alice']]}), /not in your participants/);
});
test('rejects pinned reciprocal pair under default rules', () => {
  assert.throws(() => solve({fixedPairs:[['Alice','Dani'],['Dani','Alice']]}), /two-way/);
});
test('works with every giver fixed', () => {
  const baseline = solve();
  assert.deepEqual(mapPairs(solve({fixedPairs:baseline})), mapPairs(baseline));
});

test('repeated group names stay in the same group', () => {
  const parsed = parseFamilies('Smith: Alice\nJohnson: Bob\nSmith: Carol');
  assert.equal(parsed.families.length, 2);
  assert.equal(parsed.people[0].group, parsed.people[2].group);
});
test('text exports can be imported as next year’s avoid list', () => {
  const pairs=solve();
  assert.deepEqual(parsePairs(makeTextExport(pairs)), pairs);
});
