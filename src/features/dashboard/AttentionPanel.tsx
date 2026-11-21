import { Link } from 'react-router';
import { AlertCircle, ChevronRight, CircleCheck, ShieldAlert } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import type { Metrics } from '../../../shared/metrics';
import { fmtHours, fmtPct } from '../../../shared/format';
import { RebalanceButton } from '../scenarios/RebalanceButton';
import s from './AttentionPanel.module.css';

/**
 * Halqa göstərici (Kinetic/Nova nümunələri kimi): dəyər mərkəzdə mətnlə, rəng tək məna daşıyıcısı deyil.
 * ratio > 1 — kritik rəng.
 */
export function Ring({ ratio, label, size = 48 }: { ratio: number; label: string; size?: number }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, ratio));
  return (
    <div
      className={s.ring}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ratio * 100)}
      title={`${label}: ${fmtPct(ratio)}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className={s.track} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className={ratio > 1 ? s.barOver : s.bar}
          strokeDasharray={`${c * v} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span>{fmtPct(ratio)}</span>
    </div>
  );
}

const MAX = 5;

/** "Diqqət tələb edir" (Roster nümunəsindəki "Needs your review" kimi): normanı aşanlar + data sağlamlığı + balanslama. */
export function AttentionPanel({ m, healthCount }: { m: Metrics; healthCount: number }) {
  const { t } = useI18n();
  const total = m.over.length + (healthCount > 0 ? 1 : 0);
  return (
    <aside className={s.panel} aria-labelledby="attn-h">
      <div className={s.head}>
        <h2 id="attn-h">{t('dash.attention')}</h2>
        {total > 0 && <span className={s.count}>{total}</span>}
      </div>
      {m.over.length === 0 && healthCount === 0 ? (
        <p className={s.empty}>
          <CircleCheck size={18} aria-hidden="true" /> {t('dash.attentionEmpty')}
        </p>
      ) : (
        <>
          {m.over.length > 0 && (
            <>
              <h3 className={s.sub}>{t('dash.overList')}</h3>
              <ul className={s.list}>
                {m.over.slice(0, MAX).map((o) => (
                  <li key={o.name}>
                    <Link to={`/employees/${encodeURIComponent(o.name)}`} className={s.item}>
                      <span className={s.avatar} aria-hidden="true">
                        {o.name.charAt(0)}
                      </span>
                      <span className={s.who}>
                        <b>{o.name}</b>
                        <small>{t('dash.overBy', { h: fmtHours(o.hours - o.cap) })}</small>
                      </span>
                      <span className={s.load}>
                        <AlertCircle size={13} aria-hidden="true" />
                        {fmtPct(o.load)}
                      </span>
                      <ChevronRight size={16} className={s.chev} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
              {m.over.length > MAX && (
                <Link to="/employees?level=critical" className={s.more}>
                  {t('dash.attentionAll', { n: m.over.length })}
                </Link>
              )}
              <div className={s.action}>
                <RebalanceButton />
              </div>
            </>
          )}
          {healthCount > 0 && (
            <Link to="/health" className={s.health} data-testid="health-link">
              <ShieldAlert size={16} aria-hidden="true" /> {t('health.dashLink', { n: healthCount })}
              <ChevronRight size={16} className={s.chev} aria-hidden="true" />
            </Link>
          )}
        </>
      )}
    </aside>
  );
}
