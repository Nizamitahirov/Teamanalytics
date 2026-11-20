import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Mərhələ 4 QM: Panel vidjetləri (SPEC §6.2), "Cədvəl kimi bax" eyni rəqəmlər, tünd rejim, a11y (axe 0 ciddi).
// Təmiz baza ilə işləyir (mock reset).
const SHOTS = 'dev/e2e-shots';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('İstifadəçi adı').fill('Ecosystem');
  await page.getByLabel('Parol', { exact: true }).fill('Ecosystem');
  await page.getByRole('button', { name: 'Daxil ol' }).click();
  await expect(page.getByTestId('kpi-volume')).toBeVisible();
}
const widget = (page: Page, id: string) => page.getByTestId(id);

let consoleErrors: string[] = [];
test.beforeAll(async () => {
  await fetch('http://localhost:8791/reset', { method: 'POST' });
});
test.beforeEach(async ({ page }) => {
  consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await page.setViewportSize({ width: 1440, height: 900 });
});
test.afterEach(() => expect(consoleErrors).toEqual([]));

test('bütün vidjetlər render olunur; cədvəl görünüşü qızıl rəqəmləri verir', async ({ page }) => {
  await login(page);
  for (const id of [
    'w-capacity',
    'w-load',
    'w-matrix',
    'w-sankey',
    'w-tree',
    'w-waterfall',
    'w-heatmap',
    'w-pareto',
    'w-hist',
    'w-trend',
    'w-staff',
  ])
    await expect(widget(page, id), id).toBeVisible();
  for (const id of ['w-capacity', 'w-load', 'w-sankey', 'w-tree', 'w-waterfall', 'w-heatmap', 'w-pareto', 'w-hist'])
    await expect(widget(page, id).locator('[data-chart] svg'), id).toBeVisible();

  // Waterfall cədvəli
  const wf = widget(page, 'w-waterfall');
  await wf.getByRole('button', { name: 'Cədvəl kimi bax' }).click();
  await expect(wf.getByRole('row', { name: /Bütün işlər/ })).toContainText('28 782');
  await expect(wf.getByRole('row', { name: /Ləğv edilənlər/ })).toContainText('933');
  await expect(wf.getByRole('row', { name: /Cari iş həcmi/ })).toContainText('27 850');
  await expect(wf.getByRole('row', { name: /^Hədəf/ })).toContainText('27 795');

  // Tutum balansı cədvəli
  const cap = widget(page, 'w-capacity');
  await cap.getByRole('button', { name: 'Cədvəl kimi bax' }).click();
  await expect(cap.getByRole('row', { name: /Mövcud ştat/ })).toContainText('18,00');
  await expect(cap.getByRole('row', { name: /^Lazım olan/ })).toContainText('14,49');

  // Yük cədvəli — normanı aşanlar yuxarıda
  const load = widget(page, 'w-load');
  await load.getByRole('button', { name: 'Cədvəl kimi bax' }).click();
  const first3 = await load.locator('tbody tr th').evaluateAll((els) => els.slice(0, 3).map((e) => e.textContent));
  expect(first3.sort()).toEqual(['Ağaəli', 'Sveta x', 'Ülkər'].sort());

  // ⓘ formulanı göstərir
  await widget(page, 'w-load').getByRole('button', { name: 'Bu qrafik nəyi göstərir' }).click();
  await expect(widget(page, 'w-load').getByRole('note')).toContainText('norma × ştat');
  await page.screenshot({ path: `${SHOTS}/v2-dashboard-tables.png`, fullPage: true });
});

test('filtrlər URL-də və bütün vidjetlərə təsir edir; klik naviqasiyası', async ({ page }) => {
  await login(page);
  await page.getByRole('group', { name: 'Şirkət' }).getByRole('button', { name: 'Pashapay' }).click();
  await expect(page).toHaveURL(/company=Pashapay/);
  await expect(page.getByTestId('kpi-volume')).toHaveText('6 836saat');
  const tree = widget(page, 'w-tree');
  await tree.getByRole('button', { name: 'Cədvəl kimi bax' }).click();
  await expect(tree.locator('tbody tr').first()).toContainText('Pashapay');
  await expect(tree.locator('tbody')).not.toContainText('Birbank');
  await page.getByRole('group', { name: 'Şirkət' }).getByRole('button', { name: 'Bütün şirkətlər' }).click();

  // Normanı aşan KPI → əməkdaşlar (filtrlənmiş)
  await page.getByTestId('kpi-over').click();
  await expect(page).toHaveURL(/\/employees\?level=critical/);
  await expect(page.locator('[data-emp]')).toHaveCount(3);
});

test('tünd rejim və 1440/820/390 ekran şəkilləri', async ({ page }) => {
  await login(page);
  await page.screenshot({ path: `${SHOTS}/v2-dashboard-1440-light.png`, fullPage: true });
  await page.getByRole('button', { name: /^Mövzu/ }).click();
  await page.getByRole('button', { name: /^Mövzu/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/v2-dashboard-1440-dark.png`, fullPage: true });
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/v2-dashboard-820-dark.png`, fullPage: true });
  await page.getByRole('button', { name: /^Mövzu/ }).click(); // sistem
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: `${SHOTS}/v2-dashboard-390.png`, fullPage: true });
});

test('əlçatanlıq: axe — əsas ekranlarda ciddi pozuntu yoxdur', async ({ page }) => {
  await login(page);
  for (const path of ['/', '/tasks', '/employees', '/employees/' + encodeURIComponent('Ülkər'), '/log']) {
    await page.goto(path);
    await page.waitForTimeout(600);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    const bad = r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(bad.map((v) => `${path}: ${v.id} (${v.impact}) — ${v.nodes.length} · ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
  }
});

// Vizual reqressiya (SPEC §13.1): əsas vidjetlər açıq və tünd rejimdə.
// Hədd 3%: etalonlar bir mühitdə çəkilir, CI-da şrift anti-aliasing-i ~1% piksel fərqi yaradır (PR #9-da ölçülüb).
// Real düzən/rəng/ölçü dəyişiklikləri adətən > 3% fərq verir. SPEC-dəki 0,1% eyni mühitdə etalon tələb edir (ADR-004).
// Etalonları yeniləmək: npx playwright test dev/e2e/dashboard.spec.ts -g vizual --update-snapshots
test('vizual: əsas vidjetlər (açıq/tünd)', async ({ page }) => {
  await login(page);
  const shot = async (mode: string) => {
    for (const id of ['w-capacity', 'w-load', 'w-waterfall', 'w-heatmap', 'w-hist']) {
      await expect(widget(page, id).locator('[data-chart] svg')).toBeVisible();
      await expect(widget(page, id)).toHaveScreenshot(`${id}-${mode}.png`, { maxDiffPixelRatio: 0.03, animations: 'disabled' });
    }
  };
  await shot('light');
  await page.getByRole('button', { name: /^Mövzu/ }).click();
  await page.getByRole('button', { name: /^Mövzu/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await shot('dark');
});
