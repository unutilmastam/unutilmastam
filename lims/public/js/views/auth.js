import { api, auth } from '../api.js';
import { reboot, state } from '../app.js';
import { el, field, toastError, toastOk } from '../ui.js';

/** Kirish oynasi: login, parol, kerak bo'lsa ikki bosqichli kod. */
export function loginView() {
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

        const res = await api.post('/auth/login', body);

        if (res.totpRequired) {
          totpField.style.display = '';
          totp.focus();
          errorBox.append(el('div.error-box', { text: 'Authenticator ilovasidagi kodni kiriting' }));
          return;
        }

        auth.token = res.token;
        if (station.value.trim()) auth.computerName = station.value.trim();
        state.user = res.user;
        state.lab = res.lab;
        if (res.user.must_change_pw) {
          toastOk('Xavfsizlik uchun parolni almashtiring (Sozlamalar bo‘limi)');
        }
        location.hash = '#/';
        await reboot();
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

  return el('div.login-wrap', {}, [
    el('div.login-card', {}, [
      el('div.login-logo', { text: '🧪' }),
      el('h1', { text: 'LabCore' }),
      el('div.sub', { text: 'Laboratoriya boshqaruv tizimi' }),
      errorBox,
      form,
    ]),
  ]);
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
