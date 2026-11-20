import { useMemo, useState, type DragEvent } from 'react';
import { Link } from 'react-router';
import { CheckCircle2, Clock, PencilLine, Plus, Sparkles, Target, Zap } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { toast } from '../../lib/toast';
import { actions, dataStore, useData } from '../../store';
import { useCan } from '../../app/useCan';
import { Button, IconButton } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { Skeleton } from '../../components/Skeleton';
import { TaskPicker } from '../../components/TaskPicker';
import { ChartFrame } from '../../charts/ChartFrame';
import { useChartTheme } from '../../charts/useChartTheme';
import { quartersOption } from '../../charts/options/quarters';
import { computeMetrics } from '../../../shared/metrics';
import { COLUMNS, isGoodCandidate, nextQuarters, plannedSaving, portfolio, type Column } from '../../../shared/optimization';
import { curOwner, type Automation, type TaskDoc } from '../../../shared/model';
import { fmtFte, fmtHours } from '../../../shared/format';
import f from '../../components/Form.module.css';
import s from './Optimization.module.css';

const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

/** Optimizasiya portfeli (SPEC §6.6): Namizəd → İcrada → Tamamlandı (+ Rədd edildi). */
export function OptimizationPage() {
  const { t } = useI18n();
  const ready = useData((st) => st.ready);
  const tasks = useData((st) => st.data.tasks);
  const employees = useData((st) => st.data.employees);
  const settings = useData((st) => st.data.settings);
  const { canEdit } = useCan();
  const th = useChartTheme();
  const m = useMemo(() => computeMetrics({ tasks, employees, settings }), [tasks, employees, settings]);
  const p = useMemo(() => portfolio(tasks), [tasks]);
  const spec = useMemo(() => quartersOption(p.quarters, th, t), [p.quarters, th, t]);
  const [editing, setEditing] = useState<TaskDoc | 'new' | null>(null);
  const [completing, setCompleting] = useState<TaskDoc | null>(null);
  const [over, setOver] = useState<Column | null>(null);

  if (!ready) return <Skeleton height={320} radius={16} />;

  const move = (task: TaskDoc, to: Automation) => {
    if (task.automation === to) return;
    if (to === 'done' && task.after_opt != null && task.after_opt !== task.hours) return setCompleting(task);
    if (actions.setAutomation(task.id, to))
      toast(t('opt.moved', { task: task.task, to: t(`opt.col.${to}`) }), {
        action: { label: t('top.undo'), fn: () => dataStore.getState().undoLast() },
      });
  };
  const onDrop = (e: DragEvent, col: Column) => {
    e.preventDefault();
    setOver(null);
    const task = tasks.find((x) => x.id === e.dataTransfer.getData('text/plain'));
    if (task) move(task, col);
  };
  const N = settings.norm;

  return (
    <>
      <section className={s.kpis} aria-label={t('opt.summary')}>
        <Kpi
          icon={<Target size={20} />}
          label={t('kpi.opt')}
          value={fmtHours(m.optPotential)}
          foot={t('kpi.optFoot', { fte: fmtFte(m.optPotential / N, 2) })}
          testId="opt-potential"
        />
        <Kpi
          icon={<CheckCircle2 size={20} />}
          label={t('opt.realized')}
          value={fmtHours(m.optRealized)}
          foot={t('opt.realizedFoot', { n: p.columns.done.length, fte: fmtFte(m.optRealized / N, 2) })}
          testId="opt-realized"
        />
        <Kpi
          icon={<Clock size={20} />}
          label={t('opt.col.in_progress')}
          value={String(p.inProgress.count)}
          foot={t('opt.inProgressFoot', { h: fmtHours(p.inProgress.hours) })}
        />
        <Kpi
          icon={<Zap size={20} />}
          label={t('opt.col.candidate')}
          value={String(p.columns.candidate.length)}
          foot={t('opt.candidatesFoot', { n: p.columns.candidate.filter(isGoodCandidate).length })}
        />
      </section>

      <div className={s.toolbar}>
        <h2 className={s.h2}>{t('opt.board')}</h2>
        <span className={s.spacer} />
        {canEdit && (
          <Button variant="primary" onClick={() => setEditing('new')}>
            <Plus size={16} aria-hidden="true" /> {t('opt.add')}
          </Button>
        )}
      </div>

      <div className={s.board}>
        {COLUMNS.map((col) => {
          const list = p.columns[col];
          return (
            <section
              key={col}
              className={`${s.col} ${over === col ? s.drop : ''}`}
              aria-labelledby={`col-${col}`}
              data-column={col}
              onDragOver={canEdit ? (e) => (e.preventDefault(), setOver(col)) : undefined}
              onDragLeave={() => setOver((o) => (o === col ? null : o))}
              onDrop={canEdit ? (e) => onDrop(e, col) : undefined}
            >
              <h3 id={`col-${col}`} className={s.colHead}>
                <span>{t(`opt.col.${col}`)}</span>
                <span className={s.count}>{list.length}</span>
                <small>
                  {fmtHours(list.reduce((a, x) => a + plannedSaving(x), 0))} {t('unit.hours')}
                </small>
              </h3>
              {list.length === 0 ? (
                <p className={s.empty}>{t('opt.colEmpty')}</p>
              ) : (
                <ul className={s.cards}>
                  {list.map((x) => (
                    <li
                      key={x.id}
                      className={s.card}
                      data-opt={x.id}
                      draggable={canEdit}
                      onDragStart={(e) => e.dataTransfer.setData('text/plain', x.id)}
                    >
                      <Link className={s.title} to={`/tasks?task=${encodeURIComponent(x.id)}`}>
                        {x.task}
                      </Link>
                      <small className={s.muted}>
                        {x.process} · {curOwner(x) || '—'}
                      </small>
                      <div className={s.hours}>
                        <span>
                          {fmtHours(x.opt_before ?? x.hours)} → <b>{x.after_opt != null ? fmtHours(x.after_opt) : '—'}</b>{' '}
                          {t('unit.hours')}
                        </span>
                        {plannedSaving(x) > 0 && <span className={s.saving}>−{fmtHours(plannedSaving(x))}</span>}
                      </div>
                      <div className={s.tags}>
                        {x.due_quarter && <span className={s.tag}>{x.due_quarter}</span>}
                        {isGoodCandidate(x) && (
                          <span className={`${s.tag} ${s.good}`}>
                            <Sparkles size={12} aria-hidden="true" /> {t('opt.good')}
                          </span>
                        )}
                      </div>
                      {x.automation_note && <p className={s.note}>{x.automation_note}</p>}
                      {canEdit && (
                        <div className={s.cardActions}>
                          <select
                            className={`${f.input} ${s.select}`}
                            aria-label={t('opt.statusOf', { task: x.task })}
                            value={x.automation}
                            onChange={(e) => move(x, e.target.value as Automation)}
                          >
                            {COLUMNS.map((c) => (
                              <option key={c} value={c}>
                                {t(`opt.col.${c}`)}
                              </option>
                            ))}
                            <option value="none">{t('opt.remove')}</option>
                          </select>
                          <IconButton size="sm" label={t('opt.editOf', { task: x.task })} onClick={() => setEditing(x)}>
                            <PencilLine size={15} aria-hidden="true" />
                          </IconButton>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {p.suggested.length > 0 && (
        <section className={s.suggested} aria-labelledby="opt-sug">
          <h2 id="opt-sug" className={s.h2}>
            {t('opt.suggested')}
          </h2>
          <p className={s.muted}>{t('opt.suggestedHint')}</p>
          <ul>
            {p.suggested.slice(0, 20).map((x) => (
              <li key={x.id}>
                <span>
                  <b>{x.task}</b>{' '}
                  <small className={s.muted}>
                    · {x.process} · {fmtHours(x.hours)} {t('unit.hours')}
                  </small>
                </span>
                {canEdit && (
                  <Button size="sm" onClick={() => setEditing(x)}>
                    <Plus size={14} aria-hidden="true" /> {t('opt.addShort')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className={s.chart}>
        {p.quarters.length ? (
          <ChartFrame
            testId="opt-quarters"
            title={t('opt.chart.title')}
            info={t('opt.chart.info')}
            spec={spec}
            background={th.surface}
          />
        ) : (
          <section className={s.chartEmpty} aria-labelledby="opt-q-empty">
            <h2 id="opt-q-empty" className={s.h2}>
              {t('opt.chart.title')}
            </h2>
            <p className={s.muted}>{t('opt.chart.empty')}</p>
          </section>
        )}
      </div>

      {editing && <EditDialog task={editing === 'new' ? null : editing} tasks={tasks} onClose={() => setEditing(null)} />}
      {completing && (
        <Modal
          title={t('opt.doneTitle')}
          onClose={() => setCompleting(null)}
          footer={
            <>
              <Button onClick={() => setCompleting(null)}>{t('common.cancel')}</Button>
              <Button
                onClick={() => {
                  actions.setAutomation(completing.id, 'done', false);
                  setCompleting(null);
                }}
              >
                {t('opt.doneKeep')}
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  actions.setAutomation(completing.id, 'done', true);
                  setCompleting(null);
                  toast(t('opt.replaced', { h: fmtHours(completing.after_opt ?? 0) }), {
                    action: { label: t('top.undo'), fn: () => dataStore.getState().undoLast() },
                  });
                }}
              >
                {t('opt.doneReplace')}
              </Button>
            </>
          }
        >
          <p>
            {t('opt.doneBody', {
              task: completing.task,
              from: fmtHours(completing.hours),
              to: fmtHours(completing.after_opt ?? 0),
            })}
          </p>
        </Modal>
      )}
    </>
  );
}

function Kpi({
  icon,
  label,
  value,
  foot,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  foot: string;
  testId?: string;
}) {
  return (
    <div className={s.kpi} data-testid={testId}>
      <span className={s.kpiIcon} aria-hidden="true">
        {icon}
      </span>
      <div>
        <p className={s.kpiLabel}>{label}</p>
        <p className={s.kpiValue}>{value}</p>
        <p className={s.muted}>{foot}</p>
      </div>
    </div>
  );
}

/** Portfelə əlavə et / kartı düzəlt: hədəf saat (after_opt), hədəf rüb, qeyd. */
function EditDialog({ task, tasks, onClose }: { task: TaskDoc | null; tasks: readonly TaskDoc[]; onClose: () => void }) {
  const { t } = useI18n();
  const [ids, setIds] = useState<string[]>(task ? [task.id] : []);
  const cur = tasks.find((x) => x.id === ids[0]) ?? null;
  const [target, setTarget] = useState(task?.after_opt != null ? String(task.after_opt) : '');
  const [quarter, setQuarter] = useState(task?.due_quarter ?? '');
  const [note, setNote] = useState(task?.automation_note ?? '');
  const pool = useMemo(() => tasks.filter((x) => !x.is_cancelled && (x.automation ?? 'none') === 'none'), [tasks]);
  const quarters = useMemo(() => [...new Set([...nextQuarters(), ...(quarter ? [quarter] : [])])].sort(), [quarter]);
  const n = num(target);
  const valid = !!cur && (n === null || (Number.isFinite(n) && n >= 0));
  const inPortfolio = !!task && (task.automation ?? 'none') !== 'none';

  const save = () => {
    if (!cur || !valid) return;
    actions.saveOptimization(cur.id, {
      after_opt: n,
      due_quarter: quarter,
      automation_note: note.trim(),
      ...(inPortfolio ? {} : { automation: 'candidate' as const }),
    });
    onClose();
  };

  return (
    <Modal
      title={inPortfolio ? t('opt.edit') : t('opt.add')}
      onClose={onClose}
      wide={!task}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={save} disabled={!valid}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className={f.grid}>
        {!task ? (
          <div className={f.full}>
            <TaskPicker
              tasks={pool}
              value={ids}
              multi={false}
              onChange={(v) => {
                setIds(v);
                const x = tasks.find((y) => y.id === v[0]);
                setTarget(x?.after_opt != null ? String(x.after_opt) : '');
              }}
              label={t('chg.tasks')}
            />
          </div>
        ) : (
          <p className={f.full}>
            <b>{task.task}</b>
            <br />
            <small className={s.muted}>
              {task.process} · {curOwner(task)} · {fmtHours(task.hours)} {t('unit.hours')}
            </small>
          </p>
        )}
        <div className={f.field}>
          <label className={f.label} htmlFor="opt-target">
            {t('opt.target')}
          </label>
          <input
            id="opt-target"
            className={f.input}
            inputMode="decimal"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            data-autofocus={task ? true : undefined}
          />
          {cur && n != null && Number.isFinite(n) && (
            <span className={f.hint}>{t('opt.targetHint', { h: fmtHours(Math.max(0, cur.hours - n)) })}</span>
          )}
        </div>
        <div className={f.field}>
          <label className={f.label} htmlFor="opt-quarter">
            {t('opt.quarter')}
          </label>
          <select id="opt-quarter" className={f.input} value={quarter} onChange={(e) => setQuarter(e.target.value)}>
            <option value="">—</option>
            {quarters.map((q) => (
              <option key={q}>{q}</option>
            ))}
          </select>
        </div>
        <div className={`${f.field} ${f.full}`}>
          <label className={f.label} htmlFor="opt-note">
            {t('opt.note')}
          </label>
          <textarea
            id="opt-note"
            className={f.input}
            rows={2}
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('opt.notePh')}
          />
        </div>
      </div>
    </Modal>
  );
}
