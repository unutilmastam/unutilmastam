import { api, auth } from '../api.js';
import { reboot, state } from '../app.js';
import { avatar, clear, el, field, toastError, toastOk } from '../ui.js';

/**
 * Kirish oynasi. Ikki usul bir sahifada:
 *   1. PIN — xodim o'z rasmini bosib, shaxsiy kodini teradi (ish stansiyasi uchun tez).
 *   2. Login va parol — har doim ishlaydi, PIN unutilganda ham.
 * PIN qo'ygan xodim bo'lmasa yoki server PIN'ni o'chirgan bo'lsa, faqat parol ko'rinadi.
 */
export function loginView() {
  const body = el('div');
  const card = el('div.login-card', {}, [
    el('div.login-logo', { text: '🧪' }),
    el('h1', { text: 'LabCore' }),
    el('div.sub', { text: 'Laboratoriya boshqaruv tizimi' }),
    body,
  ]);

  const showPassword = () => clear(body).append(passwordForm(showPinList));
  const showPinList = (data) => clear(body).append(pinList(body, data, showPassword, showPinList));

  showPassword();

  // PIN qo'ygan xodimlar bo'lsa — birinchi bo'lib shu ro'yxat ochiladi.
  api.get('/auth/pin-users')
    .then((d) => { if (d.enabled && d.items.length) showPinList(d); })
    .catch(() => {});

  return el('div.login-wrap', {}, [card]);
}

/** Kirgandan keyingi umumiy qism — ikkala usul uchun bir xil. */
async function enterApp(res) {
  auth.token = res.token;
  state.user = res.user;
  state.lab = res.lab;
  if (res.user.must_change_pw) {
    toastOk('Xavfsizlik uchun parolni almashtiring (Sozlamalar bo‘limi)');
  }
  location.hash = '#/';
  await reboot();
}

// ---------------------------------------------------------------------------
// 1-usul: PIN
// ---------------------------------------------------------------------------

/** Kirish oynasidagi xodim rasmi (avtorizatsiyasiz manzil). */
const pinPhoto = (u) => (u.has_photo
  ? `/api/auth/pin-users/${u.id}/photo?v=${encodeURIComponent(u.photo_updated_at || '1')}`
  : null);

function pinList(body, data, onPassword, onBack) {
  return el('div', {}, [
    el('p.small.muted', { text: 'Rasmingizni bosing va PIN kodingizni tering' }),
    el('div.pin-people', {}, data.items.map((u) =>
      el('button.pin-person', {
        type: 'button',
        onclick: () => clear(body).append(pinKeypad(u, data, onPassword, onBack)),
      }, [
        avatar(u, { size: 62, src: pinPhoto(u) }),
        el('span.nm', { text: u.full_name }),
      ]))),
    el('button.link', { type: 'button', text: 'Login va parol bilan kirish', onclick: onPassword }),
  ]);
}

function pinKeypad(user, data, onPassword, onBack) {
  const dots = el('div.pin-dots');
  const errorBox = el('div');
  const totp = el('input', { inputmode: 'numeric', maxlength: '6', placeholder: '6 xonali kod' });
  const totpField = field('Tasdiqlash kodi (Authenticator)', totp);
  totpField.style.display = 'none';

  let pin = '';
  let busy = false;

  const render = () => {
    clear(dots).append(...Array.from({ length: Math.max(data.minLength || 4, pin.length) },
      (_, i) => el(`span${i < pin.length ? '.on' : ''}`)));
  };

  const reset = () => { pin = ''; render(); };

  async function submit() {
    if (busy || pin.length < (data.minLength || 4)) return;
    busy = true;
    errorBox.replaceChildren();
    try {
      const res = await api.post('/auth/login-pin', {
        user_id: user.id,
        pin,
        computerName: auth.computerName || undefined,
        totp: totpField.style.display !== 'none' ? totp.value.trim() : undefined,
      }, { noRedirect: true });
      if (res.totpRequired) {
        totpField.style.display = '';
        totp.focus();
        errorBox.append(el('div.error-box', { text: 'Authenticator ilovasidagi kodni kiriting' }));
        return;
      }
      document.removeEventListener('keydown', onKey);
      await enterApp(res);
    } catch (err) {
      errorBox.append(el('div.error-box', { text: err.message }));
      reset();
    } finally {
      busy = false;
    }
  }

  // PIN uzunligi har xil bo'lishi mumkin, shuning uchun o'zi yuborilmaydi:
  // xodim "✓" ni yoki Enter ni bosadi.
  const press = (d) => {
    if (pin.length >= 8) return;
    errorBox.replaceChildren();   // yangi urinish boshlandi — eski xato yo'qolsin
    pin += d;
    render();
  };
  const erase = () => { pin = pin.slice(0, -1); render(); };

  const keys = el('div.pin-keys', {}, [
    ...['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) =>
      el('button', { type: 'button', text: d, onclick: () => press(d) })),
    el('button.ghost', { type: 'button', text: '←', title: 'O‘chirish', onclick: erase }),
    el('button', { type: 'button', text: '0', onclick: () => press('0') }),
    el('button.primary', { type: 'button', text: '✓', title: 'Kirish', onclick: submit }),
  ]);

  // Klaviaturadan ham terish mumkin — ko'pchilik shuni afzal ko'radi.
  const onKey = (e) => {
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') erase();
    else if (e.key === 'Enter') submit();
    else if (e.key === 'Escape') back();
    else return;
    e.preventDefault();
  };
  document.addEventListener('keydown', onKey);

  const back = () => {
    document.removeEventListener('keydown', onKey);
    onBack(data);
  };

  render();

  return el('div.pin-pad', {}, [
    el('div.pin-who', {}, [
      avatar(user, { size: 72, src: pinPhoto(user) }),
      el('div.nm', { text: user.full_name }),
    ]),
    dots,
    errorBox,
    totpField,
    keys,
    el('button.link', { type: 'button', text: '← Boshqa xodim', onclick: back }),
    el('button.link', { type: 'button', text: 'Login va parol bilan kirish', onclick: () => { document.removeEventListener('keydown', onKey); onPassword(); } }),
  ]);
}

