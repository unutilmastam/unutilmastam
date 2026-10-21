/* Unutilmas Ta'm — 8-map
   Avtomatik ajratilgan modul. Tartib MUHIM: index.html dagi ketma-ketlikni buzmang. */

function showUserOnMap(userId){
  const u = state.users.find(x=>x.id===userId);
  if(!u || typeof u.homeLat!=='number') return;
  closeModal('modalUsers');
  showView('stores');
  setTimeout(()=>{
    if(leafletMap){
      leafletMap.invalidateSize();
      leafletMap.setView([u.homeLat, u.homeLng], 15, {animate:true});
      // Vaqtinchalik pin: doimiy ko'rinmaydi, faqat shu tekshiruv paytida
      if(tempUserMarker){ leafletMap.removeLayer(tempUserMarker); tempUserMarker = null; }
      tempUserMarker = L.marker([u.homeLat, u.homeLng], {icon:userPinDivIcon(), zIndexOffset:2500}).addTo(leafletMap);
      tempUserMarker.bindTooltip(u.name, {permanent:true, direction:'top', offset:[0,-32], className:'mapNameLabel userPinLabel'});
      tempUserMarker.on('click', (e)=>{ L.DomEvent.stopPropagation(e); openYandexNavigator(u.homeLat, u.homeLng, u.name); });
      setTimeout(()=>{ if(tempUserMarker){ leafletMap.removeLayer(tempUserMarker); tempUserMarker=null; } }, 12000);
    }
  }, 250);
}

function renderCustomerHeatmap(){
  const el = document.getElementById('heatmapWrap');
  if(!el || typeof L==='undefined') return;
  const withLoc = state.orders.filter(o=>typeof o.lat==='number' && typeof o.lng==='number');
  if(!withLoc.length){ el.innerHTML = "<div class=\"smallMuted\" style=\"padding:20px;text-align:center;\">Hali joylashuvli buyurtma yo'q</div>"; return; }

  // ~1km chorak-chorak guruhlash
  const cells = {};
  withLoc.forEach(o=>{
    const key = Math.round(o.lat*100)+','+Math.round(o.lng*100);
    if(!cells[key]) cells[key] = {lat:o.lat, lng:o.lng, count:0};
    cells[key].count += 1;
  });
  const cellList = Object.values(cells);
  const maxCount = Math.max(1, ...cellList.map(c=>c.count));

  if(!heatmapInstance){
    el.innerHTML = '';
    heatmapInstance = L.map('heatmapWrap').setView([withLoc[0].lat, withLoc[0].lng], 11);
    mapTileLayer().addTo(heatmapInstance);
  }
  if(heatmapInstance.__markers) heatmapInstance.__markers.forEach(m=>{ try{m._rm&&m._rm();}catch(e){} });
  heatmapInstance.__markers = cellList.map(c=>{
    const intensity = c.count/maxCount;
    const radius = 14 + intensity*24;
    const color = intensity>.66 ? '#C83C45' : intensity>.33 ? '#C5933D' : '#447A47';
    return L.marker([c.lat,c.lng], {icon: L.divIcon({className:'', html:`<div style="width:${radius}px;height:${radius}px;border-radius:50%;background:${color};opacity:.55;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#fff;">${c.count}</div>`})}).addTo(heatmapInstance);
  });
  setTimeout(()=>{ try{ heatmapInstance.invalidateSize(); }catch(e){} }, 200);
}

function pinDivIcon(color){
  const gid = 'pg' + (++__pinGradSeq);
  const svg = `<svg width="52" height="64" viewBox="0 0 24 30" class="pinIcon">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="1"/>
      <stop offset="100%" stop-color="${color}" stop-opacity=".78"/>
    </linearGradient></defs>
    <path d="M12 29S2 17.8 2 11a10 10 0 0 1 20 0c0 6.8-10 18-10 18Z" fill="url(#${gid})" stroke="#fff" stroke-width="1.8"/>
    <ellipse cx="9" cy="6.5" rx="4.5" ry="2.6" fill="#fff" opacity=".28" transform="rotate(-24 9 6.5)"/>
    <circle cx="12" cy="11" r="4.4" fill="#fff"/>
    <circle cx="12" cy="11" r="2" fill="${color}"/>
  </svg>`;
  return L.divIcon({html:svg, className:'', iconSize:[52,64], iconAnchor:[26,62], popupAnchor:[0,-54]});
}

