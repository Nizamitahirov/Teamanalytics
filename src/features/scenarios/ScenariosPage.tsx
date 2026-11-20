import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { FlaskConical, GitCompare, Plus } from 'lucide-react';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { Skeleton } from '../../components/Skeleton';
import { useI18n } from '../../lib/i18n';
import { useCan } from '../../app/useCan';
import { useData } from '../../store';
import { scenStore, useScen } from '../../store/scenarios';
import { impactOf, type Scenario, type ScenarioStatus } from '../../../shared/scenario';
import { fmtSigned } from '../../../shared/format';
import { formatDateTime } from '../../lib/dates';
import type { MessageKey } from '../../../shared/i18n/az';
import { useLive } from './logic';
import { NewScenarioDialog } from './NewScenarioDialog';
import s from './Scenarios.module.css';

const TABS: { id: string; statuses: ScenarioStatus[]; label: MessageKey }[] = [
  { id: 'active', statuses: ['draft', 'pending'], label: 'scen.tab.active' },
  { id: 'applied', statuses: ['applied'], label: 'scen.tab.applied' },
  { id: 'archived', statuses: ['archived'], label: 'scen.tab.archived' },
];

export function StatusPill({ status }: { status: ScenarioStatus }) {
  const { t } = useI18n();
  return <span className={`${s.status} ${s[`status_${status}`] ?? ''}`}>{t(`scen.st.${status}` as MessageKey)}</span>;
}

/** Ssenarilər siyahısı (SPEC §6.5): ad, müəllif, status, dəyişiklik sayı, təsir (Δ FTE, Δ normanı aşanlar). */
export function ScenariosPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { canEdit } = useCan();
  const ready = useData((st) => st.ready);
  const live = useLive();
  const { scenarios, loaded, error } = useScen((st) => st);
  const [tab, setTab] = useState('active');
  const [creating, setCreating] = useState(false);
  const [pick, setPick] = useState<string[]>([]);

  useEffect(() => {
    if (!scenStore.getState().loaded) void scenStore.getState().refresh();
  }, []);

  const rows = useMemo(() => {
    const st = TABS.find((x) => x.id === tab)!.statuses;
    return scenarios.filter((x) => st.includes(x.status)).map((sc) => ({ sc, im: ready ? impactOf(live, sc.changes) : null }));
  }, [scenarios, tab, live, ready]);

  if (!loaded || !ready)
    return (
      <div aria-busy="true" aria-label={t('state.loading')}>
        <Skeleton height={44} />
        <div style={{ height: 12 }} />
        <Skeleton height={320} radius={16} />
      </div>
    );

  const toggle = (id: string) => setPick((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 3 ? p : [...p, id]));

  return (
    <>
      <div className={s.toolbar}>
        <div className={s.seg} role="group" aria-label={t('scen.filter')}>
          {TABS.map((x) => (
            <button key={x.id} type="button" aria-pressed={tab === x.id} onClick={() => setTab(x.id)}>
              {t(x.label)} ({scenarios.filter((y) => x.statuses.includes(y.status)).length})
            </button>
          ))}
        </div>
        <div className={s.spacer} />
        <Button disabled={pick.length < 2} onClick={() => navigate(`/scenarios/compare?ids=${pick.join(',')}`)}>
          <GitCompare size={16} aria-hidden="true" /> {t('scen.compareN', { n: pick.length })}
        </Button>
        {canEdit && (
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus size={16} aria-hidden="true" /> {t('scen.new')}
          </Button>
        )}
      </div>
      {error && <p className={s.noteWarn}>{error}</p>}

      {!rows.length ? (
        <EmptyState icon={<FlaskConical size={26} />} title={t('scen.emptyTitle')}>
          {t('scen.emptyBody')}
        </EmptyState>
      ) : (
        <div className={`${s.card} ${s.tableWrap}`}>
          <table className={s.table}>
            <caption className="visually-hidden">{t('nav.scenarios')}</caption>
            <thead>
              <tr>
                <th scope="col">
                  <span className="visually-hidden">{t('scen.pickCompare')}</span>
                </th>
                <th scope="col">{t('scen.name')}</th>
                <th scope="col">{t('tasks.status')}</th>
                <th scope="col" className={s.num}>
                  {t('scen.changesN')}
                </th>
                <th scope="col" className={s.num}>
                  Δ {t('kpi.need')}
                </th>
                <th scope="col" className={s.num}>
                  Δ {t('kpi.over')}
                </th>
                <th scope="col">{t('tasks.updated')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ sc, im }) => (
                <Row key={sc.id} sc={sc} im={im} picked={pick.includes(sc.id)} onPick={() => toggle(sc.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && <NewScenarioDialog onClose={() => setCreating(false)} />}
    </>
  );
}

function Row({
  sc,
  im,
  picked,
  onPick,
}: {
  sc: Scenario;
  im: ReturnType<typeof impactOf> | null;
  picked: boolean;
  onPick: () => void;
}) {
  const { t } = useI18n();
  const cls = (d: number) => (Math.abs(d) < 0.05 ? s.sub : d < 0 ? s.better : s.worse);
  return (
    <tr data-scenario={sc.id}>
      <td>
        <input type="checkbox" checked={picked} onChange={onPick} aria-label={t('scen.pickOne', { name: sc.name })} />
      </td>
      <td>
        <Link className={s.name} to={`/scenarios/${sc.id}`}>
          {sc.name}
        </Link>
        <div className={s.sub}>{sc.created_by}</div>
      </td>
      <td>
        <StatusPill status={sc.status} />
      </td>
      <td className={s.num}>{sc.changes.length}</td>
      <td className={`${s.num} ${im ? cls(im.dFte) : ''}`}>{im ? fmtSigned(im.dFte, 2) : '—'}</td>
      <td className={`${s.num} ${im ? cls(im.dOver) : ''}`}>{im ? fmtSigned(im.dOver, 0) : '—'}</td>
      <td className={s.sub}>{formatDateTime(sc.updated_at)}</td>
    </tr>
  );
}
