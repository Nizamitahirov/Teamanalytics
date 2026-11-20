import { readFileSync, statSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { freshDb, uiLogin } from './helpers.js';

// Mərhələ 8 QM (SPEC §6.7, §9): rəhbərlik hesabatı PDF-də 2–4 səhifə; Excel export → import (diff önizləmə).
// SheetJS CDN-dən yüklənir; CDN əlçatmazdırsa (sandbox): XLSX_PATH=/path/xlsx.full.min.js (v1 e2e ilə eyni).
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
  if (process.env.XLSX_PATH)
    await page.route('https://cdn.sheetjs.com/**', (r) =>
      r.fulfill({ contentType: 'application/javascript', body: readFileSync(process.env.XLSX_PATH as string, 'utf8') }),
    );
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

test('rəhbərlik hesabatı: şərh, effektiv norma, risklər, PDF 2–4 səhifə', async ({ page }) => {
  await uiLogin(page);
  await idle(page);
  await page.goto('/reports');
  await axe(page);
  await page.screenshot({ path: `${SHOTS}/v2-reports-1440.png`, fullPage: true });
  await page
    .locator('section', { has: page.getByRole('heading', { name: 'Rəhbərlik hesabatı' }) })
    .getByRole('link', { name: 'Aç' })
    .click();
  await expect(page).toHaveURL(/\/reports\/executive/);
  const rep = page.getByTestId('report');
  await expect(page.getByTestId('rep-sentences')).toContainText('Şöbədə 16,6 FTE iş var, 18,0 ştat mövcuddur (+1,4 ehtiyat).');
  await expect(page.getByTestId('rep-sentences')).toContainText('7 əməkdaş normanı aşır: Ülkər (129%)');
  await expect(page.getByTestId('rep-norm')).toContainText('= 1 682 saat / 1 ştat');
  // Ştat cədvəli: aktiv işi olan əməkdaşlar + qruplar (Panel ştat cədvəli ilə eyni)
  await expect(page.getByTestId('rep-staff').locator('tbody tr')).toHaveCount(19);
  await expect(rep.locator('[data-chart] svg')).toHaveCount(4);
  await axe(page);
  await page.screenshot({ path: `${SHOTS}/v2-report-exec-1440.png`, fullPage: true });

  // PDF (Chromium çap mühərriki): A4 üfüqi, 2–4 səhifə; qabıq (menyu, üst panel) çapda görünmür
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('navigation', { name: 'Əsas menyu' }).first()).toBeHidden();
  const pdf = await page.pdf({ format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true });
  if (process.env.PDF_OUT) (await import('node:fs')).writeFileSync(process.env.PDF_OUT, pdf);
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  expect(pages).toBeGreaterThanOrEqual(2);
  expect(pages).toBeLessThanOrEqual(4);
  await page.emulateMedia({ media: 'screen' });

  // Telefon: kağız üfüqi sürüşür, səhifə sınmır
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${SHOTS}/v2-report-exec-390.png` });
});

test('əməkdaş kartı, proses və jurnal hesabatları', async ({ page }) => {
  await uiLogin(page);
  await idle(page);
  await page.goto(`/reports/employee/${encodeURIComponent('Ülkər')}`);
  await expect(page.getByRole('heading', { name: 'Əməkdaş kartı: Ülkər' })).toBeVisible();
  await expect(page.getByTestId('report')).toContainText('(1 922 − 240 məzuniyyət) = 1 682 saat × ştat 1');
  await page.goto(`/reports/process/${encodeURIComponent('İntizam tənbehi')}`);
  await expect(page.getByTestId('report')).toContainText('Tək icraçı riski');
  await page.goto('/reports/log');
  await expect(page.getByTestId('rep-log').locator('tbody tr').first()).toBeVisible();
  await axe(page);
});

test('Excel: export → eyni faylın importu dəyişiklik göstərmir; diff önizləmə və yükləmə', async ({ page }) => {
  await uiLogin(page);
  await idle(page);
  await page.goto('/reports');
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Excel', exact: true }).click();
  const file = await dl;
  expect(file.suggestedFilename()).toMatch(/^workforce-planning-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const path = await file.path();
  expect(statSync(path).size).toBeGreaterThan(10_000);

  // Roundtrip: export olunan faylı geri yükləmək heç nəyi dəyişməməlidir
  await page.goto('/reports/import');
  await page.getByLabel('Excel və ya CSV faylı').setInputFiles(path);
  await expect(page.getByLabel('Vərəq')).toHaveValue('1'); // "Tapşırıqlar" (0 = Hesabat)
  await page.getByRole('button', { name: 'Davam' }).click();
  await expect(page.getByRole('combobox', { name: 'Sahə: İllik saat' })).toHaveValue('hours');
  await expect(page.getByRole('combobox', { name: 'Sahə: Cari icraçı' })).toHaveValue('');
  await page.getByRole('button', { name: 'Davam' }).click();
  const counts = page.getByTestId('imp-counts');
  await expect(counts).toContainText('0yeni');
  await expect(counts).toContainText('0dəyişəcək');
  await expect(counts).toContainText('341dəyişməyən');
  await axe(page);

  // Dəyişdirilmiş fayl: B-25 saatı 99, bir yeni iş, bir xətalı sətir
  const buf: number[] = await page.evaluate(() => {
    const X = (window as unknown as { XLSX: any }).XLSX; // eslint-disable-line @typescript-eslint/no-explicit-any
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(
      wb,
      X.utils.aoa_to_sheet([
        ['id', 'Proses', 'Tapşırıq', 'İLKİN İCRAÇI', 'İllik saat'],
        ['B-25', '', '', '', 99],
        ['', 'Yeni proses', 'E2E yeni iş', 'Zümrüd', 12],
        ['B-26', '', '', '', 'çox'],
      ]),
      'Tapşırıqlar',
    );
    return Array.from(new Uint8Array(X.write(wb, { type: 'array', bookType: 'xlsx' })));
  });
  await page.goto('/reports/import');
  await page
    .getByLabel('Excel və ya CSV faylı')
    .setInputFiles({ name: 'deyisiklik.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from(buf) });
  await page.getByRole('button', { name: 'Davam' }).click();
  await page.getByRole('button', { name: 'Davam' }).click();
  await expect(counts).toContainText('1yeni');
  await expect(counts).toContainText('1dəyişəcək');
  await expect(counts).toContainText('1xətalı');
  await expect(page.getByTestId('imp-errors')).toContainText('Sətir 4: "çox" rəqəm deyil');
  await expect(page.getByTestId('imp-changed')).toContainText('B-25');
  await expect(page.getByTestId('imp-changed')).toContainText('→ 99');
  await page.screenshot({ path: `${SHOTS}/v2-import-preview-1440.png`, fullPage: true });
  const next = page.getByRole('button', { name: 'Davam' });
  await expect(next).toBeDisabled();
  await page.getByLabel(/Yalnız xətasız sətirləri yüklə/).check();
  await next.click();
  await expect(page.getByText('Əvəz et (administrator)')).toBeVisible();
  await page.getByRole('button', { name: 'Yüklə' }).click();
  await expect(page).toHaveURL(/\/tasks/);
  await idle(page);
  const d = (await db()).docs;
  expect(Number(d['tasks/B-25'].hours)).toBe(99);
  expect(String(d['tasks/B-25'].task)).not.toBe(''); // boş xana dəyəri silmir
  expect(Object.values(d).some((x) => x.task === 'E2E yeni iş' && x.owner_before === 'Zümrüd')).toBe(true);
  expect(Number(d['tasks/B-26'].hours)).not.toBe(0);
  expect(
    Object.values(d).some((x) => x.action === 'Import' && String(x.task_label).startsWith('deyisiklik.xlsx: 1 yeni, 1 dəyişən')),
  ).toBe(true);
});
