import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Save, Trash2 } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { useI18n } from '../../lib/i18n';
import { toast } from '../../lib/toast';
import { actions, dataStore, useData } from '../../store';
import { ACT_ADMIN, ACT_PROJECT } from '../../../shared/constants';
import { fold } from '../../../shared/search';
import f from '../../components/Form.module.css';

/** Yeni əməkdaş / profil redaktəsi. Mövcud başqa ad yazılarsa iki profil birləşdirilir (önizləmə ilə — SPEC §6.3 QM). */
export function EmployeeDialog({ name, onClose }: { name: string | null; onClose: () => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const employees = useData((st) => st.data.employees);
  const tasks = useData((st) => st.data.tasks);
  const cur = name ? employees.find((e) => e.name === name) : undefined;
  const [v, setV] = useState({
    name: cur?.name ?? '',
    company: cur?.company ?? 'Birbank',
    activity: cur?.activity ?? ACT_ADMIN,
    fte: String(cur?.fte ?? 1),
    is_group: cur?.is_group ?? false,
  });
  const [touched, setTouched] = useState(false);

  const companies = useMemo(
    () => [...new Set(['Birbank', 'Pashapay', 'Birmarket', ...employees.map((e) => e.company)])].filter(Boolean),
    [employees],
  );
  const own = useMemo(() => (name ? tasks.filter((x) => x.owner_before === name || x.owner_after === name) : []), [tasks, name]);
  const trimmed = v.name.trim();
  const target = trimmed !== name ? employees.find((e) => e.name === trimmed) : undefined;
  const similar = !target && trimmed ? employees.find((e) => e.name !== name && fold(e.name) === fold(trimmed)) : undefined;
  const fte = Number(v.fte.replace(',', '.'));
  const errors = {
    name: !trimmed ? t('task.required') : !name && target ? t('emp.exists') : '',
    fte: !Number.isFinite(fte) || fte < 0 || fte > 5 ? t('emp.badFte') : '',
  };
  const invalid = Object.values(errors).some(Boolean);
  const mergeHours = own.filter((x) => !x.is_cancelled).reduce((a, x) => a + x.hours, 0);

  const save = () => {
    setTouched(true);
    if (invalid) return;
    const res = actions.saveEmployee(name, {
      name: trimmed,
      company: v.company.trim() || 'Birbank',
      activity: v.activity,
      fte,
      is_group: v.is_group,
      active: cur?.active ?? true,
    });
    onClose();
    const undo = { label: t('top.undo'), fn: () => dataStore.getState().undoLast() };
    if (res === 'created') toast(t('toast.empCreated', { name: trimmed }), { action: undo });
    if (res === 'updated') toast(t('toast.saved'), { action: undo });
    if (res === 'merged') toast(t('toast.merged', { from: name ?? '', to: trimmed }), { action: undo });
    if (name && trimmed !== name && (res === 'updated' || res === 'merged'))
      navigate(`/employees/${encodeURIComponent(trimmed)}`, { replace: true });
  };

  return (
    <Modal
      title={name ? t('emp.editTitle', { name }) : t('emp.new')}
      onClose={onClose}
      footer={
        <>
          {name && own.length === 0 && (
            <Button
              variant="ghost"
              onClick={() => {
                actions.deleteEmployee(name);
                onClose();
                navigate('/employees');
                toast(t('toast.empDeleted', { name }), {
                  action: { label: t('top.undo'), fn: () => dataStore.getState().undoLast() },
                });
              }}
            >
              <Trash2 size={16} aria-hidden="true" /> {t('task.delete')}
            </Button>
          )}
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={save}>
            <Save size={16} aria-hidden="true" /> {target ? t('emp.merge') : t('common.save')}
          </Button>
        </>
      }
    >
      <form
        className={f.grid}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className={`${f.field} ${f.full}`}>
          <label className={f.label} htmlFor="em-name">
            {t('field.name')}
          </label>
          <input
            id="em-name"
            data-autofocus
            className={f.input}
            value={v.name}
            maxLength={200}
            onChange={(e) => setV({ ...v, name: e.target.value })}
            aria-invalid={touched && !!errors.name}
          />
          {touched && errors.name && <span className={f.error}>{errors.name}</span>}
        </div>
        <div className={f.field}>
          <label className={f.label} htmlFor="em-company">
            {t('field.company')}
          </label>
          <input
            id="em-company"
            className={f.input}
            list="dl-em-co"
            value={v.company}
            maxLength={200}
            onChange={(e) => setV({ ...v, company: e.target.value })}
          />
          <datalist id="dl-em-co">
            {companies.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className={f.field}>
          <label className={f.label} htmlFor="em-act">
            {t('field.activity')}
          </label>
          <select id="em-act" className={f.input} value={v.activity} onChange={(e) => setV({ ...v, activity: e.target.value })}>
            <option value={ACT_ADMIN}>{ACT_ADMIN}</option>
            <option value={ACT_PROJECT}>{ACT_PROJECT}</option>
          </select>
        </div>
        <div className={f.field}>
          <label className={f.label} htmlFor="em-fte">
            {t('field.fte')}
          </label>
          <input
            id="em-fte"
            className={f.input}
            inputMode="decimal"
            value={v.fte}
            onChange={(e) => setV({ ...v, fte: e.target.value })}
            aria-invalid={touched && !!errors.fte}
          />
          <span className={touched && errors.fte ? f.error : f.hint}>
            {touched && errors.fte ? errors.fte : t('emp.fteHint')}
          </span>
        </div>
        <div className={f.field}>
          <span className={f.label}>{t('emp.kind')}</span>
          <label className={f.check}>
            <input type="checkbox" checked={v.is_group} onChange={(e) => setV({ ...v, is_group: e.target.checked })} />{' '}
            {t('emp.isGroup')}
          </label>
        </div>
        {name && target && (
          <div className={`${f.warn} ${f.full}`} role="status">
            {t('emp.mergePreview', { from: name, to: trimmed, n: own.length, h: Math.round(mergeHours) })}
          </div>
        )}
        {name && !target && trimmed && trimmed !== name && (
          <p className={`${f.hint} ${f.full}`}>{t('emp.renameHint', { n: own.length })}</p>
        )}
        {similar && <p className={`${f.hint} ${f.full}`}>{t('emp.similar', { name: similar.name })}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
