import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Bell } from 'lucide-react';
import { IconButton } from '../../components/Button';
import { useI18n } from '../../lib/i18n';
import { scenStore, useScen } from '../../store/scenarios';
import { formatDateTime } from '../../lib/dates';
import s from './Scenarios.module.css';

/** Bildirişlər mərkəzi (SPEC §5, §2): təsdiq sorğuları və cavabları. Sayğac oxunmamışları göstərir. */
export function NotificationsBell({ className }: { className?: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const list = useScen((st) => st.notifications);
  const unread = list.filter((n) => !n.read).length;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scenStore.getState().loaded) void scenStore.getState().refresh();
  }, []);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={`${s.bellWrap} ${className ?? ''}`} ref={ref}>
      <IconButton
        label={unread ? t('notif.unread', { n: unread }) : t('top.notifications')}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
        data-testid="bell"
      >
        <Bell size={18} aria-hidden="true" />
      </IconButton>
      {unread > 0 && (
        <span className={s.bellCount} aria-hidden="true">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
      {open && (
        <div className={s.notifPanel} role="region" aria-label={t('top.notifications')}>
          <div className={s.notifHead}>
            <h2>{t('top.notifications')}</h2>
            {unread > 0 && (
              <button
                type="button"
                className={s.name}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}
                onClick={() => void scenStore.getState().markRead()}
              >
                {t('notif.markAll')}
              </button>
            )}
          </div>
          {!list.length ? (
            <p className={s.empty}>{t('notif.empty')}</p>
          ) : (
            <ul className={s.notifList}>
              {list.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`${s.notif} ${n.read ? '' : s.unread}`}
                    onClick={() => {
                      setOpen(false);
                      void scenStore.getState().markRead([n.id]);
                      navigate(n.link);
                    }}
                  >
                    {n.text}
                    <div className={s.sub}>{formatDateTime(n.ts)}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
