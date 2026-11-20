import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRightLeft, Ban, RotateCcw, Save, Trash2 } from 'lucide-react';
import { Drawer } from '../../components/Drawer';
import { Button } from '../../components/Button';
import { EmployeePicker } from '../../components/EmployeePicker';
import { CompanyBadge, StatusBadge } from '../../components/Badges';
import { Modal } from '../../components/Modal';
import { useI18n } from '../../lib/i18n';
import { useCan } from '../../app/useCan';
import { toast } from '../../lib/toast';
import { actions, dataStore, useData } from '../../store';
import { curOwner, statusOf, type TaskDoc } from '../../../shared/model';
import { formatNumber } from '../../../shared/format';
import { formatDateTime } from '../../lib/dates';
import { TransferDialog } from './TransferDialog';
import { CancelDialog } from './CancelDialog';
import f from '../../components/Form.module.css';
import s from './TaskDrawer.module.css';

const num = (v: string): number | null => {
  if (!v.trim()) return null;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const str = (v: number | null | undefined) => (v == null ? '' : String(v));

/** Saat uyğunsuzluğu (SPEC §6.4, §6.8): hesablanmış (dəq × təkrar / 60) ilə daxil edilmiş saat > 5% fərqlidir. */
export function hoursMismatch(min: number | null, freq: number | null, hours: number | null): number | null {
  if (min == null || freq == null || hours == null || hours === 0) return null;
  const calc = (min * freq) / 60;
  return Math.abs(hours - calc) / hours > 0.05 ? calc : null;
}

/** Tapşırıq paneli: yeni (id = 'new') və ya mövcud tapşırığın bütün sahələri, tarixçə, əməliyyatlar. */
export function TaskDrawer({
  id,
  preset,
  onClose,
}: {
  id: string;
  preset?: { owner?: string; company?: string };
  onClose: () => void;
}) {
  const { t } = useI18n();
  const tasks = useData((st) => st.data.tasks);
  const log = useData((st) => st.data.log);
  const task = id === 'new' ? null : (tasks.find((x) => x.id === id) ?? null);
  const isNew = id === 'new';
  const { canEdit } = useCan();

  const [v, setV] = useState(() => ({
    company: task?.company ?? preset?.company ?? 'Birbank',
    process: task?.process ?? '',
    category: task?.category ?? '',
    task: task?.task ?? '',
    description: task?.description ?? '',
    min_per_key: str(task?.min_per_key),
    annual_freq: str(task?.annual_freq),
    unit: task?.unit ?? 'say',
    hours: str(task?.hours ?? null),
    after_opt: str(task?.after_opt),
  }));
  const [owner, setOwner] = useState(task ? curOwner(task) : (preset?.owner ?? ''));
  const [touched, setTouched] = useState(false);
  const [dialog, setDialog] = useState<null | 'transfer' | 'cancel' | 'delete'>(null);

  const options = useMemo(() => {
    const uniq = (k: keyof TaskDoc) =>
      [...new Set(tasks.map((x) => String(x[k] ?? '')).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'az'));
    return {
      company: [...new Set(['Birbank', 'Pashapay', ...uniq('company')])],
      process: uniq('process'),
      category: uniq('category'),
    };
  }, [tasks]);
  const history = useMemo(
    () =>
      task
        ? log
            .filter((l) => l.task_id === task.id)
            .slice()
            .reverse()
        : [],
    [log, task],
  );

  if (!isNew && !task)
    return (
      <Drawer title={t('page.notFound')} onClose={onClose} closeLabel={t('common.close')}>
        <p className={s.empty}>{t('task.notFound')}</p>
      </Drawer>
    );

  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => {
    const val = e.target.value;
    setV((p) => {
      const next = { ...p, [k]: val };
      // v1 davranışı: dəqiqə və təkrar daxil ediləndə saat avtomatik hesablanır
      if (k === 'min_per_key' || k === 'annual_freq') {
        const m = num(next.min_per_key);
        const fr = num(next.annual_freq);
        if (m != null && fr != null) next.hours = String(+((m * fr) / 60).toFixed(2));
      }
      return next;
    });
  };
  const errors = {
    process: !v.process.trim() ? t('task.required') : '',
    task: !v.task.trim() ? t('task.required') : '',
    owner: !owner.trim() ? t('task.ownerRequired') : '',
    hours: v.hours.trim() && num(v.hours) == null ? t('task.badNumber') : '',
  };
  const invalid = Object.values(errors).some(Boolean);
  const mismatch = hoursMismatch(num(v.min_per_key), num(v.annual_freq), num(v.hours));

  const save = () => {
    setTouched(true);
    if (invalid) return;
    const values = {
      company: v.company.trim() || 'Birbank',
      process: v.process.trim(),
      category: v.category.trim(),
      task: v.task.trim(),
      description: v.description.trim(),
      min_per_key: num(v.min_per_key),
      annual_freq: num(v.annual_freq),
      unit: v.unit.trim() || 'say',
      hours: num(v.hours) ?? 0,
      after_opt: num(v.after_opt),
    };
    const res = actions.saveTask(task, values, owner);
    onClose();
    if (res)
      toast(isNew ? t('toast.created') : t('toast.saved'), {
        action: { label: t('top.undo'), fn: () => dataStore.getState().undoLast() },
      });
  };

  const err = (k: keyof typeof errors) =>
    touched && errors[k] ? (
      <span className={f.error} id={`err-${k}`}>
        {errors[k]}
      </span>
    ) : null;
  const inv = (k: keyof typeof errors) => (touched && errors[k] ? { 'aria-invalid': true, 'aria-describedby': `err-${k}` } : {});

  return (
    <>
      <Drawer
        title={isNew ? t('task.new') : task!.task}
        subtitle={
          task && (
            <span className={s.meta}>
              <span>{task.id}</span>
              <CompanyBadge company={task.company} />
              <StatusBadge status={statusOf(task)} />
            </span>
          )
        }
        onClose={onClose}
        closeLabel={t('common.close')}
        footer={
          canEdit ? (
            <>
              {task && (
                <>
                  <Button variant="ghost" onClick={() => setDialog('delete')}>
                    <Trash2 size={16} aria-hidden="true" /> {t('task.delete')}
                  </Button>
                  {task.is_cancelled ? (
                    <Button
                      variant="success"
                      onClick={() => {
                        actions.setCancelled([task.id], false);
                        toast(t('toast.restored', { n: 1 }), {
                          action: { label: t('top.undo'), fn: () => dataStore.getState().undoLast() },
                        });
                      }}
                    >
                      <RotateCcw size={16} aria-hidden="true" /> {t('task.restore')}
                    </Button>
                  ) : (
                    <Button variant="danger" onClick={() => setDialog('cancel')}>
                      <Ban size={16} aria-hidden="true" /> {t('task.cancel')}
                    </Button>
                  )}
                  <Button onClick={() => setDialog('transfer')}>
                    <ArrowRightLeft size={16} aria-hidden="true" /> {t('task.transfer')}
                  </Button>
                </>
              )}
              <span className={s.spacer} />
              <Button variant="primary" onClick={save}>
                <Save size={16} aria-hidden="true" /> {t('common.save')}
              </Button>
            </>
          ) : undefined
        }
      >
        <form
          className={f.grid}
          // Yalnız baxış rolunda sahələr dəyişdirilə bilmir
          inert={!canEdit || undefined}
          onSubmit={(e) => {
            e.preventDefault();
            if (canEdit) save();
          }}
        >
          <div className={`${f.field} ${f.full}`}>
            <label className={f.label} htmlFor="tf-task">
              {t('field.task')}
            </label>
            <input
              id="tf-task"
              className={f.input}
              value={v.task}
              onChange={set('task')}
              maxLength={2000}
              data-autofocus={isNew ? '' : undefined}
              {...inv('task')}
            />
            {err('task')}
          </div>
          <div className={f.field}>
            <label className={f.label} htmlFor="tf-process">
              {t('field.process')}
            </label>
            <input
              id="tf-process"
              className={f.input}
              list="dl-process"
              value={v.process}
              onChange={set('process')}
              maxLength={2000}
              {...inv('process')}
            />
            {err('process')}
          </div>
          <div className={f.field}>
            <label className={f.label} htmlFor="tf-category">
              {t('field.category')}
            </label>
            <input
              id="tf-category"
              className={f.input}
              list="dl-category"
              value={v.category}
              onChange={set('category')}
              maxLength={2000}
            />
          </div>
          <div className={f.field}>
            <label className={f.label} htmlFor="tf-company">
              {t('field.company')}
            </label>
            <input
              id="tf-company"
              className={f.input}
              list="dl-company"
              value={v.company}
              onChange={set('company')}
              maxLength={200}
            />
          </div>
          <div>
            <EmployeePicker label={t('field.owner_after')} value={owner} onChange={setOwner} />
            {err('owner')}
          </div>
          <div className={`${f.field} ${f.full}`}>
            <label className={f.label} htmlFor="tf-desc">
              {t('field.description')}
            </label>
            <textarea id="tf-desc" className={f.input} value={v.description} onChange={set('description')} maxLength={2000} />
          </div>
          <div className={f.field}>
            <label className={f.label} htmlFor="tf-min">
              {t('field.min_per_key')}
            </label>
            <input id="tf-min" className={f.input} inputMode="decimal" value={v.min_per_key} onChange={set('min_per_key')} />
          </div>
          <div className={f.field}>
            <label className={f.label} htmlFor="tf-freq">
              {t('field.annual_freq')}
            </label>
            <div className={f.row}>
              <input id="tf-freq" className={f.input} inputMode="decimal" value={v.annual_freq} onChange={set('annual_freq')} />
              <input
                aria-label={t('field.unit')}
                className={f.input}
                style={{ width: 90 }}
                value={v.unit}
                onChange={set('unit')}
                maxLength={50}
              />
            </div>
          </div>
          <div className={f.field}>
            <label className={f.label} htmlFor="tf-hours">
              {t('field.hours')}
            </label>
            <input
              id="tf-hours"
              className={f.input}
              inputMode="decimal"
              value={v.hours}
              onChange={set('hours')}
              {...inv('hours')}
            />
            {err('hours')}
          </div>
          <div className={f.field}>
            <label className={f.label} htmlFor="tf-opt">
              {t('field.after_opt')}
            </label>
            <input id="tf-opt" className={f.input} inputMode="decimal" value={v.after_opt} onChange={set('after_opt')} />
          </div>
          {mismatch != null && (
            <div className={`${f.warn} ${f.full}`} role="status">
              <AlertTriangle size={16} aria-hidden="true" />
              <div>
                {t('task.mismatch', { calc: formatNumber(mismatch, 2), hours: v.hours })}{' '}
                <Button size="sm" onClick={() => setV((p) => ({ ...p, hours: String(+mismatch.toFixed(2)) }))}>
                  {t('task.useCalc')}
                </Button>
              </div>
            </div>
          )}
          {task?.owner_before && task.owner_before !== curOwner(task) && (
            <p className={`${f.hint} ${f.full}`}>{t('task.originalOwner', { name: task.owner_before })}</p>
          )}
          <button type="submit" hidden />
          <datalist id="dl-process">
            {options.process.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
          <datalist id="dl-category">
            {options.category.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
          <datalist id="dl-company">
            {options.company.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </form>

        {task && (
          <section className={s.section} aria-labelledby="hist-h">
            <h3 id="hist-h">{t('task.history')}</h3>
            {history.length ? (
              <ul className={s.history}>
                {history.map((l) => (
                  <li key={l.id}>
                    <span className={s.when}>{formatDateTime(l.ts)}</span>
                    <span className={s.what}>
                      <b>{l.action}</b>
                      {l.from && l.to ? `${l.from} → ${l.to}` : l.from || l.to}
                      {l.comment && ` · “${l.comment}”`}
                      {l.user && ` · ${l.user}`}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={s.empty}>{t('task.noHistory')}</p>
            )}
            {task.updated_by && (
              <p className={f.hint}>
                {t('task.lastChange', { who: task.updated_by, when: formatDateTime(task.updated_at ?? '') })}
              </p>
            )}
          </section>
        )}
      </Drawer>
      {dialog === 'transfer' && task && <TransferDialog ids={[task.id]} onClose={() => setDialog(null)} onDone={onClose} />}
      {dialog === 'cancel' && task && <CancelDialog ids={[task.id]} onClose={() => setDialog(null)} onDone={onClose} />}
      {dialog === 'delete' && task && (
        <Modal
          title={t('task.deleteTitle')}
          onClose={() => setDialog(null)}
          footer={
            <>
              <Button onClick={() => setDialog(null)}>{t('common.cancel')}</Button>
              <Button
                variant="danger"
                onClick={() => {
                  actions.deleteTasks([task.id]);
                  setDialog(null);
                  onClose();
                  toast(t('toast.deleted', { n: 1 }), {
                    action: { label: t('top.undo'), fn: () => dataStore.getState().undoLast() },
                  });
                }}
              >
                <Trash2 size={16} aria-hidden="true" /> {t('task.delete')}
              </Button>
            </>
          }
        >
          <p>{t('task.deleteBody')}</p>
        </Modal>
      )}
    </>
  );
}
