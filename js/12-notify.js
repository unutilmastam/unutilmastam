/* Unutilmas Ta'm — 12-notify
   Avtomatik ajratilgan modul. Tartib MUHIM: index.html dagi ketma-ketlikni buzmang. */

function playNotifSound(){
  try{
    __audioCtx = __audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = __audioCtx;
    const now = ctx.currentTime;
    [[880,now,0.09],[1160,now+0.1,0.11]].forEach(([freq,start,dur])=>{
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.type='sine'; osc.frequency.value=freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start+0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start+dur);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(start); osc.stop(start+dur+0.02);
    });
  }catch(e){}
}

/* ==================== NOTIFICATIONS ====================
   ESLATMA: Bu yerdagi bildirishnoma "push"i faqat ilova brauzerda OCHIQ turgan paytda ishlaydi
   (Notification API orqali). Ilova yopiq bo'lganda ham xabar yetkazish uchun haqiqiy
   Web Push serveri + Service Worker + push-obuna kerak bo'ladi — buni backend dasturchi ulashi kerak.
   Shu bilan birga har bir bildirishnoma state.notifications ichida saqlanadi va foydalanuvchi
   ilovani keyingi safar ochganda ham "Bildirishnomalar" bo'limida ko'rinadi. */
function notifRecipientKey(){
  if(!currentUser) return null;
  return currentUser.role==='admin' ? 'admin' : currentUser.id;
}

async function ensureNotifPermission(){
  if(!('Notification' in window)) return false;
  if(Notification.permission==='granted') return true;
  if(Notification.permission==='denied') return false;
  try{ const p = await Notification.requestPermission(); return p==='granted'; }catch(e){ return false; }
}

function unreadNotifCount(){
  const key = notifRecipientKey();
  if(!key) return 0;
  return state.notifications.filter(n=>n.recipient===key && !n.read).length;
}

function refreshNotifBadge(){
  const key = notifRecipientKey();
  const btn = document.getElementById('notifBtn');
  if(!btn) return;
  btn.classList.toggle('hidden', !key);
  const count = key ? unreadNotifCount() : 0;
  const badge = document.getElementById('notifBadge');
  badge.classList.toggle('hidden', count===0);
  badge.textContent = count>9 ? '9+' : String(count);
}

function downloadAppFromNotif(url){
  if(!url) return;
  window.location.href = url;
}

 // hozir ochilgan suhbat qaysi mijozga tegishli
function getOrCreateChat(userId, userName){
  let c = state.chats.find(x=>x.userId===userId);
  if(!c){ c = {id:uid('ch'), userId, userName, messages:[], unreadAdmin:false, unreadUser:false}; state.chats.push(c); }
  return c;
}

/* ============================================================
   BARCHAGA XABAR (broadcast) — barcha ro'yxatdan o'tganlarga
   ============================================================ */
function openBroadcastModal(){
  document.getElementById('bcTitle').value = '';
  document.getElementById('bcBody').value = '';
  const apkUrl = (state.sellerInfo && state.sellerInfo.apkUrl) || '';
  document.getElementById('bcIncludeDownload').checked = false;
  document.getElementById('bcIncludeDownload').disabled = !apkUrl;
  document.getElementById('bcDownloadRow').style.opacity = apkUrl ? '1' : '.45';
  document.getElementById('bcNoApkWarning').classList.toggle('hidden', !!apkUrl);
  openModal('modalBroadcast');
}

