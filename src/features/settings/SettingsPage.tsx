import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { KeyRound, LockOpen, LogOut, Plus, RefreshCw, Trash2, Wand2 } from 'lucide-react';
import { useI18n, type Lang } from '../../lib/i18n';
import { toast } from '../../lib/toast';
import { ApiRequestError, listUsers, userAction } from '../../lib/api';
import { useAuth } from '../../app/auth';
import { useCan } from '../../app/useCan';
import { dataStore, useData } from '../../store';
import { Button, IconButton } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { ChangePasswordForm, MIN_PASSWORD } from '../auth/ChangePasswordForm';
import { SHORTCUTS } from '../palette/CommandPalette';
import { formatDateTime } from '../../lib/dates';
import { formatNumber } from '../../../shared/format';
import { HOURS_PER_DAY } from '../../../shared/constants';
import type { Role, UserRow } from '../../../shared/schema';
import type { MessageKey } from '../../../shared/i18n/az';
import f from '../../components/Form.module.css';
import s from './SettingsPage.module.css';
import { DataTab, MaintTab } from './OpsTabs';
import { StaffCompanyTab } from './StaffCompanyTab';

type Tab = 'account' | 'general' | 'staff' | 'users' | 'data' | 'maint' | 'keys';
const ROLES: Role[] = ['admin', 'editor', 'viewer'];

/** Təhlükəsiz müvəqqəti parol (istifadəçi ilk girişdə dəyişməlidir). */
function tempPassword(): string {
  const a = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = crypto.getRandomValues(new Uint32Array(14));
  return Array.from(r, (x) => a[x % a.length])
    .join('')
    .replace(/(.{4})(.{5})(.{5})/, '$1-$2-$3');
}

/** Ayarlar (SPEC §6.10) — Mərhələ 5: Hesabım, Ümumi, İstifadəçilər (admin), Qısayollar. Siyahılar/Data/Texniki xidmət — sonra. */
export function SettingsPage() {
  const { t } = useI18n();
  const { isAdmin } = useCan();
  const [params, setParams] = useSearchParams();
  const tabs: Tab[] = isAdmin
    ? ['account', 'general', 'staff', 'users', 'data', 'maint', 'keys']
    : ['account', 'general', 'staff', 'keys'];
  const tab = (tabs.includes(params.get('tab') as Tab) ? params.get('tab') : 'account') as Tab;
  return (
    <div className={s.layout}>
      <nav className={s.sub} aria-label={t('nav.settings')}>
        {tabs.map((x) => (
          <button
            key={x}
            type="button"
            aria-current={tab === x ? 'page' : undefined}
            onClick={() => setParams({ tab: x }, { replace: true })}
          >
            {t(`set.tab.${x}` as MessageKey)}
          </button>
        ))}
      </nav>
      <div className={s.body}>
        {tab === 'account' && <Account />}
        {tab === 'general' && <General />}
        {tab === 'staff' && <StaffCompanyTab />}
        {tab === 'users' && isAdmin && <Users />}
        {tab === 'data' && isAdmin && <DataTab />}
        {tab === 'maint' && isAdmin && <MaintTab />}
        {tab === 'keys' && <Keys />}
      </div>
    </div>
  );
}

function Account() {
  const { t } = useI18n();
  const { state, logout } = useAuth();
  if (state.status !== 'ready') return null;
  return (
    <section className={s.card} aria-labelledby="acc-h">
      <h2 id="acc-h">{t('set.tab.account')}</h2>
      <dl className={s.kv}>
        <dt>{t('field.name')}</dt>
        <dd>{state.me.user.name}</dd>
        <dt>{t('set.role')}</dt>
        <dd>{t(`role.${state.me.user.role}`)}</dd>
      </dl>
      <h3>{t('set.changePassword')}</h3>
      <div style={{ maxWidth: 420 }}>
        <ChangePasswordForm onDone={() => toast(t('pw.changed'))} />
      </div>
      <p className={f.hint} style={{ marginTop: 16 }}>
        {t('set.otherDevices')}
      </p>
      <Button variant="ghost" onClick={() => void logout()}>
        <LogOut size={16} aria-hidden="true" /> {t('auth.logout')}
      </Button>
    </section>
  );
}

