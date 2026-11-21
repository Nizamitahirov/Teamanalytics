import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { fmtFte, fmtHours, fmtPct, formatNumber } from '../../../shared/format';
import { ACT_PROJECT } from '../../../shared/constants';
import type { MessageKey } from '../../../shared/i18n/az';
import s from './DashboardTiles.module.css';

const SCALE = 1.3; // 0–130%

/**
 * Tutum zonası (A1c nümunəsi kimi): ştatın istifadəsi = lazım olan ÷ mövcud.
 * Zonalar: yaxşı (≤ warn%), yüksək (warn–100%), aşılır (> 100%); marker cari dəyərdə. Rəng + mətn + ikon.
 */
export function CapacityGauge({ need, have, warn }: { need: number; have: number; warn: number }) {
  const { t } = useI18n();
  const u = have > 0 ? need / have : 0;
  const w = warn / 100;
  const level = u > 1 ? 'critical' : u > w ? 'warning' : 'good';
  const Icon = level === 'critical' ? AlertCircle : level === 'warning' ? AlertTriangle : CheckCircle2;
  const gap = have - need;
  const pos = (x: number) => `${(Math.min(x, SCALE) / SCALE) * 100}%`;
  return (
    <div className={s.gauge}>
      <div className={s.gHead}>
        <div>
          <div className={s.gValue}>{fmtPct(u)}</div>
          <div className={s.gLabel}>{t('dash.cap.util')}</div>
        </div>
        <span className={`${s.badge} ${s[level]}`}>
          <Icon size={14} aria-hidden="true" /> {t(`level.${level}` as MessageKey)}
        </span>
      </div>
      <div
        className={s.track}
        role="meter"
        aria-label={t('dash.cap.util')}
        aria-valuemin={0}
        aria-valuemax={130}
        aria-valuenow={Math.round(u * 100)}
      >
        <span className={s.zGood} style={{ width: `calc(${pos(w)} - 3px)` }} />
        <span className={s.zWarn} style={{ left: pos(w), width: `calc(${pos(1)} - ${pos(w)} - 3px)` }} />
        <span className={s.zCrit} style={{ left: pos(1), width: `calc(100% - ${pos(1)})` }} />
        <i className={s.marker} style={{ left: pos(u) }} aria-hidden="true" />
      </div>
      <div className={s.ticks} aria-hidden="true">
        <span style={{ left: 0 }}>0%</span>
        <span style={{ left: pos(w) }}>{warn}%</span>
        <span style={{ left: pos(1) }}>100%</span>
        <b style={{ left: pos(u) }}>{fmtPct(u)}</b>
      </div>
      <p className={s.gFoot}>
        {gap >= 0 ? t('dash.cap.reserve', { v: fmtFte(gap) }) : t('dash.cap.shortage', { v: fmtFte(-gap) })}
      </p>
    </div>
  );
}

type Cell = { company: string; activity: string; hours: number; fte: number; people: number; tasks: number };

/** Şirkət × fəaliyyət forması — kafel: iri saat, ümumi saatdakı pay zolağı, ştat/nəfər/tapşırıq. */
export function CompanyTiles({ cells, colorOf }: { cells: Cell[]; colorOf: (company: string, i: number) => string }) {
  const { t } = useI18n();
  const total = cells.reduce((a, c) => a + c.hours, 0) || 1;
  return (
    <div className={s.tiles}>
      {cells.map((c, i) => {
        const share = c.hours / total;
        const color = colorOf(c.company, i);
        const empty = c.hours <= 0;
        return (
          <article
            key={`${c.company}-${c.activity}`}
            className={`${s.tile} ${empty ? s.tileEmpty : ''}`}
            style={{ '--tile': color } as React.CSSProperties}
          >
            <header className={s.tHead}>
              <span className={s.company}>
                <i aria-hidden="true" />
                {c.company}
              </span>
              <span className={s.activity}>{c.activity === ACT_PROJECT ? t('dash.project') : c.activity}</span>
            </header>
            <div className={s.tValue}>
              {empty ? '—' : fmtHours(c.hours)}
              {!empty && <small>{t('unit.hours')}</small>}
            </div>
            <div className={s.share} aria-hidden="true">
              <span style={{ width: `${Math.max(share * 100, empty ? 0 : 2)}%` }} />
            </div>
            <dl className={s.stats}>
              <div>
                <dt>{t('dash.mx.sharePct')}</dt>
                <dd>{fmtPct(share)}</dd>
              </div>
              <div>
                <dt title={t('kpi.need')}>{t('dash.mx.fte')}</dt>
                <dd>{fmtFte(c.fte, 2)}</dd>
              </div>
              <div>
                <dt>{t('dash.mx.people')}</dt>
                <dd>{formatNumber(c.people)}</dd>
              </div>
              <div>
                <dt>{t('dash.mx.tasks')}</dt>
                <dd>{formatNumber(c.tasks)}</dd>
              </div>
            </dl>
          </article>
        );
      })}
    </div>
  );
}
