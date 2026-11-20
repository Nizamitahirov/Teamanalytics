import { LogOut } from 'lucide-react';
import { BrandMark } from '../../components/BrandMark';
import { useI18n } from '../../lib/i18n';
import { toast } from '../../lib/toast';
import { useAuth } from '../../app/auth';
import { ChangePasswordForm } from './ChangePasswordForm';
import s from './LoginPage.module.css';

/** İlkin (Ecosystem/Ecosystem) və ya admin tərəfindən sıfırlanmış parolla girişdən sonra — dəyişmədən davam etmək olmur. */
export function ForcedPasswordPage({ name }: { name: string }) {
  const { t } = useI18n();
  const { refresh, logout } = useAuth();
  return (
    <div className={s.page}>
      <div className={`${s.glow} ${s.g1}`} aria-hidden="true" />
      <div className={`${s.glow} ${s.g2}`} aria-hidden="true" />
      <main className={s.wrap}>
        <div className={s.head}>
          <div className={s.brand}>
            <BrandMark size={52} />
            <div>
              <b>{t('app.name')}</b>
              <small>{name}</small>
            </div>
          </div>
        </div>
        <div className={s.card}>
          <h1>{t('pw.forcedTitle')}</h1>
          <p className={s.sub}>{t('pw.forcedBody')}</p>
          <ChangePasswordForm
            dark
            onDone={() => {
              toast(t('pw.changed'));
              void refresh();
            }}
          />
        </div>
        <p className={s.foot}>
          <button
            type="button"
            onClick={() => void logout()}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              display: 'inline-flex',
              gap: 6,
              alignItems: 'center',
            }}
          >
            <LogOut size={14} aria-hidden="true" /> {t('auth.logout')}
          </button>
        </p>
      </main>
    </div>
  );
}
