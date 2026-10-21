/* Unutilmas Ta'm — 4-catalog
   Avtomatik ajratilgan modul. Tartib MUHIM: index.html dagi ketma-ketlikni buzmang. */

function populateCategorySelect(selectId, selectedId){
  const sel = document.getElementById(selectId);
  if(!sel) return;
  const placeholder = selectedId ? '' : `<option value="" disabled selected>— Turkumni tanlang —</option>`;
  sel.innerHTML = placeholder + (state.categories||[]).map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
  if(selectedId) sel.value = selectedId;
}

 // 'product' | null — where to return focus after adding
function openAddCategoryModal(context){
  addCategoryContext = context||null;
  document.getElementById('acName').value = '';
  renderCategoryManageList();
  openModal('modalAddCategory');
}

async function saveNewCategory(){
  const name = document.getElementById('acName').value.trim();
  if(!name){ alert('Turkum nomini kiriting'); return; }
  const c = {id:uid('c'), name};
  state.categories.push(c);
  await saveState();
  document.getElementById('acName').value = '';
  renderCategoryManageList();
  if(addCategoryContext==='product') populateCategorySelect('npCategory', c.id);
  renderCatalogChips();
  if(document.getElementById('productGrid')) renderProducts();
}

function renderCategoryManageList(){
  const box = document.getElementById('categoryManageList');
  if(!box) return;
  box.innerHTML = (state.categories||[]).map(c=>{
    const count = state.products.filter(p=>p.category===c.id).length;
    return `<div class="sessionRow">
      <span>${c.name}${count?` <span class="smallMuted">(${count} ta mahsulot)</span>`:''}</span>
      <button class="tinyIconBtn danger" onclick="deleteCategory('${c.id}')" title="Turkumni o'chirish">${ic('trash',14)}</button>
    </div>`;
  }).join('') || emptyHtml('box',"Hali turkum yo'q");
}

async function deleteCategory(id){
  if((state.categories||[]).length<=1){ alert("Kamida bitta turkum qolishi kerak."); return; }
  const cat = state.categories.find(c=>c.id===id);
  if(!cat) return;
  const affected = state.products.filter(p=>p.category===id);
  const fallback = state.categories.find(c=>c.id!==id);
  let msg = `"${cat.name}" turkumini o'chirmoqchimisiz?`;
  if(affected.length) msg += `\n\n${affected.length} ta mahsulot shu turkumda edi — ular avtomatik "${fallback.name}" turkumiga ko'chiriladi.`;
  if(!confirm(msg)) return;
  affected.forEach(p=>{ p.category = fallback.id; });
  state.categories = state.categories.filter(c=>c.id!==id);
  await saveState();
  renderCategoryManageList();
  populateCategorySelect('npCategory');
  renderCatalogChips();
  if(document.getElementById('productGrid')) renderProducts();
}

/* MUHIM: tasdiqlanmagan magazin egasi ulgurji narxni KO'RMAYDI.
   Aks holda tasdiqlashning ma'nosi qolmasdi. */
function isStoreBuyer(){
  if(!currentUser) return false;
  if(currentUser.role === 'admin') return false;
  const u = currentUserRecord();
  if(!u || u.userType !== 'store') return false;
  return u.storeStatus === 'approved';
}

function applyHeroText(){
  const si = state.sellerInfo || {};
  const e = document.getElementById('heroEyebrow');
  const t = document.getElementById('heroTitle');
  if(e) e.textContent = si.heroEyebrow || "Unutilmas Ta'm";
  if(t) t.textContent = si.heroTitle || "Har kuni yangi, uydek issiq taomlar";
}

