import { api } from '../api.js';
import { state } from '../app.js';
import {
  clear, el, emptyRow, field, fmtDateTime, fmtMoney, modal, table, toastError, toastOk,
} from '../ui.js';

const METHOD = { cash: 'Naqd', card: 'Karta', transfer: "O'tkazma" };

/** Kassa: to'lovlar ro'yxati, yangi to'lov, chek. */
export async function cashierView() {
  const box = el('div');
  const from = el('input', { type: 'date', value: new Date().toISOString().slice(0, 10), style: 'max-width:160px' });
  const to = el('input', { type: 'date', value: new Date().toISOString().slice(0, 10), style: 'max-width:160px' });
  const totals = el('div.grid.cols-3', { style: 'margin-bottom:16px' });

  async function load() {
    clear(box).append(el('div.empty', { text: 'Yuklanmoqda…' }));
    const q = new URLSearchParams({ from: from.value, to: to.value });
    try {
      const d = await api.get('/payments?' + q);
      clear(totals).append(
        stat('Tushum', fmtMoney(d.totals.income, state.lab.currency)),
        stat('Qaytarilgan', fmtMoney(d.totals.refunds, state.lab.currency)),
        stat('Sof', fmtMoney(Number(d.totals.income) - Number(d.totals.refunds), state.lab.currency)),
      );
      clear(box).append(table(
        ['Chek', 'Bemor', 'Buyurtma', 'Summa', 'Turi', 'Kassir', 'Vaqt', ''],
        d.items.length
          ? d.items.map((p) => el('tr', {}, [
              el('td.mono', { text: p.receipt_no }),
              el('td', {}, [el('a', { href: `#/patients/${p.patient_id}`, text: `${p.last_name} ${p.first_name}` })]),
              el('td.mono.small', { text: p.order_number || '—' }),
              el('td.num', {}, [
                p.is_refund
                  ? el('span.badge.danger', { text: '-' + fmtMoney(p.amount, state.lab.currency) })
                  : el('span', { text: fmtMoney(p.amount, state.lab.currency) }),
              ]),
              el('td', { text: METHOD[p.method] }),
              el('td.small', { text: p.cashier_name }),
              el('td.small', { text: fmtDateTime(p.created_at) }),
              el('td', {}, [
                el('button.sm', { text: 'Chek', onclick: () => printReceipt(p.id) }),
                state.user.role === 'admin' && !p.is_refund
                  ? el('button.sm', { text: 'Qaytarish', onclick: () => refundDialog(p, load) })
                  : null,
              ]),
            ]))
          : [emptyRow(8, 'To‘lovlar yo‘q')],
      ));
    } catch (err) {
      clear(box).append(el('div.error-box', { text: err.message }));
    }
  }

  from.addEventListener('change', load);
  to.addEventListener('change', load);
  load();

  return el('div', {}, [
    el('div.card', {}, [
      el('div.row', {}, [
        from, to, el('div.spacer'),
        el('button.primary', { text: '+ To‘lov qabul qilish', onclick: () => paymentDialog(load) }),
      ]),
    ]),
    totals,
    el('div.card', {}, [box]),
  ]);
}

const stat = (label, value) => el('div.stat', {}, [
  el('div.label', { text: label }), el('div.value', { style: 'font-size:20px', text: value }),
]);

async function paymentDialog(onDone) {
  const search = el('input', { placeholder: 'Bemorni qidirish (ism yoki karta)…' });
  const found = el('div', { style: 'max-height:180px;overflow:auto' });
  const amount = el('input', { inputmode: 'numeric', placeholder: '0' });
  const method = el('select', {}, Object.entries(METHOD).map(([v, t]) => el('option', { value: v, text: t })));
  const orderSelect = el('select', {}, [el('option', { value: '', text: 'Buyurtmasiz' })]);
  let patient = null;

  let timer;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (search.value.trim().length < 2) return;
      const d = await api.get('/patients?q=' + encodeURIComponent(search.value.trim()));
      clear(found).append(...d.items.slice(0, 8).map((p) =>
        el('div.row', {
          style: 'cursor:pointer;padding:6px;border-bottom:1px solid var(--border)',
          onclick: async () => {
            patient = p;
            search.value = `${p.last_name} ${p.first_name} (${p.card_number})`;
            clear(found);
            const orders = await api.get(`/orders?patient_id=${p.id}`);
            clear(orderSelect).append(
              el('option', { value: '', text: 'Buyurtmasiz' }),
              ...orders.items
                .filter((o) => Number(o.total_amount) > Number(o.paid_amount))
                .map((o) => el('option', {
                  value: o.id,
                  text: `${o.order_number} — qoldiq ${fmtMoney(Number(o.total_amount) - Number(o.paid_amount), state.lab.currency)}`,
                })),
            );
            const first = orderSelect.options[1];
            if (first) { orderSelect.value = first.value; amount.value = String(orders.items.find((o) => String(o.id) === first.value).total_amount); }
          },
        }, [`${p.last_name} ${p.first_name}`, el('span.muted.small', { text: ` · ${p.card_number} · ${p.phone || ''}` })]),
      ));
    }, 300);
  });

  modal({
    title: 'To‘lov qabul qilish',
    body: el('div', {}, [
      field('Bemor', search), found,
      field('Buyurtma', orderSelect),
      field('Summa', amount),
      field('To‘lov turi', method),
    ]),
    actions: [{
      label: 'Qabul qilish', primary: true,
      onClick: async () => {
        if (!patient) { toastError(new Error('Bemorni tanlang')); return false; }
        const p = await api.post('/payments', {
          patient_id: patient.id,
          order_id: orderSelect.value || undefined,
          amount: Number(amount.value),
          method: method.value,
        });
        toastOk(`Chek: ${p.receipt_no}`);
        onDone?.();
        printReceipt(p.id);
      },
    }],
  });
}

