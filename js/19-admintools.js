/* Unutilmas Ta'm — 19-admintools.js
   ═══════════════════════════════════════════════════════════════
   ADMIN VOSITALARI
   1) Tizim holati — har bir bo'lim hajmi (1 MB chegarasiga nisbatan)
   2) Zaxira nusxa — butun bazani fayl qilib yuklab olish va tiklash
   3) Excel eksport — sotuvlar va qarzlar (CSV, Excel ochadi)
   4) Bosh sahifa grafiklari — haftalik savdo, eng yaxshi magazinlar

   Tartib MUHIM: index.html dagi ketma-ketlikni buzmang.
   ═══════════════════════════════════════════════════════════════ */

const KEY_NAMES = {
  products: 'Mahsulotlar', orders: 'Buyurtmalar', sales: 'Sotuvlar',
  ledger: 'Qarzlar', stores: "Do'konlar", users: 'Foydalanuvchilar',
  returns: 'Qaytarilganlar', expenses: 'Xarajatlar', couriers: 'Kuryerlar',
  categories: 'Kategoriyalar', notifications: 'Xabarlar',
  adminSettings: 'Admin sozlamalari', sellerInfo: "Sotuvchi ma'lumoti",
  chats: 'Suhbatlar', deliveryZones: 'Yetkazish hududlari',
  promoCodes: 'Promo-kodlar', tgphones: 'Telegram raqamlari'
};

/* ───────── 1. TIZIM HOLATI ───────── */
function openSystemHealth(){
  if(!(currentUser && currentUser.role === 'admin')) return;
  const rep = (typeof stateSizeReport === 'function') ? stateSizeReport() : [];
  const total = rep.reduce((s, r) => s + r.len, 0);

  /* Mahalliy xotira (localStorage ~5 MB) */
  let localLen = 0;
  try{ localLen = (localStorage.getItem(STORAGE_KEY) || '').length; }catch(e){}
  const localPct = Math.min(100, Math.round(localLen / (5 * 1024 * 1024) * 100));

  const rows = rep.filter(r => r.len > 2).map(function(r){
    /* Bo'laklab saqlanadigan bo'lgani uchun xavf endi "bo'laklar soni"da */
    const pct = Math.min(100, Math.round(r.len / 300000 * 100));
    const cls = r.parts > 1 ? 'ok' : (pct > 80 ? 'warn' : 'ok');
    return `
      <div class="shRow">
        <div class="shTop">
          <span>${KEY_NAMES[r.key] || r.key}</span>
          <b>${fmtBytes(r.len)}${r.parts > 1 ? ' · ' + r.parts + " bo'lak" : ''}</b>
        </div>
        <div class="shBar ${cls}"><i style="width:${r.parts > 1 ? 100 : pct}%"></i></div>
      </div>`;
  }).join('');

  document.getElementById('shBody').innerHTML = `
    <div class="shSummary">
      <div><span>${fmtBytes(total)}</span><label>Jami ma'lumot</label></div>
      <div><span class="${localPct > 80 ? 'lossSum' : ''}">${localPct}%</span><label>Telefon xotirasi</label></div>
    </div>
    <p class="smallMuted" style="font-size:11.5px;line-height:1.5;margin:0 0 12px;">
      Katta bo'limlar avtomatik bo'laklarga ajratiladi — 1 MB chegarasi
      endi ma'lumot yo'qotishga olib kelmaydi.
    </p>
    ${rows}
    ${localPct > 80 ? `<div class="prnDebtNote" style="margin-top:12px;">
       Telefon xotirasi to'lib bormoqda. Mahsulot rasmlarini kamaytiring
       yoki eski sotuvlarni arxivlang.</div>` : ''}`;
  refreshBackupText();
  openModal('modalSystemHealth');
}

function refreshBackupText(){
  const el = document.getElementById('shLastBackup');
  if(el) el.textContent = lastBackupText();
}

function fmtBytes(n){
  if(n < 1024) return n + ' B';
  if(n < 1048576) return (n / 1024).toFixed(0) + ' KB';
  return (n / 1048576).toFixed(2) + ' MB';
}

