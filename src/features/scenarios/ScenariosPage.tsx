import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Columns3, FlaskConical, Gauge, Percent, Plus, Scale, UserMinus, UserPlus, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { formatDate } from '../../lib/dates';
import { useData } from '../../store';
import { useCan } from '../../app/useCan';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { Skeleton } from '../../components/Skeleton';
import { scenarioState } from '../../../shared/scenario';
import { computeMetrics } from '../../../shared/metrics';
import { fmtSigned } from '../../../shared/format';
import type { ChangeKind, Scenario, ScenarioStatus as Status } from '../../../shared/schema';
import { useStartFromTemplate } from './startTemplate';
import type { MessageKey } from '../../../shared/i18n/az';
import { ScenarioStatus } from './ScenarioStatus';
import { KPI_ROWS, RenameDialog } from './ScenarioEditorPage';
import s from './Scenarios.module.css';

type Template = { kind: ChangeKind; icon: LucideIcon; title: MessageKey; desc: MessageKey };
// SPEC §6.5 şablonları
export const TEMPLATES: Template[] = [
  { kind: 'remove_employee', icon: UserMinus, title: 'tpl.leave', desc: 'tpl.leaveD' },
  { kind: 'add_employee', icon: UserPlus, title: 'tpl.join', desc: 'tpl.joinD' },
  { kind: 'automate', icon: Percent, title: 'tpl.automate', desc: 'tpl.automateD' },
  { kind: 'rebalance', icon: Scale, title: 'tpl.rebalance', desc: 'tpl.rebalanceD' },
  { kind: 'norm', icon: Gauge, title: 'tpl.norm', desc: 'tpl.normD' },
];
const FILTERS: ('active' | Status)[] = ['active', 'draft', 'pending', 'applied', 'archived'];
const MAX_COMPARE = 3;

