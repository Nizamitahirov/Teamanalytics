import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { FileDown } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { formatDateTime } from '../../lib/dates';
import { api } from '../../lib/api';
import { downloadText, today } from '../../lib/excel';
import { useData } from '../../store';
import { Button } from '../../components/Button';
import { filterLog } from '../../../shared/report';
import { toCsv } from '../../../shared/excel';
import type { LogEntry } from '../../../shared/schema';
import { ReportFrame } from './ReportFrame';
import f from '../../components/Form.module.css';
import s from './Reports.module.css';

const SHOW = 1000;

/** Jurnal hesabatı (SPEC §6.7): dövr, istifadəçi, əməliyyat; tam jurnal serverdən (GET /api/log). */
export function LogReportPage() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const local = useData((st) => st.data.log);
  const [full, setFull] = useState<LogEntry[] | null>(null);
  useEffect(() => {
    let alive = true;
    api<{ log: LogEntry[] }>('/api/log')
      .then((r) => alive && setFull(r.log))
      .catch(() => alive && setFull(null));
    return () => {
      alive = false;
    };
  }, []);
  const all = full ?? local;
  const q = {
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    user: params.get('user') ?? '',
    action: params.get('action') ?? '',
  };
  const set = (k: string, v: string) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (v) n.set(k, v);
        else n.delete(k);
        return n;
      },
      { replace: true },
    );
  const list = useMemo(() => filterLog(all, q), [all, q.from, q.to, q.user, q.action]); // eslint-disable-line react-hooks/exhaustive-deps
  const users = useMemo(() => [...new Set(all.map((l) => l.user).filter(Boolean))].sort() as string[], [all]);
  const actionsList = useMemo(() => [...new Set(all.map((l) => l.action).filter(Boolean))].sort(), [all]);
  const period = q.from || q.to ? `${q.from || '…'} — ${q.to || '…'}` : t('rep.log.allTime');

  const csv = () =>
    downloadText(
      toCsv([
        ['Tarix', 'İstifadəçi', 'Əməliyyat', 'Tapşırıq', 'id', 'Kimdən', 'Kimə', 'Şərh'],
        ...list.map((l) => [
          l.ts,
          l.user ?? '',
          l.action,
          l.task_label ?? '',
          l.task_id ?? '',
          l.from ?? '',
          l.to ?? '',
          l.comment ?? '',
        ]),
      ]),
      `jurnal-${today()}.csv`,
    );

  return (
    <ReportFrame
      title={t('rep.log.title')}
      subtitle={t('rep.log.count', { n: list.length })}
      meta={
        <div>
          <dt>{t('rep.log.period')}</dt>
          <dd>{period}</dd>
        </div>
      }
      toolbar={
        <Button onClick={csv}>
          <FileDown size={16} aria-hidden="true" /> CSV
        </Button>
      }
    >
      <div className={s.filters} data-print-hide style={{ marginTop: 16 }}>
        <label className="visually-hidden" htmlFor="lr-from">
          {t('rep.log.from')}
        </label>
        <input
          id="lr-from"
          type="date"
          className={f.input}
          value={q.from}
          onChange={(e) => set('from', e.target.value)}
          aria-label={t('rep.log.from')}
        />
        <label className="visually-hidden" htmlFor="lr-to">
          {t('rep.log.to')}
        </label>
        <input
          id="lr-to"
          type="date"
          className={f.input}
          value={q.to}
          onChange={(e) => set('to', e.target.value)}
          aria-label={t('rep.log.to')}
        />
        <select className={f.input} value={q.user} onChange={(e) => set('user', e.target.value)} aria-label={t('rep.log.user')}>
          <option value="">{t('rep.log.allUsers')}</option>
          {users.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
        <select
          className={f.input}
          value={q.action}
          onChange={(e) => set('action', e.target.value)}
          aria-label={t('rep.log.action')}
        >
          <option value="">{t('rep.log.allActions')}</option>
          {actionsList.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </div>
      <table className={s.table} style={{ marginTop: 16 }} data-testid="rep-log">
        <thead>
          <tr>
            <th scope="col">{t('rep.date')}</th>
            <th scope="col">{t('rep.log.user')}</th>
            <th scope="col">{t('rep.log.action')}</th>
            <th scope="col">{t('field.task')}</th>
            <th scope="col">{t('rep.log.change')}</th>
          </tr>
        </thead>
        <tbody>
          {list.slice(0, SHOW).map((l, i) => (
            <tr key={l.id ?? i}>
              <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(l.ts)}</td>
              <td>{l.user}</td>
              <td>{l.action}</td>
              <td>{l.task_label}</td>
              <td>
                {l.from || l.to ? `${l.from ?? ''} → ${l.to ?? ''}` : ''}
                {l.comment ? ` «${l.comment}»` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {list.length > SHOW && <p className={s.muted}>{t('picker.more', { n: list.length - SHOW })}</p>}
    </ReportFrame>
  );
}
