import { useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, ArrowRightLeft } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { EmployeePicker } from '../../components/EmployeePicker';
import { LoadChip } from '../../components/Badges';
import { useI18n } from '../../lib/i18n';
import { toast } from '../../lib/toast';
import { actions, dataStore, useData } from '../../store';
import { useMetrics } from '../../hooks/useMetrics';
import { curOwner, taskLabel } from '../../../shared/model';
import { levelOf } from '../../../shared/metrics';
import { fmtHours } from '../../../shared/format';
import f from '../../components/Form.module.css';
import s from './dialogs.module.css';

/** Ötürmə dialoqu (SPEC §6.4): qəbul edənlər yük faizi ilə, seçiləndə "əvvəl → sonra" təsiri. */
export function TransferDialog({ ids, onClose, onDone }: { ids: string[]; onClose: () => void; onDone?: () => void }) {
  const { t } = useI18n();
  const all = useData((st) => st.data.tasks);
  const employees = useData((st) => st.data.employees);
  const { loads, settings } = useMetrics();
  const list = useMemo(() => all.filter((x) => ids.includes(x.id)), [all, ids]);
  const owners = useMemo(() => [...new Set(list.map(curOwner))], [list]);
  const moveH = list.filter((x) => !x.is_cancelled).reduce((a, x) => a + x.hours, 0);
  const [to, setTo] = useState('');
  const [comment, setComment] = useState('');

  const capOf = (name: string) => {
    const l = loads.get(name);
    if (l) return l.cap;
    const e = employees.find((x) => x.name === name);
    return settings.norm * (e ? e.fte : 1);
  };
  const isGroup = (name: string) => !!employees.find((x) => x.name === name)?.is_group;
  const incoming = list.filter((x) => !x.is_cancelled && curOwner(x) !== to).reduce((a, x) => a + x.hours, 0);
  const before = loads.get(to)?.hours ?? 0;
  const cap = to ? capOf(to) : 1;
  const after = before + incoming;
  const ratio = (h: number, c: number) => (c > 0 ? h / c : h > 0 ? Infinity : 0);

  const submit = () => {
    if (!to) return;
    const n = actions.transferTasks(ids, to, comment.trim());
    onClose();
    onDone?.();
    if (n)
      toast(t('toast.transferred', { n, to }), { action: { label: t('top.undo'), fn: () => dataStore.getState().undoLast() } });
  };

  return (
    <Modal
      title={t('transfer.title')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={submit} disabled={!to}>
            <ArrowRightLeft size={16} aria-hidden="true" /> {t('transfer.submit')}
          </Button>
        </>
      }
    >
      <p className={s.lead}>
        <b>{list.length === 1 ? taskLabel(list[0]) : t('transfer.many', { n: list.length })}</b>
        <br />
        <span className={s.muted}>{t('transfer.current', { owners: owners.join(', '), h: fmtHours(moveH) })}</span>
      </p>
      <div className={f.grid}>
        <div className={f.full}>
          <EmployeePicker
            label={t('transfer.to')}
            value={to}
            onChange={setTo}
            exclude={owners.length === 1 ? owners : []}
            initialFocus
          />
        </div>
        <div className={`${f.field} ${f.full}`}>
          <label className={f.label} htmlFor="tr-comment">
            {t('transfer.comment')}
          </label>
          <input
            id="tr-comment"
            className={f.input}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('transfer.commentPh')}
            maxLength={2000}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </div>
      </div>
      <div className={s.impact} aria-live="polite">
        {!to ? (
          <span className={s.muted}>{t('transfer.pick')}</span>
        ) : (
          <>
            <div className={s.row}>
              <b>{to}</b>
              <span className={s.arrow}>
                <LoadChip load={ratio(before, cap)} level={levelOf(ratio(before, cap), settings.warn)} />
                <ArrowRight size={14} aria-hidden="true" />
                <LoadChip load={ratio(after, cap)} level={levelOf(ratio(after, cap), settings.warn)} />
              </span>
            </div>
            <div className={s.row}>
              <span className={s.muted}>{t('transfer.hours', { before: fmtHours(before), after: fmtHours(after) })}</span>
            </div>
            {owners
              .filter((o) => o !== to)
              .map((o) => {
                const oc = capOf(o);
                const ob = loads.get(o)?.hours ?? 0;
                const out = list.filter((x) => !x.is_cancelled && curOwner(x) === o).reduce((a, x) => a + x.hours, 0);
                return (
                  <div className={s.row} key={o}>
                    <span>{o}</span>
                    <span className={s.arrow}>
                      <LoadChip load={ratio(ob, oc)} level={levelOf(ratio(ob, oc), settings.warn)} />
                      <ArrowRight size={14} aria-hidden="true" />
                      <LoadChip load={ratio(ob - out, oc)} level={levelOf(ratio(ob - out, oc), settings.warn)} />
                    </span>
                  </div>
                );
              })}
            {ratio(after, cap) > 1 && !isGroup(to) && (
              <div className={s.alert}>
                <AlertCircle size={16} aria-hidden="true" /> {t('transfer.over', { to })}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
