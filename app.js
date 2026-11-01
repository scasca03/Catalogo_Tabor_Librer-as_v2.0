const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const FALLBACK_COVER = 'assets/cover-fallback.svg';
let catalog = null;
let originalBooks = [];
let positionMap = new Map();
let activeCategory = 'ALL';
let activeBook = null;
let searchTerm = '';
let sortMode = 'catalog';

const rootEl = document.documentElement;
function syncDeviceViewport() {
  const vv = window.visualViewport;
  const width = Math.round(vv?.width || window.innerWidth);
  const height = Math.round(vv?.height || window.innerHeight);
  rootEl.style.setProperty('--visual-height', `${height}px`);
  rootEl.style.setProperty('--visual-width', `${width}px`);
  rootEl.dataset.orientation = width > height ? 'landscape' : 'portrait';
}
syncDeviceViewport();
window.addEventListener('resize', syncDeviceViewport, {passive:true});
window.addEventListener('orientationchange', syncDeviceViewport, {passive:true});
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', syncDeviceViewport, {passive:true});
  window.visualViewport.addEventListener('scroll', syncDeviceViewport, {passive:true});
}

function normalizeText(value='') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-ES').replace(/\s+/g,' ').trim();
}
function esc(value='') {
  return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
function titleCaseCategory(value='') {
  const small = new Set(['y','de','del','la','las','el','los','en','para','a']);
  return value.toLocaleLowerCase('es-ES').split(/\s+/).map((w,i)=> i && small.has(w) ? w : w.charAt(0).toLocaleUpperCase('es-ES')+w.slice(1)).join(' ');
}
function whatsappUrl(message) { return `https://wa.me/${catalog.contact.whatsapp}?text=${encodeURIComponent(message)}`; }
function generalWhatsappMessage() { return 'Hola, quisiera hacer una consulta sobre el catálogo de TABOR.'; }
function bookWhatsappMessage(book) { return `Hola, quisiera consultar por el libro «${book.title}», de ${book.author}, del catálogo de TABOR.`; }
function bookUrl(book) { return `${location.origin}${location.pathname}${location.search}#${encodeURIComponent(book.id)}`; }
function showToast(message) { const t=$('#toast'); t.textContent=message; t.classList.add('show'); clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>t.classList.remove('show'),2400); }
async function sharePayload(payload) {
  if (navigator.share) { try { await navigator.share(payload); return; } catch(e) { if (e.name==='AbortError') return; } }
  try { await navigator.clipboard.writeText(payload.url || location.href); showToast('Enlace copiado'); }
  catch { showToast('Copia el enlace desde la barra del navegador'); }
}
function setBrokenImageFallback(img) {
  img.addEventListener('error',()=>{ if (!img.dataset.fallback) { img.dataset.fallback='1'; img.src=FALLBACK_COVER; } });
}
function categoriesWithCounts() {
  const m = new Map(); originalBooks.forEach(b=>m.set(b.category,(m.get(b.category)||0)+1)); return [...m.entries()];
}
function renderMeta() {
  const {meta,contact}=catalog;
  $('#heroSubtitle').textContent=meta.subtitle;
  $('#selectionNote').textContent=meta.selectionNote;
  $('#selectionCtaText').textContent=meta.selectionNote;
  $('#statBooks').textContent=originalBooks.length;
  $('#heroBookCount').textContent=originalBooks.length;
  $('#statCategories').textContent=categoriesWithCounts().length;
  $('#statUpdated').textContent=meta.updated;
  $('#footerSubtitle').textContent=meta.subtitle.charAt(0)+meta.subtitle.slice(1).toLocaleLowerCase('es-ES');
  $('#footerUpdate').textContent=`Catálogo actualizado: ${meta.updated}`;
  const w=whatsappUrl(generalWhatsappMessage());
  ['heroWhatsapp','selectionWhatsapp','floatingWhatsapp'].forEach(id=>$('#'+id).href=w);
  $('#emptyWhatsapp').addEventListener('click',()=>window.open(w,'_blank','noopener'));
  renderContact(contact);
}
function renderHeroCovers() {
  const preferred=['camino','los-7-habitos-de-las-familias-altamente-efectivas','lo-primero-es-el-amor'];
  const picks=preferred.map(id=>originalBooks.find(b=>b.id===id)).filter(Boolean);
  for (const b of originalBooks) { if (picks.length>=3) break; if(!picks.includes(b)) picks.push(b); }
  const wrap=$('#heroCovers');
  wrap.innerHTML=picks.slice(0,3).map(b=>`<div class="hero-cover"><img src="${esc(b.cover)}" alt=""></div>`).join('');
  $$('img',wrap).forEach(setBrokenImageFallback);
}
function renderTopics() {
  const categories=categoriesWithCounts();
  $('#topicGrid').innerHTML=categories.map(([cat,count],i)=>`<button class="topic-card" type="button" data-category="${esc(cat)}"><span class="topic-icon">${String(i+1).padStart(2,'0')}</span><strong>${esc(titleCaseCategory(cat))}</strong><span>${count} ${count===1?'título':'títulos'}</span></button>`).join('');
  $$('.topic-card').forEach(btn=>btn.addEventListener('click',()=>{setCategory(btn.dataset.category); $('#catalogo').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}));
}
function renderFilters() {
  const categories=categoriesWithCounts();
  $('#filterChips').innerHTML=`<button class="filter-chip active" type="button" data-category="ALL">Todos <span>${originalBooks.length}</span></button>` + categories.map(([cat,count])=>`<button class="filter-chip" type="button" data-category="${esc(cat)}">${esc(titleCaseCategory(cat))} <span>${count}</span></button>`).join('');
  $$('.filter-chip').forEach(btn=>btn.addEventListener('click',()=>setCategory(btn.dataset.category)));
}
function setCategory(category) {
  activeCategory=category;
  $$('.filter-chip').forEach(b=>b.classList.toggle('active',b.dataset.category===category));
  renderBooks();
}
function currentBooks() {
  let list=originalBooks.filter(book=>{
    const inCat=activeCategory==='ALL'||book.category===activeCategory;
    const hay=normalizeText([book.title,book.author,book.category,book.description].join(' '));
    const terms=searchTerm.split(' ').filter(Boolean);
    return inCat && (!terms.length || terms.every(term=>hay.includes(term)));
  });
  if(sortMode==='title') list.sort((a,b)=>a.title.localeCompare(b.title,'es',{sensitivity:'base'}));
  if(sortMode==='author') list.sort((a,b)=>a.author.localeCompare(b.author,'es',{sensitivity:'base'}));
  return list;
}
function bookCard(book) {
  const n=String(positionMap.get(book.id)).padStart(2,'0');
  const wa=whatsappUrl(bookWhatsappMessage(book));
  return `<article class="book-card" id="book-${esc(book.id)}" data-id="${esc(book.id)}" tabindex="0" role="button" aria-label="Ver detalle de ${esc(book.title)}">
    <div class="book-visual"><span class="book-number">${n}</span><img loading="lazy" decoding="async" src="${esc(book.cover)}" alt="Portada de ${esc(book.title)}"></div>
    <div class="book-content"><div class="eyebrow">${esc(titleCaseCategory(book.category))}</div><h3>${esc(book.title)}</h3><div class="author">${esc(book.author)}</div><p>${esc(book.description)}</p>
      <div class="book-actions"><button class="btn btn-ghost detail-book" type="button" data-id="${esc(book.id)}">Ver libro</button><a class="btn btn-mini" href="${wa}" target="_blank" rel="noopener">WhatsApp</a><button class="btn btn-ghost share-book" type="button" data-id="${esc(book.id)}" aria-label="Compartir ${esc(book.title)}">Compartir</button></div>
    </div></article>`;
}
function renderBooks() {
  const list=currentBooks(); const grid=$('#booksGrid');
  grid.innerHTML=list.map(bookCard).join('');
  $('#emptyState').hidden=list.length!==0;
  const catLabel=activeCategory==='ALL'?'todas las temáticas':titleCaseCategory(activeCategory);
  $('#resultsMeta').innerHTML=`Mostrando <strong>${list.length}</strong> de ${originalBooks.length} libros · ${esc(catLabel)}`;
  $$('img',grid).forEach(setBrokenImageFallback);
  $$('.detail-book',grid).forEach(btn=>btn.addEventListener('click',()=>navigateToBook(btn.dataset.id)));
  $$('.share-book',grid).forEach(btn=>btn.addEventListener('click',()=>shareBook(originalBooks.find(b=>b.id===btn.dataset.id))));
  $$('.book-card',grid).forEach(card=>{
    const open=()=>navigateToBook(card.dataset.id);
    card.addEventListener('click',e=>{ if(!e.target.closest('button,a')) open(); });
    card.addEventListener('keydown',e=>{ if((e.key==='Enter'||e.key===' ')&&!e.target.closest('button,a')){e.preventDefault();open();} });
  });
}
function renderContact(c) {
  const mapUrl=`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}`;
  $('#contactCards').innerHTML=`
    <a class="contact-card" href="${whatsappUrl(generalWhatsappMessage())}" target="_blank" rel="noopener"><small>WhatsApp</small><strong>${esc(c.whatsappDisplay)}</strong><span>Escríbenos una consulta</span></a>
    <a class="contact-card" href="mailto:${esc(c.email)}"><small>Email</small><strong>${esc(c.email)}</strong><span>Enviar correo</span></a>
    <a class="contact-card" href="tel:${esc(c.phone)}"><small>Teléfono</small><strong>${esc(c.phone)}</strong><span>Llamar a la librería</span></a>
    <a class="contact-card" href="${mapUrl}" target="_blank" rel="noopener"><small>Dirección</small><strong>${esc(c.address)}</strong><span>Abrir en Maps</span></a>`;
}
function navigateToBook(id) {
  const book=originalBooks.find(b=>b.id===id); if(!book) return;
  if(location.hash.slice(1)!==encodeURIComponent(id)) history.pushState({book:id},'',`#${encodeURIComponent(id)}`);
  openBook(book);
}
function openBook(book) {
  activeBook=book; const n=String(positionMap.get(book.id)).padStart(2,'0');
  $('#modalCover').src=book.cover; $('#modalCover').alt=`Portada de ${book.title}`; $('#modalCover').dataset.fallback='';
  $('#modalNumber').textContent=n; $('#modalCategory').textContent=titleCaseCategory(book.category); $('#modalTitle').textContent=book.title; $('#modalAuthor').textContent=book.author; $('#modalDescription').textContent=book.description;
  $('#modalWhatsapp').href=whatsappUrl(bookWhatsappMessage(book));
  $('#modalEmail').href=`mailto:${catalog.contact.email}?subject=${encodeURIComponent('Consulta sobre '+book.title)}&body=${encodeURIComponent('Hola, quisiera consultar por el libro «'+book.title+'», de '+book.author+'.')}`;
  $('#bookModal').hidden=false; document.body.classList.add('modal-open'); syncDeviceViewport(); if(rootEl.dataset.touch!=='true') $('#modalClose').focus();
}
function closeBook(updateUrl=true) {
  activeBook=null; $('#bookModal').hidden=true; document.body.classList.remove('modal-open');
  if(updateUrl && location.hash) history.pushState({},'',location.pathname+location.search);
}
function openFromHash() {
  const id=decodeURIComponent(location.hash.slice(1)); if(!id){ if(!$('#bookModal').hidden) closeBook(false); return; }
  const book=originalBooks.find(b=>b.id===id); if(book) openBook(book);
}
async function shareBook(book) { if(!book) return; await sharePayload({title:`${book.title} · TABOR`,text:`${book.title}, de ${book.author} — Catálogo TABOR`,url:bookUrl(book)}); }
async function shareCatalog() { await sharePayload({title:'Catálogo General · TABOR',text:'Catálogo general de TABOR Librería y Artículos Religiosos',url:`${location.origin}${location.pathname}`}); }
const SORT_LABELS={catalog:'Orden del catálogo',title:'Título A–Z',author:'Autor A–Z'};
function closeSortMenu(){
  const menu=$('#sortMenu'), trigger=$('#sortTrigger');
  if(!menu||!trigger)return;
  menu.hidden=true; trigger.setAttribute('aria-expanded','false'); $('#sortPicker')?.classList.remove('is-open');
}
function openSortMenu(){
  const menu=$('#sortMenu'), trigger=$('#sortTrigger');
  if(!menu||!trigger)return;
  menu.hidden=false; trigger.setAttribute('aria-expanded','true'); $('#sortPicker')?.classList.add('is-open');
  const selected=$('.sort-option.is-selected'); selected?.focus({preventScroll:true});
}
function syncSortUi(){
  const current=$('#sortCurrent'); if(current) current.textContent=SORT_LABELS[sortMode]||SORT_LABELS.catalog;
  $$('.sort-option').forEach(btn=>{const active=btn.dataset.sort===sortMode;btn.classList.toggle('is-selected',active);btn.setAttribute('aria-selected',String(active));});
}
function setSort(mode){
  sortMode=SORT_LABELS[mode]?mode:'catalog'; syncSortUi(); closeSortMenu(); renderBooks();
}
function wireUi() {
  $('#searchInput').addEventListener('input',e=>{searchTerm=normalizeText(e.target.value);renderBooks();});
  $('#sortTrigger').addEventListener('click',()=>$('#sortMenu').hidden?openSortMenu():closeSortMenu());
  $$('.sort-option').forEach(btn=>btn.addEventListener('click',()=>setSort(btn.dataset.sort)));
  $('#sortMenu').addEventListener('keydown',e=>{
    const options=$$('.sort-option'); const i=options.indexOf(document.activeElement);
    if(e.key==='ArrowDown'){e.preventDefault();options[(i+1+options.length)%options.length].focus();}
    if(e.key==='ArrowUp'){e.preventDefault();options[(i-1+options.length)%options.length].focus();}
    if(e.key==='Home'){e.preventDefault();options[0].focus();}
    if(e.key==='End'){e.preventDefault();options[options.length-1].focus();}
    if(e.key==='Escape'){e.preventDefault();closeSortMenu();$('#sortTrigger').focus();}
  });
  document.addEventListener('pointerdown',e=>{if(!$('#sortPicker')?.contains(e.target))closeSortMenu();});
  $('#emptyReset')?.addEventListener('click',()=>{searchTerm='';activeCategory='ALL';sortMode='catalog';$('#searchInput').value='';syncSortUi();renderFilters();renderBooks();$('#catalogo').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});});
  ['shareCatalogBtn','footerShareBtn'].forEach(id=>$('#'+id).addEventListener('click',shareCatalog));
  $('#modalClose').addEventListener('click',()=>closeBook());
  $('#bookModal').addEventListener('click',e=>{if(e.target===$('#bookModal'))closeBook();});
  $('#modalShare').addEventListener('click',()=>shareBook(activeBook));
  setBrokenImageFallback($('#modalCover'));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#bookModal').hidden)closeBook();});
  window.addEventListener('popstate',openFromHash);
  window.addEventListener('hashchange',openFromHash);
}
async function init() {
  try {
    const response=await fetch('catalogo.json',{cache:'no-store'}); if(!response.ok) throw new Error(`HTTP ${response.status}`);
    catalog=await response.json(); originalBooks=catalog.books||[]; positionMap=new Map(originalBooks.map((b,i)=>[b.id,i+1]));
    renderMeta(); renderHeroCovers(); renderTopics(); renderFilters(); renderBooks(); wireUi(); syncSortUi(); openFromHash();
  } catch(err) {
    console.error(err); $('#booksGrid').innerHTML='<div class="empty-state"><strong>No se pudo cargar el catálogo.</strong><p>Recarga la página. Si el problema continúa, comprueba que <code>catalogo.json</code> esté publicado junto a <code>index.html</code>.</p></div>';
    $('#resultsMeta').textContent='Error al cargar el catálogo';
  }
}
init();
