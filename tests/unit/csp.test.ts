// CSP (SPEC §10): v2 build-indəki meta teq və vercel.json HTTP başlığı eyni siyasətdir (+ frame-ancestors başlıqda).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CSP } from '../../vite.config.js';

const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));

describe('CSP', () => {
  it('vercel.json başlığı = vite meta + frame-ancestors; /legacy/ və /api/ xaric', () => {
    const h = vercel.headers.find((x: { headers: { key: string }[] }) =>
      x.headers.some((y) => y.key === 'Content-Security-Policy'),
    );
    expect(h.source).toBe('/((?!legacy/|api/).*)');
    expect(h.headers[0].value).toBe(`${CSP}; frame-ancestors 'none'`);
    expect(CSP).toContain("script-src 'self' https://cdn.sheetjs.com");
    expect(CSP).not.toContain('unsafe-eval');
  });
  it('SPA rewrite /api, /assets, /legacy-ə toxunmur; cron gündə bir dəfə', () => {
    expect(vercel.rewrites).toEqual([{ source: '/((?!api/|assets/|legacy/).*)', destination: '/index.html' }]);
    expect(vercel.crons).toEqual([{ path: '/api/cron/daily', schedule: '50 19 * * *' }]);
    expect(vercel.outputDirectory).toBe('dist');
  });
});
