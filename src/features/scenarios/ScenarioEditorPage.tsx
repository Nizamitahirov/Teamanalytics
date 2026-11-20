import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ArrowRightLeft,
  CheckCircle2,
  FlaskConical,
  Plus,
  Scale,
  Send,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { Button, IconButton } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { EmptyState } from '../../components/EmptyState';
import { Skeleton } from '../../components/Skeleton';
import { useI18n } from '../../lib/i18n';
import { toast } from '../../lib/toast';
import { useCan } from '../../app/useCan';
import { useData } from '../../store';
import { scenStore, useScen } from '../../store/scenarios';
import { compare, findConflicts, scenarioData, type ScenarioChange } from '../../../shared/scenario';
import { formatDateTime } from '../../lib/dates';
import { scenarioRights, useLive } from './logic';
import { Comparison } from './Comparison';
import { AddChangeDialog } from './AddChangeDialog';
import { RebalanceDialog } from './RebalanceDialog';
import { ApplyDialog } from './ApplyDialog';
import { StatusPill } from './ScenariosPage';
import f from '../../components/Form.module.css';
import s from './Scenarios.module.css';

/**
 * Ssenari redaktoru (SPEC §6.5): solda dəyişikliklər, sağda Cari vs Ssenari müqayisəsi.
 * Hər dəyişiklik dərhal ssenari sənədinə yazılır (canlı dataya YOX).
 */
