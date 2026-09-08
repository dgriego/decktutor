/* Simulator-first interaction layer for Deck Tutor. Loaded after app.js. */
const CONTEXT_SYNERGY_PAIRS=[
["Bolas's Citadel","Sensei's Divining Top","Top can draw itself, then Citadel can recast it from the top for 1 life. This is the core repeat-cast engine."],
["Bolas's Citadel","Aetherflux Reservoir","Citadel lets you chain spells from the library while Reservoir turns those casts into life and eventually lethal 50-damage activations."],
["Sensei's Divining Top","Aetherflux Reservoir","These are two pieces of the primary Citadel loop. Top supplies repeat casts; Reservoir is the payoff."],
["Sensei's Divining Top","Sheoldred, the Apocalypse","Every Top activation draws a card, so Sheoldred gains 2 life. With Citadel, that offsets the 1 life used to recast Top."],
["Bolas's Citadel","Sheoldred, the Apocalypse","Sheoldred helps stabilize your life total while Citadel spends life, especially once Top is involved."],
["Hullbreaker Horror","Sol Ring","Hullbreaker can bounce Sol Ring when you cast another spell. With Arcane Signet, the two rocks can recast each other repeatedly."],
["Hullbreaker Horror","Arcane Signet","Hullbreaker can bounce Signet as Sol Ring is cast, forming the other half of the rock loop."],
["Sol Ring","Arcane Signet","With Hullbreaker Horror on the battlefield, these two rocks pay for each other and can be cast repeatedly."],
["Hullbreaker Horror","Aetherflux Reservoir","Hullbreaker's rock loop creates repeated spell casts; Reservoir converts those casts into lethal life gain."],
["Insidious Dreams","Glarb, Calamity's Augur","Insidious Dreams can stack exact cards on top, and Glarb can cast mana-value 4+ cards from there."],
["Cruel Tutor","Glarb, Calamity's Augur","Cruel Tutor puts the chosen card on top, which turns its normal drawback into setup for Glarb."],
["Scheming Symmetry","Glarb, Calamity's Augur","Put your chosen card on top and use Glarb's top-of-library access before an opponent can fully capitalize on their tutor."],
["Sensei's Divining Top","Glarb, Calamity's Augur","Top lets you arrange what Glarb sees and helps clear awkward cards from the top."],
["Mirri's Guile","Glarb, Calamity's Augur","Guile continually arranges the top three so Glarb sees lands and castable 4+ mana-value spells."],
["Sylvan Library","Glarb, Calamity's Augur","Library improves top-deck quality and gives Glarb better cards to play from the top."],
["Brainstorm","Glarb, Calamity's Augur","Brainstorm can put expensive spells or lands back on top where Glarb can use them."],
["Seedborn Muse","Glarb, Calamity's Augur","Seedborn Muse untaps Glarb on every turn, giving you repeated surveil 2 activations each turn cycle."],
["Counterbalance","Sensei's Divining Top","Top can change the top card in response to Counterbalance, making the counter trigger much more controllable."],
["Counterbalance","Brainstorm","Brainstorm can place a card with the needed mana value on top in response to a Counterbalance trigger."],
["Counterbalance","Mirri's Guile","Guile gives advance knowledge and ordering of the top cards, improving Counterbalance hits."],
["Counterbalance","Sylvan Library","Library gives repeated top-deck control that makes Counterbalance less random."],
["Loyal Inventor","Bolas's Citadel","Inventor can put Citadel on top of the library, where Glarb can cast it because its mana value is 6."],
["Loyal Inventor","Aetherflux Reservoir","Inventor can put Reservoir on top for Glarb to cast because Reservoir has mana value 4."],
["Loyal Inventor","Sensei's Divining Top","Inventor can find Top when the other Citadel pieces are already available."],
["Aesi, Tyrant of Gyre Strait","Exploration","Extra land drops become extra Aesi draw triggers."],
["Aesi, Tyrant of Gyre Strait","Dryad of the Ilysian Grove","Dryad gives another land drop each turn, which means another Aesi card draw."],
["Aesi, Tyrant of Gyre Strait","Oracle of Mul Daya","Oracle supplies an extra land drop and lets you play lands from the top while Aesi rewards each land entering."],
["Aesi, Tyrant of Gyre Strait","The Gitrog Monster","Both reward land-heavy turns and help turn lands into sustained cards."],
["Aesi, Tyrant of Gyre Strait","Field of the Dead","Aesi's extra land drops and draw engine help keep Field triggering."],
["Aesi, Tyrant of Gyre Strait","Scute Swarm","Extra land drops grow Scute Swarm quickly while Aesi keeps the cards flowing."],
["Scute Swarm","Exploration","Extra land drops mean extra Scute Swarm triggers."],
["Scute Swarm","Dryad of the Ilysian Grove","Dryad's additional land play accelerates Scute Swarm token production."],
["Scute Swarm","Oracle of Mul Daya","Oracle provides another land play and top-of-library land access for more Scute triggers."],
["Field of the Dead","Exploration","Extra land plays accelerate Field of the Dead token production."],
["Field of the Dead","Dryad of the Ilysian Grove","Dryad helps make land types and land drops easier while pushing Field toward repeated triggers."],
["The Gitrog Monster","Exploration","Extra land drops feed Gitrog's land engine and make fetchlands more valuable."],
["The Gitrog Monster","Oracle of Mul Daya","Oracle gives extra land access while Gitrog rewards lands going to the graveyard and fuels card flow."],
["Sheoldred, the Apocalypse","Whispering Madness","Whispering Madness makes every opponent draw a fresh hand; Sheoldred punishes every one of those draws for 2 life."],
["Ancient Cellarspawn","Bolas's Citadel","Citadel pays life instead of mana, so Cellarspawn can punish opponents for the mana you did not spend."],
["Ancient Cellarspawn","Gwenom, Remorseless","Gwenom lets you pay life instead of mana from the top, which turns those discounted casts into Cellarspawn damage."],
["Ancient Cellarspawn","One with the Multiverse","One with the Multiverse can cast a spell for free, creating a large mana-value gap for Cellarspawn."],
["Ancient Cellarspawn","Titans' Nest","Titans' Nest reduces mana actually spent on spells, which increases Cellarspawn's life-loss trigger."],
["Seedborn Muse","Alchemist's Refuge","Seedborn provides fresh mana every turn and Refuge lets you spend it at instant speed."],
["Seedborn Muse","Tidal Barracuda","Barracuda gives your spells flash while Seedborn untaps your mana each turn, letting you play across the whole turn cycle."],
["Seedborn Muse","High Fae Trickster","Flash plus repeated untaps turns your deck into a highly reactive value engine."],
["Waterlogged Teachings","Insidious Dreams","Teachings can tutor Insidious Dreams, giving you direct access to a top-deck stack setup."],
["Waterlogged Teachings","Hullbreaker Horror","Hullbreaker has flash, so Waterlogged Teachings can tutor it directly."],
["Waterlogged Teachings","High Fae Trickster","High Fae Trickster has flash and is a valid Teachings target when you want to operate at instant speed."],
["Waterlogged Teachings","Valley Floodcaller","Valley Floodcaller has flash and can be found with Teachings."],
["Sylvan Tutor","Seedborn Muse","Sylvan Tutor can put Seedborn Muse on top, a strong generic engine target."],
["Sylvan Tutor","Sheoldred, the Apocalypse","Tutor Sheoldred when Citadel + Top is forming or when draw punishment matters."],
["Sylvan Tutor","Hullbreaker Horror","Tutor Hullbreaker when Sol Ring / Arcane Signet or a control-heavy board makes the loop attractive."],
["Sylvan Tutor","Loyal Inventor","Tutor Inventor when the card you truly need is Citadel, Reservoir, or Top."],
["Phyrexian Metamorph","Bolas's Citadel","Metamorph can copy a powerful artifact or creature already on the battlefield; Citadel is one of your strongest artifact targets."],
["Clever Impersonator","Bolas's Citadel","Impersonator can copy Citadel or another high-value nonland permanent without targeting it."],
["Clever Impersonator","Aetherflux Reservoir","A second Reservoir makes every spell trigger both copies, accelerating life gain dramatically."],
["Fortune Teller's Talent","Glarb, Calamity's Augur","Both reward playing from outside your hand; the Talent makes those top-deck casts cheaper as it levels up."]
];
const CONTEXT_SYNERGY=new Map();
for(const [a,b,d] of CONTEXT_SYNERGY_PAIRS){
  if(!CONTEXT_SYNERGY.has(a))CONTEXT_SYNERGY.set(a,new Map());
  if(!CONTEXT_SYNERGY.has(b))CONTEXT_SYNERGY.set(b,new Map());
  CONTEXT_SYNERGY.get(a).set(b,d);CONTEXT_SYNERGY.get(b).set(a,d);
}
let contextTimer=null;
const contextSynergyText=(a,b)=>CONTEXT_SYNERGY.get(a)?.get(b)||null;

