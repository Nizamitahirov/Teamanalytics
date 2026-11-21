import { expect, test } from '@playwright/test';
import { freshDb, uiLogin } from './helpers.js';
// Ayarlar → Əməkdaşların şirkəti: əməkdaşın əsl şirkəti seçilir və yadda saxlanılır
for (const w of [1440, 390])
  test(`əməkdaşların şirkəti (${w}px)`, async ({ page }) => {
    await freshDb();
    await page.setViewportSize({ width: w, height: 900 });
    await uiLogin(page);
    await page.goto('/settings?tab=staff');
    const sel = page.getByLabel('Xuraman x — şirkət');
    await expect(sel).toHaveValue('Pashapay');
    await sel.selectOption('Birbank');
    await page.getByRole('button', { name: 'Yadda saxla (1)' }).click();
    await expect(page.getByTestId('sync-pill').first()).toHaveAttribute('data-status', 'idle');
    const d = await (await fetch('http://localhost:8791')).json();
    expect(d.docs['employees/Xuraman x'].company).toBe('Birbank');
  });
