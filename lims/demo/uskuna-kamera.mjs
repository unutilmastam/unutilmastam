const B='http://127.0.0.1:4950/api';
const call=async(m,p,b,T)=>{const r=await fetch(B+p,{method:m,headers:{'content-type':'application/json','x-computer-name':'LAB-SERVER',...(T?{authorization:'Bearer '+T}:{})},body:b?JSON.stringify(b):undefined});
  const x=await r.json().catch(()=>({})); if(!r.ok) throw new Error(`${m} ${p} ${r.status} ${JSON.stringify(x).slice(0,140)}`); return x;};
const {token:A}=await call('POST','/auth/login',{username:'admin',password:'ShifoLab2026',workstation:'LAB-SERVER'});

// --- Analizatorlar ---
const uskunalar=[
  {name:'Mindray BC-5150 (gematologiya)', protocol:'hl7',    host:'192.168.1.51', port:5150},
  {name:'Humalyzer 3000 (biokimyo)',      protocol:'astm',   host:'192.168.1.52', port:5100},
  {name:'Siydik analizatori H-500',       protocol:'folder', folder:'C:\\Analizator\\natijalar'},
];
const yaratilgan=[];
for(const u of uskunalar){ const d=await call('POST','/devices',u,A); yaratilgan.push(d); console.log('uskuna:',d.name); }

// --- Analizator kodlarini analizlarga bog'laymiz ---
const {items:tests}=await call('GET','/catalog/tests',null,A);
const bogla=[['WBC','WBC'],['HGB','HGB'],['GLU','GLU']];
for(const [uskunaKod,katalogKod] of bogla){
  const t=tests.find(x=>x.code===katalogKod); if(!t) continue;
  await call('POST',`/devices/${yaratilgan[0].id}/mappings`,{device_code:uskunaKod,test_id:t.id},A)
    .then(()=>console.log('  bog\'landi:',uskunaKod,'->',t.name)).catch(e=>console.log('  ',e.message.slice(0,80)));
}

// --- Uskunadan haqiqiy xabar keladi (HL7) ---
const hl7=[
 'MSH|^~\\&|BC-5150|LAB|LABCORE|LAB|20260818090000||ORU^R01|MSG0001|P|2.3.1',
 'PID|1||100001||Karimov^Anvar',
 'OBR|1||2026-000001|CBC',
 'OBX|1|NM|WBC||6.8|10^9/L|4.0-9.0|N|||F',
 'OBX|2|NM|HGB||141|g/L|130-160|N|||F',
].join('\r');
await call('POST',`/devices/${yaratilgan[0].id}/simulate`,{raw:hl7},A)
  .then(r=>console.log('uskunadan natija keldi:',r.applied.length,'ta qabul,',r.skipped.length,'ta o\'tkazildi'))
  .catch(e=>console.log('simulate:',e.message.slice(0,140)));

// --- Kameralar ---
const kameralar=[
  {name:'Registratura',      location:'1-qavat, kirish',   workstation:'REG-PC-01', stream_type:'rtsp', stream_url:'rtsp://192.168.1.71/stream1'},
  {name:'Laboratoriya xonasi',location:'2-qavat',          workstation:'LAB-PC-02', stream_type:'rtsp', stream_url:'rtsp://192.168.1.72/stream1'},
  {name:'Kassa',             location:'1-qavat',           workstation:'KASSA-01',  stream_type:'mjpeg',stream_url:'http://192.168.1.73/video'},
];
for(const k of kameralar){ const c=await call('POST','/cameras',k,A); console.log('kamera:',c.name); }
console.log('\nTAYYOR');