function contextRouteData(n){
  const active=new Set([...st.hand,...st.field,...(st.cmd?[commander]:[])]);
  return ROUTES.filter(([,pieces])=>pieces.includes(n)).map(([name,pieces,desc])=>{
    const have=pieces.filter(x=>active.has(x));
    const missing=pieces.filter(x=>!active.has(x));
    const inDeck=missing.filter(x=>st.lib.includes(x));
    return{name,pieces,desc,have,missing,inDeck};
  });
}
function contextMatches(n,list,zoneName){
  const out=[];
  for(const other of list){
    if(other===n)continue;
    const desc=contextSynergyText(n,other);
    if(desc)out.push({name:other,desc,zone:zoneName,hot:zoneName==='battlefield'});
  }
  if(n==='Clever Impersonator'&&zoneName==='battlefield'){
    for(const other of list){
      if(other===n||out.some(x=>x.name===other))continue;
      const m=meta.get(other);
      if(m&&!/Land/.test(m.type||''))out.push({name:other,desc:`Clever Impersonator can enter as a copy of ${other}. Copying does not target, so shroud or hexproof do not stop the copy choice.`,zone:zoneName,hot:true});
    }
  }
  if(n==='Phyrexian Metamorph'&&zoneName==='battlefield'){
    for(const other of list){
      if(other===n||out.some(x=>x.name===other))continue;
      const m=meta.get(other);
      if(m&&/(Artifact|Creature)/.test(m.type||''))out.push({name:other,desc:`Phyrexian Metamorph can copy ${other} if it is an artifact or creature.`,zone:zoneName,hot:true});
    }
  }
  return out;
}
function contextOracleText(m){
  const text=oracle(m);
  return text.length>520?text.slice(0,517)+'…':text;
}
function contextSection(title,items,emptyText){
  return `<div class="context-section"><div class="context-section-title"><span>${esc(title)}</span><span>${items.length}</span></div>${items.length?`<div class="context-items">${items.slice(0,6).map(x=>`<div class="context-item ${x.hot?'hot':''} ${x.route?'route-hit':''}"><strong>${esc(x.name)}${x.zone?` <span class="zone-chip">${esc(x.zone)}</span>`:''}</strong><p>${esc(x.desc)}</p></div>`).join('')}</div>`:`<div class="context-empty">${esc(emptyText)}</div>`}</div>`;
}
function showCardContext(n,z){
  clearTimeout(contextTimer);
  const m=meta.get(n);
  const battlefield=[...st.field,...(st.cmd?[commander]:[])];
  const battleMatches=contextMatches(n,battlefield,'battlefield');
  const handMatches=contextMatches(n,st.hand,'hand');
  const deckMatches=contextMatches(n,st.lib,'library');
  const routeItems=contextRouteData(n).map(r=>({name:r.name,route:true,desc:r.missing.length?`${r.have.length}/${r.pieces.length} pieces available now. Missing: ${r.missing.join(' + ')}${r.inDeck.length?`. Still in library: ${r.inDeck.join(', ')}.`:''}`:`All pieces are available now. ${r.desc}`}));
  $('contextName').textContent=n;
  $('contextRole').textContent=label(role(n));
  $('contextFacts').textContent=[z?z.toUpperCase():null,m?.mana,m?.type].filter(Boolean).join(' · ');
  $('contextOracle').textContent=contextOracleText(m);
  $('contextNote').textContent=hint(n);
  $('contextSections').innerHTML=
    contextSection('On your battlefield',battleMatches,'No direct mapped synergy with your current battlefield yet.')+
    contextSection('In your hand',handMatches,'No direct pairing with another card in hand right now.')+
    contextSection('Still in your library',deckMatches,'No mapped synergy card remains in the library.')+
    contextSection('Win-route context',routeItems,"This card is not part of one of the deck's core mapped win routes.");
  $('defaultCoach').classList.add('hidden');
  $('contextCoach').classList.remove('hidden');
}
function scheduleContextClear(){clearTimeout(contextTimer);contextTimer=setTimeout(clearCardContext,240)}
function clearCardContext(){
  if(!$('contextCoach'))return;
  $('contextCoach').classList.add('hidden');
  $('defaultCoach').classList.remove('hidden');
}

