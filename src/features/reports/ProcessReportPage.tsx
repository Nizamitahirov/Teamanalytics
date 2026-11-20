import { useMemo } from 'react';
import { useParams } from 'react-router';
import { AlertTriangle } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { useData } from '../../store';
import { Skeleton } from '../../components/Skeleton';
import { processReport } from '../../../shared/report';
import { curOwner, statusOf } from '../../../shared/model';
import { fmtFte, fmtHours, fmtPct } from '../../../shared/format';
import { ReportFrame, Section } from './ReportFrame';
import { Kpi } from './ExecutiveReportPage';
import s from './Reports.module.css';

/** Proses hesabatı (SPEC §6.7): saat, FTE, icraçılar üzrə bölgü, tək icraçı riski, işlər. */
export function ProcessReportPage() {
  const { t } = useI18n();
  const { name = '' } = useParams();
  const ready = useData((st) => st.ready);
  const tasks = useData((st) => st.data.tasks);
  const employees = useData((st) => st.data.employees);
  const settings = useData((st) => st.data.settings);
  const r = useMemo(() => processReport({ tasks, employees, settings }, name), [tasks, employees, settings, name]);
  if (!ready) return <Skeleton height={400} radius={16} />;

  return (
    <ReportFrame title={t('rep.proc.title', { name })} subtitle={r.companies.join(' · ')}>
      <Section title={t('rep.summary')}>
        <div className={s.kpis} data-print-block>
          <Kpi
            label={t('unit.hours')}
            value={fmtHours(r.hours)}
            foot={t('rep.proc.tasks', { n: r.tasks.filter((x) => !x.is_cancelled).length })}
          />
          <Kpi label="FTE" value={fmtFte(r.fte, 2)} foot={t('kpi.needFoot', { h: fmtHours(r.hours), norm: fmtHours(r.norm) })} />
          <Kpi label={t('rep.proc.owners')} value={String(r.owners.length)} foot={r.owners[0]?.name ?? '—'} />
          <Kpi label={t('kpi.cancelled')} value={fmtHours(r.cancelledHours)} foot={t('unit.hours')} />
        </div>
        {r.singleOwner && (
          <p className={s.note} data-print-block>
            <AlertTriangle size={14} aria-hidden="true" />{' '}
            {t('rep.proc.single', { owner: r.singleOwner.owner, h: fmtHours(r.singleOwner.hours) })}
          </p>
        )}
      </Section>
      <Section title={t('rep.proc.owners')}>
        <table className={s.table} data-print-block>
          <thead>
            <tr>
              <th scope="col">{t('field.name')}</th>
              <th scope="col" className={s.num}>
                {t('emp.tasks')}
              </th>
              <th scope="col" className={s.num}>
                {t('unit.hours')}
              </th>
              <th scope="col" className={s.num}>
                {t('rep.share')}
              </th>
            </tr>
          </thead>
          <tbody>
            {r.owners.map((o) => (
              <tr key={o.name}>
                <td>{o.name || '—'}</td>
                <td className={s.num}>{o.tasks}</td>
                <td className={s.num}>{fmtHours(o.hours)}</td>
                <td className={s.num}>{fmtPct(o.share)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title={t('rep.proc.list', { n: r.tasks.length })}>
        <table className={s.table}>
          <thead>
            <tr>
              <th scope="col">ID</th>
              <th scope="col">{t('field.task')}</th>
              <th scope="col">{t('field.owner')}</th>
              <th scope="col">{t('rep.status')}</th>
              <th scope="col" className={s.num}>
                {t('field.hours')}
              </th>
            </tr>
          </thead>
          <tbody>
            {r.tasks.map((x) => (
              <tr key={x.id} className={x.is_cancelled ? s.muted : undefined}>
                <td>{x.id}</td>
                <td>{x.task}</td>
                <td>{curOwner(x)}</td>
                <td>{statusOf(x)}</td>
                <td className={s.num}>{fmtHours(x.hours)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </ReportFrame>
  );
}
