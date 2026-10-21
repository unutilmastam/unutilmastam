/* Unutilmas Ta'm — 26-reorder.js
   ═══════════════════════════════════════════════════════════════
   MAHSULOTLAR TARTIBI

   Yangi mahsulot oxiridan qo'shilardi va joyini o'zgartirib bo'lmasdi.
   Endi admin tartibni o'zi belgilaydi:
     • barmoq bilan surib ko'chirish
     • yoki ↑ ↓ tugmalari bilan

   Tartib har bir mahsulotda `sort` raqami sifatida saqlanadi va
   katalogda ham, admin ro'yxatida ham bir xil ko'rinadi.

   Tartib MUHIM: 14-boot.js dan OLDIN yuklanadi.
   ═══════════════════════════════════════════════════════════════ */

let reorderMode = false;

/* Tartib bo'yicha saralash. `sort` yo'q mahsulotlar oxirida qoladi
   (eski ma'lumot buzilmaydi — yangi mahsulot ham oxiriga tushadi). */
function sortedProducts(list){
  return (list || []).slice().sort(function(a, b){
    const sa = (a.sort == null) ? Number.MAX_SAFE_INTEGER : Number(a.sort);
    const sb = (b.sort == null) ? Number.MAX_SAFE_INTEGER : Number(b.sort);
    if(sa !== sb) return sa - sb;
    /* ikkalasida ham yo'q bo'lsa — qo'shilish tartibida */
    return (state.products || []).indexOf(a) - (state.products || []).indexOf(b);
  });
}

/* Kategoriya ichidagi tartib raqamlarini 0,1,2... qilib qayta yozadi */
function renumberCategory(catId){
  const items = sortedProducts((state.products || []).filter(p => (p.category || '') === catId));
  items.forEach(function(p, i){ p.sort = i; });
  return items;
}

/* ───────── Tartiblash rejimi ───────── */
function toggleReorder(){
  if(!(currentUser && currentUser.role === 'admin')) return;
  reorderMode = !reorderMode;
  renderProducts();
  const btn = document.getElementById('reorderBtn');
  if(btn) btn.classList.toggle('on', reorderMode);
}

function moveProduct(id, dir){
  const p = (state.products || []).find(x => x.id === id);
  if(!p) return;
  const items = renumberCategory(p.category || '');
  const i = items.indexOf(p);
  const j = i + dir;
  if(j < 0 || j >= items.length) return;
  /* joylarini almashtiramiz */
  const tmp = items[i].sort; items[i].sort = items[j].sort; items[j].sort = tmp;
  saveState();
  renderProducts();
  try{ renderCatalog(); }catch(e){}
  try{ if(navigator.vibrate) navigator.vibrate(8); }catch(e){}
}

/* Surib ko'chirish tugagach — yangi tartibni saqlaymiz */
function applyDropOrder(gridEl){
  const ids = Array.prototype.map.call(gridEl.querySelectorAll('.prodCard[data-pid]'),
                                       el => el.getAttribute('data-pid'));
  ids.forEach(function(id, i){
    const p = (state.products || []).find(x => x.id === id);
    if(p) p.sort = i;
  });
  saveState();
  try{ renderCatalog(); }catch(e){}
}

/* ───────── Barmoq bilan surish ─────────
   Uzun bosilganda kartochka "ko'tariladi" va barmoq ortidan yuradi;
   ostidagi kartochkalar joyini bo'shatadi. */
function wireDrag(grid){
  if(grid.__dragWired) return;
  grid.__dragWired = true;

  let drag = null;

  function cardAt(x, y){
    return Array.prototype.find.call(grid.querySelectorAll('.prodCard[data-pid]'), function(el){
      if(el === (drag && drag.el)) return false;
      const r = el.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    });
  }

  grid.addEventListener('pointerdown', function(e){
    if(!reorderMode) return;
    const el = e.target.closest('.prodCard[data-pid]');
    if(!el) return;
    const r = el.getBoundingClientRect();
    drag = { el: el, dx: e.clientX - r.left, dy: e.clientY - r.top,
             startX: e.clientX, startY: e.clientY, active: false, id: e.pointerId };
    /* uzun bosish — tasodifiy surilib ketmasin */
    drag.timer = setTimeout(function(){
      if(!drag) return;
      drag.active = true;
      el.classList.add('dragging');
      el.style.width = r.width + 'px';
      el.style.height = r.height + 'px';
      try{ el.setPointerCapture(e.pointerId); }catch(x){}
      try{ if(navigator.vibrate) navigator.vibrate(14); }catch(x){}
    }, 180);
  });

  grid.addEventListener('pointermove', function(e){
    if(!drag) return;
    if(!drag.active){
      /* hali ko'tarilmagan bo'lsa va barmoq siljisa — bu varaqlash */
      if(Math.abs(e.clientX - drag.startX) > 8 || Math.abs(e.clientY - drag.startY) > 8){
        clearTimeout(drag.timer); drag = null;
      }
      return;
    }
    e.preventDefault();
    const gr = grid.getBoundingClientRect();
    drag.el.style.left = (e.clientX - gr.left - drag.dx) + 'px';
    drag.el.style.top  = (e.clientY - gr.top  - drag.dy) + 'px';

    const over = cardAt(e.clientX, e.clientY);
    if(over){
      const r = over.getBoundingClientRect();
      const after = (e.clientX - r.left) > r.width / 2;
      grid.insertBefore(drag.el, after ? over.nextSibling : over);
    }
  }, {passive:false});

  function end(){
    if(!drag) return;
    clearTimeout(drag.timer);
    if(drag.active){
      drag.el.classList.remove('dragging');
      drag.el.style.left = drag.el.style.top = drag.el.style.width = drag.el.style.height = '';
      applyDropOrder(grid);
    }
    drag = null;
  }
  grid.addEventListener('pointerup', end);
  grid.addEventListener('pointercancel', end);
}

function wireAllGrids(){
  document.querySelectorAll('#v-products .prodGrid').forEach(wireDrag);
}
