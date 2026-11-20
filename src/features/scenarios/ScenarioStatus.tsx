import { Archive, CheckCircle2, Clock, PencilLine } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import type { ScenarioStatus as Status } from '../../../shared/schema';
import s from './Scenarios.module.css';

const ICON = { draft: PencilLine, pending: Clock, applied: CheckCircle2, archived: Archive };

/** Ssenari statusu: ikon + mətn (rəng tək daşıyıcı deyil). */
export function ScenarioStatus({ status }: { status: Status }) {
  const { t } = useI18n();
  const Icon = ICON[status];
  return (
    <span className={`${s.status} ${s[`st_${status}`]}`}>
      <Icon size={13} aria-hidden="true" />
      {t(`scn.st.${status}`)}
    </span>
  );
}