/** Ssenarilər — Planlama laboratoriyası (SPEC §6.5): siyahı, şablonlar, 2–3 ssenarinin müqayisəsi. */
export function ScenariosPage() {
  const { t } = useI18n();
  const ready = useData((st) => st.ready);
  const scenarios = useData((st) => st.scenarios);
  const { canEdit } = useCan();
  const start = useStartFromTemplate();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('active');
  const [picked, setPicked] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [creating, setCreating] = useState(false);

  const list = useMemo(
    () => scenarios.filter((x) => (filter === 'active' ? x.status !== 'archived' : x.status === filter)),
    [scenarios, filter],
  );
  const counts = useMemo(() => {
    const c: Record<string, number> = { active: 0 };
    for (const x of scenarios) {
      c[x.status] = (c[x.status] ?? 0) + 1;
      if (x.status !== 'archived') c.active++;
    }
    return c;
  }, [scenarios]);

  if (!ready) return <Skeleton height={320} radius={16} />;

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX_COMPARE ? p : [...p, id]));

  return (
    <>
      <p className={s.intro}>{t('scn.intro')}</p>

      {canEdit && (
        <section aria-labelledby="tpl-title" className={s.templates}>
          <h2 id="tpl-title" className={s.sectionTitle}>
            {t('scn.templates')}
          </h2>
          <ul>
            {TEMPLATES.map((x) => (
              <li key={x.kind}>
                <button type="button" className={s.tpl} onClick={() => void start(x.kind, x.title)}>
                  <x.icon size={20} aria-hidden="true" />
                  <span>
                    <b>{t(x.title)}</b>
                    <small>{t(x.desc)}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className={s.toolbar}>
        <div className={s.tabs} role="tablist" aria-label={t('scn.filter')}>
          {FILTERS.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}>
              {k === 'active' ? t('scn.f.active') : t(`scn.st.${k}`)} <span className={s.count}>{counts[k] ?? 0}</span>
            </button>
          ))}
        </div>
        <span className={s.spacer} />
        <Button onClick={() => setComparing(true)} disabled={picked.length < 2}>
          <Columns3 size={16} aria-hidden="true" /> {t('scn.compareN', { n: picked.length })}
        </Button>
        {canEdit && (
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus size={16} aria-hidden="true" /> {t('scn.new')}
          </Button>
        )}
      </div>

      {list.length === 0 ? (
        <EmptyState icon={<FlaskConical size={26} />} title={t('scn.empty')}>
          {canEdit ? t('scn.emptyEdit') : t('scn.emptyView')}
        </EmptyState>
      ) : (
        <div className={s.tableWrap}>
          <table className={`${s.table} ${s.listTable}`}>
            <thead>
              <tr>
                <th scope="col">
                  <span className="visually-hidden">{t('scn.pick')}</span>
                </th>
                <th scope="col">{t('field.name')}</th>
                <th scope="col">{t('scn.status')}</th>
                <th scope="col" className={s.hideSm}>
                  {t('scn.author')}
                </th>
                <th scope="col" className={s.num}>
                  {t('scn.changesCol')}
                </th>
                <th scope="col" className={s.num}>
                  Δ {t('kpi.need')}
                </th>
                <th scope="col" className={s.num}>
                  Δ {t('kpi.over')}
                </th>
                <th scope="col" className={s.hideSm}>
                  {t('scn.updated')}
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((x) => (
                <tr key={x.id}>
                  <td>
                    <input
                      type="checkbox"
                      className={s.pick}
                      checked={picked.includes(x.id)}
                      onChange={() => toggle(x.id)}
                      disabled={!picked.includes(x.id) && picked.length >= MAX_COMPARE}
                      aria-label={t('scn.pickOne', { name: x.name })}
                    />
                  </td>
                  <td>
                    <Link to={`/scenarios/${x.id}`} className={s.rowLink}>
                      {x.name}
                    </Link>
                  </td>
                  <td>
                    <ScenarioStatus status={x.status} />
                  </td>
                  <td className={s.hideSm}>{x.created_by}</td>
                  <td className={s.num}>{x.changes.length}</td>
                  <td className={s.num}>{x.summary ? fmtSigned(x.summary.dFteNeed, 2) : '—'}</td>
                  <td className={s.num}>{x.summary ? fmtSigned(x.summary.dOver, 0) : '—'}</td>
                  <td className={s.hideSm}>{formatDate(x.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {comparing && (
        <CompareView
          list={picked.map((id) => scenarios.find((x) => x.id === id)).filter((x): x is Scenario => !!x)}
          onClose={() => setComparing(false)}
        />
      )}
      {creating && <RenameDialog sc={null} onClose={() => setCreating(false)} />}
    </>
  );
}

/** 2–3 ssenarinin yan-yana müqayisəsi (cari data ilə hesablanır). */
function CompareView({ list, onClose }: { list: Scenario[]; onClose: () => void }) {
  const { t } = useI18n();
  const tasks = useData((st) => st.data.tasks);
  const employees = useData((st) => st.data.employees);
  const settings = useData((st) => st.data.settings);
  const cols = useMemo(() => {
    const live = { tasks, employees, settings };
    return [
      { name: t('scn.current'), m: computeMetrics(live) },
      ...list.map((x) => ({ name: x.name, m: computeMetrics(scenarioState(live, x.changes)) })),
    ];
  }, [list, tasks, employees, settings, t]);
  return (
    <section className={`${s.panel} ${s.compare}`} aria-labelledby="cmp-title">
      <div className={s.panelHead}>
        <h2 id="cmp-title" className={s.sectionTitle}>
          {t('scn.compareTitle')}
        </h2>
        <Button size="sm" onClick={onClose}>
          <X size={15} aria-hidden="true" /> {t('common.close')}
        </Button>
      </div>
      <div className={s.tableWrap}>
        <table className={s.kpiTable}>
          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">{t('scn.metric')}</span>
              </th>
              {cols.map((c, i) => (
                <th key={i} scope="col">
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {KPI_ROWS.map((r) => (
              <tr key={r.key}>
                <th scope="row">{t(r.key)}</th>
                {cols.map((c, i) => {
                  const v = r.get(c.m);
                  const d = v - r.get(cols[0].m);
                  return (
                    <td key={i}>
                      <b>{r.fmt(v)}</b>
                      {i > 0 && Math.abs(d) > 1e-9 && <small className={s.delta}> ({r.dfmt(d)})</small>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
