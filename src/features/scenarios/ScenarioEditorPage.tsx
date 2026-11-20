import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FlaskConical,
  PencilLine,
  Plus,
  Send,
  Trash2,
  Undo2,
  X,
  XCircle,
} from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { toast } from '../../lib/toast';
import { formatDateTime } from '../../lib/dates';
import { scenarioActions, useData } from '../../store';
import { useCan } from '../../app/useCan';
import { Button, IconButton } from '../../components/Button';
import { LoadChip } from '../../components/Badges';
import { EmptyState } from '../../components/EmptyState';
import { Modal } from '../../components/Modal';
import { Skeleton } from '../../components/Skeleton';
import { ChartFrame } from '../../charts/ChartFrame';
import { useChartTheme } from '../../charts/useChartTheme';
import { loadCompareOption } from '../../charts/options/loadCompare';
import { scenarioImpact } from '../../../shared/scenario';
import { levelOf, type Metrics } from '../../../shared/metrics';
import { fmtFte, fmtHours, fmtSigned } from '../../../shared/format';
import { CHANGE_KINDS, type ChangeKind, type Scenario } from '../../../shared/schema';
import type { MessageKey } from '../../../shared/i18n/az';
import { ScenarioStatus } from './ScenarioStatus';
import { ChangeDialog } from './ChangeDialog';
import { ApplyDialog } from './ApplyDialog';
import f from '../../components/Form.module.css';
import s from './Scenarios.module.css';

type Row = { key: MessageKey; get: (m: Metrics) => number; fmt: (n: number) => string; dfmt: (n: number) => string };
export const KPI_ROWS: Row[] = [
  { key: 'kpi.volume', get: (m) => m.totalHours, fmt: fmtHours, dfmt: (n) => fmtSigned(n, 0) },
  { key: 'kpi.need', get: (m) => m.fteNeed, fmt: (n) => fmtFte(n, 2), dfmt: (n) => fmtSigned(n, 2) },
  { key: 'kpi.have', get: (m) => m.fteHave, fmt: (n) => fmtFte(n, 2), dfmt: (n) => fmtSigned(n, 2) },
  { key: 'kpi.reserve', get: (m) => m.gap, fmt: (n) => fmtSigned(n, 2), dfmt: (n) => fmtSigned(n, 2) },
  { key: 'kpi.over', get: (m) => m.over.length, fmt: (n) => String(n), dfmt: (n) => fmtSigned(n, 0) },
  { key: 'kpi.transfers', get: (m) => m.transfers.count, fmt: (n) => String(n), dfmt: (n) => fmtSigned(n, 0) },
  { key: 'kpi.cancelled', get: (m) => m.cancelled.hours, fmt: fmtHours, dfmt: (n) => fmtSigned(n, 0) },
  { key: 'scn.norm', get: (m) => m.norm, fmt: fmtHours, dfmt: (n) => fmtSigned(n, 0) },
];