function userPinDivIcon(){
  const svg = `<svg width="30" height="38" viewBox="0 0 30 38"><path d="M15 1C7.3 1 1 7.2 1 14.8 1 25 15 37 15 37s14-12 14-22.2C29 7.2 22.7 1 15 1z" fill="#925E78" stroke="#fff" stroke-width="2"/><circle cx="15" cy="12" r="3.4" fill="none" stroke="#fff" stroke-width="2"/><path d="M8.5 22c1.2-3.4 3.7-5 6.5-5s5.3 1.6 6.5 5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>`;
  return L.divIcon({html:svg, className:'pinIcon', iconSize:[30,38], iconAnchor:[15,36], popupAnchor:[0,-32]});
}

function recenterMap(isFull){
  const map = isFull ? fullLeafletMap : leafletMap;
  const btn = document.getElementById(isFull ? 'mapRecenterFull' : 'mapRecenterMini');
  if(!map){ return; }
  if(!navigator.geolocation){ alert('Brauzeringiz joylashuvni aniqlay olmaydi.'); return; }
  if(btn) btn.classList.add('locating');
  navigator.geolocation.getCurrentPosition(
    (pos)=>{
      if(btn) btn.classList.remove('locating');
      const {latitude, longitude} = pos.coords;
      map.setView([latitude, longitude], 15, {animate:true});
      const dotIcon = L.divIcon({html:'<div style="width:16px;height:16px;border-radius:50%;background:#547EA0;border:3px solid #fff;box-shadow:0 0 0 5px rgba(84,126,160,.28);"></div>', className:'', iconSize:[16,16], iconAnchor:[8,8]});
      if(isFull){
        if(myLocMarkerFull) map.removeLayer(myLocMarkerFull);
        myLocMarkerFull = L.marker([latitude,longitude], {icon:dotIcon, zIndexOffset:3000}).addTo(map);
      } else {
        if(myLocMarkerMini) map.removeLayer(myLocMarkerMini);
        myLocMarkerMini = L.marker([latitude,longitude], {icon:dotIcon, zIndexOffset:3000}).addTo(map);
      }
    },
    ()=>{
      if(btn) btn.classList.remove('locating');
      alert('Joylashuvni aniqlab bo\'lmadi. Brauzer sozlamalaridan joylashuvga ruxsat berilganini tekshiring.');
    },
    {enableHighAccuracy:true, timeout:8000}
  );
}

function mapZoom(which, d){
  const m = which==='full' ? fullLeafletMap : (which==='pick' ? homeLocMap : leafletMap);
  if(m && m.zoomBy) m.zoomBy(d);
}

function mapTileLayer(){
  // Yandex Maps JS API o'z plitkalarini o'zi chizadi — bu funksiya moslik uchun qoldirildi
  return { addTo(){} };
}

function toggleMapTypePanel(key){
  const panel = document.getElementById('mapTypePanel_'+key);
  const btn   = document.getElementById('mapTypeBtn_'+key);
  if(!panel) return;
  const willOpen = !panel.classList.contains('open');
  closeAllMapTypePanels();
  if(willOpen){
    panel.classList.add('open');
    if(btn) btn.classList.add('on');
    try{ if(navigator.vibrate) navigator.vibrate(8); }catch(e){}
  }
}

function closeAllMapTypePanels(){
  document.querySelectorAll('.mapTypePanel.open').forEach(p=>p.classList.remove('open'));
  document.querySelectorAll('.mapTypeBtn.on').forEach(b=>b.classList.remove('on'));
}

function setMapViewType(t){
  try{ L.setMapTypeAll(t); }catch(e){ console.warn('Xarita turi:', e); }
  syncMapTypeUI();
  closeAllMapTypePanels();
  try{ if(navigator.vibrate) navigator.vibrate(14); }catch(e){}
}

function syncMapTypeUI(){
  const cur = (window.L && L.__mapType) || 'yandex#map';
  document.querySelectorAll('.mapTypeOpt').forEach(b=>{
    b.classList.toggle('active', b.dataset.mt === cur);
  });
  document.querySelectorAll('.mapTypeBtn').forEach(b=>{
    b.title = "Xarita ko'rinishi: " + (MAP_TYPE_LABELS[cur] || 'Sxema');
  });
}

function centerMapOnMyLocation(map){
  if(__didAutoLocate || !navigator.geolocation) return;
  __didAutoLocate = true;
  navigator.geolocation.getCurrentPosition(
    pos=>{ try{ map.setView([pos.coords.latitude, pos.coords.longitude], 14); }catch(e){} },
    ()=>{ /* ruxsat berilmadi — Toshkentda qolaveradi */ },
    {enableHighAccuracy:true, timeout:6000, maximumAge:120000}
  );
}

