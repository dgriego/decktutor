/* Shared, card-name-independent deck facts and profile validation. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DeckCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = 2;
  const HAND_WEIGHTS = { mana: .28, sequencing: .22, castability: .16, cardFlow: .12, interaction: .09, synergy: .07, resilience: .06 };
  const COLORS = ['W', 'U', 'B', 'R', 'G'];
  const ROLES = ['land', 'ramp', 'draw', 'selection', 'tutor', 'interaction', 'protection', 'engine', 'payoff', 'recursion', 'enabler', 'utility'];
  const unique = a => [...new Set(a)];
  const front = c => c?.faces?.[0] || c || {};
  const text = c => c?.faces?.length ? c.faces.map(f => f.text).join('\n') : c?.text || '';
  const landFace = c => /\bLand\b/.test(front(c).type || '') ? front(c) : c?.layout === 'modal_dfc' ? c.faces?.find(f => /\bLand\b/.test(f.type)) : null;
  const isLand = c => !!landFace(c);
  const spellFace = c => /\bLand\b/.test(front(c).type || '') ? null : front(c);
  const safeName = n => typeof n === 'string' && n.trim().length > 0 && n.length <= 180 && !/[\x00-\x1f]/.test(n);

  function normalizeDeck(input) {
    if (!input || !Array.isArray(input.cards) || input.cards.length > 300) throw Error('Provide a decklist with at most 300 entries.');
    function entries(items) {
      const merged = new Map();
      for (let raw of items) {
        if (typeof raw === 'string') raw = { name: raw, quantity: 1 };
        if (!raw || !safeName(raw.name)) throw Error('Every card needs a valid name.');
        const quantity = Number(raw.quantity ?? 1);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 250) throw Error(`Invalid quantity for ${raw.name}.`);
        const name = raw.name.trim();
        const key = name.toLowerCase();
        if (merged.has(key)) merged.get(key).quantity += quantity;
        else merged.set(key, { name, quantity, ...(raw.set && (raw.cn || raw.collector_number) ? {
          set: String(raw.set).slice(0, 10).toLowerCase(), cn: String(raw.cn || raw.collector_number).slice(0, 20)
        } : {}) });
      }
      return [...merged.values()];
    }
    const commanders = entries(input.commanders || (input.commander ? [input.commander] : []));
    if (commanders.length > 2 || commanders.some(c => c.quantity !== 1)) throw Error('Use zero, one, or two commanders, one copy each.');
    const cards = entries(input.cards);
    // Explicit commander entries belong in the command zone, never the draw pile.
    for (const cmd of commanders) {
      const entry = cards.find(c => c.name.toLowerCase() === cmd.name.toLowerCase());
      if (entry) entry.quantity -= 1;
    }
    const main = cards.filter(c => c.quantity > 0);
    const count = main.reduce((sum, c) => sum + c.quantity, 0);
    if (count < 7 || count > 250) throw Error('The library must contain between 7 and 250 cards.');
    const format = String(input.format || (commanders.length ? 'commander' : 'constructed')).toLowerCase().slice(0, 40);
    return { name: String(input.name || (commanders.length ? commanders.map(c => c.name).join(' + ') : 'Imported deck')).slice(0, 160), format, cards: main, commanders };
  }

  function parseList(input, options = {}) {
    if (typeof input !== 'string' || input.length > 50000) throw Error('Paste a decklist of up to 50,000 characters.');
    let section = 'cards';
    const out = { cards: [], commanders: [], ...options };
    const invalid = [];
    for (const [index, raw] of input.split(/\r?\n/).entries()) {
      let line = raw.trim();
      if (!line || line.startsWith('#') || line.startsWith('//')) continue;
      if (/^(commander|commanders)\s*:?$/i.test(line)) { section = 'commanders'; continue; }
      if (/^(sideboard|maybeboard|considering|companion)\s*:?$/i.test(line)) { section = 'skip'; continue; }
      if (/^(mainboard|main deck|deck)\s*:?$/i.test(line)) { section = 'cards'; continue; }
      if (section === 'skip' || /^SB:/i.test(line)) continue;
      const inlineCommander = /^commander\s*:\s*/i.test(line) || /\s+\*CMDR\*$/i.test(line);
      line = line.replace(/^commander\s*:\s*/i, '').replace(/\s+\*CMDR\*$/i, '');
      const m = line.match(/^(\d+)x?\s+(.+?)(?:\s+\(([A-Za-z0-9]+)\)\s+([\w★-]+))?(?:\s+\*[^*]+\*)?$/);
      if (!m) { invalid.push(index + 1); continue; }
      out[inlineCommander ? 'commanders' : section].push({ quantity: +m[1], name: m[2].trim(), set: m[3], cn: m[4] });
    }
    if (invalid.length) throw Error(`Could not read line${invalid.length > 1 ? 's' : ''} ${invalid.slice(0, 6).join(', ')}. Use “1 Card Name”.`);
    if (options.commanderNames) out.commanders = options.commanderNames.split('\n').map(n => n.trim()).filter(Boolean).map(name => ({ name, quantity: 1 }));
    return normalizeDeck(out);
  }

  function compact(c, name) {
    const face = f => ({ name: f.name, mana: f.mana_cost || '', type: f.type_line || '', text: f.oracle_text || '', image: f.image_uris?.normal || null });
    const faces = (c.card_faces || []).map(face);
    return { ...face(c), name, canonical: c.name, oracleId: c.oracle_id || c.id, layout: c.layout, mv: c.cmc ?? 0,
      colors: c.colors || [], identity: c.color_identity || [], produced: c.produced_mana || [], keywords: c.keywords || [],
      set: c.set || '', cn: c.collector_number || '', setName: c.set_name || '',
      image: c.image_uris?.normal || faces[0]?.image || null, faces };
  }

  function rolesFor(c) {
    if (!c) return ['utility'];
    const t = text(c), roles = [];
    if (isLand(c)) roles.push('land');
    const spellText = spellFace(c)?.text || '';
    if (spellFace(c) && (/\badd\b[^.\n]*(?:mana|\{[WUBRGC]\})/i.test(spellText) || /search your library[^.]*land[^.]*battlefield|additional land|create[^.]*Treasure token/i.test(spellText))) roles.push('ramp');
    if (/\bdraw\b[^.\n]*\bcards?\b/i.test(t)) roles.push('draw');
    if (/scry|surveil|look at the top|top[^.]*put[^.]*hand/i.test(t)) roles.push('selection');
    if (/search your library/i.test(t) && !isLand(c) && !/search your library[^.]*land card/i.test(t)) roles.push('tutor');
    if (/counter target|destroy (?:target|all|each)|exile (?:target|all|each)|deals?[^.]*damage to (?:any|target)|return target[^.]*to (?:its|their) owner/i.test(t)) roles.push('interaction');
    if (/hexproof|indestructible|protection from|phase out/i.test(t)) roles.push('protection');
    if (/from your graveyard|in your graveyard[^.]*battlefield/i.test(t)) roles.push('recursion');
    if (/whenever|at the beginning of/i.test(t) && roles.some(r => ['draw', 'selection', 'recursion'].includes(r))) roles.push('engine');
    if (/you win the game|each opponent loses|each opponent takes|creatures you control get|double the number of/i.test(t)) roles.push('payoff');
    return roles.length ? unique(roles) : ['utility'];
  }

  function buildFacts(deck, metadata) {
    const counts = Object.fromEntries(ROLES.map(r => [r, 0]));
    const curve = [0, 0, 0, 0, 0, 0, 0];
    const missing = [], cardRoles = {}, identities = [];
    let lands = 0, modalLands = 0, totalMV = 0, spellCount = 0;
    for (const entry of [...deck.cards, ...deck.commanders]) {
      const c = metadata[entry.name];
      cardRoles[entry.name] = rolesFor(c);
      if (!c) missing.push(entry.name);
      identities.push(...(c?.identity || []));
    }
    for (const entry of deck.cards) {
      const c = metadata[entry.name];
      for (const role of cardRoles[entry.name]) counts[role] += entry.quantity;
      if (!c) continue;
      if (isLand(c)) { lands += entry.quantity; if (spellFace(c)) modalLands += entry.quantity; }
      if (spellFace(c)) {
        spellCount += entry.quantity;
        totalMV += (c.mv || 0) * entry.quantity;
        curve[Math.min(6, Math.floor(c.mv || 0))] += entry.quantity;
      }
    }
    const commandColors = unique(deck.commanders.flatMap(c => metadata[c.name]?.identity || []));
    return { total: deck.cards.reduce((s, c) => s + c.quantity, 0), lands, modalLands, spellCount,
      averageMV: spellCount ? +(totalMV / spellCount).toFixed(2) : 0, curve, counts, cardRoles, missing,
      colors: COLORS.filter(c => identities.includes(c)), commanderColors: COLORS.filter(c => commandColors.includes(c)),
      expectedTotal: /commander|edh/.test(deck.format) ? 100 - deck.commanders.length : null };
  }

  function fallbackProfile(deck, metadata, facts, reason) {
    return { version: VERSION, source: 'rules', archetype: 'Card-data analysis',
      summary: 'Hand coaching uses the imported cards’ mana costs and rules text. AI strategy analysis is not available yet.',
      commanderRole: deck.commanders.length ? 'Commanders are evaluated using their printed mana costs.' : 'This deck has no command zone.',
      commanderDependency: 0, idealCommanderTurn: 3, handWeights: { ...HAND_WEIGHTS },
      tempo: 'balanced', priorities: ['Develop usable mana', 'Find castable action and card flow'],
      cards: [...deck.cards, ...deck.commanders].map(c => ({ name: c.name, roles: facts.cardRoles[c.name], note: '' })),
      synergies: [], winRoutes: [], mulligan: { landsMin: 2, landsMax: 4, priorities: ['Mana access', 'Early plays', 'Card flow'] },
      limitations: [reason || 'Strategy and win routes have not been analyzed by AI.'] };
  }

  function validateProfile(raw, deck, metadata, facts) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Invalid deck profile.');
    const names = new Set([...deck.cards, ...deck.commanders].map(c => c.name));
    const string = (s, max = 900) => { if (typeof s !== 'string' || !s.trim() || s.length > max) throw Error('Invalid profile text.'); return s.trim(); };
    const array = (a, max) => { if (!Array.isArray(a) || a.length > max) throw Error('Invalid profile list.'); return a; };
    const refs = (a, min = 1) => { array(a, 8); if (a.length < min || unique(a).length !== a.length || a.some(n => !names.has(n))) throw Error('Profile references a card outside this deck.'); return a; };
    const cards = array(raw.cards, 302).map(c => {
      refs([c.name]);
      const roles = array(c.roles, ROLES.length);
      if (!roles.length || roles.some(r => !ROLES.includes(r))) throw Error('Invalid card role.');
      // AI can add strategic roles, but it cannot change whether a card is playable as a land.
      if (typeof c.note !== 'string' || c.note.length > 500) throw Error('Invalid card note.');
      return { name: c.name, roles: unique([...roles.filter(r => r !== 'land'), ...(isLand(metadata[c.name]) ? ['land'] : [])]), note: c.note.trim() };
    });
    if (unique(cards.map(c => c.name)).length !== cards.length) throw Error('Duplicate profile cards.');
    for (const name of names) if (!cards.some(c => c.name === name)) cards.push({ name, roles: facts.cardRoles[name], note: '' });
    const mulligan = raw.mulligan;
    if (!mulligan || !Number.isInteger(mulligan.landsMin) || !Number.isInteger(mulligan.landsMax) || mulligan.landsMin < 1 || mulligan.landsMax > 5 || mulligan.landsMin > mulligan.landsMax) throw Error('Invalid mulligan targets.');
    if (!['fast', 'balanced', 'slow'].includes(raw.tempo)) throw Error('Invalid deck tempo.');
    const unit = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1;
    if (!unit(raw.commanderDependency) || !Number.isInteger(raw.idealCommanderTurn) || raw.idealCommanderTurn < 1 || raw.idealCommanderTurn > 8) throw Error('Invalid commander priorities.');
    if (!raw.handWeights || Object.keys(HAND_WEIGHTS).some(k => !unit(raw.handWeights[k])) || Object.keys(HAND_WEIGHTS).reduce((s, k) => s + raw.handWeights[k], 0) <= 0) throw Error('Invalid hand weights.');
    const totalWeight = Object.keys(HAND_WEIGHTS).reduce((s, k) => s + raw.handWeights[k], 0);
    const handWeights = Object.fromEntries(Object.keys(HAND_WEIGHTS).map(k => [k, raw.handWeights[k] / totalWeight]));
    return { version: VERSION, source: 'ai', archetype: string(raw.archetype, 120), summary: string(raw.summary),
      commanderDependency: deck.commanders.length ? raw.commanderDependency : 0, idealCommanderTurn: raw.idealCommanderTurn, handWeights,
      commanderRole: string(raw.commanderRole), tempo: raw.tempo,
      priorities: array(raw.priorities, 6).map(s => string(s, 300)), cards,
      synergies: array(raw.synergies, 16).map(s => ({ cards: refs(s.cards, 2), explanation: string(s.explanation) })),
      winRoutes: array(raw.winRoutes, 6).map(r => {
        if (!['low', 'medium', 'high'].includes(r.confidence)) throw Error('Invalid route confidence.');
        return { name: string(r.name, 120), cards: refs(r.cards), steps: array(r.steps, 8).map(s => string(s, 600)),
          conditions: array(r.conditions, 8).map(s => string(s, 500)), confidence: r.confidence };
      }),
      mulligan: { landsMin: mulligan.landsMin, landsMax: mulligan.landsMax, priorities: array(mulligan.priorities, 6).map(s => string(s, 300)) },
      limitations: array(raw.limitations, 8).map(s => string(s, 500)) };
  }

  return { VERSION, HAND_WEIGHTS, COLORS, ROLES, unique, front, text, landFace, isLand, spellFace, normalizeDeck, parseList, compact, rolesFor, buildFacts, fallbackProfile, validateProfile };
});
