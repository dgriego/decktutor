/* A bounded, deterministic opening-hand search. No card-name rules or AI calls. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./deck-core'));
  else root.HandEngine = factory(root.DeckCore);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Core) {
  'use strict';
  const { COLORS, front, landFace, spellFace, isLand, unique } = Core;
  const TYPES = { Plains: 'W', Island: 'U', Swamp: 'B', Mountain: 'R', Forest: 'G' };
  const COLOR_NAMES = { W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green', C: 'colorless' };
  const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));

  function costOptions(cost) {
    if (typeof cost !== 'string' || !cost) return [];
    let options = [{ generic: 0, pips: [] }];
    for (const [, token] of cost.matchAll(/\{([^}]+)\}/g)) {
      if (/^\d+$/.test(token)) options.forEach(o => o.generic += +token);
      else if (/^[XYZ]$/.test(token)) continue; // Minimum cost only, flagged in the analysis.
      else if (/^[WUBRGC]$/.test(token)) options.forEach(o => o.pips.push([token]));
      else if (/^[WUBRG]\/[WUBRG]$/.test(token)) options.forEach(o => o.pips.push(token.split('/')));
      else if (/^2\/[WUBRG]$/.test(token)) options = options.flatMap(o => [
        { generic: o.generic + 2, pips: o.pips.map(p => [...p]) },
        { generic: o.generic, pips: [...o.pips, [token[2]]] }
      ]);
      else if (/^[WUBRG]\/P$/.test(token)) options.forEach(o => o.pips.push([token[0]])); // Mana payment is the conservative default.
      else return []; // Snow and other special payments require a fuller rules model.
    }
    return options;
  }

  function pay(cost, units, extra = 0) {
    for (const option of costOptions(cost)) {
      const { generic, pips } = option;
      const ordered = [...pips].sort((a, b) => a.length - b.length);
      function search(i, remaining) {
        if (i === ordered.length) {
          if (remaining.length < generic + extra) return null;
          // Spend narrow/colorless sources first to retain flexible mana for later spells.
          return [...remaining].sort((a, b) => a.colors.length - b.colors.length || Number(!a.colors.includes('C')) - Number(!b.colors.includes('C'))).slice(generic + extra);
        }
        const seen = new Set();
        for (let j = 0; j < remaining.length; j++) {
          const key = remaining[j].colors.join('');
          if (seen.has(key) || !ordered[i].some(c => remaining[j].colors.includes(c))) continue;
          seen.add(key);
          const result = search(i + 1, [...remaining.slice(0, j), ...remaining.slice(j + 1)]);
          if (result) return result;
        }
        return null;
      }
      const result = search(0, units);
      if (result) return result;
    }
    return null;
  }

  function manaUnits(face, identity, label) {
    const t = face?.text || '';
    const match = t.match(/(?:^|\n)\{T\}: Add ([^.\n]+)/);
    if (!match || /only|unless|for each|among|that a land|activate only/i.test(match[1] + t.slice(match.index + match[0].length).split('\n')[0])) return [];
    const chunk = match[1];
    let colors = unique([...chunk.matchAll(/\{([WUBRGC])\}/g)].map(m => m[1]));
    if (/one mana of any (?:color|type)/i.test(chunk)) colors = [...COLORS, ...(/any type/i.test(chunk) ? ['C'] : [])];
    if (/one mana of any color in your commander/i.test(chunk)) colors = identity;
    if (!colors.length) return [];
    if (/\bor\b|one mana/i.test(chunk)) return [{ colors, label }];
    // A fixed sequence, such as {C}{C}, produces that many units, not that many choices.
    const symbols = [...chunk.matchAll(/\{([WUBRGC])\}/g)].map(m => m[1]);
    return symbols.length ? symbols.map(c => ({ colors: [c], label })) : [];
  }

  function tapped(face, battlefield, metadata, multiplayer) {
    const t = face?.text || '';
    if (!/enters (?:the battlefield )?tapped|enters[^.\n]*unless|if you don't,[^.\n]*enters[^.\n]*tapped/i.test(t)) return false;
    if (/you may pay (?:2|3) life/i.test(t)) return false;
    if (/unless you (?:have|control) two or more opponents/i.test(t)) return !multiplayer;
    if (/unless you control two or fewer other lands/i.test(t)) return battlefield.filter(c => c.land).length > 2;
    if (/unless you control two or more other lands/i.test(t)) return battlefield.filter(c => c.land).length < 2;
    const check = t.match(/unless you control (?:a|an) ([^.]+)/i);
    if (check) {
      const types = Object.keys(TYPES).filter(type => check[1].includes(type));
      if (types.length) return !battlefield.some(c => c.land && types.some(type => (landFace(metadata[c.target || c.name])?.type || '').includes(type)));
    }
    return true;
  }

  function landOptions(name, state, metadata, identity, multiplayer) {
    const face = landFace(metadata[name]);
    if (!face) return [];
    const t = face.text || '';
    const search = t.match(/search your library for (?:a|an) ([^.]+?) card[^.]*put it onto the battlefield/i);
    // Only model fetches with no mana activation cost and actual remaining targets.
    if (search && /\{T\}[^:\n]*[Ss]acrifice[^:\n]*:/.test(t) && !/\{[0-9WUBRGC]\}[^:\n]*:/.test(t)) {
      const basic = /basic land/i.test(search[1]);
      const types = Object.keys(TYPES).filter(type => search[1].includes(type));
      const results = [];
      for (const target of unique(state.library)) {
        const f = landFace(metadata[target]);
        if (!f || (basic ? !/\bBasic\b/.test(f.type) : !types.some(type => f.type.includes(type)))) continue;
        const forceTapped = /put it onto the battlefield tapped/i.test(t);
        results.push({ target, units: manaUnits(f, identity, name), tapped: forceTapped || tapped(f, state.field, metadata, multiplayer), fetched: true });
      }
      return results.filter((r, i, all) => all.findIndex(x => JSON.stringify([x.units, x.tapped]) === JSON.stringify([r.units, r.tapped])) === i).slice(0, 8);
    }
    let units = manaUnits(face, identity, name);
    if (!units.length && /\bBasic\b/.test(face.type || '')) {
      const color = Object.keys(TYPES).find(type => face.type.includes(type));
      if (color) units = [{ colors: [TYPES[color]], label: name }];
    }
    return [{ units, tapped: tapped(face, state.field, metadata, multiplayer), fetched: false }];
  }

  function simulate(hand, deck, metadata, profile, options = {}) {
    const roles = new Map(profile.cards.map(c => [c.name, c.roles]));
    const identity = unique(deck.commanders.flatMap(c => metadata[c.name]?.identity || []));
    const multiplayer = options.multiplayer ?? /commander|edh/.test(deck.format);
    const library = options.library ? [...options.library] : deck.cards.flatMap(c => Array(c.quantity).fill(c.name));
    if (!options.library) for (const name of hand) { const i = library.indexOf(name); if (i >= 0) library.splice(i, 1); }
    const board = (options.field || []).map((name, i) => {
      const land = isLand(metadata[name]);
      return { name, id: 'b' + i, land, ready: 0, units: manaUnits(land ? landFace(metadata[name]) : front(metadata[name]), identity, name) };
    });
    let beam = [{ hand: hand.map((name, i) => ({ name, id: 'h' + i })), field: board, library,
      commanders: deck.commanders.filter(c => !(options.commandersInPlay || []).includes(c.name)).map((c, i) => ({ ...c, id: 'c' + i })),
      units: [], log: [], score: 0, casts: [], lands: 0 }];
    const earliest = {}, snapshots = [], commandTurns = {};
    const priority = name => {
      const r = roles.get(name) || [];
      return r.includes('ramp') ? 9 : r.some(r => ['engine', 'draw'].includes(r)) ? 7 : r.includes('enabler') ? 6 : r.includes('tutor') ? 5 : r.includes('payoff') ? 4 : 3;
    };
    const rank = s => s.score + s.field.reduce((sum, c) => sum + c.units.length * 4, 0) + s.lands * 5;
    const prune = states => {
      const seen = new Set();
      return states.sort((a, b) => rank(b) - rank(a)).filter(s => {
        const key = JSON.stringify([s.hand.map(c => c.id), s.field.map(c => [c.id, c.target, c.ready]), s.units.map(u => u.colors)]);
        if (seen.has(key)) return false; seen.add(key); return true;
      }).slice(0, 22);
    };
    for (let turn = 1; turn <= 4; turn++) {
      const starts = [];
      for (const state of beam) {
        const base = { ...state, units: state.field.filter(c => c.ready <= turn).flatMap(c => c.units), log: [...state.log, { turn, land: null, spells: [], held: [] }] };
        starts.push(base);
        for (const card of state.hand.filter(c => isLand(metadata[c.name]))) {
          for (const land of landOptions(card.name, state, metadata, identity, multiplayer)) {
            const remaining = [...state.library];
            if (land.fetched) { const i = remaining.indexOf(land.target); if (i < 0) continue; remaining.splice(i, 1); }
            const entry = { ...card, ...land, land: true, ready: turn + Number(land.tapped) };
            starts.push({ ...base, hand: base.hand.filter(c => c.id !== card.id), field: [...base.field, entry], library: remaining,
              lands: state.lands + 1, units: [...base.units, ...(land.tapped ? [] : land.units)],
              log: [...base.log.slice(0, -1), { turn, land: { name: card.name, tapped: land.tapped, target: land.target }, spells: [], held: [] }] });
          }
        }
      }
      let active = prune(starts), completed = [...active];
      for (let depth = 0; depth < 5; depth++) {
        const next = [];
        for (const state of active) {
          snapshots.push({ turn, units: state.units });
          for (const card of [...state.hand, ...state.commanders]) {
            const face = spellFace(metadata[card.name]);
            if (!face?.mana) continue;
            const isCommander = state.commanders.some(c => c.id === card.id);
            const extra = isCommander ? 2 * (options.commanderTax?.[card.name] || 0) : 0;
            const remaining = pay(face.mana, state.units, extra);
            if (!remaining) continue;
            earliest[card.name] = Math.min(earliest[card.name] || 99, turn);
            if (isCommander) commandTurns[card.name] = Math.min(commandTurns[card.name] || 99, turn);
            const r = roles.get(card.name) || [];
            // Hold reactive cards; no opponent targets or interaction windows are assumed.
            if (r.includes('interaction') || r.includes('protection')) continue;
            const permanent = /Creature|Artifact|Enchantment|Planeswalker|Battle/.test(face.type);
            const units = permanent ? manaUnits(face, identity, card.name) : [];
            const delayed = /Creature/.test(face.type) && !/\bHaste\b/i.test(face.text) || tapped(face, state.field, metadata, multiplayer);
            const played = { ...card, land: false, units, ready: turn + Number(delayed) };
            const last = state.log.at(-1);
            next.push({ ...state, hand: state.hand.filter(c => c.id !== card.id), commanders: state.commanders.filter(c => c.id !== card.id),
              field: permanent ? [...state.field, played] : state.field,
              units: [...remaining, ...(!delayed ? units : [])], casts: [...state.casts, { name: card.name, turn }],
              score: state.score + priority(card.name) * (5 - turn) + (isCommander ? 12 * (profile.commanderDependency || 0) : 0),
              log: [...state.log.slice(0, -1), { ...last, spells: [...last.spells, card.name] }] });
          }
        }
        if (!next.length) break;
        active = prune(next); completed.push(...active);
      }
      beam = prune(completed).map(state => {
        const held = state.hand.filter(c => (roles.get(c.name) || []).some(r => ['interaction', 'protection'].includes(r)) && pay(spellFace(metadata[c.name])?.mana, state.units)).map(c => c.name);
        return { ...state, log: [...state.log.slice(0, -1), { ...state.log.at(-1), held }] };
      });
    }
    const best = beam.sort((a, b) => rank(b) - rank(a))[0];
    return { plan: best.log, earliest, commandTurns, snapshots, casts: best.casts,
      missingColors: unique(hand.flatMap(n => [...(spellFace(metadata[n])?.mana || '').matchAll(/\{([WUBRGC])\}/g)].map(m => m[1]))).filter(c => !snapshots.some(s => s.units.some(u => u.colors.includes(c)))) };
  }

  function chanceAtLeast(successes, population, draws, needed = 1) {
    if (needed <= 0) return 1;
    if (population <= 0 || successes < needed || draws < needed) return 0;
    draws = Math.min(draws, population);
    const dp = Array(needed + 1).fill(0); dp[0] = 1;
    for (let d = 0; d < draws; d++) {
      const next = Array(needed + 1).fill(0);
      next[needed] = dp[needed];
      for (let k = 0; k < needed; k++) {
        const hit = clamp((successes - k) / (population - d), 0, 1);
        next[k + 1] += dp[k] * hit;
        next[k] += dp[k] * (1 - hit);
      }
      for (let k = 0; k <= needed; k++) dp[k] = next[k];
    }
    return clamp(dp[needed], 0, 1);
  }

  function evaluate(hand, deck, metadata, profile, options = {}) {
    const sim = simulate(hand, deck, metadata, profile, options);
    const roleMap = new Map(profile.cards.map(c => [c.name, c.roles]));
    const withRole = role => hand.filter(n => roleMap.get(n)?.includes(role));
    const lands = hand.filter(n => isLand(metadata[n]));
    const spells = hand.filter(n => spellFace(metadata[n]));
    const castable = spells.filter(n => sim.earliest[n]);
    const early = castable.filter(n => sim.earliest[n] <= 2);
    const expensive = spells.filter(n => (metadata[n]?.mv || 0) >= 5 && !sim.earliest[n]);
    const active = new Set([...hand, ...(options.field || []), ...(options.commandersInPlay || [])]);
    const routes = profile.winRoutes.map(r => ({ ...r, have: r.cards.filter(n => active.has(n)), missing: r.cards.filter(n => !active.has(n)), commandZone: r.cards.filter(n => deck.commanders.some(c => c.name === n) && !active.has(n)) })).sort((a, b) => b.have.length / b.cards.length - a.have.length / a.cards.length);
    const synergies = profile.synergies.filter(s => s.cards.every(n => active.has(n)));
    const liveRole = role => withRole(role).filter(n => sim.earliest[n] <= 3);
    const development = sim.plan.slice(0, 3).filter(t => t.spells.length || t.held.length).length;
    const min = profile.mulligan.landsMin, max = profile.mulligan.landsMax;
    const scores = {
      mana: clamp((lands.length >= min && lands.length <= max ? 90 : lands.length < min ? 28 * lands.length : 58 - (lands.length - max) * 12) - sim.missingColors.length * 16),
      sequencing: clamp(22 + development * 20 + early.length * 5),
      castability: spells.length ? clamp(castable.length / spells.length * 95 - expensive.length * 5) : 12,
      cardFlow: clamp(28 + unique([...liveRole('draw'), ...liveRole('engine'), ...liveRole('selection'), ...liveRole('tutor')]).length * 20),
      interaction: clamp(35 + liveRole('interaction').length * 22 + liveRole('protection').length * 12),
      synergy: profile.source === 'ai' ? clamp(40 + synergies.length * 15 + (routes[0]?.have.length || 0) * 6) : null,
      resilience: clamp(30 + unique([...liveRole('engine'), ...liveRole('draw'), ...liveRole('recursion')]).length * 15 + liveRole('protection').length * 15)
    };
    const weights = { ...Core.HAND_WEIGHTS, ...profile.handWeights };
    let score = Math.round(Object.entries(weights).reduce((s, [key, weight]) => s + (scores[key] ?? 0) * weight, 0) / Object.entries(weights).reduce((s, [key, weight]) => s + (scores[key] === null ? 0 : weight), 0));
    // The four-turn search cannot establish a turn-five-or-later failure.
    const commanderTarget = profile.idealCommanderTurn || 3;
    const commanderLate = commanderTarget <= 4 && deck.commanders.length > 0 && deck.commanders.every(c => !(options.commandersInPlay || []).includes(c.name) && !(sim.commandTurns[c.name] <= commanderTarget));
    if (commanderLate) score = clamp(score - Math.round(20 * (profile.commanderDependency || 0)));
    if (!lands.length && !early.length && !(options.field || []).length) score = Math.min(18, score);
    const paidMulls = Math.max(0, (options.mulligans || 0) - (options.multiplayer ? 1 : 0));
    const threshold = Math.min(8, paidMulls * 3);
    const verdict = score >= 80 - threshold ? 'Strong keep' : score >= 66 - threshold ? 'Keep' : score >= 52 - threshold ? 'Contextual keep' : score >= 38 - threshold ? 'Lean mulligan' : 'Mulligan';
    const warnings = [
      'Projected turns use only known cards, with no assumed draws. Mana availability does not establish target legality or a winning combo.',
      ...(spells.some(n => /\{[XYZ]\}/.test(spellFace(metadata[n])?.mana || '')) ? ['X spells are checked at X = 0; a useful effect may need more mana.'] : []),
      ...(spells.some(n => /\/P\}|\{S\}|rather than pay|without paying/i.test(Core.text(metadata[n]))) ? ['Alternative costs and snow payments are not credited automatically.'] : []),
      ...(hand.some(n => isLand(metadata[n]) && !landOptions(n, { field: [], library: options.library || [] }, metadata, [], !!options.multiplayer).some(o => o.units.length)) ? ['Some conditional or activated mana sources are not credited in this projection.'] : []),
      ...(hand.some(n => (roleMap.get(n) || []).includes('ramp') && !isLand(metadata[n]) && !manaUnits(front(metadata[n]), Core.COLORS, n).length) ? ['Land-search spells, extra land drops, Treasures, cost reductions, and conditional ramp are not simulated.'] : [])
    ];
    const reasons = [
      `${lands.length} playable land cards${lands.some(n => spellFace(metadata[n])) ? ', including spell/land choices' : ''}; this profile looks for ${min}–${max}.`,
      sim.missingColors.length ? `Missing reliable ${sim.missingColors.map(c => COLOR_NAMES[c]).join(' / ')} mana for cards in this hand.` : 'The projected sources cover the printed colors needed by this hand.',
      early.length ? `${unique(early).join(', ')} can be paid for by turn 2 in a searched line.` : 'No known nonland spell can be paid for by turn 2.',
      expensive.length ? `${unique(expensive).join(', ')} remain out of reach in the four-turn search.` : 'Expensive cards are not the main obstacle in this hand.',
      synergies.length ? `${synergies.length} profile synergies have all their cards in hand or on the battlefield.` : 'No complete profile synergy is currently available.'
    ];
    const next = sim.missingColors.length ? `Find reliable ${sim.missingColors.map(c => COLOR_NAMES[c]).join(' / ')} mana.` : lands.length < min ? 'Find another playable land.' : !liveRole('draw').length && !liveRole('engine').length ? 'Find castable card draw or an engine that supports the deck’s plan.' : routes[0]?.missing.length ? `Work toward ${routes[0].name}: ${routes[0].missing.join(', ')}. Check the route’s prerequisites before committing.` : 'Develop your plan while keeping relevant interaction available.';
    const library = options.library || [];
    const draws = options.multiplayer || options.onDraw ? 3 : 2;
    return { score, verdict, scores, sim, routes, synergies, reasons, next, warnings,
      odds: { population: library.length, landOuts: library.filter(n => isLand(metadata[n])).length,
        nextLand: chanceAtLeast(library.filter(n => isLand(metadata[n])).length, library.length, 1),
        thirdLand: chanceAtLeast(library.filter(n => isLand(metadata[n])).length, library.length, draws, Math.max(0, 3 - lands.length)), draws },
      variance: expensive.length || sim.missingColors.length || lands.length < 2 ? 'High' : 'Moderate' };
  }
  return { costOptions, pay, manaUnits, landOptions, simulate, chanceAtLeast, evaluate, COLOR_NAMES };
});
