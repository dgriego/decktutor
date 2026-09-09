(()=>{
  const baseRender=render;
  function applyBranding(){
    document.title='MTGLine';
    const title=$('title');
    if(title) title.textContent='MTGLine';
    const deckContext=$('deckContext');
    if(deckContext) deckContext.textContent=deckName;
    const logo=document.querySelector('.logo');
    if(logo) logo.textContent='ML';
  }
  render=function(){
    baseRender();
    applyBranding();
  };
  applyBranding();
})();
