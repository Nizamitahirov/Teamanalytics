import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// v2 klienti (SPEC §4) — canlıda kökdə (/) işləyir (keçid, ADR-010). v1 `public/` Vite-in publicDir-i DEYİL:
// Vercel build-i (`npm run build:vercel`) v2-ni dist/-ə yığır, v1-i dəyişmədən dist/legacy/-ə köçürür (ehtiyat).
// CSP (SPEC §10) — v2 build-inə meta teq kimi. Dev serverə tətbiq olunmur (Vite HMR inline skript istifadə edir).
// Eyni siyasət + frame-ancestors HTTP başlığı kimi vercel.json-da (yalnız v2 yolları; /legacy/ inline skript işlədir).
// İkisi sinxron saxlanılır: tests/unit/csp.test.ts.
export const CSP = [
  "default-src 'self'",
  "script-src 'self' https://cdn.sheetjs.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');
const cspPlugin = (): Plugin => ({
  name: 'wfp-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
});

export default defineConfig({
  plugins: [react(), cspPlugin()],
  // Build anındakı commit (Vercel) — UI-da versiya və "Yeni versiya var" yoxlaması (SPEC §14)
  define: { __COMMIT__: JSON.stringify((process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7)) },
  publicDir: 'static',
  server: {
    port: 5173,
    // xfwd: orijinal host x-forwarded-host kimi ötürülür — server CSRF yoxlaması (Origin = host) dev-də də işləsin
    proxy: { '/api': { target: 'http://localhost:8765', xfwd: true } },
  },
  preview: {
    port: 4173,
    proxy: { '/api': { target: 'http://localhost:8765', xfwd: true } },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
    // ECharts chunk-ı (~240 KB gzip) yalnız Panel qrafikləri açılanda lazy yüklənir — ilkin JS ~136 KB
    chunkSizeWarningLimit: 800,
  },
});
