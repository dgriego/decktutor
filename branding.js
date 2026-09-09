(()=>{
  const baseRender=render;
  function applyBranding(){
    document.title='Deckwise';
    const title=$('title');
    if(title) title.textContent='Deckwise';
    const deckContext=$('deckContext');
    if(deckContext) deckContext.textContent=deckName;
    const logo=document.querySelector('.logo');
    if(logo) logo.textContent='DW';
  }
  render=function(){
    baseRender();
    applyBranding();
  };
  applyBranding();
})();
