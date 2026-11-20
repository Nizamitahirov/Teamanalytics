import { expect, type Page } from '@playwright/test';

// e2e köməkçiləri. İlkin Ecosystem/Ecosystem parolu ilə giriş məcburi parol dəyişməsinə aparır (SPEC §10) —
// ona görə hər spec təmiz bazada admin parolunu API ilə bir dəfə dəyişir və UI-da yeni parolla daxil olur.
export const ADMIN_PW = 'E2E-Admin-Parol-1';
const API = 'http://localhost:8765';

/** Mock bazanı sıfırlayır, admin parolunu dəyişir və datanı seed edir. */
export async function freshDb() {
  await fetch('http://localhost:8791/reset', { method: 'POST' });
  const r = await fetch(`${API}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Ecosystem', password: 'Ecosystem' }),
  });
  const cookie = (r.headers.get('set-cookie') ?? '').split(';')[0];
  const c = await fetch(`${API}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ action: 'change-own', current: 'Ecosystem', password: ADMIN_PW }),
  });
  if (!c.ok) throw new Error('admin parolu dəyişmədi: ' + (await c.text()));
  const next = (c.headers.get('set-cookie') ?? '').split(';')[0];
  await fetch(`${API}/api/data`, { headers: { Cookie: next } }); // seed
  return next;
}

/** Admin cookie-si ilə API çağırışı (məs. test istifadəçiləri yaratmaq). */
export async function adminApi(path: string, body: unknown) {
  const r = await fetch(`${API}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Ecosystem', password: ADMIN_PW }),
  });
  const cookie = (r.headers.get('set-cookie') ?? '').split(';')[0];
  return fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
}

export async function uiLogin(page: Page, user = 'Ecosystem', pass = ADMIN_PW) {
  await page.goto('/login');
  await page.getByLabel('İstifadəçi adı').fill(user);
  await page.getByLabel('Parol', { exact: true }).fill(pass);
  await page.getByRole('button', { name: 'Daxil ol' }).click();
  // Giriş tamamlanana (cookie yazılana) qədər gözlə — yoxsa növbəti keçid sorğunu kəsir
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

/** Yeni istifadəçi yaradır və onun ilk parolunu dəyişir (məcburi dəyişmə ekranından keçmək üçün). */
export async function createUser(name: string, role: 'admin' | 'editor' | 'viewer', password: string) {
  const tmp = 'Muveqqeti-Soz-2026';
  const a = await adminApi('/api/users', { action: 'add', name, role, password: tmp });
  expect(a.ok, await a.clone().text()).toBe(true);
  const r = await fetch(`${API}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: name, password: tmp }),
  });
  const cookie = (r.headers.get('set-cookie') ?? '').split(';')[0];
  const c = await fetch(`${API}/api/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ action: 'change-own', current: tmp, password }),
  });
  expect(c.ok, await c.clone().text()).toBe(true);
}
