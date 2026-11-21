import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, ArrowRight, Check, FileUp } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { toast } from '../../lib/toast';
import { storage } from '../../lib/storage';
import { readWorkbook } from '../../lib/excel';
import { dataStore, scenarioActions, useData } from '../../store';
import { useCan } from '../../app/useCan';
import { Button } from '../../components/Button';
import {
  detectMapping,
  fileOwners,
  IMPORT_FIELDS,
  importPlan,
  mappingSignature,
  parseSheet,
  suggestRenames,
  type ImportField,
  type Mapping,
} from '../../../shared/excel';
import { makeChange } from '../../../shared/scenario';
import type { Snapshot } from '../../../shared/apply';
import { exportExcel } from './exportExcel';
import f from '../../components/Form.module.css';
import s from './Reports.module.css';

const MAP_KEY = 'wfp.v2.importMappings';
type Sheet = { name: string; rows: unknown[][] };
type Mode = 'merge' | 'scenario' | 'replace';
const PREVIEW = 200;

const loadMaps = (): Record<string, Mapping> => {
  try {
    return JSON.parse(storage.get(MAP_KEY) ?? '{}');
  } catch {
    return {};
  }
};
const show = (v: unknown) =>
  v === null || v === undefined || v === '' ? '—' : typeof v === 'boolean' ? (v ? 'Bəli' : 'Xeyr') : String(v);

/**
 * Excel import sehrbazı (SPEC §9): 1) fayl + vərəq, 2) sütun xəritəsi (avtomatik + əl ilə, yadda saxlanılır),
 * 3) validasiya + diff önizləmə, 4) rejim: yenilə+əlavə et / ssenari kimi / əvəz et (admin, əvvəl avtomatik Excel backup).
 * Yazma həmişə diff op-ları ilə (kolleksiya əvəz olunmur — CLAUDE.md §6).
 */