function General() {
  const { t, lang, setLang } = useI18n();
  const { isAdmin } = useCan();
  const settings = useData((st) => st.data.settings);
  const [norm, setNorm] = useState(String(settings.norm));
  const [warn, setWarn] = useState(String(settings.warn));
  const [vacation, setVacation] = useState(String(settings.vacation_days ?? 30));
  const [approval, setApproval] = useState(settings.approval === 1);
  const [approvalHours, setApprovalHours] = useState(String(settings.approval_hours ?? 40));
  const n = Number(norm.replace(',', '.'));
  const w = Number(warn.replace(',', '.'));
  const ah = Number(approvalHours.replace(',', '.'));
  const vd = Number(vacation.replace(',', '.'));
  const valid =
    Number.isFinite(n) &&
    n >= 100 &&
    n <= 4000 &&
    Number.isFinite(w) &&
    w >= 50 &&
    w <= 100 &&
    Number.isFinite(ah) &&
    ah >= 0 &&
    Number.isInteger(vd) &&
    vd >= 0 &&
    vd <= 60 &&
    n - vd * HOURS_PER_DAY > 0;
  const dirty =
    n !== settings.norm ||
    vd !== (settings.vacation_days ?? 30) ||
    w !== settings.warn ||
    Number(approval) !== (settings.approval ?? 0) ||
    ah !== (settings.approval_hours ?? 40);
  const save = () => {
    if (!valid) return;
    dataStore.getState().commit(
      t('set.saved'),
      (d) => {
        d.settings.norm = n;
        d.settings.vacation_days = vd;
        d.settings.warn = w;
        d.settings.approval = approval ? 1 : 0;
        d.settings.approval_hours = ah;
      },
      [
        {
          action: 'Ayarlar',
          task_label: `Norma ${formatNumber(n)} saat, məzuniyyət ${vd} gün (${formatNumber(vd * HOURS_PER_DAY)} saat) → effektiv ${formatNumber(n - vd * HOURS_PER_DAY)} saat, yüksək yük həddi ${w}%, təsdiq axını ${approval ? `açıq (${formatNumber(ah)}+ saat)` : 'söndürülü'}`,
        },
      ],
    );
    toast(t('set.saved'), { action: { label: t('top.undo'), fn: () => dataStore.getState().undoLast() } });
  };
  return (
    <section className={s.card} aria-labelledby="gen-h">
      <h2 id="gen-h">{t('set.tab.general')}</h2>
      <div className={f.grid} style={{ maxWidth: 560 }}>
        <div className={f.field}>
          <label className={f.label} htmlFor="set-norm">
            {t('set.norm')}
          </label>
          <input
            id="set-norm"
            className={f.input}
            inputMode="decimal"
            value={norm}
            onChange={(e) => setNorm(e.target.value)}
            disabled={!isAdmin}
          />
          <span className={f.hint}>{t('set.normHint')}</span>
        </div>
        <div className={f.field}>
          <label className={f.label} htmlFor="set-vacation">
            {t('set.vacation')}
          </label>
          <input
            id="set-vacation"
            className={f.input}
            inputMode="numeric"
            value={vacation}
            onChange={(e) => setVacation(e.target.value)}
            disabled={!isAdmin}
          />
          <span className={f.hint} data-testid="effective-norm">
            {Number.isFinite(n) && Number.isFinite(vd)
              ? t('set.vacationHint', {
                  gross: formatNumber(n),
                  days: formatNumber(vd),
                  vac: formatNumber(vd * HOURS_PER_DAY),
                  norm: formatNumber(n - vd * HOURS_PER_DAY),
                })
              : ''}
          </span>
        </div>
        <div className={f.field}>
          <label className={f.label} htmlFor="set-warn">
            {t('set.warn')}
          </label>
          <input
            id="set-warn"
            className={f.input}
            inputMode="decimal"
            value={warn}
            onChange={(e) => setWarn(e.target.value)}
            disabled={!isAdmin}
          />
          <span className={f.hint}>{t('set.warnHint')}</span>
        </div>
        <div className={`${f.field} ${f.full}`}>
          <label className={f.check}>
            <input type="checkbox" checked={approval} onChange={(e) => setApproval(e.target.checked)} disabled={!isAdmin} />
            {t('set.approval')}
          </label>
          <span className={f.hint}>{t('set.approvalHint')}</span>
        </div>
        {approval && (
          <div className={f.field}>
            <label className={f.label} htmlFor="set-approval-hours">
              {t('set.approvalHours')}
            </label>
            <input
              id="set-approval-hours"
              className={f.input}
              inputMode="decimal"
              value={approvalHours}
              onChange={(e) => setApprovalHours(e.target.value)}
              disabled={!isAdmin}
            />
          </div>
        )}
        {isAdmin && (
          <div className={f.full}>
            <Button variant="primary" onClick={save} disabled={!valid || !dirty}>
              {t('common.save')}
            </Button>
            {!valid && <span className={f.error}> {t('set.invalid')}</span>}
          </div>
        )}
        {!isAdmin && <p className={`${f.hint} ${f.full}`}>{t('set.adminOnly')}</p>}
        <div className={f.field}>
          <label className={f.label} htmlFor="set-lang">
            {t('login.language')}
          </label>
          <select id="set-lang" className={f.input} value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
            <option value="az">Azərbaycan dili</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>
    </section>
  );
}

