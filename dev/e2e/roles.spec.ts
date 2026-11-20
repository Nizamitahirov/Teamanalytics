import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ADMIN_PW, adminApi, createUser, freshDb, uiLogin } from './helpers.js';

// Mərhələ 5 QM (SPEC §2, §6.1, §6.10, §10): məcburi parol dəyişməsi, rollar UI-da, istifadəçi idarəsi, kilid, "Məni xatırla".
const SHOTS = 'dev/e2e-shots';
const API = 'http://localhost:8765';

let consoleErrors: string[] = [];
test.beforeEach(async ({ page }) => {
  consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await page.setViewportSize({ width: 1440, height: 900 });
});
test.afterEach(() => expect(consoleErrors).toEqual([]));

test('ilkin Ecosystem/Ecosystem parolu → məcburi dəyişmə ekranı; zəif parol rədd edilir', async ({ page }) => {
  await fetch('http://localhost:8791/reset', { method: 'POST' });
  await uiLogin(page, 'Ecosystem', 'Ecosystem');
  await expect(page.getByRole('heading', { name: 'Parolu dəyişin' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/v2-forced-password.png` });
  await page.getByLabel('Cari parol').fill('Ecosystem');
  await page.getByLabel('Yeni parol', { exact: true }).fill('1234567890');
  await page.getByLabel('Yeni parolu təkrarlayın').fill('1234567890');
  await page.getByRole('button', { name: 'Parolu dəyiş' }).click();
  await expect(page.getByRole('alert')).toContainText('çox yayılmışdır');
  await page.getByLabel('Yeni parol', { exact: true }).fill(ADMIN_PW);
  await page.getByLabel('Yeni parolu təkrarlayın').fill(ADMIN_PW);
  await page.getByRole('button', { name: 'Parolu dəyiş' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'İş yükü və ştat planlaması' })).toBeVisible();
  // Bundan sonra köhnə parolla giriş alınmır
  const r = await fetch(`${API}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Ecosystem', password: 'Ecosystem' }),
  });
  expect(r.status).toBe(401);
});

test.describe('rollar və istifadəçilər', () => {
  test.beforeAll(async () => {
    await freshDb();
    await createUser('Rəhbər', 'viewer', 'Baxis-Sozu-2026');
    await createUser('Redaktor', 'editor', 'Yazar-Sozu-2026');
  });

  test('viewer: yalnız baxış — redaktə elementləri yoxdur, server də yazmanı rədd edir', async ({ page }) => {
    await uiLogin(page, 'Rəhbər', 'Baxis-Sozu-2026');
    await expect(page.getByText('Yalnız baxış rejimi')).toBeVisible();
    await expect(page.getByRole('button', { name: /Geri al/ })).toHaveCount(0);
    await page.goto('/tasks');
    await expect(page.getByText(/tapşırıq · aktivlərin cəmi/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Yeni tapşırıq' })).toHaveCount(0);
    await expect(page.locator('[data-task] input[type=checkbox]')).toHaveCount(0);
    await expect(page.locator('[data-task]').first().getByRole('button', { name: 'Ötür' })).toHaveCount(0);
    await page.screenshot({ path: `${SHOTS}/v2-viewer-tasks.png` });
    await page.goto('/tasks?task=B-1');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Yadda saxla' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+k');
    await page.getByRole('dialog', { name: 'Komanda paleti' }).getByRole('combobox').fill('yeni');
    await expect(page.getByRole('option', { name: /Yeni tapşırıq/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.goto('/settings');
    await expect(page.getByRole('button', { name: 'İstifadəçilər' })).toHaveCount(0);
    const st = await page.request.post('/api/ops', { data: { ops: [{ t: 'log', row: { id: 'L-v', action: 'X' } }] } });
    expect(st.status()).toBe(403);
  });

  test('editor: redaktə edə bilir, istifadəçiləri görmür', async ({ page }) => {
    await uiLogin(page, 'Redaktor', 'Yazar-Sozu-2026');
    await expect(page.getByText('Yalnız baxış rejimi')).toHaveCount(0);
    await page.goto('/tasks');
    await expect(page.getByRole('button', { name: 'Yeni tapşırıq' })).toBeVisible();
    await page.goto('/settings');
    await expect(page.getByRole('button', { name: 'Hesabım' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'İstifadəçilər' })).toHaveCount(0);
  });

  test('admin: istifadəçi əlavə et, rol dəyiş, kilidi aç, sessiyaları ləğv et; axe', async ({ page }) => {
    await uiLogin(page);
    await page.goto('/settings?tab=users');
    await expect(page.locator('[data-user="Rəhbər"]')).toBeVisible();
    await page.getByRole('button', { name: 'İstifadəçi əlavə et' }).first().click();
    const dlg = page.getByRole('dialog', { name: 'İstifadəçi əlavə et' });
    await dlg.getByLabel('İstifadəçi adı').fill('Yeni Əməkdaş');
    await dlg.getByLabel('Rol', { exact: true }).selectOption('viewer');
    const tmp = await dlg.getByLabel('Müvəqqəti parol').inputValue();
    expect(tmp.length).toBeGreaterThanOrEqual(10);
    await dlg.getByRole('button', { name: 'İstifadəçi əlavə et' }).click();
    const row = page.locator('[data-user="Yeni Əməkdaş"]');
    await expect(row).toContainText('Parolu dəyişməlidir');
    await row.getByLabel('Yeni Əməkdaş — rol').selectOption('editor');
    await expect(page.getByText('Yeni Əməkdaş: rol dəyişdirildi')).toBeVisible();

    // 5 yanlış cəhd → kilid; admin görür və açır
    for (let i = 0; i < 5; i++)
      await fetch(`${API}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'Redaktor', password: 'yanlis-parol' }),
      });
    await page.reload();
    const red = page.locator('[data-user="Redaktor"]');
    await expect(red).toContainText('Kilidli');
    await page.screenshot({ path: `${SHOTS}/v2-settings-users.png` });
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => v.id)).toEqual([]);
    await red.getByRole('button', { name: 'Kilidi aç: Redaktor' }).click();
    await expect(red).toContainText('Aktiv');
    await red.getByRole('button', { name: 'Sessiyaları ləğv et: Redaktor' }).click();
    await expect(page.getByText('Bütün sessiyalar ləğv edildi')).toBeVisible();
    // Sonuncu admin özünü endirə bilməz
    await page.locator('[data-user="Ecosystem"]').getByLabel('Ecosystem — rol').selectOption('viewer');
    await expect(page.getByText('Sonuncu administratorun rolunu dəyişmək olmaz')).toBeVisible();
  });

  test('girişdə kilid mesajı vaxtla; "Məni xatırla" 7 günlük cookie', async ({ page, context }) => {
    for (let i = 0; i < 5; i++) await adminApi('/api/users', { action: 'unlock', name: 'Rəhbər' }).then(() => undefined);
    await page.goto('/login');
    for (let i = 0; i < 5; i++) {
      await page.getByLabel('İstifadəçi adı').fill('Rəhbər');
      await page.getByLabel('Parol', { exact: true }).fill('yanlis-parol-' + i);
      await page.getByRole('button', { name: 'Daxil ol' }).click();
      await expect(page.getByRole('alert')).not.toBeEmpty();
    }
    await expect(page.getByRole('alert')).toContainText(/kilidlənib\. Yenidən cəhd: \d\d:\d\d/);
    await adminApi('/api/users', { action: 'unlock', name: 'Rəhbər' });

    await page.getByLabel('Parol', { exact: true }).fill('Baxis-Sozu-2026');
    await page.getByLabel('Məni xatırla (7 gün)').check();
    await page.getByRole('button', { name: 'Daxil ol' }).click();
    await expect(page.getByText('Yalnız baxış rejimi')).toBeVisible();
    const c = (await context.cookies()).find((x) => x.name === '__Host-wfp_session');
    expect(c).toBeTruthy();
    expect(c!.httpOnly).toBe(true);
    const days = (c!.expires * 1000 - Date.now()) / 864e5;
    expect(days).toBeGreaterThan(6.9);
  });
});
