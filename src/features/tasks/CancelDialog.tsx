import { useMemo, useState } from 'react';
import { Ban } from 'lucide-react';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { useI18n } from '../../lib/i18n';
import { toast } from '../../lib/toast';
import { actions, dataStore, useData } from '../../store';
import { taskLabel } from '../../../shared/model';
import { fmtFte, fmtHours } from '../../../shared/format';
import f from '../../components/Form.module.css';
import s from './dialogs.module.css';

/** Ləğv (silmə deyil — istənilən vaxt bərpa olunur). */
export function CancelDialog({ ids, onClose, onDone }: { ids: string[]; onClose: () => void; onDone?: () => void }) {
  const { t } = useI18n();
  const all = useData((st) => st.data.tasks);
  const list = useMemo(() => all.filter((x) => ids.includes(x.id) && !x.is_cancelled), [all, ids]);
  const norm = useData((st) => st.data.settings.norm);
  const [comment, setComment] = useState('');
  const h = list.reduce((a, x) => a + x.hours, 0);
  const submit = () => {
    const n = actions.setCancelled(ids, true, comment.trim());
    onClose();
    onDone?.();
    if (n) toast(t('toast.cancelled', { n }), { action: { label: t('top.undo'), fn: () => dataStore.getState().undoLast() } });
  };
  return (
    <Modal
      title={t('cancel.title')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={submit} disabled={!list.length}>
            <Ban size={16} aria-hidden="true" /> {t('cancel.submit')}
          </Button>
        </>
      }
    >
      <p className={s.lead}>
        <b>{list.length === 1 ? taskLabel(list[0]) : t('transfer.many', { n: list.length })}</b> —{' '}
        {t('cancel.saving', { h: fmtHours(h), fte: fmtFte(h / norm, 2) })}
      </p>
      <div className={f.field}>
        <label className={f.label} htmlFor="cn-comment">
          {t('cancel.reason')}
        </label>
        <input
          id="cn-comment"
          data-autofocus
          className={f.input}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={t('cancel.reasonPh')}
          maxLength={2000}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <span className={f.hint}>{t('cancel.hint')}</span>
      </div>
    </Modal>
  );
}
