const params = new URLSearchParams(location.search);
document.getElementById('station').textContent =
  `Ish stansiyasi nomi: ${params.get('station') || '—'} (audit jurnalida shu nom ko‘rinadi)`;

const urlInput = document.getElementById('url');
const msg = document.getElementById('msg');
const saveBtn = document.getElementById('save');

function show(text, kind) {
  msg.className = 'msg ' + kind;
  msg.style.whiteSpace = 'pre-line';
  msg.textContent = text;
}

document.getElementById('test').addEventListener('click', async () => {
  const url = urlInput.value.trim().replace(/\/+$/, '');
  if (!url) return show('Manzil kiritilmadi', 'err');
  show('Tekshirilmoqda…', '');
  const res = await window.labcore.testServer(url);
  if (res.ok) {
    show(
      `✓ Ulanish muvaffaqiyatli${res.lab ? ' — ' + res.lab : ''}` +
      (res.selfSigned ? '\n(sertifikat imzolanmagan — birinchi ochilganda tasdiqlashingiz so‘raladi)' : ''),
      'ok',
    );
    saveBtn.disabled = false;
  } else {
    show('✗ Ulanib bo‘lmadi: ' + (res.error || 'server javob bermadi'), 'err');
    saveBtn.disabled = true;
  }
});

const autoStart = document.getElementById('autostart');

// Dastur avval o'rnatilgan bo'lsa, joriy holatni ko'rsatamiz.
window.labcore.getAutoStart?.().then((on) => { autoStart.checked = on !== false; }).catch(() => {});

saveBtn.addEventListener('click', () => {
  window.labcore.saveServer(urlInput.value.trim().replace(/\/+$/, ''), {
    autoStart: autoStart.checked,
  });
});
