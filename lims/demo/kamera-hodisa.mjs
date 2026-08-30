const B='http://127.0.0.1:4950/api';
const call=async(m,p,b,T,h={})=>{const r=await fetch(B+p,{method:m,headers:{'content-type':'application/json','x-computer-name':'LAB-SERVER',...(T?{authorization:'Bearer '+T}:{}),...h},body:b?JSON.stringify(b):undefined});
  const x=await r.json().catch(()=>({})); if(!r.ok) throw new Error(`${m} ${p} ${r.status} ${JSON.stringify(x).slice(0,140)}`); return x;};
const {token:A}=await call('POST','/auth/login',{username:'admin',password:'ShifoLab2026',workstation:'LAB-SERVER'});

const {items:users}=await call('GET','/users',null,A);
const {items:cams}=await call('GET','/cameras',null,A);

// Yuz yorliqlarini xodimlarga bog'laymiz
const map={'nodira':'nodira_i','bekzod':'bekzod_r','gulnora':'gulnora_s','shahzod':'shahzod_a'};
for(const u of users){ if(!map[u.username]) continue;
  await call('POST','/cameras/faces',{face_label:map[u.username],user_id:u.id,note:'Yuz namunasi'},A)
    .then(()=>console.log('yuz:',map[u.username],'->',u.full_name)).catch(e=>console.log(e.message.slice(0,80)));
}

// Kameraga kalit olamiz va hodisa yuboramiz
for(const c of cams){
  const {token}=await call('POST',`/cameras/${c.id}/token`,{},A);
  const bugun=new Date(); bugun.setHours(0,0,0,0);
  const soat=(h,m)=>new Date(bugun.getTime()+h*3600000+m*60000).toISOString();
  const hodisalar=[];
  if(c.name==='Registratura'){
    hodisalar.push({type:'face',face_label:'gulnora_s',at:soat(8,4)},
                   {type:'face',face_label:'gulnora_s',at:soat(12,31)},
                   {type:'motion',at:soat(9,12)});
  } else if(c.name==='Laboratoriya xonasi'){
    hodisalar.push({type:'face',face_label:'nodira_i',at:soat(8,1)},
                   {type:'face',face_label:'shahzod_a',at:soat(8,26)},
                   {type:'face',face_label:'nodira_i',at:soat(13,5)},
                   {type:'motion',at:soat(10,44)});
  } else {
    hodisalar.push({type:'face',face_label:'gulnora_s',at:soat(8,9)},
                   {type:'motion',at:soat(11,20)});
  }
  const r=await fetch(B+'/cameras/events',{method:'POST',
    headers:{'content-type':'application/json','x-computer-name':'LAB-SERVER','x-camera-token':token},
    body:JSON.stringify({events:hodisalar})});
  console.log(`${c.name}: ${r.status===200?'hodisalar yuborildi ('+hodisalar.length+' ta)':await r.text()}`);
}
console.log('\nTAYYOR');
