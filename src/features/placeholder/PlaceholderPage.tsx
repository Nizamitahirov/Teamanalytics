import { useLocation } from 'react-router';
import { Construction, ExternalLink } from 'lucide-react';
import { EmptyState } from '../../components/EmptyState';
import { buttonClass } from '../../components/Button';
import { useI18n } from '../../lib/i18n';
import { navByPath } from '../../app/nav';

// v1 hazırda canlı saytdadır; v2 bölmələri hazır olana qədər oraya yönəldirik
const V1_URL = 'https://teamanalytics.vercel.app/';

/** Hələ hazırlanmayan bölmələr üçün yer tutan (feature flag arxasındakı v2 qabığı). */
export function PlaceholderPage() {
  const { t } = useI18n();
  const item = navByPath(useLocation().pathname);
  return (
    <EmptyState
      icon={<Construction size={26} />}
      title={t('placeholder.title')}
      actions={
        <a className={buttonClass('primary')} href={V1_URL}>
          <ExternalLink size={16} aria-hidden="true" /> {t('placeholder.openV1')}
        </a>
      }
    >
      {t('placeholder.body', { phase: item?.phase ?? '—' })}
    </EmptyState>
  );
}