// ---------------------------------------------------------------------------
// 2-usul: login va parol
// ---------------------------------------------------------------------------

function passwordForm(onPin) {
  const errorBox = el('div');
  const username = el('input', { name: 'username', autocomplete: 'username', placeholder: 'login' });
  const password = el('input', { name: 'password', type: 'password', autocomplete: 'current-password' });
  const totp = el('input', { name: 'totp', inputmode: 'numeric', maxlength: '6', placeholder: '6 xonali kod' });
  const station = el('input', {
    name: 'computerName',
    value: auth.computerName,
    placeholder: 'masalan: LAB-PC-02',
  });
  const totpField = field('Tasdiqlash kodi (Authenticator)', totp);
  totpField.style.display = 'none';

  const submit = el('button.primary', { type: 'submit', text: 'Kirish', style: 'width:100%' });

  const form = el('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      errorBox.replaceChildren();
      submit.disabled = true;
      try {
        const body = {
          username: username.value.trim(),
          password: password.value,
          computerName: station.value.trim() || undefined,
        };
        if (totpField.style.display !== 'none' && totp.value.trim()) body.totp = totp.value.trim();

        const res = await api.post('/auth/login', body, { noRedirect: true });

        if (res.totpRequired) {
          totpField.style.display = '';
          totp.focus();
          errorBox.append(el('div.error-box', { text: 'Authenticator ilovasidagi kodni kiriting' }));
          return;
        }

        if (station.value.trim()) auth.computerName = station.value.trim();
        await enterApp(res);
      } catch (err) {
        errorBox.append(el('div.error-box', { text: err.message }));
        password.select();
      } finally {
        submit.disabled = false;
      }
    },
  }, [
    field('Login', username),
    field('Parol', password),
    totpField,
    field('Ish stansiyasi nomi', station),
    el('p.small.muted', { text: 'Kompyuter nomi audit jurnalida qayd etiladi.' }),
    submit,
  ]);

  const box = el('div', {}, [errorBox, form]);

  // PIN qo'ygan xodim bo'lsagina "PIN bilan kirish" havolasi ko'rinadi.
  api.get('/auth/pin-users').then((d) => {
    if (d.enabled && d.items.length) {
      box.append(el('button.link', { type: 'button', text: 'PIN kod bilan kirish', onclick: () => onPin(d) }));
    }
  }).catch(() => {});

  return box;
}

/** Parolni almashtirish shakli (sozlamalar ichida ishlatiladi). */
export function changePasswordForm() {
  const cur = el('input', { type: 'password', autocomplete: 'current-password' });
  const next = el('input', { type: 'password', autocomplete: 'new-password' });
  const again = el('input', { type: 'password', autocomplete: 'new-password' });

  return el('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      if (next.value !== again.value) return toastError(new Error('Yangi parollar mos kelmadi'));
      try {
        await api.post('/auth/change-password', { currentPassword: cur.value, newPassword: next.value });
        toastOk('Parol o‘zgartirildi');
        e.target.reset();
      } catch (err) { toastError(err); }
    },
  }, [
    field('Joriy parol', cur),
    field('Yangi parol (kamida 8 belgi)', next),
    field('Yangi parolni takrorlang', again),
    el('button.primary', { type: 'submit', text: 'Parolni saqlash' }),
  ]);
}

