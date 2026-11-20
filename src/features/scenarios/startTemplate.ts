import { useNavigate } from 'react-router';
import { useI18n } from '../../lib/i18n';
import { toast } from '../../lib/toast';
import { formatDate } from '../../lib/dates';
import { scenarioActions } from '../../store';
import type { ChangeKind } from '../../../shared/schema';
import type { MessageKey } from '../../../shared/i18n/az';

// Ayrıca modul: Panel/Əməkdaşlar səhifələri bunu idxal edəndə ssenari redaktoru (və ECharts) onların chunk-ına düşmür.
/** Şablondan yeni ssenari: yaradılır və redaktorda müvafiq dəyişiklik dialoqu açılır. */
export function useStartFromTemplate() {
  const { t } = useI18n();
  const navigate = useNavigate();
  return async (kind: ChangeKind, title: MessageKey) => {
    try {
      const sc = await scenarioActions.create(`${t(title)} — ${formatDate(new Date().toISOString())}`);
      navigate(`/scenarios/${sc.id}?add=${kind}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), { kind: 'error' });
    }
  };
}
