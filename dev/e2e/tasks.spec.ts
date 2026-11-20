import { expect, test, type Page } from '@playwright/test';
import { ADMIN_PW, createUser, freshDb } from './helpers.js';

test.beforeAll(async () => {
  await freshDb();
});

// Mərhələ 3 QM: v1 e2e ssenariləri (dev/e2e.py) v2-də keçir + brauzerdə iki istifadəçi ziddiyyəti.
// Testlər ardıcıl işləyir və eyni mock bazanı paylaşır (workers: 1).
const SHOTS = 'dev/e2e-shots';
type Db = { docs: Record<string, Record<string, unknown>> };
const db = async (): Promise<Db> => (await fetch('http://localhost:8791')).json();
const doc = async (p: string) => (await db()).docs[p];
const logs = async () =>
  Object.entries((await db()).docs)
    .filter(([k]) => k.startsWith('log/'))
    .map(([, v]) => v);

async function login(page: Page, user = 'Ecosystem', pass = ADMIN_PW) {
  await page.goto('/login');
  await page.getByLabel('İstifadəçi adı').fill(user);
  await page.getByLabel('Parol', { exact: true }).fill(pass);
  await page.getByRole('button', { name: 'Daxil ol' }).click();
  await expect(page.getByTestId('sync-pill').first()).toHaveAttribute('data-status', 'idle');
}
const undoToast = (page: Page) => page.getByRole('status').getByRole('button', { name: 'Geri al' });

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

test('tapşırıqlar cədvəli: say, çiplər URL-də, ə/e axtarışı, yapışqan əməliyyat sütunu', async ({ page }) => {
  await login(page);
  await page.goto('/tasks');
  await expect(page.getByText('341 tapşırıq · aktivlərin cəmi 27 850 saat (16,56 FTE)')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/v2-tasks-1440.png` });
  await page.getByRole('button', { name: 'Transferlər' }).click();
  await expect(page).toHaveURL(/quick=transfers/);
  await expect(page.getByText(/^121 tapşırıq/)).toBeVisible();
  await page.getByRole('button', { name: 'Filtrləri təmizlə' }).click();
  await page.getByRole('searchbox', { name: 'Axtarış' }).fill('kesisme');
  await expect(page).toHaveURL(/q=kesisme/);
  await expect(page.locator('[data-task]').first()).toContainText('Kəsişmə');
  // Paylaşıla bilən link: yenidən açılışda filtr qalır
  await page.reload();
  await expect(page.getByRole('searchbox', { name: 'Axtarış' })).toHaveValue('kesisme');
  const pos = await page
    .locator('[data-task] td:last-child')
    .first()
    .evaluate((el) => getComputedStyle(el).position);
  expect(pos).toBe('sticky');
  const headPos = await page
    .locator('thead th')
    .first()
    .evaluate((el) => getComputedStyle(el).position);
  expect(headPos).toBe('sticky');
});

test('profildən ötürmə yük önizləməsi ilə → bazada; toast-dan geri al', async ({ page }) => {
  await login(page);
  await page.goto('/employees');
  await page.screenshot({ path: `${SHOTS}/v2-employees-1440.png` });
  await page.locator('[data-emp="Ülvi"]').click();
  await expect(page).toHaveURL(/\/employees\/%C3%9Clvi|\/employees\/Ülvi/);
  await expect(page.getByRole('heading', { name: 'Ülvi', level: 2 })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/v2-profile-1440.png`, fullPage: true });
  await page.locator('[data-task="B-25"]').getByRole('button', { name: 'Ötür' }).click();
  const dlg = page.getByRole('dialog', { name: 'Ötürmə' });
  await dlg.getByRole('combobox', { name: 'Kimə ötürülsün' }).fill('zumr');
  await dlg.getByRole('option', { name: /Zümrüd/ }).click();
  await expect(dlg.getByText(/saat$/).first()).toBeVisible();
  await dlg.getByLabel('Şərh (istəyə bağlı)').fill('balans');
  await page.screenshot({ path: `${SHOTS}/v2-transfer-dialog.png` });
  await dlg.getByRole('button', { name: 'Ötür' }).click();
  await expect(page.getByText('1 tapşırıq ötürüldü → Zümrüd')).toBeVisible();
  await expect.poll(async () => (await doc('tasks/B-25'))?.owner_after).toBe('Zümrüd');
  expect((await doc('tasks/B-25')).owner_before).toBe('Ülvi');
  expect((await logs()).some((l) => l.action === 'Ötürmə' && l.task_id === 'B-25' && l.comment === 'balans')).toBe(true);
  await undoToast(page).click();
  await expect.poll(async () => (await doc('tasks/B-25'))?.owner_after).not.toBe('Zümrüd');
  expect((await logs()).some((l) => l.action === 'Geri alma')).toBe(true);
});

