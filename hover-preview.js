(()=>{
  const preview=document.createElement('div');
  preview.className='hover-card-preview';
  preview.setAttribute('aria-hidden','true');
  document.body.appendChild(preview);

  let active=null;
  let hideTimer=null;

  function hide(){
    active=null;
    clearTimeout(hideTimer);
    preview.classList.remove('visible');
  }

  function positionPreview(card){
    const source=card.querySelector('img');
    if(!source?.src)return hide();
    const rect=card.getBoundingClientRect();
    const table=document.querySelector('.table')?.getBoundingClientRect();
    const safeLeft=12;
    const safeRight=(table?.right||window.innerWidth)-12;
    const safeTop=Math.max(76,(document.querySelector('.top')?.getBoundingClientRect().bottom||68)+10);
    const maxHeight=Math.max(300,window.innerHeight-safeTop-28);
    let width=Math.max(255,Math.min(330,rect.width*2.05));
    width=Math.min(width,maxHeight*(488/680));
    const height=width*(680/488);
    let left=rect.left+rect.width/2-width/2;
    left=Math.max(safeLeft,Math.min(left,safeRight-width));
    let top=rect.top-height-16;
    if(top<safeTop)top=safeTop;

    preview.style.width=`${width}px`;
    preview.style.left=`${Math.round(left)}px`;
    preview.style.top=`${Math.round(top)}px`;
    preview.innerHTML=`<img src="${source.src}" alt=""><div class="hover-card-label">${card.dataset.card||source.alt||''}</div>`;
    requestAnimationFrame(()=>preview.classList.add('visible'));
  }

  function show(card){
    clearTimeout(hideTimer);
    active=card;
    positionPreview(card);
  }

  document.addEventListener('mouseover',e=>{
    const card=e.target.closest?.('.hand .card');
    if(!card||card===active)return;
    show(card);
  });

  document.addEventListener('mouseout',e=>{
    const card=e.target.closest?.('.hand .card');
    if(!card||card!==active)return;
    const next=e.relatedTarget;
    if(next&&card.contains(next))return;
    hideTimer=setTimeout(hide,55);
  });

  document.addEventListener('dragstart',hide,true);
  window.addEventListener('resize',()=>active?positionPreview(active):null);
  window.addEventListener('scroll',()=>active?positionPreview(active):null,true);
})();