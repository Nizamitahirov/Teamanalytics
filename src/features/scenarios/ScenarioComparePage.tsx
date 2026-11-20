import { useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { Skeleton } from '../../components/Skeleton';
import { useI18n } from '../../lib/i18n';
import { useData } from '../../store';
import { scenStore, useScen } from '../../store/scenarios';
import { compare, scenarioData } from '../../../shared/scenario';
import { fmtPct } from '../../../shared/format';
import { useLive } from './logic';
import { Delta, kpiRows, Legend, PairBars } from './Comparison';
import s from './Scenarios.module.css';

/** 2–3 ssenarinin yan-yana müqayisəsi (SPEC §6.5): KPI cədvəli + kiçik çoxluqlar (hər ssenari üçün yük). */
export function ScenarioComparePage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const idsKey = params.get('ids') ?? '';
  const ready = useData((st) => st.ready);
  const live = useLive();
  const loaded = useScen((st) => st.loaded);
  const all = useScen((st) => st.scenarios);
  useEffect(() => {
    if (!scenStore.getState().loaded) void scenStore.getState().refresh();
  }, []);
  const list = useMemo(
    () =>
      idsKey
        .split(',')
        .filter(Boolean)
        .slice(0, 3)
        .map((id) => all.find((x) => x.id === id))
        .filter((x) => !!x)
        .map((sc) => ({ sc, c: compare(live, scenarioData(live, sc.changes)) })),
    [all, live, idsKey],
  );

  if (!loaded || !ready) return <Skeleton height={420} radius={16} />;
  if (!list.length)
    return (
      <p className={s.empty}>
        {t('scen.notFound')} · <Link to="/scenarios">{t('scen.back')}</Link>
      </p>
    );
  const base = list[0].c;
  return (
    <>
      <Link to="/scenarios" className={s.back}>
        <ArrowLeft size={14} aria-hidden="true" /> {t('nav.scenarios')}
      </Link>
      <h2 className={s.title} style={{ margin: '8px 0 16px' }}>
        {t('scen.compareTitleN', { n: list.length })}
      </h2>
      <section className={`${s.card} ${s.tableWrap}`} aria-labelledby="cmp-t" style={{ marginBottom: 16 }}>
        <h2 id="cmp-t" className="visually-hidden">
          {t('scen.compareTitle')}
        </h2>
        <table className={s.table}>
          <thead>
            <tr>
              <th scope="col">{t('chart.col.metric')}</th>
              <th scope="col" className={s.num}>
                {t('scen.current')}
              </th>
              {list.map(({ sc }) => (
                <th scope="col" className={s.num} key={sc.id}>
                  <Link className={s.name} to={`/scenarios/${sc.id}`}>
                    {sc.name}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {kpiRows(base).map((k, i) => (
              <tr key={k.key}>
                <th scope="row">{t(k.key)}</th>
                <td className={s.num}>{k.fmt(k.cur)}</td>
                {list.map(({ sc, c }) => {
                  const kk = kpiRows(c)[i];
                  return (
                    <td className={s.num} key={sc.id}>
                      {kk.fmt(kk.next)}
                      <br />
                      <Delta k={kk} />
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <th scope="row">{t('scen.changesN')}</th>
              <td className={s.num}>—</td>
              {list.map(({ sc }) => (
                <td className={s.num} key={sc.id}>
                  {sc.changes.length}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </section>
      <Legend />
      <div className={s.multiples}>
        {list.map(({ sc, c }) => (
          <section key={sc.id} className={s.card} aria-labelledby={`m-${sc.id}`}>
            <h2 id={`m-${sc.id}`}>{sc.name}</h2>
            <table className={s.table}>
              <thead>
                <tr>
                  <th scope="col">{t('field.name')}</th>
                  <th scope="col" className={s.barCell}>
                    {t('emp.load')}
                  </th>
                  <th scope="col" className={s.num}>
                    %
                  </th>
                </tr>
              </thead>
              <tbody>
                {c.people.slice(0, 10).map((p) => (
                  <tr key={p.name}>
                    <td>{p.name}</td>
                    <td className={s.barCell}>
                      <PairBars p={p} />
                    </td>
                    <td className={`${s.num} ${s.pct}`}>
                      {fmtPct(p.before)} → <b className={p.after > 1 ? s.worse : undefined}>{fmtPct(p.after)}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </>
  );
}