cardEl=function(n,z){
  const m=meta.get(n),b=document.createElement('button'),r=role(n);
  b.className=`card ${r}`;b.draggable=true;b.dataset.card=n;b.dataset.zone=z;
  b.innerHTML=m?.image?`<img src="${esc(m.image)}" alt="${esc(n)} card" loading="lazy"><span class="badge">${label(r)}</span>`:`<div class="fallback"><b>${esc(n)}</b><span class="muted">${esc(hint(n))}</span></div><span class="badge">${label(r)}</span>`;
  b.onclick=()=>openCard(n,z);
  b.addEventListener('mouseenter',()=>showCardContext(n,z));
  b.addEventListener('mouseleave',scheduleContextClear);
  b.addEventListener('dragstart',e=>{b.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',JSON.stringify({card:n,zone:z}));});
  b.addEventListener('dragend',()=>b.classList.remove('dragging'));
  return b;
};
move=function(n,from,to){
  if(from===to)return;
  const source=st[from],i=source.indexOf(n);if(i<0)return;
  const [card]=source.splice(i,1);st[to].push(card);st.reveal=true;clearCardContext();render();
};
openCard=function(n,z){
  const m=meta.get(n);$('cardName').textContent=n;$('role').textContent=label(role(n));
  $('bigImage').innerHTML=m?.image?`<img src="${esc(m.image)}" alt="${esc(n)} card">`:'<div class="placeholder">Card image loading…</div>';
  $('facts').innerHTML=[m?.mana,m?.type,m?.setName?`${m.setName} · ${String(m.set).toUpperCase()} ${m.cn}`:null].filter(Boolean).map(x=>`<span class="chip">${esc(x)}</span>`).join('');
  $('oracle').textContent=oracle(m);$('note').textContent=hint(n);const actions=$('cardActions');actions.innerHTML='';
  if(z==='hand'){actions.append(action('Play / cast',()=>move(n,'hand','field')));actions.append(action('Discard',()=>move(n,'hand','grave')))}
  else if(z==='field'){actions.append(action('Return to hand',()=>move(n,'field','hand')));actions.append(action('To graveyard',()=>move(n,'field','grave')))}
  else if(z==='grave'){actions.append(action('Return to hand',()=>move(n,'grave','hand')));actions.append(action('Move to battlefield',()=>move(n,'grave','field')))}
  $('cardModal').showModal();
};
render=function(){
  document.title=`${deckName} — Deck Tutor`;$('title').textContent=deckName;
  $('lib').textContent=st.lib.length;$('libLarge').textContent=st.lib.length;$('graveCount').textContent=st.grave.length;$('graveRailCount').textContent=st.grave.length;$('mulls').textContent=st.m;
  $('gameStatus').textContent=st.field.length||st.grave.length||st.cmd?'Live playtest':'Opening hand practice';
  zone('hand',st.hand,'hand');zone('field',st.field,'field');zone('grave',st.grave,'grave');
  const cm=meta.get(commander),root=$('cmdCard');
  if(cm?.image){root.className='';root.innerHTML=`<img src="${esc(cm.image)}" alt="${esc(commander)} card">`;const img=root.querySelector('img');img.onclick=()=>openCard(commander,'cmd');img.onmouseenter=()=>showCardContext(commander,'cmd');img.onmouseleave=scheduleContextClear}else{root.className='placeholder';root.textContent=commander}
  root.style.outline=st.cmd?'2px solid var(--g)':'none';$('cmdBtn').textContent=st.cmd?'Return to command zone':'Move to battlefield';renderCoach();
};
function setupContextDropZones(){
  document.querySelectorAll('.dropzone').forEach(el=>{
    el.addEventListener('dragover',e=>{e.preventDefault();el.classList.add('drag-over');e.dataTransfer.dropEffect='move'});
    el.addEventListener('dragleave',()=>el.classList.remove('drag-over'));
    el.addEventListener('drop',e=>{e.preventDefault();el.classList.remove('drag-over');try{const d=JSON.parse(e.dataTransfer.getData('text/plain')),to=el.dataset.drop;if(d?.card&&d?.zone&&to&&d.zone!==to)move(d.card,d.zone,to)}catch{}});
  });
}
$('contextCoach').addEventListener('mouseenter',()=>clearTimeout(contextTimer));
$('contextCoach').addEventListener('mouseleave',scheduleContextClear);
setupContextDropZones();
render();