export function ScenarioEditorPage() {
  const { id = '' } = useParams();
  const { t } = useI18n();
  const navigate = useNavigate();
  const { role, isAdmin } = useCan();
  const me = useData((st) => st.user);
  const ready = useData((st) => st.ready);
  const live = useLive();
  const { loaded } = useScen((st) => st);
  const sc = useScen((st) => st.scenarios.find((x) => x.id === id));
  const [dialog, setDialog] = useState<null | 'add' | 'balance' | 'apply' | 'reject' | 'delete' | 'submit'>(null);
  const [comment, setComment] = useState('');
  const [nameDraft, setNameDraft] = useState<string | null>(null);

  useEffect(() => {
    if (!scenStore.getState().loaded) void scenStore.getState().refresh();
  }, []);

  const scen = useMemo(() => (sc ? scenarioData(live, sc.changes) : live), [live, sc]);
  const cmp = useMemo(() => compare(live, scen), [live, scen]);
  const conflicts = useMemo(() => (sc && sc.status !== 'applied' ? findConflicts(live, sc.changes) : []), [live, sc]);
  const approvalOn = live.settings.approval === 1;
  const can = scenarioRights(sc, me, role, approvalOn);

  if (!loaded || !ready)
    return (
      <div aria-busy="true" aria-label={t('state.loading')}>
        <Skeleton height={44} />
        <div style={{ height: 12 }} />
        <Skeleton height={420} radius={16} />
      </div>
    );
  if (!sc)
    return (
      <EmptyState
        icon={<FlaskConical size={26} />}
        title={t('scen.notFound')}
        actions={
          <Button onClick={() => navigate('/scenarios')}>
            <ArrowLeft size={16} aria-hidden="true" /> {t('scen.back')}
          </Button>
        }
      />
    );

  const save = async (changes: ScenarioChange[]) => {
    try {
      await scenStore.getState().update(sc.id, { changes });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    }
  };
  const add = (cs: ScenarioChange[]) => {
    void save([...sc.changes, ...cs]);
    toast(t('scen.added', { n: cs.length }));
  };
  const remove = (cid: string) => void save(sc.changes.filter((c) => c.id !== cid));
  const act = async (action: 'archive' | 'restore' | 'submit' | 'reject' | 'delete', extra?: Record<string, unknown>) => {
    try {
      await scenStore.getState().action(sc.id, action, extra);
      toast(t(`scen.done.${action}`));
      if (action === 'delete') navigate('/scenarios');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    }
  };
  const commitName = () => {
    if (nameDraft != null && nameDraft.trim() && nameDraft.trim() !== sc.name)
      void scenStore.getState().update(sc.id, { name: nameDraft.trim() });
    setNameDraft(null);
  };
  const conflictIds = new Set(conflicts.map((c) => c.changeId));

  return (
    <>
      <Link to="/scenarios" className={s.back}>
        <ArrowLeft size={14} aria-hidden="true" /> {t('nav.scenarios')}
      </Link>
      <div className={s.head}>
        {can.edit ? (
          <input
            className={`${f.input} ${s.titleInput}`}
            aria-label={t('scen.name')}
            value={nameDraft ?? sc.name}
            maxLength={120}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        ) : (
          <h2 className={s.title}>{sc.name}</h2>
        )}
        <StatusPill status={sc.status} />
        {can.submit && (
          <Button onClick={() => setDialog('submit')} disabled={!sc.changes.length}>
            <Send size={16} aria-hidden="true" /> {t('scen.submit')}
          </Button>
        )}
        {can.review && (
          <Button variant="danger" onClick={() => setDialog('reject')}>
            <X size={16} aria-hidden="true" /> {t('scen.reject')}
          </Button>
        )}
        {can.apply && (
          <Button variant="primary" onClick={() => setDialog('apply')} disabled={!sc.changes.length}>
            <CheckCircle2 size={16} aria-hidden="true" /> {t(can.review ? 'scen.approveApply' : 'scen.apply')}
          </Button>
        )}
        {can.manage && sc.status !== 'archived' && sc.status !== 'pending' && (
          <IconButton label={t('scen.archive')} onClick={() => void act('archive')}>
            <Archive size={18} aria-hidden="true" />
          </IconButton>
        )}
        {can.manage && sc.status === 'archived' && (
          <IconButton label={t('scen.restore')} onClick={() => void act('restore')}>
            <ArchiveRestore size={18} aria-hidden="true" />
          </IconButton>
        )}
        {can.manage && (
          <IconButton label={t('scen.delete')} onClick={() => setDialog('delete')}>
            <Trash2 size={18} aria-hidden="true" />
          </IconButton>
        )}
      </div>
      <p className={s.sub} style={{ margin: '-8px 0 16px' }}>
        {t('scen.meta', { by: sc.created_by, at: formatDateTime(sc.created_at) })}
        {sc.applied_by && ` · ${t('scen.appliedBy', { by: sc.applied_by, at: formatDateTime(sc.applied_at ?? '') })}`}
      </p>
      {sc.status === 'pending' && (
        <p className={s.noteWarn}>
          {t(isAdmin ? 'scen.pendingAdmin' : 'scen.pendingNote', { by: sc.submitted_by ?? sc.created_by })}
        </p>
      )}
      {sc.status === 'draft' && sc.review_comment && (
        <p className={s.noteWarn}>{t('scen.rejectedNote', { c: sc.review_comment })}</p>
      )}
      {sc.status === 'draft' && approvalOn && role === 'editor' && <p className={s.note}>{t('scen.approvalOn')}</p>}

      <div className={s.layout}>
        <section className={s.card} aria-labelledby="ch-h">
          <div className={s.cardHead}>
            <h2 id="ch-h">{t('scen.changes', { n: sc.changes.length })}</h2>
          </div>
          {can.edit && (
            <div className={s.toolbar} style={{ marginBottom: 12 }}>
              <Button size="sm" variant="primary" onClick={() => setDialog('add')}>
                <Plus size={14} aria-hidden="true" /> {t('scen.addChange')}
              </Button>
              <Button size="sm" onClick={() => setDialog('balance')}>
                <Scale size={14} aria-hidden="true" /> {t('scen.balance')}
              </Button>
            </div>
          )}
          {conflicts.length > 0 && (
            <p className={s.noteWarn} role="status">
              <AlertTriangle size={14} aria-hidden="true" /> {t('scen.conflictsShort', { n: conflicts.length })}
            </p>
          )}
          {!sc.changes.length ? (
            <p className={s.sub}>{t(can.edit ? 'scen.noChangesEdit' : 'scen.noChanges')}</p>
          ) : (
            <ol className={s.changes} aria-label={t('scen.changes', { n: sc.changes.length })}>
              {sc.changes.map((c) => (
                <li key={c.id} className={s.change} data-change={c.kind}>
                  {conflictIds.has(c.id) ? (
                    <AlertTriangle size={14} className={s.conflictMark} aria-label={t('scen.hasConflict')} />
                  ) : (
                    <ArrowRightLeft size={14} aria-hidden="true" />
                  )}
                  <span>
                    {c.label}
                    {c.auto && <span className={s.auto}>{t('scen.auto')}</span>}
                  </span>
                  {can.edit && (
                    <IconButton size="sm" label={t('scen.removeChange', { label: c.label })} onClick={() => remove(c.id)}>
                      <X size={14} aria-hidden="true" />
                    </IconButton>
                  )}
                </li>
              ))}
            </ol>
          )}
          {can.edit && sc.changes.length > 0 && (
            <Button size="sm" variant="ghost" style={{ marginTop: 12 }} onClick={() => void save([])}>
              <Undo2 size={14} aria-hidden="true" /> {t('scen.clear')}
            </Button>
          )}
        </section>
        <div className={s.stack}>
          <Comparison c={cmp} />
        </div>
      </div>

      {dialog === 'add' && <AddChangeDialog live={live} scen={scen} onAdd={add} onClose={() => setDialog(null)} />}
      {dialog === 'balance' && <RebalanceDialog live={live} scen={scen} onAdd={add} onClose={() => setDialog(null)} />}
      {dialog === 'apply' && <ApplyDialog sc={sc} live={live} approve={can.review} onClose={() => setDialog(null)} />}
      {(dialog === 'reject' || dialog === 'submit') && (
        <Modal
          title={t(dialog === 'reject' ? 'scen.reject' : 'scen.submit')}
          onClose={() => setDialog(null)}
          footer={
            <>
              <Button onClick={() => setDialog(null)}>{t('common.cancel')}</Button>
              <Button
                variant={dialog === 'reject' ? 'danger' : 'primary'}
                onClick={() => {
                  const a = dialog;
                  setDialog(null);
                  void act(a, { comment: comment.trim() });
                  setComment('');
                }}
              >
                {t(dialog === 'reject' ? 'scen.reject' : 'scen.submit')}
              </Button>
            </>
          }
        >
          {dialog === 'submit' && <p className={s.note}>{t('scen.submitHint')}</p>}
          <label className={f.label} htmlFor="sc-comment">
            {t('transfer.comment')}
          </label>
          <input
            id="sc-comment"
            data-autofocus
            className={f.input}
            value={comment}
            maxLength={500}
            onChange={(e) => setComment(e.target.value)}
          />
        </Modal>
      )}
      {dialog === 'delete' && (
        <Modal
          title={t('scen.delete')}
          onClose={() => setDialog(null)}
          footer={
            <>
              <Button onClick={() => setDialog(null)}>{t('common.cancel')}</Button>
              <Button variant="danger" onClick={() => void act('delete')}>
                <Trash2 size={16} aria-hidden="true" /> {t('scen.delete')}
              </Button>
            </>
          }
        >
          <p>{t('scen.deleteBody', { name: sc.name })}</p>
        </Modal>
      )}
    </>
  );
}
