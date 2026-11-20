import { useMemo } from 'react';
import { useParams } from 'react-router';
import { useI18n } from '../../lib/i18n';
import { formatDate } from '../../lib/dates';
import { useData } from '../../store';
import { Skeleton } from '../../components/Skeleton';
import { employeeReport } from '../../../shared/report';
import { fmtFte, fmtHours, fmtPct, formatNumber } from '../../../shared/format';
import { ReportFrame, Section } from './ReportFrame';
import { Kpi } from './ExecutiveReportPage';
import s from './Reports.module.css';

/** Əməkdaş kartı (SPEC §6.7) — çap / PDF. */
export function EmployeeReportPage() {
  const { t } = useI18n();
  const { name = '' } = useParams();
  const ready = useData((st) => st.ready);
  const tasks = useData((st) => st.data.tasks);
  const employees = useData((st) => st.data.employees);
  const settings = useData((st) => st.data.settings);
  const log = useData((st) => st.data.log);
  const r = useMemo(() => employeeReport({ tasks, employees, settings }, log, name), [tasks, employees, settings, log, name]);
  if (!ready) return <Skeleton height={400} radius={16} />;
  const { m, emp, load } = r;
  const active = r.tasks.filter((x) => x.mine && !x.t.is_cancelled);

  return (
    <ReportFrame title={t('rep.emp.title', { name })} subtitle={emp ? `${emp.company} · ${emp.activity}` : t('rep.emp.unknown')}>
      <Section title={t('rep.summary')}>
        <div className={s.kpis} data-print-block>
          <Kpi label={t('rep.load')} value={load ? fmtPct(load.load) : '0%'} foot={t(`level.${load?.level ?? 'idle'}`)} />
          <Kpi label={t('unit.hours')} value={fmtHours(load?.hours ?? 0)} foot={t('rep.emp.activeTasks', { n: active.length })} />
          <Kpi
            label={t('emp.capacity')}
            value={fmtHours(load?.cap ?? m.norm * (emp?.fte ?? 1))}
            foot={t('emp.capFormula', {
              gross: formatNumber(m.normGross),
              vac: formatNumber(m.vacationHours),
              norm: formatNumber(m.norm),
              fte: fmtFte(emp?.fte ?? 1, 2),
            })}
          />
          <Kpi
            label={t('field.fte')}
            value={fmtFte(emp?.fte ?? 1, 2)}
            foot={emp?.active === false ? t('rep.emp.inactive') : t('rep.emp.active')}
          />
        </div>
      </Section>
      <Section title={t('rep.emp.tasks', { n: r.tasks.length })}>
        <table className={s.table} data-testid="rep-emp-tasks">
          <thead>
            <tr>
              <th scope="col">ID</th>
              <th scope="col">{t('field.process')}</th>
              <th scope="col">{t('field.task')}</th>
              <th scope="col">{t('rep.status')}</th>
              <th scope="col" className={s.num}>
                {t('field.hours')}
              </th>
            </tr>
          </thead>
          <tbody>
            {r.tasks.map(({ t: x, status, mine }) => (
              <tr key={x.id} className={!mine || x.is_cancelled ? s.muted : undefined}>
                <td>{x.id}</td>
                <td>{x.process}</td>
                <td>{x.task}</td>
                <td>{mine ? status : t('rep.emp.handedOver', { to: x.owner_after })}</td>
                <td className={s.num}>{fmtHours(x.hours)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      {r.transfers.length > 0 && (
        <Section title={t('rep.emp.transfers')}>
          <ul className={s.list} data-print-block>
            {r.transfers.map((l) => (
              <li key={l.id ?? l.ts}>
                {formatDate(l.ts)} — {l.task_label}: {l.from} → {l.to}
                {l.comment ? ` («${l.comment}»)` : ''}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </ReportFrame>
  );
}
