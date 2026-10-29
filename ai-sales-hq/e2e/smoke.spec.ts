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
      // Later-phase agents cannot be started.
      await expect(page.locator('li', { hasText: 'Buyurtma menejeri' }).getByRole('button')).toHaveCount(0);

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

    test('integrations report NOT_CONFIGURED honestly and theme toggle works', async ({ page }) => {
      test.skip(secret === null, 'needs the enrolled owner');
      await login(page);
      await page.goto('/integrations/');
      await expect(page.getByText('Sozlanmagan').first()).toBeVisible();
      const before = await page.evaluate(() => document.documentElement.dataset.theme);
      await page.getByRole('button', { name: /mavzuga o'tish/ }).click();
      const after = await page.evaluate(() => document.documentElement.dataset.theme);
      expect(after).not.toBe(before);
    });
  });