function refundDialog(payment, onDone) {
  const reason = el('input', { placeholder: 'Qaytarish sababi' });
  modal({
    title: `To‘lovni qaytarish — ${payment.receipt_no}`,
    body: el('div', {}, [
      el('p', { text: `Summa: ${fmtMoney(payment.amount, state.lab.currency)}` }),
      field('Sabab', reason),
    ]),
    actions: [{
      label: 'Qaytarish', danger: true,
      onClick: async () => {
        await api.post(`/payments/${payment.id}/refund`, { reason: reason.value });
        toastOk('Qaytarish rasmiylashtirildi');
        onDone?.();
      },
    }],
  });
}

async function printReceipt(id) {
  const d = await api.get(`/payments/${id}/receipt`);
  const p = d.payment;
  const w = window.open('', '_blank', 'width=380,height=600');
  if (!w) return toastError(new Error('Brauzer yangi oynani bloklab qo‘ydi'));
  w.document.write(`<!DOCTYPE html><html lang="uz"><head><meta charset="utf-8"><title>${p.receipt_no}</title>
    <style>body{font-family:monospace;padding:14px;font-size:12px;width:280px}
      h2{font-size:14px;text-align:center;margin:0 0 8px}
      .r{display:flex;justify-content:space-between;margin:3px 0}
      hr{border:none;border-top:1px dashed #999}</style></head><body>
    <h2>${d.lab.name}</h2><hr>
    <div class="r"><span>Chek:</span><b>${p.receipt_no}</b></div>
    <div class="r"><span>Sana:</span><span>${new Date(p.created_at).toLocaleString('uz-UZ')}</span></div>
    <div class="r"><span>Bemor:</span><span>${p.last_name} ${p.first_name}</span></div>
    <div class="r"><span>Karta:</span><span>${p.card_number}</span></div>
    ${p.order_number ? `<div class="r"><span>Buyurtma:</span><span>${p.order_number}</span></div>` : ''}
    <hr>
    <div class="r"><span>${p.is_refund ? 'QAYTARISH' : 'To‘lov'}:</span><b>${Number(p.amount).toLocaleString('uz-UZ')} ${d.lab.currency}</b></div>
    <div class="r"><span>Turi:</span><span>${METHOD[p.method]}</span></div>
    <div class="r"><span>Kassir:</span><span>${p.cashier_name}</span></div>
    <hr><p style="text-align:center">Rahmat!</p></body></html>`);
  w.document.close();
  w.print();
}

/** Qarzdorlar ro'yxati. */
export async function debtsView() {
  const d = await api.get('/payments/debts');
  return el('div', {}, [
    el('div.stat', { style: 'margin-bottom:16px' }, [
      el('div.label', { text: 'Umumiy qarzdorlik' }),
      el('div.value', { text: fmtMoney(d.total, state.lab.currency) }),
    ]),
    el('div.card', {}, [
      table(['Buyurtma', 'Bemor', 'Telefon', 'Jami', 'To‘langan', 'Qarz', 'Sana'],
        d.items.length
          ? d.items.map((i) => el('tr', {}, [
              el('td.mono', {}, [el('a', { href: `#/orders/${i.id}`, text: i.order_number })]),
              el('td', {}, [el('a', { href: `#/patients/${i.patient_id}`, text: `${i.last_name} ${i.first_name}` })]),
              el('td.small', { text: i.phone || '—' }),
              el('td.num', { text: fmtMoney(i.total_amount, state.lab.currency) }),
              el('td.num', { text: fmtMoney(i.paid_amount, state.lab.currency) }),
              el('td.num', {}, [el('span.badge.warn', { text: fmtMoney(i.debt, state.lab.currency) })]),
              el('td.small', { text: fmtDateTime(i.created_at) }),
            ]))
          : [emptyRow(7, 'Qarzdorlar yo‘q')]),
    ]),
  ]);
}