async function sendBroadcast(){
  const title = document.getElementById('bcTitle').value.trim() || 'Yangilik';
  const body = document.getElementById('bcBody').value.trim();
  if(!body){ alert('Xabar matnini kiriting'); return; }
  const targets = (state.users||[]).filter(u=>!u.blocked);
  if(!targets.length){ alert("Hali ro'yxatdan o'tgan foydalanuvchi yo'q"); return; }
  if(!confirm(`Bu xabar ${targets.length} ta foydalanuvchiga yuboriladi. Davom etamizmi?`)) return;
  const includeDownload = document.getElementById('bcIncludeDownload').checked;
  const apkUrl = (state.sellerInfo && state.sellerInfo.apkUrl) || '';
  const downloadUrl = (includeDownload && apkUrl) ? apkUrl : null;
  const now = new Date().toISOString();
  targets.forEach(u=>{
    state.notifications.push({id:uid('n'), recipient:u.id, title, body, type:'broadcast', ref:null, downloadUrl, date:now, read:false});
  });
  await saveState();
  closeModal('modalBroadcast');
  alert("Xabar barcha foydalanuvchilarga yuborildi!");
}

function openChatContactsModal(){
  const box = document.getElementById('chatContactsList');
  const users = (state.users||[]).filter(u=>!u.blocked);
  box.innerHTML = users.map(u=>{
    const chat = state.chats.find(x=>x.userId===u.id);
    const lastMsg = chat && chat.messages.length ? chat.messages[chat.messages.length-1] : null;
    return `<div class="contactRow" onclick="startChatWithUser('${u.id}')">
      <div class="qarzAvatar" style="background:${qarzColorFor(u.name)};">${initialsOf(u.name)}</div>
      <div style="flex:1;min-width:0;">
        <div class="nm" style="font-weight:700;font-size:13.5px;">${u.name}</div>
        <div class="smallMuted" style="font-size:11.5px;">${lastMsg ? "Suhbat mavjud" : (u.contact||'')}</div>
      </div>
      ${ic('chev',15)}
    </div>`;
  }).join('') || emptyHtml('users', "Ro'yxatdan o'tgan foydalanuvchi yo'q");
  openModal('modalChatContacts');
}

function startChatWithUser(userId){
  closeModal('modalChatContacts');
  adminOpenChat(userId);
}

