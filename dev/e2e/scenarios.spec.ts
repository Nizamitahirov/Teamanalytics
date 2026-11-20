import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ADMIN_PW, adminApi, createUser, freshDb } from './helpers.js';

// Mərhələ 6 QM (SPEC §6.5, §8, §2): ssenari canlı dataya yazmır; balanslama ssenari kimi açılır;
// tətbiq sonrası rəqəmlər ssenaridə görünənlə eynidir; tək "Geri al"; təsdiq axını + bildirişlər.
const SHOTS = 'dev/e2e-shots';
type Db = { docs: Record<string, Record<string, unknown>> };
const db = async (): Promise<Db> => (await fetch('http://localhost:8791')).json();
const tasksOf = async () =>
  Object.fromEntries(
    Object.entries((await db()).docs)
      .filter(([k]) => k.startsWith('tasks/'))
      .map(([k, v]) => [k.slice(6), v]),
  );
const owner = (t: Record<string, unknown>) => String(t.owner_after || t.owner_before);

async function login(page: Page, user = 'Ecosystem', pass = ADMIN_PW) {
  await page.goto('/login');
  await page.getByLabel('İstifadəçi adı').fill(user);
  await page.getByLabel('Parol', { exact: true }).fill(pass);
  await page.getByRole('button', { name: 'Daxil ol' }).click();
  await expect(page.getByTestId('sync-pill').first()).toHaveAttribute('data-status', 'idle');
}

let consoleErrors: string[] = [];
test.beforeAll(async () => {
  await freshDb();
});
test.beforeEach(async ({ page }) => {
  consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await page.setViewportSize({ width: 1440, height: 900 });
});
test.afterEach(() => expect(consoleErrors).toEqual([]));

