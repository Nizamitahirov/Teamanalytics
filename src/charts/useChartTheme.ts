import { useSyncExternalStore } from 'react';
import { darkTheme, lightTheme, type ChartTheme } from './theme';

const resolve = () => {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'dark' || attr === 'light') return attr;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

/** Aktiv mövzu (data-theme atributu və ya sistem seçimi) → qrafik teması. Dəyişəndə yenidən render. */
export function useChartTheme(): ChartTheme {
  const mode = useSyncExternalStore(
    (cb) => {
      const mo = new MutationObserver(cb);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', cb);
      return () => {
        mo.disconnect();
        mq.removeEventListener('change', cb);
      };
    },
    resolve,
    () => 'light' as const,
  );
  return mode === 'dark' ? darkTheme : lightTheme;
}
