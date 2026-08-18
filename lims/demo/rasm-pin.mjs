import fs from 'node:fs';
const B = 'http://127.0.0.1:4950/api';
const call = async (m, p, b, T) => {
  const r = await fetch(B + p, { method: m, headers: { 'content-type': 'application/json', 'x-computer-name': 'LAB-SERVER', ...(T?{authorization:'Bearer '+T}:{}) }, body: b?JSON.stringify(b):undefined });
  const x = await r.json().catch(()=>({})); if (!r.ok) throw new Error(`${m} ${p} ${r.status} ${JSON.stringify(x).slice(0,150)}`); return x; };

const { token: A } = await call('POST','/auth/login',{username:'admin',password:process.env.DEMO_ADMIN_PW || 'Admin12345',workstation:'LAB-SERVER'});
const { items: users } = await call('GET','/users',null,A);
const pinlar = { admin:'246810', nodira:'135790', bekzod:'482619', gulnora:'703528', shahzod:'591734' };

for (const u of users) {
  const f = `/tmp/avatars/${u.username}.png`;
  if (fs.existsSync(f)) {
    const fd = new FormData();
    fd.append('photo', new Blob([fs.readFileSync(f)], { type: 'image/png' }), `${u.username}.png`);
    const r = await fetch(`${B}/users/${u.id}/photo`, { method:'POST', headers:{ authorization:'Bearer '+A }, body: fd });
    console.log(`rasm ${u.username}:`, r.status === 200 ? 'OK' : await r.text());
  }
  if (pinlar[u.username]) {
    await call('POST', `/users/${u.id}/pin`, { pin: pinlar[u.username] }, A)
      .then(()=>console.log(`PIN  ${u.username}: OK`))
      .catch(e=>console.log(`PIN  ${u.username}:`, e.message.slice(0,110)));
  }
}
