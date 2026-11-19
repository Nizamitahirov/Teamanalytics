import { useI18n } from '../../lib/i18n';
import { Modal } from '../../components/Modal';
import { Button } from '../../components/Button';
import { useData, dataStore } from '../../store';
import { EMP_FIELDS, TASK_FIELDS } from '../../../shared/model';
import { formatNumber } from '../../../shared/format';
import type { MessageKey } from '../../../shared/i18n/az';
import s from './ConflictDialog.module.css';

/** Versiya ziddiyyəti dialoqu (SPEC §4.3): "Bu qeydi X indicə dəyişdi: [Onun versiyası] [Mənimki]". */
export function ConflictDialog() {
  const { t } = useI18n();
  const conflicts = useData((st) => st.conflicts);
  const c = conflicts[0];
  if (!c) return null;

  const fields = (c.table === 'Tasks' ? TASK_FIELDS : EMP_FIELDS).filter((f) => f !== 'updated_at');
  const mine = c.mine as Record<string, unknown> | null;
  const theirs = c.theirs;
  const show = (v: unknown) =>
    v === true
      ? t('common.yes')
      : v === false
        ? t('common.no')
        : typeof v === 'number'
          ? formatNumber(v, v % 1 ? 2 : 0)
          : v == null || v === ''
            ? '—'
            : String(v);
  const differs = (f: string) =>
    (mine?.[f] ?? null) !== (theirs?.[f] ?? null) && String(mine?.[f] ?? '') !== String(theirs?.[f] ?? '');
  // Fərqli sahələr yuxarıda; eyni olanlardan yalnız əsas identifikasiya sahələri
  const rows = fields.filter((f) => differs(f) || ['task', 'process', 'name'].includes(f));

  return (
    <Modal
      title={t('conflict.title')}
      footer={
        <>
          <Button variant="secondary" onClick={() => dataStore.getState().resolveConflict(c, 'theirs')}>
            {t('conflict.theirs')}
          </Button>
          <Button variant="primary" onClick={() => dataStore.getState().resolveConflict(c, 'mine')}>
            {t('conflict.mine')}
          </Button>
        </>
      }
    >
      <p className={s.lead}>{t('conflict.body', { label: c.label, by: c.by || t('conflict.someone') })}</p>
      <table className={s.table}>
        <thead>
          <tr>
            <th scope="col">{t('conflict.field')}</th>
            <th scope="col">{t('conflict.theirs')}</th>
            <th scope="col">{t('conflict.mine')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((f) => (
            <tr key={f} className={differs(f) ? s.diff : undefined}>
              <th scope="row">{t(`field.${f}` as MessageKey)}</th>
              <td>{theirs ? show(theirs[f]) : t('conflict.deleted')}</td>
              <td>{mine ? show(mine[f]) : t('conflict.removedByMe')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {conflicts.length > 1 && <p className={s.more}>{t('conflict.more', { n: conflicts.length - 1 })}</p>}
    </Modal>
  );
}
