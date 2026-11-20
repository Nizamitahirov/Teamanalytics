import { useMemo } from 'react';
import { checkHealth } from '../../shared/health';
import { useData } from '../store';

/** Data sağlamlığı tapıntıları (SPEC §6.8) — hər data dəyişikliyində klientdə yenidən hesablanır. */
export function useHealth() {
  const tasks = useData((s) => s.data.tasks);
  const employees = useData((s) => s.data.employees);
  return useMemo(() => checkHealth({ tasks, employees }), [tasks, employees]);
}
