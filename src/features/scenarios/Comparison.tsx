import { useState } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../../lib/i18n';
import type { Comparison as Cmp, PersonDiff } from '../../../shared/scenario';
import { fmtFte, fmtHours, fmtPct, fmtSigned, formatNumber } from '../../../shared/format';
import type { MessageKey } from '../../../shared/i18n/az';
import s from './Scenarios.module.css';

type Kpi = { key: MessageKey; cur: number; next: number; fmt: (n: number) => string; d: number; lowerIsBetter?: boolean };

export function kpiRows(c: Cmp): Kpi[] {
  return [
    { key: 'kpi.volume', cur: c.cur.totalHours, next: c.next.totalHours, fmt: fmtHours, d: 0, lowerIsBetter: true },
    { key: 'kpi.need', cur: c.cur.fteNeed, next: c.next.fteNeed, fmt: (n) => fmtFte(n), d: 1, lowerIsBetter: true },
    { key: 'kpi.have', cur: c.cur.fteHave, next: c.next.fteHave, fmt: (n) => fmtFte(n), d: 1 },
    { key: 'scen.kpi.gap', cur: c.cur.gap, next: c.next.gap, fmt: (n) => fmtSigned(n, 1), d: 1 },
    { key: 'kpi.over', cur: c.cur.over.length, next: c.next.over.length, fmt: (n) => formatNumber(n), d: 0, lowerIsBetter: true },
    { key: 'kpi.cancelled', cur: c.cur.cancelled.hours, next: c.next.cancelled.hours, fmt: fmtHours, d: 0 },
  ];
}

/** Δ-nı rənglə yox, işarə + mətnlə də göstərir; rəng yalnız əlavə ipucudur. */
export function Delta({ k }: { k: Kpi }) {
  const { t } = useI18n();
  const diff = k.next - k.cur;
  if (Math.abs(diff) < (k.d ? 0.05 : 0.5)) return <span className={s.sub}>{t('scen.noChange')}</span>;
  const good = k.lowerIsBetter === undefined ? null : k.lowerIsBetter ? diff < 0 : diff > 0;
  return (
    <span className={good == null ? s.sub : good ? s.better : s.worse}>
      {fmtSigned(diff, k.d)}
      {good != null && <span className="visually-hidden"> ({t(good ? 'scen.better' : 'scen.worse')})</span>}
    </span>
  );
}

const SCALE = 1.5; // 0–150%
const w = (load: number) => `${(Math.min(SCALE, Number.isFinite(load) ? load : SCALE) / SCALE) * 100}%`;

export function PairBars({ p }: { p: PersonDiff }) {
  return (
    <div className={s.bars} aria-hidden="true">
      <span className={s.swBefore} style={{ width: w(p.before) }} />
      <span className={s.swNow} style={{ width: w(p.after) }} />
      <i style={{ left: `${(1 / SCALE) * 100}%` }} />
    </div>
  );
}

export function Legend() {
  const { t } = useI18n();
  return (
    <p className={s.legend}>
      <span>
        <i className={s.swBefore} aria-hidden="true" /> {t('scen.current')}
      </span>
      <span>
        <i className={s.swNow} aria-hidden="true" /> {t('scen.scenario')}
      </span>
      <span>
        <i style={{ width: 0, borderLeft: '1px dashed var(--muted)', height: 10, borderRadius: 0 }} aria-hidden="true" />{' '}
        {t('chart.load.norm')}
      </span>
    </p>
  );
}

/** Cari vs ssenari: KPI-lar yan-yana, qoşa yük barları, dəyişən əməkdaşlar (SPEC §6.5). */
export function Comparison({ c }: { c: Cmp }) {
  const { t } = useI18n();
  const [all, setAll] = useState(false);
  const rows = all ? c.people : c.changed.length ? c.changed : c.people.slice(0, 8);
  return (
    <>
      <section className={s.card} aria-labelledby="cmp-kpi">
        <h2 id="cmp-kpi">{t('scen.compareTitle')}</h2>
        <dl className={s.kpis}>
          {kpiRows(c).map((k) => (
            <div key={k.key} className={s.kpi} data-kpi={k.key}>
              <dt>{t(k.key)}</dt>
              <dd>
                <div className={s.kpiVal}>
                  <b>{k.fmt(k.next)}</b>
                  <s>
                    {t('scen.was')} {k.fmt(k.cur)}
                  </s>
                </div>
                <Delta k={k} />
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={s.card} aria-labelledby="cmp-load">
        <div className={s.cardHead}>
          <h2 id="cmp-load">{t(c.changed.length && !all ? 'scen.changedPeople' : 'scen.allPeople')}</h2>
          {c.changed.length > 0 && (
            <button
              type="button"
              className={s.name}
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={() => setAll((v) => !v)}
            >
              {t(all ? 'scen.showChanged' : 'scen.showAll', { n: c.people.length })}
            </button>
          )}
        </div>
        <Legend />
        <div className={s.tableWrap}>
          <table className={s.table} data-testid="scen-loads">
            <thead>
              <tr>
                <th scope="col">{t('field.name')}</th>
                <th scope="col" className={s.barCell}>
                  {t('emp.load')}
                </th>
                <th scope="col" className={s.num}>
                  {t('scen.current')}
                </th>
                <th scope="col" className={s.num}>
                  {t('scen.scenario')}
                </th>
                <th scope="col" className={s.num}>
                  {t('unit.hours')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.name} className={c.changed.includes(p) ? s.changedRow : ''} data-person={p.name}>
                  <td>
                    <Link className={s.name} to={`/employees/${encodeURIComponent(p.name)}`}>
                      {p.name}
                    </Link>
                  </td>
                  <td className={s.barCell}>
                    <PairBars p={p} />
                  </td>
                  <td className={`${s.num} ${s.pct}`}>{fmtPct(p.before)}</td>
                  <td className={`${s.num} ${s.pct}`}>
                    <b className={p.after > 1 ? s.worse : undefined}>{fmtPct(p.after)}</b>
                  </td>
                  <td className={s.num}>
                    {fmtHours(p.hoursBefore)} → {fmtHours(p.hoursAfter)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