function openProductModal(productId){
  editingProductId = productId;
  pendingImage = null;
  pendingExtraImages = [];
  document.getElementById('npPreorder').checked = false;
  document.getElementById('npMinOrder').value = '';
  document.getElementById('npPreorderNote').value = '';
  togglePreorderFields();
  renderExtraPreview();
  document.getElementById('npImagePreview').classList.add('hidden');
  document.getElementById('npImagePreview').innerHTML = '';
  const catSel = document.getElementById('npCategory');
  populateCategorySelect('npCategory');
  if(productId){
    const p = state.products.find(x=>x.id===productId);
    document.getElementById('productModalTitle').textContent = 'Mahsulotni tahrirlash';
    document.getElementById('npName').value = p.name;
    catSel.value = p.category||'pishiriq';
    document.getElementById('npGram').value = p.gram;
    document.getElementById('npUnitType').value = p.unitType || 'gram';
    updateUnitFieldLabel();
    document.getElementById('npPrice').value = p.price;
    document.getElementById('npPriceStore').value = (p.priceStore!=null && p.priceStore!=='') ? p.priceStore : '';
    document.getElementById('npCost').value = (p.cost!=null && p.cost!=='') ? p.cost : '';
    document.getElementById('npDesc').value = p.description||'';
    document.getElementById('npOriginalPrice').value = p.originalPrice||'';
    document.getElementById('npIsHot').checked = !!p.isHot;
    document.getElementById('npVerified').checked = !!p.verified;
    document.getElementById('npRating').value = p.rating||'';
    document.getElementById('npReviewCount').value = p.reviewCount||'';
    document.getElementById('npStock').value = p.stock;
    document.getElementById('npStockWrap').classList.remove('hidden');
    document.getElementById('productSaveBtn').textContent = 'O\'zgarishlarni saqlash';
    document.getElementById('productDeleteBtn').classList.remove('hidden');
    document.getElementById('npPreorder').checked = !!p.preorder;
    document.getElementById('npMinOrder').value = p.minOrder || '';
    document.getElementById('npPreorderNote').value = p.preorderNote || '';
    togglePreorderFields();
    pendingExtraImages = Array.isArray(p.images) ? p.images.slice() : [];
    renderExtraPreview();
    if(p.image){ pendingImage = p.image; document.getElementById('npImagePreview').innerHTML = `<img src="${p.image}">`; document.getElementById('npImagePreview').classList.remove('hidden'); }
  } else {
    document.getElementById('productModalTitle').textContent = 'Yangi mahsulot';
    document.getElementById('npName').value = '';
    catSel.value = '';
    document.getElementById('npGram').value = '';
    document.getElementById('npUnitType').value = 'gram';
    updateUnitFieldLabel();
    document.getElementById('npPrice').value = '';
    document.getElementById('npPriceStore').value = '';
    document.getElementById('npCost').value = '';
    document.getElementById('npDesc').value = '';
    document.getElementById('npOriginalPrice').value = '';
    document.getElementById('npIsHot').checked = false;
    document.getElementById('npVerified').checked = false;
    document.getElementById('npRating').value = '';
    document.getElementById('npReviewCount').value = '';
    document.getElementById('npStock').value = '';
    document.getElementById('npStockWrap').classList.add('hidden');
    document.getElementById('productSaveBtn').textContent = 'Yaratish va QR kod chiqarish';
    document.getElementById('productDeleteBtn').classList.add('hidden');
  }
  openModal('modalAddProduct');
}

