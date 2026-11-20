import { Scale } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { useCan } from '../../app/useCan';
import { Button } from '../../components/Button';
import { useStartFromTemplate } from './startTemplate';

/** "Yükü balansla" (SPEC §8 UI): nəticə həmişə ssenari kimi açılır, heç vaxt birbaşa tətbiq olunmur. */
export function RebalanceButton({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const { t } = useI18n();
  const { canEdit } = useCan();
  const start = useStartFromTemplate();
  if (!canEdit) return null;
  return (
    <Button size={size} onClick={() => void start('rebalance', 'tpl.rebalance')}>
      <Scale size={16} aria-hidden="true" /> {t('tpl.rebalance')}
    </Button>
  );
}
