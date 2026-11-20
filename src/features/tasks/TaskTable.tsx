import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowRightLeft, ArrowUp, Ban, Pencil, RotateCcw } from 'lucide-react';
import { Link } from 'react-router';
import { useI18n } from '../../lib/i18n';
import { toast } from '../../lib/toast';
import { actions, dataStore } from '../../store';
import { useMedia } from '../../hooks/useMedia';
import { IconButton } from '../../components/Button';
import { CompanyBadge, StatusBadge } from '../../components/Badges';
import { EmployeePicker } from '../../components/EmployeePicker';
import { curOwner, statusOf, type TaskDoc } from '../../../shared/model';
import { formatNumber } from '../../../shared/format';
import { formatDateTime } from '../../lib/dates';
import type { MessageKey } from '../../../shared/i18n/az';
import s from './TaskTable.module.css';

export const COLUMN_IDS = [
  'id',
  'company',
  'process',
  'category',
  'owner',
  'owner_before',
  'status',
  'min_per_key',
  'annual_freq',
  'hours',
  'after_opt',
  'updated',
] as const;
export type ColumnId = (typeof COLUMN_IDS)[number];
export const DEFAULT_HIDDEN: ColumnId[] = ['id', 'process', 'category', 'min_per_key', 'updated'];

const az = (a: unknown, b: unknown) => String(a ?? '').localeCompare(String(b ?? ''), 'az');
const numCmp = (a: number | null | undefined, b: number | null | undefined) => (a ?? -Infinity) - (b ?? -Infinity);

type Props = {
  rows: TaskDoc[];
  sorting: SortingState;
  onSortingChange: (s: SortingState) => void;
  selection: RowSelectionState;
  onSelectionChange: (s: RowSelectionState) => void;
  hidden: ColumnId[];
  onOpen: (id: string) => void;
  onTransfer: (ids: string[]) => void;
  onCancel: (ids: string[]) => void;
  /** Cədvəlin hündürlüyü (virtual scroll konteyneri) */
  height?: string;
  empty: ReactNode;
  /** Yalnız baxış (viewer): seçim, əməliyyat sütunu və sətirdə redaktə yoxdur */
  readOnly?: boolean;
};

/**
 * Tapşırıqlar cədvəli (SPEC §6.4): TanStack Table (sıralama, seçim, sütun görünüşü) + TanStack Virtual.
 * Yapışqan başlıq və yapışqan əməliyyat sütunu (v1-də düzəldilmiş problem — reqressiya testi var).
 * ≤ 700 px: kart görünüşü (v1 kimi).
 */
