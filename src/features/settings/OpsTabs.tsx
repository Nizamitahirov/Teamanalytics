import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { DatabaseBackup, History, RefreshCw } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { toast } from '../../lib/toast';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/dates';
import { versionLabel } from '../../lib/ops';
import { dataStore, useData } from '../../store';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import {
  diffOps,
  normalizeEmployee,
  normalizeSettings,
  normalizeTask,
  type EmployeeDoc,
  type TaskDoc,
} from '../../../shared/model';
import { formatNumber } from '../../../shared/format';
import f from '../../components/Form.module.css';
import s from './SettingsPage.module.css';

type BackupRow = { date: string; created: string; parts: number; tasks: number; employees: number; size: number };
type BackupPayload = {
  date: string;
  tasks: Record<string, unknown>[];
  employees: Record<string, unknown>[];
  settings: Record<string, unknown>;
};
const err = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Ayarlar → Data (SPEC §6.10, admin): backup siyahısı (30 gün), "İndi backup et", backup-dan bərpa (önizləmə + iki təsdiq). */
export function DataTab() {
  const { t } = useI18n();
  const [list, setList] = useState<BackupRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<BackupPayload | null>(null);
  const load = useCallback(async () => {
    try {
      setList((await api<{ backups: BackupRow[] }>('/api/snapshots?backups=1')).backups);
    } catch (e) {
      toast(err(e), { kind: 'error' });
      setList([]);
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- serverdən siyahı (xarici sistem)
    void load();
  }, [load]);
  const runNow = async () => {
    setBusy(true);
    try {
      await api('/api/snapshots', { json: { action: 'run' } });
      toast(t('ops.backupDone'));
      await load();
    } catch (e) {
      toast(err(e), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const open = async (date: string) => {
    setBusy(true);
    try {
      setPreview((await api<{ backup: BackupPayload }>(`/api/snapshots?backup=${date}`)).backup);
    } catch (e) {
      toast(err(e), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={s.card} aria-labelledby="data-h">
      <h2 id="data-h">{t('set.tab.data')}</h2>
      <p className={f.hint}>{t('ops.backupHint')}</p>
      <div className={s.opsActions}>
        <Button variant="primary" onClick={() => void runNow()} disabled={busy}>
          <DatabaseBackup size={16} aria-hidden="true" /> {t('ops.backupNow')}
        </Button>
        <Link className={s.opsLink} to="/reports">
          {t('ops.excelLink')}
        </Link>
      </div>
      <h3>{t('ops.backups')}</h3>
      {!list ? (
        <p className={f.hint}>{t('state.loading')}</p>
      ) : !list.length ? (
        <p className={f.hint}>{t('ops.noBackups')}</p>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table} data-testid="backups">
            <thead>
              <tr>
                <th scope="col">{t('rep.date')}</th>
                <th scope="col">{t('ops.created')}</th>
                <th scope="col">{t('nav.tasks')}</th>
                <th scope="col">{t('nav.employees')}</th>
                <th scope="col">{t('ops.size')}</th>
                <th scope="col">
                  <span className="visually-hidden">{t('ops.restore')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((b) => (
                <tr key={b.date}>
                  <td>{b.date}</td>
                  <td>{b.created ? formatDateTime(b.created) : '—'}</td>
                  <td>{b.tasks}</td>
                  <td>{b.employees}</td>
                  <td>{formatNumber(Math.round(b.size / 1024))} KB</td>
                  <td>
                    <Button size="sm" onClick={() => void open(b.date)} disabled={busy}>
                      <History size={14} aria-hidden="true" /> {t('ops.previewRestore')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {preview && <RestoreDialog backup={preview} onClose={() => setPreview(null)} onDone={() => void load()} />}
    </section>
  );
}

/** Bərpa: backup vəziyyəti ilə cari vəziyyət arasındakı fərq diff op-ları ilə yazılır (kolleksiya əvəz olunmur). */
function RestoreDialog({ backup, onClose, onDone }: { backup: BackupPayload; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const data = useData((st) => st.data);
  const [step, setStep] = useState<1 | 2>(1);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const next = useMemo(() => {
    const vers = new Map(data.tasks.map((x) => [x.id, x._v]));
    const ev = new Map(data.employees.map((x) => [x.name, x._v]));
    return {
      tasks: backup.tasks.map((x) => ({ ...normalizeTask(x), _v: vers.get(String(x.id)) ?? 0 })) as TaskDoc[],
      employees: backup.employees.map((x) => ({ ...normalizeEmployee(x), _v: ev.get(String(x.name)) ?? 0 })) as EmployeeDoc[],
      settings: normalizeSettings(backup.settings),
    };
  }, [backup, data]);
  const stats = useMemo(() => {
    const ops = diffOps(data, next);
    const tIds = new Set(data.tasks.map((x) => x.id));
    const eIds = new Set(data.employees.map((x) => x.name));
    const c = { created: 0, changed: 0, deleted: 0, employees: 0, settings: 0 };
    for (const op of ops) {
      if (op.t === 'log') continue;
      if (op.table === 'Settings') c.settings++;
      else if (op.table === 'Employees') c.employees++;
      else if (op.t === 'delete') c.deleted++;
      else if (tIds.has(String(op.row.id))) c.changed++;
      else c.created++;
    }
    void eIds;
    return { ...c, total: ops.length };
  }, [data, next]);

  const restore = async () => {
    setBusy(true);
    try {
      // Təhlükəsizlik: bərpadan əvvəl cari vəziyyətin backup-ı (geri qayıtmaq mümkün olsun)
      await api('/api/snapshots', { json: { action: 'run' } });
      dataStore.getState().commit(
        t('ops.restoredLabel', { date: backup.date }),
        (d) => {
          d.tasks = next.tasks as typeof d.tasks;
          d.employees = next.employees as typeof d.employees;
          d.settings = next.settings;
        },
        [
          {
            action: 'Bərpa',
            task_label: `Backup ${backup.date}: ${stats.changed} dəyişən, ${stats.created} yeni, ${stats.deleted} silinən tapşırıq`,
          },
        ],
      );
      toast(t('ops.restored', { date: backup.date }), {
        action: { label: t('top.undo'), fn: () => dataStore.getState().undoLast() },
      });
      onDone();
      onClose();
    } catch (e) {
      toast(err(e), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={step === 1 ? t('ops.restoreTitle', { date: backup.date }) : t('ops.restoreConfirmTitle')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          {step === 1 ? (
            <Button variant="primary" disabled={!ack || !stats.total} onClick={() => setStep(2)}>
              {t('imp.next')}
            </Button>
          ) : (
            <Button variant="danger" disabled={busy} onClick={() => void restore()}>
              {t('ops.restoreFinal', { date: backup.date })}
            </Button>
          )}
        </>
      }
    >
      {step === 1 ? (
        <>
          <ul className={s.restoreStats} data-testid="restore-stats">
            <li>{t('ops.rs.changed', { n: stats.changed })}</li>
            <li>{t('ops.rs.created', { n: stats.created })}</li>
            <li>{t('ops.rs.deleted', { n: stats.deleted })}</li>
            <li>{t('ops.rs.employees', { n: stats.employees })}</li>
            <li>{t('ops.rs.settings', { n: stats.settings })}</li>
          </ul>
          {!stats.total ? (
            <p className={f.hint}>{t('ops.restoreSame')}</p>
          ) : (
            <label className={f.check}>
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              {t('ops.restoreAck')}
            </label>
          )}
        </>
      ) : (
        <p>{t('ops.restoreConfirmBody', { date: backup.date, n: stats.total })}</p>
      )}
    </Modal>
  );
}

type Health = Record<string, string | null | string[]>;
type ClientError = { id: string; ts: string; user: string; message: string; url: string; version: string };

/** Ayarlar → Texniki xidmət (SPEC §6.10, §14, admin): /api/health nəticəsi və klient xətaları. */
export function MaintTab() {
  const { t } = useI18n();
  const [h, setH] = useState<Health | null>(null);
  const [errors, setErrors] = useState<ClientError[] | null>(null);
  const load = useCallback(async () => {
    const [hh, ee] = await Promise.all([
      api<Health>('/api/health').catch(() => null),
      api<{ errors: ClientError[] }>('/api/health?errors=1').catch(() => ({ errors: [] })),
    ]);
    setH(hh);
    setErrors(ee.errors);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- serverdən vəziyyət (xarici sistem)
    void load();
  }, [load]);
  const row = (k: string, v: unknown) => (
    <div key={k}>
      <dt>{k}</dt>
      <dd>{v == null || v === '' ? '—' : String(v)}</dd>
    </div>
  );
  return (
    <section className={s.card} aria-labelledby="maint-h">
      <h2 id="maint-h">{t('set.tab.maint')}</h2>
      <div className={s.opsActions}>
        <Button onClick={() => void load()}>
          <RefreshCw size={16} aria-hidden="true" /> {t('ops.refresh')}
        </Button>
      </div>
      <dl className={s.kv} data-testid="health">
        {row(t('ops.client'), versionLabel())}
        {row(t('ops.server'), h ? `v${h.version}${h.commit ? ` · ${h.commit}` : ''}` : null)}
        {row('Firestore', h?.firestore ?? null)}
        {row(t('ops.lastSnapshot'), h?.lastSnapshot ? formatDateTime(String(h.lastSnapshot)) : null)}
        {row(t('ops.lastBackup'), h?.lastBackup ? formatDateTime(String(h.lastBackup)) : null)}
        {row('CRON_SECRET', h?.cron_secret ?? null)}
      </dl>
      {h?.cron_secret === 'yoxdur' && <p className={f.hint}>{t('ops.cronHint')}</p>}
      <h3>{t('ops.errors')}</h3>
      {!errors ? (
        <p className={f.hint}>{t('state.loading')}</p>
      ) : !errors.length ? (
        <p className={f.hint}>{t('ops.noErrors')}</p>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th scope="col">{t('rep.date')}</th>
                <th scope="col">{t('rep.log.user')}</th>
                <th scope="col">{t('ops.page')}</th>
                <th scope="col">{t('ops.message')}</th>
              </tr>
            </thead>
            <tbody>
              {errors.map((e) => (
                <tr key={e.id}>
                  <td>{formatDateTime(e.ts)}</td>
                  <td>{e.user}</td>
                  <td>{e.url}</td>
                  <td>{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