function renderChatThread(){
  const chat = state.chats.find(x=>x.userId===activeChatUserId);
  const box = document.getElementById('chatThread');
  const isAdmin = currentUser && currentUser.role==='admin';
  const msgs = chat ? chat.messages : [];
  box.innerHTML = msgs.map((m,idx)=>{
    const mine = isAdmin ? m.from==='admin' : m.from==='user';
    const timeTxt = new Date(m.time).toLocaleString('uz-UZ',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    let body = '';
    if(m.image){
      body = `<img src="${m.image}" onclick="openImageViewer('${m.image}')">`;
    } else if(m.audio){
      body = `<audio controls src="${m.audio}"></audio>`;
    } else {
      body = (m.text||'').replace(/</g,'&lt;');
    }
    const editedTag = m.edited ? '<span class="editedTag">tahrirlangan</span>' : '';
    const clickAttr = (mine && m.text && !m.image && !m.audio) ? `onclick="startEditMessage(${idx})"` : '';
    const delBtn = isAdmin ? `<button class="msgDelBtn" onclick="event.stopPropagation();adminDeleteMessage(${idx})">${ic('trash',11)}</button>` : '';
    return `<div class="chatBubble ${mine?'mine':'theirs'}" ${clickAttr}>${delBtn}${body}<span class="t">${timeTxt}${editedTag}</span></div>`;
  }).join('') || `<div class="smallMuted" style="text-align:center;padding:20px 0;">Hali xabar yo'q. Birinchi bo'lib yozing!</div>`;
  box.scrollTop = box.scrollHeight;
  renderTypingIndicator();
}

function autoGrowChatInput(el){
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

async function sendChatMessage(){
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if(!text || !activeChatUserId) return;
  const isAdmin = currentUser && currentUser.role==='admin';
  const chat = getOrCreateChat(activeChatUserId, isAdmin ? (state.chats.find(x=>x.userId===activeChatUserId)||{}).userName : currentUser.name);
  if(editingMsgIndex!==null && chat.messages[editingMsgIndex]){
    chat.messages[editingMsgIndex].text = text;
    chat.messages[editingMsgIndex].edited = true;
    editingMsgIndex = null;
    document.getElementById('chatEditBanner').classList.add('hidden');
  } else {
    chat.messages.push({from: isAdmin?'admin':'user', text, time: new Date().toISOString()});
    if(isAdmin){ chat.unreadUser = true; } else { chat.unreadAdmin = true; }
  }
  chat[isAdmin ? 'adminTyping' : 'userTyping'] = 0;
  clearTimeout(typingTimeout);
  input.value = '';
  input.style.height = 'auto';
  await saveState();
  renderChatThread();
  if(isAdmin){
    pushNotification(activeChatUserId, 'Ishlab chiqaruvchidan javob', text, 'chat', {type:'chat', id:activeChatUserId});
  } else {
    pushNotification('admin', `${currentUser.name} yozdi`, text, 'chat', {type:'chat', id:currentUser.id});
    try{ renderChatList(); }catch(e){}
  }
}

/* ---- Admin: chatdan turib foydalanuvchini bloklash ---- */
function chatToggleBlock(){
  if(!activeChatUserId) return;
  const u = state.users.find(x=>x.id===activeChatUserId);
  if(!u) return;
  const action = u.blocked ? "blokdan chiqarish" : "bloklash";
  if(!confirm(`${u.name} ni ${action}ni tasdiqlaysizmi?`)) return;
  u.blocked = !u.blocked;
  saveState();
  if(u.blocked){
    pushNotification(u.id, 'Hisobingiz bloklandi', "Administratsiya tomonidan hisobingiz vaqtincha bloklandi. Savollar bo'lsa, do'kon bilan bog'laning.", 'block');
  }
  updateChatBlockUI();
}

function updateChatBlockUI(){
  const u = state.users.find(x=>x.id===activeChatUserId);
  const btn = document.getElementById('chatBlockBtn');
  const isAdmin = currentUser && currentUser.role==='admin';
  if(!btn) return;
  btn.classList.toggle('hidden', !isAdmin || !u);
  if(u){ btn.title = u.blocked ? "Blokdan chiqarish" : "Bloklash"; btn.style.background = u.blocked ? 'rgba(66,116,66,.15)' : 'rgba(192,66,74,.12)'; }
}

function myCallId(){ return currentUser ? (currentUser.role==='admin' ? 'admin' : currentUser.id) : null; }

function myCallName(){ return currentUser ? (currentUser.role==='admin' ? 'Ishlab chiqaruvchi' : currentUser.name) : ''; }

function setupCallListenerForCurrentUser(){
  if(!cloudOn() || !fsDb) return;
  const myId = myCallId();
  if(__callListenerForUser === myId) return; // allaqachon shu foydalanuvchi uchun tinglanmoqda
  if(callIncomingUnsub){ try{ callIncomingUnsub(); }catch(e){} callIncomingUnsub = null; }
  __callListenerForUser = myId;
  if(!myId) return;
  callIncomingUnsub = fsDb.collection('calls')
    .where('calleeId','==',myId)
    .where('status','==','ringing')
    .onSnapshot(snap=>{
      snap.docChanges().forEach(ch=>{
        if(ch.type!=='added') return;
        const d = ch.doc.data();
        // 25 soniyadan eski "ringing" yozuvlarni e'tiborsiz qoldiramiz (ilova yopiq bo'lganda qolib ketgan bo'lishi mumkin)
        if(Date.now() - (d.createdAt||0) > 25000) return;
        if(callId) return; // allaqachon boshqa qo'ng'iroqdaman
        showIncomingCall(ch.doc.id, d);
      });
    }, err=>{
      console.warn("Qo'ng'iroq tinglashda xato:", err);
      if(err && err.code==='permission-denied' && !__callPermWarned){
        __callPermWarned = true;
        alert("Qo'ng'iroq funksiyasi ishlamayapti: Firebase xavfsizlik qoidalarida 'calls' to'plamiga ruxsat yo'q. Firebase Console → Firestore → Rules bo'limiga /calls/{document=**} uchun ruxsat qo'shing.");
      }
    });
}

function showIncomingCall(id, data){
  callId = id; callRole = 'callee'; callTargetId = data.callerId; callTargetName = data.callerName || "Noma'lum";
  document.getElementById('callAvatar').textContent = (callTargetName[0]||'?').toUpperCase();
  document.getElementById('callName').textContent = callTargetName;
  document.getElementById('callStatus').textContent = "Qo'ng'iroq qilmoqda...";
  document.getElementById('callTimer').classList.add('hidden');
  document.getElementById('callSecondaryRow').classList.add('hidden');
  document.getElementById('callAcceptBtn').classList.remove('hidden');
  document.getElementById('callScreenBg').classList.add('open');
  startRingtone();
  // qo'ng'iroq bekor qilinsa (chaqiruvchi tomondan) ekranni yopamiz
  callUnsub = fsDb.collection('calls').doc(id).onSnapshot(doc=>{
    const d = doc.data();
    if(!d) return;
    if(d.status==='cancelled' || d.status==='ended'){ cleanupCall(); }
  });
}

async function acceptIncomingCall(){
  stopRingtone();
  const docRef = fsDb.collection('calls').doc(callId);
  const snap = await docRef.get();
  const d = snap.data();
  if(!d){ cleanupCall(); return; }

  try{
    callLocalStream = await navigator.mediaDevices.getUserMedia({audio:true});
  }catch(e){
    alert("Mikrofonga ruxsat berilmadi");
    await docRef.update({status:'declined'});
    cleanupCall();
    return;
  }

  callPC = new RTCPeerConnection(ICE_SERVERS);
  callLocalStream.getTracks().forEach(t=>callPC.addTrack(t, callLocalStream));
  const remoteStream = new MediaStream();
  document.getElementById('callRemoteAudio').srcObject = remoteStream;
  callPC.ontrack = e=>{
    const audioEl = document.getElementById('callRemoteAudio');
    // Ba'zi brauzerlar (ayniqsa iOS Safari) stream'ga keyinchalik qo'shilgan
    // trackni "sezmasligi" mumkin — shuning uchun to'g'ridan-to'g'ri kelgan
    // stream'ni o'rnatib, aniq play() chaqiramiz (ovoz eshitilmasligining
    // eng ko'p uchraydigan sababi shu).
    if(audioEl.srcObject !== e.streams[0]) audioEl.srcObject = e.streams[0];
    audioEl.muted = false;
    audioEl.play().catch(()=>{});
  };

  callPC.onicecandidate = e=>{
    if(e.candidate) docRef.update({calleeCandidates: firebase.firestore.FieldValue.arrayUnion(JSON.stringify(e.candidate))}).catch(()=>{});
  };

  await callPC.setRemoteDescription(new RTCSessionDescription(d.offer));
  const answer = await callPC.createAnswer();
  await callPC.setLocalDescription(answer);
  await docRef.update({answer:{type:answer.type, sdp:answer.sdp}, status:'accepted'});

  document.getElementById('callStatus').textContent = "Ulandi";
  document.getElementById('callAcceptBtn').classList.add('hidden');
  document.getElementById('callSecondaryRow').classList.remove('hidden');
  startCallTimer();
  document.getElementById('callRemoteAudio').play().catch(()=>{});

  let addedCallerCandidates = new Set((d.callerCandidates||[]));
  (d.callerCandidates||[]).forEach(cStr=>{ try{ callPC.addIceCandidate(new RTCIceCandidate(JSON.parse(cStr))); }catch(e){} });
  if(callUnsub) callUnsub();
  callUnsub = docRef.onSnapshot(doc=>{
    const dd = doc.data();
    if(!dd) return;
    (dd.callerCandidates||[]).forEach(cStr=>{
      if(addedCallerCandidates.has(cStr)) return;
      addedCallerCandidates.add(cStr);
      try{ callPC.addIceCandidate(new RTCIceCandidate(JSON.parse(cStr))); }catch(e){}
    });
    if(dd.status==='ended'){ cleanupCall(); }
  });
}

function declineOrEndCall(){
  if(callId && fsDb){
    const docRef = fsDb.collection('calls').doc(callId);
    const stillRinging = document.getElementById('callAcceptBtn') && !document.getElementById('callAcceptBtn').classList.contains('hidden');
    if(callRole==='callee' && stillRinging){
      docRef.update({status:'declined'}).catch(()=>{});
    } else if(callRole==='caller' && stillRinging){
      // Qo'ng'iroq hali javob berilmagan, chaqiruvchi o'zi bekor qildi
      docRef.update({status:'cancelled'}).catch(()=>{});
    } else {
      // Suhbat allaqachon ulangan edi — endi ikkala tomon uchun ham "tugadi" holati
      docRef.update({status:'ended'}).catch(()=>{});
    }
  }
  cleanupCall();
}

function startCallTimer(){
  callConnectedAt = Date.now();
  document.getElementById('callTimer').classList.remove('hidden');
  clearInterval(callTimerInt);
  callTimerInt = setInterval(()=>{
    const s = Math.floor((Date.now()-callConnectedAt)/1000);
    document.getElementById('callTimer').textContent = Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
  }, 500);
}

function toggleCallMute(){
  if(!callLocalStream) return;
  callMuted = !callMuted;
  callLocalStream.getAudioTracks().forEach(t=>t.enabled = !callMuted);
  document.getElementById('callMuteBtn').classList.toggle('active', callMuted);
}

function toggleCallSpeaker(){
  // Mobil brauzerlarda dinamik/quloqchin tanlash cheklangan — bu asosan vizual holat
  callSpeakerOn = !callSpeakerOn;
  document.getElementById('callSpeakerBtn').classList.toggle('active', callSpeakerOn);
}

function cleanupCall(){
  stopRingtone();
  clearInterval(callTimerInt); callTimerInt = null;
  if(callUnsub){ try{ callUnsub(); }catch(e){} callUnsub = null; }
  if(callPC){ try{ callPC.close(); }catch(e){} callPC = null; }
  if(callLocalStream){ try{ callLocalStream.getTracks().forEach(t=>t.stop()); }catch(e){} callLocalStream = null; }
  document.getElementById('callScreenBg').classList.remove('open');
  document.getElementById('callRemoteAudio').srcObject = null;
  callMuted = false; callSpeakerOn = false;
  callId = null; callRole = null; callTargetId = null; callTargetName = '';
}

function renderChatList(){
  const box = document.getElementById('chatAdminList');
  if(!box) return;
  const list = [...state.chats].filter(c=>c.messages.length>0).sort((a,b)=>{
    const at = a.messages[a.messages.length-1].time, bt = b.messages[b.messages.length-1].time;
    return bt.localeCompare(at);
  });
  box.innerHTML = list.map(c=>{
    const last = c.messages[c.messages.length-1];
    return `<div class="card chatListItem" onclick="adminOpenChat('${c.userId}')">
      <div class="qarzAvatar" style="background:${qarzColorFor(c.userName)};">${initialsOf(c.userName)}</div>
      <div class="mid" style="flex:1;min-width:0;">
        <div class="nm">${c.userName||'Mijoz'}</div>
        <div class="prev">${last.from==='admin'?'Siz: ':''}${(last.text||'').replace(/</g,'&lt;')}</div>
      </div>
      ${c.unreadAdmin?'<span class="chatUnreadDot"></span>':''}
    </div>`;
  }).join('') || emptyHtml('bell','Hali hech kim yozmagan');
}
