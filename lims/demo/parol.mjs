const B='http://127.0.0.1:4950/api';
for (const [u,eski] of [['admin','Admin12345'],['nodira','Xodim12345'],['bekzod','Xodim12345'],['gulnora','Xodim12345'],['shahzod','Xodim12345']]) {
  const lr = await fetch(B+'/auth/login',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({username:u,password:eski,workstation:'LAB-PC'})});
  const l = await lr.json();
  if (!l.token) { console.log(u,'kirish:', JSON.stringify(l).slice(0,80)); continue; }
  const r = await fetch(B+'/auth/change-password',{method:'POST',
    headers:{'content-type':'application/json',authorization:'Bearer '+l.token},
    body:JSON.stringify({currentPassword:eski,newPassword:'ShifoLab2026'})});
  console.log(u, r.status===200 ? 'parol almashtirildi' : JSON.stringify(await r.json()).slice(0,90));
}
