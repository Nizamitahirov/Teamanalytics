import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { RowSelectionState, SortingState } from '@tanstack/react-table';
import { ArrowRightLeft, Ban, Columns3, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { storage } from '../../lib/storage';
import { toast } from '../../lib/toast';
import { actions, dataStore, useData } from '../../store';
import { useMetrics } from '../../hooks/useMetrics';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { Skeleton } from '../../components/Skeleton';
import { STATUSES, curOwner, type Status } from '../../../shared/model';
import { QUICK, filterTasks, type Quick, type TaskFilter } from '../../../shared/taskFilter';
import { ACT_ADMIN, ACT_PROJECT } from '../../../shared/constants';
import { fmtFte, fmtHours, formatNumber } from '../../../shared/format';
import type { MessageKey } from '../../../shared/i18n/az';
import { COLUMN_IDS, DEFAULT_HIDDEN, TaskTable, columnLabel, type ColumnId } from './TaskTable';
import { TaskDrawer } from './TaskDrawer';
import { TransferDialog } from './TransferDialog';
import { CancelDialog } from './CancelDialog';
import f from '../../components/Form.module.css';
import s from './TasksPage.module.css';

const COLS_KEY = 'wfp.v2.taskColumns';
const loadHidden = (): ColumnId[] => {
  try {
    const v = JSON.parse(storage.get(COLS_KEY) ?? 'null');
    return Array.isArray(v) ? v.filter((x) => (COLUMN_IDS as readonly string[]).includes(x)) : DEFAULT_HIDDEN;
  } catch {
    return DEFAULT_HIDDEN;
  }
};

/** Tapşırıqlar (SPEC §6.4): filtrlər URL-də (paylaşıla bilən link), toplu əməliyyatlar, panel (?task=). */
export function TasksPage() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const ready = useData((st) => st.ready);
  const tasks = useData((st) => st.data.tasks);
  const employees = useData((st) => st.data.employees);
  const norm = useData((st) => st.data.settings.norm);
  const { m } = useMetrics();

  const filter: TaskFilter = {
    q: params.get('q') ?? '',
    company: params.get('company') ?? '',
    process: params.get('process') ?? '',
    owner: params.get('owner') ?? '',
    status: (params.get('status') as Status) ?? '',
    activity: params.get('activity') ?? '',
    quick: (params.get('quick') as Quick) ?? '',
  };
  const sortParam = params.get('sort') ?? '';
  const sorting: SortingState = sortParam ? [{ id: sortParam.replace(/^-/, ''), desc: sortParam.startsWith('-') }] : [];
  const openId = params.get('task');

  const setParam = useCallback(
    (patch: Record<string, string | null>) =>
      setParams(
        (p) => {
          const n = new URLSearchParams(p);
          for (const [k, v] of Object.entries(patch)) {
            if (v) n.set(k, v);
            else n.delete(k);
          }
          return n;
        },
        { replace: true },
      ),
    [setParams],
  );

  const [selection, setSelection] = useState<RowSelectionState>({});
  const [hidden, setHidden] = useState<ColumnId[]>(loadHidden);
  const [colsOpen, setColsOpen] = useState(false);
  const [dialog, setDialog] = useState<null | { kind: 'transfer' | 'cancel' | 'delete'; ids: string[] }>(null);

  const overNames = useMemo(() => new Set(m.over.map((o) => o.name)), [m.over]);
  const rows = useMemo(
    () => filterTasks(tasks, employees, filter, overNames),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filter URL-dən hər render yaranır; dəyərlərə görə yenilənir
    [
      tasks,
      employees,
      overNames,
      filter.q,
      filter.company,
      filter.process,
      filter.owner,
      filter.status,
      filter.activity,
      filter.quick,
    ],
  );
  const options = useMemo(() => {
    const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'az'));
    return {
      company: uniq(tasks.map((x) => x.company)),
      process: uniq(tasks.map((x) => x.process)),
      owner: uniq(tasks.map(curOwner)),
    };
  }, [tasks]);

  const selectedIds = useMemo(
    () => Object.keys(selection).filter((id) => selection[id] && tasks.some((x) => x.id === id)),
    [selection, tasks],
  );
  const selectedHours = tasks.filter((x) => selectedIds.includes(x.id)).reduce((a, x) => a + x.hours, 0);
  const activeHours = rows.filter((x) => !x.is_cancelled).reduce((a, x) => a + x.hours, 0);
  const hasFilter = Object.values(filter).some(Boolean);

  const open = useCallback((id: string) => setParam({ task: id }), [setParam]);
  const onTransfer = useCallback((ids: string[]) => setDialog({ kind: 'transfer', ids }), []);
  const onCancel = useCallback((ids: string[]) => setDialog({ kind: 'cancel', ids }), []);
  const clearSel = () => setSelection({});
  const undo = { label: t('top.undo'), fn: () => dataStore.getState().undoLast() };

  const toggleCol = (id: ColumnId) => {
    setHidden((h) => {
      const n = h.includes(id) ? h.filter((x) => x !== id) : [...h, id];
      storage.set(COLS_KEY, JSON.stringify(n));
      return n;
    });
  };

  if (!ready)
    return (
      <div aria-busy="true" aria-label={t('state.loading')}>
        <Skeleton height={44} />
        <div style={{ height: 12 }} />
        <Skeleton height={480} radius={16} />
      </div>
    );

  const sel = (name: keyof TaskFilter, label: string, opts: [string, string][]) => (
    <label className={s.selectWrap}>
      <span className="visually-hidden">{label}</span>
      <select
        className={`${f.input} ${s.select}`}
        value={(filter[name] as string) ?? ''}
        onChange={(e) => setParam({ [name]: e.target.value || null })}
        aria-label={label}
      >
        <option value="">{label}</option>
        {opts.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <>
      <div className={s.toolbar}>
        <div className={s.search}>
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            className={f.input}
            placeholder={t('tasks.searchPh')}
            aria-label={t('top.search')}
            value={filter.q}
            onChange={(e) => setParam({ q: e.target.value || null })}
            data-page-search
          />
        </div>
        {sel(
          'company',
          t('field.company'),
          options.company.map((x) => [x, x]),
        )}
        {sel(
          'process',
          t('field.process'),
          options.process.map((x) => [x, x]),
        )}
        {sel(
          'owner',
          t('field.owner_after'),
          options.owner.map((x) => [x, x]),
        )}
        {sel(
          'status',
          t('tasks.status'),
          STATUSES.map((x) => [x, x]),
        )}
        {sel('activity', t('field.activity'), [
          [ACT_ADMIN, ACT_ADMIN],
          [ACT_PROJECT, ACT_PROJECT],
        ])}
        <div className={s.spacer} />
        <div className={s.colsWrap}>
          <Button onClick={() => setColsOpen((o) => !o)} aria-expanded={colsOpen} aria-haspopup="true">
            <Columns3 size={16} aria-hidden="true" /> {t('tasks.columns')}
          </Button>
          {colsOpen && (
            <div className={s.colsMenu} role="group" aria-label={t('tasks.columns')}>
              {COLUMN_IDS.map((id) => (
                <label key={id} className={f.check}>
                  <input type="checkbox" checked={!hidden.includes(id)} onChange={() => toggleCol(id)} /> {t(columnLabel(id))}
                </label>
              ))}
            </div>
          )}
        </div>
        <Button variant="primary" onClick={() => open('new')}>
          <Plus size={16} aria-hidden="true" /> {t('task.new')}
        </Button>
      </div>

      <div className={s.chips} role="group" aria-label={t('tasks.quick')}>
        {QUICK.map((q) => (
          <button
            key={q}
            type="button"
            className={s.chip}
            aria-pressed={filter.quick === q}
            onClick={() => setParam({ quick: filter.quick === q ? null : q })}
          >
            {t(`quick.${q}` as MessageKey)}
          </button>
        ))}
        {hasFilter && (
          <button type="button" className={s.clear} onClick={() => setParams({}, { replace: true })}>
            <X size={14} aria-hidden="true" /> {t('tasks.clearFilters')}
          </button>
        )}
      </div>

      {selectedIds.length > 0 ? (
        <div className={s.bulk} role="region" aria-label={t('tasks.bulk')}>
          <strong>{t('tasks.selected', { n: selectedIds.length, h: fmtHours(selectedHours) })}</strong>
          <Button size="sm" onClick={() => setDialog({ kind: 'transfer', ids: selectedIds })}>
            <ArrowRightLeft size={14} aria-hidden="true" /> {t('task.transfer')}
          </Button>
          <Button size="sm" variant="danger" onClick={() => setDialog({ kind: 'cancel', ids: selectedIds })}>
            <Ban size={14} aria-hidden="true" /> {t('task.cancel')}
          </Button>
          <Button
            size="sm"
            variant="success"
            onClick={() => {
              const n = actions.setCancelled(selectedIds, false);
              if (n) toast(t('toast.restored', { n }), { action: undo });
              clearSel();
            }}
          >
            <RotateCcw size={14} aria-hidden="true" /> {t('task.restore')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'delete', ids: selectedIds })}>
            <Trash2 size={14} aria-hidden="true" /> {t('task.delete')}
          </Button>
          <Button size="sm" variant="ghost" onClick={clearSel}>
            {t('tasks.clearSelection')}
          </Button>
        </div>
      ) : (
        <p className={s.count} aria-live="polite">
          {t('tasks.count', { n: formatNumber(rows.length), h: fmtHours(activeHours), fte: fmtFte(activeHours / norm, 2) })}
        </p>
      )}

      <TaskTable
        rows={rows}
        sorting={sorting}
        onSortingChange={(st) => setParam({ sort: st[0] ? `${st[0].desc ? '-' : ''}${st[0].id}` : null })}
        selection={selection}
        onSelectionChange={setSelection}
        hidden={hidden}
        onOpen={open}
        onTransfer={onTransfer}
        onCancel={onCancel}
        height="calc(100vh - 290px)"
        empty={t('tasks.empty')}
      />

      {openId && (
        <TaskDrawer
          key={openId}
          id={openId}
          preset={{ owner: filter.owner || undefined, company: filter.company || undefined }}
          onClose={() => setParam({ task: null })}
        />
      )}
      {dialog?.kind === 'transfer' && <TransferDialog ids={dialog.ids} onClose={() => setDialog(null)} onDone={clearSel} />}
      {dialog?.kind === 'cancel' && <CancelDialog ids={dialog.ids} onClose={() => setDialog(null)} onDone={clearSel} />}
      {dialog?.kind === 'delete' && (
        <Modal
          title={t('task.deleteTitle')}
          onClose={() => setDialog(null)}
          footer={
            <>
              <Button onClick={() => setDialog(null)}>{t('common.cancel')}</Button>
              <Button
                variant="danger"
                onClick={() => {
                  const n = actions.deleteTasks(dialog.ids);
                  setDialog(null);
                  clearSel();
                  if (n) toast(t('toast.deleted', { n }), { action: undo });
                }}
              >
                <Trash2 size={16} aria-hidden="true" /> {t('task.delete')}
              </Button>
            </>
          }
        >
          <p>{t('task.deleteManyBody', { n: dialog.ids.length })}</p>
        </Modal>
      )}
    </>
  );
}
