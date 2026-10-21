/* Yandex Maps -> Leaflet-ga o'xshash qobiq. Xarita modulidan OLDIN yuklanishi shart. */
/* ============================================================
   Yandex Maps adapter — mavjud xarita kodi (L.* chaqiruvlari)
   endi Yandex Maps JS API 2.1 ustida ishlaydi.
   ============================================================ */
window.L = (function(){
  let ready = false, queue = [];
  function whenReady(fn){ if(ready){ fn(); } else { queue.push(fn); } }
  (function waitYm(){
    if(window.ymaps && ymaps.ready){
      ymaps.ready(()=>{ ready = true; queue.forEach(f=>{ try{f();}catch(e){console.error(e);} }); queue = []; });
    } else { setTimeout(waitYm, 250); }
  })();

  const DEFAULT_PIN = '<svg width="30" height="38" viewBox="0 0 30 38"><path d="M15 1C7.3 1 1 7.2 1 14.8 1 25 15 37 15 37s14-12 14-22.2C29 7.2 22.7 1 15 1z" fill="#AC6437" stroke="#fff" stroke-width="2"/><circle cx="15" cy="13" r="4.5" fill="#fff"/></svg>';

  function norm(ll){
    if(Array.isArray(ll)) return [Number(ll[0]), Number(ll[1])];
    return [Number(ll.lat), Number(ll.lng)];
  }

  function MapW(el, opts){
    this._pending = [];
    this._center = [41.3111, 69.2797]; this._zoom = 12;
    L.__maps.push(this);                       // ro'yxatga olamiz (ko'rinishni birdaniga almashtirish uchun)
    whenReady(()=>{
      this.ym = new ymaps.Map(el, {
        center: this._center, zoom: this._zoom,
        type: L.__mapType || 'yandex#map',     // SXEMA / SPUTNIK / GIBRID
        controls: []
      }, { suppressMapOpenBlock: true, yandexMapDisablePoiInteractivity: true });
      this._pending.forEach(f=>{ try{f(this);}catch(e){console.error(e);} });
      this._pending = null;
    });
  }
  MapW.prototype.setMapType = function(t){
    this._run(m=>{ try{ m.ym.setType(t); }catch(e){ console.warn('Xarita turini almashtirib bo\'lmadi:', e); } });
    return this;
  };
  MapW.prototype._run = function(f){ if(this.ym){ f(this); } else { this._pending.push(f); } };
  MapW.prototype.setView = function(ll, zoom, o){
    const c = norm(ll); this._center = c; if(zoom!=null) this._zoom = zoom;
    this._run(m=>m.ym.setCenter(c, zoom!=null?zoom:m.ym.getZoom(), {checkZoomRange:true, duration:250}));
    return this;
  };
  MapW.prototype.getCenter = function(){
    if(this.ym){ const c = this.ym.getCenter(); return {lat:c[0], lng:c[1]}; }
    return {lat:this._center[0], lng:this._center[1]};
  };
  MapW.prototype.getZoom = function(){ return this.ym ? this.ym.getZoom() : this._zoom; };
  MapW.prototype.invalidateSize = function(){ this._run(m=>m.ym.container.fitToViewport()); return this; };
  MapW.prototype.zoomBy = function(d){ this._run(m=>m.ym.setZoom(m.ym.getZoom()+d, {duration:200, checkZoomRange:true})); return this; };
  MapW.prototype.on = function(ev, cb){
    if(ev==='click'){
      this._run(m=>m.ym.events.add('click', e=>{
        if(L.__sup) return;
        const c = e.get('coords');
        /* Avval: bosilgan joy biror BELGI ustidami? Piksellar bo'yicha
           tekshiramiz — Yandex belgi ichidagi HTML'ga bosishni har doim
           ham yetkazmaydi, xarita bosishini esa ishonchli beradi. */
        if(m._hitMarker(c)) return;
        cb({latlng:{lat:c[0], lng:c[1]}});
      }));
    }
    return this;
  };

  /* Bosilgan nuqtaga eng yaqin belgini topib, uning bosish
     funksiyasini chaqiradi. Topilsa true qaytaradi. */
  MapW.prototype._hitMarker = function(coords){
    const list = (this._mks || []).filter(k => k._handlers && k._handlers.some(h => h.ev === 'click'));
    if(!list.length) return false;
    let proj, zoom;
    try{
      proj = this.ym.options.get('projection');
      zoom = this.ym.getZoom();
    }catch(err){ return false; }
    if(!proj || !proj.toGlobalPixels) return false;

    const cp = proj.toGlobalPixels(coords, zoom);
    let best = null, bestD = Infinity;
    list.forEach(function(k){
      const kp = proj.toGlobalPixels(k.ll, zoom);
      const dx = cp[0] - kp[0];
      const dy = cp[1] - kp[1];      // manfiy = belgidan YUQORIDA
      /* Belgining uchi nuqtada, tanasi yuqorida (~40px),
         nomi undan ham yuqorida (~75px). Shu maydon bosiladigan. */
      if(Math.abs(dx) <= 28 && dy >= -82 && dy <= 12){
        const d = dx * dx + (dy + 20) * (dy + 20);
        if(d < bestD){ bestD = d; best = k; }
      }
    });
    if(!best) return false;
    const now = Date.now();
    if(best.__lastFire && now - best.__lastFire < 400) return true;   // allaqachon ishladi
    best.__lastFire = now;
    best._handlers.filter(h => h.ev === 'click').forEach(function(h){
      try{ h.cb({ latlng:{lat:best.ll[0], lng:best.ll[1]}, target:best }); }catch(err){ console.warn(err); }
    });
    return true;
  };
  MapW.prototype.removeLayer = function(mk){ if(mk && mk._rm) mk._rm(this); return this; };
  MapW.prototype.addLayer = function(mk){ if(mk && mk.addTo) mk.addTo(this); return this; };

  function MarkerW(ll, opts){
    this.ll = norm(ll); this.opts = opts || {};
    this._tt = null; this._ttCls = ''; this._handlers = [];
  }
  MarkerW.prototype._layout = function(){
    const ic = this.opts.icon || {};
    const html = ic._html || DEFAULT_PIN;
    const cls = ic._cls || '';
    const size = ic._size || [30,38];
    const anchor = ic._anchor || [Math.round(size[0]/2), size[1]-2];
    const tipH = 30; // taxminan yorliq balandligi — bosish maydonini shuncha yuqoriga kengaytiramiz
    const tip = this._tt
      ? `<div class="${this._ttCls||'mapNameLabel'}" style="position:absolute;left:50%;transform:translateX(-50%);bottom:${size[1]+6}px;white-space:nowrap;padding:3.5px 9px;border-radius:9px;cursor:pointer;">${this._tt}</div>`
      : '';
    /* Yandex hodisalari ba'zan belgigacha yetib bormaydi — shuning uchun
       bosishni to'g'ridan-to'g'ri HTML ichiga bog'laymiz. */
    const clickAttr = this.opts.onClickJs
      ? ` onclick="event.stopPropagation(); ${this.opts.onClickJs}"` : '';
    const tpl = `<div${clickAttr} style="position:relative;width:${size[0]}px;height:${size[1]}px;cursor:pointer;">${tip}<div class="${cls}" style="width:${size[0]}px;height:${size[1]}px;">${html}</div></div>`;
    const extraTop = this._tt ? (tipH+8) : 0;
    /* Bosish maydoni: barmoq uchun kamida ~44px bo'lishi kerak.
       hitPad bilan xaritaga qarab kattalashtirish mumkin. */
    const pad = (this.opts && this.opts.hitPad != null) ? this.opts.hitPad : 10;
    return {
      layout: ymaps.templateLayoutFactory.createClass(tpl),
      offset: [-anchor[0], -anchor[1]],
      shape: {type:'Rectangle', coordinates:[[-anchor[0]-pad,-anchor[1]-extraTop-pad],[size[0]-anchor[0]+pad, size[1]-anchor[1]+pad]]}
    };
  };
  MarkerW.prototype._make = function(){
    const lo = this._layout();
    this.pm = new ymaps.Placemark(this.ll, {}, {
      iconLayout: lo.layout,
      iconOffset: lo.offset,
      iconShape: lo.shape,
      draggable: !!this.opts.draggable,
      /* Yandex bosilganda balon ochishga urinadi — bu bosishni "yutadi" */
      hasBalloon: false, hasHint: false,
      openBalloonOnClick: false, openHintOnHover: false,
      zIndex: 200 + (this.opts.zIndexOffset||0),
      zIndexHover: 200 + (this.opts.zIndexOffset||0) + 10
    });
    this._handlers.forEach(h=>this._attach(h.ev, h.cb));
  };
  MarkerW.prototype._attach = function(ev, cb){
    const self = this;
    /* Bir bosish ikki marta ishlamasin (click + tap bir vaqtda kelsa) */
    const fire = function(e){
      const now = Date.now();
      if(self.__lastFire && now - self.__lastFire < 400) return;
      self.__lastFire = now;
      L.__sup = true; setTimeout(()=>{ L.__sup = false; }, 180);
      cb(e);
    };
    this.pm.events.add(ev, fire);

    /* MUHIM: barmoq ozgina siljisa Yandex buni "surish" deb hisoblaydi
       va 'click' bermaydi. Shuning uchun bosish/qo'yib yuborishni o'zimiz
       kuzatamiz — qisqa bosish bo'lsa, tanlov baribir ishlaydi. */
    if(ev === 'click' && !this.__tapWired){
      this.__tapWired = true;
      let t0 = 0;
      this.pm.events.add('mousedown', function(){ t0 = Date.now(); });
      this.pm.events.add('mouseup', function(e){
        if(t0 && Date.now() - t0 < 600){
          (self._handlers || []).filter(h => h.ev === 'click').forEach(h => {
            const now = Date.now();
            if(self.__lastFire && now - self.__lastFire < 400) return;
            self.__lastFire = now;
            L.__sup = true; setTimeout(()=>{ L.__sup = false; }, 180);
            h.cb(e);
          });
        }
        t0 = 0;
      });
    }
  };

  /* Belgini qayta yaratmasdan rangini almashtirish */
  MarkerW.prototype.setIcon = function(icon){
    this.opts.icon = icon;
    if(this.pm){
      const lo = this._layout();
      this.pm.options.set({ iconLayout: lo.layout, iconOffset: lo.offset, iconShape: lo.shape });
    }
    return this;
  };
  MarkerW.prototype.addTo = function(mapW){
    mapW._run(m=>{
      if(!this.pm) this._make();
      m.ym.geoObjects.add(this.pm);
      this._mapW = m;
      /* Xarita o'z belgilarini bilsin — bosishni topish uchun */
      m._mks = m._mks || [];
      if(m._mks.indexOf(this) === -1) m._mks.push(this);
    });
    return this;
  };
  MarkerW.prototype.bindTooltip = function(text, o){
    this._tt = String(text||'');
    this._ttCls = (o && o.className) || 'mapNameLabel';
    if(this.pm){
      const lo = this._layout();
      this.pm.options.set({iconLayout: lo.layout, iconOffset: lo.offset, iconShape: lo.shape});
    }
    return this;
  };
  MarkerW.prototype.on = function(ev, cb){
    this._handlers.push({ev, cb});
    if(this.pm) this._attach(ev, cb);
    return this;
  };
  MarkerW.prototype.setLatLng = function(ll){
    this.ll = norm(ll);
    if(this.pm) this.pm.geometry.setCoordinates(this.ll);
    return this;
  };
  MarkerW.prototype.getLatLng = function(){
    const c = this.pm ? this.pm.geometry.getCoordinates() : this.ll;
    return {lat:c[0], lng:c[1]};
  };
  MarkerW.prototype._rm = function(mapW){
    const m = mapW || this._mapW;
    if(this.pm && m && m.ym) m.ym.geoObjects.remove(this.pm);
    /* Ro'yxatdan ham olib tashlaymiz — eski belgi bosilmasin */
    if(m && m._mks){
      const i = m._mks.indexOf(this);
      if(i !== -1) m._mks.splice(i, 1);
    }
  };

  function PolylineW(latlngs, opts){
    this.coords = (latlngs||[]).map(norm);
    this.opts = opts||{};
    this.pl = null; this._mapW = null;
  }
  PolylineW.prototype.addTo = function(mapW){
    mapW._run(m=>{
      if(!this.pl){
        this.pl = new ymaps.Polyline(this.coords, {}, {
          strokeColor: this.opts.color || '#161311',
          strokeWidth: this.opts.weight || 4,
          strokeOpacity: this.opts.opacity!=null ? this.opts.opacity : 0.85,
          strokeStyle: this.opts.dashArray ? 'shortdash' : 'solid'
        });
      }
      m.ym.geoObjects.add(this.pl);
      this._mapW = m;
    });
    return this;
  };
  PolylineW.prototype.setLatLngs = function(latlngs){
    this.coords = (latlngs||[]).map(norm);
    if(this.pl) this.pl.geometry.setCoordinates(this.coords);
    return this;
  };
  PolylineW.prototype._rm = function(mapW){
    const m = mapW || this._mapW;
    if(this.pl && m && m.ym) m.ym.geoObjects.remove(this.pl);
  };

  return {
    __sup:false,
    __maps: [],
    /* Saqlangan xarita ko'rinishi (SXEMA / SPUTNIK / GIBRID) — brauzerda eslab qolinadi */
    __mapType: (function(){
      try{
        const v = localStorage.getItem('utam_map_type');
        return ['yandex#map','yandex#satellite','yandex#hybrid'].includes(v) ? v : 'yandex#map';
      }catch(e){ return 'yandex#map'; }
    })(),
    /* Barcha ochiq xaritalarni birdaniga almashtiradi va tanlovni saqlaydi */
    setMapTypeAll(t){
      if(!['yandex#map','yandex#satellite','yandex#hybrid'].includes(t)) return;
      L.__mapType = t;
      try{ localStorage.setItem('utam_map_type', t); }catch(e){}
      L.__maps.forEach(m=>{ try{ m.setMapType(t); }catch(e){} });
    },
    map: (el, opts)=> new MapW(el, opts),
    marker: (ll, opts)=> new MarkerW(ll, opts),
    polyline: (latlngs, opts)=> new PolylineW(latlngs, opts),
    divIcon: (o)=>({_html:o.html, _cls:o.className||'', _size:o.iconSize||[30,38], _anchor:o.iconAnchor||null}),
    tileLayer: ()=>({addTo(){}}),
    DomEvent: { stopPropagation(){ L.__sup = true; setTimeout(()=>{ L.__sup = false; }, 120); } }
  };
})();
