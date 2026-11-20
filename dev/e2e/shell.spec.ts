import { expect, test, type Page } from '@playwright/test';
import { ADMIN_PW, freshDb } from './helpers.js';

test.beforeAll(async () => {
  await freshDb();
});

// v2 təməli: giriş, qabıq, naviqasiya, mövzu, mobil naviqasiya, çıxış.
// Ekran şəkilləri (1440 / 820 / 390, açıq/tünd) → dev/e2e-shots/v2-*.png (PR üçün).
const SHOTS = 'dev/e2e-shots';

async function login(page: Page) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('İstifadəçi adı').fill('Ecosystem');
  await page.getByLabel('Parol', { exact: true }).fill(ADMIN_PW);
  await page.getByRole('button', { name: 'Daxil ol' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'İş yükü və ştat planlaması' })).toBeVisible();
}

test('sessiyasız istifadəçi girişə yönəldilir, yanlış parol ümumi mesaj verir', async ({ page }) => {
  await page.goto('/tasks');
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('İstifadəçi adı').fill('Ecosystem');
  await page.getByLabel('Parol', { exact: true }).fill('yanlış');
  await page.getByRole('button', { name: 'Daxil ol' }).click();
  await expect(page.getByRole('alert')).toHaveText('Ad və ya parol yanlışdır');
  // Girişdən sonra əvvəl istənən səhifəyə qayıdır
  await page.getByLabel('Parol', { exact: true }).fill(ADMIN_PW);
  await page.getByRole('button', { name: 'Daxil ol' }).click();
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Tapşırıqlar' })).toBeVisible();
});

test('qabıq: menyu, naviqasiya, mövzu, çıxış', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  const nav = page.getByRole('navigation', { name: 'Əsas menyu' }).first();
  for (const name of [
    'Panel',
    'Əməkdaşlar',
    'Tapşırıqlar',
    'Ssenarilər',
    'Optimizasiya',
    'Hesabatlar',
    'Data sağlamlığı',
    'Jurnal',
    'Ayarlar',
  ])
    await expect(nav.getByRole('link', { name })).toBeVisible();
  await expect(page.getByText('Administrator')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/v2-1440-light.png` });

  await nav.getByRole('link', { name: 'Ssenarilər' }).click();
  await expect(page).toHaveURL(/\/scenarios$/);
  await expect(nav.getByRole('link', { name: 'Ssenarilər' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Şablonlar' })).toBeVisible();
  // Hələ hazır olmayan bölmə — yer tutan səhifə
  await nav.getByRole('link', { name: 'Optimizasiya' }).click();
  await expect(page.getByText('plan: mərhələ 7')).toBeVisible();

  // Mövzu: sistem → açıq → tünd
  const html = page.locator('html');
  await page.getByRole('button', { name: /^Mövzu/ }).click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: /^Mövzu/ }).click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.goto('/');
  await expect(html).toHaveAttribute('data-theme', 'dark'); // yadda saxlanır
  await expect(page.getByRole('heading', { level: 1, name: 'İş yükü və ştat planlaması' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/v2-1440-dark.png` });
  await page.getByRole('button', { name: /^Mövzu/ }).click(); // → sistem

  // Menyunu daralt
  await page.getByRole('button', { name: 'Menyunu daralt' }).click();
  await expect(nav.getByText('Panel')).toBeHidden();
  await page.getByRole('button', { name: 'Menyunu genişləndir' }).click();

  await page.goto('/yoxdur');
  await expect(page.getByRole('heading', { name: 'Səhifə tapılmadı' }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Çıxış' }).first().click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  expect(errors).toEqual([]);
});

test('planşet və telefon: aşağı naviqasiya və "Daha çox"', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await login(page);
  const bottom = page.getByRole('navigation', { name: 'Əsas menyu' }).last();
  await expect(bottom.getByRole('link', { name: 'Tapşırıqlar' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/v2-820-light.png` });

  await page.setViewportSize({ width: 390, height: 844 });
  await bottom.getByRole('button', { name: 'Daha çox' }).click();
  const sheet = page.getByRole('dialog', { name: 'Daha çox' });
  await expect(sheet.getByRole('link', { name: 'Jurnal' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/v2-390-more.png` });
  await sheet.getByRole('link', { name: 'Jurnal' }).click();
  await expect(page).toHaveURL(/\/log$/);
  await expect(sheet).toBeHidden();
  // Üfüqi scroll yoxdur
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `${SHOTS}/v2-390-light.png` });
});

test('giriş səhifəsi: dil seçimi və ekran şəkilləri', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/login');
  await page.screenshot({ path: `${SHOTS}/v2-login-1440.png` });
  await page.getByRole('button', { name: 'en' }).click();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByLabel('Username')).toBeVisible();
  await page.getByRole('button', { name: 'az' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${SHOTS}/v2-login-390.png` });
});

test('Panel: qızıl rəqəmlər (SPEC §13.2), görünüş açarı, sinxron və offline statusu', async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page);
  await expect(page.getByTestId('kpi-volume')).toHaveText('27\u202F850saat');
  await expect(page.getByTestId('kpi-need')).toHaveText('14,5FTE');
  await expect(page.getByTestId('kpi-have')).toHaveText('18,0FTE');
  await expect(page.getByTestId('kpi-gap')).toContainText('+3,5');
  await expect(page.getByTestId('kpi-over')).toHaveText('3nəfər');
  await expect(page.getByTestId('kpi-cancelled')).toHaveText('933saat');
  await expect(page.getByTestId('kpi-transfers')).toHaveText('121');
  await expect(page.getByTestId('kpi-opt')).toHaveText('55saat');
  await expect(page.getByText('Ülkər · 113%')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/v2-panel-1440.png` });

  await page.getByRole('button', { name: 'Optimizasiyadan sonra' }).click();
  await expect(page.getByTestId('kpi-volume')).toHaveText('27\u202F795saat');
  await page.getByRole('button', { name: 'Cari', exact: true }).click();

  const pill = page.getByTestId('sync-pill').first();
  await expect(pill).toHaveAttribute('data-status', 'idle');
  await expect(pill).toContainText(/Sinxron · \d\d:\d\d/);
  await expect(page.getByRole('button', { name: 'Geri alınacaq əməliyyat yoxdur' })).toBeDisabled();

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(pill).toHaveAttribute('data-status', 'offline');
  await expect(pill).toContainText('Offline');
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(pill).toHaveAttribute('data-status', 'idle');
});

test('mobil Panel (390 px)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await expect(page.getByTestId('kpi-volume')).toHaveText('27\u202F850saat');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `${SHOTS}/v2-panel-390.png`, fullPage: true });
});