/* ───────── 2. ZAXIRA NUSXA ───────── */
function downloadBackup(){
  if(!(currentUser && currentUser.role === 'admin')) return;
  const data = {
    app: "unutilmastam", version: 1,
    created: new Date().toISOString(),
    state: state
  };
  const blob = new Blob([JSON.stringify(data)], {type: 'application/json'});
  const d = new Date();
  const name = 'unutilmastam-zaxira-' + d.getFullYear() + '-' +
    String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') + '.json';
  saveBlob(blob, name);
  try{ localStorage.setItem('utam_lastBackup', String(Date.now())); }catch(e){}
}

/* Zaxiradan tiklash — faqat tasdiqlangandan keyin */
function restoreBackupFile(input){
  const f = input.files && input.files[0];
  input.value = '';
  if(!f) return;
  const rd = new FileReader();
  rd.onload = function(){
    let data;
    try{ data = JSON.parse(rd.result); }catch(e){ alert("Fayl buzilgan yoki noto'g'ri."); return; }
    if(!data || data.app !== 'unutilmastam' || !data.state){
      alert("Bu Unutilmas Ta'm zaxira fayli emas."); return;
    }
    const when = data.created ? new Date(data.created).toLocaleString('uz-UZ') : '?';
    openTallyConfirm({
      title: 'Zaxiradan tiklansinmi?',
      text: 'Zaxira sanasi: <b>' + when + '</b><br><br>' +
            "Hozirgi ma'lumotlar shu nusxa bilan <b>almashtiriladi</b>. " +
            'Bu amalni qaytarib bo\'lmaydi.',
      okText: 'HA, TIKLASH', danger: true,
      onOk: function(){
        /* Terminal ko'rinishida tiklash (21-restorefx.js) */
        if(typeof runRestoreWithTerminal === 'function'){ runRestoreWithTerminal(data); return; }
        state = data.state;
        try{ normalizeState(); }catch(e){}
        saveState().then(function(){ location.reload(); });
      }
    });
  };
  rd.readAsText(f);
}

function lastBackupText(){
  let t = 0;
  try{ t = parseInt(localStorage.getItem('utam_lastBackup') || '0', 10); }catch(e){}
  if(!t) return "Hali zaxira olinmagan";
  const days = Math.floor((Date.now() - t) / 86400000);
  return days === 0 ? 'Bugun olingan' : (days + ' kun oldin olingan');
}

