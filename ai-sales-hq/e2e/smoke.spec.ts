import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { timeStep, totpAt } from '../apps/api/src/domain/totp';

// One owner for the whole run: the first project creates it and enrols 2FA; every later test
// (also in the other viewport project, which runs in a new worker) logs in with the saved seed.
const OWNER = { username: 'owner', password: 'Qovun-Termiz-2026', name: 'Ega' };
const SETUP_TOKEN = process.env.E2E_SETUP_TOKEN ?? 'e2e-setup-token-0123456789abcdef';
const STATE = join(tmpdir(), 'hq-e2e-state.json');
type State = { secret: string; lastStep: number };
const load = (): State | null => (existsSync(STATE) ? (JSON.parse(readFileSync(STATE, 'utf8')) as State) : null);
const save = (s: State) => writeFileSync(STATE, JSON.stringify(s));
let secret: string | null = load()?.secret ?? null;

/** A code for a 30 s step the server has not seen yet (it refuses replays). */
async function freshCode(page: Page, seed: string): Promise<string> {
  const last = load()?.lastStep ?? 0;
  while (timeStep(Date.now() / 1000) <= last) await page.waitForTimeout(1000);
  save({ secret: seed, lastStep: timeStep(Date.now() / 1000) });
  return totpAt(seed, Date.now() / 1000);
}

async function noHorizontalScroll(page: Page) {
  const { scroll, width } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: window.innerWidth,
  }));
  expect(scroll).toBeLessThanOrEqual(width);
}

async function login(page: Page) {
  await page.goto('/login/');
  await page.fill('input[name=username]', OWNER.username);
  await page.fill('input[name=password]', OWNER.password);
  await page.click('button[type=submit]');
  if (secret) {
    await page.waitForSelector('input[name=code]');
    await page.fill('input[name=code]', await freshCode(page, secret));
    await page.click('button[type=submit]');
  }
  // The session exists once the dashboard greets the owner.
  await expect(page.getByText(`Xush kelibsiz, ${OWNER.name}`)).toBeVisible();
}

