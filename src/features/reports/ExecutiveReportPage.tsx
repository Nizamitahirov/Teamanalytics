import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useI18n } from '../../lib/i18n';
import { useData } from '../../store';
import { Skeleton } from '../../components/Skeleton';
import { lightTheme } from '../../charts/theme';
import { loadOption } from '../../charts/options/load';
import { sankeyOption } from '../../charts/options/sankey';
import { waterfallOption } from '../../charts/options/waterfall';
import { paretoOption } from '../../charts/options/pareto';
import { loadBars, pareto, staffTable, transferFlows, waterfall } from '../../../shared/dashboard';
import { executiveReport } from '../../../shared/report';
import type { Filters } from '../../../shared/metrics';
import { fmtFte, fmtHours, fmtPct, fmtSigned, formatNumber } from '../../../shared/format';
import { ReportChart, ReportFrame, Section } from './ReportFrame';
import s from './Reports.module.css';

/**
 * Rəhbərlik hesabatı (SPEC §6.7): A4 üfüqi, 2–4 səhifə. 1) titul + xülasə + şərh + risklər,
 * 2) yük + waterfall, 3) Sankey + Pareto, 4) əlavə: ştat cədvəli. Qrafiklər vektor (SVG), çap rəngləri.
 */
export function ExecutiveReportPage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const ready = useData((st) => st.ready);
  const tasks = useData((st) => st.data.tasks);
  const employees = useData((st) => st.data.employees);
  const settings = useData((st) => st.data.settings);
  const log = useData((st) => st.data.log);
  const company = params.get('company') ?? '';
  const activity = params.get('activity') ?? '';
  const filters: Filters = useMemo(() => ({ company: company || null, activity: activity || null }), [company, activity]);
  const data = useMemo(() => {
    const input = { tasks, employees, settings };
    const r = executiveReport(input, log, filters);
    const th = lightTheme;
    const levels = new Map(r.m.loads.map((l) => [l.name, l.level]));
    return {
      r,
      staff: staffTable(input, r.m, log, { filters }),
      load: loadOption(loadBars(r.m), settings.warn, th, t),
      wf: waterfallOption(waterfall(input, filters), r.m.norm, th, t),
      sankey: sankeyOption(transferFlows(input, { filters }), (n) => levels.get(n) ?? 'idle', th, t),
      pareto: paretoOption(pareto(r.m, input, { filters }), th, t),
    };
  }, [tasks, employees, settings, log, filters, t]);

  if (!ready) return <Skeleton height={400} radius={16} />;
  const { r, staff } = data;
  const m = r.m;
  const filterLabel = [company || t('rep.allCompanies'), activity || t('rep.allActivities')].join(' · ');

  return (
    <ReportFrame
      title={t('rep.exec.title')}
      subtitle={t('page.dashboard')}
      meta={
        <div>
          <dt>{t('rep.filters')}</dt>
          <dd>{filterLabel}</dd>
        </div>
      }
    >
      <Section title={t('rep.summary')}>
        <div className={s.kpis} data-print-block>
          <Kpi
            label={t('kpi.volume')}
            value={`${fmtHours(m.totalHours)} ${t('unit.hours')}`}
            foot={t('kpi.volumeFoot', { n: formatNumber(m.activeTasks) })}
          />
          <Kpi
            label={t('kpi.need')}
            value={`${fmtFte(m.fteNeed)} FTE`}
            foot={t('kpi.needFoot', { h: fmtHours(m.totalHours), norm: formatNumber(m.norm) })}
          />
          <Kpi label={t('kpi.have')} value={`${fmtFte(m.fteHave)} FTE`} foot={t('kpi.haveFoot', { n: m.people.length })} />
          <Kpi
            label={m.gap >= 0 ? t('kpi.reserve') : t('kpi.shortage')}
            value={`${fmtSigned(m.gap)} FTE`}
            foot={
              m.gap >= 0 ? t('kpi.gapFree', { h: fmtHours(m.gap * m.norm) }) : t('kpi.gapExtra', { h: fmtHours(-m.gap * m.norm) })
            }
          />
        </div>
        <p className={s.note} data-testid="rep-norm" data-print-block>
          {t('dash.normNote', {
            gross: formatNumber(m.normGross),
            vac: formatNumber(m.vacationHours),
            days: formatNumber(m.vacationDays),
            norm: formatNumber(m.norm),
          })}
        </p>
        <ol className={s.sentences} data-testid="rep-sentences" data-print-block>
          {r.sentences.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ol>
      </Section>

      <Section title={t('rep.risks')}>
        <div className={s.grid3} data-print-block>
          <div>
            <h3 className={s.h3}>{t('rep.overList', { n: r.risks.over.length })}</h3>
            {r.risks.over.length ? (
              <ul className={s.list}>
                {r.risks.over.map((o) => (
                  <li key={o.name}>
                    <b>{o.name}</b> — <span className={s.crit}>{fmtPct(o.load)}</span>{' '}
                    <span className={s.muted}>
                      ({fmtHours(o.hours)} {t('unit.hours')})
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={s.muted}>{t('rep.none')}</p>
            )}
          </div>
          <div>
            <h3 className={s.h3}>{t('rep.singleOwner', { n: r.risks.singleOwner.length })}</h3>
            {r.risks.singleOwner.length ? (
              <ul className={s.list}>
                {r.risks.singleOwner.slice(0, 7).map((x) => (
                  <li key={x.process}>
                    <b>{x.process}</b> — {x.owner} <span className={s.muted}>({fmtHours(x.hours)})</span>
                  </li>
                ))}
                {r.risks.singleOwner.length > 7 && (
                  <li className={s.muted}>{t('picker.more', { n: r.risks.singleOwner.length - 7 })}</li>
                )}
              </ul>
            ) : (
              <p className={s.muted}>{t('rep.none')}</p>
            )}
          </div>
          <div>
            <h3 className={s.h3}>{t('rep.health', { n: r.risks.health.reduce((a, x) => a + x.n, 0) })}</h3>
            {r.risks.health.length ? (
              <ul className={s.list}>
                {r.risks.health.map((x) => (
                  <li key={x.kind}>
                    {t(`health.k.${x.kind}`)}: <span className={s.warn}>{x.n}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={s.muted}>{t('rep.none')}</p>
            )}
          </div>
        </div>
      </Section>

      <Section title={t('rep.charts')} page>
        <div className={s.grid2}>
          <ReportChart title={t('dash.w.load')} spec={data.load} />
          <ReportChart title={t('dash.w.waterfall')} spec={data.wf} />
        </div>
      </Section>
      <Section title={t('rep.flows')} page>
        <div className={s.grid2}>
          <ReportChart title={t('dash.w.sankey')} spec={data.sankey} height={Math.min(560, data.sankey.height)} />
          <ReportChart title={t('dash.w.pareto')} spec={data.pareto} height={Math.min(560, data.pareto.height)} />
        </div>
      </Section>

      <Section title={t('rep.appendix')} page>
        <table className={s.table} data-testid="rep-staff">
          <thead>
            <tr>
              <th scope="col">{t('field.name')}</th>
              <th scope="col">{t('field.company')}</th>
              <th scope="col">{t('field.activity')}</th>
              <th scope="col" className={s.num}>
                {t('field.fte')}
              </th>
              <th scope="col" className={s.num}>
                {t('emp.tasks')}
              </th>
              <th scope="col" className={s.num}>
                {t('unit.hours')}
              </th>
              <th scope="col" className={s.num}>
                {t('emp.capacity')}
              </th>
              <th scope="col" className={s.num}>
                {t('rep.free')}
              </th>
              <th scope="col" className={s.num}>
                {t('rep.load')}
              </th>
            </tr>
          </thead>
          <tbody>
            {staff.map((x) => (
              <tr key={x.name}>
                <td>{x.name}</td>
                <td>{x.company}</td>
                <td>{x.activity}</td>
                <td className={s.num}>{x.isGroup ? '—' : fmtFte(x.fte, 2)}</td>
                <td className={s.num}>{x.tasks}</td>
                <td className={s.num}>{fmtHours(x.hours)}</td>
                <td className={s.num}>{x.isGroup ? '—' : fmtHours(x.cap)}</td>
                <td className={s.num}>{x.isGroup ? '—' : fmtHours(x.free)}</td>
                <td
                  className={`${s.num} ${!x.isGroup && x.load > 1 ? s.crit : !x.isGroup && x.load > settings.warn / 100 ? s.warn : ''}`}
                >
                  {x.isGroup ? '—' : fmtPct(x.load)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </ReportFrame>
  );
}

export function Kpi({ label, value, foot }: { label: string; value: string; foot: string }) {
  return (
    <div className={s.kpi}>
      <p className={s.kpiLabel}>{label}</p>
      <p className={s.kpiValue}>{value}</p>
      <p className={s.kpiFoot}>{foot}</p>
    </div>
  );
}
