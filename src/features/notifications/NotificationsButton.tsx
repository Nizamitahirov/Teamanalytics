import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Bell, CheckCheck } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { formatDateTime } from '../../lib/dates';
import { scenarioActions, useData } from '../../store';
import { IconButton } from '../../components/Button';
import s from './Notifications.module.css';

/** Bildirişlər mərkəzi (SPEC §2 təsdiq axını): oxunmamış sayı, siyahı, keçid, "hamısını oxunmuş et". */
export function NotificationsButton() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const list = useData((st) => st.notifications);
  const unread = list.filter((n) => !n.read).length;
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onClick = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const label = unread ? t('notif.labelN', { n: unread }) : t('top.notifications');
  return (
    <div className={s.wrap} ref={box}>
      <IconButton label={label} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((v) => !v)}>
        <Bell size={18} aria-hidden="true" />
        {unread > 0 && (
          <span className={s.badge} aria-hidden="true">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </IconButton>
      {open && (
        <div className={s.panel} role="region" aria-label={t('top.notifications')}>
          <div className={s.head}>
            <h2>{t('top.notifications')}</h2>
            {unread > 0 && (
              <button type="button" className={s.all} onClick={() => void scenarioActions.markRead('all').catch(() => undefined)}>
                <CheckCheck size={15} aria-hidden="true" /> {t('notif.readAll')}
              </button>
            )}
          </div>
          {list.length === 0 ? (
            <p className={s.empty}>{t('notif.empty')}</p>
          ) : (
            <ul className={s.list}>
              {list.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`${s.item} ${n.read ? '' : s.unread}`}
                    onClick={() => {
                      setOpen(false);
                      if (!n.read) void scenarioActions.markRead([n.id]).catch(() => undefined);
                      if (n.link.startsWith('/')) navigate(n.link);
                    }}
                  >
                    <span className={s.kind}>{t(`notif.k.${n.kind}`)}</span>
                    <span>{n.text}</span>
                    <small>{formatDateTime(n.ts)}</small>
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
