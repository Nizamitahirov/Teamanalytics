import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { freshDb, uiLogin } from './helpers.js';

// Mərhələ 7 QM (SPEC §6.6, §6.8): seed tapıntıları aşkarlanır və düzəldilir; optimizasiya portfeli.
const SHOTS = 'dev/e2e-shots';
type Db = { docs: Record<string, Record<string, unknown>> };
const db = async (): Promise<Db> => (await fetch('http://localhost:8791')).json();

test.beforeAll(async () => {
  await freshDb();
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
const shots = async (page: Page, name: string) => {
  for (const w of [1440, 820, 390]) {
    await page.setViewportSize({ width: w, height: w === 390 ? 844 : 1000 });
    await page.screenshot({ path: `${SHOTS}/v2-${name}-${w}.png`, fullPage: true });
  }
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: `${SHOTS}/v2-${name}-1440-dark.png`, fullPage: true });
  await page.emulateMedia({ colorScheme: 'light' });
};

test('data sağlamlığı: seed tapıntıları, birləşdirmə, dublikat, saxla', async ({ page }) => {
  await uiLogin(page);
  await idle(page);
  await expect(page.getByTestId('health-link')).toHaveText(/Data sağlamlığı: 7 tapıntı/);
  await page.getByTestId('health-link').click();
  await expect(page).toHaveURL(/\/health$/);
  for (const key of [
    'name_dup:Farida|Fəridə',
    'name_dup:Kamila|Kamilə',
    'task_dup:B-1770271295121|B-44',
    'hours_mismatch:P-29',
    'bad_id:P-x71',
  ])
    await expect(page.locator(`[data-finding="${key}"]`)).toBeVisible();
  await axe(page);
  await shots(page, 'health');

  // Kamilə → Kamila birləşdirmə (önizləmə ilə)
  await page.locator('[data-finding="name_dup:Kamila|Kamilə"]').getByRole('button', { name: 'Birləşdir' }).click();
  const dlg = page.getByRole('dialog', { name: 'Əməkdaşları birləşdir' });
  await expect(dlg).toContainText('Kamilə profili silinəcək, 1 iş Kamila adına keçəcək');
  await dlg.getByRole('button', { name: 'Birləşdir' }).click();
  await expect(page.locator('[data-finding="name_dup:Kamila|Kamilə"]')).toHaveCount(0);

  // Dublikatı sil
  await page.locator('[data-finding="task_dup:B-1770271295121|B-44"]').getByRole('button', { name: 'Dublikatı sil' }).click();
  await page.getByRole('dialog', { name: 'Dublikatı sil' }).getByRole('button', { name: 'Sil (1)' }).click();
  // P-29: saxla (S6 — 200 saxlanır)
  await page.locator('[data-finding="hours_mismatch:P-29"]').getByRole('button', { name: 'Saxla' }).click();
  await expect(page.locator('[data-finding="hours_mismatch:P-29"]')).toHaveCount(0);
  await idle(page);
  const d = (await db()).docs;
  expect(d['employees/Kamilə']._deleted).toBe(true);
  expect(d['tasks/P-20'].owner_after || d['tasks/P-20'].owner_before).toBe('Kamila');
  expect(d['tasks/B-1770271295121']._deleted).toBe(true);
  expect(d['tasks/P-29'].health_ignore).toBe('hours_mismatch:P-29');
  await page.goto('/');
  await expect(page.getByTestId('health-link')).toHaveText(/4 tapıntı/);
});

test('optimizasiya portfeli: status, "Tamamlandı" saatı əvəz edir, portfelə əlavə', async ({ page }) => {
  await uiLogin(page);
  await idle(page);
  await page.goto('/optimization');
  const cand = page.locator('[data-column="candidate"]');
  await expect(cand.locator('[data-opt]')).toHaveCount(2);
  await expect(page.getByTestId('opt-realized')).toContainText('0');
  await axe(page);
  await shots(page, 'optimization');

  const card = cand.locator('[data-opt]').first();
  const id = (await card.getAttribute('data-opt'))!;
  const before = (await db()).docs[`tasks/${id}`];
  await card.getByRole('combobox').selectOption('in_progress');
  await expect(page.locator(`[data-column="in_progress"] [data-opt="${id}"]`)).toBeVisible();
  await page.locator(`[data-opt="${id}"]`).getByRole('combobox').selectOption('done');
  await page.getByRole('dialog', { name: 'Tamamlandı' }).getByRole('button', { name: 'Saatı əvəz et' }).click();
  await expect(page.locator(`[data-column="done"] [data-opt="${id}"]`)).toBeVisible();
  await idle(page);
  const after = (await db()).docs[`tasks/${id}`];
  expect(after).toMatchObject({ automation: 'done' });
  expect(Number(after.hours)).toBe(Number(before.after_opt));
  expect(Number(after.opt_before)).toBe(Number(before.hours));
  await expect(page.getByTestId('opt-realized')).not.toContainText(/^0$/);

  // Portfelə yeni iş
  await page.getByRole('button', { name: 'Portfelə iş əlavə et' }).click();
  const dlg = page.getByRole('dialog', { name: 'Portfelə iş əlavə et' });
  await dlg.getByRole('textbox', { name: 'Tapşırıqlar' }).fill('B-25');
  await dlg.locator('[data-task-id="B-25"] input').check();
  await dlg.getByLabel('Hədəf saat (optimizasiyadan sonra)').fill('1');
  await dlg.getByLabel('Hədəf rüb').selectOption({ index: 2 });
  await dlg.getByRole('button', { name: 'Yadda saxla' }).click();
  await expect(cand.locator('[data-opt="B-25"]')).toBeVisible();
  await idle(page);
  expect((await db()).docs['tasks/B-25']).toMatchObject({ automation: 'candidate' });
});
