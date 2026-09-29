import { useEffect, useState } from 'preact/hooks';
import { sendMessage } from '../../shared/browser-api';
import { t } from '../../shared/i18n';

type Status = { kind: 'checking' } | { kind: 'ok'; version: string } | { kind: 'error' };

export function ServiceStatus() {
  const [status, setStatus] = useState<Status>({ kind: 'checking' });

  useEffect(() => {
    void sendMessage({ target: 'background', type: 'ping' }).then((result) => {
      setStatus(result.ok ? { kind: 'ok', version: result.value.version } : { kind: 'error' });
    });
  }, []);

  if (status.kind === 'checking') return <p class="muted">{t('popupStatusChecking')}</p>;
  if (status.kind === 'error') return <p class="status-error">{t('popupStatusError')}</p>;
  return (
    <p class="status-ok" data-testid="service-status">
      {t('popupStatusOk', status.version)}
    </p>
  );
}
