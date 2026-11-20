import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { adminApi, freshDb, uiLogin } from './helpers.js';

// Mərhələ 9 QM (SPEC §14, §16): backup → bərpa e2e; texniki xidmət; trend / dövr müqayisəsi boş vəziyyətləri.
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

test('backup → dəyişiklik → backup-dan bərpa (önizləmə + iki təsdiq)', async ({ page }) => {
  await uiLogin(page);
  await idle(page);
  await expect(page.getByTestId('app-version')).toContainText('v2.0.0');
  await page.goto('/settings?tab=data');
  await expect(page.getByText('Hələ backup yoxdur')).toBeVisible();
  await page.getByRole('button', { name: 'İndi backup et' }).click();
  await expect(page.getByTestId('backups').locator('tbody tr')).toHaveCount(1);
  await expect(page.getByTestId('backups')).toContainText('341');
  await axe(page);
  await page.screenshot({ path: `${SHOTS}/v2-settings-data-1440.png`, fullPage: true });

  // Başqa yerdən dəyişiklik: B-25 ləğv edilir
  const r = await adminApi('/api/ops', { ops: [{ t: 'upsert', table: 'Tasks', row: { id: 'B-25', is_cancelled: true } }] });
  expect(r.ok).toBe(true);
  await page.reload();
  await idle(page);

  await page.getByRole('button', { name: 'Önizlə və bərpa et' }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg.getByTestId('restore-stats')).toContainText('1 tapşırıq dəyişəcək');
  const next = dlg.getByRole('button', { name: 'Davam' });
  await expect(next).toBeDisabled();
  await dlg.getByLabel(/Başa düşürəm/).check();
  await next.click();
  await expect(page.getByRole('dialog', { name: 'Son təsdiq' })).toBeVisible();
  await page.getByRole('button', { name: /Bəli, .* vəziyyətinə qaytar/ }).click();
  await expect(page.getByText(/backup-ından bərpa olundu/)).toBeVisible();
  await idle(page);
  const d = (await db()).docs;
  expect(d['tasks/B-25'].is_cancelled).toBe(false);
  expect(Object.values(d).some((x) => x.action === 'Bərpa')).toBe(true);
});

test('texniki xidmət, trend və dövr müqayisəsi (bir günlük snapshot)', async ({ page }) => {
  await uiLogin(page);
  await idle(page);
  await page.goto('/settings?tab=maint');
  const h = page.getByTestId('health');
  await expect(h).toContainText('Firestore');
  await expect(h).toContainText('ok');
  await expect(h).toContainText('yoxdur'); // CRON_SECRET
  await axe(page);
  await page.goto('/');
  await expect(page.getByTestId('w-trend')).toContainText('hazırda 1 gün');
  await page.goto('/reports/period');
  await expect(page.getByTestId('period-empty')).toContainText('hazırda 1');
});