/** O'z PIN kodini qo'yish/almashtirish (sozlamalar ichida). */
export function pinPanel(user) {
  const pw = el('input', { type: 'password', autocomplete: 'current-password' });
  const pin = el('input', { inputmode: 'numeric', maxlength: '8', autocomplete: 'off', placeholder: '4–8 raqam' });
  const again = el('input', { inputmode: 'numeric', maxlength: '8', autocomplete: 'off' });

  const box = el('div', {}, [
    el('p.small.muted', {
      text: 'PIN bilan kirish oynasida rasmingizni bosib, qisqa kodni terasiz. '
          + 'Ketma-ket (1234) va bir xil (0000) raqamlar qabul qilinmaydi.',
    }),
    user.has_pin ? el('p', {}, [el('span.badge.ok', { text: 'Qo‘yilgan' }), ' PIN kod faol.']) : null,
    el('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        if (pin.value !== again.value) return toastError(new Error('PIN kodlar mos kelmadi'));
        try {
          await api.post('/auth/set-pin', { currentPassword: pw.value, pin: pin.value.trim() });
          toastOk('PIN kod saqlandi');
          e.target.reset();
        } catch (err) { toastError(err); }
      },
    }, [
      field('Joriy parolingiz', pw),
      field('Yangi PIN', pin),
      field('PIN ni takrorlang', again),
      el('button.primary', { type: 'submit', text: 'PIN kodni saqlash' }),
    ]),
    user.has_pin
      ? el('button.danger', {
          style: 'margin-top:10px',
          text: 'PIN kodni o‘chirish',
          onclick: async () => {
            try {
              await api.post('/auth/remove-pin');
              toastOk('PIN o‘chirildi — endi login va parol bilan kirasiz');
              location.reload();
            } catch (err) { toastError(err); }
          },
        })
      : null,
  ]);
  return box;
}

/** O'z rasmini almashtirish (sozlamalar ichida). */
export function photoPanel(user) {
  const preview = avatar(user, { size: 110 });
  const file = el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp' });

  file.onchange = () => {
    const f = file.files?.[0];
    if (f) clear(preview).append(el('img', { src: URL.createObjectURL(f), alt: '' }));
  };

  return el('div', { style: 'display:grid;gap:12px;justify-items:start' }, [
    el('p.small.muted', {
      text: 'Rasm kirish oynasida va "hozir kim ishlayapti" ro‘yxatida ko‘rinadi. JPG, PNG yoki WEBP, 5 MB gacha.',
    }),
    preview,
    file,
    el('div.row', {}, [
      el('button.primary', {
        text: 'Rasmni saqlash',
        onclick: async () => {
          const f = file.files?.[0];
          if (!f) return toastError(new Error('Rasm tanlanmadi'));
          try {
            const fd = new FormData();
            fd.append('photo', f);
            await api.upload(`/users/${user.id}/photo`, fd);
            toastOk('Rasm saqlandi');
            location.reload();
          } catch (err) { toastError(err); }
        },
      }),
      user.has_photo
        ? el('button.danger', {
            text: 'O‘chirish',
            onclick: async () => {
              try {
                await api.del(`/users/${user.id}/photo`);
                toastOk('Rasm o‘chirildi');
                location.reload();
              } catch (err) { toastError(err); }
            },
          })
        : null,
    ]),
  ]);
}

/** Ikki bosqichli loginni yoqish. */
export function twoFactorPanel(user) {
  const box = el('div');

  if (user.totp_enabled) {
    const pw = el('input', { type: 'password', placeholder: 'parolingiz' });
    box.append(
      el('p', {}, [el('span.badge.ok', { text: 'Yoqilgan' }), ' Ikki bosqichli login faol.']),
      field('O‘chirish uchun parolni kiriting', pw),
      el('button.danger', {
        text: 'O‘chirish',
        onclick: async () => {
          try {
            await api.post('/auth/2fa/disable', { password: pw.value });
            toastOk('Ikki bosqichli login o‘chirildi');
            location.reload();
          } catch (err) { toastError(err); }
        },
      }),
    );
    return box;
  }

  box.append(
    el('p.muted', { text: 'Authenticator ilovasi orqali qo‘shimcha himoya qatlami.' }),
    el('button', {
      text: 'Sozlashni boshlash',
      onclick: async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          const setup = await api.post('/auth/2fa/setup');
          const code = el('input', { inputmode: 'numeric', maxlength: '6', placeholder: '6 xonali kod' });
          box.replaceChildren(
            el('p.small.muted', { text: 'QR kodni Google/Microsoft Authenticator bilan skanerlang:' }),
            el('img', { src: setup.qr, alt: 'QR', width: '200' }),
            el('p.small.mono', { text: setup.secret }),
            field('Ilovadagi kodni kiriting', code),
            el('button.primary', {
              text: 'Yoqish',
              onclick: async () => {
                try {
                  await api.post('/auth/2fa/enable', { totp: code.value.trim() });
                  toastOk('Ikki bosqichli login yoqildi');
                  location.reload();
                } catch (err) { toastError(err); }
              },
            }),
          );
        } catch (err) { toastError(err); }
      },
    }),
  );
  return box;
}