test('ləğv (səbəb ilə) və bərpa; toplu ötürmə', async ({ page }) => {
  await login(page);
  await page.goto('/tasks?q=B-30');
  const row = page.locator('[data-task="B-30"]');
  await row.getByRole('button', { name: 'Ləğv et' }).click();
  const dlg = page.getByRole('dialog', { name: 'Ləğv et' });
  await dlg.getByLabel('Səbəb (istəyə bağlı)').fill('avtomatlaşdırıldı');
  await dlg.getByRole('button', { name: 'Ləğv et' }).click();
  await expect.poll(async () => (await doc('tasks/B-30'))?.is_cancelled).toBe(true);
  await row.getByRole('button', { name: 'Bərpa et' }).click();
  await expect.poll(async () => (await doc('tasks/B-30'))?.is_cancelled).toBe(false);

  await page.goto('/tasks?owner=Ülkər&sort=-hours');
  const boxes = page.locator('[data-task] input[type=checkbox]');
  await boxes.nth(0).check();
  await boxes.nth(1).check();
  const ids = await page.locator('[data-task]').evaluateAll((els) => els.slice(0, 2).map((e) => e.getAttribute('data-task')));
  await expect(page.getByText(/^2 seçildi/)).toBeVisible();
  await page.getByRole('region', { name: 'Toplu əməliyyatlar' }).getByRole('button', { name: 'Ötür' }).click();
  const tr = page.getByRole('dialog', { name: 'Ötürmə' });
  await tr.getByRole('combobox').fill('Aysel');
  await tr.getByRole('combobox').press('Enter');
  await tr.getByRole('button', { name: 'Ötür' }).click();
  for (const id of ids) await expect.poll(async () => (await doc(`tasks/${id}`))?.owner_after).toBe('Aysel');
});

test('tapşırıq paneli: düzəliş, saat uyğunsuzluğu, yeni tapşırıq (n), sətirdə saat redaktəsi', async ({ page }) => {
  await login(page);
  await page.goto('/tasks?task=P-29');
  const panel = page.getByRole('dialog');
  await expect(panel.getByText(/Hesablanmış saat 40/)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/v2-task-drawer.png` });
  await panel.getByRole('button', { name: 'Bağla' }).first().click();

  await page.goto('/tasks?task=B-3');
  await page.getByRole('dialog').getByLabel('Saat/il').fill('99');
  await page.getByRole('dialog').getByRole('button', { name: 'Yadda saxla' }).click();
  await expect.poll(async () => Number((await doc('tasks/B-3'))?.hours)).toBe(99);
  expect((await logs()).some((l) => l.action === 'Düzəliş' && l.task_id === 'B-3')).toBe(true);

  // Yeni tapşırıq: "n" qısayolu
  await page.goto('/tasks');
  await expect(page.getByText(/tapşırıq · aktivlərin cəmi/)).toBeVisible();
  await page.locator('body').press('n');
  const nd = page.getByRole('dialog', { name: 'Yeni tapşırıq' });
  await nd.getByRole('button', { name: 'Yadda saxla' }).click();
  await expect(nd.getByText('Bu sahə boş ola bilməz').first()).toBeVisible();
  await nd.getByLabel('Tapşırıq', { exact: true }).fill('E2E test işi');
  await nd.getByLabel('Proses').fill('Test prosesi');
  await nd.getByRole('combobox', { name: 'Cari icraçı' }).fill('Ülkər');
  await nd.getByRole('combobox', { name: 'Cari icraçı' }).press('Enter');
  await nd.getByLabel('1 əməliyyata dəq').fill('30');
  await nd.getByLabel('Təkrar/il').fill('12');
  await expect(nd.getByLabel('Saat/il')).toHaveValue('6');
  await nd.getByRole('button', { name: 'Yadda saxla' }).click();
  await expect
    .poll(
      async () =>
        Object.entries((await db()).docs).find(([k, v]) => k.startsWith('tasks/T-') && v.task === 'E2E test işi')?.[1]
          .owner_after,
    )
    .toBe('Ülkər');

  // Sətirdə saat redaktəsi
  await page.goto('/tasks?q=B-6');
  await page
    .locator('[data-task="B-6"]')
    .getByRole('button', { name: /Saatı dəyiş/ })
    .click();
  const inp = page.locator('[data-task="B-6"]').getByRole('textbox', { name: /Saatı dəyiş/ });
  await inp.fill('42,5');
  await inp.press('Enter');
  await expect.poll(async () => Number((await doc('tasks/B-6'))?.hours)).toBe(42.5);
});

test('profil birləşdirmə (Kamilə → Kamila) önizləmə ilə; komanda paleti; jurnal', async ({ page }) => {
  await login(page);
  await page.goto('/employees/' + encodeURIComponent('Kamilə'));
  await page.getByRole('button', { name: 'Redaktə', exact: true }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Ad').fill('Kamila');
  await expect(dlg.getByText(/«Kamilə» profili «Kamila» ilə birləşdiriləcək/)).toBeVisible();
  await dlg.getByRole('button', { name: 'Birləşdir' }).click();
  await expect(page).toHaveURL(/\/employees\/Kamila$/);
  await expect.poll(async () => (await doc('employees/Kamilə'))?._deleted).toBe(true);

  await page.keyboard.press('Control+k');
  const pal = page.getByRole('dialog', { name: 'Komanda paleti' });
  await pal.getByRole('combobox').fill('ulker');
  await page.screenshot({ path: `${SHOTS}/v2-palette.png` });
  await pal.getByRole('combobox').press('Enter');
  await expect(page).toHaveURL(/\/employees\/%C3%9Clk%C9%99r|\/employees\/Ülkər/);
  await expect(page.getByTestId('profile-load')).toHaveText(/%$/);

  await page.goto('/log?action=Ötürmə');
  await expect(page.getByText('Bu gün')).toBeVisible();
  await expect(page.locator('li').filter({ hasText: 'Ötürmə' }).first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/v2-log-1440.png` });
});

