import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { az, type MessageKey } from '../../shared/i18n/az';
import { en } from '../../shared/i18n/en';
import { storage } from './storage';

export type Lang = 'az' | 'en';
const DICTS = { az, en } as const;
const KEY = 'wfp.v2.lang';

type I18n = { lang: Lang; setLang: (l: Lang) => void; t: (k: MessageKey, vars?: Record<string, string | number>) => string };
const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (storage.get(KEY) === 'en' ? 'en' : 'az'));
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    storage.set(KEY, l);
    document.documentElement.lang = l;
  }, []);
  const t = useCallback(
    (k: MessageKey, vars?: Record<string, string | number>) =>
      DICTS[lang][k].replace(/\{(\w+)\}/g, (m, v: string) => (vars && v in vars ? String(vars[v]) : m)),
    [lang],
  );
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('I18nProvider yoxdur');
  return v;
}