type Dlg = { kind: 'add' } | { kind: 'reset'; user: UserRow } | { kind: 'remove'; user: UserRow } | null;

function Users() {
  const { t } = useI18n();
  const { state } = useAuth();
  const me = state.status === 'ready' ? state.me.user.name : '';
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [error, setError] = useState('');
  const [dlg, setDlg] = useState<Dlg>(null);
  // Kilidin bitib-bitmədiyini siyahının yükləndiyi ana görə yoxlayırıq (render zamanı Date.now çağırılmır)
  const [loadedAt, setLoadedAt] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await listUsers();
      setLoadedAt(Date.now());
      setUsers(r.users.sort((a, b) => a.name.localeCompare(b.name, 'az')));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- serverdən siyahının yüklənməsi
    void load();
  }, [load]);

  const run = async (body: Record<string, unknown>, ok: string) => {
    try {
      await userAction(body);
      toast(ok);
      await load();
      return true;
    } catch (e) {
      toast(e instanceof ApiRequestError ? e.message : String(e), { kind: 'error' });
      return false;
    }
  };
  const locked = (u: UserRow) => !!u.locked_until && Date.parse(u.locked_until) > loadedAt;

  return (
    <section className={s.card} aria-labelledby="usr-h">
      <div className={s.head}>
        <h2 id="usr-h">{t('set.tab.users')}</h2>
        <Button variant="primary" onClick={() => setDlg({ kind: 'add' })}>
          <Plus size={16} aria-hidden="true" /> {t('set.addUser')}
        </Button>
      </div>
      {error && <p className={f.error}>{error}</p>}
      {!users ? (
        <p className={f.hint}>{t('state.loading')}</p>
      ) : (
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th scope="col">{t('field.name')}</th>
                <th scope="col">{t('set.role')}</th>
                <th scope="col">{t('set.status')}</th>
                <th scope="col">{t('set.lastLogin')}</th>
                <th scope="col">
                  <span className="visually-hidden">{t('tasks.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} data-user={u.name}>
                  <th scope="row">
                    {u.name}
                    {u.name === me && <span className={s.me}> · {t('set.you')}</span>}
                  </th>
                  <td>
                    <select
                      className={`${f.input} ${s.roleSel}`}
                      aria-label={t('set.roleOf', { name: u.name })}
                      value={u.role}
                      onChange={(e) =>
                        void run({ action: 'role', name: u.name, role: e.target.value }, t('set.roleChanged', { name: u.name }))
                      }
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {t(`role.${r}`)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {locked(u) ? (
                      <span className={s.bad}>{t('set.lockedUntil', { time: formatDateTime(u.locked_until!) })}</span>
                    ) : u.must_change_password ? (
                      <span className={s.warn}>{t('set.mustChange')}</span>
                    ) : (
                      <span className={s.ok}>{t('set.active')}</span>
                    )}
                  </td>
                  <td>{u.last_login ? formatDateTime(u.last_login) : '—'}</td>
                  <td className={s.actions}>
                    {locked(u) && (
                      <IconButton
                        size="sm"
                        variant="secondary"
                        label={t('set.unlock', { name: u.name })}
                        onClick={() => void run({ action: 'unlock', name: u.name }, t('set.unlocked'))}
                      >
                        <LockOpen size={14} aria-hidden="true" />
                      </IconButton>
                    )}
                    <IconButton
                      size="sm"
                      variant="secondary"
                      label={t('set.resetPw', { name: u.name })}
                      onClick={() => setDlg({ kind: 'reset', user: u })}
                    >
                      <KeyRound size={14} aria-hidden="true" />
                    </IconButton>
                    <IconButton
                      size="sm"
                      variant="secondary"
                      label={t('set.revoke', { name: u.name })}
                      onClick={() => void run({ action: 'revoke', name: u.name }, t('set.revoked'))}
                    >
                      <RefreshCw size={14} aria-hidden="true" />
                    </IconButton>
                    {u.name !== me && (
                      <IconButton
                        size="sm"
                        variant="danger"
                        label={t('set.remove', { name: u.name })}
                        onClick={() => setDlg({ kind: 'remove', user: u })}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </IconButton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className={f.hint}>{t('set.rolesHint')}</p>
      {dlg?.kind === 'add' && <AddUser onClose={() => setDlg(null)} onDone={load} />}
      {dlg?.kind === 'reset' && <ResetPassword user={dlg.user} onClose={() => setDlg(null)} onDone={load} />}
      {dlg?.kind === 'remove' && (
        <Modal
          title={t('set.removeTitle', { name: dlg.user.name })}
          onClose={() => setDlg(null)}
          footer={
            <>
              <Button onClick={() => setDlg(null)}>{t('common.cancel')}</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  if (await run({ action: 'remove', name: dlg.user.name }, t('set.removed', { name: dlg.user.name })))
                    setDlg(null);
                }}
              >
                <Trash2 size={16} aria-hidden="true" /> {t('task.delete')}
              </Button>
            </>
          }
        >
          <p>{t('set.removeBody')}</p>
        </Modal>
      )}
    </section>
  );
}

function PasswordField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useI18n();
  return (
    <div className={f.field}>
      <label className={f.label} htmlFor="tmp-pw">
        {t('set.tempPassword')}
      </label>
      <div className={f.row}>
        <input
          id="tmp-pw"
          className={f.input}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <IconButton variant="secondary" label={t('set.generate')} onClick={() => onChange(tempPassword())}>
          <Wand2 size={16} aria-hidden="true" />
        </IconButton>
      </div>
      <span className={f.hint}>{t('set.tempHint', { n: MIN_PASSWORD })}</span>
    </div>
  );
}

function AddUser({ onClose, onDone }: { onClose: () => void; onDone: () => Promise<void> }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('editor');
  const [password, setPassword] = useState(tempPassword);
  const [error, setError] = useState('');
  const submit = async () => {
    setError('');
    try {
      await userAction({ action: 'add', name, role, password });
      toast(t('set.added', { name: name.trim() }));
      await onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <Modal
      title={t('set.addUser')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={!name.trim()}>
            <Plus size={16} aria-hidden="true" /> {t('set.addUser')}
          </Button>
        </>
      }
    >
      <div className={f.grid}>
        <div className={f.field}>
          <label className={f.label} htmlFor="nu-name">
            {t('login.username')}
          </label>
          <input
            id="nu-name"
            data-autofocus
            className={f.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
          />
        </div>
        <div className={f.field}>
          <label className={f.label} htmlFor="nu-role">
            {t('set.role')}
          </label>
          <select id="nu-role" className={f.input} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`role.${r}`)}
              </option>
            ))}
          </select>
        </div>
        <div className={f.full}>
          <PasswordField value={password} onChange={setPassword} />
        </div>
        <p className={`${f.error} ${f.full}`} role="alert">
          {error}
        </p>
      </div>
    </Modal>
  );
}

function ResetPassword({ user, onClose, onDone }: { user: UserRow; onClose: () => void; onDone: () => Promise<void> }) {
  const { t } = useI18n();
  const [password, setPassword] = useState(tempPassword);
  const [error, setError] = useState('');
  const submit = async () => {
    setError('');
    try {
      await userAction({ action: 'password', name: user.name, password });
      toast(t('set.resetDone', { name: user.name }));
      await onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <Modal
      title={t('set.resetTitle', { name: user.name })}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => void submit()}>
            <KeyRound size={16} aria-hidden="true" /> {t('set.resetPwShort')}
          </Button>
        </>
      }
    >
      <PasswordField value={password} onChange={setPassword} />
      <p className={f.hint}>{t('set.resetHint')}</p>
      <p className={f.error} role="alert">
        {error}
      </p>
    </Modal>
  );
}

function Keys() {
  const { t } = useI18n();
  return (
    <section className={s.card} aria-labelledby="keys-h">
      <h2 id="keys-h">{t('set.tab.keys')}</h2>
      <dl className={s.keys}>
        {SHORTCUTS.map(([k, label]) => (
          <div key={k} style={{ display: 'contents' }}>
            <dt>
              <kbd>{k}</kbd>
            </dt>
            <dd>{t(label)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
