/* Opening-hand mana and turn-sequencing evaluator. Loaded after app.js. */
(()=>{
  const COLORS=['U','B','G'];
  const FETCHES=new Set(['Misty Rainforest','Polluted Delta','Verdant Catacombs']);
  const FIXED_LANDS={
    "Alchemist's Refuge":{colors:['C']},
    'Bojuka Bog':{colors:['B'],tapped:true},
    'Boseiju, Who Endures':{colors:['G']},
    'Breeding Pool':{colors:['U','G']},
    'Cabal Coffers':{colors:[],weak:true},
    'Command Tower':{colors:['U','B','G']},
    'Exotic Orchard':{colors:['U','B','G'],conditional:true},
    'Field of the Dead':{colors:['C'],tapped:true,weak:true},
    'Forest':{colors:['G']},
    'Hedge Maze':{colors:['U','G'],tapped:true},
    'Island':{colors:['U']},
    'Mana Confluence':{colors:['U','B','G']},
    'Morphic Pool':{colors:['U','B']},
    'Mystic Sanctuary':{colors:['U'],tapped:true},
    'Otawara, Soaring City':{colors:['U']},
    'Overgrown Tomb':{colors:['B','G']},
    'Rejuvenating Springs':{colors:['U','G']},
    'Shifting Woodland':{colors:['G']},
    'Turbulent Fen':null,
    'Turbulent Wilderness':null,
    'Undercity Sewers':{colors:['U','B'],tapped:true},
    'Underground Mortuary':{colors:['B','G'],tapped:true},
    'Undergrowth Stadium':{colors:['B','G']},
    'Urborg, Tomb of Yawgmoth':{colors:['B']},
    "Urza's Saga":{colors:['C'],weak:true},
    "Volrath's Stronghold":{colors:['C'],weak:true},
    'Waterlogged Grove':{colors:['U','G']},
    'Watery Grave':{colors:['U','B']},
    'Yavimaya, Cradle of Growth':{colors:['G']},
    'Fell the Profane':{colors:['B'],tapped:true,mdfc:true},
    'Sea Gate Restoration':{colors:['U'],mdfc:true},
    'Waterlogged Teachings':null
  };
  const DORKS={
    'Birds of Paradise':{cost:'{G}',colors:['U','B','G']},
    'Delighted Halfling':{cost:'{G}',colors:['U','B','G'],commanderOnly:true},
    'Deathrite Shaman':{cost:'{B/G}',colors:['U','B','G'],needsFetch:true},
    'Elves of Deep Shadow':{cost:'{G}',colors:['B']},
    'Bloom Tender':{cost:'{1}{G}',colors:['G']},
    'Molt Tender':{cost:null,colors:['U','B','G']}
  };
  const FREE_OR_ALT={
    'Noxious Revival':1,
    'Mindbreak Trap':1,
    'Force of Vigor':1,
    'Snuff Out':1,
    'Submerge':1
  };

  function faceForLand(name){
    const m=meta.get(name);if(!m)return null;
    if(m.faces?.length){const f=m.faces.find(x=>/Land/.test(x.type||''));if(f)return f}
    return /Land/.test(m.type||'')?m:null;
  }
  function parseAddColors(text=''){
    const found=new Set();
    for(const m of text.matchAll(/Add\s+([^\.\n]+)/gi)){
      const chunk=m[1];
      for(const c of chunk.matchAll(/\{([WUBRGC])\}/g))found.add(c[1]);
      if(/any color/i.test(chunk))COLORS.forEach(c=>found.add(c));
    }
    return [...found];
  }
  function landProfile(name){
    if(FETCHES.has(name))return{name,colors:[...COLORS],tapped:false,fetch:true,weak:false};
    const fixed=FIXED_LANDS[name];if(fixed)return{name,...fixed,tapped:!!fixed.tapped,weak:!!fixed.weak};
    const f=faceForLand(name),text=f?.text||'';
    let colors=parseAddColors(text);
    if(!colors.length){
      const type=f?.type||'';
      if(/Island/.test(type))colors.push('U');if(/Swamp/.test(type))colors.push('B');if(/Forest/.test(type))colors.push('G');
    }
    const forcedTapped=/enters (?:the battlefield )?tapped\.?/i.test(text)&&!/unless|you may pay|two or more opponents/i.test(text);
    return{name,colors:[...new Set(colors)],tapped:forcedTapped,weak:!colors.some(c=>COLORS.includes(c))};
  }
  function manaCost(name){
    const m=meta.get(name);if(m?.mana)return m.mana;
    if(m?.faces?.length){const f=m.faces.find(x=>x.mana);if(f?.mana)return f.mana}
    return DORKS[name]?.cost||'';
  }
  function costTokens(cost=''){
    const toks=[...String(cost).matchAll(/\{([^}]+)\}/g)].map(x=>x[1]);
    let generic=0;const pips=[];
    for(const t of toks){
      if(/^\d+$/.test(t)){generic+=+t;continue}
      if(/P/.test(t))continue;
      if(t==='X')continue;
      if(t.includes('/')){const opts=t.split('/').filter(x=>COLORS.includes(x));if(opts.length)pips.push(opts);continue}
      if(COLORS.includes(t))pips.push([t]);
      else if(t==='C')pips.push(['C']);
    }
    return{generic,pips};
  }
  function sourceUnits(sources){
    const units=[];
    for(const s of sources){for(let i=0;i<(s.amount||1);i++)units.push({colors:s.colors||['C'],label:s.label||''})}
    return units;
  }
  function canPay(cost,sources){
    const {generic,pips}=costTokens(cost),units=sourceUnits(sources);
    function rec(pi,used){
      if(pi===pips.length)return units.length-used.size>=generic;
      for(let i=0;i<units.length;i++){
        if(used.has(i))continue;
        if(pips[pi].some(c=>units[i].colors.includes(c))){used.add(i);if(rec(pi+1,used))return true;used.delete(i)}
      }
      return false;
    }
    return rec(0,new Set());
  }
  function perms(arr,k){
    const out=[];function go(cur,left){if(cur.length===k){out.push(cur);return}for(let i=0;i<left.length;i++)go([...cur,left[i]],[...left.slice(0,i),...left.slice(i+1)])}go([],arr);return out;
  }
  function landOrders(lands,max=3){
    const k=Math.min(max,lands.length);if(!k)return [[]];
    let out=[];for(let len=1;len<=k;len++)out.push(...perms(lands,len));return out;
  }
  function sourcesFromOrder(order,turn,playTurns=null){
    const src=[];
    order.forEach((n,i)=>{
      const p=landProfile(n),pt=playTurns?.[i]||i+1,ready=pt+(p.tapped?1:0);
      if(ready<=turn)src.push({colors:p.colors.length?p.colors:['C'],amount:1,label:n});
    });
    return src;
  }
  function colorCoverage(sources){const s=new Set();sources.forEach(x=>x.colors.forEach(c=>{if(COLORS.includes(c))s.add(c)}));return s}
  function bestLandSnapshot(lands,turn){
    let best={sources:[],order:[],colors:new Set(),value:-1};
    for(const o of landOrders(lands,turn)){
      const sources=sourcesFromOrder(o,turn),colors=colorCoverage(sources),value=sources.length*4+colors.size*5;
      if(value>best.value)best={sources,order:o,colors,value};
    }
    return best;
  }
  function canCastT1(name,lands){
    const cost=manaCost(name);if(!cost)return false;
    return lands.some(l=>canPay(cost,sourcesFromOrder([l],1)));
  }
  function chooseT1Line(hand,lands){
    if(!lands.length)return{kind:'none',text:'No land to play.',sourcesByTurn:{}};
    const orders=perms(lands,Math.min(3,lands.length));
    if(hand.includes('Sol Ring')&&hand.includes('Arcane Signet')){
      for(const o of orders){
        const t1=sourcesFromOrder([o[0]],1);if(canPay('{1}',t1))return{kind:'solsignet',order:o,text:`${o[0]} → Sol Ring → Arcane Signet`};
      }
    }
    if(hand.includes('Exploration')&&lands.length>=2){
      for(const o of orders.filter(x=>x.length>=2)){
        const t1=sourcesFromOrder([o[0]],1);if(canPay('{G}',t1))return{kind:'exploration',order:o,text:`${o[0]} → Exploration → ${o[1]}`};
      }
    }
    for(const d of ['Birds of Paradise','Delighted Halfling','Deathrite Shaman','Elves of Deep Shadow']){
      if(!hand.includes(d))continue;
      for(const o of orders){if(canPay(DORKS[d].cost,sourcesFromOrder([o[0]],1)))return{kind:'dork',dork:d,order:o,text:`${o[0]} → ${d}`}}
    }
    if(hand.includes("Sensei's Divining Top")){
      for(const o of orders){if(canPay('{1}',sourcesFromOrder([o[0]],1)))return{kind:'top',order:o,text:`${o[0]} → Sensei's Divining Top`}}
    }
    const best=bestLandSnapshot(lands,1);return{kind:'land',order:best.order,text:best.order.length?`${best.order[0]} only`:'No untapped mana available'};
  }
  function scenarioSources(line,turn,lands){
    const order=line.order?.length?line.order:bestLandSnapshot(lands,turn).order;
    let playTurns=null;
    if(line.kind==='exploration')playTurns=[1,1,2];
    let src=sourcesFromOrder(order.slice(0,Math.min(order.length,turn+(line.kind==='exploration'?1:0))),turn,playTurns);
    if(line.kind==='dork'&&turn>=2){
      const d=DORKS[line.dork];if(!(d.needsFetch&&!order.some(x=>FETCHES.has(x))))src.push({colors:d.colors,amount:1,label:line.dork});
      else if(d.needsFetch&&order.some(x=>FETCHES.has(x)))src.push({colors:d.colors,amount:1,label:line.dork});
    }
    if(line.kind==='solsignet'){
      src.push({colors:['C'],amount:2,label:'Sol Ring'});src.push({colors:[...COLORS],amount:1,label:'Arcane Signet'});
    }
    return src;
  }
  function commanderTurn(hand,lands,line){
    if(['dork','solsignet','exploration'].includes(line.kind)){
      const s=scenarioSources(line,2,lands);if(canPay('{U}{B}{G}',s))return 2;
    }
    let best3=bestLandSnapshot(lands,3);if(canPay('{U}{B}{G}',best3.sources))return 3;
    if(line.kind==='dork'&&canPay('{U}{B}{G}',scenarioSources(line,3,lands)))return 3;
    if(hand.includes('Arcane Signet')){
      for(const o of landOrders(lands,3)){
        if(o.length<2)continue;const t2=sourcesFromOrder(o.slice(0,2),2);if(!canPay('{2}',t2))continue;
        const t3=sourcesFromOrder(o.slice(0,3),3);t3.push({colors:[...COLORS],amount:1,label:'Arcane Signet'});if(canPay('{U}{B}{G}',t3))return 3;
      }
    }
    return null;
  }
  function maxSourcesAt(hand,lands,line,turn){
    const candidates=[bestLandSnapshot(lands,turn).sources];
    if(turn>=2)candidates.push(scenarioSources(line,turn,lands));
    if(turn>=3&&hand.includes('Arcane Signet')){
      const b=bestLandSnapshot(lands,turn).sources;if(b.length>=2)candidates.push([...b,{colors:[...COLORS],amount:1,label:'Arcane Signet'}]);
    }
    return candidates.sort((a,b)=>(b.length+colorCoverage(b).size*2)-(a.length+colorCoverage(a).size*2))[0]||[];
  }
  function earliestTurn(name,hand,lands,line){
    if(FREE_OR_ALT[name])return 1;
    if(name==='Deadly Rollick')return commanderTurn(hand,lands,line)||4;
    if(name==='Sol Ring')return canCastT1(name,lands)?1:null;
    if(name==='Arcane Signet'&&hand.includes('Sol Ring')&&line.kind==='solsignet')return 1;
    const cost=manaCost(name);if(!cost)return null;
    for(let turn=1;turn<=3;turn++)if(canPay(cost,maxSourcesAt(hand,lands,line,turn)))return turn;
    return null;
  }
  function colorName(c){return{U:'blue',B:'black',G:'green'}[c]||c}
  function analyzeMana(){
    const h=st.hand,l=h.filter(x=>LAND.has(x)),r=h.filter(x=>RAMP.has(x)),t=h.filter(x=>TUTOR.has(x)),i=h.filter(x=>INT.has(x)),e=h.filter(x=>ENG.has(x)),c=h.filter(x=>COMBO.has(x));
    const line=chooseT1Line(h,l),cmdTurn=commanderTurn(h,l,line),effective3=maxSourcesAt(h,l,line,3),coverage=colorCoverage(effective3),missing=COLORS.filter(x=>!coverage.has(x));
    const profiles=l.map(landProfile),forcedTapped=profiles.filter(x=>x.tapped).length,weak=profiles.filter(x=>x.weak).length;
    let s=44,sg=[];

    if(l.length===0)s-=42;else if(l.length===1)s-=28;else if(l.length===2)s+=7;else if(l.length===3)s+=11;else if(l.length===4)s+=5;else s-=8;
    if(l.length)sg.push([l.length>=2?'✓':'!',`${l.length} land${l.length===1?'':'s'} in hand. ${weak?`${weak} ${weak===1?'is':'are'} weak/mostly colorless early.`:'Early land quality is reasonable.'}`]);

    if(coverage.size===3){s+=13;sg.push(['✓','Color access: blue, black, and green are all represented by turn 3.'])}
    else if(coverage.size===2){s-=2;sg.push(['!',`Color access is incomplete: missing ${missing.map(colorName).join(' / ')} from the lands currently in hand.`])}
    else{s-=16;sg.push(['!',`Color access is poor: the hand does not naturally cover Glarb's U/B/G cost.`])}

    if(forcedTapped>=2){s-=9;sg.push(['!',`${forcedTapped} lands enter tapped, which slows the first two turns.`])}else if(forcedTapped===1){s-=2}

    if(line.kind==='none'){s-=10;sg.push(['!','Turn 1: no land play.'])}
    else{const active=line.kind!=='land';s+=active?8:1;sg.push([active?'✓':'•',`Turn 1: ${line.text}.`])}

    if(cmdTurn===2){s+=20;sg.push(['✓','Turn 2: play your second land and cast Glarb with U/B/G available.'])}
    else if(cmdTurn===3){s+=11}
    else{s-=18}

    const relevant=[...new Set([...t,...e,...i])];
    const early=relevant.map(n=>({n,turn:earliestTurn(n,h,l,line)}));
    const t2Play=early.filter(x=>x.turn===2).sort((a,b)=>(TUTOR.has(b.n)?2:ENG.has(b.n)?1:0)-(TUTOR.has(a.n)?2:ENG.has(a.n)?1:0))[0];
    const t3Play=early.filter(x=>x.turn===3).sort((a,b)=>(TUTOR.has(b.n)?2:ENG.has(b.n)?1:0)-(TUTOR.has(a.n)?2:ENG.has(a.n)?1:0))[0];
    if(cmdTurn===3){sg.push(['✓',`Turn 2: ${t2Play?`you can develop ${t2Play.n}; `:''}keep building toward all three colors.`]);sg.push(['✓','Turn 3: Glarb is realistically castable with the current mana sequence.'])}
    else if(cmdTurn===2){sg.push(['•',`Turn 3: ${t3Play?`${t3Play.n} is a realistic follow-up if the board allows.`:'use Glarb to start filtering the top and hold up interaction where possible.'}`])}
    else{sg.push(['!',`Turn 2: ${t2Play?`${t2Play.n} is playable, but `:''}your mana is not yet converging on U/B/G.`]);sg.push(['!',"Turn 3: this seven still does not reliably produce U + B + G for Glarb."])}
    const live=early.filter(x=>x.turn&&x.turn<=2),stranded=early.filter(x=>!x.turn||x.turn>3);
    if(live.length){s+=Math.min(10,live.length*4);sg.push(['✓',`Early live cards: ${live.slice(0,3).map(x=>`${x.n} (T${x.turn})`).join(', ')}.`])}
    if(stranded.length>=2){s-=Math.min(10,stranded.length*3);sg.push(['!',`${stranded.length} useful cards are not realistically castable by turn 3 with this mana.`])}

    const castableRamp=r.filter(n=>earliestTurn(n,h,l,line)&&earliestTurn(n,h,l,line)<=2);
    if(castableRamp.length)s+=Math.min(8,castableRamp.length*3);
    if(t.some(n=>{const et=earliestTurn(n,h,l,line);return et&&et<=3}))s+=7;
    if(e.some(n=>{const et=earliestTurn(n,h,l,line);return et&&et<=3}))s+=5;
    if(i.some(n=>{const et=earliestTurn(n,h,l,line);return et&&et<=2}))s+=5;else if(!i.length)s-=4;
    if(c.length>=2&&cmdTurn)s+=4;

    s=Math.max(5,Math.min(96,Math.round(s)));
    const v=s>=82?'Strong keep':s>=68?'Keep':s>=54?'Contextual keep':s>=40?'Lean mulligan':'Mulligan';
    const nextNeed=missing.length?`Prioritize a source that produces ${missing.map(colorName).join(' or ')}${missing.length>1?' and improves U/B/G coverage':''}.`:cmdTurn?null:'Prioritize fixing that gets Glarb to U/B/G by turn 3.';
    return{s,v,sg,l,r,t,i,e,c,missingColors:missing,cmdTurn,line,coverage,nextNeed,early};
  }

  analyze=analyzeMana;
  const baseRenderCoach=renderCoach;
  renderCoach=function(){
    baseRenderCoach();if(!st.reveal)return;
    const a=analyze();
    if(a.nextNeed)$('next').textContent=a.nextNeed;
    const prefix=st.choice?`You chose ${st.choice.toUpperCase()}. `:'';
    const turnText=a.cmdTurn?`This hand can put Glarb online on turn ${a.cmdTurn}. `:"This hand does not reliably cast Glarb by turn 3. ";
    const colorText=a.missingColors.length?`It is currently short on ${a.missingColors.map(colorName).join(' / ')} mana.`:'Its U/B/G color coverage is functional.';
    $('summary').textContent=prefix+turnText+colorText;
  };
})();