export function TaskTable({
  rows,
  sorting,
  onSortingChange,
  selection,
  onSelectionChange,
  hidden,
  onOpen,
  onTransfer,
  onCancel,
  height,
  empty,
  readOnly = false,
}: Props) {
  const { t } = useI18n();
  const mobile = useMedia('(max-width: 699.98px)');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<{ id: string; field: 'hours' | 'owner' } | null>(null);

  const columns = useMemo<ColumnDef<TaskDoc>[]>(() => {
    const all: ColumnDef<TaskDoc>[] = [
      {
        id: 'select',
        enableSorting: false,
        header: ({ table }) => (
          <input
            type="checkbox"
            className={s.chk}
            aria-label={t('tasks.selectAll')}
            checked={table.getIsAllRowsSelected()}
            ref={(el) => {
              if (el) el.indeterminate = table.getIsSomeRowsSelected();
            }}
            onChange={table.getToggleAllRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            className={s.chk}
            aria-label={t('tasks.selectRow', { name: row.original.task })}
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            onClick={(e) => e.stopPropagation()}
          />
        ),
      },
      { id: 'id', accessorKey: 'id', header: t('field.id'), sortingFn: (a, b) => az(a.original.id, b.original.id) },
      {
        id: 'task',
        accessorKey: 'task',
        header: t('field.task'),
        sortingFn: (a, b) => az(a.original.task, b.original.task),
        cell: ({ row }) => (
          <button type="button" className={s.taskBtn} onClick={() => onOpen(row.original.id)}>
            <span className={s.title}>{row.original.task}</span>
            <span className={s.sub}>
              {row.original.process}
              {row.original.category && ` · ${row.original.category}`}
            </span>
          </button>
        ),
      },
      {
        id: 'company',
        accessorKey: 'company',
        header: t('field.company'),
        cell: ({ row }) => <CompanyBadge company={row.original.company} />,
        sortingFn: (a, b) => az(a.original.company, b.original.company),
      },
      {
        id: 'process',
        accessorKey: 'process',
        header: t('field.process'),
        sortingFn: (a, b) => az(a.original.process, b.original.process),
      },
      {
        id: 'category',
        accessorKey: 'category',
        header: t('field.category'),
        sortingFn: (a, b) => az(a.original.category, b.original.category),
      },
      {
        id: 'owner',
        accessorFn: (r) => curOwner(r),
        header: t('field.owner_after'),
        sortingFn: (a, b) => az(curOwner(a.original), curOwner(b.original)),
        cell: ({ row }) =>
          editing?.id === row.original.id && editing.field === 'owner' ? (
            <div className={s.inlinePicker}>
              <EmployeePicker
                label={t('field.owner_after')}
                value=""
                exclude={[curOwner(row.original)]}
                initialFocus
                onChange={(name) => {
                  setEditing(null);
                  if (!name) return;
                  const n = actions.transferTasks([row.original.id], name);
                  if (n)
                    toast(t('toast.transferred', { n, to: name }), {
                      action: { label: t('top.undo'), fn: () => dataStore.getState().undoLast() },
                    });
                }}
              />
              <button type="button" className={s.linkBtn} onClick={() => setEditing(null)}>
                {t('common.cancel')}
              </button>
            </div>
          ) : (
            <span className={s.ownerCell}>
              <Link
                to={`/employees/${encodeURIComponent(curOwner(row.original))}`}
                className={s.link}
                onClick={(e) => e.stopPropagation()}
              >
                {curOwner(row.original) || '—'}
              </Link>
              {!readOnly && (
                <button
                  type="button"
                  className={s.editBtn}
                  aria-label={t('tasks.changeOwner', { name: row.original.task })}
                  title={t('tasks.changeOwnerShort')}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing({ id: row.original.id, field: 'owner' });
                  }}
                >
                  <Pencil size={12} aria-hidden="true" />
                </button>
              )}
            </span>
          ),
      },
      {
        id: 'owner_before',
        accessorKey: 'owner_before',
        header: t('field.owner_before'),
        sortingFn: (a, b) => az(a.original.owner_before, b.original.owner_before),
      },
      {
        id: 'status',
        accessorFn: (r) => statusOf(r),
        header: t('tasks.status'),
        cell: ({ row }) => <StatusBadge status={statusOf(row.original)} />,
        sortingFn: (a, b) => az(statusOf(a.original), statusOf(b.original)),
      },
      {
        id: 'min_per_key',
        accessorKey: 'min_per_key',
        header: t('field.min_per_key'),
        meta: { num: true },
        cell: ({ row }) =>
          row.original.min_per_key != null ? formatNumber(row.original.min_per_key, row.original.min_per_key % 1 ? 1 : 0) : '',
        sortingFn: (a, b) => numCmp(a.original.min_per_key, b.original.min_per_key),
      },
      {
        id: 'annual_freq',
        accessorKey: 'annual_freq',
        header: t('field.annual_freq'),
        meta: { num: true },
        cell: ({ row }) =>
          row.original.annual_freq != null ? `${formatNumber(row.original.annual_freq)} ${row.original.unit}` : '',
        sortingFn: (a, b) => numCmp(a.original.annual_freq, b.original.annual_freq),
      },
      {
        id: 'hours',
        accessorKey: 'hours',
        header: t('field.hours'),
        meta: { num: true },
        sortingFn: (a, b) => numCmp(a.original.hours, b.original.hours),
        cell: ({ row }) =>
          editing?.id === row.original.id && editing.field === 'hours' ? (
            <InlineNumber
              label={t('tasks.editHours', { name: row.original.task })}
              initial={row.original.hours}
              onCancel={() => setEditing(null)}
              onSave={(h) => {
                setEditing(null);
                if (h === row.original.hours) return;
                actions.saveTask(row.original, { ...row.original, hours: h }, curOwner(row.original));
                toast(t('toast.saved'), { action: { label: t('top.undo'), fn: () => dataStore.getState().undoLast() } });
              }}
            />
          ) : readOnly ? (
            <b>{formatNumber(row.original.hours, 1)}</b>
          ) : (
            <button
              type="button"
              className={s.numBtn}
              title={t('tasks.editHoursShort')}
              onClick={(e) => {
                e.stopPropagation();
                setEditing({ id: row.original.id, field: 'hours' });
              }}
            >
              {/* Görünən mətn adın içində qalsın (WCAG 2.5.3 — label in name) */}
              <span className="visually-hidden">{t('tasks.editHours', { name: row.original.task })}: </span>
              {formatNumber(row.original.hours, 1)}
            </button>
          ),
      },
      {
        id: 'after_opt',
        accessorKey: 'after_opt',
        header: t('field.after_opt'),
        meta: { num: true },
        cell: ({ row }) => (row.original.after_opt != null ? formatNumber(row.original.after_opt, 1) : ''),
        sortingFn: (a, b) => numCmp(a.original.after_opt, b.original.after_opt),
      },
      {
        id: 'updated',
        accessorKey: 'updated_at',
        header: t('tasks.updated'),
        cell: ({ row }) => (
          <span className={s.sub}>
            {row.original.updated_by}
            {row.original.updated_at && ` · ${formatDateTime(row.original.updated_at)}`}
          </span>
        ),
        sortingFn: (a, b) => az(a.original.updated_at, b.original.updated_at),
      },
      {
        id: 'actions',
        enableSorting: false,
        header: () => <span className="visually-hidden">{t('tasks.actions')}</span>,
        cell: ({ row }) => <RowActions task={row.original} onTransfer={onTransfer} onCancel={onCancel} onOpen={onOpen} />,
      },
    ];
    return all.filter((c) => !readOnly || (c.id !== 'select' && c.id !== 'actions'));
  }, [t, editing, onOpen, onTransfer, onCancel, readOnly]);

  const visibility = useMemo<VisibilityState>(() => Object.fromEntries(hidden.map((h) => [h, false])), [hidden]);
  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (r) => r.id,
    state: { sorting, rowSelection: selection, columnVisibility: visibility },
    onSortingChange: (u) => onSortingChange(typeof u === 'function' ? u(sorting) : u),
    onRowSelectionChange: (u) => onSelectionChange(typeof u === 'function' ? u(selection) : u),
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  const tableRows = table.getRowModel().rows;

  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (mobile ? 148 : 57),
    overscan: 12,
    measureElement: mobile ? (el) => el.getBoundingClientRect().height : undefined,
  });
  const items = virtualizer.getVirtualItems();
  const padTop = items.length ? items[0].start : 0;
  const padBottom = items.length ? virtualizer.getTotalSize() - items[items.length - 1].end : 0;
  const visibleCols = table.getVisibleLeafColumns().length;

  if (!rows.length) return <div className={s.empty}>{empty}</div>;

  if (mobile)
    return (
      <div ref={scrollRef} className={s.scroll} style={{ height }}>
        <ul className={s.cards} style={{ paddingTop: padTop, paddingBottom: padBottom }} aria-label={t('nav.tasks')}>
          {items.map((vi) => {
            const row = tableRows[vi.index];
            const x = row.original;
            return (
              <li
                key={row.id}
                data-index={vi.index}
                ref={virtualizer.measureElement}
                className={`${s.card} ${x.is_cancelled ? s.cancelled : ''}`}
              >
                <div className={s.cardHead}>
                  {!readOnly && (
                    <input
                      type="checkbox"
                      className={s.chk}
                      aria-label={t('tasks.selectRow', { name: x.task })}
                      checked={row.getIsSelected()}
                      onChange={row.getToggleSelectedHandler()}
                    />
                  )}
                  <button type="button" className={s.taskBtn} onClick={() => onOpen(x.id)}>
                    <span className={s.title}>{x.task}</span>
                    <span className={s.sub}>{x.process}</span>
                  </button>
                  <StatusBadge status={statusOf(x)} />
                </div>
                <div className={s.cardMeta}>
                  <Link to={`/employees/${encodeURIComponent(curOwner(x))}`} className={s.link}>
                    {curOwner(x)}
                  </Link>
                  <span className={s.num}>
                    {formatNumber(x.hours, 1)} {t('unit.hours')}
                  </span>
                </div>
                {!readOnly && <RowActions task={x} onTransfer={onTransfer} onCancel={onCancel} onOpen={onOpen} />}
              </li>
            );
          })}
        </ul>
      </div>
    );

  return (
    <div ref={scrollRef} className={s.scroll} style={{ height }} data-testid="task-scroll">
      <table className={s.table}>
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => {
                const sorted = h.column.getIsSorted();
                const num = (h.column.columnDef.meta as { num?: boolean } | undefined)?.num;
                return (
                  <th
                    key={h.id}
                    className={`${s[`c_${h.column.id}`] ?? ''} ${num ? s.r : ''}`}
                    aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                    scope="col"
                  >
                    {h.column.getCanSort() ? (
                      <button type="button" className={s.sortBtn} onClick={h.column.getToggleSortingHandler()}>
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {sorted === 'asc' ? (
                          <ArrowUp size={12} aria-hidden="true" />
                        ) : sorted === 'desc' ? (
                          <ArrowDown size={12} aria-hidden="true" />
                        ) : null}
                      </button>
                    ) : (
                      flexRender(h.column.columnDef.header, h.getContext())
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {padTop > 0 && (
            <tr aria-hidden="true">
              <td colSpan={visibleCols} style={{ height: padTop, padding: 0, border: 0 }} />
            </tr>
          )}
          {items.map((vi) => {
            const row = tableRows[vi.index];
            return (
              <tr
                key={row.id}
                className={`${row.original.is_cancelled ? s.cancelled : ''} ${row.getIsSelected() ? s.selected : ''}`}
                data-task={row.id}
                onDoubleClick={() => onOpen(row.id)}
              >
                {row.getVisibleCells().map((c) => {
                  const num = (c.column.columnDef.meta as { num?: boolean } | undefined)?.num;
                  return (
                    <td key={c.id} className={`${s[`c_${c.column.id}`] ?? ''} ${num ? s.r : ''}`}>
                      {flexRender(c.column.columnDef.cell, c.getContext())}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {padBottom > 0 && (
            <tr aria-hidden="true">
              <td colSpan={visibleCols} style={{ height: padBottom, padding: 0, border: 0 }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function RowActions({
  task,
  onTransfer,
  onCancel,
  onOpen,
}: {
  task: TaskDoc;
  onTransfer: (ids: string[]) => void;
  onCancel: (ids: string[]) => void;
  onOpen: (id: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className={s.actions}>
      <IconButton size="sm" variant="secondary" label={t('task.transfer')} onClick={() => onTransfer([task.id])}>
        <ArrowRightLeft size={14} aria-hidden="true" />
      </IconButton>
      {task.is_cancelled ? (
        <IconButton
          size="sm"
          variant="success"
          label={t('task.restore')}
          onClick={() => {
            actions.setCancelled([task.id], false);
            toast(t('toast.restored', { n: 1 }), { action: { label: t('top.undo'), fn: () => dataStore.getState().undoLast() } });
          }}
        >
          <RotateCcw size={14} aria-hidden="true" />
        </IconButton>
      ) : (
        <IconButton size="sm" variant="danger" label={t('task.cancel')} onClick={() => onCancel([task.id])}>
          <Ban size={14} aria-hidden="true" />
        </IconButton>
      )}
      <IconButton size="sm" variant="secondary" label={t('task.edit')} onClick={() => onOpen(task.id)}>
        <Pencil size={14} aria-hidden="true" />
      </IconButton>
    </div>
  );
}

function InlineNumber({
  initial,
  onSave,
  onCancel,
  label,
}: {
  initial: number;
  onSave: (n: number) => void;
  onCancel: () => void;
  label: string;
}) {
  const [v, setV] = useState(String(initial));
  const commit = () => {
    const n = Number(v.replace(',', '.'));
    if (v.trim() && Number.isFinite(n) && n >= 0) onSave(n);
    else onCancel();
  };
  return (
    <input
      className={s.inlineInput}
      aria-label={label}
      inputMode="decimal"
      // eslint-disable-next-line jsx-a11y/no-autofocus -- istifadəçi redaktəni özü açıb
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') {
          e.stopPropagation();
          onCancel();
        }
      }}
      onBlur={commit}
    />
  );
}

export const columnLabel = (id: ColumnId): MessageKey =>
  (
    ({
      id: 'field.id',
      company: 'field.company',
      process: 'field.process',
      category: 'field.category',
      owner: 'field.owner_after',
      owner_before: 'field.owner_before',
      status: 'tasks.status',
      min_per_key: 'field.min_per_key',
      annual_freq: 'field.annual_freq',
      hours: 'field.hours',
      after_opt: 'field.after_opt',
      updated: 'tasks.updated',
    }) as const
  )[id];
