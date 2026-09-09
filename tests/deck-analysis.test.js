'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../deck-core');
const H = require('../hand-engine');
const { cacheKey, resolveCards } = require('../lib/deck-service');
function card(name, mana, type, text = '', extra = {}) { return { name, mana, type, text, mv: (mana.match(/\{\d+\}/g) || []).reduce((s, t) => s + +t.slice(1, -1), 0) + (mana.match(/\{[WUBRGC]\}/g) || []).length, faces: [], ...extra }; }
const metadata = {
  Plains: card('Plains', '', 'Basic Land — Plains', '{T}: Add {W}.'),
  Mountain: card('Mountain', '', 'Basic Land — Mountain', '{T}: Add {R}.'),
  Forest: card('Forest', '', 'Basic Land — Forest', '{T}: Add {G}.'),
  Wastes: card('Wastes', '', 'Basic Land', '{T}: Add {C}.'),
  'White Lead': card('White Lead', '{1}{W}', 'Legendary Creature', '', { identity: ['W'] }),
  'Red Lead': card('Red Lead', '{1}{R}', 'Legendary Creature', '', { identity: ['R'] }),
  'Colorless Lead': card('Colorless Lead', '{2}{C}', 'Legendary Creature', '', { identity: [] }),
  Spark: card('Spark', '{R}', 'Instant', 'Spark deals 3 damage to any target.'),
  Guard: card('Guard', '{W}', 'Creature'),
  Rock: card('Rock', '{1}', 'Artifact', '{T}: Add {C}{C}.'),
  'Mana Elf': card('Mana Elf', '{G}', 'Creature', '{T}: Add {G}.'),
  Value: card('Value', '{2}', 'Sorcery', 'Draw two cards.'),
  'Tapped Red': card('Tapped Red', '', 'Land', 'This land enters tapped.\n{T}: Add {R}.'),
  Fetch: card('Fetch', '', 'Land', '{T}, Pay 1 life, Sacrifice Fetch: Search your library for a Mountain or Plains card, put it onto the battlefield, then shuffle.'),
  Modal: card('Modal', '', 'Sorcery // Land', '', { layout: 'modal_dfc', faces: [card('Modal', '{W}', 'Sorcery', 'Draw a card.'), card('Back', '', 'Land', 'This land enters tapped.\n{T}: Add {W}.')] }),
  Transform: card('Transform', '{U}', 'Enchantment', '', { layout: 'transform', faces: [card('Transform', '{U}', 'Enchantment'), card('Back', '', 'Land', '{T}: Add {U}.')] })
};
function setup(names, commanders = []) {
  const deck = C.normalizeDeck({ cards: names.map(name => ({ name })), commanders: commanders.map(name => ({ name })), format: commanders.length ? 'commander' : 'constructed' });
  const facts = C.buildFacts(deck, metadata), profile = C.fallbackProfile(deck, metadata, facts);
  return { deck, facts, profile };
}
test('imports quantities, skips sideboards, supports partners and never inherits a commander', () => {
  const d = C.parseList('4 Plains\n4 Mountain\nCommander\n1 White Lead\n1 Red Lead\nSideboard\n4 Value');
  assert.equal(d.cards.reduce((s, c) => s + c.quantity, 0), 8);
  assert.equal(d.commanders.length, 2);
  assert.deepEqual(C.parseList('8 Mountain').commanders, []);
  assert.throws(() => C.parseList('8 Mountain\nbad line'), /line 2/);
  assert.throws(() => C.normalizeDeck({ cards: [{ name: 'Mountain', quantity: -1 }] }), /quantity/);
});
test('commander quantity is removed from the library and explicit printings survive', () => {
  const d = C.parseList('7 Plains\n1 White Lead (SET) 12\nCommander\n1 White Lead (SET) 12');
  assert.equal(d.cards.length, 1);
  assert.equal(d.commanders[0].cn, '12');
});
test('only modal double-faced lands count as opening land options', () => {
  assert.deepEqual(C.rolesFor(metadata.Mountain), ['land']);
  assert.equal(C.rolesFor(metadata.Modal).includes('ramp'), false);
  assert.equal(C.isLand(metadata.Modal), true);
  assert.equal(C.isLand(metadata.Transform), false);
  const { facts } = setup(['Modal', 'Transform', ...Array(5).fill('Plains')]);
  assert.equal(facts.lands, 6); assert.equal(facts.modalLands, 1);
});
test('deck fingerprints ignore ordering and change for quantities, format or commanders', () => {
  const { deck } = setup(['Plains', 'Mountain', 'Rock', 'Value', 'Spark', 'Guard', 'Wastes']);
  assert.equal(cacheKey(deck), cacheKey({ ...deck, cards: [...deck.cards].reverse() }));
  assert.notEqual(cacheKey(deck), cacheKey({ ...deck, commanders: [{ name: 'White Lead', quantity: 1 }] }));
  assert.notEqual(cacheKey(deck), cacheKey({ ...deck, format: 'commander' }));
});
test('AI cannot invent deck cards, forge land roles, duplicate references, or inject invalid scores', () => {
  const { deck, facts, profile } = setup(['Plains', 'Mountain', 'Rock', 'Value', 'Spark', 'Guard', 'Wastes']);
  const ai = { ...profile, cards: [{ name: 'Guard', roles: ['land', 'enabler'], note: '' }] };
  const valid = C.validateProfile(ai, deck, metadata, facts);
  assert.deepEqual(valid.cards.find(c => c.name === 'Guard').roles, ['enabler']);
  assert.equal(valid.cards.length, 7);
  assert.doesNotThrow(() => C.validateProfile(valid, deck, metadata, facts));
  assert.throws(() => C.validateProfile({ ...ai, winRoutes: [{ name: 'Fake', cards: ['Missing Card'], steps: [], conditions: [], confidence: 'high' }] }, deck, metadata, facts), /outside this deck/);
  assert.throws(() => C.validateProfile({ ...ai, cards: [{ name: 'Guard', roles: ['made-up'], note: '' }] }, deck, metadata, facts), /role/);
});
test('strategy weights are validated and commander dependence changes the hand decision', () => {
  const hand = ['Mountain', 'Mountain', 'Spark', 'Value', 'Value', 'Value', 'Value'];
  const { deck, facts, profile } = setup(hand, ['White Lead']);
  assert.throws(() => C.validateProfile({ ...profile, commanderDependency: 2 }, deck, metadata, facts), /commander priorities/);
  assert.throws(() => C.validateProfile({ ...profile, handWeights: { ...profile.handWeights, mana: NaN } }, deck, metadata, facts), /weights/);
  assert.throws(() => C.validateProfile({ ...profile, handWeights: Object.fromEntries(Object.keys(C.HAND_WEIGHTS).map(k => [k, 0])) }, deck, metadata, facts), /weights/);
  const optional = C.validateProfile(profile, deck, metadata, facts);
  const essential = { ...optional, commanderDependency: 1 };
  assert.equal(H.evaluate(hand, deck, metadata, optional).score - H.evaluate(hand, deck, metadata, essential).score, 20);
  const manaOnly = { ...optional, handWeights: Object.fromEntries(Object.keys(C.HAND_WEIGHTS).map(k => [k, Number(k === 'mana')])) };
  const evaluated = H.evaluate(hand, deck, metadata, manaOnly);
  assert.equal(evaluated.score, evaluated.scores.mana);
});
test('mana distinguishes red, white, and required colorless and handles hybrids', () => {
  const unit = colors => ({ colors });
  assert.equal(H.pay('{R}', [unit(['W'])]), null);
  assert.equal(H.pay('{C}', [unit(['W', 'U', 'B', 'R', 'G'])]), null);
  assert.deepEqual(H.pay('{W/R}', [unit(['R'])]), []);
  assert.deepEqual(H.pay('{2/W}', [unit(['C']), unit(['C'])]), []);
  assert.equal(H.pay('{W}{R}', [unit(['W', 'R'])]), null);
});
test('commanders use their own printed costs in white, red, and colorless decks', () => {
  for (const [land, commander] of [['Plains', 'White Lead'], ['Mountain', 'Red Lead'], ['Wastes', 'Colorless Lead']]) {
    const hand = [land, land, land, 'Value', 'Guard', 'Value', 'Value'];
    const { deck, profile } = setup(hand, [commander]);
    const s = H.simulate(hand, deck, metadata, profile);
    assert.equal(s.commandTurns[commander], commander === 'Colorless Lead' ? 3 : 2);
  }
});
test('commanders in the command zone are not counted as assembled route pieces', () => {
  const hand = ['Plains', 'Plains', 'Guard', 'Rock', 'Value', 'Value', 'Value'];
  const { deck, profile } = setup(hand, ['White Lead']);
  profile.winRoutes = [{ name: 'Attack', cards: ['White Lead', 'Guard'], steps: [], conditions: [], confidence: 'medium' }];
  const route = H.evaluate(hand, deck, metadata, profile).routes[0];
  assert.deepEqual(route.have, ['Guard']); assert.deepEqual(route.commandZone, ['White Lead']);
});
test('tapped lands delay spells and fetchlands need an actual remaining target', () => {
  const hand = ['Tapped Red', 'Spark', 'Value', 'Value', 'Value', 'Value', 'Value'];
  let { deck, profile } = setup(hand);
  assert.equal(H.simulate(hand, deck, metadata, profile).earliest.Spark, 2);
  assert.equal(H.landOptions('Fetch', { library: [], field: [] }, metadata, [], false).length, 0);
  assert.equal(H.landOptions('Fetch', { library: ['Mountain'], field: [] }, metadata, [], false)[0].target, 'Mountain');
});
test('tap creatures have summoning sickness and multi-mana artifacts can accelerate immediately', () => {
  let hand = ['Forest', 'Mana Elf', 'Value', 'Guard', 'Guard', 'Guard', 'Guard'];
  let { deck, profile } = setup(hand);
  assert.equal(H.simulate(hand, deck, metadata, profile).earliest.Value, 2);
  hand = ['Wastes', 'Rock', 'Value', 'Guard', 'Guard', 'Guard', 'Guard'];
  ({ deck, profile } = setup(hand));
  const sim = H.simulate(hand, deck, metadata, profile);
  assert.equal(sim.earliest.Value, 1);
  assert.deepEqual(sim.plan[0].spells, ['Rock', 'Value']);
});
test('the selected turn line never reuses the same mana to pay for different spells', () => {
  const hand = ['Plains', 'Guard', 'Guard', 'Guard', 'Guard', 'Guard', 'Guard'];
  const { deck, profile } = setup(hand);
  const sim = H.simulate(hand, deck, metadata, profile);
  assert.equal(sim.plan[0].spells.length, 1);
  assert.equal(sim.plan[1].spells.length, 1);
});
test('a modal card cannot simultaneously be a land and a spell in one line', () => {
  const hand = ['Modal', 'Guard', 'Guard', 'Guard', 'Guard', 'Guard', 'Guard'];
  const { deck, profile } = setup(hand);
  const sim = H.simulate(hand, deck, metadata, profile);
  assert.equal(sim.plan[0].land.name, 'Modal');
  assert.equal(sim.casts.some(c => c.name === 'Modal'), false);
});
test('draw odds are exact for without-replacement draws and depleted libraries', () => {
  assert.equal(H.chanceAtLeast(3, 10, 1), .3);
  assert.ok(Math.abs(H.chanceAtLeast(3, 10, 2) - (1 - 7 / 10 * 6 / 9)) < 1e-12);
  assert.ok(Math.abs(H.chanceAtLeast(3, 10, 2, 2) - 3 / 10 * 2 / 9) < 1e-12);
  assert.equal(H.chanceAtLeast(0, 0, 3), 0);
  assert.equal(H.chanceAtLeast(0, 0, 3, 0), 1);
});
test('failed printing lookup falls back by name, unresolved cards remain explicit', async () => {
  const deck = C.normalizeDeck({ cards: [{ name: 'Test Printed Card', quantity: 7, set: 'nope', cn: '0' }, { name: 'Unresolved Test Card', quantity: 1 }] });
  let calls = 0;
  const mockFetch = async () => ({ ok: true, json: async () => ++calls === 1 ? { data: [] } : { data: [{ name: 'Test Printed Card', cmc: 1, type_line: 'Creature', mana_cost: '{R}', oracle_text: '', id: 'test-id' }] } });
  const result = await resolveCards(deck, mockFetch);
  assert.equal(calls, 2); assert.equal(result['Test Printed Card'].mana, '{R}');
  assert.deepEqual(C.buildFacts(deck, result).missing, ['Unresolved Test Card']);
});
test('adventure collection names match all faces without accepting a different back face', async () => {
  const deck = C.normalizeDeck({ cards: [{ name: 'Marang River Regent // Coil and Catch', quantity: 7 }, { name: 'Marang River Regent // Wrong Back', quantity: 1 }] });
  const mockFetch = async () => ({ ok: true, json: async () => ({ data: [{ name: 'Marang River Regent // Coil and Catch // Marang River Regent', layout: 'adventure', cmc: 6, card_faces: [{ name: 'Marang River Regent', mana_cost: '{4}{U}{U}', type_line: 'Creature — Dragon', oracle_text: 'Flying' }, { name: 'Coil and Catch', mana_cost: '{2}{U}', type_line: 'Instant — Adventure', oracle_text: 'Draw cards.' }] }] }) });
  const resolved = await resolveCards(deck, mockFetch);
  assert.ok(resolved['Marang River Regent // Coil and Catch']);
  assert.equal(resolved['Marang River Regent // Wrong Back'], undefined);
});
