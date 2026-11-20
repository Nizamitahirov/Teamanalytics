import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createUser, freshDb, uiLogin } from './helpers.js';

// Mərhələ 6 QM (SPEC §6.5, §8, §2): ssenari canlı dataya yazmır; balanslama ssenari kimi açılır;
// tətbiq/geri alma; təsdiq axını + bildirişlər.
const SHOTS = 'dev/e2e-shots';
type Db = { docs: Record<string, Record<string, unknown>> };
const db = async (): Promise<Db> => (await fetch('http://localhost:8791')).json();
const liveDocs = async () =>
  JSON.stringify(Object.entries((await db()).docs).filter(([k]) => k.startsWith('tasks/') || k.startsWith('employees/')));
const EDITOR_PW = 'Yasil-Alma-Agaci-7';

test.beforeAll(async () => {
  await freshDb();
  await createUser('Redaktor', 'editor', EDITOR_PW);
});

let consoleErrors: string[] = [];
test.beforeEach(async ({ page }) => {
  consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await page.setViewportSize({ width: 1440, height: 900 });
});
test.afterEach(() => {
  expect(consoleErrors, 'brauzer konsolunda xəta olmamalıdır').toEqual([]);
});

const idle = (page: Page) => expect(page.getByTestId('sync-pill').first()).toHaveAttribute('data-status', 'idle');
const axe = async (page: Page) => {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  const bad = r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(bad.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')} ${n.any[0]?.message ?? ''}`))).toEqual([]);
};

test('balanslama ssenarisi: canlı dataya yazmır → tətbiq → geri alma', async ({ page }) => {
  await uiLogin(page);
  await idle(page);
  const before = await liveDocs();

  // Paneldən "Yükü balansla" → yeni ssenari, balans dialoqu açıq
  await page.getByRole('button', { name: 'Yükü balansla' }).click();
  await expect(page).toHaveURL(/\/scenarios\/S-/);
  const dlg = page.getByRole('dialog', { name: 'Dəyişiklik əlavə et' });
  await expect(dlg.getByLabel('Dəyişikliyin növü')).toHaveValue('rebalance');
  await expect(dlg).toContainText(/ötürmə təklif olunur/);
  await dlg.getByRole('button', { name: 'Dəyişiklik əlavə et' }).click();
  await expect(dlg).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Dəyişikliklər (1)' })).toBeVisible();
  // Müqayisə: normanı aşan 7 → 0 (effektiv norma 1682)
  const over = page.getByRole('row', { name: /Norması aşan/ });
  await expect(over.getByRole('cell').nth(0)).toHaveText('7');
  await expect(over.getByRole('cell').nth(1)).toHaveText('0');
  await expect(page.getByTestId('scn-load')).toBeVisible();
  await idle(page);
  expect(await liveDocs(), 'ssenari canlı dataya yazmamalıdır').toBe(before);
  await axe(page);

  await page.screenshot({ path: `${SHOTS}/v2-scenario-1440.png`, fullPage: true });
  await page.setViewportSize({ width: 820, height: 1000 });
  await page.screenshot({ path: `${SHOTS}/v2-scenario-820.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${SHOTS}/v2-scenario-390.png`, fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: `${SHOTS}/v2-scenario-1440-dark.png`, fullPage: true });
  await page.emulateMedia({ colorScheme: 'light' });

  // Tətbiq
  await page.getByRole('button', { name: 'Tətbiq et' }).click();
  const apply = page.getByRole('dialog', { name: /Tətbiq et:/ });
  await expect(apply).toContainText(/qeyd dəyişəcək/);
  await axe(page);
  await apply.getByRole('button', { name: 'Tətbiq et' }).click();
  await expect(apply).toBeHidden();
  await expect(page.getByText('Tətbiq edilib').first()).toBeVisible();
  await idle(page);
  expect(await liveDocs()).not.toBe(before);
  await page.goto('/');
  await expect(page.getByTestId('kpi-over')).toContainText('0');

  // Geri alma
  await page.goBack();
  await page.getByRole('button', { name: 'Geri al', exact: true }).click();
  const rev = page.getByRole('dialog', { name: /Geri al:/ });
  await rev.getByRole('button', { name: 'Geri al' }).click();
  await expect(rev).toBeHidden();
  await expect(page.getByText('Arxiv').first()).toBeVisible();
  await idle(page);
  await page.goto('/');
  await expect(page.getByTestId('kpi-over')).toContainText('7');

  // Siyahı: status filtri və müqayisə
  await page.goto('/scenarios');
  await page.getByRole('tab', { name: /Arxiv/ }).click();
  await expect(page.getByRole('link', { name: /Yükü balansla/ })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/v2-scenarios-list-1440.png`, fullPage: true });
});

test('təsdiq axını: editor göndərir → admin bildiriş alır → təsdiqləyib tətbiq edir', async ({ browser }) => {
  // Admin təsdiq axınını açır
  const a = await browser.newPage();
  await a.setViewportSize({ width: 1440, height: 900 });
  await uiLogin(a);
  await a.goto('/settings?tab=general');
  await a.getByLabel('Təsdiq axını').check();
  await a.getByRole('button', { name: 'Yadda saxla' }).click();
  await idle(a);

  // Editor: 40+ saatlıq ötürmə birbaşa yazılmır, təsdiqə gedir
  const e = await browser.newPage();
  await e.setViewportSize({ width: 1440, height: 900 });
  await uiLogin(e, 'Redaktor', EDITOR_PW);
  await idle(e);
  await e.goto('/scenarios');
  await e.getByRole('button', { name: /Normanı dəyiş/ }).click();
  const dlg = e.getByRole('dialog', { name: 'Dəyişiklik əlavə et' });
  await dlg.getByLabel('İllik norma (saat/ştat)').fill('1800');
  await dlg.getByRole('button', { name: 'Dəyişiklik əlavə et' }).click();
  await expect(e.getByText('Təsdiq axını açıqdır')).toBeVisible();
  await expect(e.getByRole('button', { name: 'Tətbiq et' })).toHaveCount(0);
  await e.getByRole('button', { name: 'Təsdiqə göndər' }).click();
  await expect(e.getByText('Təsdiq gözləyir').first()).toBeVisible();
  const url = e.url();

  // Admin: bildiriş
  await a.goto('/');
  await a.reload();
  const bell = a.getByRole('button', { name: /Bildirişlər: 1 oxunmamış/ });
  await expect(bell).toBeVisible();
  await bell.click();
  await a.getByRole('button', { name: /Redaktor təsdiq gözləyir/ }).click();
  await expect(a).toHaveURL(url.replace('http://localhost:5173', ''));
  await a.getByRole('button', { name: 'Təsdiqlə və tətbiq et' }).click();
  await a
    .getByRole('dialog', { name: /Tətbiq et:/ })
    .getByRole('button', { name: 'Tətbiq et' })
    .click();
  await expect(a.getByText('Tətbiq edilib').first()).toBeVisible();
  await idle(a);
  expect(Number((await db()).docs['meta/main'].norm)).toBe(1800);

  // Editor təsdiq bildirişini alır
  await e.reload();
  await expect(e.getByRole('button', { name: /Bildirişlər: 1 oxunmamış/ })).toBeVisible();
  await a.close();
  await e.close();
});
