// Excel export (SPEC §9): Hesabat + v1 4 vərəqi (+ Ssenari). Əvvəlcə serverdən son vəziyyət, tam jurnal.
import { api } from '../../lib/api';
import { downloadText, downloadWorkbook, today } from '../../lib/excel';
import { dataStore } from '../../store';
import { computeMetrics } from '../../../shared/metrics';
import { staffTable } from '../../../shared/dashboard';
import { exportSheets, toCsv, TASK_COLS, EMP_COLS } from '../../../shared/excel';
import { scenarioState } from '../../../shared/scenario';
import { ACT_ADMIN } from '../../../shared/constants';
import type { LogEntry, Scenario } from '../../../shared/schema';

async function build(user: string, scenario: Scenario | null) {
  await dataStore
    .getState()
    .pull()
    .catch(() => undefined);
  const d = dataStore.getState().data;
  const state = { tasks: d.tasks, employees: d.employees, settings: d.settings };
  let log: LogEntry[] = d.log;
  try {
    log = (await api<{ log: LogEntry[] }>('/api/log')).log;
  } catch {
    /* tam jurnal alınmadı — lokal son qeydlər */
  }
  const m = computeMetrics(state);
  const emp = new Map(d.employees.map((e) => [e.name, e.activity]));
  return exportSheets({
    state,
    m,
    staff: staffTable(state, m, log),
    log,
    user,
    filtersLabel: 'Bütün şirkətlər · bütün fəaliyyət formaları',
    activityOf: (n) => emp.get(n) ?? ACT_ADMIN,
    scenario: scenario ? { sc: scenario, next: computeMetrics(scenarioState(state, scenario.changes)) } : null,
  });
}

export async function exportExcel(user: string, scenario: Scenario | null = null, suffix = '') {
  const sheets = await build(user, scenario);
  await downloadWorkbook(sheets, `workforce-planning-${today()}${suffix}.xlsx`);
}

export async function exportCsv(user: string) {
  const sheets = await build(user, null);
  downloadText(toCsv(sheets.find((s) => s.name === 'Tapşırıqlar')!.rows), `tapsiriqlar-${today()}.csv`);
}

/** İmport şablonu: başlıqlar (hesablanmış sütunlarsız). */
export async function exportTemplate() {
  const skip = new Set(['activity', 'current', 'status', 'updated_at', 'updated_by']);
  await downloadWorkbook(
    [
      {
        name: 'Tapşırıqlar',
        rows: [TASK_COLS.filter(([k]) => !skip.has(k)).map(([, h]) => h)],
        widths: TASK_COLS.filter(([k]) => !skip.has(k)).map(() => 18),
      },
      { name: 'Əməkdaşlar', rows: [EMP_COLS.map(([, h]) => h)], widths: EMP_COLS.map(() => 18) },
    ],
    'workforce-planning-sablon.xlsx',
  );
}