function openFullMap(){
  showView('fullmap');
  const initOrResize = ()=>{
    if(!fullLeafletMap){
      fullLeafletMap = L.map('fullMapWrap', {zoomControl:true}).setView([41.3111,69.2797], 13);
      mapTileLayer().addTo(fullLeafletMap);
      fullLeafletMap.on('click', (e)=>{
        openNewStoreAtLocation(e.latlng.lat, e.latlng.lng);
      });
    }
    fullLeafletMap.invalidateSize();
    if(leafletMap) fullLeafletMap.setView(leafletMap.getCenter(), leafletMap.getZoom());
    plotStoresOnMap(fullLeafletMap, fullMapMarkers, (storeId)=>{
      openStoreDetail(storeId);
    });
    plotOrderPinsOnMap(fullLeafletMap, fullOrderMapMarkers);
  };
  setTimeout(initOrResize, 200);
  setTimeout(()=>{ if(fullLeafletMap) fullLeafletMap.invalidateSize(); }, 500);
  syncMapTypeUI();
}

function openYandexNavigator(lat, lng, label){
  const app = `yandexnavi://build_route_on_map?lat_to=${lat}&lon_to=${lng}`;
  const web = `https://yandex.ru/maps/?rtext=~${lat},${lng}&rtt=auto`;
  const t = Date.now();
  window.location.href = app;
  setTimeout(()=>{
    if(Date.now()-t < 1800){ window.open(web, '_blank'); }
  }, 1200);
}

function showCourierOnMap(orderId){
  const o = state.orders.find(x=>x.id===orderId);
  if(!o || !o.courierLat){ alert("Kuryer joylashuvi hali mavjud emas"); return; }
  liveTrackOrderId = orderId;
  openModal('modalLiveTracking');
  setTimeout(()=>{
    if(!liveTrackMap){
      liveTrackMap = L.map('liveTrackMapWrap').setView([o.courierLat, o.courierLng], 14);
      mapTileLayer().addTo(liveTrackMap);
    }
    renderLiveTracking();
    clearInterval(liveTrackInterval);
    liveTrackInterval = setInterval(renderLiveTracking, 5000);
  }, 250);
}

function openNavigationToDelivery(){
  const o = state.orders.find(x=>x.id===courierOrderId);
  if(!o || typeof o.lat!=='number' || typeof o.lng!=='number'){ alert("Yetkazish manzili xaritada belgilanmagan"); return; }
  const url = `https://www.google.com/maps/dir/?api=1&destination=${o.lat},${o.lng}&travelmode=driving`;
  window.open(url, '_blank');
}

/* ============================================================
   YETKAZISH HUDUDLARI — admin boshqaruvi
   ============================================================ */
function openDeliveryZonesModal(){
  renderDeliveryZonesList();
  document.getElementById('dzName').value = '';
  document.getElementById('dzPrice').value = '';
  openModal('modalDeliveryZones');
}

function renderDeliveryZonesList(){
  const box = document.getElementById('deliveryZonesList');
  const zones = state.deliveryZones || [];
  box.innerHTML = zones.map(z=>`
    <div class="sessionRow">
      <span><b>${z.name}</b> — ${fmt(z.price)} so'm</span>
      <button class="ghostBtn" style="padding:6px 10px;font-size:11.5px;color:var(--danger);" onclick="deleteDeliveryZone('${z.id}')">O'chirish</button>
    </div>
  `).join('') || emptyHtml('store',"Hali hudud qo'shilmagan");
}

async function createDeliveryZone(){
  const name = document.getElementById('dzName').value.trim();
  const price = parseFloat(document.getElementById('dzPrice').value);
  if(!name){ alert('Hudud nomini kiriting'); return; }
  if(isNaN(price) || price<0){ alert("Narxni to'g'ri kiriting"); return; }
  state.deliveryZones.push({id:uid('dz'), name, price});
  await saveState();
  openDeliveryZonesModal();
}

async function deleteDeliveryZone(id){
  if(!confirm("Bu hududni o'chirmoqchimisiz?")) return;
  state.deliveryZones = state.deliveryZones.filter(z=>z.id!==id);
  await saveState();
  renderDeliveryZonesList();
}

function notifyTyping(){
  if(!activeChatUserId) return;
  const chat = state.chats.find(x=>x.userId===activeChatUserId);
  if(!chat) return;
  const isAdmin = currentUser && currentUser.role==='admin';
  const field = isAdmin ? 'adminTyping' : 'userTyping';
  chat[field] = Date.now();
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(()=>{ chat[field]=0; saveState(); }, 2500);
  scheduleFlush ? scheduleFlush(300) : saveState();
  dirtyKeys && (dirtyKeys['chats']=true);
}

function populateDeliveryZones(){
  const sel = document.getElementById('boDeliveryZone');
  if(!sel) return;
  const zones = state.deliveryZones || [];
  sel.innerHTML = '<option value="">Tanlanmagan (yetkazish narxi 0)</option>' +
    zones.map(z=>`<option value="${z.id}">${z.name} — ${fmt(z.price)} so'm</option>`).join('');
}
