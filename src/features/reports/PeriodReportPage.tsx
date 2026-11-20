import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useI18n } from '../../lib/i18n';
import { fetchSnapshots, isoDay, type SnapshotData } from '../../lib/snapshots';
import { Skeleton } from '../../components/Skeleton';
import { fmtFte, fmtHours, fmtPct, fmtSigned } from '../../../shared/format';
import type { Kpi } from '../../../shared/snapshot';
import type { MessageKey } from '../../../shared/i18n/az';
import { ReportFrame, Section } from './ReportFrame';
import f from '../../components/Form.module.css';
import s from './Reports.module.css';

const ROWS: { key: MessageKey; get: (k: Kpi) => number; fmt: (n: number) => string; d: number }[] = [
  { key: 'kpi.volume', get: (k) => k.hours, fmt: fmtHours, d: 0 },
  { key: 'kpi.need', get: (k) => k.fteNeed, fmt: (n) => fmtFte(n, 2), d: 2 },
  { key: 'kpi.have', get: (k) => k.fteHave, fmt: (n) => fmtFte(n, 2), d: 2 },
  { key: 'kpi.over', get: (k) => k.over, fmt: String, d: 0 },
  { key: 'kpi.transfers', get: (k) => k.transfers, fmt: String, d: 0 },
  { key: 'kpi.cancelled', get: (k) => k.cancelledHours, fmt: fmtHours, d: 0 },
  { key: 'kpi.opt', get: (k) => k.optPotential, fmt: fmtHours, d: 0 },
  { key: 'opt.realized', get: (k) => k.optRealized, fmt: fmtHours, d: 0 },
];

/** Dövr müqayisəsi (SPEC §6.7): iki gündəlik snapshot arasında KPI-lar və əməkdaş yükü. */
export function PeriodReportPage() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const [list, setList] = useState<SnapshotData[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetchSnapshots(isoDay(new Date(Date.now() - 400 * 864e5)), isoDay(new Date()))
      .then((r) => alive && setList(r))
      .catch(() => alive && setList([]));
    return () => {
      alive = false;
    };
  }, []);
  const dates = useMemo(() => (list ?? []).map((x) => x.date), [list]);
  const a = list?.find((x) => x.date === params.get('from')) ?? list?.[0];
  const b = list?.find((x) => x.date === params.get('to')) ?? list?.[list.length - 1];
  const set = (k: string, v: string) => setParams((p) => ({ ...Object.fromEntries(p), [k]: v }), { replace: true });
  const people = useMemo(() => {
    if (!a || !b) return [];
    const names = [...new Set([...Object.keys(a.loads), ...Object.keys(b.loads)])];
    return names
      .map((n) => ({ n, x: a.loads[n] ?? 0, y: b.loads[n] ?? 0 }))
      .sort((p, q) => Math.abs(q.y - q.x) - Math.abs(p.y - p.x) || p.n.localeCompare(q.n, 'az'));
  }, [a, b]);

  if (!list) return <Skeleton height={300} radius={16} />;
  const picker = (
    <div className={s.filters} data-print-hide style={{ marginTop: 16 }}>
      {(['from', 'to'] as const).map((k) => (
        <select
          key={k}
          className={f.input}
          aria-label={t(k === 'from' ? 'rep.period.a' : 'rep.period.b')}
          value={(k === 'from' ? a : b)?.date ?? ''}
          onChange={(e) => set(k, e.target.value)}
        >
          {dates.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      ))}
    </div>
  );
  const table = (title: string, x: Kpi, y: Kpi) => (
    <table className={s.table} data-print-block>
      <thead>
        <tr>
          <th scope="col">{title}</th>
          <th scope="col" className={s.num}>
            {a?.date}
          </th>
          <th scope="col" className={s.num}>
            {b?.date}
          </th>
          <th scope="col" className={s.num}>
            Δ
          </th>
        </tr>
      </thead>
      <tbody>
        {ROWS.map((r) => (
          <tr key={r.key}>
            <th scope="row">{t(r.key)}</th>
            <td className={s.num}>{r.fmt(r.get(x))}</td>
            <td className={s.num}>{r.fmt(r.get(y))}</td>
            <td className={s.num}>{Math.abs(r.get(y) - r.get(x)) < 1e-9 ? '—' : fmtSigned(r.get(y) - r.get(x), r.d)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ReportFrame title={t('rep.period.title')} subtitle={a && b ? `${a.date} → ${b.date}` : undefined}>
      {list.length < 2 || !a || !b ? (
        <p className={s.muted} style={{ marginTop: 16 }} data-testid="period-empty">
          {t('rep.period.empty', { n: list.length })}
        </p>
      ) : (
        <>
          {picker}
          <Section title={t('rep.summary')}>
            {table(t('rep.period.total'), a.total, b.total)}
            {a.norm !== b.norm && (
              <p className={s.note}>{t('rep.period.normChanged', { a: fmtHours(a.norm), b: fmtHours(b.norm) })}</p>
            )}
          </Section>
          {Object.keys(b.byCompany).map((c) =>
            a.byCompany[c] ? (
              <Section key={c} title={c}>
                {table(c, a.byCompany[c], b.byCompany[c])}
              </Section>
            ) : null,
          )}
          <Section title={t('rep.period.people')}>
            <table className={s.table} data-testid="period-people">
              <thead>
                <tr>
                  <th scope="col">{t('field.name')}</th>
                  <th scope="col" className={s.num}>
                    {a.date}
                  </th>
                  <th scope="col" className={s.num}>
                    {b.date}
                  </th>
                  <th scope="col" className={s.num}>
                    Δ
                  </th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.n}>
                    <td>{p.n}</td>
                    <td className={`${s.num} ${p.x > 1 ? s.crit : ''}`}>{fmtPct(p.x)}</td>
                    <td className={`${s.num} ${p.y > 1 ? s.crit : ''}`}>{fmtPct(p.y)}</td>
                    <td className={s.num}>{Math.abs(p.y - p.x) < 1e-4 ? '—' : `${fmtSigned((p.y - p.x) * 100, 0)} p.p.`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        </>
      )}
    </ReportFrame>
  );
}
