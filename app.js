'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STORAGE = 'mtgline.active.v1';
let loaded = null, generation = 0, aiController = null, importing = false, analyzing = false, contextTimer, evaluationCache;
let st = { lib: [], hand: [], field: [], grave: [], commanders: [], casts: {}, m: 0, reveal: false, choice: '', bottom: 0 };
const multiplayer = () => $('gameMode').value === 'multiplayer';
const metadata = name => loaded?.metadata[name];
const cardProfile = name => loaded?.profile.cards.find(c => c.name === name);
const role = name => {
  const roles = cardProfile(name)?.roles || [];
  return DeckCore.isLand(metadata(name)) ? 'land' : ['tutor', 'interaction', 'ramp', 'engine', 'payoff', 'draw'].find(r => roles.includes(r)) || 'utility';
};
const hint = name => cardProfile(name)?.note || `Roles: ${(cardProfile(name)?.roles || ['utility']).join(', ')}. Read the Oracle text for costs and conditions.`;
function shuffle(cards) {
  const copy = [...cards];
  for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
}
function save() {
  try { localStorage.setItem(STORAGE, JSON.stringify({ ...loaded, savedAt: Date.now() })); }
  catch { $('saveStatus').textContent = 'This browser could not save the deck. It remains available for this session.'; }
}
function fresh(reset = true) {
  if (!loaded) return;
  const m = reset ? 0 : st.m;
  st = { lib: shuffle(loaded.deck.cards.flatMap(c => Array(c.quantity).fill(c.name))), hand: [], field: [], grave: [], commanders: [], casts: {}, m, reveal: false, choice: '', bottom: 0 };
  st.hand = st.lib.splice(0, 7);
  clearContext(); render();
}
function currentAnalysis() {
  if (!loaded) return null;
  const key = JSON.stringify([st, loaded.profile, $('gameMode').value]);
  if (evaluationCache?.key === key) return evaluationCache.value;
  const value = HandEngine.evaluate(st.hand, loaded.deck, loaded.metadata, loaded.profile, {
    library: st.lib, field: st.field, commandersInPlay: st.commanders, commanderTax: st.casts,
    mulligans: st.m, multiplayer: multiplayer(), onDraw: $('gameMode').value === 'draw'
  });
  evaluationCache = { key, value };
  return value;
}
function action(text, fn) {
  const button = document.createElement('button'); button.className = 'btn'; button.textContent = text;
  button.onclick = () => { fn(); $('cardModal').close(); }; return button;
}
function cardEl(name, zoneName, index) {
  const c = metadata(name), button = document.createElement('button');
  button.className = `card ${role(name)}`; button.dataset.card = name; button.dataset.zone = zoneName; button.dataset.index = index;
  button.setAttribute('aria-label', `${name}, ${zoneName}. Inspect card`);
  button.innerHTML = c?.image ? `<img src="${esc(c.image)}" alt="${esc(name)}" loading="lazy"><span class="badge">${esc(role(name))}</span>` : `<div class="fallback"><b>${esc(name)}</b><span>${c ? esc(role(name)) : 'Card data missing'}</span></div>`;
  button.onclick = () => openCard(name, zoneName, index);
  button.onmouseenter = button.onfocus = () => showCardContext(name);
  button.onmouseleave = button.onblur = () => { contextTimer = setTimeout(clearContext, 200); };
  if (zoneName !== 'cmd') {
    button.draggable = true;
    button.ondragstart = e => { e.dataTransfer.setData('text/plain', JSON.stringify({ zone: zoneName, index, name })); e.dataTransfer.effectAllowed = 'move'; button.classList.add('dragging'); };
    button.ondragend = () => button.classList.remove('dragging');
  }
  return button;
}
function zone(id, cards, zoneName) {
  const root = $(id); root.replaceChildren();
  if (!cards.length) { const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = loaded ? 'No cards here yet.' : 'Import a deck to begin.'; root.append(empty); }
  cards.forEach((name, index) => root.append(cardEl(name, zoneName, index)));
}
function move(index, from, to, name) {
  if (!['hand', 'field', 'grave'].includes(from) || !['hand', 'field', 'grave'].includes(to) || from === to || st.bottom) return;
  if (!Number.isInteger(index) || index < 0 || index >= st[from].length || name && st[from][index] !== name) return;
  st[to].push(st[from].splice(index, 1)[0]); st.reveal = true; clearContext(); render();
}
function bottomCard(index) {
  if (!st.bottom || index < 0 || index >= st.hand.length) return;
  st.lib.push(st.hand.splice(index, 1)[0]); st.bottom--; clearContext(); render();
}
function toggleCommander(name) {
  if (st.bottom) return;
  if (st.commanders.includes(name)) st.commanders = st.commanders.filter(n => n !== name);
  else { st.commanders.push(name); st.casts[name] = (st.casts[name] || 0) + 1; }
  st.reveal = true; render();
}
function openCard(name, zoneName, index) {
  const c = metadata(name); $('cardName').textContent = name; $('role').textContent = (cardProfile(name)?.roles || []).join(' · ');
  $('bigImage').innerHTML = c?.image ? `<img src="${esc(c.image)}" alt="${esc(name)}">` : '<div class="placeholder">Card data missing</div>';
  $('facts').innerHTML = [c?.mana, c?.type, c?.setName ? `${c.setName} · ${c.set.toUpperCase()} ${c.cn}` : null].filter(Boolean).map(f => `<span class="chip">${esc(f)}</span>`).join('');
  $('oracle').textContent = c?.faces?.length ? c.faces.map(f => `${f.name} ${f.mana}\n${f.type}\n${f.text}`).join('\n\n') : c?.text || 'Card data could not be resolved.';
  $('note').textContent = hint(name);
  const actions = $('cardActions'); actions.replaceChildren();
  if (zoneName === 'hand' && st.bottom) actions.append(action('Put on bottom', () => bottomCard(index)));
  else if (zoneName === 'hand') actions.append(action('Play / cast', () => move(index, 'hand', 'field', name)), action('Discard', () => move(index, 'hand', 'grave', name)));
  else if (zoneName === 'field') actions.append(action('Return to hand', () => move(index, 'field', 'hand', name)), action('To graveyard', () => move(index, 'field', 'grave', name)));
  else if (zoneName === 'grave') actions.append(action('Return to hand', () => move(index, 'grave', 'hand', name)), action('Move to battlefield', () => move(index, 'grave', 'field', name)));
  else if (zoneName === 'cmd') actions.append(action(st.commanders.includes(name) ? 'Return to command zone' : 'Move to battlefield', () => toggleCommander(name)));
  $('cardModal').showModal();
}
function clearContext() { clearTimeout(contextTimer); $('contextCoach').classList.add('hidden'); $('defaultCoach').classList.remove('hidden'); }
function showCardContext(name) {
  if (!loaded) return;
  clearTimeout(contextTimer); $('contextCoach').classList.remove('hidden'); $('defaultCoach').classList.add('hidden');
  $('contextName').textContent = name; $('contextRole').textContent = role(name);
  $('contextFacts').textContent = [metadata(name)?.mana, metadata(name)?.type].filter(Boolean).join(' · ');
  $('contextOracle').textContent = DeckCore.text(metadata(name)); $('contextNote').textContent = hint(name);
  const active = new Set([...st.hand, ...st.field, ...st.commanders]);
  const synergies = loaded.profile.synergies.filter(s => s.cards.includes(name));
  $('contextSections').innerHTML = synergies.length ? synergies.map(s => `<section class="context-item ${s.cards.every(n => active.has(n)) ? 'hot' : ''}"><strong>${s.cards.filter(n => n !== name).map(esc).join(' + ')}</strong><p>${esc(s.explanation)}</p><p>${s.cards.every(n => active.has(n)) ? 'Cards available in hand / battlefield' : 'Missing: ' + s.cards.filter(n => !active.has(n)).map(esc).join(', ')}</p></section>`).join('') : '<p class="muted">No specific synergy was identified in this deck profile.</p>';
}
function renderProfileStatus() {
  if (!loaded) { $('metaStatus').textContent = 'No deck loaded'; $('profileCard').classList.add('hidden'); return; }
  const { facts, ai, profile } = loaded;
  $('profileCard').classList.remove('hidden');
  $('profileName').textContent = analyzing ? 'Analyzing your deck' : profile.archetype;
  $('profileSummary').textContent = analyzing ? 'Resolving card data and reading your deck’s strategy, synergies, and mulligan priorities. Results will appear here automatically.' : facts.missing.length ? 'Deck and hand analysis are waiting for the unresolved card data listed below.' : profile.summary;
  $('profileFacts').textContent = `${facts.total} library cards · ${facts.lands} land options · ${facts.averageMV} average spell value`;
  $('metaStatus').textContent = importing ? 'Importing deck…' : analyzing ? 'Analyzing strategy…' : facts.missing.length ? `${facts.missing.length} unresolved cards` : ai.status === 'ready' ? 'AI profile ready' : 'Card data ready';
  $('profileState').textContent = analyzing ? 'AI is reading this deck’s strategy and interactions…' : ai.status === 'ready' ? `AI analysis · ${new Date(ai.analyzedAt).toLocaleDateString()}` : ai.message;
  $('retryAnalysis').classList.toggle('hidden', ai.status === 'ready');
  $('retryAnalysis').textContent = analyzing ? 'Analyzing…' : facts.missing.length ? 'Retry card lookup and analysis' : 'Retry AI analysis';
  $('retryAnalysis').disabled = analyzing || importing;
  $('deckWarnings').textContent = [facts.missing.length ? `Unresolved cards: ${facts.missing.join(', ')}.` : '', facts.expectedTotal !== null && facts.total !== facts.expectedTotal ? `This ${loaded.deck.format} list has ${facts.total + loaded.deck.commanders.length} total cards; expected 100. Coaching uses the cards actually imported.` : ''].filter(Boolean).join(' ');
}
function routesHtml(routes) {
  if (!routes.length) return '<p class="muted">No candidate win routes are available for this profile.</p>';
  return routes.map(r => `<article class="route"><div class="routehead"><strong>${esc(r.name)}</strong><span class="prog">${esc(r.confidence)} confidence</span></div><p class="muted">AI candidate route. Card availability does not verify execution.</p><div class="pieces">${r.cards.map(n => `<span class="piece ${r.have?.includes(n) ? 'have' : ''}">${esc(n)}${r.commandZone?.includes(n) ? ' (command zone)' : ''}</span>`).join('')}</div>${r.steps?.length ? `<ol>${r.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}${r.conditions?.length ? `<p><b>Requires:</b> ${r.conditions.map(esc).join(' ')}</p>` : ''}</article>`).join('');
}
function renderCoach() {
  const ready = !!loaded && !loaded.facts.missing.length;
  let state = $('handAnalysisState');
  if (!state) { state = document.createElement('p'); state.id = 'handAnalysisState'; state.className = 'muted'; state.setAttribute('role', 'status'); $('defaultCoach').insertBefore(state, $('quiz')); }
  state.textContent = !loaded ? '' : !ready ? analyzing ? 'Repairing missing card data and analyzing deck strategy. Hand coaching will become available automatically.' : `Hand analysis is waiting for card data: ${loaded.facts.missing.join(', ')}. Use Retry card lookup and analysis above.` : analyzing ? 'AI deck strategy is loading. You can reveal card-based hand coaching now; it updates when strategy is ready.' : loaded.ai.status === 'ready' ? 'Hand coaching uses your AI deck strategy, card rules, and the current hand.' : 'Card-based hand coaching is available. Retry AI analysis to add deck-specific strategy.';
  $('quiz').classList.toggle('hidden', st.reveal && ready || !loaded);
  $('analysis').classList.toggle('hidden', !st.reveal || !ready);
  $('emptyCoach').classList.toggle('hidden', !!loaded);
  $('reveal').disabled = !ready;
  document.querySelectorAll('[data-d]').forEach(b => b.disabled = !ready || !!st.bottom);
  if (!st.reveal || !ready) return;
  const a = currentAnalysis();
  $('score').textContent = a.score; $('verdict').textContent = a.verdict;
  $('summary').textContent = `${st.choice ? `You chose ${st.choice}. ` : ''}${st.field.length || st.commanders.length ? 'Projection from the current board, assuming mana sources untap. ' : ''}${loaded.profile.priorities[0] || 'Develop usable mana and castable action'}. The score is a coaching estimate, not a win probability.`;
  $('turnPlan').innerHTML = a.sim.plan.map(t => `<div class="turn-step"><strong>Turn ${t.turn}</strong><p>${t.land ? `Play ${esc(t.land.name)}${t.land.target ? `, fetching ${esc(t.land.target)}` : ''}${t.land.tapped ? ' tapped' : ''}. ` : 'No known land play. '}${t.spells.length ? t.spells.map(esc).join(' → ') + '.' : 'No development spell in this line.'}${t.held.length ? `<br>Can hold up ${t.held.map(esc).join(' or ')}.` : ''}</p></div>`).join('') + '<p class="muted">One searched line using only known cards. No future draws are assumed; spells still need legal targets and timing.</p>';
  const labels = { mana: 'Mana and colors', sequencing: 'Early sequencing', castability: 'Castability', cardFlow: 'Card flow and tutors', interaction: 'Interaction', synergy: 'Deck synergy', resilience: 'Resilience' };
  $('scorecard').innerHTML = Object.entries(a.scores).map(([key, value]) => `<div class="factor-row"><span>${labels[key]}</span><strong>${value ?? 'Unanalyzed'}</strong>${value !== null ? `<meter min="0" max="100" value="${value}" aria-label="${labels[key]}">${value}</meter>` : ''}</div>`).join('');
  $('signals').innerHTML = a.reasons.map(r => `<div class="signal">${esc(r)}</div>`).join('') + Object.entries(a.sim.commandTurns).map(([name, turn]) => `<div class="signal">${esc(name)} can be paid for by turn ${turn} in a searched line.</div>`).join('');
  $('riskOdds').innerHTML = `<p>${a.odds.landOuts} land options among ${a.odds.population} remaining cards.</p><p><b>${Math.round(a.odds.nextLand * 100)}%</b> chance the next draw is a land option.</p><p><b>${Math.round(a.odds.thirdLand * 100)}%</b> chance to have drawn enough land options for three total by turn 3 (${a.odds.draws} draws).</p><p>Variance: ${esc(a.variance)}. Draw odds count land options, including modal lands; they do not guarantee usable colors.</p><details><summary>Projection assumptions</summary><ul>${a.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></details>`;
  $('routes').innerHTML = routesHtml(a.routes.slice(0, 2)); $('next').textContent = a.next;
}
function render() {
  document.title = loaded ? `MTGLine · ${loaded.deck.name}` : 'MTGLine';
  $('deckContext').textContent = loaded?.deck.name || 'Import a deck to begin';
  for (const id of ['lib', 'libLarge']) $(id).textContent = st.lib.length;
  for (const id of ['graveCount', 'graveRailCount']) $(id).textContent = st.grave.length;
  $('mulls').textContent = st.m;
  $('gameStatus').textContent = st.bottom ? `Choose ${st.bottom} card${st.bottom > 1 ? 's' : ''} to put on the bottom` : st.field.length || st.commanders.length ? 'Live playtest' : 'Opening hand practice';
  $('bottomNotice').textContent = st.bottom ? `London mulligan: choose ${st.bottom} card${st.bottom > 1 ? 's' : ''} to put on the bottom. Click a card to choose it.` : '';
  $('keepHandBtn').classList.toggle('hidden', !loaded || !st.m || st.choice === 'keep');
  for (const id of ['newBtn', 'mullBtn', 'drawBtn', 'routesBtn']) $(id).disabled = !loaded || importing || (id === 'drawBtn' && (!st.lib.length || !!st.bottom));
  $('gameMode').disabled = !!st.m || st.field.length > 0;
  zone('hand', st.hand, 'hand'); zone('field', st.field, 'field'); zone('grave', st.grave, 'grave');
  const root = $('cmdCard'); root.replaceChildren();
  if (!loaded?.deck.commanders.length) { root.className = 'empty'; root.textContent = 'No commander'; }
  else {
    root.className = 'commander-list';
    for (const [i, cmd] of loaded.deck.commanders.entries()) {
      const wrap = document.createElement('div'); wrap.className = st.commanders.includes(cmd.name) ? 'commander-active' : '';
      wrap.append(cardEl(cmd.name, 'cmd', i));
      const toggle = action(st.commanders.includes(cmd.name) ? 'Return to command zone' : 'Move to battlefield', () => toggleCommander(cmd.name));
      toggle.disabled = !!st.bottom; wrap.append(toggle); root.append(wrap);
    }
  }
  renderProfileStatus(); renderCoach();
}

async function requestDeck(deck, analyze, signal) {
  const response = await fetch('/api/analyze-deck', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deck, analyze }), signal });
  const result = await response.json().catch(() => ({ error: 'The analysis server could not be reached. Try again.' }));
  if (!response.ok) throw Error(result.error || 'Deck analysis failed.');
  return result;
}
async function runAI(id = generation) {
  if (!loaded || analyzing) return;
  const input = loaded.deck, fingerprint = loaded.fingerprint;
  aiController = new AbortController(); analyzing = true; renderProfileStatus(); renderCoach();
  if ($('routesModal').open) renderDeckAnalysis();
  try {
    const result = await requestDeck(input, true, AbortSignal.any([aiController.signal, AbortSignal.timeout(145000)]));
    if (id !== generation || loaded.fingerprint !== fingerprint) return;
    loaded = result; save();
  } catch (e) {
    if (id !== generation) return;
    loaded.ai = { status: 'unavailable', message: e.name === 'TimeoutError' ? 'AI analysis took too long. Retry when ready.' : 'AI analysis could not finish. Retry when ready.' };
  } finally { if (id === generation) { analyzing = false; evaluationCache = null; clearContext(); render(); if ($('routesModal').open) renderDeckAnalysis(); } }
}
async function importDeck(input) {
  const id = ++generation; aiController?.abort(); analyzing = false; importing = true; setImportBusy(true);
  try {
    const result = await requestDeck(input, false, AbortSignal.timeout(65000));
    if (id !== generation) return;
    loaded = result; $('gameMode').value = /commander|edh/.test(result.deck.format) ? 'multiplayer' : 'play';
    $('saveStatus').textContent = 'Imported deck saved in this browser.'; save(); fresh();
    $('importModal').close();
  } finally { if (id === generation) { importing = false; setImportBusy(false); render(); } }
  if (id === generation && loaded?.ai.status === 'pending') void runAI(id);
}
function setImportBusy(busy) {
  for (const id of ['moxBtn', 'pasteBtn']) $(id).disabled = busy;
  $('importMsg').textContent = busy ? 'Resolving card names, printings, and rules text…' : '';
  $('importMsg').className = 'importmsg';
}
function importError(e) { $('importMsg').textContent = e.message; $('importMsg').className = 'importmsg err'; }
$('moxBtn').onclick = async () => {
  const url = $('moxUrl').value.trim(); if (!url) return;
  setImportBusy(true);
  try {
    const response = await fetch(`/api/moxfield?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(28000) });
    const data = await response.json();
    if (!response.ok) throw Error(`${data.error || 'Moxfield import failed'}. Paste the exported decklist below.`);
    await importDeck(data);
  } catch (e) { setImportBusy(false); importError(e); }
};
$('pasteBtn').onclick = async () => {
  try {
    const options = { format: $('deckFormat').value };
    if ($('deckNameInput').value.trim()) options.name = $('deckNameInput').value.trim();
    if ($('commanderInput').value.trim()) options.commanderNames = $('commanderInput').value;
    const deck = DeckCore.parseList($('deckText').value, options);
    if (deck.format === 'commander' && !deck.commanders.length) throw Error('Add a commander using the commander field or a Commander section in the list.');
    await importDeck(deck);
  } catch (e) { importError(e); }
};
$('importBtn').onclick = $('emptyImport').onclick = () => $('importModal').showModal();
$('newBtn').onclick = () => fresh();
$('mullBtn').onclick = () => { if (st.m < 7 + Number(multiplayer())) { st.m++; fresh(false); } };
$('keepHandBtn').onclick = () => { st.choice = 'keep'; st.reveal = true; st.bottom = Math.min(st.hand.length, Math.max(0, st.m - Number(multiplayer()))); render(); };
$('drawBtn').onclick = () => { if (!st.bottom && st.lib.length) { st.hand.push(st.lib.shift()); st.reveal = true; render(); } };
$('reveal').onclick = () => { st.reveal = true; renderCoach(); };
document.querySelectorAll('[data-d]').forEach(button => button.onclick = () => {
  st.choice = button.dataset.d; st.reveal = true;
  if (st.choice === 'keep') st.bottom = Math.min(st.hand.length, Math.max(0, st.m - Number(multiplayer())));
  render();
});
$('gameMode').onchange = () => { evaluationCache = null; renderCoach(); };
$('retryAnalysis').onclick = () => void runAI();
function renderDeckAnalysis() {
  if (!loaded) return;
  const { profile, facts } = loaded;
  if (loaded.ai.status !== 'ready') {
    $('routeLibrary').innerHTML = `<p role="status">${esc(analyzing ? 'Resolving cards and analyzing deck strategy… This view updates automatically.' : loaded.ai.message)}</p><h3>Deck composition</h3><p>${facts.total} library cards · ${facts.lands} known land options</p>${!analyzing && facts.missing.length ? `<p>Unresolved: ${facts.missing.map(esc).join(', ')}</p>` : ''}`;
    const retry = document.createElement('button'); retry.className = 'btn'; retry.textContent = analyzing ? 'Analyzing…' : 'Retry card lookup and AI analysis'; retry.disabled = analyzing || importing; retry.onclick = () => void runAI(); $('routeLibrary').append(retry);
    return;
  }
  $('routeLibrary').innerHTML = `<h3>${esc(profile.archetype)}</h3><p>${esc(profile.summary)}</p><p>${esc(profile.commanderRole)}</p><h3>Opening priorities</h3><ul>${profile.priorities.map(p => `<li>${esc(p)}</li>`).join('')}</ul><h3>Deck composition</h3><p>${facts.total} library cards · ${facts.lands} land options (${facts.modalLands} modal) · ${facts.averageMV} average spell value</p><div class="deck-counts">${Object.entries(facts.counts).filter(([, n]) => n).map(([role, n]) => `<span>${esc(role)} <b>${n}</b></span>`).join('')}</div><p class="muted">Roles inferred from card text can overlap. Spell/land cards count in both relevant categories.</p><h3>Candidate win routes</h3>${routesHtml(currentAnalysis().routes)}<h3>Mulligan priorities</h3><ul>${profile.mulligan.priorities.map(p => `<li>${esc(p)}</li>`).join('')}</ul>${profile.limitations.length ? `<h3>Analysis limitations</h3><ul>${profile.limitations.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}`;
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  status.textContent = analyzing ? 'Analyzing deck strategy… This view updates automatically.' : loaded.ai.status === 'ready' ? 'AI strategy ready · ' + loaded.ai.model : loaded.ai.message;
  $('routeLibrary').prepend(status);
  if (loaded.ai.status !== 'ready') {
    const retry = document.createElement('button'); retry.className = 'btn'; retry.textContent = analyzing ? 'Analyzing…' : 'Retry card lookup and AI analysis'; retry.disabled = analyzing || importing; retry.onclick = () => void runAI(); $('routeLibrary').prepend(retry);
  }
}
$('routesBtn').onclick = () => { if (!loaded) return; renderDeckAnalysis(); $('routesModal').showModal(); };
document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => $(button.dataset.close).close());
document.querySelectorAll('.dropzone').forEach(el => {
  el.ondragover = e => { e.preventDefault(); el.classList.add('drag-over'); };
  el.ondragleave = () => el.classList.remove('drag-over');
  el.ondrop = e => { e.preventDefault(); el.classList.remove('drag-over'); try { const d = JSON.parse(e.dataTransfer.getData('text/plain')); move(d.index, d.zone, el.dataset.drop, d.name); } catch {} };
});
$('contextCoach').onmouseenter = () => clearTimeout(contextTimer);
$('contextCoach').onmouseleave = () => { contextTimer = setTimeout(clearContext, 200); };
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE));
  if (saved?.version === DeckCore.VERSION && saved.deck?.cards?.length && saved.profile?.version === DeckCore.VERSION) {
    DeckCore.normalizeDeck(saved.deck);
    if (saved.profile.source === 'ai') DeckCore.validateProfile(saved.profile, saved.deck, saved.metadata, saved.facts);
    loaded = saved; $('gameMode').value = /commander|edh/.test(saved.deck.format) ? 'multiplayer' : 'play'; fresh();
  }
} catch { loaded = null; }
render();
if (loaded && loaded.ai.status !== 'ready') void runAI();