function renderProducts(){
  const grid = document.getElementById('productGrid');
  if(!state.products.length){ grid.innerHTML = emptyHtml('box','Mahsulot qo\'shilmagan'); return; }
  const knownIds = (state.categories||[]).map(c=>c.id);
  const srt = (typeof sortedProducts === 'function') ? sortedProducts : (x => x);
  const ro = (typeof reorderMode !== 'undefined') && reorderMode;
  let html = (ro ? `<div class="reorderHint">Kartochkani <b>bosib turing</b> va kerakli joyga suring. Yoki ↑ ↓ tugmalaridan foydalaning.</div>` : '');
  html += (state.categories||[]).map(cat=>{
    const items = srt(state.products.filter(p=>p.category===cat.id));
    if(!items.length) return '';
    return `<div class="catSection">
      <div class="catTitle">${cat.name} <span class="catCount">${items.length}</span></div>
      <div class="prodGrid${ro ? ' reordering' : ''}">${items.map(function(p,i){ return adminProdCardHtml(p, i, items.length); }).join('')}</div>
    </div>`;
  }).join('');
  // Turkumi yo'q yoki o'chirilgan turkumga tegishli mahsulotlar — hech qachon
  // ko'rinmay yo'qolib qolmasligi uchun alohida ko'rsatiladi
  setTimeout(function(){ try{ if(typeof wireAllGrids === 'function') wireAllGrids(); }catch(e){} }, 0);
  const orphans = state.products.filter(p=>!p.category || !knownIds.includes(p.category));
  if(orphans.length){
    html += `<div class="catSection">
      <div class="catTitle" style="color:#8F3B40;">⚠️ Turkumsiz <span class="catCount">${orphans.length}</span></div>
      <p class="smallMuted" style="margin:-4px 0 10px;">Bu mahsulotlarga turkum belgilanmagan. Tahrirlab turkum tanlang yoki o'chiring.</p>
      <div class="prodGrid${ro ? ' reordering' : ''}">${srt(orphans).map(function(p,i){ return adminProdCardHtml(p, i, orphans.length); }).join('')}</div>
    </div>`;
  }
  grid.innerHTML = html;
}

async function saveProduct(){
  const name = document.getElementById('npName').value.trim();
  const category = document.getElementById('npCategory').value;
  const gram = parseFloat(document.getElementById('npGram').value)||0;
  const unitType = document.getElementById('npUnitType').value || 'gram';
  const price = parseFloat(document.getElementById('npPrice').value)||0;
  const priceStoreRaw = document.getElementById('npPriceStore').value;
  const priceStore = priceStoreRaw !== '' ? (parseFloat(priceStoreRaw)||0) : null;
  const costRaw = document.getElementById('npCost').value;
  const cost = costRaw !== '' ? (parseFloat(costRaw)||0) : null;
  const originalPriceRaw = document.getElementById('npOriginalPrice').value;
  const originalPrice = originalPriceRaw ? (parseFloat(originalPriceRaw)||0) : null;
  const isHot = document.getElementById('npIsHot').checked;
  const verified = document.getElementById('npVerified').checked;
  const ratingRaw = document.getElementById('npRating').value;
  const rating = ratingRaw ? Math.max(0,Math.min(5, parseFloat(ratingRaw)||0)) : null;
  const reviewCountRaw = document.getElementById('npReviewCount').value;
  const reviewCount = reviewCountRaw ? (parseInt(reviewCountRaw)||0) : null;
  const description = document.getElementById('npDesc').value.trim();
  if(!name){ alert('Nomini kiriting'); return; }
  if(!category){ alert("Mahsulot turini (turkumini) tanlang"); return; }
  if(editingProductId){
    const p = state.products.find(x=>x.id===editingProductId);
    p.name=name; p.category=category; p.gram=gram; p.unitType=unitType; p.price=price; p.priceStore=priceStore; p.cost=cost;
    p.images = pendingExtraImages.slice();
    p.preorder = document.getElementById('npPreorder').checked;
    p.minOrder = p.preorder ? Math.max(1, parseInt(document.getElementById('npMinOrder').value,10)||1) : 0;
    p.preorderNote = document.getElementById('npPreorderNote').value.trim(); p.image=pendingImage; p.description=description;
    p.originalPrice = (originalPrice && originalPrice>price) ? originalPrice : null;
    p.isHot = isHot; p.verified = verified; p.rating = rating; p.reviewCount = reviewCount;
    const stockVal = document.getElementById('npStock').value;
    if(stockVal!=='') p.stock = parseFloat(stockVal)||0;
    await saveState();
    closeModal('modalAddProduct');
    renderProducts();
  } else {
    const _pre = document.getElementById('npPreorder').checked;
    const p = {id:uid('p'), name, category, gram, unitType, price, priceStore, cost, stock:0, image: pendingImage, images: pendingExtraImages.slice(),
      preorder:_pre,
      minOrder:_pre ? Math.max(1, parseInt(document.getElementById('npMinOrder').value,10)||1) : 0,
      preorderNote: document.getElementById('npPreorderNote').value.trim(), description,
      originalPrice: (originalPrice && originalPrice>price) ? originalPrice : null,
      isHot, verified, rating, reviewCount};
    state.products.push(p);
    await saveState();
    closeModal('modalAddProduct');
    renderProducts();
    showProductQr(p.id);
  }
}

