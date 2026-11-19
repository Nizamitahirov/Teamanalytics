import { useCallback, useEffect, useState } from 'react';
import { storage } from './storage';

export type Theme = 'light' | 'dark' | 'system';
const KEY = 'wfp.v2.theme';

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

export const initialTheme = (): Theme => {
  const v = storage.get(KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
};

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  useEffect(() => applyTheme(theme), [theme]);
  const cycle = useCallback(() => {
    setTheme((t) => {
      const next: Theme = t === 'system' ? 'light' : t === 'light' ? 'dark' : 'system';
      storage.set(KEY, next);
      return next;
    });
  }, []);
  return { theme, cycle };
}