/* ───────── 3. EXCEL EKSPORT ───────── */
function csvCell(v){
  const s = String(v == null ? '' : v);
  return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsv(rows){
  /* Excel kirill harflarini to'g'ri o'qishi uchun boshida BOM */
  return '\uFEFF' + rows.map(r => r.map(csvCell).join(';')).join('\r\n');
}

function exportSalesCsv(){
  const rows = [['Sana', 'Vaqt', 'Mahsulot', 'Miqdor', 'Narx', 'Jami', "Do'kon", 'Chek', 'Manba']];
  (state.sales || []).slice().sort((a,b) => (b.ts||0) - (a.ts||0)).forEach(function(s){
    const d = s.ts ? new Date(s.ts) : null;
    rows.push([
      d ? d.toLocaleDateString('ru-RU') : '', d ? d.toLocaleTimeString('ru-RU') : '',
      s.productName || '', s.qty || 1, s.price || 0,
      s.total != null ? s.total : (s.price || 0),
      s.storeName || '', s.receiptNo || '', s.source || ''
    ]);
  });
  saveBlob(new Blob([toCsv(rows)], {type:'text/csv;charset=utf-8'}), 'sotuvlar-' + todayISO() + '.csv');
}

function exportDebtsCsv(){
  const rows = [["Do'kon", 'Sana', 'Jami', "To'langan", 'Qarz', 'Muddat', 'Izoh']];
  (state.ledger || []).filter(l => (l.debt || 0) > 0).forEach(function(l){
    rows.push([l.partyName || '', l.date || '', l.total || 0, l.paid || 0,
               l.debt || 0, l.due || '', l.note || '']);
  });
  saveBlob(new Blob([toCsv(rows)], {type:'text/csv;charset=utf-8'}), 'qarzlar-' + todayISO() + '.csv');
}

/* Faylni yuklab olish — iOS/Telegram'da ham ishlaydi */
function saveBlob(blob, name){
  try{
    if(navigator.canShare && window.File){
      const file = new File([blob], name, {type: blob.type});
      if(navigator.canShare({files:[file]})){
        navigator.share({files:[file], title:name}).catch(function(){});
        return;
      }
    }
  }catch(e){}
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ───────── 4. BOSH SAHIFA GRAFIKLARI ───────── */
function dayKey(ts){
  const d = new Date(ts);
  return d.getFullYear() + '-' + (d.getMonth()+1) + '-' + d.getDate();
}

/* Oxirgi 7 kunlik savdo */
function weekSales(){
  const out = [];
  for(let i = 6; i >= 0; i--){
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - i);
    out.push({ key: dayKey(d.getTime()), label: ['Ya','Du','Se','Ch','Pa','Ju','Sh'][d.getDay()], sum: 0 });
  }
  const idx = {}; out.forEach((o, i) => idx[o.key] = i);
  (state.sales || []).forEach(function(s){
    const k = s.ts ? dayKey(s.ts) : null;
    if(k != null && idx[k] != null) out[idx[k]].sum += (s.total != null ? s.total : (s.price || 0));
  });
  return out;
}

/* Eng ko'p savdo qilgan magazinlar (30 kun) */
function topStores(n){
  const from = Date.now() - 30 * 86400000;
  const agg = {};
  (state.sales || []).forEach(function(s){
    if(!s.storeId || (s.ts || 0) < from) return;
    agg[s.storeId] = agg[s.storeId] || { name: s.storeName || '', sum: 0 };
    agg[s.storeId].sum += (s.total != null ? s.total : (s.price || 0));
  });
  return Object.values(agg).sort((a,b) => b.sum - a.sum).slice(0, n || 5);
}

function renderDashCharts(){
  const box = document.getElementById('dashCharts');
  if(!box) return;
  if(!(currentUser && currentUser.role === 'admin')){ box.innerHTML = ''; return; }

  const wk = weekSales();
  const max = Math.max(1, ...wk.map(w => w.sum));
  const weekTotal = wk.reduce((s, w) => s + w.sum, 0);

  const bars = wk.map(function(w, i){
    const h = Math.max(3, Math.round(w.sum / max * 100));
    const today = i === wk.length - 1;
    return `<div class="chCol">
      <div class="chBarWrap"><div class="chBar ${today ? 'today' : ''}" style="height:${h}%"
        title="${fmt(w.sum)} so'm"></div></div>
      <span class="${today ? 'today' : ''}">${w.label}</span>
    </div>`;
  }).join('');

  const tops = topStores(5);
  const tmax = Math.max(1, ...tops.map(t => t.sum));
  const topHtml = tops.length ? tops.map(t => `
    <div class="tsRow">
      <div class="tsTop"><span>${t.name}</span><b>${fmt(t.sum)}</b></div>
      <div class="tsBar"><i style="width:${Math.round(t.sum / tmax * 100)}%"></i></div>
    </div>`).join('')
    : `<p class="smallMuted" style="margin:6px 0 0;font-size:12px;">Hali magazinga bog'langan savdo yo'q</p>`;

  box.innerHTML = `
    <div class="card chCard">
      <div class="chHead"><div class="cardTitle">Haftalik savdo</div><b>${fmt(weekTotal)} so'm</b></div>
      <div class="chBars">${bars}</div>
    </div>
    <div class="card chCard">
      <div class="cardTitle">Eng faol magazinlar · 30 kun</div>
      ${topHtml}
    </div>`;
}


/* ═══ Sarlavhalardagi SVG ikonkalar ═══
   <span class="hIco" data-ic="nom"></span> -> ic('nom') bilan to'ldiriladi */
function mountHeadIcons(root){
  (root || document).querySelectorAll('.hIco[data-ic]').forEach(function(el){
    if(el.__done) return;
    try{ el.innerHTML = ic(el.getAttribute('data-ic'), parseInt(el.getAttribute('data-size') || '17', 10)); el.__done = true; }catch(e){}
  });
}
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ mountHeadIcons(); });
else mountHeadIcons();