test('Panel → Yükü balansla → ssenari (canlı data dəyişmir) → tətbiq → rəqəmlər eyni → tək Geri al', async ({ page }) => {
  await login(page);
  const before = await tasksOf();
  await expect(page.getByTestId('kpi-over')).toContainText('3');
  await page.getByTestId('balance-btn').click();
  await expect(page).toHaveURL(/\/scenarios\/S-/);
  const changes = page.locator('[data-change="transfer"]');
  await expect(changes.first()).toBeVisible();
  const n = await changes.count();
  expect(n).toBeGreaterThan(5);
  // Ssenaridə normanı aşan qalmır
  const over = page.locator('[data-kpi="kpi.over"]');
  await expect(over.locator('b')).toHaveText('0');
  await expect(over).toContainText('idi 3');
  await expect(page.getByTestId('scen-loads').locator('[data-person="Ülkər"]')).toContainText('113%');

  // QM: ssenari yaratmaq canlı dataya heç nə yazmır
  expect(await tasksOf()).toEqual(before);
  await page.screenshot({ path: `${SHOTS}/v2-scenario-editor-1440.png`, fullPage: true });

  // a11y: 0 ciddi
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  const bad = axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  expect(
    bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ') + ' ' + (n.failureSummary ?? '')).join(' | ')}`),
  ).toEqual([]);

  // Bir təklifi çıxar
  const first = changes.first();
  const label = (await first.textContent())!.replace('alqoritm', '').trim();
  await first.getByRole('button', { name: /^Çıxar/ }).click();
  await expect(changes).toHaveCount(n - 1);
  await expect(page.locator('[data-change="transfer"]', { hasText: label })).toHaveCount(0);

  // Tətbiq: önizləmə → bazaya → Panel rəqəmləri ssenaridəki ilə eyni
  const scenOver = await over.locator('b').textContent();
  const scenNeed = await page.locator('[data-kpi="kpi.need"] b').textContent();
  await page.getByRole('button', { name: 'Tətbiq et' }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg.getByText(/Canlı datada \d+ dəyişiklik olacaq/)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/v2-scenario-apply.png` });
  await dlg.getByRole('button', { name: 'Tətbiq et' }).click();
  await expect(page.getByText(/Ssenari tətbiq edildi: \d+ dəyişiklik/)).toBeVisible();
  await expect
    .poll(async () => Object.values(await tasksOf()).filter((t, i) => owner(t) !== owner(Object.values(before)[i])).length)
    .toBe(n - 1);
  const logs = Object.values((await db()).docs).filter((d) => d.action === 'Ssenari');
  expect(logs.length).toBe(1);
  await expect(page.locator('[class*="status_applied"]')).toBeVisible();

  // Səhifəni yenidən yükləmədən (geri alma tarixçəsi yaddaşdadır) Panelə keç
  await page.getByRole('navigation', { name: 'Əsas menyu' }).getByRole('link', { name: 'Panel' }).first().click();
  await expect(page.getByTestId('kpi-over')).toContainText(scenOver!);
  await expect(page.locator('main')).toContainText(scenNeed!);

  // Tək "Geri al" bütün ssenarini qaytarır
  await page.getByRole('button', { name: /^Geri al: Ssenari/ }).click();
  await expect
    .poll(async () => JSON.stringify(Object.values(await tasksOf()).map(owner)))
    .toBe(JSON.stringify(Object.values(before).map(owner)));
  await expect(page.getByTestId('kpi-over')).toContainText('3');
});

test('şablon "Əməkdaş ayrılır" + siyahı + 2 ssenarinin müqayisəsi; 820/390 və tünd rejim', async ({ page }) => {
  await login(page);
  await page.goto('/scenarios');
  await page.getByRole('button', { name: 'Yeni ssenari' }).click();
  const dlg = page.getByRole('dialog', { name: 'Yeni ssenari' });
  await dlg.getByLabel('Şablon').selectOption('leave');
  await dlg.getByLabel('Ad', { exact: true }).selectOption('Ülkər');
  await page.screenshot({ path: `${SHOTS}/v2-scenario-new.png` });
  await dlg.getByRole('button', { name: 'Ssenari yarat' }).click();
  await expect(page.getByRole('textbox', { name: 'Ssenarinin adı' })).toHaveValue('Ülkər ayrılır');
  await expect(page.locator('[data-change="emp_remove"]')).toHaveCount(1);
  await expect(page.getByTestId('scen-loads').locator('[data-person="Ülkər"]')).toContainText('0%');

  // Əl ilə dəyişiklik: normanı dəyiş
  await page.getByRole('button', { name: 'Dəyişiklik əlavə et' }).click();
  const add = page.getByRole('dialog', { name: 'Dəyişiklik əlavə et' });
  await add.getByLabel('Dəyişikliyin növü').selectOption('norm');
  await add.getByLabel('İllik norma (saat/ştat)').fill('1800');
  await add.getByRole('button', { name: 'Əlavə et' }).click();
  await expect(page.locator('[data-change="norm"]')).toContainText('1922 → 1800');

  await page.goto('/scenarios');
  await expect(page.locator('[data-scenario]')).toHaveCount(1); // tətbiq edilən "Aktiv"-də deyil
  await page.getByRole('button', { name: /^Tətbiq edilib/ }).click();
  await expect(page.locator('[data-scenario]')).toHaveCount(1);
  await page.getByRole('button', { name: /^Aktiv/ }).click();
  await page.screenshot({ path: `${SHOTS}/v2-scenarios-list-1440.png` });

  // İkinci ssenari (norma) və müqayisə
  await page.getByRole('button', { name: 'Yeni ssenari' }).click();
  await page.getByRole('dialog').getByLabel('Şablon').selectOption('norm');
  await page.getByRole('dialog').getByLabel('İllik norma (saat/ştat)').fill('1700');
  await page.getByRole('dialog').getByRole('button', { name: 'Ssenari yarat' }).click();
  await expect(page.locator('[data-change="norm"]')).toHaveCount(1);
  await page.goto('/scenarios');
  await expect(page.locator('[data-scenario]')).toHaveCount(2);
  for (const cb of await page.locator('[data-scenario] input[type="checkbox"]').all()) await cb.check();
  await page.getByRole('button', { name: 'Müqayisə et (2)' }).click();
  await expect(page).toHaveURL(/\/scenarios\/compare\?ids=/);
  await expect(page.getByRole('heading', { name: '2 ssenarinin müqayisəsi' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/v2-scenarios-compare-1440.png`, fullPage: true });

  await page.goto('/scenarios');
  await page.getByRole('link', { name: 'Ülkər ayrılır' }).click();
  await page.getByRole('button', { name: /^Mövzu/ }).click();
  await page.getByRole('button', { name: /^Mövzu/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: `${SHOTS}/v2-scenario-editor-1440-dark.png`, fullPage: true });
  await page.getByRole('button', { name: /^Mövzu/ }).click();
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.screenshot({ path: `${SHOTS}/v2-scenario-editor-820.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${SHOTS}/v2-scenario-editor-390.png`, fullPage: true });
  // 390 px-də üfüqi sürüşmə yoxdur
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('təsdiq axını: editor-un böyük ötürməsi təsdiqə gedir → admin bildiriş alır → təsdiqləyib tətbiq edir', async ({
  browser,
}) => {
  await createUser('Redaktor', 'editor', 'Yazar-Sozu-2026-x');
  // Admin təsdiq axınını açır (UI)
  const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const admin = await adminCtx.newPage();
  await login(admin);
  await admin.goto('/settings?tab=general');
  await admin.getByRole('checkbox', { name: /administrator təsdiqi tələb etsin/ }).check();
  await expect.poll(async () => Number((await db()).docs['meta/main']?.approval)).toBe(1);

  const edCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const ed = await edCtx.newPage();
  await login(ed, 'Redaktor', 'Yazar-Sozu-2026-x');
  await ed.goto('/tasks?q=B-16');
  await ed.locator('[data-task="B-16"]').getByRole('button', { name: 'Ötür' }).click();
  const dlg = ed.getByRole('dialog', { name: 'Ötürmə' });
  await dlg.getByRole('combobox', { name: 'Kimə ötürülsün' }).fill('zumr');
  await dlg.getByRole('option', { name: /Zümrüd/ }).click();
  await expect(dlg.getByText(/administrator təsdiqinə göndəriləcək/)).toBeVisible();
  await dlg.getByRole('button', { name: 'Təsdiqə göndər' }).click();
  await expect(ed.getByText('Ötürmə təsdiqə göndərildi')).toBeVisible();
  expect(owner((await tasksOf())['B-16'])).toBe('Nərmin'); // canlı data dəyişməyib

  // Admin: bildiriş sayğacı → ssenari → təsdiqlə və tətbiq et
  await admin.reload();
  await expect(admin.getByTestId('bell')).toHaveAccessibleName(/1 oxunmamış/, { timeout: 15_000 });
  await admin.getByTestId('bell').click();
  await admin.screenshot({ path: `${SHOTS}/v2-notifications.png` });
  await admin
    .getByRole('region', { name: 'Bildirişlər' })
    .getByRole('button', { name: /təsdiqə göndərdi/ })
    .click();
  await expect(admin).toHaveURL(/\/scenarios\/S-/);
  await expect(admin.getByText(/Redaktor bu ssenarinin təsdiqini gözləyir/)).toBeVisible();
  await admin.getByRole('button', { name: 'Təsdiqlə və tətbiq et' }).click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Təsdiqlə və tətbiq et' }).click();
  await expect.poll(async () => owner((await tasksOf())['B-16'])).toBe('Zümrüd');
  // Editor bildiriş alır
  await ed.reload();
  await expect(ed.getByTestId('bell')).toHaveAccessibleName(/1 oxunmamış/, { timeout: 15_000 });

  // Təsdiq axınını bağla (digər testlərə təsir etməsin)
  const r = await adminApi('/api/ops', { ops: [{ t: 'upsert', table: 'Settings', row: { key: 'approval', value: 0 } }] });
  expect(r.ok).toBe(true);
  await adminCtx.close();
  await edCtx.close();
});
