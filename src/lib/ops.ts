// Əməliyyat (SPEC §14): versiya, klient xətalarının hesabatı, service worker.
import { APP_VERSION } from '../../shared/version';

declare const __COMMIT__: string;
/** Build anındakı commit (Vercel); lokal/dev-də boş */
export const BUILD_COMMIT: string = typeof __COMMIT__ === 'string' ? __COMMIT__ : '';
export const versionLabel = () => `v${APP_VERSION}${BUILD_COMMIT ? ` · ${BUILD_COMMIT}` : ''}`;

/** Gözlənilməz xətalar serverə (POST /api/health) — sessiyada ən çox 5, eyni mətn bir dəfə. Giriş yoxdursa server 401 qaytarır. */
export function installErrorReporting() {
  const sent = new Set<string>();
  const report = (message: string, stack?: string) => {
    if (sent.size >= 5 || sent.has(message) || /ResizeObserver loop/.test(message)) return;
    sent.add(message);
    void fetch('/api/health', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message.slice(0, 2000),
        stack: stack?.slice(0, 4000),
        url: location.pathname.slice(0, 500),
        version: versionLabel(),
      }),
    }).catch(() => undefined);
  };
  window.addEventListener('error', (e) => report(String(e.message || e.error), e.error?.stack));
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as { message?: string; stack?: string } | undefined;
    // Şəbəkə xətaları (offline) xəta deyil
    if (r && (r as { code?: string }).code === 'network') return;
    report(String(r?.message ?? r), r?.stack);
  });
}

/** PWA (SPEC §6.11): yalnız build-də (dev-də HMR ilə qarışmasın). */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => undefined));
}