/** Ssenari redaktoru (SPEC §6.5): sol — dəyişikliklər, mərkəz — Cari vs Ssenari, sağ — dəyişən əməkdaşlar. */
export function ScenarioEditorPage() {
  const { t } = useI18n();
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const ready = useData((st) => st.ready);
  const sc = useData((st) => st.scenarios.find((x) => x.id === id));
  const tasks = useData((st) => st.data.tasks);
  const employees = useData((st) => st.data.employees);
  const settings = useData((st) => st.data.settings);
  const { canEdit, isAdmin, name: me } = useCan();
  const th = useChartTheme();
  const [adding, setAdding] = useState<ChangeKind | null>(null);
  const [dialog, setDialog] = useState<'apply' | 'revert' | 'reject' | 'rename' | null>(null);
  const [busy, setBusy] = useState(false);

  // ?add=kind — şablondan açılanda dəyişiklik dialoqu dərhal açılır
  const addParam = params.get('add');
  const [seenAdd, setSeenAdd] = useState<string | null>(null);
  if (addParam && sc && seenAdd !== addParam) {
    setSeenAdd(addParam);
    if ((CHANGE_KINDS as readonly string[]).includes(addParam)) setAdding(addParam as ChangeKind);
  }
  useEffect(() => {
    if (addParam && sc) setParams({}, { replace: true });
  }, [addParam, sc, setParams]);

  const impact = useMemo(
    () => (sc ? scenarioImpact({ tasks, employees, settings }, sc.changes) : null),
    [sc, tasks, employees, settings],
  );
  const spec = useMemo(() => (impact ? loadCompareOption(impact.base, impact.next, th, t) : null), [impact, th, t]);

  if (!ready) return <Skeleton height={320} radius={16} />;
  if (!sc || !impact || !spec)
    return (
      <EmptyState
        icon={<FlaskConical size={26} />}
        title={t('scn.notFound')}
        actions={
          <Link className={s.linkBtn} to="/scenarios">
            {t('scn.back')}
          </Link>
        }
      />
    );

  const approval = settings.approval === 1;
  const editable = canEdit && (sc.status === 'draft' || sc.status === 'pending');
  const canApply = editable && sc.changes.length > 0 && (!approval || isAdmin);
  const canSubmit = canEdit && !isAdmin && approval && sc.status === 'draft' && sc.changes.length > 0;
  const canRevert = canEdit && sc.status === 'applied' && sc.revert.length > 0 && (!approval || isAdmin);
  const canDelete = canEdit && !sc.applied_at && sc.status !== 'pending' && (isAdmin || sc.created_by === me);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast(ok);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className={s.editorHead}>
        <Link to="/scenarios" className={s.back} aria-label={t('scn.back')} title={t('scn.back')}>
          <ArrowLeft size={18} aria-hidden="true" />
        </Link>
        <div className={s.titleBox}>
          <h2 className={s.name}>
            {sc.name}
            {editable && (
              <IconButton size="sm" label={t('scn.rename')} onClick={() => setDialog('rename')}>
                <PencilLine size={15} aria-hidden="true" />
              </IconButton>
            )}
          </h2>
          <p className={s.meta}>
            <ScenarioStatus status={sc.status} />
            <span>{t('scn.by', { name: sc.created_by, date: formatDateTime(sc.created_at) })}</span>
            {sc.applied_at && <span>{t('scn.appliedBy', { name: sc.applied_by, date: formatDateTime(sc.applied_at) })}</span>}
          </p>
          {sc.description && <p className={s.desc}>{sc.description}</p>}
        </div>
        <div className={s.actions}>
          {canSubmit && (
            <Button onClick={() => void run(() => scenarioActions.submit(sc), t('scn.submitted'))} disabled={busy}>
              <Send size={16} aria-hidden="true" /> {t('scn.submit')}
            </Button>
          )}
          {isAdmin && sc.status === 'pending' && (
            <Button variant="danger" onClick={() => setDialog('reject')} disabled={busy}>
              <XCircle size={16} aria-hidden="true" /> {t('scn.reject')}
            </Button>
          )}
          {canApply && (
            <Button variant="primary" onClick={() => setDialog('apply')} disabled={busy}>
              <CheckCircle2 size={16} aria-hidden="true" /> {sc.status === 'pending' ? t('scn.approveApply') : t('scn.apply')}
            </Button>
          )}
          {canRevert && (
            <Button onClick={() => setDialog('revert')} disabled={busy}>
              <Undo2 size={16} aria-hidden="true" /> {t('scn.revert')}
            </Button>
          )}
          {canEdit && sc.status !== 'archived' && sc.status !== 'pending' && (
            <IconButton label={t('scn.archive')} onClick={() => void run(() => scenarioActions.archive(sc))} disabled={busy}>
              <Archive size={18} aria-hidden="true" />
            </IconButton>
          )}
          {canEdit && sc.status === 'archived' && (
            <IconButton label={t('scn.restore')} onClick={() => void run(() => scenarioActions.restore(sc))} disabled={busy}>
              <ArchiveRestore size={18} aria-hidden="true" />
            </IconButton>
          )}
          {canDelete && (
            <IconButton
              label={t('scn.delete')}
              disabled={busy}
              onClick={() => {
                if (!window.confirm(t('scn.deleteConfirm', { name: sc.name }))) return;
                void run(async () => {
                  await scenarioActions.remove(sc);
                  navigate('/scenarios');
                });
              }}
            >
              <Trash2 size={18} aria-hidden="true" />
            </IconButton>
          )}
        </div>
      </div>

      {sc.status === 'pending' && (
        <p className={s.banner} role="status">
          {t('scn.pendingBanner', { name: sc.submitted_by, date: formatDateTime(sc.submitted_at) })}
          {canEdit && !isAdmin && ` ${t('scn.pendingEditHint')}`}
        </p>
      )}
      {sc.status === 'draft' && sc.decided_by && (
        <p className={`${s.banner} ${s.bannerWarn}`} role="status">
          {t('scn.rejectedBanner', { name: sc.decided_by })}
          {sc.decision_comment && <> «{sc.decision_comment}»</>}
        </p>
      )}
      {approval && canEdit && !isAdmin && sc.status === 'draft' && <p className={s.hint}>{t('scn.approvalHint')}</p>}

      <div className={s.layout}>
        <section className={`${s.panel} ${s.changes}`} aria-labelledby="scn-changes">
          <div className={s.panelHead}>
            <h3 id="scn-changes">{t('scn.changes', { n: sc.changes.length })}</h3>
            {editable && (
              <Button size="sm" variant="primary" onClick={() => setAdding('transfer')}>
                <Plus size={15} aria-hidden="true" /> {t('chg.add')}
              </Button>
            )}
          </div>
          {sc.changes.length === 0 ? (
            <p className={s.muted}>{editable ? t('scn.noChangesEdit') : t('scn.noChanges')}</p>
          ) : (
            <ol className={s.changeList}>
              {sc.changes.map((c) => (
                <li key={c.id}>
                  <span className={s.kind}>{t(`chg.k.${c.kind}`)}</span>
                  <span className={s.changeLabel}>{c.label}</span>
                  {editable && (
                    <IconButton
                      size="sm"
                      label={t('chg.remove', { label: c.label })}
                      onClick={() => void run(() => scenarioActions.removeChange(sc, c.id))}
                      disabled={busy}
                    >
                      <X size={15} aria-hidden="true" />
                    </IconButton>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>

        <div className={s.center}>
          <section className={s.panel} aria-labelledby="scn-kpi">
            <h3 id="scn-kpi">{t('scn.compare')}</h3>
            <div className={s.tableWrap}>
              <table className={s.kpiTable}>
                <thead>
                  <tr>
                    <th scope="col">
                      <span className="visually-hidden">{t('scn.metric')}</span>
                    </th>
                    <th scope="col">{t('scn.current')}</th>
                    <th scope="col">{t('scn.scenario')}</th>
                    <th scope="col">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {KPI_ROWS.map((r) => {
                    const a = r.get(impact.base);
                    const b = r.get(impact.next);
                    const d = b - a;
                    return (
                      <tr key={r.key}>
                        <th scope="row">{t(r.key)}</th>
                        <td>{r.fmt(a)}</td>
                        <td>
                          <b>{r.fmt(b)}</b>
                        </td>
                        <td className={Math.abs(d) < 1e-9 ? s.muted : s.delta}>{Math.abs(d) < 1e-9 ? '—' : r.dfmt(d)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          <ChartFrame
            testId="scn-load"
            title={t('scn.loadTitle')}
            subtitle={t('scn.loadSub')}
            info={t('scn.loadInfo')}
            spec={spec}
            background={th.surface}
          />
        </div>

        <section className={`${s.panel} ${s.people}`} aria-labelledby="scn-people">
          <h3 id="scn-people">{t('scn.changedPeople', { n: impact.changed.length })}</h3>
          {impact.changed.length === 0 ? (
            <p className={s.muted}>{t('scn.noImpact')}</p>
          ) : (
            <ul className={s.peopleList}>
              {impact.changed.map((c) => (
                <li key={c.name}>
                  <Link to={`/employees/${encodeURIComponent(c.name)}`}>{c.name}</Link>
                  <span className={s.arrow}>
                    <LoadChip load={c.before} level={levelOf(c.before, settings.warn)} />
                    <ArrowRight size={13} aria-hidden="true" />
                    <LoadChip load={c.after} level={levelOf(c.after, settings.warn)} />
                  </span>
                  <small className={s.muted}>
                    {fmtHours(c.hoursBefore)} → {fmtHours(c.hoursAfter)} {t('unit.hours')}
                  </small>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {adding && <ChangeDialog sc={sc} initialKind={adding} onClose={() => setAdding(null)} />}
      {(dialog === 'apply' || dialog === 'revert') && <ApplyDialog sc={sc} mode={dialog} onClose={() => setDialog(null)} />}
      {dialog === 'reject' && <RejectDialog sc={sc} onClose={() => setDialog(null)} />}
      {dialog === 'rename' && <RenameDialog sc={sc} onClose={() => setDialog(null)} />}
    </>
  );
}

function RejectDialog({ sc, onClose }: { sc: Scenario; onClose: () => void }) {
  const { t } = useI18n();
  const [comment, setComment] = useState('');
  const submit = async () => {
    try {
      await scenarioActions.reject(sc, comment.trim());
      toast(t('scn.rejected'));
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { kind: 'error' });
    }
  };
  return (
    <Modal
      title={t('scn.rejectTitle', { name: sc.name })}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={() => void submit()}>
            {t('scn.reject')}
          </Button>
        </>
      }
    >
      <div className={f.field}>
        <label className={f.label} htmlFor="rej-comment">
          {t('scn.rejectComment')}
        </label>
        <textarea
          id="rej-comment"
          className={f.input}
          rows={3}
          maxLength={2000}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          data-autofocus
        />
      </div>
    </Modal>
  );
}

export function RenameDialog({ sc, onClose }: { sc: Scenario | null; onClose: () => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [name, setName] = useState(sc?.name ?? '');
  const [desc, setDesc] = useState(sc?.description ?? '');
  const submit = async () => {
    if (!name.trim()) return;
    try {
      if (sc) await scenarioActions.rename(sc, name.trim(), desc.trim());
      else {
        const created = await scenarioActions.create(name.trim(), [], { description: desc.trim() });
        navigate(`/scenarios/${created.id}`);
      }
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { kind: 'error' });
    }
  };
  return (
    <Modal
      title={sc ? t('scn.rename') : t('scn.new')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={!name.trim()}>
            {sc ? t('common.save') : t('scn.create')}
          </Button>
        </>
      }
    >
      <div className={f.grid}>
        <div className={`${f.field} ${f.full}`}>
          <label className={f.label} htmlFor="scn-name">
            {t('field.name')}
          </label>
          <input
            id="scn-name"
            className={f.input}
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
            data-autofocus
          />
        </div>
        <div className={`${f.field} ${f.full}`}>
          <label className={f.label} htmlFor="scn-desc">
            {t('field.description')}
          </label>
          <textarea
            id="scn-desc"
            className={f.input}
            rows={3}
            maxLength={2000}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  );
}
