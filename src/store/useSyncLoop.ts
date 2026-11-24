import { useEffect } from 'react';
import { ApiRequestError } from '../lib/api';
import { dataStore } from './index';

export const POLL_MS = 10_000;

/**
 * Sinxron dövrü (SPEC §4.3): keşdən dərhal göstər → serverdən yenilə; görünən səhifədə hər 10 s,
 * arxa planda dayanır, fokusa qayıdanda dərhal; online/offline hadisələri; sessiya bitibsə `onUnauthorized`.
 */
export function useSyncLoop(onUnauthorized: () => void) {
  useEffect(() => {
    let stopped = false;
    const s = () => dataStore.getState();
    // Səhifə açılanda ilk uğurlu yükləmə TAM olur (delta yox): keşdə nə qalıbsa qalsın, hər açılışda data serverlə
    // eyniləşir (iki kompüterdə fərqli rəqəm görünməsin). Növbə varsa tam yükləmə növbə göndərilənə qədər gözləyir.
    let needFull = true;
    const pull = async () => {
      // "offline" bayrağına baxmırıq: bayraq yalnız sorğu xətasından da qoyula bilər; uğurlu sorğu onu özü götürür
      if (stopped || document.visibilityState !== 'visible' || !navigator.onLine) return;
      try {
        if (await s().pull({ full: needFull })) needFull = false;
      } catch (e) {
        if (e instanceof ApiRequestError && e.status === 401) onUnauthorized();
      }
    };
    void (async () => {
      await s().hydrate();
      if (!navigator.onLine) s().setOnline(false);
      await pull();
      void s().flush();
    })();
    const timer = window.setInterval(pull, POLL_MS);
    const onVisible = () => void pull();
    const onOnline = () => {
      s().setOnline(true);
      void pull();
    };
    const onOffline = () => s().setOnline(false);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [onUnauthorized]);

  // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y (mətn sahəsində deyilsə)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        dataStore.getState().undoLast();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        dataStore.getState().redoLast();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