async function deleteProduct(){
  if(!editingProductId) return;
  if(!confirm('Bu mahsulotni butunlay o\'chirmoqchimisiz?')) return;
  state.products = state.products.filter(x=>x.id!==editingProductId);
  await saveState();
  closeModal('modalAddProduct');
  renderProducts();
}

function showProductQr(productId){
  const p = state.products.find(x=>x.id===productId);
  document.getElementById('qrModalTitle').textContent = p.name + ' — QR kod';
  const box = document.getElementById('qrModalBox');
  box.innerHTML = '';
  new QRCode(box, {text: 'UTAM:'+p.id, width:200, height:200, colorDark:'#241D18', colorLight:'#ffffff'});
  openModal('modalShowQr');
}

function setCatalogCategory(catId){
  catalogActiveCategory = catId;
  renderCatalog();
}

function renderCatalogChips(){
  const chipRow = document.getElementById('catalogChipRow');
  const all = [{id:'all', name:'Barchasi'}, ...(state.categories||[])];
  chipRow.innerHTML = all.map(c=>`<button class="catChip ${catalogActiveCategory===c.id?'active':''}" onclick="setCatalogCategory('${c.id}')">${c.name}</button>`).join('');
}

function renderHeroCarousel(){
  const box = document.getElementById('heroCarousel');
  if(!box) return;
  if(!state.products.length){ box.innerHTML=''; return; }
  const itemHtml = p => `<div class="heroBgItem" onclick="openProductDetail('${p.id}')">${p.image ? `<img src="${p.image}" alt="${p.name}">` : `<div class="heroBgFallback">${ic('bowl',40)}</div>`}</div>`;
  // ro'yxat ikki marta takrorlanadi — shu orqali banner cheksiz aylanib turadi
  box.innerHTML = state.products.map(itemHtml).join('') + state.products.map(itemHtml).join('');
}

function isFavorite(productId){ return favorites.includes(productId); }

function toggleFavorite(productId){
  if(favorites.includes(productId)) favorites = favorites.filter(id=>id!==productId);
  else favorites.push(productId);
  try{ localStorage.setItem('utam_favorites', JSON.stringify(favorites)); }catch(e){}
  const active = document.querySelector('.view.active');
  if(active && active.id==='v-catalog') renderCatalog();
  if(document.getElementById('modalFavorites') && !document.getElementById('modalFavorites').classList.contains('hidden')) renderFavoritesList();
}

function openFavoritesView(){
  renderFavoritesList();
  openModal('modalFavorites');
}

