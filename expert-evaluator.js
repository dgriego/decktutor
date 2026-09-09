/* Expert opening-hand evaluator for MTGLine.
   Loaded after mana-evaluator.js and enhancements.js so it can combine
   mana sequencing, mapped synergies, win routes, draw odds, and mulligan context. */
(()=>{
  const legacyAnalyze=analyze;
  const legacyRenderCoach=renderCoach;
  const COLORS=['U','B','G'];
  const COLOR_NAMES={U:'blue',B:'black',G:'green'};
  const PROTECTION=new Set([
    'Lightning Greaves',"Legolas's Quick Reflexes",'Mindbreak Trap','Counterbalance',
    'Force of Vigor','Noxious Revival','High Fae Trickster'
  ]);
  const DRAW_ENGINES=new Set([
    'Aesi, Tyrant of Gyre Strait','Sylvan Library','Talion, the Kindly Lord',
    'The Gitrog Monster','The Reality Chip',"Sensei's Divining Top",'Brainstorm',
    "Mirri's Guile","Fortune Teller's Talent",'Oracle of Mul Daya','Wan Shi Tong, Librarian'
  ]);
  const FLEX_TUTOR_QUALITY={
    'Insidious Dreams':10,'Cruel Tutor':9,'Scheming Symmetry':7,'Sylvan Tutor':7,
    'Waterlogged Teachings':7,'Loyal Inventor':8,'Emergent Ultimatum':8
  };
  const CONDITIONAL_INTERACTION=new Set(['Mindbreak Trap','Force of Vigor','Snuff Out','Submerge']);
  const FIXED_LANDS={
    "Alchemist's Refuge":{colors:['C']},'Bojuka Bog':{colors:['B'],tapped:true},
    'Boseiju, Who Endures':{colors:['G']},'Breeding Pool':{colors:['U','G']},
    'Cabal Coffers':{colors:[],weak:true},'Command Tower':{colors:['U','B','G']},
    'Exotic Orchard':{colors:['U','B','G'],conditional:true},
    'Field of the Dead':{colors:['C'],tapped:true,weak:true},'Forest':{colors:['G']},
    'Hedge Maze':{colors:['U','G'],tapped:true},'Island':{colors:['U']},
    'Mana Confluence':{colors:['U','B','G']},'Morphic Pool':{colors:['U','B']},
    'Mystic Sanctuary':{colors:['U'],tapped:true},'Otawara, Soaring City':{colors:['U']},
    'Overgrown Tomb':{colors:['B','G']},'Rejuvenating Springs':{colors:['U','G']},
    'Shifting Woodland':{colors:['G']},'Undercity Sewers':{colors:['U','B'],tapped:true},
    'Underground Mortuary':{colors:['B','G'],tapped:true},'Undergrowth Stadium':{colors:['B','G']},
    'Urborg, Tomb of Yawgmoth':{colors:['B']},"Urza's Saga":{colors:['C'],weak:true},
    "Volrath's Stronghold":{colors:['C'],weak:true},'Waterlogged Grove':{colors:['U','G']},
    'Watery Grave':{colors:['U','B']},'Yavimaya, Cradle of Growth':{colors:['G']},
    'Fell the Profane':{colors:['B'],tapped:true,mdfc:true},'Sea Gate Restoration':{colors:['U'],mdfc:true}
  };

  const clamp=(n,min=0,max=100)=>Math.max(min,Math.min(max,n));
  const uniq=a=>[...new Set(a)];
  const pct=n=>`${Math.round(clamp(n,0,1)*100)}%`;
  const colorName=c=>COLOR_NAMES[c]||c;

  function cardMeta(name){return meta.get(name)||null}
  function cardText(name){
    const m=cardMeta(name);if(!m)return'';
    if(m.faces?.length)return m.faces.map(f=>f.text||'').join('\n');
    return m.text||'';
  }
  function cardMana(name){
    const m=cardMeta(name);if(!m)return'';
    if(m.mana)return m.mana;
    return m.faces?.find(f=>f.mana)?.mana||'';
  }
  function manaValue(name){
    const cost=cardMana(name);if(!cost)return 0;
    let total=0;
    for(const m of cost.matchAll(/\{([^}]+)\}/g)){
      const t=m[1];
      if(/^\d+$/.test(t))total+=+t;
      else if(t==='X'||/P/.test(t))continue;
      else total+=1;
    }
    return total;
  }
  function coloredPips(name){
    const out={U:0,B:0,G:0};
    for(const m of cardMana(name).matchAll(/\{([^}]+)\}/g)){
      const t=m[1];
      for(const c of COLORS){if(t===c||t.split('/').includes(c))out[c]++}
    }
    return out;
  }
  function parseAddColors(text=''){
    const found=new Set();
    for(const match of text.matchAll(/Add\s+([^\.\n]+)/gi)){
      for(const m of match[1].matchAll(/\{([WUBRGC])\}/g))found.add(m[1]);
      if(/any color/i.test(match[1]))COLORS.forEach(c=>found.add(c));
    }
    return [...found];
  }
  function landProfile(name){
    if(['Misty Rainforest','Polluted Delta','Verdant Catacombs'].includes(name))return{name,colors:[...COLORS],fetch:true};
    if(FIXED_LANDS[name])return{name,...FIXED_LANDS[name]};
    const m=cardMeta(name);
    const face=m?.faces?.find(f=>/Land/.test(f.type||''))||(/Land/.test(m?.type||'')?m:null);
    if(!face)return{name,colors:[],weak:true};
    const text=face.text||'';
    const type=face.type||'';
    const colors=parseAddColors(text);
    if(/Island/.test(type))colors.push('U');if(/Swamp/.test(type))colors.push('B');if(/Forest/.test(type))colors.push('G');
    const unique=uniq(colors);
    return{
      name,colors:unique,
      tapped:/enters (?:the battlefield )?tapped/i.test(text)&&!/unless|you may pay|two or more opponents/i.test(text),
      weak:!unique.some(c=>COLORS.includes(c))
    };
  }
  function directColorOuts(color){
    return st.lib.filter(n=>LAND.has(n)&&landProfile(n).colors.includes(color)).length;
  }
  function chanceAtLeast(successes,population,draws,needed=1){
    draws=Math.min(draws,population);if(needed<=0)return 1;if(successes<=0||draws<=0)return 0;
    function combRatio(k){
      if(k<0||k>successes||draws-k>population-successes)return 0;
      let p=1;
      for(let i=0;i<k;i++)p*=((successes-i)/(i+1));
      for(let i=0;i<draws-k;i++)p*=((population-successes-i)/(i+1));
      let denom=1;
      for(let i=0;i<draws;i++)denom*=((population-i)/(i+1));
      return denom? p/denom:0;
    }
    let sum=0;for(let k=needed;k<=Math.min(successes,draws);k++)sum+=combRatio(k);
    return clamp(sum,0,1);
  }
  function landDrawOdds(landsInHand){
    const pop=st.lib.length,landOuts=st.lib.filter(n=>LAND.has(n)).length;
    const needForThree=Math.max(0,3-landsInHand);
    return{
      landOuts,
      hitOneT2:chanceAtLeast(landOuts,pop,2,1),
      hitOneT3:chanceAtLeast(landOuts,pop,3,1),
      reachThreeT3:chanceAtLeast(landOuts,pop,3,needForThree)
    };
  }
  function pipPressure(hand,lands){
    const demand={U:0,B:0,G:0};
    hand.filter(n=>!LAND.has(n)&&manaValue(n)<=4).forEach(n=>{
      const p=coloredPips(n);COLORS.forEach(c=>demand[c]+=p[c]);
    });
    const access={U:0,B:0,G:0};
    lands.forEach(n=>landProfile(n).colors.forEach(c=>{if(access[c]!==undefined)access[c]++}));
    const stressed=COLORS.filter(c=>demand[c]>=2&&access[c]===0);
    const thin=COLORS.filter(c=>demand[c]>=2&&access[c]===1);
    return{demand,access,stressed,thin};
  }
  function synergyData(hand){
    const pairs=[];
    if(typeof CONTEXT_SYNERGY_PAIRS!=='undefined'){
      for(const [a,b,desc] of CONTEXT_SYNERGY_PAIRS){
        if(hand.includes(a)&&hand.includes(b))pairs.push({a,b,desc});
      }
    }
    const active=new Set([...hand,commander]);
    const routes=(typeof ROUTES!=='undefined'?ROUTES:[]).map(([name,pieces,desc])=>{
      const have=pieces.filter(p=>active.has(p)),missing=pieces.filter(p=>!active.has(p));
      return{name,pieces,desc,have,missing,ratio:have.length/pieces.length};
    }).sort((a,b)=>b.ratio-a.ratio||b.have.length-a.have.length);
    return{pairs,routes,best:routes[0]||null};
  }
  function advantageData(hand,legacy){
    const engines=uniq(hand.filter(n=>legacy.e.includes(n)||DRAW_ENGINES.has(n)||/draw (?:a|two|three|that many) card/i.test(cardText(n))));
    const tutors=legacy.t.map(n=>({name:n,quality:FLEX_TUTOR_QUALITY[n]||5,turn:legacy.early?.find(x=>x.n===n)?.turn||null}));
    const selection=uniq(hand.filter(n=>/scry|surveil|look at the top|rearrange|top three|draw.*put/i.test(cardText(n))||["Sensei's Divining Top","Mirri's Guile",'Brainstorm','Sylvan Library'].includes(n)));
    return{engines,tutors,selection};
  }
  function interactionData(hand,legacy){
    const cards=legacy.i;
    const live=cards.filter(n=>{const t=legacy.early?.find(x=>x.n===n)?.turn;return t&&t<=2});
    const reliable=live.filter(n=>!CONDITIONAL_INTERACTION.has(n));
    const conditional=live.filter(n=>CONDITIONAL_INTERACTION.has(n));
    const protection=hand.filter(n=>PROTECTION.has(n));
    return{cards,live,reliable,conditional,protection};
  }
  function curveData(hand,legacy){
    const spells=hand.filter(n=>!LAND.has(n));
    const mvs=spells.map(n=>({name:n,mv:manaValue(n)}));
    const expensive=mvs.filter(x=>x.mv>=5),veryExpensive=mvs.filter(x=>x.mv>=7);
    const cheap=mvs.filter(x=>x.mv>0&&x.mv<=2);
    const knownEarly=new Map((legacy.early||[]).map(x=>[x.n,x.turn]));
    const stranded=mvs.filter(x=>{
      if(knownEarly.has(x.name))return !knownEarly.get(x.name)||knownEarly.get(x.name)>3;
      return x.mv>=5&&legacy.cmdTurn!==2;
    });
    const avg=mvs.length?mvs.reduce((s,x)=>s+x.mv,0)/mvs.length:0;
    return{spells,mvs,expensive,veryExpensive,cheap,stranded,avg};
  }
  function buildTurnPlan(hand,legacy,synergy,interaction){
    const used=new Set();
    const turns=[];
    const line=legacy.line||{};
    let t1=line.text||'Play your best land.';
    if(line.kind==='dork'&&line.dork)used.add(line.dork);
    if(line.kind==='exploration')used.add('Exploration');
    if(line.kind==='top')used.add("Sensei's Divining Top");
    if(line.kind==='solsignet'){used.add('Sol Ring');used.add('Arcane Signet')}
    turns.push({turn:1,text:t1,quality:line.kind==='none'?0:line.kind==='land'?1:2});

    const priority=n=>{
      let p=0;if(RAMP.has(n))p+=8;if(ENG.has(n)||DRAW_ENGINES.has(n))p+=7;if(TUTOR.has(n))p+=6;
      if(COMBO.has(n))p+=3;p-=Math.max(0,manaValue(n)-4);return p;
    };
    const early=(legacy.early||[]).filter(x=>x.turn&&x.turn<=3&&!used.has(x.n)).sort((a,b)=>a.turn-b.turn||priority(b.n)-priority(a.n));
    const takeEarly=maxTurn=>{
      const idx=early.findIndex(x=>x.turn<=maxTurn&&!used.has(x.n));
      if(idx<0)return null;const x=early.splice(idx,1)[0];used.add(x.n);return x.n;
    };

    if(legacy.cmdTurn===2){turns.push({turn:2,text:`Cast ${commander}. Your engine is online early.`,quality:3});}
    else{
      const play=takeEarly(2);
      turns.push({turn:2,text:play?`Develop ${play} while fixing toward the commander.`:'Make the second land drop and preserve flexibility; the hand has no strong proactive turn-2 play.',quality:play?2:0});
    }

    if(legacy.cmdTurn===3){turns.push({turn:3,text:`Cast ${commander}. The first two turns are setting up the required colors.`,quality:3});}
    else if(legacy.cmdTurn===2){
      const play=takeEarly(3);
      const hold=interaction.live.find(n=>!used.has(n));
      turns.push({turn:3,text:play?`Use Glarb, then develop ${play}${hold?` while keeping ${hold} in mind as interaction`:''}.`:`Use Glarb to improve the top of the library${hold?` and keep ${hold} available`:''}.`,quality:play||hold?2:1});
    }else{
      const play=takeEarly(3);
      turns.push({turn:3,text:play?`Develop ${play}, but the commander is still delayed.`:'The hand is still searching for a coherent engine or the missing commander colors.',quality:play?1:0});
    }

    const best=synergy.best;
    let t4;
    if(best&&best.have.length>=2&&best.missing.length)t4=`Start converting the board toward ${best.name}. Missing ${best.missing.slice(0,2).join(' + ')}.`;
    else if(best&&best.missing.length===0)t4=`You already have access to every piece of ${best.name}; protect the setup and choose the safest window.`;
    else{
      const next=takeEarly(3);t4=next?`Continue development with ${next} and keep interaction available.`:'Use card selection/tutors to turn the developed mana into an engine or win route.';
    }
    turns.push({turn:4,text:t4,quality:best?.have.length>=2?2:1});
    return turns;
  }
  function scoreMana(hand,lands,legacy,odds,pips){
    let s=50;
    if(lands.length===0)s-=50;else if(lands.length===1)s-=30;else if(lands.length===2)s+=12;else if(lands.length===3)s+=22;else if(lands.length===4)s+=10;else s-=10;
    const profiles=lands.map(landProfile),tapped=profiles.filter(p=>p.tapped).length,weak=profiles.filter(p=>p.weak).length;
    s-=tapped*5+weak*7;
    if(legacy.missingColors.length===0)s+=15;else if(legacy.missingColors.length===1)s-=7;else s-=20;
    if(legacy.cmdTurn===2)s+=8;else if(legacy.cmdTurn===3)s+=4;
    s-=pips.stressed.length*10+pips.thin.length*3;
    if(lands.length<3)s+=(odds.reachThreeT3-.5)*18;
    return clamp(s);
  }
  function scoreSequence(legacy,turnPlan){
    let s=28+turnPlan.reduce((sum,t)=>sum+t.quality*8,0);
    if(legacy.cmdTurn===2)s+=20;else if(legacy.cmdTurn===3)s+=12;else s-=16;
    const live=(legacy.early||[]).filter(x=>x.turn&&x.turn<=2).length;s+=Math.min(12,live*4);
    if(legacy.line?.kind==='none')s-=15;
    return clamp(s);
  }
  function scoreCastability(curve,legacy){
    let s=72;
    s-=curve.stranded.length*10+curve.veryExpensive.length*5;
    if(curve.cheap.length)s+=6;
    if(curve.avg>5)s-=10;else if(curve.avg>0&&curve.avg<=3.5)s+=5;
    const live=(legacy.early||[]).filter(x=>x.turn&&x.turn<=3).length;s+=Math.min(12,live*3);
    return clamp(s);
  }
  function scoreAdvantage(adv,legacy){
    let s=35+Math.min(30,adv.engines.length*12)+Math.min(24,adv.tutors.reduce((n,t)=>n+(t.turn&&t.turn<=3?t.quality:Math.ceil(t.quality/2)),0));
    s+=Math.min(12,adv.selection.length*5);
    if(!adv.engines.length&&!adv.tutors.length)s-=8;
    return clamp(s);
  }
  function scoreInteraction(intx){
    let s=32+intx.reliable.length*18+intx.conditional.length*9+Math.min(18,intx.protection.length*9);
    if(!intx.cards.length)s-=12;
    return clamp(s);
  }
  function scoreSynergy(syn,hand){
    let s=28+Math.min(30,syn.pairs.length*9);
    if(syn.best)s+=syn.best.ratio*35;
    const combo=hand.filter(n=>COMBO.has(n));
    if(combo.length>=2)s+=8;
    if(combo.length===1&&!syn.pairs.some(p=>p.a===combo[0]||p.b===combo[0])&&manaValue(combo[0])>=5)s-=8;
    return clamp(s);
  }
  function scoreResilience(adv,intx,syn,legacy){
    const independent=uniq([...adv.engines,...adv.tutors.map(x=>x.name)]).length;
    let s=38+Math.min(25,independent*7)+Math.min(18,intx.protection.length*9);
    if(legacy.cmdTurn&&independent>=2)s+=8;
    if(independent<=1&&syn.best?.ratio>=.66&&!intx.protection.length)s-=12;
    return clamp(s);
  }
  function makeReasons(data){
    const {lands,legacy,odds,pips,curve,adv,intx,syn}=data;
    const reasons=[];
    const add=(kind,text,weight)=>reasons.push({kind,text,weight});
    if(lands.length===0)add('bad','No land in the opening hand. The hand cannot begin executing a plan without immediately drawing mana.',20);
    else if(lands.length===1)add('bad',`Only one land. You have ${pct(odds.hitOneT2)} to see at least one land in the next two draw steps, but the hand remains high variance.`,16);
    else if(lands.length===2)add('mid',`Two lands is functional but draw-dependent. Chance to reach three lands by turn 3 from natural draws: ${pct(odds.reachThreeT3)}.`,9);
    else if(lands.length===3)add('good','Three lands gives the hand a stable natural development floor.',10);
    else if(lands.length>=5)add('bad',`${lands.length} lands raises flood risk and reduces the amount of action in the opener.`,10);

    if(!legacy.missingColors.length)add('good','The current mana plan reaches blue, black, and green by turn 3.',14);
    else{
      const outs=legacy.missingColors.map(c=>`${colorName(c)} ${directColorOuts(c)} outs`).join(', ');
      add('bad',`Color access is incomplete: missing ${legacy.missingColors.map(colorName).join(' / ')}. Remaining direct land sources: ${outs}.`,14);
    }
    if(pips.stressed.length)add('bad',`Colored-pip pressure is real: ${pips.stressed.map(colorName).join(' / ')} appears repeatedly in cheap spells but has no direct land source in hand.`,10);
    else if(pips.thin.length)add('mid',`The hand leans heavily on ${pips.thin.map(colorName).join(' / ')} while currently showing only one direct source.`,6);

    if(legacy.cmdTurn===2)add('good',`${commander} is realistically available on turn 2, which sharply raises the hand's ceiling.`,16);
    else if(legacy.cmdTurn===3)add('good',`${commander} is realistically available on turn 3 without needing a perfect topdeck.`,12);
    else add('bad',`${commander} is not reliably castable by turn 3 with the current seven.`,16);

    const earlyLive=(legacy.early||[]).filter(x=>x.turn&&x.turn<=2);
    if(earlyLive.length)add('good',`Early live cards: ${earlyLive.slice(0,3).map(x=>`${x.n} (T${x.turn})`).join(', ')}.`,8);
    if(curve.stranded.length>=2)add('bad',`${curve.stranded.length} nonland cards are effectively stranded or late with the mana this hand currently presents.`,11);
    if(adv.engines.length)add('good',`Card flow/selection is present through ${adv.engines.slice(0,3).join(', ')}.`,8);
    if(adv.tutors.some(t=>t.turn&&t.turn<=3))add('good','A tutor is live by turn 3, so the hand can convert development into the missing piece instead of relying only on draw steps.',9);

    if(intx.reliable.length)add('good',`Reliable early interaction: ${intx.reliable.join(', ')}.`,9);
    else if(intx.conditional.length)add('mid',`Interaction exists, but ${intx.conditional.join(', ')} depends on alternate-cost or table conditions.`,6);
    else if(!intx.cards.length)add('bad','No mapped interaction in the opener. A faster table can punish a hand that only develops its own plan.',8);
    if(intx.protection.length)add('good',`Protection/resilience is improved by ${intx.protection.join(', ')}.`,7);

    if(syn.pairs.length)add('good',`${syn.pairs.length} mapped synergy ${syn.pairs.length===1?'pair is':'pairs are'} already present in the hand.`,8);
    if(syn.best?.have.length>=2)add('good',`${syn.best.name}: ${syn.best.have.length}/${syn.best.pieces.length} pieces are already accessible from the opener/command zone.`,10);
    if(st.m>0)add('mid',`Mulligan context matters: this is mulligan ${st.m}. The keep threshold is slightly lower because another mulligan costs card quality.`,5);

    return reasons.sort((a,b)=>b.weight-a.weight).slice(0,10).map(r=>[r.kind==='good'?'✓':r.kind==='bad'?'!':'•',r.text]);
  }
  function riskData(data){
    const {lands,odds,legacy,curve,scores}=data;
    const items=[];
    if(lands.length<3)items.push({label:'Land development',value:`${pct(odds.reachThreeT3)} chance to reach 3 lands by turn 3 from natural draws`});
    if(legacy.missingColors.length){
      const pop=st.lib.length;
      const union=st.lib.filter(n=>LAND.has(n)&&legacy.missingColors.some(c=>landProfile(n).colors.includes(c))).length;
      items.push({label:'Color fix',value:`${pct(chanceAtLeast(union,pop,3,1))} chance to draw a direct missing-color land by turn 3`});
    }else items.push({label:'Color fix',value:'No immediate color hole in the current mana plan'});
    const floor=Math.round((scores.mana+scores.castability+scores.interaction)/3);
    const ceiling=Math.round((scores.sequence+scores.advantage+scores.synergy)/3);
    const variance=clamp(Math.abs(ceiling-floor)+(lands.length<=1?25:0)+(legacy.missingColors.length?12:0)+(curve.stranded.length*3));
    items.push({label:'Floor',value:`${floor}/100 · how functional the hand remains with ordinary draws`});
    items.push({label:'Ceiling',value:`${ceiling}/100 · how strongly the hand can snowball when its line develops`});
    items.push({label:'Variance',value:`${Math.round(variance)}/100 · ${variance>=55?'high':variance>=32?'medium':'low'} dependence on sequencing or future draws`});
    return{items,floor,ceiling,variance};
  }
  function verdict(score,mulls){
    const shift=Math.min(10,mulls*3);
    if(score>=84-shift/2)return'Strong keep';
    if(score>=70-shift)return'Keep';
    if(score>=56-shift)return'Contextual keep';
    if(score>=42-shift)return'Lean mulligan';
    return'Mulligan';
  }
  function analyzeExpert(){
    const legacy=legacyAnalyze();
    const hand=[...st.hand],lands=hand.filter(n=>LAND.has(n));
    const odds=landDrawOdds(lands.length),pips=pipPressure(hand,lands),curve=curveData(hand,legacy);
    const adv=advantageData(hand,legacy),intx=interactionData(hand,legacy),syn=synergyData(hand);
    const turnPlan=buildTurnPlan(hand,legacy,syn,intx);
    const scores={
      mana:scoreMana(hand,lands,legacy,odds,pips),
      sequence:scoreSequence(legacy,turnPlan),
      castability:scoreCastability(curve,legacy),
      advantage:scoreAdvantage(adv,legacy),
      interaction:scoreInteraction(intx),
      synergy:scoreSynergy(syn,hand),
      resilience:0
    };
    scores.resilience=scoreResilience(adv,intx,syn,legacy);
    const weighted=scores.mana*.24+scores.sequence*.20+scores.castability*.14+scores.advantage*.12+scores.interaction*.11+scores.synergy*.11+scores.resilience*.08;
    const s=Math.round(clamp(weighted*.86+legacy.s*.14,5,97));
    const v=verdict(s,st.m);
    const data={hand,lands,legacy,odds,pips,curve,adv,intx,syn,turnPlan,scores};
    const sg=makeReasons(data);
    const risk=riskData(data);data.risk=risk;
    const missingColors=legacy.missingColors||[];
    let nextNeed=legacy.nextNeed;
    if(!nextNeed&&syn.best?.missing.length)nextNeed=`Highest-progress route: ${syn.best.name}. Look for ${syn.best.missing.slice(0,2).join(' or ')}.`;
    if(!nextNeed&&intx.cards.length===0)nextNeed='Interaction or protection that lets the developed engine survive a faster table.';
    if(!nextNeed)nextNeed='A card that improves the highest-progress route without sacrificing interaction.';
    return{
      ...legacy,s,v,sg,missingColors,nextNeed,
      expert:{scores,turnPlan,risk,curve,advantage:adv,interaction:intx,synergy:syn,odds,pips}
    };
  }

  function factorRow(label,value,detail){
    return `<div class="expert-factor"><div class="expert-factor-head"><span>${esc(label)}</span><strong>${Math.round(value)}</strong></div><div class="expert-meter"><span style="width:${clamp(value)}%"></span></div><div class="expert-factor-detail">${esc(detail)}</div></div>`;
  }
  function renderExpertExtras(a){
    if(!a.expert)return;
    const x=a.expert;
    const scorecard=$('scorecard');
    if(scorecard){
      scorecard.innerHTML=
        factorRow('Mana & colors',x.scores.mana,'Land count, source quality, colored pips, tapped lands, and draw odds.')+
        factorRow('Turn sequencing',x.scores.sequence,'How coherently turns 1–4 develop and how early the commander comes online.')+
        factorRow('Castability & curve',x.scores.castability,'How many cards are live early versus stranded by mana value or colors.')+
        factorRow('Cards & tutors',x.scores.advantage,'Selection, draw engines, tutors, and ability to keep generating material.')+
        factorRow('Interaction',x.scores.interaction,'Early answers, conditional free interaction, and protection.')+
        factorRow('Synergy & routes',x.scores.synergy,'Mapped card interactions and proximity to real win routes.')+
        factorRow('Resilience',x.scores.resilience,'Redundant engines, protection, and ability to continue after disruption.');
    }
    const plan=$('turnPlan');
    if(plan)plan.innerHTML=x.turnPlan.map(t=>`<div class="expert-turn"><span class="expert-turn-num">T${t.turn}</span><p>${esc(t.text)}</p></div>`).join('');
    const risk=$('riskOdds');
    if(risk)risk.innerHTML=x.risk.items.map(i=>`<div class="expert-risk"><span>${esc(i.label)}</span><strong>${esc(i.value)}</strong></div>`).join('');
    const signals=$('signals');
    if(signals)signals.innerHTML=a.sg.map(x=>`<div class="signal">${x[0]} ${esc(x[1])}</div>`).join('');

    const topStrength=Object.entries(x.scores).sort((a,b)=>b[1]-a[1])[0];
    const topWeakness=Object.entries(x.scores).sort((a,b)=>a[1]-b[1])[0];
    const names={mana:'mana/color quality',sequence:'turn sequencing',castability:'castability',advantage:'card flow/tutors',interaction:'interaction',synergy:'synergy',resilience:'resilience'};
    const cmd=a.cmdTurn?`${commander} is online on turn ${a.cmdTurn}`:`${commander} is not reliably online by turn 3`;
    $('summary').textContent=`${st.choice?`You chose ${st.choice.toUpperCase()}. `:''}${cmd}. Best dimension: ${names[topStrength[0]]} (${Math.round(topStrength[1])}). Main weakness: ${names[topWeakness[0]]} (${Math.round(topWeakness[1])}).`;
  }

  analyze=analyzeExpert;
  renderCoach=function(){
    legacyRenderCoach();
    if(!st.reveal)return;
    const a=analyzeExpert();
    $('score').textContent=a.s;$('verdict').textContent=a.v;
    if($('next'))$('next').textContent=a.nextNeed;
    renderExpertExtras(a);
  };
})();