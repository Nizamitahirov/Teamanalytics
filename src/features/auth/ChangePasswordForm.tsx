import { useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { ApiRequestError, changeOwnPassword } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { Button } from '../../components/Button';
import f from '../../components/Form.module.css';

export const MIN_PASSWORD = 10;

/** Öz parolunu dəyiş (SPEC §10): cari parol, yeni (≥ 10 simvol, yayılmış parol yox — server yoxlayır), təkrar. */
export function ChangePasswordForm({ onDone, dark }: { onDone: () => void; dark?: boolean }) {
  const { t } = useI18n();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (next.length < MIN_PASSWORD) return setError(t('pw.tooShort', { n: MIN_PASSWORD }));
    if (next !== repeat) return setError(t('pw.mismatch'));
    setBusy(true);
    try {
      await changeOwnPassword(current, next);
      onDone();
    } catch (err) {
      setError(
        err instanceof ApiRequestError && err.code === 'network'
          ? t('login.network')
          : err instanceof Error
            ? err.message
            : t('state.error'),
      );
    } finally {
      setBusy(false);
    }
  }

  const field = (id: string, label: string, value: string, set: (v: string) => void, auto: string, hint?: string) => (
    <div className={f.field}>
      <label className={f.label} htmlFor={id} style={dark ? { color: 'rgba(255,255,255,.7)' } : undefined}>
        {label}
      </label>
      <input
        id={id}
        type="password"
        className={f.input}
        autoComplete={auto}
        value={value}
        onChange={(e) => set(e.target.value)}
        required
        aria-describedby={hint ? `${id}-h` : undefined}
        style={dark ? { background: 'rgba(255,255,255,.06)', color: '#fff', borderColor: 'rgba(255,255,255,.14)' } : undefined}
      />
      {hint && (
        <span id={`${id}-h`} className={f.hint} style={dark ? { color: 'rgba(255,255,255,.6)' } : undefined}>
          {hint}
        </span>
      )}
    </div>
  );

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: 'var(--sp-4)' }}>
      {field('pw-current', t('pw.current'), current, setCurrent, 'current-password')}
      {field('pw-new', t('pw.new'), next, setNext, 'new-password', t('pw.rules', { n: MIN_PASSWORD }))}
      {field('pw-repeat', t('pw.repeat'), repeat, setRepeat, 'new-password')}
      <div role="alert" className={f.error} style={dark ? { color: '#ff9a92' } : undefined}>
        {error}
      </div>
      <Button type="submit" variant="primary" disabled={busy}>
        <KeyRound size={16} aria-hidden="true" /> {t('pw.submit')}
      </Button>
    </form>
  );
}