test.describe
  .serial('owner journey', () => {
    test('first owner setup, login and mandatory 2FA enrolment', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto('/');
      await page.waitForURL(/\/(setup|login)\/$/);
      if (page.url().endsWith('/setup/')) {
        await page.fill('input[name=setupToken]', SETUP_TOKEN);
        await page.fill('input[name=displayName]', OWNER.name);
        await page.fill('input[name=username]', OWNER.username);
        await page.fill('input[name=password]', OWNER.password);
        await page.click('button[type=submit]');
        await page.waitForURL(/\/login\/$/);
      }
      test.skip(secret !== null || process.env.E2E_SKIP_ENROL === '1', 'already enrolled');
      await page.fill('input[name=username]', OWNER.username);
      await page.fill('input[name=password]', OWNER.password);
      await page.click('button[type=submit]');
      await page.waitForURL(/\/security\/$/);
      await noHorizontalScroll(page);
      await page.getByRole('button', { name: 'QR kodni olish' }).click();
      secret = (await page.locator('p.font-mono').textContent())?.trim() ?? null;
      expect(secret).toMatch(/^[A-Z2-7]{32}$/);
      await page.fill('input[name=code]', await freshCode(page, secret as string));
      await page.getByRole('button', { name: 'Yoqish' }).click();
      await expect(page.getByText('Zaxira kodlar')).toBeVisible();
      await expect(page.locator('ul.font-mono li')).toHaveCount(10);
      await page.getByRole('button', { name: 'Saqladim, davom etish' }).click();
      await expect(page.getByText(`Xush kelibsiz, ${OWNER.name}`)).toBeVisible();
      expect(errors).toEqual([]);
    });

    test('dashboard, virtual office and control center use real state', async ({ page }) => {
      test.skip(secret === null, 'needs the enrolled owner from the previous test');
      await login(page);
      await expect(page.getByText('Virtual ofis')).toBeVisible();
      await noHorizontalScroll(page);
      // The Director is stopped (DRAFT or STOPPED): drawn absent, never as working.
      await expect(page.getByRole('link', { name: /Direktor xonasi\. Direktor: joyida yo'q/ })).toBeVisible();

      await page.goto('/agents/');
      const director = page.locator('li', { hasText: 'Ishni muvofiqlashtiradi' });
      // DRAFT on the first run, STOPPED when the other viewport project already activated it.
      await expect(director.getByRole('button', { name: /^(Faollashtirish|Ishga tushirish)$/ })).toBeVisible();
      const activate = director.getByRole('button', { name: 'Faollashtirish' });
      if (await activate.isVisible()) await activate.click();
      await director.getByRole('button', { name: 'Ishga tushirish' }).click();
      await expect(director.getByText(/^(Ishlayapti|Ish vaqtini kutmoqda)$/)).toBeVisible();
      await noHorizontalScroll(page);
      // Phase 7: every agent, the Order Manager included, can be switched on by the owner.
      await expect(
        page
          .locator('li', { hasText: 'Buyurtma menejeri' })
          .getByRole('button', { name: /^(Faollashtirish|Ishga tushirish)$/ }),
      ).toBeVisible();

      await director.getByRole('button', { name: "To'xtatish" }).click();
      await expect(director.getByText("To'xtatilgan", { exact: true })).toBeVisible();
    });

    test('catalog: seed, confirm a price, enter a wholesale price', async ({ page }) => {
      test.skip(secret === null, 'needs the enrolled owner');
      await login(page);
      await page.goto('/catalog/');
      // The list loads asynchronously: wait until it is either empty (offer seed) or filled.
      await expect(page.getByText(/Katalog hozircha bo'sh|TEFTIL/).first()).toBeVisible();
      const seed = page.getByRole('button', { name: /Boshlang'ich ro'yxatni yuklash/ });
      if (await seed.isVisible()) await seed.click();
      const first = page.locator('li', { hasText: 'TEFTIL' });
      await expect(first).toBeVisible();
      const confirm = first.getByRole('button', { name: 'Tasdiqlash' });
      if (await confirm.isVisible()) await confirm.click();
      await expect(first.getByText('Tasdiqlangan').first()).toBeVisible();
      await first.getByRole('spinbutton', { name: 'Ulgurji narxni saqlash' }).fill('21000');
      await first.getByRole('button', { name: 'Ulgurji narxni saqlash' }).click();
      await expect(first.getByText("21 000 so'm")).toBeVisible();
      await noHorizontalScroll(page);
    });

    test('prospects: add by hand, verify the phone, explained score, do-not-contact', async ({ page }, info) => {
      test.skip(secret === null, 'needs the enrolled owner');
      await login(page);
      await page.goto('/prospects/new/');
      const name = `Baraka ${info.project.name}`;
      await page.fill('input[name=name]', name);
      // Different phone per viewport project so the two runs do not merge into one prospect.
      await page.fill('input[name=phone]', info.project.name === 'phone' ? '90 111 22 33' : '91 444 55 66');
      await page.fill('input[name=address]', 'Termiz, Navoiy 5');
      await page.selectOption('select[name=category]', 'SUPERMARKET');
      await page.getByRole('button', { name: 'Saqlash' }).click();
      await page.waitForURL(/\/prospects\/view\/\?id=/);
      await expect(page.getByRole('heading', { name })).toBeVisible();
      await expect(page.getByText('(tasdiqlanmagan)')).toBeVisible();
      await noHorizontalScroll(page);

      await page.getByRole('button', { name: 'Tasdiqlash' }).click();
      await expect(page.getByText('(tasdiqlangan)')).toBeVisible();
      await expect(page.getByText('Tasdiqlangan aloqa mavjud')).toBeVisible();
      await expect(page.getByText('Saralangan', { exact: true })).toBeVisible();

      // Assisted-manual outreach: draft (template, no AI in CI), owner "sends" it, records the reply.
      await page.getByRole('button', { name: 'Xabar loyihasini tayyorlash' }).click();
      await expect(page.getByRole('button', { name: 'Yuborildi deb belgilash' })).toBeVisible();
      await expect(page.getByRole('link', { name: /^SMS$/ })).toHaveAttribute('href', /^sms:\+998/);
      await page.getByRole('combobox', { name: 'Qaysi yo‘l bilan', exact: true }).selectOption('SMS');
      await page.getByRole('button', { name: 'Yuborildi deb belgilash' }).click();
      await expect(page.getByText("Bog'lanildi", { exact: true })).toBeVisible();
      await page.getByRole('textbox', { name: 'Mijoz javobini kiritish' }).fill('Optom narxi qancha bo‘ladi?');
      await page.getByRole('button', { name: "Qo'shish", exact: true }).click();
      await expect(page.getByText("Mijoz narx yoki shartlar haqida so'radi")).toBeVisible();
      await noHorizontalScroll(page);

      await page.getByRole('button', { name: "Bog'lanmaslik ro'yxatiga" }).click();

      await page.getByRole('textbox', { name: 'Sabab (ixtiyoriy)' }).fill('Mijoz so‘radi');

      await page.getByRole('button', { name: "Ha, ro'yxatga qo'shish" }).click();
      await expect(page.getByText("Bog'lanmaslik", { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Tasdiqlash' })).toHaveCount(0);

      await page.goto('/prospects/');
      await expect(page.getByText(name)).toBeVisible();
      await noHorizontalScroll(page);
    });

    test('order: prepare from the prospect, customer confirms, owner approves, delivers, records payment', async ({
      page,
    }, info) => {
      test.skip(secret === null, 'needs the enrolled owner');
      await login(page);
      await page.goto('/prospects/new/');
      const name = `Buyurtma ${info.project.name}`;
      await page.fill('input[name=name]', name);
      await page.fill('input[name=phone]', info.project.name === 'phone' ? '93 777 88 99' : '94 222 33 44');
      await page.fill('input[name=address]', 'Denov, Bozor 2');
      await page.selectOption('select[name=category]', 'SUPERMARKET');
      await page.getByRole('button', { name: 'Saqlash' }).click();
      await page.waitForURL(/\/prospects\/view\/\?id=/);

      await page.getByRole('button', { name: 'Buyurtma tuzish' }).click();
      await page.waitForURL(/\/orders\/view\/\?id=/);
      await expect(page.getByText('Qoralama', { exact: true }).first()).toBeVisible();
      await page.getByRole('button', { name: "Qator qo'shish" }).click();
      const product = page.getByRole('combobox', { name: 'Mahsulot' });
      const teftil = await product.locator('option', { hasText: 'TEFTIL' }).first().getAttribute('value');
      await product.selectOption(teftil ?? '');
      await page.getByRole('combobox', { name: 'Narx turi' }).selectOption('WHOLESALE');
      await page.getByRole('spinbutton', { name: 'Miqdor (dona)' }).fill('10');
      await page.getByRole('button', { name: 'Mahsulotlarni saqlash' }).click();
      // Server-computed from the confirmed wholesale price (21 000 x 10).
      await expect(page.getByText("210 000 so'm").first()).toBeVisible();
      await noHorizontalScroll(page);

      await page.getByRole('button', { name: 'Mijozdan tasdiq so‘rash' }).click();
      await expect(page.getByText('Mijozga yuboriladigan matn')).toBeVisible();
      await expect(page.getByRole('link', { name: 'SMS ochish' })).toHaveAttribute('href', /^sms:\+998/);
      await page.getByRole('textbox', { name: 'Mijoz nima dedi?' }).fill('Ha, olamiz');
      await page.getByRole('button', { name: 'Mijoz tasdiqladi' }).click();
      await expect(page.getByText('Sizning tasdig‘ingizni kutmoqda', { exact: true }).first()).toBeVisible();

      await page.getByRole('button', { name: 'Tasdiqlash — yetkazishga' }).click();
      await expect(page.getByText('Yetkazishga tasdiqlangan', { exact: true }).first()).toBeVisible();
      await page.getByRole('spinbutton', { name: "Summa (so'm)" }).fill('210000');
      await page.getByRole('button', { name: "To'lovni yozish" }).click();
      await expect(page.getByRole('button', { name: "To'lovni yozish" })).toHaveCount(0);
      await page.getByRole('button', { name: 'Yetkazildi deb belgilash' }).click();
      await page.getByRole('button', { name: 'Ha, mijoz qabul qildi' }).click();
      await expect(page.getByText('Yetkazildi', { exact: true }).first()).toBeVisible();
      await noHorizontalScroll(page);

      await page.goto('/orders/');
      await expect(page.getByText(name)).toBeVisible();
      await noHorizontalScroll(page);
    });

    test('integrations report NOT_CONFIGURED honestly and theme toggle works', async ({ page }) => {
      test.skip(secret === null, 'needs the enrolled owner');
      await login(page);
      await page.goto('/integrations/');
      await expect(page.getByText('Sozlanmagan').first()).toBeVisible();
      // AI key is entered in the app; a malformed key is refused and nothing is stored (no network in CI).
      await expect(page.getByText('Hali ulanmagan')).toBeVisible();
      await page.getByLabel('Anthropic API kaliti').fill('sk-ant-short');
      await page.getByRole('button', { name: 'Tekshirish va saqlash' }).click();
      await expect(page.getByRole('alert').filter({ hasText: /sk-ant/ })).toBeVisible();
      await expect(page.getByText('Hali ulanmagan')).toBeVisible();
      await noHorizontalScroll(page);
      // Website overview without the Firestore key: an honest error, no invented numbers.
      await page.goto('/site/');
      await expect(page.getByRole('alert').filter({ hasText: /sozlanmagan/ })).toBeVisible();
      await noHorizontalScroll(page);
      await page.goto('/integrations/');
      const before = await page.evaluate(() => document.documentElement.dataset.theme);
      await page.getByRole('button', { name: /mavzuga o'tish/ }).click();
      const after = await page.evaluate(() => document.documentElement.dataset.theme);
      expect(after).not.toBe(before);
    });
  });
