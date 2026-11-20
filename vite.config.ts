import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// v2 klienti (SPEC §4). v1 `public/` qovluğu Vite-in publicDir-i DEYİL — Vercel hələ v1-i yayımlayır,
// v2 build-i (dist/) Mərhələ 10-a qədər deploy olunmur (SPEC §15.1).
// CSP (SPEC §10) — v2 build-inə meta teq kimi. Dev serverə tətbiq olunmur (Vite HMR inline skript istifadə edir).
// Canlıda v1 (public/login.html inline skript) hələ işlədiyi üçün HTTP başlığı kimi CSP Mərhələ 10-da (keçid) əlavə olunacaq.
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://cdn.sheetjs.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
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