test('iki istifadəçi eyni tapşırığı dəyişir → ziddiyyət dialoqu → "Mənimki"', async ({ browser }) => {
  const a = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const b = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const pa = await a.newPage();
  const pb = await b.newPage();
  await login(pa);
  await createUser('Aysel', 'editor', 'Basqa-Gizli-Soz-9');
  await login(pb, 'Aysel', 'Basqa-Gizli-Soz-9');
  await pa.goto('/tasks?task=B-10');
  await pb.goto('/tasks?task=B-10');
  await pa.getByRole('dialog').getByLabel('Saat/il').fill('10');
  await pb.getByRole('dialog').getByLabel('Saat/il').fill('20');
  await pa.getByRole('dialog').getByRole('button', { name: 'Yadda saxla' }).click();
  await expect.poll(async () => Number((await doc('tasks/B-10'))?.hours)).toBe(10);
  await pb.getByRole('dialog').getByRole('button', { name: 'Yadda saxla' }).click();
  const c = pb.getByRole('dialog', { name: 'Eyni anda dəyişiklik' });
  await expect(c).toBeVisible();
  await expect(c.getByText(/Ecosystem sizdən əvvəl dəyişdi/)).toBeVisible();
  await expect(c.getByRole('row', { name: /Saat\/il/ })).toContainText('10');
  await expect(c.getByRole('row', { name: /Saat\/il/ })).toContainText('20');
  await pb.screenshot({ path: `${SHOTS}/v2-conflict.png` });
  await c.getByRole('button', { name: 'Mənimki' }).click();
  await expect.poll(async () => Number((await doc('tasks/B-10'))?.hours)).toBe(20);
  // A 10 s ərzində (sinxron dövrü) B-nin versiyasını görür
  await pa.goto('/tasks?q=B-10');
  await expect(pa.locator('[data-task="B-10"]')).toContainText('20,0', { timeout: 15_000 });
  await a.close();
  await b.close();
});

test('planşet və telefon görünüşləri', async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto('/tasks');
  await expect(page.locator('[data-task]').first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/v2-tasks-820.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/tasks');
  await expect(page.getByRole('list', { name: 'Tapşırıqlar' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `${SHOTS}/v2-tasks-390.png` });
  await page.goto('/employees');
  await page.screenshot({ path: `${SHOTS}/v2-employees-390.png` });
  await page.goto('/employees/' + encodeURIComponent('Ülkər'));
  await page.screenshot({ path: `${SHOTS}/v2-profile-390.png`, fullPage: true });
});
