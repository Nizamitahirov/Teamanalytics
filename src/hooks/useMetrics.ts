import { useMemo } from 'react';
import { computeMetrics, type EmployeeLoad } from '../../shared/metrics';
import { useData } from '../store';

/** Cari (filtrsiz) metrikalar + ad → yük xəritəsi. Tapşırıq/əməkdaş dəyişəndə yenidən hesablanır. */
export function useMetrics() {
  const tasks = useData((s) => s.data.tasks);
  const employees = useData((s) => s.data.employees);
  const settings = useData((s) => s.data.settings);
  return useMemo(() => {
    const m = computeMetrics({ tasks, employees, settings });
    const loads = new Map<string, EmployeeLoad>(m.loads.map((l) => [l.name, l]));
    return { m, loads, settings };
  }, [tasks, employees, settings]);
}