function renderFavoritesList(){
  const box = document.getElementById('favoritesList');
  const items = state.products.filter(p=>favorites.includes(p.id));
  box.innerHTML = items.map(p=>{
    const discountPct = (oldPriceOf(p)) ? Math.round((1 - priceOf(p)/p.originalPrice)*100) : 0;
    return `
    <div class="prodCard" onclick="closeModal('modalFavorites');openProductDetail('${p.id}')">
      <div class="prodBadgesTop">
        ${discountPct>0?`<span class="discBadge">-${discountPct}%</span>`:''}
        ${p.isHot?`<span class="hotBadge">🔥</span>`:''}
      </div>
      <button class="favHeartBtn2 active" onclick="event.stopPropagation();toggleFavorite('${p.id}')">${ic('heart',15)}</button>
      ${p.stock<=0?'<div class="outOfStockTag">Tugagan</div>':''}
      <div class="prodImgWrap2"><div class="prodImg2">${prodThumb(p,30)}</div></div>
      <div class="prodBody2">
        <div class="pnameRow2">
          <div class="pname2">${p.name}</div>
          ${p.verified?`<span class="verifiedBadge2" title="Tasdiqlangan">${ic('check',10)}</span>`:''}
        </div>
        ${p.rating?`<div class="ratingRow2">${ic('star',12)}<b>${p.rating.toFixed(1)}</b>${p.reviewCount?`<span>· ${p.reviewCount}</span>`:''}</div>`:''}
        <div class="pgram2">${formatProductAmount(p)}</div>
        <div class="priceRow2">
          <div class="priceNowLine"><span class="priceNow2">${fmt(priceOf(p))} so'm</span>${priceBadgeHtml(p)}</div>
          ${discountPct>0?`<div class="priceOldLine"><span class="priceOldLbl">Avvalgi narx:</span><span class="priceOld2">${fmt(p.originalPrice)} so'm</span></div>`:''}
        </div>
        <span class="tallyQty${(typeof tally!=='undefined' && tally[p.id])?'':' hidden'}" id="tallyQty-${p.id}" onclick="event.stopPropagation();tallySub('${p.id}', event)" title="Kamaytirish">${(typeof tally!=='undefined' && tally[p.id])||0}</span>
        ${tallyCardControls(p)}
      </div>
    </div>
  `;}).join('') || emptyHtml('heart',"Sevimlilar ro'yxati bo'sh");
}

function renderCatalog(){
  renderCatalogChips();
  refreshPriceModeBanner();
  renderHeroCarousel();
  const box = document.getElementById('catalogGrid');
  const q = (document.getElementById('catalogSearch')?.value||'').trim().toLowerCase();
  let items = (typeof sortedProducts === 'function') ? sortedProducts(state.products) : state.products;
  if(catalogActiveCategory!=='all') items = items.filter(p=>(p.category||'pishiriq')===catalogActiveCategory);
  if(q) items = items.filter(p=>p.name.toLowerCase().includes(q) || catName(p.category).toLowerCase().includes(q));
  box.innerHTML = items.map(p=>{
    const discountPct = (oldPriceOf(p)) ? Math.round((1 - priceOf(p)/p.originalPrice)*100) : 0;
    return `
    <div class="prodCard" onclick="openProductDetail('${p.id}')">
      <div class="prodBadgesTop">
        ${discountPct>0?`<span class="discBadge">-${discountPct}%</span>`:''}
        ${p.isHot?`<span class="hotBadge">🔥</span>`:''}
      </div>
      <button class="favHeartBtn2 ${isFavorite(p.id)?'active':''}" onclick="event.stopPropagation();toggleFavorite('${p.id}')">${ic('heart',15)}</button>
      ${p.stock<=0?'<div class="outOfStockTag">Tugagan</div>':''}
      <div class="prodImgWrap2"><div class="prodImg2">${prodThumb(p,30)}</div></div>
      <div class="prodBody2">
        <div class="pnameRow2">
          <div class="pname2">${p.name}</div>
          ${p.verified?`<span class="verifiedBadge2" title="Tasdiqlangan">${ic('check',10)}</span>`:''}
        </div>
        ${p.rating?`<div class="ratingRow2">${ic('star',12)}<b>${p.rating.toFixed(1)}</b>${p.reviewCount?`<span>· ${p.reviewCount}</span>`:''}</div>`:''}
        <div class="pgram2">${formatProductAmount(p)}</div>
        <div class="priceRow2">
          <div class="priceNowLine">
            <span class="priceNow2">${fmt(priceOf(p))} so'm</span>${priceBadgeHtml(p)}
          </div>
          ${discountPct>0?`<div class="priceOldLine"><span class="priceOldLbl">Avvalgi narx:</span><span class="priceOld2">${fmt(p.originalPrice)} so'm</span></div>`:''}
        </div>
        <span class="tallyQty${(typeof tally!=='undefined' && tally[p.id])?'':' hidden'}" id="tallyQty-${p.id}" onclick="event.stopPropagation();tallySub('${p.id}', event)" title="Kamaytirish">${(typeof tally!=='undefined' && tally[p.id])||0}</span>
        ${tallyCardControls(p)}
      </div>
    </div>
  `;}).join('') || emptyHtml('box','Hech narsa topilmadi');
  try{ refreshTallyBar(); }catch(e){}
}

function openProductDetail(productId){
  /* Tanishish rejimida faqat kartochkalar ko'rinadi — tafsilot oynasi ochilmaydi */
  if(previewMode){ return; }
  const p = state.products.find(x=>x.id===productId);
  pdCurrentProduct = p;
  pdQty = (p.preorder && p.minOrder > 1) ? Number(p.minOrder) : 1;
  renderProductGallery(p);
  renderPreorderNote(p);
  document.getElementById('pdName').textContent = p.name;
  document.getElementById('pdGram').textContent = formatProductAmount(p);
  document.getElementById('pdPrice').textContent = fmt(priceOf(p))+" so'm";
  document.getElementById('pdDesc').textContent = p.description || '';
  document.getElementById('pdQty').value = pdQty;
  document.getElementById('pdAddBtn').disabled = p.stock<=0 && !p.preorder;
  document.getElementById('pdAddBtn').style.opacity = (p.stock<=0 && !p.preorder) ? .5 : 1;
  document.getElementById('pdAddBtn').innerHTML = p.preorder
    ? (ic('cart',16) + "Buyurtma berish")
    : (p.stock<=0 ? 'Tugagan' : (ic('cart',16) + "Savatga qo'shish"));
  pdUpdateTotal();
  openModal('modalProductDetail');
}

function openProductUpdateModal(){
  puSelected = new Set();
  document.getElementById('puNote').value = '';
  renderProductUpdateList();
  openModal('modalProductUpdate');
}

function renderProductUpdateList(){
  const box = document.getElementById('puProductList');
  box.innerHTML = (state.products||[]).map(p=>{
    const checked = puSelected.has(p.id);
    return `<div class="contactRow" onclick="togglePuSelect('${p.id}')" style="${checked?'background:var(--leaf-soft);':''}">
      <span class="prodThumbSm" style="width:34px;height:34px;flex-shrink:0;">${prodThumb(p,15)}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:13.5px;">${p.name}</div>
        <div class="smallMuted" style="font-size:11.5px;">${fmt(p.price)} so'm</div>
      </div>
      <span style="width:23px;height:23px;border-radius:50%;border:2px solid ${checked?'var(--forest)':'var(--line)'};background:${checked?'var(--forest)':'transparent'};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        ${checked?ic('check',13,'stroke:#fff'):''}
      </span>
    </div>`;
  }).join('') || emptyHtml('box',"Mahsulot yo'q");
}

async function sendProductUpdate(){
  const note = document.getElementById('puNote').value.trim();
  if(puSelected.size===0){ alert("Kamida bitta mahsulot tanlang"); return; }
  if(!note){ alert("Izoh yozing"); return; }
  const ids = [...puSelected];
  const names = ids.map(id=>{ const p=state.products.find(x=>x.id===id); return p?p.name:''; }).filter(Boolean);
  const title = names.length===1 ? `${names[0]} — yangilik!` : "Mahsulotlar yangiligi!";
  const targets = (state.users||[]).filter(u=>!u.blocked);
  if(!targets.length){ alert("Hali ro'yxatdan o'tgan foydalanuvchi yo'q"); return; }
  if(!confirm(`Bu xabar ${targets.length} ta foydalanuvchiga yuboriladi. Davom etamizmi?`)) return;
  const now = new Date().toISOString();
  const ref = ids.length===1 ? {type:'product', id:ids[0]} : {type:'products', ids};
  targets.forEach(u=>{
    state.notifications.push({id:uid('n'), recipient:u.id, title, body:note, type:'productupdate', ref, date:now, read:false});
  });
  await saveState();
  closeModal('modalProductUpdate');
  alert("Xabar yuborildi!");
}