export function ImportPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { canEdit, isAdmin, name: me } = useCan();
  const tasks = useData((st) => st.data.tasks);
  const employees = useData((st) => st.data.employees);
  const settings = useData((st) => st.data.settings);
  const [step, setStep] = useState(1);
  const [file, setFile] = useState('');
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [mapping, setMapping] = useState<Mapping>([]);
  const [company, setCompany] = useState('Birbank');
  const [onlyValid, setOnlyValid] = useState(false);
  const [mode, setMode] = useState<Mode>('merge');
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  // Ad uyğunlaşdırması: istifadəçinin təklifə düzəlişi (köhnə ad → yeni ad, '' = dəyişmə)
  const [renameOver, setRenameOver] = useState<Record<string, string>>({});
  // Yeni tapşırıq id-lərinin bazası — bir dəfə (render zamanı Date.now() çağırılmır)
  const [idBase] = useState(() => Date.now().toString(36));

  const sheet = sheets[sheetIdx];
  const headers = sheet?.rows[0] ?? [];
  const live: Snapshot = useMemo(() => ({ tasks, employees, settings }), [tasks, employees, settings]);
  const parsed = useMemo(() => (sheet && step >= 3 ? parseSheet(sheet.rows, mapping) : []), [sheet, mapping, step]);
  const owners = useMemo(() => fileOwners(parsed), [parsed]);
  const fresh = useMemo(() => {
    const known = new Set(employees.map((e) => e.name));
    return [...owners.keys()].filter((n) => !known.has(n)).sort((a, b) => a.localeCompare(b, 'az'));
  }, [owners, employees]);
  // Namizədlər: faylda adı keçməyən, qrup olmayan əməkdaşlar (yalnız faylda yeni ad varsa)
  const absent = useMemo(
    () => (fresh.length ? employees.filter((e) => !e.is_group && !owners.has(e.name)).map((e) => e.name) : []),
    [employees, owners, fresh],
  );
  const renames = useMemo(() => ({ ...suggestRenames(employees, parsed), ...renameOver }), [employees, parsed, renameOver]);
  const plan = useMemo(() => {
    if (step < 3) return null;
    let i = 0;
    const base = idBase;
    return importPlan(live, parsed, {
      mode: mode === 'replace' ? 'replace' : 'merge',
      defaultCompany: company,
      newId: () => `T-${base}${(i++).toString(36)}`,
      renames,
    });
  }, [live, parsed, mode, company, step, idBase, renames]);
  const companies = useMemo(() => [...new Set(tasks.map((x) => x.company))].sort(), [tasks]);

  if (!canEdit) return <p>{t('imp.noAccess')}</p>;

  const pickSheet = (list: Sheet[], idx: number) => {
    setSheetIdx(idx);
    const hdr = list[idx]?.rows[0] ?? [];
    const saved = loadMaps()[mappingSignature(hdr)];
    setMapping(saved && saved.length === hdr.length ? saved : detectMapping(hdr));
  };
  const onFile = async (fl: File | undefined) => {
    if (!fl) return;
    setLoadError('');
    setBusy(true);
    try {
      const list = (await readWorkbook(fl)).filter((x) => x.rows.length > 0);
      if (!list.length) throw new Error(t('imp.empty'));
      setFile(fl.name);
      setSheets(list);
      const idx = Math.max(
        0,
        list.findIndex((x) => /tap[şs]ır/i.test(x.name)),
      );
      pickSheet(list, idx);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const toPreview = () => {
    const all = loadMaps();
    all[mappingSignature(headers)] = mapping;
    storage.set(MAP_KEY, JSON.stringify(all));
    setStep(3);
  };

  const apply = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      const summary = t('imp.logLabel', {
        file,
        created: plan.created.length,
        changed: plan.changed.length,
        deleted: plan.deleted.length,
      });
      const renLogs = plan.renamed.map((r) => ({
        action: 'Əməkdaş',
        task_label: r.merged ? t('imp.renLogMerge', { from: r.from, to: r.to }) : t('imp.renLog', { from: r.from, to: r.to }),
        from: r.from,
        to: r.to,
      }));
      if (mode === 'scenario') {
        const ch = makeChange('import', summary, live, plan.next);
        if (!ch) return void toast(t('chg.noop'));
        const sc = await scenarioActions.create(t('imp.scenarioName', { file }), [ch]);
        navigate(`/scenarios/${sc.id}`);
        return;
      }
      if (mode === 'replace') await exportExcel(me, null, '-backup'); // əvvəl avtomatik backup (Excel)
      dataStore.getState().commit(
        summary,
        (d) => {
          d.tasks = plan.next.tasks as typeof d.tasks;
          d.employees = plan.next.employees as typeof d.employees;
        },
        [...renLogs, { action: 'Import', task_label: summary, comment: mode === 'replace' ? 'əvəz et' : 'yenilə/əlavə et' }],
      );
      toast(t('imp.done'), { action: { label: t('top.undo'), fn: () => dataStore.getState().undoLast() } });
      navigate('/tasks');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const STEPS = ['imp.s1', 'imp.s2', 'imp.s3', 'imp.s4'] as const;
  const errors = plan?.errors ?? [];
  const blocked = errors.length > 0 && !onlyValid;
  const nothing = !!plan && !plan.created.length && !plan.changed.length && !plan.deleted.length && !plan.renamed.length;

  return (
    <>
      <div className={s.toolbar}>
        <Link to="/reports" className={s.back}>
          <ArrowLeft size={16} aria-hidden="true" /> {t('rep.back')}
        </Link>
      </div>
      <ol className={s.steps} aria-label={t('imp.title')}>
        {STEPS.map((k, i) => (
          <li key={k} aria-current={step === i + 1 ? 'step' : undefined} data-done={step > i + 1}>
            {step > i + 1 && <Check size={14} aria-hidden="true" />} {i + 1}. {t(k)}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <section className={s.panel} aria-labelledby="imp-1">
          <h2 id="imp-1">{t('imp.s1')}</h2>
          <div className={f.field}>
            <label className={f.label} htmlFor="imp-file">
              {t('imp.file')}
            </label>
            <input
              id="imp-file"
              type="file"
              accept=".xlsx,.xls,.csv"
              className={f.input}
              onChange={(e) => void onFile(e.target.files?.[0])}
              disabled={busy}
            />
            <span className={f.hint}>{t('imp.fileHint')}</span>
            {loadError && <span className={f.error}>{loadError}</span>}
          </div>
          {sheets.length > 0 && (
            <div className={f.field} style={{ marginTop: 16 }}>
              <label className={f.label} htmlFor="imp-sheet">
                {t('imp.sheet')}
              </label>
              <select
                id="imp-sheet"
                className={f.input}
                value={sheetIdx}
                onChange={(e) => pickSheet(sheets, Number(e.target.value))}
              >
                {sheets.map((x, i) => (
                  <option key={x.name} value={i}>
                    {t('imp.sheetRows', { name: x.name, n: Math.max(0, x.rows.length - 1) })}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className={s.actions} style={{ marginTop: 16 }}>
            <Button variant="primary" disabled={!sheet} onClick={() => setStep(2)}>
              {t('imp.next')} <ArrowRight size={16} aria-hidden="true" />
            </Button>
          </div>
        </section>
      )}

      {step === 2 && sheet && (
        <section className={s.panel} aria-labelledby="imp-2">
          <h2 id="imp-2">{t('imp.s2')}</h2>
          <p className={s.muted}>{t('imp.mapHint')}</p>
          <div className={s.scroller}>
            <table className={s.wizardTable}>
              <thead>
                <tr>
                  <th scope="col">{t('imp.column')}</th>
                  <th scope="col">{t('imp.sample')}</th>
                  <th scope="col">{t('imp.field')}</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((h, i) => (
                  <tr key={i}>
                    <td>
                      <b>{String(h ?? '') || `#${i + 1}`}</b>
                    </td>
                    <td className={s.sample}>{show(sheet.rows[1]?.[i])}</td>
                    <td>
                      <select
                        className={f.input}
                        aria-label={t('imp.fieldFor', { col: String(h ?? i + 1) })}
                        value={mapping[i] ?? ''}
                        onChange={(e) =>
                          setMapping((m) =>
                            m.map((x, j) => (j === i ? (e.target.value as ImportField | '') : x === e.target.value ? '' : x)),
                          )
                        }
                      >
                        <option value="">{t('imp.skip')}</option>
                        {IMPORT_FIELDS.map((k) => (
                          <option key={k} value={k}>
                            {t(`field.${k}`)}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!mapping.includes('task') && !mapping.includes('process') && <p className={f.error}>{t('imp.needTask')}</p>}
          <div className={s.actions} style={{ marginTop: 16 }}>
            <Button onClick={() => setStep(1)}>
              <ArrowLeft size={16} aria-hidden="true" /> {t('imp.back')}
            </Button>
            <Button variant="primary" disabled={!mapping.includes('task') && !mapping.includes('process')} onClick={toPreview}>
              {t('imp.next')} <ArrowRight size={16} aria-hidden="true" />
            </Button>
          </div>
        </section>
      )}

      {step === 3 && plan && (
        <section className={s.panel} aria-labelledby="imp-3">
          <h2 id="imp-3">{t('imp.s3')}</h2>
          <div className={s.counts} data-testid="imp-counts">
            <div className={s.count}>
              <b>{plan.created.length}</b>
              <span>{t('imp.created')}</span>
            </div>
            <div className={s.count}>
              <b>{plan.changed.length}</b>
              <span>{t('imp.changed')}</span>
            </div>
            <div className={s.count}>
              <b>{plan.unchanged}</b>
              <span>{t('imp.unchanged')}</span>
            </div>
            <div className={`${s.count} ${errors.length ? s.countErr : ''}`}>
              <b>{errors.length}</b>
              <span>{t('imp.errors')}</span>
            </div>
          </div>
          {absent.length > 0 && (
            <>
              <h3 className={s.h3}>{t('imp.renTitle')}</h3>
              <p className={s.muted}>{t('imp.renHint')}</p>
              <div className={s.scroller}>
                <table className={s.wizardTable} data-testid="imp-renames">
                  <thead>
                    <tr>
                      <th scope="col">{t('imp.renOld')}</th>
                      <th scope="col">{t('imp.renNew')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {absent.map((n) => (
                      <tr key={n}>
                        <td>
                          <b>{n}</b>
                        </td>
                        <td>
                          <select
                            className={f.input}
                            aria-label={t('imp.renFor', { name: n })}
                            value={renames[n] ?? ''}
                            onChange={(e) => setRenameOver((o) => ({ ...o, [n]: e.target.value }))}
                          >
                            <option value="">{t('imp.renKeep')}</option>
                            {fresh.map((x) => (
                              <option key={x} value={x}>
                                {x}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {errors.length > 0 && (
            <>
              <h3 className={s.h3}>{t('imp.errorsTitle')}</h3>
              <ul className={s.diffList} data-testid="imp-errors">
                {errors.slice(0, PREVIEW).map((e) => (
                  <li key={e.row} className={s.errRow}>
                    {t('imp.row', { n: e.row })}: {e.errors.join('; ')}
                  </li>
                ))}
              </ul>
              <label className={f.check}>
                <input type="checkbox" checked={onlyValid} onChange={(e) => setOnlyValid(e.target.checked)} />
                {t('imp.onlyValid', { n: errors.length })}
              </label>
            </>
          )}
          {plan.changed.length > 0 && (
            <>
              <h3 className={s.h3}>{t('imp.changedTitle')}</h3>
              <ul className={s.diffList} data-testid="imp-changed">
                {plan.changed.slice(0, PREVIEW).map((c) => (
                  <li key={c.id}>
                    <b>
                      {c.id} · {c.label}
                    </b>
                    {c.fields.map((x) => (
                      <div key={x.field}>
                        <span className={s.muted}>{t(`field.${x.field}` as never)}:</span> {show(x.from)} → <b>{show(x.to)}</b>
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
            </>
          )}
          {plan.created.length > 0 && (
            <>
              <h3 className={s.h3}>{t('imp.createdTitle')}</h3>
              <ul className={s.diffList}>
                {plan.created.slice(0, PREVIEW).map((c) => (
                  <li key={c.id}>
                    {c.process} — {c.task} · {c.owner_after || c.owner_before || '—'} · {show(c.hours)} {t('unit.hours')}
                  </li>
                ))}
              </ul>
              <div className={f.field} style={{ maxWidth: 320 }}>
                <label className={f.label} htmlFor="imp-company">
                  {t('imp.defaultCompany')}
                </label>
                <select id="imp-company" className={f.input} value={company} onChange={(e) => setCompany(e.target.value)}>
                  {companies.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
            </>
          )}
          {plan.newEmployees.length > 0 && (
            <p className={s.muted}>{t('imp.newEmployees', { names: plan.newEmployees.join(', ') })}</p>
          )}
          <div className={s.actions} style={{ marginTop: 16 }}>
            <Button onClick={() => setStep(2)}>
              <ArrowLeft size={16} aria-hidden="true" /> {t('imp.back')}
            </Button>
            <Button variant="primary" disabled={blocked} onClick={() => setStep(4)}>
              {t('imp.next')} <ArrowRight size={16} aria-hidden="true" />
            </Button>
          </div>
        </section>
      )}

      {step === 4 && plan && (
        <section className={s.panel} aria-labelledby="imp-4">
          <h2 id="imp-4">{t('imp.s4')}</h2>
          <fieldset className={s.modes}>
            <legend className="visually-hidden">{t('imp.s4')}</legend>
            {(['merge', 'scenario', ...(isAdmin ? (['replace'] as const) : [])] as Mode[]).map((m) => (
              <label key={m} className={s.mode}>
                <input type="radio" name="imp-mode" checked={mode === m} onChange={() => setMode(m)} />
                <b>{t(`imp.m.${m}`)}</b>
                <small>{t(`imp.m.${m}D`, { n: plan.deleted.length })}</small>
              </label>
            ))}
          </fieldset>
          {mode === 'replace' && (
            <>
              <p className={s.danger}>{t('imp.replaceWarn', { n: plan.deleted.length })}</p>
              {plan.deleted.length > 0 && (
                <ul className={s.diffList} data-testid="imp-deleted">
                  {plan.deleted.slice(0, PREVIEW).map((c) => (
                    <li key={c.id}>
                      {c.id} · {c.process} — {c.task} · {c.owner_after || c.owner_before || '—'} · {show(c.hours)}{' '}
                      {t('unit.hours')}
                    </li>
                  ))}
                </ul>
              )}
              <label className={f.check}>
                <input type="checkbox" checked={confirmReplace} onChange={(e) => setConfirmReplace(e.target.checked)} />
                {t('imp.replaceConfirm')}
              </label>
            </>
          )}
          <div className={s.actions} style={{ marginTop: 16 }}>
            <Button onClick={() => setStep(3)}>
              <ArrowLeft size={16} aria-hidden="true" /> {t('imp.back')}
            </Button>
            <Button
              variant="primary"
              disabled={busy || nothing || (mode === 'replace' && !confirmReplace)}
              onClick={() => void apply()}
            >
              <FileUp size={16} aria-hidden="true" /> {mode === 'scenario' ? t('imp.toScenario') : t('imp.apply')}
            </Button>
          </div>
          {nothing && <p className={s.muted}>{t('imp.nothing')}</p>}
        </section>
      )}
    </>
  );
}
