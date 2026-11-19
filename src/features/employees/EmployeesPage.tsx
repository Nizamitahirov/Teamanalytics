import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { LayoutGrid, List, Plus, Search, Users } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { storage } from '../../lib/storage';
import { useData } from '../../store';
import { useMetrics } from '../../hooks/useMetrics';
import { Button } from '../../components/Button';
import { CompanyBadge, LoadBar, LoadChip } from '../../components/Badges';
import { Skeleton } from '../../components/Skeleton';
import { ACT_ADMIN, ACT_PROJECT } from '../../../shared/constants';
import { levelOf, type LoadLevel } from '../../../shared/metrics';
import { fmtFte, fmtHours } from '../../../shared/format';
import { matches } from '../../../shared/search';
import type { MessageKey } from '../../../shared/i18n/az';
import { EmployeeDialog } from './EmployeeDialog';
import f from '../../components/Form.module.css';
import s from './EmployeesPage.module.css';

const VIEW_KEY = 'wfp.v2.employeesView';
const LEVELS: LoadLevel[] = ['critical', 'warning', 'good', 'idle'];

/** Əməkdaşlar (SPEC §6.3): kartlar / cədvəl, filtrlər (şirkət, fəaliyyət forması, yük səviyyəsi). */
export function EmployeesPage() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const ready = useData((st) => st.ready);
  const employees = useData((st) => st.data.employees);
  const { loads, settings } = useMetrics();
  const [view, setView] = useState<'cards' | 'table'>(() => (storage.get(VIEW_KEY) === 'table' ? 'table' : 'cards'));
  const [creating, setCreating] = useState(false);
  const q = params.get('q') ?? '';
  const company = params.get('company') ?? '';
  const activity = params.get('activity') ?? '';
  const level = params.get('level') ?? '';
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

  const rows = useMemo(() => {
    return employees
      .map((e) => {
        const l = loads.get(e.name);
        const cap = l?.cap ?? settings.norm * e.fte;
        const hours = l?.hours ?? 0;
        const load = l?.load ?? 0;
        return { e, hours, tasks: l?.tasks ?? 0, cap, load, level: levelOf(load, settings.warn) };
      })
      .filter(
        (r) =>
          (!company || r.e.company === company) &&
          (!activity || r.e.activity === activity) &&
          (!level || (!r.e.is_group && r.level === level)) &&
          matches(r.e.name, q),
      )
      .sort((a, b) => Number(a.e.is_group) - Number(b.e.is_group) || b.load - a.load || a.e.name.localeCompare(b.e.name, 'az'));
  }, [employees, loads, settings, company, activity, level, q]);
  const companies = useMemo(() => [...new Set(employees.map((e) => e.company))].sort(), [employees]);

  if (!ready) return <Skeleton height={320} radius={16} />;

  const toggle = (v: 'cards' | 'table') => {
    setView(v);
    storage.set(VIEW_KEY, v);
  };
  const href = (name: string) => `/employees/${encodeURIComponent(name)}`;

  return (
    <>
      <div className={s.toolbar}>
        <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 320 }}>
          <Search size={16} aria-hidden="true" style={{ position: 'absolute', left: 12, top: 12, color: 'var(--muted)' }} />
          <input
            type="search"
            className={f.input}
            style={{ paddingLeft: 36 }}
            placeholder={t('emp.searchPh')}
            aria-label={t('top.search')}
            value={q}
            onChange={(e) => set('q', e.target.value)}
            data-page-search
          />
        </div>
        <select
          className={f.input}
          aria-label={t('field.company')}
          value={company}
          onChange={(e) => set('company', e.target.value)}
        >
          <option value="">{t('field.company')}</option>
          {companies.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          className={f.input}
          aria-label={t('field.activity')}
          value={activity}
          onChange={(e) => set('activity', e.target.value)}
        >
          <option value="">{t('field.activity')}</option>
          <option>{ACT_ADMIN}</option>
          <option>{ACT_PROJECT}</option>
        </select>
        <select className={f.input} aria-label={t('emp.level')} value={level} onChange={(e) => set('level', e.target.value)}>
          <option value="">{t('emp.level')}</option>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {t(`level.${l}` as MessageKey)}
            </option>
          ))}
        </select>
        <div className={s.spacer} />
        <div className={s.seg} role="group" aria-label={t('emp.view')}>
          <button type="button" aria-pressed={view === 'cards'} onClick={() => toggle('cards')}>
            <LayoutGrid size={14} aria-hidden="true" /> {t('emp.cards')}
          </button>
          <button type="button" aria-pressed={view === 'table'} onClick={() => toggle('table')}>
            <List size={14} aria-hidden="true" /> {t('emp.table')}
          </button>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus size={16} aria-hidden="true" /> {t('emp.new')}
        </Button>
      </div>

      {!rows.length ? (
        <p className={f.hint}>{t('emp.empty')}</p>
      ) : view === 'cards' ? (
        <ul className={s.grid} aria-label={t('nav.employees')}>
          {rows.map((r) => (
            <li key={r.e.name}>
              <Link to={href(r.e.name)} className={`${s.card} ${!r.e.is_group && r.load > 1 ? s.over : ''}`} data-emp={r.e.name}>
                <div className={s.head}>
                  <div className={`${s.avatar} ${r.e.is_group ? s.avatarGroup : ''}`} aria-hidden="true">
                    {r.e.is_group ? <Users size={18} /> : r.e.name.charAt(0)}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className={s.name}>{r.e.name}</div>
                    <div className={s.meta}>
                      {r.e.activity}
                      {r.e.is_group && ` · ${t('emp.group')}`}
                    </div>
                  </div>
                  <CompanyBadge company={r.e.company} />
                </div>
                {r.e.is_group ? (
                  <p className={s.meta}>{t('emp.groupHint')}</p>
                ) : (
                  <LoadBar load={r.load} level={r.level} label={t('emp.loadOf', { name: r.e.name })} />
                )}
                <div className={s.stats}>
                  <div>
                    <b>{fmtHours(r.hours)}</b>
                    {t('unit.hours')}
                  </div>
                  <div>
                    <b>{r.tasks}</b>
                    {t('emp.tasks')}
                  </div>
                  <div>
                    <b>{r.e.is_group ? '—' : fmtFte(r.e.fte, 2)}</b>
                    {t('field.fte')}
                  </div>
                  <div>
                    <b>{r.e.is_group ? '—' : <LoadChip load={r.load} level={r.level} />}</b>
                    {t('emp.load')}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <table className={s.table}>
          <thead>
            <tr>
              <th scope="col">{t('field.name')}</th>
              <th scope="col" className={s.hideSm}>
                {t('field.company')}
              </th>
              <th scope="col" className={s.hideSm}>
                {t('field.activity')}
              </th>
              <th scope="col" className={s.r}>
                {t('field.fte')}
              </th>
              <th scope="col" className={s.r}>
                {t('emp.tasks')}
              </th>
              <th scope="col" className={s.r}>
                {t('unit.hours')}
              </th>
              <th scope="col" className={`${s.r} ${s.hideSm}`}>
                {t('emp.free')}
              </th>
              <th scope="col" className={s.r}>
                {t('emp.load')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.e.name}>
                <td>
                  <Link className={s.link} to={href(r.e.name)}>
                    {r.e.name}
                  </Link>
                </td>
                <td className={s.hideSm}>
                  <CompanyBadge company={r.e.company} />
                </td>
                <td className={s.hideSm}>{r.e.activity}</td>
                <td className={s.r}>{r.e.is_group ? '—' : fmtFte(r.e.fte, 2)}</td>
                <td className={s.r}>{r.tasks}</td>
                <td className={s.r}>{fmtHours(r.hours)}</td>
                <td className={`${s.r} ${s.hideSm}`}>{r.e.is_group ? '—' : fmtHours(r.cap - r.hours)}</td>
                <td className={s.r}>{r.e.is_group ? t('emp.group') : <LoadChip load={r.load} level={r.level} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {creating && <EmployeeDialog name={null} onClose={() => setCreating(false)} />}
    </>
  );
}
