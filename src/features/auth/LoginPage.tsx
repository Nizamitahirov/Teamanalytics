import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { AlertTriangle } from 'lucide-react';
import { BrandMark } from '../../components/BrandMark';
import { ApiRequestError, login } from '../../lib/api';
import { formatTime } from '../../lib/dates';
import { useI18n, type Lang } from '../../lib/i18n';
import { useAuth } from '../../app/auth';
import s from './LoginPage.module.css';

/** Giriş (SPEC §6.1). "Məni xatırla" və hesab kilidi — Mərhələ 5 (server tərəfi ilə birlikdə). */
export function LoginPage() {
  const { t, lang, setLang } = useI18n();
  const { refresh } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(username, password, remember);
      await refresh(); // PublicOnly əvvəlki səhifəyə yönəldir
    } catch (err) {
      // Ümumi mesaj: hansı sahənin səhv olduğunu demirik (SPEC §6.1 QM)
      if (err instanceof ApiRequestError && err.code === 'network') setError(t('login.network'));
      else if (err instanceof ApiRequestError && err.code === 'locked')
        setError(t('login.locked', { time: formatTime(String(err.data.until ?? '')) }));
      else if (err instanceof ApiRequestError && (err.code === 'bad_credentials' || err.code === 'invalid_body'))
        setError(t('login.error'));
      else setError(err instanceof Error ? err.message : t('state.error'));
      setBusy(false);
    }
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState?.('CapsLock') ?? false);

  return (
    <div className={s.page}>
      <div className={`${s.glow} ${s.g1}`} aria-hidden="true" />
      <div className={`${s.glow} ${s.g2}`} aria-hidden="true" />
      <div className={s.grid} aria-hidden="true" />
      <main className={s.wrap}>
        <div className={s.head}>
          <div className={s.brand}>
            <BrandMark size={52} />
            <div>
              <b>{t('app.name')}</b>
              <small>{t('app.dept')}</small>
            </div>
          </div>
          <div className={s.lang} role="group" aria-label={t('login.language')}>
            {(['az', 'en'] as Lang[]).map((l) => (
              <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)} lang={l}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <form className={s.card} onSubmit={onSubmit} noValidate={false}>
          <h1>
            {t('login.title1')} <span className="grad-text">{t('login.title2')}</span>
          </h1>
          <p className={s.sub}>{t('login.sub')}</p>
          <div className={s.field}>
            <label htmlFor="u">{t('login.username')}</label>
            <input
              id="u"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              // eslint-disable-next-line jsx-a11y/no-autofocus -- giriş səhifəsinin yeganə məqsədi
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyUp={onKey}
            />
          </div>
          <div className={s.field}>
            <label htmlFor="p">{t('login.password')}</label>
            <input
              id="p"
              name="password"
              className={s.pwInput}
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyUp={onKey}
              aria-describedby={caps ? 'caps' : undefined}
            />
            <button
              type="button"
              className={s.eye}
              onClick={() => setShow((v) => !v)}
              aria-label={show ? t('login.hidePassword') : t('login.showPassword')}
              aria-pressed={show}
            >
              {show ? t('login.hide') : t('login.show')}
            </button>
          </div>
          {caps && (
            <div id="caps" className={s.caps} role="status">
              <AlertTriangle size={14} aria-hidden="true" /> {t('login.caps')}
            </div>
          )}
          <label className={s.remember}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> {t('login.remember')}
          </label>
          <button className={s.go} type="submit" disabled={busy}>
            {busy ? t('login.busy') : t('login.submit')}
          </button>
          <div className={s.err} role="alert">
            {error}
          </div>
        </form>
        <p className={s.foot}>{t('login.foot')}</p>
      </main>
    </div>
  );
}
