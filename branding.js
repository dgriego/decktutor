(()=>{
  const baseRender=render;
  function applyBranding(){
    document.title='Deck Tutor';
    const title=$('title');
    if(title) title.textContent='Deck Tutor';
    const deckContext=$('deckContext');
    if(deckContext) deckContext.textContent=deckName;
    const logo=document.querySelector('.logo');
    if(logo) logo.textContent='D';
  }
  render=function(){
    baseRender();
    applyBranding();
  };
  applyBranding();
})();
