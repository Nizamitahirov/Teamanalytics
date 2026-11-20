// Təmiz baza: ilk addım məcburi parol dəyişməsi olsa da ilkin data seed olunmalıdır (Mərhələ 5-də tapılan bug).
import { expect, it } from 'vitest';
import { startApi } from '../helpers/apiServer.js';

it('təmiz bazada ilk addım parol dəyişməsi olsa da data seed olunur', async () => {
  const api = await startApi();
  try {
    const json = { 'Content-Type': 'application/json' };
    const l = await fetch(api.base + '/api/login', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ username: 'Ecosystem', password: 'Ecosystem' }),
    });
    const c1 = (l.headers.get('set-cookie') ?? '').split(';')[0];
    const ch = await fetch(api.base + '/api/users', {
      method: 'POST',
      headers: { ...json, Cookie: c1 },
      body: JSON.stringify({ action: 'change-own', current: 'Ecosystem', password: 'Ilk-Addim-Parol-1' }),
    });
    expect(ch.status).toBe(200);
    const c2 = (ch.headers.get('set-cookie') ?? '').split(';')[0];
    const d = (await (await fetch(api.base + '/api/data', { headers: { Cookie: c2 } })).json()) as { tasks: unknown[] };
    expect(d.tasks).toHaveLength(341);
    // Təkrar yükləmədə ikinci dəfə seed edilmir
    const again = (await (await fetch(api.base + '/api/data', { headers: { Cookie: c2 } })).json()) as { tasks: unknown[] };
    expect(again.tasks).toHaveLength(341);
  } finally {
    await api.close();
  }
});
