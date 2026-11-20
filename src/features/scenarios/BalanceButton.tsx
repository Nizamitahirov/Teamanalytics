import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Scale } from 'lucide-react';
import { Button } from '../../components/Button';
import { useI18n } from '../../lib/i18n';
import { toast } from '../../lib/toast';
import { useCan } from '../../app/useCan';
import { formatDate } from '../../lib/dates';

/**
 * "Yükü balansla" (SPEC §8 UI): Panel / Əməkdaşlar-dan. Alqoritmin nəticəsi YENİ SSENARİ kimi açılır —
 * canlı data dəyişmir. Ssenari məntiqi tıklananda yüklənir (ilkin JS büdcəsi, SPEC §11).
 */
export function BalanceButton({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { canEdit } = useCan();
  const [busy, setBusy] = useState(false);
  if (!canEdit) return null;
  const run = async () => {
    setBusy(true);
    try {
      const { createBalanceScenario } = await import('./logic');
      const id = await createBalanceScenario(t('scen.tplName.balanceDated', { d: formatDate(new Date().toISOString()) }));
      navigate(`/scenarios/${id}`);
    } catch (e) {
      setBusy(false);
      toast(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <Button size={size} onClick={run} disabled={busy} data-testid="balance-btn">
      <Scale size={size === 'sm' ? 14 : 16} aria-hidden="true" /> {t('scen.balance')}
    </Button>
  );
}
