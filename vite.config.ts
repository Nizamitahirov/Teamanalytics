import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// v2 klienti (SPEC §4). v1 `public/` qovluğu Vite-in publicDir-i DEYİL — Vercel hələ v1-i yayımlayır,
// v2 build-i (dist/) Mərhələ 10-a qədər deploy olunmur (SPEC §15.1).
export default defineConfig({
  plugins: [react()],
  publicDir: 'static',
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8765' },
  },
  preview: {
    port: 4173,
    proxy: { '/api': 'http://localhost:8765' },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
    // ECharts chunk-ı (~240 KB gzip) yalnız Panel qrafikləri açılanda lazy yüklənir — ilkin JS ~136 KB
    chunkSizeWarningLimit: 800,
  },
});
